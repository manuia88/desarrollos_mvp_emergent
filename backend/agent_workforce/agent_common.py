"""P2 · Agent Workforce · helpers compartidos.

Contrato de acción (lo que cada agente retorna vía build_action). El ORCHESTRATOR
añade user_id/tenant_id/status al UPSERT — los agentes NO tocan eso.

Reglas del contrato command_center_actions (ver routes/advisor.py · ensure_command_center_indexes):
- dedup_key determinista f"{source_agent}:{type}:{lead_id}" → upsert idempotente, NO duplica al re-correr.
- expires_at = horizonte de RELEVANCIA (el índice TTL borra al vencer · incluido pending).
- priority: 1=urgente (arriba) · el dashboard ordena ascendente.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional

log = logging.getLogger("dmx.agent_workforce")

# Cap por agente/tenant/día · evita inundar la cola si un agente se dispara. Env-tunable.
AGENT_DAILY_CAP_PER_TENANT = int(os.environ.get("AGENT_WORKFORCE_DAILY_CAP_PER_TENANT", "50"))

# Catálogo canónico de los 5 agentes (orden de prioridad de display).
AGENT_NAMES = ["prospector", "nurturer", "closer", "analyst", "coach"]

# Labels es-MX para badge "🤖 {label}" en Command Center.
AGENT_LABELS = {
    "prospector": "Prospector",
    "nurturer":   "Nurturer",
    "closer":     "Closer",
    "analyst":    "Analyst",
    "coach":      "Coach",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_action(
    source_agent: str,
    type: str,
    lead_id: Optional[str],
    title: str,
    subtitle: str = "",
    priority: int = 2,
    cta_actions: Optional[List[str]] = None,
    expires_hours: int = 72,
    icon_hint: str = "sparkles",
    color_hint: str = "indigo",
) -> Dict[str, Any]:
    """Normaliza una acción de agente al shape del contrato command_center_actions.

    dedup_key determinista garantiza upsert idempotente por (user_id, dedup_key).
    El `id` = dedup_key (estable entre re-corridas · lo usa complete/dismiss del dashboard).
    expires_at se calcula desde ahora + expires_hours (horizonte de relevancia).
    user_id / tenant_id / status los añade el orchestrator en el UPSERT.
    """
    lead_part = lead_id or "_"
    dedup_key = f"{source_agent}:{type}:{lead_part}"
    now = _now()
    return {
        "id": dedup_key,
        "dedup_key": dedup_key,
        "source_agent": source_agent,
        "type": type,
        "lead_id": lead_id,
        "title": title or "Acción sugerida",
        "subtitle": subtitle or "",
        "priority": int(priority) if priority else 2,
        "cta_actions": cta_actions or ["ver_lead"],
        "icon_hint": icon_hint,
        "color_hint": color_hint,
        "expires_at": now + timedelta(hours=max(1, int(expires_hours))),
    }


async def run_agent_safe(
    fn: Callable[..., Awaitable[List[Dict[str, Any]]]],
    db,
    user_id: str,
    tenant_id: Optional[str],
    agent_name: str,
) -> List[Dict[str, Any]]:
    """FAIL-OPEN wrapper: corre un agente puro y devuelve [] ante CUALQUIER fallo.

    Garantiza que un agente roto (o T2/T3 ausente) NUNCA tumba al orchestrator.
    También cap-ea defensivamente la lista al límite per-tenant.
    """
    try:
        actions = await fn(db, user_id, tenant_id)
        if not actions:
            return []
        if len(actions) > AGENT_DAILY_CAP_PER_TENANT:
            log.info(
                f"[agent_workforce] {agent_name} cap {len(actions)}→{AGENT_DAILY_CAP_PER_TENANT} "
                f"(user={user_id})"
            )
            actions = actions[:AGENT_DAILY_CAP_PER_TENANT]
        # Estampar source_agent por si el agente lo omitió (defensa contra orphan badge).
        for a in actions:
            a.setdefault("source_agent", agent_name)
        return actions
    except Exception as e:
        log.warning(f"[agent_workforce] {agent_name} FAIL-OPEN: {e}")
        return []


async def map_emails_to_buyer_tiers(db, emails: List[str]) -> Dict[str, str]:
    """email → tier (hot|warm|cold) vía users(email→user_id) + buyer_scores.

    Reusa el patrón de routes/advisor.py (_build_action_queue). FAIL-OPEN {}.
    """
    out: Dict[str, str] = {}
    try:
        emails = [e for e in {e for e in emails if e}]
        if not emails:
            return out
        email_to_uid: Dict[str, str] = {}
        async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "user_id": 1, "email": 1}):
            if u.get("user_id") and u.get("email"):
                email_to_uid[u["email"]] = u["user_id"]
        if not email_to_uid:
            return out
        uid_to_tier: Dict[str, str] = {}
        async for s in db.buyer_scores.find(
            {"user_id": {"$in": list(email_to_uid.values())}}, {"_id": 0, "user_id": 1, "tier": 1}
        ):
            uid_to_tier[s["user_id"]] = s.get("tier", "cold")
        for email, uid in email_to_uid.items():
            if uid in uid_to_tier:
                out[email] = uid_to_tier[uid]
    except Exception as e:
        log.warning(f"[agent_workforce] map_emails_to_buyer_tiers: {e}")
    return out
