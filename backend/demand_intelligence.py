"""INTELIGENCIA DE DEMANDA — convierte las interacciones de los compradores en data de mercado consultable.

Responde la pregunta núcleo de la plataforma: "¿cuántos clientes buscan/clickean [feature] en [colonia], y cuándo?".
Cruza las señales de comportamiento (buyer_signals: ficha_view/like/unit_view/compare/photo_dwell) con las features del
desarrollo, y las búsquedas explícitas (marketplace_searches: recámaras/m²/precio/colonia), agregando por:
  - feature (terraza, roof, gym…) × colonia × tiempo
  - colonia (las más solicitadas) × tiempo
  - atributo explícito (recámaras/m²/precio) × tiempo
  - demanda vs OFERTA (qué construir: lo que se busca y no existe)
con buckets day/week/month/quarter/year (created_at_dt).

NOTA de precisión: hoy la demanda por feature se DERIVA del dev (el dev que vio tiene esas features). Cuando el front
empiece a mandar unit_id en cada interacción de unidad, la señal será exacta (este motor ya lo usa si está presente).
"""
import datetime as dt
from collections import defaultdict
from typing import Any, Dict, List, Optional

_ENGAGE = ["ficha_view", "like", "unit_view", "unit_save", "compare", "photo_dwell", "photo_zoom", "intent", "save"]


def bucket(d: dt.datetime, period: str) -> str:
    if not isinstance(d, dt.datetime):
        return "—"
    if period == "day":
        return d.strftime("%Y-%m-%d")
    if period == "week":
        iso = d.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if period == "quarter":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    if period == "year":
        return str(d.year)
    return d.strftime("%Y-%m")  # month (default)


def _dev_features(dev: Dict[str, Any]) -> set:
    feats = set(dev.get("amenities") or []) | set(dev.get("unit_features") or [])
    return {str(f).strip().lower() for f in feats if f}


def _unit_features(unit: Dict[str, Any]) -> set:
    out = set()
    for k in ("terraza", "balcon", "roof", "roof_garden", "vista", "estudio"):
        if unit.get(k):
            out.add(k)
    for f in (unit.get("features") or []):
        out.add(str(f).strip().lower())
    return out


async def demand_by_feature(db, colonia: Optional[str] = None, period: str = "month",
                            since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Demanda por FEATURE × colonia × tiempo (señales de engagement → features del dev/unidad)."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}}
    if colonia:
        q["colonia"] = colonia
    by_feature = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))   # feature -> bucket -> count
    precise = 0
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "unit_number": 1, "meta": 1}):
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        # PRECISIÓN en 3 niveles (mejor → peor):
        # 1) meta.amenidades = el comprador pidió EXPLÍCITAMENTE esas features (Atlax/búsqueda) → máxima precisión.
        # 2) unit_number → las features de ESA unidad vista.
        # 3) features del dev (proxy) — todas las del dev que vio.
        feats = None
        meta = s.get("meta") or {}
        ame = meta.get("amenidades") or meta.get("features")
        col = s.get("colonia") or (dev or {}).get("colonia_id")
        if isinstance(ame, list) and ame:
            feats = {str(f).strip().lower() for f in ame if f}
            precise += 1
        elif dev:
            un = s.get("unit_number")
            if un:
                unit = next((u for u in (dev.get("units") or []) if u.get("unit_number") == un or str(u.get("id", "")).endswith(f"-{un}")), None)
                if unit:
                    feats = _unit_features(unit)
                    precise += 1
            if feats is None:
                feats = _dev_features(dev)
        if not feats or not col:
            continue
        b = bucket(s["created_at_dt"], period)
        for f in feats:
            by_feature[f] += 1
            series[f][b] += 1
    ranked = sorted(by_feature.items(), key=lambda x: -x[1])[:top]
    return {
        "colonia": colonia or "todas", "period": period, "since_days": since_days, "senales_precisas_unidad": precise,
        "top_features": [{"feature": f, "demanda": n,
                          "serie": dict(sorted(series[f].items()))} for f, n in ranked],
    }


async def demand_by_colonia(db, period: str = "month", since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Colonias MÁS SOLICITADAS (señales + búsquedas) × tiempo."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_col = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "colonia": {"$nin": [None, ""]}},
                                         {"_id": 0, "colonia": 1, "created_at_dt": 1}):
        by_col[s["colonia"]] += 1
        series[s["colonia"]][bucket(s["created_at_dt"], period)] += 1
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "colonias": 1, "created_at_dt": 1}):
        for c in (s.get("colonias") or []):
            by_col[c] += 1
            series[c][bucket(s["created_at_dt"], period)] += 1
    ranked = sorted(by_col.items(), key=lambda x: -x[1])[:top]
    return {"period": period, "top_colonias": [{"colonia": c, "demanda": n, "serie": dict(sorted(series[c].items()))} for c, n in ranked]}


async def demand_by_attribute(db, since_days: int = 365) -> Dict[str, Any]:
    """Atributos EXPLÍCITOS buscados (recámaras / m² / precio / estacionamiento) — demanda dura de las búsquedas."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    rec = defaultdict(int); price_bands = defaultdict(int); parking = defaultdict(int)
    n = 0
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}},
                                                {"_id": 0, "recamaras_min": 1, "precio_max": 1, "estacionamientos_min": 1}):
        n += 1
        if s.get("recamaras_min"):
            rec[f"{s['recamaras_min']}+ rec"] += 1
        pm = s.get("precio_max")
        if pm:
            band = "0-3M" if pm <= 3e6 else "3-8M" if pm <= 8e6 else "8-20M" if pm <= 20e6 else "20M+"
            price_bands[band] += 1
        if s.get("estacionamientos_min"):
            parking[f"{s['estacionamientos_min']}+ estac"] += 1
    return {"busquedas": n, "recamaras": dict(sorted(rec.items())),
            "bandas_precio": dict(sorted(price_bands.items())), "estacionamiento": dict(sorted(parking.items()))}


async def what_to_build(db, colonia: Optional[str] = None, since_days: int = 365) -> Dict[str, Any]:
    """QUÉ CONSTRUIR: demanda por feature vs OFERTA (unidades que existen con ese feature) → brecha = oportunidad."""
    from data_developments import DEVELOPMENTS
    dem = await demand_by_feature(db, colonia=colonia, since_days=since_days, top=50)
    demand = {f["feature"]: f["demanda"] for f in dem["top_features"]}
    supply = defaultdict(int)
    for dev in DEVELOPMENTS:
        if colonia and (dev.get("colonia_id") != colonia):
            continue
        feats = _dev_features(dev)
        n_units = len(dev.get("units") or []) or 1
        for f in feats:
            supply[f] += n_units
    gaps = []
    for f, d in demand.items():
        s = supply.get(f, 0)
        ratio = d / max(s, 1)
        gaps.append({"feature": f, "demanda": d, "oferta_unidades": s, "presion": round(ratio, 2)})
    gaps.sort(key=lambda x: -x["presion"])
    return {"colonia": colonia or "todas", "oportunidades": gaps[:15],
            "lectura": "presion alta = mucha demanda, poca oferta → construir esto"}


async def killer_query(db, feature: str, colonia: str, period: str = "month") -> Dict[str, Any]:
    """El ejemplo del founder: '¿cuántos clientes engancharon con [feature] en [colonia], y cuándo?'."""
    feature = feature.strip().lower()
    res = await demand_by_feature(db, colonia=colonia, period=period, top=100)
    row = next((f for f in res["top_features"] if f["feature"] == feature), None)
    return {"pregunta": f"demanda de '{feature}' en '{colonia}'", "feature": feature, "colonia": colonia,
            "demanda_total": (row or {}).get("demanda", 0), "serie_tiempo": (row or {}).get("serie", {}),
            "respondible": row is not None}
