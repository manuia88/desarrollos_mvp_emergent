"""W3.1A Phase 5 Foundation — Construction Cost Predictor Engine.

Data sources:
  1. BANXICO SIE API (IE_BANXICO_TOKEN): series SF61745 (INPC construcción),
     SF111290 (Costos de Edificación Habitacional)
  2. INEGI INPP construcción indicator 914339 (IE_INEGI_TOKEN)

Fallback: if tokens missing → honest stub with visible stub_reason (no crash).

Collection db.construction_costs:
  { zone_id, building_type:'vertical|horizontal', tier:'entry|mid|luxury',
    cost_per_m2_mxn, confidence_pct, computed_at,
    sources:{banxico_inpp, inegi_inpc}, stub_reason? }
  index (zone_id, building_type, tier)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.construction_cost_engine")

BANXICO_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1"
INEGI_BASE = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR"
BANXICO_SERIES_INCC = "SF61745"     # INPC Construcción
BANXICO_SERIES_EDIF = "SF111290"    # Costos Edificación Habitacional
INEGI_INPP_CONST = "914339"         # INPP Construcción

# ─── Base cost constants (MXN/m², CDMX 2025 reference) ────────────────────────
BASE_COSTS: Dict[str, Dict[str, float]] = {
    "vertical": {
        "entry":   10_500.0,
        "mid":     15_800.0,
        "luxury":  26_000.0,
    },
    "horizontal": {
        "entry":   8_000.0,
        "mid":     12_500.0,
        "luxury":  18_500.0,
    },
}
# Zone premium multipliers by rough tier pattern
ZONE_PREMIUM: Dict[str, float] = {
    "polanco":       1.35,
    "santa_fe":      1.28,
    "lomas":         1.30,
    "condesa":       1.18,
    "roma":          1.12,
    "napoles":       1.05,
    "doctores":      0.92,
    "iztapalapa":    0.88,
    "ecatepec":      0.82,
}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _banxico_token() -> Optional[str]:
    return os.environ.get("IE_BANXICO_TOKEN")


def _inegi_token() -> Optional[str]:
    return os.environ.get("IE_INEGI_TOKEN")


# ─── BANXICO SIE fetch ─────────────────────────────────────────────────────────

async def _fetch_banxico_series(series_id: str) -> Optional[float]:
    """Fetch most recent value for a BANXICO SIE series. Returns float or None."""
    token = _banxico_token()
    if not token:
        return None
    url = f"{BANXICO_BASE}/series/{series_id}/datos/oportuno"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url, headers={"Bmx-Token": token, "Accept": "application/json"})
        if r.status_code != 200:
            log.warning(f"[cost] BANXICO {series_id} HTTP {r.status_code}")
            return None
        data = r.json()
        series_list = data.get("bmx", {}).get("series", [])
        for s in series_list:
            datos = s.get("datos") or []
            if datos:
                latest = datos[-1]
                val_str = latest.get("dato", "")
                if val_str and val_str != "N/E":
                    try:
                        return float(val_str)
                    except Exception:
                        pass
        return None
    except Exception as e:
        log.warning(f"[cost] BANXICO fetch error: {e}")
        return None


async def _fetch_inegi_inpp() -> Optional[float]:
    """Fetch INEGI INPP construcción latest value."""
    token = _inegi_token()
    if not token:
        return None
    url = f"{INEGI_BASE}/{INEGI_INPP_CONST}/es/00/false/BISE/2.0/{token}?type=json"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        data = r.json()
        series = (data.get("Series") or [])
        if not series:
            return None
        obs = (series[0].get("OBSERVATIONS") or [])
        if obs:
            last = obs[-1]
            val_str = last.get("OBS_VALUE") or last.get("obs_value") or ""
            if val_str:
                try:
                    return float(val_str)
                except Exception:
                    pass
        return None
    except Exception as e:
        log.warning(f"[cost] INEGI INPP fetch error: {e}")
        return None


# ─── Cost prediction ──────────────────────────────────────────────────────────

async def predict_cost_per_m2(
    zone_id: str, building_type: str = "vertical", tier: str = "mid",
) -> Dict[str, Any]:
    """Predict cost per m² for zone + building type + tier.
    Combines base constants with BANXICO INPP + INEGI INPC inflation adjustments.
    Returns dict with cost_per_m2_mxn, confidence_pct, stub_reason (if stub).
    """
    btype = building_type if building_type in ("vertical", "horizontal") else "vertical"
    btier = tier if tier in ("entry", "mid", "luxury") else "mid"

    base = BASE_COSTS[btype][btier]
    zone_premium = 1.0
    z_lower = zone_id.lower().replace("-", "_")
    for key, mult in ZONE_PREMIUM.items():
        if key in z_lower:
            zone_premium = mult
            break

    sources: Dict[str, Any] = {}
    stub_reason: Optional[str] = None
    inflation_multiplier = 1.0
    confidence = 70

    # Attempt BANXICO INCC
    incc_val = await _fetch_banxico_series(BANXICO_SERIES_INCC)
    edif_val = await _fetch_banxico_series(BANXICO_SERIES_EDIF)
    if incc_val is not None:
        sources["banxico_incc"] = round(incc_val, 2)
        # incc_val is annual % inflation rate (e.g. 6.5 = 6.5% per year)
        inflation_multiplier = 1.0 + max(incc_val / 100.0, 0.0)
        confidence = min(90, confidence + 10)
    else:
        stub_reason = (stub_reason or "") + "IE_BANXICO_TOKEN ausente o error; "

    # Attempt INEGI INPP
    inpp_val = await _fetch_inegi_inpp()
    if inpp_val is not None:
        sources["inegi_inpp"] = round(inpp_val, 2)
        # Average with BANXICO if both available
        inpp_mult = 1.0 + max(inpp_val / 100.0, 0.0)
        if incc_val is not None:
            inflation_multiplier = (inflation_multiplier + inpp_mult) / 2
        else:
            inflation_multiplier = inpp_mult
        confidence = min(92, confidence + 8)
    else:
        stub_reason = (stub_reason or "") + "IE_INEGI_TOKEN ausente o error INPP; "

    if not sources:
        stub_reason = stub_reason or "sin datos externos — costo estimado por constantes históricas"
        confidence = 55

    adjusted = base * inflation_multiplier * zone_premium
    cost_per_m2 = round(adjusted, 0)

    return {
        "zone_id": zone_id,
        "building_type": btype,
        "tier": btier,
        "cost_per_m2_mxn": cost_per_m2,
        "base_cost_mxn": base,
        "zone_premium": zone_premium,
        "inflation_multiplier": round(inflation_multiplier, 4),
        "confidence_pct": confidence,
        "sources": sources,
        "stub_reason": stub_reason.strip("; ") if stub_reason else None,
        "computed_at": _iso(),
    }


async def get_or_compute_cost(
    db, zone_id: str, building_type: str = "vertical", tier: str = "mid",
    max_age_hours: int = 720,  # 30 days
) -> Dict[str, Any]:
    """Return cached or fresh cost prediction."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    cached = await db.construction_costs.find_one(
        {"zone_id": zone_id, "building_type": building_type, "tier": tier,
         "computed_at": {"$gte": cutoff.isoformat()}},
        {"_id": 0},
    )
    if cached:
        return {**cached, "cache": "hit"}

    result = await predict_cost_per_m2(zone_id, building_type, tier)
    try:
        await db.construction_costs.update_one(
            {"zone_id": zone_id, "building_type": building_type, "tier": tier},
            {"$set": result},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[cost] upsert failed {zone_id}: {e}")

    return {**result, "cache": "miss"}


async def forecast_total(
    db, zone_id: str, m2: float, tier: str = "mid",
    building_type: str = "vertical",
) -> Dict[str, Any]:
    """Forecast total construction cost for m2 at zone + tier.
    Returns cost today + monthly evolution (12 months forward using avg inflation 6%/yr).
    """
    base_data = await get_or_compute_cost(db, zone_id, building_type, tier)
    cost_m2 = base_data.get("cost_per_m2_mxn") or 0
    total_today = round(cost_m2 * m2, 0)
    monthly_rate = 0.005  # 6% / 12 months as conservative monthly inflation

    evolution = []
    cumulative = total_today
    for month in range(1, 13):
        cumulative = round(cumulative * (1 + monthly_rate), 0)
        evolution.append({"month": month, "total_mxn": cumulative,
                          "cost_per_m2_mxn": round(cumulative / max(m2, 1), 0)})

    return {
        "zone_id": zone_id,
        "m2": m2,
        "tier": tier,
        "building_type": building_type,
        "cost_per_m2_today": cost_m2,
        "total_today_mxn": total_today,
        "monthly_evolution": evolution,
        "confidence_pct": base_data.get("confidence_pct"),
        "stub_reason": base_data.get("stub_reason"),
        "computed_at": _iso(),
    }


# ─── Monthly cron ─────────────────────────────────────────────────────────────

async def cron_construction_costs_monthly(db) -> Dict[str, Any]:
    """Refresh cost predictions for all active zones × tier × type."""
    cursor = db.cube_aggregations.find(
        {"period": "current"}, {"_id": 0, "tier_id": 1},
    ).limit(200)
    zones = [r["tier_id"] async for r in cursor]

    refreshed = 0
    failed = 0
    for zone_id in zones:
        for btype in ("vertical", "horizontal"):
            for btier in ("entry", "mid", "luxury"):
                try:
                    result = await predict_cost_per_m2(zone_id, btype, btier)
                    await db.construction_costs.update_one(
                        {"zone_id": zone_id, "building_type": btype, "tier": btier},
                        {"$set": result},
                        upsert=True,
                    )
                    refreshed += 1
                except Exception as e:
                    log.warning(f"[cost cron] failed {zone_id}/{btype}/{btier}: {e}")
                    failed += 1

    return {"ok": True, "refreshed": refreshed, "failed": failed, "completed_at": _iso()}


def schedule_construction_costs_cron(scheduler, db) -> None:
    """Register cron `construction_costs_monthly` 1st of month 07:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_construction_costs_monthly, "construction_costs_monthly"),
            CronTrigger(day=1, hour=7, minute=0,
                        timezone="America/Mexico_City"),
            args=[db], id="construction_costs_monthly",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[cost] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.construction_costs.create_index(
            [("zone_id", 1), ("building_type", 1), ("tier", 1)],
            unique=True, name="cost_zone_type_tier_uniq",
        )
        await db.construction_costs.create_index("computed_at", name="cost_computed_at")
    except Exception as e:
        log.warning(f"[cost] ensure_indexes failed: {e}")
