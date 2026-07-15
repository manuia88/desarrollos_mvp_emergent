"""ML v0 — los primeros dos modelos, con los datos que YA tenemos (240 unidades, $0).

1 · HEDÓNICO v0 (ridge): el precio explicado por sus atributos (m², piso, exteriores,
    colonia). Produce el VALOR SEGÚN EL MODELO por unidad + residual (sobre/sub-precio
    estadístico) — la ecuación del precio v2, entrenada con mercado real. Coeficientes
    LEGIBLES ('cada piso vale +$X/m²'), no caja negra.
2 · ANOMALÍAS (IsolationForest): la unidad estadísticamente 'rara' (pm², m², piso,
    exteriores) se marca ANTES de que un humano la vea — capa 7 de verificación.

Con 240 unidades es v0 honesto (r² reportado, jamás escondido); con el masivo (~1,500)
madura solo. Reentrena tras cada carga. sklearn local, cero API.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np


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


def entrenar_hedonico(unidades: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
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
    modelo = Ridge(alpha=1.0).fit(X, y)
    pred = modelo.predict(X)
    r2 = float(r2_score(y, pred))
    nombres = ["m2", "piso", "m2_exterior", "recamaras", "banos"] + \
        [f"colonia:{c}" for c in colonias]
    coefs = {n: round(float(c)) for n, c in zip(nombres, modelo.coef_)}
    residuales = {}
    for j, i in enumerate(idx):
        u = unidades[i]
        residuales[u.get("id")] = {
            "valor_modelo": round(float(pred[j])),
            "residual_pct": round((y[j] - pred[j]) * 100 / pred[j], 1)}
    return {"version": "hedonico_v0_ridge", "n": len(X), "r2": round(r2, 3),
            "validacion": validacion_honesta(X, y, grupos),
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
           "coeficientes": modelo["coeficientes"],
           "anomalias": anomalías[:20]}
    await db.ml_modelos.insert_one(dict(doc))
    # residual visible por unidad (la ficha lo muestra)
    for uid, r in modelo["residuales"].items():
        if uid:
            await db.units.update_one({"id": uid}, {"$set": {"ml_valor_modelo": r["valor_modelo"],
                                                             "ml_residual_pct": r["residual_pct"]}})
    return {"ok": True, **{k: doc[k] for k in ("n", "r2", "validacion", "coeficientes")},
            "anomalias": len(anomalías)}
