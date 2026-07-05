"""Phase 4 Batch 24 · Marketplace Map Intelligence routes.

Endpoints públicos (sin auth):
  GET /api/public/map/heatmap  — GeoJSON FeatureCollection por capa y zoom
  GET /api/public/map/levels   — Configuración de niveles de zoom Z1–Z4
  GET /api/public/map/colonia/{colonia_id}  — Información completa de colonia
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("dmx.marketplace_map")

router = APIRouter(tags=["public-map"])


def _get_db(request: Request):
    return request.app.state.db


# ─── Zoom level static config ─────────────────────────────────────────────────
ZOOM_LEVELS = {
    "Z1": {"label": "País", "zoom_min": 0,  "zoom_max": 5,  "unit": "country"},
    "Z2": {"label": "Zona Metro", "zoom_min": 6,  "zoom_max": 8,  "unit": "metro_zone"},
    "Z3": {"label": "Alcaldía",   "zoom_min": 9,  "zoom_max": 11, "unit": "alcaldia"},
    "Z4": {"label": "Colonia",    "zoom_min": 12, "zoom_max": 22, "unit": "colonia"},
}

# ─── Metro zone definitions (CDMX) ───────────────────────────────────────────
METRO_ZONES = [
    {
        "id": "mz-poniente",
        "name": "Zona Poniente",
        "center": [-99.218, 19.412],
        "alcaldias": ["Miguel Hidalgo", "Cuajimalpa"],
    },
    {
        "id": "mz-centro",
        "name": "Zona Centro",
        "center": [-99.160, 19.420],
        "alcaldias": ["Cuauhtémoc"],
    },
    {
        "id": "mz-sur-oriente",
        "name": "Zona Sur",
        "center": [-99.163, 19.376],
        "alcaldias": ["Benito Juárez", "Coyoacán", "Álvaro Obregón"],
    },
]


def _bbox_filter(features, bbox: Optional[str]):
    """Filtra features por bbox si se proporciona. bbox='lat1,lng1,lat2,lng2'"""
    if not bbox:
        return features
    try:
        parts = [float(x) for x in bbox.split(",")]
        lat1, lng1, lat2, lng2 = parts
        def within(coords):
            lng, lat = coords
            return min(lng1, lng2) <= lng <= max(lng1, lng2) and \
                   min(lat1, lat2) <= lat <= max(lat1, lat2)
        return [f for f in features if within(f["geometry"]["coordinates"])]
    except Exception:
        return features


def _normalize_value(val: float, min_v: float, max_v: float) -> float:
    """Normaliza un valor entre 0 y 1 para el peso del heatmap."""
    if max_v == min_v:
        return 0.5
    return max(0.0, min(1.0, (val - min_v) / (max_v - min_v)))


def _parse_momentum(c) -> float:
    """Parsea el momentum de string '+8%' o float a float."""
    m = c.get("momentum", "0%")
    if isinstance(m, (int, float)):
        return float(m)
    try:
        return float(str(m).replace("%", "").replace("+", ""))
    except Exception:
        return 0.0


def _build_features_z4(colonias, layer: str) -> list:
    """Z4: colonia individual — 16 features."""
    features = []
    for c in colonias:
        if layer == "price":
            # price_m2 está en miles (ej: 95 = $95k MXN)
            val = (c.get("price_m2", 50) or 50) * 1000
        elif layer == "demand":
            inv = c.get("inventory", 50) or 50
            val = min(200, max(10, inv))
        else:  # momentum
            m = _parse_momentum(c)
            val = max(0, m + 20)  # shift a 0-based (momentum -10..+15 → 10..35)
        features.append({
            "type": "Feature",
            "properties": {
                "id": c["id"],
                "name": c["name"],
                "alcaldia": c["alcaldia"],
                "value": val,
                "layer": layer,
                "zoom_unit": "colonia",
            },
            "geometry": {"type": "Point", "coordinates": c["center"]},
        })
    return features


def _build_features_z3(colonias, layer: str) -> list:
    """Z3: alcaldía — agrega colonias por alcaldía."""
    alcaldia_map: dict = {}
    for c in colonias:
        al = c["alcaldia"]
        if al not in alcaldia_map:
            alcaldia_map[al] = {"colonias": [], "centers": []}
        alcaldia_map[al]["colonias"].append(c)
        alcaldia_map[al]["centers"].append(c["center"])

    features = []
    for al_name, data in alcaldia_map.items():
        cols = data["colonias"]
        # Centro geométrico de las colonias de la alcaldía
        lngs = [c[0] for c in data["centers"]]
        lats = [c[1] for c in data["centers"]]
        center = [sum(lngs) / len(lngs), sum(lats) / len(lats)]

        if layer == "price":
            val = int(sum((c.get("price_m2", 50) or 50) * 1000 for c in cols) / len(cols))
        elif layer == "demand":
            val = sum(c.get("inventory", 50) or 50 for c in cols)
        else:
            vals = [_parse_momentum(c) for c in cols]
            val = max(0, (sum(vals) / len(vals)) + 20)

        features.append({
            "type": "Feature",
            "properties": {
                "id": al_name.lower().replace(" ", "-").replace("á", "a").replace("é", "e")
                              .replace("ó", "o").replace("ú", "u"),
                "name": al_name,
                "alcaldia": al_name,
                "value": val,
                "layer": layer,
                "zoom_unit": "alcaldia",
                "colonias_count": len(cols),
            },
            "geometry": {"type": "Point", "coordinates": center},
        })
    return features


def _build_features_z2(layer: str, colonias) -> list:
    """Z2: zona metro — 3 zonas CDMX."""
    colonia_map = {c["id"]: c for c in colonias}
    features = []

    for zone in METRO_ZONES:
        zone_cols = [c for c in colonias if c["alcaldia"] in zone["alcaldias"]]
        if not zone_cols:
            continue

        if layer == "price":
            val = int(sum((c.get("price_m2", 50) or 50) * 1000 for c in zone_cols) / len(zone_cols))
        elif layer == "demand":
            val = sum(c.get("inventory", 50) or 50 for c in zone_cols)
        else:
            vals = [_parse_momentum(c) for c in zone_cols]
            val = max(0, (sum(vals) / len(vals)) + 20)

        features.append({
            "type": "Feature",
            "properties": {
                "id": zone["id"],
                "name": zone["name"],
                "alcaldia": "Múltiple",
                "value": val,
                "layer": layer,
                "zoom_unit": "metro_zone",
                "alcaldias": zone["alcaldias"],
            },
            "geometry": {"type": "Point", "coordinates": zone["center"]},
        })
    return features


def _build_features_z1(layer: str, colonias) -> list:
    """Z1: país — 1 feature agregado CDMX."""
    if layer == "price":
        val = int(sum((c.get("price_m2", 50) or 50) * 1000 for c in colonias) / len(colonias))
    elif layer == "demand":
        val = sum(c.get("inventory", 50) or 50 for c in colonias)
    else:
        vals = [_parse_momentum(c) for c in colonias]
        val = max(0, (sum(vals) / len(vals)) + 20)

    return [{
        "type": "Feature",
        "properties": {
            "id": "cdmx",
            "name": "Ciudad de México",
            "alcaldia": "CDMX",
            "value": val,
            "layer": layer,
            "zoom_unit": "country",
        },
        "geometry": {"type": "Point", "coordinates": [-99.1969, 19.4270]},
    }]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/public/map/levels")
async def get_map_levels():
    """Configuración estática de niveles de zoom Z1–Z4."""
    return {
        "levels": ZOOM_LEVELS,
        "auto_switch": {
            "Z1": {"min_zoom": 0, "max_zoom": 5},
            "Z2": {"min_zoom": 6, "max_zoom": 8},
            "Z3": {"min_zoom": 9, "max_zoom": 11},
            "Z4": {"min_zoom": 12, "max_zoom": 22},
        },
    }


@router.get("/api/public/map/heatmap")
async def get_heatmap(
    request: Request,
    layer: str = Query("price", pattern="^(price|demand|momentum)$"),
    zoom_level: int = Query(3, ge=1, le=4),
    bbox: Optional[str] = Query(None),
):
    """
    Devuelve GeoJSON FeatureCollection para el heatmap del marketplace.
    Granularidad controlada por zoom_level: 1=país, 2=zona metro, 3=alcaldía, 4=colonia.
    """
    from data_seed import COLONIAS

    # Enriquecer con datos de MongoDB si disponibles
    db = _get_db(request)
    colonias_data = list(COLONIAS)  # copy

    try:
        # Intentar obtener datos de demanda reales
        if layer == "demand":
            from datetime import datetime, timezone, timedelta
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            pipeline = [
                {"$match": {"ts": {"$gte": cutoff}}},
                {"$group": {"_id": "$colonia_id", "count": {"$sum": 1}}},
            ]
            events = await db.engagement_events.aggregate(pipeline).to_list(100)
            events_by_colonia = {e["_id"]: e["count"] for e in events if e.get("_id")}
            if events_by_colonia:
                # escribir de vuelta por índice — antes `c = dict(c)` creaba una copia local que se
                # descartaba, así que el enriquecimiento con eventos reales era código muerto.
                colonias_data = [
                    ({**c, "inventory": events_by_colonia[c["id"]]} if c.get("id") in events_by_colonia else c)
                    for c in colonias_data
                ]
    except Exception as ex:
        log.debug(f"[heatmap] enrich from DB failed (non-critical): {ex}")

    # Construir features según zoom_level
    if zoom_level <= 1:
        features = _build_features_z1(layer, colonias_data)
    elif zoom_level == 2:
        features = _build_features_z2(layer, colonias_data)
    elif zoom_level == 3:
        features = _build_features_z3(colonias_data, layer)
    else:  # Z4
        features = _build_features_z4(colonias_data, layer)

    # Filtrar por bbox si se provee
    features = _bbox_filter(features, bbox)

    # Calcular rango para leyenda
    values = [f["properties"]["value"] for f in features if f["properties"].get("value") is not None]
    val_min = min(values) if values else 0
    val_max = max(values) if values else 100

    # Normalizar weight a 0-1
    for f in features:
        raw = f["properties"].get("value", 0)
        f["properties"]["weight"] = _normalize_value(raw, val_min, val_max)

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "layer": layer,
            "zoom_level": zoom_level,
            "zoom_unit": ["country", "metro_zone", "alcaldia", "colonia"][zoom_level - 1],
            "features_count": len(features),
            "value_min": val_min,
            "value_max": val_max,
            "bbox": bbox,
        },
    }


@router.get("/api/public/map/colonia/{colonia_id}")
async def get_colonia_detail(colonia_id: str, request: Request):
    """
    Información completa de una colonia: mercado, scores IE, climate twin, riesgos.
    """
    from services.colonia_intelligence import get_colonia_full

    db = _get_db(request)
    data = await get_colonia_full(db, colonia_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Colonia '{colonia_id}' no encontrada")
    return data
