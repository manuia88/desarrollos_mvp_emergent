"""Phase 4 Batch 24 · services — Colonia Intelligence aggregator.

Agrega datos de múltiples fuentes (data_seed, db.developments,
db.engagement_events, db.ie_engine_scores) para el sidebar de colonia
en el marketplace público.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.colonia_intel")

# ─── Climate Twin static mapping ──────────────────────────────────────────────
_CLIMATE_TWIN: Dict[str, Dict[str, Any]] = {
    "polanco": {
        "city": "Upper East Side", "country": "Nueva York, EE.UU.",
        "similarity_pct": 78,
        "description": "Alta densidad comercial de lujo, seguridad elevada, parques urbanos."
    },
    "lomas-chapultepec": {
        "city": "Beverly Hills", "country": "California, EE.UU.",
        "similarity_pct": 74,
        "description": "Residencias de alto valor, baja densidad, verde abundante."
    },
    "roma-norte": {
        "city": "Williamsburg", "country": "Brooklyn, EE.UU.",
        "similarity_pct": 81,
        "description": "Vida cultural intensa, gastronomía de nicho, apreciación acelerada."
    },
    "roma-sur": {
        "city": "East Williamsburg", "country": "Brooklyn, EE.UU.",
        "similarity_pct": 77,
        "description": "Comunidad artística emergente, precios en ascenso, mixtura de usos."
    },
    "condesa": {
        "city": "Palermo Soho", "country": "Buenos Aires, Argentina",
        "similarity_pct": 85,
        "description": "Cafés, boutiques, walkability alta, arquitectura art déco."
    },
    "juarez": {
        "city": "Logan Square", "country": "Chicago, EE.UU.",
        "similarity_pct": 79,
        "description": "Barrio en plena revitalización, plusvalía acelerada, vida nocturna emergente."
    },
    "cuauhtemoc": {
        "city": "Midtown East", "country": "Nueva York, EE.UU.",
        "similarity_pct": 71,
        "description": "Alta centralidad, conectividad excepcional, usos mixtos corporativos."
    },
    "del-valle-centro": {
        "city": "Irvington", "country": "Nueva Jersey, EE.UU.",
        "similarity_pct": 73,
        "description": "Zona familiar consolidada, oferta educativa sólida, densidad media."
    },
    "narvarte": {
        "city": "Astoria", "country": "Queens, EE.UU.",
        "similarity_pct": 76,
        "description": "Comunidad diversa, buena conectividad, precio asequible con apreciación."
    },
    "napoles": {
        "city": "Kew Gardens Hills", "country": "Queens, EE.UU.",
        "similarity_pct": 68,
        "description": "Zona residencial consolidada, servicios de barrio, mercado estable."
    },
    "escandon": {
        "city": "Park Slope", "country": "Brooklyn, EE.UU.",
        "similarity_pct": 74,
        "description": "Vecindario familiar premium, parques, alta demanda de propiedades."
    },
    "anzures": {
        "city": "Upper West Side", "country": "Nueva York, EE.UU.",
        "similarity_pct": 72,
        "description": "Zona residencial premium, buena educación, acceso a parques."
    },
    "doctores": {
        "city": "Bed-Stuy", "country": "Brooklyn, EE.UU.",
        "similarity_pct": 82,
        "description": "Revitalización activa, inversión creciente, plusvalía de alto potencial."
    },
    "coyoacan-centro": {
        "city": "Oak Park", "country": "Illinois, EE.UU.",
        "similarity_pct": 70,
        "description": "Pueblo histórico integrado a metrópoli, calidad de vida alta, mercado estable."
    },
    "pedregal": {
        "city": "Westwood", "country": "Los Ángeles, EE.UU.",
        "similarity_pct": 75,
        "description": "Baja densidad residencial de lujo, verde extenso, mercado exclusivo."
    },
    "santa-fe": {
        "city": "Tysons Corner", "country": "Virginia, EE.UU.",
        "similarity_pct": 72,
        "description": "Polo corporativo de alta densidad, centros comerciales, movilidad limitada."
    },
}

# ─── Risk static mapping (values 0–100; mock=True hasta integrar INEGI real) ──
_RISKS: Dict[str, Dict[str, Any]] = {
    "polanco":           {"flood": 15, "seismic": 65, "theft": 28, "heat_stress": 32, "mock": True},
    "lomas-chapultepec": {"flood": 10, "seismic": 60, "theft": 18, "heat_stress": 28, "mock": True},
    "roma-norte":        {"flood": 42, "seismic": 78, "theft": 55, "heat_stress": 40, "mock": True},
    "roma-sur":          {"flood": 38, "seismic": 75, "theft": 52, "heat_stress": 38, "mock": True},
    "condesa":           {"flood": 30, "seismic": 72, "theft": 45, "heat_stress": 36, "mock": True},
    "juarez":            {"flood": 25, "seismic": 70, "theft": 50, "heat_stress": 38, "mock": True},
    "cuauhtemoc":        {"flood": 35, "seismic": 68, "theft": 62, "heat_stress": 44, "mock": True},
    "del-valle-centro":  {"flood": 20, "seismic": 66, "theft": 38, "heat_stress": 35, "mock": True},
    "narvarte":          {"flood": 22, "seismic": 64, "theft": 36, "heat_stress": 34, "mock": True},
    "napoles":           {"flood": 18, "seismic": 63, "theft": 34, "heat_stress": 33, "mock": True},
    "escandon":          {"flood": 20, "seismic": 67, "theft": 42, "heat_stress": 36, "mock": True},
    "anzures":           {"flood": 14, "seismic": 62, "theft": 30, "heat_stress": 30, "mock": True},
    "doctores":          {"flood": 48, "seismic": 72, "theft": 78, "heat_stress": 52, "mock": True},
    "coyoacan-centro":   {"flood": 12, "seismic": 58, "theft": 30, "heat_stress": 28, "mock": True},
    "pedregal":          {"flood": 8,  "seismic": 55, "theft": 15, "heat_stress": 26, "mock": True},
    "santa-fe":          {"flood": 10, "seismic": 50, "theft": 22, "heat_stress": 30, "mock": True},
}

_DEFAULT_RISK = {"flood": 35, "seismic": 65, "theft": 45, "heat_stress": 40, "mock": True}
_DEFAULT_TWIN = {
    "city": "Por calcular", "country": "—",
    "similarity_pct": 0,
    "description": "Aún analizando los indicadores de esta colonia."
}


async def get_colonia_full(db, colonia_id: str) -> Optional[Dict[str, Any]]:
    """
    Agrega información completa de una colonia desde múltiples fuentes.
    Returns None si colonia_id no se reconoce.
    """
    from data_seed import COLONIAS_BY_ID

    base = COLONIAS_BY_ID.get(colonia_id)
    if not base:
        return None

    # ── Proyectos en esta colonia ──────────────────────────────────────────────
    try:
        from data_developments import DEVELOPMENTS
        devs_in_colonia = [
            d for d in DEVELOPMENTS
            if (d.get("colonia_id") or d.get("colonia", "")).lower().replace(" ", "-") == colonia_id
        ]
        projects_count = len(devs_in_colonia)
        if devs_in_colonia:
            avg_price_m2 = int(
                sum(d.get("price_per_m2", (base.get("price_m2", 50) or 50) * 1000) for d in devs_in_colonia)
                / len(devs_in_colonia)
            )
        else:
            avg_price_m2 = (base.get("price_m2", 50) or 50) * 1000
    except Exception as ex:
        log.warning(f"[colonia_intel] dev query failed: {ex}")
        projects_count = 0
        avg_price_m2 = base.get("price_m2", 50000)

    # Complementar con db.developments si existe
    try:
        db_count = await db.developments.count_documents({"colonia_id": colonia_id})
        if db_count > 0:
            projects_count += db_count
        db_pipeline = [
            {"$match": {"colonia_id": colonia_id, "price_per_m2": {"$gt": 0}}},
            {"$group": {"_id": None, "avg": {"$avg": "$price_per_m2"}}},
        ]
        db_avg = await db.developments.aggregate(db_pipeline).to_list(1)
        if db_avg and db_avg[0].get("avg"):
            avg_price_m2 = int(db_avg[0]["avg"])
    except Exception:
        pass

    # ── Engagement / demanda últimos 30d ──────────────────────────────────────
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        heat = await db.engagement_events.count_documents({
            "colonia_id": colonia_id,
            "ts": {"$gte": thirty_days_ago},
        })
    except Exception:
        heat = 0

    # ── IE Engine scores (si Phase 5 existe) ──────────────────────────────────
    ie_scores: Dict[str, Any] = {}
    try:
        ie_doc = await db.ie_engine_scores.find_one({"colonia_id": colonia_id}, {"_id": 0})
        if ie_doc:
            ie_scores = ie_doc.get("scores") or {}
    except Exception:
        pass

    # Fallback a scores de data_seed
    if not ie_scores:
        ie_scores = base.get("scores", {})

    # ── Momentum 90d ──────────────────────────────────────────────────────────
    momentum_raw = base.get("momentum", "+0%")
    try:
        momentum_val = float(str(momentum_raw).replace("%", "").replace("+", ""))
    except Exception:
        momentum_val = 0.0

    # ── Climate Twin ──────────────────────────────────────────────────────────
    twin = _CLIMATE_TWIN.get(colonia_id, _DEFAULT_TWIN)

    # ── Risks ─────────────────────────────────────────────────────────────────
    risks = _RISKS.get(colonia_id, _DEFAULT_RISK)

    return {
        "colonia": {
            "id": colonia_id,
            "nombre": base["name"],
            "alcaldia": base["alcaldia"],
            "tier": base.get("tier", "Mid"),
            "center": base.get("center", []),
            "polygon": base.get("polygon", []),
        },
        "scores": ie_scores,
        "projects_count": projects_count,
        "avg_price_m2": avg_price_m2,
        "momentum_90d": momentum_val,
        "momentum_label": momentum_raw,
        "demand_heat_30d": heat,
        "climate_twin": twin,
        "risks": risks,
    }
