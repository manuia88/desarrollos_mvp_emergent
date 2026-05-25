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

17. query_knowledge_graph
    params: {{ "template": str (uno de: proyectos_similares, compradores_cross_project, zonas_similares_a, devs_dominantes_zona, proyectos_huerfanos_zona), "params": dict }}
    devuelve: filas del grafo de conocimiento (relaciones multi-entidad). Si KG no disponible retorna fallback_required=true y debes responder con tools 1-16.
    Usar SOLO cuando la pregunta involucra RELACIONES multi-entidad (compradores cross-project, proyectos similares, asesores con patrones, zonas con compradores comunes, devs dominantes). NO uses para consultas simples de 1 entidad (esas usan tools 1-16).

18. query_probability
    params: {{ "type": str ("sells_complete"|"drpi_up"|"closes_below_listed"), "id": str (entity_id), "months": int (1-24, default 3), "listed": float (solo para closes_below_listed) }}
    devuelve: probability_pct (0-100), confidence_lvl (ALTA|MEDIA|BAJA), sources_breakdown, explanation_es, insufficient_data.
    Usar cuando: user pregunte probabilidad de eventos inmobiliarios (¿cuánto crecerá X?, ¿venderán todo el proyecto?, ¿cierra debajo del precio?).

19. query_battle_card
    params: {{ "project_id": str (requerido), "dimension": str? (opcional · solo retorna ese score si pasado · uno de: precio/ventas/zona/marketing/lead_gen), "user_tier": str (pasar "T3" si usuario es T3+ developer) }}
    devuelve: composite_score, ranking, dim_scores, recommended_action, sources_breakdown, explanation_es.
    Usar cuando: dev user T3 pregunte sobre posicion competitiva, ranking, score vs competidores, que mejorar, como va su proyecto.

20. query_my_features
    params: {{ "user_id": str (requerido), "tenant_id": str (requerido · usar user_id si no se conoce) }}
    devuelve: {{ features_count, features:[{{key, name, category}}], tier_inferred }}.
    Usar cuando: user pregunta qué features tiene activas, qué incluye su plan, qué puede ver/usar en el portal, qué upgrades existen.

21. query_global_insights
    params: {{ "source_id": str (opcional · 12 disponibles: bis_property_prices, oecd_housing, imf_global_housing, worldbank_doing_business, fred_us_housing, inegi_vivienda, bmv_fibras, hr_ratings, numbeo_property_index, global_property_guide, zillow_research, realtor_research), "comparison": str (opcional · ej. "polanco_vs_beverly_hills") }}
    devuelve: {{ payload, sources_breakdown:[{{label, url, frequency, tier, status}}] }}.
    Usar cuando: user pregunta comparativas globales (México vs USA/Mundo) · macro housing (BIS · OECD · FRED) · yields globales (Numbeo · Global Property Guide) · vivienda MX gov (INEGI · SHF · HR Ratings) · narrativa "Beverly Hills vs Polanco" · referencia prensa MX.

22. generate_narrative
    params: {{ "scope": str ("project"|"unit"|"colonia"|"lead_property"), "entity_id": str (requerido), "audience": str ("investor"|"family"|"first_home"|"luxury"|"boutique"|"urgent"|"neutral"), "disc": str? ("D"|"I"|"S"|"C") }}
    devuelve: {{ narrative_long, narrative_medium, narrative_short, citations, confidence }}
    Usar cuando: user pide "redacta un copy", "narrativa persuasiva", "describe la propiedad para mi cliente", o quiere texto adaptado a perfil del lead. Cada output incluye 3 versiones (largo web, medio email, corto WhatsApp).

23. compare_properties
    params: {{ "scope": str ("project"|"unit"), "entity_ids": list[str] (1-3), "audience": str (same options as 22) }}
    devuelve: {{ ai_verdict, deltas_summary, items_count }}
    Usar cuando: user pregunta "comparar X vs Y", "cuál es mejor entre estos proyectos", o quiere un veredicto rápido entre 2-3 propiedades. Devuelve un resumen ejecutivo con la mejor opción por audiencia.

24. reverse_search
    params: {{ "text": str (query lenguaje natural, max 500 chars), "audience": str? (investor|family|first_home|luxury|boutique|neutral), "limit": int? (default 5, max 20) }}
    devuelve: {{ results: [{{entity_id, title, match_score, explanation, sources}}], parsed: {{hard_filters, soft_criteria, negative_criteria, buyer_intent}} }}
    Usar cuando: user describe propiedad en lenguaje natural ("busco depto", "quiero algo en Polanco", "para mi familia con escuelas"). Parser LLM extrae filtros duros + blandos + negativos. NO uses tools 1-10 si query es descriptivo · usa reverse_search.

25. query_lead_capture_stats
    params: {{ "days": int? (default 7, max 90) }}
    devuelve: {{ total_count, by_audience_breakdown, top_advisors_3, conversion_rate }}
    Usar cuando: user (developer T3+) pregunte cuántos leads se han capturado, qué audience convierte más, qué asesor está performing mejor, tasa de conversión del marketplace lead capture.

26. query_alerts_summary
    params: {{ "advisor_id": str? (opcional · si vacío retorna global), "days": int? (default 7, max 90) }}
    devuelve: {{ total_active, by_tier:{{alta,media,baja}}, by_signal_type, top_5_recent }}
    Usar cuando: asesor o admin pregunta cuántas alertas predictivas hay activas, qué tipo de signal aparece más (enamorado/decision/enfriando/presupuesto_bajo/re_engaged/abandono_modal/indeciso), qué leads están en momento crítico, top alertas urgentes.

27. query_fit_recommendations
    params: {{ "mode": "lead_to_properties"|"property_to_leads"|"single", "lead_id": str?, "property_id": str?, "limit": int? (default 5, max 20) }}
    devuelve: depende de mode — "lead_to_properties": {{properties:[...]}} · "property_to_leads": {{leads:[...]}} · "single": {{score, confidence, breakdown, explanation_short, reasons_top_3}}
    Usar cuando: asesor pregunta "qué propiedad le va a Juan", "quién compraría Polanco Moderno", "compatibilidad entre este lead y esta propiedad", "top matches para X". Score 0-100 sobre 6 dimensiones (presupuesto/audience/búsquedas/comportamiento/ubicación/específicas). Si confidence="tentativa" advertir al usuario que faltan interacciones del lead.

28. query_whatsapp_templates
    params: {{}} (sin params)
    devuelve: {{ templates:[{{template_name, language, status, body_preview}}], providers_status:{{stub|twilio|business}}, meta_api_enabled:bool }}
    Usar cuando: user/asesor pregunta qué mensajes automáticos hay disponibles · qué templates WhatsApp podemos usar · si WhatsApp Business está activo · qué proveedor responde. Templates dinámicos están en collection whatsapp_templates (W4.10). Si meta_api_enabled=false advertir que estamos en modo stub esperando Meta App Review.

29. query_mood_recommendations
    params: {{ "visitor_session_id": str (de sessionStorage del visitor · requerido) }}
    devuelve: {{ mood_vector:{{calm,social,eclectic,modern,connected}}, mood_label, top_matches:[property_ids] }} o {{error}} si el visitor no completó el quiz
    Usar cuando: user pregunta "qué propiedades me gustan", "match emocional", "vibe", o el contexto sugiere afinidad emocional sobre cuantitativa. Es complementario a tool 27 query_fit_recommendations (que es cuantitativo). Si el visitor no hizo quiz, sugerir que lo complete antes.

30. query_avm_estimate
    params: {{ "property_id": str (requerido), "scope": "unit"|"project" (default "unit") }}
    devuelve: {{ avm_estimate, avm_low, avm_high, confidence, sources_breakdown, model_version }}
    Usar cuando user pregunta "¿cuánto vale esta propiedad?", "¿cuál es el AVM?", valoración objetiva. Incluye confidence interval y sources.

31. query_zone_subscores
    params: {{ "zone_id": str (requerido, slug colonia) }}
    devuelve: {{ zone_id, subscores: {{walkability, quiet, vibrant, schools, safety, dining, transit, parks, cultural, family_friendly}}, top_3_strengths, top_3_gaps }}
    Usar cuando user pregunta "¿cómo es esta zona?", "¿es tranquila?", "¿buena para familias?", "¿caminable?". Devuelve 8-12 dimensiones del zone_score_engine W5.2.

32. query_buyer_score
    params: {{ "lead_id": str (requerido) }}
    devuelve: {{ score, tier (hot|warm|cold), components, last_updated, recommendation_action }}
    Usar cuando asesor pregunta "¿qué tan caliente está este lead?", "¿debería llamar a Juan ahora?". Si persisted → lookup; si no → compute on-the-fly. Tier hot=80+, warm=50-79, cold<50.

33. query_live_pulse
    params: {{ "zone_slug": str (opcional · si vacío scope=all), "scope": "all"|"zone" (default "all"), "hours": int (default 24) }}
    devuelve: {{ signals, heatmap_summary, top_3_hot_zones, last_updated }}
    Usar cuando user pregunta "¿qué zonas están calientes ahora?", "¿hay tendencia real-time?", heatmap behavioral CDMX. Si scope=zone retorna 6 signals (search_velocity, view_volume, trend_velocity, lead_intent_velocity, price_movement, accuracy_drift).

34. query_tax_projection
    params: {{ "property_id": str? (opcional · resuelve precios desde DB), "precio_compra": float?, "fecha_compra": str?, "precio_venta": float?, "fecha_venta": str?, "mode": "isr"|"isai"|"closing"|"full" (default "full") }}
    devuelve: {{ isr_total, isai, closing_total, predial_y1, breakdown, sources: "SAT DOF 2026 · Gaceta CDMX 2026" }}
    Usar cuando user pregunta "¿cuánto pago de ISR si vendo?", "¿cuánto sale el cierre?", "¿predial 2026?". ISR vendedor · ISAI comprador · predial proyectado.

35. query_climate_migration
    params: {{ "mode": "heatmap_summary"|"zone"|"patterns" (default "heatmap_summary"), "zone_slug": str? (req si mode=zone), "days": int? (default 90, max 365) }}
    devuelve: heatmap_summary → {{top_outflow_zones, top_inflow_zones}} · zone → {{detalle completo zona}} · patterns → {{patterns}}
    Usar cuando: user pregunta sobre tendencias climáticas + migración por zona ("¿qué zonas pierden gente por contaminación?", "¿dónde se está mudando la gente en CDMX?", "tendencia migration Roma vs Polanco"). T3 inversionista feature.

36. query_virtual_staging
    params: {{ "mode": "stats"|"user" (default "stats"), "user_id": str? (req si mode=user) }}
    devuelve: stats → {{ total, by_style, cache_hit_rate }} · user → {{ user_total, last_used, recent_styles }}
    Usar cuando: dev pregunta cuántos stagings se han generado · qué estilo es más popular · stats del feature W5.17.

37. landing_optimizer
    params: {{ "landing_id": str, "metric": "conversion"|"cta_click"|"scroll_depth" (default "conversion") }}
    devuelve: {{ recommendations: [str], current_score, suggested_actions }}
    Usar cuando: dev pregunta cómo mejorar conversion de landing · cuáles son los pain points · qué cambiar en copy/CTA/estructura para subir métricas.

38. landing_adaptive_copy_generate
    params: {{ "landing_id": str, "audience": "investor"|"family"|"first_home"|"luxury"|"boutique"|"urgent"|"neutral", "tone": "brunson"|"hormozi"|"vogue"? }}
    devuelve: {{ generated_copy: {{hero, sections, ctas}}, model_used, token_count }}
    Usar cuando: dev pide copy adaptado a un perfil específico para landing · variantes A/B por audience · usa F4 narrative_layer como base.

39. query_studio_videos
    params: {{ "mode": "stats"|"user"|"voices" (default "stats"), "dev_org_id": str? (si mode=user) }}
    devuelve: depende mode · "stats": {{total_scripts, total_audios, total_cost_usd_30d, top_tone, top_duration}} · "user": {{scripts_count, quota}} · "voices": {{voices_list, default_voice_id}}
    Usar cuando: dev pregunta cuántos videos ha generado · cuál estilo/duracion es popular · stats del feature W5.16 · qué voces ES-MX disponibles.

40. generate_studio_video
    params: {{ "script": str (1-5000), "image_url": str?, "provider": "luma"|"pika"|"runway"|"replicate_kling" (default "luma"), "duration_sec": 30|60|90 (default 60), "dev_org_id": str?, "user_id": str? }}
    devuelve: {{ task_id, provider, ratios: {{"1:1", "9:16", "16:9"}}, master_url, is_stub, cost_usd, quota, status, cached, fallback_attempts }}
    Usar cuando: dev pide generar video multi-ratio (reel 1:1 · stories 9:16 · youtube 16:9) desde script + imagen · usa fallback chain providers · stub-aware sin credito · respeta cap diario studio_video W5.16-A.

41. query_construction_quality
    params: {{ "mode": "index"|"top"|"stats" (default "index"), "development_id": str? (mode=index), "min_score": float? (mode=top default 70), "tier": "excelente"|"bueno"|"regular"|"deficiente"? (filtro), "limit": int? (mode=top default 10) }}
    devuelve: depende mode · "index": {{development_id, score 0-100, tier, breakdown {{avance, acabados, defectos, cronograma}}, manual_override, cached}} · "top": {{items[], count}} · "stats": {{total_developments, total_with_quality_score, coverage_pct, tiers, cache_entries}}
    Usar cuando: comprador o asesor pregunta calidad de construcción de un desarrollo · "qué tan confiable es este desarrollador" · "muéstrame los proyectos mejor calificados" · comparar 2 desarrollos en cumplimiento de obra · breakdown 4 dimensiones (avance vs cronograma · defectos acabados · quejas reportadas · entregas a tiempo) · W6.MOV.5 índice 0-100 diferenciador competitivo.

42. query_reviews_residents
    params: {{ "mode": "zone"|"development"|"summary" (default "zone"), "entity_id": str (id de zona o desarrollo · requerido), "entity_type": "zone"|"development"? (solo mode=summary · default infiere de mode) }}
    devuelve: {{entity_type, entity_id, n_reviews, avg_rating (0-5|null), sentiment_breakdown_pct {{positive,neutral,negative}}, sentiment_counts, top_themes (5 themes con count), top_quotes (3 cuotes con autor+sentiment+source)}}
    Usar cuando: comprador o asesor pregunta sobre opiniones/reseñas/reputación residentes de una zona o desarrollo · "qué dicen los vecinos de Polanco" · "es segura esta colonia" · "qué opinan residentes del desarrollo X" · "muéstrame sentimiento de la zona" · W6.MOV.3 agrega Google Places + Foursquare + Atlas con sentiment Claude (positive/neutral/negative + themes seguridad/ruido/tráfico/limpieza/servicios/convivencia/precio/ubicación).

43. query_gov_data_mx
    params: {{ "mode": "sources"|"upload-list"|"stats" (default "sources"), "limit": int? (mode=upload-list default 50), "offset": int? (mode=upload-list default 0) }}
    devuelve: depende mode · "sources": {{sources[] con source_id+label+status+fetched_at+expires_at, total, counts {{ok,error,skipped,stale,missing}}}} · "upload-list": {{items[], total, limit, offset}} · "stats": {{track_a, track_b_raw_total, track_c_uploads_active, cache_entries}}
    Usar cuando: superadmin pregunta estado de fuentes GOV MX (INEGI DENUE · BANXICO SIE · DataMéxico · CONAVI · SESNSP · CENAPRED) · cuántos uploads se han subido · si una fuente está stale/missing · stats agregados tracks A/B/C · W6.MOV.2 fuentes mexicanas (distinto a query_global_insights tool #21 que cubre BIS/OECD/IMF globales).

44. query_soc_franchise
    params: {{ "mode": "leaderboard"|"my_score"|"admin_stats" (default "leaderboard"), "user_id": str? (mode=my_score · si vacío usa caller user_id), "level": "bronze"|"silver"|"gold"|"platinum"? (filtro leaderboard), "limit": int? (default 20) }}
    devuelve: depende mode · "leaderboard": {{items[] con user_id+name+score+level+delta_week, count}} · "my_score": {{user_id, score 0-100, level, breakdown {{lead_conversion, nps_proxy, response_time, revenue_30d, compliance}}, manual_override}} · "admin_stats": {{total_franchisees, coverage_pct, levels: {{bronze, silver, gold, platinum}}, top_movers, bottom_movers}}
    Usar cuando: asesor pregunta "¿cuál es mi score SOC?", "¿soy gold o platinum?", "¿cómo me comparo con otros?" · comprador o asesor pregunta "¿quién es el mejor asesor?", "ranking franquiciatarios" · superadmin pregunta "¿cuántos asesores certificados tenemos?" · W6.MOV.1 SOC Sistema Operación Certificado 4 niveles bronze/silver/gold/platinum.

45. query_workflow_builder
    params: {{ "mode": "list"|"stats"|"templates" (default "list"), "owner_user_id": str? (mode=list · si vacío usa caller), "limit": int? (default 20) }}
    devuelve: depende mode · "list": {{items[] con id+name+status+nodes_count+last_run_at, count, cap}} · "stats": {{total_workflows, active, paused, draft, runs_last_30d, success_rate_pct, fired_actions_30d}} · "templates": {{items[] con key+label+description+nodes_count}} (5 plantillas precargadas)
    Usar cuando: asesor pregunta "¿qué workflows tengo activos?" · "¿cuál ha ejecutado más veces?" · "¿qué plantillas hay disponibles?" · superadmin pregunta uso agregado workflows · W6.AS.1 Workflow Builder Visual.

46. query_marketing_mcp
    params: {{ "mode": "status"|"history"|"stats" (default "status"), "days": int? (mode=history default 30), "limit": int? (mode=history default 50) }}
    devuelve: depende mode · "status": {{adapters: {{twitter, linkedin, telegram, discord}} con configured+rate_limit+env_keys}} · "history": {{items[], count, days}} · "stats": {{total_publishes, by_platform {{twitter, linkedin, telegram, discord}}: {{ok, error, skipped, cached}}, scheduled_pending, cache_entries, adapters}}
    Usar cuando: superadmin pregunta estado canales marketing · "qué redes tengo conectadas", "cuántas publicaciones enviamos hoy/semana", "Twitter/LinkedIn/Telegram/Discord configurado", "publicaciones pendientes scheduled", "engagement por plataforma" · W6.MOV.4 Marketing Distribution MCP 4 platforms stub-aware (sin keys = skipped) cache 24h rate-limit por platform.

47. query_project_wizard
    params: {{ "mode": "templates"|"duplicate_history" (default "templates"), "tenant_id": str? (superadmin filtra por tenant · si vacío usa caller), "limit": int? (default 20) }}
    devuelve: depende mode · "templates": {{items[] con id+name+colonia+price_tier+stage, count}} · "duplicate_history": {{items[] con id+name+duplicated_from+created_at, count}}
    Usar cuando: developer pregunta "¿qué plantillas de proyecto puedo duplicar?", "¿qué proyectos ya he duplicado?", "¿tengo templates listos?" · superadmin pregunta uso agregado duplicación · W6.5 Wizard duplicación · responde con nombre + colonia · sugiere abrir modal de duplicación desde portal developer (botón Duplicar en Mis Proyectos).

48. query_marketplace_templates
    params: {{ "mode": "list"|"my_published"|"revenue_stats" (default "list"), "category": "nurture"|"post-visita"|"win-back"|"custom"? (filtro mode=list), "price_tier": "free"|"pro"|"enterprise"? (filtro mode=list), "sort": "popular"|"recent"|"rating"? (default "popular"), "limit": int? (default 20) }}
    devuelve: depende mode · "list": {{items[] con id+title+category+price_mxn+price_tier+avg_rating+downloads, count}} (solo approved) · "my_published": {{items[] con status+downloads+revenue_total_mxn, count}} (templates del caller) · "revenue_stats": {{total_clones, author_revenue_mxn, dmx_revenue_mxn, my_templates[]}} (caller advisor)
    Usar cuando: asesor pregunta "¿qué plantillas de workflow hay en el marketplace?", "¿cuánto he ganado vendiendo mis workflows?", "¿qué tan populares son mis plantillas publicadas?" · superadmin pregunta uso global vía revenue_stats sin user_id · W6.4 Marketplace Templates de workflows · revenue split 70/30 · pricing free/pro/enterprise · 4 categorías.

49. query_hook_predictor
    params: {{ "mode": "score"|"stats"|"global_stats" (default "score"), "text": str (mode=score · max 500 chars), "target_audience": str? (mode=score · opcional), "days": int? (mode=stats/global_stats · default 30) }}
    devuelve: depende mode · "score": {{score 0-100, breakdown{{clarity, cta, novelty, urgency}}, suggestion?, confidence alta|media|baja, source cache|llm|heuristic, threshold, passes, missing_data}} · "stats": {{total_scored, avg_score, distribution_by_tier{{excellent, good, weak}}, top_dimensions_failing[], days}} (own) · "global_stats": idem agregado tenant (superadmin).
    Usar cuando: T2+ advisor pregunta "¿qué tan bueno es este hook?", "¿pasa el filtro?", "¿cómo lo mejoro?", "¿qué hooks me funcionan?" o superadmin pide métricas globales · W5.22 Z.5 standalone · rubric 4 dim 25% c/u · cache 7d · FAIL-OPEN heurística si LLM cae.

50. query_reputation_monitor
    params: {{ "mode": "mentions"|"stats"|"trend" (default "stats"), "days": int? (default 30, max 365), "sentiment": "positive"|"neutral"|"negative"? (filtro mode=mentions), "source": "google_search"|"twitter_x"|"reddit"|"news_web"? (filtro mode=mentions), "limit": int? (default 20) }}
    devuelve: depende mode · "mentions": {{items[] con url+title+snippet+sentiment+source+found_at, total}} · "stats": {{total_mentions, by_source, by_sentiment {{positive,neutral,negative}}, top_negative_urls[], alerts_triggered_7d}} · "trend": {{trend_7d:[{{date,count}}], total_mentions, by_sentiment}}
    Usar cuando: superadmin pregunta sobre reputación de marca DMX en redes · "¿qué mencionan de DMX online?" · "¿hay menciones negativas?" · "¿está saliendo en news?" · "¿cuántas menciones últimos 30d?" · "tendencia sentimiento" · W7.AS.6 Brand24-style monitor 4 sources (Google Search + X + Reddit + News RSS) sentiment Claude · alert ≥3 negativas 24h via notifications_engine · feature superadmin-only.

51. query_lead_enrichment
    params: {{ "mode": "enrich-now"|"cache-status"|"stats" (default "enrich-now"), "lead_id": str? (requerido mode=enrich-now/cache-status), "tenant_id": str?, "force_refresh": bool? (default false), "user_id": str?, "role": str?, "days": int? (default 30, mode=stats) }}
    devuelve: depende mode · "enrich-now": {{status, enriched_fields, sources_used[], cost_usd, confidence}} · "cache-status": {{has_cache, age_days, data?}} · "stats": {{total_enriched, success_rate, avg_cost, by_source, daily_usage_by_tenant}}
    Usar cuando: asesor pregunta enriquecer lead con data externa · "¿tienes más info de este lead?" · "¿cuál es su LinkedIn?" · "¿en qué empresa trabaja?" · "research IA sobre este contacto" · W7.AS.1 Clay-style waterfall lookup 4 connectors (email validation + LinkedIn PDL + Company Clearbit + AI research summary) stub-aware sin keys · cache 30d · cap 100/día/tenant · cost tracking ai_budget.

══ PROBABILITY UX (tool 18 · transparencia Robinhood) ══
Usa query_probability cuando el usuario pregunte sobre probabilidades de eventos:
  - ¿Se venderá todo el proyecto? → type=sells_complete, id=project_id
  - ¿Subirá el DRPI/precio en la zona? → type=drpi_up, id=zone_slug, months=3
  - ¿Puedo cerrar por debajo del precio listado? → type=closes_below_listed, id=property_id, listed=precio_listado
SIEMPRE incluye sources_breakdown en tu respuesta con formato Robinhood transparency.
Ejemplo response: "82% (Forecast 65% + WhatIf 25% + AVM 10% · confianza ALTA)".
NUNCA inventes números. Si insufficient_data=true → di "los datos para esa zona/proyecto están acumulándose, no tengo suficiente historial aún."

══ BATTLE CARD (tool 19 · T3 dev premium) ══
Usa query_battle_card cuando developer T3 pregunte sobre posición competitiva:
  - ¿Cómo voy vs competidores? / ¿Cuál es mi ranking? / ¿Qué debo mejorar?
  - Pasar user_tier="T3" en params si el usuario es developer T3+
SIEMPRE incluye ranking actual + recommended_action en respuesta.
Ejemplo: "Tu proyecto X está rank #2 en Polanco (subiste 1 lugar) · acción recomendada: ajustar precio -3% según comp velocity · score 72/100".
Si user tier < T3 → responde "Battle Card requiere upgrade a tier T3 para developers Enterprise".
Si insufficient_competitors → responde "Necesitamos al menos 3 desarrolladores en esa zona · data acumulándose".

══ EXTERNAL INSIGHTS (tool 21 · ser referente prensa MX) ══
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

══ FEATURE VISIBILITY (tool 20 · qué tiene activo el user) ══
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
        # W5.x F5 — Tool 28: reverse_search (NL query → ranked catalog)
        if tool_name == "reverse_search":
            return await _tool_reverse_search(
                db,
                text=params.get("text") or "",
                audience=params.get("audience"),
                limit=int(params.get("limit") or 5),
            )
        # W5.x F7 — Tool 29: query_lead_capture_stats
        if tool_name == "query_lead_capture_stats":
            return await _tool_query_lead_capture_stats(
                db, days=int(params.get("days") or 7),
            )
        # W5.x F8 — Tool 30: query_alerts_summary
        if tool_name == "query_alerts_summary":
            return await _tool_query_alerts_summary(
                db,
                advisor_id=params.get("advisor_id"),
                days=int(params.get("days") or 7),
            )
        # W5.x F11 — Tool 31: query_fit_recommendations
        if tool_name == "query_fit_recommendations":
            return await _tool_query_fit_recommendations(
                db,
                mode=params.get("mode") or "lead_to_properties",
                lead_id=params.get("lead_id"),
                property_id=params.get("property_id"),
                limit=int(params.get("limit") or 5),
            )
        # W5.x F9 — Tool 32: query_whatsapp_templates (reusa W4.10 whatsapp_engine)
        if tool_name == "query_whatsapp_templates":
            return await _tool_query_whatsapp_templates(db)
        # W5.x F10 — Tool 33: query_mood_recommendations
        if tool_name == "query_mood_recommendations":
            return await _tool_query_mood_recommendations(
                db,
                visitor_session_id=params.get("visitor_session_id"),
                audience=params.get("audience"),
            )
        # W5 Cleanup · 5 new cross-batch tools
        if tool_name == "query_avm_estimate":
            return await _tool_query_avm_estimate(db, params)
        if tool_name == "query_zone_subscores":
            return await _tool_query_zone_subscores(db, params)
        if tool_name == "query_buyer_score":
            return await _tool_query_buyer_score(db, params)
        if tool_name == "query_live_pulse":
            return await _tool_query_live_pulse(db, params)
        if tool_name == "query_tax_projection":
            return await _tool_query_tax_projection(db, params)
        if tool_name == "query_climate_migration":
            return await _tool_query_climate_migration(db, params)
        if tool_name == "query_virtual_staging":
            return await _tool_query_virtual_staging(db, params)
        if tool_name == "query_studio_videos":
            return await _tool_query_studio_videos(db, params)
        if tool_name == "generate_studio_video":
            return await _tool_generate_studio_video(db, params)
        if tool_name == "query_construction_quality":
            return await _tool_query_construction_quality(db, params)
        if tool_name == "query_reviews_residents":
            return await _tool_query_reviews_residents(db, params)
        if tool_name == "query_gov_data_mx":
            return await _tool_query_gov_data_mx(db, params)
        if tool_name == "query_soc_franchise":
            return await _tool_query_soc_franchise(db, params)
        # W6.AS.1 · tool #45 Workflow Builder
        if tool_name == "query_workflow_builder":
            return await _tool_query_workflow_builder(db, params)
        # W6.MOV.4 · tool #46 Marketing Distribution MCP
        if tool_name == "query_marketing_mcp":
            return await _tool_query_marketing_mcp(db, params)
        # W6.5 · tool #47 Project Wizard duplication
        if tool_name == "query_project_wizard":
            return await _tool_query_project_wizard(db, params)
        # W6.4 · tool #48 Marketplace Templates
        if tool_name == "query_marketplace_templates":
            return await _tool_query_marketplace_templates(db, params)
        # W5.22 Z.5 · tool #49 Hook Predictor (4-dim scoring · cache 7d · FAIL-OPEN)
        if tool_name == "query_hook_predictor":
            return await _tool_query_hook_predictor(db, params)
        # W7.AS.6 · tool #50 Reputation Monitor (Brand24-style · 4 sources · sentiment · alerts)
        if tool_name == "query_reputation_monitor":
            return await _tool_query_reputation_monitor(db, params)
        # W7.AS.1 · tool #51 Lead Enrichment (Clay-style waterfall · 4 connectors · cache 30d · cap diario)
        if tool_name == "query_lead_enrichment":
            return await _tool_query_lead_enrichment(db, params)
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


# W5.x F5 — Tool 28: reverse_search (NL query → ranked catalog · LLM parser)
async def _tool_reverse_search(
    db,
    *,
    text: str = "",
    audience: Optional[str] = None,
    limit: int = 5,
) -> Dict[str, Any]:
    """Llama reverse_search_engine.generate · retorna shape compacto para Copilot."""
    if not text or not str(text).strip():
        return {"error": "text requerido", "source": "reverse_search_engine"}
    try:
        from reverse_search_engine import generate as rs_generate
        limit = max(1, min(int(limit or 5), 20))
        result = await rs_generate(
            db,
            text=str(text).strip(),
            audience=audience,
            language="es-MX",
            limit=limit,
            force_refresh=False,
        )
        return {
            "results": result.get("results", []),
            "parsed": result.get("parsed", {}),
            "cached": result.get("cached", False),
            "source": "reverse_search_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] reverse_search failed: {e}")
        return {"error": str(e), "source": "reverse_search_engine"}


# W5.x F7 — Tool 29: query_lead_capture_stats (marketplace lead capture analytics)
async def _tool_query_lead_capture_stats(db, days: int = 7) -> Dict[str, Any]:
    """Aggregate lead_captures collection últimos N days. Devuelve shape compacto."""
    days = max(1, min(int(days or 7), 90))
    empty = {
        "total_count": 0,
        "by_audience_breakdown": {},
        "top_advisors_3": [],
        "conversion_rate": 0.0,
        "days": days,
        "source": "lead_capture_marketplace_engine",
    }
    if db is None:
        return empty
    try:
        from datetime import datetime as _dt, timedelta as _td, timezone as _tz
        cutoff = _dt.now(_tz.utc) - _td(days=days)
        total = await db.lead_captures.count_documents({"created_at": {"$gte": cutoff}})
        if total == 0:
            return empty

        # by_audience
        by_audience: Dict[str, int] = {}
        pipe_aud = [
            {"$match": {"created_at": {"$gte": cutoff}}},
            {"$group": {"_id": "$audience", "n": {"$sum": 1}}},
        ]
        async for row in db.lead_captures.aggregate(pipe_aud):
            by_audience[row.get("_id") or "neutral"] = int(row.get("n") or 0)

        # top advisors
        top_advisors: list = []
        pipe_adv = [
            {"$match": {"created_at": {"$gte": cutoff}, "advisor_id": {"$ne": None}}},
            {"$group": {"_id": "$advisor_id", "n": {"$sum": 1},
                         "name": {"$first": "$advisor_name"}}},
            {"$sort": {"n": -1}},
            {"$limit": 3},
        ]
        async for row in db.lead_captures.aggregate(pipe_adv):
            top_advisors.append({
                "advisor_id": row.get("_id"),
                "advisor_name": row.get("name") or "—",
                "leads_count": int(row.get("n") or 0),
            })

        # conversion rate
        converted = await db.lead_captures.count_documents({
            "created_at": {"$gte": cutoff}, "status": "converted",
        })
        rate = round(converted / total, 4) if total else 0.0

        return {
            "total_count": int(total),
            "by_audience_breakdown": by_audience,
            "top_advisors_3": top_advisors,
            "conversion_rate": rate,
            "days": days,
            "source": "lead_capture_marketplace_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_lead_capture_stats failed: {e}")
        return {**empty, "error": str(e)}


# W5.x F8 — Tool 30: query_alerts_summary
async def _tool_query_alerts_summary(db, advisor_id: Optional[str] = None,
                                       days: int = 7) -> Dict[str, Any]:
    """Aggregate predictive_alerts últimos N días · global o por advisor.

    Devuelve: {total_active, by_tier:{alta,media,baja}, by_signal_type, top_5_recent}.
    """
    days = max(1, min(int(days or 7), 90))
    empty = {
        "total_active": 0,
        "by_tier": {"alta": 0, "media": 0, "baja": 0},
        "by_signal_type": {},
        "top_5_recent": [],
        "days": days,
        "advisor_id": advisor_id,
        "source": "predictive_alerts_engine",
    }
    if db is None:
        return empty
    try:
        from datetime import datetime as _dt, timedelta as _td, timezone as _tz
        cutoff = _dt.now(_tz.utc) - _td(days=days)
        base_filter: Dict[str, Any] = {
            "status": "active",
            "created_at": {"$gte": cutoff},
        }
        if advisor_id:
            base_filter["advisor_id"] = advisor_id

        total_active = await db.predictive_alerts.count_documents(base_filter)
        if total_active == 0:
            return empty

        by_tier: Dict[str, int] = {"alta": 0, "media": 0, "baja": 0}
        pipe_tier = [
            {"$match": base_filter},
            {"$group": {"_id": "$urgency_tier", "n": {"$sum": 1}}},
        ]
        async for row in db.predictive_alerts.aggregate(pipe_tier):
            tier = row.get("_id") or "baja"
            if tier in by_tier:
                by_tier[tier] = int(row.get("n") or 0)

        by_signal: Dict[str, int] = {}
        pipe_sig = [
            {"$match": base_filter},
            {"$group": {"_id": "$signal_type", "n": {"$sum": 1}}},
        ]
        async for row in db.predictive_alerts.aggregate(pipe_sig):
            key = row.get("_id") or "unknown"
            by_signal[key] = int(row.get("n") or 0)

        top_5: list = []
        async for a in db.predictive_alerts.find(
            base_filter,
            {"_id": 0, "alert_id": 1, "signal_type": 1, "urgency_score": 1,
             "urgency_tier": 1, "property_id": 1, "property_title": 1,
             "message": 1, "created_at": 1, "advisor_id": 1, "lead_id": 1},
            sort=[("urgency_score", -1), ("created_at", -1)],
        ).limit(5):
            ts = a.get("created_at")
            if hasattr(ts, "isoformat"):
                a["created_at"] = ts.isoformat()
            top_5.append(a)

        return {
            "total_active": int(total_active),
            "by_tier": by_tier,
            "by_signal_type": by_signal,
            "top_5_recent": top_5,
            "days": days,
            "advisor_id": advisor_id,
            "source": "predictive_alerts_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_alerts_summary failed: {e}")
        return {**empty, "error": str(e)}


# W5.x F11 — Tool 31: query_fit_recommendations
async def _tool_query_fit_recommendations(
    db,
    mode: str = "lead_to_properties",
    lead_id: Optional[str] = None,
    property_id: Optional[str] = None,
    limit: int = 5,
) -> Dict[str, Any]:
    """Wrapper sobre fit_engine.

    mode="lead_to_properties" → top_properties_for_lead(lead_id, limit)
    mode="property_to_leads"  → top_leads_for_property(property_id, limit)
    mode="single"             → compute_fit_score(lead_id, property_id)
    """
    mode = (mode or "lead_to_properties").lower()
    limit = max(1, min(int(limit or 5), 20))
    if mode not in {"lead_to_properties", "property_to_leads", "single"}:
        return {"error": f"mode inválido: {mode}",
                 "valid_modes": ["lead_to_properties", "property_to_leads", "single"]}
    if db is None:
        return {"error": "no_db"}
    try:
        from fit_engine import (
            compute_fit_score,
            top_leads_for_property,
            top_properties_for_lead,
        )
        if mode == "lead_to_properties":
            if not lead_id:
                return {"error": "lead_id requerido para mode=lead_to_properties"}
            res = await top_properties_for_lead(db, lead_id, limit=limit)
            return {"mode": mode, **res}
        if mode == "property_to_leads":
            if not property_id:
                return {"error": "property_id requerido para mode=property_to_leads"}
            res = await top_leads_for_property(db, property_id, limit=limit)
            return {"mode": mode, **res}
        # single
        if not lead_id or not property_id:
            return {"error": "lead_id y property_id requeridos para mode=single"}
        res = await compute_fit_score(db, lead_id, property_id)
        if not res.get("ok"):
            return {"mode": mode, "error": res.get("reason") or "no_ok"}
        return {
            "mode": mode,
            "lead_id": lead_id,
            "property_id": property_id,
            "property_title": res.get("property_title"),
            "score": res.get("score"),
            "confidence": res.get("confidence"),
            "breakdown": res.get("breakdown"),
            "explanation_short": res.get("explanation_short"),
            "reasons_top_3": res.get("reasons_top_3"),
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_fit_recommendations failed: {e}")
        return {"error": str(e), "mode": mode}


# W5.x F9 — Tool 32: query_whatsapp_templates (reusa W4.10 whatsapp_engine + collection whatsapp_templates)
async def _tool_query_whatsapp_templates(db) -> Dict[str, Any]:
    """Lista templates WhatsApp dinámicos disponibles + status del provider (W4.10)."""
    try:
        import os as _os
        provider = _os.environ.get("WHATSAPP_PROVIDER", "stub").lower()
        meta_api_enabled = bool(_os.environ.get("META_WA_TOKEN") and _os.environ.get("META_WA_PHONE_ID"))
        twilio_enabled = bool(_os.environ.get("TWILIO_ACCOUNT_SID") and _os.environ.get("TWILIO_AUTH_TOKEN"))

        templates_list = []
        try:
            cursor = db.whatsapp_templates.find({}, {"_id": 0, "template_name": 1, "language": 1, "status": 1, "body": 1}).limit(20)
            async for t in cursor:
                body = (t.get("body") or "")[:100]
                templates_list.append({
                    "template_name": t.get("template_name"),
                    "language": t.get("language", "es-MX"),
                    "status": t.get("status", "unknown"),
                    "body_preview": body + ("..." if len(t.get("body") or "") > 100 else ""),
                })
        except Exception as _exc:
            log.warning(f"[asistente_tool] whatsapp_templates query failed: {_exc}")

        return {
            "templates": templates_list,
            "templates_count": len(templates_list),
            "providers_status": {
                "active_provider": provider,
                "twilio_enabled": twilio_enabled,
                "business_enabled": meta_api_enabled,
            },
            "meta_api_enabled": meta_api_enabled,
            "source": "whatsapp_engine_W4.10",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_whatsapp_templates failed: {e}")
        return {"error": str(e), "source": "whatsapp_engine_W4.10"}


# W5.x F10 — Tool 33: query_mood_recommendations
async def _tool_query_mood_recommendations(
    db,
    visitor_session_id: Optional[str] = None,
    audience: Optional[str] = None,
) -> Dict[str, Any]:
    """Lookup último mood_quiz_results del visitor · retorna vector + top matches."""
    if not visitor_session_id:
        return {"error": "visitor_session_id requerido",
                 "source": "mood_engine"}
    if db is None:
        return {"error": "no_db", "source": "mood_engine"}
    try:
        doc = await db.mood_quiz_results.find_one(
            {"visitor_session_id": visitor_session_id},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if not doc:
            return {
                "error": "user has not completed mood quiz",
                "visitor_session_id": visitor_session_id,
                "source": "mood_engine",
            }
        ts = doc.get("created_at")
        if hasattr(ts, "isoformat"):
            doc["created_at"] = ts.isoformat()
        return {
            "visitor_session_id": visitor_session_id,
            "mood_vector": doc.get("mood_vector"),
            "mood_label": doc.get("mood_label"),
            "top_matches": doc.get("top_matches") or [],
            "created_at": doc.get("created_at"),
            "audience": audience,
            "source": "mood_engine",
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_mood_recommendations failed: {e}")
        return {"error": str(e), "source": "mood_engine"}


# ─── W5 Cleanup · 5 new cross-batch tools ────────────────────────────────────

async def _tool_query_avm_estimate(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.1 — AVM valuation for a property. Resolves property → colonia + features,
    then calls avm_quick_async. Fail-soft."""
    property_id = (params.get("property_id") or "").strip()
    scope = (params.get("scope") or "unit").lower()
    if not property_id:
        return {"error": "property_id requerido", "source": "avm_public_engine"}
    try:
        from avm_public_engine import avm_quick_async
    except Exception as exc:
        return {"error": f"avm_engine_unavailable: {exc}", "source": "avm_public_engine"}

    # Resolve property → features
    colonia = None
    m2 = 80.0
    recamaras = 2
    banos = 2
    antiguedad = 5
    try:
        if db is not None:
            unit = None
            if scope == "unit":
                unit = await db.developments_units.find_one({"id": property_id}, {"_id": 0})
                if not unit:
                    unit = await db.units.find_one({"id": property_id}, {"_id": 0})
            dev = None
            if not unit:
                dev = await db.developments.find_one({"id": property_id}, {"_id": 0})
            src = unit or dev or {}
            colonia = src.get("colonia") or src.get("colonia_id") or src.get("zone_id")
            m2 = float(src.get("area_m2") or src.get("m2") or src.get("avg_m2") or m2)
            recamaras = int(src.get("recamaras") or src.get("recamaras_min") or recamaras)
            banos = int(src.get("banos") or src.get("banos_min") or banos)
            antiguedad = int(src.get("antiguedad_anos") or antiguedad)
    except Exception as exc:
        log.warning(f"[asistente_tool] query_avm_estimate lookup failed: {exc}")

    if not colonia:
        return {"error": "property_not_found_or_no_colonia", "property_id": property_id,
                "source": "avm_public_engine"}

    try:
        avm = await avm_quick_async(
            db, colonia, m2, recamaras, banos, antiguedad,
            with_explain=True,
        )
        if "error" in avm:
            return {"error": avm.get("error"), "source": "avm_public_engine"}

        # Audit fail-soft
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="avm_query",
                entity_type="property",
                entity_id=property_id,
                before=None,
                after={"colonia": colonia, "estimate": avm.get("precio_estimado"),
                       "caller_module": "asistente_query_avm_estimate"},
            )
        except Exception:
            pass

        explain = avm.get("explain") or {}
        sources_breakdown = explain.get("drivers") or explain.get("breakdown") or []

        return {
            "source": "avm_public_engine",
            "property_id": property_id,
            "colonia": colonia,
            "avm_estimate": avm.get("precio_estimado"),
            "avm_low": avm.get("range_low"),
            "avm_high": avm.get("range_high"),
            "confidence": avm.get("confidence"),
            "pricing_model": avm.get("pricing_model"),
            "model_version": avm.get("model_id"),
            "sources_breakdown": sources_breakdown,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_avm_estimate failed: {exc}")
        return {"error": str(exc), "source": "avm_public_engine"}


async def _tool_query_zone_subscores(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.2 — Sub-scores 6+ dimensiones de una zona. Usa zone_score_engine.get_zone_with_subscores."""
    zone_id = (params.get("zone_id") or params.get("zone_slug") or "").strip()
    if not zone_id:
        return {"error": "zone_id requerido", "source": "zone_subscores"}
    try:
        from zone_score_engine import get_zone_with_subscores
    except Exception as exc:
        return {"error": f"zone_score_unavailable: {exc}", "source": "zone_subscores"}

    try:
        result = await get_zone_with_subscores(db, zone_id)
        if not result:
            return {"error": "zone_not_found", "zone_id": zone_id, "source": "zone_subscores"}

        # Build subscores dict and top_3 strengths/gaps
        subs = result.get("subscores") or {}
        # subscores may be a dict of key→value or key→dict; normalize
        flat: Dict[str, float] = {}
        for k, v in subs.items():
            if isinstance(v, dict):
                val = v.get("value")
            else:
                val = v
            try:
                if val is not None:
                    flat[k] = float(val)
            except (TypeError, ValueError):
                pass

        sorted_dims = sorted(flat.items(), key=lambda kv: kv[1], reverse=True)
        top_3_strengths = [{"dim": k, "score": v} for k, v in sorted_dims[:3]]
        top_3_gaps = [{"dim": k, "score": v} for k, v in sorted_dims[-3:][::-1]]

        # Audit fail-soft
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="zone_subscores_query",
                entity_type="zone",
                entity_id=zone_id,
                before=None,
                after={"caller_module": "asistente_query_zone_subscores"},
            )
        except Exception:
            pass

        return {
            "source": "zone_score_engine_w52",
            "zone_id": zone_id,
            "zone_name": result.get("name") or result.get("zone_name"),
            "score_total": result.get("score_total") or result.get("score_numeric"),
            "score_letter": result.get("score_letter"),
            "subscores": flat,
            "top_3_strengths": top_3_strengths,
            "top_3_gaps": top_3_gaps,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_zone_subscores failed: {exc}")
        return {"error": str(exc), "source": "zone_subscores"}


async def _tool_query_buyer_score(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.4 — Buyer score 0-100 + tier hot/warm/cold. Lookup persisted, else compute on the fly."""
    lead_id = (params.get("lead_id") or params.get("user_id") or "").strip()
    if not lead_id:
        return {"error": "lead_id requerido", "source": "buyer_score_engine"}
    try:
        from buyer_score_engine import compute_user_score
    except Exception as exc:
        return {"error": f"buyer_score_unavailable: {exc}", "source": "buyer_score_engine"}

    try:
        # 1) Try persisted buyer_scores first (lookup by user_id, fallback try lead → user mapping)
        persisted = None
        user_id_for_compute = lead_id
        if db is not None:
            try:
                persisted = await db.buyer_scores.find_one(
                    {"$or": [{"user_id": lead_id}, {"lead_id": lead_id}]},
                    {"_id": 0},
                )
            except Exception:
                persisted = None
            # If lead has an associated user_id, prefer that for compute
            try:
                lead_doc = await db.leads.find_one({"id": lead_id}, {"_id": 0, "user_id": 1, "email": 1})
                if lead_doc and lead_doc.get("user_id"):
                    user_id_for_compute = lead_doc["user_id"]
            except Exception:
                pass

        if persisted:
            score = persisted.get("score")
            tier = persisted.get("tier")
            components = persisted.get("components") or {}
            ts = persisted.get("computed_at")
            if hasattr(ts, "isoformat"):
                ts = ts.isoformat()
            last_updated = ts
        else:
            # Compute on the fly (fail-soft inside engine)
            try:
                computed = await compute_user_score(db, user_id_for_compute)
            except Exception as exc:
                return {"error": f"compute_failed: {exc}", "lead_id": lead_id,
                        "source": "buyer_score_engine"}
            score = computed.get("score")
            tier = computed.get("tier")
            components = computed.get("components") or {}
            last_updated = None

        # Recommendation action by tier
        action_map = {
            "hot": "Llamar AHORA · WhatsApp prioritario · agendar visita 24h",
            "warm": "Nurture activo · enviar comparativa + invitar a tour virtual",
            "cold": "Email educativo · seguimiento mensual · re-engagement campaign",
        }
        recommendation_action = action_map.get(tier or "", "Sin recomendación · revisar manualmente")

        # Audit fail-soft
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="buyer_score_query",
                entity_type="lead",
                entity_id=lead_id,
                before=None,
                after={"score": score, "tier": tier,
                       "caller_module": "asistente_query_buyer_score"},
            )
        except Exception:
            pass

        return {
            "source": "buyer_score_engine_w54",
            "lead_id": lead_id,
            "score": score,
            "tier": tier,
            "components": components,
            "last_updated": last_updated,
            "recommendation_action": recommendation_action,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_buyer_score failed: {exc}")
        return {"error": str(exc), "source": "buyer_score_engine"}


async def _tool_query_live_pulse(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.5 — Live Pulse signals. Si zone_slug → compute_pulse de esa zona.
    Si scope=all → top 3 hot zonas desde live_pulse_snapshots."""
    zone_slug = (params.get("zone_slug") or "").strip()
    scope = (params.get("scope") or ("zone" if zone_slug else "all")).lower()
    hours = int(params.get("hours") or 24)

    try:
        from live_pulse_engine import compute_pulse, summarize_signals
    except Exception as exc:
        return {"error": f"live_pulse_unavailable: {exc}", "source": "live_pulse_engine"}

    try:
        # Single zone path
        if scope == "zone" or zone_slug:
            if not zone_slug:
                return {"error": "zone_slug requerido para scope=zone",
                        "source": "live_pulse_engine"}
            pulse = await compute_pulse(db, zone_slug)
            signals = pulse.get("signals") or {}
            heatmap_summary = summarize_signals(signals) if signals else {}

            # Audit fail-soft
            try:
                from audit_immutable_engine import log as audit_log
                await audit_log(
                    db,
                    actor={"user_id": "atlax_public", "role": "asistente"},
                    action="live_pulse_query",
                    entity_type="zone",
                    entity_id=zone_slug,
                    before=None,
                    after={"score": pulse.get("score"),
                           "caller_module": "asistente_query_live_pulse"},
                )
            except Exception:
                pass

            return {
                "source": "live_pulse_engine_w55",
                "scope": "zone",
                "zone_slug": zone_slug,
                "score": pulse.get("score"),
                "bucket": pulse.get("bucket"),
                "signals": signals,
                "heatmap_summary": heatmap_summary,
                "top_3_hot_zones": [],
                "last_updated": pulse.get("computed_at"),
            }

        # All scope: top hot zones from recent snapshots
        top_3 = []
        last_updated = None
        if db is not None:
            try:
                cursor = db.live_pulse_snapshots.find(
                    {},
                    {"_id": 0, "zone_slug": 1, "score": 1, "bucket": 1, "computed_at": 1},
                    sort=[("score", -1)],
                ).limit(3)
                async for doc in cursor:
                    ts = doc.get("computed_at")
                    if hasattr(ts, "isoformat"):
                        ts = ts.isoformat()
                    top_3.append({
                        "zone_slug": doc.get("zone_slug"),
                        "score": doc.get("score"),
                        "bucket": doc.get("bucket"),
                        "computed_at": ts,
                    })
                    if not last_updated:
                        last_updated = ts
            except Exception as exc:
                log.warning(f"[asistente_tool] live_pulse snapshots query failed: {exc}")

        # Audit fail-soft
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="live_pulse_query",
                entity_type="global",
                entity_id="all",
                before=None,
                after={"top_zones_count": len(top_3),
                       "caller_module": "asistente_query_live_pulse"},
            )
        except Exception:
            pass

        return {
            "source": "live_pulse_engine_w55",
            "scope": "all",
            "hours": hours,
            "signals": {},
            "heatmap_summary": {},
            "top_3_hot_zones": top_3,
            "last_updated": last_updated,
        }
    except Exception as exc:
        log.warning(f"[asistente_tool] query_live_pulse failed: {exc}")
        return {"error": str(exc), "source": "live_pulse_engine"}


async def _tool_query_tax_projection(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """F6 — Tax projection: ISR vendedor · ISAI comprador · closing total · predial 10y.
    mode=full|isr|isai|closing. Si property_id provisto y faltan precios, se resuelve desde DB."""
    mode = (params.get("mode") or "full").lower()
    property_id = (params.get("property_id") or "").strip() or None
    precio_compra = params.get("precio_compra")
    fecha_compra = params.get("fecha_compra")
    precio_venta = params.get("precio_venta")
    fecha_venta = params.get("fecha_venta")

    try:
        from tax_projector_engine import (
            calculate_isr_vendedor,
            calculate_isai_comprador,
            calculate_closing_cost_total,
            project_predial_10y,
        )
    except Exception as exc:
        return {"error": f"tax_engine_unavailable: {exc}", "source": "tax_projector_engine"}

    # Resolve missing data from property_id
    valor_catastral = None
    if property_id and db is not None and (precio_venta is None):
        try:
            unit = await db.developments_units.find_one({"id": property_id}, {"_id": 0})
            if not unit:
                unit = await db.units.find_one({"id": property_id}, {"_id": 0})
            dev = None
            if not unit:
                dev = await db.developments.find_one({"id": property_id}, {"_id": 0})
            src = unit or dev or {}
            precio_venta = precio_venta or src.get("price_mxn") or src.get("price") or src.get("price_from_mxn")
            valor_catastral = src.get("valor_catastral")
        except Exception as exc:
            log.warning(f"[asistente_tool] query_tax_projection lookup failed: {exc}")

    # Conservative fallback for valor_catastral
    if valor_catastral is None and precio_venta:
        try:
            valor_catastral = float(precio_venta) * 0.46
        except Exception:
            valor_catastral = 0

    out: Dict[str, Any] = {
        "source": "tax_projector_engine",
        "sources": "SAT DOF 2026 · Gaceta CDMX 2026",
        "mode": mode,
        "property_id": property_id,
        "breakdown": {},
    }

    # ISR vendedor
    if mode in ("full", "isr"):
        try:
            if precio_compra and precio_venta and fecha_compra and fecha_venta:
                isr = calculate_isr_vendedor(
                    float(precio_compra), str(fecha_compra),
                    float(precio_venta), str(fecha_venta),
                )
                if isr.get("ok"):
                    out["isr_total"] = isr.get("isr_total")
                    out["breakdown"]["isr"] = isr.get("breakdown")
            else:
                out["breakdown"]["isr_skipped_reason"] = "missing_purchase_or_sale_data"
        except Exception as exc:
            log.warning(f"[asistente_tool] isr failed: {exc}")
            out["breakdown"]["isr_error"] = str(exc)

    # ISAI comprador
    if mode in ("full", "isai"):
        try:
            if precio_venta:
                isai = calculate_isai_comprador(float(precio_venta), float(valor_catastral or 0))
                if isai.get("ok"):
                    out["isai"] = isai.get("isai")
                    out["breakdown"]["isai"] = isai.get("breakdown")
            else:
                out["breakdown"]["isai_skipped_reason"] = "missing_precio_venta"
        except Exception as exc:
            log.warning(f"[asistente_tool] isai failed: {exc}")
            out["breakdown"]["isai_error"] = str(exc)

    # Closing total
    if mode in ("full", "closing"):
        try:
            if precio_venta:
                closing = calculate_closing_cost_total(float(precio_venta), float(valor_catastral or 0))
                if closing.get("ok"):
                    out["closing_total"] = closing.get("total")
                    out["breakdown"]["closing"] = closing.get("breakdown")
            else:
                out["breakdown"]["closing_skipped_reason"] = "missing_precio_venta"
        except Exception as exc:
            log.warning(f"[asistente_tool] closing failed: {exc}")
            out["breakdown"]["closing_error"] = str(exc)

    # Predial y1
    if mode == "full":
        try:
            base_vc = float(valor_catastral or precio_venta or 0)
            if base_vc > 0:
                predial = project_predial_10y(base_vc)
                if predial.get("ok") and predial.get("items"):
                    out["predial_y1"] = predial["items"][0].get("predial_estimado")
                    out["breakdown"]["predial_anios"] = len(predial.get("items") or [])
        except Exception as exc:
            log.warning(f"[asistente_tool] predial failed: {exc}")
            out["breakdown"]["predial_error"] = str(exc)

    # Audit fail-soft
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "atlax_public", "role": "asistente"},
            action="tax_projection_query",
            entity_type="property" if property_id else "anon",
            entity_id=property_id or "ad-hoc",
            before=None,
            after={"mode": mode,
                   "caller_module": "asistente_query_tax_projection"},
        )
    except Exception:
        pass

    return out


async def _tool_query_climate_migration(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.9 — Climate Migration tool.

    Modes:
      - "heatmap_summary" (default): top 3 outflow + top 3 inflow zones.
      - "zone": detalle de una zona (heatmap entry + last pattern + narrative).
      - "patterns": top N patterns recientes resumidos.
    FAIL-SOFT: error → {error: str}.
    """
    mode = (params.get("mode") or "heatmap_summary").lower()
    if mode not in {"heatmap_summary", "zone", "patterns"}:
        mode = "heatmap_summary"

    try:
        from climate_migration_engine import (
            COLLECTION_HEATMAP,
            COLLECTION_PATTERNS,
        )

        if mode == "zone":
            zone_slug = (params.get("zone_slug") or "").strip()
            if not zone_slug:
                return {"error": "zone_slug required for mode=zone"}
            entry = await db[COLLECTION_HEATMAP].find_one(
                {"zone_slug": zone_slug}, {"_id": 0},
            )
            last_pattern = await db[COLLECTION_PATTERNS].find_one(
                {
                    "$or": [
                        {"origin_zone": zone_slug},
                        {"destination_zone": zone_slug},
                    ],
                },
                {"_id": 0},
                sort=[("detected_at", -1)],
            )
            narrative = ""
            if last_pattern:
                narrative = (
                    last_pattern.get("narrative_long")
                    or last_pattern.get("narrative_short")
                    or ""
                )
                v = last_pattern.get("detected_at")
                if hasattr(v, "isoformat"):
                    last_pattern["detected_at"] = v.isoformat()
                v = last_pattern.get("ttl_until")
                if hasattr(v, "isoformat"):
                    last_pattern["ttl_until"] = v.isoformat()

            if entry:
                for k in ("last_updated", "ttl_until"):
                    v = entry.get(k)
                    if hasattr(v, "isoformat"):
                        entry[k] = v.isoformat()

            result = {
                "mode": "zone",
                "zone_slug": zone_slug,
                "heatmap_entry": entry or {"note": "no_heatmap_data"},
                "last_pattern": last_pattern,
                "narrative": narrative,
                "source": "climate_migration_engine",
            }
        elif mode == "patterns":
            from datetime import datetime, timedelta, timezone
            days = int(params.get("days") or 90)
            days = max(1, min(days, 365))
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            patterns: List[Dict[str, Any]] = []
            cursor = db[COLLECTION_PATTERNS].find(
                {"detected_at": {"$gte": cutoff}},
                {"_id": 0, "pattern_id": 1, "origin_zone": 1, "destination_zone": 1,
                 "magnitude": 1, "climate_driver": 1, "confidence": 1,
                 "narrative_short": 1, "detected_at": 1},
            ).sort("detected_at", -1).limit(5)
            async for p in cursor:
                v = p.get("detected_at")
                if hasattr(v, "isoformat"):
                    p["detected_at"] = v.isoformat()
                patterns.append(p)
            result = {
                "mode": "patterns",
                "patterns": patterns,
                "total": len(patterns),
                "lookback_days": days,
                "source": "climate_migration_engine",
            }
        else:  # heatmap_summary
            zones: List[Dict[str, Any]] = []
            cursor = db[COLLECTION_HEATMAP].find({}, {"_id": 0}).limit(100)
            async for d in cursor:
                zones.append(d)
            top_outflow = sorted(
                zones, key=lambda z: int(z.get("outflow_score") or 0), reverse=True
            )[:3]
            top_inflow = sorted(
                zones, key=lambda z: int(z.get("inflow_score") or 0), reverse=True
            )[:3]
            for lst in (top_outflow, top_inflow):
                for z in lst:
                    for k in ("last_updated", "ttl_until"):
                        v = z.get(k)
                        if hasattr(v, "isoformat"):
                            z[k] = v.isoformat()
            result = {
                "mode": "heatmap_summary",
                "top_outflow_zones": [
                    {
                        "zone_slug": z.get("zone_slug"),
                        "zone_name": z.get("zone_name"),
                        "outflow_score": int(z.get("outflow_score") or 0),
                        "climate_drivers": z.get("climate_drivers") or [],
                    }
                    for z in top_outflow
                ],
                "top_inflow_zones": [
                    {
                        "zone_slug": z.get("zone_slug"),
                        "zone_name": z.get("zone_name"),
                        "inflow_score": int(z.get("inflow_score") or 0),
                        "climate_drivers": z.get("climate_drivers") or [],
                    }
                    for z in top_inflow
                ],
                "total_zones_cached": len(zones),
                "source": "climate_migration_engine",
            }

        # Audit best-effort
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": "atlax_public", "role": "asistente"},
                action="climate_migration_query",
                entity_type="climate_migration",
                entity_id=str(params.get("zone_slug") or mode),
                before=None,
                after={"mode": mode, "caller_module": "asistente_query_climate_migration"},
            )
        except Exception:
            pass

        # ai_budget tracking (no LLM tokens; analytics)
        try:
            from ai_budget import track_ai_call
            await track_ai_call(
                db, dev_org_id="atlax", model="none", tokens=0,
                call_type="climate_migration_query",
                feature_key="climate_migration_query",
            )
        except Exception:
            pass

        return result
    except Exception as e:
        log.warning(f"[asistente_tool] query_climate_migration: {e}")
        return {"error": str(e), "source": "climate_migration_engine"}


async def _tool_query_virtual_staging(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.17 — Virtual Staging stats tool.

    Modes:
      - "stats" (default): {total, by_style, cache_hit_rate}
      - "user": {user_total, last_used, recent_styles} · requires user_id
    """
    mode = (params.get("mode") or "stats").strip().lower()
    try:
        if mode == "user":
            user_id = params.get("user_id")
            if not user_id:
                return {"error": "user_id required for mode=user"}
            cursor = db.virtual_staging_cache.find(
                {"user_id": user_id}
            ).sort("generated_at", -1).limit(20)
            docs = await cursor.to_list(length=20)
            recent_styles: List[str] = []
            for d in docs:
                for img in d.get("staged_images", []) or []:
                    s = img.get("style")
                    if s:
                        recent_styles.append(s)
                if len(recent_styles) >= 10:
                    break
            last_used = None
            if docs:
                gen = docs[0].get("generated_at")
                try:
                    last_used = gen.isoformat() if hasattr(gen, "isoformat") else str(gen)
                except Exception:
                    last_used = None
            return {
                "user_total": len(docs),
                "last_used": last_used,
                "recent_styles": recent_styles[:10],
            }
        else:  # stats
            total = await db.virtual_staging_cache.count_documents({})
            pipeline = [
                {"$unwind": "$staged_images"},
                {"$group": {"_id": "$staged_images.style", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
            ]
            by_style: Dict[str, int] = {}
            try:
                async for d in db.virtual_staging_cache.aggregate(pipeline):
                    k = d.get("_id")
                    if k:
                        by_style[k] = d.get("count", 0)
            except Exception as agg_e:
                log.debug(f"[virtual_staging] by_style agg failed: {agg_e}")
            return {
                "total": total,
                "by_style": by_style,
                "cache_hit_rate": None,  # not tracked yet
            }
    except Exception as e:
        log.warning(f"[asistente_tool] query_virtual_staging: {e}")
        return {"error": str(e), "source": "virtual_staging_engine"}


async def _tool_query_studio_videos(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.16-A — Studio Video stats tool (TTS + scripts).

    Modes:
      - "stats" (default): {total_scripts, total_audios, total_cost_usd_30d, top_tone, top_duration}
      - "user": {scripts_count, quota} · requires dev_org_id
      - "voices": {voices_list, default_voice_id}
    """
    mode = (params.get("mode") or "stats").strip().lower()
    try:
        if mode == "voices":
            from adapters.tts.elevenlabs import list_voices_es_mx, DEFAULT_VOICE_ID
            return {"voices_list": list_voices_es_mx(), "default_voice_id": DEFAULT_VOICE_ID}

        if mode == "user":
            dev_org_id = params.get("dev_org_id")
            if not dev_org_id:
                return {"error": "dev_org_id required for mode=user"}
            scripts_count = await db.studio_video_scripts.count_documents({"dev_org_id": dev_org_id})
            from ai_budget import check_studio_video_quota
            quota = await check_studio_video_quota(db, dev_org_id)
            return {"scripts_count": scripts_count, "quota": quota}

        # default: stats
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        total_scripts = await db.studio_video_scripts.count_documents({})
        total_audios = await db.studio_video_audios.count_documents({})

        # cost 30d via ai_call_events feature_key=studio_video
        sum_cost = 0.0
        try:
            cursor = db.ai_call_events.find(
                {"feature_key": "studio_video", "ts": {"$gte": cutoff}},
                {"_id": 0, "cost_usd": 1},
            )
            async for ev in cursor:
                try:
                    sum_cost += float(ev.get("cost_usd") or 0)
                except (TypeError, ValueError):
                    continue
        except Exception as cost_e:
            log.debug(f"[studio_video] cost agg failed: {cost_e}")

        # top tone + top duration via aggregation
        top_tone = None
        top_duration = None
        try:
            async for d in db.studio_video_scripts.aggregate([
                {"$group": {"_id": "$tone", "n": {"$sum": 1}}},
                {"$sort": {"n": -1}},
                {"$limit": 1},
            ]):
                top_tone = d.get("_id")
            async for d in db.studio_video_scripts.aggregate([
                {"$group": {"_id": "$duration_sec", "n": {"$sum": 1}}},
                {"$sort": {"n": -1}},
                {"$limit": 1},
            ]):
                top_duration = d.get("_id")
        except Exception as agg_e:
            log.debug(f"[studio_video] agg failed: {agg_e}")

        return {
            "total_scripts": total_scripts,
            "total_audios": total_audios,
            "total_cost_usd_30d": round(sum_cost, 2),
            "top_tone": top_tone,
            "top_duration": top_duration,
        }
    except Exception as e:
        log.warning(f"[asistente_tool] query_studio_videos: {e}")
        return {"error": str(e), "source": "studio_video_engine"}


async def _tool_generate_studio_video(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.16-B — Generate multi-ratio video tool.

    Params:
      script (str, required) · image_url (str, optional) ·
      provider (luma|pika|runway|replicate_kling, default luma) ·
      duration_sec (30|60|90, default 60) ·
      dev_org_id (str, optional · si presente, aplica cap diario · si None, fail-open).
    Returns engine result dict (task_id, ratios, provider, is_stub, cost_usd, quota).
    """
    script = params.get("script")
    if not script or not isinstance(script, str) or not script.strip():
        return {"error": "script vacio o invalido"}
    image_url = params.get("image_url")
    provider = (params.get("provider") or "luma").strip().lower()
    try:
        duration_sec = int(params.get("duration_sec") or 60)
    except (TypeError, ValueError):
        duration_sec = 60
    dev_org_id = params.get("dev_org_id")
    user_id = params.get("user_id")
    try:
        from studio_video_engine import generate_video_multiratio
        return await generate_video_multiratio(
            db,
            dev_org_id=dev_org_id,
            script=script,
            image_url=image_url,
            provider=provider,
            duration_sec=duration_sec,
            user_id=user_id,
        )
    except Exception as e:
        log.warning(f"[asistente_tool] generate_studio_video: {e}")
        return {"error": str(e), "source": "studio_video_engine"}


# ── W6.MOV.5 · Construction Quality Index (tool #41) ─────────────────────────
async def _tool_query_construction_quality(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #41 query_construction_quality.

    Modes:
      - mode="index" + development_id → score + breakdown 4 dims
      - mode="top" + min_score?=70 + limit?=10 → top N developments by score
      - mode="stats" → globales superadmin (tiers distribution + coverage)
    """
    try:
        from construction_quality_engine import (
            compute_quality_index,
            list_developments_by_quality,
            get_stats,
        )
        mode = (params.get("mode") or "index").lower()
        if mode == "index":
            dev_id = params.get("development_id")
            if not dev_id:
                return {"error": "development_id requerido en mode=index"}
            result = await compute_quality_index(db, dev_id, use_cache=True)
            return {"source": "construction_quality_engine", "mode": "index", "result": result}
        if mode == "top":
            min_score = params.get("min_score", 70)
            limit = int(params.get("limit", 10))
            tier = params.get("tier")
            items = await list_developments_by_quality(db, min_score=float(min_score), tier=tier, limit=limit)
            return {"source": "construction_quality_engine", "mode": "top", "items": items, "count": len(items)}
        if mode == "stats":
            stats_data = await get_stats(db)
            return {"source": "construction_quality_engine", "mode": "stats", "stats": stats_data}
        return {"error": f"mode inválido: {mode} · usa index|top|stats"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_construction_quality: {e}")
        return {"error": str(e), "source": "construction_quality_engine"}


# ── W6.MOV.2 · Gov Data MX (tool #43) ────────────────────────────────────────
async def _tool_query_gov_data_mx(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #43 query_gov_data_mx.

    Modes:
      - mode="sources" → Track A status (6 connectors INEGI/BANXICO/etc)
      - mode="upload-list" + limit?+offset? → Track C uploads paginated
      - mode="stats" → aggregated stats Track A+B+C
    """
    try:
        from gov_data_mx_engine import get_all_sources, list_uploads, get_stats
        mode = (params.get("mode") or "sources").lower()
        if mode == "sources":
            data = await get_all_sources(db)
            return {"source": "gov_data_mx_engine", "mode": "sources", **data}
        if mode == "upload-list":
            limit = int(params.get("limit", 50))
            offset = int(params.get("offset", 0))
            data = await list_uploads(db, limit=limit, offset=offset)
            return {"source": "gov_data_mx_engine", "mode": "upload-list", **data}
        if mode == "stats":
            data = await get_stats(db)
            return {"source": "gov_data_mx_engine", "mode": "stats", "stats": data}
        return {"error": f"mode inválido: {mode} · usa sources|upload-list|stats",
                "source": "gov_data_mx_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_gov_data_mx: {e}")
        return {"error": str(e), "source": "gov_data_mx_engine"}


# ── W6.MOV.3 · Reviews Residentes (tool #42) ─────────────────────────────────
async def _tool_query_reviews_residents(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #42 query_reviews_residents.

    Modes:
      - mode="zone" + entity_id → sentiment breakdown + top quotes para zona
      - mode="development" + entity_id → sentiment breakdown + top quotes para desarrollo
      - mode="summary" + entity_id + entity_type → summary genérico
    """
    try:
        from reviews_residents_engine import aggregate_by_entity
        mode = (params.get("mode") or "zone").lower()
        entity_id = params.get("entity_id")
        if not entity_id:
            return {"error": "entity_id requerido", "source": "reviews_residents_engine"}
        if mode == "zone":
            entity_type = "zone"
        elif mode == "development":
            entity_type = "development"
        elif mode == "summary":
            entity_type = (params.get("entity_type") or "zone").lower()
            if entity_type not in ("zone", "development"):
                return {"error": "entity_type inválido · usa zone|development", "source": "reviews_residents_engine"}
        else:
            return {"error": f"mode inválido: {mode} · usa zone|development|summary", "source": "reviews_residents_engine"}
        result = await aggregate_by_entity(db, entity_type, entity_id)
        return {"source": "reviews_residents_engine", "mode": mode, "result": result}
    except Exception as e:
        log.warning(f"[asistente_tool] query_reviews_residents: {e}")
        return {"error": str(e), "source": "reviews_residents_engine"}


# ── W6.MOV.1 · SOC Franchise (tool #44) ──────────────────────────────────────
async def _tool_query_soc_franchise(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #44 query_soc_franchise.

    Modes:
      - mode="leaderboard" + level?  + limit?=20 → top N franquiciatarios
      - mode="my_score" + user_id     → score + breakdown 5 dims del asesor
      - mode="admin_stats"            → totales + tier distribution + movers
    """
    try:
        from soc_franchise_engine import (
            compute_soc_score,
            list_franchisees,
            get_stats,
        )
        mode = (params.get("mode") or "leaderboard").lower()
        if mode == "leaderboard":
            level = params.get("level")
            limit = int(params.get("limit", 20))
            # Atlax es público T0 · public_safe=True elimina PII (audit forense G.90 fix)
            items = await list_franchisees(db, level=level, limit=limit, public_safe=True)
            return {"source": "soc_franchise_engine", "mode": "leaderboard", "items": items, "count": len(items)}
        if mode == "my_score":
            user_id = params.get("user_id")
            if not user_id:
                return {"error": "user_id requerido en mode=my_score", "source": "soc_franchise_engine"}
            result = await compute_soc_score(db, user_id, use_cache=True)
            # Atlax es público T0 · sanitizar PII (audit forense G.90 fix)
            for pii_field in ("email", "tenant_id"):
                result.pop(pii_field, None)
            return {"source": "soc_franchise_engine", "mode": "my_score", "result": result}
        if mode == "admin_stats":
            stats_data = await get_stats(db)
            return {"source": "soc_franchise_engine", "mode": "admin_stats", "stats": stats_data}
        return {"error": f"mode inválido: {mode} · usa leaderboard|my_score|admin_stats", "source": "soc_franchise_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_soc_franchise: {e}")
        return {"error": str(e), "source": "soc_franchise_engine"}


# ── W6.AS.1 · Workflow Builder (tool #45) ───────────────────────────────────
async def _tool_query_workflow_builder(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #45 query_workflow_builder · modes list|stats|templates."""
    try:
        from datetime import datetime as _dt, timedelta as _td, timezone as _tz
        mode = (params.get("mode") or "list").lower()
        if mode == "list":
            owner = params.get("owner_user_id")
            q = {"deleted_at": None}
            if owner:
                q["owner_user_id"] = owner
            limit = int(params.get("limit", 20))
            cursor = db.workflows.find(q, {"_id": 0, "id": 1, "name": 1, "status": 1, "nodes": 1, "last_run_at": 1, "updated_at": 1}).sort("updated_at", -1).limit(limit)
            items_raw = await cursor.to_list(length=limit)
            items = []
            for it in items_raw:
                last_run = it.get("last_run_at")
                if isinstance(last_run, _dt):
                    last_run = last_run.isoformat()
                items.append({"id": it.get("id"), "name": it.get("name"), "status": it.get("status"), "nodes_count": len(it.get("nodes") or []), "last_run_at": last_run})
            return {"source": "workflow_engine", "mode": "list", "items": items, "count": len(items), "cap": 20}
        if mode == "stats":
            total = await db.workflows.count_documents({"deleted_at": None})
            active = await db.workflows.count_documents({"deleted_at": None, "status": "active"})
            paused = await db.workflows.count_documents({"deleted_at": None, "status": "paused"})
            draft = await db.workflows.count_documents({"deleted_at": None, "status": "draft"})
            cutoff = _dt.now(_tz.utc) - _td(days=30)
            runs_30 = await db.workflow_runs.count_documents({"started_at": {"$gte": cutoff}})
            done_30 = await db.workflow_runs.count_documents({"started_at": {"$gte": cutoff}, "status": "done"})
            success_pct = round((done_30 / runs_30) * 100, 1) if runs_30 else 0.0
            fired = 0
            try:
                cursor = db.workflow_runs.find({"started_at": {"$gte": cutoff}, "status": "done"}, {"_id": 0, "steps": 1}).limit(2000)
                async for r in cursor:
                    for s in (r.get("steps") or []):
                        if s.get("type") == "action":
                            fired += 1
            except Exception:
                pass
            return {"source": "workflow_engine", "mode": "stats", "total_workflows": total, "active": active, "paused": paused, "draft": draft, "runs_last_30d": runs_30, "success_rate_pct": success_pct, "fired_actions_30d": fired}
        if mode == "templates":
            templates = [
                {"key": "nurture_30d", "label": "Nurture 30 dias", "description": "5 toques distribuidos", "nodes_count": 10},
                {"key": "post_visit_24h", "label": "Post-visita 24h", "description": "WA 2h + email 24h", "nodes_count": 5},
                {"key": "winback_60d", "label": "Win-back 60d", "description": "WA + email + tarea", "nodes_count": 6},
                {"key": "cold_reactivation", "label": "Cold lead reactivation", "description": "Secuencia 3 toques", "nodes_count": 7},
                {"key": "birthday", "label": "Birthday", "description": "WA personalizado", "nodes_count": 3},
            ]
            return {"source": "workflow_engine", "mode": "templates", "items": templates, "count": len(templates)}
        return {"error": f"mode invalido: {mode}", "source": "workflow_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_workflow_builder: {e}")
        return {"error": str(e), "source": "workflow_engine"}


# ── W6.MOV.4 · Marketing Distribution MCP (tool #46) ─────────────────────────
async def _tool_query_marketing_mcp(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tool #46 query_marketing_mcp.

    Modes:
      - mode="status"  → adapters config + rate_limits (NO publishes)
      - mode="history" + days?=30 + limit?=50 → últimos publishes
      - mode="stats"   → totals + by_platform + scheduled_pending + cache_entries
    """
    try:
        from marketing_mcp_engine import adapter_status, get_history, get_stats
        mode = (params.get("mode") or "status").lower()
        if mode == "status":
            return {"source": "marketing_mcp_engine", "mode": "status", "adapters": adapter_status()}
        if mode == "history":
            days = int(params.get("days", 30))
            limit = int(params.get("limit", 50))
            items = await get_history(db, days=days, limit=limit)
            return {"source": "marketing_mcp_engine", "mode": "history",
                    "items": items, "count": len(items), "days": days}
        if mode == "stats":
            stats_data = await get_stats(db)
            return {"source": "marketing_mcp_engine", "mode": "stats", "stats": stats_data}
        return {"error": f"mode inválido: {mode} · usa status|history|stats",
                "source": "marketing_mcp_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_marketing_mcp: {e}")
        return {"error": str(e), "source": "marketing_mcp_engine"}


# ── W6.5 · Project Wizard duplication (tool #47) ─────────────────────────────
async def _tool_query_project_wizard(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W6.5 · Tool #47 · Project Wizard duplication queries.

    Modes:
      - mode="templates"          → list duplicable templates (per tenant if provided)
      - mode="duplicate_history"  → recent duplications (per tenant if provided)
    """
    try:
        from project_wizard_engine import list_templates, get_duplicate_history

        mode = (params.get("mode") or "templates").lower()
        tenant_id = params.get("tenant_id")
        limit = int(params.get("limit", 20))

        if mode == "templates":
            items = await list_templates(db, tenant_id=tenant_id, limit=limit)
            return {"source": "project_wizard_engine", "mode": "templates",
                    "items": items, "count": len(items)}
        if mode == "duplicate_history":
            items = await get_duplicate_history(db, tenant_id=tenant_id, limit=limit)
            return {"source": "project_wizard_engine", "mode": "duplicate_history",
                    "items": items, "count": len(items)}
        return {"error": f"mode inválido: {mode} · usa templates|duplicate_history",
                "source": "project_wizard_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_project_wizard: {e}")
        return {"error": str(e), "source": "project_wizard_engine"}


async def _tool_query_marketplace_templates(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W6.4 · Tool #48 · Marketplace Templates queries.

    Modes:
      - mode="list"          → catálogo público approved (filtrable category/price_tier/sort)
      - mode="my_published"  → templates del caller (cualquier status)
      - mode="revenue_stats" → revenue del caller (advisor) o global (superadmin)
    """
    try:
        from marketplace_templates_engine import (
            get_revenue_stats,
            list_templates,
        )

        mode = (params.get("mode") or "list").lower()
        limit = int(params.get("limit", 20))

        if mode == "list":
            return await list_templates(
                db,
                category=params.get("category"),
                price_tier=params.get("price_tier"),
                sort=(params.get("sort") or "popular"),
                limit=limit,
            )

        if mode == "my_published":
            author_id = params.get("author_user_id") or params.get("user_id")
            if not author_id:
                return {"error": "author_user_id requerido para my_published",
                        "source": "marketplace_templates_engine"}
            cursor = db.marketplace_templates.find(
                {"author_user_id": author_id, "deleted_at": None}, {"_id": 0},
            ).sort("published_at", -1).limit(limit)
            items = await cursor.to_list(length=limit)
            from marketplace_templates_engine import _serialize
            return {"source": "marketplace_templates_engine", "mode": "my_published",
                    "items": [_serialize(d) for d in items], "count": len(items)}

        if mode == "revenue_stats":
            author_id = params.get("author_user_id") or params.get("user_id")
            res = await get_revenue_stats(db, author_user_id=author_id)
            return {"source": "marketplace_templates_engine", "mode": "revenue_stats", **res}

        return {"error": f"mode inválido: {mode} · usa list|my_published|revenue_stats",
                "source": "marketplace_templates_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_marketplace_templates: {e}")
        return {"error": str(e), "source": "marketplace_templates_engine"}


async def _tool_query_hook_predictor(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W5.22 Z.5 · Tool #49 · Hook Predictor standalone (3 modos).

    Modes:
      - mode="score"        → predice score 4-dim para un texto (FAIL-OPEN heurística)
      - mode="stats"        → stats agregadas del caller (user_id / tenant_id)
      - mode="global_stats" → stats agregadas globales (intended superadmin)
    """
    try:
        from hook_predictor_engine import (
            DEFAULT_THRESHOLD,
            get_stats,
            get_stats_global,
            predict_hook_score,
        )

        mode = (params.get("mode") or "score").lower()

        if mode == "score":
            text = (params.get("text") or "").strip()
            if not text:
                return {"error": "text requerido para mode=score",
                        "source": "hook_predictor_engine"}
            res = await predict_hook_score(
                db,
                text=text[:500],
                target_audience=params.get("target_audience"),
            )
            return {"source": "hook_predictor_engine", "mode": "score", **res}

        days = int(params.get("days") or 30)

        if mode == "stats":
            user_id = params.get("user_id") or params.get("author_user_id")
            tenant_id = params.get("tenant_id")
            res = await get_stats(db, user_id=user_id, tenant_id=tenant_id, days=days)
            return {"source": "hook_predictor_engine", "mode": "stats",
                    "threshold": DEFAULT_THRESHOLD, **res}

        if mode == "global_stats":
            res = await get_stats_global(db, days=days)
            return {"source": "hook_predictor_engine", "mode": "global_stats",
                    "threshold": DEFAULT_THRESHOLD, **res}

        return {"error": f"mode inválido: {mode} · usa score|stats|global_stats",
                "source": "hook_predictor_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_hook_predictor: {e}")
        return {"error": str(e), "source": "hook_predictor_engine"}


async def _tool_query_reputation_monitor(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W7.AS.6 · Tool #50 · Reputation Monitor queries.

    Modes:
      - mode="mentions" → list filtered (sentiment/source/days/limit)
      - mode="stats"    → aggregate (total · by_source · by_sentiment · top_negative · alerts_7d)
      - mode="trend"    → trend_7d daily counts + aggregate snapshot
    """
    try:
        from reputation_monitor_engine import (
            COLLECTION_ALERTS,
            COLLECTION_MENTIONS,
            SENTIMENTS,
            SOURCES,
            aggregate_stats,
        )
        from datetime import datetime, timedelta, timezone

        mode = (params.get("mode") or "stats").lower()
        days = int(params.get("days") or 30)
        days = max(1, min(days, 365))
        limit = int(params.get("limit") or 20)
        limit = max(1, min(limit, 100))

        if mode == "stats":
            stats = await aggregate_stats(db, days=days)
            try:
                cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
                stats["alerts_triggered_7d"] = int(await db[COLLECTION_ALERTS].count_documents(
                    {"triggered_at": {"$gte": cutoff_7d}},
                ) or 0)
            except Exception:
                stats["alerts_triggered_7d"] = 0
            return {"source": "reputation_monitor_engine", "mode": "stats", **stats}

        if mode == "trend":
            stats = await aggregate_stats(db, days=days)
            return {
                "source": "reputation_monitor_engine",
                "mode": "trend",
                "trend_7d": stats.get("trend_7d") or [],
                "total_mentions": stats.get("total_mentions") or 0,
                "by_sentiment": stats.get("by_sentiment") or {},
            }

        if mode == "mentions":
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            q: Dict[str, Any] = {"found_at": {"$gte": cutoff}}
            sent = params.get("sentiment")
            if sent and sent in SENTIMENTS:
                q["sentiment"] = sent
            src = params.get("source")
            if src and src in SOURCES:
                q["source"] = src
            items = []
            try:
                cursor = db[COLLECTION_MENTIONS].find(q, {"_id": 0}).sort(
                    "found_at", -1,
                ).limit(limit)
                async for d in cursor:
                    v = d.get("found_at")
                    if hasattr(v, "isoformat"):
                        d["found_at"] = v.isoformat()
                    items.append(d)
            except Exception as exc:
                log.debug(f"[asistente_tool] reputation mentions fail: {exc}")
            return {
                "source": "reputation_monitor_engine",
                "mode": "mentions",
                "items": items,
                "total": len(items),
            }

        return {"error": f"mode inválido: {mode} · usa mentions|stats|trend",
                "source": "reputation_monitor_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_reputation_monitor: {e}")
        return {"error": str(e), "source": "reputation_monitor_engine"}


# ── W7.AS.1 · Lead Enrichment (tool #51) ─────────────────────────────────────
async def _tool_query_lead_enrichment(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """W7.AS.1 · Tool #51 · Lead Enrichment Clay-style (3 modos)."""
    try:
        from lead_enrichment_engine import (
            enrich_lead,
            get_cached_enrichment,
            get_stats,
        )

        mode = (params.get("mode") or "enrich-now").lower()

        if mode == "enrich-now":
            lead_id = params.get("lead_id")
            if not lead_id:
                return {"error": "lead_id requerido para mode=enrich-now",
                        "source": "lead_enrichment_engine"}
            actor = {
                "user_id": params.get("user_id") or "asistente",
                "role": params.get("role") or "advisor",
            }
            res = await enrich_lead(
                db,
                lead_id=lead_id,
                tenant_id=params.get("tenant_id"),
                actor=actor,
                force_refresh=bool(params.get("force_refresh", False)),
                is_superadmin=(params.get("role") == "superadmin"),
            )
            return {"source": "lead_enrichment_engine", "mode": "enrich-now", **res}

        if mode == "cache-status":
            lead_id = params.get("lead_id")
            if not lead_id:
                return {"error": "lead_id requerido para mode=cache-status",
                        "source": "lead_enrichment_engine"}
            res = await get_cached_enrichment(db, lead_id)
            return {"source": "lead_enrichment_engine", "mode": "cache-status", **res}

        if mode == "stats":
            days = int(params.get("days") or 30)
            res = await get_stats(
                db, tenant_id=params.get("tenant_id"), days=days,
            )
            return {"source": "lead_enrichment_engine", "mode": "stats", **res}

        return {"error": f"mode inválido: {mode} · usa enrich-now|cache-status|stats",
                "source": "lead_enrichment_engine"}
    except Exception as e:
        log.warning(f"[asistente_tool] query_lead_enrichment: {e}")
        return {"error": str(e), "source": "lead_enrichment_engine"}


# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("atlax_chat", plan_tier="free",       monthly_price_mxn=0,   category="ai",          name="Atlax Chat")
