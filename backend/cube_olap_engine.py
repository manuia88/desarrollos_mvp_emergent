"""W2.8 Phase Z.1 — Consolidated OLAP engine over `facts_daily_zone` + cube_aggregations.

Cross-cut multidimensional queries (zone × property_type × price_tier × period),
materialized views with TTL cache, async backfill historical.

Reuses W2.5 metrics_cube_aggregations + W2.7 facts_daily_zone — NO recompute,
only derivative slicing + caching.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import cube_cache

log = logging.getLogger("dmx.cube_olap_engine")

# Property type vocabulary (keep aligned with units.unit_type)
PROPERTY_TYPES = ("depto", "casa", "loft", "town", "ph")

# Price tiers (MXN boundaries)
PRICE_TIERS = (
    ("entry", 0, 3_000_000),
    ("mid", 3_000_000, 8_000_000),
    ("luxury", 8_000_000, 20_000_000),
    ("ultraluxury", 20_000_000, float("inf")),
)
PRICE_TIER_KEYS = tuple(t[0] for t in PRICE_TIERS)

SLICE_BY_OPTIONS = ("property_type", "price_tier", "year_built_decade")
MAX_DIMENSIONS = 3
MAX_COMPARE_ZONES = 5

# Single global mutex for backfill (only 1 active at a time)
_backfill_lock = asyncio.Lock()
_backfill_active_id: Optional[str] = None


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_" + secrets.token_urlsafe(10)


def _price_tier_for(price: Optional[float]) -> str:
    if price is None:
        return "unknown"
    for key, lo, hi in PRICE_TIERS:
        if lo <= price < hi:
            return key
    return "unknown"


def _decade_for(year: Optional[int]) -> str:
    if not year or year < 1900:
        return "unknown"
    return f"{(year // 10) * 10}s"


# ─── Unit-level filtering ─────────────────────────────────────────────────────

async def _list_units_for_zone(db, tier: str, tier_id: str) -> List[Dict[str, Any]]:
    """Returns merged seed + mongo units for a zone (any tier)."""
    units: List[Dict[str, Any]] = []
    # Seed source first
    try:
        from data_developments import DEVELOPMENTS_BY_ID, DEVELOPMENTS, ALL_UNITS
        if tier == "development":
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                units.extend(dev.get("units") or [])
        elif tier == "colonia":
            for d in DEVELOPMENTS:
                if (d.get("colonia_id") or "") == tier_id:
                    units.extend(d.get("units") or [])
        elif tier == "alcaldia":
            for d in DEVELOPMENTS:
                from metrics_cube_aggregations import _slug
                if _slug(d.get("alcaldia") or "") == tier_id:
                    units.extend(d.get("units") or [])
        elif tier == "city":
            units.extend(ALL_UNITS)
    except Exception as e:
        log.warning(f"[olap] seed units fetch failed: {e}")
    # Mongo bulk-ingested supplement
    try:
        if tier == "development":
            cur = db.units.find({"development_id": tier_id}, {"_id": 0})
            async for u in cur:
                units.append(u)
    except Exception:
        pass
    return units


def _unit_property_type(u: Dict[str, Any]) -> str:
    t = (u.get("unit_type") or u.get("type") or "").lower()
    if t in PROPERTY_TYPES:
        return t
    if "departamento" in t or "depto" in t:
        return "depto"
    if "casa" in t:
        return "casa"
    if "loft" in t:
        return "loft"
    if "town" in t or "townhouse" in t:
        return "town"
    if "penthouse" in t or t == "ph":
        return "ph"
    return "depto"  # conservative default


def _unit_price(u: Dict[str, Any]) -> Optional[float]:
    p = u.get("price") or u.get("price_mxn")
    try:
        return float(p) if p is not None else None
    except (TypeError, ValueError):
        return None


def _unit_year(u: Dict[str, Any]) -> Optional[int]:
    y = u.get("year_built") or u.get("anio_construccion")
    try:
        return int(y) if y else None
    except (TypeError, ValueError):
        return None


def _aggregate_units(units: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute KPI dict for a list of units."""
    n_total = len(units)
    n_sold = sum(1 for u in units if (u.get("status") or "").lower() in
                 ("vendido", "sold", "cerrado", "closed"))
    n_available = sum(1 for u in units if (u.get("status") or "").lower() in
                      ("disponible", "available"))
    n_reserved = sum(1 for u in units if (u.get("status") or "").lower() in
                     ("reservado", "reserved", "apartado"))
    prices = [_unit_price(u) for u in units]
    prices = [p for p in prices if p and p > 0]
    avg_price = round(sum(prices) / len(prices), 2) if prices else None
    m2_vals = [(u.get("m2_privative") or u.get("size_m2"), _unit_price(u)) for u in units]
    ppm2_vals = [(p / m2) for m2, p in m2_vals if m2 and p and m2 > 0]
    avg_ppm2 = round(sum(ppm2_vals) / len(ppm2_vals), 2) if ppm2_vals else None
    denom = n_sold + n_available + n_reserved
    conv = round((n_sold / denom) * 100, 2) if denom > 0 else None
    return {
        "units_total": n_total,
        "units_sold": n_sold,
        "units_available": n_available,
        "units_reserved": n_reserved,
        "avg_price_mxn": avg_price,
        "avg_price_per_m2": avg_ppm2,
        "conversion_rate": conv,
    }


# ─── Slice query ──────────────────────────────────────────────────────────────

async def query_slice(
    db, *, tier: str, tier_id: Optional[str] = None, period: str = "current",
    slice_by: Optional[str] = None,
    property_type: Optional[str] = None,
    price_tier: Optional[str] = None,
) -> Dict[str, Any]:
    """Returns kpis (filtered by property_type/price_tier) +
    optional breakdown by slice_by dimension.
    """
    cache_params = {
        "tier": tier, "tier_id": tier_id, "period": period,
        "slice_by": slice_by, "property_type": property_type,
        "price_tier": price_tier,
    }
    cached = cube_cache.cache_get("slice", cache_params)
    if cached is not None:
        return {**cached, "cache": "hit"}

    units: List[Dict[str, Any]] = []
    if tier_id:
        units = await _list_units_for_zone(db, tier, tier_id)
    else:
        # whole-tier roll-up via city units
        units = await _list_units_for_zone(db, "city", "cdmx")

    # Apply filters
    if property_type and property_type != "all":
        units = [u for u in units if _unit_property_type(u) == property_type]
    if price_tier and price_tier != "all":
        units = [u for u in units if _price_tier_for(_unit_price(u)) == price_tier]

    overall_kpis = _aggregate_units(units)

    breakdown: Dict[str, Any] = {}
    if slice_by == "property_type":
        for pt in PROPERTY_TYPES:
            sub = [u for u in units if _unit_property_type(u) == pt]
            if sub:
                breakdown[pt] = _aggregate_units(sub)
    elif slice_by == "price_tier":
        for key in PRICE_TIER_KEYS:
            sub = [u for u in units if _price_tier_for(_unit_price(u)) == key]
            if sub:
                breakdown[key] = _aggregate_units(sub)
    elif slice_by == "year_built_decade":
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for u in units:
            d = _decade_for(_unit_year(u))
            groups.setdefault(d, []).append(u)
        for d, sub in groups.items():
            breakdown[d] = _aggregate_units(sub)

    result = {
        "tier": tier, "tier_id": tier_id, "period": period,
        "slice_by": slice_by, "property_type": property_type,
        "price_tier": price_tier,
        "kpis": overall_kpis,
        "breakdown": breakdown if slice_by else None,
        "source_units_count": len(units),
        "computed_at": _iso(),
    }
    cube_cache.cache_set("slice", cache_params, result)
    return {**result, "cache": "miss"}


# ─── Cross-cut OLAP query ─────────────────────────────────────────────────────

async def query_cross_cut(
    db, *, dimensions: List[str], filters: Dict[str, Any],
    period: str = "current",
) -> Dict[str, Any]:
    """N-dim OLAP query. Max 3 dimensions. Returns flat matrix."""
    if not dimensions or len(dimensions) > MAX_DIMENSIONS:
        raise ValueError(f"dimensions debe tener 1-{MAX_DIMENSIONS} elementos")
    valid_dims = ("zone", "property_type", "price_tier", "period", "year_built_decade")
    for d in dimensions:
        if d not in valid_dims:
            raise ValueError(f"dimension inválida: {d} (válidas: {valid_dims})")

    cache_params = {"dimensions": dimensions, "filters": filters, "period": period}
    cached = cube_cache.cache_get("crosscut", cache_params)
    if cached is not None:
        return {**cached, "cache": "hit"}

    tier = filters.get("tier", "colonia")
    units = await _list_units_for_zone(db, "city", "cdmx")

    # Pre-filter by `filters`
    if filters.get("property_type") and filters["property_type"] != "all":
        units = [u for u in units if _unit_property_type(u) == filters["property_type"]]
    if filters.get("price_tier") and filters["price_tier"] != "all":
        units = [u for u in units if _price_tier_for(_unit_price(u)) == filters["price_tier"]]

    # Build matrix
    matrix: List[Dict[str, Any]] = []

    def _key_of_unit(u: Dict[str, Any]) -> Tuple[str, ...]:
        parts = []
        for d in dimensions:
            if d == "zone":
                parts.append(u.get("colonia_id") or u.get("zone_id") or "unknown")
            elif d == "property_type":
                parts.append(_unit_property_type(u))
            elif d == "price_tier":
                parts.append(_price_tier_for(_unit_price(u)))
            elif d == "period":
                parts.append(period)
            elif d == "year_built_decade":
                parts.append(_decade_for(_unit_year(u)))
        return tuple(parts)

    groups: Dict[Tuple[str, ...], List[Dict[str, Any]]] = {}
    for u in units:
        k = _key_of_unit(u)
        groups.setdefault(k, []).append(u)

    for k, sub in groups.items():
        cell: Dict[str, Any] = {dimensions[i]: k[i] for i in range(len(dimensions))}
        cell["kpis"] = _aggregate_units(sub)
        matrix.append(cell)

    matrix.sort(key=lambda c: c["kpis"].get("units_total") or 0, reverse=True)

    result = {
        "dimensions": dimensions, "filters": filters, "period": period,
        "tier": tier, "matrix": matrix, "matrix_size": len(matrix),
        "source_units_count": len(units),
        "computed_at": _iso(),
    }
    cube_cache.cache_set("crosscut", cache_params, result)
    return {**result, "cache": "miss"}


# ─── Compare zones ────────────────────────────────────────────────────────────

async def query_compare_zones(
    db, zone_ids: List[str], period: str = "current",
) -> Dict[str, Any]:
    if not zone_ids or len(zone_ids) > MAX_COMPARE_ZONES:
        raise ValueError(f"zone_ids debe tener 1-{MAX_COMPARE_ZONES} elementos")

    cache_params = {"zone_ids": sorted(zone_ids), "period": period}
    cached = cube_cache.cache_get("compare", cache_params)
    if cached is not None:
        return {**cached, "cache": "hit"}

    zones_out: List[Dict[str, Any]] = []
    for zid in zone_ids:
        # Determine zone tier from dim_zones
        zone_doc = await db.dim_zones.find_one({"zone_id": zid}, {"_id": 0})
        tier = (zone_doc or {}).get("tier") or "colonia"
        zone_name = (zone_doc or {}).get("name") or zid
        # KPIs from cube_aggregations (W2.5)
        cube_row = await db.cube_aggregations.find_one(
            {"tier": tier, "tier_id": zid, "period": period}, {"_id": 0},
        )
        kpis = (cube_row or {}).get("kpis") or {}
        # Fall back to live aggregation if no cube row
        if not kpis:
            slice_res = await query_slice(db, tier=tier, tier_id=zid, period=period)
            kpis = slice_res.get("kpis") or {}
        zones_out.append({
            "zone_id": zid, "name": zone_name, "tier": tier, "kpis": kpis,
        })

    # diff_pct: max-min per kpi
    KPI_KEYS = ("units_total", "units_sold", "avg_price_mxn", "avg_price_per_m2",
                "conversion_rate", "leads_count")
    diff_pct: Dict[str, Optional[float]] = {}
    for k in KPI_KEYS:
        vals = [z["kpis"].get(k) for z in zones_out if z["kpis"].get(k) is not None]
        if len(vals) >= 2:
            mn, mx = min(vals), max(vals)
            if mn and mn > 0:
                diff_pct[k] = round((mx - mn) / mn * 100, 2)
            else:
                diff_pct[k] = None
        else:
            diff_pct[k] = None

    result = {
        "zones": zones_out, "diff_pct": diff_pct, "period": period,
        "computed_at": _iso(),
    }
    cube_cache.cache_set("compare", cache_params, result)
    return {**result, "cache": "miss"}


# ─── Backfill historical ──────────────────────────────────────────────────────

async def _do_backfill(
    db, job_id: str, from_date: datetime, to_date: datetime,
    zone_ids: Optional[List[str]] = None,
) -> None:
    """Background task: generate facts_daily_zone snapshots for past dates."""
    global _backfill_active_id
    started = datetime.now(timezone.utc)
    errors: List[str] = []
    days_done = 0
    zones_processed = 0
    try:
        from data_lake_etl import run_daily_etl
        cur_date = from_date
        # Cap at 90 days to avoid runaway
        max_days = 90
        days = []
        while cur_date <= to_date and len(days) < max_days:
            days.append(cur_date)
            cur_date += timedelta(days=1)

        for d in days:
            try:
                result = await run_daily_etl(db, target_date=d, run_type="backfill",
                                              triggered_by=job_id)
                zones_processed += result.get("zones_processed", 0)
                days_done += 1
                # Update progress periodically
                if days_done % 5 == 0:
                    await db.cube_backfill_jobs.update_one(
                        {"id": job_id},
                        {"$set": {"days_done": days_done,
                                  "zones_processed": zones_processed,
                                  "last_progress_at": _iso()}},
                    )
            except Exception as e:
                errors.append(f"{d.isoformat()}: {str(e)[:80]}")

        status = "ok" if not errors else ("partial" if len(errors) <= 5 else "failed")
        await db.cube_backfill_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "completed_at": _iso(),
                "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 2),
                "days_done": days_done,
                "zones_processed": zones_processed,
                "status": status,
                "errors": errors[:20],
                "errors_total": len(errors),
            }},
        )
        cube_cache.cache_invalidate_zones([])  # blow whole cache
    finally:
        _backfill_active_id = None


async def backfill_historical(
    db, *, from_date: datetime, to_date: datetime,
    zone_ids: Optional[List[str]] = None,
    triggered_by: str = "manual",
) -> Dict[str, Any]:
    """Start async backfill. Throttle: 1 active at a time. Returns job_id."""
    global _backfill_active_id
    if _backfill_active_id is not None:
        return {"ok": False, "error": "backfill_already_running",
                "active_job_id": _backfill_active_id, "status": 409}

    if from_date > to_date:
        raise ValueError("from_date debe ser anterior a to_date")
    if (to_date - from_date).days > 90:
        raise ValueError("rango máximo 90 días")

    job_id = _new_id("bf")
    _backfill_active_id = job_id
    doc = {
        "id": job_id,
        "started_at": _iso(),
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "zone_ids": zone_ids,
        "status": "running",
        "days_done": 0,
        "zones_processed": 0,
        "errors": [],
        "triggered_by": triggered_by,
    }
    await db.cube_backfill_jobs.insert_one(dict(doc))
    asyncio.create_task(_do_backfill(db, job_id, from_date, to_date, zone_ids))
    return {"ok": True, "job_id": job_id, "status": "running"}


async def get_backfill_status(db, job_id: str) -> Optional[Dict[str, Any]]:
    return await db.cube_backfill_jobs.find_one({"id": job_id}, {"_id": 0})


# ─── Materialized views refresh (cron) ────────────────────────────────────────

async def refresh_top_materialized_views(db) -> Dict[str, Any]:
    """Refresh top 100 hot slices into cube_materialized_views collection.
    Triggered post-W2.7 ETL daily at 03:30 MX.
    """
    started = datetime.now(timezone.utc)
    refreshed = 0
    errors: List[str] = []

    # Top slices: each tier × each period × no slice
    slices_to_refresh = []
    for tier in ("city", "alcaldia", "colonia", "development"):
        for period in ("current", "7d", "30d", "90d"):
            slices_to_refresh.append((tier, period, None))
            # Plus property_type and price_tier breakdowns at colonia level
            if tier == "colonia":
                slices_to_refresh.append((tier, period, "property_type"))
                slices_to_refresh.append((tier, period, "price_tier"))

    for tier, period, slice_by in slices_to_refresh[:100]:
        try:
            res = await query_slice(db, tier=tier, period=period, slice_by=slice_by)
            slice_key = f"{tier}:{period}:{slice_by or 'none'}"
            ttl_until = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
            await db.cube_materialized_views.update_one(
                {"slice_key": slice_key},
                {"$set": {
                    "slice_key": slice_key,
                    "slice_type": "single",
                    "tier": tier, "period": period, "slice_by": slice_by,
                    "values": res.get("kpis"),
                    "breakdown": res.get("breakdown"),
                    "source_facts_count": res.get("source_units_count", 0),
                    "computed_at": _iso(),
                    "ttl_until": ttl_until,
                }},
                upsert=True,
            )
            refreshed += 1
        except Exception as e:
            errors.append(f"{tier}:{period}:{slice_by}: {str(e)[:80]}")

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    summary = {
        "ok": True, "refreshed": refreshed, "errors": errors[:10],
        "errors_total": len(errors), "elapsed_s": round(elapsed, 2),
        "completed_at": _iso(),
    }
    log.info(f"[olap] materialized views refresh — {summary}")
    return summary


def schedule_materialized_views_cron(scheduler, db) -> None:
    """Cron `cube_materialized_views_refresh` 03:30 MX (after W2.7 ETL 03:00)."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(refresh_top_materialized_views,
                                  "cube_materialized_views_refresh"),
            CronTrigger(hour=3, minute=30, timezone="America/Mexico_City"),
            args=[db], id="cube_materialized_views_refresh",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[olap] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_consolidated_indexes(db) -> None:
    try:
        await db.cube_materialized_views.create_index(
            "slice_key", unique=True, name="cube_mv_slice_uniq",
        )
        await db.cube_materialized_views.create_index(
            "ttl_until", name="cube_mv_ttl",
        )
    except Exception as e:
        log.warning(f"[olap] cube_materialized_views indexes failed: {e}")
    try:
        await db.cube_backfill_jobs.create_index(
            [("started_at", -1)], name="bf_started_desc",
        )
        await db.cube_backfill_jobs.create_index(
            "id", unique=True, name="bf_id_uniq",
        )
    except Exception as e:
        log.warning(f"[olap] cube_backfill_jobs indexes failed: {e}")
