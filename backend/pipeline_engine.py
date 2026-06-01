"""W5.ASR.2 Parte 1 — Pipeline Engine 7+2 · motor de estados + hard-rules + paralelas.

Schema V2 lead statuses:
  Lineales (7): lead_nuevo · contactado · calificado · visita · negociacion · cierre · vendido
  Paralelas (2): nurture · perdido  (pueden activarse desde cualquier etapa lineal)

Hard-rules: 6 transiciones con validadores de datos obligatorios.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.pipeline")

# ─── Constantes ───────────────────────────────────────────────────────────────

LINEAR_STAGES_ORDER: List[str] = [
    "lead_nuevo",    # 0
    "contactado",    # 1
    "calificado",    # 2
    "visita",        # 3
    "negociacion",   # 4
    "cierre",        # 5
    "vendido",       # 6
]

PARALLEL_STATES: List[str] = ["nurture", "perdido"]

LEAD_STATUSES_V2: List[str] = LINEAR_STAGES_ORDER + PARALLEL_STATES

# Mapeo V1 → V2 para dual-write y migración
LEAD_STATUS_MAP_V1_TO_V2: Dict[str, str] = {
    "nuevo":            "lead_nuevo",
    "under_review":     "lead_nuevo",     # redundante · subsume
    "contactado":       "contactado",
    "visita_agendada":  "visita",
    "visita_realizada": "visita",
    "propuesta":        "negociacion",
    "cerrado_ganado":   "vendido",
    "cerrado_perdido":  "perdido",
}

# ─── Hard-rules registry ──────────────────────────────────────────────────────

_HARD_RULES: List[Dict[str, Any]] = [
    {
        "from_stage": "lead_nuevo",
        "to_stage":   "contactado",
        "error_msg":  "Para contactar lead registra primer contacto inicial (first_contact_sent requerido)",
        "validator":  lambda ld: bool(ld.get("first_msg_sent_at") or ld.get("first_contact_sent")),
    },
    {
        "from_stage": "contactado",
        "to_stage":   "calificado",
        "error_msg":  "Para calificar lead registra budget y timeline declarados",
        "validator":  lambda ld: bool(ld.get("budget_declared")) and bool(ld.get("timeline_declared")),
    },
    {
        "from_stage": "calificado",
        "to_stage":   "visita",
        "error_msg":  "Para agendar visita registra primero una cita (cita_id requerido)",
        "validator":  lambda ld: bool(ld.get("cita_id")),
    },
    {
        "from_stage": "visita",
        "to_stage":   "negociacion",
        "error_msg":  "Para iniciar negociacion registra el resultado de la visita (visit_outcome requerido)",
        "validator":  lambda ld: bool(ld.get("visit_outcome")),
    },
    {
        "from_stage": "negociacion",
        "to_stage":   "cierre",
        "error_msg":  "Para cerrar registra la oferta aceptada (oferta_accepted_at requerido)",
        "validator":  lambda ld: bool(ld.get("oferta_accepted_at")),
    },
    {
        "from_stage": "cierre",
        "to_stage":   "vendido",
        "error_msg":  "Para marcar como vendido registra la firma notarial (notaria_completed_at requerido)",
        "validator":  lambda ld: bool(ld.get("notaria_completed_at")),
    },
]

# Lookup rápido (from_stage, to_stage) → rule
_RULES_LOOKUP: Dict[Tuple[str, str], Dict[str, Any]] = {
    (r["from_stage"], r["to_stage"]): r for r in _HARD_RULES
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def map_v1_to_v2(old_status: str) -> str:
    """Mapea un status V1 a su equivalente V2. Retorna 'lead_nuevo' si desconocido."""
    return LEAD_STATUS_MAP_V1_TO_V2.get(old_status, "lead_nuevo")


# Valores V1/inválidos que quedaron escritos por error en el campo status_v2
# (bug histórico de lead_capture/studio_landing) → su equivalente V2 correcto.
_BAD_STATUS_V2_FIX: Dict[str, str] = {
    "nuevo":              "lead_nuevo",
    "under_review":       "lead_nuevo",
    "pending_assignment": "lead_nuevo",
}


async def backfill_status_v2(db) -> int:
    """Repara leads cuyo status_v2 quedó con un valor V1/inválido → los hace
    visibles a smart lists y desbloquea sus transiciones. Idempotente: tras la
    primera corrida, 0 documentos coinciden. FAIL-OPEN."""
    fixed = 0
    try:
        for bad, good in _BAD_STATUS_V2_FIX.items():
            res = await db.leads.update_many({"status_v2": bad}, {"$set": {"status_v2": good}})
            fixed += res.modified_count or 0
        if fixed:
            log.info(f"[pipeline] backfill_status_v2 reparó {fixed} leads")
    except Exception as exc:
        log.warning(f"[pipeline] backfill_status_v2 warning: {exc}")
    return fixed


# Status V1 que cuentan como "lead cerrado" (no compite por el dedup 1×proyecto×contacto).
LEAD_CLOSED_STATUSES = ("cerrado_ganado", "cerrado_perdido")


async def reconcile_lead_activo(db) -> int:
    """Recalcula el campo `activo` (= lead NO cerrado) desde el status V1 de TODOS los
    leads. Es la RED DE SEGURIDAD del índice único de dedup: aunque algún flujo cierre
    o cree un lead sin tocar `activo`, esta corrida lo deja consistente. Idempotente
    (solo toca los que difieren) · derivable 100% del status · FAIL-OPEN."""
    fixed = 0
    try:
        # cerrados que aún figuran activo != False → bajar bandera
        r1 = await db.leads.update_many(
            {"status": {"$in": list(LEAD_CLOSED_STATUSES)}, "activo": {"$ne": False}},
            {"$set": {"activo": False}})
        # no-cerrados que no tienen activo == True → subir bandera
        r2 = await db.leads.update_many(
            {"status": {"$nin": list(LEAD_CLOSED_STATUSES)}, "activo": {"$ne": True}},
            {"$set": {"activo": True}})
        fixed = (r1.modified_count or 0) + (r2.modified_count or 0)
        if fixed:
            log.info(f"[pipeline] reconcile_lead_activo sincronizó {fixed} leads")
    except Exception as exc:
        log.warning(f"[pipeline] reconcile_lead_activo warning: {exc}")
    return fixed


def validate_transition_v2(lead: Dict[str, Any], target_status_v2: str) -> Tuple[bool, str]:
    """Valida si la transición al status V2 destino es permitida para este lead.

    Reglas:
    - Paralelas (nurture/perdido): siempre permitidas desde cualquier estado lineal.
    - Lineales: debe existir hard-rule para (current_v2 → target); si no existe → 422.
    - Lead sin status_v2 (no migrado): skip validación V2 → retornar (True, "").
    """
    if target_status_v2 in PARALLEL_STATES:
        return (True, "")

    if target_status_v2 not in LINEAR_STAGES_ORDER:
        return (False, f"Status V2 desconocido: {target_status_v2}")

    current_v2 = lead.get("status_v2")
    if not current_v2:
        # Lead no migrado: skip validación V2 (aplican guards V1 existentes)
        return (True, "")

    rule = _RULES_LOOKUP.get((current_v2, target_status_v2))
    if rule is None:
        return (False, "transición no permitida: solo lineal o paralelas")

    if rule["validator"](lead):
        return (True, "")
    return (False, rule["error_msg"])


def get_lead_pipeline_state(lead: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa el estado pipeline completo del lead (lineal + paralelas + índice)."""
    status_v2 = lead.get("status_v2") or map_v1_to_v2(lead.get("status", "nuevo"))

    stage_index = -1
    if status_v2 in LINEAR_STAGES_ORDER:
        stage_index = LINEAR_STAGES_ORDER.index(status_v2)

    parallel_states: List[str] = []
    if lead.get("nurture_active"):
        parallel_states.append("nurture")
    if lead.get("lost_at"):
        parallel_states.append("perdido")

    return {
        "linear_status": status_v2 if status_v2 in LINEAR_STAGES_ORDER else None,
        "parallel_states": parallel_states,
        "stage_index": stage_index,
        "pipeline_version": lead.get("pipeline_version", 1),
    }


async def set_parallel_state(
    db,
    lead_id: str,
    state: str,
    enable: bool,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Activa o desactiva un estado paralelo (nurture / perdido) en el lead.

    Nunca modifica `status_v2` lineal — los paralelos son ortogonales.
    Retorna el pipeline_state actualizado.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if state == "nurture":
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {"nurture_active": enable, "updated_at": now_iso}},
        )
        log.info(f"[pipeline] nurture={'on' if enable else 'off'} · lead={lead_id}")

    elif state == "perdido":
        if enable:
            patch: Dict[str, Any] = {"lost_at": now_iso, "updated_at": now_iso}
            if reason:
                patch["lost_reason"] = reason
            await db.leads.update_one({"id": lead_id}, {"$set": patch})
            log.info(f"[pipeline] perdido=on · lead={lead_id} reason={reason}")
        else:
            # Unmark perdido: limpiar lost_at (edge conservador)
            await db.leads.update_one(
                {"id": lead_id},
                {"$unset": {"lost_at": ""}, "$set": {"updated_at": now_iso}},
            )
            log.info(f"[pipeline] perdido=off · lead={lead_id}")
    else:
        log.warning(f"[pipeline] set_parallel_state: estado desconocido '{state}'")

    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return get_lead_pipeline_state(updated or {})


# ─── DB indexes ───────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Crea índices para status_v2 + nurture_active + dedup de leads activos."""
    try:
        await db.leads.create_index("status_v2", sparse=True)
        await db.leads.create_index("nurture_active", sparse=True)
        await db.leads.create_index("pipeline_version", sparse=True)
        log.info("[pipeline] indexes OK")
    except Exception as exc:
        log.warning(f"[pipeline] ensure_indexes warning: {exc}")
    # Dedup 1×proyecto×contacto SOLO entre leads ACTIVOS (no cerrados). El índice no
    # puede calcular "no cerrado", por eso filtra por el campo `activo` (igualdad) +
    # phone/email normalizado ($type:"string", excluye nulos). Reabrir tras cierre
    # vuelve a permitir alta. Falla a build solo si ya hay duplicados activos (raro).
    for field, name in (("contact.phone_norm", "uniq_active_lead_phone_project"),
                        ("contact.email_norm", "uniq_active_lead_email_project")):
        try:
            await db.leads.create_index(
                [("project_id", 1), (field, 1)],
                unique=True,
                partialFilterExpression={"activo": True, field: {"$type": "string"}},
                name=name, background=True)
        except Exception as exc:
            log.warning(f"[pipeline] dedup index {name} warning (¿duplicados activos?): {exc}")
