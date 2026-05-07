"""W2.9 Phase Z.2 — Intelligence Insights Engine.

Generates executive market briefs (Claude Sonnet) over the consolidated cube
(W2.5/W2.7/W2.8). Caches briefs in `db.intelligence_briefs` (TTL 90d, fresh
window 7 days). Builds multi-layer geo-points for the executive heatmap and
N×N comparables similarity matrix for side-by-side comparison.

Schema  `db.intelligence_briefs`:
    { id, zone_id, tier, period, generated_at, model, reasoning,
      key_findings[5], top_risks[3], opportunities[3],
      market_state: bull|stable|bear, confidence_pct, ai_cost_mxn }

Reuses:
  * metrics_cube_aggregations  (W2.5)  — current KPIs per zone
  * facts_daily_zone           (W2.7)  — last 30d snapshots
  * cube_olap_engine           (W2.8)  — comparables
  * ai_budget                          — track + gating
"""
from __future__ import annotations

import logging
import os
import secrets
import statistics
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.intelligence_insights_engine")

FRESH_DAYS = 7
TTL_DAYS = 90
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
INTERNAL_TENANT = "dmx_internal"
FOUNDER_EMAIL = os.environ.get("FOUNDER_ALERT_EMAIL", "founder@desarrollosmx.com")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return "brief_" + secrets.token_urlsafe(10)


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.intelligence_briefs.create_index(
            [("zone_id", 1), ("tier", 1), ("period", 1), ("generated_at", -1)],
            name="brief_zone_period",
        )
        await db.intelligence_briefs.create_index("id", unique=True, name="brief_id_uniq")
        # TTL: 90 days from generated_at_dt (BSON Date)
        await db.intelligence_briefs.create_index(
            "generated_at_dt", expireAfterSeconds=TTL_DAYS * 86400,
            name="brief_ttl_90d",
        )
    except Exception as e:
        log.warning(f"[intel] ensure_indexes failed: {e}")


# ─── Brief generation ─────────────────────────────────────────────────────────

async def _gather_context(db, zone_id: str, tier: str, period: str) -> Dict[str, Any]:
    """Collect KPIs + last-30d facts + comparables for the prompt."""
    cube_row = await db.cube_aggregations.find_one(
        {"tier": tier, "tier_id": zone_id, "period": period}, {"_id": 0},
    )
    kpis = (cube_row or {}).get("kpis") or {}
    geo = (cube_row or {}).get("geo") or {}
    name = (cube_row or {}).get("name") or zone_id

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    facts_cur = db.facts_daily_zone.find(
        {"meta.zone_id": zone_id, "meta.tier": tier, "ts": {"$gte": cutoff}},
        {"_id": 0, "ts": 1, "kpis": 1},
    ).sort([("ts", 1)])
    facts: List[Dict[str, Any]] = [d async for d in facts_cur]

    growth = None
    if len(facts) >= 2:
        first = (facts[0].get("kpis") or {}).get("avg_price_per_m2")
        last = (facts[-1].get("kpis") or {}).get("avg_price_per_m2")
        if first and last and first > 0:
            growth = round((last - first) / first * 100, 2)

    # 5 cheapest comparables nearby (uses cube_olap_engine slice)
    comparables: List[Dict[str, Any]] = []
    try:
        import metrics_cube_aggregations as cube
        comps = await cube.find_comparables(db, zone_id, radius_km=2, limit=5)
        comparables = comps or []
    except Exception:
        pass

    return {
        "name": name, "kpis": kpis, "geo": geo,
        "growth_pct_30d": growth,
        "facts_count": len(facts),
        "comparables": comparables,
    }


async def _claude_sonnet_brief(ctx: Dict[str, Any], zone_id: str, period: str) -> Dict[str, Any]:
    """Single Sonnet call returning structured executive brief."""
    api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _stub_brief(ctx, reason="EMERGENT_LLM_KEY missing")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception:
        return _stub_brief(ctx, reason="emergentintegrations no instalado")

    kpis = ctx.get("kpis") or {}
    comp_lines = "\n".join([
        f"- {c.get('name')}: {c.get('avg_price_per_m2', '—')} MXN/m², "
        f"{c.get('units_total', 0)} unidades"
        for c in (ctx.get("comparables") or [])[:5]
    ]) or "(sin comparables disponibles)"

    prompt = (
        "Eres un analista ejecutivo de bienes raíces residenciales nuevos en CDMX. "
        "Genera un brief estratégico para un inversionista institucional. "
        "Responde SOLO con JSON válido en español MX, sin markdown, sin texto fuera del JSON. "
        "Schema:\n"
        "{\n"
        '  "key_findings": [str x5 máx 140 chars c/u],\n'
        '  "top_risks": [str x3 máx 140 chars c/u],\n'
        '  "opportunities": [str x3 máx 140 chars c/u],\n'
        '  "market_state": "bull"|"stable"|"bear",\n'
        '  "confidence_pct": int 0-100,\n'
        '  "reasoning": str máx 600 chars\n'
        "}\n\n"
        f"Zona: {ctx.get('name')} (id={zone_id}, periodo={period})\n"
        f"KPIs: unidades_total={kpis.get('units_total')}, "
        f"unidades_vendidas={kpis.get('units_sold')}, "
        f"precio_promedio_mxn={kpis.get('avg_price_mxn')}, "
        f"precio_m2={kpis.get('avg_price_per_m2')}, "
        f"conversion={kpis.get('conversion_rate')}\n"
        f"Crecimiento precio/m² 30d: {ctx.get('growth_pct_30d')}%\n"
        f"Facts diarios disponibles: {ctx.get('facts_count')}\n"
        f"Comparables ({len((ctx.get('comparables') or []))}):\n{comp_lines}\n"
    )
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"intel-{secrets.token_urlsafe(6)}",
            system_message=(
                "Eres un analista financiero inmobiliario senior. "
                "Respondes SOLO JSON válido en español MX."
            ),
        ).with_model("anthropic", DEFAULT_MODEL)
        resp = await chat.send_message(UserMessage(text=prompt))
        text = (resp or "").strip()
        if "```" in text:
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
            text = text.strip("` \n")
        import json as _json
        data = _json.loads(text)
        return {
            "model": DEFAULT_MODEL,
            "reasoning": str(data.get("reasoning", ""))[:600],
            "key_findings": [str(s)[:160] for s in (data.get("key_findings") or [])][:5],
            "top_risks": [str(s)[:160] for s in (data.get("top_risks") or [])][:3],
            "opportunities": [str(s)[:160] for s in (data.get("opportunities") or [])][:3],
            "market_state": str(data.get("market_state") or "stable")[:10],
            "confidence_pct": int(data.get("confidence_pct") or 70),
            "ai_cost_mxn": 0.85,  # conservative MXN per Sonnet brief estimate
        }
    except Exception as e:
        log.warning(f"[intel] Sonnet brief failed: {e}")
        return _stub_brief(ctx, reason=str(e)[:120])


def _stub_brief(ctx: Dict[str, Any], reason: str) -> Dict[str, Any]:
    """Honest stub when Sonnet not available or budget exceeded.
    Surfaces a clear `stub_reason` so UI can flag it instead of pretending success.
    """
    kpis = ctx.get("kpis") or {}
    units = kpis.get("units_total") or 0
    state = "stable"
    growth = ctx.get("growth_pct_30d")
    if isinstance(growth, (int, float)):
        if growth > 5:
            state = "bull"
        elif growth < -5:
            state = "bear"
    return {
        "model": "stub",
        "reasoning": (
            f"Brief calculado heurísticamente sin IA (motivo: {reason}). "
            "Los hallazgos provienen de las métricas del cubo sin razonamiento Claude."
        ),
        "key_findings": [
            f"{units} unidades totales registradas en la zona.",
            f"Variación precio/m² 30d: {growth if growth is not None else '—'}%.",
            f"Conversión actual: {kpis.get('conversion_rate') or '—'}.",
            f"Precio promedio: {kpis.get('avg_price_mxn') or '—'} MXN.",
            "Dato insuficiente para hallazgos profundos sin IA.",
        ][:5],
        "top_risks": [
            "Brief sin razonamiento Claude — confiabilidad baja.",
            "Sin contexto macro ni comparables ponderados.",
            "Reintenta con presupuesto IA disponible.",
        ],
        "opportunities": [
            "Reactivar IA para análisis estratégico.",
            "Consultar zonas vecinas vía cubo OLAP.",
            "Revisar facts_daily_zone para tendencia.",
        ],
        "market_state": state,
        "confidence_pct": 35,
        "ai_cost_mxn": 0.0,
        "stub_reason": reason,
    }


async def get_cached_brief(db, zone_id: str, tier: str, period: str) -> Optional[Dict[str, Any]]:
    """Return latest brief if generated within FRESH_DAYS, else None."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=FRESH_DAYS)
    doc = await db.intelligence_briefs.find_one(
        {"zone_id": zone_id, "tier": tier, "period": period,
         "generated_at_dt": {"$gte": cutoff}},
        {"_id": 0}, sort=[("generated_at_dt", -1)],
    )
    return doc


async def generate_brief(
    db, *, zone_id: str, tier: str = "colonia", period: str = "current",
    force: bool = False, triggered_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Public entrypoint. Returns a brief, generating if stale/forced.

    Honors `ai_budget.is_within_budget(dmx_internal)` — when exceeded, returns a
    cached brief if available, otherwise a stub (NO failure).
    """
    if not force:
        cached = await get_cached_brief(db, zone_id, tier, period)
        if cached:
            return {**cached, "cache": "hit"}

    # Budget gate
    try:
        from ai_budget import is_within_budget
        budget_ok = await is_within_budget(db, INTERNAL_TENANT)
    except Exception:
        budget_ok = True

    ctx = await _gather_context(db, zone_id, tier, period)

    if not budget_ok:
        # Try cache (any age) before stub
        any_doc = await db.intelligence_briefs.find_one(
            {"zone_id": zone_id, "tier": tier, "period": period}, {"_id": 0},
            sort=[("generated_at_dt", -1)],
        )
        if any_doc:
            return {**any_doc, "cache": "stale", "budget_blocked": True}
        stub = _stub_brief(ctx, reason="ai_budget excedido")
        return _persist_brief(db, zone_id, tier, period, ctx, stub, triggered_by, persist=False, budget_blocked=True)

    payload = await _claude_sonnet_brief(ctx, zone_id, period)

    # Track AI cost (~ 800 in + 800 out for Sonnet brief)
    try:
        from ai_budget import track_ai_call
        await track_ai_call(
            db, dev_org_id=INTERNAL_TENANT, model=payload.get("model") or DEFAULT_MODEL,
            tokens=1600, call_type="intelligence_brief",
            tokens_in=800, tokens_out=800, feature_key="intelligence_hub",
        )
    except Exception:
        pass

    persisted = await _persist_brief(db, zone_id, tier, period, ctx, payload, triggered_by, persist=True)
    return persisted


async def _persist_brief(
    db, zone_id: str, tier: str, period: str,
    ctx: Dict[str, Any], payload: Dict[str, Any],
    triggered_by: Optional[str], persist: bool,
    budget_blocked: bool = False,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    doc = {
        "id": _new_id(),
        "zone_id": zone_id, "tier": tier, "period": period,
        "zone_name": ctx.get("name"),
        "generated_at": now.isoformat(),
        "generated_at_dt": now,  # BSON Date for TTL
        "model": payload.get("model"),
        "reasoning": payload.get("reasoning"),
        "key_findings": payload.get("key_findings") or [],
        "top_risks": payload.get("top_risks") or [],
        "opportunities": payload.get("opportunities") or [],
        "market_state": payload.get("market_state") or "stable",
        "confidence_pct": payload.get("confidence_pct") or 0,
        "ai_cost_mxn": payload.get("ai_cost_mxn") or 0.0,
        "stub_reason": payload.get("stub_reason"),
        "triggered_by": triggered_by,
        "context_kpis": ctx.get("kpis") or {},
        "growth_pct_30d": ctx.get("growth_pct_30d"),
    }
    if persist:
        try:
            await db.intelligence_briefs.insert_one(dict(doc))
        except Exception as e:
            log.warning(f"[intel] persist brief failed: {e}")
    out = dict(doc)
    out.pop("_id", None)
    out.pop("generated_at_dt", None)
    out["cache"] = "miss"
    if budget_blocked:
        out["budget_blocked"] = True
    return out


# ─── Comparables N×N similarity matrix ────────────────────────────────────────

def _similarity(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    """0..1 similarity over (price_per_m2, units_total, conversion_rate).
    Diagonal is masked at the API layer.
    """
    keys = ("avg_price_per_m2", "units_total", "conversion_rate")
    deltas: List[float] = []
    for k in keys:
        va = a.get(k)
        vb = b.get(k)
        if va is None or vb is None:
            continue
        try:
            mx = max(abs(float(va)), abs(float(vb)), 1e-6)
            d = abs(float(va) - float(vb)) / mx
            deltas.append(min(1.0, d))
        except Exception:
            continue
    if not deltas:
        return 0.0
    return round(1.0 - statistics.mean(deltas), 4)


async def comparables_matrix(
    db, *, zone_id: str, radius_km: float = 2.0, limit: int = 10,
) -> Dict[str, Any]:
    """Return top-N comparables + N×N similarity matrix."""
    import metrics_cube_aggregations as cube
    base = await db.cube_aggregations.find_one(
        {"tier_id": zone_id, "period": "current"}, {"_id": 0},
    )
    if not base:
        return {"zones": [], "matrix": [], "base_zone_id": zone_id, "computed_at": _iso()}

    comps_raw = await cube.find_comparables(
        db, zone_id, radius_km=radius_km, limit=max(1, min(limit, 10)),
    )

    zones: List[Dict[str, Any]] = [{
        "zone_id": base.get("tier_id"),
        "name": base.get("name") or base.get("tier_id"),
        "tier": base.get("tier"),
        "kpis": base.get("kpis") or {},
        "geo": base.get("geo") or {},
        "is_base": True,
    }]
    for c in comps_raw or []:
        cid = c.get("tier_id") or c.get("id")
        zones.append({
            "zone_id": cid,
            "name": c.get("name") or cid,
            "tier": c.get("tier") or "development",
            "kpis": {
                "avg_price_per_m2": c.get("avg_price_per_m2"),
                "units_total": c.get("units_total"),
                "avg_price_mxn": c.get("avg_price_mxn"),
                "conversion_rate": c.get("conversion_rate"),
            },
            "geo": c.get("geo") or {},
            "is_base": False,
        })

    matrix: List[List[Optional[float]]] = []
    for i, za in enumerate(zones):
        row: List[Optional[float]] = []
        for j, zb in enumerate(zones):
            if i == j:
                row.append(None)  # diagonal disabled
            else:
                row.append(_similarity(za["kpis"], zb["kpis"]))
        matrix.append(row)

    return {
        "base_zone_id": zone_id,
        "zones": zones,
        "matrix": matrix,
        "size": len(zones),
        "computed_at": _iso(),
    }


# ─── Multi-layer heatmap ──────────────────────────────────────────────────────

LAYER_KEYS = ("price", "demand", "risk", "supply")


async def heatmap_multi_layer(
    db, *, layers: List[str], tier: str = "colonia",
    bbox: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """Returns geojson-like points per layer.
    `risk` layer is a placeholder until W3 ZZ.4 ships.
    """
    layers = [layer for layer in layers if layer in LAYER_KEYS]
    if not layers:
        layers = ["price"]

    cur = db.cube_aggregations.find(
        {"tier": tier, "period": "current"}, {"_id": 0},
    )
    rows = [r async for r in cur]

    def in_bbox(geo) -> bool:
        if not bbox:
            return True
        lat = (geo or {}).get("lat")
        lng = (geo or {}).get("lng")
        if lat is None or lng is None:
            return False
        return bbox[0] <= lng <= bbox[2] and bbox[1] <= lat <= bbox[3]

    layers_out: Dict[str, Any] = {}
    for layer in layers:
        if layer == "risk":
            layers_out[layer] = {
                "available": False,
                "reason": "W3 ZZ.4 pending — capa de riesgo SESNSP no disponible aún",
                "items": [],
            }
            continue
        items: List[Dict[str, Any]] = []
        for r in rows:
            geo = r.get("geo") or {}
            if not in_bbox(geo):
                continue
            lat = geo.get("lat")
            lng = geo.get("lng")
            if lat is None or lng is None:
                continue
            kpis = r.get("kpis") or {}
            if layer == "price":
                value = kpis.get("avg_price_per_m2")
            elif layer == "demand":
                value = kpis.get("leads_count") or 0
            elif layer == "supply":
                value = kpis.get("units_available") or 0
            else:
                value = None
            if value is None:
                continue
            items.append({
                "zone_id": r.get("tier_id"),
                "name": r.get("name"),
                "lat": lat, "lng": lng,
                "value": value,
                "kpis": kpis,
            })
        layers_out[layer] = {"available": True, "items": items, "count": len(items)}

    return {"layers": layers_out, "tier": tier, "computed_at": _iso()}


# ─── Executive overview ───────────────────────────────────────────────────────

async def executive_overview(db) -> Dict[str, Any]:
    """Cross-org KPIs + top 3 growth/decline zones (alcaldia level)."""
    # Current alcaldia rows
    cur = db.cube_aggregations.find(
        {"tier": "alcaldia", "period": "current"}, {"_id": 0},
    )
    alcaldias = [r async for r in cur]

    # 30d window for growth comparison via facts_daily_zone
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    growth_rows: List[Dict[str, Any]] = []
    for a in alcaldias:
        zid = a.get("tier_id")
        first_doc = await db.facts_daily_zone.find_one(
            {"meta.zone_id": zid, "meta.tier": "alcaldia", "ts": {"$gte": cutoff}},
            {"_id": 0, "ts": 1, "kpis": 1}, sort=[("ts", 1)],
        )
        last_doc = await db.facts_daily_zone.find_one(
            {"meta.zone_id": zid, "meta.tier": "alcaldia"},
            {"_id": 0, "ts": 1, "kpis": 1}, sort=[("ts", -1)],
        )
        first_v = ((first_doc or {}).get("kpis") or {}).get("avg_price_per_m2")
        last_v = ((last_doc or {}).get("kpis") or {}).get("avg_price_per_m2")
        if first_v and last_v and first_v > 0:
            pct = round((last_v - first_v) / first_v * 100, 2)
        else:
            pct = None
        growth_rows.append({
            "zone_id": zid, "name": a.get("name"), "growth_pct_30d": pct,
            "current_price_per_m2": last_v or ((a.get("kpis") or {}).get("avg_price_per_m2")),
        })

    growth_rows_with = [r for r in growth_rows if r["growth_pct_30d"] is not None]
    growth_rows_with.sort(key=lambda r: r["growth_pct_30d"], reverse=True)
    top_growth = growth_rows_with[:3]
    top_decline = list(reversed(growth_rows_with[-3:])) if growth_rows_with else []

    # Total units & avg price CDMX (city aggregation)
    city_row = await db.cube_aggregations.find_one(
        {"tier": "city", "period": "current"}, {"_id": 0},
    )
    city_kpis = (city_row or {}).get("kpis") or {}
    total_units = city_kpis.get("units_total")
    if total_units is None:
        total_units = sum(((a.get("kpis") or {}).get("units_total") or 0) for a in alcaldias)
    avg_price_m2 = city_kpis.get("avg_price_per_m2")
    if avg_price_m2 is None and alcaldias:
        vals = [(a.get("kpis") or {}).get("avg_price_per_m2") for a in alcaldias]
        vals = [v for v in vals if v]
        if vals:
            avg_price_m2 = round(sum(vals) / len(vals), 2)

    # Overall market state heuristic from average growth
    if growth_rows_with:
        avg_growth = sum(r["growth_pct_30d"] for r in growth_rows_with) / len(growth_rows_with)
        if avg_growth > 3:
            market_state = "bull"
        elif avg_growth < -3:
            market_state = "bear"
        else:
            market_state = "stable"
    else:
        market_state = "stable"

    last_brief = await db.intelligence_briefs.find_one(
        {}, {"_id": 0, "generated_at": 1}, sort=[("generated_at_dt", -1)],
    )
    briefs_count = await db.intelligence_briefs.count_documents({})

    return {
        "total_units_market": total_units,
        "avg_price_per_m2_cdmx": avg_price_m2,
        "top_3_growth_zones": top_growth,
        "top_3_decline_zones": top_decline,
        "market_state_overall": market_state,
        "last_brief_at": (last_brief or {}).get("generated_at"),
        "total_briefs_count": briefs_count,
        "computed_at": _iso(),
    }


# ─── Weekly cron — refresh top 20 zonas + email founder ───────────────────────

async def cron_weekly_refresh(db) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    # Top 20 zonas más activas por leads_count (alcaldia + colonia mixto)
    top_zones: List[Dict[str, Any]] = []
    for tier in ("alcaldia", "colonia"):
        cur = db.cube_aggregations.find(
            {"tier": tier, "period": "current"}, {"_id": 0},
        ).sort([("kpis.leads_count", -1), ("kpis.units_total", -1)]).limit(10)
        async for r in cur:
            top_zones.append({"zone_id": r.get("tier_id"),
                              "tier": tier, "name": r.get("name")})
    # Cap at 20
    top_zones = top_zones[:20]

    refreshed = 0
    failed = 0
    cost = 0.0
    summaries: List[Dict[str, Any]] = []
    for z in top_zones:
        try:
            brief = await generate_brief(
                db, zone_id=z["zone_id"], tier=z["tier"], period="current",
                force=True, triggered_by="cron_weekly",
            )
            refreshed += 1
            cost += float(brief.get("ai_cost_mxn") or 0)
            summaries.append({
                "zone_id": z["zone_id"], "name": z["name"],
                "market_state": brief.get("market_state"),
                "confidence_pct": brief.get("confidence_pct"),
            })
        except Exception as e:
            log.warning(f"[intel cron] brief failed {z}: {e}")
            failed += 1

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    summary = {
        "ok": True, "zones": len(top_zones),
        "refreshed": refreshed, "failed": failed,
        "ai_cost_mxn": round(cost, 2),
        "elapsed_s": round(elapsed, 2),
        "completed_at": _iso(),
    }

    # Email founder digest (Resend)
    try:
        await _email_founder_digest(summaries, summary)
    except Exception as e:
        log.warning(f"[intel cron] email digest failed: {e}")
        summary["email_error"] = str(e)[:120]

    return summary


async def _email_founder_digest(items: List[Dict[str, Any]], summary: Dict[str, Any]) -> bool:
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        log.info("[intel] RESEND_API_KEY missing — skipping founder digest email")
        return False
    import httpx
    rows_html = "".join([
        f"<tr><td style='padding:6px 8px;border-bottom:1px solid #eee;'>{it.get('name')}</td>"
        f"<td style='padding:6px 8px;border-bottom:1px solid #eee;'>{it.get('market_state')}</td>"
        f"<td style='padding:6px 8px;border-bottom:1px solid #eee;'>{it.get('confidence_pct')}%</td></tr>"
        for it in items[:20]
    ])
    body = {
        "from": "DMX Intelligence Hub <no-reply@desarrollosmx.com>",
        "to": [FOUNDER_EMAIL],
        "subject": f"[DMX] Inteligencia ejecutiva semanal · {summary.get('refreshed')} zonas",
        "html": (
            "<div style='font-family:DM Sans,sans-serif;color:#06080F;'>"
            "<h2 style='margin:0 0 12px;'>Resumen semanal de inteligencia</h2>"
            f"<p>Refrescamos <strong>{summary.get('refreshed')}</strong> zonas top "
            f"(de {summary.get('zones')}), costo IA estimado "
            f"<strong>${summary.get('ai_cost_mxn')} MXN</strong>.</p>"
            "<table style='border-collapse:collapse;font-size:13px;width:100%;'>"
            "<thead><tr style='background:#F0EBE0;'>"
            "<th style='padding:6px 8px;text-align:left;'>Zona</th>"
            "<th style='padding:6px 8px;text-align:left;'>Estado</th>"
            "<th style='padding:6px 8px;text-align:left;'>Confianza</th>"
            f"</tr></thead><tbody>{rows_html}</tbody></table>"
            "<p style='margin-top:16px;'>"
            "<a href='https://desarrollosmx.com/superadmin/intelligence-hub' "
            "style='background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;"
            "padding:10px 22px;border-radius:9999px;text-decoration:none;font-weight:700;'>"
            "Abrir Intelligence Hub</a></p></div>"
        ),
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {resend_key}"},
            json=body, timeout=10,
        )
        return r.status_code in (200, 202)


# ─── Cron registration helper ─────────────────────────────────────────────────

def schedule_intelligence_insights_cron(scheduler, db) -> None:
    """Register cron `intelligence_insights_weekly` Mon 05:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_weekly_refresh, "intelligence_insights_weekly"),
            CronTrigger(day_of_week="mon", hour=5, minute=0,
                        timezone="America/Mexico_City"),
            args=[db], id="intelligence_insights_weekly",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[intel] schedule cron failed: {e}")
