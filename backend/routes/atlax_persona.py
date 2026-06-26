"""W4.7 Y.4A — Atlax Persona endpoints.

Prefix: /api/superadmin/atlax-persona
Guards:
  - superadmin → acceso a cualquier org
  - developer_admin → solo su propia org (si tier T2+)
  - master switch OFF → 403 en mutaciones y preview
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

log = logging.getLogger("dmx.routes_atlax_persona")

router = APIRouter(prefix="/api/superadmin/atlax-persona", tags=["atlax-persona"])

# ─── Auth helpers ──────────────────────────────────────────────────────────────
async def _resolve_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_access(request: Request, org_id: str):
    """superadmin: acceso global · developer_admin: solo su org."""
    user = await _resolve_user(request)
    role = getattr(user, "role", "")
    if role == "superadmin":
        return user
    if role == "developer_admin":
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id and tenant_id == org_id:
            return user
        raise HTTPException(403, "Solo puedes acceder a tu propia organización")
    raise HTTPException(403, "Acceso restringido")


async def _check_tier_t2(db, org_id: str) -> str:
    """Verifica tier atlax_persona ≥ T2 para org. Lanza 403 si T<2."""
    from routes.phase_y_controls import get_phase_y_settings
    settings = await get_phase_y_settings(db, org_id)
    tier_raw: str = (settings.get("feature_tiers") or {}).get("atlax_persona", "off")
    tier_num = 0
    if tier_raw and tier_raw != "off":
        try:
            tier_num = int(tier_raw.replace("T", ""))
        except (ValueError, AttributeError):
            tier_num = 0
    if tier_num < 2:
        raise HTTPException(403, "Atlax Persona requiere tier T2+")
    return tier_raw


# ─── Pydantic models ───────────────────────────────────────────────────────────
VALID_TONES = {"formal", "casual", "tecnico", "cercano", "premium"}
VALID_REGISTERS = {"mx-formal", "mx-casual", "mx-neutral"}


class PatchPersonaIn(BaseModel):
    persona_name: Optional[str] = None
    persona_tagline: Optional[str] = None
    tone: Optional[str] = None
    formality_level: Optional[int] = None
    warmth_level: Optional[int] = None
    tech_jargon_allowed: Optional[bool] = None
    brand_voice_keywords: Optional[List[str]] = None
    forbidden_topics: Optional[List[str]] = None
    custom_greetings: Optional[List[str]] = None
    custom_signature: Optional[str] = None
    language_register: Optional[str] = None

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v):
        if v is not None and v not in VALID_TONES:
            raise ValueError(f"Tono inválido: {v}. Válidos: {VALID_TONES}")
        return v

    @field_validator("language_register")
    @classmethod
    def validate_register(cls, v):
        if v is not None and v not in VALID_REGISTERS:
            raise ValueError(f"Registro inválido: {v}. Válidos: {VALID_REGISTERS}")
        return v

    @field_validator("formality_level", "warmth_level")
    @classmethod
    def validate_level(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("El nivel debe estar entre 1 y 5")
        return v


class PreviewPersonaIn(BaseModel):
    persona_dict: Dict[str, Any]
    sample_query: str


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _serialize_persona(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa el documento de persona para la respuesta JSON."""
    return {k: v for k, v in doc.items() if k != "_id"}


async def _get_recent_audit(db, org_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Últimas N entradas de audit_log para atlax_persona de esta org."""
    try:
        cur = db.audit_log.find(
            {"entity_type": "atlax_persona", "entity_id": org_id},
            {"_id": 0, "ts": 1, "action": 1, "actor": 1, "diff_keys": 1},
        ).sort("ts", -1).limit(limit)
        rows = []
        async for r in cur:
            rows.append(r)
        return rows
    except Exception as exc:
        log.warning(f"[atlax_persona] audit fetch failed: {exc}")
        return []


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/{org_id}")
async def get_persona_endpoint(org_id: str, request: Request):
    """Retorna persona activa de la org (con defaults si no existe).

    Incluye `recent_audit` últimas 5 entradas + `tier` actual + `master_switch`.
    """
    db = request.app.state.db
    await _require_access(request, org_id)

    from atlax_persona_engine import get_persona
    from routes.phase_y_controls import get_phase_y_settings
    persona = await get_persona(db, org_id)
    settings = await get_phase_y_settings(db, org_id)
    tier_raw = (settings.get("feature_tiers") or {}).get("atlax_persona", "off")
    master_on = bool(settings.get("agentic_enabled", False))
    recent_audit = await _get_recent_audit(db, org_id)

    return JSONResponse({
        **_serialize_persona(persona),
        "tier": tier_raw,
        "master_switch": master_on,
        "recent_audit": recent_audit,
    })


@router.patch("/{org_id}")
async def patch_persona_endpoint(org_id: str, body: PatchPersonaIn, request: Request):
    """Actualiza parcialmente la persona. Requiere tier T2+ y master switch ON.

    Superadmin puede actualizar cualquier org. developer_admin solo la suya.
    """
    db = request.app.state.db
    user = await _require_access(request, org_id)

    # Master switch check (superadmin siempre puede · dev_admin respeta switch)
    from routes.phase_y_controls import get_phase_y_settings
    settings = await get_phase_y_settings(db, org_id)
    role = getattr(user, "role", "")
    if role != "superadmin" and not settings.get("agentic_enabled", False):
        raise HTTPException(403, "Phase Y master switch desactivado para esta organización")

    # Tier T2+ required for everyone
    await _check_tier_t2(db, org_id)

    update_dict = body.model_dump(exclude_none=True)
    if not update_dict:
        # Nothing to update
        from atlax_persona_engine import get_persona
        persona = await get_persona(db, org_id)
        return JSONResponse(_serialize_persona(persona))

    from atlax_persona_engine import update_persona
    user_id = getattr(user, "user_id", "unknown")
    after = await update_persona(db, org_id, update_dict, user_id)

    return JSONResponse({**_serialize_persona(after), "ok": True})


@router.post("/{org_id}/preview")
async def preview_persona_endpoint(org_id: str, body: PreviewPersonaIn, request: Request):
    """Ejecuta Atlax con persona temporal (NO persiste) + sample query.

    Retorna: {response_text, system_prompt_used, model, cost_usd}.
    Requiere acceso a la org. Superadmin puede probar cualquier org.
    """
    db = request.app.state.db
    await _require_access(request, org_id)

    if not body.sample_query or not body.sample_query.strip():
        raise HTTPException(422, "sample_query requerida")

    from atlax_persona_engine import build_persona_prompt, DEFAULT_PERSONA

    # Merge persona_dict with defaults for preview
    merged_persona = {**DEFAULT_PERSONA}
    merged_persona.update({k: v for k, v in body.persona_dict.items()
                           if k in DEFAULT_PERSONA})
    merged_persona["version"] = 1  # force persona injection for preview

    persona_prefix = build_persona_prompt(merged_persona)

    # Build a simplified system prompt (asistente base + persona)
    base_system = (
        "Eres el Asistente Público de DesarrollosMX (DMX), una plataforma de "
        "inteligencia inmobiliaria para CDMX. Tu rol: ayudar a encontrar "
        "departamento o casa en CDMX. Respuestas CONCISAS (máx 3-4 oraciones). "
        "Datos concretos cuando los tengas. NUNCA inventes precios o proyectos."
    )
    full_system = (persona_prefix + "\n" + base_system) if persona_prefix else base_system

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(503, "EMERGENT_LLM_KEY no configurado")

    model_name = os.environ.get("ASISTENTE_MODEL", "claude-sonnet-4-5-20250929")

    try:
        from llm_client import LlmChat, UserMessage as LlmUserMsg
        import uuid as _uuid
        session_id = f"prev_{_uuid.uuid4().hex[:10]}"
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=full_system,
        ).with_model("anthropic", model_name)
        response_text = await chat.send_message(LlmUserMsg(text=body.sample_query.strip()[:500]))
        response_text = (response_text or "").strip()

        # Rough cost estimate
        tok_in = max(1, (len(full_system) + len(body.sample_query)) // 4)
        tok_out = max(1, len(response_text) // 4)
        cost_usd = round((tok_in * 3.0 + tok_out * 15.0) / 1_000_000, 8)

    except Exception as exc:
        log.warning(f"[atlax_persona] preview LLM failed ({org_id}): {exc}")
        raise HTTPException(503, f"Error al ejecutar preview LLM: {str(exc)[:200]}")

    return JSONResponse({
        "ok": True,
        "response_text": response_text,
        "system_prompt_used": full_system[:2000],  # truncado para debug
        "model": model_name,
        "cost_usd": cost_usd,
        "persona_name": merged_persona.get("persona_name", "Atlax"),
    })
