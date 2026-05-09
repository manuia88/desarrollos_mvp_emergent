# 06 — DMX Roadmap H1 (Reference Doc)

**Última actualización**: 2026-05-07
**Tracking activo**: `memory/PRD.md` (canonical, con status updates per batch)
**Este doc**: vista alto-nivel para navegación rápida y planeación.

---

## ÍNDICE

1. [Status snapshot H1](#1-status-snapshot-h1)
1.5. [Wave 1-4 structure (revised 2026-05-07)](#15-wave-1-4-structure)
2. [Phase 4 Dev Module — refactor B0 → B23](#2-phase-4-dev-module-refactor)
3. [Phase Y — DMX Intelligence Platform](#3-phase-y-dmx-intelligence-platform)
3.5. [Phase Z — Superadmin Data Intelligence Layer](#35-phase-z-superadmin-data-intelligence-layer)
3.6. [Phase ZZ — DMX Authority Layer (NEW)](#36-phase-zz-dmx-authority)
3.7. [Superadmin gaps SA1-SA8](#37-superadmin-gaps)
4. [Decisiones arquitectónicas](#4-decisiones-arquitectonicas)
5. [Riesgos + mitigations](#5-riesgos)
6. [H2 backlog + rejected](#6-h2-backlog)
7. [AI vs Agentic distinction](#7-ai-vs-agentic)

---

## 1. Status snapshot H1

| Phase | Status | Estimado |
|---|---|---|
| Phase 4 Dev Module (original v1) | ✅ shipped 16 batches | ~78h |
| Phase 4 Dev REFACTOR | ✅ **100% COMPLETO** (17/17: B0 · B0.5 · B10-B23 + B18.5/B19.5 fix-pass) | ~157h |
| Phase 1 Marketplace gaps | ✅ **100% COMPLETO** (B24+B25+B26+B27 vía PR #11) | ~33.5h |
| Phase 2 Comprador | ✅ **100% COMPLETO** (B28+B29+B30 vía PR #12 + #13) | ~18.5h |
| Phase 13/14/15/18 (whitelist + inhouse + directorios + inmobiliaria) | ✅ **100% COMPLETO** (B35+B36+B37+B38 vía PR #12+#15+#16) | ~46h |
| Phase 3 Asesor | ✅ **100% COMPLETO** (B31+B32+B33+B34 vía PR #14 + #15) | ~25h |
| **Wave 1 — Foundation + Authority Seeds** (SA1 + ZZ.1) | ✅ **100% COMPLETO** (W1.1+W1.2+W1.3+W1.4+W1.5+W1.6 · 2026-05-07) | ~50h |
| **Wave 2 — Commercial + Intelligence Hub** (SA2-SA6+SA8 + Z.0-Z.2) | 🟡 EN CURSO 49/120h | ~120h |
| **Wave 3 — Authority + Verticals + Risk Layer** (ZZ.2-ZZ.4 + Z.3-Z.4 + Phase 5 + DENUE + Risk Score #12 + Cost Predictor #13 + R² públicos #3 + Methodology #14) | 🟡 pending | ~177h |
| **Wave 4 — Phase Y Agentic + Investor Sim + Outbound + Polish** (Phase Y + 5/6/8 ext/10/11/16/19 ext/20 + CC + Investment Sim #6 + Lead Journey #7 + AutoNewsletter #8 + Free audit #17) | 🟡 pending | ~336h |

**Total H1 restante**: ~633h (Wave 2 71h + Wave 3 177h + Wave 4 336h + buffers + integraciones Teseo +77h)

**Shipped to date**: ~379h (Phase 4-refactor + 1 + 2 + 3 + B2B + Wave 1 ~50h + W2.1-W2.4 ~49h)

**Origin del +77h**: análisis Teseo Data 2026-05-07 — distribución 17 ideas tropicalizadas (DENUE, Risk Score, Construction Cost, Hedonic DRPI, Methodology, Boletines, Investment Simulator, Lead Journey, AutoNewsletter, Free Audit). Detalles en `memory/DATA_SOURCES.md` + sección "Wave 3 detailed plan" / "Wave 4 detailed plan" en PRD.md.

---

## 1.5 Wave 1-4 structure (revised 2026-05-07)

**Origen**: post-cierre Phase 1/2/3/4-refactor/13/14/15/18 (~280h shipped). Founder pidió roadmap consolidado priorizado para H1 closure. Re-evaluación honesta de game-changers tras challenge ("¿estás completamente seguro?").

**Insight unlock**: founder ingesta manualmente 100 proyectos/semana de drives developers (acceso pre-negociado). Esto unlocks Phase ZZ Transaction Network + Index Provider previamente bloqueados por chicken-and-egg data problem.

### Wave breakdown

#### Wave 1 — Foundation + Authority Seeds (~50h) ✅ **100% COMPLETO** 2026-05-07
- ✅ W1.1 SA1.0 Critical bug fix `require_superadmin` (1.5h, Claude Code, SHA `90666a3`)
- ✅ W1.2 SA1.1 Tenants Management UI (8h, emergent, SHA `c905563`)
- ✅ W1.3 SA1.2 System Health Dashboard (8h, emergent, merge SHA `054b0a6`)
- ✅ W1.4 ZZ.1 Bulk Drive Ingestion (10h, emergent, merge SHA `054b0a6`)
- ✅ W1.5 ZZ.1.1 Ingestion Quality + Dedup Engine (6h, emergent, merge SHA `054b0a6`)
- ✅ W1.6 Wave 1 Polish + Smoke (Claude Code: pytest E2E 23 endpoints + permission audit + founder test guide + docs closure)

**Métricas éxito Wave 1 logradas**: 23 endpoints superadmin guarded ✅ · founder test guide listo (50 proyectos) ✅ · dedup engine operacional ✅ · audit log 100% cross-tenant ✅

#### Wave 2 — Commercial + Intelligence Hub (~120h)
- SA2 Data Sources Hub (10h)
- SA3 Audit Log Viewer (8h)
- SA4 AI Cost Observatory (12h)
- SA5 Commercial Foundation incl. SA5.0 Plan tiers + GHL snapshots (19h)
- SA6 Granular Metrics Cube UI nano→macro (15h)
- SA8 Founder Console (14h)
- Phase Z.0 Data Lake + Warehouse Foundation (10h)
- Phase Z.1 Consolidated Metrics Cube (12h)
- Phase Z.2 Superadmin Intelligence Hub UI (12h)
- Buffer ~8h

#### Wave 3 — Authority + Verticals + Risk Layer (~177h, +37h Teseo expansion)
- ZZ.2 Transaction Network (18h)
- **ZZ.3 Index Provider DRPI** (20h, +5h) — incluye Hedonic regression #2 + Boletín mensual #4 + Sectoral bulletins per zona #11 + `/methodology` page #14 (todos absorbidos)
- **ZZ.4 Risk Layer ampliado** (40h, +18h) — Fraud Detection AI ORIGINAL (22h) + DMX Risk Score per propiedad #12 (+18h: SESNSP crime + CENAPRED riesgos + ENVIPE percepción + Atlas Riesgo CDMX. V1 SESNSP only ~10h, V2 multi-source +8h)
- Phase Z.3 Public API + Stripe billing (10h)
- Phase Z.4 Vertical Data Products (Bank AVM/Insurance/Notaría/Investor) (14h)
- Phase Z.5 Anonymization + Compliance (6h)
- Phase Z.6 Cross-sell Intelligence (8h)
- **Phase 5 IE Engine completion ampliada** (56h, +11h) — IE original (45h) + DENUE integration #1 (+6h) + Construction Cost Predictor #13 (+5h reuse BANXICO/INPC)
- **Z.0 Data Lake spec ampliado** (+3h) — R² + IC validation públicos #3 (preparación cubo)
- Buffer ~2h

#### Wave 4 — Phase Y Agentic + Investor Sim + Outbound + Polish (~336h, +40h Teseo expansion)
- Phase Y completa Y.0-Y.5 (110h)
- Phase 6 Studio Wave 1.5+2 (36h)
- **Phase 8 ext** (25h, +10h) — WhatsApp + Coms (15h) + AutoNewsletter DMX Pulse semanal #8 segmentado (+10h reuse Resend + Claude Haiku, segments dev/asesor/buyer/inversionista)
- Phase 10 Caya + A11 (26h)
- Phase 11 Dubai (38h)
- **Phase 16 NEW** (12h) — Lead Journey Outbound asesor→dev #7 (engine captación devs por asesor con qualification AI + tracking conversion). Antes era H2 implícito.
- **Phase 19 ext** (29h, +15h) — Buyer Coach + Mortgage (14h) + Investment Simulator #6 (+15h DatAlpine clone: per-unit ROI + Monte Carlo sensitivity + compare CETES/Fibras + freemium captador inversionistas)
- Phase 20 Polish + Launch (23h)
- **W4 marketing/pre-launch** (3h) — Free 30-min audit landing #17 (lead magnet asesores/devs)
- F0 sweep restante (22h)
- Cross-cutting CC1-4 (28h)
- Buffer integration testing ~-16h optimistic

---

## 2. Phase 4 Dev Module — refactor B0 → B23

### Ya shipped (5 batches refactor + 16 originales)

| # | Batch | h | Notas |
|---|---|---|---|
| ✅ B0 | Foundation Refactor | 16 | PortalLayout + 11 primitives + bundle splitting + server.py refactor + AI budget + permissions module + i18n + schema disgregado |
| ✅ B10 | Sidebar reorganized + Mis Proyectos shell + VentasTab | 14 | 3 sub-tabs Ventas + paginación 30/page + filter chips |
| ✅ B11 | Migrar tabs Legajo + Comercialización + Drawer enriquecido | 14 | 7 secciones drawer + brokers + comisiones |
| ✅ B0.5 | Diagnostic Engine + Observability | 20 | 30 probes + Report UI + System map + User-level + Auto-fix |
| ✅ B12 | Wizard 7 pasos + IA upload | 12 | SmartWizard + drag-drop + Drive URL + Claude haiku extraction |
| ✅ B13 | Cross-portal sync + Tracking attribution + Gap fix | 12 | Unified projects + probes extendidas + lead_source_attribution + multi-touch + links-tracking + MapboxPicker |
| ✅ B14 | Health Score + Project cards + Activity feed + Notifications + Setup checklist + Weekly Brief AI | 10 | 20/20 pytest · Health engine 4 components · APScheduler snapshots 6am + weekly brief lunes 8am · 2 probes B0.5 |
| ✅ B15 | Google Calendar OAuth + Availability Engine + Auto-assign | 8 | 38/38 pytest · CalendarProvider ABC + Google real + Microsoft stub · 3 policies · cache 5min · APScheduler refresh 30min · 2 probes B0.5 |
| ✅ B16 | AI Suggestions Inline + Smart Empty States + Public Booking Page | 6 | 12/12 pytest · Claude Haiku + cache 24h + fallback determinístico · 5 entity_types · 10 empty contexts · /reservar/{slug} + UTM + WhatsApp stub |
| ✅ B17 | SortableList + Inline edit genérico + FilterChipsBar enhanced + Undo server-side | 7 | 13/13 pytest · 50/50 regresión · 30+ campos whitelisted 8 entity_types · undo_log TTL 10min · 7+ mutations wired · Kanban+Documents HTML5 conservados |
| ✅ B18 | Density Toggle + Project Switcher topbar + Vista Planta 2.0 Interactiva | 5 | Sub-A 7/7 + Sub-B 8/8 pytest · `useDensity` + 3 CSS vars · ProjectSwitcher Cmd+P + recent FIFO · SVG canvas zoom/pan/pinch · UnitRect density-aware · edit mode drag+resize+upload · mobile bottom sheet |
| ✅ B18.5 | Fix-Pass (19 bugs B18 + 5 design violations) | 3 | 21/21 pytest · 3 críticos (getDashboard restore + project_id explicit + Cmd+P→Cmd+/) + 7 high + 5 design (shadow-2xl→border+backdrop, emojis→SVG, scale/rotate→translateY, console.log, focus-visible global) + migration script · PR #5 |
| ✅ B19 | Onboarding tour + Keyboard shortcuts + Help dialog + Personalization brand + Cross-portal sync + Modo presentación | 7 | 17/17 pytest · react-joyride + 5 tours + useTour + useKeyboardShortcuts (12 shortcuts) + KeyboardHelpDialog · branding org schema + 4 endpoints + cross_portal_events polling · usePresentationMode + anonymize hash + 5 vistas wired |
| ✅ B19.5 | Fix-Pass (Branding 100% + PII completar) | 1.5 | 22/22 pytest · branding_helpers compartido · PDF reportes + email templates + public booking con dev_branding · DesarrolladorLeads PII anonymize + DesarrolladorPricing pricing-blur · bonus /desarrollador/leads route restored · SHA 5e547b5 |
| ✅ B21 | Métricas Equipo Aggregated (Tour Completion + Productividad ConfidenceRatio + Tabla aggregated) | 5 | 13/13 Sub-B/C + 28/28 cumulativo pytest · 2 endpoints nuevos team-productivity + team-aggregated · ProductivityWidget + TeamAggregatedTable + TourCompletionAnalytics extended con period prop controlable · PR #6 + #7 mergeados |

### ✅ Phase 4 refactor 100% COMPLETO (2026-05-06)

| # | Batch | h | Foco |
|---|---|---|---|
| ✅ B20 | Asesor Metrics + Tracking Links + QR + Conversion Funnel + Sankey + AI Suggestions | 8 | 18/18 + 37/37 regresión · 3 routes asesor-metrics + 4 routes tracking-links + 5 endpoints funnel + sankey_data 4-niveles · Claude Haiku AI suggestion cost-gated >100 events · 4 pages frontend + funnelTracker en 5 hitos + @nivo/sankey · PR #8 |
| ✅ B22 | Insights Tab dentro Proyecto · 5 sub-tabs | 9 | 15/15 pytest · Resumen+HealthScore+narrative Haiku · Engagement actor split · Cash Flow wrapper B8 · Comparables top N · IA Sonnet 3 predicciones+5 recomendaciones+narrativa cache 24h · 6 endpoints + 3 services + 6 components · PR #9 |
| ✅ B23 | AI Copilot Lateral Toggleable (Cmd+J) | 6 | 13/13 pytest · 5 endpoints copilot + context aggregation role-aware + Claude Sonnet 4.5 + transcript 10 msgs + ai_budget gating · Drawer slide-in derecho + floating trigger + Quick Actions + react-markdown + Cmd+J via B19 hook · PR #10 |

### Estructura navegación final post B10-B11

```
SIDEBAR DEV (3 tiers collapsible)
├── TIER 1 — Workflow diario
│   ├── Panel
│   ├── Mis Proyectos (cards + Health Score + Diagnostic badge)
│   │   └── [proyecto] → 8 tabs
│   │       ├── Ventas (3 sub-tabs: Inventario completo · Por prototipo · Vista de planta)
│   │       ├── Contenido · Avance de obra · Ubicación · Amenidades · Legal
│   │       ├── Comercialización (brokers + comisiones + IVA + pre-asignación)
│   │       └── Insights (5 sub-tabs: Resumen · Engagement · Cash Flow · Comparables · IA)
│   ├── CRM (Pipeline · Leads · Citas · Slots · Brokers · Métricas equipo)
│   └── Mensajes/WA (futuro Phase 8)
├── TIER 2 — Reportes IA · Demanda · Site Selection · Pricing · Radar
└── TIER 3 — Equipo · Configuración
```

---

## 3. Phase Y — DMX Intelligence Platform

**~110h · 6 sub-phases · post-B23 (después de Phase 4 refactor)**

Fusión de Phase 17 ML training original + agentic features (concept Accio-inspired, sin browser scraping).

### Sub-phases

| Sub | Foco | h |
|---|---|---|
| Y.0 | Opt-in controls + Permission tiers T1-T4 + Master switch IA + Simulation mode | 8 |
| Y.1 | Director Agent + Memory layer (vector embeddings) + Event collectors universales | 25 |
| Y.2 | 5 sub-agents especializados (Pricing · Marketing · Lead · Construction · Compliance) + Per-user ML classifiers fusion | 25 |
| Y.3 | Agentic CRM workflows (Lead Nurture · Visit Prep · Post-Visit) + Conversational scheduling + **Reply Classifier inbound** (intent en WA/email entrantes) + **Buyer DISC Inferencer** (AI analiza conversaciones del lead → infiere personalidad DISC automático → surface insights al asesor para adaptar comunicación) | 28 |
| Y.4 | Adaptive features per-user/org (Caya style · Match weights · Argumentario tone · Briefing per-segment) | 15 |
| Y.5 | Agent observability + Audit replay UI + ML accuracy metrics | 9 |

### Permission tier system (Y.0)

```
T1 — Read only         (default for all features)
T2 — Suggest           (AI sugiere, founder aprueba c/u)
T3 — Auto low-risk     (acciones reversibles: status, notas, schedules)
T4 — Auto high-risk    (acciones irreversibles con audit + undo 24h)
```

**Defaults agentic**: OFF al onboarding. Master switch en topbar para pause global instant.

### Simulation Mode (Y.0)

Antes de activar T3/T4 production, founder simula dry-run sobre histórico:
> "Si Lead Nurture Agent estaba activo últimos 30 días → 47 mensajes WA, 12 calls agendados, costo $X, +3 leads cerrados proyectados"

### Audit Replay UI (Y.5)

Dashboard cronológico de TODAS las acciones AI con filtros + reasoning expandible + Undo si reversible.

---

## 3.5 Phase Z — Superadmin Data Intelligence Layer

**~72h · 7 sub-phases · post-Phase Y**

**Tesis**: La data agregada cross-org cross-tiempo es el moat. SaaS para devs/asesores genera ARR; data products para bancos/notarías/aseguradoras/inversionistas/gobierno generan ARR multiplicador + barrera de entrada insuperable.

**Origen**: pregunta founder 2026-05-02. Antes de esta fecha, la consolidación cross-org como producto comercial NO estaba en roadmap. Phase Z lo subsana.

### Customers de la data

| Cliente | Producto | Caso uso |
|---|---|---|
| Bancos / SOFOM | AVM API + comparables | Mortgage origination · LTV · portfolio risk |
| Aseguradoras | Risk score per propiedad/zona | Underwriting · premium · catastrophic risk |
| Notarías | Title chain + valuation PDF | Escrituras · DD comprador · Mifiel |
| Inversionistas / REITs | Yield calc + comparables | Deal sourcing · exit comps · simulator |
| Devs / builders | Pricing intelligence | Pre-launch · feature mix · timing |
| Brokerages externos | Market reports white-label | Competitive intel · pitches |
| Gobierno / SAT / SHF | Aggregate reports | Tax · transparency · AML signals |
| Construction supply | Material demand region/tipo | Supply chain forecast |
| Real estate media | Trend data feeds | Editorial · indices |
| Private equity | Deal sourcing + DD | M&A real estate ops |

### Dimensiones del cubo

- **Geographic**: alcaldía · colonia · AGEB INEGI 2020 · polígono custom · zona metro · país
- **Temporal**: snapshots diarios/semanales/mensuales · time-series desde día 1
- **Property**: tipo · m² · recámaras · baños · niveles · amenidades · year built · floor · view · orientation
- **Price**: rango · $/m² · $/total · evolución vs precio inicial · descuentos · pre-venta vs entrega
- **Project**: developer · stage · sale velocity · financing · reputación
- **Demand**: leads/zona/tipo · conversion · journey abandono · source attribution
- **Market signal**: precio inicial vs cierre · descuentos típicos · time-on-market · comparables matrix
- **Cross-portal**: dev portfolio health · asesor performance · comprador segments · search patterns

### Sub-phases

| Sub | Foco | h |
|---|---|---|
| Z.0 | Data Lake + Warehouse Foundation: time-series store + ETL diaria + geo indexing AGEB + facts/dim tables | 10 |
| Z.1 | Consolidated Metrics Cube: OLAP aggregations + materialized views + Redis cache + backfill | 12 |
| Z.2 | Superadmin Intelligence Hub UI: dashboard cross-org + heatmaps geo + trend lines + comparables matrix + drill-down + alerts | 12 |
| Z.3 | Data Products + Public API: API v1 + auth keys + rate limits + OpenAPI + tier free/pro/enterprise + webhooks + Stripe billing | 10 |
| Z.4 | Vertical Data Products: Bank AVM · Insurance risk · Notaría title+PDF · Investor yield — c/u widget white-label + API | 14 |
| Z.5 | Anonymization + Compliance: PII strip + k-anonymity ≥5 props + audit log + LFPDPPP DSR + differential privacy | 6 |
| Z.6 | Cross-sell Intelligence: lead enrichment + partner integrations + revenue share + propensity ML | 8 |

### Endpoints públicos planeados (Z.3)

```
GET /v1/markets/{alcaldia}/snapshot         KPIs zona
GET /v1/markets/{alcaldia}/timeseries       histórico
GET /v1/comparables?lat=&lng=&radius=       comparables
GET /v1/valuations/{property_id}            AVM + CI
GET /v1/zone-scores/{ageb_id}               125 IE scores
GET /v1/demand-pulse                        leads activos
GET /v1/risk/insurance/{property_id}        riesgo seguro
POST /v1/title-chain/check                  verif notarial
GET /v1/yield/{property_id}                 renta + yield
GET /v1/portfolio/exposure                  análisis cartera
```

### Por qué Phase Z post-Phase Y

1. Phase Y genera flujo agentic + ML continuous training → scores per-property/zone
2. Sin Phase Y, cubo Z queda con scores estáticos B0-style
3. Phase Z monetiza inteligencia que Y produce — orden correcto

### Pricing model planeado

- **Free**: 1k req/mes
- **Pro**: $499/mes · 100k req
- **Enterprise**: custom + SLA + white-label widgets

### Métricas éxito Y2

- 5+ partnerships verticals (1 banco · 1 aseguradora · 1 notaría · 1 fondo · 1 brokerage)
- API revenue ≥30% ARR total
- 100% queries externas loggeadas + 0 violaciones k-anonymity
- ≥80% colonias CDMX con data ≥10 properties

### Cross-sell ejemplos concretos (Z.6)

- Lead Marketplace ve apto Polanco → widget "Pre-aprobación BBVA 30s" → comisión banco si cierra
- Asesor abre lead → "Cliente elegible Qualitas $1,200/año" → 1-click cotización embebida → comisión seguro
- Comprador compra → notaría partner con título pre-verificado vía Z.4 → fee notaría
- Dev publica proyecto → "Constructor X tiene oferta tu zona" → revenue share

---

## 3.6 Phase ZZ — DMX Authority Layer

**~65h · 4 sub-phases · Wave 1 (ZZ.1) + Wave 3 (ZZ.2-ZZ.4)**

**Tesis**: Posicionar DMX como "el dios de la data inmobiliaria residencial MX → mundo". Phase Z monetiza data; Phase ZZ la convierte en autoridad inevitable (índices que el mercado cita, network effects en transactions, fraude detection que reguladores adoptan).

**Originada por**: founder challenge 2026-05-07 — "¿estos son game changers REALES?". Re-evaluación honesta: 3 de 4 propuestos originalmente eran oversold. Solo Fraud Detection era achievable. Pero founder reveló insight de bulk drive ingestion → unlock Transaction Network + Index Provider (data problem solucionado por founder manual seeding 100 proyectos/semana × 12 semanas = 1,200 proyectos baseline).

### Sub-phases

| Sub | Foco | h | Wave |
|---|---|---|---|
| ZZ.1 | **Bulk Drive Ingestion**: founder superadmin upload masivo proyectos · Claude haiku extraction + dedup matching + auto-fill schema disgregado | 10 | 1 |
| ZZ.2 | **Transaction Network**: track real closing prices anonimizados + comparables matrix verificada + price index | 18 | 3 |
| ZZ.3 | **Index Provider** DMX Residential Price Index (DRPI): publicación mensual + media partnerships (Forbes/El Financiero) → autoridad citable | 15 | 3 |
| ZZ.4 | **Fraud Detection AI**: ML pattern detection title chains + price anomalies + duplicate listings + flag-confianza buyers | 22 | 3 |

### Por qué cada item es real game-changer

- **ZZ.1**: Sin esto, Phase ZZ es vaporware. Founder seeding manual habilita data crítica.
- **ZZ.2**: Network effect — cada transaction agregada mejora comparables. ~5,000 closings = nadie replica en MX.
- **ZZ.3**: Case-Shiller mexicano. Forbes/El Financiero citan DRPI mensual = autoridad de facto.
- **ZZ.4**: Fraude inmobiliario MX afecta ~5-8% transacciones. Detection AI = differentiator vs Inmuebles24/Lamudi.

### Descartados de propuesta original (post-challenge founder 2026-05-07)

- ❌ **Construction Pipeline Tracker**: oversold ~5-10x. Government data MX fragmentada (RUV federal, SEDUVI CDMX, 32 estados separados, no API unificado). Real implementation ~100h+ partnerships Tinsa/Softec. Defer Y2.
- ❌ **Government API integration**: misma razón. Solo viable post-partnerships institucionales.
- ❌ **Press Kit Generator**: sales-problem-disguised-as-product. Founder PR usa Canva manual hasta validar PMF.

---

## 3.7 Superadmin gaps SA1-SA8

**~106h · análisis 2026-05-07 del módulo superadmin actual**

| ID | Foco | h | Wave |
|---|---|---|---|
| SA1 | **Ops Foundation**: fix `require_superadmin` (2h crítico) + Tenants list/manage UI + impersonation + system health dashboard | 18 | 1 |
| SA2 | **Data Sources Hub**: status connectors INEGI/Mapbox/Drive/Resend + retry/replay + audit | 10 | 2 |
| SA3 | **Audit Log Viewer**: timeline cross-org filterable + export · reusa B0 mutation log | 8 | 2 |
| SA4 | **AI Cost Observatory**: dashboard costos Claude/Haiku per org/feature + budget alerts | 12 | 2 |
| SA5 | **Commercial Foundation** (incl. SA5.0): per-tenant feature flags + plan templates + trial auto-expiry + GHL snapshots + Stripe wiring | 19 | 2 |
| SA6 | **Granular Metrics Cube UI**: vista nano→macro (depto → desarrollo → calle → colonia → alcaldía → ciudad) drill-down | 15 | 2 |
| SA7 | **Bulk Ingestion Tools** = ZZ.1 reusado | 10 | 1 |
| SA8 | **Founder Console**: command palette superadmin + ejecutivo KPIs + alertas anomalías + Quick actions | 14 | 2 |

**Total SA1-SA8**: 106h. Wave 1 toma SA1+SA7 = 28h. Wave 2 toma SA2-SA6+SA8 = 78h.

### Critical bugs Wave 1 must-fix

- ⚠️ Superadmin endpoints usan `require_advisor` en vez de `require_superadmin` (~2h) — cualquier asesor accede data superadmin. SHIP urgente W1.1.

---

## 4. Decisiones arquitectónicas

### Cross-portal
- DMX como inmobiliaria first-class (`inmobiliaria_id='dmx_root'`)
- Permisos tiered: comercial individual (sus leads) vs director/gerente (todo el ámbito)
- Métricas por unidad: actor split (asesor vs cliente, lecturas complementarias)
- Tracking attribution: cookie `?ref=asesor_id` 30d + multi-touch
- Schema disgregado: developments lean + refs (units, project_assets, project_documents)
- Mobile-first responsive desde día 1
- i18n infrastructure (es-MX + en-US ready)

### Anti-duplicate
- Scope = proyecto (NO network)
- 1 asesor por proyecto · clientes libres entre proyectos
- 85% similarity match (rapidfuzz)
- Movement alert genérico cuando otro asesor toca cliente

### Multi-broker calendar
- Google + Microsoft Calendar OAuth
- Verifica disponibilidad de TODOS los asesores connected
- Policies: round-robin OR pre-selected
- Auto-assign + crea evento en su calendar

---

## 5. Riesgos Phase Y

| Riesgo | Mitigation |
|---|---|
| Privacy/LFPDPPP (memory layer) | Opt-in + per-user purge + audit |
| User trust loss | Tiers T1-T4 + activity log + undo + simulation mode |
| Prompt injection | Sanitization + sandbox + T4 approval humano |
| Cost explosion | B0 ai_budget gating + tier limits |
| Onboarding overwhelm | Default OFF agentic + progressive disclosure |
| Quality degradation early | Hybrid rules baseline + ML cuando >N events |

---

## 6. H2 backlog + Rejected

### Defer H2 (legítimo)
- Lead post-close legal flow (deposit, escrow)
- Multi-currency MXN/USD/AED full
- Tax calculations IVA/ISR
- Asesor tier/ranking system
- Compliance MX nativa (CFDI, Mifiel NOM-151)
- Cross-org agent templates marketplace (Idea 16)
- Wizard duplicación proyecto (post-Phase 4)

### Rejected by founder
- Confetti animations
- WebSocket real-time
- Cross-network deduplication
- A/B testing infrastructure
- Multi-language detection automático (Idea 15)

### Keys pendientes
- INEGI_TOKEN real (B7.2 funciona con fallback honest)
- GOOGLE_OAUTH_CLIENT_ID (B12 Drive + B15 Calendar)
- MICROSOFT_OAUTH (B15 Calendar)
- ELEVENLABS_API_KEY · PEDRA_API_KEY (Studio Wave 2)

---

## 7. AI vs Agentic — distinción clave

**Distinción fundamental para no confundir nunca más**:

| Tipo | Qué hace | Ejemplos | Opt-in necesario? |
|---|---|---|---|
| **AI features** (generative/analytical) | Analiza, resume, predice, sugiere | Heat score, AI summary, narratives, predicciones, wizard extraction, Caya RAG, IE Engine scores | ❌ NO — son producto core |
| **Agentic features** (autonomous execution) | EJECUTA acciones solo (sin click humano) | Lead Nurture auto-WA, Director cambia precios solo, Workflow agents | ✅ SÍ — riesgo real |

**DMX es AI-native**. AI features (heat score, summaries, predictions) son CORE del producto, NO opt-in. Como Google Maps usa GPS — no es opt-in, ES el producto.

**Phase Y agentic features** son lo que requiere opt-in con tiers T1-T4 + simulation mode + master switch.

---

## Workflow protocol

1. Forkear chat emergent entre cada batch
2. Antes de Save to GitHub: emergent debe `git fetch + rebase origin/main`
3. Si conflict: "Create Branch & Push" → Claude Code mergea PR via gh CLI
4. Cada batch ship → Claude Code marca ✅ en PRD.md + verifica gaps
5. Standards file: `/app/memory/prompt_standards.md`
6. URL preview: `https://atlax-preview.preview.emergentagent.com`

---

**Documentos relacionados** (mismo nivel):
- `01_PRODUCT.md` — identidad + 4 portales + 6 roles
- `02_FEATURES.md` — catálogo 762 features
- `03_INTELLIGENCE.md` — IE Engine 125 scores
- `04_UI_DATA_REF.md` — UI flows + breath cards
- `05_DESIGN_SYSTEM.md` — atoms only navy + cream + 1 gradient
- `memory/PRD.md` — tracking activo con status updates per batch
