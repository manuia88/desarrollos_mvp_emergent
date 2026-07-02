"""W7.AS.3.F · Conversation Cost Stats Engine.

Aggregation layer ON TOP of ai_budget — it does NOT duplicate cost accounting.
Reuses:
  - db.ai_call_events  (canonical per-call log written by ai_budget.track_ai_call)
  - ai_budget._cost_usd / USD_TO_MXN  (single source of truth for pricing)
  - db.conversation_threads / db.conversation_messages  (per-convo + per-asesor granularity)

All functions are FAIL-OPEN: on any error they return safe empty/zero shapes so the
superadmin dashboard renders zeros instead of crashing.

Aggregation is done Python-side (small superadmin volumes) for testability and to
avoid coupling to Mongo aggregation-pipeline semantics.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

log = logging.getLogger("dmx.conversation_cost_stats")

# Conversation traffic is tagged with these feature keys / call types in ai_call_events
CONVERSATION_FEATURE_KEYS = ["conversation_engine", "conversation_message"]
# Model used to estimate per-conversation cost from stored token counts (messages
# don't persist a model id). Sonnet is the conversation default tier.
_ESTIMATE_MODEL = "claude-sonnet-4-5-20250929"
_FETCH_CAP = 20000  # safety cap on docs scanned per call


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cutoff(days: int) -> datetime:
    return _now() - timedelta(days=max(1, int(days or 30)))


def _cost_usd(model: str, tokens_in: int, tokens_out: int) -> float:
    """Reuse ai_budget pricing — never duplicate the cost table."""
    try:
        from ai_budget import _cost_usd as ab_cost
        return ab_cost(model, tokens_in, tokens_out)
    except Exception:
        # Conservative fallback only if ai_budget unavailable
        return round(((tokens_in + tokens_out) / 1000.0) * 0.003, 6)


def _usd_to_mxn() -> float:
    try:
        from ai_budget import USD_TO_MXN
        return float(USD_TO_MXN)
    except Exception:
        return 20.0


# ─── ai_call_events helpers ────────────────────────────────────────────────────
async def _conversation_events(db, days: int) -> List[Dict[str, Any]]:
    cutoff = _cutoff(days)
    cur = db.ai_call_events.find({
        "feature_key": {"$in": CONVERSATION_FEATURE_KEYS},
        "ts": {"$gte": cutoff},
    })
    return await cur.to_list(length=_FETCH_CAP)


# ─── per-conversation cost (threads ⋈ messages) ────────────────────────────────
async def _conversation_costs(db, days: int) -> List[Dict[str, Any]]:
    """Returns per-conversation rows enriched with thread metadata.

    cost estimated from stored token counts via ai_budget pricing (Sonnet tier).
    """
    cutoff = _cutoff(days)
    msgs = await db.conversation_messages.find(
        {"created_at": {"$gte": cutoff}}
    ).to_list(length=_FETCH_CAP)

    agg: Dict[str, Dict[str, Any]] = {}
    for m in msgs:
        cid = m.get("conversation_id")
        if not cid:
            continue
        row = agg.setdefault(cid, {"conversation_id": cid, "tokens_in": 0,
                                   "tokens_out": 0, "message_count": 0})
        row["tokens_in"] += int(m.get("tokens_in") or 0)
        row["tokens_out"] += int(m.get("tokens_out") or 0)
        row["message_count"] += 1

    if not agg:
        return []

    # enrich with thread metadata
    threads = await db.conversation_threads.find(
        {"_id": {"$in": list(agg.keys())}}
    ).to_list(length=_FETCH_CAP)
    tmap = {t.get("_id"): t for t in threads}

    rows = []
    for cid, row in agg.items():
        t = tmap.get(cid, {})
        cost = _cost_usd(_ESTIMATE_MODEL, row["tokens_in"], row["tokens_out"])
        rows.append({
            "conversation_id": cid,
            "asesor_id": t.get("asesor_id"),
            "tenant_id": t.get("tenant_id"),
            "lead_id": t.get("lead_id"),
            "status": t.get("status"),
            "sentiment": t.get("sentiment"),
            "message_count": row["message_count"],
            "tokens": row["tokens_in"] + row["tokens_out"],
            "cost_usd": round(cost, 6),
            "cost_mxn": round(cost * _usd_to_mxn(), 2),
        })
    return rows


# ─── Public API ────────────────────────────────────────────────────────────────
async def get_tenant_cost(db, tenant_id: str, days: int = 30) -> Dict[str, Any]:
    """Total conversation AI cost for one tenant over the window (ai_call_events)."""
    try:
        events = await _conversation_events(db, days)
        events = [e for e in events if e.get("dev_org_id") == tenant_id]
        cost_usd = sum(float(e.get("cost_usd") or 0) for e in events)
        cost_mxn = sum(float(e.get("cost_mxn") or 0) for e in events)
        return {
            "tenant_id": tenant_id,
            "days": days,
            "calls": len(events),
            "cost_usd": round(cost_usd, 4),
            "cost_mxn": round(cost_mxn, 2),
        }
    except Exception as exc:
        log.warning(f"[cost_stats] get_tenant_cost failed: {exc}")
        return {"tenant_id": tenant_id, "days": days, "calls": 0,
                "cost_usd": 0.0, "cost_mxn": 0.0, "error": True}


async def get_top_expensive(db, days: int = 30, limit: int = 10) -> List[Dict[str, Any]]:
    """Top N most expensive conversations in the window (threads ⋈ messages)."""
    try:
        rows = await _conversation_costs(db, days)
        rows.sort(key=lambda r: r.get("cost_usd", 0), reverse=True)
        return rows[:max(1, int(limit or 10))]
    except Exception as exc:
        log.warning(f"[cost_stats] get_top_expensive failed: {exc}")
        return []


async def get_model_distribution(db, days: int = 30) -> Dict[str, Any]:
    """Distribution of conversation calls by model tier (haiku/sonnet/opus)."""
    try:
        from conversation_cost_optimizer import model_tier
        events = await _conversation_events(db, days)
        buckets: Dict[str, Dict[str, Any]] = {}
        total_calls = 0
        total_cost = 0.0
        for e in events:
            tier = model_tier(e.get("model"))
            b = buckets.setdefault(tier, {"tier": tier, "model": e.get("model"),
                                          "calls": 0, "cost_usd": 0.0})
            b["calls"] += 1
            b["cost_usd"] += float(e.get("cost_usd") or 0)
            total_calls += 1
            total_cost += float(e.get("cost_usd") or 0)
        dist = []
        for tier in ("haiku", "sonnet", "opus", "other"):
            b = buckets.get(tier)
            if not b:
                continue
            b["pct"] = round((b["calls"] / total_calls) * 100, 1) if total_calls else 0.0
            b["cost_usd"] = round(b["cost_usd"], 4)
            dist.append(b)
        return {"days": days, "total_calls": total_calls,
                "total_cost_usd": round(total_cost, 4), "distribution": dist}
    except Exception as exc:
        log.warning(f"[cost_stats] get_model_distribution failed: {exc}")
        return {"days": days, "total_calls": 0, "total_cost_usd": 0.0,
                "distribution": [], "error": True}


async def get_stats_summary(db, days: int = 30) -> Dict[str, Any]:
    """KPI cards: total cost · top tenant · top asesor · avg cost/convo."""
    try:
        events = await _conversation_events(db, days)
        total_cost_usd = sum(float(e.get("cost_usd") or 0) for e in events)

        # top tenant (by ai_call_events cost)
        by_tenant: Dict[str, float] = {}
        for e in events:
            tid = e.get("dev_org_id") or "default"
            by_tenant[tid] = by_tenant.get(tid, 0.0) + float(e.get("cost_usd") or 0)
        top_tenant = max(by_tenant.items(), key=lambda kv: kv[1], default=(None, 0.0))

        # per-conversation rows → top asesor + avg cost/convo
        rows = await _conversation_costs(db, days)
        by_asesor: Dict[str, float] = {}
        for r in rows:
            aid = r.get("asesor_id") or "—"
            by_asesor[aid] = by_asesor.get(aid, 0.0) + float(r.get("cost_usd") or 0)
        top_asesor = max(by_asesor.items(), key=lambda kv: kv[1], default=(None, 0.0))

        convo_count = len(rows)
        convo_cost = sum(float(r.get("cost_usd") or 0) for r in rows)
        avg_cost = round(convo_cost / convo_count, 6) if convo_count else 0.0

        mxn = _usd_to_mxn()
        return {
            "days": days,
            "total_cost_usd": round(total_cost_usd, 4),
            "total_cost_mxn": round(total_cost_usd * mxn, 2),
            "top_tenant": {"tenant_id": top_tenant[0], "cost_usd": round(top_tenant[1], 4)},
            "top_asesor": {"asesor_id": top_asesor[0], "cost_usd": round(top_asesor[1], 4)},
            "conversation_count": convo_count,
            "avg_cost_per_convo_usd": avg_cost,
            "avg_cost_per_convo_mxn": round(avg_cost * mxn, 4),
        }
    except Exception as exc:
        log.warning(f"[cost_stats] get_stats_summary failed: {exc}")
        return {"days": days, "total_cost_usd": 0.0, "total_cost_mxn": 0.0,
                "top_tenant": {"tenant_id": None, "cost_usd": 0.0},
                "top_asesor": {"asesor_id": None, "cost_usd": 0.0},
                "conversation_count": 0, "avg_cost_per_convo_usd": 0.0,
                "avg_cost_per_convo_mxn": 0.0, "error": True}
