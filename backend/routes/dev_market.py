"""
DMX · Fase 3.2 — LENTE DEL DEV sobre el cubo (su slice + mercado anónimo)
Prefix /api/dev/market · auth developer/superadmin. Expone la inteligencia del cubo
al dev SIN dato crudo ajeno: benchmark (tú vs mercado), amenity ranker, demand-gap.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api/dev/market", tags=["dev_market"])
log = logging.getLogger("dmx.routes_dev_market")


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/benchmark")
async def benchmark(request: Request):
    """Tu absorción y $/m² vs el mercado anónimo, por (colonia × tipología). El moat:
    'tu 2-rec vende 14% vs el mercado 18%'. Solo celdas donde tienes unidades."""
    user = await _auth(request)
    import dmx_dev_benchmark
    return await dmx_dev_benchmark.benchmark(_db(request), user)


@router.get("/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """¿Qué atributo sube el precio/m²? (hedónico · inteligencia de mercado anónima)."""
    await _auth(request)
    import dmx_hedonic_atom
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await dmx_hedonic_atom.fit_and_rank(_db(request), scope)


@router.get("/demand-gap")
async def demand_gap(request: Request, top: int = Query(15, ge=1, le=100)):
    """Dónde hay demanda y poco/cero inventario de una tipología = dónde construir."""
    await _auth(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)


async def _dev_colonias(db, user) -> list:
    """Las colonias de los desarrollos del dev (multi-tenant) — su 'zona' para acotar la demanda."""
    from tenant_scope import user_dev_ids
    dev_ids = list(user_dev_ids(user) or [])
    cols = set()
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        for did in dev_ids:
            d = DEVELOPMENTS_BY_ID.get(did)
            if d and d.get("colonia_id"):
                cols.add(d["colonia_id"])
    except Exception:
        pass
    try:
        async for d in db.developments.find({"id": {"$in": dev_ids}}, {"_id": 0, "colonia_id": 1}):
            if d.get("colonia_id"):
                cols.add(d["colonia_id"])
    except Exception:
        pass
    return sorted(c for c in cols if c)


@router.get("/demand-intel")
async def demand_intel(request: Request, dias: int = Query(60, ge=7, le=365)):
    """DEMANDA INSATISFECHA EN TUS ZONAS (el moat para el dev): qué busca la gente y NO encuentra, a dónde se va, la brecha
    de presupuesto, y qué esquema de pago pide. Señal REAL y anónima de db.marketplace_searches (lo que el buscador IA loguea).
    Le dice al dev DÓNDE construir, A QUÉ PRECIO y CON QUÉ PLAN. Sin dato crudo ajeno: solo agregados de SUS colonias."""
    import datetime as _dt
    user = await _auth(request)
    db = _db(request)
    cols = await _dev_colonias(db, user)
    if not cols:
        return {"ok": True, "vacio": True, "colonias": [],
                "lectura": "Aún no identificamos tus zonas. Publica un desarrollo y verás aquí la demanda real de tu colonia."}
    since = _dt.datetime.utcnow() - _dt.timedelta(days=dias)
    base = {"colonia_id": {"$in": cols}, "created_at_dt": {"$gte": since}}

    async def _agg(pipeline):
        try:
            return await db.marketplace_searches.aggregate(pipeline).to_list(100)
        except Exception:
            return []

    async def _count(q):
        try:
            return await db.marketplace_searches.count_documents(q)
        except Exception:
            return 0

    total = await _count(base)
    insatisfechas = await _count({**base, "unmet": True})
    # Sustitución: de MI zona, ¿a qué zonas se va la demanda que no pude cumplir?
    sust = await _agg([
        {"$match": {**base, "sustitucion": True}}, {"$unwind": "$zonas_sustitutas"},
        {"$group": {"_id": "$zonas_sustitutas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    # Brecha: cuántos quieren MI zona pero su mensualidad no alcanza ni lo más barato + cuánto les falta.
    brecha = await _agg([
        {"$match": {**base, "gap_mensualidad": {"$gt": 0}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "gap_prom": {"$avg": "$gap_mensualidad"},
                    "mens_pedida_prom": {"$avg": "$mensualidad_max"}}},
    ])
    # Esquema de pago que pide la gente en MI zona (crédito vs preventa) → cómo estructurar precio/plan.
    esquema = await _agg([
        {"$match": {**base, "esquema_pedido": {"$ne": None}}},
        {"$group": {"_id": "$esquema_pedido", "n": {"$sum": 1}}}, {"$sort": {"n": -1}},
    ])
    # Qué piden (amenidades) que quizá no ofreces → qué construir.
    amen = await _agg([
        {"$match": base}, {"$unwind": "$amenidades_pedidas"},
        {"$group": {"_id": "$amenidades_pedidas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    # Recámaras y presupuesto promedio que busca la gente en MI zona.
    perfil = await _agg([
        {"$match": base},
        {"$group": {"_id": None, "rec_prom": {"$avg": "$recamaras_min"}, "precio_prom": {"$avg": "$precio_max"},
                    "mens_prom": {"$avg": "$mensualidad_max"}}},
    ])
    b0 = (brecha or [{}])[0]
    p0 = (perfil or [{}])[0]
    return {
        "ok": True, "vacio": total == 0, "colonias": cols, "ventana_dias": dias,
        "total_busquedas": total,
        "insatisfechas": insatisfechas,
        "insatisfechas_pct": round(insatisfechas / total * 100) if total else 0,
        "sustitucion": [{"zona": s["_id"], "veces": s["n"]} for s in sust if s.get("_id")],
        "brecha": ({"personas": b0.get("n", 0),
                    "gap_prom": round(b0["gap_prom"]) if b0.get("gap_prom") else None,
                    "mens_pedida_prom": round(b0["mens_pedida_prom"]) if b0.get("mens_pedida_prom") else None}
                   if b0.get("n") else None),
        "esquema": [{"esquema": e["_id"], "veces": e["n"]} for e in esquema if e.get("_id")],
        "amenidades_pedidas": [{"amenidad": a["_id"], "veces": a["n"]} for a in amen if a.get("_id")],
        "perfil_buscado": {
            "recamaras_prom": round(p0["rec_prom"], 1) if p0.get("rec_prom") else None,
            "precio_prom": round(p0["precio_prom"]) if p0.get("precio_prom") else None,
            "mensualidad_prom": round(p0["mens_prom"]) if p0.get("mens_prom") else None,
        },
        "lectura": "Lo que la gente busca en tus zonas y no siempre encuentra. Úsalo para decidir dónde construir, a qué precio y con qué esquema de pago.",
    }
