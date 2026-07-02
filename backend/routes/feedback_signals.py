"""Endpoints de señales de feedback estructuradas (Batch 7 · feature founder).

- POST /api/leads/{lead_id}/feedback-signals  → el asesor/inmobiliaria dueño registra señales
  estructuradas (o `auto:true` para que la IA las extraiga de la conversación). El dev NO escribe
  (no tiene la conversación).
- GET  /api/dev/feedback-index                → el dev ve el agregado de SUS desarrollos (retro de
  mercado: objeciones, atractores, perfil, gap de producto); superadmin ve todo. k-anonimato por colonia.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import feedback_signals as fs

router = APIRouter(tags=["feedback_signals"])


async def _auth(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


class FeedbackIn(BaseModel):
    signals: Dict[str, Any] = Field(default_factory=dict)
    auto: bool = False  # si true, la IA extrae de la conversación (además de lo enviado)


@router.post("/api/leads/{lead_id}/feedback-signals")
async def record_lead_feedback(lead_id: str, body: FeedbackIn, request: Request):
    user = await _auth(request)
    db = request.app.state.db
    # Un DEV no captura feedback (no tiene la conversación); lo hace quien atiende al cliente.
    if getattr(user, "role", "") in ("developer_admin", "developer_director"):
        raise HTTPException(403, "El desarrollador no captura feedback de conversación; lo registra el asesor.")
    # Propiedad CONSCIENTE DEL ROL (asesor=suyo · inmobiliaria=sus asesores · superadmin=todo).
    from tenant_scope import assert_lead_owner
    await assert_lead_owner(db, user, lead_id)

    raw = dict(body.signals or {})
    if body.auto:
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
        if lead:
            auto = await fs.auto_extract(db, lead)
            # lo enviado a mano tiene prioridad sobre lo inferido por IA
            raw = {**auto, **raw}
    res = await fs.record_feedback(db, lead_id, raw, actor_id=getattr(user, "user_id", ""))
    if not res.get("ok"):
        raise HTTPException(422, res.get("reason", "sin señales válidas"))
    return res


@router.get("/api/dev/feedback-index")
async def dev_feedback_index(request: Request):
    user = await _auth(request)
    db = request.app.state.db
    from tenant_scope import is_superadmin, user_dev_ids
    role = getattr(user, "role", "")
    if is_superadmin(user):
        dev_ids: Optional[list] = None  # god-view: todo el mercado
    elif role in ("developer_admin", "developer_director"):
        dev_ids = user_dev_ids(user)  # solo SUS desarrollos
    else:
        raise HTTPException(403, "Solo desarrolladores o superadmin ven el índice de feedback de mercado.")
    return await fs.aggregate_feedback(db, dev_ids=dev_ids)
