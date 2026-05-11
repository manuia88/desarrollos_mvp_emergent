"""Developer portal routes (Phase 5 — LADO DEVELOPER).

All endpoints gated by role `developer_admin` or `superadmin`.
Built atop mocked developments in data_developments.py plus runtime state in MongoDB.
"""

import os
import uuid
import hashlib
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel


router = APIRouter(prefix="/api/desarrollador", tags=["desarrollador"])

DEV_ADMIN_ROLES = {"developer_admin", "superadmin"}


def _now():
    return datetime.now(timezone.utc)


def _uid(pfx):
    return f"{pfx}_{uuid.uuid4().hex[:10]}"


def get_db(request: Request):
    return request.app.state.db


async def require_dev_admin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in DEV_ADMIN_ROLES:
        raise HTTPException(403, "Acceso restringido al portal del desarrollador")
    return user


def _user_dev_ids(user) -> List[str]:
    """Developers assigned to this user. For MVP: both superadmin and developer_admin see all."""
    from data_developments import DEVELOPMENTS
    return [d["id"] for d in DEVELOPMENTS]


# ─── Dashboard ────────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def dashboard(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = [u for u in ALL_UNITS if any(u["development_id"] == d["id"] for d in my_devs)]

    available = sum(1 for u in my_units if u["status"] == "disponible")
    reserved  = sum(1 for u in my_units if u["status"] == "reservado")
    sold      = sum(1 for u in my_units if u["status"] == "vendido")
    total     = len(my_units)
    absorption = round(100 * sold / total, 1) if total else 0

    revenue_booked = sum(u["price"] for u in my_units if u["status"] == "vendido")
    revenue_pipeline = sum(u["price"] for u in my_units if u["status"] == "reservado")

    db = get_db(request)
    pricing_alerts = await db.developer_pricing_suggestions.count_documents({"status": "pending"})
    competitor_alerts = await db.developer_competitor_alerts.count_documents({"acked": {"$ne": True}})

    return {
        "developments_count": len(my_devs),
        "units_total": total,
        "units_available": available,
        "units_reserved": reserved,
        "units_sold": sold,
        "absorption_pct": absorption,
        "revenue_booked": revenue_booked,
        "revenue_pipeline": revenue_pipeline,
        "pricing_alerts": pricing_alerts,
        "competitor_alerts": competitor_alerts,
        "developments": [{
            "id": d["id"], "name": d["name"], "colonia": d["colonia"], "stage": d["stage"],
            "units_total": d["units_total"], "units_available": d["units_available"],
            "delivery_estimate": d["delivery_estimate"], "price_from": d["price_from"],
        } for d in my_devs],
    }


# ─── D1: Inventory ────────────────────────────────────────────────────────────
@router.get("/inventario")
async def list_inventory(request: Request, dev_id: Optional[str] = None):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids and (not dev_id or d["id"] == dev_id)]

    # Merge any runtime overrides (status changes made in this portal)
    db = get_db(request)
    overrides = {}
    async for ov in db.developer_unit_overrides.find({"dev_id": {"$in": [d["id"] for d in devs]}}, {"_id": 0}):
        overrides[ov["unit_id"]] = ov

    result = []
    for d in devs:
        units = []
        for u in d.get("units", []):
            ov = overrides.get(u["id"])
            units.append({**u, "status": ov["status"] if ov else u["status"],
                          "overridden": bool(ov)})
        result.append({
            "id": d["id"], "name": d["name"], "colonia": d["colonia"], "stage": d["stage"],
            "delivery_estimate": d["delivery_estimate"], "construction_progress": d.get("construction_progress", 0),
            "price_from": d["price_from"], "price_to": d.get("price_to"),
            "amenities": d.get("amenities", []),
            "units_total": len(units),
            "units_by_status": {
                "disponible": sum(1 for u in units if u["status"] == "disponible"),
                "apartado":   sum(1 for u in units if u["status"] == "apartado"),
                "reservado":  sum(1 for u in units if u["status"] == "reservado"),
                "vendido":    sum(1 for u in units if u["status"] == "vendido"),
                "bloqueado":  sum(1 for u in units if u["status"] == "bloqueado"),
            },
            "units": units,
        })
    return result


class UnitStatusPatch(BaseModel):
    dev_id: str
    unit_id: str
    status: str  # disponible|apartado|reservado|vendido|bloqueado
    reason: Optional[str] = None


@router.patch("/inventario/unit-status")
async def patch_unit_status(payload: UnitStatusPatch, request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    if payload.status not in ("disponible", "apartado", "reservado", "vendido", "bloqueado"):
        raise HTTPException(400, "status inválido")
    # Capture old status for history before upsert
    prev = await db.developer_unit_overrides.find_one({"unit_id": payload.unit_id}, {"_id": 0, "status": 1})
    old_status = (prev or {}).get("status")
    if old_status is None:
        # Fallback to seed status
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(payload.dev_id) or {}
        for u in dev.get("units", []):
            if u.get("id") == payload.unit_id:
                old_status = u.get("status")
                break
    await db.developer_unit_overrides.update_one(
        {"unit_id": payload.unit_id},
        {"$set": {
            "unit_id": payload.unit_id, "dev_id": payload.dev_id,
            "status": payload.status, "reason": payload.reason or "",
            "updated_by": user.user_id, "updated_at": _now(),
        }},
        upsert=True,
    )
    # Audit log
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "dev_id": payload.dev_id, "unit_id": payload.unit_id,
        "user_id": user.user_id, "action": "unit_status_change",
        "payload": payload.model_dump(), "ts": _now(),
    })
    # Phase 7.9 — units_history trigger
    try:
        from units_history import record_unit_change
        await record_unit_change(
            db, unit_id=payload.unit_id, development_id=payload.dev_id,
            field_changed="status", old_value=old_status, new_value=payload.status,
            changed_by_user_id=user.user_id, source="manual_edit",
            extra={"reason": payload.reason or ""},
        )
    except Exception as e:
        import logging; logging.getLogger("dmx").warning(f"units_history record failed: {e}")
    # F0.1 — Audit log (critical mutation + ML emit)
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(db, user, "update", "unit", payload.unit_id,
                           before={"status": old_status, "dev_id": payload.dev_id},
                           after={"status": payload.status, "dev_id": payload.dev_id, "reason": payload.reason},
                           request=request)
        await emit_ml_event(db, "mutation_logged", user.user_id, getattr(user, "tenant_id", None), user.role,
                            context={"entity_type": "unit", "action": "update"}, ai_decision={}, user_action={})
    except Exception: pass
    return {"ok": True, "status": payload.status}


# ─── D6: Demand Heatmap ───────────────────────────────────────────────────────
@router.get("/demanda")
async def demand_heatmap(request: Request):
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    user = await require_dev_admin(request)

    # Deterministic synthetic demand per colonia (would come from real search logs)
    random.seed(42)
    by_colonia = []
    for c in COLONIAS:
        base = random.randint(80, 420)
        growth = random.randint(-15, 45)
        supply = sum(1 for d in DEVELOPMENTS if d["colonia_id"] == c["id"])
        net_demand = max(0, base - supply * 20)
        by_colonia.append({
            "colonia_id": c["id"], "colonia": c["name"],
            "alcaldia": c["alcaldia"],
            "coords": c.get("center"),
            "searches_30d": base,
            "growth_mom_pct": growth,
            "supply_count": supply,
            "net_demand": net_demand,
            "heat": min(100, int(100 * net_demand / 450)),
        })
    by_colonia.sort(key=lambda x: -x["net_demand"])

    top_queries = [
        {"q": "preventa polanco 3 recámaras", "count": 342},
        {"q": "departamento condesa pet friendly", "count": 289},
        {"q": "penthouse roma norte", "count": 241},
        {"q": "santa fe cowork amenity", "count": 218},
        {"q": "lomas chapultepec terraza", "count": 192},
        {"q": "coyoacán casa jardín", "count": 167},
        {"q": "del valle estudio inversión", "count": 144},
        {"q": "entrega inmediata juárez", "count": 128},
        {"q": "narvarte 2 recámaras 5 millones", "count": 102},
        {"q": "roof garden roma norte", "count": 95},
    ]

    forecast_30d = sum(c["net_demand"] for c in by_colonia[:5]) * 1.08
    forecast_60d = forecast_30d * 1.05
    forecast_90d = forecast_60d * 1.03

    return {
        "by_colonia": by_colonia,
        "top_queries": top_queries,
        "funnel": {"impressions": 12450, "clicks": 3980, "fichas": 1240, "contacts": 186},
        "forecast": {"d30": int(forecast_30d), "d60": int(forecast_60d), "d90": int(forecast_90d)},
        "unmet_demand": [c for c in by_colonia if c["supply_count"] == 0 and c["net_demand"] > 150][:6],
    }


# ─── D9: Monthly AI Report ────────────────────────────────────────────────────
@router.post("/reportes/generar")
async def generate_report(request: Request, month: Optional[str] = None):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    db = get_db(request)

    month_key = month or (_now() - timedelta(days=30)).strftime("%Y-%m")
    dev_ids = _user_dev_ids(user)
    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = [u for u in ALL_UNITS if any(u["development_id"] == d["id"] for d in my_devs)]

    total_units = len(my_units)
    sold = sum(1 for u in my_units if u["status"] == "vendido")
    absorbed = round(100 * sold / total_units, 1) if total_units else 0
    avg_price = int(sum(u["price"] for u in my_units) / total_units) if total_units else 0

    # Cache check
    cached = await db.developer_reports.find_one({"owner_id": user.user_id, "month": month_key}, {"_id": 0})
    if cached:
        return cached

    summary_text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        prompt = f"""Eres un analista senior de real estate. Escribe un resumen ejecutivo (1 párrafo, 4-6 oraciones, es-MX) del desempeño del portafolio en el mes {month_key}:
- {len(my_devs)} desarrollos activos ({', '.join(d['name'] for d in my_devs[:5])})
- Absorción: {absorbed}% ({sold} unidades vendidas de {total_units})
- Ticket promedio: ${avg_price:,} MXN
- Amenidades top: {', '.join(sum([d.get('amenities', [])[:2] for d in my_devs[:3]], []))}

Tono: analítico, basado en datos, sin marketing vacío. Cierra con el insight accionable #1 del mes."""
        chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"),
                       session_id=f"report-{user.user_id}-{month_key}",
                       system_message="Eres un analista senior de real estate LATAM.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        summary_text = await chat.send_message(UserMessage(text=prompt))
    except Exception:
        summary_text = (f"Durante {month_key} el portafolio cerró {sold} unidades ({absorbed}% absorción) con ticket promedio "
                        f"de ${avg_price:,} MXN. La demanda se concentró en preventa y entrega inmediata. "
                        f"Insight accionable: consolidar descuentos por pronto pago en la etapa con más días sin cierre.")

    wins = [
        "Absorción superó benchmark de mercado en +2.4pts",
        "Ticket promedio incrementó 3.1% mes a mes",
        "3 leads enterprise cerraron en la semana final del mes",
    ]
    alerts = [
        "2 unidades >90 días sin cierre — candidatas a ajuste de precio",
        "Demanda Roma Norte creció 28% — considerar reasignar inventario",
        "Competidor lanzó proyecto a 800m del tuyo a 12% menos/m²",
    ]
    recommendations = [
        "Lanzar esquema descuento 3% pronto pago para etapa entrega 2026-Q4",
        "Activar ads hiper-segmentados en Polanco + Condesa",
        "Programar visita VIP para top 10 leads calientes del mes",
    ]
    metrics = {
        "absorption_pct": absorbed,
        "avg_price": avg_price,
        "units_sold": sold,
        "units_total": total_units,
        "revenue": sum(u["price"] for u in my_units if u["status"] == "vendido"),
    }

    report = {
        "id": _uid("rep"),
        "owner_id": user.user_id,
        "month": month_key,
        "summary": summary_text,
        "wins": wins,
        "alerts": alerts,
        "recommendations": recommendations,
        "metrics": metrics,
        "generated_at": _now().isoformat(),
    }
    await db.developer_reports.insert_one(dict(report))
    report.pop("_id", None)
    return report


@router.get("/reportes")
async def list_reports(request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    items = await db.developer_reports.find({"owner_id": user.user_id}, {"_id": 0}).sort("month", -1).to_list(24)
    return items


# ─── D4: Dynamic Pricing AI ───────────────────────────────────────────────────
@router.get("/pricing/suggestions")
async def list_pricing_suggestions(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    db = get_db(request)
    dev_ids = _user_dev_ids(user)

    # Generate deterministic suggestions if we don't have them yet for this user
    existing = await db.developer_pricing_suggestions.count_documents({"owner_id": user.user_id})
    if existing == 0:
        rng = random.Random(sum(ord(c) for c in user.user_id))
        suggestions = []
        candidate_units = [u for u in ALL_UNITS if u.get("development_id") in dev_ids and u["status"] == "disponible"][:40]
        for u in candidate_units:
            # Simulate demand/supply signals
            days_on_market = rng.randint(15, 180)
            visits = rng.randint(0, 22)
            direction = "up" if visits > 14 else "down" if days_on_market > 120 else "hold"
            pct = rng.choice([1.5, 2.0, 3.0, 4.0, 5.0]) * (1 if direction == "up" else -1 if direction == "down" else 0)
            new_price = int(u["price"] * (1 + pct / 100)) if pct else u["price"]
            if pct == 0:
                continue
            reasons = []
            if direction == "up":
                reasons.append(f"{visits} visitas en {days_on_market} días — demanda sobre benchmark")
                reasons.append(f"Absorción de prototipo {u.get('prototype')} top 25%")
            else:
                reasons.append(f"{days_on_market} días sin cierre — sobre ventana objetivo (90d)")
                reasons.append(f"Competidor en la zona pricing 5-8% menor")

            doc = {
                "id": _uid("pricesug"),
                "owner_id": user.user_id,
                "dev_id": u["development_id"],
                "unit_id": u["id"],
                "unit_number": u.get("unit_number", "—"),
                "prototype": u.get("prototype", "—"),
                "current_price": u["price"],
                "suggested_price": new_price,
                "delta_pct": pct,
                "direction": direction,
                "days_on_market": days_on_market,
                "visits_last_30d": visits,
                "reasons": reasons,
                "status": "pending",  # pending|approved|rejected|applied
                "created_at": _now(),
            }
            suggestions.append(doc)
        if suggestions:
            await db.developer_pricing_suggestions.insert_many(suggestions)

    items = await db.developer_pricing_suggestions.find({"owner_id": user.user_id}, {"_id": 0}).sort([("status", 1), ("created_at", -1)]).to_list(200)
    return items


class PricingAction(BaseModel):
    status: str  # approved|rejected|applied
    note: Optional[str] = None


@router.patch("/pricing/suggestions/{sid}")
async def act_on_suggestion(sid: str, payload: PricingAction, request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    if payload.status not in ("approved", "rejected", "applied"):
        raise HTTPException(400, "status inválido")

    # GC-X4 — block apply if cross-check critical active on the dev
    if payload.status == "applied":
        sug = await db.developer_pricing_suggestions.find_one({"id": sid, "owner_id": user.user_id})
        if sug and sug.get("dev_id"):
            from cross_check_engine import has_critical
            if await has_critical(db, sug["dev_id"]):
                raise HTTPException(409, {
                    "error": "cross_check_critical_pending",
                    "message": "Bloqueado: cross-check critical pendiente, resuelve docs primero.",
                    "dev_id": sug["dev_id"],
                })

    r = await db.developer_pricing_suggestions.update_one(
        {"id": sid, "owner_id": user.user_id},
        {"$set": {"status": payload.status, "note": payload.note or "", "actioned_at": _now()}},
    )
    if not r.matched_count: raise HTTPException(404, "No encontrada")
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "user_id": user.user_id, "action": f"pricing_{payload.status}",
        "ref": sid, "ts": _now(),
    })
    return {"ok": True, "status": payload.status}


# GC-X4 helper endpoint — surface dev-level cross-check warnings to /desarrollador/pricing UI
@router.get("/pricing/cross-check-warnings")
async def pricing_cross_check_warnings(request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    dev_ids = _user_dev_ids(user)
    pipe = [
        {"$match": {"development_id": {"$in": dev_ids}, "severity": "critical", "result": "fail"}},
        {"$group": {"_id": "$development_id", "rules": {"$push": "$rule_id"}, "count": {"$sum": 1}}},
    ]
    rows = [r async for r in db.di_cross_checks.aggregate(pipe)]
    from data_developments import DEVELOPMENTS_BY_ID
    return {
        "blocked_count": len(rows),
        "blocked": [
            {
                "dev_id": r["_id"],
                "dev_name": (DEVELOPMENTS_BY_ID.get(r["_id"], {}) or {}).get("name", r["_id"]),
                "rules": r["rules"],
                "count": int(r["count"]),
            }
            for r in rows
        ],
    }


# ─── D3: Competitor Radar ─────────────────────────────────────────────────────
@router.get("/competidores")
async def competitor_radar(request: Request, dev_id: Optional[str] = None, radius_km: float = 2.0):
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)

    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids and (not dev_id or d["id"] == dev_id)]
    if not my_devs:
        return {"my_project": None, "competitors": [], "alerts": []}

    mine = my_devs[0] if dev_id else my_devs[0]
    my_lat, my_lon = mine["center"]
    my_m2 = (mine["m2_range"][0] + mine["m2_range"][1]) / 2
    my_price_sqm = mine["price_from"] / mine["m2_range"][0]

    # Find competitor developments in same/adjacent colonias (approximation of radius filter)
    competitors_raw = [d for d in DEVELOPMENTS if d["id"] != mine["id"] and d["alcaldia"] == mine["alcaldia"]][:8]

    competitors = []
    rng = random.Random(hash(mine["id"]) % 2**32)
    for c in competitors_raw:
        c_lat, c_lon = c["center"]
        # Rough distance in km (haversine approximation)
        dist_km = ((my_lat - c_lat) ** 2 + (my_lon - c_lon) ** 2) ** 0.5 * 111
        if dist_km > radius_km * 3: continue  # wider tolerance for mock
        c_price_sqm = c["price_from"] / c["m2_range"][0]
        delta = round(100 * (c_price_sqm - my_price_sqm) / my_price_sqm, 1)
        absorption = rng.randint(30, 78)
        competitors.append({
            "id": c["id"], "name": c["name"], "developer_id": c["developer_id"],
            "colonia": c["colonia"], "stage": c["stage"],
            "price_sqm_mxn": int(c_price_sqm),
            "delta_vs_mine_pct": delta,
            "absorption_pct": absorption,
            "units_total": c["units_total"],
            "units_available": c["units_available"],
            "amenities": c.get("amenities", []),
            "delivery_estimate": c["delivery_estimate"],
            "distance_km": round(dist_km, 2),
        })
    competitors.sort(key=lambda x: x["distance_km"])

    # Alerts: competitors with -5% pricing or -10% absorption advantage
    alerts = []
    for c in competitors:
        if c["delta_vs_mine_pct"] < -5:
            alerts.append({"kind": "pricing_below", "competitor": c["name"], "delta": c["delta_vs_mine_pct"],
                           "msg": f"{c['name']} está precio/m² {-c['delta_vs_mine_pct']}% por debajo del tuyo."})
        if c["absorption_pct"] > 65:
            alerts.append({"kind": "high_absorption", "competitor": c["name"], "absorption": c["absorption_pct"],
                           "msg": f"{c['name']} tiene absorción de {c['absorption_pct']}% — revisar mix de amenidades."})

    return {
        "my_project": {
            "id": mine["id"], "name": mine["name"], "center": mine["center"],
            "price_sqm_mxn": int(my_price_sqm), "absorption_pct": round(100 * (mine["units_total"] - mine["units_available"]) / mine["units_total"], 1),
            "units_available": mine["units_available"], "units_total": mine["units_total"],
            "amenities": mine.get("amenities", []),
        },
        "competitors": competitors[:8],
        "alerts": alerts[:5],
    }


@router.post("/competidores/alert-ack")
async def ack_alert(request: Request, payload: dict):
    user = await require_dev_admin(request)
    db = get_db(request)
    await db.developer_competitor_alerts.insert_one({
        "id": _uid("ackalr"), "user_id": user.user_id,
        "competitor_id": payload.get("competitor_id"),
        "acked": True, "ts": _now(),
    })
    return {"ok": True}


# ─── Audit log ────────────────────────────────────────────────────────────────
@router.get("/audit")
async def audit_log(request: Request, limit: int = 100):
    user = await require_dev_admin(request)
    db = get_db(request)
    items = await db.developer_audit.find({"user_id": user.user_id}, {"_id": 0}).sort("ts", -1).limit(limit).to_list(limit)
    return items
