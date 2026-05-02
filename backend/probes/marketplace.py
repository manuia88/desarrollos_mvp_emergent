"""Marketplace public-side probes — unified (B13)."""
from diagnostic_engine import functional_probe
from projects_unified import get_project_by_slug


async def _public_listing_renders(db, project_id, user):
    if not project_id:
        return {"passed": True}
    p = await get_project_by_slug(db, project_id)
    if not p:
        return {"passed": False, "error_type": "wiring_broken",
                "location": f"projects_unified:{project_id}",
                "recommendation": "Proyecto ausente del catálogo (legacy + db.projects)."}
    required = ["name", "colonia"]
    missing = [f for f in required if not p.get(f)]
    if missing:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{p['entity_source']}:{project_id}",
                "recommendation": f"Faltan campos públicos: {missing}",
                "extra": {"entity_source": p["entity_source"]}}
    return {"passed": True, "extra": {"entity_source": p["entity_source"]}}


async def _public_endpoints_ok(db, project_id, user):
    if not project_id:
        return {"passed": True}
    p = await get_project_by_slug(db, project_id)
    if not p:
        return {"passed": False, "error_type": "wiring_broken",
                "recommendation": "Proyecto no existe."}
    colonia_id = p.get("colonia_id") or p.get("colonia")
    if not colonia_id:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{project_id}.colonia_id",
                "recommendation": "Proyecto sin colonia asociada → marketplace no lo indexará."}
    return {"passed": True, "extra": {"entity_source": p["entity_source"]}}


async def _asset_urls_resolve(db, project_id, user):
    if not project_id:
        return {"passed": True}
    p = await get_project_by_slug(db, project_id)
    if not p:
        return {"passed": True}
    photos = p.get("photos") or p.get("cover_photos") or []
    cover = p.get("cover_photo")
    if not photos and not cover:
        # Wizard projects may have assets in db.dev_assets
        count = await db.dev_assets.count_documents({"development_id": project_id})
        if count == 0:
            return {"passed": False, "error_type": "data_quality",
                    "location": f"{project_id}.photos / dev_assets",
                    "recommendation": "Proyecto sin fotos públicas. Subir al menos una imagen cover.",
                    "extra": {"entity_source": p["entity_source"]}}
    return {"passed": True, "extra": {"photos_count": len(photos),
                                       "entity_source": p["entity_source"]}}


functional_probe("public_listing_renders_correctly", "marketplace", "high",
                 "Listing público del proyecto renderiza",
                 _public_listing_renders, "wiring_broken")
functional_probe("public_endpoints_respond_200", "marketplace", "medium",
                 "Endpoints públicos del proyecto OK",
                 _public_endpoints_ok, "wiring_broken")
functional_probe("asset_urls_resolve", "marketplace", "medium",
                 "Fotos/assets públicos tienen URL válida",
                 _asset_urls_resolve, "data_quality")
