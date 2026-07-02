"""P4 · Smart Digest · resumen diario curado que se le envía al asesor por
email/WhatsApp aunque no abra la app.

ANTI-OVER-ENGINEER · reusa infraestructura existente (NO recrea):
- Email   : notifications_engine._send_email_notification (stub-aware sin RESEND_API_KEY)
- WhatsApp: whatsapp_engine.WAEngine.send_message (stub-aware sin tier/provider)
- Prefs   : notifications_engine.get_preferences (lectura) + escritura directa de las
            llaves de digest en notification_preferences (update_preferences descarta
            llaves desconocidas, y NO debemos tocar notifications_engine).
- Briefing: db.asesor_briefings (texto del día · generado por /briefing/daily)
- Acciones: command_center_actions (source_agent · solo lectura) + _build_action_queue

Opt-in: asesor_digest_enabled default False (no spam). Dedup 1/día (asesor_digest_sends).
Cron DAILY 07:30 UTC (después de agentes 07:10 · antes de jornada). FAIL-OPEN.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.asesor_digest")

DEFAULT_CHANNELS = ["email"]
FRONTEND_BRIEFING_URL = "/asesor"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_iso() -> str:
    return _now().strftime("%Y-%m-%d")


# ─── Preferencias de digest (reusa colección notification_preferences) ──────────
async def get_digest_prefs(db, user_id: str) -> Dict[str, Any]:
    """Lee prefs de digest. Reusa get_preferences (que devuelve el doc completo) y
    extrae las llaves de digest con defaults opt-in (enabled=False). FAIL-OPEN."""
    enabled = False
    channels = list(DEFAULT_CHANNELS)
    frequency = "daily"
    try:
        prefs = None
        try:
            from notifications_engine import get_preferences
            prefs = await get_preferences(db, user_id)
        except Exception:
            # Fallback: lee la MISMA colección directamente (notifications_engine no importable)
            prefs = await db.notification_preferences.find_one({"user_id": user_id}, {"_id": 0})
        prefs = prefs or {}
        enabled = bool(prefs.get("asesor_digest_enabled", False))
        channels = prefs.get("asesor_digest_channels") or list(DEFAULT_CHANNELS)
        frequency = prefs.get("digest_frequency", "daily")
    except Exception as e:
        log.warning(f"[digest] get_digest_prefs {user_id}: {e}")
    return {
        "asesor_digest_enabled": enabled,
        "asesor_digest_channels": channels,
        "digest_frequency": frequency,
    }


async def set_digest_prefs(db, user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Escribe SOLO las llaves de digest en notification_preferences (upsert directo ·
    NO via update_preferences, que descartaría estas llaves). Preserva el resto del doc."""
    set_doc: Dict[str, Any] = {"user_id": user_id, "updated_at": _now().isoformat()}
    if "asesor_digest_enabled" in patch:
        set_doc["asesor_digest_enabled"] = bool(patch["asesor_digest_enabled"])
    if "asesor_digest_channels" in patch:
        chans = patch.get("asesor_digest_channels") or []
        set_doc["asesor_digest_channels"] = [c for c in chans if c in ("email", "whatsapp")] or list(DEFAULT_CHANNELS)
    await db.notification_preferences.update_one(
        {"user_id": user_id}, {"$set": set_doc}, upsert=True,
    )
    return await get_digest_prefs(db, user_id)


# ─── Construcción del resumen ───────────────────────────────────────────────────
async def build_daily_digest(db, user_id: str, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Arma el resumen curado del día. Cada sección FAIL-OPEN (nunca rompe)."""
    now = _now()
    digest: Dict[str, Any] = {
        "user_id": user_id,
        "briefing_resumen": "",
        "agent_actions_count": {},
        "agent_actions_total": 0,
        "top_prioridades": [],
        "citas_hoy": 0,
        "generated_at": now.isoformat(),
    }

    # 1 · Briefing del día (texto · primeras líneas)
    try:
        b = await db.asesor_briefings.find_one(
            {"user_id": user_id}, {"_id": 0, "text": 1}, sort=[("date", -1)])
        if b and b.get("text"):
            lines = [ln.strip() for ln in b["text"].splitlines() if ln.strip()]
            digest["briefing_resumen"] = " ".join(lines[:3])[:280]
    except Exception as e:
        log.warning(f"[digest] briefing {user_id}: {e}")

    # 2 · Acciones generadas HOY por agentes (command_center_actions · solo lectura)
    try:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        by_agent: Dict[str, int] = {}
        async for row in db.command_center_actions.aggregate([
            {"$match": {"user_id": user_id, "source_agent": {"$ne": None},
                        "created_at": {"$gte": day_start}}},
            {"$group": {"_id": "$source_agent", "n": {"$sum": 1}}},
        ]):
            if row.get("_id"):
                by_agent[row["_id"]] = row.get("n", 0)
        digest["agent_actions_count"] = by_agent
        digest["agent_actions_total"] = sum(by_agent.values())
    except Exception as e:
        log.warning(f"[digest] agent_actions {user_id}: {e}")

    # 3 · Top 3 prioridades (reusa _build_action_queue · import diferido evita ciclo)
    try:
        from routes.advisor import _build_action_queue
        queue = await _build_action_queue(db, user_id)
        digest["top_prioridades"] = [
            {"title": a.get("title", ""), "subtitle": a.get("subtitle", ""),
             "priority": a.get("priority"), "source_agent": a.get("source_agent")}
            for a in (queue or [])[:3]
        ]
    except Exception as e:
        log.warning(f"[digest] prioridades {user_id}: {e}")

    # 4 · Citas de hoy
    try:
        day_start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        day_end_iso = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
        digest["citas_hoy"] = await db.appointments.count_documents({
            "asesor_id": user_id, "datetime": {"$gte": day_start_iso, "$lt": day_end_iso},
            "status": {"$nin": ["cancelada"]},
        })
    except Exception as e:
        log.warning(f"[digest] citas {user_id}: {e}")

    return digest


def _render_text(digest: Dict[str, Any], nombre: str = "") -> Dict[str, str]:
    """Formatea el digest a (title, body_email, body_whatsapp). es-MX."""
    saludo = f"Hola {nombre}, " if nombre else "Hola, "
    title = "Tu resumen del día · DesarrollosMX"
    total = digest.get("agent_actions_total", 0)
    citas = digest.get("citas_hoy", 0)
    prios = digest.get("top_prioridades", [])

    parts: List[str] = [saludo + "este es tu resumen del día:"]
    if digest.get("briefing_resumen"):
        parts.append("\n" + digest["briefing_resumen"])
    if total:
        detalle = ", ".join(f"{n} {ag}" for ag, n in (digest.get("agent_actions_count") or {}).items())
        parts.append(f"\nTus agentes IA generaron {total} acciones hoy ({detalle}).")
    if prios:
        parts.append("\nTus 3 prioridades:")
        for p in prios:
            sub = f" — {p['subtitle']}" if p.get("subtitle") else ""
            parts.append(f"  · {p.get('title','')}{sub}")
    if citas:
        parts.append(f"\nTienes {citas} cita(s) hoy.")
    parts.append("\nAbre tu Command Center para accionar todo.")
    body = "\n".join(parts)
    # WhatsApp: versión compacta
    wa = f"{saludo}tu resumen: {total} acciones IA · {len(prios)} prioridades · {citas} citas hoy. Abre tu Command Center."
    return {"title": title, "body_email": body, "body_whatsapp": wa}


# ─── Envío ──────────────────────────────────────────────────────────────────────
async def _already_sent_today(db, user_id: str) -> bool:
    try:
        doc = await db.asesor_digest_sends.find_one({"user_id": user_id, "date": _today_iso()})
        return doc is not None
    except Exception:
        return False


async def send_digest(db, user_id: str, tenant_id: Optional[str] = None,
                      force: bool = False) -> Dict[str, Any]:
    """Arma + envía el digest según prefs. Dedup 1/día (salvo force). FAIL-OPEN.

    Retorna {ok, sent_channels, skipped, reason?}. NO levanta excepción.
    """
    prefs = await get_digest_prefs(db, user_id)
    if not prefs["asesor_digest_enabled"] and not force:
        return {"ok": True, "skipped": True, "reason": "digest_disabled", "sent_channels": []}
    if not force and await _already_sent_today(db, user_id):
        return {"ok": True, "skipped": True, "reason": "already_sent_today", "sent_channels": []}

    # Datos de contacto del asesor (email + whatsapp) · FAIL-OPEN
    email = None
    nombre = ""
    try:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1}) or {}
        email = u.get("email")
        nombre = (u.get("name") or "").split(" ")[0]
    except Exception:
        pass
    phone = None
    try:
        prof = await db.asesor_profiles.find_one({"user_id": user_id}, {"_id": 0, "phone": 1}) or {}
        phone = prof.get("phone") or None
    except Exception:
        pass

    digest = await build_daily_digest(db, user_id, tenant_id)
    rendered = _render_text(digest, nombre)
    channels = prefs["asesor_digest_channels"]
    sent: List[str] = []

    if "email" in channels and email:
        try:
            from notifications_engine import _send_email_notification
            ok = await _send_email_notification(
                email, rendered["title"], rendered["body_email"], FRONTEND_BRIEFING_URL)
            # stub (sin RESEND) retorna False pero NO es error → contamos como "intentado"
            sent.append("email")
            log.info(f"[digest] email → {user_id} ok={ok}")
        except Exception as e:
            log.warning(f"[digest] email send {user_id}: {e}")

    if "whatsapp" in channels and phone:
        try:
            from whatsapp_engine import WAEngine
            wa = WAEngine(db, org_id=tenant_id or "dmx")
            res = await wa.send_message(to_number=str(phone), body=rendered["body_whatsapp"][:1600])
            if res.get("ok"):
                sent.append("whatsapp")
            log.info(f"[digest] whatsapp → {user_id} ok={res.get('ok')}")
        except Exception as e:
            log.warning(f"[digest] whatsapp send {user_id}: {e}")

    # Registro dedup + audit (FAIL-OPEN)
    try:
        await db.asesor_digest_sends.update_one(
            {"user_id": user_id, "date": _today_iso()},
            {"$set": {"user_id": user_id, "date": _today_iso(), "channels": sent,
                      "agent_actions_total": digest.get("agent_actions_total", 0),
                      "sent_at": _now(), "forced": force,
                      "expires_at": _now() + timedelta(days=14)}},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[digest] dedup log {user_id}: {e}")
    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db, {"user_id": user_id, "role": "system"},
            "asesor_digest_sent", "asesor_digest", user_id,
            after={"channels": sent, "total": digest.get("agent_actions_total", 0), "forced": force})
    except Exception:
        pass

    return {"ok": True, "skipped": False, "sent_channels": sent,
            "agent_actions_total": digest.get("agent_actions_total", 0)}


# ─── Cron diario ──────────────────────────────────────────────────────────────
async def run_cron_all(db) -> Dict[str, Any]:
    """Envía el digest a cada asesor con asesor_digest_enabled=True. FAIL-OPEN por asesor."""
    sent = 0
    CRON_BATCH_LIMIT = 5000
    try:
        enabled = await db.notification_preferences.find(
            {"asesor_digest_enabled": True}, {"_id": 0, "user_id": 1},
        ).to_list(CRON_BATCH_LIMIT)
        # NO silent cap: si llegamos al límite, avisar (puede haber asesores sin digest).
        if len(enabled) >= CRON_BATCH_LIMIT:
            log.warning(f"[digest] cron alcanzó el límite de {CRON_BATCH_LIMIT} asesores · "
                        f"puede haber enabled sin procesar este run")
    except Exception as e:
        log.warning(f"[digest] cron find enabled: {e}")
        enabled = []
    for row in enabled:
        uid = row.get("user_id")
        if not uid:
            continue
        try:
            tenant_id = None
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "tenant_id": 1}) or {}
            tenant_id = u.get("tenant_id")
            res = await send_digest(db, uid, tenant_id, force=False)
            if not res.get("skipped"):
                sent += 1
        except Exception as e:
            log.warning(f"[digest] cron send {uid}: {e}")
    log.info(f"[digest] cron daily: {sent} digests enviados")
    return {"sent": sent, "candidates": len(enabled)}


def register_cron(scheduler, db=None) -> None:
    """Cron DAILY 07:30 UTC (01:30 MX) · max_instances=1 · slot libre (agentes 07:10)."""
    if not scheduler:
        return
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        run_cron_all,
        CronTrigger(hour=7, minute=30, timezone="UTC"),
        id="asesor_digest_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[digest] asesor_digest daily cron scheduled @ 07:30 UTC (01:30 MX)")


async def ensure_indexes(db) -> None:
    """Índices del digest. Idempotente. TTL limpia el log de envíos a los 14d."""
    try:
        await db.asesor_digest_sends.create_index([("user_id", 1), ("date", 1)], unique=True)
        await db.asesor_digest_sends.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        log.warning(f"[digest] ensure_indexes: {e}")
