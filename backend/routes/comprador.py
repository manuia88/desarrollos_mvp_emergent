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


async def _verified_email(db, user) -> Optional[str]:
    """Email del usuario SOLO si está VERIFICADO (magic-link o flag `email_verified`).

    SEGURIDAD (B1-03): el portal une datos del comprador (leads, visitas, búsquedas) por email.
    Sin este candado, quien se registra con el correo de OTRA persona (registro por contraseña,
    que NO prueba propiedad del correo) podría reclamar sus datos. Solo unimos por email cuando
    hay prueba de propiedad. Fail-closed: ante cualquier duda devuelve None (no une por email).
    """
    email = getattr(user, "email", None)
    if not email:
        return None
    try:
        doc = await db.users.find_one(
            {"user_id": user.user_id},
            {"_id": 0, "email_verified": 1, "auth_method": 1},
        ) or {}
    except Exception:
        return None
    if doc.get("email_verified") is True or doc.get("auth_method") == "magic_link":
        return email
    return None


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
    vemail = await _verified_email(db, user)
    return await compute_dashboard(db, user.user_id, vemail or "")


@router.get("/api/comprador/radar")
async def get_radar(request: Request, user=Depends(_require_buyer)):
    """RADAR unificado: zonas + desarrollos + unidades que vigilas, cada uno con su ÚLTIMO CAMBIO, en UNA vista.
    REUSA los motores existentes (favoritos, búsquedas guardadas, señales, alertas entregadas) — no duplica.
    build-for-endstate: devuelve la estructura completa aunque no vigiles nada; se prende con datos (favoritos,
    price_drop, nuevo pick, etc.). Fail-open."""
    db = _db(request)
    # 1) Cambios recientes entregados, indexados por entidad → 'ultimo_cambio'
    cambios: dict = {}
    try:
        async for d in db.alert_deliveries.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).limit(80):
            p = d.get("payload") or {}
            eid = d.get("entity_id") or p.get("entity_id") or p.get("dev_id") or p.get("colonia_id")
            if eid and eid not in cambios:
                cambios[eid] = {"tipo": d.get("alert_type") or d.get("type"),
                                "resumen": d.get("summary") or p.get("summary"),
                                "fecha": d.get("created_at") or d.get("sent_at")}
    except Exception:
        pass
    from data_developments import DEVELOPMENTS_BY_ID
    # 2) DESARROLLOS vigilados (favoritos + ♥ del marketplace por visitor_id)
    desarrollos = []
    try:
        from services.buyer_history import get_favorites
        favs = await get_favorites(db, user.user_id, "project")
        ids = [f.get("item_id") for f in favs if f.get("item_id")]
        try:
            from services.visitor_identity import resolve_visitors_by_contact
            vids = await resolve_visitors_by_contact(db, getattr(user, "email", None), getattr(user, "phone", None))
            if vids:
                async for s in db.buyer_signals.find(
                        {"visitor_id": {"$in": vids}, "type": {"$in": ["like", "save"]}, "active": True},
                        {"_id": 0, "entity_id": 1}):
                    if s.get("entity_id") and s["entity_id"] not in ids:
                        ids.append(s["entity_id"])
        except Exception:
            pass
        for eid in ids:
            dv = DEVELOPMENTS_BY_ID.get(eid) or {}
            desarrollos.append({"id": eid, "name": dv.get("name") or eid, "colonia": dv.get("colonia"),
                                "precio_desde": dv.get("price_from"), "ultimo_cambio": cambios.get(eid)})
    except Exception:
        pass
    # 3) ZONAS vigiladas (colonias de las búsquedas guardadas)
    zonas, zvistas = [], set()
    try:
        async for ss in db.saved_searches.find({"user_id": user.user_id}, {"_id": 0, "filters": 1}).limit(50):
            for col in ((ss.get("filters") or {}).get("colonias") or []):
                if col and col not in zvistas:
                    zvistas.add(col)
                    zonas.append({"colonia_id": col, "name": col.replace("-", " ").title(),
                                  "ultimo_cambio": cambios.get(col)})
    except Exception:
        pass
    # 4) UNIDADES vigiladas (señales unit_save)
    unidades = []
    try:
        from services.visitor_identity import resolve_visitors_by_contact
        vids = await resolve_visitors_by_contact(db, getattr(user, "email", None), getattr(user, "phone", None))
        if vids:
            async for s in db.buyer_signals.find(
                    {"visitor_id": {"$in": vids}, "type": "unit_save", "active": True},
                    {"_id": 0, "entity_id": 1, "unit_number": 1}).limit(40):
                unidades.append({"dev_id": s.get("entity_id"), "unit_number": s.get("unit_number"),
                                 "ultimo_cambio": cambios.get(s.get("entity_id"))})
    except Exception:
        pass
    total = len(zonas) + len(desarrollos) + len(unidades)
    con_cambio = sum(1 for x in (zonas + desarrollos + unidades) if x.get("ultimo_cambio"))
    return {"zonas": zonas, "desarrollos": desarrollos, "unidades": unidades,
            "resumen": {"total_vigilados": total, "con_cambio": con_cambio},
            "vacio": total == 0}


# ─── "Propiedades Para Ti" · recomendación personalizada ──────────────────────
# Despierta fit_engine.top_properties_for_lead (que solo veía el asesor) para el COMPRADOR.
# Paso 1 (comprador↔lead): el comprador VIVE en db.leads por user_id/email (no es asesor_contactos).
# Paso 2: rankea propiedades por fit a su gusto. Honesto: si aún no hay gusto → fit general + bandera.
@router.get("/api/comprador/recommended")
async def get_recommended(request: Request, limit: int = 6, user=Depends(_require_buyer)):
    db = _db(request)
    lead = await db.leads.find_one({"user_id": user.user_id}, {"_id": 0, "id": 1})
    if not lead:
        vemail = await _verified_email(db, user)
        if vemail:
            lead = await db.leads.find_one({"email": vemail}, {"_id": 0, "id": 1})
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
    vemail = await _verified_email(db, user)
    if vemail:
        q["$or"].append({"email": vemail})
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
    vemail = await _verified_email(db, user)
    q = {"$or": [{"user_id": user.user_id}]}
    if vemail:
        q["$or"].append({"email": vemail, "user_id": {"$exists": False}})
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
    vemail = await _verified_email(db, user)
    owner_or: List[Dict[str, Any]] = [{"user_id": user.user_id}]
    if vemail:
        owner_or.append({"email": vemail})
    r = await db.saved_searches.delete_one({
        "search_id": search_id,
        "$or": owner_or,
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
    # CONSOLIDACIÓN (auditoría 2026-07-04): los ♥ del marketplace viven en buyer_signals (fuente canónica,
    # por visitor_id) — el portal logueado antes solo leía buyer_favorites, colección que NADA escribe →
    # página siempre vacía. Unimos: resolvemos los visitor_ids de la persona por su contacto (hash
    # email/teléfono de visitor_identity) y traemos sus like/save activos como favoritos. Fail-open.
    try:
        from services.visitor_identity import resolve_visitors_by_contact
        _vids = await resolve_visitors_by_contact(db, getattr(user, "email", None), getattr(user, "phone", None))
        if _vids and item_type in (None, "project"):
            _seen = {f.get("item_id") for f in favs}
            async for _s in db.buyer_signals.find(
                    {"visitor_id": {"$in": _vids}, "type": {"$in": ["like", "save"]}, "active": True},
                    {"_id": 0, "entity_id": 1, "created_at_dt": 1}, sort=[("created_at_dt", -1)]):
                _eid = _s.get("entity_id")
                if _eid and _eid not in _seen:
                    _seen.add(_eid)
                    _dt = _s.get("created_at_dt")
                    favs.append({"id": f"sig_{_eid}", "item_type": "project", "item_id": _eid,
                                 "source": "marketplace",
                                 "added_at": (_dt.isoformat() if hasattr(_dt, "isoformat") else None)})
    except Exception:
        pass
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
    if fav_id.startswith("sig_"):
        # Favorito canónico del marketplace (buyer_signals): quitar = desactivar el like/save de LA PERSONA
        # (scoped a sus propios visitor_ids resueltos por contacto — nunca los de otro).
        try:
            from services.visitor_identity import resolve_visitors_by_contact
            _vids = await resolve_visitors_by_contact(db, getattr(user, "email", None), getattr(user, "phone", None))
            if _vids:
                await db.buyer_signals.update_many(
                    {"visitor_id": {"$in": _vids}, "entity_id": fav_id[4:], "type": {"$in": ["like", "save", "unit_save"]}},
                    {"$set": {"active": False}})
                await db.comprador_dashboards.delete_one({"user_id": user.user_id})
                return {"deleted": True}
        except Exception:
            pass
        raise HTTPException(404, "Favorito no encontrado")
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
