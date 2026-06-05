"""Dev Location Intel — fan-out a motores de zona para la pestaña Ubicación.

GET /api/dev/projects/{project_id}/location-intel

Junta, con NÚMEROS REALES y fail-open por bloque:
  · ROI por estrategia (renta tradicional / Airbnb derivado / reventa)  ← investment_simulator_engine
  · Plusvalía proyectada + 3 escenarios                                 ← investment_simulator_engine
  · Precio de la zona (mediana $/m²)                                    ← drpi_engine (fallback seed)
  · Negocios cercanos por categoría                                     ← denue_engine (stub si no hay token)
  · Forecast de apreciación 6/12/24m                                    ← forecast_engine
  · Demanda viva (leads/citas reales del proyecto)                      ← db.leads
  · Perfil del comprador (ingreso/familia/conectividad)                 ← db.ie_scores (score 0-100)

Cada bloque trae su propio `available` + `source`. Hoy en local solo el simulador,
los leads y los scores IE dan número real; DRPI/DENUE/forecast caen a stub honesto y
se autollenan al cargar transacciones + token (patrón "construir para el estado final").
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.location_intel")
router = APIRouter(prefix="/api/dev", tags=["location-intel"])


# ─── helpers (mismo patrón que dev_batch10) ──────────────────────────────────
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


def _user_dev_ids(user) -> List[str]:
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


def _resolve_project_zone(project_id: str) -> Dict[str, Any]:
    """Proyecto → zona. colonia_id del seed ya es el slug canónico de los motores."""
    from data_developments import DEVELOPMENTS_BY_ID
    import dmx_margin

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    colonia_slug = dev.get("colonia_id") or str(dev.get("colonia", "")).lower().replace(" ", "-")
    colonia_name = dev.get("colonia") or colonia_slug.replace("-", " ").title()
    center = dev.get("center") or [-99.1332, 19.4326]  # GeoJSON [lng, lat]
    lng, lat = float(center[0]), float(center[1])

    price_m2_project = dmx_margin.project_price_m2(dev.get("units", []))
    m2_range = dev.get("m2_range") or [80, 120]
    m2_mid = (m2_range[0] + m2_range[-1]) / 2 if m2_range else 100.0
    price_from = dev.get("price_from") or 0
    if not price_m2_project and price_from and m2_range and m2_range[0]:
        price_m2_project = price_from / m2_range[0]

    return {
        "dev": dev,
        "colonia_slug": colonia_slug,
        "colonia_name": colonia_name,
        "alcaldia": dev.get("alcaldia"),
        "lat": lat, "lng": lng,
        "price_m2_project": round(price_m2_project) if price_m2_project else None,
        "m2_mid": m2_mid,
        "price_from": price_from,
    }


# ─── bloques (fail-open) ─────────────────────────────────────────────────────
async def _drpi_block(db, slug: str) -> Dict[str, Any]:
    zid_alt = slug.replace("-", "_")
    snap = await db.drpi_snapshots.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zid_alt}],
         "tier": "colonia", "available": {"$ne": False}},
        {"_id": 0, "index_value": 1, "delta_pct": 1, "period": 1,
         "median_price_per_m2": 1, "sample_size": 1},
        sort=[("computed_at_dt", -1)],
    )
    if snap and snap.get("median_price_per_m2"):
        return {"available": True, "source": "DRPI · transacciones reales",
                "median_price_per_m2": round(snap["median_price_per_m2"]),
                "delta_pct": snap.get("delta_pct"),
                "period": snap.get("period"), "sample_size": snap.get("sample_size")}
    from data_seed import COLONIAS_BY_ID
    col = COLONIAS_BY_ID.get(slug) or {}
    seed_m2 = col.get("price_m2_num")
    return {"available": False, "reason": "insufficient_data",
            "source": "estimado · referencia de zona (sin transacciones aún)",
            "median_price_per_m2": round(seed_m2) if seed_m2 else None,
            "delta_pct": None, "sample_size": 0}


async def _denue_block(db, slug: str) -> Dict[str, Any]:
    import denue_engine as denue
    cached = await denue.get_zone_density(db, slug)
    cats = ("restaurants", "schools", "hospitals", "markets", "pharmacies", "banks", "gyms")
    if cached and cached.get("businesses_count_total", 0) > 0:
        bc = cached.get("by_category", {}) or {}
        return {"available": True, "source": "DENUE · INEGI",
                "total": cached["businesses_count_total"],
                "by_category": {k: bc.get(k, 0) for k in cats},
                "per_km2": round(cached.get("businesses_per_km2") or 0),
                "radius_m": cached.get("radius_m", 2000)}
    return {"available": False, "reason": "sin_sincronizar",
            "source": "censo de negocios INEGI · se conecta al sincronizar",
            "total": 0, "by_category": {k: 0 for k in cats},
            "per_km2": 0, "radius_m": 2000}


async def _forecast_block(db, slug: str) -> Dict[str, Any]:
    import forecast_engine as fc
    zf = await fc.get_zone_forecast(db, slug)
    if zf and zf.get("horizons"):
        return {"available": True, "source": "forecast ARIMA · histórico de precios",
                "horizons": zf["horizons"], "mape": zf.get("mape_test")}
    return {"available": False, "reason": "insufficient_history",
            "source": "proyección · se conecta al acumular histórico de precios",
            "horizons": {}, "mape": None}


async def _demand_block(db, project_id: str, dev_org_id: str) -> Dict[str, Any]:
    q = {"$or": [{"project_id": project_id}, {"development_id": project_id}]}
    leads = await db.leads.find(q, {"_id": 0, "status": 1}).to_list(5000)
    by_status = Counter((l.get("status") or "nuevo") for l in leads)
    TERMINAL = {"cerrado_ganado", "cerrado_perdido", "archivado", "descartado"}
    activos = sum(c for s, c in by_status.items() if s not in TERMINAL)
    citas = 0
    try:
        citas = await db.appointments.count_documents(
            {"$or": [{"project_id": project_id}, {"development_id": project_id}]})
    except Exception:
        pass
    searches = 0
    try:
        searches = await db.marketplace_searches.count_documents({"colonia_id": project_id})
    except Exception:
        pass
    return {"available": True, "source": "leads y citas reales del proyecto",
            "leads_total": len(leads), "leads_activos": activos,
            "leads_ganados": by_status.get("cerrado_ganado", 0),
            "citas": citas, "searches": searches}


async def _buyer_block(db, slug: str) -> Dict[str, Any]:
    """Perfil del comprador desde scores IE de la colonia (0-100, no $)."""
    zid_alt = slug.replace("-", "_")
    codes = {
        "ingreso": "IE_COL_DEMOGRAFIA_INGRESO",
        "familia": "IE_COL_DEMOGRAFIA_FAMILIA",
        "conectividad": "IE_COL_CONECTIVIDAD_VIALIDAD",
        "seguridad": "IE_COL_SEGURIDAD",
        "parques": "IE_COL_CULTURAL_PARQUES",
    }
    out: Dict[str, Any] = {"source": "perfil de zona · scores INEGI (0-100)"}
    for key, code in codes.items():
        doc = await db.ie_scores.find_one(
            {"$or": [{"zone_id": slug}, {"zone_id": zid_alt}], "code": code},
            {"_id": 0, "value": 1, "is_stub": 1})
        out[key] = (doc or {}).get("value")
        out[f"{key}_stub"] = bool((doc or {}).get("is_stub"))
    return out


def _airbnb_from_traditional(renta_bruta_mensual: float) -> Dict[str, Any]:
    """Airbnb derivado: ADR ~1.6× renta larga bruta, opex/vacancia ~40%. Estimado, no medido."""
    bruta = (renta_bruta_mensual or 0) * 1.6
    neta = bruta * 0.60
    return {"available": False, "metodo": "estimado · 1.6× renta tradicional, opex 40%",
            "renta_bruta_mensual": round(bruta), "renta_neta_mensual": round(neta)}


@router.get("/projects/{project_id}/location-intel")
async def location_intel(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in _user_dev_ids(user):
        raise HTTPException(403, "Proyecto no accesible")

    z = _resolve_project_zone(project_id)
    slug = z["colonia_slug"]
    dev_org_id = _tenant(user)

    import investment_simulator_engine as inv

    async def _safe(coro, label, fallback):
        try:
            return await coro
        except Exception as e:  # noqa
            log.warning(f"[loc-intel] {label}: {e}")
            return fallback

    drpi = await _safe(_drpi_block(db, slug), "drpi", {"available": False})
    denue = await _safe(_denue_block(db, slug), "denue", {"available": False})
    forecast = await _safe(_forecast_block(db, slug), "forecast", {"available": False})
    demand = await _safe(_demand_block(db, project_id, dev_org_id), "demand", {"available": False})
    buyer = await _safe(_buyer_block(db, slug), "buyer", {})

    sim: Dict[str, Any] = {}
    try:
        sim = await inv.simulate(
            db, precio_entrada=z["price_from"] or 3_000_000,
            plazo_meses=120, m2=z["m2_mid"], colonia_slug=slug)
        for k in ("conservador", "base", "optimista"):
            if isinstance(sim.get(k), dict):
                sim[k].pop("cash_flow_monthly", None)
    except Exception as e:  # noqa
        log.warning(f"[loc-intel] simulate: {e}")
        sim = {}

    base = sim.get("base") or {}
    renta_bruta = base.get("renta_mensual_bruta")
    scen = {k: {kk: (sim.get(k) or {}).get(kk)
                for kk in ("roi_pct", "tir_anual_pct", "break_even_meses", "aprec_anual_pct")}
            for k in ("conservador", "base", "optimista")}

    return {
        "project_id": project_id,
        "project_name": z["dev"].get("name"),
        "colonia": z["colonia_name"],
        "alcaldia": z["alcaldia"],
        "price_m2_project": z["price_m2_project"],
        "precio_entrada": z["price_from"],
        "roi": {
            "available": bool(base),
            "renta_tradicional": {
                "renta_bruta_mensual": renta_bruta,
                "renta_neta_mensual": base.get("renta_mensual_neta"),
                "yield_bruto_anual_pct": (round(renta_bruta * 12 / z["price_from"] * 100, 1)
                                          if renta_bruta and z["price_from"] else None),
            },
            "airbnb": _airbnb_from_traditional(renta_bruta or 0),
            "reventa": {
                "plusvalia_abs": base.get("plusvalia_abs"),
                "precio_final": base.get("precio_final"),
                "horizonte_anios": 10,
                "roi_pct": base.get("roi_pct"),
            },
            "aprec_anual_pct": base.get("aprec_anual_pct"),
            "tir_anual_pct": base.get("tir_anual_pct"),
            "escenarios": scen,
            "dmx_label": sim.get("dmx_label"),
        },
        "plusvalia": {"drpi": drpi, "forecast": forecast},
        "negocios": denue,
        "demanda": demand,
        "comprador": buyer,
    }


async def ensure_location_intel_indexes(db):
    """No requiere colecciones nuevas."""
    return None
