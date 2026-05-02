"""Phase 4 Batch 0 — AI Budget tracking module.
Tracks Claude API calls per dev_org per month, enforces caps.
Wire this in every Claude call via: await track_ai_call(db, dev_org_id, model, tokens, call_type)

Schema ai_usage_log:
  {_id, dev_org_id, month_iso (YYYY-MM), model, calls_count,
   tokens_input, tokens_output, estimated_cost_usd, estimated_cost_mxn,
   cap_mxn, last_call_at, alert_sent_at}
  Index: (dev_org_id, month_iso) unique
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.ai_budget")

router = APIRouter(tags=["ai_budget"])

# Default cap per dev_org: $5,000 MXN / month (~$250 USD at ~20 MXN/USD)
DEFAULT_CAP_MXN = float(os.environ.get("AI_BUDGET_DEFAULT_CAP_MXN", "5000"))

# Exchange rate for cost calculation (USD → MXN)
USD_TO_MXN = 20.0

# Alert when org reaches this % of cap (email once per day)
ALERT_THRESHOLD_PCT = 0.80

# Approximate cost per 1k tokens by model (USD, combined input+output)
MODEL_COST_PER_1K = {
    "claude-haiku-4-5-20251001": 0.00025,      # $0.25/Mtok input  (haiku)
    "claude-sonnet-4-5-20250929": 0.003,       # $3/Mtok input     (sonnet)
    "claude-3-haiku-20240307": 0.00025,
    "gpt-image-1": 0.04,                       # per image ~$0.04
    "default": 0.001,
}
MODEL_COST_OUT_MULTIPLIER = {
    "claude-haiku-4-5-20251001": 4.0,          # output costs 4× input for haiku
    "claude-sonnet-4-5-20250929": 5.0,
    "default": 4.0,
}


def _cost_usd(model: str, tokens_in: int, tokens_out: int) -> float:
    rate_in = MODEL_COST_PER_1K.get(model) or MODEL_COST_PER_1K["default"]
    mult = MODEL_COST_OUT_MULTIPLIER.get(model) or MODEL_COST_OUT_MULTIPLIER["default"]
    cost = (tokens_in / 1000.0) * rate_in + (tokens_out / 1000.0) * rate_in * mult
    return round(cost, 6)


def _month_iso() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year}-{now.month:02d}"


async def track_ai_call(
    db,
    dev_org_id: str,
    model: str,
    tokens: int,
    call_type: str,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
) -> None:
    """Increment usage counter. Fire-and-forget; never raises.
    Accepts either total `tokens` (split ~70/30) or explicit tokens_in/tokens_out.
    """
    try:
        t_in = tokens_in if tokens_in is not None else int(tokens * 0.70)
        t_out = tokens_out if tokens_out is not None else int(tokens * 0.30)
        cost_usd = _cost_usd(model, t_in, t_out)
        cost_mxn = round(cost_usd * USD_TO_MXN, 2)
        month = _month_iso()
        now = datetime.now(timezone.utc)

        await db.ai_usage_log.update_one(
            {"dev_org_id": dev_org_id, "month_iso": month},
            {
                "$inc": {
                    "calls_count": 1,
                    "tokens_input": t_in,
                    "tokens_output": t_out,
                    "estimated_cost_usd": cost_usd,
                    "estimated_cost_mxn": cost_mxn,
                },
                "$set": {"last_call_at": now},
                "$setOnInsert": {
                    "dev_org_id": dev_org_id,
                    "month_iso": month,
                    "cap_mxn": DEFAULT_CAP_MXN,
                    "alert_sent_at": None,
                },
                "$push": {
                    "call_log": {
                        "$each": [{"model": model, "tokens_in": t_in, "tokens_out": t_out,
                                   "type": call_type, "ts": now}],
                        "$slice": -100,
                    }
                },
            },
            upsert=True,
        )

        # Fire budget alert if crossing 80% threshold (once per day)
        await _maybe_send_budget_alert(db, dev_org_id, month)

    except Exception as e:
        log.warning(f"[ai_budget] track_ai_call failed: {e}")


async def _maybe_send_budget_alert(db, dev_org_id: str, month: str) -> None:
    """Send Resend email alert once per day when usage > 80% of cap."""
    try:
        doc = await db.ai_usage_log.find_one(
            {"dev_org_id": dev_org_id, "month_iso": month},
            {"_id": 0, "estimated_cost_mxn": 1, "cap_mxn": 1, "alert_sent_at": 1},
        )
        if not doc:
            return
        cap = doc.get("cap_mxn") or DEFAULT_CAP_MXN
        spent = doc.get("estimated_cost_mxn") or 0.0
        if cap <= 0 or (spent / cap) < ALERT_THRESHOLD_PCT:
            return
        # Rate-limit: once per day
        last_alert = doc.get("alert_sent_at")
        now = datetime.now(timezone.utc)
        if last_alert:
            if isinstance(last_alert, str):
                last_alert = datetime.fromisoformat(last_alert.replace("Z", "+00:00"))
            if (now - last_alert).total_seconds() < 86400:
                return
        # Try Resend email
        resend_key = os.environ.get("RESEND_API_KEY", "")
        if resend_key:
            try:
                import httpx
                pct = round((spent / cap) * 100, 1)
                body = {
                    "from": "DMX Platform <no-reply@desarrollosmx.com>",
                    "to": [os.environ.get("ALERT_EMAIL", "admin@desarrollosmx.com")],
                    "subject": f"[DMX] Alerta presupuesto IA {pct}% utilizado — {dev_org_id}",
                    "text": (
                        f"La organización '{dev_org_id}' ha consumido el {pct}% de su límite mensual de IA.\n"
                        f"Consumo: ${spent:.2f} MXN / ${cap:.0f} MXN\n"
                        f"Período: {month}\n\nAjusta el límite en el panel Superadmin → AI Usage."
                    ),
                }
                async with httpx.AsyncClient() as client:
                    await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {resend_key}"},
                        json=body,
                        timeout=10,
                    )
            except Exception as mail_err:
                log.warning(f"[ai_budget] alert email failed: {mail_err}")
        # Mark alert sent regardless
        await db.ai_usage_log.update_one(
            {"dev_org_id": dev_org_id, "month_iso": month},
            {"$set": {"alert_sent_at": now}},
        )
    except Exception as e:
        log.warning(f"[ai_budget] budget alert check failed: {e}")


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


async def get_ai_usage(db, dev_org_id: str, period: str = "current_month") -> Dict:
    """Return aggregated AI usage stats for a given period."""
    try:
        if period == "current_month":
            month = _month_iso()
            doc = await db.ai_usage_log.find_one(
                {"dev_org_id": dev_org_id, "month_iso": month},
                {"_id": 0, "call_log": 0},
            )
            if not doc:
                return {"dev_org_id": dev_org_id, "period": period, "calls_count": 0,
                        "tokens_input": 0, "tokens_output": 0,
                        "estimated_cost_mxn": 0, "cap_mxn": DEFAULT_CAP_MXN, "pct_used": 0}
            cap = doc.get("cap_mxn") or DEFAULT_CAP_MXN
            spent = doc.get("estimated_cost_mxn") or 0
            return {**doc, "pct_used": round(min(100, (spent / cap) * 100), 1) if cap > 0 else 0}

        elif period == "last_3_months":
            docs = await db.ai_usage_log.find(
                {"dev_org_id": dev_org_id}, {"_id": 0, "call_log": 0}
            ).sort("month_iso", -1).limit(3).to_list(3)
            return {"dev_org_id": dev_org_id, "period": period, "months": docs,
                    "total_cost_mxn": round(sum(d.get("estimated_cost_mxn", 0) for d in docs), 2),
                    "total_calls": sum(d.get("calls_count", 0) for d in docs)}
    except Exception as e:
        log.warning(f"[ai_budget] get_ai_usage failed: {e}")
    return {"dev_org_id": dev_org_id, "period": period, "error": True}


async def ensure_ai_budget_indexes(db) -> None:
    """Create required indexes; handles conflict if index already exists."""
    try:
        # Drop old non-unique index if it exists to replace with unique variant
        await db.ai_usage_log.drop_index("dev_org_id_1_month_iso_-1")
    except Exception:
        pass
    try:
        await db.ai_usage_log.create_index(
            [("dev_org_id", 1), ("month_iso", -1)],
            unique=True, name="ai_usage_org_month_unique", background=True,
        )
    except Exception:
        # Index already exists, that's fine
        pass
    try:
        await db.ai_usage_log.create_index("month_iso", background=True)
    except Exception:
        pass


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
        "totals": {"cost_mxn": round(total_cost_mxn, 2), "calls": total_calls},
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
    dev_org_id = getattr(user, "tenant_id", None) or user.user_id
    doc = await get_ai_usage(db, dev_org_id, "current_month")
    return doc


class ThresholdPayload(BaseModel):
    threshold_mxn: float


@router.patch("/api/dev/ai-budget/threshold")
async def update_my_threshold(payload: ThresholdPayload, request: Request):
    """Developer admin sets their own monthly AI spend threshold."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin o superadmin")
    db = request.app.state.db
    dev_org_id = getattr(user, "tenant_id", None) or user.user_id
    month = _month_iso()
    threshold = max(100.0, min(payload.threshold_mxn, 200_000.0))
    await db.ai_usage_log.update_one(
        {"dev_org_id": dev_org_id, "month_iso": month},
        {"$set": {"cap_mxn": threshold}},
        upsert=True,
    )
    # Audit
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "ai_budget_threshold", dev_org_id,
                           after={"threshold_mxn": threshold}, request=request)
    except Exception:
        pass
    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ai_budget_threshold_changed",
            user_id=getattr(user, "user_id", "system"),
            org_id=dev_org_id, role=getattr(user, "role", ""),
            context={"threshold_mxn": threshold, "month": month},
            ai_decision={}, user_action={},
        )
    except Exception:
        pass
    return {"ok": True, "dev_org_id": dev_org_id, "threshold_mxn": threshold, "month_iso": month}
