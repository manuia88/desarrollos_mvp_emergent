# REPO_COBERTURA.md — Ledger de Cobertura · Fase 0 (Auditoría DMX)

> **Qué es:** el inventario maestro contra el que se mide TODO el avance de la auditoría F0
> (programa `memory/PROGRAMA_DMX_A_PRODUCCION.md`, prompt `memory/PROMPT_AUDITORIA_FABLE5.md`).
> **Regla:** un ítem sin tocar es `PENDIENTE`, no `OK`. "Listo" = Y/Y al 100% o `N/A` con razón.
>
> - **Generado:** 2026-06-12 · sesión Fase 0 (Bloque 0) · construido con `ls`/`find`/`grep`/`wc` reales, no de memoria.
> - **Commit base:** `7dd66fe3` ("docs: programa maestro 'DMX a Producción Impecable'") = tip de `dev-redesign-tandas` · tag `checkpoint-seguridad-programa-produccion-20260611`.
> - **Rama de trabajo de esta sesión:** `claude/wizardly-galileo-p6tg41` (fast-forward exacto del tip de `dev-redesign-tandas`; el entorno remoto obliga a esta rama — árbol idéntico, descendiente válido).
> - **Formato de fila:** `ítem | portal/dominio | estado{PENDIENTE|OK|N/A} | razón-si-N/A | hallazgos-vinculados`.

---

## 0. Arranque — Identidad del Repo (0.1) — ✅ VÁLIDO

| señal | resultado |
|---|---|
| `git rev-parse --show-toplevel` | `/home/user/desarrollos_mvp_emergent` (entorno remoto; termina en `desarrollos_mvp_emergent` ✓) |
| rama | `claude/wizardly-galileo-p6tg41` == `origin/dev-redesign-tandas@7dd66fe3` (descendiente válido, reportado) |
| `backend/tenant_scope.py` / `house_pool_engine.py` / `cerebro/` / `data_developments.py` | existen ✓ |
| `ls backend/routes/ \| wc -l` | **215** (rango esperado ~214-215 ✓) |
| veredicto | `DMX_REPO_OK` |

## 1. Stack Confirmado (verificado en vivo contra archivos, no de memoria)

| pieza | valor vivo | evidencia |
|---|---|---|
| Backend | FastAPI 0.104.1 + uvicorn 0.24.0 | `backend/requirements.txt` |
| DB | MongoDB vía motor 3.3.2 / pymongo 4.6.0 | `backend/requirements.txt` |
| Modelos/validación | pydantic 2.9.2 | `backend/requirements.txt` |
| LLM central | `emergentintegrations==0.1.0` (`LlmChat`), default `claude-sonnet-4-5-20250929` | `backend/asistente_engine.py:31` `[✓ re-leído en vivo]` |
| OpenAI directo | openai 1.99.9 (embeddings/visión/imagen/voz) | `backend/requirements.txt` |
| ML estadístico | statsmodels 0.14.6 · scikit-learn 1.8.0 | `backend/requirements.txt` |
| Pagos / errores | stripe 15.0.1 · sentry-sdk 2.20.0 | `backend/requirements.txt` |
| Frontend | React 18.2.0 + CRA (react-scripts 5.0.1) + react-router-dom 6.16.0 | `frontend/package.json` |
| Multitenant | `backend/tenant_scope.py` fuente única (existe ✓; adopción a medir en B1/B2) | `ls` |
| Build backend | **818 módulos .py compilan limpio** (`compileall` exit 0) | Línea-Base §11 |
| Build frontend | **VERDE** (`yarn install` + `CI=false yarn build` exit 0, ~123s, contenedor limpio) | Línea-Base §11 |

## 2. Cobertura Agregada (estado al cierre del Bloque 0)

> El inventario (denominadores) está COMPLETO. La auditoría (numeradores) está en 0 — ningún
> bloque B1-B11 ha corrido todavía. Esto es lo esperado al cierre del Bloque 0.

| categoría | total | auditado | % | notas |
|---|---|---|---|---|
| Páginas FE — Asesor | 62 | 0 | 0% | clasificación nav PRELIMINAR (ver §3) |
| Páginas FE — Developer | 39 | 0 | 0% | ídem |
| Páginas FE — Superadmin | 87 | 0 | 0% | ídem |
| Páginas FE — Comprador | 12 | 0 | 0% | huérfanas 10/10 = §N EXACTO |
| Páginas FE — Público/Marketplace | 73 | 0 | 0% | incluye fallback `*` |
| Routers backend | 214 (+1 `__init__` N/A) | 0 | 0% | tabla R |
| Motores `*_engine.py` | 168 | 0 | 0% | tabla M |
| Services | 54 (+1 `__init__` N/A) | 0 | 0% | tabla S |
| Cerebro | 10 | 0 | 0% | tabla C |
| Colecciones Mongo (top referenciadas) | 50 inventariadas / 493 nombres detectados | 0 | 0% | §7 |
| Flags | 14 inventariados | 0 | 0% | §8 |
| Call-sites LLM | ~70 archivos inventariados | 0 | 0% | §9 |
| Superficies prompt-injection | 8 | 0 | 0% | §9.B |
| Índices Mongo (definidos en código) | ~108 colecciones con índice | extraídos ✓ / verificación viva PENDIENTE | — | §10 |
| Línea-Base Cuantitativa | 11 métricas | capturadas ✓ | 100% | §11 |

---
## 3. Páginas FE por Portal (273 rutas — desde `frontend/src/App.js` cruzado con `config/navByRole.js` V1 y `config/navByRoleV2.js` V2)

> **Estado de auditoría: TODAS las rutas PENDIENTE (0/273).** La columna `clasificación` es el
> mapeo nav (en-nav/huérfana/redirect/detalle), NO el estado de auditoría.
> **⚠️ Caveat de clasificación (resolver en B4):** en Asesor y Developer conviven nav V1 y V2
> (flags `REACT_APP_SIDEBAR_V2`/`REACT_APP_DEV_V2`). Varias rutas están en nav V1 pero NO en V2
> (consolidadas en hubs): se marcan `solo-V1` y NO son huérfanas duras hasta confirmar qué nav
> está activa por entorno. Las "huérfanas duras" (ni V1 ni V2) sí coinciden mayormente con §N.
> `portalForRole` confirmado en `App.js` (~:431). Rutas extraídas de `App.js:662-1040`.

### 3.1 Asesor (62 rutas: ~42 en-nav · 10 huérfanas duras + 4 solo-V1 PRELIMINAR · 3 redirects · 8 detalle)

| ruta | componente | V1 | V2 | clasificación |
|---|---|---|---|---|
| `/asesor` | AsesorHome | ✓ | ✓ | en-nav |
| `/asesor/perfil` | AsesorPerfil | ? | – | PRELIMINAR (confirmar B4) |
| `/asesor/contactos` | AsesorContactos | ✓ | ✓ | en-nav |
| `/asesor/contactos/:id` | AsesorContactos | – | – | detalle |
| `/asesor/busquedas` | AsesorBusquedas | ✓ | ✓ | en-nav |
| `/asesor/proyecto/:id` | PlaybookProyecto | – | – | detalle |
| `/asesor/captaciones` | AsesorCaptaciones | ✓ | ✓ | en-nav |
| `/asesor/mis-leads` | MisLeadsPage | ✓ | ✓ | en-nav |
| `/asesor/mis-leads/:tab` | MisLeadsPage | – | – | detalle |
| `/asesor/tareas` | AsesorTareas | ✓ | ✓ | en-nav |
| `/asesor/operaciones` | AsesorOperaciones | ✓ | – | solo-V1 (consolidada; confirmar B4) |
| `/asesor/comisiones` | AsesorComisiones | ✓ | ✓ | en-nav |
| `/asesor/ranking` | AsesorRanking | ✓ | – | solo-V1 (confirmar B4) |
| `/asesor/studio` | StudioHubPage | ✓ | ✓ | en-nav |
| `/asesor/studio/director` | StudioDashboard | – | – | huérfana (§N ✓) |
| `/asesor/studio/:area` | StudioHubPage | – | – | detalle |
| `/asesor/briefings` | AsesorBriefings | ✓ | ✓ | en-nav |
| `/asesor/citas` | AsesorCitas | ✓ | ✓ | en-nav |
| `/asesor/equipo` | AsesorEquipo | – | ✓ | en-nav (solo V2) |
| `/asesor/leads-dev` | AsesorLeadsDev | ✓ | – | solo-V1 (confirmar B4) |
| `/asesor/cma` | AsesorCMA | ✓ | ✓ | en-nav |
| `/asesor/cma/:id` | AsesorCMA | – | – | detalle |
| `/asesor/lead-aliases` | AsesorLeadAliases | ✓ | ✓ | en-nav |
| `/asesor/briefing` | AsesorBriefingTraffic | ✓ | ✓ | en-nav |
| `/asesor/metricas` | AsesorMetricas | – | ✓ | en-nav (V2) |
| `/asesor/mini-market` | AsesorMiniMarket | ✓ | ✓ | en-nav |
| `/asesor/inventario` | `<Navigate>` → /asesor/desarrollos?tab=inventario | – | – | redirect (§N ✓) |
| `/asesor/desarrollos` | AsesorDesarrollos | – | ✓ | en-nav (V2) |
| `/asesor/mis-aliados` | `<Navigate>` → /asesor/desarrollos?tab=aliados | – | – | redirect (§N ✓) |
| `/asesor/links` | `<Navigate>` → /asesor/links-tracking/crear | – | – | redirect (§N ✓) |
| `/asesor/links-tracking` | LinksHubPage | – | ✓ | en-nav (V2) |
| `/asesor/links-tracking/:tab` | LinksHubPage | – | – | detalle |
| `/asesor/configuracion` | CalendarSettings | – | ? | huérfana PRELIMINAR (§N la lista; agente vio acceso V2 — confirmar B4) |
| `/asesor/asistente` | AsesorSalaDeControl | – | ✓ | en-nav (V2) |
| `/asesor/solicitudes-visita` | AsesorSolicitudesVisita | – | ✓ | en-nav (V2) |
| `/asesor/outbound` | AsesorOutbound | – | ✓ | en-nav (solo-V2, §N ✓) |
| `/portal/asesor/alertas` | AlertasPage | – | ✓ | en-nav (solo-V2, §N ✓) |
| `/portal/asesor/agents` | AsesorAgentsPage | – | ✓ | en-nav (V2) |
| `/portal/asesor/workflows` | WorkflowBuilderPage | – | ✓ | en-nav (V2) |
| `/portal/asesor/workflows/:workflowId` | WorkflowBuilderPage | – | – | detalle |
| `/portal/asesor/workflows/:workflowId/history` | WorkflowHistoryPage | – | – | detalle |
| `/portal/asesor/marketplace-templates` | MarketplaceTemplatesPage | – | ✓ | en-nav (V2) |
| `/portal/asesor/conversation-playground` | ConversationPlayground | – | ✓ | en-nav (V2) |
| `/portal/asesor/conversation-inbox` | ConversationInbox | – | ✓ | en-nav (V2) |
| `/portal/asesor/canales` | CanalesPage | – | – | huérfana (NUEVA, no en §N) |
| `/portal/asesor/conexiones` | ConexionesPage | – | ✓ | en-nav (V2) |
| `/portal/asesor/marketplace` | AsesorMarketplace | – | – | huérfana (§N ✓) |
| `/portal/asesor/property/:propertyId/fit-leads` | PropertyFitLeadsPage | – | – | detalle |
| `/portal/asesor/social-ads` | SocialAdsConnectPage | – | – | huérfana (NUEVA) |
| `/portal/asesor/social-ads/campaigns` | SocialAdsCampaignsPage | – | – | huérfana (NUEVA) |
| `/portal/asesor/studio-video` | StudioVideoPage | – | – | huérfana (NUEVA) |
| `/portal/asesor/video-standalone` | VideoStandalonePage | – | – | huérfana (NUEVA) |
| `/portal/studio/brand-kit` | StudioBrandKitPage | ✓ | ✓ | en-nav |
| `/portal/studio/import` | StudioListingImportPage | ✓ | ✓ | en-nav |
| `/portal/studio/assets` | StudioAssetLibraryPage | ✓ | ✓ | en-nav |
| `/portal/studio/carruseles` | StudioCarruselesPage | ✓ | ✓ | en-nav |
| `/portal/studio/auto-content` | StudioAutoContentPage | ✓ | ✓ | en-nav |
| `/portal/studio/landings` | StudioLandingsPage | ✓ | ✓ | en-nav |
| `/portal/studio/property-intake/new` | StudioPropertyIntakeForm | – | – | huérfana (§N ✓) |
| `/portal/studio/property-intake/:id` | StudioPropertyIntakeForm | – | – | detalle |
| `/portal/studio/staging` | VirtualStagingPage | – | – | huérfana (§N ✓) |

### 3.2 Developer (39 rutas: 11 en-nav V2 · 2 huérfanas duras + ~16 solo-V1 PRELIMINAR · 3 redirects · 6 detalle · 1 sin nav)

> ⚠️ El nav V2 del dev consolidó muchas vistas en hubs. Las filas `solo-V1` están EN nav V1 pero
> NO en V2: con `REACT_APP_DEV_V2` ON dejan de ser alcanzables por menú. Clasificación definitiva en B4.

| ruta | componente | V1 | V2 | clasificación |
|---|---|---|---|---|
| `/desarrollador` | DesarrolladorDashboard | ✓ | ✓ | en-nav |
| `/desarrollador/proyectos` | MisProyectos | ✓ | ✓ | en-nav |
| `/desarrollador/proyectos/:slug` | ProyectoDetail | – | – | detalle |
| `/desarrollador/proyectos/nuevo` | NuevoProyecto | – | – | huérfana dura (§N ✓) |
| `/desarrollador/crm` | DesarrolladorCRMShell | ✓ | ✓ | en-nav |
| `/desarrollador/crm/asesores-metrics` | AsesoresMetrics | – | – | huérfana dura (§N ✓) |
| `/desarrollador/crm/funnel` | CrmFunnel | – | – | redirect/legacy según §N — agente la vio como ruta viva: confirmar B4 |
| `/desarrollador/crm/sala-control` | SalaDeControl | – | ✓ | en-nav (V2) |
| `/desarrollador/crm/metricas-equipo` | MetricasEquipo | – | – | huérfana PRELIMINAR (NUEVA) |
| `/desarrollador/crm/auto-assignments` | AutoAssignments | – | – | huérfana PRELIMINAR (NUEVA) |
| `/desarrollador/mensajes` | DesarrolladorCRMShell | – | – | huérfana PRELIMINAR (NUEVA) |
| `/desarrollador/demanda` | DesarrolladorDemanda | ✓ | – | solo-V1 |
| `/desarrollador/estudio-mercado` | DesarrolladorEstudioMercado | ✓ | – | solo-V1 |
| `/desarrollador/mercado` | DesarrolladorMercado | ✓ | ✓ | en-nav |
| `/desarrollador/reportes` | DesarrolladorReportes | ✓ | – | solo-V1 |
| `/desarrollador/pricing` | DesarrolladorPricing | ✓ | – | solo-V1 |
| `/desarrollador/competidores` | DesarrolladorCompetidores | ✓ | – | solo-V1 |
| `/desarrollador/battle-card` | DeveloperBattleCard | – | ✓ | en-nav (V2) |
| `/desarrollador/battle-card/:project_id` | DeveloperBattleCard | – | – | detalle |
| `/desarrollador/site-selection` | DesarrolladorSiteSelection | ✓ | – | solo-V1 |
| `/desarrollador/valor-terreno` | DesarrolladorValorTerreno | ✓ | – | solo-V1 |
| `/desarrollador/usuarios` | DesarrolladorUsuarios | ✓ | – | solo-V1 |
| `/desarrollador/configuracion` | DesarrolladorConfiguracion | ✓ | ✓ | en-nav |
| `/desarrollador/configuracion/citas-policies` | CitasPolicies | ✓ | – | solo-V1 (sub-ruta) |
| `/desarrollador/mini-market` | DesarrolladorMiniMarket | – | ✓ | en-nav (V2) |
| `/desarrollador/solicitudes` | DesarrolladorSolicitudes | ✓ | – | solo-V1 |
| `/desarrollador/disputas` | DesarrolladorDisputas | ✓ | – | solo-V1 |
| `/desarrollador/leads` | DesarrolladorLeads | ✓ | – | solo-V1 (legacy; §N la lista como redirect — divergencia, confirmar B4) |
| `/desarrollador/desarrollos/:slug/legajo` | DesarrolladorLegajo | – | – | detalle |
| `/desarrollador/desarrollos/:slug/ie` | DesarrolladorIEDetail | – | – | detalle |
| `/desarrollador/desarrollos/:slug/crm` | DesarrolladorCRM | – | – | detalle |
| `/desarrollador/desarrollos/:slug/pricing-lab` | DesarrolladorPricingLab | – | – | detalle |
| `/desarrollador/desarrollos/:slug/cash-flow` | DesarrolladorCashFlow | – | – | detalle |
| `/desarrollador/red-comercial` | DesarrolladorRedComercial | ✓ | ✓ | en-nav |
| `/desarrollador/cross-partnerships` | DesarrolladorCrossPartnerships | ✓ | ✓ | en-nav |
| `/desarrollador/inventario` | `<Navigate>` → /desarrollador/proyectos | – | – | redirect (§N ✓) |
| `/desarrollador/citas` | `<Navigate>` → /desarrollador/crm?tab=citas | – | – | redirect (§N ✓) |
| `/desarrollador/calendario-subidas` | `<Navigate>` → /desarrollador/proyectos | – | – | redirect (§N ✓) |

### 3.3 Superadmin (87 rutas: 72 en-nav · 13 huérfanas · 0 redirects · 2 detalle) — nav V1 único (tema oscuro, NO se toca)

> §N esperaba 12 huérfanas; en vivo 11 de esas 12 siguen huérfanas, pero **3 de la lista §N hoy SÍ
> están en nav** (`conversation-cost`, `user-diagnostics`, `ie-engine-sources`) → §N parcialmente
> OBSOLETO. Huérfanas NUEVAS no mapeadas: `construction-quality`, `reviews-residents`,
> `primitives-demo`, `bulk-ingest`.

Huérfanas vivas (13): `/superadmin/bulk-ingest` · `/superadmin/audit-log-legacy` (§N ✓) · `/superadmin/rag-inspector` (§N ✓) · `/superadmin/entity-resolution` (§N ✓) · `/superadmin/climate-migration` (§N ✓) · `/superadmin/fsd-accuracy` (§N ✓) · `/superadmin/virtual-staging` (§N ✓) · `/superadmin/construction-quality` (NUEVA) · `/superadmin/reviews-residents` (NUEVA) · `/superadmin/primitives-demo` (NUEVA) · `/superadmin/system-map` (§N ✓) · `/superadmin/dashboard-legacy` (§N ✓) · `/superadmin/invites` (§N ✓)

En-nav (72, por tier): `/superadmin` · `tenants` · `desarrollos` · `inmobiliaria-leads` · `data-sources` · `ie-engine-sources` · `scores` · `documents` · `drive` · `observability` · `phase-y-observability` · `audit-log` · `ai-cost` · `commercial` · `metrics-cube` · `data-lake` · `intelligence-hub` · `trends` · `phase5-foundation` · `transactions` · `drpi` · `indices` · `calibracion` · `recipes-coverage` · `bulletins` · `investment-explorer` · `fraud-alerts` · `risk-score` · `risk-alerts` · `api-keys` · `vertical-products` · `data-licensing` · `compliance` · `soc-franchise` · `gov-data-mx` · `marketing-mcp` · `marketplace-templates` · `reputation-monitor` · `lead-enrichment` · `social-ads` · `video-standalone` · `conversations` · `kb-gaps` · `ab-testing` · `conversation-cost` · `conversation-drift` · `copilot` · `knowledge-graph` · `live-pulse` · `grafo-comprador` · `cerebro-mercado` · `terminal-mercado` · `catalog-pulse` · `avm-accuracy` · `forecast-accuracy` · `landing-leads` · `lead-sources` · `duplicates` · `fraud-patterns` · `audit-chain` · `feature-visibility` · `widget-embeds` · `social-cards` · `whatsapp` · `newsletter` · `user-diagnostics` · `onboarding-analytics` · `partners` · `cross-sell-analytics` · `health` (+ detalles `desarrollos/:id`, `data-sources/:id`, `ie-engine-sources/:id`)

### 3.4 Comprador (12 rutas: 1 en-nav · 10 huérfanas · 1 detalle) — §N EXACTO ✓: portal SIN sidebar propio

| ruta | componente | clasificación |
|---|---|---|
| `/comprador` | CompradorDashboard | en-nav (única) |
| `/comprador/saved-searches` | CompradorSavedSearches | huérfana |
| `/comprador/favoritos` | CompradorFavoritos | huérfana |
| `/comprador/historial` | CompradorHistorial | huérfana |
| `/comprador/privacidad` | CompradorPrivacy | huérfana |
| `/comprador/alertas` | CompradorAlertas | huérfana |
| `/comprador/chat` | CompradorChat | huérfana |
| `/comprador/asistente` | CompradorAsistente | huérfana |
| `/comprador/comparar` | CompradorComparador | huérfana |
| `/comprador/wrapped` | CompradorWrapped | huérfana |
| `/comprador/wrapped/:yearMonth` | CompradorWrapped | detalle |
| `/login-comprador` | MagicLinkLogin | pública de auth (sin nav por diseño) |

### 3.5 Público / Marketplace (73 rutas: 5 en-nav · ~49 sin-nav (muchas por diseño: SEO/widgets/deep-links) · 1 redirect · 18 detalle · 1 fallback)

> En público "sin nav" NO implica huérfana-problema: landings SEO, widgets embed y deep-links
> viven sin menú por diseño. B4 separa "sin-nav por diseño" de "huérfana-problema".

| ruta | componente | clasificación |
|---|---|---|
| `/` | LandingPage | en-nav |
| `/p/:token` | SwipeLinkRoute | detalle |
| `/marketplace` | Marketplace | en-nav |
| `/propiedad/:id` | PropertyDetail | detalle |
| `/desarrollo/:id` | DevelopmentDetail | detalle |
| `/mapa` | Mapa | en-nav |
| `/mapa/:alcaldia` | Mapa | detalle |
| `/mapa/:alcaldia/:colonia` | Mapa | detalle |
| `/valores` | Valores | sin-nav |
| `/colonia/:slug` | ColoniaLanding | detalle (SEO programático) |
| `/confianza` | ConfianzaPage | sin-nav |
| `/broker-portal` | BrokerPortal | sin-nav |
| `/barrios` | Barrios | en-nav |
| `/inteligencia` | Inteligencia | en-nav |
| `/asesores` | AsesoresLanding | sin-nav (§N ✓ — la lista en asesor) |
| `/asesor-publico/:id` | PerfilAsesor | detalle |
| `/tools/tax-projector` | TaxProjectorPage | sin-nav |
| `/portal/comparador` | ComparatorPage | sin-nav |
| `/portal/buscar` | ReverseSearchPage | sin-nav |
| `/portal/vibe` | MoodQuizPage | sin-nav |
| `/portal/probability` | ProbabilityPage | sin-nav |
| `/portal/climate-migration` | ClimateMigrationPage | sin-nav |
| `/portal/settings/notifications` | NotificationsSettings | sin-nav |
| `/portal/notifications` | NotificationsSettings | sin-nav (alias) |
| `/portal/outbound` | AsesorOutbound (alias) | sin-nav (alias — revisar B4) |
| `/simulador` | Simulador | sin-nav |
| `/embed/3dgs/:unit_id` | Embed3DGSPage | detalle (embed) |
| `/free-audit` | FreeAudit | sin-nav |
| `/insights/state-of-cdmx-2026` | StateOfCDMX | sin-nav |
| `/insights/global` | InsightsGlobal | sin-nav |
| `/insights/compare/:topic` | InsightsCompare | detalle |
| `/connect/mcp/tutorial` | MCPTutorial | sin-nav |
| `/connect/mcp` | ConnectMcpPage | sin-nav |
| `/asistente` | AsistentePage | sin-nav |
| `/zona/:slug` | ZonePage | detalle (SEO) |
| `/alcaldia/:slug` | AlcaldiaPage | detalle (SEO) |
| `/cdmx/:intent` | CdmxSlugDispatcher | detalle (SEO) |
| `/landing/:slug` | LandingPublicPage | detalle (Studio) |
| `/aceptar-invitacion/:token` | AceptarInvitacion | detalle |
| `/cita/:token` | PublicCitaPage | detalle |
| `/reservar/:slug` | PublicBookingPage | detalle |
| `/comparar` | PublicComparator | sin-nav |
| `/propiedades` | `<Navigate>` → /marketplace | redirect (§N ✓) |
| `/methodology` | MethodologyPage | sin-nav |
| `/boletin/:slug/:period` | BulletinPage | detalle |
| `/docs/api` | ApiDocsPage | sin-nav |
| `/privacy/dsr` | PrivacyDsrPage | sin-nav |
| `/widgets/score/:slug` | ScoreWidgetPage | detalle (embed) |
| `/widgets/risk/:slug` | RiskWidgetPage | detalle (embed) |
| `/widgets/avm/:slug` | AvmWidgetPage | detalle (embed) |
| `/valor/:slug` | ValorColonia | detalle (SEO) |
| `/prensa` | PrensaPage | sin-nav |
| `/widget/bank-avm` | BankAvmWidget | sin-nav (embed vendible) |
| `/widget/insurance-risk` | InsuranceRiskWidget | sin-nav (embed vendible) |
| `/widget/notaria-title-check` | NotariaTitleWidget | sin-nav (embed vendible) |
| `/widget/investor-yield` | InvestorYieldWidget | sin-nav (embed vendible) |
| `/inmobiliaria` | InmobiliariaDashboard | sin-nav (portal inmobiliaria) |
| `/inmobiliaria/asesores` | InmobiliariaAsesores | sin-nav |
| `/inmobiliaria/leads` | InmobiliariaLeads | sin-nav |
| `/inmobiliaria/alianzas` | InmobiliariaPartnerships | sin-nav |
| `/inmobiliaria/signup` | InmobiliariaSignup | sin-nav |
| `/inmobiliaria/usuarios` | InmobiliariaUsuariosCRUD | sin-nav |
| `/inmobiliaria/mini-market` | InmobiliariaMiniMarket | sin-nav |
| `/inmobiliaria/cross-partnerships` | InmobiliariaCrossPartnerships | sin-nav |
| `/inmobiliaria/red-comercial` | InmobiliariaRedComercial | sin-nav |
| `/in-house/aceptar-invitacion` | InHouseSignup | sin-nav |
| `/configuracion/preferencias` | PreferenciasPage | sin-nav |
| `/configuracion/branding` | BrandingPage | sin-nav |
| `*` | FallbackRoute | fallback |

> **Nota §N/B4:** el "portal inmobiliaria" (9 rutas `/inmobiliaria/*`) no aparece en §N como
> superficie propia — inventariado aquí como sub-superficie del público; clasificar en B4.

---

## 4-6. Backend ítem por ítem (routers · motores · services · cerebro)

> Dominio (routers) por regla de prefijo/nombre documentada; familia (motores) por regla de
> nombre — ambas navegacionales, se refinan al auditar. Estado: TODO PENDIENTE (0%).

### Tabla R — Routers (backend/routes/, 215 archivos)

| router | dominio | líneas | estado | razón-si-N/A | hallazgos |
|---|---|---|---|---|---|
| `advisor.py` | asesor/advisor | 4020 | PENDIENTE |  | |
| `advisor_whitelist.py` | asesor/advisor | 351 | PENDIENTE |  | |
| `argumentario.py` | asesor/advisor | 111 | PENDIENTE |  | |
| `asesor_daily_tools.py` | asesor/advisor | 186 | PENDIENTE |  | |
| `asesor_identity.py` | asesor/advisor | 482 | PENDIENTE |  | |
| `asesor_market.py` | asesor/advisor | 49 | PENDIENTE |  | |
| `asesor_metrics.py` | asesor/advisor | 94 | PENDIENTE |  | |
| `asesor_playbook.py` | asesor/advisor | 134 | PENDIENTE |  | |
| `badges.py` | asesor/advisor | 114 | PENDIENTE |  | |
| `battle_card.py` | asesor/advisor | 656 | PENDIENTE |  | |
| `cross_sell.py` | asesor/advisor | 209 | PENDIENTE |  | |
| `inmobiliaria.py` | asesor/advisor | 353 | PENDIENTE |  | |
| `auth.py` | auth/infra | 515 | PENDIENTE |  | |
| `bulk_ingest.py` | auth/infra | 470 | PENDIENTE |  | |
| `compliance.py` | auth/infra | 271 | PENDIENTE |  | |
| `data_doctrine.py` | auth/infra | 29 | PENDIENTE |  | |
| `data_licensing.py` | auth/infra | 457 | PENDIENTE |  | |
| `data_sources.py` | auth/infra | 213 | PENDIENTE |  | |
| `diagnostic.py` | auth/infra | 888 | PENDIENTE |  | |
| `disputes.py` | auth/infra | 359 | PENDIENTE |  | |
| `documents.py` | auth/infra | 1031 | PENDIENTE |  | |
| `feature_visibility.py` | auth/infra | 684 | PENDIENTE |  | |
| `internal_users.py` | auth/infra | 451 | PENDIENTE |  | |
| `mcp_distribution.py` | auth/infra | 58 | PENDIENTE |  | |
| `notifications.py` | auth/infra | 124 | PENDIENTE |  | |
| `observability.py` | auth/infra | 305 | PENDIENTE |  | |
| `phase_y_controls.py` | auth/infra | 220 | PENDIENTE |  | |
| `rag_admin.py` | auth/infra | 127 | PENDIENTE |  | |
| `workflows.py` | auth/infra | 288 | PENDIENTE |  | |
| `agent_workforce.py` | cerebro/agéntico | 176 | PENDIENTE |  | |
| `agentic_crm.py` | cerebro/agéntico | 1314 | PENDIENTE |  | |
| `cerebro.py` | cerebro/agéntico | 309 | PENDIENTE |  | |
| `cerebro_mercado.py` | cerebro/agéntico | 35 | PENDIENTE |  | |
| `director.py` | cerebro/agéntico | 276 | PENDIENTE |  | |
| `director_memory.py` | cerebro/agéntico | 145 | PENDIENTE |  | |
| `knowledge_graph.py` | cerebro/agéntico | 397 | PENDIENTE |  | |
| `subagents.py` | cerebro/agéntico | 628 | PENDIENTE |  | |
| `buy_signal.py` | comprador/buyer | 306 | PENDIENTE |  | |
| `buyer_alerts.py` | comprador/buyer | 177 | PENDIENTE |  | |
| `buyer_coach.py` | comprador/buyer | 163 | PENDIENTE |  | |
| `buyer_score.py` | comprador/buyer | 180 | PENDIENTE |  | |
| `comprador.py` | comprador/buyer | 355 | PENDIENTE |  | |
| `comprador_compare.py` | comprador/buyer | 99 | PENDIENTE |  | |
| `free_audit.py` | comprador/buyer | 242 | PENDIENTE |  | |
| `grafo_comprador.py` | comprador/buyer | 63 | PENDIENTE |  | |
| `asistente.py` | conversación/IA | 334 | PENDIENTE |  | |
| `chat.py` | conversación/IA | 149 | PENDIENTE |  | |
| `conversation.py` | conversación/IA | 350 | PENDIENTE |  | |
| `conversation_ab_testing.py` | conversación/IA | 172 | PENDIENTE |  | |
| `conversation_confidence.py` | conversación/IA | 199 | PENDIENTE |  | |
| `conversation_cost.py` | conversación/IA | 103 | PENDIENTE |  | |
| `conversation_drift.py` | conversación/IA | 268 | PENDIENTE |  | |
| `conversation_kb_gaps.py` | conversación/IA | 106 | PENDIENTE |  | |
| `copilot.py` | conversación/IA | 145 | PENDIENTE |  | |
| `voice.py` | conversación/IA | 147 | PENDIENTE |  | |
| `accuracy.py` | datos/AVM/valuación | 574 | PENDIENTE |  | |
| `atlax_persona.py` | datos/AVM/valuación | 254 | PENDIENTE |  | |
| `auto_pilot.py` | datos/AVM/valuación | 83 | PENDIENTE |  | |
| `avm_accuracy.py` | datos/AVM/valuación | 186 | PENDIENTE |  | |
| `b13.py` | datos/AVM/valuación | 545 | PENDIENTE |  | |
| `behavioral.py` | datos/AVM/valuación | 158 | PENDIENTE |  | |
| `climate_migration.py` | datos/AVM/valuación | 275 | PENDIENTE |  | |
| `cma.py` | datos/AVM/valuación | 179 | PENDIENTE |  | |
| `construction_quality.py` | datos/AVM/valuación | 136 | PENDIENTE |  | |
| `demanda_demografica.py` | datos/AVM/valuación | 40 | PENDIENTE |  | |
| `dmx_indices.py` | datos/AVM/valuación | 370 | PENDIENTE |  | |
| `drpi.py` | datos/AVM/valuación | 221 | PENDIENTE |  | |
| `entity_resolution.py` | datos/AVM/valuación | 294 | PENDIENTE |  | |
| `estudio_mercado.py` | datos/AVM/valuación | 226 | PENDIENTE |  | |
| `fit.py` | datos/AVM/valuación | 185 | PENDIENTE |  | |
| `forecast_accuracy.py` | datos/AVM/valuación | 258 | PENDIENTE |  | |
| `fraud_detection.py` | datos/AVM/valuación | 160 | PENDIENTE |  | |
| `fsd.py` | datos/AVM/valuación | 81 | PENDIENTE |  | |
| `gov_data_mx.py` | datos/AVM/valuación | 175 | PENDIENTE |  | |
| `hook_predictor.py` | datos/AVM/valuación | 116 | PENDIENTE |  | |
| `ie_engine.py` | datos/AVM/valuación | 759 | PENDIENTE |  | |
| `investment_explorer.py` | datos/AVM/valuación | 199 | PENDIENTE |  | |
| `investment_simulator.py` | datos/AVM/valuación | 251 | PENDIENTE |  | |
| `location_intel.py` | datos/AVM/valuación | 271 | PENDIENTE |  | |
| `mood.py` | datos/AVM/valuación | 139 | PENDIENTE |  | |
| `predictive_alerts.py` | datos/AVM/valuación | 281 | PENDIENTE |  | |
| `risk_alerts.py` | datos/AVM/valuación | 122 | PENDIENTE |  | |
| `risk_score.py` | datos/AVM/valuación | 181 | PENDIENTE |  | |
| `score_inversion.py` | datos/AVM/valuación | 76 | PENDIENTE |  | |
| `scores.py` | datos/AVM/valuación | 599 | PENDIENTE |  | |
| `state_of_cdmx.py` | datos/AVM/valuación | 50 | PENDIENTE |  | |
| `tax_projector.py` | datos/AVM/valuación | 175 | PENDIENTE |  | |
| `terminal_mercado.py` | datos/AVM/valuación | 59 | PENDIENTE |  | |
| `transaction_network.py` | datos/AVM/valuación | 304 | PENDIENTE |  | |
| `trends.py` | datos/AVM/valuación | 121 | PENDIENTE |  | |
| `whatif.py` | datos/AVM/valuación | 249 | PENDIENTE |  | |
| `dev_amenity_intel.py` | dev | 149 | PENDIENTE |  | |
| `dev_batch1.py` | dev | 1547 | PENDIENTE |  | |
| `dev_batch10.py` | dev | 605 | PENDIENTE |  | |
| `dev_batch11.py` | dev | 1029 | PENDIENTE |  | |
| `dev_batch14.py` | dev | 511 | PENDIENTE |  | |
| `dev_batch15.py` | dev | 484 | PENDIENTE |  | |
| `dev_batch16.py` | dev | 315 | PENDIENTE |  | |
| `dev_batch17.py` | dev | 609 | PENDIENTE |  | |
| `dev_batch18.py` | dev | 232 | PENDIENTE |  | |
| `dev_batch19.py` | dev | 378 | PENDIENTE |  | |
| `dev_batch2.py` | dev | 1539 | PENDIENTE |  | |
| `dev_batch3.py` | dev | 416 | PENDIENTE |  | |
| `dev_batch4.py` | dev | 969 | PENDIENTE |  | |
| `dev_batch4_1.py` | dev | 1786 | PENDIENTE |  | |
| `dev_batch4_2.py` | dev | 984 | PENDIENTE |  | |
| `dev_batch4_3.py` | dev | 834 | PENDIENTE |  | |
| `dev_batch4_4.py` | dev | 751 | PENDIENTE |  | |
| `dev_batch5.py` | dev | 1029 | PENDIENTE |  | |
| `dev_batch6.py` | dev | 514 | PENDIENTE |  | |
| `dev_batch7.py` | dev | 1412 | PENDIENTE |  | |
| `dev_batch7_2.py` | dev | 446 | PENDIENTE |  | |
| `dev_batch8.py` | dev | 895 | PENDIENTE |  | |
| `dev_broker_intel.py` | dev | 143 | PENDIENTE |  | |
| `dev_channel_intel.py` | dev | 140 | PENDIENTE |  | |
| `dev_insights_intel.py` | dev | 171 | PENDIENTE |  | |
| `dev_market.py` | dev | 54 | PENDIENTE |  | |
| `dev_price_history.py` | dev | 175 | PENDIENTE |  | |
| `dev_project_full.py` | dev | 414 | PENDIENTE |  | |
| `dev_sales_intel.py` | dev | 237 | PENDIENTE |  | |
| `dev_valor_residual.py` | dev | 163 | PENDIENTE |  | |
| `developer.py` | dev | 1451 | PENDIENTE |  | |
| `project_wizard.py` | dev | 145 | PENDIENTE |  | |
| `wizard.py` | dev | 780 | PENDIENTE |  | |
| `__init__.py` | infra | 0 | N/A | archivo vacío (paquete) | |
| `caya_legacy.py` | otros | 37 | PENDIENTE |  | |
| `external_insights.py` | otros | 290 | PENDIENTE |  | |
| `external_search.py` | otros | 267 | PENDIENTE |  | |
| `funnel.py` | otros | 326 | PENDIENTE |  | |
| `house_leads.py` | otros | 246 | PENDIENTE |  | |
| `insights.py` | otros | 478 | PENDIENTE |  | |
| `lead_capture.py` | otros | 346 | PENDIENTE |  | |
| `lead_enrichment.py` | otros | 214 | PENDIENTE |  | |
| `lead_journey.py` | otros | 168 | PENDIENTE |  | |
| `lead_match.py` | otros | 134 | PENDIENTE |  | |
| `live_pulse.py` | otros | 422 | PENDIENTE |  | |
| `maps.py` | otros | 206 | PENDIENTE |  | |
| `maps_cross.py` | otros | 151 | PENDIENTE |  | |
| `marketing_mcp.py` | otros | 110 | PENDIENTE |  | |
| `newsletter.py` | otros | 207 | PENDIENTE |  | |
| `partners.py` | otros | 401 | PENDIENTE |  | |
| `phase5_foundation.py` | otros | 198 | PENDIENTE |  | |
| `press.py` | otros | 102 | PENDIENTE |  | |
| `private_beta.py` | otros | 240 | PENDIENTE |  | |
| `recommendations.py` | otros | 102 | PENDIENTE |  | |
| `reputation_monitor.py` | otros | 212 | PENDIENTE |  | |
| `reverse_search.py` | otros | 110 | PENDIENTE |  | |
| `reviews_residents.py` | otros | 107 | PENDIENTE |  | |
| `search_prefs.py` | otros | 181 | PENDIENTE |  | |
| `seo_files.py` | otros | 162 | PENDIENTE |  | |
| `seo_themed.py` | otros | 163 | PENDIENTE |  | |
| `share_meta.py` | otros | 493 | PENDIENTE |  | |
| `smart_lists.py` | otros | 200 | PENDIENTE |  | |
| `soc_franchise.py` | otros | 132 | PENDIENTE |  | |
| `team_aggregated.py` | otros | 282 | PENDIENTE |  | |
| `team_productivity.py` | otros | 174 | PENDIENTE |  | |
| `tracking_links.py` | otros | 289 | PENDIENTE |  | |
| `vertical_products.py` | otros | 287 | PENDIENTE |  | |
| `watchlist.py` | otros | 234 | PENDIENTE |  | |
| `whatsapp.py` | otros | 245 | PENDIENTE |  | |
| `widget_embed_analytics.py` | otros | 171 | PENDIENTE |  | |
| `widgets.py` | otros | 161 | PENDIENTE |  | |
| `wrapped.py` | otros | 241 | PENDIENTE |  | |
| `avm_public.py` | public/marketplace | 238 | PENDIENTE |  | |
| `briefing_traffic.py` | public/marketplace | 93 | PENDIENTE |  | |
| `bulletins.py` | public/marketplace | 270 | PENDIENTE |  | |
| `comparable_alerts.py` | public/marketplace | 81 | PENDIENTE |  | |
| `compare.py` | public/marketplace | 70 | PENDIENTE |  | |
| `directories.py` | public/marketplace | 65 | PENDIENTE |  | |
| `forecast_public.py` | public/marketplace | 190 | PENDIENTE |  | |
| `landings.py` | public/marketplace | 489 | PENDIENTE |  | |
| `lead_capture_marketplace.py` | public/marketplace | 213 | PENDIENTE |  | |
| `marketplace_calculator.py` | public/marketplace | 225 | PENDIENTE |  | |
| `marketplace_lead_tools.py` | public/marketplace | 309 | PENDIENTE |  | |
| `marketplace_map.py` | public/marketplace | 319 | PENDIENTE |  | |
| `marketplace_search.py` | public/marketplace | 208 | PENDIENTE |  | |
| `marketplace_templates.py` | public/marketplace | 293 | PENDIENTE |  | |
| `public.py` | public/marketplace | 704 | PENDIENTE |  | |
| `public_api_v1.py` | public/marketplace | 700 | PENDIENTE |  | |
| `public_market.py` | public/marketplace | 79 | PENDIENTE |  | |
| `public_zones.py` | public/marketplace | 189 | PENDIENTE |  | |
| `swipe_public.py` | public/marketplace | 315 | PENDIENTE |  | |
| `zones_public.py` | public/marketplace | 70 | PENDIENTE |  | |
| `brochure.py` | studio | 264 | PENDIENTE |  | |
| `floor_view.py` | studio | 340 | PENDIENTE |  | |
| `generador_producto.py` | studio | 42 | PENDIENTE |  | |
| `narrative.py` | studio | 127 | PENDIENTE |  | |
| `social_ads.py` | studio | 290 | PENDIENTE |  | |
| `social_cards.py` | studio | 302 | PENDIENTE |  | |
| `studio.py` | studio | 719 | PENDIENTE |  | |
| `studio_assets.py` | studio | 264 | PENDIENTE |  | |
| `studio_auto_content.py` | studio | 102 | PENDIENTE |  | |
| `studio_brand_kit.py` | studio | 150 | PENDIENTE |  | |
| `studio_buyer_copy.py` | studio | 103 | PENDIENTE |  | |
| `studio_carrusel.py` | studio | 288 | PENDIENTE |  | |
| `studio_landing.py` | studio | 760 | PENDIENTE |  | |
| `studio_listing.py` | studio | 108 | PENDIENTE |  | |
| `studio_property_intake.py` | studio | 351 | PENDIENTE |  | |
| `studio_video.py` | studio | 268 | PENDIENTE |  | |
| `tour_3dgs.py` | studio | 337 | PENDIENTE |  | |
| `tour_analytics.py` | studio | 189 | PENDIENTE |  | |
| `video_standalone.py` | studio | 262 | PENDIENTE |  | |
| `virtual_staging.py` | studio | 246 | PENDIENTE |  | |
| `superadmin_ai_cost.py` | superadmin | 277 | PENDIENTE |  | |
| `superadmin_audit.py` | superadmin | 373 | PENDIENTE |  | |
| `superadmin_catalog_pulse.py` | superadmin | 257 | PENDIENTE |  | |
| `superadmin_commercial.py` | superadmin | 409 | PENDIENTE |  | |
| `superadmin_data_hub.py` | superadmin | 267 | PENDIENTE |  | |
| `superadmin_data_lake.py` | superadmin | 218 | PENDIENTE |  | |
| `superadmin_devmaster.py` | superadmin | 1955 | PENDIENTE |  | |
| `superadmin_founder_console.py` | superadmin | 528 | PENDIENTE |  | |
| `superadmin_health.py` | superadmin | 463 | PENDIENTE |  | |
| `superadmin_intelligence_hub.py` | superadmin | 336 | PENDIENTE |  | |
| `superadmin_metrics_cube.py` | superadmin | 709 | PENDIENTE |  | |
| `superadmin_tenants.py` | superadmin | 541 | PENDIENTE |  | |

**Conteo por dominio:** asesor/advisor: 12 · auth/infra: 17 · cerebro/agéntico: 8 · comprador/buyer: 8 · conversación/IA: 10 · datos/AVM/valuación: 36 · dev: 33 · infra: 1 · otros: 38 · public/marketplace: 20 · studio: 20 · superadmin: 12

### Tabla M — Motores `*_engine.py` (168 archivos)

| motor | ubicación | familia | líneas | estado | hallazgos |
|---|---|---|---|---|---|
| `ab_testing_engine.py` | backend | studio/contenido | 355 | PENDIENTE | |
| `absorcion_engine.py` | backend | absorción/ventas | 127 | PENDIENTE | |
| `accuracy_engine.py` | backend | conversación/IA-LLM/agentic | 329 | PENDIENTE | |
| `argumentario_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 898 | PENDIENTE | |
| `disc_inferencer_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 826 | PENDIENTE | |
| `match_weights_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 651 | PENDIENTE | |
| `observability_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 1555 | PENDIENTE | |
| `reply_classifier_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 775 | PENDIENTE | |
| `smart_routing_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 1020 | PENDIENTE | |
| `visit_prep_engine.py` | backend/agentic_crm | conversación/IA-LLM/agentic | 900 | PENDIENTE | |
| `ai_quota_engine.py` | backend | infra/otros | 225 | PENDIENTE | |
| `amenidades_engine.py` | backend | zone/colonia/datos-ext | 139 | PENDIENTE | |
| `anomaly_detection_engine.py` | backend | forecast/predicción | 490 | PENDIENTE | |
| `anonymization_engine.py` | backend | privacidad/compliance | 167 | PENDIENTE | |
| `apify_trends_engine.py` | backend | competitivo/mercado | 676 | PENDIENTE | |
| `asesor_digest_engine.py` | backend | conversación/IA-LLM/agentic | 318 | PENDIENTE | |
| `asistente_engine.py` | backend | conversación/IA-LLM/agentic | 4085 | PENDIENTE | |
| `atlax_engine.py` | backend | conversación/IA-LLM/agentic | 548 | PENDIENTE | |
| `atlax_persona_engine.py` | backend | conversación/IA-LLM/agentic | 232 | PENDIENTE | |
| `audit_immutable_engine.py` | backend | privacidad/compliance | 282 | PENDIENTE | |
| `auto_pilot_engine.py` | backend | buyer/lead/score | 362 | PENDIENTE | |
| `auto_sync_engine.py` | backend | infra/otros | 593 | PENDIENTE | |
| `avm_explain_engine.py` | backend | avm/valuación | 198 | PENDIENTE | |
| `avm_feature_engine.py` | backend | avm/valuación | 114 | PENDIENTE | |
| `avm_public_engine.py` | backend | avm/valuación | 388 | PENDIENTE | |
| `bancabilidad_engine.py` | backend | fit/match | 189 | PENDIENTE | |
| `battle_card_engine.py` | backend | studio/contenido | 524 | PENDIENTE | |
| `behavioral_tracking_engine.py` | backend | live_pulse/behavioral | 132 | PENDIENTE | |
| `briefing_engine.py` | backend | studio/contenido | 521 | PENDIENTE | |
| `brochure_engine.py` | backend | studio/contenido | 493 | PENDIENTE | |
| `bulk_ingest_engine.py` | backend | ingesta | 800 | PENDIENTE | |
| `bulletins_engine.py` | backend | studio/contenido | 472 | PENDIENTE | |
| `buyer_coach_engine.py` | backend | buyer/lead/score | 695 | PENDIENTE | |
| `buyer_score_engine.py` | backend | buyer/lead/score | 198 | PENDIENTE | |
| `captacion_value_engine.py` | backend | buyer/lead/score | 58 | PENDIENTE | |
| `cerebro_mercado_engine.py` | backend | competitivo/mercado | 271 | PENDIENTE | |
| `churn_prediction_engine.py` | backend | churn/coaching/nurture | 203 | PENDIENTE | |
| `climate_migration_engine.py` | backend | forecast/predicción | 883 | PENDIENTE | |
| `cma_engine.py` | backend | avm/valuación | 539 | PENDIENTE | |
| `comparable_anomaly_engine.py` | backend | avm/valuación | 243 | PENDIENTE | |
| `comparator_engine.py` | backend | competitivo/mercado | 412 | PENDIENTE | |
| `compliance_engine.py` | backend | privacidad/compliance | 503 | PENDIENTE | |
| `construction_cost_engine.py` | backend | avm/valuación | 321 | PENDIENTE | |
| `construction_quality_engine.py` | backend | avm/valuación | 402 | PENDIENTE | |
| `conversation_cost_stats_engine.py` | backend | conversación/IA-LLM/agentic | 223 | PENDIENTE | |
| `conversation_engine.py` | backend | conversación/IA-LLM/agentic | 1052 | PENDIENTE | |
| `conversation_kb_gaps_engine.py` | backend | conversación/IA-LLM/agentic | 335 | PENDIENTE | |
| `crime_data_engine.py` | backend | zone/colonia/datos-ext | 287 | PENDIENTE | |
| `crime_fgj_engine.py` | backend | zone/colonia/datos-ext | 193 | PENDIENTE | |
| `cross_check_engine.py` | backend | fit/match | 463 | PENDIENTE | |
| `cross_sell_engine.py` | backend | buyer/lead/score | 569 | PENDIENTE | |
| `cube_olap_engine.py` | backend | infra/otros | 573 | PENDIENTE | |
| `atlas_riesgos_engine.py` | backend/data_sources | zone/colonia/datos-ext | 116 | PENDIENTE | |
| `banxico_engine.py` | backend/data_sources | zone/colonia/datos-ext | 161 | PENDIENTE | |
| `catastro_engine.py` | backend/data_sources | zone/colonia/datos-ext | 179 | PENDIENTE | |
| `gtfs_engine.py` | backend/data_sources | zone/colonia/datos-ext | 203 | PENDIENTE | |
| `osm_engine.py` | backend/data_sources | zone/colonia/datos-ext | 199 | PENDIENTE | |
| `sigcdmx_engine.py` | backend/data_sources | zone/colonia/datos-ext | 180 | PENDIENTE | |
| `demanda_demografica_engine.py` | backend | forecast/predicción | 107 | PENDIENTE | |
| `diagnostic_engine.py` | backend | conversación/IA-LLM/agentic | 627 | PENDIENTE | |
| `director_agent_engine.py` | backend | conversación/IA-LLM/agentic | 1263 | PENDIENTE | |
| `director_memory_engine.py` | backend | conversación/IA-LLM/agentic | 603 | PENDIENTE | |
| `dmx_indices_engine.py` | backend | drpi/índices | 230 | PENDIENTE | |
| `drive_engine.py` | backend | conversación/IA-LLM/agentic | 761 | PENDIENTE | |
| `drpi_engine.py` | backend | drpi/índices | 330 | PENDIENTE | |
| `entity_resolution_engine.py` | backend | fit/match | 745 | PENDIENTE | |
| `estudio_autopiloto_engine.py` | backend | studio/contenido | 131 | PENDIENTE | |
| `estudio_mercado_engine.py` | backend | studio/contenido | 441 | PENDIENTE | |
| `external_insights_engine.py` | backend | competitivo/mercado | 489 | PENDIENTE | |
| `extraction_engine.py` | backend | conversación/IA-LLM/agentic | 352 | PENDIENTE | |
| `feature_flags_engine.py` | backend | infra/otros | 484 | PENDIENTE | |
| `feature_gate_engine.py` | backend | infra/otros | 272 | PENDIENTE | |
| `fit_engine.py` | backend | fit/match | 808 | PENDIENTE | |
| `forecast_engine.py` | backend | forecast/predicción | 342 | PENDIENTE | |
| `fraud_detection_engine.py` | backend | risk | 492 | PENDIENTE | |
| `free_audit_engine.py` | backend | studio/contenido | 656 | PENDIENTE | |
| `fsd_engine.py` | backend | avm/valuación | 216 | PENDIENTE | |
| `generador_producto_engine.py` | backend | studio/contenido | 200 | PENDIENTE | |
| `golden_calibration_engine.py` | backend | avm/valuación | 191 | PENDIENTE | |
| `gov_data_mx_engine.py` | backend | zone/colonia/datos-ext | 561 | PENDIENTE | |
| `grafo_comprador_engine.py` | backend | buyer/lead/score | 337 | PENDIENTE | |
| `hedonic_regression_engine.py` | backend | avm/valuación | 246 | PENDIENTE | |
| `hook_predictor_engine.py` | backend | studio/contenido | 466 | PENDIENTE | |
| `house_pool_engine.py` | backend | pool/ruteo | 149 | PENDIENTE | |
| `insights_factcheck_engine.py` | backend | conversación/IA-LLM/agentic | 323 | PENDIENTE | |
| `intelligence_insights_engine.py` | backend | competitivo/mercado | 778 | PENDIENTE | |
| `inversionista_engine.py` | backend | investment/simulación | 110 | PENDIENTE | |
| `investment_simulator_engine.py` | backend | investment/simulación | 1140 | PENDIENTE | |
| `knowledge_graph_engine.py` | backend | fit/match | 404 | PENDIENTE | |
| `lead_capture_engine.py` | backend | buyer/lead/score | 578 | PENDIENTE | |
| `lead_capture_marketplace_engine.py` | backend | buyer/lead/score | 668 | PENDIENTE | |
| `lead_enrichment_engine.py` | backend | buyer/lead/score | 767 | PENDIENTE | |
| `lead_journey_engine.py` | backend | buyer/lead/score | 459 | PENDIENTE | |
| `lead_nurture_engine.py` | backend | buyer/lead/score | 1550 | PENDIENTE | |
| `live_pulse_engine.py` | backend | live_pulse/behavioral | 507 | PENDIENTE | |
| `lote_veredicto_engine.py` | backend | zone/colonia/datos-ext | 168 | PENDIENTE | |
| `maps_cross_engine.py` | backend | zone/colonia/datos-ext | 413 | PENDIENTE | |
| `maps_engine.py` | backend | zone/colonia/datos-ext | 529 | PENDIENTE | |
| `marketing_mcp_engine.py` | backend | competitivo/mercado | 453 | PENDIENTE | |
| `marketplace_templates_engine.py` | backend | studio/contenido | 665 | PENDIENTE | |
| `mcp_distribution_engine.py` | backend | studio/contenido | 106 | PENDIENTE | |
| `model_validation_engine.py` | backend | fit/match | 216 | PENDIENTE | |
| `mood_engine.py` | backend | conversación/IA-LLM/agentic | 300 | PENDIENTE | |
| `narrative_engine.py` | backend | studio/contenido | 677 | PENDIENTE | |
| `narrative_layer_engine.py` | backend | conversación/IA-LLM/agentic | 340 | PENDIENTE | |
| `natural_risk_engine.py` | backend | risk | 174 | PENDIENTE | |
| `newsletter_pulse_engine.py` | backend | live_pulse/behavioral | 532 | PENDIENTE | |
| `norma3_engine.py` | backend | privacidad/compliance | 156 | PENDIENTE | |
| `notifications_engine.py` | backend | infra/otros | 893 | PENDIENTE | |
| `osm_engine.py` | backend | zone/colonia/datos-ext | 187 | PENDIENTE | |
| `ownership_economics_engine.py` | backend | avm/valuación | 182 | PENDIENTE | |
| `perception_risk_engine.py` | backend | risk | 166 | PENDIENTE | |
| `perfil_zona_engine.py` | backend | zone/colonia/datos-ext | 121 | PENDIENTE | |
| `pipeline_engine.py` | backend | buyer/lead/score | 284 | PENDIENTE | |
| `predictive_alerts_engine.py` | backend | forecast/predicción | 656 | PENDIENTE | |
| `predio_due_diligence_engine.py` | backend | fit/match | 250 | PENDIENTE | |
| `preferencias_engine.py` | backend | buyer/lead/score | 193 | PENDIENTE | |
| `price_context_engine.py` | backend | drpi/índices | 152 | PENDIENTE | |
| `private_beta_engine.py` | backend | infra/otros | 209 | PENDIENTE | |
| `probability_engine.py` | backend | forecast/predicción | 509 | PENDIENTE | |
| `ie_engine.py` | backend/probes | infra/otros | 87 | PENDIENTE | |
| `project_wizard_engine.py` | backend | infra/otros | 233 | PENDIENTE | |
| `rag_engine.py` | backend | conversación/IA-LLM/agentic | 897 | PENDIENTE | |
| `reputation_monitor_engine.py` | backend | competitivo/mercado | 627 | PENDIENTE | |
| `resend_engine.py` | backend | infra/otros | 214 | PENDIENTE | |
| `reverse_search_engine.py` | backend | buyer/lead/score | 606 | PENDIENTE | |
| `reviews_residents_engine.py` | backend | zone/colonia/datos-ext | 483 | PENDIENTE | |
| `risk_score_engine.py` | backend | buyer/lead/score | 498 | PENDIENTE | |
| `ie_engine.py` | backend/routes | infra/otros | 759 | PENDIENTE | |
| `score_engine.py` | backend | buyer/lead/score | 362 | PENDIENTE | |
| `score_inversion_engine.py` | backend | buyer/lead/score | 318 | PENDIENTE | |
| `auto_approve_engine.py` | backend/services | infra/otros | 253 | PENDIENTE | |
| `chat_engine.py` | backend/services | conversación/IA-LLM/agentic | 346 | PENDIENTE | |
| `copilot_engine.py` | backend/services | conversación/IA-LLM/agentic | 247 | PENDIENTE | |
| `demand_engine.py` | backend/services | forecast/predicción | 132 | PENDIENTE | |
| `mini_market_engine.py` | backend/services | competitivo/mercado | 190 | PENDIENTE | |
| `shf_engine.py` | backend | fit/match | 252 | PENDIENTE | |
| `sig_catastro_engine.py` | backend | zone/colonia/datos-ext | 132 | PENDIENTE | |
| `simulador_palancas_engine.py` | backend | investment/simulación | 92 | PENDIENTE | |
| `smart_lists_engine.py` | backend | buyer/lead/score | 397 | PENDIENTE | |
| `soc_franchise_engine.py` | backend | studio/contenido | 564 | PENDIENTE | |
| `social_ads_engine.py` | backend | studio/contenido | 491 | PENDIENTE | |
| `social_cards_engine.py` | backend | studio/contenido | 480 | PENDIENTE | |
| `state_of_cdmx_engine.py` | backend | zone/colonia/datos-ext | 236 | PENDIENTE | |
| `stripe_billing_engine.py` | backend | infra/otros | 279 | PENDIENTE | |
| `studio_brand_kit_engine.py` | backend | studio/contenido | 234 | PENDIENTE | |
| `studio_buyer_copy_engine.py` | backend | buyer/lead/score | 645 | PENDIENTE | |
| `studio_carrusel_ab_engine.py` | backend | studio/contenido | 115 | PENDIENTE | |
| `studio_carrusel_engine.py` | backend | studio/contenido | 496 | PENDIENTE | |
| `studio_hook_score_engine.py` | backend | buyer/lead/score | 151 | PENDIENTE | |
| `studio_landing_engine.py` | backend | studio/contenido | 1685 | PENDIENTE | |
| `studio_video_engine.py` | backend | studio/contenido | 523 | PENDIENTE | |
| `tax_projector_engine.py` | backend | investment/simulación | 600 | PENDIENTE | |
| `terminal_mercado_engine.py` | backend | competitivo/mercado | 210 | PENDIENTE | |
| `tour_3dgs_engine.py` | backend | studio/contenido | 483 | PENDIENTE | |
| `transaction_network_engine.py` | backend | buyer/lead/score | 590 | PENDIENTE | |
| `unidad_insights_engine.py` | backend | zone/colonia/datos-ext | 151 | PENDIENTE | |
| `valor_residual_engine.py` | backend | avm/valuación | 302 | PENDIENTE | |
| `valores_unitarios_engine.py` | backend | avm/valuación | 115 | PENDIENTE | |
| `vertical_products_engine.py` | backend | infra/otros | 822 | PENDIENTE | |
| `video_standalone_engine.py` | backend | studio/contenido | 573 | PENDIENTE | |
| `virtual_staging_engine.py` | backend | studio/contenido | 424 | PENDIENTE | |
| `voice_atlax_engine.py` | backend | conversación/IA-LLM/agentic | 273 | PENDIENTE | |
| `whatif_engine.py` | backend | investment/simulación | 644 | PENDIENTE | |
| `whatsapp_engine.py` | backend | conversación/IA-LLM/agentic | 278 | PENDIENTE | |
| `workflow_engine.py` | backend | infra/otros | 823 | PENDIENTE | |
| `zone_cycle_engine.py` | backend | zone/colonia/datos-ext | 152 | PENDIENTE | |
| `zone_score_engine.py` | backend | zone/colonia/datos-ext | 632 | PENDIENTE | |

**Conteo por familia (regla de nombre, navegacional):** conversación/IA-LLM/agentic: 28 · studio/contenido: 24 · zone/colonia/datos-ext: 21 · buyer/lead/score: 21 · infra/otros: 15 · avm/valuación: 13 · competitivo/mercado: 9 · fit/match: 8 · forecast/predicción: 7 · investment/simulación: 5 · privacidad/compliance: 4 · live_pulse/behavioral: 3 · drpi/índices: 3 · risk: 3 · absorción/ventas: 1 · ingesta: 1 · churn/coaching/nurture: 1 · pool/ruteo: 1

### Tabla S — Services (backend/services/, 55 archivos)

| service | líneas | estado | razón-si-N/A | hallazgos |
|---|---|---|---|---|
| `__init__.py` | 1 | N/A | paquete | |
| `advisor_authorization.py` | 477 | PENDIENTE |  | |
| `ai_safety.py` | 96 | PENDIENTE |  | |
| `ampi_verification.py` | 76 | PENDIENTE |  | |
| `argumentario_rag.py` | 233 | PENDIENTE |  | |
| `argumentario_seed.py` | 424 | PENDIENTE |  | |
| `asesor_daily_feed.py` | 267 | PENDIENTE |  | |
| `asesor_metrics.py` | 168 | PENDIENTE |  | |
| `auto_approve_engine.py` | 253 | PENDIENTE |  | |
| `buyer_alerts.py` | 382 | PENDIENTE |  | |
| `buyer_history.py` | 169 | PENDIENTE |  | |
| `buyer_identity.py` | 141 | PENDIENTE |  | |
| `calendar_bidirectional.py` | 360 | PENDIENTE |  | |
| `chat_engine.py` | 346 | PENDIENTE |  | |
| `client_insights.py` | 398 | PENDIENTE |  | |
| `colonia_comparator.py` | 523 | PENDIENTE |  | |
| `colonia_history.py` | 194 | PENDIENTE |  | |
| `colonia_intelligence.py` | 226 | PENDIENTE |  | |
| `colonia_quiz.py` | 196 | PENDIENTE |  | |
| `colonia_report_pdf.py` | 363 | PENDIENTE |  | |
| `comprador_dashboard.py` | 145 | PENDIENTE |  | |
| `copilot_context.py` | 280 | PENDIENTE |  | |
| `copilot_engine.py` | 247 | PENDIENTE |  | |
| `cross_org_partnerships.py` | 353 | PENDIENTE |  | |
| `demand_engine.py` | 132 | PENDIENTE |  | |
| `directory_aggregator.py` | 450 | PENDIENTE |  | |
| `disc_test.py` | 267 | PENDIENTE |  | |
| `endorsements.py` | 284 | PENDIENTE |  | |
| `image_embeddings.py` | 284 | PENDIENTE |  | |
| `image_search.py` | 271 | PENDIENTE |  | |
| `inmobiliaria_relationships.py` | 214 | PENDIENTE |  | |
| `inmobiliaria_signup.py` | 135 | PENDIENTE |  | |
| `insights_ai.py` | 339 | PENDIENTE |  | |
| `insights_comparables.py` | 167 | PENDIENTE |  | |
| `insights_engagement.py` | 83 | PENDIENTE |  | |
| `internal_users.py` | 655 | PENDIENTE |  | |
| `lead_activity.py` | 85 | PENDIENTE |  | |
| `lead_bridge.py` | 251 | PENDIENTE |  | |
| `lead_capture.py` | 273 | PENDIENTE |  | |
| `lead_segments.py` | 128 | PENDIENTE |  | |
| `lead_to_asesor_match.py` | 491 | PENDIENTE |  | |
| `linkedin_import.py` | 149 | PENDIENTE |  | |
| `llm_guard.py` | 63 | PENDIENTE |  | |
| `mini_market_engine.py` | 190 | PENDIENTE |  | |
| `mortgage_calculator.py` | 227 | PENDIENTE |  | |
| `privacy_center.py` | 361 | PENDIENTE |  | |
| `query_limits.py` | 49 | PENDIENTE |  | |
| `sankey_data.py` | 126 | PENDIENTE |  | |
| `saved_searches.py` | 326 | PENDIENTE |  | |
| `smart_match.py` | 174 | PENDIENTE |  | |
| `traffic_briefing.py` | 280 | PENDIENTE |  | |
| `trust_score.py` | 190 | PENDIENTE |  | |
| `url_parser.py` | 333 | PENDIENTE |  | |
| `visit_auto_prep.py` | 472 | PENDIENTE |  | |
| `wrapped_generator.py` | 522 | PENDIENTE |  | |

### Tabla C — Cerebro (backend/cerebro/, 10 archivos)

| módulo | líneas | estado | hallazgos |
|---|---|---|---|
| `__init__.py` | 79 | PENDIENTE | |
| `coach.py` | 310 | PENDIENTE | |
| `config.py` | 163 | PENDIENTE | |
| `contract.py` | 246 | PENDIENTE | |
| `executors.py` | 742 | PENDIENTE | |
| `guardrails.py` | 87 | PENDIENTE | |
| `memory.py` | 81 | PENDIENTE | |
| `orchestrator.py` | 213 | PENDIENTE | |
| `recommendations.py` | 124 | PENDIENTE | |
| `store.py` | 181 | PENDIENTE | |

---

## 7. Colecciones Mongo (top 50 por nº de referencias en código · escritor literal detectado)

> **493 nombres distintos** detectados por grep estricto (`db.<nombre>.<operación>`); §B refería
> ~390 (~100 con datos) — el grep incluye posibles falsos positivos y colecciones dinámicas;
> depurar en B2.3. **Caveat escritor:** detectado por grep literal `db.<col>.<write>`; escrituras
> dinámicas (`db[var]`) NO se detectan — un "NO" abajo no prueba que esté muerta (verificar B2.3).
> Estado de auditoría: 0/50 (todas PENDIENTE).

| colección | refs | escritor literal | ejemplo escritor | estado |
|---|---|---|---|---|
| `leads` | 383 | SÍ | agentic_crm/reply_classifier_engine.py:579 | PENDIENTE |
| `users` | 237 | SÍ | services/internal_users.py:305 | PENDIENTE |
| `developments` | 114 | SÍ | bulk_ingest_engine.py:303 | PENDIENTE |
| `appointments` | 98 | SÍ | services/calendar_bidirectional.py:235 | PENDIENTE |
| `asesor_contactos` | 88 | SÍ | services/lead_bridge.py:172 | PENDIENTE |
| `projects` | 64 | SÍ | projects_unified.py:130 | PENDIENTE |
| `audit_log` | 62 | SÍ | audit_log.py:156 | PENDIENTE |
| `cube_aggregations` | 58 | no-literal | (posible escritor dinámico — verificar B2.3) | PENDIENTE |
| `units` | 51 | SÍ | bulk_ingest_engine.py:321 | PENDIENTE |
| `ie_scores` | 49 | no-literal | verificar B2.3 | PENDIENTE |
| `notifications` | 45 | SÍ | notifications_engine.py:222 | PENDIENTE |
| `colonias` | 43 | no-literal | verificar B2.3 | PENDIENTE |
| `behavioral_events` | 43 | no-literal | verificar B2.3 | PENDIENTE |
| `conversation_threads` | 41 | SÍ | conversation_confidence_score.py:80 | PENDIENTE |
| `transactions` | 38 | no-literal | (DB vacía por doctrina §C) | PENDIENTE |
| `studio_landings` | 35 | no-literal | verificar B2.3 | PENDIENTE |
| `inmobiliaria_internal_users` | 35 | no-literal | verificar B2.3 | PENDIENTE |
| `asesor_busquedas` | 35 | no-literal | verificar B2.3 | PENDIENTE |
| `ai_call_events` | 34 | no-literal | verificar B2.3 | PENDIENTE |
| `drpi_snapshots` | 33 | no-literal | verificar B2.3 | PENDIENTE |
| `command_center_actions` | 33 | no-literal | verificar B2.3 | PENDIENTE |
| `di_documents` | 32 | no-literal | verificar B2.3 | PENDIENTE |
| `workflows` | 31 | SÍ | marketplace_templates_engine.py:323 | PENDIENTE |
| `nurture_sequences` | 31 | no-literal | verificar B2.3 | PENDIENTE |
| `marketplace_templates` | 31 | no-literal | verificar B2.3 | PENDIENTE |
| `lead_routings` | 30 | no-literal | verificar B2.3 | PENDIENTE |
| `whatsapp_messages` | 29 | no-literal | verificar B2.3 | PENDIENTE |
| `system_alerts` | 28 | no-literal | verificar B2.3 | PENDIENTE |
| `lead_captures` | 27 | no-literal | verificar B2.3 | PENDIENTE |
| `dev_advisor_authorizations` | 27 | no-literal | verificar B2.3 | PENDIENTE |
| `buyer_scores` | 27 | no-literal | verificar B2.3 | PENDIENTE |
| `bulk_ingest_items` | 27 | no-literal | verificar B2.3 | PENDIENTE |
| `zone_scores` | 26 | no-literal | verificar B2.3 | PENDIENTE |
| `email_replies` | 26 | no-literal | verificar B2.3 | PENDIENTE |
| `dev_assets` | 26 | no-literal | verificar B2.3 | PENDIENTE |
| `asesor_operaciones` | 26 | no-literal | verificar B2.3 | PENDIENTE |
| `activity_log` | 25 | no-literal | verificar B2.3 | PENDIENTE |
| `inmobiliarias` | 24 | no-literal | verificar B2.3 | PENDIENTE |
| `bulk_ingest_jobs` | 24 | no-literal | verificar B2.3 | PENDIENTE |
| `partner_offers` | 23 | no-literal | verificar B2.3 | PENDIENTE |
| `chat_threads` | 23 | no-literal | verificar B2.3 | PENDIENTE |
| `studio_property_intakes` | 22 | no-literal | verificar B2.3 | PENDIENTE |
| `hedonic_models` | 22 | no-literal | verificar B2.3 | PENDIENTE |
| `health_scores` | 22 | no-literal | verificar B2.3 | PENDIENTE |
| `developer_unit_overrides` | 22 | no-literal | verificar B2.3 | PENDIENTE |
| `dev_internal_users` | 22 | no-literal | verificar B2.3 | PENDIENTE |
| `user_preferences` | 21 | no-literal | verificar B2.3 | PENDIENTE |
| `disc_profiles` | 21 | no-literal | verificar B2.3 | PENDIENTE |
| `dev_drive_connections` | 21 | no-literal | verificar B2.3 | PENDIENTE |
| `conversation_messages` / `asesor_contacto_timeline` | 21 c/u | no-literal | verificar B2.3 | PENDIENTE |

## 8. Flags (14 inventariados · auditoría 0/14)

| flag | dónde se define | default | dónde se lee | gobierna | estado |
|---|---|---|---|---|---|
| `CEREBRO_ENABLED` | env (solo `.env.local`) | **false (OFF en deploy)** | `cerebro/__init__.py:33` | motor agéntico central completo | PENDIENTE |
| `FEATURE_GATING_ENFORCED` | env | false | `feature_gate_engine.py:36` | enforcement de límites de plan (¿fail-open? → B1/§I) | PENDIENTE |
| `agentic_enabled` | settings (DB) | false | `routes/phase_y_controls.py:51` | suite CRM agéntico (29 endpoints) + sub-agents | PENDIENTE |
| `REACT_APP_DEV_V2` | frontend env | false (ON local) | `components/shared/PortalLayout.js:47` | portal dev V2 | PENDIENTE |
| `REACT_APP_SIDEBAR_V2` | frontend env | false | `components/shared/PortalLayout.js:44` | sidebar V2 | PENDIENTE |
| `LEADS_V2` | frontend env | false | `pages/asesor/AsesorContactos.js:28` | UI leads/contactos V2 | PENDIENTE |
| `ATLAS_RESENAS_ENABLED` | env | false | `reviews_residents_engine.py:139` | ingesta de reseñas | PENDIENTE |
| `IMAGE_EMBEDDINGS_ENABLED` | `.env.example:82` | false | `services/image_search.py:33` | búsqueda vectorial de imágenes | PENDIENTE |
| `CONVERSATION_MODEL` | env | claude-sonnet-4-5-20250929 | `conversation_engine.py:41` | modelo LLM conversación | PENDIENTE |
| `DIRECTOR_MODEL` | env | claude-sonnet-4-5-20250929 | `director_agent_engine.py:24` | modelo del director agent | PENDIENTE |
| `ASISTENTE_MODEL` | env | claude-sonnet-4-5-20250929 | `asistente_engine.py:31` | modelo de Atlax | PENDIENTE |
| `CONVERSATION_SONNET_MODEL` | env | claude-sonnet-4-5-20250929 | `conversation_cost_optimizer.py:21` | optimizador de costo | PENDIENTE |
| `CONVERSATION_OPUS_MODEL` | env | claude-opus-4-1-20250805 | `conversation_cost_optimizer.py:22` | fallback premium | PENDIENTE |
| (3 flags gitignored del rediseño asesor, default OFF — §2.4 del prompt) | env local | OFF | por confirmar en B2.4 | rediseño asesor | PENDIENTE |

## 9. Puntos-IA

### 9.A Call-sites LLM (inventario por grep vivo · auditoría 0/N)

> Conteo vivo: **~70 archivos** con llamadas LLM (120+ instanciaciones `LlmChat`, 50+
> `send_message`, 14 call-sites con `send_with_timeout`, 4+ llamadas OpenAI directas).
> **§B decía ~50 → superficie real MAYOR (registrado como divergencia §12).**
> Dato clave para B1/B9: **solo ~14 call-sites pasan por el wrapper `services/llm_guard.py::send_with_timeout`**
> (dev_batch5:764, dev_batch7:300/838/1076, dev_batch8:349/428, dev_batch11:111, dev_batch14:404,
> dev_batch6:260 + tests); el resto llama `LlmChat.send_message` directo — verificar timeout/presupuesto por sitio en B9.A.
> OpenAI directo: `rag_engine.py:47` (embeddings), `photo_tagger.py:117` (visión), `voice_atlax_engine.py:94`
> (Whisper), `routes/studio.py:483` y `studio_engines.py:190` (gpt-image-1).
> Motores con LLM (lista completa en grep de regeneración §14): hook_predictor, cma, anomaly_detection,
> studio_hook_score, reply_classifier, argumentario, smart_routing, visit_prep, disc_inferencer, dev_assets,
> visit_auto_prep, lead_to_asesor_match, image_search, insights_ai, wrapped_generator, client_insights,
> argumentario_rag, copilot, image_embeddings, colonia_history, disc_test, reputation_monitor,
> insights_factcheck, bulk_ingest, conversation_confidence, sub_agents/{lead,pricing,marketing},
> buyer_coach, reviews_residents, ai_suggestions, reverse_search, coaching_analysis,
> conversation_self_tuning, intelligence_insights, connector_registry, briefing, newsletter_pulse,
> diagnostic, lead_enrichment, conversation, narrative, narrative_layer, director_agent, asistente,
> studio_buyer_copy, studio_copy_generator, routes/{chat,public,advisor,asistente} y batches dev.

### 9.B Superficies de prompt-injection (8 — mapa §1.4 a auditar en B1; 0/8)

| # | superficie | entrada no confiable | estado |
|---|---|---|---|
| 1 | 🔴 Atlax público SIN auth (`asistente_engine.py`) | query del visitante | PENDIENTE |
| 2 | 🔴 Persona por tenant → system prompt (`atlax_persona_engine`) | campos editables del admin org | PENDIENTE |
| 3 | 🟡 Email entrante → clasificador (`agentic_crm/reply_classifier_engine.py`) | body de email externo | PENDIENTE |
| 4 | 🟡 Conversación WhatsApp/web broker (`conversation_engine.py`) | texto del lead + RAG/KG | PENDIENTE |
| 5 | 🟡 DISC inferencer (`agentic_crm/disc_inferencer_engine.py`) | free-text del lead → tool-calls parseadas | PENDIENTE |
| 6 | 🟡 Reseñas UGC (`reviews_residents_engine.py`) | texto de reseña | PENDIENTE |
| 7 | 🟡 RAG de 2º orden (`rag_context_helper.py` / `dmx_embeddings`) | contenido indexado | PENDIENTE |
| 8 | 🟢 Bulk ingest / OCR (`bulk_ingest_engine.py`, `extraction_engine`) | documento subido | PENDIENTE |

## 10. Índices Mongo REALES (extraídos del código — denominador del Bloque 3)

> **Fuente:** grep vivo `create_index|create_indexes|ensure_index` → **1,276 líneas** mencionan
> creación de índices (incluye definiciones, wrappers y comentarios); **~108 colecciones** con
> índice definido en código. **`getIndexes()` contra Mongo vivo: PENDIENTE — sin acceso a DB
> desde este entorno (correr en staging; acción founder o sesión con DB).**
>
> **✅ CORRECCIÓN re-leída en vivo (el primer barrido lo omitió):** `backend/asesor_indexes.py`
> define **22 índices sobre 9 colecciones del CRM asesor** (`asesor_contactos` ×3:
> owner_id+created_at / id / owner_id+phones_norm; `asesor_operaciones` ×4; `asesor_tareas` ×3;
> `asesor_busquedas` ×3; `asesor_contacto_timeline`, `asesor_taste_profile`, `asesor_photo_tags`,
> `asesor_briefings`, `lead_events`), con `ensure_asesor_indexes` **llamado en startup**
> (`server.py:1532-1533`) `[✓ re-leído en vivo]`. Fail-open por índice (loggea y sigue).

Núcleo verificado por el barrido (detalle completo reproducible con el grep de §14):
- **`leads`**: ~21 índices (dev_batch4.py:955-962, dev_batch4_1.py:1773-1777, dev_batch4_2.py:872-875, dev_batch4_4.py:736-737, pipeline_engine.py:486-488 sparse, auto_nurture_cron.py:193, dev_channel_intel.py:138) — riesgo de sobre-indexación a evaluar en B3.
- **`appointments`**: ~12 índices (dev_batch4_1.py:1764-1769 incl. `confirmation_token` unique sparse; dev_batch4_3.py:777-779; dev_batch4_4.py:738; dev_batch15.py:482-483).
- **`users`**: `email` unique + `user_id` (server.py:1408-1409).
- **`audit_log`**: 4 índices con tenant/ts (audit_log.py:230-233) + `audit_immutable` 4 (audit_immutable_engine.py:265-278).
- **`conversation_threads`/`conversation_messages`**: ~11 índices (conversation_engine.py:1024-1045, conversation_confidence.py:187-192).
- **Cerebro**: cerebro_tasks/memory/coaching/config con unique + **TTL** (store.py:31-37, memory.py:53-55, coach.py:57-70, config.py:42).
- **TTL (16 detectados):** notifications, cmas, undo_log, workflow_runs (90d), workflow_audit (180d), studio_landing_views, studio_landing_analytics, live_pulse_alerts_sent, api_call_logs (90d), trends_cache, kg_anomalies (30d), asesor_recent (30d), autopilot_log, asesor_digest_sends, agent_workforce_runs (30d), diagnostic_ai_cache (1d).
- **Caches con unique:** virtual_staging_cache, hook_predictor_cache, gov_data_mx_cache, marketing_mcp_cache, tax_projector_cache.
- **⚠️ A verificar en B3 (afirmaciones del barrido, AÚN no re-leídas):** `developments` con solo 2 índices sparse (construction_quality_engine.py:399-400); `cube_aggregations` sin índices definidos; cobertura de índices vs queries calientes de `projects`/`units` (units: id/unit_id sparse en server.py:1416-1417).

## 11. Línea-Base Cuantitativa de Salud (0.5) — capturada 2026-06-12 @ 7dd66fe3

| métrica | valor-hoy | comando |
|---|---|---|
| Accesos crudos Mongo a 6 colecciones sensibles | **739** (leads 262 · users 216 · developments 91 · asesor_contactos 83 · appointments 62 · units 25) | `grep -rnE "db\.(leads\|users\|developments\|asesor_contactos\|appointments\|units)\.(find\|find_one\|aggregate\|update_one\|update_many\|delete_one\|delete_many\|insert_one\|insert_many)" backend --include="*.py" \| wc -l` |
| — de esos, sin pasar por tenant_of/user_dev_ids/assert_* | PENDIENTE (análisis por call-site = B1.1.A; denominador 739 capturado) | — |
| Endpoints con `Body(` crudo en routes | **0** | `grep -rnE "=\s*Body\(" backend/routes --include="*.py" \| wc -l` |
| Params `: dict` en handlers de routes | **16** | `grep -rnE "def [a-z_]+\([^)]*:\s*dict" backend/routes --include="*.py" \| wc -l` |
| Definiciones locales `_tenant`/`_user_dev_ids`/`_user_org` | **23 definiciones en 18 archivos** (thin-wrapper vs divergente: clasificar en B2.4; lista completa en salida del comando) | `grep -rnE "def _(tenant\|user_dev_ids\|user_org)\b" backend --include="*.py"` |
| `except …: pass` (fail-open silencioso candidato) | **953 ocurrencias en 320 archivos** | `rg -U --glob '*.py' "except[^\n]*:\n\s+pass" backend` |
| `.find({})` sin filtro | **4** | `grep -rn "\.find({})" backend --include="*.py"` |
| `.find()` sin argumentos | **0** | `grep -rnE "\.find\(\)\s" backend --include="*.py"` |
| `REACT_APP_*` con KEY/SECRET/TOKEN/SALT/PASSWORD | **solo `REACT_APP_MAPBOX_TOKEN`** (20 usos / 15 archivos; token de cliente por diseño — cap server-side a auditar en B9.A) | `grep -rnoE "REACT_APP_[A-Z0-9_]*(KEY\|SECRET\|TOKEN\|SALT\|PASSWORD)[A-Z0-9_]*" frontend/src \| sort -u` |
| Módulos backend que compilan | **818/818 limpio (exit 0)** (§L decía 593 — el árbol creció; 0 errores hoy) | `python3 -m compileall -q backend -x "(__pycache__\|\.venv)"` |
| Build frontend | **VERDE** (exit 0, ~123s, contenedor limpio con `yarn install --frozen-lockfile`) | `CI=false yarn build` |
| Warnings ESLint en build | **271 líneas de warning en 145 archivos** (vs ~284 históricos; doctrina: cero nuevos, NO barrido masivo) | `grep -cE "Line [0-9]+:" /tmp/fe_build_full.log` |
| Bundle FE (gzip, top) | chunk mayor **476.5 kB** + main **399.7 kB** + 194.8 kB + 135.4 kB (hay code-splitting por ruta; chunks pesados a auditar en B3/B9.D) | salida `File sizes after gzip` del build |
| Menciones `create_index` | **1,276 líneas** / ~108 colecciones | `grep -rn "create_index\|create_indexes\|ensure_index" backend --include="*.py" \| wc -l` |

## 12. Divergencias Ground-Truth (§B/§N/§L del prompt vs repo vivo) — DOC-vs-CÓDIGO inicial

| afirmación del prompt/doc | vivo hoy | veredicto |
|---|---|---|
| §B: cerebro "11 módulos" | 10 archivos `.py` en `backend/cerebro/` | OBSOLETO (menor) |
| §B: "~390 colecciones" | 493 nombres por grep estricto (incluye falsos positivos a depurar) | VERIFICAR en B2.3 |
| §B: "~50 call-sites LLM" | ~70 archivos con llamadas LLM | OBSOLETO (superficie mayor) |
| §B: "54 services" | 55 archivos (54 + `__init__.py`) | VERDADERO |
| §B: "~214 routers (215 con `__init__`)" | 215 exacto | VERDADERO |
| §B: "168 motores" | 168 exacto | VERDADERO |
| §L: "593 módulos importan limpio" | 818 módulos compilan limpio | OBSOLETO (creció; sigue verde) |
| §N: superadmin 12 huérfanas | 11/12 confirmadas; `conversation-cost`, `user-diagnostics`, `ie-engine-sources` hoy EN nav; 4 huérfanas nuevas (`construction-quality`, `reviews-residents`, `primitives-demo`, `bulk-ingest`) | PARCIALMENTE OBSOLETO |
| §N: asesor ~8 huérfanas | 10 duras preliminares (5 nuevas: canales, social-ads ×2, studio-video, video-standalone) + 3-4 solo-V1 | PARCIALMENTE OBSOLETO |
| §N: dev 2 huérfanas | 2 duras confirmadas (§N ✓) + ~16 "solo-V1" (consolidadas en hubs V2) + 3 nuevas preliminares | VERDADERO en duras; clasificación V1/V2 a resolver en B4 |
| §N: comprador 10 huérfanas sin sidebar | 10/10 exacto | VERDADERO |
| §N: redirects legítimos (7) | 7/7 exacto | VERDADERO |

## 13. No verificable desde este entorno (PENDIENTE con razón)

| ítem | razón | quién |
|---|---|---|
| `db.<col>.getIndexes()` vivo | sin acceso a Mongo desde el contenedor | sesión con DB / staging / founder |
| Envs reales de prod (SENTRY_DSN, ADMIN_PASSWORD, CORS, STRIPE, salts) | panel del proveedor | founder (B8) |
| Backups/PITR probados | panel Atlas/proveedor | founder (B8.10) |
| Verificación visual `localhost:3000` | se hará en B4 (0.4.R14: estados vacíos/seed) | sesión B4 |
| Conteo de docs reales por colección | sin DB; por doctrina §C la DB de negocio está vacía | staging |

## 14. Cómo regenerar este inventario (anti-drift, para re-runs futuros)

```bash
# Identidad (0.1)
git rev-parse --show-toplevel && git branch --show-current && git log --oneline -3 && \
test -f backend/tenant_scope.py && test -f backend/house_pool_engine.py && \
test -d backend/cerebro && test -f backend/data_developments.py && \
ls backend/routes/ | wc -l && echo DMX_REPO_OK

# Denominadores
ls backend/routes/*.py | wc -l                                   # routers (215)
find backend -name "*_engine.py" -not -path "*__pycache__*" | wc -l   # motores (168)
ls backend/services/*.py | wc -l                                 # services (55)
ls backend/cerebro/*.py | wc -l                                  # cerebro (10)
grep -n 'path=' frontend/src/App.js | wc -l                      # rutas FE (~273)
grep -rhoE "db\.[a-z_][a-z0-9_]*\.(find|insert|update|delete|aggregate|count|replace|bulk)" backend --include="*.py" | sed -E 's/^db\.([a-z_][a-z0-9_]*)\..*/\1/' | sort -u | wc -l  # colecciones (493)
grep -rn "send_with_timeout(\|\.send_message(\|LlmChat(" backend --include="*.py" | wc -l  # call-sites LLM
grep -rn "create_index\|create_indexes\|ensure_index" backend --include="*.py" | wc -l    # índices

# Línea-Base completa: ver comandos de la tabla §11 (correr y comparar valor a valor)
```

---

## 15. Checklist de Avance — Etapas → Batch → Chunk (gobierna el avance entre sesiones)

> **Protocolo de cierre de bloque (obligatorio):** al cerrar cada bloque → commit+push a la rama de
> sesión · registrar el SHA en `CHECKPOINTS.md` · crear la rama `checkpoint/f0-bN-<slug>-fecha` vía
> `mcp__github__create_branch` (el proxy git da 403 a tags/otras ramas). Detalle en `CHECKPOINTS.md`.


> **Leyenda:** ✅ cerrado · 🔄 en curso · ⏳ esperando OK del founder · ⬜ pendiente · 🔒 gated (no arranca hasta cerrar lo anterior).
> Regla: un batch se cierra solo con su pausa + OK; un chunk se cierra solo con su % en el ledger actualizado.

### ETAPA F0 · Diagnóstico Total — 🔄 EN CURSO (batches cerrados: 1/12)

**BATCH B0 · Arranque + Ledger + Línea-Base — ✅ CERRADO 2026-06-12 (commit 7e3fb2a6)**
- [x] chunk 0.1 — Arranque/identidad del repo (`DMX_REPO_OK`)
- [x] chunk 0.2 — Inventario FE: 273 rutas × nav V1/V2 (§3)
- [x] chunk 0.3 — Inventario backend: 215 routers · 168 motores · 55 services · 10 cerebro (§4-6)
- [x] chunk 0.4 — Colecciones (493/top-50) · 14 flags · ~70 call-sites LLM · 8 superficies inyección (§7-9)
- [x] chunk 0.5 — Índices Mongo del código + corrección asesor_indexes.py (§10)
- [x] chunk 0.6 — Línea-Base Cuantitativa (11 métricas, §11) + build BE/FE verde
- [x] chunk 0.7 — Stack Confirmado + Plan + divergencias §B/§N (§12)
- [x] chunk 0.8 — OK del founder recibido → B1 abierto

**BATCH B1 · Seguridad + IA adversarial + Red Team — 🔄 (9/10 chunks · 13 hallazgos, 5 ya arreglados) — ver §16**
- [x] chunk 1.1 — Censo tenant routers dev (33) — 473 accesos · wrappers divergentes (B1-12)
- [x] chunk 1.2 — Censo tenant superadmin (12) + auth/infra (17) — god-view gateado, 0 críticos
- [x] chunk 1.3 — Censo tenant asesor (12) + studio (20) — studio_landing:1582 (B1-10)
- [x] chunk 1.4 — Censo tenant público (20) + comprador (8) + conversación (10) + cerebro (8) + services (55)
- [x] chunk 1.5 — comprador email-JOIN (B1-03 ✅) + pool dmx_root marketplace (B1-02 ✅)
- [x] chunk 1.6 — auth/roles/mass-assign/NoSQL/uploads (limpios) + magic-link (B1-04 ✅)
- [x] chunk 1.7 — 8 superficies prompt-injection (persona B1-07 ✅ + DISC B1-06 ✅)
- [x] chunk 1.8 — Cerebro: 3 candados OK, HARD_DELICATE inviolable, seguro piloto · redteam→staging
- [x] chunk 1.9 — reglas negocio: pool dmx_root (B1-02), entity-resolution (no abusable)
- [ ] chunk 1.10 — ⏳ 7 cadenas red-team [SOLO STAGING] + **OK founder** para B1-02/B1-03 antes de B2

**BATCH B2 · Auditoría técnica — ✅ CERRADO (5/5 · Tanda con 33 tests) — ver §17**
- [x] chunk 2.1 — Grafo: módulo-dios server.py · 5 ciclos · violaciones de capa (services/engines→routes) · veredicto
- [x] chunk 2.2 — Routers: forma=archipiélago · sin handler central · Pydantic 99.5% · fix audit de dinero
- [x] chunk 2.3 — 168 motores: 161 VIVO · 7 FLAG-OFF · 0 CABLE-ROTO · 0 HUÉRFANO (nada que despertar con código)
- [x] chunk 2.4 — Datos Mongo: 2 falsos positivos descartados · JOIN email frágil + sin JSON-Schema → F4/backlog
- [x] chunk 2.5 — Deuda: 0 cables fantasma · archivos-dios → F4 · **5 piezas críticas → 33 tests verdes** ✅

**BATCH B3 · Performance 10k — ✅ CERRADO (4/4 · Tanda) — ver §18**
- [x] chunk 3.1 — Supuestos infra declarados + N+1 (house_pool ✅ arreglado) + full-scans (god-views → F4)
- [x] chunk 3.2 — Índices: 5 de 6 gaps falsos/marginales · 1 real `units.project_id` ✅ añadido
- [x] chunk 3.3 — Cómputo: cachés materializadas OK · scheduler real · bundle FE excelente · LLM/RAG → escala
- [x] chunk 3.4 — Script de carga ya existía → afinado al SLA (lecturas p95<500) · veredicto techo/qué-se-cae ✅

**BATCH B4 · Rediseño Front/UX — 🔄 EN CURSO (empezó por Marketplace Público, §19)**
- [x] **MKT-1 · Estados honestos** del marketplace público (spinner eterno→loading/404/error · error≠vacío · ConfianzaPage sin Math.random) ✅ build verde
- [ ] MKT-2 · Ficha de desarrollo que vende (jerarquía + chips de origen) · MKT-3 · despertar motor dormido (live_pulse en ColoniaLanding, Barrios→links) · MKT-4 · a11y · MKT-5 · Atlax humano
- [ ] chunk 4.1 — Sistema de diseño (canónicos YA existen: SmartEmptyState/LoadingState/ErrorState/DataOrigin — reusar, no crear)
- [ ] chunk 4.2 Asesor · 4.3 Developer · 4.4 Superadmin (solo exponer huérfanas) · 4.5 Comprador (nav del portal)
- [ ] chunk 4.6 — 5 mockups ANTES/DESPUÉS + tabla priorizada · 4.7 Resumen founder → PAUSA

**BATCH B5 · Re-arquitectura — ⬜ (0/3)**
- [ ] chunk 5.1 — Arquitectura objetivo + tabla de brecha con evidencia
- [ ] chunk 5.2 — Plan de slices con gates ejecutables (LeadsRepo → decorador tenant → familias)
- [ ] chunk 5.3 — Módulos-dios (por grafo 2.1) + abstracciones + norte IA-first → PAUSA

**BATCH B6 · Correctitud y Honestidad del Dato — ⬜ (0/4)**
- [ ] chunk 6.1 — Fórmulas: investment_simulator (TIR/ROI/break-even/stress) + comisiones
- [ ] chunk 6.2 — Fórmulas: avm_public + hedonic + drpi + zone/buyer/risk scores
- [ ] chunk 6.3 — Procedencia: mapa métrica→origen real vs afirmado (dmx_indices "real" sobre seed, origen chips, FichaHome)
- [ ] chunk 6.4 — Defendibilidad (R²/IC/reproducibilidad/calibración golden) + resumen founder → PAUSA

**BATCH B7 · Privacidad LFPDPPP — ⬜ (0/4)**
- [ ] chunk 7.1 — Borrado real (purge_account/purge_expired re-verificar vivo §K) + export del titular
- [ ] chunk 7.2 — Consentimiento granular + captura pública + salts
- [ ] chunk 7.3 — PII en logs/errores/bundle/cross-tenant (grep exhaustivo)
- [ ] chunk 7.4 — k-anon/strip_pii en data vendida + aviso/retención/ARCO + cubetas legal-vs-nice → PAUSA

**BATCH B8 · Producción/Deploy/Observabilidad — ⬜ (0/3)**
- [ ] chunk 8.1 — Sentry + logging + envs + gate prod (8.1-8.4)
- [ ] chunk 8.2 — Rate-limit + Stripe + headers + health + CI/CD (8.5-8.9)
- [ ] chunk 8.3 — Backups/secretos + semáforo Go/No-Go + lista acción-founder (8.10-8.12) → PAUSA

**BATCH B9 · Sub-lentes — ⬜ (0/4)**
- [ ] chunk 9.A — FinOps (gate pre-gasto vs post-hoc en ~70 call-sites; cubo único Atlax)
- [ ] chunk 9.B — Resiliencia/abuso (drenaje presupuesto, idempotencia Stripe, captcha)
- [ ] chunk 9.C — i18n/Dubai (paridad es↔en, RTL, moneda)
- [ ] chunk 9.D — SEO (CSR/prerender, OG, sitemap, landings programáticas) → PAUSA

**BATCH B10 · Madurez IA/Agentic — ⬜ (0/3)**
- [ ] chunk 10.1 — Inventario A/B/C (REAL-con-dato / heurística-disfrazada / stub-apagado)
- [ ] chunk 10.2 — Loops de aprendizaje (CIERRA/NO-CIERRA) + madurez Cerebro por lente
- [ ] chunk 10.3 — Jugadas IA-first priorizadas + costo/latencia/gobernanza → PAUSA

**BATCH B11 · Cierre F0 — ⬜ (0/2)**
- [ ] chunk 11.1 — Cobertura por portal X/Y al 100% + ciclos cross-portal (arranca-y-cierra)
- [ ] chunk 11.2 — `REPO_PLAN_MAESTRO.md` (cobertura, salud 1-10, patrones, matriz, top-5, go/no-go, riesgos, resumen founder) → OK FINAL F0

### ETAPAS F1–F7 — 🔒 GATED (no arrancan hasta cerrar F0 con OK)

- [ ] **F1 · Red de Seguridad** — tests de caracterización en caminos críticos + CI que gatea → *salida: suite + CI verde*
- [ ] **F2 · Estabilizar** — cerrar P0/P1 del plan maestro (seguridad, privacidad, dato, costo) → *salida: P0 = 0*
- [ ] **F3 · Despertar lo Apagado** — cablear/exponer/borrar huérfanas y flags (Cerebro, agentic, motores sin pantalla) → *salida: cero huérfanas*
- [ ] **F4 · Refactor Incremental** — slices strangler-fig (LeadsRepo → choke-point tenant → servicios → API → front) → *salida: columna vertebral*
- [ ] **F5 · Front/UX/UI Impecable** — sistema de diseño único, estados, a11y, lenguaje humano → *salida: UI consistente*
- [ ] **F6 · Endurecimiento Producción** — observabilidad, backups probados, rate-limit, carga 10k, costo IA → *salida: listo para tráfico*
- [ ] **F7 · Lanzamiento** — beta brokers → público, con rollback y monitoreo → *salida: EN PRODUCCIÓN*

**Avance global:** F0 batches **4.2/12** (B0 ✅ · B1 ✅ · B2 ✅ · B3 ✅ · **B4 🔄 MKT-1**) · etapas programa **0/8 cerradas** · **14 fixes + 33 tests** (B1: 1 P0 + 3 P1 + 3 P2 · B2: audit dinero + 33 tests · B3: índice units + N+1 house_pool + script SLA · B4-MKT1: 4 fixes de cara pública -estados honestos + ConfianzaPage sin datos falsos-, build verde 0 warnings nuevos).

---

## 16. Bloque 1 · Seguridad + IA + Red Team — censo y hallazgos (2026-06-12)

> **Cobertura del censo tenant:** 215/215 routers + 55 services + engines clave + cerebro/ recorridos
> (fan-out de 9 agentes, evidencia archivo:línea re-leída en vivo). Veredicto global: la columna
> vertebral `tenant_scope.py` es **sólida** y la mayoría de accesos (≈90%) están limpios. Lo que
> sigue son los hallazgos REALES tras deduplicar y descartar falsos positivos.

### 16.1 Falsos positivos descartados (re-leídos, NO son bug)
- `team_aggregated.py:122` — los `asesor_ids` ya vienen scopeados por `tenant` (`:100-102`); los leads se filtran por esos ids → **limpio** (solo hardening: guardar contra `tenant==""`). 
- `smart_lists.py:128` rollup — `org_id` sale de **sesión** (`user.tenant_id`, `:134`), no del request → **limpio**.
- `dev_batch4_1.py` antifraude (`/api/cita`) — las queries cross-project son la **entity-resolution por diseño** (§G.c, 6 checks); el endpoint registra un lead nuevo (no hay "dueño" que validar). Lo único a revisar: que los mensajes de disputa sean genéricos (§1.5) → P2, no 8 IDOR.
- `maps.py:134` cube público — solo `{tier_id,name,geo}`, sin PII ni tenant → **limpio**.

### 16.2 Hallazgos confirmados (formato canónico 0.4.9)

| ID | Sev | Etiqueta | Hallazgo | Evidencia (✓ re-leído) | Estado |
|---|---|---|---|---|---|
| B1-01 | **P0** | NUEVO · CABLE-ROTO · rompe-ciclo | **Búsqueda semántica pública expone PII de leads cross-tenant.** `/api/search/semantic` sin auth buscaba sobre TODO el corpus, que indexa chunks de leads (nombre+notas), actividades y conversaciones de todos los tenants. | `rag_engine.py:852` (endpoint público) + `:303-334` (lead chunks) + `:645-658` (reindex_all) | ✅ **ARREGLADO** (commit 7425a631: confinado a {development,colonia,external}) |
| B1-02 | P1 | NUEVO · CABLE-ROTO · rompe-ciclo | **Widget PDF marketplace ruteaba lead nuevo a asesor random cross-org** en vez del pool de la casa (`dmx_root`). | `lead_capture_marketplace_engine.py:186-203` · `house_pool_engine.py:113-142` | ✅ **ARREGLADO** (OK founder · usa pick_house_asesor; sin fallback cross-org) |
| B1-03 | P1 | NUEVO · CABLE-ROTO | **comprador.py unía por email sin binding verificado**. CONFIRMADO: registro por contraseña (`auth.py:127`) no verificaba el correo; magic-link sí. | `comprador.py` (4 JOINs) + `services/comprador_dashboard.py:68` + `auth.py:127,421` | ✅ **ARREGLADO** (OK founder · `_verified_email` gatea los 4 JOINs + dashboard; registro marca `email_verified`) |
| B1-04 | P1 | NUEVO · CABLE-ROTO | **magic-link devolvía token raw si fallaba el email** (account-takeover). | `auth.py:382-388` | ✅ **ARREGLADO** (solo dev) |
| B1-05 | P1 | NUEVO · arquitectónico | **Rate-limit login + Atlax es in-memory** → multi-instancia lo diluye (N×límite, rotando IPs ilimitado). | `auth.py:39-71` · `asistente_engine.py:37-38` (buckets memoria) | ⏳ defer B8/F6 (necesita Redis/Mongo) |
| B1-06 | P2 | NUEVO · CABLE-ROTO | **DISC: el LLM podía elegir el `lead_id`** de las tool-calls (least-privilege). | `agentic_crm/disc_inferencer_engine.py:390-393` | ✅ **ARREGLADO** (lead_id forzado del hilo) |
| B1-07 | P2 | NUEVO · GRIETA | **Persona por tenant sin tope de longitud** → admin T2+ inyecta texto largo al system prompt (contenido para acciones por allow-list; solo altera texto). | `atlax_persona_engine.py:80-98` (update) + `:123-192` (build) | ✅ **ARREGLADO** (caps 240c/80c/10 items) |
| B1-08 | P2 | NUEVO | **Tokens de sesión en logs** del asistente (higiene PII). | `asistente_engine.py:1104,1513` | ✅ **ARREGLADO** (truncados) |
| B1-09 | P2 | NUEVO · CABLE-ROTO | **whatsapp send sin assert_lead_owner**: asesor pasa `lead_id` ajeno (impacto bajo: el mensaje queda en su propio org_id). | `routes/whatsapp.py:74-80` | ⏳ B2/fix-fase |
| B1-10 | P2 | NUEVO · CABLE-ROTO | **studio AB-quality escanea `db.leads` global** sin tenant para puntuar landings. | `studio_landing_engine.py:1582` | ⏳ B2/fix-fase |
| B1-11 | P2 | NUEVO · CABLE-ROTO | **bulk-ingest persiste JSON del LLM sin validar tipos/rangos** (integridad de dato, no fuga). | `bulk_ingest_engine.py:306-321` + `extraction_engine.py` | ⏳ B6 (correctitud) |
| B1-12 | P2 | NUEVO · deuda | **4 wrappers `_tenant()` no delegan al canónico** (fallbacks divergentes "default_org"/"public"/"dmx"). | `dev_batch1.py:67`, `dev_batch4.py:93`, `dev_batch4_1.py:79`, `dev_batch19.py:126` | ⏳ F4 (refactor) |
| B1-13 | P2 | NUEVO · CABLE-ROTO | **dev_batch7 escanea `db.leads.find({})` global** para densidad de leads por colonia (agregado, sin PII; señal cross-tenant a evaluar). | `dev_batch7.py:345` | ⏳ B3/decisión |

### 16.3 Verificado SÓLIDO (re-validado vivo, no por doc)
- **Cerebro** (`cerebro/`): 3 candados fail-closed correctos (`guardrails.py`), piso `HARD_DELICATE` inviolable (`config.py:99-115` + `contract.py:123`), `on_deal_closed` propaga tenant, ejecutores `buyer.*` toman user del task server-side, endpoints gateados por flag+rol+tenant. **Seguro para piloto con monitoreo.** Red-team 16 ataques: re-correr en staging (sin Mongo aquí). Gaps menores del test: cross-user-same-org, hook vía PATCH (defendido en router), ctx inter-step.
- **Mass-assignment**: los `$set` de perfil pasan por modelos Pydantic con whitelist (`advisor.py:271,801,1258`, `studio_property_intake.py:257` bloquea id/tenant_id) → sin escalada de `role`/`tenant_id`.
- **NoSQL injection**: búsquedas escapan regex (`marketplace_search`) / validan Pydantic → bloqueado.
- **Rol server-side**: `get_current_user` lee rol de BD en cada request (no confía en claim) → revocación inmediata.
- **Uploads** (studio_assets): MIME+tamaño+key namespaced en R2 → sin path traversal.
- **PII pública**: endpoints públicos usan `strip_pii`/no devuelven email/teléfono.
- **RAG autenticado**: `conversation_engine`/`asistente` pasan filtro de tenant al recuperar.

**Conteo B1: 13 hallazgos · 13/13 con cita re-confirmada en vivo (100%) · 7 ARREGLADOS hoy (1 P0, 3 P1, 3 P2, todos con build verde + unit-tests) · 6 diferidos a su fase (B1-05 rate-limit→B8/F6 · B1-09 whatsapp→B2 · B1-10 studio scan→B2 · B1-11 bulk-ingest→B6 · B1-12 wrappers→F4 · B1-13 dev_batch7→B3).**

> **B1 queda al 100% de censo y con todos los P0/P1 cerrados.** Falta solo el chunk 1.10 (7 cadenas
> red-team encadenadas, que se ejecutan contra STAGING — fuera de este entorno sin Mongo). El núcleo
> de seguridad de B1 está cerrado: la única fuga de PII real (P0 RAG) y los 3 P1 quedaron arreglados hoy.

---

## 17. Bloque 2 · Auditoría Técnica — hallazgos y Tanda (2026-06-12)

> **Cobertura B2:** 5 sub-auditorías en paralelo (grafo · routers · 168 motores · datos Mongo · deuda+cables).
> Veredicto global honesto: **columna vertebral SÓLIDA, sin bugs accionables nuevos de gravedad.** Lo más
> valioso y de cero riesgo fue blindar con tests las piezas críticas (commit 34257db6).

### 17.1 Arquitectura (2.1)
- **Módulo-dios = `server.py`** (fan-in 154 × fan-out 176, 2790 líneas) — punto único de arranque, inherente.
- **5 ciclos de import** (import-time, bajo impacto): investment_simulator↔score_inversion, document_intelligence→extraction→cross_check→auto_sync→document_intelligence, comercial_value_model↔resale_data, workflow_engine↔workflow_queue, feature_legacy_adapter↔feature_gate_engine.
- **Violaciones de capa REALES (deuda F4):** services/engines importan routers — `services/{linkedin_import,visit_auto_prep,endorsements}.py`→`routes.dev_batch14.log_activity`; `whatif_engine.py:113`/`agentic_crm/{match_weights,reply_classifier}`→`routes.phase_y_controls.get_phase_y_settings`; ~47 routers importan otros routers. → mover `log_activity`/`get_phase_y_settings` a un service. **NO tocado** (refactor con blast-radius, va a F4).
- Veredicto: patrón router→service→engine existe pero sin enforcement (~60% conformidad). Corrección: B1 ya estableció que el aislamiento tenant está sólido; el "14% adopta tenant_scope" NO significa "86% con IDOR" (muchos usan thin-wrappers o son públicos/superadmin) — corrijo el overstatement del agente.

### 17.2 Routers (2.2) — sin re-auditar tenant (eso fue B1)
- **Forma de respuesta = archipiélago** (42% `{ok:true}` · 29% `{items:[]}` · 20% plano · 0% `{data,meta}`). Diagnóstico, propuesta de contrato único anotada. NO se cambia (tocaría el contrato FE↔BE de cientos de endpoints → fase dedicada).
- **Sin handler central de errores;** fail-open dominante. La mayoría son fail-open de observabilidad (§I OK). **Arreglado:** `advisor.py:3032` `create_operacion` — el fallo de auditoría de una operación de DINERO ya no es `except: pass` mudo (loguea a Sentry, como su gemelo `update_op_status:3149`).
- **Lógica gorda en handlers** (deuda F4): `wizard.py:275 create_project` (188 líneas), `wizard.py:581 ia_extract` (110), `diagnostic.py`, `agentic_crm.py`. → extraer a services.
- **Pydantic 99.5%**; única excepción `advisor.py:629 _cc_set_status` (dict crudo, helper interno). Anotado.

### 17.3 Motores (2.2) — el hallazgo clave para "despertar"
- **168 motores: 161 VIVO · 7 FLAG-OFF (agentic_crm, `agentic_enabled=False`) · 0 CABLE-ROTO · 0 HUÉRFANO · 0 ESPERA-DATOS.**
- **Honestidad brutal:** NO hay motor roto que cablear ni huérfano que despertar con código. Las Tandas 20-38 ya despertaron lo apagado. La suite agéntica (7 motores, 29 endpoints, 7 paneles FE) está 100% lista y **prenderla es decisión de DEPLOY del founder** (`PATCH /api/superadmin/phase-y/{org}` con `agentic_enabled:true` + tiers), no código nuevo.
- Verificados como NO-bug: `emit_ml_event` (write-only por diseño F0.11), `apify_trends_engine` (fallback de 3 capas correcto), `image_embeddings` (hash-trick documentado), `whatif_engine` (VIVO, FLAG-OFF por `feature_tiers.whatif_simulator=off`).

### 17.4 Datos Mongo (2.3) — falsos positivos descartados re-leyendo
- **DESCARTADOS (no bug):** `audit_log.py:156` NO persiste ObjectId crudo (el doc no setea `_id`; Mongo lo autogenera). `zone_scores.computed_at_dt` es `datetime` a propósito (índice TTL) y se quita de las respuestas. — el agente los marcó REGRESIÓN; **son correctos.**
- **Reales pero de fondo (no quick-fix):** JOIN frágil por email entre los dos universos de leads (`db.leads`↔`db.asesor_contactos`, §F, advisor.py:537) → F4/F5. Sin JSON-Schema validator de Mongo (Pydantic valida en la app) → hardening backlog. Alias de score centralizado solo en zone_score (risk/ie hacen fallback manual) → cosmético.

### 17.5 Deuda + cables (2.4)
- **CERO cables rotos fantasma** (todas las rutas `/api/*` del FE tienen match en BE). El "link roto de Cash Flow" del mapa de features (2026-06-01) está **OBSOLETO**: la ruta `/desarrollador/desarrollos/:slug/cash-flow` existe (App.js:848) y el componente navega ahí.
- **Archivos-dios** (deuda F4): backend `asistente_engine.py` (4085), `advisor.py` (4020), `superadmin_devmaster.py` (1955); frontend `Ficha360.js` (1754), `ConversationInbox.js` (1388).
- **5 piezas críticas SIN test → ARREGLADO esta Tanda** (33 tests, ver 17.6).
- 79 TODO/FIXME (ninguno de severidad crítica). 4 wrappers `_tenant` divergentes (ya en §16, F4).

### 17.6 ACCIÓN de la Tanda (verificada, commit 34257db6)
| Pieza | Test file | Tests | Estado |
|---|---|---|---|
| tenant_scope (assert_lead_owner IDOR, user_dev_ids fallback acotado, tenant_of/actor_id/assert_dev_project) | `tests/critical/test_tenant_scope_critical.py` | 13 | ✅ verde |
| entity_resolution (compute_score pesos, ventana temporal, cross-asesor, normalizadores) | `tests/critical/test_entity_resolution_critical.py` | 10 | ✅ verde |
| house_pool (pick_house_asesor zona→carga, solo asesores casa, assign→dmx_root) | `tests/critical/test_house_pool_critical.py` | 6 | ✅ verde |
| data_doctrine (has_real_sales/honest_label seed≠real, tag) | `tests/critical/test_data_doctrine_critical.py` | 5 | ✅ verde |
| **TOTAL** | | **33** | **33/33 passed** (`pytest -m unit`, hermético con mongomock + asyncio.run) |
+ `advisor.py` create_operacion: audit de dinero visible (no `except: pass`).

**Verificación:** `compileall backend` exit 0 · `pytest tests/critical -m unit` = 33 passed · sin regresión (las fallas de la suite global son tests de integración sin Mongo vivo + deps faltantes del contenedor: httpx/numpy/statsmodels/reportlab — ninguna toca los archivos editados).

---

## 18. Bloque 3 · Performance y Escala 10k — hallazgos y Tanda (2026-06-12)

> **Supuestos de infra declarados** (no hay Dockerfile/Procfile en el repo; prod = K8s/Emergent gestionado fuera):
> · uvicorn multi-worker (nº gestionado por la plataforma) · Mongo pool **maxPoolSize=50/proceso**, min 5
> (`server.py:91-98`) · standalone vs replica-set: no determinable desde el repo, se asume gestionado.
> SLA objetivo: p95<500ms lecturas, error<1%, mix 70% público / 20% comprador / 8% asesor / 2% dev-superadmin.

### 18.1 Veredicto honesto: la app está BIEN armada para rendimiento
- **Índices: cobertura extensa** (75+ índices; decenas de `ensure_*_indexes` en startup). De los 6 "gaps" que propuso el fan-out, **5 eran falsos o marginales** (verificados re-leyendo): `users` ya tiene email-unique (auth cubierta); `leads` ya tiene `(dev_org_id,status,last_activity_at)`; buyer_scores cubierto por user_id-unique. **NO se añadieron índices inútiles** (serían deuda de escritura).
- **Frontend: code-splitting EXCELENTE** — 251 rutas con `React.lazy`; el anónimo (70%) NO descarga el JS de los portales autenticados. Nada que arreglar (solo pulido opcional: lazy del MiniMap, vendor chunk).
- **Jobs background: scheduler REAL** (APScheduler, `scheduler_ie.py`, 30+ crons nocturnos: ETL, recompute de scores, cubo, retrains, newsletter). El trabajo pesado NO corre inline.
- **Cachés materializadas reales**: AVM (LRU 1h), forecast (LRU 6h), zone_scores (24h+TTL), live_pulse (snapshots), cube (cron 03:30).

### 18.2 ACCIONADO esta Tanda (verificado, build verde + 33 tests)
| Fix | Archivo | Tipo | Estado |
|---|---|---|---|
| Índice `units.project_id` (se consultaba sin índice: b13.py:515, dev_batch10.py:278-280, insights.py:88) | `server.py:1418` | CABLE-ROTO | ✅ añadido |
| `pick_house_asesor`: N+1 (1+3N queries) → **3 queries en bloque** (`$in`), lógica idéntica | `house_pool_engine.py` (+3 helpers batch) | CABLE-ROTO | ✅ + 5 tests verdes |
| Script de carga: thresholds alineados al SLA (lecturas p95<500 por tag, error<1%) | `load-tests/dmx_load.js` | mejora deliverable | ✅ |

### 18.3 NO accionado — registrado con su destino (honestidad: no inflar ni romper)
- **God-views superadmin sin `.limit()`** (`superadmin_devmaster.py` ×7): un `.limit()` ciego **corromper­ía los totales** (DMX vende números honestos). Fix correcto = agregación server-side (`$group` en Mongo). → **F4/F6**, no quick-fix.
- **Rate-limit Atlax/login in-memory** (multi-worker lo diluye): ya en §16 (B1-05). → **B8/F6** (necesita Redis).
- **RAG cosine O(n) en memoria, corpus por worker** (`rag_engine.py`): ~14KB/chunk, ~434MB con 31k chunks; a 100k+ la latencia/RAM crece. → mejora arquitectónica (vector index/Faiss), horizonte medio. Hoy corpus chico = ESPERA-DATOS.
- **Cap de presupuesto IA público $5,000 MXN/mes**: corto para 10k usuarios, pero es **env `AI_BUDGET_DEFAULT_CAP_MXN`** = decisión de deploy del founder, no código.
- **buyer_score sin caché**: hipotético — el fan-out NO lo encontró en rutas públicas calientes. "No lo cablees inline", no es bug hoy.

### 18.4 Veredicto: techo actual y qué se cae primero
Con los supuestos de arriba, el orden de saturación bajo el 70% de tráfico público es: **1º** gasto LLM de Atlax (cap bajo + rate-limit no distribuido) → **2º** RAM/latencia del RAG en memoria a corpus grande → **3º** god-views de superadmin sin agregación (solo afecta al 2% superadmin) → **4º** pool Mongo (50/proceso) si entra cómputo síncrono largo. **Ninguno es un bug del 70% público hoy**; son límites de escala con fixes claros (Redis para rate-limit, vector index para RAG, agregación para god-views, cap por env). El núcleo público (marketplace, AVM, scores) ya lee de caché materializada.

---

## 19. Bloque 4 · Rediseño UX — Marketplace Público (Tanda MKT-1, 2026-06-12)

> Plan de chunks del marketplace público: **MKT-1 estados honestos** (✅ esta Tanda) · MKT-2 ficha que vende · MKT-3 despertar motor dormido · MKT-4 accesibilidad · MKT-5 Atlax humano.

### 19.1 Veredicto honesto (3 agentes de auditoría)
- **Los componentes canónicos YA EXISTEN** — `SmartEmptyState`+`config/emptyStates.js`, `LoadingState`/`ErrorState`, `DataOrigin` (chip de origen del dato). NO se creó nada nuevo: se REUSARON. (anti-duplicación)
- **La maquinaria pública está sorprendentemente completa**: 7+ motores públicos cableados (avm_public, zone_score, drpi, live_pulse, forecast, accuracy, dmx_indices). `ZonePage` es la página modelo (orquesta 9 motores con los 3 estados).
- El problema real NO es falta de features: es **distribución de superficie** (motores que solo se ven en superadmin/home) y **estados deshonestos**.

### 19.2 ACCIONADO esta Tanda (build verde · 0 warnings nuevos · 271 histórico intacto)
| Fix | Archivos | Tipo | Estado |
|---|---|---|---|
| **Spinner eterno "…"** en ficha de propiedad y de desarrollo → estados separados loading / no-encontrado / error (con reintentar), reusando `LoadingState`/`ErrorState`/`SmartEmptyState`. Antes: con DB vacía CUALQUIER `/propiedad/:id` o `/desarrollo/:id` se colgaba para siempre | `PropertyDetail.js`, `DevelopmentDetail.js` | CABLE-ROTO | ✅ |
| **Error de red disfrazado de "sin resultados"** en Marketplace → estado de error distinto del vacío + reintentar; vacío honesto con CTA | `Marketplace.js` | CABLE-ROTO | ✅ |
| **3 claves de copy humano** para no-encontrado/catálogo-vacío | `config/emptyStates.js` | reuse | ✅ |
| **Página de Confianza fabricaba tendencias con `Math.random()`** (¡en la página cuyo propósito ES la confianza!) → muestra el valor real o '—' y dice la verdad sobre la serie histórica | `pages/public/ConfianzaPage.js` | CABLE-ROTO (honestidad) | ✅ |

### 19.3 Backlog del marketplace (verificado, con destino) — para próximas Tandas
- **DESPERTAR (motor vivo, mal distribuido):** momentum de `ColoniaLanding` lee seed estático en vez de `live_pulse_engine` (widget `LivePulseZoneWidget` ya existe) · widgets embed score/risk solo en ConnectMcp con slug fijo · DRPI history solo en home · `dmx_indices` solo en superadmin · forecast falta en ColoniaLanding. → MKT-3.
- **CABLE-ROTO barato:** chips de `Barrios.js` son texto muerto, deberían ser `<Link to="/zona/:slug">` (16 internal-links SEO gratis). → MKT-3.
- **DECISIÓN founder:** la Home muestra 6 propiedades FICTICIAS (precios/asesores inventados) con DB vacía → cablear a `/api/developments?limit=6` o estado vacío honesto. Cambia el hero, requiere tu OK.
- **a11y (MKT-4):** botones icon-only sin `aria-label`, tabs sin `role="tab"`, SVG decorativos sin `aria-hidden`.
- **Atlax bubble:** fugas de "debugger" (chunk_id crudo, "Powered by DMX RAG", "Memorias usadas") → MKT-5.

### 19.4 Honestidad sobre verificación
Verificado por **build de producción (exit 0, 0 warnings en archivos tocados)** + checks estáticos (el "…" eterno eliminado, `Math.random()` fuera). Verificación en navegador vivo necesita staging con la app corriendo (el contenedor no tiene Mongo para E2E real); los estados vacíos/error son justo lo que se vería con DB vacía.
