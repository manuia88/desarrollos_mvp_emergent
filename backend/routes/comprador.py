"""Phase 4 Batch 28 · routes — Portal Comprador (autenticado).

Endpoints (todos requieren auth role=buyer):
  GET    /api/comprador/dashboard
  GET    /api/comprador/profile
  PATCH  /api/comprador/profile

  GET    /api/comprador/saved-searches
  DELETE /api/comprador/saved-searches/{id}

  GET    /api/comprador/favorites
  POST   /api/comprador/favorites
  DELETE /api/comprador/favorites/{fav_id}

  GET    /api/comprador/history
  POST   /api/comprador/history          (track view from frontend)
  DELETE /api/comprador/history          (clear)

  GET    /api/comprador/privacy/consents
  PATCH  /api/comprador/privacy/consents
  POST   /api/comprador/privacy/export
  POST   /api/comprador/privacy/delete-account
  POST   /api/comprador/privacy/cancel-delete
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.comprador")

router = APIRouter(tags=["comprador"])


def _db(request: Request):
    return request.app.state.db


def _ip_hash(request: Request) -> str:
    from ratelimit import client_ip as _c  # SEGURIDAD (4ª pasada): IP canónica anti-spoofing
    ip = _c(request) or "unknown"
    return hashlib.sha256(ip.encode()).hexdigest()[:20]


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para compradores")
    return user


# ─── Pydantic models ─────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class FavoriteAdd(BaseModel):
    item_type: str
    item_id: str
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class TrackViewBody(BaseModel):
    item_type: str
    item_id: str
    source: str = "marketplace"


class ConsentsPatch(BaseModel):
    consents: Dict[str, bool] = Field(default_factory=dict)


class DeleteAccountBody(BaseModel):
    confirm_email: str
    reason: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/api/comprador/dashboard")
async def get_dashboard(request: Request, user=Depends(_require_buyer)):
    from services.comprador_dashboard import compute_dashboard
    db = _db(request)
    return await compute_dashboard(db, user.user_id, user.email)


# ─── "Propiedades Para Ti" · recomendación personalizada ──────────────────────
# Despierta fit_engine.top_properties_for_lead (que solo veía el asesor) para el COMPRADOR.
# Paso 1 (comprador↔lead): el comprador VIVE en db.leads por user_id/email (no es asesor_contactos).
# Paso 2: rankea propiedades por fit a su gusto. Honesto: si aún no hay gusto → fit general + bandera.
@router.get("/api/comprador/recommended")
async def get_recommended(request: Request, limit: int = 6, user=Depends(_require_buyer)):
    db = _db(request)
    lead = await db.leads.find_one({"user_id": user.user_id}, {"_id": 0, "id": 1})
    if not lead and user.email:
        lead = await db.leads.find_one({"email": user.email}, {"_id": 0, "id": 1})
    lead_id = (lead or {}).get("id")
    try:
        from fit_engine import top_properties_for_lead
        res = await top_properties_for_lead(
            db, lead_id or user.user_id, limit=max(1, min(int(limit or 6), 12)), user_id=user.user_id)
        return {"ok": True, "personalizado": bool(lead_id), **res}
    except Exception as e:
        logging.getLogger("dmx.comprador").warning(f"[recommended] fail-open: {e}")
        return {"ok": True, "personalizado": False, "properties": []}


# Cierra ciclo (vuelta del comprador): ve el estado de las visitas que pidió su Asistente.
# El dev las recibe en su bandeja y acepta/descarta; aquí el comprador ve cómo van.
@router.get("/api/comprador/visitas")
async def get_visitas(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    q = {"$or": [{"user_id": user.user_id}]}
    if user.email:
        q["$or"].append({"email": user.email})
    items = []
    _ST = {"requested": "Solicitada", "accepted": "Confirmada", "declined": "No disponible"}
    try:
        async for d in db.visit_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(50):
            items.append({"id": d.get("id"), "property_id": d.get("property_id"),
                          "property_name": d.get("property_name"),
                          "status": d.get("status") or "requested",
                          "status_label": _ST.get(d.get("status") or "requested", "Solicitada"),
                          "created_at": d.get("created_at")})
    except Exception as e:
        logging.getLogger("dmx.comprador").warning(f"[visitas] fail-open: {e}")
    return {"ok": True, "total": len(items), "visitas": items}


# ─── Profile ─────────────────────────────────────────────────────────────────

@router.get("/api/comprador/profile")
async def get_profile(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "Usuario no encontrado")
    if isinstance(doc.get("created_at"), object):
        from datetime import datetime
        if hasattr(doc.get("created_at"), "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.patch("/api/comprador/profile")
async def patch_profile(body: ProfileUpdate, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    upd: Dict[str, Any] = {}
    if body.name is not None:
        nm = body.name.strip()[:120]
        if not nm:
            raise HTTPException(400, "Nombre vacío")
        upd["name"] = nm
    if body.phone is not None:
        ph = "".join(ch for ch in body.phone if ch.isdigit() or ch == "+")[:20]
        upd["phone"] = ph
    if not upd:
        raise HTTPException(400, "Ningún campo a actualizar")

    await db.users.update_one({"user_id": user.user_id}, {"$set": upd})
    # Invalidate dashboard cache
    await db.comprador_dashboards.delete_one({"user_id": user.user_id})
    fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    return fresh


# ─── Saved Searches ──────────────────────────────────────────────────────────

@router.get("/api/comprador/saved-searches")
async def list_saved_searches(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    out: List[Dict[str, Any]] = []
    q = {"$or": [{"user_id": user.user_id}, {"email": user.email, "user_id": {"$exists": False}}]}
    async for s in db.saved_searches.find(
        q,
        {"_id": 0, "search_id": 1, "filters": 1, "alert_frequency": 1,
         "created_at": 1, "last_alert_sent": 1, "confirmed": 1, "user_id": 1, "email": 1},
    ).sort("created_at", -1).limit(100):
        # Auto-link al user_id si todavía es anonymous
        if not s.get("user_id"):
            await db.saved_searches.update_one(
                {"search_id": s["search_id"]},
                {"$set": {"user_id": user.user_id}},
            )
            s["user_id"] = user.user_id
        for k in ("created_at", "last_alert_sent"):
            v = s.get(k)
            if v and hasattr(v, "isoformat"):
                s[k] = v.isoformat()
        out.append(s)
    return out


@router.delete("/api/comprador/saved-searches/{search_id}")
async def delete_saved_search(search_id: str, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    r = await db.saved_searches.delete_one({
        "search_id": search_id,
        "$or": [{"user_id": user.user_id}, {"email": user.email}],
    })
    if r.deleted_count == 0:
        raise HTTPException(404, "Búsqueda no encontrada")
    await db.comprador_dashboards.delete_one({"user_id": user.user_id})
    return {"deleted": True}


# ─── Favorites ───────────────────────────────────────────────────────────────

@router.get("/api/comprador/favorites")
async def list_favorites(request: Request, item_type: Optional[str] = None, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import get_favorites
    favs = await get_favorites(db, user.user_id, item_type)
    # enrich projects desde DEVELOPMENTS_BY_ID (in-memory)
    try:
        from data_developments import DEVELOPMENTS_BY_ID
    except Exception:
        DEVELOPMENTS_BY_ID = {}
    for f in favs:
        if f.get("item_type") == "project":
            d = DEVELOPMENTS_BY_ID.get(f["item_id"])
            if d:
                f["thumb"] = {
                    "id": d.get("id"), "name": d.get("name"),
                    "colonia": d.get("colonia"),
                    "cover_photo": d.get("cover_photo") or (d.get("photos") or [None])[0],
                    "price_from": d.get("price_from"),
                }
    return favs


@router.post("/api/comprador/favorites")
async def post_favorite(body: FavoriteAdd, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import add_favorite
    try:
        fav = await add_favorite(db, user.user_id, body.item_type, body.item_id, body.tags, body.notes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    await db.comprador_dashboards.delete_one({"user_id": user.user_id})
    if fav and "added_at" in fav and hasattr(fav["added_at"], "isoformat"):
        fav["added_at"] = fav["added_at"].isoformat()
    return fav


@router.delete("/api/comprador/favorites/{fav_id}")
async def delete_favorite(fav_id: str, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import remove_favorite
    ok = await remove_favorite(db, user.user_id, fav_id)
    if not ok:
        raise HTTPException(404, "Favorito no encontrado")
    await db.comprador_dashboards.delete_one({"user_id": user.user_id})
    return {"deleted": True}


# ─── History ─────────────────────────────────────────────────────────────────

@router.get("/api/comprador/history")
async def list_history(request: Request, limit: int = 50, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import get_history
    hist = await get_history(db, user.user_id, min(max(limit, 1), 200))
    # enrich project items
    try:
        from data_developments import DEVELOPMENTS_BY_ID
    except Exception:
        DEVELOPMENTS_BY_ID = {}
    for v in hist:
        if v.get("item_type") == "project":
            d = DEVELOPMENTS_BY_ID.get(v["item_id"])
            if d:
                v["thumb"] = {
                    "id": d.get("id"), "name": d.get("name"),
                    "colonia": d.get("colonia"),
                    "cover_photo": d.get("cover_photo") or (d.get("photos") or [None])[0],
                    "price_from": d.get("price_from"),
                }
    return hist


@router.post("/api/comprador/history")
async def track_view_endpoint(body: TrackViewBody, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import track_view
    try:
        return await track_view(db, user.user_id, body.item_type, body.item_id, body.source)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/comprador/history")
async def clear_history_endpoint(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.buyer_history import clear_history
    n = await clear_history(db, user.user_id)
    await db.comprador_dashboards.delete_one({"user_id": user.user_id})
    return {"cleared": n}


# ─── Privacy ─────────────────────────────────────────────────────────────────

@router.get("/api/comprador/privacy/consents")
async def get_consents_endpoint(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.privacy_center import get_consents
    return await get_consents(db, user.user_id)


@router.patch("/api/comprador/privacy/consents")
async def patch_consents(body: ConsentsPatch, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.privacy_center import update_consents
    try:
        return await update_consents(
            db, user.user_id, body.consents,
            ip_hash=_ip_hash(request),
            user_agent=request.headers.get("User-Agent", ""),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/comprador/privacy/export")
async def export_user_data(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.privacy_center import request_export
    return await request_export(db, user.user_id, user.email)


@router.post("/api/comprador/privacy/delete-account")
async def delete_account(body: DeleteAccountBody, request: Request, user=Depends(_require_buyer)):
    if (body.confirm_email or "").strip().lower() != user.email.lower():
        raise HTTPException(400, "El email de confirmación no coincide")
    db = _db(request)
    from services.privacy_center import soft_delete_account
    return await soft_delete_account(db, user.user_id, user.email, body.reason)


@router.post("/api/comprador/privacy/cancel-delete")
async def cancel_delete_endpoint(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.privacy_center import cancel_delete
    ok = await cancel_delete(db, user.user_id)
    if not ok:
        raise HTTPException(404, "No hay solicitud de eliminación pendiente")
    return {"cancelled": True}
