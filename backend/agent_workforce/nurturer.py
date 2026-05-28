"""P2 · Nurturer (T1) · agente PURO.

Detecta leads que YA tuvieron contacto pero llevan X días en silencio y emite una acción
"Reactiva a {lead}: enviar {plantilla}". Reusa _last_contact_map (advisor) + el delegate
lead_nurture (director_agent · dry_run) para sugerir la secuencia · FAIL-OPEN a plantilla
heurística si el delegate no está disponible.

Separación vs Prospector: Prospector = leads NUEVOS sin calificar (sin historial). Nurturer
= leads CON historial de contacto que se enfriaron → no se pisan (dedup por type distinto).

Contrato: run_nurturer(db, user_id, tenant_id) -> List[dict] · FAIL-OPEN · NO inserta.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .agent_common import build_action, map_emails_to_buyer_tiers, _now

log = logging.getLogger("dmx.agent_workforce.nurturer")

SOURCE = "nurturer"

NO_CONTACT_DAYS = 5        # silencio mínimo para reactivar
MAX_CANDIDATES = 200

# sequence_type del delegate → plantilla WA es-MX (fallback "Reactivación").
_PLANTILLA = {
    "reengagement": "plantilla Reactivación",
    "nurture":      "plantilla Nutrición",
    "welcome":      "plantilla Bienvenida",
    "follow_up":    "plantilla Seguimiento",
}
_DEFAULT_PLANTILLA = "plantilla Reactivación"


async def run_nurturer(db, user_id: str, tenant_id: Optional[str]) -> List[Dict[str, Any]]:
    """Leads tibios en silencio Xd → acciones de reactivación. FAIL-OPEN [] ante fallo."""
    if not user_id:
        return []
    actions: List[Dict[str, Any]] = []
    try:
        leads = await db.asesor_contactos.find(
            {"owner_id": user_id, "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "emails": 1},
        ).sort("created_at", -1).limit(MAX_CANDIDATES).to_list(MAX_CANDIDATES)
        if not leads:
            return []

        ids = [c["id"] for c in leads if c.get("id")]
        last_map = await _resolve_last_contact_map(db, ids)

        emails = [(c.get("emails") or [None])[0] for c in leads]
        tier_by_email = await map_emails_to_buyer_tiers(db, emails)

        now = _now()
        cutoff = now - timedelta(days=NO_CONTACT_DAYS)
        for c in leads:
            cid = c.get("id")
            if not cid:
                continue
            last = last_map.get(cid)
            if isinstance(last, str):
                try:
                    last = datetime.fromisoformat(last.replace("Z", "+00:00"))
                except Exception:
                    last = None
            # Nurturer SOLO toca leads CON historial de contacto que se enfrió.
            if last is None or last >= cutoff:
                continue

            nombre = (f"{c.get('first_name', '')} {c.get('last_name', '')}").strip() or "Lead"
            email = (c.get("emails") or [None])[0]
            tier = tier_by_email.get(email)
            plantilla = await _suggest_plantilla(db, tenant_id, cid)
            dias = max(NO_CONTACT_DAYS, (now - last).days)
            priority = 2 if tier in ("hot", "warm") else 3
            actions.append(build_action(
                source_agent=SOURCE,
                type="reactivar_lead",
                lead_id=cid,
                title=f"Reactiva a {nombre}",
                subtitle=f"Sin contacto hace {dias} días · enviar {plantilla}",
                priority=priority,
                cta_actions=["whatsapp", "ver_lead"],
                expires_hours=96,
                icon_hint="message-circle",
                color_hint="amber",
            ))
    except Exception as e:
        log.warning(f"[nurturer] FAIL-OPEN: {e}")
        return []
    return actions


async def _resolve_last_contact_map(db, ids: List[str]) -> Dict[str, Any]:
    """contacto_id → último ts. Reusa _last_contact_map de advisor; inline fallback
    (mismo agregado) si advisor no es importable. FAIL-OPEN {}."""
    if not ids:
        return {}
    try:
        from routes.advisor import _last_contact_map
        return await _last_contact_map(db, ids)
    except Exception:
        out: Dict[str, Any] = {}
        try:
            async for row in db.asesor_contacto_timeline.aggregate([
                {"$match": {"contacto_id": {"$in": ids}}},
                {"$group": {"_id": "$contacto_id", "last_ts": {"$max": "$ts"}}},
            ]):
                out[row["_id"]] = row.get("last_ts")
        except Exception as e:
            log.warning(f"[nurturer] last_contact inline: {e}")
        return out


async def _suggest_plantilla(db, tenant_id: Optional[str], lead_id: str) -> str:
    """Reusa delegate lead_nurture (dry_run) para sugerir secuencia. FAIL-OPEN default."""
    try:
        from director_agent_engine import _tool_delegate_lead_nurture
        res = await _tool_delegate_lead_nurture(db, tenant_id or "default", lead_id, dry_run=True)
        seq = (res or {}).get("sequence_type")
        return _PLANTILLA.get(seq, _DEFAULT_PLANTILLA)
    except Exception:
        return _DEFAULT_PLANTILLA
