"""Dev Insights Intel — fan-out para el cockpit "Veredicto de mercado" (pestaña Insights).

GET /api/dev/projects/{project_id}/insights-intel

Junta, con NÚMEROS REALES y fail-open por bloque:
  · valor justo (AVM) vs tu precio de lista   ← avm_public_engine (heurístico de zona)
  · comparables reales (precio/m² vs los tuyos) ← insights_comparables + seed
  · embudo vista→lead→cita→cierre con %        ← engagement_events + leads + appointments
  · salud del activo + qué dimensión arrastra  ← dmx_project_score (mismo full_score del Inicio)
  · apreciación proyectada                      ← forecast_engine (honesto si vacío)

Doctrina del dato práctico: número + plazo + comparativo + acción. db.units está vacía →
los precios/m² salen del seed (no de Mongo). Lo que no tiene dato = honesto, no inventado.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.insights_intel")
router = APIRouter(prefix="/api/dev", tags=["insights-intel"])


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


async def _user_dev_ids(request, user) -> List[str]:
    # P7 (auditoría 07-20): seed + devs REALES del tenant (db.developments), no solo el seed.
    from tenant_scope import user_dev_ids_db
    return await user_dev_ids_db(_db(request), user)


def _seed_pm2(dev: Dict[str, Any]) -> Optional[float]:
    vals = [u["price"] / u["m2_privative"] for u in dev.get("units", [])
            if u.get("price") and u.get("m2_privative")]
    return round(sum(vals) / len(vals)) if vals else None


def _seed_sold_pct(dev: Dict[str, Any]) -> Optional[int]:
    us = dev.get("units", [])
    if not us:
        return None
    colocado = sum(1 for u in us if u.get("status") in ("vendido", "reservado"))
    return round(colocado / len(us) * 100)


async def _safe(coro, default=None, label=""):
    try:
        return await coro
    except Exception as exc:  # noqa
        log.warning(f"[insights-intel] {label}: {exc}")
        return default


@router.get("/projects/{project_id}/insights-intel")
async def insights_intel(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in await _user_dev_ids(request, user):
        raise HTTPException(403, "Proyecto no accesible")

    from ingested_reader import resolve_dev_doc   # P7: db-first (seed→developments→projects), no solo seed
    dev = await resolve_dev_doc(db, project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    colonia_slug = dev.get("colonia_id")
    m2_range = dev.get("m2_range") or [80, 120]
    m2_mid = (m2_range[0] + m2_range[-1]) / 2 if m2_range else 100.0
    list_pm2 = _seed_pm2(dev)

    # ── 1 · AVM (valor justo heurístico de zona) ─────────────────────────────
    avm: Dict[str, Any] = {}
    try:
        from avm_public_engine import avm_quick_async
        avm = await avm_quick_async(db, colonia_slug, m2_mid, 3, 2, 0) or {}
    except Exception as e:  # noqa
        log.warning(f"[insights-intel] avm: {e}")
    avm_pm2 = avm.get("precio_per_m2")
    list_vs_avm = (round((list_pm2 / avm_pm2 - 1) * 100) if list_pm2 and avm_pm2 else None)

    # ── 2 · Comparables (precio/m² desde seed, db.units vacía) ───────────────
    comparables: List[Dict[str, Any]] = []
    try:
        from services.insights_comparables import find_comparables
        comps = await find_comparables(db, project_id, top_n=4)
        from data_developments import DEVELOPMENTS_BY_ID   # comparables de mercado: seed (comparadores, no dato del tenant)
        for c in (comps.get("comparables") or []):
            cdev = DEVELOPMENTS_BY_ID.get(c.get("id"))
            cpm2 = _seed_pm2(cdev) if cdev else (c.get("price_per_m2") or None)
            comparables.append({
                "name": c.get("name"), "colonia": c.get("colonia"),
                "price_m2": cpm2, "sold_pct": _seed_sold_pct(cdev) if cdev else None,
                "vs_you_pct": (round((list_pm2 / cpm2 - 1) * 100) if list_pm2 and cpm2 else None),
            })
    except Exception as e:  # noqa
        log.warning(f"[insights-intel] comparables: {e}")

    # ── 3 · Salud del activo (mismo full_score del Inicio) + qué arrastra ────
    score: Dict[str, Any] = {}
    try:
        from routes.dev_batch10 import list_projects_with_stats
        res = await list_projects_with_stats(request)
        rows = res if isinstance(res, list) else (res.get("projects") or res.get("items") or [])
        row = next((r for r in rows if r.get("id") == project_id), None)
        fs = (row or {}).get("full_score") or {}
        bd = fs.get("breakdown") or []
        # "Lo que más resta" = la dimensión que más puntos pierde (peso × brecha a 100).
        worst = max(bd, key=lambda d: (d.get("weight", 0) * (100 - d.get("value", 0)))) if bd else None
        score = {"score": fs.get("score"), "grade": fs.get("grade"),
                 "breakdown": bd, "arrastra": (worst or {}).get("dim")}
    except Exception as e:  # noqa
        log.warning(f"[insights-intel] score: {e}")

    # ── 4 · Embudo real vista→lead→cita→cierre ───────────────────────────────
    views = await _safe(db.engagement_events.count_documents(
        {"project_id": project_id, "actor_type": "cliente"}), 0, "views")
    leads = await _safe(db.leads.count_documents({"development_id": project_id}), 0, "leads")
    won = await _safe(db.leads.count_documents(
        {"development_id": project_id, "status": {"$in": ["cerrado_ganado", "ganado", "won"]}}), 0, "won")
    citas = await _safe(db.appointments.count_documents({"project_id": project_id}), 0, "citas")
    cv_vl = round(leads / views * 100, 1) if views else None
    cv_lc = round(citas / leads * 100, 1) if leads else None
    fuga = None
    if leads and (citas / leads) < 0.15:
        fuga = "lead→cita"
    elif views and (leads / views) < 0.05:
        fuga = "vista→lead"
    embudo = {"vistas": views, "leads": leads, "citas": citas, "ganados": won,
              "conv_vista_lead": cv_vl, "conv_lead_cita": cv_lc,
              "conv_total": round(won / leads * 100, 1) if leads else None, "fuga": fuga}

    # ── 5 · Forecast de apreciación (honesto si vacío) ───────────────────────
    forecast = {"available": False, "horizons": {}}
    try:
        from forecast_engine import get_zone_forecast
        zf = await get_zone_forecast(db, colonia_slug)
        if zf and zf.get("horizons"):
            forecast = {"available": True, "horizons": zf["horizons"], "mape": zf.get("mape_test")}
    except Exception as e:  # noqa
        log.warning(f"[insights-intel] forecast: {e}")

    return {
        "project_id": project_id, "name": dev.get("name"),
        "avm": {
            "valor_estimado": avm.get("precio_estimado"), "pm2": avm_pm2,
            "rango": [avm.get("range_low"), avm.get("range_high")],
            "confianza": avm.get("confidence"), "modelo": avm.get("pricing_model"),
            "list_pm2": list_pm2, "list_vs_avm_pct": list_vs_avm, "m2_ref": round(m2_mid),
        },
        "comparables": comparables,
        "score": score,
        "embudo": embudo,
        "forecast": forecast,
    }


async def ensure_insights_intel_indexes(db):
    return None
