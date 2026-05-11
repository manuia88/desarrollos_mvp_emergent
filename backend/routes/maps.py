"""W4.18.2A — Maps routes.

Endpoints públicos y superadmin para el Mapa Cerebro Espacial DMX.
Prefix implícito via router, todos bajo /api/maps/ o /api/superadmin/maps/
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from maps_engine import MapsEngine, ensure_maps_indexes

log = logging.getLogger("dmx.routes_maps")

router = APIRouter(tags=["maps"])


def _db(request: Request):
    return request.app.state.db


async def _get_user_optional(request: Request) -> Optional[Any]:
    try:
        from server import get_current_user
        return await get_current_user(request)
    except Exception:
        return None


# ─── Models ──────────────────────────────────────────────────────────────────

class AtlaxContextIn(BaseModel):
    lat: float
    lng: float
    zoom: float = 11.0
    active_layers: Optional[List[str]] = None


# ─── Public endpoints ─────────────────────────────────────────────────────────

@router.get("/api/maps/layers/{layer_key}")
async def get_layer(
    layer_key: str,
    request: Request,
    bbox: Optional[str] = None,
    min_price: Optional[str] = None,
    max_price: Optional[str] = None,
    min_score: Optional[str] = None,
    type: Optional[str] = None,
    bust_cache: bool = False,
):
    """
    Retorna GeoJSON FeatureCollection para una capa.
    layer_key: devs | brokers | catastro | zone_score | risk
    bbox: 'lat1,lng1,lat2,lng2'
    """
    db = _db(request)
    engine = MapsEngine(db)

    if bust_cache:
        # Invalidar cache para esta capa
        try:
            await db.map_layer_cache.delete_many({"layer_key": layer_key})
        except Exception:
            pass

    filters: Dict[str, Any] = {}
    if min_price:
        filters["min_price"] = min_price
    if max_price:
        filters["max_price"] = max_price
    if min_score:
        filters["min_score"] = min_score
    if type:
        filters["type"] = type

    try:
        geojson = await engine.get_layer_data(layer_key, bbox=bbox, filters=filters)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    count = len(geojson.get("features", []))
    return JSONResponse({
        "ok": True,
        "layer": layer_key,
        "count": count,
        **geojson,
    })


@router.post("/api/maps/atlax-context")
async def build_atlax_context(body: AtlaxContextIn, request: Request):
    """Construye context string para Atlax con lat/lng/zoom/capas activas."""
    db = _db(request)
    engine = MapsEngine(db)
    context = await engine.build_atlax_context(
        lat=body.lat,
        lng=body.lng,
        zoom=body.zoom,
        active_layers=body.active_layers,
    )
    return JSONResponse({"ok": True, "context": context})


@router.get("/api/maps/property/{prop_type}/{prop_id}")
async def get_property_detail(prop_type: str, prop_id: str, request: Request):
    """Retorna detalle completo de un feature para PropertyPopup."""
    valid_types = {"dev_preventa", "broker_usada", "catastro_aggregate"}
    if prop_type not in valid_types:
        raise HTTPException(422, f"Tipo inválido. Válidos: {list(valid_types)}")
    db = _db(request)
    engine = MapsEngine(db)
    result = await engine.get_property_detail(prop_type, prop_id)
    return JSONResponse({"ok": True, **result})


@router.get("/api/maps/colonias")
async def list_colonias_for_seo(request: Request, alcaldia: Optional[str] = None):
    """Lista colonias para landing SEO (/mapa/{alcaldia}/{colonia})."""
    db = _db(request)
    query: Dict[str, Any] = {"tier": "colonia", "geo.lat": {"$ne": None}}
    if alcaldia:
        query["name"] = {"$regex": f".*", "$options": "i"}
        # Filtrar por alcaldía desde zone_scores
        zone_ids = await db.zone_scores.distinct("zone_id", {"alcaldia": alcaldia})
        if zone_ids:
            query["tier_id"] = {"$in": zone_ids}

    cursor = db.cube_aggregations.find(query, {
        "_id": 0, "tier_id": 1, "name": 1, "geo": 1,
    }).sort("name", 1).limit(200)
    docs = await cursor.to_list(200)
    colonias = [
        {
            "id": d.get("tier_id"),
            "name": d.get("name"),
            "lat": (d.get("geo") or {}).get("lat"),
            "lng": (d.get("geo") or {}).get("lng"),
        }
        for d in docs
    ]
    return JSONResponse({"ok": True, "colonias": colonias, "count": len(colonias)})


# ─── Superadmin endpoints ─────────────────────────────────────────────────────

@router.get("/api/superadmin/maps/cache-stats")
async def maps_cache_stats(request: Request):
    user = await _get_user_optional(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    from datetime import timezone
    from datetime import datetime as dt

    total = await db.map_layer_cache.count_documents({})
    active = await db.map_layer_cache.count_documents(
        {"expires_at": {"$gt": dt.now(timezone.utc)}}
    )
    expired = total - active

    # Per-layer counts
    pipeline = [
        {"$group": {"_id": "$layer_key", "count": {"$sum": 1}, "active": {
            "$sum": {"$cond": [{"$gt": ["$expires_at", dt.now(timezone.utc)]}, 1, 0]}
        }}}
    ]
    by_layer: Dict[str, Any] = {}
    async for doc in db.map_layer_cache.aggregate(pipeline):
        by_layer[doc["_id"]] = {"total": doc["count"], "active": doc["active"]}

    return JSONResponse({
        "ok": True,
        "total_entries": total,
        "active": active,
        "expired": expired,
        "by_layer": by_layer,
    })


@router.post("/api/superadmin/maps/cache-refresh")
async def maps_cache_refresh(request: Request, layer_key: Optional[str] = None):
    """Invalida cache de una capa (o todas) para forzar rebuild."""
    user = await _get_user_optional(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    query = {"layer_key": layer_key} if layer_key else {}
    result = await db.map_layer_cache.delete_many(query)

    return JSONResponse({
        "ok": True,
        "deleted": result.deleted_count,
        "layer": layer_key or "all",
    })
