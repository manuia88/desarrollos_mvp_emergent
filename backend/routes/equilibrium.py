"""
Rutas del motor de Precio de Equilibrio + Gap de mercado (dato real 4S).

DECISIÓN DEL FOUNDER (2026-07-12): el dato 4S es un activo estratégico y queda EXCLUSIVAMENTE
en superadmin — NO se expone en marketplace público ni en el portal del desarrollador. Todos
los endpoints van bajo /api/superadmin/equilibrio/* con require_superadmin. Al dev se le
despacha guía curada por el superadmin (patrón cube→brief), no acceso al dato crudo.

Endpoints (todos superadmin):
  GET  /api/superadmin/equilibrio/precio        ?estudio=&zona=&clasificacion=&meses=
  GET  /api/superadmin/equilibrio/gap           ?estudio=
  GET  /api/superadmin/equilibrio/gap-radar
  GET  /api/superadmin/equilibrio/market-intel  ?estudio=&zona=&meses=
  GET  /api/superadmin/market-4s/overview                     ← god-view (competidores + cobertura)
  POST /api/superadmin/market-4s/load                         ← carga/refresca el dato 4S
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Request, Query

from permissions import require_superadmin

log = logging.getLogger("dmx.equilibrium.routes")
router = APIRouter(tags=["equilibrium"])


def _db(request: Request):
    return request.app.state.db


@router.get("/api/superadmin/equilibrio/precio")
async def r_precio_equilibrio(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    clasificacion: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await require_superadmin(request)
    from equilibrium_engine import precio_equilibrio
    return await precio_equilibrio(_db(request), zona=zona, estudio=estudio,
                                   clasificacion=clasificacion, meses_objetivo=meses)


@router.get("/api/superadmin/equilibrio/gap")
async def r_gap_mercado(request: Request, estudio: Optional[str] = Query(None)):
    await require_superadmin(request)
    from equilibrium_engine import gap_por_rango
    return await gap_por_rango(_db(request), estudio=estudio)


@router.get("/api/superadmin/equilibrio/gap-radar")
async def r_gap_radar(request: Request):
    """Radar de oportunidad: todas las zonas×segmentos rankeadas por índice de oportunidad."""
    await require_superadmin(request)
    from equilibrium_engine import gap_radar
    return await gap_radar(_db(request))


@router.get("/api/superadmin/equilibrio/market-intel")
async def r_market_intelligence(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await require_superadmin(request)
    from equilibrium_engine import market_intelligence
    return await market_intelligence(_db(request), zona=zona, estudio=estudio, meses_objetivo=meses)


@router.post("/api/superadmin/market-4s/load")
async def r_load_market_4s(request: Request):
    await require_superadmin(request)
    from market_4s_loader import load_market_4s
    return await load_market_4s(_db(request))


# ── CUBO 4S · átomos macro→nano (2,200+ hechos de los 4 estudios · superadmin-only) ──
@router.post("/api/superadmin/cubo-4s/load")
async def r_cubo4s_load(request: Request):
    await require_superadmin(request)
    from market_4s_facts import load_facts_4s
    return await load_facts_4s(_db(request))


@router.get("/api/superadmin/cubo-4s/catalogo")
async def r_cubo4s_catalogo(request: Request):
    await require_superadmin(request)
    from cube_4s_engine import catalogo
    return await catalogo(_db(request))


@router.get("/api/superadmin/cubo-4s/corte")
async def r_cubo4s_corte(
    request: Request,
    estudio: Optional[str] = Query(None), tema: Optional[str] = Query(None),
    pregunta: Optional[str] = Query(None), opcion: Optional[str] = Query(None),
    subzona: Optional[str] = Query(None),
    corte_dim: Optional[str] = Query(None), corte_valor: Optional[str] = Query(None),
):
    await require_superadmin(request)
    from cube_4s_engine import corte
    return await corte(_db(request), estudio=estudio, tema=tema, pregunta=pregunta,
                       opcion=opcion, subzona=subzona, corte_dim=corte_dim, corte_valor=corte_valor)


@router.get("/api/superadmin/cubo-4s/comparar")
async def r_cubo4s_comparar(request: Request, tema: str = Query(...), pregunta: str = Query(...)):
    await require_superadmin(request)
    from cube_4s_engine import comparar
    return await comparar(_db(request), tema=tema, pregunta=pregunta)


@router.get("/api/superadmin/cubo-4s/nano")
async def r_cubo4s_nano(request: Request, estudio: str = Query(...),
                        corte_dim: str = Query("etapa_vida"), corte_valor: str = Query(...)):
    await require_superadmin(request)
    from cube_4s_engine import nano
    return await nano(_db(request), estudio=estudio, corte_dim=corte_dim, corte_valor=corte_valor)


@router.get("/api/superadmin/cubo-4s/dimensiones")
async def r_cubo4s_dims(request: Request):
    await require_superadmin(request)
    from cube_4s_engine import dimensiones_nano
    return await dimensiones_nano(_db(request))


@router.get("/api/superadmin/cubo-4s/prior")
async def r_cubo4s_prior(request: Request, estudio: str = Query(...)):
    """El prior de mercado de la zona (dominantes 4S) que alimenta cuota/pagos/producto."""
    await require_superadmin(request)
    from market_4s_prior import prior_zona
    return await prior_zona(_db(request), estudio)


@router.get("/api/superadmin/cubo-4s/contraste")
async def r_cubo4s_contraste(request: Request, dias: int = Query(90, ge=7, le=365)):
    """Prior 4S (foto may/jun-2026) vs comprador OBSERVADO en el marketplace → confirma o DRIFT."""
    await require_superadmin(request)
    from market_4s_prior import contraste_4s_vs_observado
    return await contraste_4s_vs_observado(_db(request), dias=dias)


@router.get("/api/superadmin/market-4s/consumidor")
async def r_market_4s_consumidor(request: Request):
    """Inteligencia del CONSUMIDOR 4S (god-view): WTP (cuánto paga) + producto ideal (qué quiere)
    + score verde (sustentabilidad que vende) + plusvalía validada (avalúo vs reventa vs nuevo)."""
    await require_superadmin(request)
    from consumer_4s_engine import inteligencia_consumidor
    return await inteligencia_consumidor(_db(request))


@router.get("/api/superadmin/market-4s/overview")
async def r_market_4s_overview(request: Request):
    """God-view del dato 4S: proyectos competidores por estudio (nombres + absorción exacta),
    radar de oportunidad y la COBERTURA ganada (colonias cuyo IAB pasó de estimado→real)."""
    await require_superadmin(request)
    db = _db(request)
    from equilibrium_engine import gap_radar
    from market_4s_bridge import absorcion_4s_by_colonia

    estudios: dict = {}
    try:
        async for c in db.market_comps_4s.find({}, {"_id": 0}):
            estudios.setdefault(c.get("estudio") or "—", []).append(c)
    except Exception as e:
        log.warning("[market-4s/overview] comps fail-open: %s", e)

    radar = await gap_radar(db)
    cobertura = await absorcion_4s_by_colonia(db)

    def _abs(comps):
        tot = sum(int(x.get("unidades_totales") or 0) for x in comps)
        sold = sum(int(x.get("unidades_vendidas") or 0) for x in comps)
        return round(100 * sold / tot, 1) if tot else None

    return {
        "n_proyectos": sum(len(v) for v in estudios.values()),
        "n_estudios": len(estudios),
        "estudios": [{
            "estudio": k, "n_proyectos": len(v),
            "absorcion_pct": _abs(v),
            "comps": sorted(v, key=lambda x: -(x.get("absorcion_pct") or 0)),
        } for k, v in sorted(estudios.items())],
        "gap_radar": radar,
        "cobertura_iab_real": {
            "n_colonias": len(cobertura),
            "colonias": sorted(cobertura.keys()),
            "detalle": [{"colonia": k, **v} for k, v in sorted(cobertura.items())],
        },
        "fuente": "4s_2026-05",
    }
