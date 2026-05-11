"""W3.6 — Phase Z.4 Data Licensing Bundles (Superadmin endpoints).

Schema db.data_licensing_subscriptions:
  { id, tenant_id, bundle_name,
    scope:["drpi","risk_scores","comparables","zone_scores","transaction_network"],
    geo_scope:["cdmx","national","custom"],
    frequency:"daily|weekly|monthly",
    price_usd_annual, status:"trial|active|expired",
    started_at, ends_at, contact_email, sla_uptime_pct,
    custom_terms?, created_at, last_synced_at }
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_data_licensing")

router = APIRouter(tags=["data_licensing"])


# ─── Bundle templates ─────────────────────────────────────────────────────────

BUNDLE_TEMPLATES: List[Dict[str, Any]] = [
    {
        "key": "drpi_monthly_national",
        "name": "DRPI Monthly National",
        "description": (
            "Snapshots DRPI hedonic mensuales · cobertura nacional · "
            "API + export Excel/CSV · SLA 99.5%"
        ),
        "scope": ["drpi"],
        "geo_scope": ["national"],
        "frequency": "monthly",
        "price_usd_annual": 50_000,
        "sla_uptime_pct": 99.5,
        "ideal_for": "Bancos · fondos · researchers macro-real-estate",
    },
    {
        "key": "risk_realtime_cdmx",
        "name": "Risk Scores Real-time CDMX",
        "description": (
            "Risk Score V2 4-dim · refresh diario CDMX · webhook letter-change · "
            "SLA 99.9%"
        ),
        "scope": ["risk_scores"],
        "geo_scope": ["cdmx"],
        "frequency": "daily",
        "price_usd_annual": 200_000,
        "sla_uptime_pct": 99.9,
        "ideal_for": "Aseguradoras · re-aseguradoras · risk underwriting",
    },
    {
        "key": "full_suite_enterprise",
        "name": "Full Suite Enterprise",
        "description": (
            "Todo: DRPI + Risk + Comparables + Zone Scores + Transaction Network · "
            "SLA 99.95% · cuenta dedicada"
        ),
        "scope": [
            "drpi", "risk_scores", "comparables",
            "zone_scores", "transaction_network",
        ],
        "geo_scope": ["national"],
        "frequency": "daily",
        "price_usd_annual": 500_000,
        "sla_uptime_pct": 99.95,
        "ideal_for": "Bancos tier-1 · fondos institucionales internacionales",
    },
    {
        "key": "comparables_api_only",
        "name": "Comparables API Only",
        "description": (
            "Endpoint comparables W3.2 · sin DRPI ni Risk · SLA 99.5%"
        ),
        "scope": ["comparables"],
        "geo_scope": ["national"],
        "frequency": "daily",
        "price_usd_annual": 30_000,
        "sla_uptime_pct": 99.5,
        "ideal_for": "Brokers · valuadores · proptechs",
    },
    {
        "key": "custom",
        "name": "Custom",
        "description": "Bundle personalizado · scope/geo/SLA negociables",
        "scope": [],
        "geo_scope": ["custom"],
        "frequency": "monthly",
        "price_usd_annual": 0,
        "sla_uptime_pct": 99.5,
        "ideal_for": "Casos enterprise especiales",
    },
]


def _bundle_by_key(key: str) -> Optional[Dict[str, Any]]:
    for b in BUNDLE_TEMPLATES:
        if b["key"] == key:
            return b
    return None


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str = "dls") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


def _db(request: Request):
    return request.app.state.db


# ─── Bodies ───────────────────────────────────────────────────────────────────

class CreateSubscriptionBody(BaseModel):
    tenant_id: str
    bundle_key: str   # "drpi_monthly_national" | ... | "custom"
    contact_email: str
    custom_pricing_usd_annual: Optional[float] = None
    custom_scope: Optional[List[str]] = None
    custom_geo_scope: Optional[List[str]] = None
    custom_terms: Optional[str] = None
    duration_months: int = 12
    sla_uptime_pct: Optional[float] = None
    status: str = "trial"


class PatchSubscriptionBody(BaseModel):
    status: Optional[str] = None
    price_usd_annual: Optional[float] = None
    sla_uptime_pct: Optional[float] = None
    ends_at: Optional[str] = None
    custom_terms: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/api/superadmin/data-licensing/bundles")
async def list_bundle_templates(request: Request):
    """List the 5 preset bundle templates."""
    await _sa(request)
    return {"items": BUNDLE_TEMPLATES, "count": len(BUNDLE_TEMPLATES)}


@router.get("/api/superadmin/data-licensing/subscriptions")
async def list_subscriptions(
    request: Request,
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """List active subscriptions + ARR KPIs."""
    await _sa(request)
    db = _db(request)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    cursor = db.data_licensing_subscriptions.find(q, {"_id": 0}) \
        .sort("started_at", -1).limit(limit)
    items = [d async for d in cursor]

    # KPIs
    pipeline_arr = [
        {"$match": {"status": {"$in": ["trial", "active"]}}},
        {"$group": {"_id": None, "arr": {"$sum": "$price_usd_annual"}}},
    ]
    arr_doc = await db.data_licensing_subscriptions.aggregate(pipeline_arr) \
        .to_list(1)
    total_arr_usd = (arr_doc[0]["arr"] if arr_doc else 0) or 0

    pipeline_bundle = [
        {"$match": {"status": {"$in": ["trial", "active"]}}},
        {"$group": {"_id": "$bundle_name", "n": {"$sum": 1}}},
    ]
    by_bundle = {r["_id"] or "—": r["n"]
                 async for r in db.data_licensing_subscriptions.aggregate(pipeline_bundle)}

    upcoming_cutoff = (_now() + timedelta(days=30)).isoformat()
    upcoming_renewals = await db.data_licensing_subscriptions.count_documents(
        {"status": {"$in": ["trial", "active"]},
         "ends_at": {"$lte": upcoming_cutoff}},
    )
    churn_risk = await db.data_licensing_subscriptions.count_documents(
        {"status": "trial",
         "ends_at": {"$lte": upcoming_cutoff}},
    )
    active_count = await db.data_licensing_subscriptions.count_documents(
        {"status": {"$in": ["trial", "active"]}},
    )

    return {
        "items": items,
        "count": len(items),
        "kpis": {
            "total_arr_usd": total_arr_usd,
            "active_subscriptions": active_count,
            "by_bundle": by_bundle,
            "upcoming_renewals_30d": upcoming_renewals,
            "churn_risk_count": churn_risk,
        },
    }


@router.post("/api/superadmin/data-licensing/subscriptions")
async def create_subscription(body: CreateSubscriptionBody, request: Request):
    """Create a new subscription. Sends Resend welcome email (placeholder onboarding deck)."""
    user = await _sa(request)
    db = _db(request)

    template = _bundle_by_key(body.bundle_key)
    if not template:
        raise HTTPException(400, f"bundle_key inválido: {body.bundle_key}")

    is_custom = body.bundle_key == "custom"
    scope = body.custom_scope if is_custom and body.custom_scope else template["scope"]
    geo_scope = body.custom_geo_scope if is_custom and body.custom_geo_scope \
        else template["geo_scope"]
    price = body.custom_pricing_usd_annual if body.custom_pricing_usd_annual \
        else template["price_usd_annual"]
    if is_custom and (not price or price <= 0):
        raise HTTPException(400, "custom requiere custom_pricing_usd_annual > 0")
    sla = body.sla_uptime_pct if body.sla_uptime_pct \
        else template["sla_uptime_pct"]

    duration = max(1, min(60, int(body.duration_months or 12)))
    started = _now()
    ends = started + timedelta(days=duration * 30)

    doc = {
        "id": _new_id("dls"),
        "tenant_id": body.tenant_id,
        "bundle_name": template["name"],
        "bundle_key": body.bundle_key,
        "scope": scope,
        "geo_scope": geo_scope,
        "frequency": template["frequency"],
        "price_usd_annual": price,
        "duration_months": duration,
        "status": body.status if body.status in ("trial", "active") else "trial",
        "started_at": started.isoformat(),
        "ends_at": ends.isoformat(),
        "contact_email": body.contact_email,
        "sla_uptime_pct": sla,
        "custom_terms": body.custom_terms,
        "created_at": _iso(),
        "last_synced_at": _iso(),
    }
    await db.data_licensing_subscriptions.insert_one(dict(doc))
    out = dict(doc)
    out.pop("_id", None)

    # Send Resend welcome email (placeholder onboarding deck)
    email_status = "skipped"
    try:
        email_status = await _send_welcome_email(out)
    except Exception as e:
        log.warning(f"[dls] welcome email failed: {e}")
        email_status = f"error: {str(e)[:120]}"
    out["welcome_email_status"] = email_status

    # Audit
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "licensing_subscription", out["id"],
            before=None,
            after={
                "tenant_id": body.tenant_id,
                "bundle_key": body.bundle_key,
                "price_usd_annual": price,
                "status": doc["status"],
            },
            request=request,
        )
    except Exception:
        pass

    return out


@router.patch("/api/superadmin/data-licensing/subscriptions/{sub_id}")
async def patch_subscription(
    sub_id: str, body: PatchSubscriptionBody, request: Request,
):
    user = await _sa(request)
    db = _db(request)

    update: Dict[str, Any] = {"last_synced_at": _iso()}
    if body.status is not None:
        if body.status not in ("trial", "active", "expired", "canceled"):
            raise HTTPException(400, "status inválido")
        update["status"] = body.status
    if body.price_usd_annual is not None:
        update["price_usd_annual"] = body.price_usd_annual
    if body.sla_uptime_pct is not None:
        update["sla_uptime_pct"] = body.sla_uptime_pct
    if body.ends_at is not None:
        update["ends_at"] = body.ends_at
    if body.custom_terms is not None:
        update["custom_terms"] = body.custom_terms

    if len(update) == 1:
        raise HTTPException(400, "Sin campos a actualizar")

    res = await db.data_licensing_subscriptions.update_one(
        {"id": sub_id}, {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Subscription no encontrada")

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "licensing_subscription", sub_id,
            before=None, after=update, request=request,
        )
    except Exception:
        pass

    return {"ok": True, "id": sub_id, "updated": update}


# ─── Resend welcome email (placeholder template) ─────────────────────────────

async def _send_welcome_email(sub: Dict[str, Any]) -> str:
    """Send Resend welcome email with onboarding deck placeholder."""
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        return "no_resend_key"
    if not sub.get("contact_email"):
        return "no_contact_email"
    try:
        import httpx
        scope_list = ", ".join(sub.get("scope") or []) or "—"
        geo_list = ", ".join(sub.get("geo_scope") or []) or "—"
        body_html = f"""
        <h2 style="font-family:sans-serif;color:#06080F">Bienvenido a {sub.get('bundle_name')}</h2>
        <p style="font-family:sans-serif;color:#3a3a3a;line-height:1.6">
          Hola,<br><br>
          Tu suscripción al bundle <b>{sub.get('bundle_name')}</b> de
          DesarrollosMX está activa.
        </p>
        <ul style="font-family:sans-serif;color:#3a3a3a">
          <li><b>Scope:</b> {scope_list}</li>
          <li><b>Geografía:</b> {geo_list}</li>
          <li><b>Frecuencia:</b> {sub.get('frequency')}</li>
          <li><b>SLA Uptime:</b> {sub.get('sla_uptime_pct')}%</li>
          <li><b>Vigencia:</b> {sub.get('started_at', '')[:10]} → {sub.get('ends_at','')[:10]}</li>
        </ul>
        <p style="font-family:sans-serif;color:#3a3a3a">
          Próximos pasos:
        </p>
        <ol style="font-family:sans-serif;color:#3a3a3a">
          <li>Recibirás tu API key vía canal seguro en las próximas 24h</li>
          <li>Onboarding deck (PDF) será compartido en la sesión kickoff</li>
          <li>Slack channel privado para soporte enterprise</li>
        </ol>
        <p style="font-family:sans-serif;color:#888;font-size:12px">
          DesarrollosMX · Spatial Decision Intelligence Platform LATAM
        </p>
        """
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json={
                    "from": "DMX Licensing <licensing@desarrollosmx.com>",
                    "to": [sub["contact_email"]],
                    "subject": (
                        f"[DMX] Bienvenido · {sub.get('bundle_name')} · "
                        f"Tenant {sub.get('tenant_id')}"
                    ),
                    "html": body_html,
                },
            )
        if r.status_code in (200, 202):
            return "sent"
        return f"resend_error_{r.status_code}"
    except Exception as e:
        log.warning(f"[dls] resend send failed: {e}")
        return f"exception:{str(e)[:120]}"
