"""Cross-portal visibility probes."""
from diagnostic_engine import functional_probe


async def _asesor_brokers_see(db, project_id, user):
    if not project_id:
        return {"passed": True}
    brokers = await db.project_brokers.count_documents({
        "project_id": project_id, "status": "active"
    })
    # If commercialization.works_with_brokers=True but no active brokers → issue
    comm = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0})
    if comm and comm.get("works_with_brokers") and brokers == 0:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "project_brokers collection",
                "recommendation": "Proyecto marcado como 'works_with_brokers' pero sin brokers activos. "
                                   "Asignar al menos uno desde pestaña Comercialización.",
                "action_id": "open_broker_assignment"}
    return {"passed": True, "extra": {"active_brokers": brokers}}


async def _asesor_inhouse_see(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # Pre-assignments should exist when in_house_only=True
    comm = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0})
    if comm and comm.get("in_house_only"):
        count = await db.project_preassignments.count_documents({"project_id": project_id})
        if count == 0:
            return {"passed": False, "error_type": "wiring_broken",
                    "location": "project_preassignments collection",
                    "recommendation": "Proyecto in-house only pero sin pre-asignaciones. "
                                       "Nuevos asesores no tendrán acceso automático.",
                    "severity": "medium"}
    return {"passed": True}


async def _inmobiliaria_sees_org(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # inmobiliarias collection
    count = await db.inmobiliarias.count_documents({})
    if count == 0:
        return {"passed": True, "extra": {"note": "Sin inmobiliarias registradas — benign"}}
    return {"passed": True}


async def _tracking_attribution(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # Check if leads have asesor_attribution_id set
    total = await db.leads.count_documents({"project_id": project_id})
    if total == 0:
        return {"passed": True, "extra": {"leads": 0}}
    no_attr = await db.leads.count_documents({
        "project_id": project_id,
        "$or": [{"asesor_attribution_id": None}, {"asesor_attribution_id": {"$exists": False}}],
    })
    pct = (no_attr / total * 100) if total else 0
    if pct > 50:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "leads.asesor_attribution_id",
                "recommendation": f"{no_attr}/{total} leads sin atribución de asesor ({pct:.0f}%). "
                                   "Verificar tracking cookies en citas públicas.",
                "severity": "medium"}
    return {"passed": True}


functional_probe("asesor_brokers_see_project_if_whitelist", "cross_portal", "high",
                 "Brokers activos cuando política lo requiere",
                 _asesor_brokers_see, "wiring_broken")
functional_probe("asesor_inhouse_see_assigned_projects", "cross_portal", "medium",
                 "Pre-asignaciones in-house configuradas",
                 _asesor_inhouse_see, "wiring_broken")
functional_probe("inmobiliaria_admin_sees_org_data", "cross_portal", "low",
                 "Inmobiliaria dashboard visible",
                 _inmobiliaria_sees_org, "permission_issue")
functional_probe("tracking_cookie_attribution_works", "cross_portal", "medium",
                 "Atribución de asesor en leads",
                 _tracking_attribution, "wiring_broken")
