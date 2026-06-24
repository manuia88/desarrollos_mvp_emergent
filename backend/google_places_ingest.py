"""Ingesta de amenidades REALES por colonia desde Google Places API (New) — searchNearby.

Estrategia free-tier: 5,000 consultas/mes gratis (Pro SKU). 8 categorías × 1 consulta = 8 req/colonia → ~560
colonias/mes a $0. Cron mensual procesa un lote priorizado (devs > demanda > scores > geometría) sin pasar de
MAX_PER_MONTH (4,500, colchón). Guarda en denue_zone_density con source='google'. Ingesta de UNA vez + refresco
cada ~6-12 meses → cero costo recurrente. Fail-open: si no hay key, no hace nada (no rompe).

Requiere env GOOGLE_MAPS_API_KEY (la pone el founder). El endpoint /api/superadmin/google-places/ingest (token) corre un lote.
"""
import os
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

# nuestra categoría → tipo de Google Places (New). 8 categorías clave (las que mueven la narrativa).
CATEGORIES: Dict[str, str] = {
    "restaurante": "restaurant", "cafe": "cafe", "escuela": "school", "hospital": "hospital",
    "parque": "park", "supermercado": "supermarket", "gimnasio": "gym", "transporte": "transit_station",
}
MAX_PER_MONTH = 4500          # colchón bajo el free tier de 5,000/mes
RADIUS_M = 1200.0             # radio alrededor del centro de la colonia
REFRESH_DAYS = 200           # re-consultar una colonia ~cada 6-7 meses
INGEST_VERSION = 2           # ⬆ sube al cambiar la lógica de ingesta (tipos/categorías/topN) → el cache viejo se re-ingesta lazy
_URL = "https://places.googleapis.com/v1/places:searchNearby"


def _month_tag() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def _zone_center(db, colonia_id: str):
    """(lat, lng) del centro de una colonia. Resuelve el choque de 2 sistemas de id: prueba el catálogo db.colonias
    (ids largos con alcaldía) y, si no está, el SEED COLONIAS_BY_ID (ids cortos · inversión/destacados). center=[lng,lat].
    Así el lifestyle funciona con cualquiera de los dos ids."""
    try:
        col = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "center": 1})
        ctr = (col or {}).get("center")
        if isinstance(ctr, (list, tuple)) and len(ctr) >= 2:
            return float(ctr[1]), float(ctr[0])
    except Exception:
        pass
    try:
        from data_seed import COLONIAS_BY_ID
        ctr = (COLONIAS_BY_ID.get(colonia_id) or {}).get("center")
        if isinstance(ctr, (list, tuple)) and len(ctr) >= 2:
            return float(ctr[1]), float(ctr[0])
    except Exception:
        pass
    return None


async def _nearby_count(client: httpx.AsyncClient, lat: float, lng: float, gtypes: List[str], key: str) -> int:
    """1 consulta a Places searchNearby (fieldmask mínimo = solo ids, lo más barato). Devuelve el conteo (0-20)."""
    body = {
        "includedPrimaryTypes": gtypes,
        "maxResultCount": 20,
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS_M}},
    }
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id"}
    r = await client.post(_URL, json=body, headers=headers, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"places {r.status_code}: {r.text[:120]}")
    return len((r.json() or {}).get("places") or [])


async def _priority_colonias(db, limit: int) -> List[Dict[str, Any]]:
    """Colonias por prioridad: con desarrollos > con demanda (búsquedas) > con scores > resto. Solo con centro y
    NO ingeridas aún (o vencidas por refresco)."""
    try:
        from data_developments import DEVELOPMENTS
        dev_cols = {d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")}
    except Exception:
        dev_cols = set()
    # demanda por colonia (búsquedas guardadas)
    demand = set()
    try:
        async for s in db.marketplace_searches.find({}, {"_id": 0, "colonias": 1}):
            for c in (s.get("colonias") or []):
                if isinstance(c, str):
                    demand.add(c)
    except Exception:
        pass
    stale_before = datetime.now(timezone.utc) - timedelta(days=REFRESH_DAYS)
    out: List[Dict[str, Any]] = []
    async for col in db.colonias.find({"center": {"$exists": True}}, {"_id": 0, "id": 1, "center": 1, "scores_reales": 1}):
        cid = col.get("id")
        center = col.get("center")
        if not cid or not isinstance(center, (list, tuple)) or len(center) < 2:
            continue
        # ¿ya ingerida por Google y fresca? → saltar
        try:
            ex = await db.denue_zone_density.find_one(
                {"zone_id": cid, "source": "google"}, {"_id": 0, "last_synced": 1})
            if ex and ex.get("last_synced") and ex["last_synced"] > stale_before:
                continue
        except Exception:
            pass
        rank = (3 if cid in dev_cols else 0) + (2 if cid in demand else 0) + (1 if col.get("scores_reales") else 0)
        out.append({"id": cid, "lng": float(center[0]), "lat": float(center[1]), "rank": rank})
    out.sort(key=lambda x: -x["rank"])
    return out[:limit]


# ── LUGARES con nombre + estrellas (curado por perfil) — INFRA lista, se corre cuando haya desarrollos reales ──
# SKU Enterprise (incluye rating) → free tier más bajo (~1,000/mes). Por eso es función aparte + quota propia.
# Tipos PRIMARIOS de Google (includedPrimaryTypes) — clave para la precisión: un gym con "school" entre sus tipos
# secundarios YA NO cae en escuelas. Lista rica por categoría → recupera cobertura (todos los niveles de escuela, etc.).
PLACE_CATEGORIES: Dict[str, List[str]] = {
    "escuela": ["preschool", "primary_school", "secondary_school", "school", "university"],
    "hospital": ["hospital", "doctor"],
    "parque": ["park", "national_park", "garden"],
    "restaurante": ["restaurant"],
    "cafe": ["cafe", "coffee_shop"],
    "supermercado": ["supermarket", "grocery_store"],
    "transporte": ["subway_station", "train_station", "transit_station", "bus_station", "light_rail_station"],
}
TOP_N = 18  # la Places API cobra por REQUEST (no por resultado) → subir el tope llena el mapa sin costo extra


async def _nearby_places(client: httpx.AsyncClient, lat: float, lng: float, gtypes: List[str], key: str) -> List[Dict[str, Any]]:
    """1 consulta searchNearby con campos ricos (nombre+rating+#reseñas+ubicación+precio+link). SKU Enterprise.
    includedPrimaryTypes (tipo PRIMARIO) → categoriza bien (sin gyms en escuelas)."""
    body = {
        "includedPrimaryTypes": gtypes, "maxResultCount": TOP_N, "rankPreference": "POPULARITY",
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS_M}},
    }
    fm = "places.displayName,places.rating,places.userRatingCount,places.location,places.priceLevel,places.googleMapsUri"
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fm}
    r = await client.post(_URL, json=body, headers=headers, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"places {r.status_code}: {r.text[:120]}")
    out: List[Dict[str, Any]] = []
    for p in (r.json() or {}).get("places") or []:
        nm = (p.get("displayName") or {}).get("text")
        if not nm:
            continue
        out.append({"name": nm, "rating": p.get("rating"), "reviews": p.get("userRatingCount"),
                    "price_level": p.get("priceLevel"), "loc": p.get("location"), "maps_uri": p.get("googleMapsUri")})
    return out


async def ingest_places_batch(db, max_requests: int = 900, only_with_devs: bool = True) -> Dict[str, Any]:
    """INFRA — NO correr sin desarrollos reales (SKU Enterprise, free tier ~1,000/mes). Captura top lugares con
    nombre+estrellas por colonia (curado) → db.zone_places {zone_id, places:{categoria:[...]}}. Fail-open + idempotente."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        return {"ok": False, "reason": "no_api_key"}
    month = _month_tag()
    q = await db.google_quota.find_one({"month": month}) or {}
    used = int(q.get("places_used") or 0)
    remaining = max(0, min(max_requests, 950) - used)   # nunca rebasa el free tier Enterprise (~1,000)
    cost = len(PLACE_CATEGORIES)
    if remaining < cost:
        return {"ok": True, "ingested": 0, "places_used": used, "reason": "free_tier_enterprise_agotado"}
    # Prioriza colonias CON desarrollos (donde el dato realmente vende). Si no hay devs y only_with_devs → no gasta.
    try:
        from data_developments import DEVELOPMENTS
        dev_cols = [d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")]
    except Exception:
        dev_cols = []
    cupo = remaining // cost
    targets: List[Dict[str, Any]] = []
    seen = set()
    query = {"id": {"$in": list(set(dev_cols))}} if (only_with_devs and dev_cols) else {"center": {"$exists": True}}
    async for col in db.colonias.find(query, {"_id": 0, "id": 1, "center": 1}):
        cid, center = col.get("id"), col.get("center")
        if not cid or cid in seen or not isinstance(center, (list, tuple)) or len(center) < 2:
            continue
        seen.add(cid)
        targets.append({"id": cid, "lat": float(center[1]), "lng": float(center[0])})
        if len(targets) >= cupo:
            break
    if not targets:
        return {"ok": True, "ingested": 0, "reason": "sin_colonias_con_desarrollos"}
    ingested, req_used = 0, 0
    async with httpx.AsyncClient() as client:
        for t in targets:
            places: Dict[str, List[Dict[str, Any]]] = {}
            ok_any = False
            for our_key, gtype in PLACE_CATEGORIES.items():
                try:
                    places[our_key] = await _nearby_places(client, t["lat"], t["lng"], gtype, key)
                    ok_any = True
                except Exception:
                    places[our_key] = []
                req_used += 1
            if ok_any:
                await db.zone_places.update_one(
                    {"zone_id": t["id"]},
                    {"$set": {"zone_id": t["id"], "source": "google", "places": places,
                              "radius_m": RADIUS_M, "v": INGEST_VERSION, "last_synced": datetime.now(timezone.utc)}}, upsert=True)
                ingested += 1
            if req_used >= remaining:
                break
    await db.google_quota.update_one({"month": month}, {"$set": {"places_used": used + req_used}}, upsert=True)
    return {"ok": True, "ingested": ingested, "requests_used": req_used, "places_used": used + req_used,
            "free_tier_enterprise_restante_aprox": max(0, 950 - (used + req_used))}


# ── ON-DEMAND (lazy): ingesta UNA colonia la 1ª vez que alguien la visita (cacheada) ──
# Comparte el contador mensual google_quota.places_used con el lote → entre ambos NUNCA rebasan el free tier.
_INFLIGHT_ZONES: set = set()          # lock in-proceso: evita doble gasto por visitas concurrentes a la misma zona
_ENTERPRISE_CAP = 950                 # tope free tier Enterprise (~1,000/mes)


async def ingest_one_zone(db, colonia_id: str) -> Dict[str, Any]:
    """Ingesta lazy de UNA colonia (on-demand). Fail-open, idempotente (no re-ingesta si ya está cacheada), con lock
    in-proceso y presupuesto mensual compartido. Pensada para dispararse fire-and-forget desde GET /lugares."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key or not colonia_id or colonia_id in _INFLIGHT_ZONES:
        return {"ok": True, "reason": "skip"}
    _INFLIGHT_ZONES.add(colonia_id)   # lock ANTES de cualquier await → cierra la ventana TOCTOU entre check y add
    try:
        try:
            ex = await db.zone_places.find_one({"zone_id": colonia_id}, {"_id": 1, "v": 1})
            if ex and int(ex.get("v") or 0) >= INGEST_VERSION:
                return {"ok": True, "reason": "already_cached"}   # re-ingesta solo si el cache es de versión vieja
            ctr = await _zone_center(db, colonia_id)   # catálogo (id largo) o SEED (id corto) — resuelve el choque de ids
            if not ctr:
                return {"ok": False, "reason": "no_center"}
            month = _month_tag()
            q = await db.google_quota.find_one({"month": month}) or {}
            used = int(q.get("places_used") or 0)
            cost = len(PLACE_CATEGORIES)
            if (_ENTERPRISE_CAP - used) < cost:
                return {"ok": True, "reason": "free_tier_agotado"}
        except Exception:
            return {"ok": False, "reason": "precheck_error"}
        lat, lng = ctr
        places: Dict[str, List[Dict[str, Any]]] = {}
        ok_any, req = False, 0
        async with httpx.AsyncClient() as client:
            for our_key, gtype in PLACE_CATEGORIES.items():
                try:
                    places[our_key] = await _nearby_places(client, lat, lng, gtype, key)
                    ok_any = True
                except Exception:
                    places[our_key] = []
                req += 1
        if ok_any:
            await db.zone_places.update_one(
                {"zone_id": colonia_id},
                {"$set": {"zone_id": colonia_id, "source": "google", "places": places, "radius_m": RADIUS_M,
                          "v": INGEST_VERSION, "last_synced": datetime.now(timezone.utc), "via": "on_demand"}}, upsert=True)
        await db.google_quota.update_one({"month": month}, {"$inc": {"places_used": req}}, upsert=True)
        return {"ok": True, "ingested": 1 if ok_any else 0, "requests_used": req}
    except Exception:
        return {"ok": False, "reason": "ingest_error"}
    finally:
        _INFLIGHT_ZONES.discard(colonia_id)


async def ingest_batch(db, max_requests: int = MAX_PER_MONTH) -> Dict[str, Any]:
    """Corre un lote dentro del free-tier del mes. Idempotente + fail-open."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        return {"ok": False, "reason": "no_api_key", "hint": "define GOOGLE_MAPS_API_KEY"}
    month = _month_tag()
    q = await db.google_quota.find_one({"month": month}) or {"used": 0}
    used = int(q.get("used") or 0)
    remaining = max(0, min(max_requests, 4900) - used)   # nunca rebasa el free tier
    cost = len(CATEGORIES)
    if remaining < cost:
        return {"ok": True, "ingested": 0, "month_used": used, "reason": "free_tier_agotado_este_mes"}
    cupo_colonias = remaining // cost
    targets = await _priority_colonias(db, cupo_colonias)
    ingested, req_used = 0, 0
    async with httpx.AsyncClient() as client:
        for t in targets:
            by_cat: Dict[str, int] = {}
            ok_any = False
            for our_key, gtype in CATEGORIES.items():
                try:
                    by_cat[our_key] = await _nearby_count(client, t["lat"], t["lng"], [gtype], key)
                    ok_any = True
                except Exception:
                    by_cat[our_key] = None
                req_used += 1
            if ok_any:
                # Upsert por zone_id SOLO (índice único por zona) → Google reemplaza el doc viejo de OSM.
                await db.denue_zone_density.update_one(
                    {"zone_id": t["id"]},
                    {"$set": {
                        "zone_id": t["id"], "source": "google", "by_category": by_cat,
                        "businesses_count_total": sum(v for v in by_cat.values() if isinstance(v, int)),
                        "radius_m": RADIUS_M, "last_synced": datetime.now(timezone.utc),
                    }}, upsert=True)
                ingested += 1
            if req_used >= remaining:
                break
    await db.google_quota.update_one({"month": month}, {"$set": {"month": month, "used": used + req_used}}, upsert=True)
    return {"ok": True, "ingested": ingested, "requests_used": req_used, "month_used": used + req_used,
            "free_tier_restante_aprox": max(0, 4900 - (used + req_used))}
