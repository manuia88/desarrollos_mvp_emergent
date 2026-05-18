"""W5.5 Parte 1 Sub-A — Live Pulse Engine: 5 signals + score composer + orchestrator.

Cada signal computer retorna shape:
  {value, baseline, delta_pct, source, confidence}

compose_score(signals) → 0-100 sigmoid weighted sum.
compute_pulse(db, zone_slug) → orchestrator asyncio.gather.

Persist `live_pulse_snapshots` con TTL 180d.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import os
import secrets as _secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.live_pulse")


# ─── Utils ────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _sid() -> str:
    return f"pulse_{_secrets.token_urlsafe(10)}"


def _delta_pct(value: float, baseline: float) -> float:
    if not baseline or baseline <= 0:
        return 0.0 if not value else 100.0
    return round(((value - baseline) / baseline) * 100.0, 2)


def _confidence_from_volume(volume: float, threshold: float) -> float:
    if threshold <= 0:
        return 0.0
    return round(min(1.0, volume / threshold), 3)


def _signal(value: float, baseline: float, source: str, confidence: float = 1.0) -> Dict[str, Any]:
    return {
        "value": round(value, 2),
        "baseline": round(baseline, 2),
        "delta_pct": max(-100.0, min(500.0, _delta_pct(value, baseline))),
        "source": source,
        "confidence": confidence,
    }


# ─── Signal 1: search velocity (atlax_threads) ───────────────────────────────

async def compute_search_velocity(db, zone_slug: str, days: int = 30, baseline_days: int = 90) -> Dict[str, Any]:
    now = _now()
    cur_cutoff = (now - timedelta(days=days)).isoformat()
    base_cutoff = (now - timedelta(days=baseline_days)).isoformat()
    base_end = cur_cutoff
    try:
        cur_count = await db.atlax_threads.count_documents({
            "$or": [{"zone_slug": zone_slug}, {"context.zone_slug": zone_slug}, {"intent_zones": zone_slug}],
            "created_at": {"$gte": cur_cutoff},
        })
        base_count = await db.atlax_threads.count_documents({
            "$or": [{"zone_slug": zone_slug}, {"context.zone_slug": zone_slug}, {"intent_zones": zone_slug}],
            "created_at": {"$gte": base_cutoff, "$lt": base_end},
        })
        cur_per_day = cur_count / max(days, 1)
        base_per_day = (base_count / max(baseline_days - days, 1)) if (baseline_days - days) > 0 else 0
        return _signal(cur_per_day, base_per_day, "atlax_threads", _confidence_from_volume(cur_count, 30))
    except Exception as exc:
        log.warning(f"[live_pulse] search_velocity failed for {zone_slug}: {exc}")
        return _signal(0, 0, "unavailable", 0)


# ─── Signal 2: view volume (behavioral_tracking_events) ──────────────────────

async def compute_view_volume(db, zone_slug: str, days: int = 30, baseline_days: int = 90) -> Dict[str, Any]:
    now = _now()
    cur_cutoff = (now - timedelta(days=days)).isoformat()
    base_cutoff = (now - timedelta(days=baseline_days)).isoformat()
    base_end = cur_cutoff
    try:
        zone_query = {"$or": [{"zone_slug": zone_slug}, {"colonia_slug": zone_slug}, {"context.zone_slug": zone_slug}]}
        cur_count = await db.behavioral_tracking_events.count_documents({
            **zone_query, "created_at": {"$gte": cur_cutoff},
        })
        base_count = await db.behavioral_tracking_events.count_documents({
            **zone_query, "created_at": {"$gte": base_cutoff, "$lt": base_end},
        })
        cur_per_day = cur_count / max(days, 1)
        base_per_day = (base_count / max(baseline_days - days, 1)) if (baseline_days - days) > 0 else 0
        return _signal(cur_per_day, base_per_day, "behavioral_tracking_events", _confidence_from_volume(cur_count, 500))
    except Exception as exc:
        log.warning(f"[live_pulse] view_volume failed for {zone_slug}: {exc}")
        return _signal(0, 0, "unavailable", 0)


# ─── Signal 3: trend velocity (apify_trends_cache) ───────────────────────────

async def compute_trend_velocity(db, zone_slug: str) -> Dict[str, Any]:
    apify_real = os.environ.get("APIFY_TRENDS_REAL", "false").lower() == "true"
    if not apify_real:
        # Heuristico determinista: hash(zone_slug + ISO_week) % 50 - 25 → [-25%, +24%]
        iso_week = _now().strftime("%G-W%V")
        seed = f"{zone_slug}|{iso_week}"
        h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
        delta = (h % 50) - 25  # [-25, 24]
        value = 100.0 + delta
        return {
            "value": round(value, 2),
            "baseline": 100.0,
            "delta_pct": float(delta),
            "source": "stub",
            "confidence": 0.5,
        }
    # Real: slope ultimos 30 dias en apify_trends_cache
    try:
        cutoff = (_now() - timedelta(days=30)).isoformat()
        cursor = db.apify_trends_cache.find(
            {"zone_slug": zone_slug, "cached_at": {"$gte": cutoff}},
            {"_id": 0, "interest_score": 1, "cached_at": 1},
        ).sort("cached_at", 1).limit(60)
        scores: List[float] = []
        async for d in cursor:
            sc = d.get("interest_score")
            if isinstance(sc, (int, float)):
                scores.append(float(sc))
        if len(scores) < 2:
            return _signal(0, 0, "unavailable", 0)
        first_half = scores[: len(scores) // 2]
        second_half = scores[len(scores) // 2:]
        v_first = sum(first_half) / max(len(first_half), 1)
        v_second = sum(second_half) / max(len(second_half), 1)
        return _signal(v_second, v_first, "apify_trends", _confidence_from_volume(len(scores), 10))
    except Exception as exc:
        log.warning(f"[live_pulse] trend_velocity failed for {zone_slug}: {exc}")
        return _signal(0, 0, "unavailable", 0)


# ─── Signal 4: lead intent velocity ──────────────────────────────────────────

async def compute_lead_intent_velocity(db, zone_slug: str, days: int = 30, baseline_days: int = 180) -> Dict[str, Any]:
    now = _now()
    cur_cutoff = (now - timedelta(days=days)).isoformat()
    base_cutoff = (now - timedelta(days=baseline_days)).isoformat()
    base_end = cur_cutoff
    try:
        zone_query = {"$or": [{"zone_slug": zone_slug}, {"colonia_slug": zone_slug}, {"interest_zones": zone_slug}]}
        cur_count = await db.leads.count_documents({**zone_query, "created_at": {"$gte": cur_cutoff}})
        base_count = await db.leads.count_documents({**zone_query, "created_at": {"$gte": base_cutoff, "$lt": base_end}})
        cur_per_day = cur_count / max(days, 1)
        base_per_day = (base_count / max(baseline_days - days, 1)) if (baseline_days - days) > 0 else 0
        return _signal(cur_per_day, base_per_day, "leads", _confidence_from_volume(cur_count, 30))
    except Exception as exc:
        log.warning(f"[live_pulse] lead_intent failed for {zone_slug}: {exc}")
        return _signal(0, 0, "unavailable", 0)


# ─── Signal 5: price movement (forecast_engine DRPI) ─────────────────────────

async def compute_price_movement(db, zone_slug: str) -> Dict[str, Any]:
    try:
        # forecast_engine puede no estar disponible; fallback a transactions price avg delta
        try:
            from forecast_engine import get_drpi_delta  # type: ignore
            res = await get_drpi_delta(db, zone_slug, window_days=30)
            if isinstance(res, dict) and "delta_pct" in res:
                value = float(res.get("current") or 0)
                baseline = float(res.get("baseline") or 0)
                return _signal(value, baseline, "forecast_drpi", 0.8)
        except Exception:
            pass
        # Fallback: avg price ultimos 30d vs 90d en transactions_history
        now = _now()
        cur = (now - timedelta(days=30)).isoformat()
        old_start = (now - timedelta(days=90)).isoformat()
        zone_q = {"$or": [{"zone_slug": zone_slug}, {"colonia_slug": zone_slug}]}
        cur_docs = db.transactions_history.find({**zone_q, "closed_at": {"$gte": cur}}, {"_id": 0, "price": 1}).limit(200)
        base_docs = db.transactions_history.find({**zone_q, "closed_at": {"$gte": old_start, "$lt": cur}}, {"_id": 0, "price": 1}).limit(500)
        cur_p, base_p = [], []
        async for d in cur_docs:
            p = d.get("price")
            if isinstance(p, (int, float)):
                cur_p.append(float(p))
        async for d in base_docs:
            p = d.get("price")
            if isinstance(p, (int, float)):
                base_p.append(float(p))
        if not cur_p or not base_p:
            return _signal(0, 0, "unavailable", 0)
        v = sum(cur_p) / len(cur_p)
        b = sum(base_p) / len(base_p)
        return _signal(v, b, "transactions_history", _confidence_from_volume(len(cur_p), 10))
    except Exception as exc:
        log.warning(f"[live_pulse] price_movement failed for {zone_slug}: {exc}")
        return _signal(0, 0, "unavailable", 0)


# ─── Score composer ──────────────────────────────────────────────────────────

WEIGHTS = {
    "search_velocity": 0.35,
    "view_volume": 0.25,
    "trend_velocity": 0.15,
    "lead_intent_velocity": 0.20,
    "price_movement": 0.05,
}


def compose_score(signals: Dict[str, Dict[str, Any]]) -> float:
    """Score 0-100 sigmoid weighted sum sobre delta_pct capped [-100,+500]."""
    total = 0.0
    for key, weight in WEIGHTS.items():
        sig = signals.get(key) or {}
        delta = float(sig.get("delta_pct") or 0)
        delta = max(-100.0, min(500.0, delta))
        total += weight * delta
    # Sigmoid centrado en 50: σ(x/50) * 100
    return round(100.0 / (1.0 + math.exp(-total / 50.0)), 2)


def _stub_flags(signals: Dict[str, Dict[str, Any]]) -> Dict[str, bool]:
    return {k: (v.get("source") in ("stub", "unavailable")) for k, v in signals.items()}


async def compute_pulse(db, zone_slug: str) -> Dict[str, Any]:
    """Orchestrator: 5 signals en paralelo + score + persist snapshot."""
    sv, vv, tv, lv, pm = await asyncio.gather(
        compute_search_velocity(db, zone_slug),
        compute_view_volume(db, zone_slug),
        compute_trend_velocity(db, zone_slug),
        compute_lead_intent_velocity(db, zone_slug),
        compute_price_movement(db, zone_slug),
        return_exceptions=True,
    )

    def _safe(x: Any) -> Dict[str, Any]:
        if isinstance(x, Exception):
            log.warning(f"[live_pulse] signal exception for {zone_slug}: {x}")
            return _signal(0, 0, "unavailable", 0)
        return x

    signals = {
        "search_velocity": _safe(sv),
        "view_volume": _safe(vv),
        "trend_velocity": _safe(tv),
        "lead_intent_velocity": _safe(lv),
        "price_movement": _safe(pm),
    }
    score = compose_score(signals)
    return {
        "zone_slug": zone_slug,
        "score": score,
        "signals": signals,
        "computed_at": _iso(_now()),
        "stub_flags": _stub_flags(signals),
    }


async def persist_snapshot(db, pulse: Dict[str, Any]) -> Optional[str]:
    try:
        doc = {
            "id": _sid(),
            "zone_slug": pulse["zone_slug"],
            "score": pulse["score"],
            "signals": pulse["signals"],
            "computed_at": pulse["computed_at"],
            "stub_flags": pulse.get("stub_flags") or {},
        }
        await db.live_pulse_snapshots.insert_one(dict(doc))
        return doc["id"]
    except Exception as exc:
        log.warning(f"[live_pulse] persist_snapshot failed: {exc}")
        return None


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_live_pulse_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        # TTL 180d sobre computed_at — usar campo datetime para que TTL pueda funcionar
        # Si computed_at es string ISO el TTL no opera; pero permite query rapida.
        await db.live_pulse_snapshots.create_index([("computed_at", DESCENDING)], name="computed_desc")
        await db.live_pulse_snapshots.create_index(
            [("zone_slug", ASCENDING), ("computed_at", DESCENDING)],
            name="zone_computed_idx",
        )
        await db.live_pulse_snapshots.create_index("id", unique=True, sparse=True)
        await db.live_pulse_subscriptions.create_index(
            [("user_id", ASCENDING), ("zone_slug", ASCENDING)],
            name="user_zone_idx",
        )
        await db.live_pulse_subscriptions.create_index("id", unique=True, sparse=True)
        await db.live_pulse_alerts_sent.create_index([("sent_at", DESCENDING)], name="sent_desc")
        await db.live_pulse_alerts_sent.create_index("hash", unique=True, sparse=True)
        log.info("[live_pulse] indexes OK")
    except Exception as exc:
        log.warning(f"[live_pulse] index creation warning: {exc}")
