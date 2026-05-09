"""W3.8 — Cross-sell Routes (buyer-facing).

All endpoints require buyer auth.
Partners status="pending_partnership" are NEVER shown to buyers.

Endpoints:
  GET  /api/comprador/cross-sell/offers          — match active partner offers
  POST /api/comprador/cross-sell/offers/{id}/click — track click
  POST /api/comprador/cross-sell/offers/{id}/fill  — submit lead form
  GET  /api/comprador/cross-sell/my-offers         — buyer's offer history
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

import cross_sell_engine as cs

log = logging.getLogger("dmx.routes_cross_sell")

router = APIRouter(tags=["cross_sell"])


def _db(request: Request):
    return request.app.state.db


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(403, "Acceso solo para compradores autenticados")
    return user


# ─── Bodies ───────────────────────────────────────────────────────────────────

class FillBody(BaseModel):
    # Common
    email: str
    phone: str
    # Mortgage-specific
    ingreso_mensual_mxn: Optional[float] = None
    plazo_anios: Optional[int] = None
    enganche_mxn: Optional[float] = None
    # Insurance-specific
    tipo_cobertura: Optional[str] = None
    # Moving-specific
    fecha_mudanza: Optional[str] = None
    # Generic
    comentarios: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/comprador/cross-sell/offers")
async def get_cross_sell_offers(
    request: Request,
    property_id: Optional[str] = Query(None),
    user=Depends(_require_buyer),
):
    """Return matched active partner offers for a property."""
    db = _db(request)
    pid = unquote(property_id or "unknown")

    # Get buyer profile from user record
    buyer_doc = await db.users.find_one({"id": user.user_id}, {"_id": 0, "budget": 1, "stage": 1})
    bp = {
        "budget": (buyer_doc or {}).get("budget"),
        "stage": (buyer_doc or {}).get("stage", "searching"),
    }
    # Get property price
    prop = await db.properties.find_one({"id": pid}, {"_id": 0, "price": 1})
    pf = {"price": (prop or {}).get("price")}

    offers = await cs.match_offers(
        db,
        buyer_id=user.user_id,
        property_id=pid,
        buyer_profile=bp,
        property_features=pf,
        source="property_detail",
    )

    # Strip internal fields before returning
    clean = []
    for o in offers:
        clean.append({
            "id": o["id"],
            "partner_name": o.get("partner_name", ""),
            "partner_type": o.get("partner_type", ""),
            "offer_type": o.get("offer_type", ""),
            "offer_status": o.get("offer_status", ""),
            "product_offerings": o.get("product_offerings", []),
            "propensity_score": o.get("propensity_score"),
            "presented_at": o.get("presented_at"),
        })
    return {"offers": clean, "count": len(clean)}


@router.post("/api/comprador/cross-sell/offers/{offer_id}/click")
async def click_offer(
    offer_id: str,
    request: Request,
    user=Depends(_require_buyer),
):
    db = _db(request)
    oid = unquote(offer_id)
    result = await cs.track_offer_event(db, oid, "clicked")
    if not result.get("ok"):
        raise HTTPException(404, result.get("reason", "offer_not_found"))
    return {
        "ok": True,
        "message": "Tu solicitud será enviada al partner. Te contactarán en 24-48 horas.",
    }


@router.post("/api/comprador/cross-sell/offers/{offer_id}/fill")
async def fill_offer(
    offer_id: str,
    body: FillBody,
    request: Request,
    user=Depends(_require_buyer),
):
    db = _db(request)
    oid = unquote(offer_id)

    # Store form data (only what buyer explicitly provided — consent at submit)
    form_data: Dict[str, Any] = {
        "email": body.email.strip().lower(),
        "phone": body.phone.strip(),
    }
    if body.ingreso_mensual_mxn:
        form_data["ingreso_mensual_mxn"] = body.ingreso_mensual_mxn
    if body.plazo_anios:
        form_data["plazo_anios"] = body.plazo_anios
    if body.enganche_mxn:
        form_data["enganche_mxn"] = body.enganche_mxn
    if body.tipo_cobertura:
        form_data["tipo_cobertura"] = body.tipo_cobertura
    if body.fecha_mudanza:
        form_data["fecha_mudanza"] = body.fecha_mudanza
    if body.comentarios:
        form_data["comentarios"] = body.comentarios[:500]

    # Update offer with form data + lead_captured status
    await cs.track_offer_event(
        db, oid, "lead_captured",
        metadata={"lead_form_data": form_data},
    )

    # Look up partner name for confirmation
    offer = await db.partner_offers.find_one({"id": oid}, {"_id": 0, "partner_id": 1})
    partner_name = ""
    if offer:
        partner = await db.partners.find_one({"id": offer["partner_id"]}, {"_id": 0, "name": 1})
        if partner:
            partner_name = partner["name"]

    # Send lead email to partner
    lead_result = await cs.send_lead_to_partner(db, oid)

    # Send confirmation to buyer
    await cs.send_buyer_confirmation_email(body.email, partner_name, oid)

    return {
        "ok": True,
        "offer_id": oid,
        "message": (
            f"Tu solicitud fue enviada a {partner_name or 'nuestro partner'}. "
            "Te contactarán en 24-48 horas."
        ),
        "lead_sent": lead_result.get("ok"),
        "email_stub": lead_result.get("stub", False),
    }


@router.get("/api/comprador/cross-sell/my-offers")
async def my_offers(
    request: Request,
    user=Depends(_require_buyer),
    limit: int = Query(20, ge=1, le=100),
):
    db = _db(request)
    buyer_id_hash = cs._hash_id(user.user_id)
    cursor = db.partner_offers.find(
        {"buyer_id_hash": buyer_id_hash, "_demo": {"$ne": True}},
        {"_id": 0, "buyer_id_hash": 0, "property_id_hash": 0, "lead_form_data": 0,
         "partner_contact_email": 0},
    ).sort("presented_at", -1).limit(limit)
    items = [d async for d in cursor]
    return {"items": items, "count": len(items)}
