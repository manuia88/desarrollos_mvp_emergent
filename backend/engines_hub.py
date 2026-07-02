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
    comp = sc.get("components") or {}
    # mapear los componentes reales de zone_score a las llaves que consume compute_indices (antes pasaba {} → IDM idéntico)
    colonia = {"colonia_id": ctx.get("colonia_id"), "name": _nombre_de(ctx.get("colonia_id")), "city": "CDMX",
               "scores": {
                   "comercio": comp.get("denue_density", 60),
                   "vida": comp.get("demand", 60),
                   "seguridad": comp.get("risk", 60),
                   "movilidad": comp.get("denue_density", 60),
                   "educacion": 60,
                   "plusvalia": comp.get("yield_score", 60),
                   "riesgo": comp.get("risk", 60),
               },
               "inventory": sc.get("inventory") or {}}
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


def _centroide_de(colonia_id: str):
    from data_developments import DEVELOPMENTS
    pts = [d.get("center") for d in DEVELOPMENTS if d.get("colonia_id") == colonia_id and d.get("center")]
    if not pts:
        return None
    return (sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts))  # (lat, lng)


# ── TANDA 3 runners (mercado · producto · global) ──
async def _r_terminal_mercado(db, ctx):
    import terminal_mercado_engine as e
    return await e.terminal_mercado(db, top_colonias=8)


async def _r_amenidades(db, ctx):
    import amenidades_engine as e
    return await e.ranker_amenidades(db, ctx.get("colonia_id"))


async def _r_dmx_demand(db, ctx):
    import dmx_demand as e
    return await e.demand_gap(db, top=25)


async def _r_constr_quality(db, ctx):
    import construction_quality_engine as e
    return await e.list_developments_by_quality(db)


async def _r_market_rates(db, ctx):
    import market_rates_engine as e
    return await e.get_rates(db)


async def _r_estudio_mercado(db, ctx):
    import estudio_mercado_engine as e
    c = _centroide_de(ctx.get("colonia_id"))
    if not c:
        return {"error": "sin centroide para la colonia"}
    return await e.generar_estudio_radio(db, c[0], c[1], 1000.0)


async def _r_generador_producto(db, ctx):
    import generador_producto_engine as e
    return await e.generar_producto(db, ctx.get("colonia_id"), 500.0)


def _precio_colonia(colonia_id):
    """(precio_mediano, pm2_mediano, m2_mediano) de las unidades de la colonia."""
    import statistics
    from data_developments import DEVELOPMENTS
    pr, pm2, m2 = [], [], []
    for d in DEVELOPMENTS:
        if d.get("colonia_id") != colonia_id:
            continue
        for u in (d.get("units") or []):
            if u.get("price"):
                pr.append(u["price"])
            if u.get("price") and u.get("m2_total"):
                pm2.append(u["price"] / u["m2_total"])
            if u.get("m2_total"):
                m2.append(u["m2_total"])
    return (round(statistics.median(pr)) if pr else None,
            round(statistics.median(pm2)) if pm2 else None,
            round(statistics.median(m2)) if m2 else None)


# ── TANDA 4 runners (valuación · costo de propiedad · pago) ──
async def _r_avm(db, ctx):
    import avm_public_engine as e
    # consciente de la unidad: si viene una unidad en contexto, valúa ESA unidad; si no, un depto típico 90m²/2rec
    u = ctx.get("_unit") or {}
    m2 = float(u.get("m2_total") or u.get("m2") or 90)
    rec = int(u.get("recamaras") or u.get("bedrooms") or 2)
    ban = int(u.get("banos") or u.get("bathrooms") or 2)
    return await e.avm_quick_async(db, ctx.get("colonia_id"), m2, rec, ban, 0)


async def _r_ownership(db, ctx):
    import ownership_economics_engine as e
    precio, _, m2 = _precio_colonia(ctx.get("colonia_id"))
    return e.compute_ownership(float(precio or 6_000_000), float(m2 or 90), None)


async def _r_payment(db, ctx):
    import payment_schemes as e
    precio, _, _ = _precio_colonia(ctx.get("colonia_id"))
    return {"esquemas_sugeridos": e.suggest_schemes(price_from=float(precio or 0))}


async def _r_price_ctx(db, ctx):
    import price_context_engine as e
    from data_developments import DEVELOPMENTS
    cid = ctx.get("colonia_id")
    _, pm2, _ = _precio_colonia(cid)
    peers = []
    for c in {d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id") and d.get("colonia_id") != cid}:
        _, p, _ = _precio_colonia(c)
        if p:
            peers.append(p)
    return e.compute_price_context(float(pm2 or 0), {"colonia_id": cid}, peers) or {"nota": "sin contexto suficiente"}


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
    # ── TANDA 3 ──
    {"id": "terminal_mercado", "nombre": "Terminal de mercado", "eje": "SEÑALES", "tanda": 3,
     "produce": "tablero de mercado (top colonias, índices vivos)", "input": [], "fn": _r_terminal_mercado, "fuente": "terminal_mercado_engine"},
    {"id": "amenidades_ranker", "nombre": "Ranker de amenidades", "eje": "QUÉ", "tanda": 3,
     "produce": "qué amenidades pesan más en la zona", "input": ["colonia_id"], "fn": _r_amenidades, "fuente": "amenidades_engine"},
    {"id": "dmx_demand_gap", "nombre": "Brecha de demanda (DMX)", "eje": "SEÑALES", "tanda": 3,
     "produce": "top brechas de demanda del mercado", "input": [], "fn": _r_dmx_demand, "fuente": "dmx_demand"},
    {"id": "calidad_construccion", "nombre": "Calidad de construcción (ranking)", "eje": "EXPERIENCIA", "tanda": 3,
     "produce": "desarrollos rankeados por calidad de construcción", "input": [], "fn": _r_constr_quality, "fuente": "construction_quality_engine"},
    {"id": "tasas_mercado", "nombre": "Tasas de mercado", "eje": "PRECIO", "tanda": 3,
     "produce": "tasas (CETES/hipotecaria) del mercado", "input": [], "fn": _r_market_rates, "fuente": "market_rates_engine"},
    {"id": "estudio_mercado", "nombre": "Estudio de mercado (radio)", "eje": "SEÑALES", "tanda": 3,
     "produce": "estudio de mercado en radio de 1km de la zona", "input": ["colonia_id"], "fn": _r_estudio_mercado, "fuente": "estudio_mercado_engine"},
    {"id": "generador_producto", "nombre": "Generador de producto", "eje": "INVERSIÓN", "tanda": 3,
     "produce": "producto óptimo sugerido para un terreno en la zona", "input": ["colonia_id"], "fn": _r_generador_producto, "fuente": "generador_producto_engine"},
    # ── TANDA 4 ──
    {"id": "avm_publico", "nombre": "AVM — valor de un depto típico", "eje": "PRECIO", "tanda": 4,
     "produce": "valor estimado de un 2-rec típico (90m²) en la zona", "input": ["colonia_id"], "fn": _r_avm, "fuente": "avm_public_engine"},
    {"id": "costo_propiedad", "nombre": "Costo de propiedad (cuotas/predial)", "eje": "EXPERIENCIA", "tanda": 4,
     "produce": "costo total de tener la propiedad (mantenimiento+predial vs renta)", "input": ["colonia_id"], "fn": _r_ownership, "fuente": "ownership_economics_engine"},
    {"id": "esquemas_pago", "nombre": "Esquemas de pago sugeridos", "eje": "PRECIO", "tanda": 4,
     "produce": "esquemas de pago/enganche sugeridos para el precio de la zona", "input": ["colonia_id"], "fn": _r_payment, "fuente": "payment_schemes"},
    {"id": "contexto_precio", "nombre": "Contexto de precio (vs peers)", "eje": "PRECIO", "tanda": 4,
     "produce": "posición de precio de la zona vs colonias comparables", "input": ["colonia_id"], "fn": _r_price_ctx, "fuente": "price_context_engine"},
]
# ── merge de módulos por tanda (cada uno aporta su REGISTRO; falla suave si un módulo está roto) ──
_BATCHES = ("engines_batch_valuacion", "engines_batch_geo", "engines_batch_demanda", "engines_batch_cubo", "engines_batch_inversion")
for _b in _BATCHES:
    try:
        _m = __import__(_b)
        for _e in getattr(_m, "REGISTRO", []):
            if _e.get("id") and _e.get("fn"):
                REGISTRO.append(_e)
    except Exception:  # noqa: BLE001
        pass

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
    ctx = dict(ctx or {})
    # contexto enriquecido: si un motor necesita desarrollo/unidad y solo vino colonia, toma un representativo de la zona
    if ctx.get("colonia_id") and not ctx.get("dev_id"):
        from data_developments import DEVELOPMENTS
        dev = next((d for d in DEVELOPMENTS if d.get("colonia_id") == ctx["colonia_id"]), None)
        if dev:
            ctx["dev_id"] = dev["id"]
            ctx["_dev"] = dev
            us = dev.get("units") or []
            if us:
                ctx["_unit"] = us[0]
    try:
        salida = await meta["fn"](db, ctx)
    except Exception as e:  # noqa: BLE001
        return {"id": engine_id, "nombre": meta["nombre"], "error": str(e)[:200], "fuente": meta["fuente"]}
    import engine_present as ep
    indicadores = ep.presentar(engine_id, salida, meta["fuente"], meta["eje"])
    return {"id": engine_id, "nombre": meta["nombre"], "eje": meta["eje"], "produce": meta["produce"],
            "fuente": meta["fuente"], "ctx": ctx,
            "indicadores": indicadores,                       # ← hiper-segmentado (lo que se muestra)
            "hipersegmentado": ep.tiene_descriptor(engine_id),
            "salida_cruda": salida}                            # ← solo referencia/transparencia, NO se pinta como sudoku
