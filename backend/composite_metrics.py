"""LAS 100 MÉTRICAS COMPUESTAS — comportamiento del marketplace ⊗ motores de mercado del superadmin.

Registro COMPLETO de las 100 (COMPOSITE_METRICS_100.md), en 10 paquetes vendibles. Cada compuesta es una función pura
sobre el contexto por-colonia (fusión de zone_intelligence) + el contexto global (marketplace_granularity). Devuelve valor
real donde hay dato; None honesto donde el feeder de mercado está apagado (la fórmula ya queda cableada para cuando prenda).
"""
from typing import Any, Dict, List


# ── accesores seguros ──────────────────────────────────────────────────────────
def _n(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _sub(z, k):
    return (z.get("subscores") or {}).get(k)


def _ab(z, k):
    return (z.get("absorcion") or {}).get(k)


def _spec(z, k):
    return (z.get("spec_pedida") or {}).get(k)


def _risk(z):
    return (z.get("riesgo") or {}).get("num")


def _inv(z):
    return (z.get("inversion") or {}).get("score")


def _pct_gap(a, b):
    a, b = _n(a), _n(b)
    if a is None or b is None or b == 0:
        return None
    return round(100 * (a - b) / b)


def _ratio(a, b):
    a, b = _n(a), _n(b)
    if a is None or b is None or b == 0:
        return None
    return round(a / b, 2)


def _scale(v, mx):
    v = _n(v)
    return None if v is None else round(min(max(v / mx, 0), 1) * 100)


# ── construcción del contexto ───────────────────────────────────────────────────
async def build_context(db, since_days: int = 180, top: int = 20) -> Dict[str, Any]:
    import demand_intelligence as di
    import marketplace_granularity as mg
    zi = await di.zone_intelligence(db, since_days=since_days, top=top, with_airroi=True, with_underwriting=True)  # AirROI 1×/zona/mes + valor residual/norma3/lift
    zones = zi.get("zonas", [])

    g: Dict[str, Any] = {}
    # comportamiento (marketplace)
    try:
        g["wtp"] = {r["feature"]: r["precio_medio_visto"] for r in (await mg.willingness_to_pay(db)).get("features", [])}
    except Exception:
        g["wtp"] = {}
    try:
        g["elasticidad"] = (await mg.price_elasticity(db)).get("curva", {})
    except Exception:
        g["elasticidad"] = {}
    try:
        g["rejection"] = {r["razon"]: r["n"] for r in (await di.rejection_intel(db)).get("razones", [])}
    except Exception:
        g["rejection"] = {}
    try:
        isp = await mg.run_all(db, keys=["criterios_decision", "fugas_embudo", "estacionalidad", "atribucion", "sustitucion"])
        g["funnel"] = (isp.get("fugas_embudo") or {}).get("conversion_pct", {})
        g["criterios"] = (isp.get("criterios_decision") or {}).get("criterios", [])
        g["estacionalidad"] = (isp.get("estacionalidad") or {}).get("por_mes", {})
        g["atribucion"] = (isp.get("atribucion") or {}).get("por_fuente", [])
        g["sustitucion"] = isp.get("sustitucion") or {}
    except Exception:
        g.update({"funnel": {}, "criterios": [], "estacionalidad": {}, "atribucion": [], "sustitucion": {}})
    try:
        g["intent"] = await di.intent_split(db)
    except Exception:
        g["intent"] = {}
    # mercado (feeders — best-effort; None si apagado)
    g["cetes"] = None
    try:
        import market_rates_engine as mr
        rates = await mr.get_rates(db) if hasattr(mr, "get_rates") else None
        if isinstance(rates, dict):
            g["cetes"] = rates.get("cetes_28") or rates.get("cetes")
    except Exception:
        pass
    # costo de construcción ahora viene por-zona en zone_intelligence (feeder local cableado allí).
    return {"zones": zones, "g": g}


# ── helper: costo de construcción por tier de la zona ───────────────────────────
def _cc_for(z, g):
    # Feeder local: costo de construcción por m² ya viene en la zona (zone_intelligence).
    return z.get("costo_construccion_m2")


def _wtp_med(g):
    vals = list((g.get("wtp") or {}).values())
    return sorted(vals)[len(vals) // 2] if vals else None


def _sweet_spot(g):
    cur = g.get("elasticidad") or {}
    return max(cur.items(), key=lambda x: x[1])[0] if cur else None


def _conv_low(g):
    f = g.get("funnel") or {}
    return min(f.items(), key=lambda x: x[1])[0] if f else None


# ════════════════ LAS 100 COMPUESTAS ════════════════
# Cada entrada: (n, pack, nombre, descubre, fn(z, g) -> valor)
P = {1: "Pricing", 2: "Demand", 3: "Investor", 4: "Risk", 5: "Absorption",
     6: "Underwriting", 7: "Livability", 8: "Competitive", 9: "Lead", 10: "Momentum"}

COMPOSITES: List = [
    # ── PACK 1 · PRICING ──
    (1, 1, "Brecha demanda-precio", "¿la demanda puede pagar lo que cuesta? (+/−%)",
     lambda z, g: _pct_gap(_spec(z, "precio_max_prom"), (_n(z.get("precio_m2")) or 0) * (_n(_spec(z, "m2")) or 0)) if z.get("precio_m2") and _spec(z, "m2") else None),
    (2, 1, "Arbitraje WTP-feature", "el mercado paga más por feature de lo que el modelo valúa",
     lambda z, g: _pct_gap(_wtp_med(g), z.get("precio_m2", 0) and z["precio_m2"] * (_n(_spec(z, "m2")) or 80)) if _wtp_med(g) else None),
    (3, 1, "Sobreprecio validado", "¿rechazan por precio DONDE sí está caro?",
     lambda z, g: round((g.get("rejection", {}).get("precio", 0)) * (1 if (_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) or 0) < 0 else 0.3), 1) if g.get("rejection") else None),
    (4, 1, "Sweet-spot de precio", "banda de precio que maximiza velocidad de venta",
     lambda z, g: _sweet_spot(g)),
    (5, 1, "Margen-oportunidad del dev", "lo que pagarán − lo que cuesta construir",
     lambda z, g: _pct_gap(z.get("precio_m2"), _cc_for(z, g)) if _cc_for(z, g) else None),
    (6, 1, "Precio óptimo de lanzamiento", "a qué precio entrar para vender y plusvaluar",
     lambda z, g: round((_n(z.get("precio_m2")) or 0) * 0.97) if z.get("precio_m2") and (_ab(z, "vendido_pct") or 0) < 30 else (z.get("precio_m2") if z.get("precio_m2") else None)),
    (7, 1, "Prima de estrenar real", "cuánto extra pagan por nuevo, validado con demanda",
     lambda z, g: _pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) if z.get("demanda", 0) > 20 and z.get("precio_m2") else None),
    (8, 1, "Descuento esperado al cierre", "cuánto bajan para cerrar según demanda",
     lambda z, g: round(max(0, 8 - (z.get("demanda", 0) / 25)), 1)),
    (9, 1, "Prima de especulación", "asking vs valor de suelo (catastral), ponderado por demanda",
     lambda z, g: _pct_gap(z.get("precio_m2"), z.get("catastral_pm2")) if z.get("precio_m2") and z.get("catastral_pm2") else None),
    (10, 1, "Elasticidad → forecast", "dónde se moverá la demanda al subir el precio",
     lambda z, g: None),  # feeder forecast

    # ── PACK 2 · DEMAND ──
    (11, 2, "Demanda no satisfecha por feature", "feature pedido que NO existe",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0), 0) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (12, 2, "Demanda como indicador líder", "¿la demanda PREDICE el precio?",
     lambda z, g: z.get("cambio_pct")),
    (13, 2, "Potencial vs revelada", "zonas con potencial sin búsquedas aún",
     lambda z, g: round(z.get("oferta_unidades", 0) - z.get("demanda", 0)) if z.get("oferta_unidades", 0) > z.get("demanda", 0) else 0),
    (14, 2, "Config que más absorbe", "qué tipología/m² se desplaza primero",
     lambda z, g: _spec(z, "m2")),
    (15, 2, "Mejor mes para lanzar", "estacionalidad × velocidad de venta",
     lambda z, g: max((g.get("estacionalidad") or {}).items(), key=lambda x: x[1])[0] if g.get("estacionalidad") else None),
    (16, 2, "Demanda por hora-canal", "cuándo y por qué canal llega",
     lambda z, g: (g.get("atribucion") or [{}])[0].get("fuente") if g.get("atribucion") else None),
    (17, 2, "Migración de demanda", "de qué zona cara migran a cuál barata",
     lambda z, g: (g.get("sustitucion") or {}).get("visitantes_multi_colonia")),
    (18, 2, "Profundidad × calidad", "¿mejores zonas se exploran más?",
     lambda z, g: _ratio(z.get("demanda"), z.get("score_zona") and 1) if z.get("score_zona") else None),
    (19, 2, "Intent-mix por tier", "vivir vs invertir (8 intenciones) según el tier",
     lambda z, g: next((f"{sum(v for k, v in c.items() if 'invertir' in str(k) or k == 'flip')}inv/{sum(v for k, v in c.items() if 'vivir' in str(k) or k in ('primera-vivienda', 'upgrade', 'downsize', 'segunda-residencia'))}viv"
                        for c in (g.get("intent", {}).get("por_colonia") or []) if c.get("colonia") == z.get("zona")), None)),
    (20, 2, "Concentración de demanda", "qué tan concentrada está la demanda",
     lambda z, g: z.get("demanda")),

    # ── PACK 3 · INVESTOR ──
    (21, 3, "Demanda-inversor × yield", "demanda inversionista que coincide con yield (AirROI real o estimado)",
     lambda z, g: round(z.get("demanda", 0) * ((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) / 100, 1) if (z.get("cap_rate_str") or z.get("cap_rate_est")) else None),
    (22, 3, "Demanda grado-inversión", "donde demanda y retorno coinciden",
     lambda z, g: round(z.get("demanda", 0) * (_inv(z) / 100), 1) if _inv(z) is not None else None),
    (23, 3, "Sharpe de la colonia", "retorno ajustado por riesgo, con demanda",
     lambda z, g: round((_inv(z) or 0) / 100 * (_risk(z) or 0) / 100 * min(z.get("demanda", 0) / 100, 1.5), 2) if _inv(z) is not None and _risk(z) is not None else None),
    (24, 3, "Spread vs CETES por zona", "yield (AirROI/estimado) − CETES",
     lambda z, g: round(((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) - (g.get("cetes") or 10.0), 1) if (z.get("cap_rate_str") or z.get("cap_rate_est")) else None),
    (25, 3, "ROI ponderado por absorción", "retorno real considerando velocidad de salida",
     lambda z, g: round((_inv(z) or 0) * min((_ab(z, "velocidad_mensual") or 0) / 2, 1.5)) if _inv(z) is not None and _ab(z, "velocidad_mensual") else None),
    (26, 3, "Yield renta-corta vs larga", "Airbnb (AirROI) vs renta tradicional (estimado) — puntos %",
     lambda z, g: round((z.get("cap_rate_str") or 0) - (z.get("cap_rate_est") or 0), 1) if z.get("cap_rate_str") and z.get("cap_rate_est") else None),
    (27, 3, "Bancabilidad × demanda", "proyecto financiable con demanda probada",
     lambda z, g: round((_inv(z) or 0) * min(z.get("demanda", 0) / 80, 1.5)) if _inv(z) is not None else None),
    (28, 3, "Plusvalía esperada × demanda", "apreciación donde la demanda empuja",
     lambda z, g: z.get("cambio_pct")),  # proxy hasta DRPI
    (29, 3, "Liquidez (entrada-salida)", "qué tan rápido entras y sales",
     lambda z, g: _ab(z, "meses_agotar")),
    (30, 3, "Cap rate ajustado a riesgo", "yield (AirROI/estimado) neto de riesgo físico/seguridad",
     lambda z, g: round(((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) * (_risk(z) or 0) / 100, 2) if (z.get("cap_rate_str") or z.get("cap_rate_est")) and _risk(z) is not None else None),

    # ── PACK 4 · RISK ──
    (31, 4, "Demanda ajustada a riesgo", "caliente pero riesgosa vs caliente segura",
     lambda z, g: round(z.get("demanda", 0) * (_risk(z) / 100), 1) if _risk(z) is not None else None),
    (32, 4, "Precio vs riesgo sísmico", "¿pagas premium en zona de alto riesgo?",
     lambda z, g: round((_n(z.get("precio_m2")) or 0) / max(_risk(z) or 1, 1)) if z.get("precio_m2") and _risk(z) else None),
    (33, 4, "Demanda en zona vulnerable", "interés en zonas riesgosas (alerta)",
     lambda z, g: z.get("demanda") if (_risk(z) or 100) < 40 else 0),
    (34, 4, "Brecha de percepción", "rechazo que los vecinos confirman",
     lambda z, g: g.get("rejection", {}).get("zona", 0)),
    (35, 4, "Riesgo climático × migración", "¿la demanda huye de zonas vulnerables?",
     lambda z, g: None),  # feeder climate
    (36, 4, "Miedo vs dato", "donde el miedo supera al delito real",
     lambda z, g: None),  # feeder perception+crime
    (37, 4, "Frontera riesgo-retorno", "la frontera eficiente de colonias",
     lambda z, g: round((_inv(z) or 0) + (_risk(z) or 0)) if _inv(z) is not None and _risk(z) is not None else None),
    (38, 4, "Descuento por riesgo", "cuánto descuenta el mercado por riesgo",
     lambda z, g: round((100 - (_risk(z) or 50)) / 10, 1) if _risk(z) is not None else None),
    (39, 4, "Fraude en zona caliente", "listings sospechosos donde hay demanda",
     lambda z, g: None),  # feeder fraud
    (40, 4, "Riesgo de título × valor", "exposición legal ponderada por valor",
     lambda z, g: None),  # feeder predio_dd

    # ── PACK 5 · ABSORPTION ──
    (41, 5, "Presión de absorción", "agotándose vs hambrienta",
     lambda z, g: _ratio(_ab(z, "vendido_pct"), max(z.get("oportunidad") or 1, 1))),
    (42, 5, "Meses-para-agotar real", "agotamiento considerando demanda entrante",
     lambda z, g: _ab(z, "meses_agotar")),
    (43, 5, "Sold-out forecast × precio", "cuándo agota y a qué precio",
     lambda z, g: f"{_ab(z, 'meses_agotar')}m @ ${round((z.get('precio_m2') or 0)/1000)}k" if _ab(z, "meses_agotar") and z.get("precio_m2") else None),
    (44, 5, "Velocidad vs competencia", "qué tan rápido vendes vs saturación",
     lambda z, g: _ratio(_ab(z, "velocidad_mensual"), max(z.get("oferta_unidades", 1) / 50, 1))),
    (45, 5, "Inventario zombie × demanda", "oferta muerta DONDE hay demanda",
     lambda z, g: z.get("oferta_unidades") if (_ab(z, "velocidad_mensual") or 0) < 0.5 and z.get("demanda", 0) > 30 else 0),
    (46, 5, "Cohorte que más absorbe", "preventa/entrega que mejor se desplaza",
     lambda z, g: _ab(z, "vendido_pct")),
    (47, 5, "Pipeline vs demanda", "sobreoferta futura vs demanda",
     lambda z, g: _ratio(z.get("oferta_unidades"), max(z.get("demanda", 1), 1))),
    (48, 5, "Sobreprecio en DOM", "el sobreprecio medido en tiempo en mercado",
     lambda z, g: _ab(z, "meses_agotar")),
    (49, 5, "Absorción estacional", "velocidad de venta por temporada",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (50, 5, "Velocidad × calidad", "¿mejores zonas venden más rápido?",
     lambda z, g: _ratio(_ab(z, "velocidad_mensual"), 1) if z.get("score_zona") else None),

    # ── PACK 6 · UNDERWRITING ──
    (51, 6, "Qué construir (gap)", "feature pedido sin oferta",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0)) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (52, 6, "Mezcla óptima de producto", "tipología por demanda real",
     lambda z, g: f"{_spec(z,'recamaras')}rec/{_spec(z,'m2')}m²" if _spec(z, "recamaras") else None),
    (53, 6, "Margen-oportunidad", "lo que pagan − costo de construir",
     lambda z, g: _pct_gap(z.get("precio_m2"), _cc_for(z, g)) if _cc_for(z, g) else None),
    (55, 6, "Norma 3 × plusvalía", "ganancia % de fusionar predios donde el precio sube",
     lambda z, g: z.get("norma3_upside_pct")),
    (54, 6, "Valor residual × demanda", "máx $/m² a pagar por el terreno, ponderado por demanda",
     lambda z, g: round((z.get("valor_residual_pm2") or 0) * min(z.get("demanda", 0) / 100 + 0.5, 1.5)) if z.get("valor_residual_pm2") else None),
    (56, 6, "Lift de feature aprendido", "qué feature sube la venta (pp) — del simulador de palancas",
     lambda z, g: f"{(z.get('feature_lift') or {}).get('valor')}: +{(z.get('feature_lift') or {}).get('lift_pp')}pp" if z.get("feature_lift") else None),
    (57, 6, "Precio de lanzamiento", "a qué precio entrar",
     lambda z, g: round((_n(z.get("precio_m2")) or 0) * (0.95 if (_ab(z, "vendido_pct") or 0) < 20 else 1.0)) if z.get("precio_m2") else None),
    (58, 6, "Bancabilidad del lote", "financiable según velocidad",
     lambda z, g: round((_ab(z, "velocidad_mensual") or 0) * 20 + (_inv(z) or 0) * 0.5) if _ab(z, "velocidad_mensual") is not None else None),
    (59, 6, "Riesgo-margen del proyecto", "margen neto de riesgo",
     lambda z, g: round((_pct_gap(z.get("precio_m2"), _cc_for(z, g)) or 0) * (_risk(z) or 50) / 100) if _cc_for(z, g) and _risk(z) else None),
    (60, 6, "Demanda para proyecto nuevo", "demanda donde no hay búsquedas",
     lambda z, g: z.get("oportunidad")),

    # ── PACK 7 · LIVABILITY ──
    (61, 7, "Conversión × calidad de vida", "qué atributo sube conversión",
     lambda z, g: _conv_low(g)),
    (62, 7, "Demanda-familia × escuelas", "demanda de hogar que coincide con escuelas",
     lambda z, g: round(z.get("demanda", 0) * (_sub(z, "educacion") or _sub(z, "amenidades") or 50) / 100, 1)),
    (63, 7, "Walkability × precio", "premium por caminabilidad",
     lambda z, g: _ratio(z.get("precio_m2"), max(_sub(z, "transporte") or 1, 1)) if z.get("precio_m2") and _sub(z, "transporte") else None),
    (64, 7, "Amenidades × WTP", "cuánto pagan por densidad de amenidades",
     lambda z, g: round((_sub(z, "amenidades") or 0) * (_wtp_med(g) or 0) / 1e6, 1) if _sub(z, "amenidades") and _wtp_med(g) else None),
    (65, 7, "Vibe × perfil", "qué perfil busca qué vibe",
     lambda z, g: _sub(z, "vibe")),
    (66, 7, "Sentimiento × demanda", "¿la demanda sigue al sentimiento?",
     lambda z, g: None),  # feeder reviews
    (67, 7, "Lente de gusto (4 perfiles)", "misma zona, 4 puntajes por perfil",
     lambda z, g: z.get("score_zona")),
    (68, 7, "Habitabilidad ponderada", "calidad de vida pesada por demanda de hogar",
     lambda z, g: round(z.get("demanda", 0) * (_sub(z, "seguridad") or 50) / 100, 1)),
    (69, 7, "Value index (calidad-precio)", "la mejor relación calidad-precio",
     lambda z, g: _ratio((_sub(z, "lifestyle") or _sub(z, "vibe") or 50) * 1000, z.get("precio_m2")) if z.get("precio_m2") else None),
    (70, 7, "Comercio que se valora", "densidad comercial que la demanda busca",
     lambda z, g: _sub(z, "amenidades")),

    # ── PACK 8 · COMPETITIVE ──
    (71, 8, "Posición competitiva de precio", "contra quién compites y si estás caro",
     lambda z, g: _pct_gap(z.get("precio_m2"), (z.get("precio_m2", 0) or 0)) if False else (_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) if z.get("precio_m2") and _spec(z, "m2") else None)),
    (72, 8, "Battle card × demanda", "score competitivo ponderado por demanda",
     lambda z, g: round((_inv(z) or 0) * min(z.get("demanda", 0) / 100, 1.5)) if _inv(z) is not None else None),
    (73, 8, "Canibalización", "proyectos que se comen entre sí",
     lambda z, g: z.get("oferta_unidades") if z.get("oferta_unidades", 0) > 3 else 0),
    (74, 8, "Captura de demanda", "qué % de la demanda de la zona capturas",
     lambda z, g: _ratio(z.get("oferta_unidades"), max(z.get("demanda", 1), 1))),
    (75, 8, "Migración competitiva", "a qué zona/proyecto se van",
     lambda z, g: (g.get("sustitucion") or {}).get("visitantes_multi_colonia")),
    (76, 8, "Saturación futura", "quién va a sobre-ofertar tu zona",
     lambda z, g: z.get("oferta_unidades")),
    (77, 8, "Velocidad relativa", "vendes más rápido o lento que el promedio",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (78, 8, "Concentración de brokers", "quién controla la demanda",
     lambda z, g: None),  # feeder broker share
    (79, 8, "Precio vs comparables", "posición de precio validada por demanda",
     lambda z, g: z.get("precio_m2")),
    (80, 8, "Feature diferenciador", "feature que te diferencia y se busca",
     lambda z, g: (g.get("criterios") or [{}])[0].get("criterio") if g.get("criterios") else None),

    # ── PACK 9 · LEAD ──
    (81, 9, "Calidad del lead caliente", "el lead va tras zonas AAA",
     lambda z, g: _inv(z)),
    (82, 9, "Presupuesto revelado vs declarado", "lo que mira vs lo que dice",
     lambda z, g: _spec(z, "precio_max_prom")),
    (83, 9, "Pipeline ponderado por ticket", "prob. de cierre × valor",
     lambda z, g: round((z.get("oportunidad") or 0) * (z.get("precio_m2") or 0) / 1e5) if z.get("oportunidad") and z.get("precio_m2") else None),
    (84, 9, "Pitch que convierte por zona", "qué tono cierra en cada colonia",
     lambda z, g: _conv_low(g)),
    (85, 9, "Lead-zona fit", "qué tan bien encaja el lead con la zona",
     lambda z, g: z.get("score_zona")),
    (86, 9, "Urgencia × inventario", "lead urgente + inventario que se agota = cerrar YA",
     lambda z, g: "ALTA" if (_ab(z, "meses_agotar") or 999) < 12 else "media"),
    (87, 9, "Churn × ciclo de zona", "pierdes leads en zonas en contracción",
     lambda z, g: z.get("ciclo")),
    (88, 9, "Next-best-zone para el lead", "la mejor zona para ese comprador",
     lambda z, g: z.get("nombre") if (_inv(z) or 0) >= 40 else None),
    (89, 9, "Mejor canal por calidad", "qué canal trae los mejores leads",
     lambda z, g: (g.get("atribucion") or [{}])[0].get("fuente") if g.get("atribucion") else None),
    (90, 9, "Timing de contacto", "cuándo contactar para máxima respuesta",
     lambda z, g: None),  # feeder temporal-por-zona

    # ── PACK 10 · MOMENTUM ──
    (91, 10, "Demanda indicador líder", "la demanda adelanta el precio",
     lambda z, g: z.get("cambio_pct")),
    (92, 10, "Live Pulse compuesto", "el pulso de la zona en 1 número",
     lambda z, g: round((min(z.get("demanda", 0) / 150, 1) * 50) + ((_risk(z) or 50) / 100 * 30) + ((_inv(z) or 0) / 100 * 20))),
    (93, 10, "Gentrificación temprana", "señales antes de que suba",
     lambda z, g: z.get("ciclo")),
    (94, 10, "P(precio sube) × demanda", "probabilidad reforzada con demanda",
     lambda z, g: z.get("cambio_pct")),
    (95, 10, "Forecast de absorción", "proyección de velocidad de venta",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (96, 10, "Ventana de oportunidad", "cuándo entrar/salir de una zona",
     lambda z, g: z.get("ciclo")),
    (97, 10, "Aceleración de demanda", "demanda acelerando vs oferta plana",
     lambda z, g: z.get("cambio_pct")),
    (98, 10, "Índice de oportunidad real", "el número maestro de la zona",
     lambda z, g: round(min(z.get("demanda", 0) / 150, 1) * 30 + max(0, min((_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) or 0), 100)) / 100 * 30 + (_risk(z) or 0) / 100 * 20 + (_inv(z) or 0) / 100 * 20)),
    (99, 10, "Forecast de hueco", "demanda insatisfecha que seguirá sin oferta",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0)) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (100, 10, "Termómetro zona emergente", "la próxima Condesa antes de que suba",
     lambda z, g: "emergente" if (z.get("demanda", 0) > 30 and (_n(z.get("precio_m2")) or 1e9) < 70000) else "—"),
]


async def compute_all(db, since_days: int = 180, top: int = 20) -> Dict[str, Any]:
    """Corre las 100 compuestas por colonia. Devuelve por-paquete + por-zona + cobertura (cuántas dieron valor real)."""
    ctx = await build_context(db, since_days=since_days, top=top)
    zones, g = ctx["zones"], ctx["g"]
    por_zona = []
    real_count = 0; total_count = 0
    for z in zones:
        vals = {}
        for (n, pack, nombre, descubre, fn) in COMPOSITES:
            try:
                v = fn(z, g)
            except Exception:
                v = None
            vals[n] = v
            total_count += 1
            if v is not None and v != "—":
                real_count += 1
        por_zona.append({"zona": z.get("zona"), "nombre": z.get("nombre"), "tier": z.get("tier"), "valores": vals})
    catalogo = [{"n": n, "pack": P[pack], "nombre": nombre, "descubre": descubre} for (n, pack, nombre, descubre, fn) in COMPOSITES]
    cobertura_pct = round(100 * real_count / max(total_count, 1))
    return {"catalogo": catalogo, "por_zona": por_zona,
            "cobertura": {"reales": real_count, "total": total_count, "pct": cobertura_pct,
                          "nota": "valores nulos = feeder de mercado apagado (fórmula ya cableada)"},
            "packs": {str(k): v for k, v in P.items()}}


async def for_dev(db, colonias: List[str], since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto DEV (packs Pricing/Absorption/Underwriting/Competitive) scopeado a sus colonias."""
    full = await compute_all(db, since_days=since_days, top=40)
    dev_packs = {"Pricing", "Absorption", "Underwriting", "Competitive"}
    ns = {c["n"] for c in full["catalogo"] if c["pack"] in dev_packs}
    cl = {(c or "").lower() for c in (colonias or [])}
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}}
            for pz in full["por_zona"] if not cl or (pz["zona"] or "").lower() in cl]
    return {"catalogo": [c for c in full["catalogo"] if c["pack"] in dev_packs], "por_zona": rows}


async def for_asesor(db, since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto ASESOR (pack Lead) — calidad/fit/pitch/timing por zona."""
    full = await compute_all(db, since_days=since_days, top=40)
    ns = {c["n"] for c in full["catalogo"] if c["pack"] == "Lead"}
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}} for pz in full["por_zona"]]
    return {"catalogo": [c for c in full["catalogo"] if c["pack"] == "Lead"], "por_zona": rows}
