"""Dev · Solicitudes de Visita (cierra el ciclo comprador→dev)
==============================================================
El Asistente de Compra del comprador puede "pedir una visita" (acción delicada, con
su OK). Eso crea un doc en `visit_requests` que hasta ahora NADIE recibía (dead-end).
Aquí el DESARROLLADOR dueño de la propiedad lo recibe, lo acepta o lo descarta.

Aislamiento multi-tenant ESTRICTO (fuente única tenant_scope): un dev solo ve y
solo puede tocar solicitudes de propiedades que le pertenecen (property_id ∈ sus
desarrollos). Sin fallback "todo". Additive · no duplica el CRM (es su bandeja de
intención de visita, claramente etiquetada).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.dev.visit_requests")
router = APIRouter(prefix="/api/dev/visit-requests", tags=["dev_visit_requests"])


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _my_dev_ids(user) -> List[str]:
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


def _prop_name(pid: str) -> str:
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(pid)
        if d:
            return d.get("name") or pid
    except Exception:
        pass
    return pid


async def _buyer_info(db, doc) -> Dict[str, Any]:
    """Nombre/contacto del comprador (lo dejó él al pedir la visita · consentido)."""
    name, email = None, doc.get("email")
    uid = doc.get("user_id")
    try:
        if uid:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
            if u:
                name = u.get("name")
                email = email or u.get("email")
                return {"name": name or email or "Comprador", "email": email, "phone": u.get("phone")}
        if email:
            l = await db.leads.find_one({"email": email}, {"_id": 0, "name": 1, "phone": 1})
            if l:
                name = l.get("name")
    except Exception:
        pass
    return {"name": name or email or "Comprador", "email": email, "phone": None}


@router.get("")
async def list_visit_requests(request: Request, status: str = "requested"):
    """Solicitudes de visita de MIS propiedades (scoped por tenant). status=requested|all."""
    user = await _auth(request)
    db = request.app.state.db
    mine = _my_dev_ids(user)
    out: List[Dict[str, Any]] = []
    if not mine:
        return {"ok": True, "total": 0, "pendientes": 0, "solicitudes": [],
                "lectura": "Aún no tienes desarrollos con solicitudes de visita."}
    q: Dict[str, Any] = {"property_id": {"$in": mine}}
    if status != "all":
        q["status"] = "requested"
    try:
        async for d in db.visit_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(200):
            buyer = await _buyer_info(db, d)
            out.append({
                "id": d.get("id") or d.get("_id_str"),
                "property_id": d.get("property_id"),
                "property_name": d.get("property_name") or _prop_name(d.get("property_id")),
                "status": d.get("status") or "requested",
                "buyer": buyer,
                "created_at": d.get("created_at"),
                "attended_by": d.get("attended_by"),
            })
    except Exception as e:
        log.warning("[visit-requests] list fail-open: %s", e)
    pend = sum(1 for r in out if r["status"] == "requested")
    lectura = ("Sin solicitudes de visita por ahora." if not pend
               else f"{pend} comprador{'es' if pend != 1 else ''} quiere{'n' if pend != 1 else ''} visitar tus propiedades — contáctalos para agendar.")
    return {"ok": True, "total": len(out), "pendientes": pend, "solicitudes": out, "lectura": lectura}


async def _guarded_doc(db, user, req_id: str):
    """Trae la solicitud y verifica que sea de UNA propiedad del dev (anti cross-tenant)."""
    doc = await db.visit_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Solicitud no encontrada")
    if doc.get("property_id") not in _my_dev_ids(user):
        raise HTTPException(403, "Esta solicitud no es de tus propiedades")
    return doc


@router.post("/{req_id}/accept")
async def accept_visit_request(req_id: str, request: Request):
    """Acepto la visita: queda marcada y me llevo el contacto del comprador para agendar."""
    user = await _auth(request)
    db = request.app.state.db
    doc = await _guarded_doc(db, user, req_id)
    await db.visit_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "accepted", "attended_by": user.user_id,
                  "attended_at": datetime.now(timezone.utc).isoformat()}})
    buyer = await _buyer_info(db, doc)
    return {"ok": True, "status": "accepted", "buyer": buyer,
            "mensaje": f"Listo. Contacta a {buyer.get('name')} para agendar la visita."}


@router.post("/{req_id}/decline")
async def decline_visit_request(req_id: str, request: Request):
    user = await _auth(request)
    db = request.app.state.db
    await _guarded_doc(db, user, req_id)
    await db.visit_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "declined", "attended_by": user.user_id,
                  "attended_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "status": "declined"}
