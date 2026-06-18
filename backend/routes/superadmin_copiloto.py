"""
Inteligencia Superadmin del Copiloto — el CUBO del ciclo del comprador (2026-06-18).

El ciclo del comprador agregado cross-ciudad = el moat "Bloomberg CDMX". Lee el ESPINAZO (marketplace_searches +
buyer_signals + leads + appointments) y lo destila en el cubo: EMBUDO (search→like→save→register→visit) ·
HUECOS de mercado (demandado sin oferta) · TOP demanda por colonia · VELOCIDAD (tendencia) · SHADOW demand
(anónimas vs registradas = el top-of-funnel real). Solo superadmin. Anónimo/agregado (no expone PII).
"""
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Query

log = logging.getLogger("dmx.routes_superadmin_copiloto")
router = APIRouter(tags=["superadmin_copiloto"])
PREFIX = "/api/superadmin/copiloto"


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _count(coll, q):
    try:
        return await coll.count_documents(q)
    except Exception:
        return 0


async def _agg(coll, pipeline):
    try:
        return await coll.aggregate(pipeline).to_list(50)
    except Exception:
        return []


async def buyer_cycle_intel(db, dias: int = 30):
    """El cubo del ciclo del comprador (callable directo para verificación)."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=dias)
    F = {"created_at_dt": {"$gte": since}}

    # ── EMBUDO ── (cada paso del ciclo)
    busquedas = await _count(db.marketplace_searches, F)
    likes = await _count(db.buyer_signals, {"type": "like", "active": True, **F})
    guardadas = await _count(db.marketplace_searches, {"alert": True, **F})
    registros = await _count(db.leads, {"visitor_id": {"$exists": True, "$nin": [None, ""]}})
    visitas = await _count(db.appointments, {})
    conv = round(registros / busquedas * 100, 1) if busquedas else 0.0

    # ── HUECOS DE MERCADO ── (búsquedas SIN resultado, por colonia = dónde construir / vendible a devs)
    gaps = await _agg(db.marketplace_searches, [
        {"$match": {"unmet": True}}, {"$unwind": "$colonias"},
        {"$group": {"_id": "$colonias", "n": {"$sum": 1}, "presupuesto_prom": {"$avg": "$precio_max"}}},
        {"$sort": {"n": -1}}, {"$limit": 10},
    ])

    # ── TOP DEMANDA por colonia ──
    top = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$colonias"},
        {"$group": {"_id": "$colonias", "busquedas": {"$sum": 1}, "presupuesto_prom": {"$avg": "$precio_max"},
                    "recamaras_prom": {"$avg": "$recamaras_min"}}},
        {"$sort": {"busquedas": -1}}, {"$limit": 10},
    ])

    # ── VELOCIDAD ── (señales últimos 7d vs previos 7d)
    d7, d14 = now - timedelta(days=7), now - timedelta(days=14)
    last7 = await _count(db.buyer_signals, {"created_at_dt": {"$gte": d7}})
    prev7 = await _count(db.buyer_signals, {"created_at_dt": {"$gte": d14, "$lt": d7}})

    # ── SHADOW DEMAND ── (anónimas vs registradas = el top-of-funnel real)
    anon = await _count(db.marketplace_searches, {"lead_id": {"$in": [None]}, **F})
    reg = await _count(db.marketplace_searches, {"lead_id": {"$nin": [None]}, **F})

    # ── CIERRES (E7 · flywheel) ── la inteligencia de CONVERSIÓN y COMPROMISO (el moat que se mejora solo).
    cierres = await _count(db.copiloto_closings, {})
    subio_pres = await _count(db.copiloto_closings, {"desajuste.subio_presupuesto": True})
    cambio_zona = await _count(db.copiloto_closings, {"desajuste.cambio_zona": True})
    like_antes = await _count(db.copiloto_closings, {"conducta.dio_like_al_comprado": True})
    ciclo = await _agg(db.copiloto_closings, [{"$group": {"_id": None, "dias": {"$avg": "$recorrido.dias_a_cierre"}}}])
    pct = lambda n: round(n / cierres * 100) if cierres else 0  # noqa: E731

    # ── DEMANDA GRANULAR (B) ── lo que el mercado PIDE por dimensión fina + el HUECO (pedido vs ofertado).
    # Lo que NO podemos cumplir (amenidad rara, zona fuera de cobertura) es el dato más valioso: dónde está el dinero.
    from data_developments import DEVELOPMENTS as _DEVS
    _supply_amen: dict = {}
    for _d in _DEVS:
        for _a in (_d.get("amenities") or []):
            _supply_amen[_a] = _supply_amen.get(_a, 0) + 1
    amen_ped = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$amenidades_pedidas"},
        {"$group": {"_id": "$amenidades_pedidas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 12},
    ])
    feat_ped = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$features_pedidos"},
        {"$group": {"_id": "$features_pedidos", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    zonas_nd = await _agg(db.marketplace_searches, [
        {"$match": {"zona_no_disponible": {"$nin": [None, ""]}, **F}},
        {"$group": {"_id": "$zona_no_disponible", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 10},
    ])
    cred_ped = await _agg(db.marketplace_searches, [
        {"$match": {"credito": {"$nin": [None, "", "none"]}, **F}},
        {"$group": {"_id": "$credito", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 6},
    ])

    return {
        "ventana_dias": dias,
        "embudo": {
            "busquedas": busquedas, "likes": likes, "guardadas_con_alerta": guardadas,
            "registros": registros, "visitas": visitas,
            "conversion_busqueda_a_registro_pct": conv,
        },
        "huecos_mercado": [{"colonia": g["_id"], "busquedas_sin_oferta": g["n"],
                            "presupuesto_prom": round(g["presupuesto_prom"]) if g.get("presupuesto_prom") else None} for g in gaps],
        "top_demanda": [{"colonia": t["_id"], "busquedas": t["busquedas"],
                         "presupuesto_prom": round(t["presupuesto_prom"]) if t.get("presupuesto_prom") else None,
                         "recamaras_prom": round(t["recamaras_prom"], 1) if t.get("recamaras_prom") else None} for t in top],
        "velocidad": {"ultimos_7d": last7, "previos_7d": prev7,
                      "tendencia": "subiendo" if last7 > prev7 else "bajando" if last7 < prev7 else "estable"},
        "shadow_demand": {"anonimas": anon, "registradas": reg, "ratio_anon_vs_reg": round(anon / max(reg, 1), 1),
                          "lectura": "Por cada lead registrado hay N búsquedas anónimas (el verdadero top-of-funnel)."},
        "cierres": {"n": cierres, "pct_subio_presupuesto": pct(subio_pres), "pct_cambio_zona": pct(cambio_zona),
                    "pct_like_antes_de_comprar": pct(like_antes),
                    "ciclo_dias_prom": round(ciclo[0]["dias"], 1) if (ciclo and ciclo[0].get("dias") is not None) else None,
                    "lectura": "Qué transigen los que SÍ cierran (presupuesto/zona) + el gusto predice la compra (el moat)."},
        "demanda_granular": {
            "amenidades_pedidas": [{"amenidad": a["_id"], "pedidos": a["n"],
                                    "desarrollos_que_la_ofrecen": _supply_amen.get(a["_id"], 0)} for a in amen_ped],
            "features_pedidos": [{"feature": f["_id"], "pedidos": f["n"]} for f in feat_ped],
            "zonas_fuera_de_cobertura": [{"zona": z["_id"], "pedidos": z["n"]} for z in zonas_nd],
            "creditos_pedidos": [{"credito": c["_id"], "pedidos": c["n"]} for c in cred_ped],
            "lectura": "Lo que el mercado pide por dimensión fina. Amenidad muy pedida y poco ofertada = qué construir/aceptar. Zona fuera de cobertura = dónde expandir.",
        },
        "es_estimado": busquedas < 30,
        "data_source": "espinazo Copiloto (marketplace_searches + buyer_signals + leads)",
    }


@router.get(PREFIX + "/intel")
async def intel(request: Request, dias: int = Query(30, ge=1, le=365)):
    """El cubo del ciclo del comprador para superadmin (Bloomberg CDMX). Agregado, sin PII."""
    await _require_superadmin(request)
    db = request.app.state.db
    return {"ok": True, **await buyer_cycle_intel(db, dias)}
