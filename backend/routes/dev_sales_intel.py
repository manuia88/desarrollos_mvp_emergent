"""Dev Sales Intel — fan-out para el cockpit "Pulso de ventas" (pestaña Ventas).

GET /api/dev/projects/{project_id}/sales-intel

Junta, con NÚMEROS REALES y fail-open por bloque:
  · % colocado + embudo            ← get_project_summary (reuso, no duplica)
  · ritmo + se agota vs entrega    ← forecast 1-proyecto (+ units_history si existe)
  · what-if de precio (±3%)        ← whatif_engine (elasticidad real)
  · proyección 12m target-vs-real  ← lógica de forecast por proyecto
  · mix por prototipo              ← units efectivas (seed + overrides)
  · margen                         ← dmx_margin
  · días-a-agotar + precio mercado ← db.ie_scores (IE_PROY_*)

Doctrina del dato práctico: número + plazo + comparativo + acción. units_history hoy
vacío → ritmo/estancadas caen a estimado honesto; se autollenan al registrar ventas.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.sales_intel")
router = APIRouter(prefix="/api/dev", tags=["sales_intel"])


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _tenant(user) -> str:
    from tenant_scope import tenant_of
    return tenant_of(user)


async def _user_dev_ids(request, user) -> List[str]:
    # P7 (auditoría 07-20): seed + devs REALES del tenant (db.developments), no solo el seed.
    from tenant_scope import user_dev_ids_db
    return await user_dev_ids_db(_db(request), user)


def _months_between(estimate: str) -> int | None:
    """Meses de hoy a una fecha 'YYYY-MM'."""
    if not estimate:
        return None
    try:
        y, m = str(estimate).split("-")[:2]
        y, m = int(y), int(m)
    except Exception:
        return None
    n = datetime.now(timezone.utc)
    return max(0, (y - n.year) * 12 + (m - n.month))


def _prototype_mix(units_eff: List[Dict]) -> List[Dict[str, Any]]:
    g: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "vendido": 0, "reservado": 0, "disponible": 0})
    for u in units_eff:
        st = u.get("status", "disponible")
        p = g[u.get("prototype", "—")]
        p["total"] += 1
        p[st] = p.get(st, 0) + 1
    out = []
    for proto, c in g.items():
        colocado = c.get("vendido", 0) + c.get("reservado", 0)
        out.append({
            "prototype": proto, "total": c["total"],
            "vendido": c.get("vendido", 0), "reservado": c.get("reservado", 0),
            "disponible": c.get("disponible", 0),
            "pct_colocado": round(colocado / c["total"] * 100) if c["total"] else 0,
        })
    return sorted(out, key=lambda x: x["total"], reverse=True)


async def _weekly_from_history(db, dev_id: str, weeks: int = 8) -> Dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    buckets = [0] * weeks
    n = 0
    try:
        async for d in db.units_history.find({
            "development_id": dev_id, "field_changed": "status",
            "new_value": {"$in": ["vendido", "reservado"]},
            "changed_at": {"$gte": since},
        }, {"_id": 0, "changed_at": 1}):
            ca = d["changed_at"]
            if getattr(ca, "tzinfo", None) is None:
                ca = ca.replace(tzinfo=timezone.utc)
            idx = min(weeks - 1, int((ca - since).days // 7))
            buckets[idx] += 1
            n += 1
    except Exception as e:  # noqa
        log.warning(f"[sales-intel] weekly_history: {e}")
    if n > 0:
        return {"data": buckets, "available": True, "rate_per_week": round(n / weeks, 2)}
    return {"data": None, "available": False, "rate_per_week": None}


@router.get("/projects/{project_id}/sales-intel")
async def sales_intel(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in await _user_dev_ids(request, user):
        raise HTTPException(403, "Proyecto no accesible")

    from ingested_reader import resolve_dev_doc   # P7: db-first (seed→developments→projects), no solo seed
    dev = await resolve_dev_doc(db, project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    # ── resumen (reuso, no duplica) ──────────────────────────────────────────
    summary: Dict[str, Any] = {}
    try:
        from routes.dev_batch10 import get_project_summary
        summary = await get_project_summary(project_id, request)
    except Exception as e:  # noqa
        log.warning(f"[sales-intel] summary: {e}")

    # ── units efectivas (seed + overrides) para mix/margen ───────────────────
    overrides: Dict[str, Dict] = {}
    try:
        async for ov in db.developer_unit_overrides.find({"dev_id": project_id}, {"_id": 0}):
            overrides[f"{project_id}__{ov['unit_id']}"] = ov
    except Exception:
        pass
    units_eff: List[Dict] = []
    for u in dev.get("units", []):
        ov = overrides.get(f"{project_id}__{u['id']}", {})
        units_eff.append({**u, **{k: v for k, v in ov.items() if v is not None}})

    by_status: Dict[str, int] = defaultdict(int)
    for u in units_eff:
        by_status[u.get("status", "disponible")] += 1
    units_total = len(units_eff) or 1
    sold = by_status.get("vendido", 0)
    reserved = by_status.get("reservado", 0)
    avail = by_status.get("disponible", 0)

    # ── proyección + ritmo (consistentes: una sola tasa, sin metas inventadas) ─
    colocado = sold + reserved
    rate_month = round(sold / 6.0, 2) if sold else round(avail / 18.0, 2)  # uds/mes
    months_sellout = round(avail / rate_month) if rate_month else None
    price_from = dev.get("price_from", 0)
    avg_price = (price_from + dev.get("price_to", price_from)) / 2 or price_from
    proj_base = min(avail, round(rate_month * 12))
    proj_pess = min(avail, round(rate_month * 0.65 * 12))
    proj_opt = min(avail, round(rate_month * 1.38 * 12))
    forecast = {
        "rate_per_month": rate_month, "colocado_actual": colocado,
        "proj_12m": {"base": proj_base, "pesimista": proj_pess, "optimista": proj_opt},
        "colocado_pct_12m": round((colocado + proj_base) / units_total * 100),
        "revenue_12m_base": round(proj_base * avg_price),
    }

    weekly = await _weekly_from_history(db, project_id)

    months_delivery = _months_between(dev.get("delivery_estimate"))
    sellout = {
        "months_to_sellout": months_sellout,
        "months_to_delivery": months_delivery,
        "available": avail,
        "rate_per_month": rate_month,
        "ritmo_real": weekly["available"],
        "before_delivery": (months_sellout is not None and months_delivery is not None
                            and months_sellout <= months_delivery),
        "leftover_at_delivery": (max(0, round(avail - rate_month * months_delivery))
                                 if (months_delivery is not None and rate_month) else None),
    }

    # ── what-if de precio (elasticidad real, sin gate, read-only) ────────────
    whatif: Dict[str, Any] = {"available": False}
    try:
        from whatif_engine import WhatIfEngine
        eng = WhatIfEngine(db, org_id=_tenant(user), user_id="sales_intel")
        wf = {}
        for label, delta in (("up_3", 3.0), ("down_3", -3.0)):
            r = await eng.simulate_price_change(project_id, delta, horizon_months=12)
            o = r.get("outputs", {})
            wf[label] = {
                "delta_pct": delta,
                "velocity_change_pct": o.get("projected_velocity_change_pct"),
                "revenue_delta_mxn": o.get("projected_revenue_delta_mxn"),
                "data_quality": o.get("data_quality"),
            }
        whatif = {"available": True, **wf}
    except Exception as e:  # noqa
        log.warning(f"[sales-intel] whatif: {e}")

    # ── margen ───────────────────────────────────────────────────────────────
    margin = None
    try:
        import dmx_margin
        pm2 = dmx_margin.project_price_m2(units_eff)
        margins = await dmx_margin.compute_margins([{
            "id": project_id, "colonia_id": dev.get("colonia_id"),
            "price_m2": pm2, "absorption_rate": rate_month / 4.33}])
        margin = margins.get(project_id)
    except Exception as e:  # noqa
        log.warning(f"[sales-intel] margin: {e}")

    # ── IE: días a agotar + precio vs mercado ────────────────────────────────
    ie: Dict[str, Any] = {}
    try:
        async for d in db.ie_scores.find(
            {"zone_id": project_id, "is_stub": False,
             "code": {"$in": ["IE_PROY_DAYS_TO_SELLOUT", "IE_PROY_PRECIO_VS_MERCADO"]}},
            {"_id": 0, "code": 1, "value": 1, "confidence_interval": 1, "confidence": 1},
        ):
            ci = d.get("confidence_interval") or {}
            ie[d["code"]] = {"value": d.get("value"), "ci_low": ci.get("low"),
                             "ci_high": ci.get("high"), "confidence": d.get("confidence")}
    except Exception as e:  # noqa
        log.warning(f"[sales-intel] ie: {e}")

    return {
        "project_id": project_id, "name": dev.get("name"),
        "summary": {k: summary.get(k) for k in
                    ("sold_pct", "sold_units", "reserved_units", "units_total",
                     "leads_total", "leads_won", "leads_active", "conversion_pct")},
        "sellout": sellout, "weekly_sales": weekly, "forecast": forecast,
        "whatif": whatif, "prototypes": _prototype_mix(units_eff),
        "margin": margin, "ie": ie,
    }


async def ensure_sales_intel_indexes(db):
    return None
