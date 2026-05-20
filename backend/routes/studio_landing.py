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


class LandingPatchBody(BaseModel):
    content: Optional[Dict[str, Any]] = None
    template_key: Optional[str] = None
    brand_kit_id: Optional[str] = None
    project_id: Optional[str] = None


class PublishBody(BaseModel):
    published: bool = True


class ABVariantBody(BaseModel):
    variant_b_template_key: str


class DeclareWinnerBody(BaseModel):
    winner_variant: Optional[str] = Field(None, pattern="^(A|B)$")


class LeadSubmitBody(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


# ─── Portal routes (T2+) ─────────────────────────────────────────────────────
@router.post("")
async def create_landing(body: LandingCreateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
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
    # Fetch brand kit for theming
    brand_kit = await eng.fetch_brand_kit(db, landing.get("brand_kit_id"), landing.get("user_id"))
    # Don't expose tenant_id/user_id to public
    safe_landing = {
        "id": landing["id"],
        "slug": landing["slug"],
        "template_key": landing["template_key"],
        "content": landing.get("content", {}),
        "variant_label": landing.get("variant_label", "single"),
        "ab_group_id": landing.get("ab_group_id"),
        "published": landing.get("published", False),
    }
    return {"landing": safe_landing, "brand_kit": brand_kit}


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
