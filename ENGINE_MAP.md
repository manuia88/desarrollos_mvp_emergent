# ENGINE MAP — el mapa motor-por-motor (GOAL EN LOOP: 100% visibles back+front, conectados)

**Objetivo:** dar visibilidad (backend endpoint + frontend) e hiper-segmentar el 100% de los motores relevantes al cubo de
inteligencia de mercado. No a la mitad, no 6. Este doc es el TRACKER persistente: se actualiza cada tanda.

**Arquitectura (escalable, sin 120 UIs a mano):** un **hub genérico** (`engines_hub.py`) con un REGISTRO por motor
(id · módulo · función · params · qué produce · eje del cubo · estado). Endpoints `/engines/catalog` y `/engines/run`.
Una pestaña **"Motores"** lista el catálogo agrupado, corre cualquiera y muestra su salida hiper-segmentada. Los de mayor
valor además se integran como dimensiones/indicadores del cubo.

**Estado:** ⬜ por cablear · 🟦 en hub (runnable+visible) · ✅ integrado al cubo (dimensión/indicador) · ⬛ otro portal (fuera de Terminal).

**Progreso:** 19 / ~120 cube-relevantes en hub (TANDA 1 ✅ · TANDA 2 ✅ geo+forecast+inversión: catastro 2593 predios·riesgo natural·percibido·zone_score·perfil_zona·dmx_indices·drpi·live_pulse·score_inversion_top·invest_baseline·comercio_pb·due_diligence). ~22 con dato real.

---

## PRECIO / VALUACIÓN (16)
- ⬜ hedonic_regression_engine — precio hedónico por feature (modelo) · QUÉ/PRECIO
- ⬜ dmx_hedonic_atom — átomo hedónico granular · CUBO
- ⬜ avm_public_engine — AVM por colonia *(ya usado en biografía/atlas, falta como dimensión)* · PRECIO
- ⬜ avm_explain_engine — explicabilidad del AVM (drivers) · PRECIO
- ⬜ avm_feature_engine — features del AVM · PRECIO
- ⬜ cma_engine — análisis comparativo de mercado · PRECIO
- ⬜ cma_pdf_renderer — reporte CMA (PDF) · PRECIO
- ⬜ market_estimate_engine — estimación de mercado · PRECIO
- ⬜ price_context_engine — contexto de precio · PRECIO
- ⬜ valores_unitarios_engine — valores unitarios · PRECIO
- ⬜ valor_residual_engine — valor residual del suelo · PRECIO
- ⬜ norma3_engine — upside Norma 3 · PRECIO
- ⬜ accuracy_engine — exactitud del modelo · PRECIO/META
- ⬜ model_validation_engine — validación de modelo · PRECIO/META
- ⬜ golden_calibration_engine — calibración golden · PRECIO/META
- ⬜ fsd_engine — desviación estándar del forecast (confianza) · FORECAST/META

## GEO / EXTERNO (20)
- ⬜ osm_engine — POIs / score 15-min *(estaba marcado "por_crear" en el registro — EXISTE)* · DÓNDE
- ⬜ catastro_sig_engine — catastro/SIG a nivel predio *(idem "por_crear" — EXISTE)* · DÓNDE
- ⬜ sig_catastro_engine — SIG catastro · DÓNDE
- ⬜ shf_engine — índice de precios SHF (oficial, benchmark institucional) · DÓNDE/PRECIO
- ⬜ dmx_indices_engine — índices DMX · DÓNDE
- ⬜ state_of_cdmx_engine — estado de CDMX · DÓNDE
- ⬜ gov_data_mx_engine — datos de gobierno MX · DÓNDE
- ⬜ maps_engine / maps_cross_engine — mapas / cruces espaciales · DÓNDE
- ⬜ natural_risk_engine — riesgo natural (sísmico/inundación) · RIESGO
- ⬜ crime_data_engine / crime_fgj_engine — crimen (FGJ) · RIESGO
- ⬜ perception_risk_engine — riesgo percibido · RIESGO
- ⬜ climate_migration_engine — migración climática · DÓNDE/RIESGO
- ⬜ zone_cycle_engine — fase de ciclo de zona · CUÁNDO
- ⬜ zone_score_engine — score de zona · DÓNDE
- ⬜ zone_subscores_compute — subscores de zona · DÓNDE
- ⬜ perfil_zona_engine — perfil de zona · DÓNDE
- ⬜ score_engine — score genérico · DÓNDE
- ⬜ risk_score_engine — score de riesgo *(usado en demand_intelligence)* · RIESGO

## DEMANDA / COMPRADOR (16)
- ⬜ demanda_demografica_engine — demanda demográfica *(estaba "por_crear" — EXISTE)* · QUIÉN
- ⬜ grafo_comprador_engine — grafo de comprador / sustitución (Sankey real) · QUIÉN
- ⬜ bancabilidad_engine — capacidad de crédito *(estaba "latente" — EXISTE)* · QUIÉN
- ⬜ buyer_score_engine — score de comprador · QUIÉN
- ⬜ buyer_coach_engine — coach del comprador · QUIÉN
- ⬜ preferencias_engine — preferencias · QUIÉN
- ⬜ taste_profile / visitor_taste — modelo de gusto · QUIÉN
- ⬜ behavioral_tracking_engine — comportamiento · QUIÉN
- ⬜ hook_predictor_engine — predictor de enganche · QUIÉN
- ⬜ reverse_search_engine — búsqueda inversa · QUIÉN
- ⬜ churn_prediction_engine — abandono · QUIÉN
- ⬜ lead_journey_engine — journey del lead · QUIÉN/EMBUDO
- ⬜ demand_twin_engine — gemelo de demanda *(usado parcial)* · QUIÉN
- ⬜ fit_engine — match/fit · QUIÉN
- ⬜ mood_engine — ánimo del comprador · QUIÉN
- ⬜ captacion_value_engine — valor de captación · QUIÉN

## FORECAST / SEÑALES (15)
- ⬜ forecast_engine — pronóstico · CUÁNDO/SEÑALES
- ⬜ predictive_alerts_engine — alertas predictivas · SEÑALES
- ⬜ anomaly_detection_engine — anomalías · SEÑALES
- ⬜ comparable_anomaly_engine — anomalía de comparables *(usado)* · SEÑALES
- ⬜ live_pulse_engine — pulso vivo (Bloomberg) · SEÑALES
- ⬜ drpi_engine — DRPI (forecast snapshots) · SEÑALES
- ⬜ cerebro_mercado_engine — cerebro del mercado · SEÑALES
- ⬜ estudio_mercado_engine — estudio de mercado · SEÑALES
- ⬜ terminal_mercado_engine — terminal de mercado · SEÑALES
- ⬜ external_insights_engine — insights externos · SEÑALES
- ⬜ intelligence_insights_engine — insights de inteligencia · SEÑALES
- ⬜ insights_factcheck_engine — fact-check de insights · SEÑALES/META
- ⬜ narrative_engine / narrative_layer_engine — narrativa · SEÑALES
- ⬜ newsletter_pulse_engine — pulso newsletter · SEÑALES

## CUBO / GRAFO (8)
- ⬜ cube_olap_engine — OLAP completo (681 líneas) · CUBO
- ⬜ metrics_cube_aggregations — agregaciones del cubo · CUBO
- ⬜ knowledge_graph_engine — grafo de propiedad · CUBO
- ⬜ transaction_network_engine — red de transacciones · CUBO
- ⬜ entity_resolution_engine — resolución de entidades · CUBO
- ⬜ dmx_cube_feed — feed del cubo · CUBO
- ⬜ cross_check_engine — cruce de verificación · CUBO
- ⬜ cross_sell_engine — venta cruzada · CUBO

## INVERSIÓN / COSTO (19)
- ⬜ investment_simulator_engine — simulador de inversión (1140 líneas) · INVERSIÓN
- ⬜ inversion_v4_finance / inversion_v4_tax / inversion_v4_veredicto — inversión institucional · INVERSIÓN
- ⬜ inversionista_engine — inversionista · INVERSIÓN
- ⬜ tax_projector_engine — proyección fiscal · INVERSIÓN
- ⬜ ownership_economics_engine — cuotas/predial/costo de propiedad *(estaba "por_crear" — EXISTE)* · EXPERIENCIA
- ⬜ house_pool_engine — pool de casas · INVERSIÓN
- ⬜ lote_veredicto_engine — veredicto de lote · INVERSIÓN
- ⬜ predio_due_diligence_engine — due diligence de predio · RIESGO/INVERSIÓN
- ⬜ score_inversion_engine — score de inversión *(usado)* · INVERSIÓN
- ⬜ absorcion_engine — absorción *(usado)* · OFERTA
- ⬜ probability_engine — probabilidad de venta *(usado)* · FORECAST
- ⬜ close_probability — probabilidad de cierre · FORECAST
- ⬜ battle_card_engine — battle card competitivo *(usado)* · OFERENTE
- ⬜ construction_cost_engine — costo de construcción *(usado)* · PRECIO/COSTO
- ⬜ construction_quality_engine — calidad de construcción · EXPERIENCIA
- ⬜ market_rates_engine — tasas de mercado *(usado en composites)* · PRECIO
- ⬜ simulador_palancas_engine — simulador de palancas *(usado)* · SEÑALES

## OTROS cube-relevant en "otros" (a confirmar/cablear) (~12)
- ⬜ whatif_engine — what-if (motor real, distinto de mi whatif.py) · SEÑALES
- ⬜ marketplace_granularity — 20 granularidades avanzadas *(ya hay endpoint /granular-advanced)* · varios
- ⬜ unidad_insights_engine — insights por unidad · QUÉ
- ⬜ generador_producto_engine — generador de producto (auto-arquitecto alterno) · INVERSIÓN
- ⬜ amenidades_engine — amenidades · QUÉ
- ⬜ comparator_engine — comparador · varios
- ⬜ dmx_demand / dmx_margin / dmx_project_score / dmx_dev_benchmark — átomos DMX · varios
- ⬜ health_score — salud · META
- ⬜ payment_schemes — esquemas de pago *(usado en buscador)* · PRECIO
- ⬜ reviews_residents_engine / reputation_monitor_engine — reseñas/reputación · EXPERIENCIA
- ⬜ fraud_detection_engine — fraude · RIESGO

---

## ⬛ OTROS PORTALES (mapeados, fuera del Terminal — ya viven en su portal)
studio_* (landing/video/carrusel/brand_kit/buyer_copy/hook/engines) · social_ads/cards · virtual_staging · brochure ·
briefing · newsletter · whatsapp · resend · stripe_billing · ai_quota/ai_budget · feature_flags/gate · private_beta ·
soc_franchise · workflow_engine · rag_engine · drive_engine · notifications · lead_capture*/nurture/enrichment ·
smart_lists · pipeline · asesor_digest · conversation_*/director_*/voice_atlax/atlax_*/asistente · auto_pilot/auto_sync ·
bulk_ingest · bulletins · compliance · audit_immutable · anonymization · mcp_*/marketing_mcp · vertical_products ·
marketplace_templates · widget_embed · parallax · tour_3dgs · diagnostic · extraction · apify_trends · ab_testing · free_audit

---

## PLAN DEL LOOP (por tandas, hasta 100%)
1. **Hub + catálogo + 1ª tanda** (precio/valuación: hedónico, AVM-explain, CMA, market_estimate, valores_unitarios, valor_residual, norma3, fsd).
2. Geo/externo (OSM, catastro, SHF, índices, riesgo natural, crimen, ciclo, scores de zona).
3. Demanda/comprador (demográfica, grafo, bancabilidad, taste, reverse_search, churn, journey…).
4. Forecast/señales (forecast, live_pulse, drpi, alertas, anomalías, cerebro, estudio…).
5. Cubo/grafo (OLAP, knowledge_graph, transaction_network, entity_resolution…).
6. Inversión/costo (investment_simulator, inversion_v4, tax, ownership, due_diligence…).
7. Otros cube-relevant + integración profunda de los de mayor valor como dimensiones/indicadores.
8. Frontend: pestaña "Motores" (catálogo agrupado + runner + salida hiper-segmentada) creciendo cada tanda.
