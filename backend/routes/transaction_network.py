"""W3.2 ZZ.2 Transaction Network — Routes.

Prefix: /api/superadmin/transactions
Guard: require_superadmin for all endpoints.

Endpoints:
  1. GET  /                         — list paginado (anonymized only)
  2. GET  /comparables               — comparables matrix N×N with similarity
  3. GET  /price-index/{zone_id}     — current index + 12-period history
  4. GET  /price-index/heatmap       — geojson for Mapbox layer
  5. POST /detect-anomaly            — price anomaly check (W3.4 foundation)
  6. POST /manual-ingest             — CSV bulk upload (superadmin only)
  7. GET  /stats                     — cross-org KPIs
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

import transaction_network_engine as txn_engine

log = logging.getLogger("dmx.routes_transaction_network")

router = APIRouter(tags=["transaction_network"])
PREFIX = "/api/superadmin/transactions"


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ══════════════════════════════════════════════════════════════════════════════
# 1. LIST — anonymized
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PREFIX)
async def list_transactions(
    request: Request,
    zone_id: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    type: Optional[str] = Query(None, alias="type"),
    from_ts: Optional[str] = Query(None),
    to_ts: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _sa(request)
    db = _db(request)

    # k-anonymity gate: if zone has <5 transactions, block
    if zone_id:
        zone_count = await db.transactions.count_documents({"zone_id": zone_id})
        if zone_count < txn_engine.K_ANON_MIN:
            return {
                "available": False,
                "reason": "k-anonymity gate",
                "zone_id": zone_id,
                "current_count": zone_count,
                "required_min": txn_engine.K_ANON_MIN,
            }

    q: dict = {}
    if zone_id:
        q["zone_id"] = zone_id
    if tier:
        q["tier"] = tier
    if type:
        q["property_type"] = type
    if from_ts or to_ts:
        q["closed_at"] = {}
        if from_ts:
            q["closed_at"]["$gte"] = from_ts
        if to_ts:
            q["closed_at"]["$lte"] = to_ts

    # Projection — NEVER expose buyer_id, address or any raw PII
    project = {"_id": 0, "anonymized_id": 1, "property_id_hash": 1,
               "zone_id": 1, "tier": 1, "property_type": 1,
               "m2": 1, "recamaras": 1, "baños": 1, "year_built": 1,
               "floor": 1, "listed_price_mxn": 1, "closing_price_mxn": 1,
               "discount_pct": 1, "days_on_market": 1, "source": 1,
               "confidence_score": 1, "closed_at": 1, "anonymized": 1}

    total = await db.transactions.count_documents(q)
    items = await db.transactions.find(q, project).sort("closed_at", -1).skip(skip).limit(limit).to_list(limit)

    return {
        "items": items,
        "count": len(items),
        "count_total": total,
        "skip": skip,
        "limit": limit,
        "available": True,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. COMPARABLES MATRIX
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PREFIX + "/comparables")
async def comparables_matrix(
    request: Request,
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    zone_id: Optional[str] = Query(None),
    m2: Optional[float] = Query(None),
    type: Optional[str] = Query("depto", alias="type"),
    radius_km: float = Query(2.0, ge=0.5, le=10.0),
    limit: int = Query(20, ge=1, le=50),
):
    await _sa(request)
    db = _db(request)

    target: dict = {
        "property_type": type or "depto",
        "m2": m2 or 80,
        "zone_id": zone_id or "",
    }
    if lat is not None and lng is not None:
        target["geo"] = {"type": "Point", "coordinates": [lng, lat]}

    comps = await txn_engine.compute_comparables(db, target, radius_km=radius_km, limit=limit)

    # Strip any residual PII from output
    safe_comps = []
    for c in comps:
        safe_comps.append({
            k: c[k] for k in (
                "anonymized_id", "zone_id", "tier", "property_type",
                "m2", "recamaras", "year_built", "closing_price_mxn",
                "discount_pct", "days_on_market", "source",
                "confidence_score", "closed_at", "similarity_score", "dist_m",
            ) if k in c
        })

    return {
        "comparables": safe_comps,
        "count": len(safe_comps),
        "target": {k: target[k] for k in ("property_type", "m2", "zone_id") if k in target},
        "radius_km": radius_km,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3. PRICE INDEX per zone
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PREFIX + "/price-index/{zone_id}")
async def price_index_zone(
    zone_id: str, request: Request,
    tier: str = Query("colonia"),
    type: str = Query("depto", alias="type"),
    period: str = Query("month"),
):
    await _sa(request)
    db = _db(request)
    current = await txn_engine.compute_price_index(db, zone_id, tier, type, period)
    history = await txn_engine.get_price_index_history(db, zone_id, tier, type, period, n_periods=12)
    return {
        "current": current,
        "history": history,
        "zone_id": zone_id,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. HEATMAP geojson
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PREFIX + "/price-index/heatmap")
async def price_index_heatmap(
    request: Request,
    metric: str = Query("median_price_per_m2"),
    tier: str = Query("colonia"),
    type: str = Query("depto", alias="type"),
    period: str = Query("month"),
    limit: int = Query(100, ge=1, le=300),
):
    await _sa(request)
    db = _db(request)

    # Latest snapshot per zone
    pipeline = [
        {"$match": {"tier": tier, "property_type": type, "period": period}},
        {"$sort": {"computed_at": -1}},
        {"$group": {"_id": "$zone_id", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$limit": limit},
        {"$project": {"_id": 0}},
    ]
    snaps = [s async for s in db.price_index_snapshots.aggregate(pipeline)]

    # Resolve zone geo from cube
    features = []
    for s in snaps:
        cube = await db.cube_aggregations.find_one(
            {"tier_id": s["zone_id"], "period": "current"},
            {"_id": 0, "geo": 1, "name": 1},
        )
        geo = (cube or {}).get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "zone_id": s["zone_id"],
                "name": (cube or {}).get("name", s["zone_id"]),
                "value": s.get(metric),
                "transactions_count": s.get("transactions_count"),
                "computed_at": s.get("computed_at"),
            },
        })

    return {"type": "FeatureCollection", "features": features}


# ══════════════════════════════════════════════════════════════════════════════
# 5. DETECT ANOMALY
# ══════════════════════════════════════════════════════════════════════════════

class AnomalyBody(BaseModel):
    zone_id: Optional[str] = None
    property_type: str = "depto"
    m2: Optional[float] = None
    listing_price_mxn: Optional[float] = None
    closing_price_mxn: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    recamaras: Optional[int] = None
    year_built: Optional[int] = None


@router.post(PREFIX + "/detect-anomaly")
async def detect_anomaly(body: AnomalyBody, request: Request):
    await _sa(request)
    db = _db(request)
    listing = body.model_dump(exclude_none=True)
    if listing.get("lat") and listing.get("lng"):
        listing["geo"] = {"type": "Point", "coordinates": [listing["lng"], listing["lat"]]}
    return await txn_engine.detect_price_anomaly(db, listing)


# ══════════════════════════════════════════════════════════════════════════════
# 6. MANUAL INGEST CSV
# ══════════════════════════════════════════════════════════════════════════════

@router.post(PREFIX + "/manual-ingest")
async def manual_ingest_csv(
    request: Request,
    file: UploadFile = File(...),
    source: str = Query("bulk_ingest"),
):
    user = await _sa(request)
    db = _db(request)

    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Solo se aceptan archivos .csv")
    if source not in txn_engine.VALID_SOURCES:
        source = "bulk_ingest"

    content = await file.read()
    import upload_guard
    upload_guard.check_size(content, max_mb=20)  # P2.13 · faltaba tope de tamaño
    result = await txn_engine.bulk_ingest_csv(db, content, source)

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "transaction_bulk_ingest", "csv",
            before=None,
            after={"inserted": result["inserted"], "errors": len(result["errors"])},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (create transaction_bulk_ingest csv): %s", _e)

    return result


# ══════════════════════════════════════════════════════════════════════════════
# 7. STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PREFIX + "/stats")
async def transaction_stats(request: Request):
    await _sa(request)
    db = _db(request)
    return await txn_engine.compute_stats(db)

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("transactions_network", plan_tier="enterprise", monthly_price_mxn=499, category="intelligence", name="Transactions Network")
