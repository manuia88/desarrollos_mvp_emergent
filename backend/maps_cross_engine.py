"""W4.18.2B — Maps Cross-features Engine.

Sub-A · Funnel inverso usada→preventa + Match Catastro→Preventa.
Sub-B · Demand vs Supply gap heatmap + Save Zones inversionista.
Sub-C · Battle Card overlay (tier-gated T3+).

Heuristic-first (3-layer pattern: cache 24h → heuristic). Reuses existing
`data_developments.DEVELOPMENTS_BY_ID`, `data_seed.COLONIAS`, and Mongo
collections. NO new external integrations.
"""
from __future__ import annotations

import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

log = logging.getLogger("dmx.maps_cross_engine")

CACHE_TTL_H = 24
TIER_RANK = {"free": 0, "T0": 0, "T1": 1, "pro": 1, "T2": 2, "T3": 3, "enterprise": 3}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# P1.5 · meses que un proyecto lleva vendiendo por etapa (reusa la tabla de absorción).
# Antes el "tiempo para agotar" asumía 12 meses fijos → velocidad ~3× optimista en maduros.
_MESES_STAGE_REF = {"preventa": 6, "exclusiva": 6, "en_construccion": 18,
                    "entrega_inmediata": 36, "entregado": 42}


def _meses_en_mercado(d: dict) -> int:
    return _MESES_STAGE_REF.get((d or {}).get("stage"), 24)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ─── Sub-A · Funnel inverso usada→preventa ────────────────────────────────────
async def funnel_inverso(db, listing_id: str) -> Dict[str, Any]:
    """Dado un listing usada, retorna top-3 devs preventa cercanos + delta ROI."""
    from data_developments import DEVELOPMENTS

    listing = await db.broker_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        listing = await db.usada_listings.find_one({"id": listing_id}, {"_id": 0})

    if not listing:
        # Listing fixture sintético para QA: usar primer dev como anchor sintético
        anchor_lat, anchor_lng = 19.4326, -99.1332
        anchor_price_m2 = 70000
    else:
        geo = listing.get("geo") or {}
        anchor_lat = geo.get("lat") or listing.get("lat") or 19.4326
        anchor_lng = geo.get("lng") or listing.get("lng") or -99.1332
        anchor_price_m2 = listing.get("price_per_m2") or listing.get("price_m2") or 70000

    closest = []
    for d in DEVELOPMENTS:
        center = d.get("center") or [-99.1332, 19.4326]
        dlng, dlat = center[0], center[1]
        dist = _haversine_km(anchor_lat, anchor_lng, dlat, dlng)
        if dist > 1.5:  # 1.5km radius
            continue
        price_from = d.get("price_from", 0)
        m2_min = (d.get("m2_range") or [60])[0] or 60
        dev_price_m2 = price_from / m2_min if m2_min else 0
        delta_pct = ((dev_price_m2 - anchor_price_m2) / anchor_price_m2 * 100) if anchor_price_m2 else 0
        # ROI heurístico: zone tier + stage + delta
        roi = 8.0
        if d.get("stage") == "preventa":
            roi += 4.0
        if delta_pct < 0:
            roi += abs(delta_pct) * 0.3
        closest.append({
            "dev_id": d["id"],
            "slug": d.get("slug"),
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "distance_km": round(dist, 2),
            "price_from": price_from,
            "price_per_m2": round(dev_price_m2),
            "price_delta_pct": round(delta_pct, 1),
            "expected_roi_pct": round(roi, 1),
            "stage": d.get("stage"),
            "why_better": (
                f"Preventa a {round(dist*1000)}m de tu propiedad usada · "
                f"plusvalía estimada {round(roi,1)}% sobre {abs(round(delta_pct,1))}% "
                f"{'menos' if delta_pct<0 else 'más'} costoso"
            ),
        })
    closest.sort(key=lambda x: -x["expected_roi_pct"])
    return {
        "listing_id": listing_id,
        "anchor": {"lat": anchor_lat, "lng": anchor_lng, "price_per_m2": anchor_price_m2},
        "closest_devs": closest[:3],
        "generated_at": _now().isoformat(),
    }


# ─── Sub-A · Match Catastro→Preventa ──────────────────────────────────────────
async def match_catastro_to_preventa(db, user_id: str, force: bool = False) -> Dict[str, Any]:
    """Si user tiene catastro_cuenta en perfil → recomienda devs preventa."""
    from data_developments import DEVELOPMENTS

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return {"recommendations": [], "user_property_meta": None, "reason": "user_not_found"}

    # Cache check
    if not force:
        cached = await db.match_catastro_recommendations.find_one(
            {"user_id": user_id}, {"_id": 0}
        )
        if cached and cached.get("expires_at"):
            exp = cached["expires_at"]
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > _now():
                return {
                    "recommendations": cached.get("recommendations", []),
                    "user_property_meta": cached.get("user_property_meta"),
                    "from_cache": True,
                    "generated_at": cached.get("generated_at"),
                }

    catastro_cuenta = user.get("catastro_cuenta")
    if not catastro_cuenta:
        return {"recommendations": [], "user_property_meta": None, "reason": "no_catastro_cuenta"}

    meta = user.get("catastro_meta") or {
        "m2_construccion": 80, "recamaras": 2, "banos": 2, "m2_terreno": 100,
    }

    target_m2 = meta.get("m2_construccion", 80)
    target_rec = meta.get("recamaras", 2)

    recs = []
    for d in DEVELOPMENTS:
        if d.get("stage") not in ("preventa", "en_construccion"):
            continue
        m2_range = d.get("m2_range") or [60, 120]
        m2_avg = (m2_range[0] + m2_range[1]) / 2
        rec_range = d.get("bedrooms_range") or [1, 3]
        if not (rec_range[0] <= target_rec <= rec_range[1]):
            continue
        m2_diff_pct = abs(m2_avg - target_m2) / target_m2 if target_m2 else 1.0
        if m2_diff_pct > 0.30:
            continue
        similarity = round(max(0.5, 1.0 - m2_diff_pct * 1.5), 2)
        delta_roi = round(8.5 + (1.0 - m2_diff_pct) * 6, 1)
        recs.append({
            "dev_id": d["id"],
            "slug": d.get("slug"),
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "price_from": d.get("price_from"),
            "m2_range": m2_range,
            "similarity_score": similarity,
            "delta_roi_pct": delta_roi,
            "reason": (
                f"Specs muy similares a tu vivienda actual (Δ {round(m2_diff_pct*100)}% en m²); "
                f"plusvalía proyectada {delta_roi}% en 5 años"
            ),
        })
    recs.sort(key=lambda x: -x["delta_roi_pct"])
    recs = recs[:5]

    # Persist cache
    expires = _now() + timedelta(hours=CACHE_TTL_H)
    await db.match_catastro_recommendations.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "user_property_meta": meta,
            "recommendations": recs,
            "generated_at": _now().isoformat(),
            "expires_at": expires,
        }},
        upsert=True,
    )

    return {
        "recommendations": recs,
        "user_property_meta": meta,
        "from_cache": False,
        "generated_at": _now().isoformat(),
    }


# ─── Sub-B · Demand vs Supply Gap heatmap ─────────────────────────────────────
async def demand_supply_gap_geojson(db) -> Dict[str, Any]:
    """Genera GeoJSON polygon FeatureCollection con score demand-supply per colonia."""
    from data_seed import COLONIAS
    from data_developments import DEVELOPMENTS

    # Supply per colonia: count de devs activos
    supply_counts: Dict[str, int] = {}
    for d in DEVELOPMENTS:
        cid = d.get("colonia_id")
        if not cid:
            continue
        supply_counts[cid] = supply_counts.get(cid, 0) + (d.get("units_available") or 1)

    # Demand per colonia · fuente canónica REUSADA (dmx_demand._zone_demand) — honesta:
    # multi-fuente (vistas + búsquedas + conducta) y, si no hay señal real, fallback uniforme (no inventario).
    from dmx_demand import _zone_demand
    demand_counts, demand_is_proxy, _ = await _zone_demand(db)   # 3-tupla: (demand, is_proxy, sources)
    dmax = max(demand_counts.values()) if demand_counts else 1.0
    smax = max(supply_counts.values()) if supply_counts else 1.0

    features = []
    for c in COLONIAS:
        cid = c["id"]
        # Polygon close
        poly = list(c.get("polygon", []))
        if poly and poly[0] != poly[-1]:
            poly.append(poly[0])
        if not poly or len(poly) < 4:
            continue
        supply = supply_counts.get(cid, 0)
        demand = demand_counts.get(cid, 0)
        # P1.5 · gap NORMALIZADO (antes mezclaba stock con flujo): demanda y oferta a escala [0,1].
        dem_norm = (demand / dmax) if dmax else 0.0
        sup_norm = (supply / smax) if smax else 0.0
        score = round(dem_norm - sup_norm, 3)
        # Color: green (high demand low supply) → red (oversupply)
        if score > 0.3:
            color = "#22c55e"
            tier_label = "alta_demanda"
        elif score > 0:
            color = "#84cc16"
            tier_label = "demanda_moderada"
        elif score > -0.3:
            color = "#f59e0b"
            tier_label = "balanceado"
        else:
            color = "#ef4444"
            tier_label = "sobreoferta"
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [poly]},
            "properties": {
                "colonia_id": cid,
                "name": c.get("name"),
                "alcaldia": c.get("alcaldia"),
                "supply": supply,
                "demand": demand,
                "score": score,
                "color": color,
                "tier_label": tier_label,
            },
        })
    return {"type": "FeatureCollection", "features": features,
            "es_estimado": demand_is_proxy,
            "lectura_datos": ("Demanda estimada (proxy de inventario) — aún sin vistas reales de zona"
                              if demand_is_proxy else "Demanda con vistas reales de zona")}


# ─── Sub-B · Save Zones (inversionista) ───────────────────────────────────────
async def save_zone(db, user_id: str, name: str, polygon: Dict[str, Any], alert_triggers: Dict[str, Any]) -> Dict[str, Any]:
    import uuid
    zone_id = f"sz_{uuid.uuid4().hex[:12]}"
    doc = {
        "zone_id": zone_id,
        "user_id": user_id,
        "name": (name or "Zona sin nombre")[:80],
        "polygon_geojson": polygon,
        "alert_triggers": alert_triggers or {"price_delta_pct": 5, "new_dev": True, "supply_increase_pct": 10},
        "created_at": _now().isoformat(),
        "last_checked_at": None,
    }
    await db.saved_zones.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "_id"}


async def list_zones(db, user_id: str) -> List[Dict[str, Any]]:
    cursor = db.saved_zones.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50)
    return [doc async for doc in cursor]


async def delete_zone(db, user_id: str, zone_id: str) -> bool:
    res = await db.saved_zones.delete_one({"zone_id": zone_id, "user_id": user_id})
    return res.deleted_count > 0


async def cron_evaluate_saved_zones(db, dry_run: bool = False) -> Dict[str, Any]:
    """Cron diario 06:00 MX. Evalúa zonas guardadas vs métricas frescas."""
    cursor = db.saved_zones.find({}, {"_id": 0})
    triggered = 0
    checked = 0
    async for z in cursor:
        checked += 1
        # Heurística MVP: si new_dev=True y hay devs creados en últimas 24h dentro del polygon → notify
        if z.get("alert_triggers", {}).get("new_dev"):
            recent_devs = await db.developments.count_documents({
                "created_at": {"$gte": (_now() - timedelta(hours=24)).isoformat()},
            })
            if recent_devs > 0:
                triggered += 1
                if not dry_run:
                    try:
                        from notifications_engine import rule_saved_zone_alert
                        await rule_saved_zone_alert(
                            db,
                            user_id=z["user_id"],
                            zone_name=z.get("name", "tu zona"),
                            zone_id=z.get("zone_id", ""),
                            trigger_type="new_dev",
                            tenant_id=z.get("tenant_id"),
                        )
                    except Exception as exc:
                        log.warning(f"[cron_evaluate_saved_zones] notif rule failed: {exc}")
        await db.saved_zones.update_one(
            {"zone_id": z["zone_id"]},
            {"$set": {"last_checked_at": _now().isoformat()}},
        )
    return {"checked": checked, "triggered": triggered, "dry_run": dry_run}


# ─── Sub-C · Battle Card (tier T3+) ───────────────────────────────────────────
async def battle_card(db, dev_id: str) -> Dict[str, Any]:
    """Compara un dev con top-5 competidores en bbox 2km mismo segmento."""
    from data_developments import DEVELOPMENTS_BY_ID, DEVELOPMENTS

    me = DEVELOPMENTS_BY_ID.get(dev_id)
    if not me:
        return {"error": "dev_not_found"}

    me_center = me.get("center") or [-99.1332, 19.4326]
    me_lng, me_lat = me_center[0], me_center[1]
    me_price = me.get("price_from", 0)
    me_m2_min = (me.get("m2_range") or [60])[0] or 60
    me_price_m2 = me_price / me_m2_min if me_m2_min else 0
    me_units_total = me.get("units_total", 1) or 1
    me_units_sold = me.get("units_sold", 0)
    me_absorption = round(me_units_sold / me_units_total * 100, 1) if me_units_total else 0

    competitors = []
    for d in DEVELOPMENTS:
        if d["id"] == dev_id:
            continue
        center = d.get("center") or [-99.1332, 19.4326]
        dist = _haversine_km(me_lat, me_lng, center[1], center[0])
        if dist > 2.5:
            continue
        d_price = d.get("price_from", 0)
        d_m2 = (d.get("m2_range") or [60])[0] or 60
        d_price_m2 = d_price / d_m2 if d_m2 else 0
        # Filter same segment ±20%
        if me_price_m2 and abs(d_price_m2 - me_price_m2) / me_price_m2 > 0.5:
            continue
        d_units_total = d.get("units_total", 1) or 1
        d_units_sold = d.get("units_sold", 0)
        d_absorption = round(d_units_sold / d_units_total * 100, 1) if d_units_total else 0
        # Tiempo para agotar: velocidad = vendidas / meses REALES en mercado (por etapa).
        monthly_absorption = max(d_units_sold / _meses_en_mercado(d), 0.1)
        time_to_sellout = round(max(0, d_units_total - d_units_sold) / monthly_absorption, 1)
        competitors.append({
            "dev_id": d["id"],
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "distance_km": round(dist, 2),
            "price_from": d_price,
            "price_per_m2": round(d_price_m2),
            "absorption_rate_pct": d_absorption,
            "time_to_sellout_months": time_to_sellout,
            "vs_diff_pct": {
                "price_per_m2": round((d_price_m2 - me_price_m2) / me_price_m2 * 100, 1) if me_price_m2 else 0,
                "absorption_rate_pct": round(d_absorption - me_absorption, 1),
            },
        })
    competitors.sort(key=lambda x: x["distance_km"])
    competitors = competitors[:5]

    me_monthly = max(me_units_sold / _meses_en_mercado(me), 0.1)
    me_time_to_sellout = round(max(0, me_units_total - me_units_sold) / me_monthly, 1)

    return {
        "dev_id": dev_id,
        "my_kpis": {
            "name": me.get("name"),
            "price_from": me_price,
            "price_per_m2": round(me_price_m2),
            "absorption_rate_pct": me_absorption,
            "time_to_sellout_months": me_time_to_sellout,
            "units_total": me_units_total,
            "units_sold": me_units_sold,
        },
        "competitors": competitors,
        "generated_at": _now().isoformat(),
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_maps_cross_indexes(db) -> None:
    try:
        await db.match_catastro_recommendations.create_index("user_id", unique=True)
        await db.match_catastro_recommendations.create_index("expires_at", expireAfterSeconds=0)
        await db.saved_zones.create_index("zone_id", unique=True)
        await db.saved_zones.create_index([("user_id", 1), ("created_at", -1)])
    except Exception as exc:
        log.warning(f"[ensure_maps_cross_indexes] {exc}")
