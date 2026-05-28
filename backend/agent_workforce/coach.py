"""Coach agent · P2.T3 · agente PURO de la AI Agent Workforce.

run_coach(db, user_id, tenant_id) → List[dict]

Analiza la performance del asesor (coaching_analysis.analyze_performance, que reúsa el
SOC franchise score W6.MOV.1 + ranking + patrones temporales de cierres) y devuelve a lo
sumo UNA acción tipo "tip" lista para la action_queue del Command Center.

CONTRATO (advisor.py · command_center_actions):
    · run_coach RETORNA List[dict] · NO inserta (el orchestrator T1 inserta).
    · Cada dict: {type, title, subtitle, priority, cta_actions[], source_agent="coach"}.
    · Tip general → sin lead_id (el orchestrator maneja dedup_key sin lead_id).

Reglas:
    · cap 1 tip/día/asesor: si ya hay una acción coach pending creada hoy, devuelve []
      (anti-spam · sin tocar el código del orchestrator, solo lee la colección).
    · FAIL-OPEN: cualquier fallo → return [] (nunca rompe al orchestrator).

NO toca shared (server/asistente/routes/command_center/orchestrator/agent_common/__init__).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.agent_coach")

SOURCE_AGENT = "coach"
ACTION_TYPE = "coach_tip"
DEFAULT_PRIORITY = 4  # tips: bajo en la cola (1=cita urgente … 4=consejo de mejora)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _already_sent_today(db, user_id: str) -> bool:
    """True si ya existe una acción coach pending creada hoy (cap 1/día).

    Lee command_center_actions (la colección · NO el route). FAIL-OPEN False:
    ante error preferimos permitir el tip que silenciar al asesor.
    """
    try:
        now = _now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await db.command_center_actions.find_one({
            "user_id": user_id,
            "source_agent": SOURCE_AGENT,
            "status": "pending",
            "created_at": {"$gte": day_start.isoformat()},
        })
        return existing is not None
    except Exception as e:
        log.warning(f"[agent_coach] cap-check FAIL-OPEN: {e}")
        return False


async def run_coach(
    db,
    user_id: str,
    tenant_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Genera (a lo más) 1 tip de coaching accionable para el asesor.

    Returns: List[dict] (0 o 1 elemento) con source_agent="coach".
    FAIL-OPEN: cualquier excepción → [].
    """
    try:
        if not user_id:
            return []

        # Cap 1/día (anti-spam).
        if await _already_sent_today(db, user_id):
            return []

        import coaching_analysis
        analysis = await coaching_analysis.analyze_performance(db, user_id, tenant_id)
        suggestions = (analysis or {}).get("suggestions") or []
        if not suggestions:
            return []

        top = suggestions[0]
        text = (top.get("text") or "").strip()
        if not text:
            return []

        cta = top.get("cta_actions") or ["ver_dashboard"]
        # dedup_key determinista por día (el orchestrator puede sobre-escribirlo; lo
        # incluimos como red de seguridad para el dedup en lectura de advisor.py).
        day_iso = _now().strftime("%Y-%m-%d")

        return [{
            "type": ACTION_TYPE,
            "title": "🎓 Tip de tu coach",
            "subtitle": text,
            "priority": DEFAULT_PRIORITY,
            "cta_actions": cta,
            "source_agent": SOURCE_AGENT,
            "dedup_key": f"{SOURCE_AGENT}:{ACTION_TYPE}:{day_iso}",
            "icon_hint": "graduation-cap",
            "color_hint": "emerald",
        }]
    except Exception as e:
        log.warning(f"[agent_coach] run_coach FAIL-OPEN: {e}")
        return []
