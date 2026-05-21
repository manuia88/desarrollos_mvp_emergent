"""W5.x F1 · Cuotas por usuario y tier con enforcement hard cap.

Layer NUEVA encima de ai_budget.py (tenant-level monthly caps).
NO reemplaza track_ai_call; lo extiende a nivel user (Free · Pro · Premium · Enterprise).

Collections:
  user_quota_usage         · per (user_id, month_iso) — monthly counters
  user_quota_usage_daily   · per (user_id, daily_iso) — daily counters

Indexes:
  user_quota_usage       (user_id, month_iso) unique
  user_quota_usage_daily (user_id, daily_iso) unique
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.ai_quota_engine")


TIER_QUOTAS: Dict[str, Dict[str, float]] = {
    "free": {
        "daily_calls": 10,
        "monthly_calls": 200,
        "daily_cost_usd": 1.0,
        "monthly_cost_usd": 15.0,
    },
    "pro": {
        "daily_calls": 50,
        "monthly_calls": 1000,
        "daily_cost_usd": 5.0,
        "monthly_cost_usd": 75.0,
    },
    "premium": {
        "daily_calls": 200,
        "monthly_calls": 5000,
        "daily_cost_usd": 25.0,
        "monthly_cost_usd": 300.0,
    },
    "enterprise": {
        "daily_calls": -1,
        "monthly_calls": -1,
        "daily_cost_usd": -1,
        "monthly_cost_usd": -1,
    },
}


class QuotaExceededError(Exception):
    """User excedió su cuota. Raise ANTES de la llamada LLM."""

    def __init__(self, tier: str, limit_type: str, current: float, limit: float):
        self.tier = tier
        self.limit_type = limit_type
        self.current = current
        self.limit = limit
        super().__init__(
            f"Cuota excedida: {limit_type}={current}/{limit} (tier={tier}). "
            "Upgrade o espera al reset."
        )


def _now_iso():
    now = datetime.now(timezone.utc)
    return now, now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")


async def get_user_tier(db, user_id: str) -> str:
    """Resuelve tier del user desde collection users · default 'free'."""
    try:
        user = await db.users.find_one({"user_id": user_id}, {"tier": 1, "_id": 0})
        if not user:
            return "free"
        return user.get("tier") or "free"
    except Exception as exc:
        log.warning(f"[ai_quota] get_user_tier failed for {user_id}: {exc}")
        return "free"


async def get_user_usage(db, user_id: str) -> Dict[str, Any]:
    """Retorna usage actual del user (daily + monthly merged)."""
    _, daily_iso, month_iso = _now_iso()
    monthly = await db.user_quota_usage.find_one(
        {"user_id": user_id, "month_iso": month_iso}, {"_id": 0}
    )
    daily = await db.user_quota_usage_daily.find_one(
        {"user_id": user_id, "daily_iso": daily_iso}, {"_id": 0}
    )
    tier = await get_user_tier(db, user_id)
    return {
        "user_id": user_id,
        "tier": (monthly or {}).get("tier") or tier,
        "month_iso": month_iso,
        "daily_iso": daily_iso,
        "calls_count_daily": int((daily or {}).get("calls_count_daily") or 0),
        "calls_count_monthly": int((monthly or {}).get("calls_count_monthly") or 0),
        "tokens_total_daily": int((daily or {}).get("tokens_total_daily") or 0),
        "tokens_total_monthly": int((monthly or {}).get("tokens_total_monthly") or 0),
        "cost_usd_daily": float((daily or {}).get("cost_usd_daily") or 0.0),
        "cost_usd_monthly": float((monthly or {}).get("cost_usd_monthly") or 0.0),
        "last_call_at": (monthly or {}).get("last_call_at"),
    }


async def check_user_quota(db, user_id: str, estimated_tokens: int = 1000) -> Dict[str, Any]:
    """Verifica si el user puede hacer la llamada.

    Raises:
        QuotaExceededError si cualquier limit está excedido.
    Returns:
        Dict con tier, usage actual, quotas, remaining para cada métrica.
    """
    tier = await get_user_tier(db, user_id)
    quotas = TIER_QUOTAS.get(tier) or TIER_QUOTAS["free"]
    if tier == "enterprise":
        return {"tier": tier, "unlimited": True}

    usage = await get_user_usage(db, user_id)

    if quotas["daily_calls"] > 0 and usage["calls_count_daily"] >= quotas["daily_calls"]:
        raise QuotaExceededError(
            tier, "daily_calls", usage["calls_count_daily"], quotas["daily_calls"]
        )
    if quotas["monthly_calls"] > 0 and usage["calls_count_monthly"] >= quotas["monthly_calls"]:
        raise QuotaExceededError(
            tier, "monthly_calls", usage["calls_count_monthly"], quotas["monthly_calls"]
        )
    if quotas["daily_cost_usd"] > 0 and usage["cost_usd_daily"] >= quotas["daily_cost_usd"]:
        raise QuotaExceededError(
            tier, "daily_cost_usd", usage["cost_usd_daily"], quotas["daily_cost_usd"]
        )
    if quotas["monthly_cost_usd"] > 0 and usage["cost_usd_monthly"] >= quotas["monthly_cost_usd"]:
        raise QuotaExceededError(
            tier, "monthly_cost_usd", usage["cost_usd_monthly"], quotas["monthly_cost_usd"]
        )

    def _remaining(limit, used):
        return (limit - used) if limit > 0 else -1

    return {
        "tier": tier,
        "usage": usage,
        "quotas": quotas,
        "remaining_daily_calls": _remaining(quotas["daily_calls"], usage["calls_count_daily"]),
        "remaining_monthly_calls": _remaining(quotas["monthly_calls"], usage["calls_count_monthly"]),
        "remaining_daily_cost_usd": _remaining(quotas["daily_cost_usd"], usage["cost_usd_daily"]),
        "remaining_monthly_cost_usd": _remaining(quotas["monthly_cost_usd"], usage["cost_usd_monthly"]),
    }


async def increment_user_usage(
    db, user_id: str, tokens: int, cost_usd: float
) -> None:
    """Incrementa monthly + daily counters · fire-and-forget."""
    now, daily_iso, month_iso = _now_iso()
    tier = await get_user_tier(db, user_id)
    try:
        await db.user_quota_usage.update_one(
            {"user_id": user_id, "month_iso": month_iso},
            {
                "$inc": {
                    "calls_count_monthly": 1,
                    "tokens_total_monthly": int(tokens or 0),
                    "cost_usd_monthly": float(cost_usd or 0.0),
                },
                "$set": {
                    "last_call_at": now,
                    "tier": tier,
                    "daily_iso": daily_iso,
                },
                "$setOnInsert": {
                    "user_id": user_id,
                    "month_iso": month_iso,
                },
            },
            upsert=True,
        )
        await db.user_quota_usage_daily.update_one(
            {"user_id": user_id, "daily_iso": daily_iso},
            {
                "$inc": {
                    "calls_count_daily": 1,
                    "tokens_total_daily": int(tokens or 0),
                    "cost_usd_daily": float(cost_usd or 0.0),
                },
                "$set": {"last_call_at": now, "tier": tier},
                "$setOnInsert": {"user_id": user_id, "daily_iso": daily_iso},
            },
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[ai_quota] increment_user_usage failed for {user_id}: {exc}")


async def ensure_user_quota_indexes(db) -> None:
    """Create indexes for user_quota_usage + user_quota_usage_daily."""
    try:
        await db.user_quota_usage.create_index(
            [("user_id", 1), ("month_iso", 1)],
            unique=True,
            name="user_quota_user_month_unique",
            background=True,
        )
    except Exception as exc:
        log.warning(f"[ai_quota] monthly index create failed: {exc}")
    try:
        await db.user_quota_usage_daily.create_index(
            [("user_id", 1), ("daily_iso", 1)],
            unique=True,
            name="user_quota_user_daily_unique",
            background=True,
        )
    except Exception as exc:
        log.warning(f"[ai_quota] daily index create failed: {exc}")
    try:
        await db.user_quota_usage.create_index([("month_iso", -1)], background=True)
        await db.user_quota_usage.create_index([("tier", 1)], background=True)
    except Exception:
        pass
