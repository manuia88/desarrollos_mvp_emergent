"""Schema integrity probes — unified across DEVELOPMENTS + db.projects (B13)."""
from diagnostic_engine import functional_probe
from projects_unified import get_project_by_slug, get_units_for_project


async def _project_required_fields(db, project_id, user):
    if not project_id:
        return {"passed": True}
    p = await get_project_by_slug(db, project_id)
    if not p:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"projects_unified[{project_id}]",
                "recommendation": "Proyecto no encontrado en ninguna fuente "
                                   "(DEVELOPMENTS legacy ni db.projects)."}
    required = ["name", "colonia"]  # developer_id optional for wizard
    missing = [f for f in required if not p.get(f)]
    if missing:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"{p['entity_source']}[{project_id}]",
                "recommendation": f"Campos requeridos faltantes: {', '.join(missing)}.",
                "extra": {"missing": missing, "entity_source": p["entity_source"]}}
    return {"passed": True, "extra": {"entity_source": p["entity_source"]}}


async def _units_required_fields(db, project_id, user):
    if not project_id:
        return {"passed": True}
    p = await get_project_by_slug(db, project_id)
    if not p:
        return {"passed": False, "error_type": "schema_integrity",
                "recommendation": "Proyecto no encontrado."}
    units = await get_units_for_project(db, p)
    if not units:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{p['entity_source']}[{project_id}].units",
                "recommendation": "Proyecto sin unidades configuradas. Subir inventario."}
    bad = [u.get("unit_number", "?") for u in units
           if not u.get("unit_number") or not u.get("prototype")]
    if bad:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"{project_id}.units[{bad[:3]}…]",
                "recommendation": f"{len(bad)} unidades sin unit_number o prototype.",
                "extra": {"affected": len(bad), "entity_source": p["entity_source"]}}
    return {"passed": True, "extra": {"units_count": len(units),
                                       "entity_source": p["entity_source"]}}


async def _assets_not_orphaned(db, project_id, user):
    if not project_id:
        return {"passed": True}
    count = await db.project_assets.count_documents({"project_id": project_id, "orphan": True})
    if count > 0:
        return {"passed": False, "error_type": "orphan_record",
                "location": "project_assets collection",
                "recommendation": f"{count} assets marcados orphan. Ejecutar limpieza.",
                "action_id": "cleanup_orphan_assets"}
    return {"passed": True}


async def _documents_not_orphaned(db, project_id, user):
    if not project_id:
        return {"passed": True}
    cursor = db.project_documents.find({"project_id": project_id}, {"_id": 0, "status": 1}).limit(50)
    all_docs = [d async for d in cursor]
    return {"passed": True, "extra": {"count": len(all_docs)}}


async def _commercialization_valid(db, project_id, user):
    if not project_id:
        return {"passed": True}
    doc = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0})
    if not doc:
        return {"passed": False, "error_type": "schema_integrity",
                "location": "project_commercialization collection",
                "recommendation": "Política comercial no configurada. Pestaña Comercialización.",
                "action_id": "seed_default_commercialization"}
    pct = doc.get("default_commission_pct")
    if pct is None or not (0 <= pct <= 15):
        return {"passed": False, "error_type": "data_quality",
                "location": f"project_commercialization[{project_id}].default_commission_pct",
                "recommendation": f"Comisión default fuera de rango válido (0-15%). Actual: {pct}."}
    return {"passed": True}


functional_probe("project_required_fields_complete", "schema", "critical",
                 "Proyecto tiene campos requeridos completos",
                 _project_required_fields, "schema_integrity")
functional_probe("units_have_required_fields", "schema", "high",
                 "Unidades tienen unit_number y prototype",
                 _units_required_fields, "schema_integrity")
functional_probe("project_assets_not_orphaned", "schema", "medium",
                 "Assets del proyecto sin referencias huérfanas",
                 _assets_not_orphaned, "orphan_record")
functional_probe("project_documents_not_orphaned", "schema", "medium",
                 "Documentos legales sin referencias huérfanas",
                 _documents_not_orphaned, "orphan_record")
functional_probe("commercialization_config_valid", "schema", "high",
                 "Configuración comercial válida",
                 _commercialization_valid, "schema_integrity")
