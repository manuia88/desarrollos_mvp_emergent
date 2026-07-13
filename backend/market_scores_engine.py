"""
market_scores_engine.py — LOS SCORES DEL MERCADO encima del espejo (Ola C: C1+C2+C3+C5+C8).

  · precio_sombra()  — C1: cuánto vale cada FEATURE en $/m² (mediana con-vs-sin, mismo territorio;
                       n≥3 por lado o no se publica — honesto, sin regresión fantasma).
  · score_liquidez() — C2: qué tan rápido se vende cada unidad DISPONIBLE según la tensión de
                       demanda de sus propias llaves del genoma (percentil dentro del territorio).
  · screener()       — C3: unidades SOBRE/INFRAVALORADAS — valor justo = mediana $/m² de sus
                       comparables (misma recámara) + ajuste por sombras de sus features.
  · curva_vertical() — C5: $/m² por NIVEL del edificio (la prima de altura, por dato).
  · land_bank()      — C8 v1 (nivel colonia): dónde comprar tierra = demanda insatisfecha ×
                       potencial normativo (CUS/niveles) × brecha suelo→mercado. El drill a
                       predio (1.08M catastro_predios + AVM) queda anotado para v2.

UNIVERSALIDAD: features desde la taxonomía completa (no lista fija) · territorio = set de colonias
(cualquier escala). FAIL-OPEN + procedencia. Superadmin-only en superficie.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.market_scores")

_MIN_LADO = 3      # mínimo de unidades con y sin la feature para publicar sombra
_MIN_COMPS = 3     # mínimo de comparables para valor justo


def _mediana(vals: List[float]) -> Optional[float]:
    s = sorted(v for v in vals if v is not None)
    if not s:
        return None
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


async def _unidades_con_pm2(db, colonias: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    from demand_mirror import _oferta_vectores
    out = []
    for u in await _oferta_vectores(db, colonias):
        if u.get("precio") and u.get("m2"):
            u["pm2"] = u["precio"] / u["m2"]
            out.append(u)
    return out


def _features_de(u: Dict[str, Any]) -> Set[str]:
    return {k.rsplit(".", 1)[1] for k in u["vector"] if k.startswith("producto.feature.")}


# ── C1 · precio sombra por feature ────────────────────────────────────────────
async def precio_sombra(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    unidades = await _unidades_con_pm2(db, colonias)
    todas_feats: Set[str] = set()
    for u in unidades:
        todas_feats |= _features_de(u)

    sombras = []
    for f in sorted(todas_feats):
        con = [u["pm2"] for u in unidades if f in _features_de(u)]
        sin = [u["pm2"] for u in unidades if f not in _features_de(u)]
        if len(con) < _MIN_LADO or len(sin) < _MIN_LADO:
            continue   # muestra chica → no se publica (honesto)
        m_con, m_sin = _mediana(con), _mediana(sin)
        sombras.append({"feature": f, "sombra_pm2": round(m_con - m_sin),
                        "pm2_con": round(m_con), "pm2_sin": round(m_sin),
                        "n_con": len(con), "n_sin": len(sin)})
    sombras.sort(key=lambda s: -abs(s["sombra_pm2"]))
    top = sombras[0] if sombras else None
    return {"n_unidades": len(unidades), "sombras": sombras,
            "es_estimado": not bool(sombras), "procedencia": "observado",
            "lectura": (f"La feature que más mueve el precio: {top['feature']} "
                        f"({'+' if top['sombra_pm2'] >= 0 else ''}{top['sombra_pm2']:,} $/m² · "
                        f"{top['n_con']} unidades la tienen).") if top else
                       "Aún sin muestra suficiente por feature (se llena con inventario)."}


# ── C2 · score de liquidez por unidad ─────────────────────────────────────────
async def score_liquidez(db, colonias: Optional[Set[str]] = None, top: int = 25) -> Dict[str, Any]:
    from demand_mirror import _demanda_conteos, _llaves_oferta
    dem = await _demanda_conteos(db, colonias)
    unidades = await _unidades_con_pm2(db, colonias)
    disponibles = [u for u in unidades if u["disponible"]]
    if not disponibles:
        return {"es_estimado": True, "unidades": [], "lectura": "Sin unidades disponibles en el territorio."}

    crudos = []
    for u in disponibles:
        llaves = _llaves_oferta(u["vector"])
        senal = sum(dem.get(k, 0) for k in llaves)
        crudos.append((u, senal, len(llaves)))
    max_senal = max((s for _, s, _ in crudos), default=0)
    filas = []
    for u, senal, n_llaves in crudos:
        score = round(100 * senal / max_senal) if max_senal else 0
        filas.append({"unit_id": u["unit_id"], "colonia": u["colonia"], "pm2": round(u["pm2"]),
                      "senales_demanda": senal, "llaves_evaluadas": n_llaves,
                      "score_liquidez": score,
                      "banda": "alta" if score >= 67 else "media" if score >= 34 else "baja"})
    filas.sort(key=lambda f: -f["score_liquidez"])
    hay_senal = max_senal > 0
    return {"n_disponibles": len(disponibles), "unidades": filas[:top],
            "es_estimado": not hay_senal, "procedencia": "observado" if hay_senal else "sin_senal",
            "lectura": (f"Unidad más líquida: {filas[0]['unit_id']} (score {filas[0]['score_liquidez']}, "
                        f"{filas[0]['senales_demanda']} señales sobre sus llaves).") if hay_senal else
                       "Sin señal de demanda aún — el score se activa con el uso del marketplace."}


# ── C3 · screener de unidades sobre/infravaloradas ───────────────────────────
async def screener(db, colonias: Optional[Set[str]] = None, umbral_pct: float = 10.0,
                   top: int = 20) -> Dict[str, Any]:
    unidades = await _unidades_con_pm2(db, colonias)
    sombra_map = {s["feature"]: s["sombra_pm2"]
                  for s in (await precio_sombra(db, colonias))["sombras"]}

    filas = []
    for u in unidades:
        if not u["disponible"]:
            continue
        comps = [c for c in unidades if c["colonia"] == u["colonia"]
                 and c.get("recamaras") == u.get("recamaras") and c["unit_id"] != u["unit_id"]]
        if len(comps) < _MIN_COMPS:
            continue   # sin comparables suficientes → no se juzga (honesto)
        base = _mediana([c["pm2"] for c in comps])
        feats_u = _features_de(u)
        feats_tipicas: Set[str] = set()
        for c in comps:
            feats_tipicas |= _features_de(c)
        # ajuste: sombras de lo que la unidad tiene y sus comparables típicamente no (y viceversa)
        ajuste = sum(sombra_map.get(f, 0) for f in feats_u - feats_tipicas) \
            - sum(sombra_map.get(f, 0) for f in feats_tipicas - feats_u)
        justo = base + ajuste
        gap_pct = round(100 * (u["pm2"] - justo) / justo, 1) if justo else None
        if gap_pct is None:
            continue
        filas.append({"unit_id": u["unit_id"], "colonia": u["colonia"],
                      "pm2": round(u["pm2"]), "pm2_justo": round(justo),
                      "ajuste_sombras": round(ajuste), "n_comparables": len(comps),
                      "gap_pct": gap_pct,
                      "veredicto": ("INFRAVALORADA" if gap_pct <= -umbral_pct else
                                    "SOBREVALORADA" if gap_pct >= umbral_pct else "en_precio")})
    filas.sort(key=lambda f: f["gap_pct"])
    infra = [f for f in filas if f["veredicto"] == "INFRAVALORADA"]
    return {"n_evaluadas": len(filas), "infravaloradas": infra[:top],
            "sobrevaloradas": [f for f in reversed(filas) if f["veredicto"] == "SOBREVALORADA"][:top],
            "es_estimado": not bool(filas), "procedencia": "observado",
            "lectura": (f"{len(infra)} unidades infravaloradas (gap ≤ -{umbral_pct}%). "
                        f"Mejor oportunidad: {infra[0]['unit_id']} ({infra[0]['gap_pct']}% vs su valor justo).")
                       if infra else f"Sin unidades fuera de precio (±{umbral_pct}%) con comparables suficientes."}


# ── C5 · curva de valor vertical ($/m² por nivel) ─────────────────────────────
async def curva_vertical(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    unidades = await _unidades_con_pm2(db, colonias)
    por_nivel: Dict[int, List[float]] = {}
    for u in unidades:
        piso = u.get("piso")
        if piso is None:
            continue
        try:
            por_nivel.setdefault(int(piso), []).append(u["pm2"])
        except (TypeError, ValueError):
            continue
    niveles = []
    base_pm2 = None
    for piso in sorted(por_nivel):
        vals = por_nivel[piso]
        if len(vals) < _MIN_LADO:
            continue
        med = _mediana(vals)
        if base_pm2 is None:
            base_pm2 = med
        niveles.append({"nivel": piso, "pm2_mediana": round(med), "n": len(vals),
                        "prima_vs_base_pct": round(100 * (med - base_pm2) / base_pm2, 1) if base_pm2 else 0})
    top = niveles[-1] if niveles else None
    return {"niveles": niveles, "es_estimado": len(niveles) < 2, "procedencia": "observado",
            "lectura": (f"La altura cotiza: nivel {top['nivel']} vale {top['prima_vs_base_pct']:+}% "
                        f"vs el nivel base.") if len(niveles) >= 2 else
                       "Aún sin muestra por nivel (se llena con inventario con piso registrado)."}


# ── C8 · Land Bank Scorer v1 (nivel colonia) ─────────────────────────────────
async def land_bank(db, top: int = 20) -> Dict[str, Any]:
    """Dónde comprar tierra HOY: demanda insatisfecha × potencial normativo (CUS/niveles) ×
    brecha suelo catastral → mercado. v1 a nivel COLONIA (drill a predio con catastro_predios+AVM = v2)."""
    # demanda por colonia (átomos)
    dem_col: Dict[str, int] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "colonia": 1}):
            if a["colonia"] != "_sin_colonia":
                dem_col[a["colonia"]] = dem_col.get(a["colonia"], 0) + 1
    except Exception as e:
        log.warning("[land_bank] atoms fail-open: %s", e)

    from market_4s_bridge import norm_colonia
    filas = []
    try:
        async for c in db.colonias.find({}, {"_id": 0, "name": 1, "alcaldia": 1, "cus": 1,
                                             "zonif_niveles": 1, "precio_pm2": 1,
                                             "vsuelo_pm2_catastral": 1}):
            nc = norm_colonia(c.get("name") or "")
            demanda = dem_col.get(nc, 0)
            precio, suelo = c.get("precio_pm2"), c.get("vsuelo_pm2_catastral")
            brecha = round(precio / suelo, 1) if (precio and suelo) else None   # mercado/suelo
            niveles = c.get("zonif_niveles") or 0
            cus = c.get("cus") or 0
            if not demanda and not brecha:
                continue
            # score simple y explicable: demanda (log-ish por conteo) × potencial (niveles+cus) × brecha
            potencial = (float(niveles) or 1) * (float(cus) or 1)
            score = round((demanda ** 0.5) * (brecha or 1) * (potencial ** 0.25), 1)
            filas.append({"colonia": c.get("name"), "alcaldia": c.get("alcaldia"),
                          "demanda_atomos": demanda, "brecha_mercado_suelo": brecha,
                          "niveles_permitidos": niveles or None, "cus": cus or None,
                          "score_land_bank": score,
                          "es_estimado": brecha is None or not demanda})
    except Exception as e:
        log.warning("[land_bank] colonias fail-open: %s", e)
    filas.sort(key=lambda f: -f["score_land_bank"])
    for i, f in enumerate(filas[:top]):
        f["rank"] = i + 1
    lider = filas[0] if filas else None
    return {"n_colonias": len(filas), "top": filas[:top],
            "es_estimado": not bool(filas), "procedencia": "observado+normativo",
            "nota_v2": "drill a predio: catastro_predios (1.08M) + AVM por predio ya existen",
            "lectura": (f"Tierra #1: {lider['colonia']} (demanda {lider['demanda_atomos']} átomos · "
                        f"brecha suelo→mercado {lider['brecha_mercado_suelo']}x · "
                        f"{lider['niveles_permitidos']} niveles permitidos).") if lider else
                       "Sin colonias con demanda o normativa cargada aún."}
