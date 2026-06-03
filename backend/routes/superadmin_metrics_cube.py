"""W2.5 SA6 — Granular Metrics Cube routes.

Prefix: /api/superadmin/metrics-cube · all require_superadmin.

Tier hierarchy: city → alcaldia → colonia → development → unit
H1 scope: MX-CDMX only (single city root).

Route order is critical: static paths (heatmap, comparables, unit, refresh, tiers)
are registered BEFORE the dynamic /{tier} route to avoid path-shadowing.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import metrics_cube_aggregations as cube

log = logging.getLogger("dmx.routes_superadmin_metrics_cube")

router = APIRouter(tags=["superadmin_metrics_cube"])
PREFIX = "/api/superadmin/metrics-cube"

PeriodLit = Literal["current", "7d", "30d", "90d"]
TierLit = Literal["city", "alcaldia", "colonia", "development", "unit"]


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _get_or_compute(db, tier: str, tier_id: str, period: str) -> Optional[Dict[str, Any]]:
    row = await db.cube_aggregations.find_one(
        {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
    )
    if row:
        return row
    try:
        await cube.aggregate_tier(db, tier, period)
        return await db.cube_aggregations.find_one(
            {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
        )
    except Exception as e:
        log.warning(f"[cube] on-demand compute failed: {e}")
        return None


# ─── 1) GET /tiers — hierarchy summary with counts ────────────────────────────
@router.get(PREFIX + "/tiers")
async def tiers_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    await cube.aggregate_tier(db, "alcaldia", "current")
    await cube.aggregate_tier(db, "colonia", "current")
    await cube.aggregate_tier(db, "development", "current")

    counts = []
    for tier in ("city", "alcaldia", "colonia", "development"):
        if tier == "city":
            n = 1
        else:
            n = await db.cube_aggregations.count_documents(
                {"tier": tier, "period": "current"},
            )
        counts.append({"tier": tier, "count": n})
    # Units: aggregate seed + mongo
    seed_units = 0
    try:
        from data_developments import ALL_UNITS
        seed_units = len(ALL_UNITS)
    except Exception:
        pass
    mongo_units = await db.units.count_documents({})
    counts.append({"tier": "unit", "count": seed_units + mongo_units})
    return {"hierarchy": ["city", "alcaldia", "colonia", "development", "unit"],
            "counts": counts, "city_root": {"tier_id": cube.CITY_ROOT_ID,
                                            "name": cube.CITY_ROOT_NAME}}


# ─── 2) GET /heatmap — geo dots for Mapbox (BEFORE /{tier}) ───────────────────
@router.get(PREFIX + "/heatmap")
async def heatmap_route(
    request: Request,
    metric: Literal["avg_price_per_m2", "avg_price_mxn", "leads_count",
                    "conversion_rate", "units_total"] = "avg_price_per_m2",
    tier: Literal["alcaldia", "colonia", "development"] = "colonia",
    period: PeriodLit = "current",
    bbox: Optional[str] = Query(None, description="lng_min,lat_min,lng_max,lat_max"),
):
    await _require_superadmin(request)
    db = _db(request)
    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    cur = db.cube_aggregations.find({"tier": tier, "period": period}, {"_id": 0})
    points: List[Dict[str, Any]] = []
    bb = None
    if bbox:
        try:
            bb = [float(x) for x in bbox.split(",")]
            if len(bb) != 4:
                bb = None
        except Exception:
            bb = None

    async for r in cur:
        geo = r.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        if bb and not (bb[0] <= lng <= bb[2] and bb[1] <= lat <= bb[3]):
            continue
        val = (r.get("kpis") or {}).get(metric)
        if val is None:
            continue
        points.append({
            "tier_id": r.get("tier_id"), "name": r.get("name"),
            "lat": lat, "lng": lng, "value": val, "tier": tier,
            "units_total": (r.get("kpis") or {}).get("units_total") or 0,
            "kpis": r.get("kpis") or {},
        })

    if len(points) > 500 and not bb:
        raise HTTPException(400, "Demasiados puntos. Aplica un bbox para limitar.")

    return {"items": points, "metric": metric, "tier": tier, "period": period,
            "total": len(points), "bbox": bbox}


# ─── 3) GET /comparables (BEFORE /{tier}) ─────────────────────────────────────
@router.get(PREFIX + "/comparables")
async def comparables_route(
    request: Request,
    tier_id: str = Query(...),
    radius_km: float = Query(2.0, gt=0, le=20),
    limit: int = Query(20, ge=1, le=50),
):
    await _require_superadmin(request)
    db = _db(request)
    items = await cube.find_comparables(db, tier_id, radius_km=radius_km, limit=limit)
    return {"items": items, "tier_id": tier_id, "radius_km": radius_km, "total": len(items)}


# ─── 4) GET /unit/:unit_id — micro detail (BEFORE /{tier}) ────────────────────
@router.get(PREFIX + "/unit/{unit_id}")
async def unit_detail_route(unit_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    unit = await db.units.find_one(
        {"$or": [{"id": unit_id}, {"unit_id": unit_id}]}, {"_id": 0},
    )
    dev = None
    if not unit:
        # Search seed (data_developments.ALL_UNITS) + embedded units in db.developments
        try:
            from data_developments import ALL_UNITS, DEVELOPMENTS_BY_ID
            for u in ALL_UNITS:
                if u.get("id") == unit_id or u.get("unit_id") == unit_id:
                    unit = dict(u)
                    dev_id_seed = u.get("development_id") or u.get("project_id")
                    if dev_id_seed and dev_id_seed in DEVELOPMENTS_BY_ID:
                        dev = DEVELOPMENTS_BY_ID[dev_id_seed]
                        unit["development_id"] = dev_id_seed
                    break
        except Exception:
            pass
    if not unit:
        async for d in db.developments.find({"units.id": unit_id}, {"_id": 0}):
            for u in (d.get("units") or []):
                if u.get("id") == unit_id:
                    unit = u
                    unit["development_id"] = d.get("id")
                    break
            if unit:
                break
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    dev_id = unit.get("development_id") or unit.get("project_id")
    if not dev and dev_id:
        dev = await db.developments.find_one({"id": dev_id}, {"_id": 0})
        if not dev:
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                dev = DEVELOPMENTS_BY_ID.get(dev_id)
            except Exception:
                dev = None

    # Price history from units_history (if exists) + dev-level price_history fallback
    price_history: List[Dict[str, Any]] = []
    try:
        async for h in db.units_history.find(
            {"unit_id": unit.get("id") or unit.get("unit_id")}, {"_id": 0},
        ).sort([("ts", 1)]).limit(50):
            price_history.append(h)
    except Exception:
        pass
    if not price_history and dev:
        price_history = (dev.get("price_history") or [])[-12:]

    leads: List[Dict[str, Any]] = []
    try:
        cur = db.leads.find(
            {"$or": [{"unit_id": unit_id}, {"interested_unit_id": unit_id}]}, {"_id": 0},
        ).sort([("created_at", -1)]).limit(20)
        async for ld in cur:
            leads.append(ld)
    except Exception:
        pass

    ie_score = None
    if dev:
        ie_score = dev.get("ie_score") or dev.get("score_global")

    return {
        "unit": unit,
        "development": dev,
        "price_history": price_history,
        "leads": leads,
        "leads_count": len(leads),
        "ie_score_zone": ie_score,
    }


# ─── 5) POST /refresh — manual recompute (BEFORE /{tier}) ─────────────────────
@router.post(PREFIX + "/refresh")
async def refresh_aggregations(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    # W2.8 — invalidate OLAP cache when underlying data changes
    try:
        import cube_cache
        cube_cache.cache_invalidate_zones([])
    except Exception:
        pass
    return await cube.aggregate_all(db)


# ─── W2.8 Phase Z.1 — Cross-cut OLAP, Compare, Backfill (BEFORE /{tier}) ──────
import cube_olap_engine as olap  # noqa: E402

SliceByLit = Literal["property_type", "price_tier", "year_built_decade"]
PropertyTypeLit = Literal["depto", "casa", "loft", "town", "ph", "all"]
PriceTierLit = Literal["entry", "mid", "luxury", "ultraluxury", "all"]


class CompareBody(BaseModel):
    zone_ids: List[str]
    period: PeriodLit = "current"


class BackfillBody(BaseModel):
    from_date: str
    to_date: str
    zone_ids: Optional[List[str]] = None


@router.get(PREFIX + "/cross-cut")
async def cross_cut_route(
    request: Request,
    dimensions: str = Query(..., description="comma-separated, max 3"),
    period: PeriodLit = "current",
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
    tier: Optional[TierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    dims = [d.strip() for d in dimensions.split(",") if d.strip()]
    filters: Dict[str, Any] = {}
    if property_type:
        filters["property_type"] = property_type
    if price_tier:
        filters["price_tier"] = price_tier
    if tier:
        filters["tier"] = tier
    try:
        return await olap.query_cross_cut(db, dimensions=dims, filters=filters,
                                          period=period)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post(PREFIX + "/compare")
async def compare_route(body: CompareBody, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    try:
        return await olap.query_compare_zones(db, body.zone_ids, body.period)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post(PREFIX + "/backfill")
async def backfill_route(body: BackfillBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    try:
        from_d = datetime.fromisoformat(body.from_date.replace("Z", "+00:00"))
        to_d = datetime.fromisoformat(body.to_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Fechas inválidas (ISO 8601 requerido)")
    try:
        result = await olap.backfill_historical(
            db, from_date=from_d, to_date=to_d, zone_ids=body.zone_ids,
            triggered_by=user.user_id,
        )
        if not result.get("ok") and result.get("status") == 409:
            raise HTTPException(409, f"Backfill activo: {result.get('active_job_id')}")
        try:
            from audit_log import log_mutation
            await log_mutation(
                db, user, "trigger", "cube_backfill", result.get("job_id"),
                before=None, after={"from_date": body.from_date,
                                    "to_date": body.to_date},
                request=request,
            )
        except Exception:
            pass
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get(PREFIX + "/backfill/{job_id}")
async def backfill_status_route(job_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    job = await olap.get_backfill_status(db, job_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")
    return job


@router.get(PREFIX + "/cache-stats")
async def cache_stats_route(request: Request):
    await _require_superadmin(request)
    import cube_cache
    return cube_cache.cache_stats()


# ─── Fase 1 · POST /backfill-atom — poblar el átomo dmx_units desde seed (BEFORE /{tier}) ──
@router.post(PREFIX + "/backfill-atom")
async def backfill_atom_route(request: Request):
    """Puebla el átomo milimétrico (dmx_units) desde el seed. Idempotente. Es la
    fuente de verdad del cubo (cube_olap lee el átomo primero). Se re-corre al
    llegar dato nuevo o tras cambios de schema."""
    await _require_superadmin(request)
    import dmx_cube_feed
    res = await dmx_cube_feed.backfill_atom(_db(request))
    log.info(f"[metrics-cube] backfill-atom: {res}")
    return {"ok": True, **res}


# ─── Fase 1.4 · POST /enrich-zone — fuentes externas → zona (dormant-safe, BEFORE /{tier}) ──
@router.post(PREFIX + "/enrich-zone")
async def enrich_zone_route(request: Request, zone_id: str = Query(...)):
    """Enriquece una zona con AirROI/GTFS/DENUE/catastro. Conectado pero dormido:
    valores estimados (is_stub) hasta configurar la key → luego autofill real."""
    await _require_superadmin(request)
    import dmx_external_enrich as enr
    res = await enr.enrich_zone(_db(request), zone_id)
    return {"ok": True, "external": res}


# ─── Fase 1.3 · POST /atom/from-text — extracción NLP → autollenar átomo (BEFORE /{tier}) ──
class AtomFromTextBody(BaseModel):
    development_id: str
    text: str


@router.post(PREFIX + "/atom/from-text")
async def atom_from_text_route(body: AtomFromTextBody, request: Request):
    """Extrae unidades de texto (brochure/lista de precios) y autollena el átomo
    (fill-only). Dormant-safe: sin LLM key → no rompe, marca dormant."""
    await _require_superadmin(request)
    import dmx_atom_autofill as af
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(body.development_id)
    return await af.extract_and_autofill(_db(request), body.development_id, body.text, dev)


# ─── Fase 2.1 · GET /amenity-ranker — hedónico sobre el átomo (BEFORE /{tier}) ──
@router.get(PREFIX + "/amenity-ranker")
async def amenity_ranker_route(request: Request, colonia: Optional[str] = Query(None)):
    """Regresión hedónica sobre el átomo: cuánto suma cada atributo (roof/bodega/2º
    cajón/terraza/balcón) al precio/m², controlando por colonia. Responde la pregunta
    estrella del founder. Opcional ?colonia= para acotar la zona."""
    await _require_superadmin(request)
    import dmx_hedonic_atom as hed
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await hed.fit_and_rank(_db(request), scope)


# ─── Fase 2.2 · demand-gap por zona×tipología + prob. de venta (BEFORE /{tier}) ──
@router.get(PREFIX + "/demand-gap")
async def demand_gap_route(request: Request, top: int = Query(25, ge=1, le=200)):
    """Cruza demanda de zona con oferta por (colonia × tipología). Rankea: dónde hay
    demanda y poco/cero inventario de una tipología = oportunidad de construcción."""
    await _require_superadmin(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)


@router.post(PREFIX + "/score-close-prob")
async def score_close_prob_route(request: Request, development_id: Optional[str] = Query(None)):
    """Calcula prob. de venta por unidad disponible y la escribe en el átomo
    (demand.prob_venta). Heurística v1 · se reemplaza por ML al llegar cierres."""
    await _require_superadmin(request)
    import dmx_demand
    return await dmx_demand.score_close_probabilities(_db(request), development_id)


# ─── 6) GET /:tier — list nodes ───────────────────────────────────────────────
@router.get(PREFIX + "/{tier}")
async def list_tier_route(
    tier: TierLit,
    request: Request,
    parent_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Literal["units_desc", "name_asc", "leads_desc", "price_desc"] = "units_desc",
    period: PeriodLit = "current",
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    # W2.8 Phase Z.1 — optional OLAP filters (backwards compatible)
    slice_by: Optional[SliceByLit] = None,
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id} para detalle de unidad")

    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    q: Dict[str, Any] = {"tier": tier, "period": period}
    if parent_id:
        q["parent_tier_id"] = parent_id
    if search:
        q["name"] = {"$regex": search, "$options": "i"}

    sort_spec: List[tuple] = []
    if sort == "units_desc":
        sort_spec = [("kpis.units_total", -1)]
    elif sort == "name_asc":
        sort_spec = [("name", 1)]
    elif sort == "leads_desc":
        sort_spec = [("kpis.leads_count", -1)]
    elif sort == "price_desc":
        sort_spec = [("kpis.avg_price_mxn", -1)]

    cur = db.cube_aggregations.find(q, {"_id": 0}).sort(sort_spec).skip(skip).limit(limit)
    items: List[Dict[str, Any]] = []
    async for r in cur:
        if tier == "city":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "alcaldia", "period": period},
            )
        elif tier == "alcaldia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "colonia", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "colonia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "development", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "development":
            r["children_count"] = int((r.get("kpis") or {}).get("units_total") or 0)
        items.append(r)

    total = await db.cube_aggregations.count_documents(q)

    # W2.8 — if slice_by/property_type/price_tier filters provided, attach OLAP breakdown
    olap_breakdown = None
    if slice_by or property_type or price_tier:
        try:
            for it in items:
                slice_res = await olap.query_slice(
                    db, tier=tier, tier_id=it.get("tier_id"), period=period,
                    slice_by=slice_by, property_type=property_type,
                    price_tier=price_tier,
                )
                it["olap"] = {
                    "kpis": slice_res.get("kpis"),
                    "breakdown": slice_res.get("breakdown"),
                    "cache": slice_res.get("cache"),
                }
            olap_breakdown = {"slice_by": slice_by, "property_type": property_type,
                              "price_tier": price_tier}
        except Exception as e:
            log.warning(f"[olap] list_tier slice failed: {e}")

    return {"items": items, "total": total, "tier": tier, "period": period,
            "parent_id": parent_id, "olap": olap_breakdown}


# ─── 7) GET /:tier/:tier_id/children — children with mini-KPIs ────────────────
@router.get(PREFIX + "/{tier}/{tier_id}/children")
async def children_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
):
    await _require_superadmin(request)
    db = _db(request)
    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    if not next_tier:
        return {"items": [], "next_tier": None}

    if next_tier == "unit":
        items: List[Dict[str, Any]] = []
        # Try seed first
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:500]:
                    items.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": u.get("unit_number") or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                        },
                    })
        except Exception:
            pass
        if not items:
            async for u in db.units.find({"development_id": tier_id}, {"_id": 0}).limit(500):
                items.append({
                    "tier": "unit",
                    "tier_id": u.get("id") or u.get("unit_id"),
                    "name": u.get("unit_number") or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                    },
                })
        return {"items": items, "next_tier": "unit", "total": len(items)}

    existing = await db.cube_aggregations.count_documents(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
    )
    if existing == 0:
        await cube.aggregate_tier(db, next_tier, period)
    cur = db.cube_aggregations.find(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
    ).sort([("kpis.units_total", -1)])
    items = [r async for r in cur]
    return {"items": items, "next_tier": next_tier, "total": len(items)}


# ─── 8) GET /:tier/:tier_id — detail node + KPIs + children ───────────────────
@router.get(PREFIX + "/{tier}/{tier_id}")
async def detail_tier_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
    # W2.8 Phase Z.1 — optional OLAP filters (backwards compatible)
    slice_by: Optional[SliceByLit] = None,
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id}")

    node = await _get_or_compute(db, tier, tier_id, period)
    if not node:
        raise HTTPException(404, "Nodo no encontrado")

    # W2.8 — attach OLAP slice if filters provided
    if slice_by or property_type or price_tier:
        try:
            slice_res = await olap.query_slice(
                db, tier=tier, tier_id=tier_id, period=period,
                slice_by=slice_by, property_type=property_type,
                price_tier=price_tier,
            )
            node["olap"] = {
                "kpis": slice_res.get("kpis"),
                "breakdown": slice_res.get("breakdown"),
                "source_units_count": slice_res.get("source_units_count"),
                "cache": slice_res.get("cache"),
            }
        except Exception as e:
            log.warning(f"[olap] detail slice failed: {e}")

    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    children: List[Dict[str, Any]] = []
    if next_tier and next_tier != "unit":
        existing = await db.cube_aggregations.count_documents(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
        )
        if existing == 0:
            await cube.aggregate_tier(db, next_tier, period)
        cur = db.cube_aggregations.find(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
        ).sort([("kpis.units_total", -1)]).limit(200)
        async for r in cur:
            children.append(r)
    elif next_tier == "unit":
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:200]:
                    children.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": u.get("unit_number") or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                        },
                    })
        except Exception:
            pass
        if not children:
            cur = db.units.find({"development_id": tier_id}, {"_id": 0}).limit(200)
            async for u in cur:
                children.append({
                    "tier": "unit", "tier_id": u.get("id") or u.get("unit_id"),
                    "name": u.get("unit_number") or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                    },
                })

    return {"node": node, "next_tier": next_tier, "children": children,
            "children_count": len(children)}


# ─── Cron registration helper ─────────────────────────────────────────────────
def schedule_metrics_cube_daily_aggregation(scheduler, db) -> None:
    """Register daily 2:15am MX cron with cron_heartbeat instrumentation."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cube.metrics_cube_daily_aggregation,
                                 "metrics_cube_daily_aggregation"),
            CronTrigger(hour=2, minute=15, timezone="America/Mexico_City"),
            args=[db], id="metrics_cube_daily_aggregation",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[cube] schedule daily cron failed: {e}")

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("metrics_cube", plan_tier="enterprise", monthly_price_mxn=499, category="monetization", name="Metrics Cube")
