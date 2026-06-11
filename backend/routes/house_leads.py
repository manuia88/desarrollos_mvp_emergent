"""Inmobiliaria DMX · pool de leads de marketplace (dmx_house)
==============================================================
Cierra el ciclo comprador→MI inmobiliaria (regla inviolable: el lead de marketplace
que pide visita NO va al dev, va a mi inmobiliaria). El founder eligió "los dos":

  • SUPERADMIN (dueño): ve TODO el pool y asigna/reasigna a un asesor de la casa.
  • ASESOR de la casa: ve lo que le tocó + el pool sin dueño que puede tomar; acepta
    (→ contacta al comprador) o devuelve al pool.

Reusa house_pool_engine (round-robin) · no duplica CRM (es la bandeja de la casa).
Aislamiento: el dev de la propiedad es solo metadato; el dueño del lead es dmx_house.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from house_pool_engine import (
    DMX_HOUSE_ORG, OPEN_STATES, assign_house_lead, house_asesores,
    is_house_asesor_doc,
)

log = logging.getLogger("dmx.house_leads")
router = APIRouter(tags=["house_leads"])

_ST = {"requested": "En el pool", "assigned": "Asignada", "accepted": "Confirmada",
       "declined": "Descartada"}


def _db(req: Request):
    return req.app.state.db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prop_name(pid: str, fallback: Optional[str]) -> str:
    if fallback:
        return fallback
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(pid)
        if d:
            return d.get("name") or pid
    except Exception:
        pass
    return pid or "—"


async def _buyer_info(db, doc) -> Dict[str, Any]:
    name, email, phone = None, doc.get("email"), None
    uid = doc.get("user_id")
    try:
        if uid:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
            if u:
                name, email, phone = u.get("name"), email or u.get("email"), u.get("phone")
        if not name and email:
            l = await db.leads.find_one({"email": email}, {"_id": 0, "name": 1, "phone": 1})
            if l:
                name, phone = l.get("name"), phone or l.get("phone")
    except Exception:
        pass
    return {"name": name or email or "Comprador", "email": email, "phone": phone}


async def _asesor_name(db, asesor_id: Optional[str]) -> Optional[str]:
    if not asesor_id:
        return None
    try:
        u = await db.users.find_one({"user_id": asesor_id}, {"_id": 0, "name": 1, "email": 1})
        if u:
            return u.get("name") or u.get("email")
    except Exception:
        pass
    return asesor_id


async def _row(db, d) -> Dict[str, Any]:
    return {
        "id": d.get("id"), "property_id": d.get("property_id"),
        "property_name": _prop_name(d.get("property_id"), d.get("property_name")),
        "status": d.get("status") or "requested",
        "status_label": _ST.get(d.get("status") or "requested", "En el pool"),
        "buyer": await _buyer_info(db, d),
        "assigned_asesor_id": d.get("assigned_asesor_id"),
        "assigned_asesor_name": await _asesor_name(db, d.get("assigned_asesor_id")),
        "created_at": d.get("created_at"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# SUPERADMIN · el dueño ve TODO el pool y asigna
# ══════════════════════════════════════════════════════════════════════════════
async def _su(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)


@router.get("/api/superadmin/inmobiliaria/leads")
async def su_list(request: Request, status: str = "all"):
    """Todo el pool de mi inmobiliaria (leads de marketplace). status=all|open|<estado>."""
    await _su(request)
    db = _db(request)
    q: Dict[str, Any] = {"owner_org": DMX_HOUSE_ORG}
    if status == "open":
        q["status"] = {"$in": list(OPEN_STATES)}
    elif status != "all":
        q["status"] = status
    rows: List[Dict[str, Any]] = []
    try:
        async for d in db.visit_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(300):
            rows.append(await _row(db, d))
    except Exception as e:
        log.warning("[house] su_list fail-open: %s", e)
    sin_dueno = sum(1 for r in rows if not r["assigned_asesor_id"] and r["status"] in OPEN_STATES)
    lectura = (f"{len(rows)} leads en tu inmobiliaria"
               + (f" · {sin_dueno} sin asesor (asígnalos)" if sin_dueno else " · todos con asesor"))
    return {"ok": True, "total": len(rows), "sin_asesor": sin_dueno, "leads": rows, "lectura": lectura}


@router.get("/api/superadmin/inmobiliaria/asesores")
async def su_asesores(request: Request):
    """Asesores de la casa (para el selector de asignación)."""
    await _su(request)
    ases = await house_asesores(_db(request))
    return {"ok": True, "asesores": [{"user_id": a["user_id"], "name": a.get("name") or a.get("email")} for a in ases]}


class AssignIn(BaseModel):
    asesor_id: Optional[str] = None   # None → round-robin automático


@router.post("/api/superadmin/inmobiliaria/leads/{lead_id}/assign")
async def su_assign(lead_id: str, payload: AssignIn, request: Request):
    """Asigna o reasigna un lead a un asesor de la casa. Sin asesor_id → round-robin."""
    await _su(request)
    db = _db(request)
    doc = await db.visit_requests.find_one({"id": lead_id, "owner_org": DMX_HOUSE_ORG}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Lead no encontrado en tu inmobiliaria")
    if payload.asesor_id:
        await db.visit_requests.update_one(
            {"id": lead_id}, {"$set": {"assigned_asesor_id": payload.asesor_id, "status": "assigned",
                                       "assigned_at": _now()}})
        who = await _asesor_name(db, payload.asesor_id)
    else:
        aid = await assign_house_lead(db, lead_id)
        who = await _asesor_name(db, aid)
    return {"ok": True, "assigned_to": who or "pool", "mensaje": f"Asignado a {who}." if who else "No hay asesores de la casa — quedó en el pool."}


# ══════════════════════════════════════════════════════════════════════════════
# ASESOR de la casa · ve lo suyo + el pool · toma / acepta / devuelve
# ══════════════════════════════════════════════════════════════════════════════
async def _advisor(request: Request):
    from routes.advisor import require_advisor
    return await require_advisor(request)


def _is_house(user) -> bool:
    return is_house_asesor_doc({"role": getattr(user, "role", None),
                                "tenant_id": getattr(user, "tenant_id", None)})


@router.get("/api/asesor/inmobiliaria/solicitudes")
async def asesor_list(request: Request):
    """Lo que me tocó + el pool sin dueño que puedo tomar (solo asesores de la casa)."""
    user = await _advisor(request)
    db = _db(request)
    if not _is_house(user):
        return {"ok": True, "mias": [], "pool": [], "es_de_la_casa": False,
                "lectura": "Las solicitudes de visita del marketplace son de la inmobiliaria DMX."}
    mias, pool = [], []
    try:
        async for d in db.visit_requests.find(
                {"owner_org": DMX_HOUSE_ORG, "assigned_asesor_id": user.user_id,
                 "status": {"$in": ["assigned", "accepted"]}},
                {"_id": 0}).sort("created_at", -1).limit(100):
            mias.append(await _row(db, d))
        async for d in db.visit_requests.find(
                {"owner_org": DMX_HOUSE_ORG, "status": "requested",
                 "$or": [{"assigned_asesor_id": None}, {"assigned_asesor_id": {"$exists": False}}]},
                {"_id": 0}).sort("created_at", -1).limit(100):
            pool.append(await _row(db, d))
    except Exception as e:
        log.warning("[house] asesor_list fail-open: %s", e)
    lectura = (f"Tienes {len(mias)} visita(s) asignada(s)"
               + (f" y {len(pool)} en el pool para tomar." if pool else "."))
    return {"ok": True, "es_de_la_casa": True, "mias": mias, "pool": pool, "lectura": lectura}


async def _my_lead(db, user, lead_id, *, must_be_mine: bool):
    doc = await db.visit_requests.find_one({"id": lead_id, "owner_org": DMX_HOUSE_ORG}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Solicitud no encontrada")
    if must_be_mine and doc.get("assigned_asesor_id") != user.user_id:
        raise HTTPException(403, "Esta solicitud no está asignada a ti")
    return doc


@router.post("/api/asesor/inmobiliaria/solicitudes/{lead_id}/claim")
async def asesor_claim(lead_id: str, request: Request):
    """Tomo un lead del pool (me lo asigno)."""
    user = await _advisor(request)
    if not _is_house(user):
        raise HTTPException(403, "Solo asesores de la inmobiliaria DMX")
    db = _db(request)
    doc = await _my_lead(db, user, lead_id, must_be_mine=False)
    if doc.get("assigned_asesor_id") and doc.get("assigned_asesor_id") != user.user_id:
        raise HTTPException(409, "Otro asesor ya la tomó")
    await db.visit_requests.update_one(
        {"id": lead_id}, {"$set": {"assigned_asesor_id": user.user_id, "status": "assigned", "assigned_at": _now()}})
    return {"ok": True, "status": "assigned"}


@router.post("/api/asesor/inmobiliaria/solicitudes/{lead_id}/accept")
async def asesor_accept(lead_id: str, request: Request):
    """Acepto: queda confirmada y me llevo el contacto del comprador para agendar."""
    user = await _advisor(request)
    db = _db(request)
    doc = await _my_lead(db, user, lead_id, must_be_mine=True)
    await db.visit_requests.update_one(
        {"id": lead_id}, {"$set": {"status": "accepted", "accepted_at": _now()}})
    buyer = await _buyer_info(db, doc)
    return {"ok": True, "status": "accepted", "buyer": buyer,
            "mensaje": f"Listo. Contacta a {buyer.get('name')} para agendar."}


@router.post("/api/asesor/inmobiliaria/solicitudes/{lead_id}/decline")
async def asesor_decline(lead_id: str, request: Request):
    """La devuelvo al pool para que otro asesor de la casa la tome."""
    user = await _advisor(request)
    db = _db(request)
    await _my_lead(db, user, lead_id, must_be_mine=True)
    await db.visit_requests.update_one(
        {"id": lead_id},
        {"$set": {"status": "requested", "assigned_asesor_id": None},
         "$addToSet": {"declined_by": user.user_id}})
    return {"ok": True, "status": "requested"}
