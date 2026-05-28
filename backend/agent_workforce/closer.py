"""P2.T2 — Closer agent · detecta leads listos para cerrar.

Agente PURO: RETORNA List[dict] (NO inserta). El orchestrator (T1) hace el upsert
con dedup_key f"{source_agent}:{type}:{lead_id}" + expires_at + user_id.

Contrato de cada dict (T1 añade dedup_key/expires_at/user_id):
  {type, lead_id, title, subtitle, priority, cta_actions[], source_agent}

Detecta leads con alta probabilidad de cierre vía close_probability (reusa
W5.4 buyer_score + W5.15 FSD confidence + W5.19 probability). FAIL-OPEN → [].
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.agent.closer")

SOURCE_AGENT = "closer"
CLOSE_THRESHOLD = 70        # prob ≥ 70% ⇒ "listo para cierre"
PRIORITY_ALTA = 2           # alta (en la queue: 1=urgente, 2=alta, 3=media)
MAX_LEADS = 200             # techo de leads a evaluar por corrida
MAX_ACTIONS = 25            # techo de acciones emitidas


def _nombre(lead: Dict[str, Any]) -> str:
    n = (f"{lead.get('first_name', '')} {lead.get('last_name', '')}").strip()
    return n or "Lead"


async def run_closer(db, user_id: str, tenant_id=None) -> List[Dict[str, Any]]:
    """Retorna acciones para leads listos para cierre. FAIL-OPEN → []."""
    out: List[Dict[str, Any]] = []
    try:
        from close_probability import close_probability

        # Scoping del pipeline personal = owner_id (los docs del asesor no llevan
        # tenant_id; tenant_id queda en la firma/contrato pero no filtra docs).
        q: Dict[str, Any] = {"owner_id": user_id}
        leads = await db.asesor_contactos.find(
            q, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
        ).sort("created_at", -1).limit(MAX_LEADS).to_list(MAX_LEADS)

        for lead in leads:
            lid = lead.get("id")
            if not lid:
                continue
            try:
                cp = await close_probability(db, lid)
            except Exception:
                continue
            prob = cp.get("prob", 50)
            if not isinstance(prob, (int, float)) or prob < CLOSE_THRESHOLD:
                continue
            nombre = _nombre(lead)
            out.append({
                "type": "lead_listo_cierre",
                "lead_id": lid,
                "title": f"🎯 {nombre} listo para cierre ({int(prob)}%)",
                "subtitle": "Alta probabilidad · llamar o agendar cierre",
                "priority": PRIORITY_ALTA,
                "cta_actions": ["llamar", "agendar_cierre", "ver_lead"],
                "source_agent": SOURCE_AGENT,
            })
            if len(out) >= MAX_ACTIONS:
                break
        return out
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[closer] run_closer fail-open: {exc}")
        return []
