"""P5.A · Auto-pilot · el agente EJECUTA acciones aprobadas (no solo sugiere).

ALTO RIESGO · GUARDRAILS ESTRICTOS (no negociables):
  1. WHITELIST de tipos auto-ejecutables · NADA fuera de esto.
  2. NEVER-AUTO denylist (dinero/contratos/cierres/delete/irreversible) · defensa en
     profundidad: aunque un tipo entrara a whitelist, si matchea denylist → NUNCA.
  3. confidence ≥ AUTOPILOT_CONFIDENCE_MIN (env · default 70) o skip. Sin confidence → skip.
  4. Opt-in POR TIPO (asesor activa cada uno · default TODOS off).
  5. Kill switch global (paused=True → 0 ejecuciones).
  6. Cap diario AUTOPILOT_DAILY_CAP (env · default 20 auto-acciones/asesor/día).
  7. audit_immutable.log CADA auto-acción + status=auto_done.
  8. FAIL-OPEN: si la ejecución falla → la acción QUEDA pending (no se marca) + log failed.

Corre DESPUÉS de los agentes P2 (cron 07:20 UTC · agentes 07:10 · digest 07:30).
NO toca orchestrator P2 · solo lee command_center_actions pending y marca status.
REUSA whatsapp WAEngine · colecciones asesor_tareas/asesor_busquedas (acciones reversibles).
"""
from __future__ import annotations

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.auto_pilot")

# ── Guardrail constants ─────────────────────────────────────────────────────
# SOLO estos tipos pueden auto-ejecutarse. Cualquier otro → se deja como sugerencia.
WHITELIST = ("followup_whatsapp", "recordatorio", "reasignar_etapa")

# Defensa en profundidad: substrings de acciones IRREVERSIBLES o sensibles que
# NUNCA se auto-ejecutan, sin importar whitelist/opt-in/confidence. Términos de
# alta señal (se evitan fragmentos cortos como "close"/"sign"/"deal" que colisionan
# con palabras inocentes — "confirmar", "ideal"; el riesgo real son dinero/contrato/cierre).
NEVER_AUTO_SUBSTR = (
    "money", "dinero", "pago", "payment", "cobr", "comision", "comisión",
    "contrato", "contract", "cierre", "firmar contrato",
    "delete", "eliminar", "borrar", "factura", "invoice",
    # Estados TERMINALES/ganado/pagado de pipeline: el piloto NO debe auto-mover un
    # lead a un cierre/won/pagado (sesga métricas + transición sensible). Stems que
    # capturan cerrado/cerrada/cerrado_pagado · ganada/ganado · pagado/pagada.
    "cerrad", "ganad", "pagad",
)

AUTOPILOT_CONFIDENCE_MIN = int(os.environ.get("AUTOPILOT_CONFIDENCE_MIN", "70"))
AUTOPILOT_DAILY_CAP = int(os.environ.get("AUTOPILOT_DAILY_CAP", "20"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_iso() -> str:
    return _now().strftime("%Y-%m-%d")


def _is_never_auto(action: Dict[str, Any]) -> bool:
    """True si la acción matchea la denylist irreversible. Escanea TODOS los campos
    que llegan a un executor — incluido el cuerpo del WhatsApp (autopilot_body) y la
    etapa destino (target_stage), no solo title/subtitle — para que un mensaje con
    'pago/comisión/contrato' nunca se envíe aunque venga por autopilot_body."""
    fields = ("type", "title", "subtitle", "cta_actions", "autopilot_body", "target_stage")
    blob = " ".join(str(action.get(k, "")) for k in fields).lower()
    return any(s in blob for s in NEVER_AUTO_SUBSTR)


def _action_confidence(action: Dict[str, Any]) -> float:
    """Lee confidence de la acción (0-100). Sin valor → 0 (skip · fail-safe)."""
    for k in ("confidence", "autopilot_confidence", "confidence_pct"):
        v = action.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return 0.0


# ── Config (opt-in por tipo + kill switch · colección propia · NO toca prefs core) ──
async def get_autopilot_config(db, user_id: str) -> Dict[str, Any]:
    """Config del piloto. Default seguro: paused=False pero TODOS los tipos OFF (opt-in)."""
    cfg = None
    try:
        cfg = await db.autopilot_config.find_one({"user_id": user_id}, {"_id": 0})
    except Exception as e:
        log.warning(f"[autopilot] get_config {user_id}: {e}")
    types = (cfg or {}).get("types") or {}
    return {
        "user_id": user_id,
        "paused": bool((cfg or {}).get("paused", False)),
        "types": {t: bool(types.get(t, False)) for t in WHITELIST},
        "confidence_min": AUTOPILOT_CONFIDENCE_MIN,
        "daily_cap": AUTOPILOT_DAILY_CAP,
    }


async def set_autopilot_config(db, user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Actualiza opt-in por tipo y/o kill switch. Solo acepta llaves conocidas."""
    set_doc: Dict[str, Any] = {"user_id": user_id, "updated_at": _now().isoformat()}
    if "paused" in patch:
        set_doc["paused"] = bool(patch["paused"])
    if isinstance(patch.get("types"), dict):
        # Solo tipos de la whitelist · ignora cualquier otro
        cur = (await db.autopilot_config.find_one({"user_id": user_id}, {"_id": 0, "types": 1}) or {}).get("types") or {}
        for t in WHITELIST:
            if t in patch["types"]:
                cur[t] = bool(patch["types"][t])
        set_doc["types"] = {t: bool(cur.get(t, False)) for t in WHITELIST}
    await db.autopilot_config.update_one({"user_id": user_id}, {"$set": set_doc}, upsert=True)
    return await get_autopilot_config(db, user_id)


# ── Executors (reversibles · reusan infra · FAIL-OPEN) ──────────────────────────
async def _exec_followup_whatsapp(db, action: Dict[str, Any], user_id: str, tenant_id: Optional[str]) -> Dict[str, Any]:
    """Envía un follow-up por WhatsApp al lead. Reusa WAEngine. Fail si falta phone/body."""
    lead_id = action.get("lead_id")
    body = (action.get("autopilot_body") or action.get("subtitle") or "").strip()
    if not lead_id or not body:
        return {"ok": False, "error": "missing_lead_or_body"}
    contacto = await db.asesor_contactos.find_one(
        {"id": lead_id, "owner_id": user_id}, {"_id": 0, "phones": 1})
    if not contacto:
        return {"ok": False, "error": "lead_not_owned"}
    phone = (contacto.get("phones") or [None])[0]
    if not phone:
        return {"ok": False, "error": "no_phone"}
    from whatsapp_engine import WAEngine
    wa = WAEngine(db, org_id=tenant_id or "dmx")
    res = await wa.send_message(to_number=str(phone), body=body[:1600], lead_id=lead_id)
    return {"ok": bool(res.get("ok")), "detail": f"whatsapp→{str(phone)[-4:]}", "error": res.get("error")}


async def _exec_recordatorio(db, action: Dict[str, Any], user_id: str, tenant_id: Optional[str]) -> Dict[str, Any]:
    """Crea una tarea-recordatorio (reversible). Escribe directo en asesor_tareas."""
    titulo = (action.get("title") or "Recordatorio").strip()
    due = action.get("autopilot_due_at") or (_now() + timedelta(days=1)).isoformat()
    item = {
        "id": f"tarea_{uuid.uuid4().hex[:10]}",
        "owner_id": user_id,
        "titulo": titulo,
        "due_at": due,
        "prioridad": "media",
        "tipo": action.get("lead_id") and "lead" or "general",
        "entity_id": action.get("lead_id"),
        "done": False,
        "created_at": _now(),
        "created_by": "autopilot",
    }
    await db.asesor_tareas.insert_one(dict(item))
    return {"ok": True, "detail": f"tarea:{item['id']}"}


async def _exec_reasignar_etapa(db, action: Dict[str, Any], user_id: str, tenant_id: Optional[str]) -> Dict[str, Any]:
    """Mueve la etapa de una búsqueda (reversible). Fail si falta busqueda_id/target_stage."""
    bid = action.get("busqueda_id") or action.get("entity_id")
    target = action.get("target_stage")
    if not bid or not target:
        return {"ok": False, "error": "missing_busqueda_or_stage"}
    r = await db.asesor_busquedas.update_one(
        {"id": bid, "owner_id": user_id},  # _assert owner en el propio update
        {"$set": {"stage": target, "updated_at": _now(), "moved_by": "autopilot"}})
    if r.matched_count == 0:
        return {"ok": False, "error": "busqueda_not_owned"}
    return {"ok": True, "detail": f"busqueda:{bid}→{target}"}


_EXECUTORS = {
    "followup_whatsapp": _exec_followup_whatsapp,
    "recordatorio": _exec_recordatorio,
    "reasignar_etapa": _exec_reasignar_etapa,
}


async def _count_auto_done_today(db, user_id: str) -> int:
    try:
        return await db.autopilot_log.count_documents(
            {"user_id": user_id, "date": _today_iso(), "status": "auto_done"})
    except Exception:
        return 0


async def _log_action(db, user_id: str, action: Dict[str, Any], status: str, detail: str, error: str = "") -> str:
    log_id = f"aplog_{uuid.uuid4().hex[:10]}"
    try:
        await db.autopilot_log.insert_one({
            "id": log_id, "user_id": user_id, "date": _today_iso(),
            "action_id": action.get("id"), "type": action.get("type"),
            "status": status, "detail": detail, "error": error,
            "title": action.get("title", ""), "ts": _now(),
            "expires_at": _now() + timedelta(days=30),  # TTL housekeeping
        })
    except Exception as e:
        log.warning(f"[autopilot] log insert {user_id}: {e}")
    return log_id


# ── Core ─────────────────────────────────────────────────────────────────────
async def run_autopilot(db, user_id: str, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Ejecuta SOLO acciones que pasan los 6 guardrails. FAIL-OPEN por acción.

    Retorna summary {ok, executed, skipped, failed, reasons{}}. NUNCA levanta.
    """
    summary = {"ok": True, "executed": 0, "skipped": 0, "failed": 0,
               "reasons": {}, "executed_ids": []}

    def _bump(reason: str):
        summary["reasons"][reason] = summary["reasons"].get(reason, 0) + 1

    if not user_id:
        return {**summary, "ok": False, "error": "user_id requerido"}

    cfg = await get_autopilot_config(db, user_id)
    # GUARDRAIL 5 · kill switch global → 0 ejecuciones
    if cfg["paused"]:
        return {**summary, "paused": True}

    # GUARDRAIL 6 · cap diario (cuántas ya ejecutó hoy)
    already = await _count_auto_done_today(db, user_id)
    remaining = max(0, AUTOPILOT_DAILY_CAP - already)
    if remaining <= 0:
        return {**summary, "reason": "daily_cap_reached"}

    try:
        pend = await db.command_center_actions.find(
            {"user_id": user_id, "status": "pending"}, {"_id": 0},
        ).sort("priority", 1).limit(200).to_list(200)
    except Exception as e:
        log.warning(f"[autopilot] read pending {user_id}: {e}")
        return summary

    for action in pend:
        if summary["executed"] >= remaining:
            _bump("daily_cap_reached"); summary["skipped"] += 1
            continue
        atype = action.get("type")
        # GUARDRAIL 1 · whitelist (fuera de whitelist → solo sugiere · no ejecuta)
        if atype not in WHITELIST:
            _bump("not_whitelisted"); summary["skipped"] += 1
            continue
        # GUARDRAIL 2 · NUNCA auto irreversible/dinero (defensa en profundidad)
        if _is_never_auto(action):
            _bump("never_auto_denylist"); summary["skipped"] += 1
            continue
        # GUARDRAIL 4 · opt-in por tipo
        if not cfg["types"].get(atype):
            _bump("type_opt_out"); summary["skipped"] += 1
            continue
        # GUARDRAIL 3 · confidence ≥ min (sin confidence → 0 → skip)
        if _action_confidence(action) < AUTOPILOT_CONFIDENCE_MIN:
            _bump("low_confidence"); summary["skipped"] += 1
            continue

        executor = _EXECUTORS.get(atype)
        if not executor:  # imposible (whitelist == executors) · cinturón
            _bump("no_executor"); summary["skipped"] += 1
            continue

        # EJECUTA · FAIL-OPEN: si falla, NO marca status (queda pending) + log failed
        try:
            res = await executor(db, action, user_id, tenant_id)
        except Exception as e:
            log.warning(f"[autopilot] exec {atype} {action.get('id')}: {e}")
            res = {"ok": False, "error": str(e)}

        if not res.get("ok"):
            await _log_action(db, user_id, action, "failed", res.get("detail", ""), str(res.get("error", "")))
            summary["failed"] += 1
            continue

        # ÉXITO · marca auto_done (sale de la cola pending · NO regenera) + log + audit
        log_id = await _log_action(db, user_id, action, "auto_done", res.get("detail", ""))
        try:
            await db.command_center_actions.update_one(
                {"id": action.get("id"), "user_id": user_id},
                {"$set": {"status": "auto_done", "resolved_at": _now(),
                          "autopilot_log_id": log_id,
                          "expires_at": _now() + timedelta(days=30)}})
        except Exception as e:
            log.warning(f"[autopilot] mark auto_done {action.get('id')}: {e}")
        # GUARDRAIL 7 · audit inmutable por auto-acción
        try:
            import audit_immutable_engine
            await audit_immutable_engine.log(
                db, {"user_id": user_id, "role": "autopilot"},
                "autopilot_execute", "command_center_action", action.get("id", ""),
                after={"type": atype, "detail": res.get("detail"), "log_id": log_id})
        except Exception:
            pass
        summary["executed"] += 1
        summary["executed_ids"].append(action.get("id"))

    return summary


async def get_autopilot_log(db, user_id: str, days: int = 7) -> Dict[str, Any]:
    """Qué hizo el piloto (para la UI). Solo del owner."""
    since = _now() - timedelta(days=max(1, days))
    items: List[Dict[str, Any]] = []
    try:
        items = await db.autopilot_log.find(
            {"user_id": user_id, "ts": {"$gte": since}}, {"_id": 0},
        ).sort("ts", -1).limit(100).to_list(100)
        for it in items:
            if hasattr(it.get("ts"), "isoformat"):
                it["ts"] = it["ts"].isoformat()
    except Exception as e:
        log.warning(f"[autopilot] get_log {user_id}: {e}")
    done_today = await _count_auto_done_today(db, user_id)
    return {"items": items, "count": len(items), "done_today": done_today}


# ── Cron diario ──────────────────────────────────────────────────────────────
async def run_cron_all(db) -> Dict[str, Any]:
    """Corre el piloto para cada asesor con config (NO barre todos · solo los que
    tienen autopilot_config · y dentro, los guardrails filtran). FAIL-OPEN por asesor."""
    total = 0
    asesores = 0
    try:
        configs = await db.autopilot_config.find(
            {"paused": {"$ne": True}}, {"_id": 0, "user_id": 1},
        ).to_list(5000)
    except Exception as e:
        log.warning(f"[autopilot] cron find configs: {e}")
        configs = []
    for c in configs:
        uid = c.get("user_id")
        if not uid:
            continue
        try:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "tenant_id": 1}) or {}
            res = await run_autopilot(db, uid, u.get("tenant_id"))
            asesores += 1
            total += res.get("executed", 0)
        except Exception as e:
            log.warning(f"[autopilot] cron run {uid}: {e}")
    log.info(f"[autopilot] cron daily: {asesores} asesores · {total} auto-acciones")
    return {"asesores": asesores, "executed": total}


def register_cron(scheduler, db=None) -> None:
    """Cron DAILY 07:20 UTC (01:20 MX) · max_instances=1 · entre agentes (07:10) y digest (07:30)."""
    if not scheduler:
        return
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        run_cron_all,
        CronTrigger(hour=7, minute=20, timezone="UTC"),
        id="autopilot_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[autopilot] daily cron scheduled @ 07:20 UTC (01:20 MX)")


async def ensure_indexes(db) -> None:
    """Índices. Idempotente. TTL limpia el log a los 30d."""
    try:
        await db.autopilot_config.create_index("user_id", unique=True)
        await db.autopilot_log.create_index([("user_id", 1), ("ts", -1)])
        await db.autopilot_log.create_index([("user_id", 1), ("date", 1), ("status", 1)])
        await db.autopilot_log.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"[autopilot] ensure_indexes: {e}")
