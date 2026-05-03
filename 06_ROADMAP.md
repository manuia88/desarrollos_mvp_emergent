# 06 — DMX Roadmap H1 (Reference Doc)

**Última actualización**: 2026-05-02
**Tracking activo**: `memory/PRD.md` (canonical, con status updates per batch)
**Este doc**: vista alto-nivel para navegación rápida y planeación.

---

## ÍNDICE

1. [Status snapshot H1](#1-status-snapshot-h1)
2. [Phase 4 Dev Module — refactor B0 → B23](#2-phase-4-dev-module-refactor)
3. [Phase Y — DMX Intelligence Platform](#3-phase-y-dmx-intelligence-platform)
3.5. [Phase Z — Superadmin Data Intelligence Layer](#35-phase-z-superadmin-data-intelligence-layer)
4. [Decisiones arquitectónicas](#4-decisiones-arquitectonicas)
5. [Riesgos + mitigations](#5-riesgos)
6. [H2 backlog + rejected](#6-h2-backlog)
7. [AI vs Agentic distinction](#7-ai-vs-agentic)

---

## 1. Status snapshot H1

| Phase | Status | Estimado |
|---|---|---|
| Phase 4 Dev Module (original v1) | ✅ shipped 16 batches | ~78h |
| Phase 4 Dev REFACTOR | 🟡 11/16 shipped (B0/B0.5/B10-B18), 5 pending | ~157h total |
| Phase 1 Marketplace gaps | 🟡 pending | ~30h |
| Phase 2 Comprador | 🟡 pending | ~12-14h |
| Phase 13/14/18 (whitelist + inhouse + inmobiliaria) | 🟡 pending | ~30h |
| Phase 3 Asesor remaining | 🟡 pending | ~16h |
| Phase 5 IE Engine completion | 🟡 pending | ~45h |
| Phase 6 Studio Wave 1.5+2 | 🟡 pending | ~36h |
| Phase 8 WhatsApp + Coms | 🟡 pending | ~15h |
| Phase 10 Caya + A11 | 🟡 pending | ~26h |
| Phase 11 Dubai | 🟡 pending | ~38h |
| **Phase Y DMX Intelligence Platform** (reemplaza Phase 17) | 🟡 pending | ~102h |
| **Phase Z Superadmin Data Intelligence Layer** (NUEVO 2026-05-02) | 🟡 pending | ~72h |
| Phase 19 Buyer Coach + Mortgage | 🟡 pending | ~14h |
| Phase 20 Polish + Launch | 🟡 pending | ~23h |
| F0 sweep (resto) | 🟡 pending | ~22h |
| Cross-cutting (CC1-4) | 🟡 pending | ~28h |

**Total H1 restante**: ~602h emergent (incluye Phase Z nueva)

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

### Pendientes (~35h restantes)

| # | Batch | h | Foco |
|---|---|---|---|
| 🟡 B19 | Onboarding tour + Personalization + Cross-portal feedback + Keyboard shortcuts + Modo presentación | 7 | |
| 🟡 B20 | Asesor metrics + Links tracking + Conversion funnel + Sankey | 8 | PostHog UTM funnel ficha→reservar→confirmación · AI budget suggestion per campaña · Sankey atribución |
| 🟡 B21 | Dev CRM > Métricas equipo aggregated | 5 | |
| 🟡 B22 | Insights tab dentro proyecto | 9 | Engagement actor split + Cash Flow + Comparables + IA con sub-tabs |
| 🟡 B23 | AI Copilot lateral toggleable Cmd+/ | 6 | |

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

**~102h · 6 sub-phases · post-B23 (después de Phase 4 refactor)**

Fusión de Phase 17 ML training original + agentic features (concept Accio-inspired, sin browser scraping).

### Sub-phases

| Sub | Foco | h |
|---|---|---|
| Y.0 | Opt-in controls + Permission tiers T1-T4 + Master switch IA + Simulation mode | 8 |
| Y.1 | Director Agent + Memory layer (vector embeddings) + Event collectors universales | 25 |
| Y.2 | 5 sub-agents especializados (Pricing · Marketing · Lead · Construction · Compliance) + Per-user ML classifiers fusion | 25 |
| Y.3 | Agentic CRM workflows (Lead Nurture · Visit Prep · Post-Visit) + Conversational scheduling | 20 |
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
6. URL preview: `https://compacto-nav.preview.emergentagent.com`

---

**Documentos relacionados** (mismo nivel):
- `01_PRODUCT.md` — identidad + 4 portales + 6 roles
- `02_FEATURES.md` — catálogo 762 features
- `03_INTELLIGENCE.md` — IE Engine 125 scores
- `04_UI_DATA_REF.md` — UI flows + breath cards
- `05_DESIGN_SYSTEM.md` — atoms only navy + cream + 1 gradient
- `memory/PRD.md` — tracking activo con status updates per batch
