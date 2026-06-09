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

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import metric_normalizer as _mn

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
    from tenant_scope import tenant_of
    return tenant_of(user)


def _user_dev_ids(user) -> List[str]:
    """Desarrollos visibles (multi-tenant · fuente única tenant_scope)."""
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


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
            "calle": meta.get("calle", ""),
            "colonia": meta.get("colonia", ""),
            "alcaldia": meta.get("alcaldia", ""),
            "cp": meta.get("cp", ""),
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
    from collections import Counter
    my_devs = [DEVELOPMENTS_BY_ID[d] for d in dev_ids if d in DEVELOPMENTS_BY_ID]

    db = _db(request)
    today = _now()

    # 12 meses
    months = []
    for i in range(12):
        m = (today.replace(day=1) - timedelta(days=30 * (11 - i)))
        months.append(m.strftime("%Y-%m"))

    # ── Cargar leads REALES del dev (antes era random.Random — datos inventados).
    # Scope por development_id ∈ sus proyectos (los leads traen development_id, NO dev_org_id →
    # antes con dev_org_id devolvía VACÍO). dev_ids ya refleja el filtro de project_id de arriba.
    q: Dict[str, Any] = {"development_id": {"$in": dev_ids}}
    leads = await db.leads.find(
        q, {"_id": 0, "status": 1, "lost_reason": 1, "created_at": 1, "updated_at": 1}
    ).to_list(5000)

    def _parse(dt):
        if not dt:
            return None
        if isinstance(dt, datetime):
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        try:
            d = datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    counts = Counter(l.get("status") for l in leads)
    won = counts.get("cerrado_ganado", 0)
    lost_leads = [l for l in leads if l.get("status") == "cerrado_perdido"]
    lost_total = len(lost_leads)

    # ── Win/Loss REAL (motivos desde lost_reason)
    REASON_COLOR = {"precio": "#ef4444", "timing": "#f59e0b", "financiamiento": "#EC4899",
                    "ubicacion": "#6366F1", "competencia": "#10b981"}
    reason_ct = Counter((l.get("lost_reason") or "otro") for l in lost_leads)
    lost_reasons = [
        {"reason": str(r).replace("_", " ").title(), "count": c,
         "color": REASON_COLOR.get(str(r).lower(), "#94a3b8"),
         "pct": round(100 * c / lost_total) if lost_total else 0}
        for r, c in reason_ct.most_common()
    ]
    win_loss = {
        "won": won, "lost_total": lost_total, "lost_reasons": lost_reasons,
        "win_rate_pct": round(100 * won / (won + lost_total), 1) if (won + lost_total) else 0,
    }

    # ── Funnel REAL por etapa (acumulado hacia el cierre). Vocabulario canonizado: acepta los dos
    #    sets de status que conviven en la data (cita/cita_agendada · propuesta).
    n_total = len(leads)
    _CALIF = ("calificado", "cita", "cita_agendada", "propuesta", "cerrado_ganado", "cerrado_perdido")
    _VISITA = ("cita", "cita_agendada", "propuesta", "cerrado_ganado", "cerrado_perdido")
    n_calif = sum(counts.get(s, 0) for s in _CALIF)
    n_visita = sum(counts.get(s, 0) for s in _VISITA)
    funnel_steps = [
        {"k": "lead",       "label": "Leads capturados", "count": n_total},
        {"k": "calificado", "label": "Calificados",      "count": n_calif},
        {"k": "visita",     "label": "Cita agendada",    "count": n_visita},
        {"k": "cerrada",    "label": "Venta cerrada",    "count": won},
    ]
    for i, s in enumerate(funnel_steps):
        if i == 0:
            s["dropoff_pct"] = 0
            s["conversion_from_prev"] = 100.0
        else:
            prev = funnel_steps[i - 1]["count"]
            s["dropoff_pct"] = round(100 * (prev - s["count"]) / prev, 1) if prev else 0
            s["conversion_from_prev"] = round(100 * s["count"] / prev, 1) if prev else 0

    # ── Cohort REAL: mes de captación × mes de cierre (leads ganados)
    midx = {m: i for i, m in enumerate(months)}
    cohort = [{"captacion_month": m, "closes": {}} for m in months]
    for l in leads:
        if l.get("status") != "cerrado_ganado":
            continue
        c, cl = _parse(l.get("created_at")), _parse(l.get("updated_at"))
        if not c or not cl:
            continue
        cm, clm = c.strftime("%Y-%m"), cl.strftime("%Y-%m")
        if cm in midx and clm in midx:
            cohort[midx[cm]]["closes"][clm] = cohort[midx[cm]]["closes"].get(clm, 0) + 1

    # ── Heatmap REAL: cierres por día YTD (fecha de cierre = updated_at del lead ganado)
    year = today.year
    jan1 = datetime(year, 1, 1, tzinfo=timezone.utc)
    day_ct: Counter = Counter()
    for l in leads:
        if l.get("status") != "cerrado_ganado":
            continue
        cl = _parse(l.get("updated_at"))
        if cl and cl >= jan1:
            day_ct[cl.strftime("%Y-%m-%d")] += 1
    days = (today - jan1).days + 1
    heatmap = []
    for d in range(days):
        ds = (jan1 + timedelta(days=d)).strftime("%Y-%m-%d")
        count = day_ct.get(ds, 0)
        heatmap.append({"date": ds, "count": count,
                        "level": 0 if count == 0 else 1 if count <= 1 else 2 if count <= 2 else 3 if count <= 4 else 4})

    return {
        "months": months,
        "cohort": cohort,
        "heatmap": heatmap,
        "win_loss": win_loss,
        "funnel": funnel_steps,
        "project_id": project_id,
        "project_count": len(my_devs),
        "source": "real · db.leads",
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.12 FORECAST vs ACTUAL + MULTI-PROJECT
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/analytics/forecast")
async def forecast_analytics(request: Request, consolidated: bool = False):
    user = await _auth(request)
    dev_ids = _user_dev_ids(user)
    from data_developments import DEVELOPMENTS_BY_ID, ALL_UNITS
    my_devs = [DEVELOPMENTS_BY_ID[d] for d in dev_ids if d in DEVELOPMENTS_BY_ID]
    if not my_devs:
        return {"rows": [], "consolidated": None, "monthly_projection": []}

    # Ventas REALES por desarrollo (antes se fabricaba con random.Random(1729)).
    # El forecast ahora compara META de absorción vs VENDIDO REAL y proyecta con el ritmo real.
    sold_by_dev = {}
    for u in ALL_UNITS:
        if u.get("status") == "vendido":
            did = u.get("development_id")
            sold_by_dev[did] = sold_by_dev.get(did, 0) + 1

    rows = []
    total_target = 0
    total_actual = 0
    for d in my_devs:
        target = max(8, d["units_total"] // 6)      # meta de absorción (planeación)
        actual = sold_by_dev.get(d["id"], 0)        # VENDIDAS REALES
        variance = round(100 * (actual - target) / target, 1) if target else 0
        trend = "up" if variance > 5 else "down" if variance < -5 else "flat"
        # Proyección 12m determinística (sin random): ritmo = velocidad real estimada (u/mes)
        monthly = []
        today = _now()
        remain = max(0, d["units_available"])
        rate = round(actual / 6.0, 2) if actual else round(remain / 18.0, 2)
        for i in range(12):
            m = (today.replace(day=1) + timedelta(days=30 * i)).strftime("%Y-%m")
            base = round(min(rate, remain), 2)
            monthly.append({
                "month": m,
                "base": base,
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
    from routes.developer import competitor_radar  # reuse function
    base = await competitor_radar(request, dev_id=dev_id, radius_km=radius_km)

    # Enrich with alert-config and attach to alerts
    cfg = await db.dev_competitor_alert_config.find_one(
        {"dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {"price_delta_threshold_pct": 5, "absorption_threshold_pct": 65, "notify_email": True, "notify_inapp": True}

    # Noticias de la zona — REAL desde los boletines DMX de la alcaldía (antes se fabricaban con
    # random). Honesto: si aún no hay boletines de esa zona, queda vacío (no inventa titulares).
    press_clips: List[dict] = []
    try:
        mine = (base.get("my_project") or {})
        alc = None
        from data_developments import DEVELOPMENTS_BY_ID
        d0 = DEVELOPMENTS_BY_ID.get(mine.get("id"))
        if d0:
            alc = d0.get("alcaldia")
        q = {"$or": [{"alcaldia": alc}, {"scope": "ciudad"}]} if alc else {"scope": "ciudad"}
        cur = db.market_bulletins.find(q, {"_id": 0}).sort("published_at", -1).limit(6)
        async for b in cur:
            press_clips.append({
                "id": b.get("id") or _uid("clip"),
                "title": b.get("title"), "source": b.get("source") or "Boletín DMX",
                "published_at": b.get("published_at"), "url": b.get("url") or "#",
                "ai_summary": b.get("summary") or "", "sentiment": b.get("sentiment") or "neutral",
            })
    except Exception:
        press_clips = []

    return {
        **base,
        "alert_config": cfg,
        "press_clips": press_clips,
        "press_clips_note": (None if press_clips else
                             "Aún no hay noticias de esta zona. Aquí aparecerán los boletines de mercado de tu alcaldía."),
    }


@router.get("/competitors/{competitor_id}/history")
async def competitor_history(competitor_id: str, request: Request):
    """Tendencia de precio del competidor ANCLADA a la plusvalía OFICIAL de su zona (SHF · ING.3) —
    antes se fabricaba con random. El precio actual es real (lista); la trayectoria sigue el índice
    SHF real de la alcaldía (2005–2026). Honesto: es estimación con dato oficial de zona, no un
    histórico transaccional. Absorción/disponibilidad = inventario REAL del competidor."""
    await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID, inventory_stats
    comp = DEVELOPMENTS_BY_ID.get(competitor_id)
    if not comp:
        raise HTTPException(404, "Competidor no encontrado")

    cur_price_sqm = int(comp["price_from"] / max(1, comp["m2_range"][0]))
    inv = inventory_stats(comp)
    # Serie del índice SHF de la alcaldía (real). Reconstruye el precio hacia atrás con el índice.
    serie = []
    try:
        from shf_engine import get_series
        s = await get_series(db, alcaldia=comp.get("alcaldia"), desde_anio=2023)
        serie = s.get("serie") or []
    except Exception:
        serie = []

    if serie:
        idx_now = serie[-1]["indice"] or 1.0
        history = [{"month": p["t"], "price_sqm_mxn": int(cur_price_sqm * (p["indice"] / idx_now))}
                   for p in serie[-12:]]
        fuente = "Tendencia estimada con la plusvalía oficial de la zona (SHF)."
    else:
        history = [{"month": "Actual", "price_sqm_mxn": cur_price_sqm}]
        fuente = "Sin historial de zona aún — se muestra el precio actual."

    first, last = history[0]["price_sqm_mxn"], history[-1]["price_sqm_mxn"]
    delta = round(100 * (last - first) / first, 1) if (len(history) > 1 and first) else 0.0
    return {
        "competitor_id": competitor_id,
        "competitor_name": comp["name"],
        "current_price_sqm": cur_price_sqm,
        "absorption_pct": inv["absorption_pct"],     # REAL (inventario)
        "availability_pct": inv["availability_pct"],  # REAL (inventario)
        "history": history,
        "delta_12m_pct": delta,
        "fuente": fuente,
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

# Etiquetas en lenguaje de persona (antes en inglés técnico).
_CAT_LABELS = {
    "fundamentals": "Fundamentos", "market": "Mercado",
    "risk": "Riesgo", "sentiment": "Percepción de la Zona",
}

# Mapa de cada indicador a los scores REALES del motor IE (antes los códigos N1..P6 no casaban
# con nada → todo salía estimado). Solo códigos en rango 0-100 (se excluyen días/ROI crudos).
_CODE_MAP = {
    "N1": ["IE_COL_DEMOGRAFIA_FAMILIA", "IE_COL_DEMOGRAFIA_INGRESO", "IE_PROY_PRESALES_RATIO"],
    "N2": ["IE_PROY_ABSORCION_VELOCIDAD", "IE_PROY_LISTING_HEALTH"],
    "P1": ["IE_PROY_LISTING_HEALTH", "IE_PROY_QUALITY_DOCS"],
    "N3": ["IE_COL_PLUSVALIA_HIST", "IE_COL_PLUSVALIA_PROYECTADA"],
    "N4": ["IE_PROY_ABSORCION_VELOCIDAD", "IE_PROY_PRESALES_RATIO"],
    "P2": ["IE_PROY_PRECIO_VS_MERCADO", "IE_PROY_PRECIO_RANK_PERCENTIL"],
    "N5": ["IE_COL_DEMOGRAFIA_ESTABILIDAD", "IE_PROY_COMPETITION_PRESSURE"],
    "P3": ["IE_PROY_DEVELOPER_TRUST", "IE_PROY_DEVELOPER_CONCENTRATION"],
    "P4": ["IE_PROY_DEVELOPER_DELIVERY_HIST"],
    "N6": ["IE_PROY_SCORE_VS_COLONIA", "IE_COL_EDUCACION"],
    "P5": ["IE_PROY_MARCA_TRUST", "IE_PROY_BADGE_TOP"],
    "P6": ["IE_PROY_AMENIDADES"],
}


def _avg_real(d: dict, codes: list):
    """Promedio (clamp 0-100) de los scores reales presentes para un indicador. None si ninguno."""
    vals = [max(0.0, min(100.0, d[rc])) for rc in codes if rc in d]
    return round(sum(vals) / len(vals), 1) if vals else None


def _vs_zona(value: float, benchmark: float) -> dict:
    """Lectura CUALITATIVA del proyecto vs su colonia (sin número crudo · más accionable)."""
    d = (value or 0) - (benchmark or 0)
    if d >= 5:
        return {"texto": "Por Encima de la Zona", "color": "verde"}
    if d <= -5:
        return {"texto": "Por Debajo de la Zona", "color": "rojo"}
    return {"texto": "En Línea con la Zona", "color": "ambar"}


@router.get("/ie/projects/{project_id}/breakdown")
async def ie_project_breakdown(project_id: str, request: Request):
    """Return 12 IE scores for a project + colonia benchmark."""
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")
    from tenant_scope import assert_dev_project
    assert_dev_project(user, project_id)   # candado: no leer la calificación IE de proyecto ajeno

    # Scores REALES del motor IE — proyecto (IE_PROY_*) + colonia (IE_COL_*), por código real.
    proj_v: Dict[str, float] = {}
    colo_v: Dict[str, float] = {}
    async for s in db.ie_scores.find({"zone_id": project_id, "is_stub": False}, {"_id": 0, "code": 1, "value": 1}):
        if s.get("value") is not None:
            proj_v[s["code"]] = float(s["value"])
    async for s in db.ie_scores.find({"zone_id": dev["colonia_id"], "is_stub": False}, {"_id": 0, "code": 1, "value": 1}):
        if s.get("value") is not None:
            colo_v[s["code"]] = float(s["value"])
    merged = {**colo_v, **proj_v}  # el proyecto pesa sobre la colonia

    # Ancla DETERMINISTA para los indicadores que aún no tienen dato real (antes era random.randint).
    from data_developments import inventory_stats
    _inv = inventory_stats(dev)
    _colrec = await db.colonias.find_one(
        {"id": dev.get("colonia_id")}, {"_id": 0, "precio_score": 1, "vsuelo_score": 1}) or {}
    _anchor_parts = [v for v in (_inv["absorption_pct"], _colrec.get("precio_score"),
                                 _colrec.get("vsuelo_score")) if v is not None]
    anchor = round(sum(_anchor_parts) / len(_anchor_parts), 1) if _anchor_parts else 50.0

    # Nombres en lenguaje de persona (antes en jerga).
    score_names = {
        "N1": "Demanda de la Zona", "N2": "Ritmo de Venta", "P1": "Salud del Proyecto",
        "N3": "Plusvalía de la Zona", "N4": "Velocidad de Absorción", "P2": "Precio vs el Mercado",
        "N5": "Estabilidad de la Zona", "P3": "Confianza del Desarrollador", "P4": "Cumplimiento de Entrega",
        "N6": "Posición vs la Colonia", "P5": "Marca y Reputación", "P6": "Amenidades",
    }

    categories = []
    overall_scores = []
    for cat_name, codes in SCORE_CATEGORIES.items():
        scores_in_cat = []
        for code in codes:
            real_codes = _CODE_MAP.get(code, [])
            v = _avg_real(merged, real_codes)        # valor real del proyecto/zona
            if v is not None:
                value = v
                is_real = True
            else:
                value = anchor                        # sin dato real → ancla determinista (estimado)
                is_real = False
            b = _avg_real(colo_v, real_codes)          # referencia real de la colonia
            benchmark = b if b is not None else value

            # Banda HONESTA ("Muy Baja"…"Muy Alta", sin "/100"). Si es estimado, se marca.
            band = _mn.band_from_abs(value)
            scores_in_cat.append({
                "code": code,
                "name": score_names.get(code, code),
                "nivel": band["nivel"], "etiqueta": band["etiqueta"], "color": band["color"],
                "vs_zona": _vs_zona(value, benchmark),
                "es_estimado": not is_real,
                "valor_barra": round(value, 1),   # solo para el ancho de la barra (no se muestra como "/100")
            })
            overall_scores.append(value)
        cat_avg = round(sum(s["valor_barra"] for s in scores_in_cat) / len(scores_in_cat), 1)
        cat_band = _mn.band_from_abs(cat_avg)
        categories.append({
            "key": cat_name,
            "label": _CAT_LABELS.get(cat_name, cat_name.capitalize()),
            "scores": scores_in_cat,
            "nivel": cat_band["nivel"], "etiqueta": cat_band["etiqueta"], "color": cat_band["color"],
            "es_estimado": any(s["es_estimado"] for s in scores_in_cat),
            "valor_barra": cat_avg,
        })

    overall = round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else 0
    overall_band = _mn.band_from_abs(overall if overall_scores else None)
    any_estimado = any(s["es_estimado"] for c in categories for s in c["scores"])

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

    response_data = {
        "project_id": project_id,
        "project_name": dev["name"],
        "colonia": dev["colonia"],
        "overall_nivel": overall_band["nivel"],
        "overall_etiqueta": overall_band["etiqueta"],
        "overall_color": overall_band["color"],
        "overall_valor_barra": overall,
        "es_estimado": any_estimado,
        "leyenda": ("Lectura de la zona en bandas — es una guía, no una calificación exacta."
                    + (" Algunos indicadores aún se estiman con el dato real de la zona." if any_estimado else "")),
        "categories": categories,
        "generated_at": _now().isoformat(),
    }
    # Apply data scoping — hides engagement_metrics for lower roles
    try:
        from data_scoping import scope_data
        response_data = scope_data(response_data, user, "project")
    except Exception:
        pass
    return response_data


@router.get("/ie/projects/{project_id}/improve")
async def ie_improve_recommendations(project_id: str, request: Request, code: str):
    """Return 3-4 concrete AI recommendations on how to improve a given IE score."""
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")
    from tenant_scope import assert_dev_project
    assert_dev_project(user, project_id)   # candado: no leer recomendaciones de proyecto ajeno

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


# Sistema constructivo: en lenguaje simple (el dev no es ingeniero). Cimentación + estructura.
SISTEMA_CONSTRUCTIVO_OPTS = {
    "cimentacion": {"label": "Cimentación", "options": [
        {"value": "zapatas", "label": "Zapatas", "hint": "Bases aisladas bajo cada columna · común en baja altura"},
        {"value": "losa", "label": "Losa de cimentación", "hint": "Una sola losa que reparte el peso"},
        {"value": "cajon", "label": "Cajón de cimentación", "hint": "Caja rígida · ideal en suelo blando (CDMX)"},
        {"value": "pilas", "label": "Pilas / Pilotes", "hint": "Columnas profundas hasta suelo firme · torres"},
        {"value": "mixta", "label": "Mixta", "hint": "Combinación de las anteriores"}]},
    "estructura": {"label": "Estructura", "options": [
        {"value": "concreto", "label": "Concreto armado", "hint": "Lo más común en México"},
        {"value": "acero", "label": "Acero", "hint": "Estructura metálica · torres y claros grandes"},
        {"value": "mixta", "label": "Mixta (acero + concreto)", "hint": "Combinación · común en altura"},
        {"value": "muros", "label": "Muros de carga", "hint": "Mampostería que sostiene · casas y baja altura"},
        {"value": "prefabricado", "label": "Prefabricado", "hint": "Piezas hechas en planta y montadas"}]},
}

# ─── Sello de confianza · traduce el sistema técnico a lenguaje del comprador (B1.5) ──
# Única fuente: la consume el wizard (preview), la ficha pública y el portal-preview.
# Rule-based hoy; built-for-endstate: luego enriquece con certificaciones reales / cálculo estructural.
_SELLO_CIMENTACION = {
    "cajon": "cimentación de cajón, pensada para el suelo blando de la Ciudad de México",
    "pilas": "cimentación de pilas que llega a suelo firme, lo más sólido para torres",
    "losa": "losa de cimentación que reparte el peso de forma pareja",
    "zapatas": "cimentación de zapatas, robusta y probada",
    "mixta": "cimentación mixta, tomando lo mejor de cada sistema",
}
_SELLO_ESTRUCTURA = {
    "concreto": "estructura de concreto armado, la más probada en México",
    "acero": "estructura de acero, ligera y resistente para grandes espacios",
    "mixta": "estructura mixta de acero y concreto, ideal en altura",
    "muros": "muros de carga, nobleza estructural para vivienda baja",
    "prefabricado": "elementos prefabricados con control de calidad de planta",
}


def construction_seal(sistema: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Convierte {cimentacion, estructura} en un sello de confianza para el comprador."""
    sistema = sistema or {}
    cim, est = sistema.get("cimentacion"), sistema.get("estructura")
    partes, badges = [], []
    if cim:
        partes.append(_SELLO_CIMENTACION.get(cim, cim))
        badges.append({"label": "Cimentación", "value": cim})
    if est:
        partes.append(_SELLO_ESTRUCTURA.get(est, est))
        badges.append({"label": "Estructura", "value": est})
    if not partes:
        return {"configured": False, "titulo": "", "descripcion": "", "badges": []}
    nota = ""
    if cim in ("cajon", "pilas") or est in ("concreto", "acero", "mixta"):
        nota = " Pensado para el suelo y la actividad sísmica de la Ciudad de México."
    return {
        "configured": True, "titulo": "Construcción con respaldo",
        "descripcion": "Construido con " + " y ".join(partes) + "." + nota, "badges": badges,
    }


def suggest_sistema(tipo_proyecto: Optional[str]) -> Dict[str, str]:
    """Smart-default por tipo de proyecto (el dev confirma/ajusta)."""
    t = tipo_proyecto or ""
    if t in ("residencial_horizontal",):
        return {"cimentacion": "zapatas", "estructura": "muros"}
    if t in ("comercial",):
        return {"cimentacion": "pilas", "estructura": "acero"}
    # vertical / mixto / default → torre en CDMX
    return {"cimentacion": "cajon", "estructura": "concreto"}


async def _resolve_project_name(db, project_id: str, dev_org_id: str) -> Optional[str]:
    """Nombre del proyecto desde el seed o (proyectos del wizard) desde Mongo. None si no existe."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if dev:
        return dev.get("name")
    doc = (await db.projects.find_one({"$or": [{"id": project_id}, {"slug": project_id}], "dev_org_id": dev_org_id}, {"_id": 0, "name": 1})
           or await db.developments.find_one({"id": project_id, "dev_org_id": dev_org_id}, {"_id": 0, "name": 1}))
    return doc.get("name") if doc else None


@router.get("/construction/{project_id}/progress")
async def get_construction_progress(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    # Acepta proyectos del seed Y del wizard (cierra el ciclo crear→Avance de Obra · B1.5)
    project_name = await _resolve_project_name(db, project_id, _tenant(user))
    if not project_name:
        raise HTTPException(404, "Proyecto no encontrado")

    doc = await _get_or_seed_progress_doc(db, project_id, _tenant(user))

    # If an existing doc was created before Batch 2.1 without units, seed them now.
    if not doc.get("units"):
        seed_pct = doc.get("overall_percent", 0)
        units = _seed_units_from_project(project_id, initial_overall=seed_pct)
        if units:
            overall = round(sum(u["percent_complete"] for u in units) / len(units), 1)
            await db.project_construction_progress.update_one(
                {"project_id": project_id, "dev_org_id": _tenant(user)},
                {"$set": {"units": units, "per_unit_avg_percent": overall, "updated_at": _now().isoformat()}},
            )
            doc["units"] = units
            doc["per_unit_avg_percent"] = overall

    out = {
        "project_id": project_id,
        "project_name": project_name,
        **{k: v for k, v in doc.items() if k != "_id"},
    }
    out.setdefault("sistema_constructivo", {})
    out["sistema_options"] = SISTEMA_CONSTRUCTIVO_OPTS
    out["sello"] = construction_seal(out.get("sistema_constructivo"))
    return out


class SistemaConstructivoPatch(BaseModel):
    sistema_constructivo: Dict[str, str]


@router.patch("/construction/{project_id}/sistema")
async def patch_sistema_constructivo(project_id: str, payload: SistemaConstructivoPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    # Acepta proyectos del seed Y del wizard (B1.5)
    if not await _resolve_project_name(db, project_id, _tenant(user)):
        raise HTTPException(404, "Proyecto no encontrado")
    # asegura que el doc exista (lo siembra si hace falta)
    await _get_or_seed_progress_doc(db, project_id, _tenant(user))
    await db.project_construction_progress.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": {"sistema_constructivo": payload.sistema_constructivo, "updated_at": _now().isoformat()}},
        upsert=True,
    )
    return {"ok": True, "sistema_constructivo": payload.sistema_constructivo,
            "sello": construction_seal(payload.sistema_constructivo)}


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
    # Snapshot del avance al momento del comentario → el Registro muestra "fecha · % — nota".
    prev = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"_id": 0, "overall_percent": 1, "current_stage": 1},
    ) or {}
    entry = {
        "id": _uid("c"),
        "text": payload.text,
        "photo_url": payload.photo_url,
        "stage_key": payload.stage_key or prev.get("current_stage"),
        "overall_percent": prev.get("overall_percent", 0),
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
# BATCH 2.1 · Sub-Chunk C1 — IE COLONIA BENCHMARK
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/ie/projects/{project_id}/colonia-benchmark")
async def ie_colonia_benchmark(project_id: str, request: Request):
    """Return average IE scores of OTHER projects in same colonia (excluding self).
    Reuses the internal breakdown logic per peer project to compute per-category averages.
    """
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")
    from tenant_scope import assert_dev_project
    assert_dev_project(user, project_id)   # candado: no comparar desde un proyecto ajeno

    # Find peers in same colonia (by colonia_id)
    from data_developments import DEVELOPMENTS
    peers = [d for d in DEVELOPMENTS if d["colonia_id"] == dev["colonia_id"] and d["id"] != project_id]

    if not peers:
        return {
            "project_id": project_id, "colonia": dev["colonia"],
            "projects_count": 0,
            "score_avg": {"fundamentals": None, "market": None, "risk": None, "sentiment": None, "overall": None},
        }

    # Benchmark de pares anclado a DATO REAL (antes era random): absorción real del par +
    # señales reales de la colonia (compartida por todos los pares). Determinista, sin invención.
    from data_developments import inventory_stats
    _colrec = await db.colonias.find_one(
        {"id": dev.get("colonia_id")}, {"_id": 0, "precio_score": 1, "vsuelo_score": 1}) or {}
    _colparts = [v for v in (_colrec.get("precio_score"), _colrec.get("vsuelo_score")) if v is not None]

    def _peer_cat_scores(peer: dict) -> Dict[str, float]:
        parts = [inventory_stats(peer)["absorption_pct"]] + _colparts
        anchor = round(sum(parts) / len(parts), 1) if parts else 50.0
        cats = {cat: anchor for cat in SCORE_CATEGORIES}
        cats["overall"] = anchor
        return cats

    peer_cats = [_peer_cat_scores(p) for p in peers]
    n = len(peer_cats)
    score_avg = {
        k: round(sum(p[k] for p in peer_cats) / n, 1)
        for k in ("fundamentals", "market", "risk", "sentiment", "overall")
    }
    # Banda honesta del promedio de la zona (sin "/100").
    bandas_zona = {k: {**_mn.band_from_abs(v), "valor_barra": v} for k, v in score_avg.items()}

    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ie_colonia_benchmark_view",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "colonia": dev["colonia"], "peers": n},
            ai_decision={}, user_action={"action": "view"},
        )
    except Exception:
        pass

    return {
        "project_id": project_id,
        "colonia": dev["colonia"],
        "projects_count": n,
        "score_avg": score_avg,
        "bandas_zona": bandas_zona,
        "es_estimado": True,  # benchmark anclado a inventario real, pero estimación de zona
    }


# ═════════════════════════════════════════════════════════════════════════════
# BATCH 2.1 · Sub-Chunk B — NOTIFICATIONS + COMPETITOR ALERT TRIGGER
# ═════════════════════════════════════════════════════════════════════════════
ALERT_NOTIF_TYPE = "competitor_price_alert"


async def _fire_competitor_price_alert(
    db, *, dev_org_id: str, user_id: str, user_role: str,
    competitor_id: str, competitor_name: str,
    old_price_sqm: float, new_price_sqm: float, request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Core trigger: if delta breaches configured threshold, create notification and
    optionally send email via Resend. Returns a summary dict (ok, fired, delta_pct)."""
    if not old_price_sqm or old_price_sqm <= 0:
        return {"ok": True, "fired": False, "reason": "no_prev_price"}
    delta_pct = round(100 * (new_price_sqm - old_price_sqm) / old_price_sqm, 2)

    cfg = await db.dev_competitor_alert_config.find_one(
        {"dev_org_id": dev_org_id}, {"_id": 0}
    ) or {"price_delta_threshold_pct": 5.0, "absorption_threshold_pct": 65.0, "notify_email": True, "notify_inapp": True}

    threshold = float(cfg.get("price_delta_threshold_pct") or 5.0)
    # Fire only when competitor dropped below our price (delta_pct <= -threshold).
    if delta_pct > -threshold:
        return {"ok": True, "fired": False, "delta_pct": delta_pct, "threshold": threshold}

    channels = []
    if cfg.get("notify_inapp", True):
        channels.append("in_app")
    if cfg.get("notify_email", True):
        channels.append("email")

    notif = {
        "id": _uid("notif"),
        "user_id": user_id,
        "org_id": dev_org_id,
        "type": ALERT_NOTIF_TYPE,
        "payload": {
            "competitor_id": competitor_id,
            "competitor_name": competitor_name,
            "old_price_sqm": round(old_price_sqm, 2),
            "new_price_sqm": round(new_price_sqm, 2),
            "delta_pct": delta_pct,
            "threshold_pct": threshold,
        },
        "channels": channels,
        "read_at": None,
        "created_at": _now().isoformat(),
    }
    await db.notifications.insert_one(notif)

    # Email via Resend (best-effort)
    email_sent = False
    import os as _os
    resend_key = _os.environ.get("RESEND_API_KEY", "")
    recipient_email = None
    if "email" in channels and resend_key:
        try:
            me = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
            recipient_email = (me or {}).get("email")
            if recipient_email:
                import resend
                resend.api_key = resend_key
                resend.Emails.send({
                    "from": "DMX Alerts <alerts@desarrollosmx.io>",
                    "to": recipient_email,
                    "subject": f"Alerta precio: {competitor_name} bajó {-delta_pct}%",
                    "html": (
                        f"<h2>Alerta de competidor</h2>"
                        f"<p><strong>{competitor_name}</strong> redujo su precio/m² "
                        f"de ${int(old_price_sqm):,} a ${int(new_price_sqm):,} "
                        f"(Δ {delta_pct}%). Tu umbral: {threshold}%.</p>"
                        f"<p><a href='/desarrollador/competidores'>Ver radar de competidores</a></p>"
                    ),
                })
                email_sent = True
        except Exception as ex:
            import logging
            logging.getLogger("dmx").warning(f"[alert] Resend failed: {ex}")

    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, {"user_id": user_id, "role": user_role, "tenant_id": dev_org_id, "name": None},
            "create", "competitor_alert_fired", notif["id"],
            before=None, after={"competitor_id": competitor_id, "delta_pct": delta_pct, "threshold": threshold, "email_sent": email_sent},
            request=request,
        )
        await emit_ml_event(
            db, event_type="competitor_alert_triggered",
            user_id=user_id, org_id=dev_org_id, role=user_role,
            context={"competitor_id": competitor_id, "delta_pct": delta_pct, "threshold": threshold},
            ai_decision={"email_sent": email_sent, "channels": channels},
            user_action={},
        )
    except Exception:
        pass

    return {"ok": True, "fired": True, "notif_id": notif["id"], "delta_pct": delta_pct, "threshold": threshold, "email_sent": email_sent}


class CompetitorPriceSimulation(BaseModel):
    delta_pct: float = Field(..., ge=-50.0, le=50.0, description="Signed delta to apply to current price_sqm (e.g. -7 for 7%% drop)")


@router.post("/competitors/{competitor_id}/simulate-price-update")
async def simulate_competitor_price_update(competitor_id: str, payload: CompetitorPriceSimulation, request: Request):
    """DEBUG/QA — restrict or remove before prod launch.

    Simulates a competitor price change and runs the real alert trigger chain
    (notification creation + optional email + audit + ML event). Only
    accessible to developer_admin and superadmin.
    """
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin / superadmin pueden simular precios")
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    comp = DEVELOPMENTS_BY_ID.get(competitor_id)
    if not comp:
        raise HTTPException(404, "Competidor no encontrado")

    old_price_sqm = comp["price_from"] / max(1, comp["m2_range"][0])
    new_price_sqm = old_price_sqm * (1 + payload.delta_pct / 100)

    # Persist a snapshot in a dedicated collection (demo only).
    await db.dev_competitor_price_snapshots.insert_one({
        "id": _uid("psnap"),
        "competitor_id": competitor_id,
        "dev_org_id": _tenant(user),
        "old_price_sqm": old_price_sqm,
        "new_price_sqm": new_price_sqm,
        "delta_pct": payload.delta_pct,
        "simulated": True,
        "simulated_by": user.user_id,
        "ts": _now().isoformat(),
    })

    # Audit the simulation itself (separate entry type).
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "competitor_price_simulated", competitor_id,
            before={"price_sqm": round(old_price_sqm, 2)},
            after={"price_sqm": round(new_price_sqm, 2), "delta_pct": payload.delta_pct},
            request=request,
        )
    except Exception:
        pass

    trigger = await _fire_competitor_price_alert(
        db,
        dev_org_id=_tenant(user), user_id=user.user_id, user_role=user.role,
        competitor_id=competitor_id, competitor_name=comp["name"],
        old_price_sqm=old_price_sqm, new_price_sqm=new_price_sqm, request=request,
    )
    return {
        "ok": True, "competitor_id": competitor_id, "competitor_name": comp["name"],
        "old_price_sqm": round(old_price_sqm, 2),
        "new_price_sqm": round(new_price_sqm, 2),
        "delta_pct": payload.delta_pct,
        "trigger": trigger,
    }


@router.get("/notifications")
async def list_notifications(request: Request, unread_only: bool = False, limit: int = 50):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"org_id": _tenant(user), "user_id": user.user_id}
    if unread_only:
        q["read_at"] = None
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"org_id": _tenant(user), "user_id": user.user_id, "read_at": None})
    return {"items": items, "unread_count": unread}


@router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.notifications.update_one(
        {"id": nid, "user_id": user.user_id, "org_id": _tenant(user)},
        {"$set": {"read_at": _now().isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Notificación no encontrada")
    return {"ok": True, "id": nid}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.notifications.update_many(
        {"user_id": user.user_id, "org_id": _tenant(user), "read_at": None},
        {"$set": {"read_at": _now().isoformat()}},
    )
    return {"ok": True, "updated": r.modified_count}


# ═════════════════════════════════════════════════════════════════════════════
# BATCH 2.1 · Sub-Chunk C2 — PER-UNIT CONSTRUCTION PROGRESS
# ═════════════════════════════════════════════════════════════════════════════
STAGE_ORDER = ["cimentacion", "estructura", "instalaciones", "acabados", "entrega"]


def _stage_index(stage_key: str) -> int:
    try:
        return STAGE_ORDER.index(stage_key)
    except ValueError:
        return 0


def _seed_units_from_project(project_id: str, initial_overall: int = 0) -> List[Dict[str, Any]]:
    """Build per-unit progress seed from data_developments._generate_units output."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        return []
    now_iso = _now().isoformat()
    units_seed: List[Dict[str, Any]] = []
    for u in dev.get("units", []):
        # Approximate stage from initial_overall (even distribution).
        pct = max(0.0, min(100.0, float(initial_overall)))
        idx = _stage_index(
            "cimentacion" if pct < 20 else
            "estructura" if pct < 40 else
            "instalaciones" if pct < 60 else
            "acabados" if pct < 90 else
            "entrega"
        )
        units_seed.append({
            "unit_id": u["id"],
            "unit_number": u.get("unit_number"),
            "prototype": u.get("prototype"),
            "level": u.get("level"),
            "current_stage_index": idx,
            "current_stage": STAGE_ORDER[idx],
            "percent_complete": pct,
            "updated_at": now_iso,
        })
    return units_seed


async def _get_or_seed_progress_doc(db, project_id: str, dev_org_id: str) -> Dict[str, Any]:
    doc = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": dev_org_id}, {"_id": 0}
    )
    if doc and doc.get("units"):
        return doc
    # Doc parcial (p.ej. wizard guardó sistema_constructivo pero sin units todavía):
    # preservar lo que el dev ya capturó al re-sembrar (no pisarlo con un doc en blanco).
    _prev = doc or {}

    # Seed from development.progress
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id) or {}
    seed_pct = dev.get("construction_progress", {}).get("percentage", 0) if isinstance(dev.get("construction_progress"), dict) else dev.get("progress", 0)

    stages = []
    remaining = seed_pct
    for s in DEFAULT_STAGES:
        pct = min(100, remaining)
        stages.append({**s, "percent": max(0, pct), "updated_at": None})
        remaining = max(0, remaining - 100)
    current_idx = next((i for i, s in enumerate(stages) if s["percent"] < 100), len(stages) - 1)

    units = _seed_units_from_project(project_id, initial_overall=seed_pct)
    overall = round(sum(u["percent_complete"] for u in units) / len(units), 1) if units else seed_pct

    doc = {
        "project_id": project_id,
        "dev_org_id": dev_org_id,
        "stages": stages,
        "current_stage": stages[current_idx]["key"] if stages else None,
        "overall_percent": overall,
        "per_unit_avg_percent": overall,
        "units": units,
        "photos": _prev.get("photos", []),
        "comments": _prev.get("comments", []),
        "sistema_constructivo": _prev.get("sistema_constructivo", {}),
        "updated_at": _now().isoformat(),
    }
    # Best-effort upsert (keep idempotent)
    await db.project_construction_progress.update_one(
        {"project_id": project_id, "dev_org_id": dev_org_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return doc


class UnitProgressUpdate(BaseModel):
    unit_id: str
    percent_complete: float = Field(..., ge=0.0, le=100.0)
    current_stage: Optional[str] = None  # key in STAGE_ORDER (if not given, derived from percent)
    note: Optional[str] = None


@router.post("/construction/{project_id}/unit-update")
async def update_unit_progress(project_id: str, payload: UnitProgressUpdate, request: Request):
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID
    if project_id not in DEVELOPMENTS_BY_ID:
        raise HTTPException(404, "Proyecto no encontrado")

    doc = await _get_or_seed_progress_doc(db, project_id, _tenant(user))
    units = list(doc.get("units") or [])

    # Find unit
    target_idx = next((i for i, u in enumerate(units) if u["unit_id"] == payload.unit_id), None)
    if target_idx is None:
        raise HTTPException(404, f"Unidad {payload.unit_id} no encontrada en el proyecto")

    prev = dict(units[target_idx])
    stage_key = payload.current_stage or (
        "cimentacion" if payload.percent_complete < 20 else
        "estructura" if payload.percent_complete < 40 else
        "instalaciones" if payload.percent_complete < 60 else
        "acabados" if payload.percent_complete < 90 else
        "entrega"
    )
    if stage_key not in STAGE_ORDER:
        raise HTTPException(400, f"current_stage inválido: {stage_key}")

    units[target_idx].update({
        "percent_complete": float(payload.percent_complete),
        "current_stage": stage_key,
        "current_stage_index": _stage_index(stage_key),
        "updated_at": _now().isoformat(),
    })

    # Recalculate overall server-side (avg of units.percent_complete)
    overall = round(sum(u["percent_complete"] for u in units) / len(units), 1) if units else 0.0

    # Also re-seed stages aggregate to reflect units.
    stages = doc.get("stages") or [dict(s) for s in DEFAULT_STAGES]
    # Bucket units into stages (0-20/20-40/40-60/60-90/90-100) and compute per-stage average
    buckets: Dict[str, List[float]] = {k: [] for k in STAGE_ORDER}
    for u in units:
        sk = u.get("current_stage") or "cimentacion"
        if sk in buckets:
            buckets[sk].append(u.get("percent_complete", 0))
    for s in stages:
        vals = buckets.get(s["key"], [])
        if vals:
            s["percent"] = round(sum(vals) / len(vals), 1)
            s["updated_at"] = _now().isoformat()
    current = next((s["key"] for s in stages if s["percent"] < 100), stages[-1]["key"] if stages else None)

    await db.project_construction_progress.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": {
            "project_id": project_id,
            "dev_org_id": _tenant(user),
            "units": units,
            "stages": stages,
            "overall_percent": overall,
            "per_unit_avg_percent": overall,
            "current_stage": current,
            "updated_at": _now().isoformat(),
            "updated_by": user.user_id,
        }},
        upsert=True,
    )

    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "update", "construction_unit_progress", payload.unit_id,
            before={"percent_complete": prev.get("percent_complete"), "current_stage": prev.get("current_stage")},
            after={"percent_complete": payload.percent_complete, "current_stage": stage_key, "note": payload.note},
            request=request,
        )
        await emit_ml_event(
            db, event_type="avance_obra_unit_update",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id, "unit_id": payload.unit_id, "stage": stage_key},
            ai_decision={},
            user_action={"percent_complete": payload.percent_complete},
        )
    except Exception:
        pass

    return {
        "ok": True, "project_id": project_id, "unit_id": payload.unit_id,
        "percent_complete": payload.percent_complete, "current_stage": stage_key,
        "overall_percent": overall, "current_project_stage": current,
    }


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
    # Batch 2.1 — notifications + price snapshots
    await db.notifications.create_index(
        [("org_id", 1), ("user_id", 1), ("read_at", 1), ("created_at", -1)], background=True
    )
    await db.notifications.create_index([("type", 1)], background=True)
    await db.notifications.create_index([("id", 1)], unique=True, background=True)
    await db.dev_competitor_price_snapshots.create_index(
        [("dev_org_id", 1), ("competitor_id", 1), ("ts", -1)], background=True
    )
    import logging
    logging.getLogger("dmx").info("[dev_batch2] indexes ensured")
