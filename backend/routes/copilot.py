"""Phase 4 Batch 23 · routes — AI Copilot endpoints."""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.copilot_engine import (
    ask_copilot, list_conversations, get_conversation,
    delete_conversation, ensure_copilot_indexes,
)

log = logging.getLogger("dmx.routes.copilot")
router = APIRouter(tags=["copilot"])


def _db(req): return req.app.state.db


async def _auth(req):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


class AskBody(BaseModel):
    question: str = Field(..., min_length=2, max_length=4000)
    conversation_id: Optional[str] = None


@router.post("/api/copilot/ask")
async def ask(body: AskBody, request: Request) -> Dict[str, Any]:
    user = await _auth(request)
    db = _db(request)
    return await ask_copilot(db, user, body.question, body.conversation_id)


@router.get("/api/copilot/conversations")
async def list_conv(request: Request) -> Dict[str, Any]:
    user = await _auth(request)
    db = _db(request)
    return {"items": await list_conversations(db, user.user_id, limit=10)}


@router.get("/api/copilot/conversations/{conversation_id}")
async def get_conv(conversation_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth(request)
    db = _db(request)
    d = await get_conversation(db, user.user_id, conversation_id)
    if not d:
        raise HTTPException(404, "Conversación no encontrada")
    return d


@router.delete("/api/copilot/conversations/{conversation_id}")
async def delete_conv(conversation_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth(request)
    db = _db(request)
    ok = await delete_conversation(db, user.user_id, conversation_id)
    if not ok:
        raise HTTPException(404, "Conversación no encontrada")
    return {"deleted": True}


# ─── Quick action templates (mirror of frontend copilotPrompts.js) ───────────

QUICK_ACTIONS_BY_ROLE: Dict[str, List[Dict[str, str]]] = {
    "developer_admin": [
        {"id": "tension_inventario", "label": "¿Qué corte de mi inventario está caliente?",
         "prompt": "Revisa tension_de_mis_cortes del contexto: ¿qué celda (colonia × recámaras) tiene mayor tensión y cuál está fría (candidata a recorte de precio)?"},
        {"id": "pipeline_summary",
         "label": "Resume mi pipeline esta semana",
         "prompt": "Dame un resumen ejecutivo de mi pipeline esta semana: leads activos, conversiones, y proyectos con mejor desempeño. Usa viñetas."},
        {"id": "leads_followup",
         "label": "¿Qué leads necesitan follow-up hoy?",
         "prompt": "Identifica los leads que necesitan follow-up urgente hoy basándote en última interacción y stage. Lista hasta 5 priorizados."},
        {"id": "top_actions",
         "label": "Top 3 acciones para vender más rápido",
         "prompt": "Dame las 3 acciones de mayor impacto que puedo ejecutar esta semana para acelerar ventas. Justifica cada una con datos."},
        {"id": "predict_sales",
         "label": "Predice mis ventas próximo mes",
         "prompt": "Estima mis ventas del próximo mes proyecto por proyecto, basándote en velocidad histórica y leads activos. Sé conservador."},
        {"id": "low_health",
         "label": "Proyectos con health score bajo",
         "prompt": "Lista los proyectos con health score por debajo de 60 y diagnostica la principal causa de cada uno."},
        {"id": "weekly_report",
         "label": "Genera reporte semanal para inversionistas",
         "prompt": "Redacta un reporte semanal en tono ejecutivo (≤200 palabras) con KPIs, riesgos y siguiente semana."},
    ],
    "advisor": [
        {"id": "cortes_calientes", "label": "¿Qué cliente tiene el corte más peleado?",
         "prompt": "Revisa cortes_de_mis_clientes: ¿qué búsqueda tiene mayor tension_por_unidad, de qué cliente es, y qué le digo HOY con esos números (unidades que le quedan + compradores compitiendo)?"},
        {"id": "my_pipeline",
         "label": "Mi pipeline esta semana",
         "prompt": "Resume mi pipeline activo esta semana: cantidad de leads por stage, valor estimado y próximas citas. Sé breve."},
        {"id": "next_call",
         "label": "¿A quién debo llamar primero?",
         "prompt": "De mis leads activos, ¿a quién debería contactar primero hoy y por qué? Prioriza por score y tiempo desde último contacto."},
        {"id": "best_match",
         "label": "Mejor proyecto para mis leads top",
         "prompt": "Para mis 3 leads con mayor score, recomienda el proyecto del catálogo que mejor encaja con su perfil."},
        {"id": "close_today",
         "label": "Leads que puedo cerrar esta semana",
         "prompt": "Identifica leads en stage avanzado que tienen alta probabilidad de cierre en los próximos 7 días."},
        {"id": "best_links",
         "label": "Mis links con mejor desempeño",
         "prompt": "Resume cuáles de mis tracking links están convirtiendo mejor y qué puedo hacer para amplificarlos."},
        {"id": "improve_perf",
         "label": "Cómo subir mi health score",
         "prompt": "Mi health score actual está en el contexto. Dame 3 acciones concretas para subirlo en 7 días."},
    ],
    "inmobiliaria_admin": [
        {"id": "team_perf",
         "label": "Performance de mi equipo este mes",
         "prompt": "Resume el performance de mi equipo de asesores este mes: top 3, pipeline total y dónde hay cuellos de botella."},
        {"id": "top_asesores",
         "label": "Mis mejores asesores",
         "prompt": "Lista a mis top 5 asesores ordenados por pipeline activo y leads convertidos."},
        {"id": "pipeline_org",
         "label": "Pipeline total de la org",
         "prompt": "Dame el pipeline consolidado de la inmobiliaria y los principales proyectos que aportan."},
        {"id": "low_perf",
         "label": "Asesores que necesitan apoyo",
         "prompt": "Identifica asesores con desempeño por debajo del promedio del equipo y sugiere acciones de coaching."},
        {"id": "weekly_brief",
         "label": "Brief semanal para mi equipo",
         "prompt": "Redacta un brief semanal para mi equipo con foco, prioridades y reto colectivo. Tono motivador."},
    ],
}
QUICK_ACTIONS_BY_ROLE["superadmin"] = QUICK_ACTIONS_BY_ROLE["developer_admin"]
QUICK_ACTIONS_BY_ROLE["asesor_admin"] = QUICK_ACTIONS_BY_ROLE["inmobiliaria_admin"]
QUICK_ACTIONS_BY_ROLE["asesor"] = QUICK_ACTIONS_BY_ROLE["advisor"]


@router.get("/api/copilot/quick-actions")
async def quick_actions(request: Request, role: Optional[str] = None) -> Dict[str, Any]:
    user = await _auth(request)
    target_role = (role or user.role or "").lower()
    items = QUICK_ACTIONS_BY_ROLE.get(target_role) or QUICK_ACTIONS_BY_ROLE["advisor"]
    return {"role": target_role, "items": items}


# ─── Indexes hook (to call from server.py startup) ────────────────────────────

async def ensure_indexes(db):
    await ensure_copilot_indexes(db)
