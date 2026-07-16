"""ML de precios — hedónico con torneo campeón/retador + rangos + anomalías ($0, sklearn local).

1 · HEDÓNICO (torneo v1): dos modelos compiten en CADA reentrenamiento y publica el que
    gane en datos NUNCA vistos —
      · ridge (v0): precio ~ m², piso, exteriores, recámaras, baños, colonia
      · jerárquico (v1): el mismo ridge + un efecto POR EDIFICIO encogido (empirical
        Bayes) — la estructura natural del inmueble: colonia → edificio → unidad.
        Un edificio nuevo sin historia hereda solo su colonia (efecto 0), honesto.
2 · RANGOS DE CONFIANZA (regresión por cuantiles): en vez de "vale $6.7M", "vale entre
    $6.5M y $7.0M" (banda 80%). La cobertura del rango se mide fuera-de-muestra y se
    reporta — si la banda promete 80% y cubre 60%, se dice.
3 · ANOMALÍAS (IsolationForest): la unidad estadísticamente 'rara' se marca antes de
    que un humano la vea — capa 7 de verificación.

Validación SIEMPRE sobre datos nunca vistos (KFold por unidad + GroupKFold por
edificio). Reentrena tras cada carga; el auditor vigila el drift. Cero API.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

K_ENCOGIMIENTO = 10.0     # peso del prior: un edificio con pocas unidades confía poco
                          # en su propio promedio y se recarga en el modelo global


def _features(u: Dict[str, Any], colonias: List[str]) -> Optional[List[float]]:
    precio = u.get("price_mxn") or u.get("price")
    m2 = u.get("m2_privative") or u.get("size_m2")
    if not precio or not m2 or m2 < 20:
        return None
    ext = sum(u.get(k) or 0 for k in ("m2_balcony", "m2_terrace",
                                      "m2_roof_garden", "patio_m2"))
    col = u.get("_colonia") or ""
    dummies = [1.0 if col == c else 0.0 for c in colonias]
    return [m2, float(u.get("level") or 0), ext,
            float(u.get("bedrooms") or 0), float(u.get("bathrooms") or 0)] + dummies


def validacion_honesta(X, y, grupos: List[str]) -> Dict[str, Any]:
    """El r² sobre lo que ya vio se INFLA (las gemelas del mismo molde). Los números
    que valen son sobre datos NUNCA vistos: unidad nueva de un edificio conocido
    (KFold) y edificio COMPLETO nunca visto (GroupKFold por desarrollo) — el segundo
    mide si el modelo sirve para avaluar un dev que apenas entra al catálogo."""
    from sklearn.linear_model import Ridge
    from sklearn.metrics import mean_absolute_percentage_error, r2_score
    from sklearn.model_selection import GroupKFold, KFold, cross_val_predict
    out: Dict[str, Any] = {}
    try:
        pred = cross_val_predict(Ridge(alpha=1.0), X, y,
                                 cv=KFold(5, shuffle=True, random_state=42))
        out["unidad_nueva"] = {
            "r2": round(float(r2_score(y, pred)), 3),
            "error_pct": round(float(mean_absolute_percentage_error(y, pred)) * 100, 1)}
    except Exception:  # noqa: BLE001
        pass
    n_grupos = len(set(grupos))
    if n_grupos >= 3:
        try:
            pred = cross_val_predict(Ridge(alpha=1.0), X, y, groups=np.array(grupos),
                                     cv=GroupKFold(n_splits=min(n_grupos, 10)))
            out["edificio_nuevo"] = {
                "r2": round(float(r2_score(y, pred)), 3),
                "error_pct": round(float(mean_absolute_percentage_error(y, pred)) * 100, 1),
                "n_edificios": n_grupos}
        except Exception:  # noqa: BLE001
            pass
    return out


# ─── el retador: jerárquico colonia → edificio ────────────────────────────────
def _ajustar_jerarquico(X, y, grupos: List[str]) -> Tuple[Any, Dict[str, float]]:
    """Ridge global (trae la colonia en sus dummies) + efecto por EDIFICIO encogido:
    el promedio del residual del edificio, pesado por cuántas unidades lo respaldan.
    Edificio nuevo → efecto 0 → cae con gracia al modelo global."""
    from sklearn.linear_model import Ridge
    base = Ridge(alpha=1.0).fit(X, y)
    res = y - base.predict(X)
    efectos: Dict[str, float] = {}
    for g in set(grupos):
        del_grupo = [r for r, gg in zip(res, grupos) if gg == g]
        n = len(del_grupo)
        efectos[g] = float(np.mean(del_grupo)) * n / (n + K_ENCOGIMIENTO)
    return base, efectos


def _predecir_jerarquico(base, efectos: Dict[str, float], X, grupos: List[str]):
    return base.predict(X) + np.array([efectos.get(g, 0.0) for g in grupos])


def validar_jerarquico(X, y, grupos: List[str]) -> Dict[str, Any]:
    """La misma prueba honesta (unidad nunca vista, KFold manual porque el efecto por
    edificio se re-aprende en cada pliegue — jamás ve la unidad que califica)."""
    from sklearn.metrics import mean_absolute_percentage_error, r2_score
    from sklearn.model_selection import KFold
    pred = np.zeros(len(y), dtype=float)
    for tr, te in KFold(5, shuffle=True, random_state=42).split(X):
        base, ef = _ajustar_jerarquico(X[tr], y[tr], [grupos[i] for i in tr])
        pred[te] = _predecir_jerarquico(base, ef, X[te], [grupos[i] for i in te])
    return {"r2": round(float(r2_score(y, pred)), 3),
            "error_pct": round(float(mean_absolute_percentage_error(y, pred)) * 100, 1)}


# ─── rangos de confianza (banda 80% por cuantiles) ────────────────────────────
def _ajustar_rangos(X, y) -> Tuple[Any, Any]:
    from sklearn.ensemble import GradientBoostingRegressor
    kw = dict(loss="quantile", n_estimators=150, max_depth=3,
              learning_rate=0.1, random_state=42)
    return (GradientBoostingRegressor(alpha=0.1, **kw).fit(X, y),
            GradientBoostingRegressor(alpha=0.9, **kw).fit(X, y))


def calibrar_rangos(X, y) -> Dict[str, Any]:
    """CALIBRACIÓN CONFORMAL (CQR): la banda cruda de cuantiles suele quedar corta
    (promete 80%, cubre menos). Se mide FUERA de muestra cuánto le falta y se
    ensancha exactamente eso. Devuelve la corrección y ambas coberturas — la cruda
    se reporta para que el ajuste jamás pase callado."""
    from sklearn.model_selection import KFold
    excesos: List[float] = []          # cuánto se salió cada precio real de su banda
    for tr, te in KFold(5, shuffle=True, random_state=42).split(X):
        lo, hi = _ajustar_rangos(X[tr], y[tr])
        p_lo = np.minimum(lo.predict(X[te]), hi.predict(X[te]))
        p_hi = np.maximum(lo.predict(X[te]), hi.predict(X[te]))
        excesos += list(np.maximum(p_lo - y[te], y[te] - p_hi))
    if not excesos:
        return {"correccion": 0.0, "cobertura_cruda_pct": None, "cobertura_pct": None}
    exc = np.array(excesos)
    correccion = max(0.0, float(np.quantile(exc, 0.8)))
    return {"correccion": round(correccion),
            "cobertura_cruda_pct": round(float(np.mean(exc <= 0)) * 100, 1),
            "cobertura_pct": round(float(np.mean(exc <= correccion)) * 100, 1)}


def entrenar_hedonico(unidades: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """EL TORNEO: ridge (v0) contra jerárquico (v1) en cada reentrenamiento; se publica
    el campeón según datos nunca vistos. Los residuales y rangos salen del campeón."""
    from sklearn.linear_model import Ridge
    from sklearn.metrics import r2_score
    colonias = sorted({u.get("_colonia") or "" for u in unidades if u.get("_colonia")})
    X, y, idx, grupos = [], [], [], []
    for i, u in enumerate(unidades):
        f = _features(u, colonias)
        precio = u.get("price_mxn") or u.get("price")
        if f and precio:
            X.append(f)
            y.append(float(precio))
            idx.append(i)
            grupos.append(u.get("development_id") or "")
    if len(X) < 60:
        return None                          # honesto: sin masa no hay modelo
    X, y = np.array(X), np.array(y)

    # el torneo se decide con la prueba honesta (unidad nunca vista)
    val_ridge = validacion_honesta(X, y, grupos)
    val_jer = validar_jerarquico(X, y, grupos)
    err_ridge = (val_ridge.get("unidad_nueva") or {}).get("error_pct")
    gana_jer = err_ridge is not None and val_jer["error_pct"] < err_ridge

    modelo = Ridge(alpha=1.0).fit(X, y)
    pred_ridge = modelo.predict(X)
    if gana_jer:
        base, efectos = _ajustar_jerarquico(X, y, grupos)
        pred = _predecir_jerarquico(base, efectos, X, grupos)
        version = "hedonico_v1_jerarquico"
    else:
        pred = pred_ridge
        version = "hedonico_v0_ridge"
    r2 = float(r2_score(y, pred_ridge))      # el r² reportado siempre es el del ridge
    nombres = ["m2", "piso", "m2_exterior", "recamaras", "banos"] + \
        [f"colonia:{c}" for c in colonias]
    coefs = {n: round(float(c)) for n, c in zip(nombres, modelo.coef_)}

    # rangos del 80% calibrados conformalmente (ensanchados a lo que prometen)
    lo, hi = _ajustar_rangos(X, y)
    p_lo, p_hi = lo.predict(X), hi.predict(X)
    cal = calibrar_rangos(X, y)
    corr = cal.get("correccion") or 0.0

    residuales = {}
    for j, i in enumerate(idx):
        u = unidades[i]
        residuales[u.get("id")] = {
            "valor_modelo": round(float(pred[j])),
            "residual_pct": round((y[j] - pred[j]) * 100 / pred[j], 1),
            "rango_bajo": round(float(min(p_lo[j], p_hi[j]) - corr)),
            "rango_alto": round(float(max(p_lo[j], p_hi[j]) + corr))}
    validacion = dict(val_ridge)
    if gana_jer:                 # la cifra publicada es la del campeón; en edificio
        validacion["unidad_nueva"] = val_jer      # nunca visto ambos son idénticos
    return {"version": version, "n": len(X), "r2": round(r2, 3),
            "validacion": validacion,
            "torneo": {"ridge": val_ridge.get("unidad_nueva"),
                       "jerarquico": val_jer,
                       "campeon": "jerárquico (colonia→edificio)" if gana_jer
                                  else "ridge global"},
            "cobertura_rango_pct": cal.get("cobertura_pct"),
            "cobertura_cruda_pct": cal.get("cobertura_cruda_pct"),
            "coeficientes": coefs, "residuales": residuales}


def detectar_anomalias(unidades: List[Dict[str, Any]],
                       contaminacion: float = 0.05) -> List[Dict[str, Any]]:
    from sklearn.ensemble import IsolationForest
    filas, idx = [], []
    for i, u in enumerate(unidades):
        precio = u.get("price_mxn") or u.get("price")
        m2 = u.get("m2_privative") or u.get("size_m2")
        if not precio or not m2:
            continue
        ext = sum(u.get(k) or 0 for k in ("m2_balcony", "m2_terrace",
                                          "m2_roof_garden", "patio_m2"))
        filas.append([precio / m2, m2, float(u.get("level") or 0), ext])
        idx.append(i)
    if len(filas) < 30:
        return []
    modelo = IsolationForest(contamination=contaminacion, random_state=42)
    marcas = modelo.fit_predict(np.array(filas))
    return [{"unidad": unidades[i].get("unit_number"), "unit_id": unidades[i].get("id"),
             "pm2": round(filas[j][0])}
            for j, i in enumerate(idx) if marcas[j] == -1]


async def entrenar_y_publicar(db) -> Dict[str, Any]:
    """Reentrena con TODO el catálogo + persiste (ml_modelos) + residual por unidad."""
    from unidades_efectivas import unidades_efectivas
    units = await unidades_efectivas(db, {})
    devs = {d["id"]: d.get("colonia_name") or d.get("colonia") for d in
            await db.developments.find({}, {"_id": 0, "id": 1, "colonia": 1,
                                            "colonia_name": 1}).to_list(500)}
    for u in units:
        u["_colonia"] = devs.get(u.get("development_id")) or ""
    modelo = entrenar_hedonico(units)
    if not modelo:
        return {"ok": False, "nota": "aún sin masa suficiente (mín. 60 unidades)"}
    anomalías = detectar_anomalias(units)
    from datetime import datetime, timezone
    doc = {"ts": datetime.now(timezone.utc).isoformat(),
           "version": modelo["version"], "n": modelo["n"], "r2": modelo["r2"],
           "validacion": modelo.get("validacion") or {},
           "torneo": modelo.get("torneo") or {},
           "cobertura_rango_pct": modelo.get("cobertura_rango_pct"),
           "cobertura_cruda_pct": modelo.get("cobertura_cruda_pct"),
           "coeficientes": modelo["coeficientes"],
           "anomalias": anomalías[:20]}
    await db.ml_modelos.insert_one(dict(doc))
    # residual visible por unidad (la ficha lo muestra)
    for uid, r in modelo["residuales"].items():
        if uid:
            await db.units.update_one(
                {"id": uid},
                {"$set": {"ml_valor_modelo": r["valor_modelo"],
                          "ml_residual_pct": r["residual_pct"],
                          "ml_rango_bajo": r.get("rango_bajo"),
                          "ml_rango_alto": r.get("rango_alto")}})
    return {"ok": True, **{k: doc[k] for k in ("n", "r2", "validacion", "coeficientes")},
            "anomalias": len(anomalías)}
