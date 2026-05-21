"""W5.22 Z.2 Sub-B — Studio Carrusel routes.

Prefijo: /api/studio/carrusel · T2+ via require_studio.
Track event: publico (sin auth).

Endpoints:
    POST /generate               genera carrusel(es) con hook score gate
    POST /:id/track              tracking pixel (publico)
    GET  /ab/:group_id/stats     estadisticas A/B + chi-square
    POST /ab/:group_id/declare-winner  declara ganador manual o auto
    POST /hook-score             evalua hook score de texto
    GET  /list                   lista carruseles del user
    GET  /:id                    detalle carrusel
    POST /:id/export-pdf         exporta PDF A4
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query, Response
from pydantic import BaseModel, Field

import studio_carrusel_engine as car_engine
import studio_carrusel_ab_engine as ab_engine
import studio_hook_score_engine as hook_engine

log = logging.getLogger("dmx.routes_studio_carrusel")

router = APIRouter(prefix="/api/studio/carrusel", tags=["studio_carrusel"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


# ─── Schemas ──────────────────────────────────────────────────────────────────
class CarruselGenerateBody(BaseModel):
    copy_id: Optional[str] = None
    brand_kit_id: Optional[str] = None
    aspect_ratios: Optional[List[str]] = None
    pages_data: Dict[str, Any] = Field(default_factory=dict)
    ab_test_bool: bool = False
    hook_score_pre_gate_min: int = Field(60, ge=0, le=100)
    project_id: Optional[str] = None


class TrackEventBody(BaseModel):
    event_type: str = Field(..., pattern="^(click|view|conversion)$")
    variant: Optional[str] = None


class DeclareWinnerBody(BaseModel):
    winner_variant: Optional[str] = Field(None, pattern="^(A|B)$")


class HookScoreBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)
    language: str = Field("es-MX", pattern="^(es-MX|en-US)$")


# ─── Routes ───────────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_carrusel(body: CarruselGenerateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)

    # Validate aspect_ratios
    valid_ratios = set(car_engine.RATIO_DIMS.keys())
    ratios = body.aspect_ratios
    if ratios:
        invalid = [r for r in ratios if r not in valid_ratios]
        if invalid:
            raise HTTPException(422, f"Aspect ratios invalidos: {invalid}. Validos: {sorted(valid_ratios)}")

    result = await car_engine.generate_carrusel_job(
        db,
        tenant_id=user.tenant_id or "default",
        user_id=user.user_id,
        copy_id=body.copy_id,
        brand_kit_id=body.brand_kit_id,
        pages_data=body.pages_data,
        aspect_ratios=ratios,
        ab_test_bool=body.ab_test_bool,
        hook_score_pre_gate_min=body.hook_score_pre_gate_min,
        project_id=body.project_id,
    )

    if not result.get("ok"):
        raise HTTPException(422, detail={
            "message": result.get("error", "Hook score gate failed"),
            "hook_score": result.get("hook_score"),
            "suggestion": result.get("suggestion"),
            "breakdown": result.get("hook_breakdown"),
        })

    return result


@router.post("/{carrusel_id}/track")
async def track_event(carrusel_id: str, body: TrackEventBody, request: Request) -> Dict[str, Any]:
    """Tracking pixel publico (sin auth)."""
    db = _db(request)
    await car_engine.track_event(db, carrusel_id, body.event_type, body.variant)
    return {"ok": True}


@router.get("/ab/{group_id}/stats")
async def get_ab_stats(group_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    stats = await ab_engine.get_ab_stats(db, group_id, user.user_id)
    if not stats:
        raise HTTPException(404, "Grupo A/B no encontrado")
    return stats


@router.post("/ab/{group_id}/declare-winner")
async def declare_winner(group_id: str, body: DeclareWinnerBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    result = await ab_engine.declare_winner(db, group_id, user.user_id, body.winner_variant)
    if not result.get("ok"):
        raise HTTPException(422, result.get("error", "No se pudo declarar ganador"))
    return result


@router.post("/hook-score")
async def compute_hook_score(body: HookScoreBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    result = await hook_engine.compute_hook_score(
        body.text, body.language,
        db=db, tenant_id=getattr(user, "tenant_id", None) or "default",
    )
    return result


@router.get("/list")
async def list_carruseles(
    request: Request,
    project_id: Optional[str] = Query(None),
    buyer_angle: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    q: Dict[str, Any] = {"user_id": user.user_id}
    if project_id:
        q["project_id"] = project_id
    if status:
        q["status"] = status
    cursor = db.studio_carruseles.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(limit)
    # Z.2.3 fix: hidratar r2_urls públicos desde r2_keys + CLOUDFLARE_R2_PUBLIC_URL
    from studio_asset_library import _make_public_url as _r2_url
    for item in items:
        r2_keys = item.get("r2_keys") or {}
        if r2_keys:
            item["r2_urls"] = {ratio: _r2_url(key) for ratio, key in r2_keys.items()}
    total = await db.studio_carruseles.count_documents(q)
    return {"items": items, "total": total}


@router.get("/{carrusel_id}")
async def get_carrusel(carrusel_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    car = await db.studio_carruseles.find_one(
        {"id": carrusel_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not car:
        raise HTTPException(404, "Carrusel no encontrado")
    # Z.2.3 fix: hidratar r2_urls públicos
    r2_keys = car.get("r2_keys") or {}
    if r2_keys:
        from studio_asset_library import _make_public_url as _r2_url
        car["r2_urls"] = {ratio: _r2_url(key) for ratio, key in r2_keys.items()}
    return {"carrusel": car}


@router.get("/{carrusel_id}/export-pdf")
@router.post("/{carrusel_id}/export-pdf")
async def export_pdf(carrusel_id: str, request: Request):
    """Exporta carrusel a PDF A4 con ReportLab.
    Soporta GET (download directo browser via window.open) y POST (fetch legacy).
    """
    user = await _require_user(request)
    db = _db(request)
    car = await db.studio_carruseles.find_one(
        {"id": carrusel_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not car:
        raise HTTPException(404, "Carrusel no encontrado")

    pdf_bytes = _render_carrusel_pdf(car)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=carrusel_{carrusel_id}.pdf"},
    )


def _render_carrusel_pdf(car: Dict[str, Any]) -> bytes:
    """Genera PDF A4 del carrusel usando ReportLab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, Color
    from reportlab.pdfgen import canvas as rl_canvas
    import io

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    MARGIN = 15 * mm
    IW = W - 2 * MARGIN

    BG = HexColor("#06080F")
    CREAM = HexColor("#F0EBE0")
    INDIGO = HexColor("#6366F1")
    GRAY = HexColor("#6B7280")

    def rl_gradient(cx, x, y, w, h):
        step = max(1, int(w // 40))
        for i in range(0, int(w), step):
            t = i / max(w - 1, 1)
            r = (99 + t * (236 - 99)) / 255
            g = (102 + t * (72 - 102)) / 255
            b = (241 + t * (153 - 241)) / 255
            cx.setFillColor(Color(r, g, b))
            cx.rect(x + i, y, step + 1, h, fill=1, stroke=0)

    pages_data = car.get("pages_data") or {}
    hero = pages_data.get("hero") or {}
    stats = pages_data.get("stats") or []
    cta = pages_data.get("cta") or {}
    disclaimer = pages_data.get("disclaimer", "")

    # Cover page
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    rl_gradient(c, 0, H - 4, W, 4)

    c.setFont("Helvetica-Bold", 28)
    c.setFillColor(CREAM)
    title = hero.get("title", "Carrusel")[:60]
    c.drawString(MARGIN, H - MARGIN - 60, title)

    if hero.get("subtitle"):
        c.setFont("Helvetica", 14)
        c.setFillColor(HexColor("#a0a4b0"))
        c.drawString(MARGIN, H - MARGIN - 85, hero["subtitle"][:80])

    if stats:
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(CREAM)
        c.drawString(MARGIN, H / 2 + 20, "Stats:")
        for i, stat in enumerate(stats[:6]):
            c.setFont("Helvetica", 10)
            c.setFillColor(HexColor("#a0a4b0"))
            c.drawString(MARGIN, H / 2 - 5 - i * 20,
                         f"{stat.get('label', '')}:  {stat.get('value', '')}")

    if cta.get("text"):
        rl_gradient(c, 0, MARGIN + 20, int(IW * 0.4), 36)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(HexColor("#FFFFFF"))
        c.drawString(MARGIN + 12, MARGIN + 30, cta["text"][:40])

    if disclaimer:
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        c.drawString(MARGIN, 20, disclaimer[:100])

    rl_gradient(c, 0, 0, W, 4)
    c.showPage()
    c.save()

    buf.seek(0)
    return buf.read()
