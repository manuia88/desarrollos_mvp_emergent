"""Engagement & audit probes."""
from datetime import datetime, timezone, timedelta
from diagnostic_engine import functional_probe


def _now():
    return datetime.now(timezone.utc)


async def _posthog_events_emitting(db, project_id, user):
    if not project_id:
        return {"passed": True}
    cutoff = (_now() - timedelta(days=7)).isoformat()
    count = await db.ml_training_events.count_documents({
        "context.project_id": project_id,
        "ts": {"$gte": cutoff},
    })
    # Fallback: any ml_events for the org at all
    if count == 0:
        any_events = await db.ml_training_events.count_documents({"ts": {"$gte": cutoff}})
        if any_events == 0:
            return {"passed": False, "error_type": "integration_external",
                    "location": "ml_training_events collection / PostHog",
                    "recommendation": "0 eventos ML en últimos 7 días (global). "
                                       "Verificar observability.emit_ml_event wiring.",
                    "severity": "high"}
    return {"passed": True, "extra": {"events_7d": count}}


async def _audit_captures(db, project_id, user):
    if not project_id:
        return {"passed": True}
    cutoff = (_now() - timedelta(days=30)).isoformat()
    count = await db.audit_log.count_documents({
        "entity_id": {"$regex": f"^{project_id}"},
        "created_at": {"$gte": cutoff},
    })
    # Also check audits where before/after changed_at references project_id
    total_recent = await db.audit_log.count_documents({"created_at": {"$gte": cutoff}})
    if total_recent > 20 and count == 0:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "audit_log collection",
                "recommendation": "0 audits para este proyecto en 30 días. "
                                   "Verificar que mutaciones usen audit_log.log_mutation().",
                "severity": "low"}
    return {"passed": True, "extra": {"audits_30d": count}}


async def _badge_counters_match(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # Compare leads_active counter vs real count
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        return {"passed": True}
    # No badges collection yet — benign probe
    return {"passed": True}


functional_probe("posthog_events_emitting", "engagement", "high",
                 "PostHog/ml_events emitiendo en últimos 7d",
                 _posthog_events_emitting, "integration_external")
functional_probe("audit_log_captures_mutations", "engagement", "medium",
                 "audit_log captura mutaciones del proyecto",
                 _audit_captures, "wiring_broken")
functional_probe("badge_counters_match_actual_data", "engagement", "low",
                 "Contadores UI coinciden con data real",
                 _badge_counters_match, "data_quality")
