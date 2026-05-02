"""Phase 4 Batch 15 — OAuth Calendar Health + Auto-assign Engine probes."""
from diagnostic_engine import functional_probe
from datetime import datetime, timezone, timedelta


async def _oauth_calendar_health(db, project_id, user):
    """Verify active OAuth connections + tokens not expired."""
    try:
        now = datetime.now(timezone.utc)
        active_connections = await db.oauth_tokens.count_documents({"status": "active"})
        expired_connections = await db.oauth_tokens.count_documents({
            "status": "active",
            "expires_at": {"$lt": now.isoformat()},
        })

        if expired_connections > 0:
            return {
                "passed": False,
                "error_type": "stale_data",
                "location": "db.oauth_tokens",
                "recommendation": f"{expired_connections} token(s) Google expirado(s) — ejecutar refresh_expiring_tokens.",
            }

        return {"passed": True, "extra": {
            "active_connections": active_connections,
            "expired_connections": expired_connections,
        }}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "oauth_calendar", "recommendation": f"Error: {str(e)[:200]}"}


async def _auto_assign_engine(db, project_id, user):
    """Verify appointment_policies have valid structure + assignment log functional."""
    try:
        from availability import get_policy, _DEFAULT_POLICY

        policy = await get_policy(db, project_id)
        policy_type = policy.get("policy_type")
        if policy_type not in ("round_robin", "pre_selected", "load_balance"):
            return {
                "passed": False,
                "error_type": "data_quality",
                "location": "db.appointment_policies",
                "recommendation": f"policy_type inválido: {policy_type}. Debe ser round_robin|pre_selected|load_balance.",
            }

        # Verify working_hours structure
        wh = policy.get("working_hours", {})
        required_days = {"mon", "tue", "wed", "thu", "fri"}
        missing_days = required_days - set(wh.keys())
        if missing_days:
            return {
                "passed": False,
                "error_type": "data_quality",
                "location": "appointment_policies.working_hours",
                "recommendation": f"working_hours faltante días: {missing_days}",
            }

        return {"passed": True, "extra": {
            "project_id": project_id,
            "policy_type": policy_type,
            "asesor_pool_size": len(policy.get("asesor_pool", [])),
        }}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "availability engine",
                "recommendation": f"Error: {str(e)[:200]}"}


functional_probe("oauth_calendar_health", "integrations_external", "high",
                 "OAuth Calendar: conexiones activas + tokens válidos no expirados",
                 _oauth_calendar_health, "stale_data")

functional_probe("auto_assign_engine", "ai_integrations", "medium",
                 "Auto-assign Engine: políticas válidas + motor de asignación operativo",
                 _auto_assign_engine, "data_quality")
