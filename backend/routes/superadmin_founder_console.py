"""W2.6 SA8 — Founder Console routes.

Prefix: /api/superadmin/founder-console · all require_superadmin.

Surfaces:
  • Cross-functional executive KPIs (MRR/ARR/active tenants/AI cost/alerts)
  • Anomalies feed (insert via anomaly_detection_engine cron + manual trigger)
  • Cmd+K command palette (built-in + dynamic registry)
  • Quick actions toolbar (per-user CRUD)
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import anomaly_detection_engine as anom

log = logging.getLogger("dmx.routes_superadmin_founder_console")

router = APIRouter(tags=["superadmin_founder_console"])
PREFIX = "/api/superadmin/founder-console"


def _db(request: Request):
    return request.app.state.db


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ResolveBody(BaseModel):
    resolution_note: str = Field("", max_length=500)


class DismissBody(BaseModel):
    reason: str = Field("", max_length=300)


class CommandExecBody(BaseModel):
    command_id: str
    payload: Optional[Dict[str, Any]] = None


class QuickActionBody(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    action_type: Literal["impersonate", "suspend", "navigate", "api_call"]
    payload: Dict[str, Any] = {}
    sort_order: int = 0


# ─── 1) GET /dashboard ────────────────────────────────────────────────────────
@router.get(PREFIX + "/dashboard")
async def dashboard_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)

    # LOS CLIENTES VIVEN EN `dev_orgs`, NO EN `tenants` (auditoría 07-26). `db.tenants` está VACÍA
    # (0 documentos) y esta pantalla la leía, así que el inicio decía "Clientes: 0" mientras la
    # pantalla de Clientes —a la que ese mismo número te lleva al hacer clic— mostraba 6. Y por lo
    # mismo los ingresos salían en $0 siempre.
    _orgs = [o async for o in db.dev_orgs.find(
        {}, {"_id": 0, "tenant_id": 1, "name": 1, "status": 1, "plan_tier": 1})]
    # "por reclamar" = se dio de alta pero el cliente todavía no entra. No es un cliente activo.
    active_tenants = sum(1 for o in _orgs if (o.get("status") or "active") not in ("pending_claim", "suspended"))
    trial_tenants = sum(1 for o in _orgs if o.get("status") == "trial")
    pending_claim = sum(1 for o in _orgs if o.get("status") == "pending_claim")

    # MRR/ARR — aggregate enabled tenant_features → join plan_templates
    mrr = 0.0
    try:
        # Build template price map
        tpl_price: Dict[str, float] = {}
        async for t in db.plan_templates.find({}, {"_id": 0, "id": 1, "plan_tier": 1, "price_mxn": 1}):
            if t.get("price_mxn") is not None:
                tpl_price[t.get("plan_tier")] = max(
                    tpl_price.get(t.get("plan_tier"), 0), float(t.get("price_mxn") or 0),
                )
        # El precio del plan de cada cliente real, tomando el más alto de sus funciones habilitadas.
        for o in _orgs:
            tid = o.get("tenant_id")
            if not tid:
                continue
            top_price = float(tpl_price.get(o.get("plan_tier")) or 0)
            async for f in db.tenant_features.find(
                    {"tenant_id": tid, "enabled": True}, {"_id": 0, "plan_tier": 1}):
                pt = f.get("plan_tier")
                if pt and tpl_price.get(pt):
                    top_price = max(top_price, tpl_price[pt])
            mrr += top_price
    except Exception as e:
        log.warning(f"[founder] mrr calc failed: {e}")

    # ESTO NO ES INGRESO: ES LO QUE SE FACTURARÍA SI TODOS PAGARAN SU PLAN. Hoy hay 0 suscripciones
    # y 0 cobros registrados, así que llamarlo "MRR" a secas sería inventar facturación — el mismo
    # error que las gráficas del inicio. Se reporta el cobrado (real) y el potencial, por separado.
    mrr_cobrado = 0.0
    try:
        async for pago in db.payments.find({"status": {"$in": ["paid", "succeeded"]}},
                                           {"_id": 0, "amount_mxn": 1}):
            mrr_cobrado += float(pago.get("amount_mxn") or 0)
    except Exception:  # noqa: BLE001
        pass
    mrr_potencial = round(mrr, 2)
    mrr = mrr_cobrado
    arr = round(mrr * 12, 2)

    # Churn risk: tenants pro/enterprise inactive >7d
    churn_risk = 0
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        for t in [o for o in _orgs if o.get("plan_tier") in ("pro", "enterprise")]:
            tid = t.get("tenant_id")
            if not tid:
                continue
            recent = await db.audit_log.find_one(
                {"actor.tenant_id": tid, "ts": {"$gte": cutoff}}, {"_id": 0, "ts": 1},
            )
            if not recent:
                churn_risk += 1
    except Exception:
        pass

    # AI cost MTD + forecast
    ai_cost_mtd = 0.0
    ai_cost_forecast = 0.0
    try:
        from ai_cost_aggregations import overview as ai_overview
        ov = await ai_overview(db, "month")
        ai_cost_mtd = float((ov.get("totals") or {}).get("mxn") or 0)
        ai_cost_forecast = float(ov.get("forecast_eom_mxn") or 0)
    except Exception as e:
        log.warning(f"[founder] ai cost overview failed: {e}")

    # Alerts open critical
    alerts_open_critical = 0
    try:
        alerts_open_critical = await db.system_alerts.count_documents(
            {"resolved_at": None, "severity": "critical"},
        )
    except Exception:
        pass

    # Ingestion pending
    ingestion_pending = 0
    try:
        ingestion_pending = await db.bulk_ingest_jobs.count_documents(
            {"status": {"$in": ["pending", "processing"]}},
        )
    except Exception:
        pass

    # Total developments / units / leads_30d / conversion_30d
    total_devs = await db.developments.count_documents({})
    # Add seeded dev count
    try:
        from data_developments import DEVELOPMENTS as _SD
        total_devs += len(_SD)
    except Exception:
        pass
    total_units = await db.units.count_documents({})
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    leads_30d = await db.leads.count_documents({"created_at": {"$gte": cutoff_30d}})

    # Conversion 30d (rough): leads won / leads total
    leads_won_30d = 0
    try:
        leads_won_30d = await db.leads.count_documents({
            "created_at": {"$gte": cutoff_30d},
            "status": {"$in": ["won", "ganado", "cerrado", "closed"]},
        })
    except Exception:
        pass
    conversion_rate_30d = round((leads_won_30d / max(leads_30d, 1)) * 100, 2) if leads_30d else 0

    # LAS CRÍTICAS NUNCA SE VEÍAN (auditoría 07-26). Se ordenaba por `severity` descendente, y como
    # es texto eso significa orden ALFABÉTICO: "warning" > "info" > "critical". Resultado: había
    # **84 críticas sin resolver** y el top-5 mostraba 5 advertencias. Llevaban semanas invisibles.
    #
    # Además las que salían no se podían abrir: `id` venía en `None` porque el identificador vive en
    # `details.id`. Un aviso que no se puede abrir ni resolver es decoración.
    _ORDEN = {"critical": 0, "error": 1, "warning": 2, "info": 3}
    top_alerts = []
    try:
        crudas = [a async for a in db.system_alerts.find(
            {"resolved_at": None}, {"_id": 0}).sort("ts", -1).limit(400)]
        crudas.sort(key=lambda a: (_ORDEN.get(str(a.get("severity") or "").lower(), 9),
                                   str(a.get("ts") or ""),))
        for a in crudas[:5]:
            det = a.get("details") or {}
            top_alerts.append({
                "id": a.get("id") or det.get("id") or a.get("alert_id"),
                "severity": a.get("severity"),
                "source": a.get("source"),
                "message": a.get("message") or a.get("title"),
                "ts": a.get("ts"),
            })
    except Exception:  # noqa: BLE001
        log.warning("[founder] top de alertas falló", exc_info=True)

    # Anomalies open
    anomalies_open = 0
    try:
        anomalies_open = await db.founder_anomalies.count_documents({"status": "open"})
    except Exception:
        pass

    return {
        # `mrr_estimated_mxn` es lo COBRADO de verdad (hoy 0: no hay ni una suscripción registrada).
        # Lo que se facturaría si todos pagaran su plan va aparte y con su nombre, para que nadie lo
        # lea como ingreso — es el mismo cuidado que con las gráficas fabricadas.
        "mrr_estimated_mxn": round(mrr, 2),
        "arr_estimated_mxn": arr,
        "mrr_potencial_mxn": mrr_potencial,
        "mrr_nota": ("Cobrado: $0 — todavía no hay suscripciones activas. "
                     f"Si los {len(_orgs)} clientes dados de alta pagaran su plan, serían "
                     f"${mrr_potencial:,.0f} al mes." if not mrr else None),
        "active_tenants_count": active_tenants,
        "pending_claim_count": pending_claim,
        "clientes_dados_de_alta": len(_orgs),
        "trial_tenants_count": trial_tenants,
        "churn_risk_count": churn_risk,
        "ai_cost_mtd_mxn": ai_cost_mtd,
        "ai_cost_forecast_mxn": ai_cost_forecast,
        "alerts_open_critical": alerts_open_critical,
        "ingestion_jobs_pending": ingestion_pending,
        "anomalies_open_count": anomalies_open,
        "total_developments": total_devs,
        "total_units": total_units,
        "total_leads_30d": leads_30d,
        "conversion_rate_30d": conversion_rate_30d,
        "top_5_alerts": top_alerts,
        "computed_at": _iso(),
    }


# ─── Demand Insights (oportunidad #3): demanda → superadmin ("¿dónde construir?") ──
# Cruza facts_buyer_signals (interés por zona, ya K-anon≥3) con demanda_insatisfecha (qué NO encontraron) → el founder
# ve dónde hay demanda Y qué falta = dónde conviene construir. Hace VISIBLE el cubo de demanda (cierra el ciclo #1).
@router.get(PREFIX + "/demand-insights")
async def demand_insights(request: Request, limit: int = 12):
    await _require_superadmin(request)
    db = _db(request)
    zonas: Dict[str, Any] = {}
    async for f in db.facts_buyer_signals.find({"scope": "colonia"}, {"_id": 0}).sort("interest_score", -1).limit(80):
        col = f.get("colonia")
        if not col:
            continue
        zonas[str(col).lower()] = {
            "colonia": col,
            "interes": round(f.get("interest_score") or 0, 1),
            "visitantes": f.get("distinct_visitors") or 0,
            "signals": f.get("signals") or {},
            "falta": [],
        }
    async for d in db.demanda_insatisfecha.find({}, {"_id": 0, "zona": 1, "falta_top": 1}):
        z = str(d.get("zona") or "").lower()
        if z in zonas:
            ft = d.get("falta_top") or []
            zonas[z]["falta"] = ft[:5] if isinstance(ft, list) else []
    rows = sorted(zonas.values(), key=lambda r: -r["interes"])[:max(1, min(int(limit or 12), 40))]
    # Oportunidad #4: en qué TRANSIGE el mercado cuando no encuentra todo (buyer_elasticidad) → señal de producto/precio.
    concesiones = []
    try:
        async for r in db.buyer_elasticidad.aggregate([
            {"$group": {"_id": "$cedio", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 5},
        ]):
            if r.get("_id"):
                concesiones.append({"cedio": r["_id"], "n": r["n"]})
    except Exception:
        pass
    return {
        "ok": True, "zonas": rows, "n": len(rows), "concesiones": concesiones,
        "fuente": "buyer_signals (K-anon≥3) + demanda_insatisfecha + buyer_elasticidad", "computed_at": _iso(),
    }


# ─── Studio Opportunities (oportunidad #5): el porqué del NO → venta de Studio ──
# Surfacea gap_presentacion (devs que la demanda rechaza por las FOTOS aunque encajen) al founder = pipeline de venta
# de Studio/staging. Reusa buyer_cycle_intel (no duplica la lógica del grafo de rechazo del Fix F4).
@router.get(PREFIX + "/studio-opportunities")
async def studio_opportunities(request: Request, dias: int = 30):
    await _require_superadmin(request)
    db = _db(request)
    try:
        from routes.superadmin_copiloto import buyer_cycle_intel
        intel = await buyer_cycle_intel(db, dias)
        atlax = (intel or {}).get("atlax") or {}
        return {
            "ok": True,
            "gap_presentacion": atlax.get("gap_presentacion") or [],
            "rechazo_por_motivo": atlax.get("rechazo_por_motivo") or [],
            "computed_at": _iso(),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "gap_presentacion": [], "rechazo_por_motivo": [], "error": str(e)[:120]}


# ─── Diseño generativo de producto (cuña brújula): demanda → "¿qué construir aquí?" ──
# Conecta la tarjeta de demanda con el motor generador_producto_engine (REUSO, no se duplica): dada una colonia, la
# mezcla óptima de unidades/amenidades/precio que la demanda SÍ quiere + la evidencia del hueco (demanda_insatisfecha).
@router.get(PREFIX + "/product-brief")
async def product_brief(request: Request, colonia: str, terreno_m2: float = 1000):
    await _require_superadmin(request)
    db = _db(request)
    col = str(colonia or "").strip().lower()
    out: Dict[str, Any] = {"ok": True, "colonia": col, "terreno_m2": terreno_m2}
    try:
        from generador_producto_engine import generar_producto
        out["brief"] = await generar_producto(db, col, float(terreno_m2 or 1000), "media")
    except Exception as e:  # noqa: BLE001
        out["brief"] = None
        out["error"] = str(e)[:120]
    try:
        d = await db.demanda_insatisfecha.find_one({"zona": col}, {"_id": 0, "falta_top": 1})
        out["falta"] = (d or {}).get("falta_top") or []
    except Exception:  # noqa: BLE001
        out["falta"] = []
    return out


# ─── Gemelo de Demanda (moonshot): el "SimCity de la demanda de MX" consultable ──
@router.get(PREFIX + "/demand-twin")
async def demand_twin(request: Request, limit: int = 60):
    await _require_superadmin(request)
    from demand_twin_engine import build_demand_twin
    rows = await build_demand_twin(_db(request), limit)
    return {"ok": True, "zonas": rows, "n": len(rows), "computed_at": _iso()}


# ─── 2) GET /anomalies ────────────────────────────────────────────────────────
@router.get(PREFIX + "/anomalies")
async def list_anomalies(
    request: Request,
    status: Optional[Literal["open", "investigating", "resolved", "dismissed"]] = None,
    severity: Optional[Literal["critical", "warning", "info"]] = None,
    source: Optional[str] = None,
    limit: int = Query(20, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    else:
        q["status"] = {"$in": ["open", "investigating"]}
    if severity:
        q["severity"] = severity
    if source:
        q["source"] = source
    cur = db.founder_anomalies.find(q, {"_id": 0}).sort([("detected_at", -1)]).skip(skip).limit(limit)
    items = [d async for d in cur]
    total = await db.founder_anomalies.count_documents(q)
    return {"items": items, "total": total, "filters": {"status": status,
                                                          "severity": severity,
                                                          "source": source}}


# ─── 3) POST /anomalies/:id/resolve ───────────────────────────────────────────
@router.post(PREFIX + "/anomalies/{anomaly_id}/resolve")
async def resolve_anomaly(anomaly_id: str, body: ResolveBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    before = await db.founder_anomalies.find_one({"id": anomaly_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Anomalía no encontrada")
    if before.get("status") in ("resolved", "dismissed"):
        return {"ok": True, "anomaly": before, "no_change": True}
    upd = {
        "status": "resolved",
        "resolved_by": user.user_id,
        "resolved_at": _iso(),
        "resolution_note": body.resolution_note,
    }
    await db.founder_anomalies.update_one({"id": anomaly_id}, {"$set": upd})
    after = await db.founder_anomalies.find_one({"id": anomaly_id}, {"_id": 0})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "resolve", "founder_anomaly", anomaly_id,
                           before=before, after=after, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (resolve founder_anomaly %s): %s", anomaly_id, _e)
    return {"ok": True, "anomaly": after}


# ─── 4) POST /anomalies/:id/dismiss ───────────────────────────────────────────
@router.post(PREFIX + "/anomalies/{anomaly_id}/dismiss")
async def dismiss_anomaly(anomaly_id: str, body: DismissBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    before = await db.founder_anomalies.find_one({"id": anomaly_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Anomalía no encontrada")
    if before.get("status") in ("resolved", "dismissed"):
        return {"ok": True, "anomaly": before, "no_change": True}
    upd = {
        "status": "dismissed",
        "resolved_by": user.user_id,
        "resolved_at": _iso(),
        "dismiss_reason": body.reason,
    }
    await db.founder_anomalies.update_one({"id": anomaly_id}, {"$set": upd})
    after = await db.founder_anomalies.find_one({"id": anomaly_id}, {"_id": 0})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "dismiss", "founder_anomaly", anomaly_id,
                           before=before, after=after, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (dismiss founder_anomaly %s): %s", anomaly_id, _e)
    return {"ok": True, "anomaly": after}


# ─── 5) POST /anomalies/detect-now ────────────────────────────────────────────
@router.post(PREFIX + "/anomalies/detect-now")
async def trigger_anomaly_detection(request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    result = await anom.run_anomaly_detection(db)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "trigger", "founder_anomaly_detection",
                           "manual", before=None, after=result, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (trigger founder_anomaly_detection manual): %s", _e)
    return result


# ─── 6) GET /commands?q= ──────────────────────────────────────────────────────
async def _build_command_registry(db) -> List[Dict[str, Any]]:
    """Built-in + dynamic command list. Dynamic items: top tenants + last snapshots."""
    items: List[Dict[str, Any]] = []

    # Static navigation
    NAV = [
        ("nav_dashboard", "Inicio · Founder Console", "/superadmin", "LayoutDashboard"),
        ("nav_tenants", "Ir a Tenants", "/superadmin/tenants", "Users"),
        ("nav_metrics_cube", "Cubo de métricas", "/superadmin/metrics-cube", "Layers"),
        ("nav_ai_cost", "Costos IA", "/superadmin/ai-cost", "DollarSign"),
        ("nav_commercial", "Comercial", "/superadmin/commercial", "Briefcase"),
        ("nav_audit", "Auditoría", "/superadmin/audit-log", "Shield"),
        ("nav_health", "Salud del sistema", "/superadmin/health", "Activity"),
        ("nav_data_sources", "Conectores", "/superadmin/data-sources", "Plug"),
        ("nav_observability", "Observabilidad", "/superadmin/observability", "Eye"),
        ("nav_drive", "Drive", "/superadmin/drive", "FolderOpen"),
        ("nav_bulk", "Ingesta masiva", "/superadmin/bulk-ingest", "FolderUp"),
        ("nav_scores", "Scores", "/superadmin/scores", "BarChart3"),
    ]
    for cid, label, route, icon in NAV:
        items.append({
            "id": cid, "label": label, "category": "Navegación",
            "icon_key": icon, "action": "navigate",
            "payload": {"route": route},
        })

    # System actions
    items.extend([
        {"id": "sys_refresh_cube", "label": "Refrescar metrics cube",
         "category": "Sistema", "icon_key": "RefreshCw", "action": "api_call",
         "payload": {"method": "POST", "url": "/api/superadmin/metrics-cube/refresh"}},
        {"id": "sys_detect_anomalies", "label": "Detectar anomalías ahora",
         "category": "Sistema", "icon_key": "AlertCircle", "action": "api_call",
         "payload": {"method": "POST", "url": "/api/superadmin/founder-console/anomalies/detect-now"}},
        {"id": "sys_run_trial_check", "label": "Verificar trials expirados",
         "category": "Sistema", "icon_key": "Clock", "action": "api_call",
         "payload": {"method": "POST", "url": "/api/superadmin/commercial/trials/run-check"}},
    ])

    # Top 10 tenants by recent activity → impersonate
    try:
        tenants_recent: List[Dict[str, Any]] = []
        async for t in db.tenants.find({}, {"_id": 0, "id": 1, "name": 1}).limit(20):
            tenants_recent.append(t)
        for t in tenants_recent[:10]:
            tid = t.get("id")
            tname = t.get("name") or tid
            if not tid:
                continue
            items.append({
                "id": f"impersonate_{tid}", "label": f"Impersonar {tname}",
                "category": "Tenants", "icon_key": "UserCheck", "action": "impersonate",
                "payload": {"tenant_id": tid},
            })
    except Exception:
        pass

    # Last 5 snapshots → apply
    try:
        async for s in db.tenant_snapshots.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(5):
            sid = s.get("id")
            sname = s.get("name") or sid
            if not sid:
                continue
            items.append({
                "id": f"snapshot_view_{sid}", "label": f"Ver snapshot · {sname}",
                "category": "Snapshots", "icon_key": "Camera", "action": "navigate",
                "payload": {"route": "/superadmin/commercial?tab=snapshots"},
            })
    except Exception:
        pass

    # FASE B · EL CATÁLOGO EN EL ⌘K: las 111 piezas del catálogo entran como comandos navegables,
    # con su lenguaje humano — así el founder llega a CUALQUIER herramienta desde el buscador global.
    try:
        from catalogo_maestro import construir_catalogo, DOMINIOS
        cat = construir_catalogo()
        for p in cat.get("piezas", []):
            if not p.get("ruta_ui"):
                continue
            dom = DOMINIOS.get(p["dominio"], {})
            items.append({
                "id": f"cat_{p['id']}", "label": p["titulo"],
                "sublabel": p.get("que_es", ""),
                "category": f"{dom.get('icono', '')} {dom.get('titulo', p['dominio'])}".strip(),
                "icon_key": "Search", "action": "navigate",
                "payload": {"route": p["ruta_ui"]},
            })
    except Exception:
        pass

    return items


@router.get(PREFIX + "/commands")
async def commands_route(
    request: Request,
    q: Optional[str] = Query(None, max_length=80),
    limit: int = Query(50, ge=1, le=200),
):
    await _require_superadmin(request)
    db = _db(request)
    items = await _build_command_registry(db)
    if q:
        ql = q.lower()
        items = [i for i in items
                 if ql in (i.get("label") or "").lower()
                 or ql in (i.get("category") or "").lower()]
    return {"items": items[:limit], "total": len(items), "q": q or ""}


# ─── 7) POST /commands/execute ────────────────────────────────────────────────
@router.post(PREFIX + "/commands/execute")
async def execute_command(body: CommandExecBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    items = await _build_command_registry(db)
    cmd = next((c for c in items if c.get("id") == body.command_id), None)
    if not cmd:
        raise HTTPException(404, "Comando desconocido")

    action = cmd.get("action")
    payload = {**(cmd.get("payload") or {}), **(body.payload or {})}
    result: Dict[str, Any] = {"ok": True, "command_id": body.command_id, "action": action}

    if action == "navigate":
        result["redirect_url"] = payload.get("route")
    elif action == "impersonate":
        # Reuse W1.2 superadmin impersonate endpoint (frontend will hit it)
        result["redirect_url"] = f"/api/superadmin/tenants/{payload.get('tenant_id')}/impersonate"
        result["method"] = "POST"
    elif action == "api_call":
        result["api_call"] = {
            "method": payload.get("method", "POST"),
            "url": payload.get("url"),
        }
    elif action == "suspend":
        # Frontend will hit /api/superadmin/tenants/{id}/suspend (W1.2)
        result["api_call"] = {
            "method": "POST",
            "url": f"/api/superadmin/tenants/{payload.get('tenant_id')}/suspend",
        }
    else:
        raise HTTPException(400, f"Action inválido: {action}")

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "execute", "founder_command", body.command_id,
            before=None, after={"action": action, "payload": payload},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (execute founder_command %s): %s", body.command_id, _e)
    return result


# ─── 8) /quick-actions CRUD ───────────────────────────────────────────────────
@router.get(PREFIX + "/quick-actions")
async def list_quick_actions(request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    cur = db.founder_quick_actions.find({"user_id": user.user_id}, {"_id": 0}).sort("sort_order", 1)
    items = [d async for d in cur]
    if not items:
        # Seed defaults on first read
        defaults = [
            {"label": "Refrescar metrics cube", "action_type": "api_call",
             "payload": {"method": "POST",
                         "url": "/api/superadmin/metrics-cube/refresh"},
             "sort_order": 0, "icon_key": "RefreshCw"},
            {"label": "Ver alertas críticas", "action_type": "navigate",
             "payload": {"route": "/superadmin/health?severity=critical"},
             "sort_order": 1, "icon_key": "AlertTriangle"},
            {"label": "Costos IA mes", "action_type": "navigate",
             "payload": {"route": "/superadmin/ai-cost"},
             "sort_order": 2, "icon_key": "DollarSign"},
            {"label": "Detectar anomalías", "action_type": "api_call",
             "payload": {"method": "POST",
                         "url": "/api/superadmin/founder-console/anomalies/detect-now"},
             "sort_order": 3, "icon_key": "Sparkles"},
            {"label": "Crear snapshot", "action_type": "navigate",
             "payload": {"route": "/superadmin/commercial?tab=snapshots"},
             "sort_order": 4, "icon_key": "Camera"},
            {"label": "Ingestar Drive", "action_type": "navigate",
             "payload": {"route": "/superadmin/bulk-ingest"},
             "sort_order": 5, "icon_key": "FolderUp"},
        ]
        # SEMBRAR SIN DUPLICAR (auditoría 07-26). Esto insertaba a ciegas cuando la lista venía
        # vacía, y dos cargas simultáneas de la pantalla veían las dos "vacío" y sembraban las dos:
        # el founder terminó con 12 botones que son 6 repetidos. Con `upsert` por (usuario, etiqueta)
        # sembrar dos veces deja el mismo resultado que sembrar una.
        for d in defaults:
            await db.founder_quick_actions.update_one(
                {"user_id": user.user_id, "label": d["label"]},
                {"$set": {**d, "user_id": user.user_id},
                 "$setOnInsert": {"id": "qa_" + secrets.token_urlsafe(8), "created_at": _iso()}},
                upsert=True,
            )
        cur = db.founder_quick_actions.find(
            {"user_id": user.user_id}, {"_id": 0},
        ).sort("sort_order", 1)
        items = [d async for d in cur]
    return {"items": items, "total": len(items)}


@router.post(PREFIX + "/quick-actions")
async def create_quick_action(body: QuickActionBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    doc = {
        "id": "qa_" + secrets.token_urlsafe(8),
        "user_id": user.user_id,
        "label": body.label,
        "action_type": body.action_type,
        "payload": body.payload,
        "sort_order": body.sort_order,
        "icon_key": "Star",
        "created_at": _iso(),
    }
    await db.founder_quick_actions.insert_one(dict(doc))
    return {"ok": True, "quick_action": {k: v for k, v in doc.items() if k != "_id"}}


@router.delete(PREFIX + "/quick-actions/{qa_id}")
async def delete_quick_action(qa_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    res = await db.founder_quick_actions.delete_one({
        "id": qa_id, "user_id": user.user_id,
    })
    if res.deleted_count == 0:
        raise HTTPException(404, "Quick action no encontrado")
    return {"ok": True}
