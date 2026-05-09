"""W3.8 — Cross-sell Intelligence Engine.

Propensity heuristics + offer matching + lead lifecycle + revenue tracking.
NO real APIs to banks/notarías — honest cold-start heuristics only.
Partnerships negotiated off-platform by founder. DMX = lead router.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.cross_sell_engine")

PARTNER_TYPES = {
    "mortgage_broker", "insurance_broker", "notaria",
    "avaluo", "moving", "construction",
}
OFFER_STATUSES = {
    "presented", "clicked", "lead_captured", "sent_to_partner",
    "partner_contacted_buyer", "in_process", "approved", "closed",
    "rejected", "expired",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str = "p") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _hash_id(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# ─── Index management ─────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.partners.create_index([("type", 1), ("status", 1)])
        await db.partners.create_index([("status", 1)])
        await db.partner_offers.create_index([("buyer_id_hash", 1), ("presented_at", -1)])
        await db.partner_offers.create_index(
            [("partner_id", 1), ("offer_status", 1), ("presented_at", -1)]
        )
        await db.partner_offers.create_index([("property_id_hash", 1)])
        await db.partner_revenue_events.create_index([("partner_id", 1), ("event_at", -1)])
        await db.partner_revenue_events.create_index([("partner_offer_id", 1)])
        log.info("[cross_sell] indexes ensured")
    except Exception as exc:
        log.warning("[cross_sell] index warning: %s", exc)


# ─── Seed partners ────────────────────────────────────────────────────────────

_SEED_PARTNERS = [
    {
        "name": "Bróker Hipotecario Master",
        "type": "mortgage_broker",
        "contact_email": "hipotecas@partner.placeholder.dmx",
        "commission_pct": 0.75,
        "revenue_share_pct": 0.25,
        "notes": "Multi-banco vía bróker. Objetivo H2: SOC Asesores (socasesores.com · 30+ instituciones).",
        "product_offerings": [{
            "name": "Hipoteca residencial",
            "description": "Crédito hipotecario multi-banco. Plazo 5-25 años. Sin exclusividad de banco.",
            "eligibility_rules": "Ingreso comprobable ≥ 3x mensualidad estimada. Historial Buró aceptable.",
        }],
    },
    {
        "name": "Cotizador Multi-Aseguradora",
        "type": "insurance_broker",
        "contact_email": "seguros@partner.placeholder.dmx",
        "commission_pct": 15.0,
        "revenue_share_pct": 5.0,
        "notes": "Vida + médico + hogar + auto. Objetivo H2: SOC Asesores o broker independiente.",
        "product_offerings": [{
            "name": "Seguro de vida y hogar",
            "description": "Paquete protección comprador inmobiliario. Multi-aseguradora.",
            "eligibility_rules": "Edad 18-65. Propiedad principal o inversión.",
        }],
    },
    {
        "name": "Notaría Partner CDMX",
        "type": "notaria",
        "contact_email": "notaria@partner.placeholder.dmx",
        "commission_pct": 7.5,
        "revenue_share_pct": 3.0,
        "notes": "Búsqueda RPP + escrituración. Objetivo H2: 1 notaría CDMX titular firmado.",
        "product_offerings": [{
            "name": "Servicio de escrituración",
            "description": "Verificación RPP + escritura compraventa + registro.",
            "eligibility_rules": "Propiedad ubicada en CDMX o Edomex.",
        }],
    },
    {
        "name": "Avalúo Certificado",
        "type": "avaluo",
        "contact_email": "avaluo@partner.placeholder.dmx",
        "commission_pct": 10.0,
        "revenue_share_pct": 4.0,
        "notes": "Perito independiente certificado SHF/INDAABIN. Objetivo H2: 1-2 peritos red CDMX.",
        "product_offerings": [{
            "name": "Avalúo comercial",
            "description": "Avalúo por perito certificado. Requisito para crédito hipotecario.",
            "eligibility_rules": "Propiedad en CDMX y Zona Metropolitana.",
        }],
    },
    {
        "name": "Servicios Post-Cierre",
        "type": "moving",
        "contact_email": "mudanza@partner.placeholder.dmx",
        "commission_pct": 7.5,
        "revenue_share_pct": 2.5,
        "notes": "Mudanzas + cerrajería + interiorismo. Objetivo H2: 1-2 partners locales CDMX.",
        "product_offerings": [{
            "name": "Paquete mudanza",
            "description": "Empaque, flete y armado. Cobertura CDMX + Edomex.",
            "eligibility_rules": "Disponible después del cierre de escritura.",
        }],
    },
]


async def seed_initial_partners(db) -> int:
    """Insert 5 seed partners idempotently (by name). Returns count inserted."""
    inserted = 0
    for sp in _SEED_PARTNERS:
        existing = await db.partners.find_one({"name": sp["name"]}, {"_id": 0, "id": 1})
        if not existing:
            doc: Dict[str, Any] = {
                "id": _new_id("prt"),
                "status": "pending_partnership",
                "logo_url": None,
                "website": None,
                "contact_phone": None,
                "activated_at": None,
                "webhook_hmac_secret": secrets.token_hex(32),
                "created_at": _iso(),
                "revenue_share_pct": sp.get("revenue_share_pct"),
                **{k: v for k, v in sp.items() if k != "revenue_share_pct"},
            }
            await db.partners.insert_one(doc)
            doc.pop("_id", None)
            inserted += 1
    log.info("[cross_sell] seed: %d new partners inserted", inserted)
    return inserted


async def seed_demo_offers(db) -> None:
    """Seed 5 demo offers in different funnel stages for analytics.
    Idempotent — only runs when collection is empty."""
    existing = await db.partner_offers.count_documents({})
    if existing >= 5:
        return

    partners = [p async for p in db.partners.find({}, {"_id": 0, "id": 1, "type": 1})]
    if not partners:
        return

    stages = ["clicked", "lead_captured", "sent_to_partner", "partner_contacted_buyer", "closed"]
    buyer_hash = _hash_id("demo_buyer_001")
    prop_hash = _hash_id("DEMO_PROP_001")

    for i, stage in enumerate(stages):
        p = partners[i % len(partners)]
        now = _now() - timedelta(days=i * 3)
        doc = {
            "id": _new_id("off"),
            "partner_id": p["id"],
            "partner_type": p["type"],
            "buyer_id_hash": buyer_hash,
            "property_id_hash": prop_hash,
            "offer_type": f"{p['type'].replace('_broker','')}_lead",
            "offer_amount_mxn": None,
            "offer_status": stage,
            "presented_at": (now - timedelta(days=5)).isoformat(),
            "last_status_at": now.isoformat(),
            "attribution": {"source": "property_detail"},
            "propensity_score": 0.55 - i * 0.05,
            "expected_revenue_dmx_mxn": 1800.00 - i * 150,
            "lead_form_data": {"email": "demo@test.com", "phone": "+52 55 0000 0000"} if i >= 1 else None,
            "partner_contact_email_sent_at": now.isoformat() if stage in ("sent_to_partner", "partner_contacted_buyer", "closed") else None,
            "_demo": True,
        }
        await db.partner_offers.insert_one(doc)
        doc.pop("_id", None)

    log.info("[cross_sell] 5 demo offers seeded for analytics")


# ─── Propensity + matching ────────────────────────────────────────────────────

async def predict_propensity_cold_start(
    db,
    buyer_profile: dict,
    partner_type: str,
    property_features: dict,
) -> float:
    """Cold-start heuristics. NO ML until production data accumulates."""
    budget = buyer_profile.get("budget") or 0
    price = property_features.get("price") or 0
    stage = buyer_profile.get("stage", "searching")

    if partner_type == "mortgage_broker":
        return 0.70 if (budget > 0 and price > 0 and budget < price) else 0.45

    if partner_type == "insurance_broker":
        return 0.40

    if partner_type == "notaria":
        return 0.60 if stage in ("offer_made", "in_escrow", "closing") else 0.35

    if partner_type == "avaluo":
        return 0.50 if stage in ("evaluating", "offer_made") else 0.30

    if partner_type == "moving":
        return 0.35 if stage in ("closing", "closed") else 0.15

    return 0.20


async def match_offers(
    db,
    buyer_id: str,
    property_id: str,
    buyer_profile: Optional[dict] = None,
    property_features: Optional[dict] = None,
    max_offers: int = 3,
    source: str = "property_detail",
) -> List[dict]:
    """Match top max_offers ACTIVE partners by propensity × commission_pct.

    Only status='active' partners are shown to buyers.
    """
    buyer_id_hash = _hash_id(buyer_id)
    property_id_hash = _hash_id(property_id)
    bp = buyer_profile or {}
    pf = property_features or {}

    cursor = db.partners.find({"status": "active"}, {"_id": 0})
    partners = [p async for p in cursor]
    if not partners:
        return []

    scored = []
    for p in partners:
        propensity = await predict_propensity_cold_start(db, bp, p["type"], pf)
        commission = p.get("commission_pct") or 0.5
        score = propensity * (commission / 10.0)
        expected_rev = (pf.get("price") or 3_000_000) * (propensity * (commission / 100.0))
        scored.append((score, p, propensity, expected_rev))

    scored.sort(key=lambda x: x[0], reverse=True)

    offers = []
    for _, partner, propensity, expected_rev in scored[:max_offers]:
        # Return existing offer if presented in last 7 days
        cutoff = (_now() - timedelta(days=7)).isoformat()
        existing = await db.partner_offers.find_one(
            {
                "partner_id": partner["id"],
                "buyer_id_hash": buyer_id_hash,
                "property_id_hash": property_id_hash,
                "presented_at": {"$gte": cutoff},
            },
            {"_id": 0},
        )
        if existing:
            offers.append(existing)
            continue

        offer_doc: Dict[str, Any] = {
            "id": _new_id("off"),
            "partner_id": partner["id"],
            "partner_name": partner["name"],
            "partner_type": partner["type"],
            "partner_contact_email": partner.get("contact_email", ""),
            "product_offerings": partner.get("product_offerings", []),
            "buyer_id_hash": buyer_id_hash,
            "property_id_hash": property_id_hash,
            "offer_type": f"{partner['type'].replace('_broker', '')}_lead",
            "offer_amount_mxn": None,
            "offer_status": "presented",
            "presented_at": _iso(),
            "last_status_at": _iso(),
            "attribution": {"source": source},
            "propensity_score": round(propensity, 3),
            "expected_revenue_dmx_mxn": round(expected_rev, 2),
            "lead_form_data": None,
            "partner_contact_email_sent_at": None,
        }
        await db.partner_offers.insert_one(offer_doc)
        offer_doc.pop("_id", None)
        offers.append(offer_doc)

    return offers


async def track_offer_event(
    db,
    offer_id: str,
    new_status: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Update offer status + last_status_at."""
    update: Dict[str, Any] = {
        "$set": {"offer_status": new_status, "last_status_at": _iso()}
    }
    if metadata:
        for k, v in metadata.items():
            update["$set"][k] = v
    res = await db.partner_offers.update_one({"id": offer_id}, update)
    if res.matched_count == 0:
        return {"ok": False, "reason": "offer_not_found"}
    return {"ok": True, "offer_id": offer_id, "new_status": new_status}


async def send_lead_to_partner(db, offer_id: str) -> dict:
    """Fire Resend email to partner.contact_email with lead form data."""
    offer = await db.partner_offers.find_one({"id": offer_id}, {"_id": 0})
    if not offer:
        return {"ok": False, "reason": "offer_not_found"}
    partner = await db.partners.find_one({"id": offer["partner_id"]}, {"_id": 0})
    if not partner:
        return {"ok": False, "reason": "partner_not_found"}

    form_data = offer.get("lead_form_data") or {}
    buyer_email = form_data.get("email", "")
    buyer_phone = form_data.get("phone", "")
    resend_key = os.environ.get("RESEND_API_KEY", "")

    if not resend_key or resend_key.startswith("re_placeholder"):
        log.info("[cross_sell] Resend stub — lead for offer %s to %s", offer_id, partner["contact_email"])
        await db.partner_offers.update_one(
            {"id": offer_id},
            {"$set": {
                "partner_contact_email_sent_at": _iso(),
                "offer_status": "sent_to_partner",
                "last_status_at": _iso(),
            }},
        )
        return {"ok": True, "stub": True}

    form_html = "".join(
        f"<tr><td><strong>{k}</strong></td><td>{v}</td></tr>"
        for k, v in form_data.items()
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;color:#1a1a2e">
      <h2 style="color:#6366f1">Nuevo lead DMX — {partner['name']}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td><strong>ID oferta</strong></td><td><code>{offer_id}</code></td></tr>
        <tr><td><strong>Tipo</strong></td><td>{offer.get('offer_type','')}</td></tr>
        <tr><td><strong>Email comprador</strong></td><td>{buyer_email}</td></tr>
        <tr><td><strong>Teléfono</strong></td><td>{buyer_phone}</td></tr>
        {form_html}
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">
        Lead enviado por DesarrollosMX · {_iso()}
      </p>
    </div>
    """

    try:
        import httpx
        payload = {
            "from": "DesarrollosMX <leads@desarrollosmx.com>",
            "to": [partner["contact_email"]],
            "subject": f"Nuevo lead DMX: {offer.get('offer_type','lead')} · {buyer_email}",
            "html": html_body,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        ok = r.status_code < 300
        if ok:
            await db.partner_offers.update_one(
                {"id": offer_id},
                {"$set": {
                    "partner_contact_email_sent_at": _iso(),
                    "offer_status": "sent_to_partner",
                    "last_status_at": _iso(),
                }},
            )
        return {"ok": ok, "status_code": r.status_code}
    except Exception as exc:
        log.warning("[cross_sell] send_lead_to_partner error: %s", exc)
        return {"ok": False, "error": str(exc)}


async def send_buyer_confirmation_email(
    buyer_email: str, partner_name: str, offer_id: str
) -> dict:
    """Send confirmation email to buyer that their request was sent."""
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key or resend_key.startswith("re_placeholder"):
        return {"ok": True, "stub": True}

    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;color:#1a1a2e">
      <h2 style="color:#6366f1">Solicitud enviada · {partner_name}</h2>
      <p>Tu solicitud fue recibida. <strong>{partner_name}</strong> te contactará en
      un plazo de <strong>24-48 horas</strong> por el email o teléfono que proporcionaste.</p>
      <p style="color:#6b7280;font-size:12px">Folio: <code>{offer_id}</code></p>
      <p style="color:#6b7280;font-size:12px">DesarrollosMX · Servicios para tu compra</p>
    </div>
    """
    try:
        import httpx
        payload = {
            "from": "DesarrollosMX <servicios@desarrollosmx.com>",
            "to": [buyer_email],
            "subject": f"Tu solicitud fue enviada a {partner_name}",
            "html": html_body,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        return {"ok": r.status_code < 300}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def record_revenue_event(
    db,
    partner_offer_id: str,
    revenue_mxn: float,
    source: str = "manual_admin",
    admin_user_id: str = "",
) -> dict:
    """Record revenue event. Updates offer to 'closed'."""
    offer = await db.partner_offers.find_one({"id": partner_offer_id}, {"_id": 0})
    if not offer:
        raise ValueError(f"Offer {partner_offer_id} no encontrado")

    event_doc: Dict[str, Any] = {
        "id": _new_id("rev"),
        "partner_offer_id": partner_offer_id,
        "partner_id": offer["partner_id"],
        "buyer_id_hash": offer["buyer_id_hash"],
        "event_type": "closed",
        "revenue_dmx_mxn": round(revenue_mxn, 2),
        "currency": "MXN",
        "event_at": _iso(),
        "attribution_chain": {
            "offer_type": offer.get("offer_type"),
            "propensity_score": offer.get("propensity_score"),
            "source": offer.get("attribution", {}).get("source"),
        },
        "audit_trail": {
            "created_by": admin_user_id,
            "source": source,
            "created_at": _iso(),
        },
        "manual_ingest_by": admin_user_id if source == "manual_admin" else None,
        "source": source,
    }
    await db.partner_revenue_events.insert_one(event_doc)
    event_doc.pop("_id", None)

    await db.partner_offers.update_one(
        {"id": partner_offer_id},
        {"$set": {"offer_status": "closed", "last_status_at": _iso()}},
    )
    return event_doc


# ─── HMAC webhook validation ──────────────────────────────────────────────────

def verify_webhook_hmac(secret: str, body: bytes, signature: str) -> bool:
    """Validate HMAC-SHA256 signature for incoming partner webhooks."""
    try:
        expected = hmac.new(secret.encode(), body, "sha256").hexdigest()
        return hmac.compare_digest(expected, signature or "")
    except Exception:
        return False


# ─── Funnel analytics ─────────────────────────────────────────────────────────

FUNNEL_STAGES = [
    "presented", "clicked", "lead_captured", "sent_to_partner",
    "partner_contacted_buyer", "closed",
]


async def compute_funnel_analytics(db, days: int = 30) -> dict:
    """Compute cross-sell funnel conversion rates + revenue per partner."""
    since = (_now() - timedelta(days=days)).isoformat()

    funnel: Dict[str, int] = {}
    for stage in FUNNEL_STAGES:
        count = await db.partner_offers.count_documents({
            "presented_at": {"$gte": since},
            "offer_status": {"$in": [stage] + FUNNEL_STAGES[FUNNEL_STAGES.index(stage):]},
        })
        funnel[stage] = count

    # Revenue per partner (last N days)
    cursor = db.partners.find({"status": "active"}, {"_id": 0, "id": 1, "name": 1, "type": 1})
    partners = [p async for p in cursor]
    revenue_by_partner = []
    for p in partners:
        rev = await db.partner_revenue_events.count_documents(
            {"partner_id": p["id"], "event_at": {"$gte": since}}
        )
        rev_pipeline = [
            {"$match": {"partner_id": p["id"], "event_at": {"$gte": since}}},
            {"$group": {"_id": None, "total": {"$sum": "$revenue_dmx_mxn"}}},
        ]
        rev_total = 0
        async for row in db.partner_revenue_events.aggregate(rev_pipeline):
            rev_total = row.get("total", 0)
        revenue_by_partner.append({
            "partner_id": p["id"],
            "partner_name": p["name"],
            "partner_type": p["type"],
            "revenue_events": rev,
            "revenue_dmx_mxn": rev_total,
        })

    # Top properties driving leads
    pipeline = [
        {"$match": {"presented_at": {"$gte": since}}},
        {"$group": {"_id": "$property_id_hash", "leads": {"$sum": 1}}},
        {"$sort": {"leads": -1}},
        {"$limit": 10},
    ]
    top_properties = [
        {"property_id_hash": row["_id"], "leads": row["leads"]}
        async for row in db.partner_offers.aggregate(pipeline)
    ]

    total_presented = funnel.get("presented", 0)
    return {
        "funnel": funnel,
        "conversion_rates": {
            stage: round(funnel[stage] / total_presented * 100, 1) if total_presented > 0 else 0
            for stage in FUNNEL_STAGES
        },
        "revenue_by_partner": revenue_by_partner,
        "top_properties": top_properties,
        "days": days,
        "computed_at": _iso(),
    }
