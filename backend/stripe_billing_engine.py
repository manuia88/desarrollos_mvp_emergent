"""W3.5 — Stripe Billing Engine.

Test key disponible: STRIPE_API_KEY=sk_test_emergent (env). Production migration
toggles a single env var.

Schema db.stripe_subscriptions:
  { tenant_id, stripe_customer_id, stripe_subscription_id, plan_tier,
    status, current_period_end, monthly_amount_usd, created_at,
    last_synced_at }
  unique tenant_id
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.stripe_billing_engine")

STRIPE_KEY = os.environ.get("STRIPE_API_KEY") or os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

PLAN_PRICES_USD = {
    "pro": 499,
    "enterprise": 2999,  # negotiable; default tier price
}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stripe():
    """Lazy stripe import + key set."""
    import stripe  # type: ignore
    if STRIPE_KEY:
        stripe.api_key = STRIPE_KEY
    return stripe


# ─── Customer + subscription ──────────────────────────────────────────────────

async def create_customer(db, tenant_id: str, email: str, name: str = "") -> Dict[str, Any]:
    if not STRIPE_KEY:
        return {"ok": False, "reason": "stripe_key_missing"}
    try:
        stripe = _stripe()
        cust = stripe.Customer.create(
            email=email,
            name=name or email,
            metadata={"tenant_id": tenant_id, "platform": "DMX"},
        )
        return {"ok": True, "stripe_customer_id": cust["id"], "email": email}
    except Exception as e:
        log.warning(f"[stripe] create_customer failed: {e}")
        return {"ok": False, "reason": "stripe_error", "error": str(e)[:200]}


async def create_subscription(
    db, tenant_id: str, plan_tier: str,
    payment_method_id: Optional[str] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    """Create Stripe Subscription (test mode)."""
    if not STRIPE_KEY:
        return {"ok": False, "reason": "stripe_key_missing"}
    if plan_tier not in PLAN_PRICES_USD:
        return {"ok": False, "reason": "invalid_tier"}

    try:
        stripe = _stripe()
        existing = await db.stripe_subscriptions.find_one(
            {"tenant_id": tenant_id}, {"_id": 0},
        )
        cust_id = existing.get("stripe_customer_id") if existing else None
        if not cust_id:
            cust_email = email or f"{tenant_id}@dmx-test.invalid"
            cust = stripe.Customer.create(
                email=cust_email,
                metadata={"tenant_id": tenant_id, "platform": "DMX"},
            )
            cust_id = cust["id"]

        # Create a price on the fly (test mode) for the requested tier
        amount_usd = PLAN_PRICES_USD[plan_tier]
        price = stripe.Price.create(
            unit_amount=amount_usd * 100,
            currency="usd",
            recurring={"interval": "month"},
            product_data={"name": f"DMX {plan_tier.title()} Monthly API"},
        )

        sub_kwargs: Dict[str, Any] = {
            "customer": cust_id,
            "items": [{"price": price["id"]}],
            "metadata": {"tenant_id": tenant_id, "plan_tier": plan_tier},
        }
        if payment_method_id:
            sub_kwargs["default_payment_method"] = payment_method_id
        else:
            # Test: trial 7 days so test mode does not require payment
            sub_kwargs["trial_period_days"] = 7

        sub = stripe.Subscription.create(**sub_kwargs)
        doc = {
            "tenant_id": tenant_id,
            "stripe_customer_id": cust_id,
            "stripe_subscription_id": sub["id"],
            "plan_tier": plan_tier,
            "status": sub.get("status", "trialing"),
            "current_period_end": _ts_to_iso(sub.get("current_period_end")),
            "monthly_amount_usd": amount_usd,
            "created_at": _iso(),
            "last_synced_at": _iso(),
        }
        await db.stripe_subscriptions.update_one(
            {"tenant_id": tenant_id}, {"$set": doc}, upsert=True,
        )
        return {"ok": True, "subscription": doc}
    except Exception as e:
        log.warning(f"[stripe] create_subscription failed: {e}")
        return {"ok": False, "reason": "stripe_error", "error": str(e)[:200]}


async def cancel_subscription(db, tenant_id: str) -> Dict[str, Any]:
    if not STRIPE_KEY:
        return {"ok": False, "reason": "stripe_key_missing"}
    sub = await db.stripe_subscriptions.find_one(
        {"tenant_id": tenant_id}, {"_id": 0, "stripe_subscription_id": 1},
    )
    if not sub:
        return {"ok": False, "reason": "no_subscription"}
    try:
        stripe = _stripe()
        stripe.Subscription.delete(sub["stripe_subscription_id"])
        await db.stripe_subscriptions.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"status": "canceled", "last_synced_at": _iso()}},
        )
        return {"ok": True}
    except Exception as e:
        log.warning(f"[stripe] cancel failed: {e}")
        return {"ok": False, "reason": "stripe_error", "error": str(e)[:200]}


async def get_subscription_status(db, tenant_id: str) -> Dict[str, Any]:
    sub = await db.stripe_subscriptions.find_one(
        {"tenant_id": tenant_id}, {"_id": 0},
    )
    if not sub:
        return {"available": False, "tenant_id": tenant_id}
    return {"available": True, **sub}


# ─── Webhook handler ──────────────────────────────────────────────────────────

async def webhook_handler(db, event: Dict[str, Any]) -> Dict[str, Any]:
    etype = event.get("type", "")
    data = ((event.get("data") or {}).get("object") or {})
    handled = False

    if etype.startswith("customer.subscription."):
        sub_id = data.get("id")
        cust_id = data.get("customer")
        status = data.get("status")
        period_end = _ts_to_iso(data.get("current_period_end"))
        tenant_id = (data.get("metadata") or {}).get("tenant_id") or ""

        if etype == "customer.subscription.deleted":
            await db.stripe_subscriptions.update_one(
                {"stripe_subscription_id": sub_id},
                {"$set": {"status": "canceled", "last_synced_at": _iso()}},
            )
        else:
            update = {
                "stripe_subscription_id": sub_id,
                "stripe_customer_id": cust_id,
                "status": status,
                "current_period_end": period_end,
                "last_synced_at": _iso(),
            }
            if tenant_id:
                update["tenant_id"] = tenant_id
            await db.stripe_subscriptions.update_one(
                {"stripe_subscription_id": sub_id},
                {"$set": update}, upsert=True,
            )
        handled = True

    elif etype == "invoice.payment_failed":
        cust_id = data.get("customer")
        await db.stripe_subscriptions.update_one(
            {"stripe_customer_id": cust_id},
            {"$set": {"status": "past_due", "last_synced_at": _iso()}},
        )
        # Throttled email
        try:
            await _maybe_email_past_due(db, cust_id)
        except Exception:
            pass
        handled = True

    elif etype == "invoice.paid":
        cust_id = data.get("customer")
        await db.stripe_subscriptions.update_one(
            {"stripe_customer_id": cust_id},
            {"$set": {"status": "active", "last_synced_at": _iso()}},
        )
        handled = True

    return {"ok": True, "handled": handled, "type": etype}


async def _maybe_email_past_due(db, cust_id: str) -> None:
    """Throttle 1/day per tenant."""
    from datetime import timedelta
    last = await db.system_alerts.find_one(
        {"source": "stripe_past_due_email", "details.cust_id": cust_id},
        sort=[("ts", -1)],
    )
    if last and (datetime.now(timezone.utc) - last["ts"]).total_seconds() < 86400:
        return
    await db.system_alerts.insert_one({
        "ts": datetime.now(timezone.utc), "severity": "warning",
        "source": "stripe_past_due_email",
        "message": f"Stripe past_due · customer {cust_id}",
        "details": {"cust_id": cust_id}, "resolved_at": None,
    })
    resend_key = os.environ.get("RESEND_API_KEY")
    alert_email = os.environ.get("ALERT_EMAIL", "admin@desarrollosmx.com")
    if not resend_key:
        return
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json={
                    "from": "DMX Billing <no-reply@desarrollosmx.com>",
                    "to": [alert_email],
                    "subject": f"[DMX] Stripe past_due · {cust_id}",
                    "text": (
                        f"Customer Stripe {cust_id} marcado past_due.\n"
                        "Revisa /superadmin/api-keys o panel Stripe."
                    ),
                },
            )
    except Exception:
        pass


# ─── helpers ──────────────────────────────────────────────────────────────────

def _ts_to_iso(ts: Optional[int]) -> Optional[str]:
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.stripe_subscriptions.create_index(
            "tenant_id", unique=True, name="stripe_tenant_unique",
        )
        await db.stripe_subscriptions.create_index(
            "stripe_subscription_id", name="stripe_sub_id",
        )
        await db.stripe_subscriptions.create_index(
            "stripe_customer_id", name="stripe_cust_id",
        )
    except Exception as e:
        log.warning(f"[stripe] ensure_indexes failed: {e}")
