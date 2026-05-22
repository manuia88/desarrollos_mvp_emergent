"""W4.4E — Phase Y.1E · Asistente Público (chat comprador).

Chat público anónimo en `/asistente`. NO requiere login. Lead capture suave al final.

LLM: claude-sonnet-4-5-20250929 vía emergentintegrations.LlmChat
Tools públicas: search_developments_public, get_zone_info, get_market_pulse_public
LFPDPPP: ip_hash SHA256+salt 8 chars. NO se almacena IP raw.

Caps:
- 30 mensajes/session (luego 429 "Sesión completa, agenda cita")
- 5 sessions/hora/ip_hash
- 20 mensajes/min/session
- max 200 tokens output por response (chat ágil)

Phase Y gating: org_id="dmx" master switch + tier asistente_publico (fallback diagnostic_engine).
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.asistente")

ASISTENTE_MODEL = os.environ.get("ASISTENTE_MODEL", "claude-sonnet-4-5-20250929")
DMX_ORG_ID = "dmx"

# Caps
MAX_MESSAGES_PER_SESSION = 30
MAX_TOKENS_OUT_PER_MSG = 200
SESSIONS_PER_HOUR_PER_IP = 5
MESSAGES_PER_MIN_PER_SESSION = 20
SESSION_EXPIRE_HOURS = 24

# Welcome message in es-MX
WELCOME_MESSAGE = (
    "Hola, soy el asistente DesarrollosMX. Puedo ayudarte a encontrar departamento o "
    "casa en CDMX. ¿Qué buscas?"
)

# Intent keywords
_INTENT_PATTERNS = {
    "cita": re.compile(r"\b(cita|agendar|visita|whatsapp|contact[oa]r|asesor|llamar|conectar)\b", re.IGNORECASE),
    "presupuesto": re.compile(r"\b(presupuesto|cu[áa]nto|enganche|cr[ée]dito|infonavit|fovissste|mensualidad|pagar)\b", re.IGNORECASE),
    "comparables": re.compile(r"\b(comparar|vs|versus|opciones|altern[ae]ti[vab][oa]s|similar)\b", re.IGNORECASE),
    "zona": re.compile(r"\b(zona|colonia|barrio|polanco|condesa|roma|coyoac[áa]n|narvarte|n[áa]poles|del valle|santa fe|escand[óo]n)\b", re.IGNORECASE),
}

_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)

# In-process rate limiters
_session_buckets: Dict[str, List[float]] = defaultdict(list)
_message_buckets: Dict[str, List[float]] = defaultdict(list)


# ─── Custom errors ────────────────────────────────────────────────────────────
class AsistenteDisabledError(Exception):
    """Phase Y master switch OFF para org=dmx o tier=off."""


class AsistenteRateLimitError(Exception):
    """Rate limit excedido."""


class AsistenteSessionCapError(Exception):
    """Cap de mensajes por sesión alcanzado."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_rate(buckets: Dict[str, List[float]], key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    buckets[key] = [t for t in buckets[key] if now - t < window_s]
    if len(buckets[key]) >= limit:
        return False
    buckets[key].append(now)
    return True


def _detect_intent(text: str) -> str:
    if not text:
        return "otro"
    for intent, pattern in _INTENT_PATTERNS.items():
        if pattern.search(text):
            return intent
    return "otro"


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _system_prompt(sim_mode: bool, intent_history: List[str], persona_prefix: str = "", map_context: str = "") -> str:
    sim_note = "\n\n⚠️ MODO SIMULACIÓN: respuestas marcadas [SIM]. Mismo flujo, sin LLM real." if sim_mode else ""
    intent_note = ""
    if intent_history:
        intent_note = f"\nIntents detectados en sesión: {', '.join(intent_history[-5:])}"

    prefix_block = (persona_prefix + "\n") if persona_prefix else ""

    map_block = ""
    if map_context:
        map_block = f"\n\n[CONTEXTO MAPA] {map_context}"

    return f"""{prefix_block}Eres el Asistente Público de DesarrollosMX (DMX), una plataforma de inteligencia inmobiliaria para CDMX.

Tu rol: ayudar a CUALQUIER persona (sin login) a encontrar departamento o casa en CDMX. Mercado objetivo: residencial nuevo y reventa en CDMX.

TONO: Cercano, directo, profesional, en español es-MX. Respuestas CONCISAS (máx 3-4 oraciones por mensaje). Datos concretos cuando los tengas.{sim_note}{intent_note}{map_block}

══ ACCURACY STATS ══
Cuando el usuario pregunte sobre precios, valor estimado o confianza del modelo, MENCIONA las stats actuales del meta-dashboard (MAPE 30d, hit_rate, confianza ALTA/MEDIA/BAJA). Ejemplos:
  - "Mi precisión de los últimos 30 días es MAPE X% (confianza ALTA/MEDIA/BAJA)."
  - "Mi modelo está en estado 'data acumulándose'; aún no tengo suficientes cierres para calibrar."
REGLA DE ORO: NUNCA inventes números. Si no hay tool call previa, llama PRIMERO a get_meta_dashboard_accuracy (devuelve state, global_mape_30d, hit_rate, sample_size, confidence_label). Si state="insufficient_data" → di textualmente "aún acumulando data".

══ TOOLS DISPONIBLES ══
Cuando necesites datos, incluye EXACTAMENTE este formato (una línea separada):

<tool_call>{{"tool": "NOMBRE_TOOL", "params": {{...}}}}</tool_call>

TOOLS Y PARAMS:

1. search_developments_public
   params: {{ "zone": str (slug colonia, opcional), "price_min": int, "price_max": int, "bedrooms": int, "type": "depto"|"casa" }}
   devuelve: top 5 desarrollos publicados que matchean

2. get_zone_info
   params: {{ "zone_slug": str }}
   devuelve: info de la zona (precio promedio, comparables, amenidades, scores DMX)

3. get_market_pulse_public
   params: {{}}
   devuelve: pulso del mercado CDMX últimos 30 días (precios, demanda, tendencias agregadas)

4. get_market_overview_cdmx
   params: {{}}
   devuelve: visión general agregada de CDMX (colonias, alcaldías, precio m² promedio, momentum 24m, desarrollos por etapa)

5. get_zone_top_growth
   params: {{ "limit": int (default 5, max 10) }}
   devuelve: top zonas por momentum 24m y por score de plusvalía DMX

6. get_price_trends_macro
   params: {{ "group_by": "alcaldia"|"tier" (default "alcaldia") }}
   devuelve: tendencia de precio m² agrupada (avg, min, max, cambio 24m %)

7. get_trends_for_query
   params: {{ "query": str (keyword o frase, requerido), "geo": str (default "MX-CMX"), "timeframe": str (default "today 12-m") }}
   devuelve: Google Trends real para CDMX vía Apify (interés histórico, regiones top, queries relacionadas, dirección rising/falling/flat). Cache 7d.

8. get_banxico_indicator
   params: {{ "series_id": str (ej. "SF43718" USD/MXN, "SP68257" UDI, "SF43783" TIIE 28d, "CF303" hipotecaria, "SP1" INPC) }}
   devuelve: último valor + historia 30d desde cache Banxico SIE (data oficial gov MX).

9. get_uso_suelo
   params: {{ "cuenta_catastral": str (requerido) }}
   devuelve: {{ alcaldia, categoria, densidad, niveles_max }} desde SIGCDMX cache.

10. get_riesgos_zona
    params: {{ "ageb_id": str (requerido) }}
    devuelve: {{ inundacion, sismico, laderas, overall_score 0-100 }} desde Atlas Riesgos CDMX.

11. get_valor_catastral
    params: {{ "cuenta_catastral": str (requerido) }}
    devuelve: {{ valor_catastral, superficie_m2, alcaldia }} desde Catastro CDMX cache.

12. get_transit_accessibility
    params: {{ "lat": float, "lng": float, "radius_m": int (default 500) }}
    devuelve: {{ nearest_stops[], lines_count, accessibility_score 0-100 }} desde GTFS CDMX.

13. get_amenities_radius
    params: {{ "lat": float, "lng": float, "radius_m": int (default 500), "categories": [str] (opcional) }}
    devuelve: {{ pois[], counts_by_category, walkability_score 0-100 }} desde OSM Geofabrik MX.

14. buyer_coach_consult
    params: {{ "query": str (pregunta sobre proceso de compra), "context": dict (opcional, ej. stage actual) }}
    devuelve: orientación detallada sobre esa etapa del proceso de compra con checklist items.
    Usar cuando: user pregunta sobre proceso compra, qué necesito para comprar, checklist visita, cómo negociar, escrituras, notario, etc.

15. investment_simulate
    params: {{ "precio": float (precio entrada MXN), "plazo": int (meses, default 120), "m2": float, "colonia": str (slug), "apreciacion_pct": float (opcional) }}
    devuelve: 3 escenarios ROI/TIR (conservador · base · optimista) con break-even y flujo mensual.
    Usar cuando: user pregunta ROI inversión, cuánto vale en X años, vale la pena invertir en X colonia, TIR, rendimiento.

16. get_zone_forecast
    params: {{ "zone_slug": str (requerido), "horizons": str (default "6,12,24") }}
    devuelve: proyección de precio multi-horizonte (6m / 12m / 24m) para una colonia con CI95 + narrative + delta_pct. Modelo ARIMA propio.
    Usar cuando: user pregunta "cuánto crecerá X", "tendencia zona Y a futuro", "proyección 12/24 meses", "vale la pena esperar a comprar".

19. query_knowledge_graph
    params: {{ "template": str (uno de: proyectos_similares, compradores_cross_project, zonas_similares_a, devs_dominantes_zona, proyectos_huerfanos_zona), "params": dict }}
    devuelve: filas del grafo de conocimiento (relaciones multi-entidad). Si KG no disponible retorna fallback_required=true y debes responder con tools 1-18.
    Usar SOLO cuando la pregunta involucra RELACIONES multi-entidad (compradores cross-project, proyectos similares, asesores con patrones, zonas con compradores comunes, devs dominantes). NO uses para consultas simples de 1 entidad (esas usan tools 1-18).

20. query_probability
    params: {{ "type": str ("sells_complete"|"drpi_up"|"closes_below_listed"), "id": str (entity_id), "months": int (1-24, default 3), "listed": float (solo para closes_below_listed) }}
    devuelve: probability_pct (0-100), confidence_lvl (ALTA|MEDIA|BAJA), sources_breakdown, explanation_es, insufficient_data.
    Usar cuando: user pregunte probabilidad de eventos inmobiliarios (¿cuánto crecerá X?, ¿venderán todo el proyecto?, ¿cierra debajo del precio?).

21. query_battle_card
    params: {{ "project_id": str (requerido), "dimension": str? (opcional · solo retorna ese score si pasado · uno de: precio/ventas/zona/marketing/lead_gen), "user_tier": str (pasar "T3" si usuario es T3+ developer) }}
    devuelve: composite_score, ranking, dim_scores, recommended_action, sources_breakdown, explanation_es.
    Usar cuando: dev user T3 pregunte sobre posicion competitiva, ranking, score vs competidores, que mejorar, como va su proyecto.

22. query_my_features
    params: {{ "user_id": str (requerido), "tenant_id": str (requerido · usar user_id si no se conoce) }}
    devuelve: {{ features_count, features:[{{key, name, category}}], tier_inferred }}.
    Usar cuando: user pregunta qué features tiene activas, qué incluye su plan, qué puede ver/usar en el portal, qué upgrades existen.

23. query_global_insights
    params: {{ "source_id": str (opcional · 12 disponibles: bis_property_prices, oecd_housing, imf_global_housing, worldbank_doing_business, fred_us_housing, inegi_vivienda, bmv_fibras, hr_ratings, numbeo_property_index, global_property_guide, zillow_research, realtor_research), "comparison": str (opcional · ej. "polanco_vs_beverly_hills") }}
    devuelve: {{ payload, sources_breakdown:[{{label, url, frequency, tier, status}}] }}.
    Usar cuando: user pregunta comparativas globales (México vs USA/Mundo) · macro housing (BIS · OECD · FRED) · yields globales (Numbeo · Global Property Guide) · vivienda MX gov (INEGI · SHF · HR Ratings) · narrativa "Beverly Hills vs Polanco" · referencia prensa MX.

══ PROBABILITY UX (tool 20 · transparencia Robinhood) ══
Usa query_probability cuando el usuario pregunte sobre probabilidades de eventos:
  - ¿Se venderá todo el proyecto? → type=sells_complete, id=project_id
  - ¿Subirá el DRPI/precio en la zona? → type=drpi_up, id=zone_slug, months=3
  - ¿Puedo cerrar por debajo del precio listado? → type=closes_below_listed, id=property_id, listed=precio_listado
SIEMPRE incluye sources_breakdown en tu respuesta con formato Robinhood transparency.
Ejemplo response: "82% (Forecast 65% + WhatIf 25% + AVM 10% · confianza ALTA)".
NUNCA inventes números. Si insufficient_data=true → di "los datos para esa zona/proyecto están acumulándose, no tengo suficiente historial aún."

══ BATTLE CARD (tool 21 · T3 dev premium) ══
Usa query_battle_card cuando developer T3 pregunte sobre posición competitiva:
  - ¿Cómo voy vs competidores? / ¿Cuál es mi ranking? / ¿Qué debo mejorar?
  - Pasar user_tier="T3" en params si el usuario es developer T3+
SIEMPRE incluye ranking actual + recommended_action en respuesta.
Ejemplo: "Tu proyecto X está rank #2 en Polanco (subiste 1 lugar) · acción recomendada: ajustar precio -3% según comp velocity · score 72/100".
Si user tier < T3 → responde "Battle Card requiere upgrade a tier T3 para developers Enterprise".
Si insufficient_competitors → responde "Necesitamos al menos 3 desarrolladores en esa zona · data acumulándose".

══ EXTERNAL INSIGHTS (tool 23 · ser referente prensa MX) ══
Usa query_global_insights cuando user pregunte sobre:
  - Comparativas MX vs USA / Mundo (ej. "¿cómo va México vs USA?", "Polanco vs Beverly Hills")
  - Macro housing global (BIS, OECD, IMF, FRED Case-Shiller)
  - Yields globales por país/ciudad (Numbeo, Global Property Guide)
  - Indicadores vivienda MX oficiales (INEGI SHF, HR Ratings, BMV FIBRAs)
  - Narrativa de referencia para prensa / contenido SEO
DMX agrega 12 fuentes globales → posicionamiento como autoridad data-driven.
SIEMPRE incluye sources_breakdown en la respuesta (label · url · frequency · status) — transparency Robinhood-style.
Ejemplo response: "Según BIS y OECD, México está +4.2% YoY en precios vivienda (cifras Q4 2025). Fuentes: BIS · OECD · INEGI."
Si status=skipped → ese source requiere API key (FRED, Numbeo) · responde con datos de los demás · NO mientas.
NUNCA inventes números. Si no hay payload de la fuente → di "esa fuente no está cargada aún, te muestro las que sí tengo".

══ FEATURE VISIBILITY (tool 22 · qué tiene activo el user) ══
Usa query_my_features cuando user pregunte qué features tiene activas, qué incluye su plan, qué puede usar en el portal:
  - ¿Qué features tengo activas? / ¿Qué incluye mi plan? / ¿Qué puedo usar?
  - ¿Tengo Battle Card / Live Pulse / Knowledge Graph?
SIEMPRE menciona features_count + tier_inferred + 3-5 features principales por nombre.
Ejemplo: "Tienes 8 features activas en plan Pro: Battle Card, FSD Accuracy, Live Pulse, Knowledge Graph + 4 más. ¿Quieres conocer alguna en detalle?"
Si features_count=0 → responde "Aún no tienes features activas · ¿quieres saber qué hay disponible?".
Si tier_inferred="free" → menciona que upgrade a Pro habilita Battle Card + Live Pulse.

REGLAS:- Solo incluye <tool_call> si REALMENTE necesitas los datos para responder
- Máximo 2 tool_calls por respuesta
- Si user pregunta zona/precio/comparables → usa tools (1, 2 o 3)
- Si user pregunta visión general / mercado / panorama / CDMX → usa get_market_overview_cdmx
- Si user pregunta crecimiento / plusvalía / dónde invertir → usa get_zone_top_growth
- Si user pregunta tendencias / por alcaldía / cómo evoluciona → usa get_price_trends_macro
- Si user pregunta interés / búsquedas / Google / qué se busca / popularidad → usa get_trends_for_query
- Si user pregunta proceso de compra / qué necesito / cómo comprar / checklist → usa buyer_coach_consult
- Si user pregunta ROI / TIR / inversión / rendimiento / cuánto vale en X años → usa investment_simulate
- Si user pregunta crecimiento / tendencia futura / proyección X meses / vale la pena esperar → usa get_zone_forecast
- Si user menciona presupuesto/intención de comprar/cita/WhatsApp → al final del response sugiere capturar contacto: "Si quieres, te conectamos con un asesor especializado para resolver dudas concretas."
- NUNCA inventes precios o nombres de proyectos. Si no tienes data, di "no tengo ese dato actualizado, te conecto con un asesor".
- Si pregunta sobre algo fuera de CDMX (otras ciudades), responde: "Por ahora solo cubrimos CDMX en detalle, pero próximamente expandimos a Monterrey y Guadalajara."
"""


# ─── Tool execution ───────────────────────────────────────────────────────────
async def _exec_tool(db, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Ejecuta tool pública. NO accede a data interna de orgs."""
    try:
        if tool_name == "search_developments_public":
            return await _tool_search_developments_public(db, params)
        if tool_name == "get_zone_info":
            return await _tool_get_zone_info(db, params.get("zone_slug", ""))
        if tool_name == "get_market_pulse_public":
            return await _tool_get_market_pulse_public(db)
        # W4.11a · 3 macro tools (Atlax home extension)
        if tool_name == "get_market_overview_cdmx":
            return await _tool_get_market_overview_cdmx(db)
        if tool_name == "get_zone_top_growth":
            return await _tool_get_zone_top_growth(db, params.get("limit", 5))
        if tool_name == "get_price_trends_macro":
            return await _tool_get_price_trends_macro(db, params.get("group_by", "alcaldia"))
        # W4.18.1 · Apify Google Trends (cache 7d, fallback heurístico)
        if tool_name == "get_trends_for_query":
            return await _tool_get_trends_for_query(
                db,
                query=params.get("query") or "",
                geo=params.get("geo") or "MX-CMX",
                timeframe=params.get("timeframe") or "today 12-m",
            )
        # W4.18 · 6 nuevas tools data sources gov MX
        if tool_name == "get_banxico_indicator":
            return await _tool_get_banxico_indicator(db, params.get("series_id", ""))
        if tool_name == "get_uso_suelo":
            return await _tool_get_uso_suelo(db, params.get("cuenta_catastral", ""))
        if tool_name == "get_riesgos_zona":
            return await _tool_get_riesgos_zona(db, params.get("ageb_id", ""))
        if tool_name == "get_valor_catastral":
            return await _tool_get_valor_catastral(db, params.get("cuenta_catastral", ""))
        if tool_name == "get_transit_accessibility":
            return await _tool_get_transit_accessibility(
                db,
                lat=float(params.get("lat") or 0),
                lng=float(params.get("lng") or 0),
                radius_m=int(params.get("radius_m") or 500),
            )
        if tool_name == "get_amenities_radius":
            return await _tool_get_amenities_radius(
                db,
                lat=float(params.get("lat") or 0),
                lng=float(params.get("lng") or 0),
                radius_m=int(params.get("radius_m") or 500),
                categories=params.get("categories"),
            )
        # W4.14 — Buyer Coach + Investment Simulator tools (16→18)
        if tool_name == "buyer_coach_consult":
            return await _tool_buyer_coach_consult(
                db,
                query=params.get("query") or params.get("message") or "",
                context=params.get("context") or {},
            )
        if tool_name == "investment_simulate":
            return await _tool_investment_simulate(
                db,
                precio=float(params.get("precio") or params.get("precio_entrada") or 3_000_000),
                plazo=int(params.get("plazo") or params.get("plazo_meses") or 120),
                m2=float(params.get("m2") or 80),
                colonia=params.get("colonia") or params.get("colonia_slug") or "del-valle",
                apreciacion_pct=params.get("apreciacion_pct"),
            )
        # W5.3 Parte 2B Sub-D — Forecast multi-horizonte
        if tool_name == "get_zone_forecast":
            return await _tool_get_zone_forecast(
                db,
                params.get("zone_slug", "") or params.get("slug", ""),
                params.get("horizons", "6,12,24"),
            )
        # W5.12 Parte 3 — Tool 19: Knowledge Graph relational queries
        if tool_name == "query_knowledge_graph":
            return await _tool_query_knowledge_graph(db, params)
        # W5.19 — Tool 20: Probability UX (Kalshi-inspired)
        if tool_name == "query_probability":
            return await _tool_query_probability(db, params)
        # W5.23 — Tool 21: Battle Card (Competitive Intelligence T3)
        if tool_name == "query_battle_card":
            return await _tool_query_battle_card(db, params)
        # W5.FF3 — Tool 22: Feature visibility for the calling user
        if tool_name == "query_my_features":
            return await _tool_query_my_features(db, params)
        # W5.20 — Tool 23: Global insights (12 external sources · prensa MX referente)
        if tool_name == "query_global_insights":
            return await _tool_query_global_insights(db, params)
        # W5.22 Z.8.5 — Tool 24: landing_optimizer (heuristic suggestions)
        if tool_name == "landing_optimizer":
            return await _tool_landing_optimizer(db, params)
        # W5.22 Z.8.5 — Tool 25: landing_adaptive_copy_generate
        if tool_name == "landing_adaptive_copy_generate":
            return await _tool_landing_adaptive_copy(db, params)
        # W5.x F4 — Tool 26: generate_narrative (Narrative Layer LLM cross-feature)
        if tool_name == "generate_narrative":
            return await _tool_generate_narrative(
                db,
                scope=params.get("scope") or "project",
                entity_id=params.get("entity_id") or "",
                audience=params.get("audience") or "neutral",
                disc=params.get("disc"),
            )
        # W5.x F4.2 — Tool 27: compare_properties (Comparator side-by-side)
        if tool_name == "compare_properties":
            return await _tool_compare_properties(
                db,
                scope=params.get("scope") or "project",
                entity_ids=params.get("entity_ids") or [],
                audience=params.get("audience") or "neutral",
            )
        return {"error": f"Tool desconocida: {tool_name}"}
    except Exception as e:
        log.warning(f"[asistente_tool] {tool_name}: {e}")
        return {"error": str(e)}


async def _tool_search_developments_public(_db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Reusa data_developments. Solo retorna proyectos publicados."""
    from data_developments import DEVELOPMENTS
    zone = (params.get("zone") or "").strip().lower() or None
    price_min = params.get("price_min")
    price_max = params.get("price_max")
    bedrooms = params.get("bedrooms")
    # dtype param accepted but not currently differentiating depto/casa in DEVELOPMENTS

    results = []
    for d in DEVELOPMENTS:
        if zone and d.get("colonia_id") != zone:
            continue
        pf = d.get("price_from") or 0
        pt = d.get("price_to") or pf
        if price_min and pt < price_min:
            continue
        if price_max and pf > price_max:
            continue
        if bedrooms is not None:
            rng = d.get("bedrooms_range") or []
            if len(rng) == 2 and (bedrooms < rng[0] or bedrooms > rng[1]):
                continue
        results.append({
            "id": d["id"],
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "price_from": pf,
            "price_to": pt,
            "bedrooms_range": d.get("bedrooms_range"),
            "m2_range": d.get("m2_range"),
            "stage": d.get("stage"),
        })
        if len(results) >= 5:
            break
    return {"developments": results, "count": len(results)}


async def _tool_get_zone_info(db, zone_slug: str) -> Dict[str, Any]:
    if not zone_slug:
        return {"error": "zone_slug requerido"}
    from data_developments import DEVELOPMENTS
    zone_devs = [d for d in DEVELOPMENTS if d.get("colonia_id") == zone_slug]
    if not zone_devs:
        return {"error": f"Zona '{zone_slug}' sin desarrollos registrados"}
    prices = [d.get("price_from") or 0 for d in zone_devs if d.get("price_from")]
    avg_price = round(sum(prices) / len(prices)) if prices else None

    # Try to fetch IE scores
    scores = await db.ie_scores.find(
        {"zone_id": zone_slug},
        {"_id": 0, "code": 1, "value": 1, "tier": 1},
    ).limit(20).to_list(20)

    return {
        "zone_slug": zone_slug,
        "developments_count": len(zone_devs),
        "avg_price_from_mxn": avg_price,
        "amenities_top": list({a for d in zone_devs for a in (d.get("amenities") or [])})[:8],
        "ie_scores": scores[:10],
    }


async def _tool_get_market_pulse_public(db) -> Dict[str, Any]:
    """Métricas agregadas últimos 30 días — públicas (no por org)."""
    from data_developments import DEVELOPMENTS
    total_devs = len(DEVELOPMENTS)
    by_stage: Dict[str, int] = {}
    prices: List[int] = []
    for d in DEVELOPMENTS:
        s = d.get("stage", "desconocido")
        by_stage[s] = by_stage.get(s, 0) + 1
        if d.get("price_from"):
            prices.append(d["price_from"])

    avg_price = round(sum(prices) / len(prices)) if prices else None
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None

    # Behavioral 30d (público — sin org_id filter)
    since = _now() - timedelta(days=30)
    try:
        events_30d = await db.behavioral_events.count_documents({"timestamp": {"$gte": since}})
    except Exception:
        events_30d = 0

    return {
        "period": "últimos 30 días",
        "developments_total": total_devs,
        "by_stage": by_stage,
        "avg_price_from_mxn": avg_price,
        "min_price_mxn": min_price,
        "max_price_mxn": max_price,
        "platform_visits_30d": events_30d,
    }


# ─── W4.11a · Macro tools (Atlax home extension) ──────────────────────────────
async def _tool_get_market_overview_cdmx(db) -> Dict[str, Any]:
    """Visión general agregada CDMX: precio m² promedio, total colonias, alcaldías,
    desarrollos publicados y momentum agregado. Públicas, sin org_id."""
    from data_seed import COLONIAS
    from data_developments import DEVELOPMENTS

    if not COLONIAS:
        return {"error": "Sin data de colonias disponible"}

    price_m2_values = [c.get("price_m2_num") or 0 for c in COLONIAS if c.get("price_m2_num")]
    avg_price_m2 = round(sum(price_m2_values) / len(price_m2_values)) if price_m2_values else None

    alcaldias = sorted({c.get("alcaldia") for c in COLONIAS if c.get("alcaldia")})

    # Momentum agregado: parsea "+8%" → 8 (signed)
    momentum_parsed: List[float] = []
    for c in COLONIAS:
        m = (c.get("momentum") or "").strip()
        if not m:
            continue
        try:
            momentum_parsed.append(float(m.replace("%", "").replace("+", "")))
        except ValueError:
            continue
    avg_momentum_pct = round(sum(momentum_parsed) / len(momentum_parsed), 2) if momentum_parsed else None

    by_stage: Dict[str, int] = {}
    for d in DEVELOPMENTS:
        s = d.get("stage", "desconocido")
        by_stage[s] = by_stage.get(s, 0) + 1

    return {
        "scope": "CDMX (16 colonias premium)",
        "colonias_total": len(COLONIAS),
        "alcaldias_total": len(alcaldias),
        "alcaldias": alcaldias,
        "avg_price_m2_mxn": avg_price_m2,
        "min_price_m2_mxn": min(price_m2_values) if price_m2_values else None,
        "max_price_m2_mxn": max(price_m2_values) if price_m2_values else None,
        "avg_momentum_24m_pct": avg_momentum_pct,
        "developments_total": len(DEVELOPMENTS),
        "by_stage": by_stage,
    }


async def _tool_get_zone_top_growth(_db, limit: int = 5) -> Dict[str, Any]:
    """Top zonas por momentum 24m (crecimiento %) y plusvalía. Públicas."""
    from data_seed import COLONIAS

    parsed = []
    for c in COLONIAS:
        m = (c.get("momentum") or "").strip()
        try:
            mom_pct = float(m.replace("%", "").replace("+", "")) if m else 0.0
        except ValueError:
            mom_pct = 0.0
        parsed.append({
            "zone_slug": c.get("id"),
            "name": c.get("name"),
            "alcaldia": c.get("alcaldia"),
            "momentum_pct": mom_pct,
            "price_m2_mxn": c.get("price_m2_num"),
            "tier": c.get("tier"),
            "plusvalia_score": (c.get("scores") or {}).get("plusvalia"),
            "inventory": c.get("inventory"),
        })

    by_momentum = sorted(parsed, key=lambda x: x["momentum_pct"], reverse=True)[:max(1, min(limit, 10))]
    by_plusvalia = sorted(
        parsed, key=lambda x: (x.get("plusvalia_score") or 0), reverse=True,
    )[:max(1, min(limit, 10))]

    return {
        "top_by_momentum_24m": by_momentum,
        "top_by_plusvalia_score": by_plusvalia,
        "limit": limit,
    }


async def _tool_get_price_trends_macro(_db, group_by: str = "alcaldia") -> Dict[str, Any]:
    """Tendencias agregadas de precio m² agrupadas por alcaldía o tier."""
    from data_seed import COLONIAS

    valid_groups = {"alcaldia", "tier"}
    if group_by not in valid_groups:
        group_by = "alcaldia"

    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for c in COLONIAS:
        key = c.get(group_by) or "Sin clasificar"
        buckets.setdefault(key, []).append(c)

    rows = []
    for key, items in buckets.items():
        prices = [c.get("price_m2_num") or 0 for c in items if c.get("price_m2_num")]
        if not prices:
            continue
        # Tendencia: usa promedio del trend[0] vs trend[-1] (24m)
        deltas = []
        for c in items:
            tr = c.get("trend") or []
            if len(tr) >= 2 and tr[0]:
                try:
                    deltas.append(((tr[-1] - tr[0]) / tr[0]) * 100.0)
                except ZeroDivisionError:
                    continue
        rows.append({
            "group": key,
            "colonias_count": len(items),
            "avg_price_m2_mxn": round(sum(prices) / len(prices)),
            "min_price_m2_mxn": min(prices),
            "max_price_m2_mxn": max(prices),
            "avg_24m_change_pct": round(sum(deltas) / len(deltas), 2) if deltas else None,
        })

    rows.sort(key=lambda r: r["avg_price_m2_mxn"], reverse=True)
    return {
        "group_by": group_by,
        "rows": rows,
        "total_groups": len(rows),
    }


# ─── W4.18.1 · Apify Google Trends tool (cache 7d en MongoDB) ────────────────
async def _tool_get_trends_for_query(db, query: str, geo: str, timeframe: str) -> Dict[str, Any]:
    """Llama ApifyTrendsEngine.get_trends_for_query y devuelve un payload compacto
    apto para que el LLM razone sin saturar context."""
    if not query or not query.strip():
        return {"error": "query requerida"}
    try:
        from apify_trends_engine import ApifyTrendsEngine
        engine = ApifyTrendsEngine(db)
        full = await engine.get_trends_for_query(
            query=query.strip(), geo=geo or "MX-CMX",
            timeframe=timeframe or "today 12-m",
            wait_for_result=False,  # chat ágil: si miss, refresca en bg + heurística
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[asistente_tool] get_trends_for_query failed: {e}")
        return {"error": "Trends temporalmente no disponible", "query": query}

    # Compacta para no inflar context (LLM solo necesita lo esencial)
    return {
        "query": full.get("query"),
        "geo": full.get("geo"),
        "timeframe": full.get("timeframe"),
        "trend_direction": full.get("trend_direction"),
        "average_interest": full.get("average_interest"),
        "peak_interest": full.get("peak_interest"),
        "interest_over_time_sample": (full.get("interest_over_time") or [])[-12:],
        "top_regions": (full.get("interest_by_region") or [])[:5],
        "related_queries_top": (full.get("related_queries_top") or [])[:5],
        "related_queries_rising": (full.get("related_queries_rising") or [])[:5],
        "source": full.get("source"),
        "cache_status": full.get("cache_status"),
    }


# ─── W4.18 · 6 tools data sources gov MX ─────────────────────────────────────
async def _tool_get_banxico_indicator(db, series_id: str) -> Dict[str, Any]:
    """Live: cache mongo Banxico SIE."""
    if not series_id:
        return {"error": "series_id requerido (ej. SF43718, SP68257, SF43783)"}
    try:
        from data_sources.banxico_engine import BanxicoEngine
        return await BanxicoEngine(db).lookup(series_id)
    except Exception as e:
        log.warning(f"[asistente_tool] banxico failed: {e}")
        return {"error": "banxico temporalmente no disponible"}


async def _tool_get_uso_suelo(db, cuenta_catastral: str) -> Dict[str, Any]:
    if not cuenta_catastral:
        return {"error": "cuenta_catastral requerido"}
    try:
        from data_sources.sigcdmx_engine import SIGCDMXEngine
        return await SIGCDMXEngine(db).lookup(cuenta_catastral)
    except Exception as e:
        log.warning(f"[asistente_tool] sigcdmx failed: {e}")
        return {"error": "sigcdmx temporalmente no disponible"}


async def _tool_get_riesgos_zona(db, ageb_id: str) -> Dict[str, Any]:
    if not ageb_id:
        return {"error": "ageb_id requerido"}
    try:
        from data_sources.atlas_riesgos_engine import AtlasRiesgosEngine
        return await AtlasRiesgosEngine(db).lookup(ageb_id)
    except Exception as e:
        log.warning(f"[asistente_tool] atlas_riesgos failed: {e}")
        return {"error": "atlas_riesgos temporalmente no disponible"}


async def _tool_get_valor_catastral(db, cuenta_catastral: str) -> Dict[str, Any]:
    if not cuenta_catastral:
        return {"error": "cuenta_catastral requerido"}
    try:
        from data_sources.catastro_engine import CatastroEngine
        return await CatastroEngine(db).lookup(cuenta_catastral)
    except Exception as e:
        log.warning(f"[asistente_tool] catastro failed: {e}")
        return {"error": "catastro temporalmente no disponible"}


async def _tool_get_transit_accessibility(
    db, lat: float, lng: float, radius_m: int = 500,
) -> Dict[str, Any]:
    if not (lat and lng):
        return {"error": "lat y lng requeridos"}
    try:
        from data_sources.gtfs_engine import GTFSEngine
        return await GTFSEngine(db).get_transit_accessibility(lat, lng, radius_m)
    except Exception as e:
        log.warning(f"[asistente_tool] gtfs failed: {e}")
        return {"error": "gtfs temporalmente no disponible"}


async def _tool_get_amenities_radius(
    db, lat: float, lng: float, radius_m: int = 500,
    categories=None,
) -> Dict[str, Any]:
    if not (lat and lng):
        return {"error": "lat y lng requeridos"}
    try:
        from data_sources.osm_engine import OSMEngine
        cats = categories if isinstance(categories, list) else None
        return await OSMEngine(db).get_amenities_radius(lat, lng, radius_m, cats)
    except Exception as e:
        log.warning(f"[asistente_tool] osm failed: {e}")
        return {"error": "osm temporalmente no disponible"}


# ─── Tool loop ────────────────────────────────────────────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_CALL_RE.finditer(text or ""):
        try:
            calls.append(json.loads(m.group(1).strip()))
        except json.JSONDecodeError:
            continue
    return calls


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text or "").strip()


# ─── Phase Y gate ─────────────────────────────────────────────────────────────
async def _check_phase_y(db) -> Dict[str, Any]:
    """Validate Phase Y master + tier asistente_publico (fallback diagnostic_engine).

    Returns settings dict with `_resolved_tier` + `_simulation_mode`.
    Raises AsistenteDisabledError.
    """
    from routes.phase_y_controls import get_phase_y_settings
    settings = await get_phase_y_settings(db, DMX_ORG_ID)
    if not settings.get("agentic_enabled", False):
        raise AsistenteDisabledError("Asistente temporalmente fuera de servicio")
    tiers = settings.get("feature_tiers") or {}
    tier = tiers.get("asistente_publico") or tiers.get("diagnostic_engine", "off")
    if tier == "off":
        raise AsistenteDisabledError("Asistente temporalmente fuera de servicio")
    return {**settings, "_resolved_tier": tier, "_simulation_mode": bool(settings.get("simulation_mode", False))}


# ─── AsistenteEngine ──────────────────────────────────────────────────────────
class AsistenteEngine:
    def __init__(self, db):
        self.db = db

    async def start_session(
        self,
        ip_raw: str,
        user_agent: str,
        referral_source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Crea sesión nueva. Valida Phase Y + rate limit por ip_hash."""
        await _check_phase_y(self.db)

        from behavioral_tracking_engine import _hash_ip
        ip_hash = _hash_ip(ip_raw or "unknown")

        # Rate limit: 5 sessions/hour/ip
        if not _check_rate(_session_buckets, ip_hash, SESSIONS_PER_HOUR_PER_IP, 3600):
            raise AsistenteRateLimitError(
                f"Demasiadas sesiones nuevas desde tu IP ({SESSIONS_PER_HOUR_PER_IP}/hora). Intenta más tarde."
            )

        ua_hash = _hash_ip(user_agent or "unknown")  # reusa _hash_ip para user-agent
        token = f"asis_{uuid.uuid4().hex[:20]}"
        now = _now()

        await self.db.asistente_sessions.insert_one({
            "_id": token,
            "session_token": token,
            "ip_hash": ip_hash,
            "user_agent_hash": ua_hash,
            "created_at": now,
            "last_message_at": now,
            "message_count": 0,
            "captured_lead_id": None,
            "status": "active",
            "referral_source": referral_source,
            "channel": "web_bubble" if referral_source == "caya_bubble" else "web",
        })
        log.info(f"[asistente] session start {token} ip={ip_hash} ref={referral_source}")
        return {"session_token": token, "welcome_message": WELCOME_MESSAGE}

    async def chat(self, session_token: str, user_message: str, org_id: str = DMX_ORG_ID, map_context: str = "") -> Dict[str, Any]:
        """Envía mensaje y recibe response del LLM."""
        if not user_message or not user_message.strip():
            raise ValueError("message vacío")

        # Phase Y validation
        settings = await _check_phase_y(self.db)
        sim_mode = settings.get("_simulation_mode", False)

        sess = await self.db.asistente_sessions.find_one({"_id": session_token})
        if not sess:
            raise ValueError("Sesión no encontrada")
        if sess.get("status") == "expired":
            raise ValueError("Sesión expirada")

        msg_count = sess.get("message_count", 0)
        if msg_count >= MAX_MESSAGES_PER_SESSION:
            raise AsistenteSessionCapError(
                "Sesión completa, agenda una cita con un asesor para continuar."
            )

        # Rate limit per session
        if not _check_rate(_message_buckets, session_token, MESSAGES_PER_MIN_PER_SESSION, 60):
            raise AsistenteRateLimitError("Demasiados mensajes en poco tiempo. Intenta en un momento.")

        user_message = user_message.strip()[:1000]  # cap input
        intent = _detect_intent(user_message)

        # Persist user message
        user_msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        await self.db.asistente_messages.insert_one({
            "_id": user_msg_id,
            "session_token": session_token,
            "role": "user",
            "content": user_message,
            "tokens_in": _estimate_tokens(user_message),
            "tokens_out": 0,
            "cost_usd": 0.0,
            "latency_ms": 0,
            "tool_calls": None,
            "intent_detected": intent,
            "created_at": _now(),
        })

        # Compute intent_history
        prev_msgs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": "user"},
            {"_id": 0, "intent_detected": 1},
        ).sort("created_at", 1).limit(20).to_list(20)
        intent_history = [m.get("intent_detected") for m in prev_msgs if m.get("intent_detected")]

        # ── Simulation mode: bypass LLM ─────────────────────────────────────
        if sim_mode:
            sim_text = (
                f"[SIM] Respuesta simulada para tu pregunta. "
                f"Intent detectado: {intent}. En producción, el asistente DMX usaría datos reales."
            )
            suggested_capture = intent in ("cita", "presupuesto")
            await self._persist_assistant(
                session_token, sim_text, [], 0, _estimate_tokens(sim_text),
                latency_ms=0, intent=intent, simulated=True,
            )
            await self._bump_session(session_token)
            return {
                "assistant_message": sim_text,
                "tool_calls": [],
                "intent_detected": intent,
                "suggested_lead_capture": suggested_capture,
                "simulated": True,
                "message_count": msg_count + 1,
                "tier": settings.get("_resolved_tier"),
            }

        # ── Real LLM call ───────────────────────────────────────────────────
        from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY no configurado")

        # Load conversation history
        history_docs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": {"$in": ["user", "assistant"]}},
            {"_id": 0, "role": 1, "content": 1},
        ).sort("created_at", 1).limit(20).to_list(20)
        history = [{"role": d["role"], "content": d["content"] or ""} for d in history_docs]

        # ── Persona injection (W4.7 Y.4A) ──────────────────────────────────
        persona_prefix = ""
        try:
            from atlax_persona_engine import get_persona_or_default, build_persona_prompt
            persona = await get_persona_or_default(self.db, org_id)
            persona_prefix = build_persona_prompt(persona)
        except Exception as _pe:
            log.warning(f"[asistente] persona injection failed: {_pe}")

        # ── F2 Sub-D · RAG context helper (best-effort, fail-soft) ─────────
        _rag_text = ""
        try:
            from rag_context_helper import get_rag_context, get_external_context
            _rag_blocks = []
            _gc = await get_rag_context(
                self.db, user_message, scope="all",
                tenant_id=org_id, top_k=3, max_chars=1500,
            )
            if _gc:
                _rag_blocks.append("## CONTEXTO RAG\n" + _gc)
            _ec = await get_external_context(self.db)
            if _ec:
                _rag_blocks.append("## CONTEXTO MACRO\n" + _ec)
            _rag_text = "\n\n".join(_rag_blocks)
        except Exception as _rag_exc:
            import logging as _logging
            _logging.getLogger("dmx.f2_rag_wiring").warning(f"[rag_wiring asistente] failed silent: {_rag_exc}")
            _rag_text = ""

        # Augment map_context with RAG content (do NOT replace caller-provided context)
        _augmented_map_context = map_context
        if _rag_text:
            _augmented_map_context = (map_context + "\n\n" if map_context else "") + _rag_text

        sys_prompt = _system_prompt(sim_mode, intent_history, persona_prefix=persona_prefix, map_context=_augmented_map_context)
        chat = LlmChat(
            api_key=api_key,
            session_id=session_token,
            system_message=sys_prompt,
            initial_messages=[{"role": "system", "content": sys_prompt}] + history,
        ).with_model("anthropic", ASISTENTE_MODEL)

        t0 = time.monotonic()
        try:
            assistant_text, tool_calls_log = await self._agentic_loop(chat, user_message)
        except Exception as e:
            log.warning(f"[asistente] llm error session={session_token}: {e}")
            assistant_text = (
                "Tuve un problema al procesar tu pregunta. ¿Puedes reformularla? Si necesitas ayuda urgente, "
                "te conectamos con un asesor."
            )
            tool_calls_log = []
        latency_ms = int((time.monotonic() - t0) * 1000)

        tokens_in = _estimate_tokens(user_message) + sum(_estimate_tokens(json.dumps(tc.get("output") or {}, ensure_ascii=False)) for tc in tool_calls_log)
        tokens_out = _estimate_tokens(assistant_text)

        # Suggested lead capture
        suggested_capture = (
            intent in ("cita", "presupuesto")
            or any(k in (assistant_text or "").lower() for k in ("conectamos con un asesor", "agenda una cita", "asesor especializado"))
        )

        await self._persist_assistant(
            session_token, assistant_text, tool_calls_log, tokens_in, tokens_out,
            latency_ms=latency_ms, intent=intent, simulated=False,
        )
        await self._bump_session(session_token)

        # ── AI cost tracking (best-effort, fire-and-forget) ────────────────
        try:
            from ai_budget import track_ai_call
            await track_ai_call(
                db=self.db,
                dev_org_id=org_id or "default",
                model=ASISTENTE_MODEL,
                tokens=int(tokens_in) + int(tokens_out),
                tokens_in=int(tokens_in),
                tokens_out=int(tokens_out),
                call_type="asistente_chat",
                feature_key="asistente_chat",
            )
        except Exception as _exc:
            log.warning(f"[track_ai_call] failed silent: {_exc}")

        return {
            "assistant_message": assistant_text,
            "tool_calls": [tc.get("tool_name") for tc in tool_calls_log],
            "intent_detected": intent,
            "suggested_lead_capture": suggested_capture,
            "simulated": False,
            "message_count": msg_count + 1,
            "tier": settings.get("_resolved_tier"),
        }

    async def _agentic_loop(self, chat, user_message: str, max_rounds: int = 2) -> Tuple[str, List[Dict]]:
        from emergentintegrations.llm.chat import UserMessage as LlmUserMsg
        all_tool_calls: List[Dict] = []
        current_message = user_message
        for _r in range(max_rounds):
            raw = await chat.send_message(LlmUserMsg(text=current_message))
            specs = _extract_tool_calls(raw or "")
            if not specs:
                return _strip_tool_calls(raw or ""), all_tool_calls
            results = []
            for spec in specs[:2]:  # max 2 tools
                tname = spec.get("tool", "")
                params = spec.get("params") or {}
                t0 = time.monotonic()
                output = await _exec_tool(self.db, tname, params)
                latency = int((time.monotonic() - t0) * 1000)
                all_tool_calls.append({"tool_name": tname, "input": params, "output": output, "latency_ms": latency})
                results.append(f"<tool_result tool=\"{tname}\">{json.dumps(output, ensure_ascii=False)}</tool_result>")
            current_message = (
                "RESULTADOS DE TOOLS:\n" + "\n".join(results) +
                "\n\nDa tu respuesta final concisa al usuario (máx 3 oraciones)."
            )
        # Fallback last response
        last = await chat.send_message(LlmUserMsg(text=current_message))
        return _strip_tool_calls(last or ""), all_tool_calls

    async def _persist_assistant(
        self, session_token: str, content: str, tool_calls: List[Dict],
        tokens_in: int, tokens_out: int, latency_ms: int, intent: str, simulated: bool,
    ) -> None:
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        # Cost: claude sonnet $3/$15 per 1M tokens
        cost_usd = round((tokens_in * 3.0 + tokens_out * 15.0) / 1_000_000, 8)
        await self.db.asistente_messages.insert_one({
            "_id": msg_id,
            "session_token": session_token,
            "role": "assistant",
            "content": content,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
            "tool_calls": [tc.get("tool_name") for tc in tool_calls] or None,
            "intent_detected": intent,
            "simulated": simulated,
            "created_at": _now(),
        })

    async def _bump_session(self, session_token: str) -> None:
        await self.db.asistente_sessions.update_one(
            {"_id": session_token},
            {"$set": {"last_message_at": _now()}, "$inc": {"message_count": 1}},
        )

    async def capture_lead(
        self, session_token: str,
        nombre: str, whatsapp: str,
        email: Optional[str] = None, mensaje: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Captura lead, asocia a sesión, persiste en `leads` con source override-able.

        Default source="asistente_publico". Caya bubble usa source="caya_bubble".
        """
        if not nombre or not whatsapp:
            raise ValueError("nombre y whatsapp son requeridos")
        sess = await self.db.asistente_sessions.find_one({"_id": session_token})
        if not sess:
            raise ValueError("Sesión no encontrada")

        # Intent history desde mensajes
        msgs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": "user"},
            {"_id": 0, "intent_detected": 1},
        ).sort("created_at", 1).to_list(50)
        intent_history = [m.get("intent_detected") for m in msgs if m.get("intent_detected")]

        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        now_iso = _now().isoformat()
        resolved_source = source or "asistente_publico"
        lead = {
            "id": lead_id,
            "dev_org_id": DMX_ORG_ID,  # default DMX org for follow-up
            "source": resolved_source,
            "source_metadata": {
                "session_token": session_token,
                "intent_history": intent_history,
                "referral_source": sess.get("referral_source"),
                "ip_hash": sess.get("ip_hash"),
            },
            "contact": {
                "name": nombre.strip()[:100],
                "phone": whatsapp.strip()[:30],
                "email": (email or "").strip()[:100] or None,
            },
            "intent": intent_history[-1] if intent_history else "otro",
            "message": (mensaje or "").strip()[:500] or None,
            "status": "nuevo",
            "assigned_to": None,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_activity_at": now_iso,
            "created_by": "_asistente_publico",
        }
        await self.db.leads.insert_one(dict(lead))
        await self.db.asistente_sessions.update_one(
            {"_id": session_token},
            {"$set": {"captured_lead_id": lead_id}},
        )

        # Activity log (best-effort)
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "asistente.lead_captured",
                "lead_id": lead_id,
                "session_token": session_token,
                "intent_history": intent_history,
                "created_at": _now(),
            })
        except Exception:
            pass

        log.info(f"[asistente] lead captured {lead_id} session={session_token}")
        return {"lead_id": lead_id, "status": "captured"}

    async def get_or_create_from_legacy(
        self,
        legacy_caya_session_id: str,
        ip_raw: str,
        user_agent: str,
    ) -> str:
        """Mapea un session_id legacy de Caya (`dmx_caya_*`) a un asistente_token.

        SECURITY (W4.4E.5.1): valida que el legacy_id exista en `caya_sessions`.
        Si NO existe, aplica rate limit por IP igual que `start_session`
        (5 sessions/hora/ip_hash) para prevenir spam de mappings inválidos.
        Si SÍ existe, mapping idempotente sin rate limit (no penaliza usuarios legítimos).

        Idempotente: si el mapping ya existe, retorna el token.
        """
        existing = await self.db.caya_sessions_migration.find_one(
            {"legacy_id": legacy_caya_session_id},
            {"_id": 0, "asistente_token": 1},
        )
        if existing and existing.get("asistente_token"):
            return existing["asistente_token"]

        from behavioral_tracking_engine import _hash_ip
        ip_hash = _hash_ip(ip_raw or "unknown")

        # ── SECURITY: validar que el legacy_id existe en caya_sessions ──────
        legacy_doc = await self.db.caya_sessions.find_one(
            {"session_id": legacy_caya_session_id}, {"_id": 1},
        )
        if not legacy_doc:
            # Audit log para forensics
            try:
                await self.db.activity_log.insert_one({
                    "id": f"act_{uuid.uuid4().hex[:12]}",
                    "type": "asistente.legacy_mapping_rejected",
                    "reason": "legacy_session_not_found",
                    "legacy_id_attempted": legacy_caya_session_id[:64],
                    "ip_hash": ip_hash,
                    "created_at": _now(),
                })
            except Exception:
                pass
            # Aplicar rate limit (5/hora/ip) para prevenir spam de mappings fake
            if not _check_rate(_session_buckets, ip_hash, SESSIONS_PER_HOUR_PER_IP, 3600):
                raise AsistenteRateLimitError(
                    "legacy mapping rate limit exceeded"
                )
            log.warning(
                f"[asistente] legacy_id no existe pero IP {ip_hash} bajo rate limit · creando session nueva"
            )

        ua_hash = _hash_ip(user_agent or "unknown")
        token = f"asis_{uuid.uuid4().hex[:20]}"
        now = _now()
        await self.db.asistente_sessions.insert_one({
            "_id": token,
            "session_token": token,
            "ip_hash": ip_hash,
            "user_agent_hash": ua_hash,
            "created_at": now,
            "last_message_at": now,
            "message_count": 0,
            "captured_lead_id": None,
            "status": "active",
            "referral_source": "caya_bubble",
            "channel": "web_bubble",
            "legacy_caya_session_id": legacy_caya_session_id,
            "legacy_validated": bool(legacy_doc),
        })
        await self.db.caya_sessions_migration.update_one(
            {"legacy_id": legacy_caya_session_id},
            {"$set": {
                "legacy_id": legacy_caya_session_id,
                "asistente_token": token,
                "created_at": now,
                "legacy_validated": bool(legacy_doc),
            }},
            upsert=True,
        )
        log.info(f"[asistente] mapped legacy caya {legacy_caya_session_id} → {token} (validated={bool(legacy_doc)})")
        return token

    async def expire_old_sessions(self, hours: int = SESSION_EXPIRE_HOURS) -> int:
        """Cron diario: marca status=expired sesiones inactivas >N horas."""
        cutoff = _now() - timedelta(hours=hours)
        result = await self.db.asistente_sessions.update_many(
            {"status": "active", "last_message_at": {"$lt": cutoff}},
            {"$set": {"status": "expired"}},
        )
        log.info(f"[asistente] expire_old_sessions(h={hours}): {result.modified_count}")
        return result.modified_count


# Module-level helper for cron
async def expire_old_sessions_cron(db) -> int:
    return await AsistenteEngine(db).expire_old_sessions(SESSION_EXPIRE_HOURS)


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.asistente_sessions.create_index("session_token", unique=True, name="idx_asis_token_unique", background=True)
        await db.asistente_sessions.create_index([("ip_hash", 1), ("created_at", -1)], name="idx_asis_ip_time", background=True)
        await db.asistente_sessions.create_index([("status", 1), ("last_message_at", -1)], name="idx_asis_status_time", background=True)
        await db.asistente_messages.create_index([("session_token", 1), ("created_at", 1)], name="idx_asis_msg_token_time", background=True)
        log.info("[asistente] indexes OK")
    except Exception as exc:
        log.warning(f"[asistente] ensure_indexes failed: {exc}")


# ─── W4.14 Tool implementations ───────────────────────────────────────────────

async def _tool_buyer_coach_consult(db, query: str, context: dict) -> Dict[str, Any]:
    """Tool: buyer_coach_consult — responde consultas del proceso de compra."""
    try:
        from buyer_coach_engine import _heuristic_response, STAGE_LABELS, STAGE_CHECKLISTS
        # Map query keywords to stage
        q_lower = query.lower()
        stage = 1
        if any(w in q_lower for w in ["escritura", "notario", "cierre", "isr", "cfdi"]):
            stage = 6
        elif any(w in q_lower for w in ["negoci", "precio", "oferta", "descuento"]):
            stage = 5
        elif any(w in q_lower for w in ["visita", "revisar", "checklist", "departamento"]):
            stage = 4
        elif any(w in q_lower for w in ["colonia", "zona", "ubicación", "dónde"]):
            stage = 3
        elif any(w in q_lower for w in ["presupuesto", "pago", "mensual", "crédito"]):
            stage = 2
        elif any(w in q_lower for w in ["post", "después", "entrega", "seguro"]):
            stage = 7

        heuristic = _heuristic_response(stage, query)
        checklist_items = STAGE_CHECKLISTS.get(stage, [])[:5]
        return {
            "stage": stage,
            "stage_label": STAGE_LABELS.get(stage, ""),
            "guidance": heuristic,
            "checklist_preview": checklist_items,
            "source": "buyer_coach_engine",
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] buyer_coach_consult failed: {exc}")
        return {"guidance": "Para orientación en el proceso de compra, te recomiendo iniciar el Asesor de Compra en la sección de Marketplace.", "source": "fallback"}


async def _tool_investment_simulate(
    db, precio: float, plazo: int, m2: float, colonia: str, apreciacion_pct=None
) -> Dict[str, Any]:
    """Tool: investment_simulate — retorna ROI/TIR de los 3 escenarios."""
    try:
        from investment_simulator_engine import simulate
        result = await simulate(db, precio, plazo, m2, colonia, apreciacion_pct)
        base = result.get("base", {})
        conservador = result.get("conservador", {})
        optimista = result.get("optimista", {})
        return {
            "colonia": colonia,
            "precio_entrada": precio,
            "plazo_meses": plazo,
            "m2": m2,
            "tier_zona": result.get("tier_zona"),
            "escenarios": {
                "conservador": {
                    "roi_pct": conservador.get("roi_pct"),
                    "tir_anual_pct": conservador.get("tir_anual_pct"),
                    "break_even_meses": conservador.get("break_even_meses"),
                    "precio_final": conservador.get("precio_final"),
                },
                "base": {
                    "roi_pct": base.get("roi_pct"),
                    "tir_anual_pct": base.get("tir_anual_pct"),
                    "break_even_meses": base.get("break_even_meses"),
                    "precio_final": base.get("precio_final"),
                },
                "optimista": {
                    "roi_pct": optimista.get("roi_pct"),
                    "tir_anual_pct": optimista.get("tir_anual_pct"),
                    "break_even_meses": optimista.get("break_even_meses"),
                    "precio_final": optimista.get("precio_final"),
                },
            },
            "pago_mensual_hipoteca": base.get("pago_mensual_hipoteca"),
            "enganche": base.get("enganche"),
            "source": "investment_simulator_engine",
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] investment_simulate failed: {exc}")
        return {"error": str(exc), "source": "fallback"}



# ─── W5.3 Parte 2B Sub-D · Forecast multi-horizonte tool ─────────────────────

async def _tool_get_zone_forecast(db, zone_slug: str, horizons: str = "6,12,24") -> Dict[str, Any]:
    """Tool: get_zone_forecast — proyección de precio multi-horizonte por colonia.

    Reusa `forecast_engine` (W5.3 P1) + cache LRU. Devuelve shape compatible con
    el endpoint `/api/forecast-public/zone/{slug}` para que Atlax narre cifras.
    """
    if not zone_slug:
        return {"error": "zone_slug requerido"}
    try:
        from forecast_engine import (
            get_zone_forecast, build_narrative, HORIZONS_MONTHS, _parse_horizons_list,
        )
        import forecast_cache

        cache_key = f"atlax|{zone_slug}|{horizons}"
        cached = await forecast_cache.get(cache_key)
        if cached is not None:
            return {**cached, "cache_hit": True}

        zf = await get_zone_forecast(db, zone_slug)
        if not zf:
            return {
                "error": "forecast_unavailable",
                "reason": "insufficient_history",
                "zone_slug": zone_slug,
                "source": "forecast_engine",
            }

        requested = _parse_horizons_list(horizons)
        horizons_arr = []
        for h in HORIZONS_MONTHS:
            if h not in requested:
                continue
            band = (zf.get("horizons") or {}).get(f"{h}m")
            if not band:
                continue
            horizons_arr.append({
                "months": h,
                "value": band["value"],
                "low95": band["low95"],
                "high95": band["high95"],
                "delta_pct": band.get("delta_pct"),
            })

        try:
            from data_seed import COLONIAS_BY_ID
            name = (COLONIAS_BY_ID.get(zone_slug) or {}).get("name", zone_slug)
        except Exception:
            name = zone_slug

        payload = {
            "slug": zone_slug,
            "name": name,
            "baseline": zf.get("baseline_index"),
            "horizons": horizons_arr,
            "narrative": build_narrative(zf.get("horizons") or {}),
            "model_type": zf.get("model_type"),
            "arima_order": zf.get("arima_order"),
            "mape_test": zf.get("mape_test"),
            "model_fitted_at": zf.get("fitted_at"),
            "source": "forecast_engine",
            "cache_hit": False,
        }
        await forecast_cache.set(cache_key, payload)
        return payload
    except Exception as exc:
        log.warning(f"[asistente_tool] get_zone_forecast failed: {exc}")
        return {"error": str(exc), "source": "fallback"}


# ─── W5.12 Parte 3 · Tool 19 query_knowledge_graph ────────────────────────────
# Whitelist de 5 templates logicos para Atlax. NO permite Cypher libre.
_KG_TOOL_ALLOWED = {
    "proyectos_similares",
    "compradores_cross_project",
    "zonas_similares_a",
    "devs_dominantes_zona",
    "proyectos_huerfanos_zona",
}


async def _tool_query_knowledge_graph(db, params: Dict[str, Any]) -> Dict[str, Any]:
    template = (params.get("template") or "").strip()
    q_params = params.get("params") or {}
    if template not in _KG_TOOL_ALLOWED:
        return {
            "error": f"Template no autorizado para Atlax: {template}",
            "allowed": sorted(_KG_TOOL_ALLOWED),
            "source": "kg_consumer",
        }
    try:
        from kg_query_helper import kg_query
        result = await kg_query(template, q_params, caller_module="asistente_atlax", db=db)
        if result.get("kg_unavailable"):
            log.warning(f"[asistente] KG fallback (template={template} reason={result.get('reason')})")
            return {
                "source": "kg_consumer",
                "kg_unavailable": True,
                "fallback_required": True,
                "rows": [],
                "reason": result.get("reason"),
                "template": template,
            }
        return {
            "source": "kg_consumer",
            "template": template,
            "rows": result.get("rows", []),
            "count": result.get("count", 0),
            "latency_ms": result.get("latency_ms"),
            "cache_hit": result.get("cache_hit", False),
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_knowledge_graph failed: {exc}")
        return {"error": str(exc), "source": "kg_consumer", "kg_unavailable": True, "fallback_required": True}



# ─── Tool 20: Probability UX ─────────────────────────────────────────────────

_PROBABILITY_TYPES_WHITELIST = {"sells_complete", "drpi_up", "closes_below_listed"}


async def _tool_query_probability(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.19 Tool 20 — Consulta probabilidades de eventos inmobiliarios.

    Tipos soportados:
      sells_complete: ¿el proyecto venderá todas sus unidades en N meses?
      drpi_up: ¿el DRPI de la zona subirá en N meses?
      closes_below_listed: ¿el cierre ocurrirá por debajo del precio listado?
    """
    prob_type = (params.get("type") or "").strip()
    entity_id = (params.get("id") or params.get("entity_id") or "").strip()
    months = int(params.get("months") or 3)
    listed = params.get("listed")

    if prob_type not in _PROBABILITY_TYPES_WHITELIST:
        return {
            "error": f"type '{prob_type}' no autorizado. Tipos: {sorted(_PROBABILITY_TYPES_WHITELIST)}",
            "source": "probability_engine",
        }
    if not entity_id:
        return {"error": "id/entity_id requerido", "source": "probability_engine"}
    if months < 1 or months > 24:
        months = 3

    try:
        from probability_engine import (
            compute_sells_complete,
            compute_zone_drpi_up,
            compute_closes_below_listed,
        )
        from audit_immutable_engine import log as audit_log

        if prob_type == "sells_complete":
            result = await compute_sells_complete(db, entity_id, months)
        elif prob_type == "drpi_up":
            result = await compute_zone_drpi_up(db, entity_id, months)
        else:  # closes_below_listed
            if listed is None:
                return {
                    "error": "Param 'listed' requerido para closes_below_listed",
                    "source": "probability_engine",
                }
            result = await compute_closes_below_listed(db, entity_id, float(listed))

        # Audit caller_module
        try:
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="probability_query",
                entity_type=prob_type,
                entity_id=entity_id,
                before=None,
                after={
                    "probability_pct": result.get("probability_pct"),
                    "caller_module": "asistente_atlax_probability",
                },
            )
        except Exception:
            pass

        return {
            "source": "probability_engine",
            "type": prob_type,
            "entity_id": entity_id,
            **result,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_probability failed: {exc}")
        return {"error": str(exc), "source": "probability_engine", "insufficient_data": True}


# ─── Tool 21: Battle Card ─────────────────────────────────────────────────────

async def _tool_query_battle_card(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.23 Tool 21 — Battle Card competitivo (T3 developer premium).

    Responde con composite_score + ranking + recommended_action + sources_breakdown.
    Si user_tier < T3 en params → retorna mensaje de upgrade.
    Si insufficient_competitors → retorna estado honest.
    """
    project_id = (params.get("project_id") or "").strip()
    dimension = (params.get("dimension") or "").strip().lower()
    user_tier = (params.get("user_tier") or "").strip()

    if not project_id:
        return {
            "error": "project_id requerido",
            "source": "battle_card_engine",
        }

    # Tier check contextual (Atlax no tiene acceso directo al JWT aquí)
    # Si user_tier pasado explícitamente y es < T3 → bloquear
    TIER_RANK = {"free": 0, "t1": 1, "T1": 1, "t2": 2, "T2": 2}
    if user_tier and TIER_RANK.get(user_tier, 99) < 3:
        return {
            "error": "Battle Card requiere tier T3+ para developers Enterprise.",
            "source": "battle_card_engine",
            "tier_required": "T3",
        }

    try:
        from battle_card_engine import (
            get_my_score,
            compute_ranking,
            recommend_next_action,
            insufficient_competitors_check,
        )
        from data_developments import DEVELOPMENTS_BY_ID
        from audit_immutable_engine import log as audit_log

        dev = DEVELOPMENTS_BY_ID.get(project_id)
        if not dev:
            return {
                "error": f"Proyecto {project_id} no encontrado.",
                "source": "battle_card_engine",
            }

        zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""

        # Check insufficient_competitors
        insuff = await insufficient_competitors_check(db, zone_slug)
        if insuff:
            return {
                "source": "battle_card_engine",
                "state": "insufficient",
                "message": (
                    f"Necesitamos al menos 3 desarrolladores en la zona {zone_slug} "
                    "para generar Battle Card. Los datos se están acumulando."
                ),
            }

        my_score = await get_my_score(db, project_id)
        ranking = await compute_ranking(db, project_id, zone_slug)
        recommendation = await recommend_next_action(db, project_id)

        dim_scores = my_score.get("dim_scores", {})
        composite = my_score.get("composite_score", 0)

        # sources_breakdown (contribución de cada dimensión)
        sources_breakdown = [
            {"dim": d, "contribution_pct": 20.0, "score": dim_scores.get(d, 0)}
            for d in ["precio", "ventas", "zona", "marketing", "lead_gen"]
        ]

        rank_str = f"#{ranking.get('rank')} de {ranking.get('total_in_zone')}" if ranking.get("available") else "—"
        delta_pos = ranking.get("delta_position", 0)
        delta_str = f" (subio {delta_pos} lugar{'es' if abs(delta_pos) > 1 else ''})" if delta_pos > 0 else (
            f" (bajo {abs(delta_pos)} lugar{'es' if abs(delta_pos) > 1 else ''})" if delta_pos < 0 else ""
        )

        explanation = (
            f"Tu proyecto {dev.get('name', project_id)} esta en rank {rank_str}{delta_str} "
            f"· score {composite:.1f}/100 · accion: {recommendation.get('action', '—')[:80]}"
        )

        # Si se pide solo una dimensión
        result_dims = dim_scores
        if dimension and dimension in dim_scores:
            result_dims = {dimension: dim_scores[dimension]}

        # Audit
        try:
            await audit_log(
                db,
                actor={"user_id": "atlax_dev", "role": "asistente"},
                action="battle_card_query",
                entity_type="battle_card",
                entity_id=project_id,
                before=None,
                after={
                    "composite_score": composite,
                    "caller_module": "asistente_atlax_battle_card",
                },
            )
        except Exception:
            pass

        return {
            "source": "battle_card_engine",
            "state": "ok",
            "project_id": project_id,
            "composite_score": composite,
            "color": my_score.get("color"),
            "ranking": rank_str,
            "delta_position": delta_pos,
            "recommended_action": recommendation.get("action"),
            "weakest_dim": recommendation.get("weakest_dim"),
            "dim_scores": result_dims,
            "sources_breakdown": sources_breakdown,
            "explanation_es": explanation,
        }

    except Exception as exc:
        log.warning(f"[asistente_tool] query_battle_card failed: {exc}")
        return {"error": str(exc), "source": "battle_card_engine"}


# W5.FF3 — Tool 22 · Feature visibility for the calling user
async def _tool_query_my_features(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Returns the features enabled for a given (user_id, tenant_id) pair.

    Delegates to feature_legacy_adapter.merge_legacy_with_flags (W5.FF2):
      UNION explicit grants ∪ implicit tier features · FAIL-OPEN [] si DB rota.
    """
    user_id = (params.get("user_id") or "").strip()
    tenant_id = (params.get("tenant_id") or user_id or "").strip()
    if not user_id:
        return {"error": "user_id requerido", "source": "feature_visibility"}

    try:
        from feature_legacy_adapter import merge_legacy_with_flags
        import feature_flags_engine as ff
        from feature_gate_engine import derive_user_tier
        from audit_immutable_engine import log as audit_log

        feats = await merge_legacy_with_flags(db, user_id, tenant_id)

        # Tier inferred from active flags
        try:
            flags = await ff.get_tenant_flags(db, tenant_id)
            tier_inferred = derive_user_tier(flags)
        except Exception:
            tier_inferred = "free"

        # Hydrate name/category from extended catalog
        cat_by_key = {f["key"]: f for f in ff.get_extended_catalog()}
        items = []
        for k in feats:
            meta = cat_by_key.get(k, {})
            items.append({
                "key": k,
                "name": meta.get("name") or k.replace("_", " ").title(),
                "category": meta.get("category") or "general",
            })

        # Audit (best-effort)
        try:
            await audit_log(
                db,
                actor={"user_id": user_id, "role": "asistente"},
                action="feature_visibility_query",
                entity_type="user_features",
                entity_id=user_id,
                before=None,
                after={
                    "features_count": len(items),
                    "tier_inferred": tier_inferred,
                    "caller_module": "asistente_atlax_features",
                },
            )
        except Exception:
            pass

        return {
            "source": "feature_visibility",
            "features_count": len(items),
            "features": items,
            "tier_inferred": tier_inferred,
        }

    except Exception as exc:
        log.warning(f"[asistente_tool] query_my_features failed: {exc}")
        return {"error": str(exc), "source": "feature_visibility"}


# ─── W5.20 · Tool 23 · query_global_insights ─────────────────────────────────
async def _tool_query_global_insights(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Atlax tool #23 · acceso a 12 fuentes externas globales (BIS · OECD · IMF ·
    World Bank · FRED · INEGI · BMV · HR Ratings · Numbeo · Global Property Guide
    · Zillow · Realtor). Retorna data + sources_breakdown estilo Robinhood.

    params:
      - source_id (opcional): único source · si ausente retorna status de todos
      - comparison (opcional): pista narrativa para LLM (ej. "polanco_vs_beverly_hills")
    """
    try:
        from external_insights_engine import (
            fetch_source, list_sources_status, ALL_SOURCES, SOURCE_METADATA,
        )

        source_id = (params.get("source_id") or "").strip().lower()
        comparison = (params.get("comparison") or "").strip().lower() or None

        if source_id and source_id in ALL_SOURCES:
            res = await fetch_source(db, source_id)
            meta = next((m for m in SOURCE_METADATA if m["source_id"] == source_id), {})
            return {
                "source": "external_insights",
                "source_id": source_id,
                "source_meta": meta,
                "status": res.get("status"),
                "fetched_at": res.get("fetched_at"),
                "payload": res.get("payload"),
                "comparison_hint": comparison,
                "sources_breakdown": [
                    {"label": meta.get("name") or source_id,
                     "url": meta.get("url"),
                     "frequency": meta.get("frequency"),
                     "tier": meta.get("tier"),
                     "status": res.get("status")},
                ],
            }

        # No specific source → return overview status of all 12
        items = await list_sources_status(db)
        meta_map = {m["source_id"]: m for m in SOURCE_METADATA}
        sources_breakdown = []
        for it in items:
            sid = it.get("source_id")
            m = meta_map.get(sid, {})
            sources_breakdown.append({
                "source_id": sid,
                "label": m.get("name"),
                "url": m.get("url"),
                "frequency": m.get("frequency"),
                "tier": m.get("tier"),
                "status": it.get("status"),
                "last_seen": it.get("fetched_at"),
            })
        ok = sum(1 for s in items if s.get("status") == "ok")
        return {
            "source": "external_insights",
            "sources_count_total": len(items),
            "sources_ok": ok,
            "comparison_hint": comparison,
            "sources_breakdown": sources_breakdown,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_global_insights failed: {exc}")
        return {"error": str(exc), "source": "external_insights"}


# ═══════════════════════════════════════════════════════════════════════════════
# W5.22 Z.8.5 — Tools 24/25: landing_optimizer + landing_adaptive_copy_generate
# ═══════════════════════════════════════════════════════════════════════════════

async def _tool_landing_optimizer(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool 24: heuristic suggestions sobre landing existente."""
    try:
        from studio_landing_atlax_adapter import optimize_landing_suggestions
        landing_id = params.get("landing_id")
        focus = params.get("focus") or "all"
        if not landing_id:
            return {"error": "landing_id requerido", "source": "landing_optimizer"}
        landing = await db.studio_landings.find_one({"id": landing_id, "deleted": {"$ne": True}}, {"_id": 0})
        if not landing:
            return {"error": "Landing no encontrada", "source": "landing_optimizer"}
        suggestions = await optimize_landing_suggestions(db, landing, focus=focus)
        return {
            "source": "landing_optimizer",
            "landing_id": landing_id,
            "focus": focus,
            "suggestions": suggestions,
            "views_count": landing.get("views_count", 0),
            "leads_count": landing.get("leads_count", 0),
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] landing_optimizer failed: {exc}")
        return {"error": str(exc), "source": "landing_optimizer"}


async def _tool_landing_adaptive_copy(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool 25: copy + data adaptive per template + persona + property data."""
    try:
        from studio_landing_atlax_adapter import generate_adaptive_copy
        template_key = (params.get("template_key") or "modern").lower()
        property_source = params.get("property_source") or "development"
        linked_entity_id = params.get("linked_entity_id")
        persona_target = params.get("persona_target")
        property_data: Dict[str, Any] = {}
        if linked_entity_id:
            if property_source == "resale":
                imp = await db.listing_imports.find_one(
                    {"id": linked_entity_id}, {"_id": 0, "raw_html_truncated": 0}
                )
                if imp and imp.get("parsed_data"):
                    pd = imp["parsed_data"]
                    property_data = {
                        "name": pd.get("title") or pd.get("name") or "Propiedad",
                        "colonia": pd.get("colonia"),
                        "alcaldia": pd.get("alcaldia"),
                        "price_from": pd.get("price"),
                        "amenities": pd.get("amenities") or [],
                        "lat": pd.get("lat"),
                        "lng": pd.get("lng"),
                        "stage": "reventa",
                    }
            else:
                try:
                    from data_developments import DEVELOPMENTS_BY_ID
                    dev = DEVELOPMENTS_BY_ID.get(linked_entity_id)
                    if dev:
                        property_data = {
                            "name": dev.get("name"),
                            "colonia": dev.get("colonia"),
                            "alcaldia": dev.get("alcaldia"),
                            "price_from": dev.get("price_from"),
                            "amenities": dev.get("amenities", []),
                            "stage": dev.get("stage"),
                            "delivery_estimate": dev.get("delivery_estimate"),
                            "units_total": dev.get("units_total"),
                            "units_available": dev.get("units_available"),
                            "lat": (dev.get("center") or {}).get("lat") if isinstance(dev.get("center"), dict) else dev.get("lat"),
                            "lng": (dev.get("center") or {}).get("lng") if isinstance(dev.get("center"), dict) else dev.get("lng"),
                            "id": dev.get("id"),
                        }
                except Exception:
                    pass
        bundle = await generate_adaptive_copy(db, template_key, property_data, persona_target=persona_target)
        return {
            "source": "landing_adaptive_copy",
            "template_key": template_key,
            "property_source": property_source,
            **bundle,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] landing_adaptive_copy failed: {exc}")
        return {"error": str(exc), "source": "landing_adaptive_copy"}


# W5.x F4 — Tool 26: generate_narrative (Narrative Layer LLM cross-feature)
async def _tool_generate_narrative(
    db,
    *,
    scope: str = "project",
    entity_id: str = "",
    audience: str = "neutral",
    disc: Optional[str] = None,
) -> Dict[str, Any]:
    """Invoca narrative_layer_engine.generate y retorna narrative_long + medium + short + citations."""
    if not entity_id:
        return {"error": "entity_id requerido"}
    try:
        from narrative_layer_engine import generate as nl_generate
        result = await nl_generate(
            db,
            scope=scope,
            entity_id=entity_id,
            audience=audience,
            disc=disc,
        )
        return {
            "narrative_long": result.get("narrative_long", ""),
            "narrative_medium": result.get("narrative_medium", ""),
            "narrative_short": result.get("narrative_short", ""),
            "citations": result.get("citations", []),
            "confidence": result.get("confidence", 0.0),
            "fallback": result.get("fallback", False),
            "source": "narrative_layer_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] generate_narrative failed: {e}")
        return {"error": str(e), "source": "narrative_layer_engine"}


# W5.x F4.2 — Tool 27: compare_properties (Comparator side-by-side)
async def _tool_compare_properties(
    db,
    *,
    scope: str = "project",
    entity_ids: Optional[List[str]] = None,
    audience: str = "neutral",
) -> Dict[str, Any]:
    """Llama comparator_engine.compare y retorna ai_verdict + summary deltas."""
    ids = entity_ids or []
    if not (1 <= len(ids) <= 3):
        return {"error": "entity_ids debe tener entre 1 y 3 elementos"}
    try:
        from comparator_engine import compare as cmp_compare
        result = await cmp_compare(db, scope=scope, entity_ids=ids, audience=audience)
        if isinstance(result, dict) and result.get("ok") is False:
            return {"error": result.get("reason", "compare failed")}
        return {
            "ai_verdict": result.get("ai_verdict", ""),
            "deltas_summary": {k: {"best": v.get("best_entity_id"), "pct": v.get("percent_diff_best_vs_worst")} for k, v in (result.get("deltas") or {}).items()},
            "items_count": len(result.get("items") or []),
            "source": "comparator_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] compare_properties failed: {e}")
        return {"error": str(e), "source": "comparator_engine"}


# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("atlax_chat", plan_tier="free",       monthly_price_mxn=0,   category="ai",          name="Atlax Chat")
