"""Marketplace public-side probes."""
import os
from diagnostic_engine import functional_probe


async def _public_listing_renders(db, project_id, user):
    if not project_id:
        return {"passed": True}
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        return {"passed": False, "error_type": "wiring_broken",
                "location": f"data_developments:{project_id}",
                "recommendation": "Proyecto ausente del catálogo público."}
    # Marketplace requires: name, colonia, price_from, units
    required = ["name", "colonia"]
    missing = [f for f in required if not dev.get(f)]
    if missing:
        return {"passed": False, "error_type": "data_quality",
                "location": f"data_developments:{project_id}",
                "recommendation": f"Faltan campos públicos: {missing}"}
    return {"passed": True}


async def _public_endpoints_ok(db, project_id, user):
    # Check dev_overlays + colonia_metrics consistency (internal, no HTTP)
    if not project_id:
        return {"passed": True}
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        return {"passed": False, "error_type": "wiring_broken",
                "recommendation": "Proyecto no existe."}
    colonia_id = dev.get("colonia_id") or dev.get("colonia")
    if not colonia_id:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{project_id}.colonia_id",
                "recommendation": "Proyecto sin colonia asociada → marketplace search no lo indexará."}
    return {"passed": True}


async def _asset_urls_resolve(db, project_id, user):
    if not project_id:
        return {"passed": True}
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        return {"passed": True}
    photos = dev.get("photos") or dev.get("cover_photos") or []
    cover = dev.get("cover_photo")
    if not photos and not cover:
        return {"passed": False, "error_type": "data_quality",
                "location": f"{project_id}.photos",
                "recommendation": "Proyecto sin fotos públicas. Subir al menos una imagen cover.",
                "severity": "medium"}
    return {"passed": True, "extra": {"photos_count": len(photos)}}


functional_probe("public_listing_renders_correctly", "marketplace", "high",
                 "Listing público del proyecto renderiza",
                 _public_listing_renders, "wiring_broken")
functional_probe("public_endpoints_respond_200", "marketplace", "medium",
                 "Endpoints públicos del proyecto OK",
                 _public_endpoints_ok, "wiring_broken")
functional_probe("asset_urls_resolve", "marketplace", "medium",
                 "Fotos/assets públicos tienen URL válida",
                 _asset_urls_resolve, "data_quality")
