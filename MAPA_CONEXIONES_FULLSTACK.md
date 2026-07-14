# MAPA DE CONEXIONES FULL-STACK (v2) — cómo está CABLEADO (2026-07-13)
Extraído del código: front→endpoint→archivo-de-ruta→motores→colecciones · motor↔motor · matriz de portales por colección.

## Números del cableado
- Funciones de API front mapeadas: **367** · Endpoints backend detectados: **921** ({'superadmin': 239, 'asesor': 88, 'publico/marketplace': 476, 'dev': 118})
- Módulos backend analizados: **480** · Colecciones Mongo tocadas: **431**
- Aristas motor→motor: **993**

## A · Columna vertebral (motores más importados por otros)
- **data_developments** ← 94 módulos
- **llm_client** ← 46 módulos
- **audit_immutable_engine** ← 45 módulos
- **ai_budget** ← 41 módulos
- **data_seed** ← 33 módulos
- **notifications_engine** ← 27 módulos
- **cron_heartbeat** ← 23 módulos
- **server** ← 14 módulos
- **zone_score_engine** ← 13 módulos
- **director_memory_engine** ← 11 módulos
- **dmx_unit_schema** ← 11 módulos
- **forecast_engine** ← 10 módulos
- **market_4s_bridge** ← 9 módulos
- **audit_log** ← 9 módulos
- **investment_simulator_engine** ← 9 módulos
- **feature_registry** ← 9 módulos
- **cerebro_mercado_engine** ← 9 módulos
- **demand_mirror** ← 9 módulos
- **avm_public_engine** ← 8 módulos
- **buyer_score_engine** ← 8 módulos
- **rag_context_helper** ← 8 módulos
- **document_intelligence** ← 8 módulos
- **market_timeline** ← 8 módulos
- **ratelimit** ← 7 módulos
- **fs_fallback** ← 7 módulos

## B · Colecciones COMPARTIDAS entre portales (quién escribe → quién lee)
Barrido COMPLETO (725 archivos: motores+services+RUTAS+scripts) · 536 colecciones. Top 40 por conectividad:

| Colección | Escriben | Leen |
|---|---|---|
| `leads` | (28) asistente_engine, auto_nurture_cron, conversation_engine, entity_resolution_engine, feedback_signals, investment_simulator_engine… | (92) accuracy_engine, ai_suggestions, asistente_engine, auto_nurture_cron, availability, battle_card_engine… |
| `users` | (16) routes/asesor_identity, routes/auth, routes/comprador, routes/dev_batch3, routes/private_beta, routes/superadmin_ai_cost… | (100) ai_quota_engine, ai_suggestions, asesor_digest_engine, auto_pilot_engine, battle_card_cron, briefing_engine… |
| `developments` | (5) bulk_ingest_engine, construction_quality_engine, routes/construction_quality, routes/dev_project_full, scripts/seed_w6_construction_quality | (79) absorcion_engine, asistente_engine, bulk_ingest_engine, buyer_coach_engine, construction_quality_cron, construction_quality_engine… |
| `colonias` | (6) colonia_data_polish, colonias_catalog, resale_data, sig_catastro_engine, valores_unitarios_engine, zone_data_cron | (41) avm_predios_engine, catastro_sig_engine, colonia_data_polish, colonia_valoracion_engine, colonias_catalog, comercial_value_model… |
| `ie_scores` | (2) granularity_backfill, score_engine | (32) asistente_engine, auto_sync_engine, composite_metrics, cube_query_libre, diagnostic_engine, director_agent_engine… |
| `buyer_signals` | (5) routes/buyer_signals, routes/comprador, routes/favoritos, routes/public, routes/whatsapp_copiloto | (29) compare_engine, cube_olap_engine, demand_genome, demand_graph_engine, demand_intelligence, demand_mirror… |
| `units` | (3) bulk_ingest_engine, routes/superadmin_alta, routes/wizard | (29) ai_suggestions, asistente_engine, bulk_ingest_engine, cube_olap_engine, director_agent_engine, dmx_cube_feed… |
| `appointments` | (5) availability, routes/advisor, routes/dev_batch4_1, routes/dev_batch4_3, services/calendar_bidirectional | (24) ai_suggestions, asesor_digest_engine, availability, buyer_score_engine, health_score, routes/advisor… |
| `projects` | (6) project_wizard_engine, projects_unified, routes/developer, routes/superadmin_alta, routes/wizard, scripts/seed_w6_quick_wins | (23) ingested_reader, project_wizard_engine, projects_unified, routes/asesor_playbook, routes/dev_batch10, routes/dev_batch14… |
| `marketplace_searches` | (7) advisor_demand_bridge, demand_feedback, routes/buyer_signals, routes/external_search, routes/marketplace_search, routes/perfil_recomendar… | (19) advisor_demand_bridge, demand_genome, demand_intelligence, demand_twin_engine, dmx_demand, explorador… |
| `audit_log` | (10) atlax_persona_engine, audit_log, lead_journey_engine, routes/conversation_drift, routes/dev_batch1, routes/free_audit… | (14) anomaly_detection_engine, audit_log, health_score, routes/atlax_persona, routes/dev_batch11, routes/dev_batch14… |
| `cube_aggregations` | (1) metrics_cube_aggregations | (23) anomaly_detection_engine, anonymization_engine, construction_cost_engine, cube_olap_engine, data_lake_etl, drpi_engine… |
| `drpi_snapshots` | (1) drpi_engine | (20) bulletins_engine, cma_engine, demand_intelligence, drpi_engine, forecast_engine, forecast_retrain_cron… |
| `asesor_contactos` | (4) copilot_events, routes/advisor, routes/dev_batch4_1, services/lead_bridge | (16) auto_pilot_engine, briefing_engine, close_probability, close_probability_tuning, conversation_engine, copilot_events… |
| `behavioral_events` | (1) behavioral_tracking_engine | (18) ab_testing_engine, asistente_engine, battle_card_engine, behavioral_tracking_engine, buyer_score_engine, churn_prediction_engine… |
| `transactions` | (2) scripts_backfill_transactions, transaction_network_engine | (16) anonymization_engine, data_doctrine, drpi_engine, fraud_detection_engine, grid_engine, hedonic_regression_engine… |
| `developer_unit_overrides` | (5) routes/advisor, routes/dev_batch1, routes/dev_batch11, routes/developer, routes/subagents | (13) cube_olap_engine, cube_query_libre, demand_intelligence, routes/dev_batch1, routes/dev_batch10, routes/dev_batch11… |
| `asesor_busquedas` | (4) advisor_demand_bridge, auto_pilot_engine, routes/advisor, vistas_guardadas | (13) advisor_demand_bridge, amenidades_engine, briefing_engine, close_probability, demand_genome, grafo_comprador_engine… |
| `zone_scores` | (2) zone_score_engine, zone_subscores_cron | (15) avm_public_engine, brochure_engine, cube_query_libre, maps_engine, picks_engine, routes/investment_explorer… |
| `system_alerts` | (10) bulletins_engine, compliance_engine, crime_data_engine, data_lake_etl, drpi_engine, fraud_detection_engine… | (5) cron_heartbeat, fraud_detection_engine, routes/superadmin_founder_console, routes/superadmin_health, stripe_billing_engine |
| `hedonic_models` | (2) avm_retrain_cron, hedonic_regression_engine | (12) avm_explain_engine, avm_public_engine, avm_retrain_cron, free_audit_engine, fsd_engine, hedonic_regression_engine… |
| `notifications` | (8) notifications_engine, routes/b13, routes/dev_batch14, routes/dev_batch2, routes/dev_batch4, routes/dev_batch4_1… | (6) demand_intelligence, notifications_engine, routes/dev_batch2, routes/dev_batch4_3, routes/dev_batch4_4, routes/diagnostic |
| `inmobiliaria_internal_users` | (6) routes/dev_batch4_1, scripts/prod_db_hardening, server, services/inmobiliaria_relationships, services/inmobiliaria_signup, services/internal_users | (7) lead_journey_engine, routes/dev_batch4_1, routes/inmobiliaria, services/directory_aggregator, services/internal_users, services/lead_bridge… |
| `health_scores` | (1) health_score | (11) ai_suggestions, health_score, routes/dev_batch14, routes/insights, routes/team_aggregated, services/asesor_metrics… |
| `denue_zone_density` | (2) google_places_ingest, osm_engine | (10) atlax_blocks, colonias_catalog, google_places_ingest, hedonic_regression_engine, osm_engine, perfil_zona_engine… |
| `inmobiliarias` | (4) routes/dev_batch4_1, routes/superadmin_tenants, services/inmobiliaria_signup, services/mini_market_engine | (8) routes/dev_batch4_1, routes/inmobiliaria, routes/superadmin_tenants, server, services/directory_aggregator, services/internal_users… |
| `lead_captures` | (2) mood_engine, services/lead_capture | (9) asistente_engine, climate_migration_engine, fit_engine, predictive_alerts_cron, predictive_alerts_engine, routes/fit… |
| `di_documents` | (2) extraction_engine, routes/documents | (9) auto_sync_engine, cross_check_engine, dev_assets, extraction_engine, rag_engine, routes/dev_project_full… |
| `buyer_scores` | (1) buyer_score_engine | (9) asistente_engine, buyer_score_engine, close_probability, conversation_engine, fit_engine, routes/advisor… |
| `project_assets` | (4) bulk_ingest_engine, routes/diagnostic, server, services/image_embeddings | (6) ingested_reader, routes/dev_batch14, routes/public, routes/superadmin_alta, server, services/image_embeddings |
| `demand_atoms` | (1) demand_genome | (9) demand_genome, demand_graph_engine, demand_mirror, market_scores_engine, market_timeline, ola_d_engines… |
| `dev_assets` | (2) dev_assets, routes/documents | (8) dev_assets, routes/dev_batch1, routes/dev_batch10, routes/dev_batch16, routes/dev_project_full, routes/documents… |
| `saved_searches` | (2) routes/comprador, services/saved_searches | (8) routes/comprador, routes/diagnostic, scheduler_saved_search_alerts, services/buyer_alerts, services/comprador_dashboard, services/lead_to_asesor_match… |
| `dev_orgs` | (3) routes/superadmin_alta, routes/superadmin_tenants, services/mini_market_engine | (7) routes/superadmin_alta, routes/superadmin_tenants, routes/wizard, services/directory_aggregator, services/internal_users, services/lead_capture… |
| `bulk_ingest_jobs` | (5) bulk_ingest_engine, routes/bulk_ingest, scripts_examen2_runner, scripts_examen3_final, scripts_verify_cr151 | (4) anomaly_detection_engine, bulk_ingest_engine, routes/bulk_ingest, routes/superadmin_founder_console |
| `dev_competitor_price_snapshots` | (4) bulk_ingest_engine, historic_miner, routes/dev_batch2, scripts_deca_backfill | (5) battle_card_engine, historic_miner, ingested_reader, routes/dev_batch2, scripts_deca_backfill |
| `colonia_valoracion` | (2) colonia_valoracion_engine, gentrification_engine | (7) cube_query_libre, ingested_reader, picks_engine, routes/dmx_indices, routes/mapa_capas, routes/picks… |
| `price_events` | (3) historic_miner, routes/dev_price_history, scripts_deca_backfill | (6) composite_metrics, historic_miner, routes/dev_price_history, routes/public, routes/superadmin_alta, scripts_deca_backfill |
| `conversation_threads` | (2) conversation_confidence_score, conversation_engine | (7) conversation_cost_stats_engine, conversation_drift_detector, conversation_engine, conversation_kb_gaps_engine, conversation_self_tuning, routes/conversation… |
| `tenant_features` | (3) feature_flags_engine, routes/feature_visibility, trial_expiry_cron | (6) dmx_plans, feature_flags_engine, routes/superadmin_commercial, routes/superadmin_founder_console, routes/superadmin_tenants, trial_expiry_cron |

## C · FLUJOS CROSS-PORTAL (marketplace/asesor/dev → superadmin) — barrido completo
- `marketplace_searches` — búsquedas del MARKETPLACE (Atlax/filtros/perfil/externa)
  - escriben (7): advisor_demand_bridge, demand_feedback, routes/buyer_signals, routes/external_search, routes/marketplace_search, routes/perfil_recomendar, routes/public
  - leen (19): advisor_demand_bridge, demand_genome, demand_intelligence, demand_twin_engine, dmx_demand, explorador, facet_engine, google_places_ingest, grafo_comprador_engine, grid_engine, market_4s_prior, marketplace_granularity, routes/buyer_signals, routes/casamentera
- `buyer_signals` — señales del MARKETPLACE (vistas/fotos/likes/leads/WhatsApp)
  - escriben (5): routes/buyer_signals, routes/comprador, routes/favoritos, routes/public, routes/whatsapp_copiloto
  - leen (29): compare_engine, cube_olap_engine, demand_genome, demand_graph_engine, demand_intelligence, demand_mirror, engines_batch_demanda, entity_atlas, explorador, facet_engine, grafo_comprador_engine, grid_engine, live_pulse_cron, marketplace_granularity
- `registros_interes` — lead-magnets de LANDING
  - escriben (1): routes/public
  - leen (1): demand_genome
- `asesor_busquedas` — búsquedas de clientes del ASESOR
  - escriben (4): advisor_demand_bridge, auto_pilot_engine, routes/advisor, vistas_guardadas
  - leen (13): advisor_demand_bridge, amenidades_engine, briefing_engine, close_probability, demand_genome, grafo_comprador_engine, health_score, pipeline_drift_personal, routes/advisor, server, services/copilot_context, services/demand_engine, vistas_guardadas
- `asesor_contactos` — CRM del asesor
  - escriben (4): copilot_events, routes/advisor, routes/dev_batch4_1, services/lead_bridge
  - leen (16): auto_pilot_engine, briefing_engine, close_probability, close_probability_tuning, conversation_engine, copilot_events, grafo_comprador_engine, health_score, pipeline_drift_personal, routes/advisor, routes/favoritos, routes/whatsapp_copiloto, services/copilot_context, services/lead_bridge
- `units_history` — cambios de unidad del DEV (manual/Drive/webhook/bulk)
  - escriben (1): units_history
  - leen (5): data_doctrine, routes/dev_batch10, routes/dev_sales_intel, routes/superadmin_metrics_cube, units_history
- `developments` — inventario (ingesta+dev)
  - escriben (5): bulk_ingest_engine, construction_quality_engine, routes/construction_quality, routes/dev_project_full, scripts/seed_w6_construction_quality
  - leen (79): absorcion_engine, asistente_engine, bulk_ingest_engine, buyer_coach_engine, construction_quality_cron, construction_quality_engine, demand_intelligence, demand_mirror, dev_memory_engine, developer_track_record_engine, director_agent_engine, dmx_cube_feed, estudio_mercado_engine, fit_engine
- `leads` — leads de los 3 portales
  - escriben (28): asistente_engine, auto_nurture_cron, conversation_engine, entity_resolution_engine, feedback_signals, investment_simulator_engine, lead_capture_engine, lead_journey_engine, pipeline_engine, pipeline_migration_script, routes/advisor, routes/asesor_identity, routes/b13, routes/buyer_signals
  - leen (92): accuracy_engine, ai_suggestions, asistente_engine, auto_nurture_cron, availability, battle_card_engine, buyer_score_engine, conversation_engine, demand_feedback, demand_intelligence, director_agent_engine, entity_resolution_cron, entity_resolution_engine, feedback_signals
- `demand_atoms` — EL GENOMA (destino común de demanda)
  - escriben (1): demand_genome
  - leen (9): demand_genome, demand_graph_engine, demand_mirror, market_scores_engine, market_timeline, ola_d_engines, ola_e_engines, ola_f_engines, ola_g_products
- `oferta_timeline` — LA BITÁCORA (destino común de oferta)
  - escriben (1): market_timeline
  - leen (3): demand_mirror, market_timeline, ola_g_products
- `contexto_timeline` — clima diario (tasas+pm2 por colonia)
  - escriben (1): market_timeline
  - leen (2): market_timeline, ola_g_products
- `genoma_predicciones` — la báscula (predicciones multi-motor)
  - escriben (1): ola_f_engines
  - leen (1): ola_f_engines
- `lead_temperaturas` — termómetro de leads
  - escriben (1): ola_d_engines
  - leen (1): ola_d_engines
- `cube_actions` — despachos AUTORIZADOS superadmin → dev/asesor
  - escriben (1): activacion
  - leen (1): activacion
- `reportes_guardados` — memoria de reportes/estudios DMX
  - escriben (1): report_builder
  - leen (1): report_builder

## D · Front → endpoints por PORTAL (página → APIs que consume)

### SUPERADMIN (73 superficies con API)
- **AbTestCreateModal (comp)** → 1 endpoints: `/api/superadmin/ab-testing/create`
- **CatalogProjectDrawer** → 1 endpoints: `/api/superadmin/catalog-pulse/project`
- **CompetenciaRed** → 1 endpoints: `/api/superadmin/devmaster/competencia-red`
- **Comportamiento** → 1 endpoints: `/api/superadmin/devmaster/comportamiento`
- **ConnectModal (comp)** → 1 endpoints: `/api/superadmin/data-sources`
- **CubeAtomView (comp)** → 1 endpoints: `/api/superadmin/demand-intel/vistas`
- **CubeEquilibrioView (comp)** → 9 endpoints: `/api/superadmin/cubo-4s/brief` · `/api/superadmin/cubo-4s/brief/despachar` · `/api/superadmin/cubo-4s/catalogo` · `/api/superadmin/cubo-4s/comparar` · `/api/superadmin/cubo-4s/dimensiones` · `/api/superadmin/cubo-4s/nano` · `/api/superadmin/market-4s/consumidor` · `/api/superadmin/market-4s/load` …
- **CubeHistoriaView (comp)** → 1 endpoints: `/api/superadmin/demand-intel/timeseries`
- **CubeReportesView (comp)** → 6 endpoints: `/api/superadmin/cubo-4s/catalogo` · `/api/superadmin/genoma/estudio-dmx` · `/api/superadmin/reportes/bloques` · `/api/superadmin/reportes/generar` · `/api/superadmin/reportes/guardado` · `/api/superadmin/reportes/guardados`
- **DesarrollosPanorama** → 2 endpoints: `/api/superadmin/devmaster/brief` · `/api/superadmin/devmaster/home`
- **DocumentsPage** → 3 endpoints: `/api/developments` · `/api/superadmin/cross-checks/stats/global` · `/api/superadmin/documents`
- **DondeConstruir** → 1 endpoints: `/api/superadmin/devmaster/donde-construir`
- **FraudAlertCard (comp)** → 1 endpoints: `/api/superadmin/fraud-alerts`
- **FsdDistributionTab (comp)** → 1 endpoints: `/api/superadmin/audit/log`
- **GustoMercado** → 2 endpoints: `/api/superadmin/copiloto/intel` · `/api/superadmin/devmaster/gusto-mercado`
- **LivePulseMapTab (comp)** → 1 endpoints: `/api/maps/layers/zone_score`
- **MacroCiudad** → 1 endpoints: `/api/superadmin/devmaster/macro-ciudad`
- **ObservabilidadIA** → 2 endpoints: `/api/superadmin/devmaster/activar-modelo` · `/api/superadmin/devmaster/observabilidad-ia`
- **PhaseYControlsPanel (comp)** → 1 endpoints: `/api/superadmin/phase-y`
- **QuickActionsToolbar (comp)** → 1 endpoints: `/api/superadmin/tenants`
- **RiskAlertCard (comp)** → 2 endpoints: `/api/superadmin/risk-alerts` · `/api/superadmin/risk-alerts/timeline`
- **StockSoldOut** → 1 endpoints: `/api/superadmin/devmaster/stock-soldout`
- **StripeSubscriptionPanel (comp)** → 1 endpoints: `/api/superadmin/stripe`
- **SuperadminAbTesting (comp)** → 4 endpoints: `/api/superadmin/ab-testing` · `/api/superadmin/ab-testing/list` · `/api/superadmin/ab-testing/pick-winner` · `/api/superadmin/ab-testing/results`
- **SuperadminAiCost** → 3 endpoints: `/api/superadmin/narratives/batch-generate` · `/api/superadmin/narratives/budget` · `/api/superadmin/narratives/regenerate`
- **SuperadminAltaDesarrolladores** → 6 endpoints: `/api/superadmin/alta/desarrollador` · `/api/superadmin/alta/desarrolladores` · `/api/superadmin/alta/proyecto` · `/api/superadmin/bulk-ingest/jobs` · `/api/superadmin/bulk-ingest/upload` · `/api/superadmin/drive/connections`
- **SuperadminApiKeys** → 1 endpoints: `/api/superadmin/api-keys`
- **SuperadminAvmAccuracy** → 5 endpoints: `/api/superadmin/avm-accuracy/cache-invalidate` · `/api/superadmin/avm-accuracy/golden-validation` · `/api/superadmin/avm-accuracy/promotions` · `/api/superadmin/avm-accuracy/summary` · `/api/superadmin/avm-accuracy/trigger-retrain`
- **SuperadminBulkIngest** → 2 endpoints: `/api/superadmin/alta/desarrollador` · `/api/superadmin/alta/desarrolladores`
- **SuperadminBulletins** → 3 endpoints: `/api/bulletins` · `/api/superadmin/bulletins/generate` · `/api/superadmin/bulletins/list`
- **SuperadminCatalogPulse** → 1 endpoints: `/api/superadmin/catalog-pulse/dashboard`
- **SuperadminCommercial** → 1 endpoints: `/api/superadmin/tenants`
- **SuperadminCompliance** → 3 endpoints: `/api/superadmin/compliance/audit-trail` · `/api/superadmin/compliance/cross-org` · `/api/superadmin/compliance/dsr-requests`
- **SuperadminConstructionQuality** → 4 endpoints: `/api/construction-quality` · `/api/superadmin/construction-quality/manual-override` · `/api/superadmin/construction-quality/refresh` · `/api/superadmin/construction-quality/stats`
- **SuperadminConversationCost (comp)** → 1 endpoints: `/api/superadmin/conversation-cost`
- **SuperadminConversationDrift (comp)** → 2 endpoints: `/api/superadmin/confidence/stats` · `/api/superadmin/conversation-drift`
- **SuperadminConversations (comp)** → 4 endpoints: `/api/conversation` · `/api/superadmin/conversations/list` · `/api/superadmin/conversations/stats` · `/api/superadmin/conversations/takeover`
- **SuperadminCopilot (comp)** → 1 endpoints: `/api/asesor/superadmin/copilot`
- **SuperadminCrossSellAnalytics** → 2 endpoints: `/api/superadmin/cross-sell/analytics` · `/api/superadmin/cross-sell/revenue-events/manual`
- **SuperadminDRPI** → 3 endpoints: `/api/superadmin/drpi/coefficients` · `/api/superadmin/drpi/list` · `/api/superadmin/drpi/recompute`
- **SuperadminDataLicensing** → 2 endpoints: `/api/superadmin/data-licensing/bundles` · `/api/superadmin/data-licensing/subscriptions`
- **SuperadminDataSourcesHub** → 4 endpoints: `/api/insights/courses` · `/api/superadmin/insights/courses` · `/api/superadmin/insights/cron-status` · `/api/superadmin/insights/refresh`
- **SuperadminDesarrolladorFicha** → 3 endpoints: `/api/superadmin/alta/desarrollador` · `/api/superadmin/alta/proyecto` · `/api/superadmin/devmaster/project`
- **SuperadminDesarrolloFicha** → 2 endpoints: `/api/superadmin/devmaster/project` · `/api/superadmin/tenants`
- **SuperadminDesarrollos** → 3 endpoints: `/api/superadmin/devmaster/pending-approval` · `/api/superadmin/devmaster/project` · `/api/superadmin/devmaster/projects`
- **SuperadminForecastAccuracy** → 3 endpoints: `/api/superadmin/forecast-accuracy/per-zone` · `/api/superadmin/forecast-accuracy/run-backtest` · `/api/superadmin/forecast-accuracy/summary`
- **SuperadminFounderConsole** → 1 endpoints: `/api/superadmin/devmaster/equipo-en-riesgo`
- **SuperadminFraudAlerts** → 2 endpoints: `/api/superadmin/fraud-alerts` · `/api/superadmin/fraud-alerts/scan`
- **SuperadminFreeAuditFunnel** → 1 endpoints: `/api/free-audit/admin/export.csv`
- **SuperadminGovDataMx** → 4 endpoints: `/api/superadmin/gov-data-mx/cron-status` · `/api/superadmin/gov-data-mx/refresh` · `/api/superadmin/gov-data-mx/sources` · `/api/superadmin/gov-data-mx/stats`
- **SuperadminHealth** → 4 endpoints: `/api/superadmin/health/alerts` · `/api/superadmin/health/alerts/test` · `/api/superadmin/health/crons` · `/api/superadmin/health/overview`
- **SuperadminInmobiliariaLeads** → 2 endpoints: `/api/superadmin/inmobiliaria/asesores` · `/api/superadmin/inmobiliaria/leads`
- **SuperadminInvestmentExplorer** → 1 endpoints: `/api/superadmin/investment-explorer/zones`
- **SuperadminInvites** → 3 endpoints: `/api/superadmin/invites` · `/api/superadmin/invites/generate` · `/api/superadmin/waitlist`
- **SuperadminKbGaps (comp)** → 3 endpoints: `/api/superadmin/kb-gaps/add-faq` · `/api/superadmin/kb-gaps/dismiss-gap` · `/api/superadmin/kb-gaps/list`
- **SuperadminLandingLeads** → 5 endpoints: `/api/superadmin/landing-leads` · `/api/superadmin/landing-leads/by-zone` · `/api/superadmin/landing-leads/export.csv` · `/api/superadmin/landing-leads/summary` · `/api/superadmin/phase-y/settings-overview`
- **SuperadminMarketingMcp** → 5 endpoints: `/api/superadmin/marketing-mcp/history` · `/api/superadmin/marketing-mcp/publish` · `/api/superadmin/marketing-mcp/schedule` · `/api/superadmin/marketing-mcp/scheduled` · `/api/superadmin/marketing-mcp/stats`
- **SuperadminMarketplaceTemplates** → 3 endpoints: `/api/superadmin/marketplace/templates` · `/api/superadmin/marketplace/templates/admin-stats` · `/api/superadmin/marketplace/templates/list`
- **SuperadminObservabilityPage** → 5 endpoints: `/api/_internal/observability/status` · `/api/_internal/test-sentry` · `/api/director/memory/retrieve` · `/api/superadmin/director/memory/stats` · `/api/superadmin/subagents`
- **SuperadminPartners** → 1 endpoints: `/api/superadmin/partners`
- **SuperadminProyectoFicha** → 1 endpoints: `/api/superadmin/alta/proyecto`
- **SuperadminReputationMonitor** → 5 endpoints: `/api/superadmin/reputation/alerts-history` · `/api/superadmin/reputation/mark-mention` · `/api/superadmin/reputation/mentions` · `/api/superadmin/reputation/scan-now` · `/api/superadmin/reputation/stats`
- **SuperadminReviewsResidents** → 4 endpoints: `/api/reviews/summary` · `/api/superadmin/reviews` · `/api/superadmin/reviews/scrape` · `/api/superadmin/reviews/stats`
- **SuperadminRiskAlerts** → 1 endpoints: `/api/superadmin/risk-alerts`
- **SuperadminRiskScore** → 2 endpoints: `/api/superadmin/risk-score/all` · `/api/superadmin/risk-score/recompute`
- **SuperadminSocFranchise** → 4 endpoints: `/api/soc-franchise/leaderboard` · `/api/superadmin/soc-franchise/certify` · `/api/superadmin/soc-franchise/revoke` · `/api/superadmin/soc-franchise/stats`
- **SuperadminSocialCards** → 2 endpoints: `/api/social-cards` · `/api/superadmin/social-cards/stats`
- **SuperadminTenants** → 1 endpoints: `/api/superadmin/tenants`
- **SuperadminTerminalMercado** → 1 endpoints: `/api/modelo/espejo`
- **SuperadminVerticalProducts** → 2 endpoints: `/api/superadmin/api-keys` · `/api/v1/verticals`
- **SuperadminWidgetEmbeds** → 1 endpoints: `/api/superadmin/widgets/embed-stats`
- **UnitDemandPanel (comp)** → 1 endpoints: `/api/superadmin/devmaster/demanda-unidades`
- **UploadModal (comp)** → 1 endpoints: `/api/superadmin/data-sources`

### ASESOR (27 superficies con API)
- **AsesorCMA** → 1 endpoints: `/api/asesor-identity/me/slug`
- **AsesorCommandCenter** → 1 endpoints: `/api/asesor/cube-actions`
- **AsesorDailyFeed (comp)** → 1 endpoints: `/api/asesor/daily-feed`
- **AsesorDemandaMapa (comp)** → 1 endpoints: `/api/buyer/demanda-mapa`
- **AsesorInventario** → 2 endpoints: `/api/asesor/whitelist/authorized-devs` · `/api/developments`
- **AsesorMarketplace** → 1 endpoints: `/api/developments`
- **AsesorMetricas** → 1 endpoints: `/api/asesor/copilot/metrics`
- **AsesorMiniMarket** → 2 endpoints: `/api/asesor/whitelist/me` · `/api/developments`
- **AsesorMisAliados** → 1 endpoints: `/api/asesor/mis-aliados`
- **AsesorOportunidades** → 1 endpoints: `/api/asesor/market/oportunidades`
- **AsesorOutbound** → 4 endpoints: `/api/lead-journey/bulk-reroute` · `/api/lead-journey/outbound-available` · `/api/lead-journey/stats` · `/api/leads`
- **AsesorPerfil** → 4 endpoints: `/api/asesor/disc/me` · `/api/asesor/endorsements/me` · `/api/asesor/linkedin/me` · `/api/asesor/trust-score/me`
- **AsesorTareas** → 1 endpoints: `/api/asesor/tareas/reorder`
- **CalendarSettings** → 5 endpoints: `/api/asesor/calendar/sync-now` · `/api/asesor/calendar/sync-status` · `/api/asesor/calendar/webhook/subscribe` · `/api/oauth` · `/api/oauth/connections`
- **ClientInsightsTab (comp)** → 1 endpoints: `/api/asesor/lead`
- **ConversationInbox** → 10 endpoints: `/api/agent-workforce/run-now` · `/api/asesor/atlax-settings` · `/api/asesor/busquedas` · `/api/asesor/contactos` · `/api/asesor/conversations/unified` · `/api/asesor/copilot/feedback` · `/api/asesor/copilot/metrics` · `/api/asesor/tareas` …
- **ConversationPlayground** → 3 endpoints: `/api/conversation/handoff` · `/api/conversation/message` · `/api/conversation/start`
- **DiscTestModal (comp)** → 1 endpoints: `/api/asesor/disc/submit`
- **EndorsementsCard (comp)** → 2 endpoints: `/api/asesor/endorsements` · `/api/public/endorsements`
- **LinkedInImportModal (comp)** → 3 endpoints: `/api/asesor/linkedin` · `/api/asesor/linkedin/import` · `/api/asesor/linkedin/me`
- **LinksTracking** → 3 endpoints: `/api/asesor/tracking-links` · `/api/asesor/tracking-links/qrcode` · `/api/asesor/tracking-links/stats`
- **PicksMunicion (comp)** → 1 endpoints: `/api/picks`
- **PlaybookProyecto** → 1 endpoints: `/api/asesor/proyecto`
- **PropertyFitLeadsPage** → 1 endpoints: `/api/developments`
- **SolicitudAccesoModal (comp)** → 1 endpoints: `/api/asesor/whitelist/request`
- **TrafficBriefingWidget (comp)** → 1 endpoints: `/api/asesor/briefing/traffic`
- **VisitAutoPrepCard (comp)** → 2 endpoints: `/api/asesor/visit-briefing` · `/api/asesor/visit-briefing/generate`

### DEV (23 superficies con API)
- **AutoApproveSettings (comp)** → 2 endpoints: `/api/dev/auto-approve-rule` · `/api/dev/auto-approve-rule/simulate`
- **AutoAssignments** → 1 endpoints: `/api/appointments/metrics`
- **AvanceObraTab (comp)** → 1 endpoints: `/api/desarrollador/developments`
- **CitasPolicies** → 6 endpoints: `/api/appointments/availability` · `/api/appointments/policy` · `/api/dev/internal-users` · `/api/dev/projects/list-with-stats` · `/api/oauth/advisor-pool` · `/api/oauth/connections`
- **ContenidoTab (comp)** → 3 endpoints: `/api/desarrollador/developments` · `/api/dev/projects` · `/api/developments`
- **CrmAssistantStrip (comp)** → 1 endpoints: `/api/dev/whitelist/pending`
- **DesarrolladorConfiguracion** → 1 endpoints: `/api/dev/erp-webhooks`
- **DesarrolladorCrossPartnerships** → 1 endpoints: `/api/cross-partnerships`
- **DesarrolladorDashboard** → 1 endpoints: `/api/panel/weekly-brief`
- **DesarrolladorDisputas** → 3 endpoints: `/api/dev/disputes` · `/api/dev/disputes/history` · `/api/dev/disputes/pending`
- **DesarrolladorFeedback** → 1 endpoints: `/api/dev/feedback-index`
- **DesarrolladorLegajo** → 2 endpoints: `/api/desarrollador/developments` · `/api/developments`
- **DesarrolladorMiniMarket** → 2 endpoints: `/api/dev/mini-market` · `/api/dev/settings/external-inventory`
- **DesarrolladorRedComercial** → 3 endpoints: `/api/dev/disputes/pending` · `/api/dev/red-comercial` · `/api/dev/whitelist/pending`
- **DesarrolladorSolicitudes** → 3 endpoints: `/api/dev/whitelist` · `/api/dev/whitelist/all` · `/api/dev/whitelist/bulk-approve`
- **DesarrolladorUsuarios** → 2 endpoints: `/api/dev/internal-users` · `/api/dev/internal-users/invitations`
- **DeveloperBattleCard** → 1 endpoints: `/api/dev/battle-card`
- **DiagnosticPanel (comp)** → 2 endpoints: `/api/comparable-alerts/dev` · `/api/diagnostic/dev`
- **LegalTab (comp)** → 1 endpoints: `/api/desarrollador/developments`
- **ProyectoDetail** → 2 endpoints: `/api/developments` · `/api/tour-3dgs/scans`
- **RecommendationBanner (comp)** → 1 endpoints: `/api/recommendations/top`
- **RiskScoreBreakdown (comp)** → 1 endpoints: `/api/risk-score/zone`
- **SoyPickBanner (comp)** → 1 endpoints: `/api/picks/lookup`

### MARKETPLACE (34 superficies con API)
- **BuySignal (comp)** → 1 endpoints: `/api/public/buy-signal`
- **ColoniaHistoryTab (comp)** → 1 endpoints: `/api/public/colonia`
- **ColoniaQuizModal (comp)** → 1 endpoints: `/api/public/quiz/submit`
- **ColoniaReportModal (comp)** → 1 endpoints: `/api/public/colonia`
- **ComplianceBadge (comp)** → 1 endpoints: `/api/developments`
- **DMXMarketIndex (comp)** → 1 endpoints: `/api/public/market/index`
- **DemandaZonaCard (comp)** → 1 endpoints: `/api/public/pulso-zona`
- **DevelopmentCard (comp)** → 1 endpoints: `/api/developments`
- **Favoritos** → 6 endpoints: `/api/buyer/favoritos` · `/api/buyer/favoritos/cita` · `/api/buyer/favoritos/nota` · `/api/buyer/favoritos/quitar` · `/api/buyer/registrar` · `/api/developments`
- **FichaCockpit** → 1 endpoints: `/api/developments`
- **FichaDesarrollo** → 1 endpoints: `/api/developments`
- **FichaVenta** → 6 endpoints: `/api/buyer/registrar` · `/api/developments` · `/api/precio-contexto` · `/api/precio-posicion-batch` · `/api/public/payment-schemes` · `/api/tour-3dgs/scans`
- **Fundamentales** → 1 endpoints: `/api/zona`
- **GeneralidadesDev (comp)** → 1 endpoints: `/api/public/buy-signal`
- **Ideas** → 1 endpoints: `/api/ideas`
- **ImageSearchModal (comp)** → 1 endpoints: `/api/public/search/by-image`
- **Indice** → 3 endpoints: `/api/indice` · `/api/lo-mas-buscado` · `/api/modelo/espejo`
- **Inteligencia** → 1 endpoints: `/api/investment-simulator/score/top-colonias`
- **Mapa** → 6 endpoints: `/api/catastro/predios-bbox` · `/api/colonia-watch` · `/api/colonias` · `/api/colonias-geojson` · `/api/developments` · `/api/mapa/capa`
- **MarketValueCard (comp)** → 1 endpoints: `/api/public/market/amenity-ranker`
- **Marketplace** → 7 endpoints: `/api/buyer/alertas` · `/api/buyer/parecidos` · `/api/colonias` · `/api/developments` · `/api/developments/casi` · `/api/properties/espejo-corte` · `/api/properties/search-ai`
- **MortgageCalculator (comp)** → 2 endpoints: `/api/public/mortgage/calculate` · `/api/public/mortgage/save`
- **OportunidadPanel (comp)** → 1 endpoints: `/api/zona`
- **OwnershipCalculator (comp)** → 1 endpoints: `/api/public/ownership`
- **ParecidosCerraron (comp)** → 1 endpoints: `/api/buyer/parecidos-cerraron`
- **PerfilLente (comp)** → 1 endpoints: `/api/zona`
- **Picks** → 5 endpoints: `/api/picks` · `/api/picks/backtest` · `/api/picks/para-ti` · `/api/picks/track-record` · `/api/picks/unidades`
- **PropertyDetail** → 2 endpoints: `/api/colonias` · `/api/properties`
- **RiesgosHonestos (comp)** → 1 endpoints: `/api/inversion-v4/zona-contexto`
- **RiskScoreFullBadge (comp)** → 1 endpoints: `/api/risk-score/zone`
- **SaveSearchModal (comp)** → 1 endpoints: `/api/public/saved-search`
- **Screener** → 2 endpoints: `/api/comprador/analyses` · `/api/screener`
- **UrlSearchModal (comp)** → 1 endpoints: `/api/public/search/by-url`
- **VeredictoDesarrollo (comp)** → 1 endpoints: `/api/public/buy-signal`

### COMPRADOR (5 superficies con API)
- **CompradorAlertas** → 2 endpoints: `/api/comprador/alerts` · `/api/comprador/alerts/deliveries`
- **CompradorChat** → 1 endpoints: `/api/chat/threads`
- **CompradorComparador** → 2 endpoints: `/api/comprador/compare` · `/api/comprador/compare/pdf`
- **CompradorRadar** → 1 endpoints: `/api/users`
- **CompradorWrapped** → 2 endpoints: `/api/comprador/wrapped` · `/api/comprador/wrapped/annual-optin`

## E · Archivo de ruta → motores que usa (backend)
- **server.py** → ai_budget, ai_quota_engine, ai_suggestions, anomaly_detection_engine, apify_trends_engine, asesor_indexes, asistente_engine, atlax_engine, atlax_persona_engine, audit_immutable_engine, audit_log, auto_nurture_cron, auto_sync_engine, avm_retrain_cron …
- **advisor.py** → asesor_digest_engine, audit_log, auto_sync_engine, avm_public_engine, captacion_value_engine, churn_prediction_engine, close_probability, coaching_analysis, conversation_disc_adapter, conversation_engine, copilot_events, data_seed, demand_feedback, inversionista_engine …
- **public.py** → absorcion_engine, ai_budget, anonymization_engine, bulk_ingest_engine, catastro_sig_engine, climate_migration_engine, colonia_valoracion_engine, connectors_ie, cube_lens, cube_marketplace_bridge, data_developments, data_seed, dev_assets, dmx_unit_schema …
- **equilibrium.py** → brief_4s_engine, consumer_4s_engine, cube_4s_engine, demand_genome, demand_graph_engine, demand_mirror, equilibrium_engine, market_4s_bridge, market_4s_facts, market_4s_loader, market_4s_prior, market_4s_transfer, market_scores_engine, market_timeline …
- **developer.py** → audit_log, bancabilidad_engine, cross_check_engine, data_developments, data_seed, dev_guard, llm_client, observability, resale_data, server, services/buyer_identity, services/csrf_guard, services/demand_engine, tenant_scope …
- **dev_batch7.py** → ai_budget, audit_log, branding_helpers, data_developments, data_seed, feature_gate_engine, kg_query_helper, llm_client, observability, server, services/ai_safety, services/llm_guard, services/query_limits
- **dev_batch6.py** → ai_budget, audit_log, data_developments, data_seed, ingested_reader, llm_client, observability, server, services/ai_safety, services/llm_guard, services/query_limits, tenant_scope
- **dev_batch11.py** → ai_budget, avm_public_engine, cerebro_mercado_engine, construction_cost_engine, data_developments, fsd_engine, llm_client, observability, server, services/llm_guard, tenant_scope, unidad_insights_engine
- **buyer_signals.py** → anonymization_engine, audit_log, data_developments, data_seed, parallax_engine, photo_tagger, server, services/lead_bridge, services/ratelimit, services/visitor_identity, tenant_scope, visitor_taste
- **dev_batch8.py** → ai_budget, audit_log, data_developments, feature_gate_engine, ingested_reader, llm_client, observability, server, services/ai_safety, services/llm_guard, tenant_scope
- **documents.py** → audit_log, auto_sync_engine, cross_check_engine, data_developments, dev_assets, document_intelligence, extraction_engine, observability, server, tenant_dev_map, tenant_scope
- **estudio_mercado.py** → absorcion_engine, amenidades_engine, data_seed, estudio_autopiloto_engine, estudio_mercado_engine, estudio_pdf_renderer, inversionista_engine, perfil_zona_engine, preferencias_engine, server, simulador_palancas_engine
- **dev_batch4_1.py** → audit_log, branding_helpers, data_developments, knowledge_graph_engine, observability, rate_limit, server, services/ai_safety, services/lead_bridge, tenant_scope
- **dev_batch4_2.py** → audit_log, data_developments, data_scoping, lead_journey_engine, observability, pipeline_engine, server, services/ai_safety, services/lead_capture, tenant_scope
- **wizard.py** → ai_budget, data_developments, diagnostic_engine, document_intelligence, drive_engine, fs_fallback, llm_client, observability, payment_schemes, server
- **dev_batch5.py** → ai_budget, audit_log, branding_helpers, data_developments, llm_client, observability, server, services/ai_safety, services/llm_guard, tenant_scope
- **dev_batch2.py** → audit_log, data_developments, data_scoping, feature_gate_engine, ingested_reader, observability, server, shf_engine, tenant_scope
- **dev_batch1.py** → audit_log, data_developments, dev_guard, ingested_reader, observability, ratelimit, server, services/ai_safety, tenant_scope
- **asesor_identity.py** → rate_limit, ratelimit, server, services/disc_test, services/endorsements, services/lead_bridge, services/linkedin_import, services/trust_score
- **superadmin_metrics_cube.py** → audit_log, cron_heartbeat, data_developments, dmx_cube_feed, dmx_hedonic_atom, feature_registry, generador_producto_engine, server
- **feature_visibility.py** → ab_testing_engine, audit_immutable_engine, feature_dependencies, feature_legacy_adapter, feature_registry, feature_usage_analytics, permissions, ratelimit
- **comprador.py** → data_developments, fit_engine, ratelimit, server, services/buyer_history, services/comprador_dashboard, services/privacy_center, services/visitor_identity
- **battle_card.py** → audit_immutable_engine, battle_card_engine, data_developments, feature_registry, ingested_reader, ratelimit, server, tenant_scope
- **dev_batch4_3.py** → audit_log, branding_helpers, data_developments, observability, rate_limit, ratelimit, server, tenant_scope
- **dev_batch4_4.py** → ai_budget, audit_log, data_developments, llm_client, observability, server, tenant_scope
- **studio_landing.py** → asistente_engine, data_developments, rate_limit, ratelimit, studio_landing_atlax_adapter, studio_landing_brochure_pdf, studio_landing_property_templates
- **knowledge_graph.py** → audit_immutable_engine, feature_registry, kg_anomaly_detector, kg_etl, kg_template_registry, knowledge_graph_engine, permissions
- **superadmin_devmaster.py** → audit_log, churn_prediction_engine, data_developments, data_seed, disc_inferencer_landing, permissions, taste_profile
- **dev_batch14.py** → ai_budget, data_developments, health_score, llm_client, server, services/llm_guard, tenant_scope
- **public_api_v1.py** → audit_log, bancabilidad_engine, cube_lens, grafo_comprador_engine, permissions, server, terminal_mercado_engine
- **dmx_indices.py** → anonymization_engine, data_developments, data_seed, live_pulse_engine, market_4s_bridge, permissions, server
- **landings.py** → compliance_consent, data_developments, data_seed, lead_capture_engine, ratelimit, seo_landings_config, server
- **insights.py** → data_developments, investment_simulator_engine, server, services/insights_ai, services/insights_comparables, services/insights_engagement, tenant_scope
- **dev_batch3.py** → audit_log, data_developments, ingested_reader, observability, server, services/ai_safety
- **superadmin_founder_console.py** → ai_cost_aggregations, audit_log, data_developments, demand_twin_engine, generador_producto_engine, server
- **conversation.py** → ai_budget, conversation_engine, ratelimit, server, services/llm_guard, tenant_scope
- **dev_batch10.py** → data_developments, data_seed, ingested_reader, observability, server, tenant_scope
- **ie_engine.py** → connectors_ie, data_ie_sources, recipe_catalog, scheduler_ie, server, uploads_ie
- **diagnostic.py** → data_developments, diagnostic_engine, observability, server, tenant_dev_map, tenant_scope
- **dev_batch16.py** → availability, branding_helpers, data_developments, observability, projects_unified, rate_limit
- **copiloto_flywheel.py** → anonymization_engine, cerebro_mercado_engine, data_developments, demand_feedback, server, tenant_scope
- **dev_batch4.py** → audit_log, lead_capture_engine, observability, pipeline_engine, server, transaction_network_engine
- **b13.py** → observability, projects_unified, rate_limit, server, services/lead_bridge, tenant_scope
- **superadmin_alta.py** → audit_log, bulk_ingest_engine, dmx_cube_feed, ingested_reader, resend_engine, server
- **dev_insights_intel.py** → avm_public_engine, data_developments, forecast_engine, server, services/insights_comparables, tenant_scope
- **auth.py** → observability, ratelimit, server, services/internal_users, services/lead_capture
- **picks.py** → data_developments, developer_track_record_engine, golden_avm_data, ingested_reader, terminal_mercado_engine
- **subagents.py** → audit_log, data_developments, permissions, server, tenant_scope
- **studio.py** → data_developments, feature_registry, llm_client, server, studio_engines
- **entity_resolution.py** → audit_immutable_engine, entity_resolution_cron, entity_resolution_engine, feature_registry, permissions
- **dev_batch15.py** → availability, oauth_calendar, rate_limit, server, tenant_scope
- **agentic_crm.py** → lead_capture_engine, lead_nurture_engine, permissions, server, tenant_scope
- **swipe_public.py** → data_developments, lead_match, photo_tagger, rate_limit, taste_profile
- **marketplace_lead_tools.py** → services/colonia_comparator, services/colonia_intelligence, services/colonia_quiz, services/colonia_report_pdf, services/lead_capture
- **dev_valor_residual.py** → lote_veredicto_engine, norma3_engine, predio_due_diligence_engine, server, valor_residual_engine
- **asistente.py** → asistente_engine, behavioral_tracking_engine, permissions, ratelimit, server
- **external_insights.py** → audit_immutable_engine, external_insights_engine, insights_factcheck_engine, permissions, ratelimit
- **bulk_ingest.py** → audit_log, dropbox_source, feature_registry, historic_miner, server
- **inmobiliaria.py** → server, services/ampi_verification, services/inmobiliaria_relationships, services/inmobiliaria_signup, services/lead_capture
- **project_wizard.py** → permissions, project_wizard_engine, ratelimit, server, tenant_scope
- **scores.py** → data_developments, data_seed, recipe_catalog, score_engine, uploads_ie
- **live_pulse.py** → audit_immutable_engine, feature_registry, permissions, scheduler_ie, server
- **funnel.py** → ai_budget, llm_client, server, services/sankey_data, tenant_scope
- **asesor_daily_tools.py** → server, services/calendar_bidirectional, services/client_insights, services/visit_auto_prep, tenant_scope
- **social_cards.py** → audit_immutable_engine, permissions, ratelimit, social_cards_cache, social_cards_engine
- **superadmin_ai_cost.py** → ai_quota_engine, audit_log, cron_heartbeat, feature_registry, server
- **data_licensing.py** → audit_log, data_doctrine, feature_registry, permissions, public_api_auth
- **buy_signal.py** → data_developments, data_seed, ratelimit, resale_data
- **drpi.py** → audit_log, feature_registry, permissions, server
- **lead_enrichment.py** → lead_enrichment_engine, permissions, server, tenant_scope
- **partners.py** → audit_log, compliance_engine, feature_registry, permissions
- **bulletins.py** → audit_log, feature_registry, permissions, zone_score_engine
- **lead_match.py** → server, services/asesor_daily_feed, services/lead_to_asesor_match, tenant_scope
- **internal_users.py** → server, services/cross_org_partnerships, services/internal_users, services/mini_market_engine
- **private_beta.py** → feature_registry, ratelimit, resend_engine, server
- **social_ads.py** → ratelimit, server, social_ads_engine, social_ads_oauth
- **fit.py** → data_developments, fit_engine, server, tenant_scope
- **disputes.py** → audit_immutable_engine, knowledge_graph_engine, notifications_engine, server
- **share_meta.py** → cma_engine, data_seed, export_brand, services/colonia_history
- **whatif.py** → data_developments, permissions, server, whatif_engine
- **forecast_public.py** → data_seed, feature_registry, forecast_engine, ratelimit
- **dev_market.py** → audit_log, data_developments, server, tenant_scope
- **recommendations.py** → data_developments, diagnostic_engine, server, tenant_dev_map
- **perfil_recomendar.py** → data_developments, data_seed, ratelimit, reverse_search_engine
- **dev_batch7_2.py** → audit_log, data_seed, observability, server
- **favoritos.py** → data_developments, ingested_reader, services/ratelimit, services/visitor_identity
- **superadmin_commercial.py** → audit_log, feature_gate_engine, server, trial_expiry_cron
- **marketplace_search.py** → data_developments, feature_registry, ratelimit, services/image_search
- **external_search.py** → data_developments, server, services/saved_searches, services/url_parser
- **press.py** → data_developments, data_seed, score_engine, seo_landings_config
- **location_intel.py** → data_developments, data_seed, server, tenant_scope
- **dev_sales_intel.py** → data_developments, server, tenant_scope, whatif_engine
- **widget_embed_analytics.py** → audit_immutable_engine, permissions, ratelimit, widget_embed_analytics
- **search_prefs.py** → data_developments, data_seed, observability, server
- **cma.py** → cma_engine, cma_pdf_renderer, server
- **superadmin_data_lake.py** → audit_log, feature_registry, server
- **terminal_mercado.py** → bancabilidad_engine, server, terminal_mercado_engine
- **buyer_score.py** → buyer_score_cron, feature_registry, permissions
- **maps.py** → feature_registry, maps_engine, server
- **whatsapp.py** → feature_registry, server, whatsapp_engine
- **dev_project_full.py** → data_developments, server, tenant_scope
- **compliance.py** → audit_log, dev_guard, permissions
- **superadmin_data_hub.py** → audit_log, cron_heartbeat, server
- **wrapped.py** → server, services/smart_match, services/wrapped_generator
- **lead_capture_marketplace.py** → lead_capture_marketplace_engine, pii_crypto, ratelimit
- **public_zones.py** → data_developments, data_seed, score_engine
- **reverse_search.py** → ratelimit, reverse_search_engine, services/llm_guard
- **tour_3dgs.py** → feature_registry, ratelimit, server
- **brochure.py** → feature_registry, projects_unified, server
- **argumentario.py** → server, services/argumentario_rag, services/argumentario_seed
- **mood.py** → mood_engine, mood_property_profiler, ratelimit
- **dev_channel_intel.py** → data_developments, server, tenant_scope
- **marketplace_calculator.py** → banxico_rates, services/lead_capture, services/mortgage_calculator
- **transaction_network.py** → audit_log, feature_registry, permissions
- **avm_accuracy.py** → avm_retrain_cron, golden_avm_data, permissions
- **atlax_persona.py** → atlax_persona_engine, llm_client, server
- **behavioral.py** → behavioral_tracking_engine, permissions, server
- **superadmin_intelligence_hub.py** → audit_log, feature_registry, server
- **newsletter.py** → feature_registry, newsletter_pulse_engine, server
- **superadmin_granularity.py** → granularity_backfill, granularity_registry, permissions
- **gov_data_mx.py** → gov_data_mx_cron, gov_data_mx_engine, permissions
- **workflows.py** → server, tenant_scope, workflow_engine
- **predictive_alerts.py** → audit_immutable_engine, predictive_alerts_engine, server
- **risk_score.py** → audit_log, permissions, server
- **lead_journey.py** → feature_registry, server, services/lead_bridge
- **soc_franchise.py** → permissions, server, soc_franchise_engine
- **dev_broker_intel.py** → data_developments, server, tenant_scope
- **asesor_playbook.py** → data_developments, services/advisor_authorization, tenant_scope
- **advisor_whitelist.py** → permissions, services/advisor_authorization, services/auto_approve_engine
- **accuracy.py** → audit_immutable_engine, feature_registry, permissions
- **director.py** → director_agent_engine, permissions, server
- **virtual_staging.py** → permissions, server, virtual_staging_engine
- **house_leads.py** → data_developments, house_pool_engine, permissions
- **studio_video.py** → ai_budget, server, studio_video_engine
- **dev_amenity_intel.py** → data_developments, server, tenant_scope
- **comparable_alerts.py** → data_developments, server, tenant_dev_map
- **dev_price_history.py** → data_developments, server, tenant_scope
- **marketplace_templates.py** → marketplace_templates_engine, permissions, server
- **superadmin_audit.py** → audit_log, server, unified_audit
- **construction_quality.py** → construction_quality_engine, permissions
- **conversation_drift.py** → conversation_drift_detector, server
- **grafo_comprador.py** → grafo_comprador_engine, server
- **superadmin_health.py** → cron_heartbeat, server
- **tracking_links.py** → server, tenant_scope
- **generador_producto.py** → generador_producto_engine, server
- **whatsapp_copiloto.py** → asistente_engine, whatsapp_engine
- **cerebro.py** → data_developments, server
- **asesor_market.py** → data_developments, server
- **conversation_kb_gaps.py** → conversation_kb_gaps_engine, server
- **cube_inbox.py** → data_developments, llm_client
- **data_doctrine.py** → data_doctrine, server
- **reputation_monitor.py** → reputation_monitor_engine, server
- **superadmin_copiloto.py** → data_developments, server
- **directories.py** → server, services/directory_aggregator
- **superadmin_tenants.py** → permissions, server
- **superadmin_demand_intel.py** → data_developments, permissions
- **cross_sell.py** → feature_registry, server
- **vertical_products.py** → audit_log, feature_registry
- **copilot.py** → server, services/copilot_engine
- **superadmin_catalog_pulse.py** → data_developments, permissions
- **mcp_distribution.py** → ratelimit, server
- **conversation_cost.py** → conversation_cost_stats_engine, server
- **phase_y_controls.py** → audit_log, server
- **phase5_foundation.py** → audit_log, permissions
- **narrative.py** → narrative_layer_engine, ratelimit
- **marketing_mcp.py** → marketing_mcp_engine, permissions
- **free_audit.py** → ratelimit, server
- **voice.py** → server, voice_atlax_engine
- **buyer_alerts.py** → server, services/buyer_alerts
- **lead_capture.py** → lead_capture_engine, server
- **asesor_metrics.py** → server, services/asesor_metrics
- **chat.py** → server, services/chat_engine
- **dev_batch17.py** → server, tenant_scope
- **rag_admin.py** → rag_engine, server
- **feedback_signals.py** → server, tenant_scope
- **floor_view.py** → data_developments, server
- **demanda_demografica.py** → demanda_demografica_engine, server
- **director_memory.py** → director_memory_engine, permissions
- **smart_lists.py** → server, smart_lists_engine
- **cerebro_mercado.py** → cerebro_mercado_engine, server
- **fraud_detection.py** → audit_log, permissions
- **conversation_ab_testing.py** → audit_immutable_engine, server
- **buyer_coach.py** → ratelimit, services/llm_guard
- **trends.py** → apify_trends_engine, permissions
- **tax_projector.py** → tax_projector_cache, tax_projector_engine
- **hook_predictor.py** → hook_predictor_engine, server
- **video_standalone.py** → server, video_standalone_engine
- **marketplace_map.py** → data_seed, services/colonia_intelligence
- **comprador_compare.py** → server, services/colonia_comparator
- **climate_migration.py** → climate_migration_engine, ratelimit
- **avm_public.py** → feature_registry, ratelimit
- **compare.py** → comparator_engine, ratelimit
- **maps_cross.py** → server, tenant_scope
- **reviews_residents.py** → permissions, reviews_residents_engine
- **risk_alerts.py** → audit_log, permissions
- **briefing_traffic.py** → server, services/traffic_briefing
- **investment_explorer.py** → permissions
- **plusvalia.py** → ratelimit
- **casamentera.py** → data_developments
- **public_market.py** → ratelimit
- **investment_simulator.py** → ratelimit
- **fsd.py** → permissions
- **gentrificacion.py** → permissions
- **score_inversion.py** → ratelimit
- **forecast_accuracy.py** → permissions
- **observability.py** → server
- **team_aggregated.py** → server
- **widgets.py** → data_seed
- **studio_carrusel.py** → studio_asset_library
- **seo_themed.py** → zone_score_engine
- **studio_property_intake.py** → studio_property_intake_schema
- **badges.py** → server
- **data_sources.py** → server
- **notifications.py** → server
- **seo_files.py** → data_developments
- **dev_batch19.py** → server
- **studio_auto_content.py** → server
- **team_productivity.py** → server
- **dev_batch18.py** → server
- **tour_analytics.py** → server
- **conversation_confidence.py** → server

## F · Motor → colecciones (los 60 motores más conectados)
- **asistente_engine** · lee(27): agent_workforce_runs, ai_call_events, asistente_messages, asistente_sessions, behavioral_events, buyer_scores, caya_sessions, caya_sessions_migration… · escribe(5): activity_log, asistente_messages, asistente_sessions, caya_sessions_migration, leads
- **server** · lee(14): asesor_busquedas, audit_logs, dev_overlays, dev_payment_schemes, developments, inmobiliarias, market_index_snapshots, project_assets… · escribe(8): audit_logs, dev_payment_schemes, inmobiliaria_internal_users, project_assets, project_documents, revoked_tokens…
- **demand_intelligence** · lee(19): airroi_cache, asistente_messages, broker_listings, buyer_coach_conversations, buyer_signals, climate_migration_patterns, colonias, crime_zone_colonia… · escribe(1): airroi_cache
- **feature_flags_engine** · lee(9): automations, developer_organizations, disc_configs, email_templates, pipeline_stages, plan_templates, reportes_ia_config, tenant_features… · escribe(9): automations, developer_organizations, disc_configs, email_templates, pipeline_stages, plan_templates…
- **studio_landing_engine** · lee(11): asesor_profiles, brand_kits, inmobiliaria_round_robin, leads, listing_imports, studio_landing_ab_groups, studio_landing_analytics, studio_landing_data_cache… · escribe(7): leads, studio_landing_ab_groups, studio_landing_analytics, studio_landing_data_cache, studio_landing_leads, studio_landing_views…
- **health_score** · lee(12): appointments, asesor_busquedas, asesor_contactos, asesor_operaciones, asesor_tareas, audit_log, health_scores, health_scores_snapshots… · escribe(2): health_scores, health_scores_snapshots
- **score_engine** · lee(12): denue_zone_density, developments, di_cross_checks, di_documents, fgj_trajectory_zone, ie_raw_observations, ie_score_history, ie_scores… · escribe(2): ie_score_history, ie_scores
- **lead_nurture_engine** · lee(9): behavioral_events, disc_profiles, email_replies, landing_leads, lead_recommendations, lead_routings, leads, nurture_sequences… · escribe(4): activity_log, landing_leads, nurture_sequences, tareas
- **rag_engine** · lee(12): activities, asistente_sessions, di_documents, di_extractions, dmx_embeddings, ie_narratives, ie_raw_observations, ie_scores… · escribe(1): dmx_embeddings
- **bulk_ingest_engine** · lee(4): bulk_ingest_items, bulk_ingest_jobs, developments, units · escribe(8): bulk_ingest_items, bulk_ingest_jobs, dev_competitor_price_snapshots, developments, ingest_list_snapshots, project_assets…
- **conversation_engine** · lee(8): asesor_contactos, buyer_scores, conversation_ab_tests, conversation_confidence_usage, conversation_messages, conversation_threads, disc_profiles, leads · escribe(4): conversation_ab_tests, conversation_messages, conversation_threads, leads
- **cube_olap_engine** · lee(9): buyer_signals, cube_aggregations, cube_backfill_jobs, cube_materialized_views, developer_unit_overrides, dim_zones, dmx_units, facts_buyer_signals… · escribe(3): cube_backfill_jobs, cube_materialized_views, facts_buyer_signals
- **director_agent_engine** · lee(9): comparables, developments, director_messages, director_sessions, director_tool_calls, ie_scores, leads, matches… · escribe(3): director_messages, director_sessions, director_tool_calls
- **services/internal_users** · lee(6): dev_internal_users, dev_orgs, inmobiliaria_internal_users, inmobiliarias, invitations, users · escribe(6): access_tokens, dev_internal_users, inmobiliaria_internal_users, invitations, user_sessions, users
- **services/visit_auto_prep** · lee(11): appointments, buyer_history, chat_threads, developments, favoritos, health_scores, lead_attribution, leads… · escribe(1): visit_briefings
- **diagnostic_engine** · lee(8): diagnostic_ai_cache, diagnostic_reports, funnel_events, ie_scores, probe_recurrence, project_diagnostics, user_diagnostics, user_problem_reports · escribe(3): diagnostic_ai_cache, probe_recurrence, project_diagnostics
- **entity_resolution_engine** · lee(7): broker_fraud_patterns, dedup_blacklist, dedup_runs, entity_duplicates_pending, leads, merged_entities_archive, users · escribe(4): broker_fraud_patterns, entity_duplicates_pending, leads, merged_entities_archive
- **notifications_engine** · lee(7): buyer_assignments, leads, notification_dedupe, notification_preferences, notifications, users, whatsapp_messages · escribe(4): notification_dedupe, notification_preferences, notifications, whatsapp_messages
- **services/buyer_alerts** · lee(9): alert_deliveries, buyer_alerts, developments, dmx_bulletins, dmx_picks, saved_searches, unit_price_history, units… · escribe(2): alert_deliveries, buyer_alerts
- **services/directory_aggregator** · lee(11): asesor_trust_scores, cross_org_partnerships, dev_advisor_authorizations, dev_internal_users, dev_orgs, inmobiliaria_advisor_relationships, inmobiliaria_dev_partnerships, inmobiliaria_internal_users… · escribe(0): 
- **anomaly_detection_engine** · lee(8): ai_call_events, audit_log, bulk_ingest_jobs, cube_aggregations, founder_anomalies, founder_email_throttle, founder_quick_actions, tenants · escribe(2): founder_anomalies, founder_email_throttle
- **atlax_engine** · lee(6): asistente_sessions, atlax_threads, atlax_usage, caya_messages, caya_sessions, caya_sessions_migration · escribe(4): atlax_threads, caya_messages, caya_sessions, caya_sessions_migration
- **auto_pilot_engine** · lee(5): asesor_contactos, autopilot_config, autopilot_log, command_center_actions, users · escribe(5): asesor_busquedas, asesor_tareas, autopilot_config, autopilot_log, command_center_actions
- **demand_genome** · lee(7): asesor_busquedas, buyer_signals, demand_atoms, genoma_kpi_snapshots, marketplace_searches, registros_interes, taxonomia_extra · escribe(3): demand_atoms, genoma_kpi_snapshots, taxonomia_extra
- **google_places_ingest** · lee(6): colonias, denue_zone_density, google_quota, marketplace_searches, place_photo_cache, zone_places · escribe(4): denue_zone_density, google_quota, place_photo_cache, zone_places
- **live_pulse_engine** · lee(9): apify_trends_cache, atlax_threads, behavioral_events, drpi_snapshots, leads, live_pulse_alerts_sent, live_pulse_readiness_history, live_pulse_snapshots… · escribe(1): live_pulse_snapshots
- **marketplace_templates_engine** · lee(5): marketplace_clones, marketplace_ratings, marketplace_templates, marketplace_templates_cache, workflows · escribe(5): marketplace_clones, marketplace_ratings, marketplace_templates, marketplace_templates_cache, workflows
- **scheduler_ie** · lee(6): developments, ie_data_sources, ie_raw_observations, ie_scores, units, watchlist_subscribers · escribe(4): ie_data_sources, ie_ingestion_jobs, ie_raw_observations, watchlist_subscribers
- **services/client_insights** · lee(9): buyer_history, chat_messages, chat_threads, client_insights_cache, favoritos, health_scores, lead_attribution, leads… · escribe(1): client_insights_cache
- **workflow_engine** · lee(5): asesor_contactos, leads, workflow_audit, workflow_runs, workflows · escribe(5): leads, tasks, workflow_audit, workflow_email_outbox, workflow_runs
- **asesor_digest_engine** · lee(7): appointments, asesor_briefings, asesor_digest_sends, asesor_profiles, command_center_actions, notification_preferences, users · escribe(2): asesor_digest_sends, notification_preferences
- **availability** · lee(5): appointment_assign_log, appointment_policies, appointments, availability_cache, leads · escribe(4): appointment_assign_log, appointment_policies, appointments, availability_cache
- **buyer_score_engine** · lee(8): appointments, behavioral_events, buyer_coach_conversations, buyer_favorites, buyer_score_runs, buyer_scores, leads, users · escribe(1): buyer_scores
- **climate_migration_engine** · lee(8): behavioral_events, cenapred_events, dim_zones, ie_col_clima, inegi_migration_snapshots, lead_captures, natural_risk_layers, reverse_search_cache · escribe(1): predictive_alerts
- **data_lake_etl** · lee(5): cube_aggregations, dim_zones, etl_runs, facts_daily_zone, model_validation_runs · escribe(4): dim_zones, etl_runs, facts_daily_zone, system_alerts
- **historic_miner** · lee(5): dev_competitor_price_snapshots, developments, lista_snapshots, price_events, unit_status_events · escribe(4): dev_competitor_price_snapshots, lista_snapshots, price_events, unit_status_events
- **risk_score_engine** · lee(6): crime_zone_colonia, cube_aggregations, dim_zones, risk_letter_changes, risk_scores_zone, transactions · escribe(3): risk_letter_changes, risk_scores_zone, system_alerts
- **services/copilot_context** · lee(9): appointments, asesor_busquedas, asesor_contactos, health_scores, leads, projects, tracking_links, units… · escribe(0): 
- **services/wrapped_generator** · lee(8): alert_deliveries, buyer_favorites, buyer_views, buyer_wrapped, chat_threads, developments, funnel_events, users · escribe(1): buyer_wrapped
- **vertical_products_engine** · lee(8): cube_aggregations, data_licensing_subscriptions, drpi_snapshots, fraud_alerts, hedonic_models, transactions, vertical_product_calls, zone_scores · escribe(1): vertical_product_calls
- **vistas_guardadas** · lee(5): asesor_busquedas, cube_corte_snapshots, genoma_checks, saved_views, users · escribe(4): asesor_busquedas, cube_corte_snapshots, genoma_checks, saved_views
- **ai_suggestions** · lee(7): ai_suggestions, appointments, health_scores, leads, tasks, units, users · escribe(1): ai_suggestions
- **battle_card_engine** · lee(7): battle_card_emails_sent, battle_card_snapshots, behavioral_events, dev_competitor_price_snapshots, leads, pricing_recommendations, zone_subscores · escribe(1): battle_card_snapshots
- **conversation_kb_gaps_engine** · lee(5): conversation_faqs, conversation_kb_gaps, conversation_kb_gaps_meta, conversation_messages, conversation_threads · escribe(3): conversation_faqs, conversation_kb_gaps, conversation_kb_gaps_meta
- **investment_simulator_engine** · lee(5): cube_aggregations, developments, hedonic_models, investment_scenarios, investment_simulations · escribe(3): investment_scenarios, investment_simulations, leads
- **lead_capture_engine** · lee(5): fb_lead_ads_config, lead_capture_aliases, lead_capture_events, leads, users · escribe(3): lead_capture_aliases, lead_capture_events, leads
- **maps_cross_engine** · lee(6): broker_listings, developments, match_catastro_recommendations, saved_zones, usada_listings, users · escribe(2): match_catastro_recommendations, saved_zones
- **newsletter_pulse_engine** · lee(7): buyer_favorites, cube_aggregations, investment_explorer_results, newsletter_opt_ins, newsletter_pulse_runs, nurture_sequences, phase_y_recommendations · escribe(1): newsletter_pulse_runs
- **services/mini_market_engine** · lee(6): dev_internal_users, dev_orgs, inmobiliaria_dev_partnerships, inmobiliaria_internal_users, inmobiliarias, users · escribe(2): dev_orgs, inmobiliarias
- **services/privacy_center** · lee(3): data_export_requests, privacy_consents, users · escribe(5): cerebro_memory, data_export_requests, privacy_consents, user_sessions, users
- **soc_franchise_engine** · lee(5): audit_immutable, leads, soc_franchise_cache, soc_franchise_history, users · escribe(3): soc_franchise_cache, soc_franchise_history, users
- **stripe_billing_engine** · lee(4): api_call_logs, stripe_processed_events, stripe_subscriptions, system_alerts · escribe(4): public_api_keys, stripe_processed_events, stripe_subscriptions, system_alerts
- **ai_budget** · lee(5): ai_budget_caps, ai_call_events, ai_cost_daily_snapshots, ai_usage_log, platform_config · escribe(2): ai_call_events, ai_usage_log
- **briefing_engine** · lee(5): asesor_busquedas, asesor_contactos, ie_advisor_briefings, ie_narratives, users · escribe(2): ie_advisor_briefings, ie_narratives
- **catastro_sig_engine** · lee(4): catastro_predios, colonia_catastro_byid, colonia_catastro_idx, colonias · escribe(3): catastro_predios, colonia_catastro_byid, colonia_catastro_idx
- **fit_engine** · lee(7): behavioral_events, buyer_scores, comparison_cache, developments, lead_capture_events, lead_captures, reverse_search_cache · escribe(0): 
- **granularity_backfill** · lee(5): asesor_profiles, dmx_units, ie_scores, leads, users · escribe(2): ie_scores, score_snapshots
- **lead_journey_engine** · lee(4): inmobiliaria_internal_users, lead_journey_steps, leads, users · escribe(3): audit_log, lead_journey_steps, leads
- **reviews_residents_engine** · lee(5): developments, reviews_residents, reviews_residents_cache, reviews_residents_runs, zones · escribe(2): reviews_residents, reviews_residents_cache
- **services/asesor_metrics** · lee(7): activities, appointments, asesor_trust_scores, health_scores, leads, tracking_links, users · escribe(0): 
