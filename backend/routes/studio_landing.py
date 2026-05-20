"""W5.22 Z.8 — Studio Landing Pages routes.

Prefijo portal: /api/studio/landing · T2+ via require_studio.
Prefijo publico: /api/landing/:slug · sin auth (rate-limit por IP).

Endpoints:
    POST   /api/studio/landing                  crear landing
    GET    /api/studio/landings                 listar (paginated 30)
    GET    /api/studio/landing/:id              detalle
    PATCH  /api/studio/landing/:id              update content
    POST   /api/studio/landing/:id/publish      publica/despublica
    DELETE /api/studio/landing/:id              soft delete
    POST   /api/studio/landing/:id/ab-variant   crea variante B + grupo A/B
    GET    /api/studio/landing/ab/:gid/stats    chi-square stats
    POST   /api/studio/landing/ab/:gid/declare-winner
    POST   /api/studio/landing/:id/export-pdf   trigger PDF (POST) o
    GET    /api/studio/landing/:id/export-pdf   download (GET)
    GET    /api/landing/:slug                   PUBLICO render data
    POST   /api/landing/:slug/lead              PUBLICO capture lead
    GET    /api/landing/:slug/track             PUBLICO 1x1 PNG pixel
"""
from __future__ import annotations

import base64
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query, Response
from pydantic import BaseModel, Field

import studio_landing_engine as eng
import studio_landing_pdf as pdf_eng
import studio_landing_starters as starters_eng

try:
    import studio_landing_themes as themes_eng
except Exception:  # pragma: no cover
    themes_eng = None  # type: ignore

log = logging.getLogger("dmx.routes_studio_landing")

router = APIRouter(prefix="/api/studio/landing", tags=["studio_landing"])
public_router = APIRouter(prefix="/api/landing", tags=["studio_landing_public"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anon"


# ─── Schemas ─────────────────────────────────────────────────────────────────
class LandingCreateBody(BaseModel):
    template_key: str = Field(...)
    title: str = Field(..., min_length=2, max_length=120)
    slug: Optional[str] = Field(None, max_length=60)
    subtitle: Optional[str] = Field("", max_length=200)
    brand_kit_id: Optional[str] = None
    project_id: Optional[str] = None
    cta_text: Optional[str] = Field("", max_length=40)
    landing_type: Optional[str] = Field("property", pattern="^(property|personal_brand|marketplace)$")
    linked_entity_id: Optional[str] = None
    starter_key: Optional[str] = Field(None, pattern="^(property|personal_brand|marketplace)$")
    property_source: Optional[str] = Field("development", pattern="^(development|resale)$")


class RoutingConfigBody(BaseModel):
    strategy: Optional[str] = Field(None, pattern="^(asesor_directo|hybrid|round_robin|by_zone|by_load|by_disc|manual_queue)$")
    priority_order: Optional[List[str]] = None
    override_score_threshold: Optional[int] = Field(None, ge=0, le=100)
    override_pin_asesor_id: Optional[str] = Field(None, max_length=80)


class LandingPatchBody(BaseModel):
    content: Optional[Dict[str, Any]] = None
    template_key: Optional[str] = None
    brand_kit_id: Optional[str] = None
    project_id: Optional[str] = None


class SectionsUpdateBody(BaseModel):
    sections: List[Dict[str, Any]] = Field(default_factory=list)


class TrackingPixelsBody(BaseModel):
    ga4_id: Optional[str] = Field("", max_length=64)
    meta_pixel_id: Optional[str] = Field("", max_length=64)
    custom_head: Optional[str] = Field("", max_length=4000)
    custom_body: Optional[str] = Field("", max_length=4000)


class MarketplaceConfigBody(BaseModel):
    limit: Optional[int] = Field(None, ge=1, le=500)
    sort_by: Optional[str] = Field(None, pattern="^(price_asc|price_desc|date_new|name_az|zone)$")
    default_filters: Optional[Dict[str, Any]] = None
    enable_map: Optional[bool] = None
    enable_search: Optional[bool] = None
    pagination_mode: Optional[str] = Field(None, pattern="^(buttons|infinite|none)$")


class PublishBody(BaseModel):
    published: bool = True


class ABVariantBody(BaseModel):
    variant_b_template_key: str


class DeclareWinnerBody(BaseModel):
    winner_variant: Optional[str] = Field(None, pattern="^(A|B)$")


class LeadSubmitBody(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsBatchBody(BaseModel):
    events: List[Dict[str, Any]] = Field(default_factory=list)


# ─── Portal routes (T2+) ─────────────────────────────────────────────────────
@router.post("")
async def create_landing(body: LandingCreateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    initial_sections = None
    if body.starter_key:
        initial_sections = starters_eng.get_starter(body.starter_key)
    res = await eng.create_landing(
        db,
        tenant_id=user.tenant_id or "default",
        user_id=user.user_id,
        template_key=body.template_key,
        title=body.title,
        slug=body.slug,
        subtitle=body.subtitle or "",
        brand_kit_id=body.brand_kit_id,
        project_id=body.project_id,
        cta_text=body.cta_text or "",
        landing_type=body.landing_type or "property",
        linked_entity_id=body.linked_entity_id,
        initial_sections=initial_sections,
        property_source=body.property_source or "development",
        user_role=getattr(user, "role", "asesor"),
    )
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "No se pudo crear la landing"))
    return res


@router.get("/list")
async def list_landings(
    request: Request,
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern="^(published|draft)$"),
    template_key: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    return await eng.list_landings(
        db, user.user_id,
        project_id=project_id, status=status, template_key=template_key,
        limit=limit, skip=skip,
    )


@router.get("/starters")
async def get_starters_root(request: Request) -> Dict[str, Any]:
    """Static-prefix · MUST be defined BEFORE /{landing_id} para evitar wildcard catch."""
    await _require_user(request)
    return {
        "property": starters_eng.STARTER_PROPERTY,
        "personal_brand": starters_eng.STARTER_PERSONAL_BRAND,
        "marketplace": starters_eng.STARTER_MARKETPLACE,
        "section_types": list(eng.SECTION_TYPES),
        "landing_types": list(eng.LANDING_TYPES),
    }


@router.get("/property-templates")
async def get_property_templates(request: Request) -> Dict[str, Any]:
    """Z.8.5 — Lista metadata de los 10 property templates unicos."""
    await _require_user(request)
    try:
        from studio_landing_property_templates import list_templates_metadata
        items = list_templates_metadata()
        return {"templates": items, "total": len(items)}
    except Exception as exc:
        log.warning(f"[property-templates] failed: {exc}")
        return {"templates": [], "total": 0}


@router.post("/{landing_id}/apply-template-structure")
async def apply_template_structure(landing_id: str, request: Request) -> Dict[str, Any]:
    """Z.8.5 — Reemplaza sections con structure del template + auto-fill data."""
    user = await _require_user(request)
    db = _db(request)
    landing = await eng.get_landing(db, landing_id, user.user_id)
    if not landing:
        raise HTTPException(404, "Landing no encontrada")
    try:
        from studio_landing_property_templates import get_property_template_spec, merge_template_with_data
        from studio_landing_atlax_adapter import auto_fill_template_data
        tk = landing.get("template_key", "modern")
        spec = get_property_template_spec(tk)
        # Property data
        property_data: Dict[str, Any] = {}
        if landing.get("linked_entity_id"):
            if landing.get("property_source") == "resale":
                imp = await db.listing_imports.find_one({"id": landing["linked_entity_id"]}, {"_id": 0, "raw_html_truncated": 0})
                if imp and imp.get("parsed_data"):
                    pd = imp["parsed_data"]
                    property_data = {
                        "name": pd.get("title") or "Propiedad",
                        "colonia": pd.get("colonia"),
                        "alcaldia": pd.get("alcaldia"),
                        "price_from": pd.get("price"),
                        "amenities": pd.get("amenities") or [],
                        "lat": pd.get("lat"),
                        "lng": pd.get("lng"),
                        "images": pd.get("images") or [],
                        "stage": "reventa",
                    }
            else:
                try:
                    from data_developments import DEVELOPMENTS_BY_ID
                    dev = DEVELOPMENTS_BY_ID.get(landing["linked_entity_id"])
                    if dev:
                        property_data = {
                            "name": dev.get("name"),
                            "colonia": dev.get("colonia"),
                            "alcaldia": dev.get("alcaldia"),
                            "price_from": dev.get("price_from"),
                            "amenities": dev.get("amenities") or [],
                            "stage": dev.get("stage"),
                            "delivery_estimate": dev.get("delivery_estimate"),
                            "units_total": dev.get("units_total"),
                            "units_available": dev.get("units_available"),
                            "lat": (dev.get("center") or {}).get("lat") if isinstance(dev.get("center"), dict) else dev.get("lat"),
                            "lng": (dev.get("center") or {}).get("lng") if isinstance(dev.get("center"), dict) else dev.get("lng"),
                            "images": dev.get("photos") or [],
                            "id": dev.get("id"),
                        }
                except Exception:
                    pass
        atlax_data = await auto_fill_template_data(db, tk, property_data, landing)
        sections = merge_template_with_data(spec, property_data, atlax_data)
        await eng.update_sections(db, landing_id, user.user_id, sections)
        return {"ok": True, "template_key": tk, "sections_count": len(sections), "atlax_data_keys": list(atlax_data.keys())}
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"[apply-template-structure] failed: {exc}")
        raise HTTPException(500, f"Apply template fallo: {exc}")


@router.get("/themes")
async def get_themes(request: Request) -> Dict[str, Any]:
    """Z.8.3 — Static-prefix · BEFORE /{landing_id} · lista metadata de los 10 themes."""
    await _require_user(request)
    if themes_eng is None:
        return {"themes": [], "total": 0}
    items = themes_eng.list_themes_metadata()
    return {"themes": items, "total": len(items)}


@router.get("/{landing_id}")
async def get_landing(landing_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    item = await eng.get_landing(db, landing_id, user.user_id)
    if not item:
        raise HTTPException(404, "Landing no encontrada")
    return {"landing": item}


@router.patch("/{landing_id}")
async def patch_landing(landing_id: str, body: LandingPatchBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.update_landing(db, landing_id, user.user_id, body.model_dump(exclude_none=True))
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo actualizar"))
    return res


@router.post("/{landing_id}/publish")
async def publish(landing_id: str, body: PublishBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.publish_landing(db, landing_id, user.user_id, published=body.published)
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo publicar"))
    return res


@router.delete("/{landing_id}")
async def delete_landing(landing_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.delete_landing(db, landing_id, user.user_id)
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo eliminar"))
    return res


@router.post("/{landing_id}/ab-variant")
async def create_ab_variant(landing_id: str, body: ABVariantBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.create_ab_variant(
        db, landing_id, user.user_id,
        variant_b_template_key=body.variant_b_template_key,
    )
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "No se pudo crear variante"))
    return res


@router.get("/ab/{group_id}/stats")
async def ab_stats(group_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    stats = await eng.get_ab_stats(db, group_id, user.user_id)
    if not stats:
        raise HTTPException(404, "Grupo A/B no encontrado")
    return stats


@router.post("/ab/{group_id}/declare-winner")
async def declare_winner(group_id: str, body: DeclareWinnerBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.declare_ab_winner(db, group_id, user.user_id, body.winner_variant)
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "No se pudo declarar"))
    return res


async def _build_pdf(db, landing_id: str, user_id: str) -> bytes:
    landing = await eng.get_landing(db, landing_id, user_id)
    if not landing:
        raise HTTPException(404, "Landing no encontrada")
    brand_kit = await eng.fetch_brand_kit(db, landing.get("brand_kit_id"), user_id)
    # Z.8.5 — Hydrate linked_entity para brochure
    try:
        landing = await eng.hydrate_landing_for_public(db, landing)
    except Exception:
        pass
    # Try Z.8.5 rich brochure first · fallback al Z.8.2 simple si falla
    try:
        from studio_landing_brochure_pdf import render_landing_brochure as render_rich
        return render_rich(landing, brand_kit)
    except Exception:
        return pdf_eng.render_landing_brochure(landing, brand_kit)


@router.post("/{landing_id}/export-pdf")
async def export_pdf_post(landing_id: str, request: Request):
    user = await _require_user(request)
    db = _db(request)
    pdf_bytes = await _build_pdf(db, landing_id, user.user_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=landing_{landing_id}.pdf"},
    )


@router.get("/{landing_id}/export-pdf")
async def export_pdf_get(landing_id: str, request: Request):
    user = await _require_user(request)
    db = _db(request)
    pdf_bytes = await _build_pdf(db, landing_id, user.user_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=landing_{landing_id}.pdf"},
    )


# ─── Sub-A · Sections + catalog + pixels + undo (Z.8.2) ──────────────────────
# NOTE: These specific routes MUST be defined BEFORE @router.get("/{landing_id}")
# para evitar que el wildcard atrape /catalog y /starters.
@router.get("/catalog/developments")
async def catalog_developments_ep(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    items = await eng.catalog_developments(db, user.user_id)
    return {"items": items, "total": len(items)}


@router.get("/catalog/asesor")
async def catalog_asesor_ep(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    profile = await eng.catalog_asesor(db, user.user_id)
    return {"profile": profile, "user_id": user.user_id}


@router.get("/catalog/marketplace-filters")
async def catalog_marketplace_ep(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    return await eng.catalog_marketplace_filters(db, user.user_id)


@router.get("/catalog/resales")
async def catalog_resales_ep(request: Request, limit: int = Query(30, ge=1, le=100), skip: int = Query(0, ge=0)) -> Dict[str, Any]:
    """Z.8.5 — Lista listing_imports parsed del user (reventas Z.1)."""
    user = await _require_user(request)
    db = _db(request)
    return await eng.catalog_resales(db, user.user_id, limit=limit, skip=skip)


@router.post("/{landing_id}/auto-fill")
async def auto_fill_template(landing_id: str, request: Request) -> Dict[str, Any]:
    """Z.8.5 — Auto-fill template_content invocando Atlax tool #25 adaptive copy."""
    user = await _require_user(request)
    db = _db(request)
    landing = await eng.get_landing(db, landing_id, user.user_id)
    if not landing:
        raise HTTPException(404, "Landing no encontrada")
    try:
        from asistente_engine import _tool_landing_adaptive_copy
        bundle = await _tool_landing_adaptive_copy(db, {
            "template_key": landing.get("template_key", "modern"),
            "property_source": landing.get("property_source", "development"),
            "linked_entity_id": landing.get("linked_entity_id"),
        })
        if bundle.get("error"):
            raise HTTPException(422, bundle["error"])
        # Persist template_content[template_key]
        tk = landing.get("template_key", "modern")
        existing_tc = landing.get("template_content") or {}
        existing_tc[tk] = {
            "hero_headline": bundle.get("hero_headline"),
            "hero_subtitle": bundle.get("hero_subtitle"),
            "cta_primary": bundle.get("cta_primary"),
            "cta_secondary": bundle.get("cta_secondary"),
            "badges_list": bundle.get("badges_list"),
            "template_data": bundle.get("template_data"),
            "auto_filled_at": eng._iso(),
        }
        await db.studio_landings.update_one(
            {"id": landing_id, "user_id": user.user_id},
            {"$set": {"template_content": existing_tc, "updated_at": eng._iso()}},
        )
        return {"ok": True, "template_content": existing_tc, "bundle": bundle}
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"[auto-fill] failed: {exc}")
        raise HTTPException(500, f"Auto-fill fallo: {exc}")


@router.patch("/{landing_id}/routing-config")
async def patch_routing_config(landing_id: str, body: RoutingConfigBody, request: Request) -> Dict[str, Any]:
    """Z.8.5 — Update lead_routing_config (recomendado inmobiliaria_admin)."""
    user = await _require_user(request)
    db = _db(request)
    res = await eng.update_routing_config(db, landing_id, user.user_id, body.model_dump(exclude_none=True))
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo actualizar routing"))
    return res


@router.get("/starters")
async def get_starters(request: Request) -> Dict[str, Any]:
    """Kept for backward compat with explicit path · returns same payload."""
    return await get_starters_root(request)


@router.patch("/{landing_id}/sections")
async def patch_sections(landing_id: str, body: SectionsUpdateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.update_sections(db, landing_id, user.user_id, body.sections)
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "No se pudo actualizar sections"))
    return res


@router.post("/{landing_id}/undo")
async def undo(landing_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.undo_sections(db, landing_id, user.user_id)
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "Nada que deshacer"))
    return res


@router.patch("/{landing_id}/tracking-pixels")
async def patch_pixels(landing_id: str, body: TrackingPixelsBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    res = await eng.update_tracking_pixels(db, landing_id, user.user_id, body.model_dump())
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo actualizar pixels"))
    return res


@router.patch("/{landing_id}/marketplace-config")
async def patch_marketplace_config(landing_id: str, body: MarketplaceConfigBody, request: Request) -> Dict[str, Any]:
    """Z.8.4 — Update marketplace_config nested en content (sin tocar sections)."""
    user = await _require_user(request)
    db = _db(request)
    res = await eng.update_marketplace_config(db, landing_id, user.user_id, body.model_dump(exclude_none=True))
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "No se pudo actualizar marketplace"))
    return res


@router.post("/{landing_id}/marketplace-preview")
async def preview_marketplace(landing_id: str, body: MarketplaceConfigBody, request: Request) -> Dict[str, Any]:
    """Z.8.4 — Live preview count para CreateModal builder (no persiste)."""
    user = await _require_user(request)
    db = _db(request)
    landing = await eng.get_landing(db, landing_id, user.user_id) if landing_id and landing_id != "_new" else None
    cfg = body.model_dump(exclude_none=True)
    if landing:
        cfg = {**(landing.get("content", {}).get("marketplace_config") or {}), **cfg}
    res = eng.query_marketplace_developments(db, user.user_id, cfg, page=1, page_size=1)
    return {"total": res["total"], "total_unfiltered": res["total_unfiltered"], "facets": res["facets"], "applied_filters": res["applied_filters"]}


# ─── Public routes (no auth) ─────────────────────────────────────────────────
# 1x1 transparent PNG pixel (43 bytes)
_PIXEL_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
_PIXEL_BYTES = base64.b64decode(_PIXEL_B64)


@public_router.get("/{slug}")
async def get_public_landing(slug: str, request: Request, preview: int = 0) -> Dict[str, Any]:
    db = _db(request)
    include_unpublished = bool(preview)
    landing = await eng.get_landing_by_slug(db, slug, include_unpublished=include_unpublished)
    if not landing:
        raise HTTPException(404, "Landing no disponible")
    # Hydrate per landing_type (property/personal_brand/marketplace)
    landing = await eng.hydrate_landing_for_public(db, landing)
    brand_kit = await eng.fetch_brand_kit(db, landing.get("brand_kit_id"), landing.get("user_id"))
    safe_landing = {
        "id": landing["id"],
        "slug": landing["slug"],
        "template_key": landing["template_key"],
        "content": landing.get("content", {}),
        "sections": landing.get("sections", []),
        "landing_type": landing.get("landing_type", "property"),
        "linked_entity": landing.get("linked_entity"),
        "tracking_pixels": landing.get("tracking_pixels", {}),
        "variant_label": landing.get("variant_label", "single"),
        "ab_group_id": landing.get("ab_group_id"),
        "published": landing.get("published", False),
        "theme": landing.get("theme"),
        "property_source": landing.get("property_source"),
        "template_content": landing.get("template_content") or {},
        "atlax_data": landing.get("atlax_data") or {},
    }
    return {"landing": safe_landing, "brand_kit": brand_kit}


@public_router.get("/{slug}/marketplace")
async def public_marketplace_query(
    slug: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=48),
    q: str = Query("", max_length=120),
    cities: str = Query(""),
    colonias: str = Query(""),
    status: str = Query(""),
    price_min: Optional[int] = Query(None, ge=0),
    price_max: Optional[int] = Query(None, ge=0),
    amenities: str = Query(""),
    sort_by: Optional[str] = Query(None, pattern="^(price_asc|price_desc|date_new|name_az|zone)$"),
) -> Dict[str, Any]:
    """Z.8.4 — Public paginated marketplace query · respeta config + permite override."""
    db = _db(request)
    landing = await eng.get_landing_by_slug(db, slug, include_unpublished=False)
    if not landing or landing.get("landing_type") != "marketplace":
        raise HTTPException(404, "Marketplace no disponible")
    cfg = (landing.get("content") or {}).get("marketplace_config") or eng.marketplace_config_defaults()
    if sort_by:
        cfg = {**cfg, "sort_by": sort_by}
    override = {}
    if cities:
        override["cities"] = [c.strip() for c in cities.split(",") if c.strip()]
    if colonias:
        override["colonias"] = [c.strip() for c in colonias.split(",") if c.strip()]
    if status:
        override["status"] = [s.strip() for s in status.split(",") if s.strip() in eng.MARKETPLACE_STATUS_FILTERS]
    if price_min is not None:
        override["price_min"] = price_min
    if price_max is not None:
        override["price_max"] = price_max
    if amenities:
        override["amenities_required"] = [a.strip() for a in amenities.split(",") if a.strip()]
    res = eng.query_marketplace_developments(
        db, landing.get("user_id", ""), cfg,
        override_filters=override or None, q=q, page=page, page_size=page_size,
    )
    return res


@public_router.post("/{slug}/lead")
async def submit_lead(slug: str, body: LeadSubmitBody, request: Request) -> Dict[str, Any]:
    db = _db(request)
    ip = _client_ip(request)
    referrer = request.headers.get("referer", "")[:200]
    res = await eng.submit_landing_lead(db, slug, body.payload or {}, ip=ip, referrer=referrer)
    if not res.get("ok"):
        if res.get("error") == "rate_limited":
            raise HTTPException(429, res.get("message", "Rate limit"))
        raise HTTPException(404, res.get("error", "Lead no aceptado"))
    return res


@public_router.post("/{slug}/analytics")
async def public_analytics(slug: str, body: AnalyticsBatchBody, request: Request) -> Dict[str, Any]:
    """Z.8.5 — Batch tracking events publico (scroll · section_visible · clicks)."""
    db = _db(request)
    ip = _client_ip(request)
    return await eng.record_landing_analytics(db, slug, body.events or [], ip=ip)


@router.get("/{landing_id}/analytics-summary")
async def analytics_summary(landing_id: str, request: Request, days: int = Query(30, ge=1, le=90)) -> Dict[str, Any]:
    """Z.8.5 — Summary heat map + funnel + scroll depth · T2+ only."""
    user = await _require_user(request)
    db = _db(request)
    res = await eng.get_landing_analytics_summary(db, landing_id, user.user_id, days=days)
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "Analytics no disponible"))
    return res


@router.post("/ab/{group_id}/winner-quality")
async def ab_winner_quality(group_id: str, request: Request) -> Dict[str, Any]:
    """Z.8.5 — A/B winner pick por lead quality (weighted rate + completeness + DISC)."""
    user = await _require_user(request)
    db = _db(request)
    res = await eng.ab_winner_by_lead_quality(db, group_id, user.user_id)
    if not res.get("ok"):
        raise HTTPException(422, res.get("error", "No se pudo decidir"))
    return res


@public_router.get("/{slug}/cross-links")
async def cross_links(slug: str, request: Request) -> Dict[str, Any]:
    """Z.8.5 — Devuelve cross-links del asesor (marketplace + carrusel) para footer landing."""
    db = _db(request)
    landing = await eng.get_landing_by_slug(db, slug, include_unpublished=False)
    if not landing:
        raise HTTPException(404, "Landing no disponible")
    user_id = landing.get("user_id")
    out: Dict[str, Any] = {"marketplace_slug": None, "carrusel_id": None, "asesor_name": None}
    # Marketplace landing del mismo asesor (si existe)
    try:
        mp = await db.studio_landings.find_one(
            {"user_id": user_id, "landing_type": "marketplace", "published": True, "deleted": {"$ne": True}},
            {"_id": 0, "slug": 1},
            sort=[("created_at", -1)],
        )
        if mp:
            out["marketplace_slug"] = mp.get("slug")
    except Exception:
        pass
    # Carrusel Z.2 del development (si linked)
    try:
        dev_id = landing.get("linked_entity_id")
        if dev_id and landing.get("property_source") == "development":
            car = await db.studio_carruseles.find_one(
                {"user_id": user_id, "project_id": dev_id, "status": {"$in": ["ready", "published"]}},
                {"_id": 0, "id": 1, "slug": 1},
                sort=[("created_at", -1)],
            )
            if car:
                out["carrusel_id"] = car.get("slug") or car.get("id")
    except Exception:
        pass
    # Asesor profile name
    try:
        prof = await db.asesor_profiles.find_one({"user_id": user_id}, {"_id": 0, "full_name": 1})
        if prof:
            out["asesor_name"] = prof.get("full_name")
    except Exception:
        pass
    return out


@public_router.get("/{slug}/track")
async def track_view(slug: str, request: Request, ts: Optional[str] = None):
    """Tracking pixel 1x1 PNG · fire-and-forget view counter."""
    db = _db(request)
    ip = _client_ip(request)
    referrer = request.headers.get("referer", "")[:200]
    await eng.record_landing_view(db, slug, ip=ip, referrer=referrer)
    return Response(
        content=_PIXEL_BYTES,
        media_type="image/png",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )
