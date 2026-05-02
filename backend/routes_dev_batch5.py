"""Phase 4 Batch 5 — Dynamic Pricing A/B + Branded PDF Reports.

Sub-chunks:
  4.14  Dynamic Pricing A/B + Bundle    Experimentos + visitor assignment + tracking
  4.21  PDF Reports Branded + Email     ReportLab generation + scheduled distribution
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query, Response
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.batch5")
router = APIRouter(tags=["batch5"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _safe_audit_ml(
    db, actor, *, action: str, entity_type: str, entity_id: str,
    before: Optional[Dict] = None, after: Optional[Dict] = None,
    request: Optional[Request] = None,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or (actor.get("user_id") if isinstance(actor, dict) else "system")
            role = getattr(actor, "role", None) or (actor.get("role") if isinstance(actor, dict) else "system")
            org = getattr(actor, "tenant_id", None) or (actor.get("tenant_id") if isinstance(actor, dict) else "dmx")
            await emit_ml_event(
                db, event_type=ml_event, user_id=uid or "system",
                org_id=org or "dmx", role=role or "system",
                context=ml_context or {}, ai_decision={}, user_action={},
            )
        except Exception:
            pass


def _is_dev_admin(user) -> bool:
    return user.role in ("developer_admin", "developer_director", "superadmin")


# ═════════════════════════════════════════════════════════════════════════════
# 4.14 · DYNAMIC PRICING A/B + BUNDLE
# ═════════════════════════════════════════════════════════════════════════════
class PricingVariantInput(BaseModel):
    label: str
    price_modifier: Optional[Dict[str, Any]] = None  # {type, value}
    bundle_units: Optional[List[str]] = None
    bundle_price: Optional[float] = None
    visitor_pct: float = Field(..., ge=0.0, le=1.0)


class PricingExperimentInput(BaseModel):
    project_id: str
    name: str
    type: str = Field(..., pattern=r"^(price_ab|bundle_combo)$")
    variants: List[PricingVariantInput]
    target_units: List[str] = Field(default_factory=list)
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    status: str = Field("draft", pattern=r"^(draft|active|paused|completed)$")


def _validate_variants(variants: List[PricingVariantInput]) -> None:
    if not variants or len(variants) < 2:
        raise HTTPException(422, "Mínimo 2 variantes requeridas")
    total = sum(v.visitor_pct for v in variants)
    if abs(total - 1.0) > 0.01:
        raise HTTPException(422, f"visitor_pct debe sumar 1.0 (actual: {total:.2f})")


@router.post("/api/dev/pricing-experiments")
async def create_pricing_experiment(payload: PricingExperimentInput, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Solo developer_admin")
    db = _db(request)
    _validate_variants(payload.variants)

    now_iso = _now().isoformat()
    doc = {
        "id": _uid("exp"),
        "dev_org_id": getattr(user, "tenant_id", None) or "default",
        "project_id": payload.project_id,
        "name": payload.name,
        "type": payload.type,
        "status": payload.status,
        "variants": [
            {
                "label": v.label,
                "price_modifier": v.price_modifier or {},
                "bundle_units": v.bundle_units or [],
                "bundle_price": v.bundle_price,
                "visitor_pct": v.visitor_pct,
                "stats": {"views": 0, "leads_generated": 0, "citas_agendadas": 0, "cierres": 0},
            }
            for v in payload.variants
        ],
        "target_units": payload.target_units,
        "starts_at": payload.starts_at,
        "ends_at": payload.ends_at,
        "created_by": user.user_id,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.pricing_experiments.insert_one(doc)
    doc.pop("_id", None)
    await _safe_audit_ml(
        db, user, action="create", entity_type="pricing_experiment", entity_id=doc["id"],
        before=None, after={"name": doc["name"], "type": doc["type"]}, request=request,
        ml_event="pricing_experiment_created",
        ml_context={"experiment_id": doc["id"], "project_id": doc["project_id"]},
    )
    return doc


@router.get("/api/dev/pricing-experiments")
async def list_pricing_experiments(
    request: Request,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {} if user.role == "superadmin" else {"dev_org_id": org}
    if status:
        q["status"] = status
    if project_id:
        q["project_id"] = project_id
    items = await db.pricing_experiments.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": items, "total": len(items)}


class PricingPatchInput(BaseModel):
    status: Optional[str] = Field(None, pattern=r"^(draft|active|paused|completed)$")
    name: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


@router.patch("/api/dev/pricing-experiments/{exp_id}")
async def patch_pricing_experiment(exp_id: str, payload: PricingPatchInput, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Solo developer_admin")
    db = _db(request)
    exp = await db.pricing_experiments.find_one({"id": exp_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Experimento no encontrado")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return exp
    update["updated_at"] = _now().isoformat()
    await db.pricing_experiments.update_one({"id": exp_id}, {"$set": update})
    await _safe_audit_ml(
        db, user, action="update", entity_type="pricing_experiment", entity_id=exp_id,
        before={"status": exp.get("status")}, after=update, request=request,
        ml_event="pricing_experiment_updated", ml_context={"experiment_id": exp_id},
    )
    return {"ok": True, "id": exp_id, **update}


def _hash_visitor_to_variant(visitor_id: str, exp_id: str, variants: List[Dict]) -> str:
    """Deterministic variant assignment: hash visitor_id+exp_id → bucket."""
    h = int(hashlib.md5(f"{visitor_id}:{exp_id}".encode()).hexdigest(), 16)
    bucket = (h % 10000) / 10000.0
    cumulative = 0.0
    for v in variants:
        cumulative += v.get("visitor_pct", 0)
        if bucket < cumulative:
            return v["label"]
    return variants[-1]["label"]


class AssignVisitorInput(BaseModel):
    visitor_id: str
    project_id: str
    unit_id: Optional[str] = None


@router.post("/api/dev/pricing-experiments/{exp_id}/assign-visitor")
async def assign_visitor(exp_id: str, payload: AssignVisitorInput, request: Request):
    db = _db(request)
    exp = await db.pricing_experiments.find_one({"id": exp_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Experimento no encontrado")
    if exp["status"] != "active":
        raise HTTPException(409, "Experimento no activo")

    # Match: project_id + (target_units empty OR contains unit_id)
    if exp["project_id"] != payload.project_id:
        raise HTTPException(400, "project_id no coincide con experimento")
    if exp.get("target_units") and payload.unit_id and payload.unit_id not in exp["target_units"]:
        raise HTTPException(400, "unit_id no está en target_units del experimento")

    # Existing assignment
    existing = await db.pricing_visitor_assignments.find_one(
        {"experiment_id": exp_id, "visitor_id": payload.visitor_id}, {"_id": 0}
    )
    if existing:
        return {"variant_label": existing["variant_label"], "_existing": True}

    label = _hash_visitor_to_variant(payload.visitor_id, exp_id, exp["variants"])
    await db.pricing_visitor_assignments.insert_one({
        "id": _uid("pva"),
        "experiment_id": exp_id,
        "visitor_id": payload.visitor_id,
        "variant_label": label,
        "assigned_at": _now().isoformat(),
    })
    # Increment views counter
    await db.pricing_experiments.update_one(
        {"id": exp_id, "variants.label": label},
        {"$inc": {"variants.$.stats.views": 1}},
    )
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="pricing_variant_assigned", user_id=payload.visitor_id,
            org_id=exp.get("dev_org_id", "dmx"), role="public",
            context={"experiment_id": exp_id, "variant": label}, ai_decision={}, user_action={},
        )
    except Exception:
        pass
    return {"variant_label": label, "_existing": False}


class TrackEventInput(BaseModel):
    visitor_id: str
    event: str = Field(..., pattern=r"^(view|lead|cita|cierre)$")


EVENT_FIELD = {"view": "views", "lead": "leads_generated", "cita": "citas_agendadas", "cierre": "cierres"}


@router.post("/api/dev/pricing-experiments/{exp_id}/track-event")
async def track_event(exp_id: str, payload: TrackEventInput, request: Request):
    db = _db(request)
    assignment = await db.pricing_visitor_assignments.find_one(
        {"experiment_id": exp_id, "visitor_id": payload.visitor_id}, {"_id": 0}
    )
    if not assignment:
        raise HTTPException(404, "Visitante no asignado a experimento")
    field = EVENT_FIELD[payload.event]
    await db.pricing_experiments.update_one(
        {"id": exp_id, "variants.label": assignment["variant_label"]},
        {"$inc": {f"variants.$.stats.{field}": 1}},
    )
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="pricing_event_tracked", user_id=payload.visitor_id,
            org_id="dmx", role="public",
            context={"experiment_id": exp_id, "variant": assignment["variant_label"], "event": payload.event},
            ai_decision={}, user_action={},
        )
    except Exception:
        pass
    return {"ok": True, "variant": assignment["variant_label"], "event": payload.event}


@router.get("/api/dev/pricing-experiments/{exp_id}/results")
async def pricing_results(exp_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    exp = await db.pricing_experiments.find_one({"id": exp_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Experimento no encontrado")

    variants_out = []
    for v in exp["variants"]:
        s = v.get("stats", {})
        views = s.get("views", 0) or 1
        leads = s.get("leads_generated", 0)
        citas = s.get("citas_agendadas", 0)
        cierres = s.get("cierres", 0)
        variants_out.append({
            "label": v["label"], "stats": s,
            "conversion_funnel": {
                "view_to_lead": round(100 * leads / views, 2),
                "lead_to_cita": round(100 * citas / max(leads, 1), 2),
                "cita_to_cierre": round(100 * cierres / max(citas, 1), 2),
                "view_to_cierre": round(100 * cierres / views, 2),
            },
        })

    # Determine winner: highest view_to_cierre with min sample size
    winner = None
    confidence = 0.0
    sortable = [v for v in variants_out if v["stats"].get("views", 0) >= 30]
    if len(sortable) >= 2:
        sortable.sort(key=lambda v: v["conversion_funnel"]["view_to_cierre"], reverse=True)
        top, second = sortable[0], sortable[1]
        if top["conversion_funnel"]["view_to_cierre"] > second["conversion_funnel"]["view_to_cierre"]:
            winner = top["label"]
            # Naive confidence: relative gap
            gap = top["conversion_funnel"]["view_to_cierre"] - second["conversion_funnel"]["view_to_cierre"]
            confidence = round(min(99.0, 50.0 + gap * 5), 1)

    await _safe_audit_ml(
        db, user, action="read", entity_type="pricing_experiment_results", entity_id=exp_id,
        request=request, ml_event="pricing_results_viewed",
        ml_context={"experiment_id": exp_id, "winner": winner},
    )
    return {
        "experiment_id": exp_id,
        "name": exp["name"], "type": exp["type"], "status": exp["status"],
        "variants": variants_out, "winner": winner, "confidence": confidence,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.21 · PDF REPORTS BRANDED + EMAIL AUTO
# ═════════════════════════════════════════════════════════════════════════════
class ReportSection(BaseModel):
    type: str  # cover|kpi_grid|units_table|absorption_chart|pricing_summary|team_perf|narrative_ai
    config: Dict[str, Any] = Field(default_factory=dict)


class ReportBranding(BaseModel):
    logo_url: Optional[str] = None
    primary_color: str = "#06080F"
    secondary_color: str = "#F0EBE0"
    header_text: Optional[str] = None
    footer_text: Optional[str] = None


class ReportTemplateInput(BaseModel):
    name: str
    type: str = Field(..., pattern=r"^(executive|marketing|financial|commercial)$")
    sections: List[ReportSection]
    branding: ReportBranding = Field(default_factory=ReportBranding)
    default: bool = False


@router.post("/api/dev/reports/templates")
async def create_report_template(payload: ReportTemplateInput, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Solo developer_admin")
    db = _db(request)
    now_iso = _now().isoformat()
    doc = {
        "id": _uid("rpt"),
        "dev_org_id": getattr(user, "tenant_id", None) or "default",
        "name": payload.name, "type": payload.type,
        "sections": [s.model_dump() for s in payload.sections],
        "branding": payload.branding.model_dump(),
        "default": payload.default,
        "created_by": user.user_id, "created_at": now_iso, "updated_at": now_iso,
    }
    await db.report_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/api/dev/reports/templates")
async def list_report_templates(request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {} if user.role == "superadmin" else {"dev_org_id": org}
    items = await db.report_templates.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


# ─── PDF Generation via ReportLab ────────────────────────────────────────────
async def _build_pdf(db, *, template: Dict, project_id: Optional[str], period_from: str, period_to: str) -> bytes:
    """Build branded PDF report using ReportLab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    )
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    branding = template.get("branding") or {}
    primary = HexColor(branding.get("primary_color", "#06080F"))
    secondary = HexColor(branding.get("secondary_color", "#F0EBE0"))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    eyebrow = ParagraphStyle("eyebrow", parent=styles["Normal"], textColor=colors.grey,
                             fontSize=9, fontName="Helvetica-Bold", spaceAfter=4)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=24, leading=28,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, leading=18,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=8)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10, leading=14,
                          textColor=colors.black, spaceAfter=8)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8,
                           textColor=colors.grey, spaceAfter=4)

    story: List = []

    # Resolve project
    project_name = "—"
    project: Optional[Dict] = None
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if project_id and d["id"] == project_id:
                project = d
                project_name = d.get("name", project_id)
                break
    except Exception:
        pass

    org_id = template.get("dev_org_id", "default")

    # Aggregated data (always loaded once)
    leads_q: Dict[str, Any] = {"created_at": {"$gte": period_from, "$lte": period_to}}
    if org_id != "default":
        leads_q["dev_org_id"] = org_id
    if project_id:
        leads_q["project_id"] = project_id
    leads = await db.leads.find(leads_q, {"_id": 0}).limit(5000).to_list(5000)
    appts_q: Dict[str, Any] = {"created_at": {"$gte": period_from, "$lte": period_to}}
    if org_id != "default":
        appts_q["dev_org_id"] = org_id
    if project_id:
        appts_q["project_id"] = project_id
    appts = await db.appointments.find(appts_q, {"_id": 0}).limit(5000).to_list(5000)

    total_leads = len(leads)
    total_citas = len(appts)
    closed_won = sum(1 for ld in leads if ld.get("status") == "cerrado_ganado")
    win_rate = round(100 * closed_won / max(total_leads, 1), 1)

    # Render sections
    for sec in template.get("sections") or []:
        stype = sec.get("type")

        if stype == "cover":
            story.append(Paragraph(branding.get("header_text") or "DesarrollosMX", eyebrow))
            story.append(Paragraph(template.get("name", "Reporte"), h1))
            story.append(Paragraph(f"<b>Proyecto:</b> {project_name}", body))
            story.append(Paragraph(f"<b>Período:</b> {period_from[:10]} → {period_to[:10]}", body))
            story.append(Spacer(1, 0.3 * inch))

        elif stype == "kpi_grid":
            story.append(Paragraph("INDICADORES CLAVE", eyebrow))
            story.append(Paragraph("Resumen ejecutivo del período", h2))
            data_kpi = [
                ["Leads totales", str(total_leads)],
                ["Citas registradas", str(total_citas)],
                ["Cierres ganados", str(closed_won)],
                ["Tasa de conversión (win rate)", f"{win_rate}%"],
            ]
            tbl = Table(data_kpi, colWidths=[3.2 * inch, 1.5 * inch])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), secondary),
                ("TEXTCOLOR", (0, 0), (-1, -1), primary),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.25 * inch))

        elif stype == "units_table":
            story.append(Paragraph("INVENTARIO", eyebrow))
            story.append(Paragraph("Estado de unidades", h2))
            units = (project or {}).get("units") or []
            if units:
                rows = [["Unidad", "Tipo", "Status", "Precio"]]
                for u in units[:30]:
                    rows.append([
                        str(u.get("id", "—"))[:18],
                        str(u.get("type", "—"))[:14],
                        str(u.get("status", "—"))[:14],
                        f"${(u.get('price') or 0)/1_000_000:.1f}M",
                    ])
                tbl = Table(rows, colWidths=[1.6 * inch, 1.4 * inch, 1.4 * inch, 1.2 * inch])
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), primary),
                    ("TEXTCOLOR", (0, 0), (-1, 0), secondary),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F8F8")]),
                ]))
                story.append(tbl)
            else:
                story.append(Paragraph("Sin inventario disponible", body))
            story.append(Spacer(1, 0.25 * inch))

        elif stype == "absorption_chart":
            story.append(Paragraph("ABSORCIÓN", eyebrow))
            story.append(Paragraph("Tendencia mensual de cierres", h2))
            from collections import Counter
            monthly = Counter()
            for ld in leads:
                if ld.get("status") == "cerrado_ganado":
                    try:
                        dt = datetime.fromisoformat((ld.get("updated_at") or "").replace("Z", "+00:00"))
                        monthly[f"{dt.year}-{dt.month:02d}"] += 1
                    except Exception:
                        pass
            if monthly:
                rows = [["Mes", "Cierres"]] + [[m, str(c)] for m, c in sorted(monthly.items())]
                tbl = Table(rows, colWidths=[2.0 * inch, 1.2 * inch])
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), primary),
                    ("TEXTCOLOR", (0, 0), (-1, 0), secondary),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ]))
                story.append(tbl)
            else:
                story.append(Paragraph("Sin cierres en el período", body))
            story.append(Spacer(1, 0.25 * inch))

        elif stype == "pricing_summary":
            story.append(Paragraph("PRICING EXPERIMENTS", eyebrow))
            story.append(Paragraph("Experimentos activos del período", h2))
            exps_q: Dict[str, Any] = {"dev_org_id": org_id, "status": {"$in": ["active", "completed"]}}
            if project_id:
                exps_q["project_id"] = project_id
            exps = await db.pricing_experiments.find(exps_q, {"_id": 0}).limit(20).to_list(20)
            if exps:
                rows = [["Nombre", "Tipo", "Status", "Variantes"]]
                for e in exps:
                    rows.append([str(e.get("name", "—"))[:24], e.get("type", "—"), e.get("status", "—"),
                                 str(len(e.get("variants", [])))])
                tbl = Table(rows, colWidths=[2.4 * inch, 1.2 * inch, 1.0 * inch, 0.9 * inch])
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), primary),
                    ("TEXTCOLOR", (0, 0), (-1, 0), secondary),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ]))
                story.append(tbl)
            else:
                story.append(Paragraph("Sin experimentos en el período", body))
            story.append(Spacer(1, 0.25 * inch))

        elif stype == "team_perf":
            story.append(Paragraph("EQUIPO", eyebrow))
            story.append(Paragraph("Performance por asesor", h2))
            from collections import defaultdict
            per_asesor = defaultdict(lambda: {"leads": 0, "wins": 0})
            for ld in leads:
                aid = ld.get("assigned_to") or "sin_asignar"
                per_asesor[aid]["leads"] += 1
                if ld.get("status") == "cerrado_ganado":
                    per_asesor[aid]["wins"] += 1
            uids = [u for u in per_asesor.keys() if u != "sin_asignar"]
            name_by_id = {}
            if uids:
                async for u in db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
                    name_by_id[u["user_id"]] = u.get("name") or u.get("email", "—")
            rows = [["Asesor", "Leads", "Cierres", "Win rate"]]
            sorted_a = sorted(per_asesor.items(), key=lambda x: -x[1]["leads"])[:15]
            for uid, st in sorted_a:
                name = name_by_id.get(uid, uid[:18])
                wr = round(100 * st["wins"] / max(st["leads"], 1), 1)
                rows.append([name[:22], str(st["leads"]), str(st["wins"]), f"{wr}%"])
            tbl = Table(rows, colWidths=[2.4 * inch, 0.9 * inch, 0.9 * inch, 0.9 * inch])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), primary),
                ("TEXTCOLOR", (0, 0), (-1, 0), secondary),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.25 * inch))

        elif stype == "narrative_ai":
            story.append(Paragraph("RESUMEN EJECUTIVO IA", eyebrow))
            story.append(Paragraph("Análisis Claude del período", h2))
            narrative = await _claude_narrative(
                project_name=project_name,
                kpis={"leads": total_leads, "citas": total_citas, "wins": closed_won, "win_rate": win_rate},
                period=f"{period_from[:10]} a {period_to[:10]}",
            )
            story.append(Paragraph(narrative, body))
            story.append(Spacer(1, 0.25 * inch))

    # Footer
    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(branding.get("footer_text") or
                           "Generado por DesarrollosMX · Reporte confidencial", small))

    doc.build(story)
    return buf.getvalue()


async def _claude_narrative(*, project_name: str, kpis: Dict, period: str) -> str:
    """Claude haiku narrative summary for executive section."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return (f"Durante {period} el proyecto {project_name} registró {kpis['leads']} leads totales, "
                f"{kpis['citas']} citas y {kpis['wins']} cierres ganados ({kpis['win_rate']}% conversión).")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key, session_id=f"narrative_{project_name}_{period}",
            system_message=(
                "Eres analista senior inmobiliario en México. Genera un resumen ejecutivo de máximo 200 palabras "
                "para un reporte branded en español. Tono: profesional, accionable, sin tecnicismos. "
                "Usa los KPIs provistos. NO menciones que eres una IA."
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        msg = UserMessage(text=(
            f"Proyecto: {project_name}. Período: {period}. "
            f"KPIs: {json.dumps(kpis)}. Genera el resumen ejecutivo."
        ))
        text = await chat.send_message(msg)
        return (text or "")[:1500]
    except Exception as e:
        log.warning(f"[batch5] claude narrative failed: {e}")
        return (f"Durante {period} el proyecto {project_name} registró {kpis['leads']} leads totales, "
                f"{kpis['citas']} citas y {kpis['wins']} cierres ganados ({kpis['win_rate']}% conversión).")


class ReportGenerateInput(BaseModel):
    template_id: str
    project_id: Optional[str] = None
    period_from: str
    period_to: str


@router.post("/api/dev/reports/generate")
async def generate_report(payload: ReportGenerateInput, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    template = await db.report_templates.find_one({"id": payload.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(404, "Template no encontrado")

    pdf_bytes = await _build_pdf(
        db, template=template, project_id=payload.project_id,
        period_from=payload.period_from, period_to=payload.period_to,
    )

    # Persist as base64 in MongoDB (small reports only — no GridFS to keep dependency footprint low)
    file_id = _uid("rfile")
    await db.report_files.insert_one({
        "id": file_id, "template_id": payload.template_id, "project_id": payload.project_id,
        "size_kb": round(len(pdf_bytes) / 1024, 1),
        "content_b64": base64.b64encode(pdf_bytes).decode(),
        "created_by": user.user_id, "created_at": _now().isoformat(),
        "dev_org_id": getattr(user, "tenant_id", None) or "default",
    })
    await _safe_audit_ml(
        db, user, action="create", entity_type="report_file", entity_id=file_id,
        request=request, ml_event="report_generated",
        ml_context={"template_id": payload.template_id, "project_id": payload.project_id, "size_kb": round(len(pdf_bytes) / 1024, 1)},
    )
    return {"file_id": file_id, "size_kb": round(len(pdf_bytes) / 1024, 1),
            "download_url": f"/api/dev/reports/files/{file_id}"}


@router.get("/api/dev/reports/files/{file_id}")
async def download_report(file_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    f = await db.report_files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Archivo no encontrado")
    pdf = base64.b64decode(f["content_b64"])
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="report-{file_id}.pdf"'})


# ─── Distributions ───────────────────────────────────────────────────────────
class DistributionRecipient(BaseModel):
    email: str
    name: Optional[str] = None
    role: Optional[str] = Field(None, pattern=r"^(investor|partner|team)$")


class DistributionInput(BaseModel):
    template_id: str
    project_id: Optional[str] = None
    frequency: str = Field(..., pattern=r"^(weekly|monthly|quarterly)$")
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=28)
    recipients: List[DistributionRecipient]


def _next_scheduled(frequency: str, day_of_week: Optional[int], day_of_month: Optional[int]) -> str:
    now = _now()
    if frequency == "weekly":
        target_dow = day_of_week if day_of_week is not None else 0
        days_until = (target_dow - now.weekday()) % 7 or 7
        nxt = now + timedelta(days=days_until)
    elif frequency == "monthly":
        target_dom = day_of_month if day_of_month is not None else 1
        if now.day < target_dom:
            nxt = now.replace(day=target_dom)
        else:
            month = now.month + 1 if now.month < 12 else 1
            year = now.year if now.month < 12 else now.year + 1
            nxt = now.replace(year=year, month=month, day=target_dom)
    else:  # quarterly
        nxt = now + timedelta(days=90)
    return nxt.replace(hour=8, minute=0, second=0, microsecond=0).isoformat()


@router.post("/api/dev/reports/distributions")
async def create_distribution(payload: DistributionInput, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Solo developer_admin")
    db = _db(request)
    doc = {
        "id": _uid("dist"),
        "dev_org_id": getattr(user, "tenant_id", None) or "default",
        "template_id": payload.template_id, "project_id": payload.project_id,
        "schedule": {"frequency": payload.frequency, "day_of_week": payload.day_of_week,
                     "day_of_month": payload.day_of_month},
        "recipients": [r.model_dump() for r in payload.recipients],
        "status": "active",
        "last_sent_at": None,
        "next_scheduled_at": _next_scheduled(payload.frequency, payload.day_of_week, payload.day_of_month),
        "created_by": user.user_id, "created_at": _now().isoformat(),
    }
    await db.report_distributions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/api/dev/reports/distributions")
async def list_distributions(request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {} if user.role == "superadmin" else {"dev_org_id": org}
    items = await db.report_distributions.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items}


@router.patch("/api/dev/reports/distributions/{dist_id}")
async def patch_distribution(dist_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Solo developer_admin")
    body = await request.json()
    db = _db(request)
    update = {}
    if "status" in body and body["status"] in ("active", "paused"):
        update["status"] = body["status"]
    if not update:
        raise HTTPException(422, "Nada que actualizar")
    update["updated_at"] = _now().isoformat()
    r = await db.report_distributions.update_one({"id": dist_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Distribución no encontrada")
    return {"ok": True, **update}


# ─── Distribution scheduler ──────────────────────────────────────────────────
async def check_pending_distributions(db) -> Dict[str, int]:
    """Daily 8am job — process distributions due."""
    now_iso = _now().isoformat()
    pending = await db.report_distributions.find(
        {"status": "active", "next_scheduled_at": {"$lte": now_iso}}, {"_id": 0}
    ).to_list(100)
    sent, errors = 0, 0
    for dist in pending:
        try:
            template = await db.report_templates.find_one({"id": dist["template_id"]}, {"_id": 0})
            if not template:
                continue
            period_to_dt = _now()
            period_from_dt = period_to_dt - timedelta(days=30 if dist["schedule"]["frequency"] == "monthly" else
                                                       7 if dist["schedule"]["frequency"] == "weekly" else 90)
            pdf = await _build_pdf(db, template=template, project_id=dist.get("project_id"),
                                   period_from=period_from_dt.isoformat(),
                                   period_to=period_to_dt.isoformat())
            file_id = _uid("rfile")
            await db.report_files.insert_one({
                "id": file_id, "template_id": dist["template_id"], "project_id": dist.get("project_id"),
                "size_kb": round(len(pdf) / 1024, 1), "content_b64": base64.b64encode(pdf).decode(),
                "created_by": "system", "created_at": _now().isoformat(),
                "dev_org_id": dist.get("dev_org_id", "default"),
            })

            # Email via Resend
            resend_key = os.environ.get("RESEND_API_KEY", "")
            if resend_key:
                try:
                    import resend
                    resend.api_key = resend_key
                    for r in dist.get("recipients", []):
                        resend.Emails.send({
                            "from": "reportes@desarrollosmx.com",
                            "to": [r["email"]],
                            "subject": f"Reporte {template['name']} · {period_to_dt.strftime('%b %Y')}",
                            "html": (f"<p>Hola {r.get('name', 'estimado')},</p>"
                                     f"<p>Adjuntamos el reporte <strong>{template['name']}</strong> "
                                     f"correspondiente al período {period_from_dt.strftime('%d/%m/%Y')} – "
                                     f"{period_to_dt.strftime('%d/%m/%Y')}.</p>"
                                     f"<p>— Equipo DesarrollosMX</p>"),
                            "attachments": [{
                                "filename": f"reporte-{template['name'].lower().replace(' ', '-')}.pdf",
                                "content": base64.b64encode(pdf).decode(),
                            }],
                        })
                except Exception as ee:
                    log.warning(f"[batch5] resend send failed: {ee}")

            # Update distribution
            await db.report_distributions.update_one({"id": dist["id"]}, {"$set": {
                "last_sent_at": _now().isoformat(),
                "next_scheduled_at": _next_scheduled(
                    dist["schedule"]["frequency"],
                    dist["schedule"].get("day_of_week"),
                    dist["schedule"].get("day_of_month"),
                ),
            }})
            sent += 1
        except Exception as e:
            log.warning(f"[batch5] distribution failed dist={dist.get('id')}: {e}")
            errors += 1
    summary = {"checked": len(pending), "sent": sent, "errors": errors}
    log.info(f"[batch5] distribution run: {summary}")
    return summary


# ═════════════════════════════════════════════════════════════════════════════
# Indexes + scheduler hook
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_batch5_indexes(db) -> None:
    await db.pricing_experiments.create_index([("dev_org_id", 1), ("status", 1)], background=True)
    await db.pricing_experiments.create_index([("project_id", 1), ("status", 1)], background=True)
    await db.pricing_visitor_assignments.create_index(
        [("visitor_id", 1), ("experiment_id", 1)], unique=True, background=True
    )
    await db.pricing_visitor_assignments.create_index([("experiment_id", 1), ("assigned_at", 1)], background=True)
    await db.report_templates.create_index([("dev_org_id", 1), ("type", 1)], background=True)
    await db.report_distributions.create_index([("dev_org_id", 1), ("status", 1)], background=True)
    await db.report_distributions.create_index([("next_scheduled_at", 1)], background=True)
    log.info("[batch5] indexes ensured")


def register_batch5_jobs(scheduler, db):
    """Daily 8am: process due distributions."""
    from apscheduler.triggers.cron import CronTrigger
    TZ = "America/Mexico_City"
    scheduler.add_job(
        check_pending_distributions, CronTrigger(hour=8, minute=0, timezone=TZ),
        args=[db], id="report_distributions_daily", replace_existing=True,
        misfire_grace_time=600,
    )
    log.info("[batch5] distributions cron job registered")
