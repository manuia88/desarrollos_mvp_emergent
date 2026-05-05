"""Phase 4 Batch 22 · routes — Project Insights endpoints."""
from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from services.insights_engagement import get_engagement_split
from services.insights_comparables import find_comparables
from services.insights_ai import (
    generate_predictions, generate_recommendations,
    generate_narrative, generate_resumen_narrative,
)

log = logging.getLogger("dmx.insights")
router = APIRouter(tags=["insights"])

DEV_ROLES = {"developer_admin", "developer_director", "developer_member",
              "inmobiliaria_admin", "asesor_admin", "superadmin"}


def _db(req): return req.app.state.db
def _now(): return datetime.now(timezone.utc)


async def _auth_dev(req):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in DEV_ROLES:
        raise HTTPException(403, "Solo roles desarrollador/admin pueden ver insights")
    return u


async def _project_or_404(db, project_id: str):
    p = await db.projects.find_one(
        {"$or": [{"id": project_id}, {"slug": project_id}]}, {"_id": 0},
    )
    if p:
        return p
    # Legacy fallback: data_developments seed
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(project_id)
        if dev:
            return {
                "id": project_id,
                "slug": project_id,
                "name": dev.get("name", project_id),
                "colonia": dev.get("colonia"),
                "municipio": dev.get("municipio") or dev.get("alcaldia"),
                "stage": dev.get("stage"),
                "segmento": dev.get("segmento") or dev.get("segment"),
                "price_from": dev.get("price_from") or dev.get("price_min"),
                "total_units": dev.get("total_units") or dev.get("units_total"),
                "created_at": dev.get("created_at") or dev.get("listed_at"),
            }
    except Exception:
        pass
    raise HTTPException(404, "Proyecto no encontrado")


# ─── Resumen ─────────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/resumen")
async def get_resumen(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    proj = await _project_or_404(db, project_id)

    days_listed = 0
    try:
        ca = proj.get("created_at")
        if ca:
            cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
            days_listed = max(0, (datetime.now(timezone.utc) - cdt).days)
    except Exception:
        pass

    units_total = await db.units.count_documents({"project_id": project_id})
    units_sold = await db.units.count_documents(
        {"project_id": project_id, "status": {"$in": ["vendido", "vendida"]}},
    )
    since = (_now() - timedelta(days=30)).isoformat()
    leads_30d = await db.leads.count_documents(
        {"project_id": project_id, "created_at": {"$gte": since}},
    )
    won_30d = await db.leads.count_documents({
        "project_id": project_id,
        "lead_stage": {"$in": ["cerrado_ganado", "ganado", "won"]},
        "created_at": {"$gte": since},
    })
    conversion_pct = round((won_30d / leads_30d) * 100, 1) if leads_30d else 0.0

    # GMV: sum sold unit prices
    gmv_pipeline = [
        {"$match": {"project_id": project_id,
                     "status": {"$in": ["vendido", "vendida"]}}},
        {"$group": {"_id": None, "gmv": {"$sum": "$price"}}},
    ]
    gmv = 0.0
    async for r in db.units.aggregate(gmv_pipeline):
        gmv = float(r.get("gmv", 0) or 0)

    hs = await db.health_scores.find_one(
        {"entity_type": "project", "entity_id": project_id},
        {"_id": 0, "score": 1, "trend_7d": 1, "components": 1},
        sort=[("computed_at", -1)],
    ) or {}

    # Trend snapshots last 30 days (health_score history)
    trend = []
    async for s in db.health_scores_snapshots.find(
        {"entity_type": "project", "entity_id": project_id,
         "snapshot_date": {"$gte": (_now() - timedelta(days=30)).date().isoformat()}},
        {"_id": 0, "score": 1, "snapshot_date": 1},
    ).sort("snapshot_date", 1):
        trend.append({"date": s["snapshot_date"], "value": int(s.get("score", 0))})

    summary_text = await generate_resumen_narrative(db, project_id)

    return {
        "project_id": project_id,
        "kpis": {
            "units_sold": units_sold,
            "units_total": units_total,
            "leads_30d": leads_30d,
            "conversion_pct": conversion_pct,
            "days_listed": days_listed,
            "gmv": round(gmv, 2),
        },
        "health_score": int(hs.get("score", 0)),
        "trend_7d": int(hs.get("trend_7d", 0)),
        "trend_30d": trend,
        "summary_text": summary_text,
    }


# ─── Engagement ──────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/engagement")
async def get_engagement(
    project_id: str, request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await get_engagement_split(db, project_id, period)


# ─── Comparables ─────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/comparables")
async def get_comparables(project_id: str, request: Request,
                            top_n: int = Query(5, ge=1, le=10)):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await find_comparables(db, project_id, top_n=top_n)


# ─── Comparables export (CSV / PDF) ──────────────────────────────────────────

def _fmt_pct(v):
    if v is None:
        return "0.0%"
    return f"{'+' if v > 0 else ''}{v:.1f}%"


def _build_comparables_csv(payload: Dict[str, Any]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    cur = payload.get("current") or {}
    w.writerow([
        f"Comparables · {cur.get('name', '')}",
        f"Zona: {payload.get('alcaldia', '')}",
        f"Generado: {datetime.now(timezone.utc).isoformat()}",
    ])
    w.writerow([])
    w.writerow([
        "Tu proyecto", "Precio/m²", "Health", "Velocidad/mes", "Días listado",
        "Unidades vendidas", "Inventario",
    ])
    w.writerow([
        cur.get("name", ""), cur.get("price_per_m2", 0),
        cur.get("health_score", 0), cur.get("sale_velocity_per_month", 0),
        cur.get("days_listed", 0), cur.get("units_sold", 0),
        cur.get("total_units", 0),
    ])
    w.writerow([])
    w.writerow([
        "Comparable", "Colonia", "Similitud",
        "Precio/m²", "Δ Precio/m²",
        "Health", "Δ Health",
        "Velocidad", "Δ Velocidad",
        "Días listado", "Δ Días",
    ])
    for c in payload.get("comparables") or []:
        d = c.get("delta_vs_current") or {}
        w.writerow([
            c.get("name", ""), c.get("colonia", ""),
            c.get("similarity_score", 0),
            c.get("price_per_m2", 0), _fmt_pct(d.get("price_per_m2_pct")),
            c.get("health_score", 0), _fmt_pct(d.get("health_pct")),
            c.get("sale_velocity_per_month", 0), _fmt_pct(d.get("velocity_pct")),
            c.get("days_listed", 0), _fmt_pct(d.get("days_listed_pct")),
        ])
    return buf.getvalue().encode("utf-8-sig")


def _build_comparables_pdf(payload: Dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import letter, landscape
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(letter),
                            leftMargin=0.5 * inch, rightMargin=0.5 * inch,
                            topMargin=0.55 * inch, bottomMargin=0.5 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Title"], fontSize=18,
        textColor=HexColor("#06080F"), spaceAfter=4, fontName="Helvetica-Bold",
    )
    eyebrow = ParagraphStyle(
        "eyebrow", parent=styles["Normal"], fontSize=8,
        textColor=HexColor("#6366F1"), spaceAfter=2, fontName="Helvetica-Bold",
    )
    sub_style = ParagraphStyle(
        "sub", parent=styles["Normal"], fontSize=10,
        textColor=HexColor("#4B5563"), spaceAfter=14,
    )

    cur = payload.get("current") or {}
    story = [
        Paragraph("DESARROLLOSMX · INSIGHTS", eyebrow),
        Paragraph(f"Comparables — {cur.get('name', 'Proyecto')}", title_style),
        Paragraph(
            f"Zona de referencia: {payload.get('alcaldia', '—')} · "
            f"Generado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            sub_style,
        ),
    ]

    # Current snapshot
    cur_data = [
        ["Tu proyecto", "Precio/m²", "Health", "Velocidad/mes",
         "Días listado", "Vendidas", "Inventario"],
        [
            cur.get("name", "—"),
            f"${(cur.get('price_per_m2') or 0):,.0f}",
            f"{cur.get('health_score', 0)}/100",
            f"{cur.get('sale_velocity_per_month', 0)}",
            f"{cur.get('days_listed', 0)}",
            f"{cur.get('units_sold', 0)}",
            f"{cur.get('total_units', 0)}",
        ],
    ]
    t_cur = Table(cur_data, hAlign="LEFT")
    t_cur.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#6366F1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BACKGROUND", (0, 1), (-1, 1), HexColor("#F0EBE0")),
        ("FONTSIZE", (0, 1), (-1, 1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#9CA3AF")),
    ]))
    story.append(t_cur)
    story.append(Spacer(1, 16))

    # Comparables
    comps = payload.get("comparables") or []
    if comps:
        story.append(Paragraph(
            f"<b>Top {len(comps)} comparables</b> · ordenados por similitud", sub_style,
        ))
        header = ["Proyecto", "Colonia", "Similitud",
                  "Precio/m²", "Δ", "Health", "Δ",
                  "Velocidad", "Δ", "Días", "Δ"]
        rows = [header]
        for c in comps:
            d = c.get("delta_vs_current") or {}
            rows.append([
                c.get("name", ""),
                c.get("colonia", "") or "—",
                f"{c.get('similarity_score', 0):.0f}",
                f"${(c.get('price_per_m2') or 0):,.0f}",
                _fmt_pct(d.get("price_per_m2_pct")),
                f"{c.get('health_score', 0)}",
                _fmt_pct(d.get("health_pct")),
                f"{c.get('sale_velocity_per_month', 0)}",
                _fmt_pct(d.get("velocity_pct")),
                f"{c.get('days_listed', 0)}",
                _fmt_pct(d.get("days_listed_pct")),
            ])
        t = Table(rows, hAlign="LEFT", repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#06080F")),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#F0EBE0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#F9F7F2")]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("GRID", (0, 0), (-1, -1), 0.3, HexColor("#D1D5DB")),
        ]))
        story.append(t)
    else:
        story.append(Paragraph(
            "No se encontraron proyectos comparables en la zona.",
            styles["Italic"],
        ))

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        '<font color="#9CA3AF" size="8">Δ = variación porcentual del comparable '
        'respecto a tu proyecto. Negativo significa que el comparable está por '
        'debajo en esa métrica. Generado por DesarrollosMX · Spatial Decision '
        'Intelligence Platform.</font>',
        styles["Normal"],
    ))

    doc.build(story)
    return buf.getvalue()


@router.get("/api/dev/projects/{project_id}/insights/comparables/export")
async def export_comparables(
    project_id: str, request: Request,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    top_n: int = Query(5, ge=1, le=10),
):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    payload = await find_comparables(db, project_id, top_n=top_n)

    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_"
                    for ch in (project_id or "comparables"))
    if format == "csv":
        data = _build_comparables_csv(payload)
        return Response(
            content=data, media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition":
                     f'attachment; filename="comparables-{safe}.csv"'},
        )
    pdf = _build_comparables_pdf(payload)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition":
                 f'attachment; filename="comparables-{safe}.pdf"'},
    )


# ─── AI Insights ─────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/ai/predictions")
async def get_predictions(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_predictions(db, project_id)


@router.get("/api/dev/projects/{project_id}/insights/ai/recommendations")
async def get_recommendations(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_recommendations(db, project_id)


@router.get("/api/dev/projects/{project_id}/insights/ai/narrative")
async def get_narrative(
    project_id: str, request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    force: bool = Query(False),
):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_narrative(db, project_id, period, force=force)
