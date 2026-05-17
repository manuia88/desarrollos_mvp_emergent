# DMX Wave Progress Tracker

**Última actualización**: 2026-05-17 (W5.ASR.5 COMPLETO P1+P2 SHIPPED · 10 batches shipped = 257h · próximo W5.8 Construction Quality Index · DNS wildcard pendiente hosting producción · TODOS los ASR redesign cerrados excepto W5.ASR.1 WhatsApp QR pendiente VPS)
**Total H1 restante**: ~146.5h (Wave 4 pending de los 495h totales · W4.18.2 32h ✅ shipped · 8h Private Beta Gate pending)
**Shipped to date**: Wave 1 ✅ 50h + Wave 2 ✅ 120h + Wave 3 ✅ 197h + Wave 4 🟡 348.5h + Wave 5 🟡 26h (W5.1) = 741.5h shipped
**H1 nuevos totales**: Wave 2 120h ✅ + Wave 3 197h ✅ + Wave 4 495h (331.5h shipped, 163.5h pending) = 862h plan H1
**Wave 5 H2**: ~625-689h post-moves (W5.7+5.13+5.14 a W6) · W5.1 ✅ 26h shipped · restante ~600-663h · plan `memory/WAVE5_PLAN.md`
**Wave 6 H2/H3**: ~374-407h (60-80h derivados redesign asesor + 87-100h movidos W5 + ~227h originales sketch) · `memory/WAVE6_PLAN.md`
**Wave 7**: ~115-123h + originales TBD · skeleton `memory/WAVE7_PLAN.md`
**Operativo**: Apify FREE STUB · founder decision 2026-05-16: upgrade $49/mo DIFERIDO hasta completar build W5
**Trámite paralelo**: ✅ Meta App Review INICIADO founder ops 2026-05-16 · ETA 2-4 sem · bloquea W5.10 + W5.ASR.1+5
**Próximo batch candidato**: W5.2 Zone Score desagregado (~15-20h · sub-scores ya existen) o W5.6 Scenario Storyteller (~25h)

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
| W4.4B | Phase Y.1B — Memory layer RAG sobre diagnostic_reports + ie_scores + behavioral_events | 8 | 8 | emergent | ✅ | `17eaa3d` | DirectorMemoryEngine + 5to tool retrieve_memory + auto-inject T2+ + cron daily 04:30 + cron weekly expire 180d + MongoDB TEXT index español + MemoryHitsBlock UI |
| W4.4C | Phase Y.1C — MCP exposure de Director (3 nuevas tools en /api/mcp existente) | 4 | 4 | emergent | ✅ | `e2d9aa7` | director_chat T1+ + director_retrieve_memory T2+ + director_session_summary T1+ · ConnectMcpPage Step 6 + 3 cards + curl examples · total 8 MCP tools · cross-tenant safety + master switch validados |
| W4.4D | Phase Y.1D — What-if Simulator (price_change/promo/delay/mix · 4 escenarios) | 6 | 6 | emergent | ✅ | `a85d7d9` | whatif_engine + 4 scenarios + Director 6th tool + MCP 9th tool + WhatIfPanel · caps T1=100/T2=500/T3+=∞ · cross-tenant safety + DSR soft delete |
| W4.4E | Phase Y.1E — Chat público `/asistente` (comprador frontstage) | 8 | 8 | emergent | ✅ | `af6195d` | asistente_engine + 4 endpoints + 3 public tools + LFPDPPP IP hash + intent regex + lead capture wireado a leads source=asistente_publico + cron expire 03:30 + AsistentePage UI full-page + 4 chips empty state |
| W4.4E.5 | Caya/Asistente Unification + Upgrade | 7 | 7 | emergent | ✅ | `fbb9484` | caya_engine thin wrapper sobre AsistenteEngine · get_or_create_from_legacy + channel web_bubble + tier en response · GET /api/asistente/sessions/{token} hydrate · migration idempotente (4 sessions migradas) · CayaBubble tier badge + MemoryHitsBlock + expand button · AsistentePage hydrate 3-niveles |
| W4.4E.5.1 | Fix-pass: security legacy mapping + lead form CayaBubble | 2 | 2 | emergent | ✅ | `e72853c` | get_or_create_from_legacy valida session existe antes de mapear · 429 con reason=rate_limit_legacy_mapping · audit log · LeadCaptureMiniForm inline 3 inputs · localStorage flag · capture-lead source override |
| W4.4E.5.2 | Brand rename Caya→Atlax + 2 UX upgrades | 5 | 5 | emergent | ✅ | `1fac885` | atlax_engine.py + routes_caya_legacy.py 308 redirect 90d · AtlaxBubble + atlaxApi + i18n atlax.* + 4 pages imports · localStorage migration síncrona · capture-lead rate limit 3/hora/ip · form/banner mutex |
| W4.4F | Resilience embedded (cache local + circuit breaker en Director) | 3 | — | emergent | ⏳ | — | absorbido en Y.2 sub-chunks |
| W4.5 Y.2A | Pricing Sub-Agent + 3 capas resilience (LocalCache/FallbackChain/CircuitBreaker reusable) | 6 | 6 | emergent | ✅ | `c021ecc` | sub_agents/ package + resilience.py + pricing_agent.py 3-layer (LLM→cache→heuristic) + 6 endpoints + Director 7mo tool + PricingAgentPanel + tab Sub-Agents |
| W4.5 Y.2B | Marketing Sub-Agent + 3 capas resilience (reusa resilience.py) | 6 | 6 | emergent | ✅ | `39b3fb5` | marketing_agent.py 3-layer + 4 tools internos + 5 issues detectados (low_views/low_ctr/low_conversion/missing_assets/stale_copy) + 5 endpoints + Director 8vo tool + MarketingAgentPanel + sub-tabs Pricing\|Marketing |
| W4.5 Y.2C | Lead Sub-Agent + 3 capas resilience | 6 | 6 | emergent | ✅ | `9039bf3` | lead_agent 689L · 5 tools (leads_by_status/asesor_conversion/funnel_dropoff/segment_response/lead_age) · 5 issues (stale_lead/low_conversion_asesor/drop_at_stage/underperforming_segment/missing_followup) · Director 9no tool · 3er sub-tab Lead |
| ~~W4.5 Y.2D~~ | ~~Construction Sub-Agent~~ → **DEFERRED a H2** | 6 | — | — | 📦 H2 | — | sin data madura: cronogramas obra + costos updates no estructurados en DMX hoy · revisar post-Phase 7.10 Avance-Obra |
| ~~W4.5 Y.2E~~ | ~~Compliance Sub-Agent~~ → **DEFERRED a H2** | 6 | — | — | 📦 H2 | — | sin data madura: depende de W4.18 SIGCDMX/Catastro + contratos no en DMX · LFPDPPP ya cubierto por W3.7 |
| W4.6 Y.3A | Smart Routing Lead <60 seg (3-layer LLM/cache/heuristic + auto-route fresh leads + cron metrics) | 10 | 10 | emergent | ✅ | `252d754` | smart_routing_engine 950L + 6 endpoints + Director 10mo tool + 4to sub-tab Smart Routing · fit_score 100 LLM 17.8s · Phase Y 80/125h |
| W4.6 Y.3B | Visit Prep automation (dossier auto pre-visita 24h · email + dashboard) | 6 | 6 | emergent | ✅ | `ce1f208` | visit_prep_engine 900L 3-layer + 3 endpoints + Director 11vo tool + cron daily 06:00 MX + VisitPrepDossier UI · coexiste con legacy VisitAutoPrepCard (B33) · Phase Y 86/125h |
| W4.6 Y.3C | Reply Classifier (Resend webhooks Svix HMAC + 6 categorías + 5 next_best_actions + RepliesInbox UI) | 6 | 6 | emergent | ✅ | `b4e5494` | reply_classifier_engine 750L 3-layer + Resend webhook production-ready + Director 12vo tool · Phase Y 92/125h |
| W4.6 Y.3D | DISC Inferencer (D/I/S/C scores + comm prefs + approach asesor) | 6 | 6 | emergent | ✅ | `b68a167` | disc_inferencer 811L 3-layer + 3 endpoints + Director 13vo tool + DiscProfileCard UI · Phase Y 99.5/125h |
| W4.6 Y.3C.5 | One-click action bridge (CTAs RepliesInbox por next_best_action_type + escalate modal) | 1.5 | 1.5 | emergent | ✅ | `b68a167` | cierra loop Reply Classifier · 5 mappings action_type → flow · post-action auto-mark |
| W4.6 Y.3E | Lead Nurture Intelligent (UPGRADE de W4.2D3.5 · 5 sequence types DISC + 5 tools + cron 04:15 MX + NurtureIntelligentPanel UI) | 8 | 8 | emergent | ✅ | `c3a2e9c` | NurtureIntelligentEngine 3-layer + Director 14vo tool + 5to sub-tab · **🎯 PHASE Y.3 CERRADA 100%** (40/36h con +1.5h fix-pass) |
| W4.7 Y.4A | Atlax per-tenant Persona Adaptation (identidad + tono + brand voice + greetings + forbidden_topics) | 5 | 5 | emergent | ✅ | `6ce175f` | atlax_persona_engine + 3 endpoints + persona injection system prompt + AtlaxPersonaPanel UI + 7th tab TenantDrawer · feature_key atlax_persona |
| W4.7 Y.4B | Match weights adaptive (lead↔proyecto matching personalizado per-org auto-tuned) | 6 | 6 | emergent | ✅ | `9c59c98` | match_weights_engine 651L correlación closed vs open · blend sample-size-aware · cooldown 6d · cron weekly · 4 endpoints · Director 15vo tool · Smart Routing integration · 8va tab UI |
| W4.7 Y.4C | Argumentario tone behavioral-driven (asesor scripts adaptive DISC + 6 objections + closing DISC-mapped) | 6 | 6 | emergent | ✅ | `197a6dc` | argumentario_engine 807L 3-layer + 3 endpoints + Director 16vo tool + ArgumentarioPanel UI · 🎯 Phase Y.4 CERRADA 100% (17/17h) |
| W4.8 Y.5 | Observability + Replay Debugger + AI ROI per-Dev (4 sub-fixes: AuditReplay + MLAccuracy + ReplayDebugger + AIROIPerDev) | 15 | 15 | emergent | ✅ | `5d54f10` | 🎯 PHASE Y CERRADA AL 100% · observability_engine 4 modules + 10 endpoints + SuperadminObservability 5 tabs + AIROIPanelDev developer portal + 2 crons + 3 collections |
| W4.9 | Phase 6 Studio Wave 1.5 **CORE H1** (brochure IA + 5 branding variants + custom upload + 4 social variants) | 20 | 20 | emergent + Claude Code rescue | ✅ | `036b4d8` (cherry-pick selectivo · branch 1750 emergent violó NO TOCAR memory por 2da vez) | brochure_renderer 685L (ReportLab + Pillow) + brochure_engine + routes_brochure 7 endpoints + 4 frontend components (Generator · BrandingSelector · CustomUploader · PreviewModal) + integraciones DevelopmentDetail + ProyectoDetail · 5 branding variants (corporate_navy · cream_minimal · gradient_bold · editorial_serif · dmx_neutral) · 4 social variants (fb_feed 1200×630 · ig_feed 1080×1080 · ig_stories + wa_status 1080×1920) · ⚠️emergent enhancement BACKLOG: regenerate endpoint same brochure_id (1h F0) · ⚠️i18n strings literales (no namespace) · video bundle 34h + virtual staging 8h DIFERIDOS Wave 5 Phase Z |
| ~~W4.9.5~~ | ~~Virtual staging IA~~ → **DIFERIDO Wave 5 W5.17** | 8 | — | — | 📦 W5 | — | depende de 3DGS estabilizado · va con video bundle |
| W4.9.6 | 3D Gaussian Splatting tour virtual (Luma API + viewer mkkellogg/GaussianSplats3D embebido en /unidad/[id]) | 16 | 16 | emergent + Claude Code rescue | ✅ | `12e9eb9` (cherry-pick selectivo · branch atrasado · NO destructivo esta vez) | tour_3dgs_engine + routes (9 endpoints) + luma_client stub-mode + 5 components UI (Tour3DViewer mkkellogg+three OrbitControls fullscreen + OnboardingWizard 3-step iPhone Pro/std/Android + Uploader .ply/.spz/.splat 200MB + StatusBadge + Embed3DGSPage `/embed/3dgs/:unit_id` pública) · DevelopmentDetail tab Tour 3D + ProyectoDetail Tours3DSection · LFPDPPP IP hash · CORS abierto assets · ⚠️emergent enhancement BACKLOG: regenerate-thumbnail endpoint (1h F0) · ⚠️video bundle 34h + virtual staging 8h DIFERIDOS Wave 5 Phase Z |
| W4.10 | Phase 8 ext WhatsApp Business + Newsletter Pulse 4 segments + Voice Atlax + digest sub-agents absorbed | 37 | 37 | emergent | ✅ | `02210a7` | whatsapp_engine provider-agnostic (Twilio real verified) + Resend newsletter dom/lun crons + Whisper STT + ElevenLabs TTS + AtlaxVoiceButton · Lead Nurture Y.3E ahora envía WA real |
| W4.18.2A.0 | PostHog setup (session replay + heatmaps + feature flags · standalone · complementa W4.3 behavioral) | 1 | 1 | emergent | ✅ | `007c7a5` | lib/posthog.js wrapper LFPDPPP-compliant (cookieless `persistence:'memory'` + `maskAllInputs:true` + opt-out gate vs `lfpdppp_consent` localStorage + identify hash SHA256 truncate 16 sin PII raw) · index.js init pre-observability · App.js useEffect pageview/identify/reset · backend/frontend .env.example documentadas · `posthog-js@1.205.1` ya en deps · legacy observability.js F0.11 PII-leaky fix con guard + email/name drop |
| W4.18.2A | Mapa Cerebro Espacial CORE (3 capas + Atlax click + acciones agénticas one-click + filtros básicos) | 16 | 16 | emergent | ✅ | `f4799d1` | MapaCDMX page + 5 layer pills (Preventa/Usada/Catastro/Zone Score/Riesgo) + Mapbox container + Atlax sidebar contextual + 6 endpoints `/api/maps/{layers,colonias,atlax-context}` · CTA "Ver en mapa" en /marketplace · sitemap.xml entry priority 0.9 · i18n maps.* es-MX |
| W4.18.2B | Mapa cross-features (5 únicos: funnel inverso + demand gap + match catastro→preventa + save zones + battle card) + /valores AVM público + SEO landings auto colonia | 16 | 16 | emergent | ✅ | `4d70c1e` | maps_cross_engine + 9 endpoints + avm_public_engine + 3 endpoints rate-limit 30/min · 7 components UI (FunnelInverso · MatchCatastro · DemandGap · SaveZone · BattleCard T3 + Valores + ColoniaLanding) · sitemap.xml +17 entries (/valores + 16 colonias) · MapaCDMX integrado 5 features · cron diario saved-zones triggers · TTL Mongo cache 24h · ⚠️tech debt: avm_public usa heurístico cuando hedonic_regression_engine.py SÍ existe (P1 fix Claude Code) · ⚠️Mapbox draw plugin diferido (viewport bounds como polygon) |
| W4.18.3 | **Private Beta Gate brokers-only** (invite codes + role-gate signup + landing pública waitlist + admin códigos) — 2-3 meses testing pre-launch público compradores | 8 | 8 | emergent | ✅ | `d1e81b8` | private_beta_engine + 7 endpoints (3 superadmin invites + validate-code + signup-broker + waitlist + waitlist list) · middleware HTTP gatea POST /api/auth/register cuando PRIVATE_BETA_MODE=true → 403 código `private_beta` · BrokerPortal 2 tabs + SuperadminInvites 2 tabs (códigos + waitlist KPIs UTM + export CSV) · InviteCodeInput debounce 500ms ✓/✗ inline · WaitlistForm UTM auto-capture · LFPDPPP IP hash · format `DMX-BR-XXXXXX` 36^6=2.17B combinaciones · brokers nuevos tier=T1 · ⚠️founder ops: ENV vars manuales en producción + Resend welcome email pending (W4.10 wire-up · BACKLOG) |
| W4.11a | Phase 10 Atlax home extension (3 tools macro + atlax_threads collection + AtlaxThreadsSidebar + 6 chips macro + AtlaxHomeHero) | 16 | 16 | emergent | ✅ | `1060018` | ATLAX bloque CIERRA al 100% end-to-end · listo para usuarios |
| ~~W4.11b~~ | ~~A11 accessibility audit~~ → **MOVIDO a W4.15 Phase 20 polish (pre-launch)** | 10 | — | — | 📦 movido | — | A11 debe ser último: cualquier feature nueva post-audit lo rompe |
| ~~W4.12~~ | ~~Phase 11 Dubai full~~ → **DIFERIDO Wave 5 W5.18** | 38 | — | — | 📦 W5 | — | H1 launch CDMX-only · Dubai = expansión H2 (i18n AR + multi-currency MXN/AED/USD + sourcing inicial 50+ projects founder) |
| W4.13.A | Phase 16 ext **Lead Journey Outbound** asesor→dev (timeline + 16 step types + outbound asesor portal + bulk re-route + audit + cross-cutting hooks: smart_routing · nurture · whatsapp · DISC) | 12 | 12 | emergent | ✅ | `9c50ccd` | lead_journey_engine 240L + 7 endpoints + LeadJourneyTimeline + JourneyStepIcon + AsesorOutbound page + 4 hooks emit_step (smart_routing · disc_inferencer · whatsapp · nurture) · 16 step types · idempotency 60s · audit_log integration · ⚠️ leaderboard endpoint pending (P2 backlog 0h emergent suggested) · 3 hooks pending NO-OP (atlax · capture_lead · auto_quote) |
| ~~W4.13.B~~ | ~~Project Performance Intelligence (Meta Ads automation)~~ → **MOVIDO Wave 5 W5.10** | 20 | — | — | 📦 W5 | — | módulo entero Social/Ads Multi-tenant + Analytics Granular + IA Layer pasa a W5.10 **233h scope-updated 2026-05-12** (+28h Zernio architectural learnings · build directo cero Zernio recurrente · ver `memory/feedback_zernio_decision.md`) |
| W4.14 | Phase 19 ext **partial** (Buyer Coach + Investment Simulator) — Mortgage simulator REEMPLAZADO por **W5.7 SOC franquicia** (founder compra) | 14 | 14 | emergent | ✅ | `c5e311a` | buyer_coach_engine 7 stages 3-layer resilience + 6 endpoints + investment_simulator_engine 3 escenarios (conservador/base/optimista) + stress_test + compare_alternatives + 4 endpoints · 7 components UI (BuyerCoachWidget · Conversation · StageChecklist · ScenarioCard · CashFlowChart recharts · InvestmentSimulator · Simulador page) · asistente tools 16→18 (buyer_coach_consult + investment_simulate) · rate-limit 30/min/IP · LFPDPPP IP hash · ⚠️Score Inversión DMX 0-100 enhancement (founder validado · persistido BACKLOG F0 · 3h) |
| W4.15 | Phase 20 Polish + Launch + A11 audit + MongoDB Atlas migration + **Onboarding tour (G3)** + **Backup/restore disaster recovery (G4)** + **Multi-tenancy isolation pytest (G5)** | 43 | 14 | emergent + CC | 🟡 | — | Split 3 sub-batches · W4.15.1 ✅ shipped 2026-05-11 · W4.15.2 (Onboarding tour) + W4.15.3 (Atlas + DR + Tenant tests) pending |
| W4.15.1 | A11y audit + Polish (SkipToContent + landmarks · useReducedMotion + BlurText/FadeUp · 55+ A11 violaciones críticas fixed · focus rings + ScrollToTop + eslint-plugin-jsx-a11y) | 14 | 14 | emergent | ✅ | `b3582da` (cherry-pick selectivo 6a6be28 · branch atrasada · dropped 06_ROADMAP.md + PRD.md + 2 backend files regresión .io→.com) | baseline lint:a11y 869 → 851 · 21 archivos frontend + A11_AUDIT_REPORT.md · 249 div onClick + 100 label-associated diferidos BACKLOG |
| W4.15.2 | Onboarding Tour G3 wire-up (TourLauncher global · 5 tours disparables · i18n 28 strings es-MX · SuperadminOnboardingAnalytics + nav · "Reiniciar tour" btn user menu · Marketplace testids · docs/ONBOARDING_TOUR_AUDIT.md) | 10 | 10 | emergent | ✅ | `1af822a` (cherry-pick clean 54eac23 · cero protegidos · cero backend) | Infraestructura Joyride pre-existía Batch 19 · faltaba wire-up · ahora dispara en todos los roles · ⚠️endpoint `tours-reset` diferido BACKLOG (state override actual sin persistencia backend) |
| W4.15.3 | G5 Multi-tenancy isolation tests (20 vectores ataque · 28 tests · tests/integration/test_tenant_isolation.py) + Atlas migration runbook (docs/ATLAS_MIGRATION_RUNBOOK.md · paso a paso founder no-técnico) | 19 | 8 | CC | ✅ | `81800aa` | Backup auto + DR script SKIP (no posible sin Atlas · founder decisión documentada) · Atlas migration solo doc (ejecutar pre-launch real) · Hallazgo permissions.py vs routes/dev_batch4_2.py duplicates persistido BACKLOG (cero riesgo OP · deuda técnica) |
| W4.16 | Marketing (Free audit landing + State of CDMX Report) + **MCP Distribution Channel** (registrar DMX MCP en mcp.so/awesome-mcp/Anthropic registry + tutorial blog "Conecta Claude Desktop a DMX") | 5 | 5 | emergent + Claude Code rescue | ✅ | `56c9044` (cherry-pick selectivo · branch atrasado · NO destructivo) | free_audit_engine + 6 endpoints (PDF 6-page ReportLab + LFPDPPP + rate-limit 5/min/email) · state_of_cdmx_engine 8 secciones (top ROI · demand-supply · velocity · predicciones 2026 · DMX Index placeholder) + og:image dinámico 1200×630 · mcp_distribution_engine track adoptions + UA detection + dedupe · 3 pages públicas (FreeAudit wizard 4-step · StateOfCDMX charts recharts · MCPTutorial 3-step setup) + 3 components marketing + sitemap.xml +3 entries (priority 0.85-0.95) + i18n 3 namespaces · `docs/MCP_DISTRIBUTION_SUBMISSIONS.md` templates registry submissions · ⚠️emergent enhancement BACKLOG: Free Audit funnel stats admin endpoint (1h F0) |
| W4.17 | Kalshi **partial** (Smart Notifications) — Probability UX DIFERIDO Wave 5 W5.19 | 8 | 8 | emergent | ✅ | `fd531ab` | notifications_engine 26KB + 6 endpoints + 10 rules helpers + 3 crons (digest 4h · WA pending 30min · meeting reminders) · NotificationBellIcon + Center + Item + Settings · 4 cross-cutting hooks (lead_journey · saved_zones · whatsapp · oauth_calendar) · matrix preferences N×4 canales + quiet hours + digest frequency |
| W4.18 | Data Sources gov MX bundle (6 fuentes oficiales: BANXICO + SIGCDMX + Atlas Riesgos + Catastro + GTFS + OSM Overpass) | 22 | 22 | emergent | ✅ | `9878f32` | 6 engines + 9 endpoints + 7 crons + 6 Atlax tools + SuperadminDataSources UI · BANXICO/OSM live ✅ · Atlas/Catastro/GTFS pending acceso producción a datos.cdmx.gob.mx |
| W4.18.1 | Apify Google Trends integration (cache TTL 7d + 3-layer fallback + circuit breaker + dual-schema adapter + 6 endpoints superadmin + 2 crons + Atlax tool + SuperadminTrends UI 590L + 9 unit tests pass) | 3 | 5 | emergent | ✅ | `ed9c19e` | **STUB MODE** · Apify FREE bloqueado por Google (proxies datacenter) · arquitectura 100% funcional · upgrade STARTER $49/mo cuando active downstream W5 · founder decisión documentada |
| F0 | Sweep tech debt + **Notification Center bell icon (G2 ✅ shipped W4.17)** + Apify token rotation + tier `whatif_simulator`/`asistente_publico` seed + 21.5h enhancements priorizados | 64 | 13.5 | mixto | 🟡 | F0.1 `cfbf5ab` + F0.2 `pending-merge-2007` | F0.1 ✅ + F0.2 ✅ (digest semanal + leaderboard + brochure regenerate + 3DGS thumbnail + Free Audit funnel + cron pre-compute) · 50.5h pending F0.3/F0.4 |
| CC1-4 | Cross-cutting (i18n + perf + a11y + monitoring) | 28 | — | mixto | ⏳ | — | — |
| Buffer | Integration testing | -15 | — | — | ⏳ | — | optimistic |

**Acumulado Wave 4 RE-BALANCED**: 182h / **454h** (40.1%) 🟡
**Pendiente Wave 4**: ~272h
**Items diferidos a Wave 5 (107h)**: Studio video bundle 34h + Virtual staging 8h + Dubai full 38h + Mortgage simulator 15h + Probability UX 6h + Y.2D+E 12h (de previa decisión) — todos con alimentación clara en Wave 5
**Phase Y H1 (Y.2D+E diferidos a H2)**: 125h totales H1 = W4.3 16h ✅ + W4.4A-E 36h ✅ + W4.5 Y.2A-C 18h ✅ = **70h shipped** · W4.6-W4.8 = 55h pending
**Atlax bloque**: ✅ **CERRADO 38/38h**
**Wave 5 H2 sketch**: ~296h alimentadas + ⚠️79h alimentación tardía · Ver `memory/WAVE5_PLAN.md`
**Atlax bloque**: ✅ **CERRADO 38/38h** · Y.1E + Unification + fix-pass + rename + Home extension
**Studio + 3DGS upgrades (autorizados 2026-05-09)**: 38h (W4.9 ext +14h Studio video + W4.9.5 8h virtual staging + W4.9.6 16h 3DGS tour)
**Data Sources gov MX (autorizado 2026-05-09)**: 22h (W4.18 BANXICO + SIGCDMX + Atlas + Catastro + GTFS + OSM)
**Por Claude Code en Wave 4**: ~36h (research + audits + F0 + CC share)
**Por emergent en Wave 4**: ~455h

---

## 📜 Historial de batches recientes

| Fecha | Batch | h real | SHA | Highlight |
|---|---|---|---|---|
| 2026-05-10 | **🎯 W4.6 Y.3E Lead Nurture Intelligent · PHASE Y.3 CERRADA 100%** | 8h | `c3a2e9c` (merge `3c60253`) | NurtureIntelligentEngine 3-layer + Director 14vo tool + 5 sequence types DISC + cron 04:15 + NurtureIntelligentPanel UI · Phase Y 107.5/125h ✅ |
| 2026-05-10 | **W4.6 Y.3D + Y.3C.5 · DISC Inferencer + One-click action bridge** | 7.5h | `b68a167` (merge `1602e2c`) | disc_inferencer 811L 3-layer + Director 13vo tool + DiscProfileCard + RepliesInbox CTAs one-click · Phase Y 99.5/125h ✅ |
| 2026-05-10 | **W4.6 Y.3C Reply Classifier · Resend webhook production-ready** | 6h | `b4e5494` (merge `7027fbf`) | reply_classifier 3-layer + Svix HMAC verify + 6 categorías + 5 next_best_actions + Director 12vo tool + RepliesInbox UI · Phase Y 92/125h ✅ |
| 2026-05-10 | **W4.6 Y.3B Visit Prep Automation** | 6h | `ce1f208` (merge `94354cd`) | visit_prep_engine 3-layer + 3 endpoints + Director 11vo tool + cron daily 06:00 MX + VisitPrepDossier UI · Phase Y 86/125h ✅ |
| 2026-05-09 | **W4.6 Y.3A Smart Routing Lead <60 seg** | 10h | `252d754` (merge `ca76ccb`) | smart_routing_engine 3-layer + 6 endpoints + Director 10mo tool + auto-route + 4to sub-tab · Phase Y 80/125h ✅ |
| 2026-05-09 | **W4.18.1 Apify Google Trends Integration · STUB MODE** | 5h | `ed9c19e` (merge `83ad844`) | apify_trends_engine + 6 endpoints + 2 crons + tool LLM + UI 590L + 9 tests pass · STUB por Apify FREE bloqueado por Google · upgrade STARTER $49/mo cuando active W5 |
| 2026-05-09 | **W4.5 Y.2C Lead Sub-Agent + 3 capas resilience** | 6h | `9039bf3` (merge `77cac3d`) | lead_agent 5 tools + 5 issues funnel · Director 9no tool · 3er sub-tab Lead · Phase Y 70/137h ✅ |
| 2026-05-09 | **W4.5 Y.2B Marketing Sub-Agent + 3 capas resilience** | 6h | `39b3fb5` (merge `f67b6d2`) | marketing_agent reusa resilience.py + 4 tools + 5 issues + Director 8vo tool + sub-tabs · Phase Y 64/137h ✅ |
| 2026-05-09 | **W4.5 Y.2A Pricing Sub-Agent + 3 capas resilience** | 6h | `c021ecc` (merge `1ace57d`) | sub_agents/ + resilience.py reusable + pricing_agent 3-layer + 6 endpoints + Director 7mo tool + PricingAgentPanel · Phase Y 58/137h ✅ |
| 2026-05-09 | **W4.11a Phase 10 Atlax home extension · ATLAX BLOQUE CERRADO** | 16h | `1060018` (merge `8c2be1a`) | 3 tools macro + atlax_threads + ThreadsSidebar + 6 chips + AtlaxHomeHero · Atlax 38/38h ✅ |
| 2026-05-14 | 🟡 **W4.15++ Rediseño Aurora Superadmin** | ~12h | local · pre-commit · pre-validation founder | Design system aurora para portal superadmin SOLO · 7 secciones (PRINCIPAL/DATOS/INTELIGENCIA/OPERACIÓN/MONETIZACIÓN/CRECIMIENTO/DEV TOOLS) cada una con color · per-section --theme dinámico via data-section · sidebar reorganizado 36→7 categorías · sweep masivo 12 hex variantes en pages+components/superadmin · :root --theme default indigo (cero leak otros portales) · hover universal · cursor cambia color · 5 páginas envueltas en SuperadminLayout · bug scroll sidebar fix · ver `memory/REDESIGN_SUPERADMIN_NOTES.md` |
| 2026-05-09 | **W4.4E.5.2 Brand rename Caya→Atlax + 2 UX upgrades** | 5h | `1fac885` (merge `0d9b024`) | atlax_engine + 308 redirect 90d · capture-lead rate limit + form/banner mutex |
| 2026-05-09 | **W4.4E.5.1 Fix-pass: security legacy + lead form** | 2h | `e72853c` (merge `250b520`) | get_or_create_from_legacy validate + 429 + LeadCaptureMiniForm |
| 2026-05-09 | **W4.4E.5 Caya/Asistente Unification** | 7h | `fbb9484` (merge `31e1682`) | caya_engine thin wrapper · CayaBubble tier badge + MemoryHits + expand · AsistentePage hydrate 3-niveles · migration 4 sessions |
| 2026-05-09 | **W4.4E Phase Y.1E — `/asistente` público comprador** | 8h | `af6195d` (merge `4cb7674`) | Chat público sin login + 3 public tools + LFPDPPP + lead capture · Y.1 cierra al 53% · falta W4.4E.5 Unification |
| 2026-05-09 | **W4.4D Phase Y.1D — What-if Simulator** | 6h | `a85d7d9` (merge `eace9e4`) | 4 escenarios price/promo/delay/mix + Director 6th tool + MCP 9th tool + WhatIfPanel UI |
| 2026-05-09 | **W4.4C Phase Y.1C — MCP Exposure Director** | 4h | `e2d9aa7` (merge `d4a162a`) | 3 nuevas tools MCP (director_chat/retrieve_memory/session_summary) · 8 tools total · cross-tenant safety |
| 2026-05-09 | **W4.4B Phase Y.1B — Director Memory Layer RAG** | 8h | `17eaa3d` (merge `87ef728`) | DirectorMemoryEngine + retrieve_memory tool + auto-inject T2+ + cron daily/weekly + TEXT index español |
| 2026-05-16 | **W5.ASR.0 · Cleanup pre-batch asesor redesign** | 5h | C1 `f5af028` + C2 `ab2cb4f` + C3 `0ad997e` (Claude Code) | 3 chunks: (1) z-index tokens · `frontend/src/styles/zIndex.js` 10 constants (BASE/DROPDOWN/STICKY/MODAL/DRAWER/TOAST/TOUR/TOUR_TIP/MODAL_CRITICAL/A11Y) · sweep 254 ocurrencias hardcoded `zIndex: N` → `Z.*` en 162 archivos · script Python multi-line-import-aware (segundo intento tras revert del primero que rompía multi-line imports) · grep final 0 · (2) consolidar `pages/advisor/`+`pages/asesor/` → solo `asesor/` · 14 archivos `git mv` (`AsesorBriefings/Busquedas/Captaciones/Citas/Comisiones/Contactos/Dashboard/LeadsDev/Operaciones/Outbound/Ranking/Tareas/CalendarSettings/StudioDashboard`) · `sed` global 14 imports `pages/advisor/`→`pages/asesor/` en `App.js` · dir advisor/ eliminado · (3) guard pipeline `target_status==visita_realizada` requiere `visit_outcome` (interes/no/follow-up) → HTTP 422 en `backend/routes/dev_batch4.py` V1 y `dev_batch4_2.py` V2 · `DesarrolladorCRM.js` handleDrop con `window.prompt` outcome + PATCH `/api/leads/:id` antes de `api.moveLeadColumn` · 3 builds `yarn build` OK (~17-18s c/u) · push main+`conflict_080526_1644` x3 · diferidos para futuro: 4 archivos `.css` con `z-index:` hardcoded (poco volumen) · validación curl backend no ejecutada (requiere backend running) |
| 2026-05-16 | **W5.3 Parte 2B · Forecast cross-module upgrades (5 módulos + filter)** | 11h | merge `e633f73` (origen `97610cc`) | 3 sub-chunks: notifications_engine.rule_forecast_trend_alert (+ hook cron alcista≥+10%/bajista≤-5%/dedupe 14d user×zona) · buyer_coach_engine.get_zone_recommendations enriquece forecast_12m_pct · investment_simulator_engine.simulate override tasas con low95/value/high95 anualizadas (cap 10/15/20%) flag forecast_used · asistente_engine nueva tool 16 get_zone_forecast (cache LRU) · ai_suggestions._build_context prepend "DATO DE MERCADO" con forecast 12/24m · routes/public.py filter forecast_delta_min JSON · SubscoreFilterPanel.js slider 7° 0-25% + Marketplace.js hidratación URL · forecast_trend_alert agregado a NOTIF_TYPES + DEFAULT_CATEGORIES (bug fallback "generic" resuelto) · validación curl /api/developments?forecast_delta_min=N filtra 18→5→4→0 · post-merge yarn build 18.14s |
| 2026-05-16 | **W5.3 Parte 2A · Persist 6 sub-scores reales + Forecast accuracy dashboard** | 13h | merge `f8834a4` (origen `cd52319`) | 2 sub-chunks: `zone_subscores_compute.py` 6 funciones paralelo (lifestyle/seguridad/transporte/amenidades/precio/vibe) + `zone_subscores_cron.py` @ 02:30 UTC + `zone_score_engine.get_zone_with_subscores` prioriza `subscores_real` no-stub con `subscores_meta` per-key (source) · `routes/forecast_accuracy.py` 3 endpoints superadmin (summary · per-zone · run-backtest idempotent asyncio.Lock) + SuperadminForecastAccuracy.js dashboard (5 KPIs · trend LineChart · tabla drift color-coded) · navByRole consolidado (forecast-accuracy en mi tier 3 Inteligencia + eliminé duplicado emergent) · 42 zonas/0.09s/0 errors cron · MAPE {6m:13.11% · 12m:22.04% · 24m:40.42%} · ⚠️ stubs: lifestyle/amenidades/vibe (DENUE sin datos) · seguridad (crime_data sin datos) · 48 snapshots forecast_accuracy sintéticos para validar UI · post-merge yarn build OK 18.02s |
| 2026-05-16 | **W5.3 Parte 1 · Forecast multi-horizonte ARIMA · motor + APIs + charts** | 20h | merge `5425023` (origen `1e885f8`) | 3 sub-chunks: forecast_engine.py ARIMA auto-order (loop 48 combos · guard razonabilidad |delta 12m|>80% descarta) · forecast_retrain_cron.py @ 04:00 UTC · forecast_cache.py LRU TTL 6h max 1024 · 3 endpoints `/api/forecast-public/{zone · property · cache-stats}` rate-limit 60/30 · ForecastChart.js recharts ComposedChart integrado en /valor/:slug + /zona/:slug · validación curl condesa +18.8%/12m · narvarte 404 insufficient_history · post-merge yarn build OK 18.70s · ⚠️ data sintética 12 DRPI snapshots mensuales inyectados en 4 colonias (cleanup pendiente cuando DRPI mensual real acumule ≥6 periodos) |
| 2026-05-16 | **W5.2 Zone Score desagregado · 6 subscores expuestos + UI + filtros + SEO** | 17h | merge `e36fb9f` (origen `081d4b3`) | 4 sub-chunks: helper `get_zone_with_subscores` + constantes SUBSCORE_KEYS/LABELS/DEFINITIONS · 2 endpoints `/api/zones-public/{slug}` + `/api/zones-public/top?subscore=&limit=` · `ZoneSubscoresCard` con 6 barras horizontales en `/zona/:slug` · filtro `subscore_min` JSON en `/api/developments` (NO en `routes/marketplace.py` · usó `routes/public.py` · backward-compat) · 6 SEO landings temáticas `/cdmx/{top-seguras\|top-familias\|top-movilidad\|top-vibe\|mejor-precio-calidad\|top-amenidades}` con JSON-LD ItemList · `CdmxSlugDispatcher` resuelve conflicto con `/cdmx/:intent` preexistente · sitemap +6 entries (public/sitemap.xml + backend dinámico) · post-merge yarn build OK 19.74s |
| 2026-05-16 | **W5.1 AVM ML productionization (Hedonic público)** | 26h | merge `318b93a` + dedupe `8f52419` (origen conflict_110526_0125) | 5 sub-chunks: retrain cron nocturno 03:00 UTC + auto-promote >5pp ΔR² · dashboard superadmin `/superadmin/avm-accuracy` (43 zonas · 3 promovidas · cache LRU hit_rate 14.29%) · widget público `/widgets/avm/:slug` iframe-ready dark/light · landing SEO `/valor/:slug` con JSON-LD · explainability stacked bar 4 features · cache LRU 512 entries TTL 1h · golden dataset 20 props CDMX MAPE 19.56% within_10=4 within_20=7 · post-merge yarn build OK 18.03s · 6 endpoints superadmin verificados · entry "AVM Accuracy" añadida en navByRole tier Inteligencia |
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
