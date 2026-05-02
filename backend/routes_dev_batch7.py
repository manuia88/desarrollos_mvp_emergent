"""Phase 4 Batch 7 — Site Selection AI (4.22).

Standalone analytical engine that ranks candidate zones (CDMX colonias)
for a hypothetical new development based on developer inputs (criteria + budget).

Pipeline:
  1. POST /studies        → status=draft (validate inputs)
  2. POST /studies/:id/run → status=running, asyncio.create_task(engine)
  3. engine                → filter zones, score sub-dimensions, Claude haiku
                             narrative + pros/cons, persist candidate_zones
  4. status=completed
  5. POST /studies/:id/export-pdf  → ReportLab PDF (reuses B5 patterns)
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.batch7")
router = APIRouter(tags=["batch7"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _uid(prefix: str = "ss") -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _is_dev_admin(user) -> bool:
    if user.role == "superadmin":
        return True
    if user.role in ("developer_admin", "developer_director"):
        return True
    if getattr(user, "internal_role", None) in ("admin", "commercial_director"):
        return True
    return False


async def _safe_audit_ml(
    db, actor, *, action: str, entity_type: str, entity_id: str,
    request: Optional[Request] = None,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, None, None, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or "system"
            role = getattr(actor, "role", None) or "system"
            org = getattr(actor, "tenant_id", None) or "dmx"
            await emit_ml_event(db, event_type=ml_event, user_id=uid, org_id=org, role=role,
                                context=ml_context or {}, ai_decision={}, user_action={})
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────
PROJECT_TYPES = {"residencial_vertical", "residencial_horizontal", "mixto", "comercial"}
TARGET_SEGMENTS = {"NSE_AB", "NSE_C+", "NSE_C", "NSE_D"}
KNOWN_FEATURES = {
    "metro_proximity", "school_district", "green_areas", "commercial_corridor",
    "low_density", "premium_amenities", "flood_risk", "high_density",
    "construction_zone", "noise_pollution",
}


class UnitSizeRange(BaseModel):
    min_m2: int = Field(..., ge=20, le=2000)
    max_m2: int = Field(..., ge=20, le=2000)


class PriceRange(BaseModel):
    min: int = Field(..., ge=0)
    max: int = Field(..., ge=0)


class StudyInputs(BaseModel):
    project_type: str
    target_segment: str
    unit_size_range: UnitSizeRange
    price_range_per_m2: PriceRange
    total_units_target: int = Field(..., ge=1, le=10000)
    budget_construction: int = Field(..., ge=0)
    preferred_states: List[str] = Field(default_factory=lambda: ["CDMX"])
    preferred_features: List[str] = Field(default_factory=list)
    avoid_features: List[str] = Field(default_factory=list)

    @field_validator("project_type")
    @classmethod
    def _val_pt(cls, v):
        if v not in PROJECT_TYPES:
            raise ValueError(f"project_type inválido. Debe ser uno de {sorted(PROJECT_TYPES)}")
        return v

    @field_validator("target_segment")
    @classmethod
    def _val_seg(cls, v):
        if v not in TARGET_SEGMENTS:
            raise ValueError(f"target_segment inválido. Debe ser uno de {sorted(TARGET_SEGMENTS)}")
        return v


class CreateStudyPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    inputs: StudyInputs


# ─────────────────────────────────────────────────────────────────────────────
# Engine — sub-score helpers
# ─────────────────────────────────────────────────────────────────────────────
def _bbox_from_polygon(polygon: List[List[float]]) -> Dict[str, float]:
    lngs = [p[0] for p in polygon]
    lats = [p[1] for p in polygon]
    return {"ne_lat": max(lats), "ne_lng": max(lngs), "sw_lat": min(lats), "sw_lng": min(lngs)}


def _segment_to_band(segment: str) -> tuple[int, int]:
    """Reasonable default price-per-m2 (MXN, thousands) for each NSE segment."""
    return {
        "NSE_AB": (90_000, 200_000),
        "NSE_C+": (55_000, 95_000),
        "NSE_C":  (30_000, 60_000),
        "NSE_D":  (15_000, 35_000),
    }.get(segment, (30_000, 60_000))


def _score_price_match(zone_price: int, target_min: int, target_max: int) -> float:
    if zone_price <= 0 or target_max <= 0:
        return 50.0
    band_mid = (target_min + target_max) / 2.0
    band_half = max((target_max - target_min) / 2.0, 1.0)
    delta = abs(zone_price - band_mid) / band_half
    if delta <= 1.0:
        return round(100 - delta * 25, 1)
    if delta <= 2.0:
        return round(75 - (delta - 1) * 35, 1)
    return max(round(40 - (delta - 2) * 12, 1), 5.0)


def _score_competition(existing_count: int, target_units: int) -> float:
    if existing_count <= 0:
        return 95.0
    if existing_count <= 2:
        return 80.0
    if existing_count <= 5:
        return 60.0
    if existing_count <= 8:
        return 40.0
    return 20.0


def _score_infrastructure(scores: Dict[str, int], features_pref: List[str]) -> float:
    base = (scores.get("movilidad", 50) + scores.get("comercio", 50) +
            scores.get("educacion", 50)) / 3.0
    bonus = 0
    if "metro_proximity" in features_pref and scores.get("movilidad", 0) >= 80:
        bonus += 4
    if "school_district" in features_pref and scores.get("educacion", 0) >= 80:
        bonus += 3
    if "green_areas" in features_pref and scores.get("vida", 0) >= 80:
        bonus += 3
    return min(round(base + bonus, 1), 100.0)


def _score_risk(scores: Dict[str, int], avoid: List[str]) -> float:
    base = (scores.get("seguridad", 50) + scores.get("riesgo", 50)) / 2.0
    penalty = 0
    inv = 100 - scores.get("riesgo", 50)
    if "flood_risk" in avoid and inv > 30:
        penalty += 12
    if "high_density" in avoid and scores.get("vida", 100) < 70:
        penalty += 8
    if "noise_pollution" in avoid and scores.get("vida", 100) < 75:
        penalty += 5
    return max(round(base - penalty, 1), 5.0)


def _score_market_demand(leads_count: int, demand_score: float) -> float:
    """Combine raw lead density with normalized demand_score from heatmap."""
    leads_norm = min(leads_count * 6, 60)
    return round(min(leads_norm + demand_score * 0.4, 100.0), 1)


def _score_absorption(existing_count: int, leads_count: int) -> float:
    if existing_count == 0:
        return min(round(40 + leads_count * 4, 1), 95.0)
    return min(round(50 + (leads_count / max(existing_count, 1)) * 12, 1), 95.0)


def _estimate_units(price_min: int, price_max: int, zone_price: int, total_target: int) -> int:
    """Conservative estimate: scale target by how affordable the zone is vs target."""
    band_mid = (price_min + price_max) / 2.0 or 1.0
    if zone_price <= band_mid:
        return total_target
    ratio = band_mid / max(zone_price, 1)
    return max(int(total_target * ratio), max(int(total_target * 0.4), 4))


def _estimate_roi_5y(price_match: float, market_demand: float, plusvalia_score: int) -> float:
    """Heuristic 5y ROI = base 15% + signals."""
    base = 15.0
    base += (market_demand - 50) * 0.12
    base += (plusvalia_score - 50) * 0.18
    base += (price_match - 50) * 0.06
    return round(max(min(base, 65.0), -10.0), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Claude haiku — narrative + pros/cons
# ─────────────────────────────────────────────────────────────────────────────
async def _claude_zone_narrative(
    *, zone: Dict, sub_scores: Dict, data_points: Dict, inputs: StudyInputs,
) -> Dict[str, Any]:
    fallback = {
        "narrative": (f"{zone['name']} obtiene feasibility {sub_scores['feasibility_score']}/100 "
                      f"con demanda {sub_scores['market_demand']:.0f} y match de precio "
                      f"{sub_scores['price_match']:.0f}. La competencia local es de "
                      f"{int(data_points['existing_projects_count'])} proyectos."),
        "pros": [
            f"Score IE promedio {data_points['ie_score_avg']:.0f}/100",
            f"Precio mercado ${data_points['avg_price_per_m2']:,}/m²",
            f"Demand score B6 {data_points['demand_score']:.0f}/100",
        ],
        "cons": [
            f"{int(data_points['existing_projects_count'])} proyectos en competencia",
            f"Riesgo {100 - sub_scores['risk_factors']:.0f}/100",
        ],
    }
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key, session_id=f"site_sel_{zone['id']}",
            system_message=(
                "Eres consultor inmobiliario senior en LATAM con 20 años de experiencia. "
                "Genera un análisis honesto, sin jerga, sin emojis. "
                "Responde JSON válido SIN markdown: "
                '{"narrative": "200-300 chars", "pros": ["str", "str", "str"], "cons": ["str", "str"]}. '
                "Pros: 3-5 bullets concretos. Cons: 2-4 bullets honestos. Tono profesional es-MX."
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        prompt = (
            f"Zona: {zone['name']} ({zone.get('alcaldia', '')}, CDMX).\n"
            f"Criterios del developer: tipo={inputs.project_type}, segmento={inputs.target_segment}, "
            f"presupuesto MXN {inputs.budget_construction:,}, target {inputs.total_units_target} unidades, "
            f"precio objetivo {inputs.price_range_per_m2.min:,}-{inputs.price_range_per_m2.max:,}/m².\n"
            f"Sub-scores: {json.dumps(sub_scores, ensure_ascii=False)}\n"
            f"Data points: {json.dumps(data_points, ensure_ascii=False)}\n"
            "Genera evaluación específica para esta combinación."
        )
        msg = UserMessage(text=prompt)
        raw = await chat.send_message(msg)
        text = (raw or "").strip()
        if text.startswith("```"):
            import re
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        data = json.loads(text)
        narrative = str(data.get("narrative") or fallback["narrative"])[:320]
        pros = [str(p)[:140] for p in (data.get("pros") or fallback["pros"])][:5]
        cons = [str(c)[:140] for c in (data.get("cons") or fallback["cons"])][:4]
        return {"narrative": narrative, "pros": pros, "cons": cons}
    except Exception as e:
        log.warning(f"[batch7] claude narrative failed for {zone['id']}: {e}")
        return fallback


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────
async def _candidate_zones(db, inputs: StudyInputs) -> List[Dict]:
    from data_seed import COLONIAS
    from data_developments import DEVELOPMENTS

    # Aggregate competition + lead density
    existing_by_colonia: Dict[str, int] = {}
    for d in DEVELOPMENTS:
        cid = d.get("colonia_id")
        if cid:
            existing_by_colonia[cid] = existing_by_colonia.get(cid, 0) + 1

    # Lead density per colonia (last 90 days)
    leads_by_colonia: Dict[str, int] = {}
    project_to_colonia = {d["id"]: d.get("colonia_id") for d in DEVELOPMENTS}
    try:
        leads = await db.leads.find({}, {"_id": 0, "project_id": 1}).limit(10000).to_list(10000)
        for ld in leads:
            cid = project_to_colonia.get(ld.get("project_id"))
            if cid:
                leads_by_colonia[cid] = leads_by_colonia.get(cid, 0) + 1
    except Exception:
        pass

    # Aggregated IE scores avg per colonia
    ie_avg_by_colonia: Dict[str, float] = {}
    try:
        async for s in db.ie_scores.find({"scope": "colonia"}, {"_id": 0, "entity_id": 1, "value": 1}):
            cid = s.get("entity_id")
            v = s.get("value")
            if cid and isinstance(v, (int, float)):
                if cid not in ie_avg_by_colonia:
                    ie_avg_by_colonia[cid] = v
                else:
                    ie_avg_by_colonia[cid] = (ie_avg_by_colonia[cid] + v) / 2.0
    except Exception:
        pass

    target_min, target_max = inputs.price_range_per_m2.min, inputs.price_range_per_m2.max
    seg_min, seg_max = _segment_to_band(inputs.target_segment)
    pref = inputs.preferred_features or []
    avoid = inputs.avoid_features or []

    zones = []
    for col in COLONIAS:
        zone_price = col.get("price_m2_num", 50_000)
        existing = existing_by_colonia.get(col["id"], 0)
        leads_count = leads_by_colonia.get(col["id"], 0)
        scores = col.get("scores", {}) or {}
        ie_avg = ie_avg_by_colonia.get(col["id"], 60.0)

        # Demand_score (use simple proxy: leads*4 + scores comercio bonus, normalized 0-100)
        demand_proxy = min(leads_count * 8 + scores.get("comercio", 50) * 0.4, 100.0)

        sub = {
            "market_demand": _score_market_demand(leads_count, demand_proxy),
            "price_match": _score_price_match(zone_price, target_min, target_max),
            "competition": _score_competition(existing, inputs.total_units_target),
            "infrastructure": _score_infrastructure(scores, pref),
            "absorption_potential": _score_absorption(existing, leads_count),
            "risk_factors": _score_risk(scores, avoid),
        }
        feasibility = round(sum(sub.values()) / len(sub), 1)
        sub_with_total = {**sub, "feasibility_score": feasibility}

        # Drop zones whose price is wildly outside segment (graceful filter)
        if zone_price < seg_min * 0.4 or zone_price > seg_max * 2.4:
            continue

        data_points = {
            "avg_price_per_m2": zone_price,
            "existing_projects_count": existing,
            "absorption_rate_12m": min(round(leads_count * 1.5, 1), 95.0),
            "demographic_match_pct": round(60 + (scores.get("plusvalia", 50) - 50) * 0.5, 1),
            "ie_score_avg": round(ie_avg, 1),
            "demand_score": round(demand_proxy, 1),
        }

        zones.append({
            "_zone_meta": col,
            "sub_scores": sub,
            "feasibility_score": feasibility,
            "data_points": data_points,
            "_inputs_for_claude": sub_with_total,
        })

    # Top 10 by feasibility
    zones.sort(key=lambda z: -z["feasibility_score"])
    return zones[:10]


async def _run_engine(db, study_id: str, inputs: StudyInputs) -> None:
    """Background engine: filter+score+Claude+persist. Status flips to completed/failed."""
    started = _now_iso()
    try:
        candidates = await _candidate_zones(db, inputs)
        out_zones: List[Dict] = []
        for z in candidates:
            col = z["_zone_meta"]
            narrative = await _claude_zone_narrative(
                zone=col, sub_scores=z["_inputs_for_claude"],
                data_points=z["data_points"], inputs=inputs,
            )
            target_units = _estimate_units(
                inputs.price_range_per_m2.min, inputs.price_range_per_m2.max,
                col.get("price_m2_num", 50_000), inputs.total_units_target,
            )
            roi5 = _estimate_roi_5y(
                z["sub_scores"]["price_match"], z["sub_scores"]["market_demand"],
                col.get("scores", {}).get("plusvalia", 50),
            )
            target_price_min = int(col.get("price_m2_num", 50_000) * 0.92)
            target_price_max = int(col.get("price_m2_num", 50_000) * 1.08)

            out_zones.append({
                "colonia": col["name"],
                "colonia_id": col["id"],
                "cp": col.get("cp", "—"),
                "state": "CDMX",
                "alcaldia": col.get("alcaldia"),
                "center": col.get("center"),
                "polygon": col.get("polygon"),
                "bbox": _bbox_from_polygon(col.get("polygon") or []),
                "feasibility_score": z["feasibility_score"],
                "sub_scores": z["sub_scores"],
                "narrative": narrative["narrative"],
                "data_points": z["data_points"],
                "pros": narrative["pros"],
                "cons": narrative["cons"],
                "target_units_estimate": target_units,
                "target_price_range": {"min": target_price_min, "max": target_price_max},
                "estimated_roi_5y": roi5,
            })

        await db.site_selection_studies.update_one(
            {"id": study_id},
            {"$set": {
                "status": "completed",
                "candidate_zones": out_zones,
                "completed_at": _now_iso(),
                "engine_started_at": started,
                "error_message": None,
            }},
        )
    except Exception as e:
        log.error(f"[batch7] engine failed for {study_id}: {e}", exc_info=True)
        await db.site_selection_studies.update_one(
            {"id": study_id},
            {"$set": {
                "status": "failed", "error_message": str(e)[:480],
                "engine_started_at": started, "failed_at": _now_iso(),
            }},
        )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/api/dev/site-selection/studies", status_code=201)
async def create_study(payload: CreateStudyPayload, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    sid = _uid("ssel")
    doc = {
        "id": sid, "dev_org_id": org, "name": payload.name,
        "status": "draft",
        "inputs": payload.inputs.model_dump(),
        "candidate_zones": [],
        "created_by": getattr(user, "user_id", None),
        "created_by_email": getattr(user, "email", None),
        "created_at": _now_iso(),
        "completed_at": None,
        "error_message": None,
    }
    await db.site_selection_studies.insert_one(doc)
    await _safe_audit_ml(
        db, user, action="create", entity_type="site_selection_study", entity_id=sid,
        request=request, ml_event="site_selection_study_created",
        ml_context={"study_id": sid, "name": payload.name, "project_type": payload.inputs.project_type},
    )
    doc.pop("_id", None)
    return doc


@router.post("/api/dev/site-selection/studies/{study_id}/run")
async def run_study(study_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q = {"id": study_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    study = await db.site_selection_studies.find_one(q, {"_id": 0})
    if not study:
        raise HTTPException(404, "Estudio no encontrado")
    if study["status"] == "running":
        return {"ok": True, "status": "running", "message": "Ya está en ejecución"}
    if study["status"] == "completed":
        return {"ok": True, "status": "completed", "message": "Ya completado. Crea un nuevo estudio para re-ejecutar."}

    try:
        inputs = StudyInputs(**(study.get("inputs") or {}))
    except Exception as e:
        raise HTTPException(422, f"Inputs inválidos: {e}")

    await db.site_selection_studies.update_one(
        {"id": study_id}, {"$set": {"status": "running", "engine_started_at": _now_iso()}},
    )
    asyncio.create_task(_run_engine(db, study_id, inputs))
    await _safe_audit_ml(
        db, user, action="update", entity_type="site_selection_study", entity_id=study_id,
        request=request, ml_event="site_selection_run_started",
        ml_context={"study_id": study_id},
    )
    return {"ok": True, "status": "running", "study_id": study_id, "eta_seconds": 60}


@router.get("/api/dev/site-selection/studies")
async def list_studies(request: Request, status: Optional[str] = None):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {} if user.role == "superadmin" else {"dev_org_id": org}
    if status:
        q["status"] = status
    items = await db.site_selection_studies.find(q, {"_id": 0, "candidate_zones": 0}).sort("created_at", -1).to_list(200)
    return {"items": items, "total": len(items)}


@router.get("/api/dev/site-selection/studies/{study_id}")
async def get_study(study_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q = {"id": study_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    study = await db.site_selection_studies.find_one(q, {"_id": 0})
    if not study:
        raise HTTPException(404, "Estudio no encontrado")
    return study


# ─────────────────────────────────────────────────────────────────────────────
# PDF Export (reuses ReportLab patterns from B5)
# ─────────────────────────────────────────────────────────────────────────────
def _build_study_pdf(study: Dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    primary = HexColor("#06080F")
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
                          textColor=colors.black, spaceAfter=6)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8,
                           textColor=colors.grey, spaceAfter=4)

    inputs = study.get("inputs") or {}
    story: List = []
    story.append(Paragraph("DESARROLLOSMX · SITE SELECTION AI", eyebrow))
    story.append(Paragraph(study.get("name", "Estudio"), h1))
    story.append(Paragraph(f"Generado: {study.get('completed_at', '')[:19]}", small))
    story.append(Spacer(1, 0.18 * inch))

    # Inputs summary
    story.append(Paragraph("CRITERIOS DEL ESTUDIO", eyebrow))
    psize = inputs.get("unit_size_range") or {}
    pprice = inputs.get("price_range_per_m2") or {}
    inputs_table = [
        ["Tipo de proyecto", inputs.get("project_type", "—")],
        ["Segmento target", inputs.get("target_segment", "—")],
        ["Tamaño unidad m²", f"{psize.get('min_m2', '—')}–{psize.get('max_m2', '—')}"],
        ["Precio m² target", f"${pprice.get('min', 0):,}–${pprice.get('max', 0):,} MXN"],
        ["Total unidades target", str(inputs.get("total_units_target", "—"))],
        ["Presupuesto construcción", f"${inputs.get('budget_construction', 0):,} MXN"],
        ["Estados preferidos", ", ".join(inputs.get("preferred_states") or [])],
        ["Features deseadas", ", ".join(inputs.get("preferred_features") or []) or "—"],
        ["Features a evitar", ", ".join(inputs.get("avoid_features") or []) or "—"],
    ]
    t = Table(inputs_table, colWidths=[2.4 * inch, 4.4 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#F0EBE0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.25 * inch))

    # Top zones ranking
    story.append(Paragraph("RANKING DE ZONAS CANDIDATAS", eyebrow))
    story.append(Paragraph(f"{len(study.get('candidate_zones') or [])} zonas evaluadas", body))
    story.append(Spacer(1, 0.1 * inch))
    rank_rows = [["#", "Zona", "Feasibility", "Demanda", "Precio", "Competencia", "ROI 5y"]]
    for idx, z in enumerate(study.get("candidate_zones") or [], 1):
        sub = z.get("sub_scores", {})
        rank_rows.append([
            str(idx), z.get("colonia", "—"), f"{z.get('feasibility_score', 0)}",
            f"{sub.get('market_demand', 0)}", f"{sub.get('price_match', 0)}",
            f"{sub.get('competition', 0)}", f"{z.get('estimated_roi_5y', 0)}%",
        ])
    rt = Table(rank_rows, colWidths=[0.4 * inch, 1.9 * inch, 0.95 * inch, 0.85 * inch,
                                     0.85 * inch, 1.1 * inch, 0.9 * inch])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.lightgrey),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(rt)
    story.append(PageBreak())

    # Detail per zone (top 5)
    for idx, z in enumerate(study.get("candidate_zones") or [], 1):
        if idx > 5:
            break
        story.append(Paragraph(f"#{idx} · {z.get('colonia')}", h2))
        story.append(Paragraph(f"<b>Feasibility:</b> {z.get('feasibility_score')} / 100 · "
                               f"<b>ROI 5y est.:</b> {z.get('estimated_roi_5y')}% · "
                               f"<b>Unidades est.:</b> {z.get('target_units_estimate')}", body))
        story.append(Paragraph(z.get("narrative") or "—", body))
        if z.get("pros"):
            story.append(Paragraph("<b>Pros</b>", body))
            for p in z["pros"]:
                story.append(Paragraph(f"• {p}", small))
        if z.get("cons"):
            story.append(Paragraph("<b>Cons</b>", body))
            for c in z["cons"]:
                story.append(Paragraph(f"• {c}", small))
        story.append(Spacer(1, 0.18 * inch))

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Generado por DesarrollosMX Site Selection AI · Claude haiku-4-5",
                           small))
    doc.build(story)
    return buf.getvalue()


@router.post("/api/dev/site-selection/studies/{study_id}/export-pdf")
async def export_study_pdf(study_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q = {"id": study_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    study = await db.site_selection_studies.find_one(q, {"_id": 0})
    if not study:
        raise HTTPException(404, "Estudio no encontrado")
    if study.get("status") != "completed":
        raise HTTPException(409, "El estudio no está completado")

    pdf_bytes = _build_study_pdf(study)
    file_id = _uid("sselpdf")
    await db.site_selection_files.insert_one({
        "id": file_id, "study_id": study_id, "dev_org_id": org,
        "size_bytes": len(pdf_bytes),
        "pdf_b64": base64.b64encode(pdf_bytes).decode("ascii"),
        "created_at": _now_iso(),
    })
    await _safe_audit_ml(
        db, user, action="export", entity_type="site_selection_study", entity_id=study_id,
        request=request, ml_event="site_selection_exported",
        ml_context={"study_id": study_id, "file_id": file_id, "size_kb": round(len(pdf_bytes) / 1024, 1)},
    )
    return {"file_id": file_id, "size_kb": round(len(pdf_bytes) / 1024, 1),
            "download_url": f"/api/dev/site-selection/files/{file_id}"}


@router.get("/api/dev/site-selection/files/{file_id}")
async def download_study_pdf(file_id: str, request: Request):
    user = await _auth(request)
    if not _is_dev_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q = {"id": file_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    f = await db.site_selection_files.find_one(q, {"_id": 0})
    if not f:
        raise HTTPException(404, "Archivo no encontrado")
    pdf = base64.b64decode(f["pdf_b64"])
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="site-selection-{file_id}.pdf"'})


# ─────────────────────────────────────────────────────────────────────────────
# Indexes
# ─────────────────────────────────────────────────────────────────────────────
async def ensure_batch7_indexes(db) -> None:
    try:
        await db.site_selection_studies.create_index([("id", 1)], unique=True, background=True)
        await db.site_selection_studies.create_index([("dev_org_id", 1), ("status", 1), ("created_at", -1)], background=True)
        await db.site_selection_files.create_index([("id", 1)], unique=True, background=True)
        await db.site_selection_files.create_index([("study_id", 1), ("created_at", -1)], background=True)
    except Exception:
        pass
    log.info("[batch7] indexes ensured")
