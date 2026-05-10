"""W4.18.2A — Maps Engine: Layer Aggregator + Cache + Atlax Context Builder.

3 capas principales (devs preventa + brokers usada + catastro heatmap) +
2 overlays opcionales (zone_score + risk polygons).

Cache: map_layer_cache · 1h TTL · 16 quadrants CDMX.
Phase Y: ninguna restricción (página pública).
"""
from __future__ import annotations

import hashlib
import logging
import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.maps_engine")

# CDMX bounding box [lng_sw, lat_sw, lng_ne, lat_ne]
CDMX_BBOX = (-99.40, 19.10, -98.90, 19.75)
CACHE_TTL_H = 1
MAX_FEATURES_PER_LAYER = 5000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _bbox_quadrant(bbox: Tuple[float, float, float, float]) -> str:
    """Genera clave de cuadrante normalizada para cache (16 cuadrantes CDMX)."""
    if not bbox:
        return "full"
    lng1, lat1, lng2, lat2 = bbox
    # 4×4 grid
    lon_step = (CDMX_BBOX[2] - CDMX_BBOX[0]) / 4
    lat_step = (CDMX_BBOX[3] - CDMX_BBOX[1]) / 4
    col = min(3, max(0, int((lng1 - CDMX_BBOX[0]) / lon_step)))
    row = min(3, max(0, int((lat1 - CDMX_BBOX[1]) / lat_step)))
    return f"q{row}{col}"


def _parse_bbox(bbox_str: Optional[str]) -> Optional[Tuple]:
    """Parsea bbox string 'lat1,lng1,lat2,lng2' → tuple (lng1,lat1,lng2,lat2)."""
    if not bbox_str:
        return None
    try:
        parts = [float(x) for x in bbox_str.split(",")]
        if len(parts) == 4:
            lat1, lng1, lat2, lng2 = parts
            return (lng1, lat1, lng2, lat2)
    except Exception:
        pass
    return None


def _in_bbox(lat: float, lng: float, bbox: Optional[Tuple]) -> bool:
    if not bbox:
        return True
    lng1, lat1, lng2, lat2 = bbox
    return lat1 <= lat <= lat2 and min(lng1, lng2) <= lng <= max(lng1, lng2)


# ─── GeoJSON helpers ─────────────────────────────────────────────────────────

def _point_feature(lat: float, lng: float, props: Dict) -> Dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": props,
    }


def _feature_collection(features: List[Dict]) -> Dict:
    return {"type": "FeatureCollection", "features": features}


# ─── Circle polygon approx for zone_score overlay ────────────────────────────

def _circle_polygon(lat: float, lng: float, radius_km: float = 0.8, steps: int = 32) -> Dict:
    """Genera polígono circular aproximado para overlays de zona."""
    coords = []
    for i in range(steps + 1):
        angle = (2 * math.pi * i) / steps
        dlat = (radius_km / 111.0) * math.cos(angle)
        dlng = (radius_km / (111.0 * math.cos(math.radians(lat)))) * math.sin(angle)
        coords.append([lng + dlng, lat + dlat])
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [coords]},
    }


# ─── Layer builders ──────────────────────────────────────────────────────────

async def _build_devs_layer(db, bbox: Optional[Tuple], filters: Dict) -> Dict:
    """Layer 'devs': proyectos preventa de cube_aggregations tier='development'."""
    query: Dict[str, Any] = {
        "tier": "development",
        "geo.lat": {"$ne": None},
        "geo.lng": {"$ne": None},
    }

    # Filtros opcionales
    min_price = filters.get("min_price")
    max_price = filters.get("max_price")
    if min_price or max_price:
        price_filter: Dict = {}
        if min_price:
            price_filter["$gte"] = float(min_price)
        if max_price:
            price_filter["$lte"] = float(max_price)
        query["kpis.avg_price_mxn"] = price_filter

    min_score = filters.get("min_score")
    if min_score:
        query["kpis.ie_score_promedio"] = {"$gte": float(min_score)}

    cursor = db.cube_aggregations.find(query, {
        "_id": 0, "tier_id": 1, "name": 1, "geo": 1, "kpis": 1, "period": 1,
    }).limit(MAX_FEATURES_PER_LAYER)
    docs = await cursor.to_list(MAX_FEATURES_PER_LAYER)

    features = []
    for d in docs:
        geo = d.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        if not _in_bbox(lat, lng, bbox):
            continue
        kpis = d.get("kpis") or {}
        features.append(_point_feature(lat, lng, {
            "id": d.get("tier_id"),
            "name": d.get("name", ""),
            "type": "dev_preventa",
            "price_from": kpis.get("avg_price_mxn"),
            "price_m2": kpis.get("avg_price_per_m2"),
            "units_total": kpis.get("units_total"),
            "units_available": kpis.get("units_available"),
            "ie_score": kpis.get("ie_score_promedio"),
            "slug": d.get("tier_id"),
        }))

    return _feature_collection(features)


async def _build_brokers_layer(db, bbox: Optional[Tuple], filters: Dict) -> Dict:
    """Layer 'brokers': broker_listings usada/renta."""
    query: Dict[str, Any] = {
        "lat": {"$ne": None},
        "lng": {"$ne": None},
    }
    type_filter = filters.get("type")
    if type_filter and type_filter != "both":
        query["listing_type"] = type_filter

    min_price = filters.get("min_price")
    max_price = filters.get("max_price")
    if min_price or max_price:
        price_filter: Dict = {}
        if min_price:
            price_filter["$gte"] = float(min_price)
        if max_price:
            price_filter["$lte"] = float(max_price)
        query["price"] = price_filter

    cursor = db.broker_listings.find(query, {
        "_id": 0, "listing_id": 1, "title": 1, "lat": 1, "lng": 1,
        "price": 1, "m2": 1, "asesor_id": 1, "listing_type": 1, "photo_url": 1,
    }).limit(MAX_FEATURES_PER_LAYER)
    docs = await cursor.to_list(MAX_FEATURES_PER_LAYER)

    features = []
    for d in docs:
        lat = d.get("lat")
        lng = d.get("lng")
        if lat is None or lng is None:
            continue
        if not _in_bbox(lat, lng, bbox):
            continue
        price_m2 = d.get("price") / d.get("m2") if d.get("price") and d.get("m2") else None
        features.append(_point_feature(lat, lng, {
            "id": d.get("listing_id"),
            "name": d.get("title", "Propiedad usada"),
            "type": "broker_usada",
            "price": d.get("price"),
            "m2": d.get("m2"),
            "price_m2": round(price_m2) if price_m2 else None,
            "asesor_id": d.get("asesor_id"),
            "listing_type": d.get("listing_type", "venta_usada"),
            "photo_url": d.get("photo_url"),
        }))

    return _feature_collection(features)


async def _build_catastro_layer(db, bbox: Optional[Tuple], filters: Dict) -> Dict:
    """Layer 'catastro': heatmap colonias por avg_price_m2 (cube_aggregations colonia tier)."""
    query: Dict[str, Any] = {
        "tier": "colonia",
        "geo.lat": {"$ne": None},
    }

    cursor = db.cube_aggregations.find(query, {
        "_id": 0, "tier_id": 1, "name": 1, "geo": 1, "kpis": 1,
    }).limit(200)
    docs = await cursor.to_list(200)

    features = []
    for d in docs:
        geo = d.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        if not _in_bbox(lat, lng, bbox):
            continue
        kpis = d.get("kpis") or {}
        features.append(_point_feature(lat, lng, {
            "id": d.get("tier_id"),
            "name": d.get("name", ""),
            "type": "catastro_aggregate",
            "avg_price_m2": kpis.get("avg_price_per_m2"),
            "projects_count": kpis.get("projects_count", 0),
            "units_total": kpis.get("units_total", 0),
        }))

    return _feature_collection(features)


async def _build_zone_score_layer(db, bbox: Optional[Tuple]) -> Dict:
    """Layer 'zone_score': polygons colonia con score A-F (círculos aproximados)."""
    score_map = {"A": 90, "B": 75, "C": 60, "D": 45, "E": 30, "F": 15}

    cursor = db.zone_scores.find({}, {
        "_id": 0, "zone_id": 1, "zone_name": 1, "score_letter": 1, "score_numeric": 1, "tier": 1,
    }).limit(200)
    score_docs = await cursor.to_list(200)

    # Join with cube_aggregations colonia for geo
    colonia_geo = {}
    col_cursor = db.cube_aggregations.find(
        {"tier": "colonia", "geo.lat": {"$ne": None}},
        {"_id": 0, "tier_id": 1, "name": 1, "geo": 1},
    ).limit(200)
    col_docs = await col_cursor.to_list(200)
    for c in col_docs:
        name_key = c.get("name", "").lower().strip()
        colonia_geo[name_key] = c.get("geo", {})
        colonia_geo[c.get("tier_id", "")] = c.get("geo", {})

    features = []
    seen = set()
    for s in score_docs:
        zone_name = s.get("zone_name", "")
        zone_id = s.get("zone_id", "")
        key = zone_name.lower().strip()
        if key in seen:
            continue
        seen.add(key)

        geo = colonia_geo.get(key) or colonia_geo.get(zone_id, {})
        lat = geo.get("lat")
        lng = geo.get("lng")

        if lat is None or lng is None:
            continue
        if not _in_bbox(lat, lng, bbox):
            continue

        letter = s.get("score_letter", "D")
        numeric = s.get("score_numeric") or score_map.get(letter, 45)
        poly = _circle_polygon(lat, lng, radius_km=0.6)
        poly["properties"] = {
            "id": zone_id,
            "name": zone_name,
            "score_letter": letter,
            "score_numeric": numeric,
            "type": "zone_score",
        }
        features.append(poly)

    return _feature_collection(features)


async def _build_risk_layer(db, bbox: Optional[Tuple]) -> Dict:
    """Layer 'risk': polygons zonas riesgo (atlas_riesgos W4.18)."""
    cursor = db.atlas_riesgos.find(
        {},
        {"_id": 0, "ageb_id": 1, "risk_level": 1, "layer_type": 1},
    ).limit(200)
    docs = await cursor.to_list(200)

    # Si hay datos de atlas_riesgos, construimos polígonos aproximados
    # Si está vacío, retornamos FeatureCollection vacía
    features = []
    seen_ageb = set()
    for d in docs:
        ageb = d.get("ageb_id")
        if not ageb or ageb in seen_ageb:
            continue
        seen_ageb.add(ageb)
        risk = d.get("risk_level", "medio")
        if risk not in ("alto", "muy_alto"):
            continue
        # Sin coordenadas de AGEB disponibles, omitir
        # Futuro: join con AGEB centroids

    return _feature_collection(features)


# ─── Cache helpers ────────────────────────────────────────────────────────────

def _cache_key(layer_key: str, quadrant: str, filters_hash: str) -> str:
    return f"{layer_key}_{quadrant}_{filters_hash}"


def _filters_hash(filters: Dict) -> str:
    if not filters:
        return "nofilter"
    s = "&".join(f"{k}={v}" for k, v in sorted(filters.items()))
    return hashlib.md5(s.encode()).hexdigest()[:8]


# ─── MapsEngine ───────────────────────────────────────────────────────────────

class MapsEngine:
    VALID_LAYERS = {"devs", "brokers", "catastro", "zone_score", "risk"}

    def __init__(self, db):
        self.db = db

    async def get_layer_data(
        self,
        layer_key: str,
        bbox: Optional[str] = None,
        filters: Optional[Dict] = None,
    ) -> Dict:
        if layer_key not in self.VALID_LAYERS:
            raise ValueError(f"layer_key inválido: {layer_key}")

        filters = filters or {}
        parsed_bbox = _parse_bbox(bbox)
        quadrant = _bbox_quadrant(parsed_bbox) if parsed_bbox else "full"
        fhash = _filters_hash(filters)
        cache_id = _cache_key(layer_key, quadrant, fhash)

        # Check cache
        cached = await self.db.map_layer_cache.find_one(
            {"_id": cache_id, "expires_at": {"$gt": _now()}},
        )
        if cached:
            log.debug(f"[maps] cache HIT {cache_id}")
            return cached.get("geojson_features", _feature_collection([]))

        # Build layer
        log.debug(f"[maps] cache MISS {cache_id} — building")
        if layer_key == "devs":
            geojson = await _build_devs_layer(self.db, parsed_bbox, filters)
        elif layer_key == "brokers":
            geojson = await _build_brokers_layer(self.db, parsed_bbox, filters)
        elif layer_key == "catastro":
            geojson = await _build_catastro_layer(self.db, parsed_bbox, filters)
        elif layer_key == "zone_score":
            geojson = await _build_zone_score_layer(self.db, parsed_bbox)
        elif layer_key == "risk":
            geojson = await _build_risk_layer(self.db, parsed_bbox)
        else:
            geojson = _feature_collection([])

        # Store cache
        count = len(geojson.get("features", []))
        try:
            await self.db.map_layer_cache.replace_one(
                {"_id": cache_id},
                {
                    "_id": cache_id,
                    "layer_key": layer_key,
                    "bbox_quadrant": quadrant,
                    "geojson_features": geojson,
                    "properties_count": count,
                    "filters_hash": fhash,
                    "generated_at": _now(),
                    "expires_at": _now() + timedelta(hours=CACHE_TTL_H),
                },
                upsert=True,
            )
        except Exception as exc:
            log.warning(f"[maps] cache store failed: {exc}")

        return geojson

    async def build_atlax_context(
        self,
        lat: float,
        lng: float,
        zoom: float,
        active_layers: Optional[List[str]] = None,
    ) -> str:
        """Construye context string para inyectar en Atlax system prompt."""
        active_layers = active_layers or ["devs", "catastro"]

        # Determinar colonia/zona más cercana
        col_name = "zona desconocida"
        try:
            col_doc = await self.db.cube_aggregations.find_one(
                {
                    "tier": {"$in": ["colonia", "development"]},
                    "geo.lat": {"$ne": None},
                },
                sort=[
                    ("geo.lat", 1),  # aproximado
                ],
            )
            # Buscar más preciso: colonia con menor distancia
            col_cursor = self.db.cube_aggregations.find(
                {"tier": "colonia", "geo.lat": {"$ne": None}},
                {"_id": 0, "name": 1, "geo": 1, "kpis": 1},
            ).limit(100)
            col_docs = await col_cursor.to_list(100)

            best = None
            best_dist = 999
            for c in col_docs:
                geo = c.get("geo") or {}
                clat = geo.get("lat")
                clng = geo.get("lng")
                if clat and clng:
                    dist = math.sqrt((lat - clat) ** 2 + (lng - clng) ** 2)
                    if dist < best_dist:
                        best_dist = dist
                        best = c
            if best:
                col_name = best.get("name", "")
        except Exception:
            pass

        # Contar features cercanas en capas activas
        nearby_counts: Dict[str, int] = {}
        for layer in active_layers:
            try:
                bbox_str = f"{lat-0.05},{lng-0.05},{lat+0.05},{lng+0.05}"
                geojson = await self.get_layer_data(layer, bbox=bbox_str)
                nearby_counts[layer] = len(geojson.get("features", []))
            except Exception:
                nearby_counts[layer] = 0

        # Zone score de la zona
        zone_score = "N/D"
        try:
            zs = await self.db.zone_scores.find_one(
                {"zone_name": {"$regex": col_name[:8], "$options": "i"}},
                {"_id": 0, "score_letter": 1, "score_numeric": 1},
            )
            if zs:
                zone_score = f"{zs.get('score_letter','?')} ({zs.get('score_numeric','?')})"
        except Exception:
            pass

        dev_count = nearby_counts.get("devs", 0)
        broker_count = nearby_counts.get("brokers", 0)
        layers_str = ", ".join(active_layers) or "ninguna"
        zoom_level = "calle" if zoom >= 15 else "barrio" if zoom >= 12 else "ciudad"

        return (
            f"El usuario está viendo el mapa en la colonia {col_name} "
            f"(coordenadas {lat:.4f},{lng:.4f}), zoom nivel {zoom:.0f} ({zoom_level}). "
            f"Capas activas: {layers_str}. "
            f"En esta zona ve {dev_count} proyectos preventa y {broker_count} propiedades usada. "
            f"Zone Score de la zona: {zone_score}. "
            f"Adapta tu respuesta al contexto visual del mapa que el usuario está explorando."
        )

    async def get_property_detail(self, property_type: str, property_id: str) -> Dict:
        """Retorna detalle completo para PropertyPopup según tipo."""
        if property_type == "dev_preventa":
            doc = await self.db.cube_aggregations.find_one(
                {"tier_id": property_id, "tier": "development"},
                {"_id": 0},
            )
            if doc:
                doc.pop("_id", None)
                return {"type": "dev_preventa", "data": doc}

        elif property_type == "broker_usada":
            doc = await self.db.broker_listings.find_one(
                {"listing_id": property_id},
                {"_id": 0},
            )
            if doc:
                return {"type": "broker_usada", "data": doc}

        elif property_type == "catastro_aggregate":
            doc = await self.db.cube_aggregations.find_one(
                {"tier_id": property_id, "tier": "colonia"},
                {"_id": 0},
            )
            if doc:
                # Enriquecer con zone_score
                name = doc.get("name", "")
                zs = await self.db.zone_scores.find_one(
                    {"zone_name": {"$regex": name[:8], "$options": "i"}},
                    {"_id": 0, "score_letter": 1, "score_numeric": 1},
                )
                doc["zone_score"] = zs
                return {"type": "catastro_aggregate", "data": doc}

        return {"type": property_type, "data": None}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_maps_indexes(db) -> None:
    try:
        await db.map_layer_cache.create_index(
            "expires_at",
            name="idx_map_cache_ttl",
            expireAfterSeconds=0,
            background=True,
        )
        await db.map_layer_cache.create_index(
            [("layer_key", 1), ("bbox_quadrant", 1)],
            name="idx_map_cache_layer_quad", background=True,
        )
        log.info("[maps] indexes OK")
    except Exception as exc:
        log.warning(f"[maps] ensure_indexes failed: {exc}")
