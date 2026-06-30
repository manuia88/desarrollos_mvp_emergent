"""ENGINES BATCH · DEMANDA / COMPRADOR (eje QUIÉN) — tanda 5 del engine hub.

Registra los motores de DEMANDA y COMPORTAMIENTO del comprador como Indicadores hiper-segmentados.
Cada motor declara un runner `_r_<id>(db, ctx)` + su descriptor (qué campos de su salida importan, con nombre
humano y uso). El hub (engines_hub.py / engine_present.py) mergea REGISTRO y DESCRIPTORES de este módulo.

PREFERENCIA: motores que AGREGAN por zona/colonia/global (gemelo de demanda, grafo del comprador, tendencias de
comportamiento, churn, ánimo, journey, hooks). Los que exigen un visitor_id/lead_id concreto se corren con un
representativo de la zona o un id de mejor esfuerzo (devuelven salida vacía-pero-válida = latente, nunca crashean).

ctx esperado: {colonia_id, dev_id?, _dev?, _unit?}. El hub enriquece _dev/_unit desde DEVELOPMENTS_BY_ID.
Todos los runners son fail-soft a nivel del propio motor; el hub además captura cualquier excepción.
"""
from typing import Any, Dict, Optional


# ── helpers ───────────────────────────────────────────────────────────────────
def _dev(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """El desarrollo representativo de la zona (lo pone el hub; fallback por colonia)."""
    d = ctx.get("_dev")
    if d:
        return d
    try:
        from data_developments import DEVELOPMENTS
        cid = ctx.get("colonia_id")
        return next((x for x in DEVELOPMENTS if x.get("colonia_id") == cid), {}) or {}
    except Exception:  # noqa: BLE001
        return {}


def _unit(ctx: Dict[str, Any]) -> Dict[str, Any]:
    u = ctx.get("_unit")
    if u:
        return u
    d = _dev(ctx)
    us = d.get("units") or []
    return us[0] if us else {}


def _tenant(ctx: Dict[str, Any]) -> str:
    """Tenant/inmobiliaria representativo de la zona para las stats agregadas (journey)."""
    d = _dev(ctx)
    return d.get("developer_id") or d.get("tenant_id") or "default"


async def _a_visitor_id(db) -> Optional[str]:
    """Un visitor_id real con señales (mejor esfuerzo) para perfilar gusto. None si no hay."""
    try:
        doc = await db.buyer_signals.find_one(
            {"visitor_id": {"$ne": None}}, {"_id": 0, "visitor_id": 1})
        return (doc or {}).get("visitor_id")
    except Exception:  # noqa: BLE001
        return None


async def _an_owner_id(db) -> str:
    """Un owner_id (asesor) real para la inteligencia agregada de prospectos. Default si no hay."""
    try:
        doc = await db.asesor_taste_profile.find_one({}, {"_id": 0, "owner_id": 1})
        if doc and doc.get("owner_id"):
            return doc["owner_id"]
    except Exception:  # noqa: BLE001
        pass
    return "default"


async def _a_user_id(db) -> str:
    """Un user_id real (con eventos) para el score del comprador. Default si no hay."""
    try:
        doc = await db.behavioral_events.find_one(
            {"user_id": {"$ne": None}}, {"_id": 0, "user_id": 1})
        if doc and doc.get("user_id"):
            return doc["user_id"]
    except Exception:  # noqa: BLE001
        pass
    return "default"


# ── runners (1 por motor) ──────────────────────────────────────────────────────
async def _r_dem_demand_twin(db, ctx):
    import demand_twin_engine as e
    return await e.build_demand_twin(db, limit=60)


async def _r_dem_grafo_comprador(db, ctx):
    import grafo_comprador_engine as e
    # colonia_id=None → grafo de todo el mercado (vista superadmin); con colonia → vista de la zona
    return await e.build_grafo(db, colonia_id=ctx.get("colonia_id"), dias=90)


async def _r_dem_behavioral(db, ctx):
    import behavioral_tracking_engine as e
    # agregado global por feature/página (sin filtrar por org, sin ventana → todo el histórico TTL)
    return await e.aggregate_by_feature(db, org_id=None, since=None)


async def _r_dem_churn(db, ctx):
    import churn_prediction_engine as e
    # usuarios fríos (riesgo de churn) — agregado global, ordenado por score
    return await e.detect_cold_users(db, threshold_score=60)


async def _r_dem_mood(db, ctx):
    import mood_engine as e
    # ánimo "neutral" como sonda → match de propiedades por afinidad de vibra (agregado sobre developments)
    vector = {d: 0.5 for d in e.DIMENSIONS}
    return await e.match_properties(db, vector, limit=8)


async def _r_dem_buyer_score(db, ctx):
    import buyer_score_engine as e
    uid = await _a_user_id(db)
    return await e.compute_user_score(db, uid)


async def _r_dem_hook(db, ctx):
    import hook_predictor_engine as e
    # sonda con un gancho de marketing fijo dirigido al comprador → calidad del hook (heurística si no hay LLM)
    return await e.predict_hook_score(
        db, "Estrena tu departamento en preventa con plusvalía garantizada — agenda hoy.",
        target_audience="comprador")


async def _r_dem_taste_intel(db, ctx):
    import taste_profile as e
    owner = await _an_owner_id(db)
    return await e.build_prospect_intel(db, owner)


async def _r_dem_visitor_taste(db, ctx):
    import visitor_taste as e
    vid = await _a_visitor_id(db) or ctx.get("visitor_id") or ""
    # None si no hay señal suficiente (latente, sin indicadores) — nunca crashea
    return (await e.build_visitor_taste(db, vid)) or {"sin_senal": True}


async def _r_dem_preferencias(db, ctx):
    import preferencias_engine as e
    # deseabilidad de la unidad representativa de la zona (estudio 4S, a igual precio)
    return await e.score_deseabilidad(db, _unit(ctx), _dev(ctx))


async def _r_dem_fit_leads(db, ctx):
    import fit_engine as e
    # top leads para el desarrollo representativo de la zona (match comprador↔propiedad)
    pid = ctx.get("dev_id") or (_dev(ctx).get("id"))
    return await e.top_leads_for_property(db, pid or "", limit=5)


async def _r_dem_journey(db, ctx):
    import lead_journey_engine as e
    # embudo del comprador (captura→cierre) del tenant representativo de la zona
    return await e.journey_stats(db, _tenant(ctx), period_days=90)


async def _r_dem_reverse_search(db, ctx):
    import reverse_search_engine as e
    # consulta fija en lenguaje natural → ranking de desarrollos que la cumplen
    text = "2 recamaras polanco con terraza"
    parsed = await e.parse_query(text)
    return await e.search(db, parsed, limit=6, original_text=text)


async def _r_dem_captacion(db, ctx):
    import captacion_value_engine as e
    # valor estimado de reventa de una unidad típica de la zona (insumo del captador del asesor)
    d = _dev(ctx)
    u = _unit(ctx)
    colonia = {"price_m2_num": None}
    try:
        from data_developments import dev_price_m2
        pm2 = dev_price_m2(d)
        if pm2:
            colonia["price_m2_num"] = pm2
    except Exception:  # noqa: BLE001
        pass
    attrs = {
        "m2": u.get("m2_privative") or u.get("m2_total") or 90,
        "recamaras": u.get("bedrooms"),
        "banos": u.get("bathrooms"),
        "n_amenidades": len(d.get("amenities") or []),
    }
    return e.estimate_resale_value(colonia, attrs)


# ── REGISTRO ────────────────────────────────────────────────────────────────────
REGISTRO = [
    {"id": "dem_demand_twin", "nombre": "Gemelo de demanda — dónde conviene construir", "eje": "QUIÉN", "tanda": 5,
     "produce": "ranking de colonias por OPORTUNIDAD (mucha demanda · poca oferta · con hueco)", "input": [],
     "fn": _r_dem_demand_twin, "fuente": "demand_twin_engine"},
    {"id": "dem_grafo_comprador", "nombre": "Grafo del comprador — qué quiere la demanda", "eje": "QUIÉN", "tanda": 5,
     "produce": "por colonia × etapa de vida, el producto típico que pide la demanda revelada", "input": ["colonia_id"],
     "fn": _r_dem_grafo_comprador, "fuente": "grafo_comprador_engine"},
    {"id": "dem_behavioral", "nombre": "Tendencias de comportamiento (uso de features)", "eje": "QUIÉN", "tanda": 5,
     "produce": "qué features/páginas usa más la demanda (señal agregada de interés)", "input": [],
     "fn": _r_dem_behavioral, "fuente": "behavioral_tracking_engine"},
    {"id": "dem_churn", "nombre": "Compradores en riesgo de enfriarse (churn)", "eje": "QUIÉN", "tanda": 5,
     "produce": "usuarios fríos con riesgo de churn (a quién recontactar ya)", "input": [],
     "fn": _r_dem_churn, "fuente": "churn_prediction_engine"},
    {"id": "dem_mood", "nombre": "Ánimo / vibra — match de propiedades", "eje": "QUIÉN", "tanda": 5,
     "produce": "propiedades rankeadas por afinidad de vibra con un ánimo de referencia", "input": [],
     "fn": _r_dem_mood, "fuente": "mood_engine"},
    {"id": "dem_buyer_score", "nombre": "Score del comprador (temperatura)", "eje": "QUIÉN", "tanda": 5,
     "produce": "score 0-100 + tier (hot/warm/cold) de un comprador a partir de su comportamiento", "input": [],
     "fn": _r_dem_buyer_score, "fuente": "buyer_score_engine"},
    {"id": "dem_hook", "nombre": "Predictor de gancho (hook) de marketing", "eje": "QUIÉN", "tanda": 5,
     "produce": "qué tan bueno es un copy de gancho para enganchar al comprador (4 dimensiones)", "input": [],
     "fn": _r_dem_hook, "fuente": "hook_predictor_engine"},
    {"id": "dem_taste_intel", "nombre": "Inteligencia de gusto agregada (prospectos)", "eje": "QUIÉN", "tanda": 5,
     "produce": "en qué se fija la demanda (cuartos/features), qué rechaza y qué convierte mejor", "input": [],
     "fn": _r_dem_taste_intel, "fuente": "taste_profile"},
    {"id": "dem_visitor_taste", "nombre": "Perfil de gusto del visitante", "eje": "QUIÉN", "tanda": 5,
     "produce": "el gusto granular de un visitante (cuartos/features/zonas que prefiere y evita)", "input": [],
     "fn": _r_dem_visitor_taste, "fuente": "visitor_taste"},
    {"id": "dem_preferencias", "nombre": "Deseabilidad de la unidad (estudio 4S)", "eje": "QUIÉN", "tanda": 5,
     "produce": "qué tan deseable es una unidad cuando hay varias al mismo precio (céntrica/vista/privacidad/amenidades/lujo)",
     "input": ["colonia_id"], "fn": _r_dem_preferencias, "fuente": "preferencias_engine"},
    {"id": "dem_fit_leads", "nombre": "Mejores compradores para el proyecto (fit)", "eje": "QUIÉN", "tanda": 5,
     "produce": "leads rankeados por encaje (fit) con el desarrollo representativo de la zona", "input": ["colonia_id"],
     "fn": _r_dem_fit_leads, "fuente": "fit_engine"},
    {"id": "dem_journey", "nombre": "Embudo del comprador (journey)", "eje": "QUIÉN", "tanda": 5,
     "produce": "conversión, pasos al cierre y dónde se cae la demanda en el embudo", "input": ["colonia_id"],
     "fn": _r_dem_journey, "fuente": "lead_journey_engine"},
    {"id": "dem_reverse_search", "nombre": "Búsqueda inversa (consulta en lenguaje natural)", "eje": "QUIÉN", "tanda": 5,
     "produce": "qué desarrollos cumplen una búsqueda típica del comprador ('2 recámaras Polanco con terraza')", "input": [],
     "fn": _r_dem_reverse_search, "fuente": "reverse_search_engine"},
    {"id": "dem_captacion_valor", "nombre": "Valor de reventa estimado (captación)", "eje": "QUIÉN", "tanda": 5,
     "produce": "valor de mercado estimado de una unidad típica de la zona (insumo del captador del asesor)",
     "input": ["colonia_id"], "fn": _r_dem_captacion, "fuente": "captacion_value_engine"},
]


# ── DESCRIPTORES ──────────────────────────────────────────────────────────────
DESCRIPTORES = {
    "dem_demand_twin": {"es_lista": True, "nombre_total": "Colonias con demanda modelada",
                        "uso_total": "Cuántas colonias tienen demanda modelada en el gemelo.", "items": [
        {"k": "colonia", "nombre": "Colonia #1 en oportunidad", "uso": "La zona donde más conviene construir (más demanda, menos oferta)."},
        {"k": "oportunidad", "nombre": "Score de oportunidad (#1)", "uso": "Cuánto destaca: alta demanda con hueco y poca oferta.", "unidad": "índice"},
        {"k": "demanda_total", "nombre": "Demanda total (#1)", "uso": "Búsquedas + interés de compradores en la zona líder.", "unidad": "señales"},
        {"k": "oferta_devs", "nombre": "Oferta competidora (#1)", "uso": "Cuántos desarrollos ya compiten en la zona líder.", "unidad": "devs"},
        {"k": "falta", "nombre": "Hueco de oferta (#1)", "uso": "Qué buscaron y NO encontraron — la cuña del proyecto."},
    ]},
    "dem_grafo_comprador": {"items": [
        {"k": "muestra", "nombre": "Búsquedas en el grafo", "uso": "Tamaño de la demanda revelada que alimenta el grafo.", "unidad": "búsquedas"},
        {"k": "es_estimado", "nombre": "¿Estimado?", "uso": "Transparencia: si aún hay pocas búsquedas reales."},
        {"k": "ventana_dias", "nombre": "Ventana de análisis", "uso": "Periodo de la demanda observada.", "unidad": "días"},
        {"k": "k_anonimato", "nombre": "K-anonimato", "uso": "Mínimo de búsquedas para mostrar producto (privacidad).", "unidad": "mín"},
        {"k": "lectura", "nombre": "Lectura del grafo", "uso": "Qué dice la demanda, en lenguaje simple."},
    ]},
    "dem_behavioral": {"items": [
        {"k": "top_3_features", "nombre": "Top features usadas", "uso": "Qué partes de la plataforma atraen más a la demanda."},
        {"k": "by_feature", "nombre": "Features con uso", "uso": "Cuántas features registran interacción (señal de interés agregado)."},
        {"k": "by_page", "nombre": "Páginas con tráfico", "uso": "Dónde se concentra la atención del comprador."},
    ]},
    "dem_churn": {"es_lista": True, "nombre_total": "Compradores en riesgo de enfriarse",
                  "uso_total": "Cuántos compradores muestran riesgo de churn (a quién recontactar).", "items": [
        {"k": "churn_risk_score", "nombre": "Riesgo de churn (#1)", "uso": "Qué tan rápido se está enfriando el comprador más en riesgo.", "unidad": "0-100"},
        {"k": "recommendation", "nombre": "Acción recomendada (#1)", "uso": "Qué hacer para retener al comprador en riesgo."},
        {"k": "last_active_at", "nombre": "Última actividad (#1)", "uso": "Hace cuánto que no interactúa."},
    ]},
    "dem_mood": {"es_lista": True, "nombre_total": "Propiedades rankeadas por vibra",
                 "uso_total": "Cuántas propiedades se rankearon por afinidad de ánimo.", "items": [
        {"k": "property_title", "nombre": "Propiedad #1 por vibra", "uso": "La que más encaja con el ánimo de referencia."},
        {"k": "affinity_pct", "nombre": "Afinidad de vibra (#1)", "uso": "Qué tanto coincide el ánimo del comprador con la propiedad.", "unidad": "%"},
        {"k": "vibe_phrase", "nombre": "Frase de vibra (#1)", "uso": "Por qué encaja, en lenguaje del comprador."},
    ]},
    "dem_buyer_score": {"items": [
        {"k": "score", "nombre": "Score del comprador", "uso": "Temperatura del comprador a partir de su comportamiento.", "unidad": "0-100"},
        {"k": "tier", "nombre": "Tier del comprador", "uso": "Hot/warm/cold: prioridad de atención comercial."},
        {"k": "components.behavioral_pct", "nombre": "Componente comportamiento", "uso": "Cuánto pesa su actividad en el score.", "unidad": "%"},
        {"k": "components.favoritos_pct", "nombre": "Componente favoritos", "uso": "Cuánto pesan sus favoritos guardados.", "unidad": "%"},
    ]},
    "dem_hook": {"items": [
        {"k": "score", "nombre": "Score del gancho", "uso": "Qué tan bueno es el copy para enganchar al comprador.", "unidad": "0-100"},
        {"k": "breakdown.clarity", "nombre": "Claridad", "uso": "Qué tan claro se entiende el mensaje.", "unidad": "0-100"},
        {"k": "breakdown.cta", "nombre": "Llamado a la acción (CTA)", "uso": "Qué tan fuerte invita a actuar.", "unidad": "0-100"},
        {"k": "breakdown.urgency", "nombre": "Urgencia", "uso": "Qué tanto empuja a decidir ahora.", "unidad": "0-100"},
        {"k": "suggestion", "nombre": "Sugerencia de mejora", "uso": "Cómo subir el gancho del copy."},
    ]},
    "dem_taste_intel": {"items": [
        {"k": "signal_leads", "nombre": "Prospectos con señal", "uso": "Sobre cuántos compradores se construye la inteligencia de gusto.", "unidad": "prospectos"},
        {"k": "insights", "nombre": "Insights del gusto", "uso": "En qué se fija la demanda y qué rechaza (lenguaje llano)."},
        {"k": "top_features", "nombre": "Features que más gustan", "uso": "Qué atributos enamoran a la demanda — guía producto y copy."},
        {"k": "totals.likes", "nombre": "Likes totales", "uso": "Volumen de propiedades que gustaron.", "unidad": "likes"},
        {"k": "reject_reasons", "nombre": "Razones de rechazo", "uso": "Por qué descartan — qué corregir en oferta/argumentario."},
    ]},
    "dem_visitor_taste": {"items": [
        {"k": "resumen", "nombre": "Resumen del gusto", "uso": "Qué le gusta y qué evita al visitante, en una frase."},
        {"k": "confianza", "nombre": "Confianza del perfil", "uso": "Qué tan seguro es el gusto inferido (más señal = más confianza).", "unidad": "0-100"},
        {"k": "n_gustadas", "nombre": "Propiedades que le gustaron", "uso": "Cuántas marcó como gustadas (base del perfil).", "unidad": "props"},
        {"k": "zonas_gustan", "nombre": "Zonas que prefiere", "uso": "Dónde quiere vivir el visitante."},
        {"k": "evita", "nombre": "Lo que evita", "uso": "Atributos que lo repelen — no ofrecérselos."},
    ]},
    "dem_preferencias": {"items": [
        {"k": "deseabilidad", "nombre": "Deseabilidad de la unidad", "uso": "Qué tan deseable es cuando hay varias al mismo precio.", "unidad": "0-100"},
        {"k": "etiqueta", "nombre": "Nivel de deseabilidad", "uso": "Lectura simple: muy deseable / promedio / poco diferenciada."},
        {"k": "lo_que_la_hace_deseable", "nombre": "Lo que la hace deseable", "uso": "Sus ejes fuertes — los argumentos de venta."},
        {"k": "lo_que_le_falta", "nombre": "Lo que le falta", "uso": "Ejes débiles — qué compensar en precio o pitch."},
    ]},
    "dem_fit_leads": {"items": [
        {"k": "leads", "nombre": "Leads con encaje", "uso": "Cuántos compradores hacen match con el proyecto de la zona.", "unidad": "leads"},
    ]},
    "dem_journey": {"items": [
        {"k": "total_leads", "nombre": "Compradores en el embudo", "uso": "Volumen de demanda en el periodo.", "unidad": "leads"},
        {"k": "conversion_rate", "nombre": "Tasa de conversión", "uso": "% de cierres ganados sobre cerrados — salud comercial.", "unidad": "%"},
        {"k": "avg_steps_to_close", "nombre": "Pasos promedio al cierre", "uso": "Qué tan largo es el camino a comprar.", "unidad": "pasos"},
        {"k": "drop_off_step", "nombre": "Paso donde más se caen", "uso": "El cuello de botella del embudo — dónde intervenir."},
    ]},
    "dem_reverse_search": {"es_lista": True, "nombre_total": "Desarrollos que cumplen la búsqueda",
                           "uso_total": "Cuántos desarrollos cumplen una búsqueda típica del comprador.", "items": [
        {"k": "title", "nombre": "Mejor match de la búsqueda", "uso": "El desarrollo que más cumple lo que pidió el comprador."},
        {"k": "match_score", "nombre": "Match score (#1)", "uso": "Qué tan bien cumple el criterio buscado.", "unidad": "0-100"},
        {"k": "explanation", "nombre": "Por qué hace match (#1)", "uso": "El argumento de por qué encaja, para el comprador."},
        {"k": "colonia", "nombre": "Colonia del match (#1)", "uso": "Dónde está el mejor resultado."},
    ]},
    "dem_captacion_valor": {"items": [
        {"k": "valor", "nombre": "Valor de reventa estimado", "uso": "Cuánto vale una unidad típica de la zona (al captar).", "unidad": "MXN"},
        {"k": "pm2_estimado", "nombre": "Precio por m² estimado", "uso": "Referencia de reventa por m².", "unidad": "$/m²"},
        {"k": "fuente", "nombre": "Fuente del estimado", "uso": "Reventa real de la zona vs mercado general (transparencia)."},
        {"k": "lectura", "nombre": "Lectura del valor", "uso": "El estimado explicado en lenguaje simple."},
    ]},
}
