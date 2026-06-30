"""ENGINES HUB — el catálogo y runner genérico que da visibilidad al 100% de los motores del cubo. Cada motor se registra
una vez (id · nombre · eje · qué produce · runner) y queda CONSULTABLE por el mismo patrón, sin construir una UI a mano por
motor. La pestaña 'Motores' lista el catálogo y corre cualquiera. Los de mayor valor además se integran como dimensiones.

GOAL EN LOOP (ENGINE_MAP.md): se agregan motores por tandas hasta el 100%. Cada runner es defensivo (un motor que falla no
tumba el hub). Casi todos toman un contexto simple {colonia_id, alcaldia?, dev_id?}.
"""
from typing import Any, Callable, Dict, List, Optional


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
