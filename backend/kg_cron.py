"""W5.12 Parte 1 — KG cron: nightly rebuild + event hooks registration."""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("dmx.kg.cron")


async def _run_kg_rebuild_full(db) -> None:
    """Job wrapper for APScheduler."""
    try:
        from kg_etl import rebuild_full
        summary = await rebuild_full(db)
        log.info(f"[KG cron] rebuild_full done · {summary}")
    except Exception as exc:
        log.error(f"[KG cron] rebuild_full failed: {exc}")


async def _run_kg_anomaly_detection(db) -> None:
    """W5.12 P2 · Anomaly detection cron job wrapper."""
    try:
        from kg_anomaly_detector import run_anomaly_detection
        summary = await run_anomaly_detection(db)
        log.info(f"[KG anomaly cron] done · {summary}")
    except Exception as exc:
        log.error(f"[KG anomaly cron] failed: {exc}")


async def _run_smart_notif_relational(db) -> None:
    """W5.12 P3 Sub-E · Smart relational notifications via KG.

    3 queries pre-built. Idempotency 24h por (user_id, kg_alert_signature).
    Si KG_AVAILABLE=False → skip + log.
    """
    try:
        from knowledge_graph_engine import KG_AVAILABLE
        if not KG_AVAILABLE:
            log.warning("[KG smart_notif] skipped · KG_AVAILABLE=False")
            return
        from kg_query_helper import kg_query
        from notifications_engine import emit_notification
        from datetime import datetime, timezone, timedelta
        import hashlib

        dispatched = 0
        now = datetime.now(timezone.utc)
        idem_cutoff = (now - timedelta(hours=24)).isoformat()

        async def _is_duplicate(uid: str, sig: str) -> bool:
            doc = await db.kg_relational_alerts_sent.find_one({
                "user_id": uid, "signature": sig,
                "sent_at": {"$gt": idem_cutoff},
            }, {"_id": 0, "user_id": 1})
            return doc is not None

        async def _mark_sent(uid: str, sig: str, payload: dict) -> None:
            await db.kg_relational_alerts_sent.insert_one({
                "user_id": uid, "signature": sig, "sent_at": now.isoformat(), "payload": payload,
            })

        # ─── Signal 1: new project in saved zone (buyers/visitors with saved zones) ────
        try:
            users_cur = db.users.find(
                {"saved_zones": {"$exists": True, "$ne": []}},
                {"_id": 0, "user_id": 1, "tenant_id": 1, "saved_zones": 1},
            ).limit(2000)
            async for u in users_cur:
                uid = u.get("user_id")
                for zslug in (u.get("saved_zones") or [])[:5]:
                    res = await kg_query("zonas_top_forecast_12m", {"score_min": 0, "tier": None},
                                         caller_module="smart_notif_new_in_zone", db=db)
                    if res.get("kg_unavailable"):
                        continue
                    # Filtrar proyectos de la zone con created_at last 7d en Mongo (KG no tiene "created_at")
                    cutoff_7d = (now - timedelta(days=7)).isoformat()
                    new_in_zone = await db.developments.find(
                        {"$or": [{"zone_slug": zslug}, {"colonia_slug": zslug}],
                         "created_at": {"$gte": cutoff_7d}},
                        {"_id": 0, "id": 1, "name": 1, "slug": 1, "zone_slug": 1, "developer_id": 1},
                    ).limit(3).to_list(length=3)
                    if not new_in_zone:
                        continue
                    sig = hashlib.sha256(f"new_in_zone:{uid}:{zslug}:{new_in_zone[0].get('id')}".encode()).hexdigest()[:24]
                    if await _is_duplicate(uid, sig):
                        continue
                    title = f"Nuevo proyecto en {zslug} (tu zona favorita)"
                    body = f"Tenemos {len(new_in_zone)} desarrollo(s) nuevo(s) en {zslug}: {', '.join(p.get('name') or p.get('id') for p in new_in_zone)}"
                    await emit_notification(
                        db, user_id=uid, tenant_id=u.get("tenant_id") or "default",
                        type="kg_relational_alert", severity="medium",
                        title=title, body=body,
                        payload={"signal": "new_in_saved_zone", "zone": zslug, "projects": new_in_zone},
                        action_url=f"/barrios/{zslug}",
                    )
                    await _mark_sent(uid, sig, {"signal": "new_in_saved_zone", "zone": zslug})
                    dispatched += 1
        except Exception as exc:
            log.warning(f"[KG smart_notif] new_in_saved_zone failed: {exc}")

        # ─── Signal 2: competitor new listing (dev_admins) ─────────────────────────
        try:
            dev_admins = db.users.find({"role": "developer_admin"}, {"_id": 0, "user_id": 1, "tenant_id": 1})
            async for u in dev_admins:
                uid = u.get("user_id")
                org_id = u.get("tenant_id") or "default"
                # Proyectos del dev
                own_projects = await db.developments.find(
                    {"$or": [{"dev_org_id": org_id}, {"developer_id": org_id}]},
                    {"_id": 0, "zone_slug": 1, "colonia_slug": 1},
                ).limit(50).to_list(length=50)
                zones = list({p.get("zone_slug") or p.get("colonia_slug") for p in own_projects if (p.get("zone_slug") or p.get("colonia_slug"))})
                cutoff_7d = (now - timedelta(days=7)).isoformat()
                for zslug in zones[:5]:
                    competitors = await db.developments.find({
                        "$or": [{"zone_slug": zslug}, {"colonia_slug": zslug}],
                        "$nor": [{"dev_org_id": org_id}, {"developer_id": org_id}],
                        "created_at": {"$gte": cutoff_7d},
                    }, {"_id": 0, "id": 1, "name": 1, "developer_id": 1, "dev_org_id": 1}).limit(3).to_list(length=3)
                    if not competitors:
                        continue
                    sig = hashlib.sha256(f"competitor:{uid}:{zslug}:{competitors[0].get('id')}".encode()).hexdigest()[:24]
                    if await _is_duplicate(uid, sig):
                        continue
                    title = f"Competidor con nuevo proyecto en {zslug}"
                    body = f"{len(competitors)} desarrollo(s) recien lanzado(s) en {zslug} por otros developers."
                    await emit_notification(
                        db, user_id=uid, tenant_id=org_id,
                        type="kg_relational_alert", severity="medium",
                        title=title, body=body,
                        payload={"signal": "competitor_new_listing", "zone": zslug, "projects": competitors},
                        action_url=f"/desarrollador/inteligencia?zone={zslug}",
                    )
                    await _mark_sent(uid, sig, {"signal": "competitor", "zone": zslug})
                    dispatched += 1
        except Exception as exc:
            log.warning(f"[KG smart_notif] competitor_new_listing failed: {exc}")

        # ─── Signal 3: buyer active cross-project (asesores) ──────────────────────
        try:
            asesores = db.users.find({"role": "asesor"}, {"_id": 0, "user_id": 1, "tenant_id": 1})
            async for u in asesores:
                uid = u.get("user_id")
                # Leads activos asignados al asesor
                active_leads = await db.leads.find({
                    "assigned_to": uid,
                    "status": {"$in": ["nuevo", "contactado", "calificado"]},
                    "client_global_id": {"$exists": True, "$ne": None},
                }, {"_id": 0, "id": 1, "client_global_id": 1, "project_id": 1}).limit(20).to_list(length=20)
                for ld in active_leads:
                    cgid = ld.get("client_global_id")
                    if not cgid:
                        continue
                    res = await kg_query("leads_cross_project_cliente", {"client_global_id": cgid},
                                         caller_module="smart_notif_cross_project", db=db)
                    if res.get("kg_unavailable"):
                        continue
                    cross = [r for r in (res.get("rows") or [])
                             if r.get("asesor_id") and r.get("asesor_id") != uid]
                    if not cross:
                        continue
                    sig = hashlib.sha256(f"cross:{uid}:{cgid}:{cross[0].get('project_id')}".encode()).hexdigest()[:24]
                    if await _is_duplicate(uid, sig):
                        continue
                    title = "Tu lead esta activo en otro proyecto"
                    body = f"El cliente esta siendo atendido en {len(cross)} proyecto(s) por otro asesor. Considera priorizar el seguimiento."
                    await emit_notification(
                        db, user_id=uid, tenant_id=u.get("tenant_id") or "default",
                        type="kg_relational_alert", severity="high",
                        title=title, body=body,
                        payload={"signal": "buyer_cross_project", "client_global_id": cgid, "lead_id": ld.get("id"), "cross": cross[:5]},
                        action_url=f"/asesor/contactos/{ld.get('id')}",
                    )
                    await _mark_sent(uid, sig, {"signal": "buyer_cross", "lead_id": ld.get("id")})
                    dispatched += 1
        except Exception as exc:
            log.warning(f"[KG smart_notif] buyer_cross_project failed: {exc}")

        # Audit log
        try:
            from audit_immutable_engine import log as audit_log
            audit_id = await audit_log(
                db, actor={"user_id": "kg_smart_notif_cron", "role": "system"},
                action="kg_smart_notif_dispatched", entity_type="kg",
                entity_id="smart_notif_relational",
                before=None,
                after={"dispatched": dispatched, "timestamp": now.isoformat()},
            )
            log.info(f"[KG smart_notif] {dispatched} notifications dispatched · audit_log_id={audit_id}")
        except Exception as exc:
            log.warning(f"[KG smart_notif] audit log failed: {exc}")
    except Exception as exc:
        log.error(f"[KG smart_notif cron] failed: {exc}")


def register_kg_jobs(scheduler, db) -> Any:
    """Registra los jobs KG en el scheduler APScheduler ya inicializado.

    Jobs:
      - kg_rebuild_full_cron     @ 02:00 UTC daily
      - kg_anomaly_detection_cron @ 03:00 UTC daily (post-rebuild)
    """
    try:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            _run_kg_rebuild_full,
            CronTrigger(hour=2, minute=0, timezone="UTC"),
            id="kg_rebuild_full_cron",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _run_kg_anomaly_detection,
            CronTrigger(hour=3, minute=0, timezone="UTC"),
            id="kg_anomaly_detection_cron",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _run_smart_notif_relational,
            CronTrigger(hour=4, minute=0, timezone="UTC"),
            id="kg_smart_notif_relational_cron",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=3600,
        )
        log.info("[KG cron] kg_rebuild_full_cron @ 02:00 UTC + kg_anomaly_detection_cron @ 03:00 UTC + kg_smart_notif_relational_cron @ 04:00 UTC scheduled")
        return True
    except Exception as exc:
        log.warning(f"[KG cron] register_kg_jobs failed: {exc}")
        return False
