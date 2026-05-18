"""W2.9 Phase Z.2 — Superadmin Intelligence Hub routes.

Prefix: /api/superadmin/intelligence-hub · all require_superadmin.

Endpoints:
  GET  /overview                  — executive dashboard cross-org
  GET  /insights                  — get cached or generate (≤7d fresh window)
  POST /insights/generate         — force regenerate, audit + ai_cost
  GET  /heatmap-multi             — multi-layer geojson points
  GET  /comparables-matrix        — N×N similarity matrix
  GET  /export/pdf                — executive PDF (StreamingResponse)
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import intelligence_insights_engine as intel

log = logging.getLogger("dmx.routes_superadmin_intelligence_hub")

router = APIRouter(tags=["superadmin_intelligence_hub"])
PREFIX = "/api/superadmin/intelligence-hub"

PeriodLit = Literal["current", "7d", "30d", "90d"]
TierLit = Literal["city", "alcaldia", "colonia", "development"]


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


class GenerateBody(BaseModel):
    zone_id: str
    tier: TierLit = "colonia"
    period: PeriodLit = "current"
    force: bool = False


# ─── 1) GET /overview ─────────────────────────────────────────────────────────
@router.get(PREFIX + "/overview")
async def overview_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    return await intel.executive_overview(db)


# ─── 2) GET /insights ─────────────────────────────────────────────────────────
@router.get(PREFIX + "/insights")
async def insights_route(
    request: Request,
    zone_id: str = Query(...),
    tier: TierLit = "colonia",
    period: PeriodLit = "current",
):
    user = await _require_superadmin(request)
    db = _db(request)
    return await intel.generate_brief(
        db, zone_id=zone_id, tier=tier, period=period,
        force=False, triggered_by=user.user_id,
    )


# ─── 3) POST /insights/generate ───────────────────────────────────────────────
@router.post(PREFIX + "/insights/generate")
async def generate_brief_route(body: GenerateBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    brief = await intel.generate_brief(
        db, zone_id=body.zone_id, tier=body.tier, period=body.period,
        force=body.force, triggered_by=user.user_id,
    )
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "intelligence_brief", brief.get("id") or "",
            before=None,
            after={"zone_id": body.zone_id, "force": body.force,
                   "model": brief.get("model"),
                   "ai_cost_mxn": brief.get("ai_cost_mxn")},
            request=request,
        )
    except Exception:
        pass
    return brief


# ─── 4) GET /heatmap-multi ────────────────────────────────────────────────────
@router.get(PREFIX + "/heatmap-multi")
async def heatmap_multi_route(
    request: Request,
    layers: str = Query("price,demand,supply",
                        description="comma-separated: price,demand,risk,supply"),
    tier: Literal["alcaldia", "colonia", "development"] = "colonia",
    bbox: Optional[str] = Query(
        None, description="lng_min,lat_min,lng_max,lat_max",
    ),
):
    await _require_superadmin(request)
    db = _db(request)
    layer_list = [layer.strip() for layer in layers.split(",") if layer.strip()]
    bb: Optional[List[float]] = None
    if bbox:
        try:
            bb = [float(x) for x in bbox.split(",")]
            if len(bb) != 4:
                bb = None
        except Exception:
            bb = None
    return await intel.heatmap_multi_layer(db, layers=layer_list, tier=tier, bbox=bb)


# ─── 5) GET /comparables-matrix ───────────────────────────────────────────────
@router.get(PREFIX + "/comparables-matrix")
async def comparables_matrix_route(
    request: Request,
    zone_id: str = Query(...),
    radius_km: float = Query(2.0, gt=0, le=20),
    limit: int = Query(10, ge=2, le=10),
):
    await _require_superadmin(request)
    db = _db(request)
    return await intel.comparables_matrix(
        db, zone_id=zone_id, radius_km=radius_km, limit=limit,
    )


# ─── 6) GET /export/pdf ───────────────────────────────────────────────────────
@router.get(PREFIX + "/export/pdf")
async def export_pdf_route(
    request: Request,
    zone_id: str = Query(...),
    tier: TierLit = "colonia",
    period: PeriodLit = "current",
):
    user = await _require_superadmin(request)
    db = _db(request)

    brief = await intel.generate_brief(
        db, zone_id=zone_id, tier=tier, period=period,
        force=False, triggered_by=user.user_id,
    )
    matrix = await intel.comparables_matrix(db, zone_id=zone_id, radius_km=2.0, limit=5)

    pdf_bytes = _build_executive_pdf(brief, matrix)

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "read", "intelligence_brief_pdf", zone_id,
            before=None, after={"size_bytes": len(pdf_bytes), "tier": tier,
                                "period": period},
            request=request,
        )
    except Exception:
        pass

    fname = f"dmx-intelligence-{zone_id}-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ─── PDF builder (branded, ReportLab) ─────────────────────────────────────────

def _build_executive_pdf(brief: dict, matrix: dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    primary = HexColor("#06080F")
    accent = HexColor("#6366F1")
    rose = HexColor("#EC4899")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        title="DMX Intelligence Brief",
    )
    styles = getSampleStyleSheet()
    eyebrow = ParagraphStyle(
        "eyebrow", parent=styles["Normal"], textColor=accent,
        fontSize=9, fontName="Helvetica-Bold", spaceAfter=4,
    )
    h1 = ParagraphStyle(
        "H1", parent=styles["Heading1"], fontSize=22, leading=26,
        textColor=primary, fontName="Helvetica-Bold", spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"], fontSize=13, leading=16,
        textColor=primary, fontName="Helvetica-Bold", spaceAfter=6, spaceBefore=10,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"], fontSize=10, leading=14,
        textColor=colors.black, spaceAfter=4,
    )
    small = ParagraphStyle(
        "Small", parent=styles["Normal"], fontSize=8,
        textColor=colors.grey, spaceAfter=2,
    )

    story: list = []
    story.append(Paragraph("DESARROLLOSMX · INTELLIGENCE HUB", eyebrow))
    story.append(Paragraph(
        f"Brief ejecutivo · {brief.get('zone_name') or brief.get('zone_id')}", h1,
    ))
    state_label = {"bull": "Alcista", "bear": "Bajista",
                   "stable": "Estable"}.get(brief.get("market_state"), "—")
    story.append(Paragraph(
        f"Estado de mercado: <b>{state_label}</b> · "
        f"Confianza: <b>{brief.get('confidence_pct')}%</b> · "
        f"Modelo: {brief.get('model')}",
        body,
    ))
    if brief.get("stub_reason"):
        story.append(Paragraph(
            f"<i>Aviso: brief generado en modo stub — motivo: {brief.get('stub_reason')}</i>",
            small,
        ))
    story.append(Spacer(1, 8))

    # KPIs table
    kpis = brief.get("context_kpis") or {}
    kpi_data = [
        ["Indicador", "Valor"],
        ["Unidades totales", str(kpis.get("units_total") or "—")],
        ["Unidades vendidas", str(kpis.get("units_sold") or "—")],
        ["Precio promedio (MXN)", _fmt(kpis.get("avg_price_mxn"))],
        ["Precio por m²", _fmt(kpis.get("avg_price_per_m2"))],
        ["Conversión", _fmt(kpis.get("conversion_rate"))],
        ["Crecimiento 30d", f"{brief.get('growth_pct_30d') or '—'}%"],
    ]
    kt = Table(kpi_data, colWidths=[2.6 * inch, 2.0 * inch])
    kt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), accent),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.HexColor("#FAF7F2"), colors.white]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E5E5")),
    ]))
    story.append(kt)

    # Findings
    story.append(Paragraph("Hallazgos clave", h2))
    for f in (brief.get("key_findings") or []):
        story.append(Paragraph(f"• {f}", body))
    story.append(Paragraph("Riesgos principales", h2))
    for r in (brief.get("top_risks") or []):
        story.append(Paragraph(f"• {r}", body))
    story.append(Paragraph("Oportunidades", h2))
    for o in (brief.get("opportunities") or []):
        story.append(Paragraph(f"• {o}", body))

    if brief.get("reasoning"):
        story.append(Paragraph("Razonamiento", h2))
        story.append(Paragraph(brief.get("reasoning"), body))

    # Comparables top 5
    zones = (matrix or {}).get("zones") or []
    if len(zones) > 1:
        story.append(Paragraph("Comparables (top 5)", h2))
        comp_data = [["Zona", "Precio/m²", "Unidades"]]
        for z in zones[1:6]:
            kp = z.get("kpis") or {}
            comp_data.append([
                z.get("name") or z.get("zone_id"),
                _fmt(kp.get("avg_price_per_m2")),
                str(kp.get("units_total") or "—"),
            ])
        ct = Table(comp_data, colWidths=[2.8 * inch, 1.5 * inch, 1.2 * inch])
        ct.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), rose),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.HexColor("#FAF7F2"), colors.white]),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E5E5")),
        ]))
        story.append(ct)

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        f"Generado: {brief.get('generated_at')} · "
        f"Costo IA: ${brief.get('ai_cost_mxn') or 0} MXN · "
        "DesarrollosMX",
        small,
    ))

    doc.build(story)
    return buf.getvalue()


def _fmt(v):
    if v is None:
        return "—"
    try:
        f = float(v)
        if f >= 1000:
            return f"{f:,.0f}"
        return f"{f:,.2f}"
    except Exception:
        return str(v)

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("intelligence_hub", plan_tier="enterprise", monthly_price_mxn=0,   category="intelligence", name="Intelligence Hub")
