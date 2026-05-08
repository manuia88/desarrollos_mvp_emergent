"""W3.3 ZZ.3 — DRPI (DMX Residential Price Index) Engine.

Wraps hedonic_regression_engine to compute monthly snapshots per zone × tier,
anchored to base period 100. Builds national DRPI as weighted average across
all CDMX alcaldías present.

Schema db.drpi_snapshots:
  { id, zone_id, tier, period:"YYYY-MM", index_value, delta_pct,
    hedonic_model_id, r_squared, sample_size, available:bool,
    reason?, computed_at, computed_at_dt, formula_version }
  unique (zone_id, tier, period) · index (zone_id desc)

Note: index_value uses the median predicted price/m² as the level proxy.
First snapshot per (zone_id, tier) is anchored to 100; subsequent snapshots
are scaled relative to the *first* snapshot's median price/m² so that
delta_pct between consecutive periods is computed cleanly.
"""
from __future__ import annotations

import logging
import math
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import hedonic_regression_engine as hedonic

log = logging.getLogger("dmx.drpi_engine")

FORMULA_VERSION = "1.0.0"
BASE_INDEX = 100.0
TOP_ZONES = ["polanco", "roma", "lomas", "condesa", "del_valle", "coyoacan"]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _period_now() -> str:
    n = _now()
    return f"{n.year}-{n.month:02d}"


def _period_prev(period: str) -> str:
    """YYYY-MM minus 1 month."""
    try:
        y, m = period.split("-")
        y_i, m_i = int(y), int(m)
        if m_i == 1:
            return f"{y_i - 1}-12"
        return f"{y_i}-{(m_i - 1):02d}"
    except Exception:
        return period


# ─── Compute DRPI snapshot ─────────────────────────────────────────────────────

async def _zone_median_price_per_m2(db, zone_id: str, tier: str, period_days: int) -> Optional[float]:
    """Median observed close price/m² over period_days (used as level proxy)."""
    cutoff = (_now() - timedelta(days=period_days)).isoformat()
    docs = await db.transactions.find(
        {"zone_id": zone_id, "tier": tier, "closed_at": {"$gte": cutoff}},
        {"_id": 0, "closing_price_mxn": 1, "m2": 1},
    ).to_list(2000)
    pm2 = [d["closing_price_mxn"] / d["m2"] for d in docs
           if d.get("closing_price_mxn") and d.get("m2") and d["m2"] > 0]
    if not pm2:
        return None
    pm2.sort()
    n = len(pm2)
    return pm2[n // 2] if n % 2 == 1 else (pm2[n // 2 - 1] + pm2[n // 2]) / 2


async def compute_drpi_snapshot(
    db, zone_id: str, tier: str = "colonia", period: str = "",
    period_days: int = 30,
) -> Dict[str, Any]:
    """Compute DRPI snapshot for zone × tier × period. Stores hedonic model fit
    metadata so consumers can inspect coefficients."""
    period = period or _period_now()
    now = _now()

    # 1. Train hedonic model (180d window) — provides r² + sample size signal
    hed = await hedonic.fit_hedonic_model(db, zone_id, tier, period_days=180)
    sample_size = hed.get("sample_size") or 0

    if sample_size < hedonic.MIN_SAMPLE_SIZE:
        doc = {
            "id": f"drpi_{secrets.token_urlsafe(8)}",
            "zone_id": zone_id, "tier": tier or "colonia",
            "period": period, "available": False,
            "reason": "insufficient_data",
            "sample_size": sample_size,
            "computed_at": now.isoformat(), "computed_at_dt": now,
            "formula_version": FORMULA_VERSION,
        }
        try:
            await db.drpi_snapshots.update_one(
                {"zone_id": zone_id, "tier": doc["tier"], "period": period},
                {"$set": doc}, upsert=True,
            )
        except Exception as e:
            log.warning(f"[drpi] upsert insufficient {zone_id}: {e}")
        out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
        return out

    # 2. Median price/m² over the period (level proxy)
    median_pm2 = await _zone_median_price_per_m2(db, zone_id, tier, period_days)
    if median_pm2 is None or median_pm2 <= 0:
        median_pm2 = 1.0

    # 3. Anchor: find oldest snapshot for this zone+tier (base = 100 reference)
    base_snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "tier": tier or "colonia", "available": True},
        {"_id": 0, "median_price_per_m2": 1, "index_value": 1, "period": 1},
        sort=[("computed_at_dt", 1)],
    )
    if base_snap and base_snap.get("median_price_per_m2"):
        base_pm2 = base_snap["median_price_per_m2"]
        index_value = round((median_pm2 / base_pm2) * BASE_INDEX, 2)
    else:
        index_value = BASE_INDEX

    # 4. Delta vs previous snapshot
    prev_period = _period_prev(period)
    prev_snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "tier": tier or "colonia",
         "period": prev_period, "available": True},
        {"_id": 0, "index_value": 1},
    )
    delta_pct = None
    if prev_snap and prev_snap.get("index_value"):
        delta_pct = round((index_value - prev_snap["index_value"]) / prev_snap["index_value"] * 100, 2)

    doc = {
        "id": f"drpi_{secrets.token_urlsafe(8)}",
        "zone_id": zone_id, "tier": tier or "colonia",
        "period": period,
        "index_value": index_value,
        "delta_pct": delta_pct,
        "median_price_per_m2": round(median_pm2, 2),
        "hedonic_model_id": hed.get("id"),
        "r_squared": hed.get("r_squared"),
        "adj_r_squared": hed.get("adj_r_squared"),
        "rmse": hed.get("rmse"),
        "sample_size": sample_size,
        "available": True,
        "computed_at": now.isoformat(),
        "computed_at_dt": now,
        "formula_version": FORMULA_VERSION,
    }
    try:
        await db.drpi_snapshots.update_one(
            {"zone_id": zone_id, "tier": doc["tier"], "period": period},
            {"$set": doc}, upsert=True,
        )
    except Exception as e:
        log.warning(f"[drpi] upsert {zone_id}: {e}")

    out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
    return out


# ─── National DRPI ─────────────────────────────────────────────────────────────

async def compute_drpi_national(db, period: str = "") -> Dict[str, Any]:
    """Weighted average DRPI across all alcaldías present in latest snapshots."""
    period = period or _period_now()
    cursor = db.drpi_snapshots.find(
        {"period": period, "available": True},
        {"_id": 0, "zone_id": 1, "tier": 1, "index_value": 1,
         "sample_size": 1, "delta_pct": 1},
    )
    snaps = [s async for s in cursor]
    if not snaps:
        return {"available": False, "reason": "no_snapshots", "period": period}

    total_w = sum(s.get("sample_size") or 0 for s in snaps) or len(snaps)
    weighted_index = sum((s.get("index_value") or BASE_INDEX) * (s.get("sample_size") or 1)
                         for s in snaps) / total_w
    deltas = [s["delta_pct"] for s in snaps if s.get("delta_pct") is not None]
    weighted_delta = round(sum(deltas) / len(deltas), 2) if deltas else None

    return {
        "available": True,
        "period": period,
        "national_index": round(weighted_index, 2),
        "national_delta_pct": weighted_delta,
        "zones_count": len(snaps),
        "total_sample_size": int(total_w),
        "computed_at": _iso(),
    }


# ─── DRPI history ──────────────────────────────────────────────────────────────

async def compute_drpi_history(
    db, zone_id: str, tier: str = "colonia", periods: int = 12,
) -> List[Dict[str, Any]]:
    """Return last N period snapshots for time-series chart."""
    cursor = db.drpi_snapshots.find(
        {"zone_id": zone_id, "tier": tier or "colonia"},
        {"_id": 0, "computed_at_dt": 0},
    ).sort("period", -1).limit(periods)
    items = [doc async for doc in cursor]
    items.reverse()
    return items


# ─── Cron runner ──────────────────────────────────────────────────────────────

async def cron_drpi_monthly_snapshot(db) -> Dict[str, Any]:
    """Refit + snapshot DRPI for all zones with sufficient data."""
    period = _period_now()

    # Source zones from cube + transactions
    cursor = db.cube_aggregations.find(
        {"period": "current"}, {"_id": 0, "tier_id": 1, "tier": 1},
    ).limit(500)
    zones = [{"zone_id": r["tier_id"], "tier": r.get("tier", "colonia")}
             async for r in cursor]
    seen = {(z["zone_id"], z["tier"]) for z in zones}

    txn_zones = await db.transactions.aggregate([
        {"$group": {"_id": {"zone_id": "$zone_id", "tier": "$tier"}}},
    ]).to_list(500)
    for z in txn_zones:
        zid = (z["_id"] or {}).get("zone_id")
        tier = (z["_id"] or {}).get("tier") or "colonia"
        if zid and (zid, tier) not in seen:
            zones.append({"zone_id": zid, "tier": tier})
            seen.add((zid, tier))

    refreshed = 0
    insufficient = 0
    failed = 0
    for z in zones:
        try:
            res = await compute_drpi_snapshot(db, z["zone_id"], z["tier"], period)
            if res.get("available"):
                refreshed += 1
            else:
                insufficient += 1
        except Exception as e:
            log.warning(f"[drpi cron] zone failed {z['zone_id']}: {e}")
            failed += 1

    # System alert if data coverage < 30%
    pct_avail = refreshed / max(len(zones), 1) * 100
    if pct_avail < 30 and len(zones) > 0:
        try:
            await db.system_alerts.insert_one({
                "ts": _now(),
                "severity": "critical",
                "source": "drpi_monthly_snapshot",
                "message": f"DRPI cobertura {pct_avail:.1f}% (<30%) en período {period}",
                "details": {"refreshed": refreshed, "insufficient": insufficient,
                            "failed": failed, "zones_total": len(zones)},
                "resolved_at": None,
            })
        except Exception:
            pass

    # Compute national rollup (sets snapshot for "_national_")
    try:
        nat = await compute_drpi_national(db, period)
        if nat.get("available"):
            await db.drpi_snapshots.update_one(
                {"zone_id": "_national_", "tier": "national", "period": period},
                {"$set": {
                    "id": f"drpi_nat_{period}",
                    "zone_id": "_national_", "tier": "national",
                    "period": period,
                    "index_value": nat["national_index"],
                    "delta_pct": nat["national_delta_pct"],
                    "available": True,
                    "computed_at": _iso(), "computed_at_dt": _now(),
                    "formula_version": FORMULA_VERSION,
                }}, upsert=True,
            )
    except Exception as e:
        log.warning(f"[drpi cron] national rollup failed: {e}")

    return {
        "ok": True, "period": period,
        "zones_total": len(zones),
        "refreshed": refreshed,
        "insufficient": insufficient,
        "failed": failed,
        "completed_at": _iso(),
    }


def schedule_drpi_monthly_cron(scheduler, db) -> None:
    """Register cron `drpi_monthly_snapshot` 1ro mes 06:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_drpi_monthly_snapshot, "drpi_monthly_snapshot"),
            CronTrigger(day=1, hour=6, minute=0, timezone="America/Mexico_City"),
            args=[db], id="drpi_monthly_snapshot",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[drpi] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.drpi_snapshots.create_index(
            [("zone_id", 1), ("tier", 1), ("period", -1)],
            unique=True, name="drpi_zone_tier_period_unique",
        )
        await db.drpi_snapshots.create_index(
            [("period", -1)], name="drpi_period",
        )
    except Exception as e:
        log.warning(f"[drpi] ensure_indexes failed: {e}")
