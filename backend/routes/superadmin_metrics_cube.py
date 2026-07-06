"""W2.5 SA6 — Granular Metrics Cube routes.

Prefix: /api/superadmin/metrics-cube · all require_superadmin.

Tier hierarchy: city → alcaldia → colonia → development → unit
H1 scope: MX-CDMX only (single city root).

Route order is critical: static paths (heatmap, comparables, unit, refresh, tiers)
are registered BEFORE the dynamic /{tier} route to avoid path-shadowing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import metrics_cube_aggregations as cube

log = logging.getLogger("dmx.routes_superadmin_metrics_cube")

router = APIRouter(tags=["superadmin_metrics_cube"])
PREFIX = "/api/superadmin/metrics-cube"

PeriodLit = Literal["current", "7d", "30d", "90d"]
TierLit = Literal["city", "alcaldia", "colonia", "development", "unit"]


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _get_or_compute(db, tier: str, tier_id: str, period: str) -> Optional[Dict[str, Any]]:
    row = await db.cube_aggregations.find_one(
        {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
    )
    if row:
        return row
    try:
        await cube.aggregate_tier(db, tier, period)
        return await db.cube_aggregations.find_one(
            {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
        )
    except Exception as e:
        log.warning(f"[cube] on-demand compute failed: {e}")
        return None


# ─── 1) GET /tiers — hierarchy summary with counts ────────────────────────────
@router.get(PREFIX + "/tiers")
async def tiers_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    await cube.aggregate_tier(db, "alcaldia", "current")
    await cube.aggregate_tier(db, "colonia", "current")
    await cube.aggregate_tier(db, "development", "current")

    counts = []
    for tier in ("city", "alcaldia", "colonia", "development"):
        if tier == "city":
            n = 1
        else:
            n = await db.cube_aggregations.count_documents(
                {"tier": tier, "period": "current"},
            )
        counts.append({"tier": tier, "count": n})
    # Units: aggregate seed + mongo
    seed_units = 0
    try:
        from data_developments import ALL_UNITS
        seed_units = len(ALL_UNITS)
    except Exception:
        pass
    mongo_units = await db.units.count_documents({})
    counts.append({"tier": "unit", "count": seed_units + mongo_units})
    return {"hierarchy": ["city", "alcaldia", "colonia", "development", "unit"],
            "counts": counts, "city_root": {"tier_id": cube.CITY_ROOT_ID,
                                            "name": cube.CITY_ROOT_NAME}}


# ─── 2) GET /heatmap — geo dots for Mapbox (BEFORE /{tier}) ───────────────────
@router.get(PREFIX + "/heatmap")
async def heatmap_route(
    request: Request,
    metric: Literal["avg_price_per_m2", "avg_price_mxn", "leads_count",
                    "conversion_rate", "units_total"] = "avg_price_per_m2",
    tier: Literal["alcaldia", "colonia", "development"] = "colonia",
    period: PeriodLit = "current",
    bbox: Optional[str] = Query(None, description="lng_min,lat_min,lng_max,lat_max"),
):
    await _require_superadmin(request)
    db = _db(request)
    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    cur = db.cube_aggregations.find({"tier": tier, "period": period}, {"_id": 0})
    points: List[Dict[str, Any]] = []
    bb = None
    if bbox:
        try:
            bb = [float(x) for x in bbox.split(",")]
            if len(bb) != 4:
                bb = None
        except Exception:
            bb = None

    async for r in cur:
        geo = r.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        if bb and not (bb[0] <= lng <= bb[2] and bb[1] <= lat <= bb[3]):
            continue
        val = (r.get("kpis") or {}).get(metric)
        if val is None:
            continue
        points.append({
            "tier_id": r.get("tier_id"), "name": r.get("name"),
            "lat": lat, "lng": lng, "value": val, "tier": tier,
            "units_total": (r.get("kpis") or {}).get("units_total") or 0,
            "kpis": r.get("kpis") or {},
        })

    if len(points) > 500 and not bb:
        raise HTTPException(400, "Demasiados puntos. Aplica un bbox para limitar.")

    return {"items": points, "metric": metric, "tier": tier, "period": period,
            "total": len(points), "bbox": bbox}


# ─── 3) GET /comparables (BEFORE /{tier}) ─────────────────────────────────────
@router.get(PREFIX + "/comparables")
async def comparables_route(
    request: Request,
    tier_id: str = Query(...),
    radius_km: float = Query(2.0, gt=0, le=20),
    limit: int = Query(20, ge=1, le=50),
):
    await _require_superadmin(request)
    db = _db(request)
    items = await cube.find_comparables(db, tier_id, radius_km=radius_km, limit=limit)
    return {"items": items, "tier_id": tier_id, "radius_km": radius_km, "total": len(items)}


# ─── 4) GET /unit/:unit_id — micro detail (BEFORE /{tier}) ────────────────────
@router.get(PREFIX + "/unit/{unit_id}")
async def unit_detail_route(unit_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    unit = await db.units.find_one(
        {"$or": [{"id": unit_id}, {"unit_id": unit_id}]}, {"_id": 0},
    )
    dev = None
    if not unit:
        # Search seed (data_developments.ALL_UNITS) + embedded units in db.developments
        try:
            from data_developments import ALL_UNITS, DEVELOPMENTS_BY_ID
            for u in ALL_UNITS:
                if u.get("id") == unit_id or u.get("unit_id") == unit_id:
                    unit = dict(u)
                    dev_id_seed = u.get("development_id") or u.get("project_id")
                    if dev_id_seed and dev_id_seed in DEVELOPMENTS_BY_ID:
                        dev = DEVELOPMENTS_BY_ID[dev_id_seed]
                        unit["development_id"] = dev_id_seed
                    break
        except Exception:
            pass
    if not unit:
        async for d in db.developments.find({"units.id": unit_id}, {"_id": 0}):
            for u in (d.get("units") or []):
                if u.get("id") == unit_id:
                    unit = u
                    unit["development_id"] = d.get("id")
                    break
            if unit:
                break
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    dev_id = unit.get("development_id") or unit.get("project_id")
    if not dev and dev_id:
        dev = await db.developments.find_one({"id": dev_id}, {"_id": 0})
        if not dev:
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                dev = DEVELOPMENTS_BY_ID.get(dev_id)
            except Exception:
                dev = None

    # Price history from units_history (if exists) + dev-level price_history fallback
    price_history: List[Dict[str, Any]] = []
    try:
        async for h in db.units_history.find(
            {"unit_id": unit.get("id") or unit.get("unit_id")}, {"_id": 0},
        ).sort([("ts", 1)]).limit(50):
            price_history.append(h)
    except Exception:
        pass
    if not price_history and dev:
        price_history = (dev.get("price_history") or [])[-12:]

    # Demanda REAL por unidad (el moat): leads + vistas + guardados con los MISMOS campos que el embudo del dev y
    # demanda-unidades — antes consultaba unit_id/interested_unit_id (campos que el lead NO tiene) → siempre 0.
    unit_number = unit.get("unit_number") or unit.get("numero")
    leads: List[Dict[str, Any]] = []
    vistas = guardados = 0
    if dev_id and unit_number:
        try:
            cur = db.leads.find(
                {"development_id": dev_id, "unidad_interes": unit_number}, {"_id": 0},
            ).sort([("created_at", -1)]).limit(20)
            async for ld in cur:
                leads.append(ld)
        except Exception:
            pass
        try:
            vistas = await db.buyer_signals.count_documents(
                {"entity_id": dev_id, "type": "unit_view", "unit_number": unit_number})
            guardados = await db.buyer_signals.count_documents(
                {"entity_id": dev_id, "type": "unit_save", "active": True, "unit_number": unit_number})
        except Exception:
            pass

    ie_score = None
    if dev:
        ie_score = dev.get("ie_score") or dev.get("score_global")

    return {
        "unit": unit,
        "development": dev,
        "price_history": price_history,
        "leads": leads,
        "leads_count": len(leads),
        "demanda": {"vistas": vistas, "guardados": guardados, "leads": len(leads)},
        "ie_score_zone": ie_score,
    }


async def _audit(db, user, action: str, entity_type: str, entity_id=None, after=None, request=None):
    """Auditoría best-effort de mutaciones del cubo (mismo patrón que /backfill). Nunca rompe la operación."""
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, action, entity_type, entity_id, before=None, after=after or {}, request=request)
    except Exception as _e:  # noqa: BLE001
        log.warning("[audit] log_mutation perdido (%s %s %s): %s", action, entity_type, entity_id, _e)


# ─── Cubo Unificado · GET /licensable — la LENTE LICENCIABLE (data para vender · BEFORE /{tier}) ──
@router.get(PREFIX + "/licensable")
async def licensable_route(request: Request, period: PeriodLit = "current"):
    """Decisión Terminal Mercado = vender data (estilo HouseCanary/Bloomberg). Agregados de MERCADO por
    colonia, listos para licenciar: precio/m², absorción, inventario, demanda — con K-ANON ≥3 (celdas de <3
    unidades se SUPRIMEN) y SIN nombres de desarrollo (cero identidad, cero PII). Es el mismo cubo, con el
    contrato de privacidad puesto para exposición externa."""
    await _require_superadmin(request)
    db = _db(request)
    K = 3
    try:
        cc = await olap.query_cross_cut(db, dimensions=["zone"], filters={}, period=period)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"cross-cut falló: {str(e)[:120]}")
    # k-anon de CONTRIBUYENTES: en una colonia con <K DESARROLLADORES distintos, el DESEMPEÑO de venta
    # (absorción, y vendidas = unidades−disponibles) es el ritmo EXACTO de un competidor identificable →
    # se protege. El precio de LISTA no: ya es público unidad por unidad en el marketplace (agregarlo no
    # revela nada que no esté publicado). Protegemos lo privado, no lo público.
    devs_por_col: Dict[str, set] = {}
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if d.get("colonia_id"):
                devs_por_col.setdefault(str(d["colonia_id"]).lower(), set()).add(d.get("developer_id") or d.get("id"))
    except Exception as e:  # noqa: BLE001
        log.warning(f"[licensable] devs por colonia: {e}")
    rows = []
    suprimidas = 0
    protegidas = 0
    for c in (cc.get("matrix") or []):
        k = c.get("kpis") or {}
        n = k.get("units_total") or 0
        if n < K:                       # k-anon: no publicar zonas con muy poca oferta
            suprimidas += 1
            continue
        n_devs = len(devs_por_col.get(str(c.get("zone") or "").lower(), set()))
        ventas_ok = n_devs >= K or not devs_por_col   # fail-open solo si no pudimos contar devs
        if not ventas_ok:
            protegidas += 1
        rows.append({
            "colonia": c.get("zone"),
            # con <K devs: unidades totales ocultas (unidades − disponibles delataría las vendidas del único dev)
            "unidades": n if ventas_ok else None,
            "disponibles": k.get("units_available"),
            "precio_m2": round(k.get("avg_price_per_m2")) if k.get("avg_price_per_m2") else None,
            "precio_prom": round(k.get("avg_price_mxn")) if k.get("avg_price_mxn") else None,
            "m2_prom": round(k.get("avg_m2"), 1) if k.get("avg_m2") else None,
            "absorcion_pct": k.get("absorcion_pct") if ventas_ok else None,
            "ventas_protegidas": (not ventas_ok) or None,   # None = no ensuciar filas normales
        })
    rows.sort(key=lambda r: (r.get("precio_m2") is not None, r.get("precio_m2") or 0), reverse=True)
    return {
        "ok": True, "period": period, "k_anon": K,
        "colonias": rows, "n_colonias": len(rows), "suprimidas_kanon": suprimidas,
        "protegidas_ventas": protegidas,
        "licencia": {
            "producto": "DMX Market Data · CDMX residencial",
            "nota": "Agregados de mercado por colonia. Sin identidad de desarrollo ni datos personales. "
                    "Celdas con menos de 3 unidades suprimidas por privacidad (k-anon); en colonias con menos "
                    "de 3 desarrolladores se publica precio de lista (dato ya público) pero NO absorción/vendidas "
                    "(el ritmo de venta de un competidor identificable).",
        },
    }


# ─── Cubo Unificado · GET /atom/{unit_id} — la MÁXIMA hipergranularidad (BEFORE /{tier}) ──
@router.get(PREFIX + "/atom/{unit_id}")
async def atom_route(unit_id: str, request: Request):
    """El ÁTOMO: una unidad con TODOS sus indicadores agrupados por familia, según el contrato (cube_catalog).
    Ensambla: hechos de la unidad (precio/m²/estado + override del dev) + los 44 scores IE de su colonia
    (ie_scores) + el zone_score compuesto + demanda real. Cada indicador con su valor y lineaje; sin dato →
    "—" honesto. Es el Modelo del Mundo de la Demanda hasta el último ladrillo."""
    await _require_superadmin(request)
    db = _db(request)
    detail = await unit_detail_route(unit_id, request)   # reusa la resolución de unidad
    unit = detail.get("unit") or {}
    dev = detail.get("development") or {}
    colonia = unit.get("colonia_id") or dev.get("colonia_id") or dev.get("colonia")
    colonia = str(colonia or "").lower() or None

    # Overrides del dev sobre esta unidad (precio/estado editados)
    if unit.get("id") or unit.get("unit_id"):
        ov = await db.developer_unit_overrides.find_one(
            {"unit_id": unit.get("id") or unit.get("unit_id")}, {"_id": 0})
        if ov:
            for k, v in ov.items():
                if k not in ("unit_id", "dev_id", "updated_by", "updated_at", "reason", "hold_id") and v is not None:
                    unit[k] = v

    # Scores IE de la colonia (valor + confianza + stub) indexados por code
    ie_vals: Dict[str, Any] = {}
    if colonia:
        try:
            async for s in db.ie_scores.find({"zone_id": colonia}, {"_id": 0, "code": 1, "value": 1, "is_stub": 1, "confidence": 1}):
                if s.get("code"):
                    ie_vals[s["code"]] = s
        except Exception as e:  # noqa: BLE001
            log.warning(f"[atom] ie_scores: {e}")
    zscore = None
    if colonia:
        zscore = await db.zone_scores.find_one({"zone_id": colonia}, {"_id": 0, "score_numeric": 1, "score_letter": 1, "subscores_real": 1})

    # ── GRANULARIDAD DE FEATURES (más a fondo que la unidad): descompone la unidad en sus características
    # —prototipo/tipología, tamaño, precio/m², espacio, extras— y a cada una le pega CUÁNTO VALE (impacto
    # hedónico en $/m², controlando por colonia) y su POSICIONAMIENTO (precio/m² vs. la mediana de su
    # colonia). El moat: no solo "esta unidad", sino "su roof vale +N%" y "está 12% arriba de su colonia".
    import re as _re
    from dmx_cube_feed import tipologia_from_beds as _tipo_from_beds, banda_m2 as _banda_m2
    from dmx_hedonic_atom import UNITS as _UNITS_COL
    _m2 = unit.get("m2_privative") or unit.get("m2_total") or unit.get("size_m2")
    _beds = unit.get("bedrooms") or unit.get("recamaras")
    _park = unit.get("parking_spots") or unit.get("n_parking") or 0
    _precio = unit.get("price") or unit.get("price_mxn")
    _pm2 = (_precio / _m2) if (_precio and _m2) else None
    _has = lambda *k: any(unit.get(x) for x in k)  # noqa: E731

    # precio/m² de referencia de la colonia (posicionamiento del átomo) — desde dmx_units, k-anon interno ≥3
    col_pm2_med = None
    if colonia:
        try:
            _vals: List[float] = []
            async for a in db[_UNITS_COL].find(
                    {"geo.colonia_id": {"$regex": f"^{_re.escape(colonia)}$", "$options": "i"}},
                    {"_id": 0, "commercial": 1, "areas": 1}):
                com = a.get("commercial") or {}; ar = a.get("areas") or {}
                p = com.get("precio_cierre_mxn") or com.get("precio_lista_mxn")
                mm = ar.get("m2_privativo") or ar.get("m2_construido")
                if p and mm and mm > 0:
                    _vals.append(p / mm)
            if len(_vals) >= 3:                      # no exponemos posición contra 1-2 datos
                _vals.sort(); col_pm2_med = _vals[len(_vals) // 2]
        except Exception as e:  # noqa: BLE001
            log.warning(f"[atom] colonia pm2: {e}")

    # CUBO TOTAL F1 — bloque FINANCIERO del átomo (dmx_units.finance, materializado por dmx_finance_atom):
    # escalera dinero completa: enganche mínimo → ticket de entrada → mensualidad por escenario.
    fin: Dict[str, Any] = {}
    try:
        _fd = await db.dmx_units.find_one(
            {"unit_id": unit.get("id") or unit.get("unit_id")}, {"_id": 0, "finance": 1})
        fin = (_fd or {}).get("finance") or {}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[atom] finance: {e}")

    _TIPO_LABEL = {"estudio": "Estudio", "1_recamara": "1 recámara", "2_recamaras": "2 recámaras",
                   "3_recamaras": "3 recámaras", "4_mas_recamaras": "4+ recámaras"}
    _tipo = _tipo_from_beds(_beds)
    # (grupo, label, value, key, fmt, hedkey)
    raw_feats = [
        # Prototipo y tamaño — el MOLDE repetible: qué ES esta unidad
        ("Prototipo y tamaño", "Tipología", _TIPO_LABEL.get(_tipo, _tipo), "tipologia", None, None),
        ("Prototipo y tamaño", "Modelo / prototipo", unit.get("prototype") or unit.get("prototype_id"), "prototipo", None, None),
        ("Prototipo y tamaño", "Banda de tamaño", (f"{_banda_m2(_m2)} m²") if _m2 else None, "banda_m2", None, None),
        # Precio — el resultado, con posicionamiento vs. la colonia
        ("Precio", "Precio de lista", _precio, "precio", "pesos", None),
        ("Precio", "Precio por m²", _pm2, "precio_m2", "pesos", None),
        # Espacio — con impacto hedónico MARGINAL (cada +1 suma X%)
        ("Espacio", "Metros cuadrados", _m2, "m2", None, "m2"),
        ("Espacio", "Recámaras", _beds, "recamaras", None, "recamaras"),
        ("Espacio", "Baños", unit.get("bathrooms") or unit.get("banos"), "banos", None, "banos"),
        # Ubicación en el edificio
        ("Ubicación en el edificio", "Piso", unit.get("level") or unit.get("piso"), "piso", None, None),
        ("Ubicación en el edificio", "Orientación", unit.get("orientation") or unit.get("orientacion"), "orientacion", None, None),
        ("Ubicación en el edificio", "Vista", unit.get("vista"), "vista", None, None),
        # Extras que suben el precio — impacto hedónico BINARIO (la feature entera suma X%)
        ("Extras que suben el precio", "Roof garden privado", _has("has_roof", "roof", "roof_garden"), "has_roof", None, "roof"),
        ("Extras que suben el precio", "Terraza", _has("has_terraza", "terraza"), "has_terraza", None, "terraza"),
        ("Extras que suben el precio", "Balcón", _has("has_balcon", "balcon"), "has_balcon", None, "balcon"),
        ("Extras que suben el precio", "Bodega", _has("has_bodega", "bodega", "storage"), "has_bodega", None, "bodega"),
        ("Extras que suben el precio", "2+ estacionamientos", (_park or 0) >= 2, "parking_2plus", None, "parking"),
        # Estacionamiento / acabados
        ("Estacionamiento", "Cajones", _park, "n_parking", None, "n_parking"),
        ("Acabados", "Nivel de acabado", unit.get("nivel_acabado") or unit.get("acabado"), "acabado", None, None),
        # Financiero (CUBO TOTAL F1) — con qué dinero se entra y cuánto cuesta al mes
        ("Financiero", "Enganche mínimo", (f"{fin['enganche_min_pct']:.0f}%" if fin.get("enganche_min_pct") is not None else None), "enganche_min", None, None),
        ("Financiero", "Ticket de entrada", fin.get("ticket_entrada_min"), "ticket_entrada", "pesos", None),
        ("Financiero", "Mensualidad hipoteca (80% · 20a)", fin.get("mens_80_20"), "mens_80_20", "pesos", None),
        ("Financiero", "Mensualidad hipoteca (90% · 20a)", fin.get("mens_90_20"), "mens_90_20", "pesos", None),
        ("Financiero", "Ingreso para calificar (80/20)", next((e.get("ingreso_requerido") for e in (fin.get("escenarios") or []) if e.get("aforo_pct") == 80 and e.get("plazo_anios") == 20), None), "ingreso_req", "pesos", None),
    ]
    # Impacto hedónico por atributo (%$/m²) ciudad-wide (el modelo YA controla por colonia vía one-hot,
    # así el impacto es estructural y robusto; slicing a 1 colonia rompería el control y encogería muestra).
    impactos: Dict[str, float] = {}
    impacto_tipo: Dict[str, str] = {}
    hedonico_disp = False
    try:
        import math as _math
        import dmx_hedonic_atom
        fit = await dmx_hedonic_atom.fit_and_rank(db, None)
        if fit.get("available"):
            hedonico_disp = True
            coefs = fit.get("coefficients") or {}
            for hk, ck, tipo in (("roof", "has_roof", "binario"), ("terraza", "has_terraza", "binario"),
                                 ("balcon", "has_balcon", "binario"), ("bodega", "has_bodega", "binario"),
                                 ("parking", "parking_2plus", "binario"),
                                 ("m2", "m2", "marginal"), ("recamaras", "recamaras", "marginal"),
                                 ("banos", "banos", "marginal"), ("n_parking", "n_parking", "marginal")):
                c = coefs.get(ck)
                if c and c.get("coef") is not None:
                    impactos[hk] = (_math.exp(c["coef"]) - 1) * 100    # % de impacto en $/m²
                    impacto_tipo[hk] = tipo
    except Exception as e:  # noqa: BLE001
        log.warning(f"[atom] hedónico: {e}")
    caracteristicas: Dict[str, List[Dict[str, Any]]] = {}
    for grupo, label, value, key, fmt, hedkey in raw_feats:
        if value in (None, "", 0) and key not in ("banos", "recamaras", "n_parking"):
            continue  # no listamos features ausentes (salvo conteos, que 0 es dato)
        entry: Dict[str, Any] = {"label": label, "value": value, "key": key}
        if fmt:
            entry["fmt"] = fmt
        if hedkey and impactos.get(hedkey) is not None:
            entry["impacto_pct"] = round(impactos[hedkey], 1)          # cuánto suma esta feature al $/m²
            entry["impacto_tipo"] = impacto_tipo.get(hedkey)           # 'binario' | 'marginal'
        if key == "precio_m2" and _pm2 and col_pm2_med:                # posicionamiento vs. la colonia
            entry["vs_colonia_pct"] = round((_pm2 / col_pm2_med - 1) * 100, 1)
            entry["ref_colonia"] = round(col_pm2_med)
        caracteristicas.setdefault(grupo, []).append(entry)

    # Ensambla por familia según el catálogo (cada métrica declara su nivel y motor)
    import cube_catalog
    unit_measures = {
        "avg_price_mxn": unit.get("price") or unit.get("price_mxn"),
        "avg_m2": unit.get("m2_privative") or unit.get("m2_total") or unit.get("size_m2"),
        "avg_price_per_m2": ((unit.get("price") or 0) / m) if (m := (unit.get("m2_privative") or unit.get("m2_total") or 0)) else None,
        "units_available": 1 if unit.get("status") == "disponible" else 0,
        "units_sold": 1 if unit.get("status") in ("vendido", "sold") else 0,
        "avm_predios": unit.get("avm_m2"),
    }
    fams: Dict[str, List[Dict[str, Any]]] = {}
    for e in cube_catalog.CATALOG:
        val, note = None, None
        if e["key"] in ie_vals:                         # score IE de la colonia
            val = ie_vals[e["key"]].get("value")
            if ie_vals[e["key"]].get("is_stub"):
                note = "en preparación"
        elif e["key"] in unit_measures and "unidad" in e["geo"]:
            val = unit_measures[e["key"]]
        elif e["status"] == "stub":
            note = "en preparación"
        # solo incluimos las que aplican a este nivel (colonia o unidad)
        if "colonia" in e["geo"] or "unidad" in e["geo"]:
            fams.setdefault(e["family"], []).append({
                "key": e["key"], "label": e["label"], "value": val, "note": note,
                "fmt": e["fmt"], "direction": e["direction"], "lineage": e["lineage"], "kanon": e["kanon"],
            })

    return {
        "unit": {"id": unit.get("id") or unit.get("unit_id"), "unit_number": unit.get("unit_number"),
                 "precio": unit.get("price") or unit.get("price_mxn"), "m2": unit_measures["avg_m2"],
                 "recamaras": unit.get("bedrooms") or unit.get("recamaras"),
                 "banos": unit.get("bathrooms") or unit.get("banos"), "status": unit.get("status")},
        "development": {"id": dev.get("id"), "name": dev.get("name")},
        "colonia": colonia,
        "zone_score": zscore,
        "demanda": detail.get("demanda"),
        # Granularidad de features: la unidad descompuesta, con cuánto vale cada extra (hedónico)
        "caracteristicas": [{"grupo": g, "features": caracteristicas[g]} for g in caracteristicas],
        # CUBO TOTAL F1 · la corrida completa (esquemas + escenarios hipotecarios) con fuente de tasa
        "finance": ({"tasa_anual": fin.get("tasa_anual"), "tasa_fuente": fin.get("tasa_fuente"),
                     "tasa_es_estimado": fin.get("tasa_es_estimado"), "esquemas": fin.get("esquemas"),
                     "escenarios": fin.get("escenarios")} if fin else None),
        "hedonico_disponible": hedonico_disp,
        "families": [{"key": f, "label": cube_catalog.FAMILY_LABEL.get(f, f), "metrics": fams[f]}
                     for f in cube_catalog.FAMILIES if fams.get(f)],
    }


# ─── Cubo Unificado · GET /catalog — el CONTRATO que el Hub renderiza (BEFORE /{tier}) ──
@router.get(PREFIX + "/catalog")
async def cube_catalog_route(request: Request):
    """El registro único hipergranular (cube_catalog): cada métrica/score/índice con su familia,
    granularidad geo+temporal, dimensiones, motor, lineaje, k-anon, formato y estado. El Hub de Mercado
    renderiza sus lentes/cortes/vista-átomo DESDE este contrato (cero métrica hardcodeada en la UI)."""
    await _require_superadmin(request)
    import cube_catalog
    import cube_dictionary
    # CUBO TOTAL F1: el catálogo (MEDIDAS) viaja junto con el diccionario (FAMILIAS de segmentación)
    return {**cube_catalog.serialize(), "diccionario": cube_dictionary.serialize()}


# ─── 5) POST /refresh — manual recompute (BEFORE /{tier}) ─────────────────────
@router.post(PREFIX + "/refresh")
async def refresh_aggregations(request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    # W2.8 — invalidate OLAP cache when underlying data changes
    try:
        import cube_cache
        cube_cache.cache_invalidate_zones([])
    except Exception:
        pass
    res = await cube.aggregate_all(db)
    await _audit(db, user, "trigger", "cube_refresh", None,
                 after={"elapsed_s": (res or {}).get("elapsed_s")}, request=request)
    return res


# ─── W2.8 Phase Z.1 — Cross-cut OLAP, Compare, Backfill (BEFORE /{tier}) ──────
import cube_olap_engine as olap  # noqa: E402

SliceByLit = Literal["property_type", "price_tier", "year_built_decade"]
PropertyTypeLit = Literal["depto", "casa", "loft", "town", "ph", "all"]
PriceTierLit = Literal["entry", "mid", "luxury", "ultraluxury", "all"]


class CompareBody(BaseModel):
    zone_ids: List[str]
    period: PeriodLit = "current"


class BackfillBody(BaseModel):
    from_date: str
    to_date: str
    zone_ids: Optional[List[str]] = None


@router.get(PREFIX + "/cross-cut")
async def cross_cut_route(
    request: Request,
    dimensions: str = Query(..., description="comma-separated, max 3"),
    period: PeriodLit = "current",
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
    tier: Optional[TierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    dims = [d.strip() for d in dimensions.split(",") if d.strip()]
    filters: Dict[str, Any] = {}
    if property_type:
        filters["property_type"] = property_type
    if price_tier:
        filters["price_tier"] = price_tier
    if tier:
        filters["tier"] = tier
    try:
        return await olap.query_cross_cut(db, dimensions=dims, filters=filters,
                                          period=period)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post(PREFIX + "/compare")
async def compare_route(body: CompareBody, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    try:
        return await olap.query_compare_zones(db, body.zone_ids, body.period)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post(PREFIX + "/backfill")
async def backfill_route(body: BackfillBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    try:
        from_d = datetime.fromisoformat(body.from_date.replace("Z", "+00:00"))
        to_d = datetime.fromisoformat(body.to_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Fechas inválidas (ISO 8601 requerido)")
    try:
        result = await olap.backfill_historical(
            db, from_date=from_d, to_date=to_d, zone_ids=body.zone_ids,
            triggered_by=user.user_id,
        )
        if not result.get("ok") and result.get("status") == 409:
            raise HTTPException(409, f"Backfill activo: {result.get('active_job_id')}")
        try:
            from audit_log import log_mutation
            await log_mutation(
                db, user, "trigger", "cube_backfill", result.get("job_id"),
                before=None, after={"from_date": body.from_date,
                                    "to_date": body.to_date},
                request=request,
            )
        except Exception as _e:
            log.warning("[audit] log_mutation perdido (trigger cube_backfill %s): %s", result.get("job_id"), _e)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get(PREFIX + "/backfill/{job_id}")
async def backfill_status_route(job_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    job = await olap.get_backfill_status(db, job_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")
    return job


@router.get(PREFIX + "/cache-stats")
async def cache_stats_route(request: Request):
    await _require_superadmin(request)
    import cube_cache
    return cube_cache.cache_stats()


# ─── Fase 1 · POST /backfill-atom — poblar el átomo dmx_units desde seed (BEFORE /{tier}) ──
@router.post(PREFIX + "/backfill-atom")
async def backfill_atom_route(request: Request):
    """Puebla el átomo milimétrico (dmx_units) desde el seed. Idempotente. Es la
    fuente de verdad del cubo (cube_olap lee el átomo primero). Se re-corre al
    llegar dato nuevo o tras cambios de schema."""
    user = await _require_superadmin(request)
    import dmx_cube_feed
    db = _db(request)
    res = await dmx_cube_feed.backfill_atom(db)
    log.info(f"[metrics-cube] backfill-atom: {res}")
    await _audit(db, user, "trigger", "cube_backfill_atom", None, after=dict(res or {}), request=request)
    return {"ok": True, **res}


# ─── Fase 1.4 · POST /enrich-zone — fuentes externas → zona (dormant-safe, BEFORE /{tier}) ──
@router.post(PREFIX + "/enrich-zone")
async def enrich_zone_route(request: Request, zone_id: str = Query(...)):
    """Enriquece una zona con AirROI/GTFS/DENUE/catastro. Conectado pero dormido:
    valores estimados (is_stub) hasta configurar la key → luego autofill real."""
    user = await _require_superadmin(request)
    import dmx_external_enrich as enr
    db = _db(request)
    res = await enr.enrich_zone(db, zone_id)
    await _audit(db, user, "update", "cube_zone_enrich", zone_id, after={"sources": list((res or {}).keys())}, request=request)
    return {"ok": True, "external": res}


# ─── Fase 1.3 · POST /atom/from-text — extracción NLP → autollenar átomo (BEFORE /{tier}) ──
class AtomFromTextBody(BaseModel):
    development_id: str
    text: str


@router.post(PREFIX + "/atom/from-text")
async def atom_from_text_route(body: AtomFromTextBody, request: Request):
    """Extrae unidades de texto (brochure/lista de precios) y autollena el átomo
    (fill-only). Dormant-safe: sin LLM key → no rompe, marca dormant."""
    user = await _require_superadmin(request)
    import dmx_atom_autofill as af
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(body.development_id)
    db = _db(request)
    res = await af.extract_and_autofill(db, body.development_id, body.text, dev)
    await _audit(db, user, "update", "cube_atom_from_text", body.development_id,
                 after={"text_len": len(body.text or ""), "result_keys": list((res or {}).keys())[:8]}, request=request)
    return res


# ─── Fase 2.1 · GET /amenity-ranker — hedónico sobre el átomo (BEFORE /{tier}) ──
@router.get(PREFIX + "/amenity-ranker")
async def amenity_ranker_route(request: Request, colonia: Optional[str] = Query(None)):
    """Regresión hedónica sobre el átomo: cuánto suma cada atributo (roof/bodega/2º
    cajón/terraza/balcón) al precio/m², controlando por colonia. Responde la pregunta
    estrella del founder. Opcional ?colonia= para acotar la zona."""
    await _require_superadmin(request)
    import dmx_hedonic_atom as hed
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await hed.fit_and_rank(_db(request), scope)


# ─── Fase 2.2 · demand-gap por zona×tipología + prob. de venta (BEFORE /{tier}) ──
@router.get(PREFIX + "/demand-gap")
async def demand_gap_route(request: Request, top: int = Query(25, ge=1, le=200)):
    """Cruza demanda de zona con oferta por (colonia × tipología). Rankea: dónde hay
    demanda y poco/cero inventario de una tipología = oportunidad de construcción."""
    await _require_superadmin(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)


# ─── N5 Slice 1 · POST /product-brief — la ACCIÓN desde el cubo (BEFORE /{tier}) ──
class ProductBriefBody(BaseModel):
    colonia: str
    terreno_m2: float = 1000
    tipologia: Optional[str] = None   # contexto de la card de demanda (se guarda como evidencia)


@router.post(PREFIX + "/product-brief")
async def create_product_brief_route(body: ProductBriefBody, request: Request):
    """El primer verbo del tab Actuar: desde una card de demanda insatisfecha, genera el brief de
    producto ("qué construir aquí") REUSANDO generador_producto_engine (el mismo del founder-console)
    y lo PERSISTE (db.product_briefs) → queda auditable y listo para despacharse al dev en F3."""
    user = await _require_superadmin(request)
    db = _db(request)
    col = str(body.colonia or "").strip().lower()
    if not col:
        raise HTTPException(400, "colonia requerida")
    try:
        from generador_producto_engine import generar_producto
        brief = await generar_producto(db, col, float(body.terreno_m2 or 1000), "media")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"El generador de producto no pudo correr: {str(e)[:120]}")
    import uuid as _uuid
    doc = {
        "id": f"brief_{_uuid.uuid4().hex[:12]}",
        "colonia": col, "terreno_m2": body.terreno_m2, "tipologia": body.tipologia,
        "brief": brief, "status": "borrador",           # F3: borrador → enviado → aceptado/rechazado
        "developer_id": None, "viewed_at": None,
        "created_by": user.user_id, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.product_briefs.insert_one(dict(doc))
    await _audit(db, user, "create", "cube_product_brief", doc["id"],
                 after={"colonia": col, "tipologia": body.tipologia}, request=request)
    doc.pop("_id", None)
    return {"ok": True, "brief_id": doc["id"], "brief": brief}


@router.post(PREFIX + "/product-brief/{brief_id}/send")
async def send_product_brief_route(brief_id: str, request: Request):
    """F3 · despacha el brief a los desarrolladores de esa colonia (status borrador→enviado). El dev lo
    ve en su inbox /desarrollador/recomendaciones y responde; la respuesta vuelve al Hub. Cierra el loop."""
    user = await _require_superadmin(request)
    db = _db(request)
    b = await db.product_briefs.find_one({"id": brief_id}, {"_id": 0, "id": 1})
    if not b:
        raise HTTPException(404, "Brief no encontrado")
    await db.product_briefs.update_one(
        {"id": brief_id},
        {"$set": {"status": "enviado", "sent_at": datetime.now(timezone.utc).isoformat(), "sent_by": user.user_id}})
    await _audit(db, user, "update", "cube_product_brief_send", brief_id, after={"status": "enviado"}, request=request)
    return {"ok": True, "brief_id": brief_id, "status": "enviado"}


@router.get(PREFIX + "/product-briefs")
async def list_product_briefs_route(request: Request, estado: Optional[str] = Query(None)):
    """Los briefs generados desde el Hub + su estado y las respuestas de los devs (el retorno del loop)."""
    await _require_superadmin(request)
    db = _db(request)
    q = {"status": estado} if estado else {}
    out = []
    async for b in db.product_briefs.find(q, {"_id": 0, "brief": 0}).sort("created_at", -1).limit(100):
        resp = b.get("respuestas") or {}
        b["n_respuestas"] = len(resp)
        b["aceptados"] = sum(1 for r in resp.values() if r.get("status") == "aceptado")
        b.pop("respuestas", None)
        out.append(b)
    return {"ok": True, "briefs": out}


@router.post(PREFIX + "/score-close-prob")
async def score_close_prob_route(request: Request, development_id: Optional[str] = Query(None)):
    """Calcula prob. de venta por unidad disponible y la escribe en el átomo
    (demand.prob_venta). Heurística v1 · se reemplaza por ML al llegar cierres."""
    user = await _require_superadmin(request)
    import dmx_demand
    db = _db(request)
    res = await dmx_demand.score_close_probabilities(db, development_id)
    await _audit(db, user, "update", "cube_score_close_prob", development_id or "all",
                 after={"scored": (res or {}).get("scored") or (res or {}).get("count")}, request=request)
    return res


# ─── Fase 2.3 · self-improving loop + visión (BEFORE /{tier}) ──────────────────
class UnitClosedBody(BaseModel):
    unit_id: str
    precio_cierre_mxn: float
    dias_en_mercado: Optional[int] = None


@router.post(PREFIX + "/unit-closed")
async def unit_closed_route(body: UnitClosedBody, request: Request):
    """Llega un CIERRE real → escribe en el átomo, resuelve las predicciones del cubo
    (predicho vs real), re-ajusta el hedónico y devuelve calibración. Self-improving."""
    user = await _require_superadmin(request)
    import dmx_self_improving as si
    db = _db(request)
    res = await si.on_unit_closed(db, user, body.unit_id,
                                  body.precio_cierre_mxn, body.dias_en_mercado)
    # Cierre REAL de unidad = la mutación más sensible del cubo → siempre con rastro de auditoría.
    await _audit(db, user, "update", "cube_unit_closed", body.unit_id,
                 after={"precio_cierre_mxn": body.precio_cierre_mxn, "dias_en_mercado": body.dias_en_mercado},
                 request=request)
    return res


@router.post(PREFIX + "/atom/from-photos")
async def atom_from_photos_route(request: Request, development_id: str = Query(...)):
    """Auto-tag de fotos (DL visión) → llena amenidades del átomo. Dormant-safe:
    sin modelo/fotos → marca dormant, listo para activarse con fotos reales."""
    user = await _require_superadmin(request)
    import dmx_self_improving as si
    db = _db(request)
    res = await si.enrich_atom_from_photos(db, development_id)
    await _audit(db, user, "update", "cube_atom_from_photos", development_id,
                 after={"result_keys": list((res or {}).keys())[:8]}, request=request)
    return res


# ─── 6) GET /:tier — list nodes ───────────────────────────────────────────────
@router.get(PREFIX + "/{tier}")
async def list_tier_route(
    tier: TierLit,
    request: Request,
    parent_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Literal["units_desc", "name_asc", "leads_desc", "price_desc"] = "units_desc",
    period: PeriodLit = "current",
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    # W2.8 Phase Z.1 — optional OLAP filters (backwards compatible)
    slice_by: Optional[SliceByLit] = None,
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id} para detalle de unidad")

    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    q: Dict[str, Any] = {"tier": tier, "period": period}
    if parent_id:
        q["parent_tier_id"] = parent_id
    if search:
        q["name"] = {"$regex": search, "$options": "i"}

    sort_spec: List[tuple] = []
    if sort == "units_desc":
        sort_spec = [("kpis.units_total", -1)]
    elif sort == "name_asc":
        sort_spec = [("name", 1)]
    elif sort == "leads_desc":
        sort_spec = [("kpis.leads_count", -1)]
    elif sort == "price_desc":
        sort_spec = [("kpis.avg_price_mxn", -1)]

    cur = db.cube_aggregations.find(q, {"_id": 0}).sort(sort_spec).skip(skip).limit(limit)
    items: List[Dict[str, Any]] = []
    async for r in cur:
        if tier == "city":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "alcaldia", "period": period},
            )
        elif tier == "alcaldia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "colonia", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "colonia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "development", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "development":
            r["children_count"] = int((r.get("kpis") or {}).get("units_total") or 0)
        items.append(r)

    total = await db.cube_aggregations.count_documents(q)

    # W2.8 — if slice_by/property_type/price_tier filters provided, attach OLAP breakdown
    olap_breakdown = None
    if slice_by or property_type or price_tier:
        try:
            for it in items:
                slice_res = await olap.query_slice(
                    db, tier=tier, tier_id=it.get("tier_id"), period=period,
                    slice_by=slice_by, property_type=property_type,
                    price_tier=price_tier,
                )
                it["olap"] = {
                    "kpis": slice_res.get("kpis"),
                    "breakdown": slice_res.get("breakdown"),
                    "cache": slice_res.get("cache"),
                }
            olap_breakdown = {"slice_by": slice_by, "property_type": property_type,
                              "price_tier": price_tier}
        except Exception as e:
            log.warning(f"[olap] list_tier slice failed: {e}")

    return {"items": items, "total": total, "tier": tier, "period": period,
            "parent_id": parent_id, "olap": olap_breakdown}


# ─── 7) GET /:tier/:tier_id/children — children with mini-KPIs ────────────────
@router.get(PREFIX + "/{tier}/{tier_id}/children")
async def children_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
):
    await _require_superadmin(request)
    db = _db(request)
    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    if not next_tier:
        return {"items": [], "next_tier": None}

    if next_tier == "unit":
        items: List[Dict[str, Any]] = []
        # Demanda REAL por unidad de este dev en UN solo barrido (no por-unidad) → la lista muestra qué unidad mueve
        # de verdad, no solo su precio. Mismos campos que el embudo del dev y demanda-unidades (el moat granular).
        dmap: Dict[str, Dict[str, int]] = {}

        def _d(un):
            return dmap.setdefault(un, {"vistas": 0, "guardados": 0, "leads": 0})
        try:
            async for s in db.buyer_signals.find({"entity_id": tier_id, "type": "unit_view", "unit_number": {"$nin": [None, ""]}}, {"_id": 0, "unit_number": 1}):
                _d(s["unit_number"])["vistas"] += 1
            async for s in db.buyer_signals.find({"entity_id": tier_id, "type": "unit_save", "active": True, "unit_number": {"$nin": [None, ""]}}, {"_id": 0, "unit_number": 1}):
                _d(s["unit_number"])["guardados"] += 1
            async for ld in db.leads.find({"development_id": tier_id, "unidad_interes": {"$nin": [None, ""]}}, {"_id": 0, "unidad_interes": 1}):
                _d(ld["unidad_interes"])["leads"] += 1
        except Exception:
            pass
        # Try seed first
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:500]:
                    un = u.get("unit_number")
                    dem = dmap.get(un) or {"vistas": 0, "guardados": 0, "leads": 0}
                    items.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": un or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                            "vistas": dem["vistas"], "guardados": dem["guardados"], "leads": dem["leads"],
                        },
                    })
        except Exception:
            pass
        if not items:
            async for u in db.units.find({"development_id": tier_id}, {"_id": 0}).limit(500):
                un = u.get("unit_number")
                dem = dmap.get(un) or {"vistas": 0, "guardados": 0, "leads": 0}
                items.append({
                    "tier": "unit",
                    "tier_id": u.get("id") or u.get("unit_id"),
                    "name": un or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                        "vistas": dem["vistas"], "guardados": dem["guardados"], "leads": dem["leads"],
                    },
                })
        # Orden: las que MÁS mueven primero (leads > guardados > vistas) — el superadmin ve el calor al instante.
        items.sort(key=lambda it: (-(it["kpis"].get("leads") or 0), -(it["kpis"].get("guardados") or 0), -(it["kpis"].get("vistas") or 0)))
        return {"items": items, "next_tier": "unit", "total": len(items)}

    existing = await db.cube_aggregations.count_documents(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
    )
    if existing == 0:
        await cube.aggregate_tier(db, next_tier, period)
    cur = db.cube_aggregations.find(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
    ).sort([("kpis.units_total", -1)])
    items = [r async for r in cur]
    return {"items": items, "next_tier": next_tier, "total": len(items)}


# ─── 8) GET /:tier/:tier_id — detail node + KPIs + children ───────────────────
@router.get(PREFIX + "/{tier}/{tier_id}")
async def detail_tier_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
    # W2.8 Phase Z.1 — optional OLAP filters (backwards compatible)
    slice_by: Optional[SliceByLit] = None,
    property_type: Optional[PropertyTypeLit] = None,
    price_tier: Optional[PriceTierLit] = None,
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id}")

    node = await _get_or_compute(db, tier, tier_id, period)
    if not node:
        raise HTTPException(404, "Nodo no encontrado")

    # W2.8 — attach OLAP slice if filters provided
    if slice_by or property_type or price_tier:
        try:
            slice_res = await olap.query_slice(
                db, tier=tier, tier_id=tier_id, period=period,
                slice_by=slice_by, property_type=property_type,
                price_tier=price_tier,
            )
            node["olap"] = {
                "kpis": slice_res.get("kpis"),
                "breakdown": slice_res.get("breakdown"),
                "source_units_count": slice_res.get("source_units_count"),
                "cache": slice_res.get("cache"),
            }
        except Exception as e:
            log.warning(f"[olap] detail slice failed: {e}")

    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    children: List[Dict[str, Any]] = []
    if next_tier and next_tier != "unit":
        existing = await db.cube_aggregations.count_documents(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
        )
        if existing == 0:
            await cube.aggregate_tier(db, next_tier, period)
        cur = db.cube_aggregations.find(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
        ).sort([("kpis.units_total", -1)]).limit(200)
        async for r in cur:
            children.append(r)
    elif next_tier == "unit":
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:200]:
                    children.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": u.get("unit_number") or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                        },
                    })
        except Exception:
            pass
        if not children:
            cur = db.units.find({"development_id": tier_id}, {"_id": 0}).limit(200)
            async for u in cur:
                children.append({
                    "tier": "unit", "tier_id": u.get("id") or u.get("unit_id"),
                    "name": u.get("unit_number") or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                    },
                })

    return {"node": node, "next_tier": next_tier, "children": children,
            "children_count": len(children)}


# ─── Cron registration helper ─────────────────────────────────────────────────
def schedule_metrics_cube_daily_aggregation(scheduler, db) -> None:
    """Register daily 2:15am MX cron with cron_heartbeat instrumentation."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cube.metrics_cube_daily_aggregation,
                                 "metrics_cube_daily_aggregation"),
            CronTrigger(hour=2, minute=15, timezone="America/Mexico_City"),
            args=[db], id="metrics_cube_daily_aggregation",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[cube] schedule daily cron failed: {e}")

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("metrics_cube", plan_tier="enterprise", monthly_price_mxn=499, category="monetization", name="Metrics Cube")
