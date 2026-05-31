"""B5.2 · Link Tinder de propiedades — endpoints PÚBLICOS (sin login).

El cliente abre /p/{token} (lo manda el asesor por WhatsApp) y desliza 👍/👎 sobre
las propiedades de SU tablero (colección `asesor_lead_properties` de B5.1). Cada swipe
escribe el estatus de vuelta (👍→'gusto', 👎→'descartada') + engagement, en tiempo real.

SEGURIDAD (link público · FAIL-CLOSED):
  - Todo va acotado por el token → resuelve (owner_id asesor, contacto_id lead).
  - El público SOLO puede ver/mover propiedades de ESE lead (filtro doble owner_id+contacto_id).
  - No se expone PII del asesor ni datos internos (se proyectan solo los campos de la tarjeta).
  - Token inválido → 404. Sin token no hay acceso a nada.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(tags=["swipe-public"])

BOARD_STATUS = ["dispo", "enviada", "gusto", "descartada"]


def _db(request: Request):
    return request.app.state.db


def _now():
    return datetime.now(timezone.utc)


async def _resolve(db, token: str) -> dict:
    """token → link doc. FAIL-CLOSED: 404 si no existe."""
    lk = await db.asesor_property_links.find_one({"token": token}, {"_id": 0})
    if not lk:
        raise HTTPException(404, "Link inválido o expirado")
    return lk


def _card(it: dict) -> dict:
    """Proyección segura para el cliente (sin owner_id ni datos internos)."""
    return {
        "id": it.get("id"),
        "dev_id": it.get("dev_id"),
        "name": it.get("name"),
        "price": it.get("price"),
        "colonia": it.get("colonia"),
        "addr": it.get("addr"),
        "specs": it.get("specs", []),
        "status": it.get("status"),
        "thumb": it.get("thumb"),
    }


# ─── Ver el link (curado del lead) ──────────────────────────────────────────────
@router.get("/api/swipe/{token}")
async def swipe_view(token: str, request: Request):
    db = _db(request)
    lk = await _resolve(db, token)
    try:
        await db.asesor_property_links.update_one({"token": token}, {"$inc": {"views": 1}})
    except Exception:
        pass
    items = await db.asesor_lead_properties.find(
        {"owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(200)
    up = sum(1 for it in items if it.get("thumb") == "up")
    down = sum(1 for it in items if it.get("thumb") == "down")
    return {
        "asesor_name": lk.get("asesor_name") or "Tu asesor",
        "lead_name": lk.get("lead_name") or "",
        "items": [_card(it) for it in items],
        "engagement": {"views": int(lk.get("views") or 0), "up": up, "down": down},
    }


# ─── Votar (swipe 👍/👎) → escribe estatus en el tablero del asesor ──────────────
class VoteIn(BaseModel):
    item_id: str
    thumb: str  # up | down


@router.post("/api/swipe/{token}/vote")
async def swipe_vote(token: str, payload: VoteIn, request: Request):
    db = _db(request)
    lk = await _resolve(db, token)
    if payload.thumb not in ("up", "down"):
        raise HTTPException(400, "thumb inválido")
    status = "gusto" if payload.thumb == "up" else "descartada"
    res = await db.asesor_lead_properties.update_one(
        {"id": payload.item_id, "owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"]},
        {"$set": {"status": status, "thumb": payload.thumb, "source": "swipe", "updated_at": _now()},
         "$inc": {"views": 1}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Propiedad no encontrada")
    return {"ok": True, "status": status}


# ─── Pedir visita (cliente) → la ve el asesor en el tablero + timeline ───────────
class CitaIn(BaseModel):
    item_id: str
    when: str


@router.post("/api/swipe/{token}/cita")
async def swipe_cita(token: str, payload: CitaIn, request: Request):
    db = _db(request)
    lk = await _resolve(db, token)
    when = (payload.when or "")[:80]
    res = await db.asesor_lead_properties.update_one(
        {"id": payload.item_id, "owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"]},
        {"$set": {"client_cita": when, "updated_at": _now()}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Propiedad no encontrada")
    try:
        await db.asesor_contacto_timeline.insert_one({
            "id": "tl_" + uuid.uuid4().hex[:10], "contacto_id": lk["contacto_id"], "owner_id": lk["owner_id"],
            "kind": "cita_cliente", "body": f"El cliente pidió visita desde el link: {when}", "ts": _now(),
        })
    except Exception:
        pass
    return {"ok": True}


# ─── Dejar nota (cliente) ───────────────────────────────────────────────────────
class NotaIn(BaseModel):
    item_id: str
    text: str


@router.post("/api/swipe/{token}/nota")
async def swipe_nota(token: str, payload: NotaIn, request: Request):
    db = _db(request)
    lk = await _resolve(db, token)
    text = (payload.text or "")[:400]
    if not text:
        raise HTTPException(400, "Nota vacía")
    res = await db.asesor_lead_properties.update_one(
        {"id": payload.item_id, "owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"]},
        {"$set": {"client_note": text, "updated_at": _now()}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Propiedad no encontrada")
    try:
        await db.asesor_contacto_timeline.insert_one({
            "id": "tl_" + uuid.uuid4().hex[:10], "contacto_id": lk["contacto_id"], "owner_id": lk["owner_id"],
            "kind": "nota_cliente", "body": f"Nota del cliente desde el link: {text}", "ts": _now(),
        })
    except Exception:
        pass
    return {"ok": True}


# ─── Respuestas del cuestionario (perfilado · alimenta ML futuro B5.3) ───────────
class ProfileIn(BaseModel):
    answers: Dict[str, Any] = {}


@router.post("/api/swipe/{token}/profile")
async def swipe_profile(token: str, payload: ProfileIn, request: Request):
    db = _db(request)
    lk = await _resolve(db, token)
    await db.asesor_swipe_profiles.update_one(
        {"owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"]},
        {"$set": {"owner_id": lk["owner_id"], "contacto_id": lk["contacto_id"],
                  "answers": payload.answers, "updated_at": _now()}},
        upsert=True,
    )
    return {"ok": True}
