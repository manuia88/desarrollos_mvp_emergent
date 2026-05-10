# DMX Wave Progress Tracker

**Última actualización**: 2026-05-10 (W4.18.2A Mapa core ✅ shipped SHA `f4799d1` · W4.18.3 Private Beta Gate 8h aprobado · Wave 4 ~331.5h/495h · 163.5h H1 pending)
**Total H1 restante**: ~163.5h (Wave 4 pending de los 495h totales · +32h Mapa + 1h PostHog + 8h Private Beta Gate)
**Shipped to date**: Wave 1 ✅ 50h + Wave 2 ✅ 120h + Wave 3 ✅ 197h + Wave 4 🟡 331.5h = 698.5h shipped en H1
**H1 nuevos totales**: Wave 2 120h ✅ + Wave 3 197h ✅ + Wave 4 495h (331.5h shipped, 163.5h pending) = 862h plan H1
**Wave 5 H2 sketch**: ~296h alimentadas + ⚠️79h alimentación tardía · Ver `memory/WAVE5_PLAN.md` para detalle
**Operativo**: Apify FREE plan (W4.18.1) en STUB MODE · founder decision: upgrade STARTER $49/mo cuando active W5.4/5.5/5.9

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
| W4.9 | Phase 6 Studio Wave 1.5 **CORE H1** (brochure mejorado, sin video bundle) | 16 | — | emergent | ⏳ | — | core H1 · video bundle 34h DIFERIDO Wave 5 W5.16 |
| ~~W4.9.5~~ | ~~Virtual staging IA~~ → **DIFERIDO Wave 5 W5.17** | 8 | — | — | 📦 W5 | — | depende de 3DGS estabilizado · va con video bundle |
| W4.9.6 | 3D Gaussian Splatting tour virtual (Luma API + viewer mkkellogg/GaussianSplats3D embebido en /unidad/[id]) | 16 | — | emergent | ⏳ | — | wedge competitivo · mantener H1 |
| W4.10 | Phase 8 ext WhatsApp Business + Newsletter Pulse 4 segments + Voice Atlax + digest sub-agents absorbed | 37 | 37 | emergent | ✅ | `02210a7` | whatsapp_engine provider-agnostic (Twilio real verified) + Resend newsletter dom/lun crons + Whisper STT + ElevenLabs TTS + AtlaxVoiceButton · Lead Nurture Y.3E ahora envía WA real |
| W4.18.2A.0 | PostHog setup (session replay + heatmaps + feature flags · standalone · complementa W4.3 behavioral) | 1 | — | emergent | ⏳ | — | autorizado 2026-05-10 · pre-W4.18.2A para grabar session replay desde lanzamiento mapa · free tier 1M events + 5K replays/mes · cero impacto W4.3 (no reemplaza) |
| W4.18.2A | Mapa Cerebro Espacial CORE (3 capas + Atlax click + acciones agénticas one-click + filtros básicos) | 16 | 16 | emergent | ✅ | `f4799d1` | MapaCDMX page + 5 layer pills (Preventa/Usada/Catastro/Zone Score/Riesgo) + Mapbox container + Atlax sidebar contextual + 6 endpoints `/api/maps/{layers,colonias,atlax-context}` · CTA "Ver en mapa" en /marketplace · sitemap.xml entry priority 0.9 · i18n maps.* es-MX |
| W4.18.2B | Mapa cross-features (5 únicos: funnel inverso + demand gap + match catastro→preventa + save zones + battle card) + /valores AVM público + SEO landings auto colonia | 16 | — | emergent | ⏳ | — | después W4.18.2A ✅ |
| W4.18.3 | **Private Beta Gate brokers-only** (invite codes + role-gate signup + landing pública waitlist + admin códigos) — 2-3 meses testing pre-launch público compradores | 8 | — | emergent | ⏳ | — | autorizado 2026-05-10 · pre-launch · construye waitlist warm para growth campaign post-testing |
| W4.11a | Phase 10 Atlax home extension (3 tools macro + atlax_threads collection + AtlaxThreadsSidebar + 6 chips macro + AtlaxHomeHero) | 16 | 16 | emergent | ✅ | `1060018` | ATLAX bloque CIERRA al 100% end-to-end · listo para usuarios |
| ~~W4.11b~~ | ~~A11 accessibility audit~~ → **MOVIDO a W4.15 Phase 20 polish (pre-launch)** | 10 | — | — | 📦 movido | — | A11 debe ser último: cualquier feature nueva post-audit lo rompe |
| ~~W4.12~~ | ~~Phase 11 Dubai full~~ → **DIFERIDO Wave 5 W5.18** | 38 | — | — | 📦 W5 | — | H1 launch CDMX-only · Dubai = expansión H2 (i18n AR + multi-currency MXN/AED/USD + sourcing inicial 50+ projects founder) |
| W4.13 | Phase 16 ext (Lead Journey + Amenities Validator) | 32 | — | emergent | ⏳ | — | A/B Meta Ads automatizadas |
| W4.14 | Phase 19 ext **partial** (Buyer Coach + Investment Simulator) — Mortgage simulator REEMPLAZADO por **W5.7 SOC franquicia** (founder compra) | 14 | — | emergent | ⏳ | — | Mortgage rail = SOC partner (Wave 5) · DMX simulator trivial |
| W4.15 | Phase 20 Polish + Launch + A11 audit + MongoDB Atlas migration + **Onboarding tour (G3)** + **Backup/restore disaster recovery (G4)** + **Multi-tenancy isolation pytest (G5)** | 43 | — | emergent + CC | ⏳ | — | ÚLTIMO pre-launch · UX + perf + a11y + DR + tenant isolation + onboarding (40% abandono típico sin tour) |
| W4.16 | Marketing (Free audit landing + State of CDMX Report) + **MCP Distribution Channel** (registrar DMX MCP en mcp.so/awesome-mcp/Anthropic registry + tutorial blog "Conecta Claude Desktop a DMX") | 5 + 0h dev | — | emergent + content | ⏳ | — | MCP Distribution = 0h dev (founder/agencia escribe content) · CAC=0 viral angle |
| W4.17 | Kalshi **partial** (Smart Notifications) — Probability UX DIFERIDO Wave 5 W5.19 | 8 | — | emergent | ⏳ | — | Smart Notif = engagement crítico H1 · Probability UX nice-to-have, depende W5.1+W5.3 |
| W4.18 | Data Sources gov MX bundle (6 fuentes oficiales: BANXICO + SIGCDMX + Atlas Riesgos + Catastro + GTFS + OSM Overpass) | 22 | 22 | emergent | ✅ | `9878f32` | 6 engines + 9 endpoints + 7 crons + 6 Atlax tools + SuperadminDataSources UI · BANXICO/OSM live ✅ · Atlas/Catastro/GTFS pending acceso producción a datos.cdmx.gob.mx |
| W4.18.1 | Apify Google Trends integration (cache TTL 7d + 3-layer fallback + circuit breaker + dual-schema adapter + 6 endpoints superadmin + 2 crons + Atlax tool + SuperadminTrends UI 590L + 9 unit tests pass) | 3 | 5 | emergent | ✅ | `ed9c19e` | **STUB MODE** · Apify FREE bloqueado por Google (proxies datacenter) · arquitectura 100% funcional · upgrade STARTER $49/mo cuando active downstream W5 · founder decisión documentada |
| F0 | Sweep tech debt + **Notification Center bell icon (G2)** + Apify token rotation + tier `whatif_simulator`/`asistente_publico` seed | 30 | — | CC lead | ⏳ | — | rolling cleanup + notification center crítico UX |
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
| 2026-05-09 | **W4.4E.5.2 Brand rename Caya→Atlax + 2 UX upgrades** | 5h | `1fac885` (merge `0d9b024`) | atlax_engine + 308 redirect 90d · capture-lead rate limit + form/banner mutex |
| 2026-05-09 | **W4.4E.5.1 Fix-pass: security legacy + lead form** | 2h | `e72853c` (merge `250b520`) | get_or_create_from_legacy validate + 429 + LeadCaptureMiniForm |
| 2026-05-09 | **W4.4E.5 Caya/Asistente Unification** | 7h | `fbb9484` (merge `31e1682`) | caya_engine thin wrapper · CayaBubble tier badge + MemoryHits + expand · AsistentePage hydrate 3-niveles · migration 4 sessions |
| 2026-05-09 | **W4.4E Phase Y.1E — `/asistente` público comprador** | 8h | `af6195d` (merge `4cb7674`) | Chat público sin login + 3 public tools + LFPDPPP + lead capture · Y.1 cierra al 53% · falta W4.4E.5 Unification |
| 2026-05-09 | **W4.4D Phase Y.1D — What-if Simulator** | 6h | `a85d7d9` (merge `eace9e4`) | 4 escenarios price/promo/delay/mix + Director 6th tool + MCP 9th tool + WhatIfPanel UI |
| 2026-05-09 | **W4.4C Phase Y.1C — MCP Exposure Director** | 4h | `e2d9aa7` (merge `d4a162a`) | 3 nuevas tools MCP (director_chat/retrieve_memory/session_summary) · 8 tools total · cross-tenant safety |
| 2026-05-09 | **W4.4B Phase Y.1B — Director Memory Layer RAG** | 8h | `17eaa3d` (merge `87ef728`) | DirectorMemoryEngine + retrieve_memory tool + auto-inject T2+ + cron daily/weekly + TEXT index español |
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
