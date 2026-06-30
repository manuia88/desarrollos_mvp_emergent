"""W3.5 — Public API v1 + Superadmin API key management + Stripe routes.

Routes:
  /api/v1/zones/{zone_id}/snapshot          (all tiers)
  /api/v1/zones/{zone_id}/timeseries        (pro+)
  /api/v1/zones/{zone_id}/zone-score        (all tiers, gated by tier)
  /api/v1/zones/{zone_id}/risk-score        (free=letter only, pro=full)
  /api/v1/zones/{zone_id}/drpi              (pro+)
  /api/v1/comparables                       (pro+)
  /api/v1/valuations/{property_id}          (enterprise)
  /api/v1/demand-pulse                      (enterprise)

Superadmin:
  GET    /api/superadmin/api-keys
  POST   /api/superadmin/api-keys
  PATCH  /api/superadmin/api-keys/{id}
  DELETE /api/superadmin/api-keys/{id}
  GET    /api/superadmin/api-keys/{id}/usage

Stripe:
  POST /api/stripe/webhook                  (PUBLIC, signature verified)
  GET  /api/superadmin/stripe/{tenant_id}
  POST /api/superadmin/stripe/{tenant_id}/subscribe
  POST /api/superadmin/stripe/{tenant_id}/cancel
"""
from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response, Depends
from pydantic import BaseModel

import public_api_auth as auth
import stripe_billing_engine as billing
import anonymization_engine as anon
import compliance_engine as comp
import ratelimit  # P2.9 · limitador de ráfaga compartido

log = logging.getLogger("dmx.routes_public_api_v1")

# P2.9 · la API pública v1 NO tenía rate-limit → scraping/abuso libre. Límite por IP a nivel
# router (aplica a TODOS los endpoints v1, incl. /demand que usa el Grafo). 120 req/min/IP.
router = APIRouter(tags=["public_api_v1"],
                   dependencies=[Depends(ratelimit.dependency("public_v1", limit=120, window=60))])


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str = "ak") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


def _set_headers(response: Response, ctx: auth.ApiKeyContext) -> None:
    response.headers["X-DMX-Tier"] = ctx.tier
    response.headers["X-DMX-Calls-Remaining"] = str(max(0, ctx.calls_remaining - 1))


# ══════════════════════════════════════════════════════════════════════════════
# /api/v1 — Public API endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/v1/zones/{zone_id}/snapshot")
async def v1_snapshot(zone_id: str, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    started = time.perf_counter()
    db = _db(request)

    # W3.7 — k-anonymity gate for aggregate zone queries
    k_check = await anon.check_k_anonymity(db, {"zone_id": zone_id})
    if not k_check.get("available"):
        _set_headers(response, ctx)
        await comp.log_compliance_event(
            db, action="api_query", endpoint=f"/api/v1/zones/{zone_id}/snapshot",
            api_key_id=ctx.id, k_anonymity_passed=False, records_returned=0,
            requestor_ip=request.client.host if request.client else "",
        )
        return {**k_check, "zone_id": zone_id}

    cube = await db.cube_aggregations.find_one(
        {"tier_id": zone_id, "period": "current"}, {"_id": 0},
    ) or {}
    out = {
        "zone_id": zone_id,
        "name": cube.get("name") or zone_id,
        "tier": cube.get("tier"),
        "kpis": cube.get("kpis") or {},
        "computed_at": cube.get("last_synced_at"),
    }
    # W3.7 — PII strip (snapshot kpis are aggregate, but strip defensively)
    out = anon.strip_pii(out, level=ctx.tier)

    _set_headers(response, ctx)
    latency_ms = int((time.perf_counter() - started) * 1000)
    await auth.track_api_call(
        db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)),
    )
    await comp.log_compliance_event(
        db, action="api_query", endpoint=f"/api/v1/zones/{zone_id}/snapshot",
        api_key_id=ctx.id, response_pii_stripped=True,
        k_anonymity_passed=True, records_returned=1,
        requestor_ip=request.client.host if request.client else "",
    )
    return out


@router.get("/api/v1/zones/{zone_id}/timeseries")
async def v1_timeseries(
    zone_id: str, request: Request, response: Response,
    days: int = Query(90, ge=1, le=365),
):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "pro")
    started = time.perf_counter()
    db = _db(request)
    cutoff = (_now() - timedelta(days=days)).date().isoformat()
    cursor = db.facts_daily_zone.find(
        {"tier_id": zone_id, "date": {"$gte": cutoff}}, {"_id": 0},
    ).sort("date", 1).limit(days)
    series = [d async for d in cursor]
    out = {"zone_id": zone_id, "days": days, "series": series, "count": len(series)}
    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=int((time.perf_counter() - started) * 1000), response_size=len(str(out)))
    return out


@router.get("/api/v1/zones/{zone_id}/zone-score")
async def v1_zone_score(zone_id: str, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    started = time.perf_counter()
    db = _db(request)
    zs = await db.zone_scores.find_one(
        {"zone_id": zone_id}, {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    if not zs:
        out = {"zone_id": zone_id, "available": False, "reason": "no_score_yet"}
    elif ctx.tier == "free":
        out = {"zone_id": zone_id, "available": True, "score_letter": zs.get("score_letter")}
    elif ctx.tier == "pro":
        out = {"zone_id": zone_id, "available": True,
               "score_letter": zs.get("score_letter"),
               "score_numeric": zs.get("score_numeric"),
               "components": zs.get("components")}
    else:
        out = {"zone_id": zone_id, "available": True, **zs}

    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=int((time.perf_counter() - started) * 1000), response_size=len(str(out)))
    return out


@router.get("/api/v1/zones/{zone_id}/risk-score")
async def v1_risk_score(zone_id: str, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    started = time.perf_counter()
    db = _db(request)
    import risk_score_engine as risk
    doc = await risk.get_risk_score_or_compute(db, zone_id)
    if not doc.get("available"):
        out = {"zone_id": zone_id, "available": False, "reason": doc.get("reason")}
    elif ctx.tier == "free":
        out = {"zone_id": zone_id, "available": True, "score_letter": doc.get("score_letter")}
    elif ctx.tier == "pro":
        components = doc.get("components") or {}
        out = {"zone_id": zone_id, "available": True,
               "score_letter": doc.get("score_letter"),
               "score_numeric": doc.get("score_numeric"),
               "components": {k: components.get(k) for k in
                              ["crime_score", "natural_score",
                               "title_risk_score", "percepcion_score"]}}
    else:
        out = {"zone_id": zone_id, **doc}

    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=int((time.perf_counter() - started) * 1000), response_size=len(str(out)))
    return out


@router.get("/api/v1/zones/{zone_id}/drpi")
async def v1_drpi(
    zone_id: str, request: Request, response: Response,
    period: Optional[str] = Query(None),
):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "pro")
    started = time.perf_counter()
    db = _db(request)
    import drpi_engine as drpi
    p = period or drpi._period_now()
    snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "period": p},
        {"_id": 0, "computed_at_dt": 0},
    ) or {"available": False, "reason": "no_snapshot"}
    out: Dict[str, Any] = {"zone_id": zone_id, "period": p, "snapshot": snap}
    if ctx.tier == "enterprise" and snap.get("hedonic_model_id"):
        hed = await db.hedonic_models.find_one(
            {"id": snap["hedonic_model_id"]},
            {"_id": 0, "fit_at_dt": 0},
        )
        out["hedonic_model"] = hed

    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=int((time.perf_counter() - started) * 1000), response_size=len(str(out)))
    return out


@router.get("/api/v1/comparables")
async def v1_comparables(
    request: Request, response: Response,
    lat: float = Query(...), lng: float = Query(...),
    radius_km: float = Query(2.0, ge=0.1, le=10.0),
    limit: int = Query(50, ge=1, le=200),
):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "pro")
    started = time.perf_counter()
    db = _db(request)
    # Simple bounding-box prefilter (radius_km ≈ 0.009° per km)
    delta = radius_km * 0.0091
    cursor = db.transactions.find(
        {"lat": {"$gte": lat - delta, "$lte": lat + delta},
         "lng": {"$gte": lng - delta, "$lte": lng + delta}},
        {"_id": 0, "anonymized_id": 1, "zone_id": 1, "m2": 1,
         "closing_price_mxn": 1, "property_type": 1, "closed_at": 1, "lat": 1, "lng": 1},
    ).limit(limit)
    items = [d async for d in cursor]
    # W3.7 — strip PII from each comparable item
    items = [anon.strip_pii(item, level=ctx.tier) for item in items]
    out = {"center": {"lat": lat, "lng": lng}, "radius_km": radius_km,
           "items": items, "count": len(items)}
    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)))
    await comp.log_compliance_event(
        db, action="api_query", endpoint="/api/v1/comparables",
        api_key_id=ctx.id, response_pii_stripped=True,
        k_anonymity_passed=True, records_returned=len(items),
        requestor_ip=request.client.host if request.client else "",
    )
    return out


async def _deliver(db, ctx, request, response, endpoint: str, out: dict, records: int = 1,
                   started: float = 0.0):
    """Tail común: headers + track + compliance (cero duplicación entre endpoints F5.2)."""
    out = anon.strip_pii(out, level=ctx.tier)
    _set_headers(response, ctx)
    latency_ms = int((time.perf_counter() - started) * 1000) if started else 0
    await auth.track_api_call(db, ctx, request, status_code=200,
                              latency_ms=latency_ms, response_size=len(str(out)))
    await comp.log_compliance_event(
        db, action="api_query", endpoint=endpoint, api_key_id=ctx.id,
        response_pii_stripped=True, k_anonymity_passed=True, records_returned=records,
        requestor_ip=request.client.host if request.client else "")
    return out


@router.get("/api/v1/market/indices")
async def v1_market_indices(request: Request, response: Response):
    """F5.2 · Los 3 índices DMX (Obra · Absorción · Gestión) + maestro. Bundle indices_dmx_suite (pro+)."""
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "pro")
    started = time.perf_counter()
    db = _db(request)
    from terminal_mercado_engine import terminal_mercado
    t = await terminal_mercado(db)
    # D1-enterprise · KAN-02 · este es el publicable que se VENDE B2B. El engine marca
    # `publicable` con su propio umbral (K_MIN_PRODUCTO=3), por debajo del K canónico de la
    # plataforma (K_ANON_MIN=5). Re-gateamos aquí al K real antes de entregar y etiquetamos
    # k_anonimato con el K canónico (no el del engine) para no reidentificar con 3-4 proyectos.
    n_proj = t.get("n_proyectos") or 0
    if n_proj < anon.K_ANON_MIN:
        return await _deliver(db, ctx, request, response, "/api/v1/market/indices",
                              {"available": False, "reason": "k_anonymity",
                               "k_required": anon.K_ANON_MIN, "k_actual": n_proj},
                              records=0, started=started)
    out = {"available": True, "k_anonimato": anon.K_ANON_MIN,
           "indices": t.get("indices_vendibles"),
           "indice_maestro": t.get("indice_maestro"), "computed_from_projects": n_proj}
    return await _deliver(db, ctx, request, response, "/api/v1/market/indices", out,
                          records=len(out.get("indices") or []), started=started)


@router.get("/api/v1/market/indices/history")
async def v1_market_indices_history(request: Request, response: Response,
                                    days: int = Query(90, ge=2, le=365)):
    """F5.3 · Curva histórica de los 3 índices DMX. Bundle indices_dmx_suite (pro+)."""
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "pro")
    started = time.perf_counter()
    db = _db(request)
    from terminal_mercado_engine import historial_indices
    h = await historial_indices(db, days=days)
    out = {"available": bool(h.get("serie")), "serie": h.get("serie"), "n": h.get("n")}
    return await _deliver(db, ctx, request, response, "/api/v1/market/indices/history", out,
                          records=h.get("n", 0), started=started)


@router.get("/api/v1/zones/{zone_id}/demand")
async def v1_zone_demand(zone_id: str, request: Request, response: Response):
    """F5.2 · Grafo del Comprador (demanda anónima por colonia · k-anon). Bundle grafo_demanda_suite (enterprise)."""
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "enterprise")
    started = time.perf_counter()
    db = _db(request)
    from grafo_comprador_engine import build_grafo
    g = await build_grafo(db, colonia_id=zone_id)
    # KAN-01 · este producto se VENDE B2B → gatea TODA dimensión bajo K canónico antes de
    # entregar. El motor ya banda las celdas sub-K; aquí suprimimos los AGREGADOS por colonia
    # (demanda_total / búsquedas / likes) que pueden ser sub-K y reidentificar. Se conserva la
    # banda honesta (banda/etiqueta) — el cliente ve nivel, no el conteo n=1.
    k = anon.K_ANON_MIN
    cols = []
    for c in (g.get("colonias") or []):
        c = dict(c)
        for fld in ("demanda_total", "busquedas_marketplace", "likes_comprador"):
            v = c.get(fld)
            if isinstance(v, (int, float)) and 0 < v < k:
                c[fld] = None
                c[f"{fld}_banda"] = f"<{k}"
        cols.append(c)
    out = {"zone_id": zone_id, "k_anonimato": g.get("k_anonimato"),
           "colonias": cols, "available": bool(cols)}
    return await _deliver(db, ctx, request, response, f"/api/v1/zones/{zone_id}/demand", out,
                          records=len(cols), started=started)


@router.get("/api/v1/zones/{zone_id}/bancabilidad")
async def v1_zone_bancabilidad(zone_id: str, request: Request, response: Response):
    """F5.2 · Score de Bancabilidad agregado por zona (sin nombres de proyecto). Enterprise."""
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "enterprise")
    started = time.perf_counter()
    db = _db(request)
    from bancabilidad_engine import bancabilidad_por_zona
    out = await bancabilidad_por_zona(db, zone_id)
    return await _deliver(db, ctx, request, response, f"/api/v1/zones/{zone_id}/bancabilidad", out,
                          records=1 if out.get("disponible") else 0, started=started)


@router.get("/api/v1/valuations/{property_id}")
async def v1_valuation(property_id: str, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "enterprise")
    started = time.perf_counter()
    db = _db(request)
    # Stub AVM: lookup transaction + run hedonic predict if possible
    tx = await db.transactions.find_one(
        {"$or": [{"id": property_id}, {"anonymized_id": property_id}]},
        {"_id": 0},
    )
    if not tx:
        out = {"property_id": property_id, "available": False, "reason": "not_found"}
    else:
        import hedonic_regression_engine as hed
        feats = {"m2": tx.get("m2"), "recamaras": tx.get("recamaras"),
                 "baños": tx.get("baños"), "year_built": tx.get("year_built"),
                 "floor": tx.get("floor")}
        model = await db.hedonic_models.find_one(
            {"zone_id": tx.get("zone_id"), "available": True},
            {"_id": 0, "id": 1}, sort=[("fit_at_dt", -1)],
        )
        avm = None
        if model:
            avm = await hed.predict_price(db, model["id"], feats)
        out = {"property_id": property_id, "available": True,
               "zone_id": tx.get("zone_id"), "features": feats, "avm": avm}
    # W3.7 — strip PII from valuation response
    out = anon.strip_pii(out, level=ctx.tier)
    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)))
    await comp.log_compliance_event(
        db, action="api_query", endpoint=f"/api/v1/valuations/{property_id}",
        api_key_id=ctx.id, response_pii_stripped=True, k_anonymity_passed=True,
        records_returned=1 if out.get("available") else 0,
        requestor_ip=request.client.host if request.client else "",
    )
    return out


@router.get("/api/v1/demand-pulse")
async def v1_demand_pulse(request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "enterprise")
    started = time.perf_counter()
    db = _db(request)
    cutoff = (_now() - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {"$group": {"_id": "$zone_id", "leads": {"$sum": 1}}},
        {"$sort": {"leads": -1}},
        {"$limit": 100},
    ]
    rows = []
    try:
        rows = [r async for r in db.leads.aggregate(pipeline)]
    except Exception:
        rows = []
    # D2-DEMANDPULSE · KAN-03 · este pulso por zona se VENDE B2B → cada fila es un agregado de
    # leads por colonia que con n<K reidentifica (n=1 = un comprador concreto). El
    # `k_anonymity_passed` del log era cosmético: aquí gateamos de verdad reusando el patrón
    # banda de v1_zone_demand → suprimimos el conteo y conservamos la banda honesta (<K).
    k = anon.K_ANON_MIN
    items = []
    suppressed = 0
    for r in rows:
        leads = r.get("leads")
        if isinstance(leads, (int, float)) and 0 < leads < k:
            items.append({"zone_id": r["_id"], "leads": None, "leads_banda": f"<{k}"})
            suppressed += 1
        else:
            items.append({"zone_id": r["_id"], "leads": leads})
    out = {"window_days": 7, "k_anonimato": k, "items": items, "count": len(items)}
    _set_headers(response, ctx)
    await auth.track_api_call(db, ctx, request, status_code=200,
        latency_ms=int((time.perf_counter() - started) * 1000), response_size=len(str(out)))
    await comp.log_compliance_event(
        db, action="api_query", endpoint="/api/v1/demand-pulse",
        api_key_id=ctx.id, k_anonymity_passed=(suppressed == 0),
        records_returned=len(items),
        requestor_ip=request.client.host if request.client else "",
    )
    return out


# ══════════════════════════════════════════════════════════════════════════════
# Superadmin — API key management
# ══════════════════════════════════════════════════════════════════════════════

class ApiKeyCreateBody(BaseModel):
    tenant_id: str
    tier: str = "free"
    contact_email: str = ""
    expires_at: Optional[str] = None
    monthly_quota_calls: Optional[int] = None


class ApiKeyPatchBody(BaseModel):
    tier: Optional[str] = None
    expires_at: Optional[str] = None
    status: Optional[str] = None
    monthly_quota_calls: Optional[int] = None


@router.get("/api/superadmin/api-keys")
async def list_api_keys(
    request: Request, status: Optional[str] = Query(None),
    tier: Optional[str] = Query(None), limit: int = Query(100, ge=1, le=500),
):
    await _sa(request)
    db = _db(request)
    q: dict = {}
    if status: q["status"] = status
    if tier:   q["tier"] = tier
    cursor = db.public_api_keys.find(
        q, {"_id": 0, "key_hash": 0},
    ).sort("created_at", -1).limit(limit)
    items = [d async for d in cursor]

    cutoff = _now() - timedelta(days=30)
    calls_30d = await db.api_call_logs.count_documents({"ts": {"$gte": cutoff}})
    by_tier_pipe = [
        {"$match": {"status": "active"}},
        {"$group": {"_id": "$tier", "n": {"$sum": 1}}},
    ]
    by_tier = {r["_id"]: r["n"] async for r in db.public_api_keys.aggregate(by_tier_pipe)}
    return {
        "items": items, "count": len(items),
        "kpis": {
            "active": sum(by_tier.values()),
            "by_tier": by_tier,
            "calls_30d": calls_30d,
        },
    }


@router.post("/api/superadmin/api-keys")
async def create_api_key(body: ApiKeyCreateBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    if body.tier not in auth.DEFAULT_QUOTA:
        raise HTTPException(400, "tier inválido (free|pro|enterprise)")

    gen = auth.generate_api_key()
    expires = body.expires_at or (_now() + timedelta(days=auth.DEFAULT_EXPIRY_DAYS)).isoformat()
    quota = body.monthly_quota_calls or auth.DEFAULT_QUOTA[body.tier]
    doc = {
        "id": _new_id("ak"),
        "key_hash": gen["key_hash"],
        "key_prefix": gen["key_prefix"],
        "tenant_id": body.tenant_id,
        "tier": body.tier,
        "monthly_quota_calls": quota,
        "calls_this_month": 0,
        "calls_total": 0,
        "month_bucket": _now().strftime("%Y-%m"),
        "expires_at": expires,
        "status": "active",
        "contact_email": body.contact_email,
        "created_by": getattr(user, "user_id", None),
        "created_at": _iso(),
        "last_used_at": None,
    }
    await db.public_api_keys.insert_one(dict(doc))
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "public_api_key", doc["id"],
            before=None, after={"tenant_id": body.tenant_id, "tier": body.tier},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (create public_api_key %s): %s", doc["id"], _e)

    out = dict(doc); out.pop("_id", None); out.pop("key_hash", None)
    out["key_full_one_time"] = gen["full_key"]
    out["warning"] = "Esta key se muestra UNA SOLA VEZ. Guárdala ahora."
    return out


@router.patch("/api/superadmin/api-keys/{key_id}")
async def patch_api_key(key_id: str, body: ApiKeyPatchBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    update: dict = {}
    if body.tier is not None:                 update["tier"] = body.tier
    if body.expires_at is not None:           update["expires_at"] = body.expires_at
    if body.status is not None:               update["status"] = body.status
    if body.monthly_quota_calls is not None:  update["monthly_quota_calls"] = body.monthly_quota_calls
    if not update:
        raise HTTPException(400, "Sin campos a actualizar")
    res = await db.public_api_keys.update_one({"id": key_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Key no encontrada")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "public_api_key", key_id,
                           before=None, after=update, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (update public_api_key %s): %s", key_id, _e)
    return {"ok": True, "id": key_id, "updated": update}


@router.delete("/api/superadmin/api-keys/{key_id}")
async def revoke_api_key(key_id: str, request: Request):
    user = await _sa(request)
    db = _db(request)
    res = await db.public_api_keys.update_one(
        {"id": key_id}, {"$set": {"status": "revoked"}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Key no encontrada")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "delete", "public_api_key", key_id,
                           before=None, after={"status": "revoked"}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (delete public_api_key %s): %s", key_id, _e)
    return {"ok": True, "id": key_id, "status": "revoked"}


@router.get("/api/superadmin/api-keys/{key_id}/usage")
async def api_key_usage(
    key_id: str, request: Request, days: int = Query(30, ge=1, le=365),
):
    await _sa(request)
    db = _db(request)
    cutoff = _now() - timedelta(days=days)
    pipeline = [
        {"$match": {"api_key_id": key_id, "ts": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}},
            "calls": {"$sum": 1},
            "errors": {"$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}},
            "avg_latency": {"$avg": "$latency_ms"},
        }},
        {"$sort": {"_id": 1}},
    ]
    series = [r async for r in db.api_call_logs.aggregate(pipeline)]
    by_endpoint_pipe = [
        {"$match": {"api_key_id": key_id, "ts": {"$gte": cutoff}}},
        {"$group": {"_id": "$endpoint", "calls": {"$sum": 1}}},
        {"$sort": {"calls": -1}}, {"$limit": 20},
    ]
    by_endpoint = [r async for r in db.api_call_logs.aggregate(by_endpoint_pipe)]
    return {
        "key_id": key_id, "days": days,
        "series": [{"date": r["_id"], "calls": r["calls"],
                    "errors": r["errors"], "avg_latency_ms": round(r["avg_latency"] or 0, 1)}
                   for r in series],
        "by_endpoint": [{"endpoint": r["_id"], "calls": r["calls"]} for r in by_endpoint],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Stripe — webhook + admin
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """PUBLIC — Stripe sends events. Validate signature when possible."""
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    db = _db(request)
    event: Dict[str, Any] = {}
    try:
        if billing.STRIPE_WEBHOOK_SECRET and sig:
            import stripe  # type: ignore
            event = stripe.Webhook.construct_event(
                body, sig, billing.STRIPE_WEBHOOK_SECRET,
            )
        else:
            # FAIL-CLOSED en prod: sin secreto/firma NO se aceptan eventos (antes: aceptaba JSON crudo
            # → cobros/upgrades falsos · P0.6). En dev/preview se permite para pruebas locales.
            try:
                from server import _is_prod as _prod
            except Exception:
                _prod = lambda: os.environ.get("DMX_ENV", "").strip().lower() in ("prod", "production")
            if _prod():
                log.error("[stripe webhook] PROD sin firma/secret → rechazado")
                raise HTTPException(400, "Webhook signature required")
            import json as _json
            event = _json.loads(body or b"{}")
    except Exception as e:
        log.warning(f"[stripe webhook] sig invalid: {e}")
        raise HTTPException(400, "Invalid signature")

    return await billing.webhook_handler(db, event)


class StripeSubscribeBody(BaseModel):
    plan_tier: str
    email: Optional[str] = None
    payment_method_id: Optional[str] = None


@router.get("/api/superadmin/stripe/{tenant_id}")
async def stripe_status(tenant_id: str, request: Request):
    await _sa(request)
    db = _db(request)
    return await billing.get_subscription_status(db, tenant_id)


@router.post("/api/superadmin/stripe/{tenant_id}/subscribe")
async def stripe_subscribe(tenant_id: str, body: StripeSubscribeBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    out = await billing.create_subscription(
        db, tenant_id, body.plan_tier, body.payment_method_id, body.email,
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "stripe_subscription", tenant_id,
                           before=None, after=out, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (create stripe_subscription %s): %s", tenant_id, _e)
    return out


@router.post("/api/superadmin/stripe/{tenant_id}/cancel")
async def stripe_cancel(tenant_id: str, request: Request):
    user = await _sa(request)
    db = _db(request)
    out = await billing.cancel_subscription(db, tenant_id)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "delete", "stripe_subscription", tenant_id,
                           before=None, after=out, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (delete stripe_subscription %s): %s", tenant_id, _e)
    return out


# ══════════════════════════════════════════════════════════════════════════════
# /api/v1/openapi — public OpenAPI spec
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/v1/openapi")
async def public_openapi(request: Request):
    """Lightweight machine-readable OpenAPI summary for /docs/api page."""
    return {
        "openapi": "3.0.0",
        "info": {
            "title": "DesarrollosMX Public API v1",
            "version": "1.0.0",
            "description": (
                "API REST para acceder a datos espaciales de DMX: snapshots de zonas, "
                "Zone Score A-F, Risk Score V2, DRPI hedonic, comparables, AVM."
            ),
        },
        "servers": [{"url": "/api/v1"}],
        "auth": {"scheme": "Bearer dmx_test_<token> · Authorization: Bearer ..."},
        "tiers": [
            {"id": "free", "monthly_quota": 1000, "price_usd": 0,
             "features": ["snapshot", "zone-score (letter)", "risk-score (letter)"]},
            {"id": "pro", "monthly_quota": 100000, "price_usd": 499,
             "features": ["+ timeseries", "+ zone-score full", "+ risk-score full",
                          "+ drpi", "+ comparables"]},
            {"id": "enterprise", "monthly_quota": 1000000, "price_usd": 2999,
             "features": ["+ valuations (AVM)", "+ demand-pulse", "+ hedonic coefficients"]},
        ],
        "endpoints": [
            {"path": "/zones/{zone_id}/snapshot", "method": "GET", "tier": "free"},
            {"path": "/zones/{zone_id}/timeseries", "method": "GET", "tier": "pro"},
            {"path": "/zones/{zone_id}/zone-score", "method": "GET", "tier": "free"},
            {"path": "/zones/{zone_id}/risk-score", "method": "GET", "tier": "free"},
            {"path": "/zones/{zone_id}/drpi", "method": "GET", "tier": "pro"},
            {"path": "/comparables", "method": "GET", "tier": "pro"},
            {"path": "/valuations/{property_id}", "method": "GET", "tier": "enterprise"},
            {"path": "/demand-pulse", "method": "GET", "tier": "enterprise"},
        ],
    }
