"""P2 · Prospector (T1) · agente PURO.

Detecta leads nuevos sin calificar (asesor_contactos recientes del owner) y emite una
acción "Califica a {lead}: {tier} · {next_step}". Reusa W5.4 buyer_score (heurístico ·
sin LLM) y, si hay claves, W7.AS.1 lead_enrichment (FAIL-OPEN si ausente).

Contrato: run_prospector(db, user_id, tenant_id) -> List[dict] · FAIL-OPEN · NO inserta.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

from .agent_common import build_action, _now

log = logging.getLogger("dmx.agent_workforce.prospector")

SOURCE = "prospector"

# Ventana de "lead nuevo" · contactos creados en los últimos N días.
NEW_LEAD_WINDOW_DAYS = 14
MAX_CANDIDATES = 200

# tier → (next_step es-MX, priority). priority 1=urgente.
_NEXT_STEP = {
    "hot":  ("agenda visita esta semana", 1),
    "warm": ("llama y envía 2 opciones a la medida", 2),
    "cold": ("nutre con contenido de la zona", 3),
    None:   ("enriquece datos y haz primer contacto", 3),
}

_TIER_LABEL = {"hot": "🔥 caliente", "warm": "tibio", "cold": "frío", None: "sin calificar"}


async def run_prospector(db, user_id: str, tenant_id: Optional[str]) -> List[Dict[str, Any]]:
    """Leads nuevos sin calificar → acciones de calificación. FAIL-OPEN [] ante fallo."""
    if not user_id:
        return []
    actions: List[Dict[str, Any]] = []
    try:
        since = (_now() - timedelta(days=NEW_LEAD_WINDOW_DAYS)).isoformat()
        # Leads recientes del owner (no borrados).
        leads = await db.asesor_contactos.find(
            {"owner_id": user_id, "deleted_at": {"$exists": False},
             "created_at": {"$gte": since}},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "emails": 1},
        ).sort("created_at", -1).limit(MAX_CANDIDATES).to_list(MAX_CANDIDATES)
        if not leads:
            return []

        # email → user_id → tier (reusa patrón advisor · 1 sola pasada). FAIL-OPEN parcial.
        emails = list({(c.get("emails") or [None])[0] for c in leads if (c.get("emails") or [None])[0]})
        email_to_uid: Dict[str, str] = {}
        uid_to_tier: Dict[str, str] = {}
        try:
            if emails:
                async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "user_id": 1, "email": 1}):
                    if u.get("user_id") and u.get("email"):
                        email_to_uid[u["email"]] = u["user_id"]
            if email_to_uid:
                async for s in db.buyer_scores.find(
                    {"user_id": {"$in": list(email_to_uid.values())}}, {"_id": 0, "user_id": 1, "tier": 1}
                ):
                    uid_to_tier[s["user_id"]] = s.get("tier", "cold")
        except Exception as e:
            log.warning(f"[prospector] tier map failed: {e}")

        for c in leads:
            cid = c.get("id")
            if not cid:
                continue
            nombre = (f"{c.get('first_name', '')} {c.get('last_name', '')}").strip() or "Lead"
            email = (c.get("emails") or [None])[0]
            uid = email_to_uid.get(email) if email else None
            tier: Optional[str] = uid_to_tier.get(uid) if uid else None

            # Si tiene cuenta pero sin score aún → calcula heurístico (sin LLM · W5.4).
            if uid and tier is None:
                try:
                    from buyer_score_engine import compute_user_score
                    score = await compute_user_score(db, uid)
                    tier = score.get("tier")
                except Exception as e:
                    log.warning(f"[prospector] compute_user_score {uid}: {e}")

            next_step, priority = _NEXT_STEP.get(tier, _NEXT_STEP[None])
            tier_label = _TIER_LABEL.get(tier, _TIER_LABEL[None])
            actions.append(build_action(
                source_agent=SOURCE,
                type="calificar_lead",
                lead_id=cid,
                title=f"Califica a {nombre}",
                subtitle=f"{tier_label} · {next_step}",
                priority=priority,
                cta_actions=["ver_lead", "llamar", "whatsapp"],
                expires_hours=72,
                icon_hint="user-check",
                color_hint="emerald",
            ))
    except Exception as e:
        log.warning(f"[prospector] FAIL-OPEN: {e}")
        return []
    return actions
