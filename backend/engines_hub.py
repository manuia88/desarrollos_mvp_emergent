"""ENGINES HUB — el catálogo y runner genérico que da visibilidad al 100% de los motores del cubo. Cada motor se registra
una vez (id · nombre · eje · qué produce · runner) y queda CONSULTABLE por el mismo patrón, sin construir una UI a mano por
motor. La pestaña 'Motores' lista el catálogo y corre cualquiera. Los de mayor valor además se integran como dimensiones.

GOAL EN LOOP (ENGINE_MAP.md): se agregan motores por tandas hasta el 100%. Cada runner es defensivo (un motor que falla no
tumba el hub). Casi todos toman un contexto simple {colonia_id, alcaldia?, dev_id?}.
"""
from typing import Any, Dict, List, Optional


def _alcaldia_de(colonia_id: str) -> Optional[str]:
    from data_developments import DEVELOPMENTS
    for d in DEVELOPMENTS:
        if d.get("colonia_id") == colonia_id:
            return d.get("alcaldia")
    return None


# ── runners (1 por motor) — toman (db, ctx) y devuelven la salida del motor ──
async def _r_shf(db, ctx):
    import shf_engine as e
    await e.ensure_shf(db)
    return await e.get_appreciation(db, alcaldia=ctx.get("alcaldia") or _alcaldia_de(ctx.get("colonia_id")))


async def _r_osm(db, ctx):
    import osm_engine as e
    cid = ctx.get("colonia_id")
    r = await e.get_zone_density(db, cid)
    if not r:
        r = await e.compute_zone_density(db, cid, tier="colonia")
    return r


async def _r_demografica(db, ctx):
    import demanda_demografica_engine as e
    return await e.estimar_demanda(db, ctx.get("colonia_id"), categoria=ctx.get("categoria", "media"))


async def _r_bancabilidad(db, ctx):
    import bancabilidad_engine as e
    return await e.bancabilidad_por_zona(db, ctx.get("colonia_id"))


async def _r_valores_unitarios(db, ctx):
    import valores_unitarios_engine as e
    v = await e.get_valor_unitario(db, ctx.get("colonia_id"))
    return {"colonia_id": ctx.get("colonia_id"), "valor_unitario_catastral_m2": v}


async def _r_market_estimate(db, ctx):
    import market_estimate_engine as e
    return await e.market_for_colonia(db, ctx.get("colonia_id"))


async def _r_forecast(db, ctx):
    import forecast_engine as e
    r = await e.get_zone_forecast(db, ctx.get("colonia_id"))
    if not r:
        r = await e.fit_zone_forecast(db, ctx.get("colonia_id"))
    return r


def _nombre_de(colonia_id: str) -> Optional[str]:
    from data_developments import DEVELOPMENTS
    for d in DEVELOPMENTS:
        if d.get("colonia_id") == colonia_id:
            return d.get("colonia")
    return colonia_id


# ── TANDA 2+ runners (geo · forecast · inversión) ──
async def _r_catastro(db, ctx):
    import catastro_sig_engine as e
    return await e.colonia_catastro(db, _nombre_de(ctx.get("colonia_id")))


async def _r_natural_risk(db, ctx):
    import natural_risk_engine as e
    return await e.compute_natural_risk_zone(db, ctx.get("colonia_id"))


async def _r_perception(db, ctx):
    import perception_risk_engine as e
    return await e.compute_perception_risk_zone(db, ctx.get("colonia_id"))


async def _r_zone_score(db, ctx):
    import zone_score_engine as e
    return await e.get_score_or_compute(db, ctx.get("colonia_id"), tier="colonia")


async def _r_perfil_zona(db, ctx):
    import perfil_zona_engine as e
    return await e.perfil_zona(db, ctx.get("colonia_id"))


async def _r_dmx_indices(db, ctx):
    import dmx_indices_engine as e
    import zone_score_engine as zs
    sc = await zs.get_score_or_compute(db, ctx.get("colonia_id"), tier="colonia")
    colonia = {"colonia_id": ctx.get("colonia_id"), "city": "CDMX",
               "scores": sc.get("scores") or sc.get("subscores") or sc, "inventory": sc.get("inventory") or {}}
    return e.compute_indices(colonia)


async def _r_drpi(db, ctx):
    import drpi_engine as e
    return await e.compute_drpi_national(db, period="")


async def _r_live_pulse(db, ctx):
    import live_pulse_engine as e
    return await e.compute_trend_velocity(db, ctx.get("colonia_id"))


async def _r_score_inversion(db, ctx):
    import score_inversion_engine as e
    return await e.top_colonias_by_score(db)


async def _r_invest_baseline(db, ctx):
    import investment_simulator_engine as e
    return await e.get_colonia_baseline(db, ctx.get("colonia_id"))


async def _r_inversionista(db, ctx):
    import inversionista_engine as e
    return await e.comercio_pb(db, ctx.get("colonia_id"))


async def _r_due_diligence(db, ctx):
    import predio_due_diligence_engine as e
    return await e.generar_due_diligence(db, ctx.get("colonia_id"))


# ── REGISTRO — se crece por tandas (ENGINE_MAP.md). id · nombre · eje · produce · runner · fuente ──
REGISTRO: List[Dict[str, Any]] = [
    {"id": "shf", "nombre": "Índice SHF — apreciación oficial", "eje": "DÓNDE/PRECIO", "tanda": 1,
     "produce": "apreciación %/año por alcaldía (benchmark institucional)", "input": ["colonia_id"], "fn": _r_shf, "fuente": "shf_engine"},
    {"id": "osm_pois", "nombre": "POIs / densidad urbana (15-min)", "eje": "DÓNDE", "tanda": 1,
     "produce": "densidad de equipamiento (restaurantes/escuelas/salud/parques) por colonia", "input": ["colonia_id"], "fn": _r_osm, "fuente": "osm_engine"},
    {"id": "demanda_demografica", "nombre": "Demanda demográfica", "eje": "QUIÉN", "tanda": 1,
     "produce": "demanda estimada por demografía de la colonia", "input": ["colonia_id", "categoria"], "fn": _r_demografica, "fuente": "demanda_demografica_engine"},
    {"id": "bancabilidad", "nombre": "Bancabilidad — capacidad de crédito", "eje": "QUIÉN", "tanda": 1,
     "produce": "score de capacidad de crédito de la zona", "input": ["colonia_id"], "fn": _r_bancabilidad, "fuente": "bancabilidad_engine"},
    {"id": "valores_unitarios", "nombre": "Valores unitarios catastrales", "eje": "PRECIO", "tanda": 1,
     "produce": "valor unitario catastral $/m² por colonia", "input": ["colonia_id"], "fn": _r_valores_unitarios, "fuente": "valores_unitarios_engine"},
    {"id": "market_estimate", "nombre": "Estimación de mercado", "eje": "PRECIO", "tanda": 1,
     "produce": "AVM base + posición de precio por colonia", "input": ["colonia_id"], "fn": _r_market_estimate, "fuente": "market_estimate_engine"},
    {"id": "forecast_zona", "nombre": "Pronóstico de zona", "eje": "FORECAST", "tanda": 1,
     "produce": "forecast de precio/absorción por colonia", "input": ["colonia_id"], "fn": _r_forecast, "fuente": "forecast_engine"},
    # ── TANDA 2 ──
    {"id": "catastro", "nombre": "Catastro / SIG (predio)", "eje": "DÓNDE", "tanda": 2,
     "produce": "datos catastrales a nivel predio de la colonia", "input": ["colonia_id"], "fn": _r_catastro, "fuente": "catastro_sig_engine"},
    {"id": "riesgo_natural", "nombre": "Riesgo natural (sísmico/inundación)", "eje": "RIESGO", "tanda": 2,
     "produce": "riesgo natural por zona", "input": ["colonia_id"], "fn": _r_natural_risk, "fuente": "natural_risk_engine"},
    {"id": "riesgo_percibido", "nombre": "Riesgo percibido (ENVIPE)", "eje": "RIESGO", "tanda": 2,
     "produce": "percepción de inseguridad por zona", "input": ["colonia_id"], "fn": _r_perception, "fuente": "perception_risk_engine"},
    {"id": "zone_score", "nombre": "Score de zona", "eje": "DÓNDE", "tanda": 2,
     "produce": "score compuesto de la zona", "input": ["colonia_id"], "fn": _r_zone_score, "fuente": "zone_score_engine"},
    {"id": "perfil_zona", "nombre": "Perfil de zona", "eje": "DÓNDE", "tanda": 2,
     "produce": "perfil/arquetipo de la colonia", "input": ["colonia_id"], "fn": _r_perfil_zona, "fuente": "perfil_zona_engine"},
    {"id": "dmx_indices", "nombre": "Índices DMX", "eje": "SEÑALES", "tanda": 2,
     "produce": "índices propios del mercado (nacional)", "input": [], "fn": _r_dmx_indices, "fuente": "dmx_indices_engine"},
    {"id": "drpi", "nombre": "DRPI (índice de precios real)", "eje": "FORECAST", "tanda": 2,
     "produce": "índice DRPI nacional", "input": [], "fn": _r_drpi, "fuente": "drpi_engine"},
    {"id": "live_pulse", "nombre": "Pulso vivo (velocidad de tendencia)", "eje": "SEÑALES", "tanda": 2,
     "produce": "velocidad de tendencia de la zona (Bloomberg-style)", "input": ["colonia_id"], "fn": _r_live_pulse, "fuente": "live_pulse_engine"},
    {"id": "score_inversion_top", "nombre": "Top colonias por inversión", "eje": "INVERSIÓN", "tanda": 2,
     "produce": "ranking de colonias por score de inversión", "input": [], "fn": _r_score_inversion, "fuente": "score_inversion_engine"},
    {"id": "invest_baseline", "nombre": "Baseline de inversión", "eje": "INVERSIÓN", "tanda": 2,
     "produce": "baseline financiero de la colonia (para el simulador)", "input": ["colonia_id"], "fn": _r_invest_baseline, "fuente": "investment_simulator_engine"},
    {"id": "inversionista_comercio", "nombre": "Comercio en PB (inversionista)", "eje": "INVERSIÓN", "tanda": 2,
     "produce": "potencial de comercio en planta baja de la zona", "input": ["colonia_id"], "fn": _r_inversionista, "fuente": "inversionista_engine"},
    {"id": "due_diligence", "nombre": "Due diligence de predio", "eje": "RIESGO", "tanda": 2,
     "produce": "due diligence (uso de suelo/riesgos) de la zona", "input": ["colonia_id"], "fn": _r_due_diligence, "fuente": "predio_due_diligence_engine"},
]
BY_ID = {e["id"]: e for e in REGISTRO}


def catalogo() -> Dict[str, Any]:
    """El catálogo de motores registrados (lo que la pestaña 'Motores' lista), agrupado por eje."""
    from collections import defaultdict
    grupos = defaultdict(list)
    for e in REGISTRO:
        grupos[e["eje"]].append({k: e[k] for k in ("id", "nombre", "produce", "input", "fuente", "tanda")})
    return {"motores": [{"eje": k, "items": v} for k, v in sorted(grupos.items())],
            "total_registrados": len(REGISTRO),
            "lectura": "cada motor es consultable por el mismo patrón; se agregan por tandas hasta el 100%"}


async def run(db, engine_id: str, ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Corre un motor del registro con un contexto simple {colonia_id, alcaldia?, dev_id?, ...}."""
    meta = BY_ID.get(engine_id)
    if not meta:
        return {"error": f"motor no registrado: {engine_id}", "registrados": list(BY_ID)}
    ctx = ctx or {}
    try:
        salida = await meta["fn"](db, ctx)
    except Exception as e:  # noqa: BLE001
        return {"id": engine_id, "nombre": meta["nombre"], "error": str(e)[:200], "fuente": meta["fuente"]}
    return {"id": engine_id, "nombre": meta["nombre"], "eje": meta["eje"], "produce": meta["produce"],
            "fuente": meta["fuente"], "ctx": ctx, "salida": salida}
