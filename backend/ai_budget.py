"""Phase 4 Batch 0 — AI Budget tracking module.
Tracks Claude API calls per dev_org per month, enforces caps.
Wire this in every Claude call via: await track_ai_call(db, dev_org_id, model, tokens, call_type)
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.ai_budget")

router = APIRouter(tags=["ai_budget"])

# Default cap per dev_org: $5,000 MXN / month (~$250 USD at ~20 MXN/USD)
DEFAULT_CAP_MXN = float(os.environ.get("AI_BUDGET_DEFAULT_CAP_MXN", "5000"))

# Exchange rate for cost calculation (USD → MXN)
USD_TO_MXN = 20.0

# Approximate cost per 1k tokens by model (USD)
MODEL_COST_PER_1K = {
    "claude-haiku-4-5-20251001": 0.00025,      # $0.25/Mtok input
    "claude-sonnet-4-5-20250929": 0.003,       # $3/Mtok input
    "claude-3-haiku-20240307": 0.00025,
    "gpt-image-1": 0.04,                       # per image ~$0.04
    "default": 0.001,
}


def _cost_usd(model: str, tokens: int) -> float:
    rate = MODEL_COST_PER_1K.get(model) or MODEL_COST_PER_1K["default"]
    return round((tokens / 1000) * rate, 6)


def _month_iso() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year}-{now.month:02d}"


async def track_ai_call(
    db,
    dev_org_id: str,
    model: str,
    tokens: int,
    call_type: str,
) -> None:
    """Increment usage counter. Fire-and-forget; never raises."""
    try:
        cost_usd = _cost_usd(model, tokens)
        cost_mxn = round(cost_usd * USD_TO_MXN, 2)
        month = _month_iso()
        await db.ai_usage_log.update_one(
            {"dev_org_id": dev_org_id, "month_iso": month},
            {
                "$inc": {
                    "calls_count": 1,
                    "tokens_used": tokens,
                    "estimated_cost_usd": cost_usd,
                    "estimated_cost_mxn": cost_mxn,
                },
                "$setOnInsert": {
                    "dev_org_id": dev_org_id,
                    "month_iso": month,
                    "cap_mxn": DEFAULT_CAP_MXN,
                },
                "$push": {
                    "call_log": {
                        "$each": [{"model": model, "tokens": tokens, "type": call_type, "ts": datetime.now(timezone.utc)}],
                        "$slice": -100,  # keep last 100 calls
                    }
                },
            },
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[ai_budget] track_ai_call failed: {e}")


async def is_within_budget(db, dev_org_id: str) -> bool:
    """Returns True if org is within their monthly cap."""
    try:
        month = _month_iso()
        doc = await db.ai_usage_log.find_one(
            {"dev_org_id": dev_org_id, "month_iso": month}, {"_id": 0}
        )
        if not doc:
            return True
        cap = doc.get("cap_mxn") or DEFAULT_CAP_MXN
        spent = doc.get("estimated_cost_mxn") or 0
        return spent < cap
    except Exception:
        return True  # fail open


async def ensure_ai_budget_indexes(db) -> None:
    await db.ai_usage_log.create_index([("dev_org_id", 1), ("month_iso", -1)])
    await db.ai_usage_log.create_index("month_iso")


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/api/superadmin/ai-usage")
async def get_ai_usage_dashboard(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    month = _month_iso()
    docs = await db.ai_usage_log.find(
        {"month_iso": month}, {"_id": 0, "call_log": 0}
    ).sort("estimated_cost_mxn", -1).to_list(100)
    total_cost_mxn = sum(d.get("estimated_cost_mxn", 0) for d in docs)
    total_calls = sum(d.get("calls_count", 0) for d in docs)
    return {
        "month_iso": month,
        "orgs": docs,
        "totals": {
            "cost_mxn": round(total_cost_mxn, 2),
            "calls": total_calls,
        },
    }


@router.patch("/api/superadmin/ai-usage/{dev_org_id}/cap")
async def update_ai_cap(dev_org_id: str, request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    body = await request.json()
    cap_mxn = float(body.get("cap_mxn", DEFAULT_CAP_MXN))
    db = request.app.state.db
    month = _month_iso()
    await db.ai_usage_log.update_one(
        {"dev_org_id": dev_org_id, "month_iso": month},
        {"$set": {"cap_mxn": cap_mxn}},
        upsert=True,
    )
    return {"ok": True, "dev_org_id": dev_org_id, "cap_mxn": cap_mxn}


@router.get("/api/dev/ai-budget")
async def get_my_ai_budget(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    db = request.app.state.db
    month = _month_iso()
    dev_org_id = getattr(user, "tenant_id", None) or user.user_id
    doc = await db.ai_usage_log.find_one(
        {"dev_org_id": dev_org_id, "month_iso": month}, {"_id": 0, "call_log": 0}
    )
    if not doc:
        return {"dev_org_id": dev_org_id, "month_iso": month, "calls_count": 0,
                "tokens_used": 0, "estimated_cost_mxn": 0, "cap_mxn": DEFAULT_CAP_MXN, "pct_used": 0}
    cap = doc.get("cap_mxn") or DEFAULT_CAP_MXN
    spent = doc.get("estimated_cost_mxn") or 0
    return {**doc, "pct_used": round(min(100, (spent / cap) * 100), 1) if cap > 0 else 0}
