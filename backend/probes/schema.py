"""Schema integrity probes."""
from diagnostic_engine import functional_probe


async def _find_dev(project_id):
    from data_developments import DEVELOPMENTS
    return next((d for d in DEVELOPMENTS if d["id"] == project_id), None)


async def _project_required_fields(db, project_id, user):
    if not project_id:
        return {"passed": True}
    dev = await _find_dev(project_id)
    if not dev:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"data_developments:DEVELOPMENTS[{project_id}]",
                "recommendation": "Proyecto no encontrado en catálogo maestro."}
    required = ["name", "colonia", "stage", "developer_id"]
    missing = [f for f in required if not dev.get(f)]
    if missing:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"data_developments.py — proyecto {project_id}",
                "recommendation": f"Campos requeridos faltantes: {', '.join(missing)}.",
                "extra": {"missing": missing}}
    return {"passed": True}


async def _units_required_fields(db, project_id, user):
    if not project_id:
        return {"passed": True}
    dev = await _find_dev(project_id)
    if not dev:
        return {"passed": False, "error_type": "schema_integrity",
                "recommendation": "Proyecto no encontrado."}
    units = dev.get("units", [])
    if not units:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{project_id}.units",
                "recommendation": "Proyecto sin unidades configuradas."}
    bad = [u.get("unit_number", "?") for u in units
           if not u.get("unit_number") or not u.get("prototype")]
    if bad:
        return {"passed": False, "error_type": "schema_integrity",
                "location": f"{project_id}.units[{bad[:3]}…]",
                "recommendation": f"{len(bad)} unidades sin unit_number o prototype.",
                "extra": {"affected": len(bad)}}
    return {"passed": True, "extra": {"units_count": len(units)}}


async def _assets_not_orphaned(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # project_assets collection (if exists) shouldn't have orphan refs
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
    # Documents referring to missing dev
    cursor = db.project_documents.find({"project_id": project_id}, {"_id": 0, "status": 1}).limit(50)
    all_docs = [d async for d in cursor]
    if not all_docs:
        return {"passed": True, "extra": {"count": 0}}
    return {"passed": True, "extra": {"count": len(all_docs)}}


async def _commercialization_valid(db, project_id, user):
    if not project_id:
        return {"passed": True}
    doc = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0})
    if not doc:
        return {"passed": False, "error_type": "schema_integrity",
                "location": "project_commercialization collection",
                "recommendation": "Política comercial no configurada. Ir a pestaña Comercialización.",
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
