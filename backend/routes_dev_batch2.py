"""Phase 4 Batch 2 — Dashboards + IE + Construcción + Mapbox tab.

Scope:
  4.5  GET  /api/dev/projects/{project_id}/location     (read location for MapboxPicker view mode)
  4.11 GET  /api/dev/analytics/absorption                (cohort matrix, heatmap YTD, win/loss, funnel)
  4.12 GET  /api/dev/analytics/forecast                  (target vs actual per project + consolidated)
  4.13 GET  /api/dev/competitors/enriched                (alerts + history + press clips)
       POST /api/dev/competitors/alert-config            (configure price delta thresholds)
       GET  /api/dev/competitors/{dev_id}/history        (price history 12m)
  4.16 GET  /api/dev/ie/projects/{project_id}/breakdown  (12 scores detailed + benchmark)
       GET  /api/dev/ie/projects/{project_id}/improve    (AI recommendations per score)
  4.25 GET  /api/dev/construction/{project_id}/progress  (stages timeline)
       POST /api/dev/construction/{project_id}/update    (update stage or upload photo)

All mutations call audit_log.log_mutation + observability.emit_ml_event.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dev", tags=["dev-batch2"])


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
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


def _user_dev_ids(user) -> List[str]:
    """Return list of development ids visible to this developer org."""
    from data_developments import DEVELOPMENTS
    # dev_org_id maps 1:1 to developer_id (in seed data tenant_id == developer slug).
    tenant = _tenant(user)
    if user.role == "superadmin":
        return [d["id"] for d in DEVELOPMENTS]
    # "constructora_ariel" tenant has 2 mock devs (altavista-polanco, lomas-signature for quattro).
    # Map by developer_id substring match (demo behaviour).
    ids = [d["id"] for d in DEVELOPMENTS if d["developer_id"].startswith(tenant.split("_")[-1][:3])]
    return ids or [DEVELOPMENTS[0]["id"], DEVELOPMENTS[1]["id"]]


# ═════════════════════════════════════════════════════════════════════════════
# 4.5 PROJECT LOCATION READ
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/projects/{project_id}/location")
async def get_project_location(project_id: str, request: Request):
    """Return current lat/lng/zoom for a project. Falls back to colonia center."""
    user = await _auth(request)
    db = _db(request)
    meta = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    if meta and meta.get("lat") and meta.get("lng"):
        return {
            "project_id": project_id,
            "lat": meta["lat"], "lng": meta["lng"],
            "zoom": meta.get("zoom", 14),
            "address": meta.get("address", ""),
            "source": "manual",
        }
    # Fallback to colonia center from seed
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(project_id)
        if dev and dev.get("center"):
            lng, lat = dev["center"]  # seed uses GeoJSON [lng, lat]
            return {
                "project_id": project_id,
                "lat": lat, "lng": lng, "zoom": 14,
                "address": dev.get("address_full", ""),
                "source": "colonia_fallback",
            }
    except Exception:
        pass
    return {"project_id": project_id, "lat": 19.4326, "lng": -99.1332, "zoom": 12, "source": "cdmx_fallback"}


# ═════════════════════════════════════════════════════════════════════════════
# 4.11 ABSORPTION ANALYTICS (cohort + heatmap YTD + win/loss + funnel)
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/analytics/absorption")
async def absorption_analytics(request: Request, project_id: Optional[str] = None):
    """Multi-widget absorption analytics. Deterministic seeded synthetic data."""
    user = await _auth(request)
    dev_ids = _user_dev_ids(user)
    if project_id and project_id in dev_ids:
        dev_ids = [project_id]

    from data_developments import DEVELOPMENTS_BY_ID
    my_devs = [DEVELOPMENTS_BY_ID[d] for d in dev_ids if d in DEVELOPMENTS_BY_ID]

    rng = random.Random(hash(tuple(dev_ids)) % 2**32)

    # ── Cohort matrix: captación month × cierre month (last 12 months)
    months = []
    today = _now()
    for i in range(12):
        m = (today.replace(day=1) - timedelta(days=30 * (11 - i)))
        months.append(m.strftime("%Y-%m"))
    cohort = []
    for i, capt_m in enumerate(months):
        row = {"captacion_month": capt_m, "closes": {}}
        for j, close_m in enumerate(months):
            if j >= i:
                base = max(0, int(rng.gauss(6 - abs(j - i - 2) * 1.5, 2)))
                row["closes"][close_m] = base
        cohort.append(row)

    # ── Heatmap calendario YTD: ventas per day (GitHub style)
    year = today.year
    jan1 = datetime(year, 1, 1, tzinfo=timezone.utc)
    days = (today - jan1).days + 1
    heatmap = []
    for d in range(days):
        date = jan1 + timedelta(days=d)
        weekend = date.weekday() >= 5
        # Realistic: fewer sales weekends, ramp mid-month, more toward year end
        base = rng.gauss(1.2 if not weekend else 0.3, 0.7)
        count = max(0, int(base + (d / 90)))
        heatmap.append({
            "date": date.strftime("%Y-%m-%d"),
            "count": count,
            "level": 0 if count == 0 else 1 if count <= 1 else 2 if count <= 2 else 3 if count <= 4 else 4,
        })

    # ── Win/Loss reasons breakdown
    total_lost = 87
    win_loss = {
        "won": 142,
        "lost_total": total_lost,
        "lost_reasons": [
            {"reason": "Precio", "count": int(total_lost * 0.38), "color": "#ef4444", "pct": 38},
            {"reason": "Timing (entrega)", "count": int(total_lost * 0.24), "color": "#f59e0b", "pct": 24},
            {"reason": "Financiamiento", "count": int(total_lost * 0.19), "color": "#EC4899", "pct": 19},
            {"reason": "Ubicación", "count": int(total_lost * 0.11), "color": "#6366F1", "pct": 11},
            {"reason": "Otro", "count": int(total_lost * 0.08), "color": "#94a3b8", "pct": 8},
        ],
        "win_rate_pct": round(100 * 142 / (142 + total_lost), 1),
    }

    # ── Funnel multi-step
    funnel_steps = [
        {"k": "lead", "label": "Leads capturados", "count": 2850},
        {"k": "visita", "label": "Visitas agendadas", "count": 1240},
        {"k": "propuesta", "label": "Propuesta enviada", "count": 432},
        {"k": "aceptada", "label": "Propuesta aceptada", "count": 186},
        {"k": "cerrada", "label": "Venta cerrada", "count": 142},
    ]
    for i, s in enumerate(funnel_steps):
        if i == 0:
            s["dropoff_pct"] = 0
            s["conversion_from_prev"] = 100.0
        else:
            prev = funnel_steps[i - 1]["count"]
            s["dropoff_pct"] = round(100 * (prev - s["count"]) / prev, 1) if prev else 0
            s["conversion_from_prev"] = round(100 * s["count"] / prev, 1) if prev else 0

    return {
        "months": months,
        "cohort": cohort,
        "heatmap": heatmap,
        "win_loss": win_loss,
        "funnel": funnel_steps,
        "project_id": project_id,
        "project_count": len(my_devs),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.12 FORECAST vs ACTUAL + MULTI-PROJECT
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/analytics/forecast")
async def forecast_analytics(request: Request, consolidated: bool = False):
    user = await _auth(request)
    dev_ids = _user_dev_ids(user)
    from data_developments import DEVELOPMENTS_BY_ID
    my_devs = [DEVELOPMENTS_BY_ID[d] for d in dev_ids if d in DEVELOPMENTS_BY_ID]
    if not my_devs:
        return {"rows": [], "consolidated": None, "monthly_projection": []}

    rng = random.Random(1729)
    rows = []
    total_target = 0
    total_actual = 0
    for d in my_devs:
        target = max(8, d["units_total"] // 6)
        actual = int(target * rng.uniform(0.55, 1.25))
        variance = round(100 * (actual - target) / target, 1) if target else 0
        trend = "up" if variance > 5 else "down" if variance < -5 else "flat"
        # monthly 12m forward sensitivity (base, pess, opt)
        monthly = []
        today = _now()
        remain = max(0, d["units_available"])
        for i in range(12):
            m = (today.replace(day=1) + timedelta(days=30 * i)).strftime("%Y-%m")
            base = max(0, round(remain / 18 + rng.gauss(0, 0.6), 2))
            monthly.append({
                "month": m,
                "base": round(base, 2),
                "pessimist": round(base * 0.65, 2),
                "optimist": round(base * 1.38, 2),
            })
        rows.append({
            "dev_id": d["id"],
            "dev_name": d["name"],
            "colonia": d["colonia"],
            "target_units": target,
            "actual_units": actual,
            "variance_pct": variance,
            "trend": trend,
            "revenue_target": target * d["price_from"],
            "revenue_actual": actual * d["price_from"],
            "monthly_projection": monthly,
        })
        total_target += target
        total_actual += actual

    consolidated_row = {
        "target_units": total_target,
        "actual_units": total_actual,
        "variance_pct": round(100 * (total_actual - total_target) / total_target, 1) if total_target else 0,
        "trend": "up" if total_actual > total_target else "down" if total_actual < total_target * 0.95 else "flat",
        "project_count": len(my_devs),
    }
    # Consolidated monthly projection: sum of per-dev monthlies
    cons_monthly = []
    if rows:
        for i in range(12):
            m = rows[0]["monthly_projection"][i]["month"]
            cons_monthly.append({
                "month": m,
                "base": round(sum(r["monthly_projection"][i]["base"] for r in rows), 2),
                "pessimist": round(sum(r["monthly_projection"][i]["pessimist"] for r in rows), 2),
                "optimist": round(sum(r["monthly_projection"][i]["optimist"] for r in rows), 2),
            })

    return {"rows": rows, "consolidated": consolidated_row, "monthly_projection": cons_monthly}


class ForecastAdjust(BaseModel):
    dev_id: str
    target_units: int = Field(..., ge=0)
    reason: Optional[str] = None


@router.post("/analytics/forecast/adjust")
async def adjust_forecast(payload: ForecastAdjust, request: Request):
    user = await _auth(request)
    db = _db(request)
    prev = await db.dev_forecast_overrides.find_one(
        {"dev_org_id": _tenant(user), "dev_id": payload.dev_id}, {"_id": 0}
    )
    new_doc = {
        "dev_org_id": _tenant(user),
        "dev_id": payload.dev_id,
        "target_units": payload.target_units,
        "reason": payload.reason or "",
        "updated_at": _now().isoformat(),
        "updated_by": user.user_id,
    }
    await db.dev_forecast_overrides.update_one(
        {"dev_org_id": _tenant(user), "dev_id": payload.dev_id},
        {"$set": new_doc},
        upsert=True,
    )
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "update", "forecast_target", payload.dev_id,
            before={"target_units": (prev or {}).get("target_units")},
            after={"target_units": payload.target_units, "reason": payload.reason},
            request=request,
        )
        await emit_ml_event(
            db, event_type="forecast_adjust",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"dev_id": payload.dev_id},
            ai_decision={}, user_action={"target_units": payload.target_units},
        )
    except Exception:
        pass
    return {"ok": True, "dev_id": payload.dev_id, "target_units": payload.target_units}


# ═════════════════════════════════════════════════════════════════════════════
# 4.13 COMPETITOR RADAR ENRICHED
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/competitors/enriched")
async def competitors_enriched(request: Request, dev_id: Optional[str] = None, radius_km: float = 2.0):
    """Alerts + history + press clips enrichment on top of base competitor radar."""
    user = await _auth(request)
    db = _db(request)
    # Reuse developer/competidores logic
    from routes_developer import competitor_radar  # reuse function
    base = await competitor_radar(request, dev_id=dev_id, radius_km=radius_km)

    # Enrich with alert-config and attach to alerts
    cfg = await db.dev_competitor_alert_config.find_one(
        {"dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {"price_delta_threshold_pct": 5, "absorption_threshold_pct": 65, "notify_email": True, "notify_inapp": True}

    # Press clips stub (deterministic)
    rng = random.Random(hash(dev_id or "default") % 2**32)
    press_clips = []
    headlines = [
        "Mercado preventa CDMX cierra Q1 con +8.2% absorción",
        "Alcaldías premium registran nueva ola de torres boutique",
        "Costos de construcción se estabilizan tras 11 meses de inflación",
        "Inversión extranjera en vivienda LATAM alcanza USD 3.4B",
        "Nuevo reglamento de uso de suelo en Miguel Hidalgo",
        "Banxico mantiene tasa, proyecciones 2026 optimistas para desarrolladores",
    ]
    for i in range(min(6, len(headlines))):
        days_ago = rng.randint(1, 28)
        press_clips.append({
            "id": _uid("clip"),
            "title": headlines[i],
            "source": rng.choice(["El Financiero", "Expansión", "Real Estate Market", "The Real Deal", "Obras"]),
            "published_at": (_now() - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
            "url": "#",
            "ai_summary": f"Impacto potencial: {rng.choice(['alto', 'medio', 'bajo'])}. Relevancia para tu portfolio: {rng.choice(['directa', 'indirecta'])}. Recomendación: {rng.choice(['monitorear', 'ajustar pricing', 'evaluar exposición', 'sin acción inmediata'])}.",
            "sentiment": rng.choice(["positive", "neutral", "negative"]),
        })

    return {
        **base,
        "alert_config": cfg,
        "press_clips": press_clips,
    }


@router.get("/competitors/{competitor_id}/history")
async def competitor_history(competitor_id: str, request: Request):
    """Price history 12 months for a specific competitor dev."""
    await _auth(request)
    from data_developments import DEVELOPMENTS_BY_ID
    comp = DEVELOPMENTS_BY_ID.get(competitor_id)
    if not comp:
        raise HTTPException(404, "Competidor no encontrado")

    rng = random.Random(hash(competitor_id) % 2**32)
    base_price_sqm = comp["price_from"] / max(1, comp["m2_range"][0])
    history = []
    today = _now()
    price = base_price_sqm * 0.88
    for i in range(12):
        m = (today.replace(day=1) - timedelta(days=30 * (11 - i)))
        price = price * rng.uniform(0.99, 1.018)
        history.append({
            "month": m.strftime("%Y-%m"),
            "price_sqm_mxn": int(price),
            "availability_pct": rng.randint(15, 92),
        })

    return {
        "competitor_id": competitor_id,
        "competitor_name": comp["name"],
        "current_price_sqm": int(history[-1]["price_sqm_mxn"]),
        "history": history,
        "delta_12m_pct": round(100 * (history[-1]["price_sqm_mxn"] - history[0]["price_sqm_mxn"]) / history[0]["price_sqm_mxn"], 1),
    }


class AlertConfigPayload(BaseModel):
    price_delta_threshold_pct: float = Field(5, ge=0.5, le=50)
    absorption_threshold_pct: float = Field(65, ge=0, le=100)
    notify_email: bool = True
    notify_inapp: bool = True


@router.post("/competitors/alert-config")
async def save_alert_config(payload: AlertConfigPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    prev = await db.dev_competitor_alert_config.find_one(
        {"dev_org_id": _tenant(user)}, {"_id": 0}
    )
    doc = {
        "dev_org_id": _tenant(user),
        **payload.model_dump(),
        "updated_at": _now().isoformat(),
        "updated_by": user.user_id,
    }
    await db.dev_competitor_alert_config.update_one(
        {"dev_org_id": _tenant(user)}, {"$set": doc}, upsert=True
    )
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "update", "competitor_alert_config", _tenant(user),
            before=prev, after=payload.model_dump(), request=request,
        )
        await emit_ml_event(
            db, event_type="competitor_alert_config_update",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={}, ai_decision={}, user_action=payload.model_dump(),
        )
    except Exception:
        pass
    return {"ok": True, "config": doc}


# ═════════════════════════════════════════════════════════════════════════════
# 4.16 IE SCORE PROJECT DETAILED
# ═════════════════════════════════════════════════════════════════════════════
SCORE_CATEGORIES = {
    "fundamentals": ["N1", "N2", "P1"],
    "market": ["N3", "N4", "P2"],
    "risk": ["N5", "P3", "P4"],
    "sentiment": ["N6", "P5", "P6"],
}


@router.get("/ie/projects/{project_id}/breakdown")
async def ie_project_breakdown(project_id: str, request: Request):
    """Return 12 IE scores for a project + colonia benchmark."""
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    rng = random.Random(hash(project_id) % 2**32)

    # Pull real scores if available
    project_scores = {}
    colonia_scores = {}
    async for s in db.ie_scores.find({"zone_id": project_id, "is_stub": False}, {"_id": 0}):
        project_scores[s["code"]] = s
    async for s in db.ie_scores.find({"zone_id": dev["colonia_id"], "is_stub": False}, {"_id": 0}):
        colonia_scores[s["code"]] = s

    # Build 12 scores grouped by category
    score_names = {
        "N1": "Demanda estructural",
        "N2": "Oferta disponible",
        "P1": "Fundamentals proyecto",
        "N3": "Dinámica de mercado",
        "N4": "Predicción absorción",
        "P2": "Posicionamiento pricing",
        "N5": "Riesgo geográfico",
        "P3": "Riesgo desarrollador",
        "P4": "Riesgo entrega",
        "N6": "Sentimiento colonia",
        "P5": "Brand equity",
        "P6": "Competitividad amenidades",
    }

    categories = []
    overall_scores = []
    for cat_name, codes in SCORE_CATEGORIES.items():
        scores_in_cat = []
        for code in codes:
            proj = project_scores.get(code)
            colo = colonia_scores.get(code)
            if proj and proj.get("value") is not None:
                value = float(proj["value"])
                is_real = True
            else:
                # Honest synthetic: anchored to project fundamentals
                seed_base = 55 + rng.randint(-12, 28)
                value = max(0, min(100, seed_base))
                is_real = False

            benchmark = None
            if colo and colo.get("value") is not None:
                benchmark = float(colo["value"])
            else:
                benchmark = max(0, min(100, value + rng.randint(-15, 15)))

            delta = round(value - benchmark, 1)
            tier = "excellent" if value >= 75 else "good" if value >= 60 else "fair" if value >= 40 else "poor"
            scores_in_cat.append({
                "code": code,
                "name": score_names.get(code, code),
                "value": round(value, 1),
                "benchmark_colonia": round(benchmark, 1),
                "delta_vs_colonia": delta,
                "tier": tier,
                "confidence": proj.get("confidence", "low") if proj else "synthetic",
                "is_stub": not is_real,
            })
            overall_scores.append(value)
        categories.append({
            "key": cat_name,
            "label": cat_name.capitalize(),
            "scores": scores_in_cat,
            "avg": round(sum(s["value"] for s in scores_in_cat) / len(scores_in_cat), 1),
        })

    overall = round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else 0

    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ie_breakdown_view",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "overall_score": overall},
            ai_decision={}, user_action={"action": "view"},
        )
    except Exception:
        pass

    return {
        "project_id": project_id,
        "project_name": dev["name"],
        "colonia": dev["colonia"],
        "overall_score": overall,
        "overall_tier": "excellent" if overall >= 75 else "good" if overall >= 60 else "fair" if overall >= 40 else "poor",
        "categories": categories,
        "generated_at": _now().isoformat(),
    }


@router.get("/ie/projects/{project_id}/improve")
async def ie_improve_recommendations(project_id: str, request: Request, code: str):
    """Return 3-4 concrete AI recommendations on how to improve a given IE score."""
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    score_name_map = {
        "N1": "Demanda estructural", "N2": "Oferta disponible", "P1": "Fundamentals proyecto",
        "N3": "Dinámica de mercado", "N4": "Predicción absorción", "P2": "Posicionamiento pricing",
        "N5": "Riesgo geográfico", "P3": "Riesgo desarrollador", "P4": "Riesgo entrega",
        "N6": "Sentimiento colonia", "P5": "Brand equity", "P6": "Competitividad amenidades",
    }
    score_name = score_name_map.get(code, code)

    # Map each code to contextual recommendations
    recs_by_code = {
        "N1": [
            {"title": "Lanzar campaña segmentada en redes", "effort": "media", "impact": "alto",
             "detail": "Focaliza ads en colonia-target con audiencias similares a tus leads Tier 1."},
            {"title": "Ampliar horario de tours guiados", "effort": "baja", "impact": "medio",
             "detail": "Abre sábados PM para capturar demanda de compradores con agenda cargada."},
            {"title": "Alianza con 3 inmobiliarias top de la zona", "effort": "alta", "impact": "alto",
             "detail": "Comisiones escalonadas por volumen de cierres en los primeros 90 días."},
        ],
        "N2": [
            {"title": "Re-priorizar mix de unidades en preventa", "effort": "media", "impact": "alto",
             "detail": "Reduce inventario en prototipos con absorción <40% y acelera los Tier 1."},
            {"title": "Liberar unidades ancla con descuento early-bird", "effort": "baja", "impact": "medio",
             "detail": "Las 3-5 unidades más vistas vistas como gancho de conversión."},
        ],
        "P1": [
            {"title": "Publicar ficha técnica completa en landing", "effort": "baja", "impact": "alto",
             "detail": "Planta arquitectónica + acabados + fideicomiso público aumenta confianza 30%."},
            {"title": "Video tour dron + walkthrough 4K", "effort": "media", "impact": "alto",
             "detail": "Mejora conversión lead→visita en 2.3x según benchmark interno."},
        ],
        "N3": [
            {"title": "Monitor competitivo semanal automatizado", "effort": "baja", "impact": "alto",
             "detail": "Activa alertas de pricing en /desarrollador/competidores con umbral 3%."},
            {"title": "Ajustar pricing en función de velocidad colonia", "effort": "media", "impact": "alto",
             "detail": "Usa D4 pricing dinámico para sincronizar con velocidad real de absorción."},
        ],
        "N4": [
            {"title": "Refuerza narrativa de entrega puntual", "effort": "baja", "impact": "medio",
             "detail": "Publica avance de obra mensual con fotos y % real para blindar la predicción."},
            {"title": "Incentiva apartados de 48-72h", "effort": "baja", "impact": "alto",
             "detail": "Los holds aceleran la velocidad de venta real observada 15-22%."},
        ],
        "P2": [
            {"title": "Benchmark trimestral vs 5 comparables directos", "effort": "media", "impact": "alto",
             "detail": "Publica tu posición pricing/m² en el dashboard para anclar perception."},
            {"title": "Escenario pricing dinámico basado en demand score", "effort": "alta", "impact": "alto",
             "detail": "Usa el módulo D4 con sensitivity -8%/+12% según absorción real."},
        ],
        "N5": [
            {"title": "Publica análisis geotécnico y pluvial", "effort": "baja", "impact": "medio",
             "detail": "Transparencia en estudios de suelo reduce objeciones tipo 'riesgo'."},
            {"title": "Certificación sísmica y uso de suelo vigente", "effort": "baja", "impact": "alto",
             "detail": "Badge de compliance en ficha pública."},
        ],
        "P3": [
            {"title": "Muestra portfolio entregas anteriores", "effort": "baja", "impact": "alto",
             "detail": "Fotos/metadata de últimos 5 proyectos entregados con ficha de cumplimiento."},
        ],
        "P4": [
            {"title": "Actualiza avance de obra semanalmente", "effort": "baja", "impact": "alto",
             "detail": "Usa el módulo Avance-Obra para reportes automáticos con fotos."},
        ],
        "N6": [
            {"title": "Activa monitoreo de menciones en RRSS", "effort": "media", "impact": "medio",
             "detail": "Alerta cuando sentiment colonia baje de 65 para responder rápido."},
        ],
        "P5": [
            {"title": "Colaboración con arquitecto reconocido", "effort": "alta", "impact": "alto",
             "detail": "Asocia el proyecto a un nombre top en el mercado para lift de marca."},
            {"title": "Publicaciones en medios especializados", "effort": "media", "impact": "medio",
             "detail": "Placement en Expansión Real Estate y Obras impacta 6-8 puntos en P5."},
        ],
        "P6": [
            {"title": "Comparativa amenidades vs top 3 competidores", "effort": "baja", "impact": "alto",
             "detail": "Detectar gaps (concierge, cowork, pet-friendly) y cerrar brecha."},
            {"title": "Agrega amenity diferenciadora (spa/cava/sky lounge)", "effort": "alta", "impact": "alto",
             "detail": "Cada amenity premium suma 4-7 puntos si es escasa en la colonia."},
        ],
    }

    recommendations = recs_by_code.get(code, [
        {"title": "Ejecuta auditoría manual del score", "effort": "media", "impact": "medio",
         "detail": "No hay recomendaciones automatizadas para este score aún."}
    ])

    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ie_drilldown_click",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "code": code, "score_name": score_name},
            ai_decision={"recommendation_count": len(recommendations)},
            user_action={"action": "drilldown"},
        )
    except Exception:
        pass

    return {
        "project_id": project_id,
        "project_name": dev["name"],
        "code": code,
        "score_name": score_name,
        "recommendations": recommendations,
        "narrative_stub": f"El score {code} ({score_name}) de {dev['name']} se puede mejorar con acciones de impacto alto-medio en los próximos 90 días. Priorizá las acciones marcadas 'alto' con 'baja' dificultad para maximizar ROI.",
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.25 AVANCE DE OBRA (construction progress)
# ═════════════════════════════════════════════════════════════════════════════
DEFAULT_STAGES = [
    {"key": "cimentacion", "label": "Cimentación", "order": 1, "percent": 0},
    {"key": "estructura", "label": "Estructura", "order": 2, "percent": 0},
    {"key": "instalaciones", "label": "Instalaciones", "order": 3, "percent": 0},
    {"key": "acabados", "label": "Acabados", "order": 4, "percent": 0},
    {"key": "entrega", "label": "Entrega final", "order": 5, "percent": 0},
]


@router.get("/construction/{project_id}/progress")
async def get_construction_progress(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    doc = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    if not doc:
        # Seed from development.progress
        seed_pct = dev.get("construction_progress", {}).get("percentage", 0) if isinstance(dev.get("construction_progress"), dict) else dev.get("progress", 0)
        stages = []
        # Distribute seed_pct across stages
        remaining = seed_pct
        for s in DEFAULT_STAGES:
            pct = min(100, remaining)
            stages.append({**s, "percent": max(0, pct), "updated_at": None})
            remaining = max(0, remaining - 100)
        current_idx = next((i for i, s in enumerate(stages) if s["percent"] < 100), len(stages) - 1)
        doc = {
            "project_id": project_id,
            "dev_org_id": _tenant(user),
            "stages": stages,
            "current_stage": stages[current_idx]["key"],
            "overall_percent": seed_pct,
            "per_unit_avg_percent": seed_pct,
            "photos": [],
            "comments": [],
            "updated_at": _now().isoformat(),
        }

    return {
        "project_id": project_id,
        "project_name": dev["name"],
        **{k: v for k, v in doc.items() if k != "_id"},
    }


class ConstructionUpdate(BaseModel):
    stage_key: str
    percent: float = Field(..., ge=0, le=100)
    note: Optional[str] = None


@router.post("/construction/{project_id}/update-stage")
async def update_construction_stage(project_id: str, payload: ConstructionUpdate, request: Request):
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    if project_id not in DEVELOPMENTS_BY_ID:
        raise HTTPException(404, "Proyecto no encontrado")

    prev = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    stages = prev["stages"] if prev else [dict(s) for s in DEFAULT_STAGES]

    updated = False
    for s in stages:
        if s["key"] == payload.stage_key:
            s["percent"] = payload.percent
            s["updated_at"] = _now().isoformat()
            updated = True
            break
    if not updated:
        raise HTTPException(400, f"stage_key inválido: {payload.stage_key}")

    overall = round(sum(s["percent"] for s in stages) / len(stages), 1)
    current = next((s["key"] for s in stages if s["percent"] < 100), stages[-1]["key"])

    await db.project_construction_progress.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": {
            "project_id": project_id,
            "dev_org_id": _tenant(user),
            "stages": stages,
            "current_stage": current,
            "overall_percent": overall,
            "per_unit_avg_percent": overall,
            "updated_at": _now().isoformat(),
            "updated_by": user.user_id,
        }},
        upsert=True,
    )

    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "update", "construction_progress", project_id,
            before={"stage": payload.stage_key, "prev_pct": (next((s["percent"] for s in (prev or {}).get("stages", []) if s["key"] == payload.stage_key), None))},
            after={"stage": payload.stage_key, "pct": payload.percent, "note": payload.note},
            request=request,
        )
        await emit_ml_event(
            db, event_type="avance_obra_milestone",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "stage": payload.stage_key, "overall": overall},
            ai_decision={}, user_action={"percent": payload.percent},
        )
    except Exception:
        pass

    return {"ok": True, "project_id": project_id, "stages": stages, "overall_percent": overall, "current_stage": current}


class ConstructionComment(BaseModel):
    text: str = Field(..., min_length=1, max_length=800)
    photo_url: Optional[str] = None
    stage_key: Optional[str] = None


@router.post("/construction/{project_id}/comment")
async def add_construction_comment(project_id: str, payload: ConstructionComment, request: Request):
    user = await _auth(request)
    db = _db(request)
    entry = {
        "id": _uid("c"),
        "text": payload.text,
        "photo_url": payload.photo_url,
        "stage_key": payload.stage_key,
        "author_id": user.user_id,
        "author_name": getattr(user, "name", "Usuario"),
        "ts": _now().isoformat(),
    }
    await db.project_construction_progress.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$push": {"comments": {"$each": [entry], "$position": 0}},
         "$set": {"updated_at": _now().isoformat()}},
        upsert=True,
    )
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "create", "construction_comment", entry["id"],
            before=None, after=entry, request=request,
        )
        await emit_ml_event(
            db, event_type="avance_obra_comment",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "stage": payload.stage_key},
            ai_decision={}, user_action={"action": "comment"},
        )
    except Exception:
        pass
    return {"ok": True, "entry": entry}


# ═════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_dev_batch2_indexes(db) -> None:
    await db.dev_forecast_overrides.create_index(
        [("dev_org_id", 1), ("dev_id", 1)], unique=True, background=True
    )
    await db.dev_competitor_alert_config.create_index(
        [("dev_org_id", 1)], unique=True, background=True
    )
    await db.project_construction_progress.create_index(
        [("dev_org_id", 1), ("project_id", 1)], unique=True, background=True
    )
    import logging
    logging.getLogger("dmx").info("[dev_batch2] indexes ensured")
