# AUDITORÍA DEL PORTAL SUPERADMIN — completo

**95 páginas · ~70 componentes · 34 archivos de ruta.** Auditado 1-por-1 (front A-M, front N-Z, backend). El superadmin
YA es un terminal de inteligencia robusto; el problema es un cluster stubbed y motores sin superficie.

---

## 1 · LO QUE YA ESTÁ EXPUESTO Y VIVO (🟢)

**Valuación & modelos ML:** SuperadminAvmAccuracy (drift/retrain/golden) · SuperadminDRPI (hedónico+coeficientes) ·
SuperadminFSDAccuracy · SuperadminForecastAccuracy · SuperadminCalibracion (vs Puente Alvarado) · ScoresPage (explain).
**Cubo & datos:** SuperadminMetricsCube (drill city→unit + heatmap + comparables) · SuperadminTerminalMercado
("Bloomberg CDMX": índices + grafo + cerebro) · SuperadminTransactionNetwork (feed + price index + anomalías) ·
SuperadminDataLake (ETL) · SuperadminGranularidad (mapa de familias).
**Riesgo:** SuperadminRiskScore (SESNSP) · SuperadminRiskAlerts (cambios de letra) · SuperadminClimateMigration.
**Demanda:** SuperadminDemandaMercado (overview+deep+zonas+20 avanzadas) · SuperadminGemeloDemanda · SuperadminGrafoComprador.
**Inversión:** SuperadminInvestmentExplorer · SuperadminIndices (5 índices DMX) · SuperadminConstructionQuality.
**Conectores & data:** SuperadminDataSourcesHub (11 conectores test/retry/replay) · SuperadminDataSources (gov MX) ·
SuperadminGovDataMx · SuperadminBulkIngest (Drive) · SuperadminRecipesCoverage · SuperadminRagInspector.
**Ops & gobernanza:** SuperadminAuditUnified (5 portales) · SuperadminAuditChain (SHA-256) · SuperadminCompliance (DSR) ·
SuperadminAiCost (forecast+caps) · SuperadminCommercial (feature flags×tenant) · SuperadminTenants (impersonar+7 paneles) ·
SuperadminHealth (crons) · SuperadminDuplicates (dedup) · SuperadminFeatureVisibility · SuperadminDataLicensing (B2B ARR).
**Contenido & growth:** Marketing MCP · MarketplaceTemplates · Newsletter · ReviewsResidents · SocFranchise · Partners ·
CrossSellAnalytics · KnowledgeGraph (KG viz).

→ **~60 páginas 🟢 con dato real.** Motores cableados a endpoint: ai_cost_aggregations · metrics_cube + cube_olap +
dmx_cube_feed · intelligence_insights · connector_registry · data_lake_etl · feature_flags · audit/unified_audit ·
granularity_registry · anomaly_detection · generador_producto · construction_quality · risk_score · drpi · transaction_network.

## 2 · LO STUBBED — UI cableada, backend flaco (🟡) → **el mayor desperdicio**

El **Dev-Master Intelligence Hub** tiene 8 páginas hermosas SIN datos vivos (llaman `/devmaster/*` que devuelve esqueleto):
| Página | Lo que DEBERÍA mostrar | Motor que la alimentaría |
|---|---|---|
| **DondeConstruir** | Demanda latente vs oferta a micro-detalle (zona×banda×rec) | demand_twin + what_to_build + generador_producto |
| **GustoMercado** | Modelo de gusto agregado (cuartos/estilos/amenidades/lift) | taste / gusto + simulador_palancas |
| **MacroCiudad** | Transporte/seguridad/educación vs precio + Banxico→crédito + gentrificación | zone_subscores + market_rates + zone_cycle |
| **Comportamiento** | Objeciones + DISC + maduración + velocidad vs cierre | disc + rejection_intel + funnel_velocity |
| **CompetenciaRed** | Quién pelea por el mismo comprador + brokers + inventario zombie | battle_card + co_viewed + competencia |
| **DesarrollosPanorama** | Home global 9 áreas (dev/unidades/precio/demanda/leads) | metrics_cube + catalog_pulse |
| **StockSoldOut** | Predicción sold-out + elasticidad + ¿cuándo agota? | absorcion + probability + price_elasticity |
| **ObservabilidadIA** | Qué modelo IA está activo vs en espera + reentrenamiento | cerebro + accuracy + model_validation |

→ **Estos 8 son 80% UI lista esperando que les conecte el motor correcto.** El más rápido ROI del superadmin.

Otros stubs de integración (esperan credencial/proveedor): WhatsApp · SocialAds (Meta review) · VirtualStaging/VideoStandalone
(Replicate cost) · Trends (Apify async) · Reputation (trend chart) · VerticalProducts (sandbox sin transacciones).

## 3 · MOTORES SIN SUPERFICIE EN SUPERADMIN (existen, nadie los ve) → **qué sumar**

| Motor | Qué daría al superadmin | Acción |
|---|---|---|
| **zone_intelligence** (nuevo) | Índice institucional por colonia (8 motores fusionados) | exponer endpoint /zonas ya hecho → falta página dedicada |
| **lead_match / fit_engine** | Calidad de match lead↔propiedad global | nuevo panel en IntelligenceHub |
| **buyer_elasticidad** | Elasticidad precio del comprador (hub dedicado) | sacar de inline founder_console |
| **taste_profile / gusto** | Modelo de gusto agregado real | alimentar GustoMercado |
| **knowledge_graph** (W5.12) | Grafo de relaciones property/lead | KG viz ya existe, falta poblar |
| **forecast_standard_deviation** (W5.15) | Desviación del pronóstico por propiedad | nuevo panel accuracy |
| **probability_ux** (W5.19) | Probabilidades Kalshi-style | nuevo panel |
| **reverse_search** | Búsqueda natural (test del parser) | panel de QA en RagInspector |
| **ownership_economics / whatif** | Comprar-vs-rentar + escenarios a nivel zona | nuevo panel InvestmentExplorer |
| **dmx_indices completo** | Los 5 índices a 4 escalas | extender SuperadminIndices |

## 4 · QUÉ SUMAR (priorizado por valor/esfuerzo)

1. **Conectar los 8 Dev-Master stubs** a sus motores reales (la UI ya existe) = 8 vistas de inteligencia encendidas.
2. **Página "Terminal de Zona"** que pivotee escala (micro/media/grande/macro) × las 9 categorías de HYPERGRANULARITY —
   consume zone_intelligence + market_movement + cube_olap. El producto estrella.
3. **Prender feeders 🟡** (catastro, places/osm, natural_risk, drpi/hedónico) → encienden micro/macro de la matriz.
4. **Exponer los ~9 motores huérfanos** (lead_match, taste, KG, FSD, probability_ux, reverse_search, ownership/whatif).
5. **Extender `zone_intelligence` a las 4 escalas** (hoy media) usando los tiers del cubo.

> Conclusión: el superadmin NO está vacío — está **al 60-70%**, con un cluster Dev-Master listo para encender y ~9 motores
> esperando superficie. No hay que construir un portal nuevo; hay que **cablear lo que ya existe** y coronarlo con el
> Terminal de Zona hiper-granular.
