# DMX Wave Progress Tracker

**Última actualización**: 2026-05-09 (W4.4 Phase Y.1A Director Agent core shipped · Wave 4 ~108h)
**Total H1 restante**: ~448h (Wave 4 pending de los 556h totales)
**Shipped to date**: Wave 1 ✅ 50h + Wave 2 ✅ 120h + Wave 3 ✅ 197h + Wave 4 🟡 108h = 475h shipped en H1
**H1 nuevos totales**: Wave 2 120h ✅ + Wave 3 197h ✅ + Wave 4 556h (108h shipped, 448h pending) = 873h plan (con Phase Y + Data sources + 3DGS upgrades)

Este doc se actualiza después de cada batch shipped. Estado siempre refleja último push a main.

## Convenciones del checklist

Formato canónico per-batch (founder request):

| # | Batch | h | Quién | Status | SHA | Notas |
|---|---|---|---|---|---|---|

- **Status**: ⏳ pending · 🟡 in-progress · ✅ completed · ❌ blocked
- **Quién**: Claude Code (audit/cleanup/bug-fix/QA/docs) · emergent (features con UI nueva + endpoints + lógica)
- **h**: estimado / real
- **SHA**: short hash del commit que cierra el batch

### Regla quién hace qué
- ¿Hay UI nueva? → emergent
- ¿Schema + endpoints + integración cross-portal? → emergent
- ¿Bug fix sin UI nueva? → Claude Code
- ¿Audit / QA / docs / refactor sin features? → Claude Code
- ¿Smoke testing post-batch? → Claude Code

---

## 📊 Resumen ejecutivo

| Wave | Foco | Estimado | Shipped | % | Status |
|---|---|---|---|---|---|
| **Wave 1** — Foundation + Authority Seeds | SA1 + ZZ.1 + ZZ.1.1 | 50h | 50h | 100% | ✅ CERRADA 2026-05-07 |
| **Wave 2** — Commercial + Intelligence Hub | SA2-SA6+SA8 + Z.0-Z.2 | 120h | 120h | 100% | ✅ CERRADA 2026-05-08 |
| **Wave 3** — Authority + Verticals + Risk Layer + Zone Score | + Zone Score A-F + Investment Explorer + IE Engine completion + W3.9 Polish (LFPDPPP + Watchlist) | 197h | 197h | 100% | ✅ CERRADA 2026-05-09 |
| **Wave 4** — Agentic + Brand + Intelligence Layer + Behavioral ML + 3DGS + Data Sources + Polish (+207h vs original) | + Amenities Validator + MCP Brand Strategy + Diagnostic Engine + Real-time Demand + Recommendation Marketplace ML + Behavioral Tracking + Phase Y casos ML concretos + State of CDMX Report + Comparables proactivo + Studio video bundle + Virtual staging IA + 3D Gaussian Splatting tour + Data sources gov MX (BANXICO + SIGCDMX + Atlas + GTFS + OSM) | 556h | 98h | 17.6% | 🟡 EN CURSO |

---

## ✅ Wave 1 — Foundation + Authority Seeds (~50h) — CERRADA 2026-05-07

**Objetivo**: superadmin production-safe + bulk drive ingestion activa para empezar a construir moat.

### Batches

| # | Batch | h est. | h real | Quién | Status | SHA | Notas |
|---|---|---|---|---|---|---|---|
| W1.1 | SA1.0 Critical Bug Fix superadmin guards | 2 | 1.5 | Claude Code | ✅ | `90666a3` | Audit completo · 2 bugs fixed (document-types + units history skip-on-empty) · 13 pytest · helpers permissions.py |
| W1.2 | SA1.1 Tenants Management UI | 8 | 8 | emergent | ✅ | `c905563` | 5 endpoints + page responsive + ImpersonationBanner countdown + useImpersonation hook + login account_blocked check |
| W1.3 | SA1.2 System Health Dashboard | 8 | 8 | emergent | ✅ | `054b0a6` (merge) | 5 endpoints + cron_heartbeat decorator + 9 crons instrumentados + Resend email throttle + auto-refresh 30s |
| W1.4 | ZZ.1 Bulk Drive Ingestion | 10 | 10 | emergent | ✅ | `054b0a6` (merge) | Pipeline async Drive→Haiku→dedup rapidfuzz→schema disgregado INSERT + 8 endpoints + email completion + Semaphore(10) + ai_budget gate |
| W1.5 | ZZ.1.1 Ingestion Quality + Dedup Engine | 6 | 6 | emergent | ✅ | `054b0a6` (merge) | 4 endpoints (PATCH/diff/recompute/force-match) + InlineEditableField + MergeDiffVisualizer + extracted_overrides + extraction_history |
| W1.6 | Wave 1 Polish + Smoke | 4 | 4 | Claude Code | ✅ | TBD push | Permission audit 23 endpoints W1.2-W1.5 limpio · pytest E2E test_wave1_e2e_superadmin.py · founder test guide WAVE1_FOUNDER_TEST_GUIDE.md · PRD/06_ROADMAP marcados Wave 1 ✅ |
| Buffer | Polish/imprevistos | 12 | — | mixto | ⏳ | — | Bugs → Claude Code · scope expansion → emergent |

**Acumulado Wave 1**: 37.5h / 50h (100% scope · 75% del estimate buffer-incluido)
**Por Claude Code**: 5.5h shipped (W1.1 + W1.6)
**Por emergent**: 32h shipped (W1.2 + W1.3 + W1.4 + W1.5)

### Métricas éxito Wave 1
- [x] 100% superadmin endpoints requieren superadmin role (audit limpio en W1.1)
- [ ] Founder puede ingestar 50 proyectos en <2h via Bulk UI (W1.4-W1.5)
- [ ] Dedup engine identifica >90% duplicados (W1.5)
- [ ] System Health alerta a founder dentro de 5min si critical service down (W1.3)
- [ ] Audit log captura 100% mutations cross-org cross-tenant (W1.1 done parcial, W1.2 completa)

---

## ✅ Wave 2 — Commercial + Intelligence Hub (~120h) — CERRADA 2026-05-08

**Objetivo**: monetización + dashboard ejecutivo cross-org.

| # | Batch | h est. | h real | Quién | Status | Notas |
|---|---|---|---|---|---|---|
| W2.1 | SA2 Data Sources Hub | 10 | 10 | emergent | ✅ | 11 connectors + healthcheck + retry/replay + audit |
| W2.2 | SA3 Audit Log Viewer | 8 | 8 | emergent | ✅ | 7 endpoints + BeforeAfterDiff + bulk_ingest enrichment |
| W2.3 | SA4 AI Cost Observatory | 12 | 12 | emergent | ✅ | 9 endpoints + dual-write + caps hard_block + sparkline |
| W2.4 | SA5 Commercial Foundation | 19 | 19 | emergent | ✅ | feature flags + plan templates + trial cron + GHL snapshots |
| W2.5 | SA6 Granular Metrics Cube UI | 15 | 15 | emergent | ✅ | drill-down nano→macro + Mapbox heatmap + comparables (~607 líneas backend) |
| W2.6 | SA8 Founder Console | 14 | 14 | emergent | ✅ | Cmd+K + KPIs ejecutivos + anomalías (~528 líneas backend) |
| W2.7 | Phase Z.0 Data Lake + Warehouse | 13 | 13 | emergent | ✅ | time-series + ETL diaria + geo indexing AGEB (~404 líneas backend) |
| W2.8 | Phase Z.1 Consolidated Metrics Cube | 12 | 12 | emergent | ✅ | OLAP aggregations + materialized views (~537 líneas backend) |
| W2.9 | Phase Z.2 Intelligence Hub UI | 12 | 12 | emergent | ✅ | Dashboard ejecutivo cross-org (~332 líneas backend + UI) |
| W2.10 | Polish + Smoke + Audit | 4 | 4 | Claude Code | ✅ | E2E audit + permission gates + closure |
| Buffer | Imprevistos | 1 | 1 | mixto | ✅ | — |

**Acumulado Wave 2**: 120h / 120h (100%) ✅

---

## ✅ Wave 3 — Authority + Verticals + Risk Layer + IE Engine (~197h) — CERRADA 2026-05-09

**Objetivo**: data products B2B (bancos/aseguradoras/notarías) + DMX como autoridad + IE Engine completion + risk layer + watchlist público.

| # | Batch | h | Status | SHA notable | Notas |
|---|---|---|---|---|---|
| W3.0 | URL accents fix (zone_id) | 1 | ✅ | `6b5d7e8` | safe_path_param helper |
| W3.1A | Phase 5 Foundation (DENUE + Cost + Zone Score) | 21 | ✅ | shipped | foundation prepa W3 |
| W3.1B-1..5 | IE Engine Phase B (18 IE_PROY + 5 IE_UNIT recipes + cron + endpoint público + UI + IeUnitScoreCard) | 12 | ✅ | varios | unit scope agregado · cron 02:00 + 02:30 |
| W3.2 | ZZ.2 Transaction Network | 18 | ✅ | shipped | comparables matrix verificada |
| W3.3 | ZZ.3 Index Provider DRPI ampliado | 26 | ✅ | shipped | hedonic regression + boletines |
| W3.4 | ZZ.4 Risk Layer (Fraud + Crime + Natural + Perception) | 40 | ✅ | shipped | IsolationForest + 4 fuentes |
| W3.5 | Public API + Stripe billing (con W3.5.5 fix-pass) | 10 | ✅ | `be91d76` | OpenAPI + 3 tiers + audit logs |
| W3.6 | Vertical Data Products (Bank AVM/Insurance/Notaría/Investor) | 14 | ✅ | shipped | 4 verticales SuperadminVerticalProducts |
| W3.7 | Phase Z.5 Anonymization + Compliance | 6 | ✅ | shipped | k-anon ≥5 + Laplace + DSR |
| W3.8 | Cross-sell Engine (5 partners + lead capture) | 8 | ✅ | `e83831c` | mortgage/insurance/notaría/avalúo/moving |
| W3.9a | LFPDPPP badge + IE polish (percentile fix + include_unit) | 2 | ✅ | `50ba492` | + Sentry index fix |
| W3.9b | Watchlist subscribe backend (5 endpoints + cron 02:30) | 4 | ✅ | `d0d5eb8` | double opt-in + Resend stub |
| W3.9c | Watchlist frontend 3 surfaces (Methodology + Inteligencia + Marketplace) | 3 | ✅ | `16ac673` | WatchlistSubscribeForm + RiskWatchlist + RiskScoreSubscribeWidget |
| Buffer | — | 2 | ✅ | — | — |

**Acumulado Wave 3**: 197h / 197h (100%) ✅

---

## 🟡 Wave 4 — Agentic + Brand + Intelligence Layer + Polish (~461h) — EN CURSO

**Objetivo**: AI agentic + closure phases pending + brand strategy GEO + programmatic SEO + polish + launch.

| # | Batch | h est. | h real | Quién | Status | SHA | Notas |
|---|---|---|---|---|---|---|---|
| W4.1A | Diagnostic Engine backend (6 reglas + endpoint cache 6h) | 10 | 10 | emergent | ✅ | `ed05ef0` | analyze_dev + DiagnosticReport |
| W4.1B | DiagnosticPanel frontend dashboard portal dev | 5 | 5 | emergent | ✅ | `7b4a90c` | mount in DesarrolladorIEDetail |
| W4.1C | Recommendation banner + Sentry index fix | 6 | 6 | emergent | ✅ | `bed63cd` | `/api/recommendations/top` + DeveloperLayout mount |
| W4.1D | Comparable Anomaly Engine + cron 03:00 | 5 | 5 | emergent | ✅ | `0c0808e` | 3 detectores: PRICE_DROP/SOLD_OUT/NEW_LAUNCH |
| W4.2A | MCP HTTP server (5 tools · /api/mcp · X-DMX-API-Key) | 10 | 10 | emergent | ✅ | `8f021ae` | JSON-RPC compatible, sin SDK (FastAPI puro) |
| W4.2B | GEO foundation (llms.txt + sitemap + Schema.org + ConnectMcpPage + FAQPage) | 5.5 | 5.5 | emergent | ✅ | `ed497cf` | static files + JSON-LD generator |
| W4.2C | Watermarks + QR exports + MCP tool ext (bedrooms/m2/parking/stage) | 2.5 | 2.5 | emergent | ✅ | `99003d5` | export_brand.py + /api/exports/qr + watermark og-image · 6 filtros MCP search_developments |
| W4.2D1 | Filter URL infrastructure (URL state sync + dynamic meta tags + dynamic sitemap + 36 SEO combos seed) | 5 | 5 | emergent | ✅ | `e61e336` | marketplaceUrlState.js + MarketplaceMetaTags.js + seo_combos_seed.py |
| (research) | Top 200 queries CDMX (SEMrush + AMPI) | 2 | — | Claude Code | ⏳ | — | Antes de D2 |
| W4.2D2 | Zone landing pages `/zona/{slug}` (16 zonas seed) + FAQ Schema + Place JSON-LD + sitemap | 8 | 8 | emergent | ✅ | `fbdf7e9` | routes_public_zones.py + ZonePage.js + ZoneStructuredData.js |
| W4.2D3 | Programmatic SEO Tier 1+2 (61 landing pages: 40 colonias + 16 alcaldías + 5 intents) + lead capture anti-doorway | 8 | 8 | emergent | ✅ | `1a14ac7` | seo_landings_config.py + routes_landings.py + AlcaldiaPage.js + IntentLandingPage.js + LandingLeadCaptureForm.js |
| W4.2D3.5 | Landing Leads Dashboard + Lead Nurture Cron 04:00 MX | 5 | 5 | emergent | ✅ | `bb94f16` | lead_nurture_engine.py + SuperadminLandingLeads.js + 4 endpoints superadmin + cron schedule |
| W4.2.5A | Embeddable Score + Risk Widgets (`/widgets/score/{slug}` + `/widgets/risk/{slug}`) + design system fix-pass W4.2.5.1 | 4 | 5 | emergent | ✅ | `29f0bd8` + `62ed233` (W4.2.5.1) | ScoreWidgetPage.js + RiskWidgetPage.js + routes_widgets.py + ConnectMcpPage embed snippets · cream bg + gradient top bar + dark glass stats verificados live |
| W4.2.5B | `/prensa` Media Kit page (8 stat cards copy-as-quote + 4 download cards + JSON-LD NewsMediaOrganization) | 3 | 3 | emergent | ✅ | `29f0bd8` | PrensaPage.js + routes_press.py |
| W4.3 | Phase Y.0 Foundation + Behavioral Tracking | 16 | 16 | emergent | ✅ | `2498e8e` | routes_phase_y_controls.py + behavioral_tracking_engine.py + routes_behavioral.py + PhaseYControlsPanel + tracker keepalive |
| W4.4A | Phase Y.1A — Director Agent core orchestration (4 tools internas: get_ie_score / get_unit_score / get_comparables / get_org_kpis) | 10 | 10 | emergent | ✅ | `de46500` | DirectorAgent class + 5 endpoints REST + DirectorChatPanel UI + simulation mode + tier caps T1-T4 + sonnet-4-5 (LiteLLM proxy sin sonnet-4-6) |
| W4.4B | Phase Y.1B — Memory layer RAG sobre diagnostic_reports + ie_scores + behavioral_events | 8 | — | emergent | ⏳ | — | retrieval híbrido (vector + filtros) · contexto inyectado en system prompt · TTL aware |
| W4.4C | Phase Y.1C — MCP exposure de Director (5 tools del MCP server llaman al Director Agent) | 4 | — | emergent | ⏳ | — | extiende /api/mcp existente · auth X-DMX-API-Key |
| W4.4D | Phase Y.1D — What-if Simulator (dev simula impacto de cambiar precio/promo/timing) | 6 | — | emergent | ⏳ | — | feature #3 killer · usa Director + scenarios |
| W4.4E | Phase Y.1E — Chat público `/asistente` (comprador frontstage) | 8 | — | emergent | ⏳ | — | feature #1 killer · session anónima · rate limit anti-abuse |
| W4.4F | Resilience embedded (cache local + circuit breaker en Director) | 3 | — | emergent | ⏳ | — | embedded en Y.1B-E sub-chunks |
| W4.5 | Phase Y.2 5 sub-agents ML + 3 capas resilience por agente | 30 | — | emergent | ⏳ | — | 5 chunks · Pricing/Marketing/Lead/Construction/Compliance · cada uno con cache + fallback + circuit breaker |
| W4.6 | Phase Y.3 Agentic CRM workflows + Smart Routing Lead | 36 | — | emergent | ⏳ | — | 5 chunks · Lead Nurture intelligent + Visit Prep + Reply Classifier (Resend webhooks) + DISC Inferencer + Smart Routing <60 seg |
| W4.7 | Phase Y.4 Adaptive features per-user/org | 17 | — | emergent | ⏳ | — | 3 chunks · Caya per-tenant + Match weights adaptive + Argumentario tone behavioral-driven |
| W4.8 | Phase Y.5 Observability + Replay Debugger + AI ROI per-dev dashboard | 15 | — | emergent | ⏳ | — | 4 chunks · Audit Replay + ML accuracy + Replay Debugger + AI ROI per-dev portal |
| W4.9 | Phase 6 Studio Wave 1.5+2 + Studio video bundle (brochure→video narrado multi-ratio + auto-script + TTS ElevenLabs ES/EN/AR) | 50 | — | emergent | ⏳ | — | extensions B25/B26 + S1 video 14h |
| W4.9.5 | Virtual staging IA (planos vacíos → mueblar via Replicate/Flux) | 8 | — | emergent | ⏳ | — | preventa CDMX 90% obra nueva |
| W4.9.6 | 3D Gaussian Splatting tour virtual (Luma API + viewer mkkellogg/GaussianSplats3D embebido en /unidad/[id]) | 16 | — | emergent | ⏳ | — | gap real vs Inm24/Lamudi · ventana 6-9 meses |
| W4.10 | Phase 8 ext WhatsApp + AutoNewsletter | 25 | — | emergent | ⏳ | — | WA Business + Pulse semanal |
| W4.11 | Phase 10 Caya home + A11 ext | 26 | — | emergent | ⏳ | — | Caya en desarrollosmx.io para queries mercado |
| W4.12 | Phase 11 Dubai | 38 | — | emergent | ⏳ | — | i18n + flow Dubai-specific |
| W4.13 | Phase 16 ext (Lead Journey + Amenities Validator) | 32 | — | emergent | ⏳ | — | A/B Meta Ads automatizadas |
| W4.14 | Phase 19 ext (Buyer Coach + Mortgage + Investment Sim) | 29 | — | emergent | ⏳ | — | — |
| W4.15 | Phase 20 Polish + Launch | 23 | — | emergent + CC | ⏳ | — | UX polish + perf + a11y + final QA |
| W4.16 | W4 marketing (Free audit landing + State of CDMX Report) | 5 | — | emergent | ⏳ | — | -3h press kit movido a W4.2.5B |
| W4.17 | Kalshi (Probability UX + Smart Notifications) | 14 | — | emergent | ⏳ | — | -4h widgets movidos a W4.2.5A |
| W4.18 | Data Sources gov MX bundle (BANXICO SIE API + SIGCDMX uso suelo + Atlas Riesgos CDMX + Catastro CDMX + GTFS + OSM Geofabrik) | 22 | — | emergent | ⏳ | — | links verificados en memory/DATA_SOURCES.md · diferencial vs Inm24 |
| F0 | Sweep tech debt | 22 | — | CC lead | ⏳ | — | rolling cleanup |
| CC1-4 | Cross-cutting (i18n + perf + a11y + monitoring) | 28 | — | mixto | ⏳ | — | — |
| Buffer | Integration testing | -15 | — | — | ⏳ | — | optimistic |

**Acumulado Wave 4**: 108h / 556h (19.4%) 🟡
**Pendiente Wave 4**: ~448h
**Phase Y total upgraded**: 137h (W4.3 16h ✅ + W4.4A 10h ✅ shipped = 26h shipped · W4.4B-E + W4.5-W4.8 = 111h pending)
**Studio + 3DGS upgrades (autorizados 2026-05-09)**: 38h (W4.9 ext +14h Studio video + W4.9.5 8h virtual staging + W4.9.6 16h 3DGS tour)
**Data Sources gov MX (autorizado 2026-05-09)**: 22h (W4.18 BANXICO + SIGCDMX + Atlas + Catastro + GTFS + OSM)
**Por Claude Code en Wave 4**: ~36h (research + audits + F0 + CC share)
**Por emergent en Wave 4**: ~455h

---

## 📜 Historial de batches recientes

| Fecha | Batch | h real | SHA | Highlight |
|---|---|---|---|---|
| 2026-05-09 | **W4.4A Phase Y.1A — Director Agent core** | 10h | `de46500` (merge `b3cf110`) | DirectorAgent + 4 tools internas + simulation mode + tier caps + chat panel UI |
| 2026-05-09 | **W4.3 Phase Y.0 Foundation + Behavioral Tracking** | 16h | `2498e8e` (merge `d63e4f0`) | Master switch + 9 tiers + behavioral_tracking_engine LFPDPPP-compliant |
| 2026-05-07 | **Wave 1 CERRADA** — W1.6 Polish + push consolidado | 4h | TBD | E2E pytest 23 endpoints · audit limpio · founder test guide · PRD/ROADMAP closure |
| 2026-05-07 | W1.5 ZZ.1.1 Quality + Dedup + DiffVisualizer | 6h | merge `054b0a6` | InlineEdit + MergeDiffVisualizer + force-match + recompute Haiku + extracted_overrides |
| 2026-05-07 | W1.4 ZZ.1 Bulk Drive Ingestion | 10h | merge `054b0a6` | Pipeline async Drive→Haiku→dedup rapidfuzz→schema disgregado + 8 endpoints |
| 2026-05-07 | W1.3 SA1.2 System Health Dashboard | 8h | merge `054b0a6` | 5 endpoints + cron heartbeat + 9 crons instrumentados + Resend throttle |
| 2026-05-07 | W1.2 SA1.1 Tenants Management UI | 8h | `c905563` | List orgs dev+inm + drill-down + impersonate 30min + login account_blocked |
| 2026-05-07 | W1.1 SA1.0 superadmin guards | 1.5h | `90666a3` | 2 bugs reales fixed + 13 pytest + helpers permissions.py |
| 2026-05-07 | docs: Wave 1-4 structure + Phase ZZ + SA1-SA8 + SA5.0 GHL | — | `83522e4` | Roadmap consolidado post-challenge founder |

---

## Convenciones del checklist

- ✅ completed (shipped to main)
- 🟡 in-progress (en curso)
- ⏳ pending
- ❌ blocked / abandoned
- SHA: short hash del commit que cierra el batch
- h real ≤ h est. = bien · h real > h est. × 1.5 = revisar scoping
