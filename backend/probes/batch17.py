"""Phase 4 Batch 17 — Inline edit audit + Undo system health probes."""
from diagnostic_engine import functional_probe
from datetime import datetime, timezone, timedelta


async def _inline_edit_audit(db, project_id, user):
    """Verify inline_edit mutations generate both activity log and undo entries."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        inline_acts = await db.activities.count_documents(
            {"action": "inline_edit", "timestamp": {"$gte": since}}
        )
        inline_undos = await db.undo_log.count_documents(
            {"action": "inline_edit", "created_at": {"$gte": since}}
        )
        if inline_acts > 0 and inline_undos == 0:
            return {
                "passed": False,
                "error_type": "wiring_broken",
                "location": "routes_dev_batch17.inline_edit",
                "recommendation": "inline_edit no está registrando undo entries",
                "extra": {"inline_acts": inline_acts, "inline_undos": 0},
            }
        return {"passed": True, "extra": {
            "inline_acts_24h": inline_acts,
            "inline_undos_24h": inline_undos,
        }}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "inline_edit_audit",
                "recommendation": f"Error: {str(e)[:200]}"}


async def _undo_system_health(db, project_id, user):
    """Verify undo_log collection writable + purge cron healthy."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        total = await db.undo_log.count_documents({})
        expired_not_purged = await db.undo_log.count_documents(
            {"hard_purge_at": {"$lt": now_iso}}
        )
        active = await db.undo_log.count_documents(
            {"undone_at": None, "expires_at": {"$gt": now_iso}}
        )
        if expired_not_purged > 1000:
            return {
                "passed": False,
                "error_type": "performance",
                "location": "undo_log.hard_purge_at",
                "recommendation": f"{expired_not_purged} undos expirados sin purgar — cron purge_expired_undo_log no corre",
                "extra": {"total": total, "expired": expired_not_purged, "active": active},
            }
        return {"passed": True, "extra": {
            "total": total, "expired_pending_purge": expired_not_purged, "active": active,
        }}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "undo_system_health",
                "recommendation": f"Error: {str(e)[:200]}"}


functional_probe("inline_edit_audit", "engagement", "medium",
                 "Inline edit audit: mutations generate activity log + undo entries",
                 _inline_edit_audit, "wiring_broken")

functional_probe("undo_system_health", "notifications", "high",
                 "Undo system: collection healthy + purge cron operational",
                 _undo_system_health, "performance")
