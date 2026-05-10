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
| **Wave 2 — Commercial + Intelligence Hub** (SA2-SA6+SA8 + Z.0-Z.2) | ✅ **100% COMPLETO** (W2.1-W2.10 · 2026-05-08) | ~120h |
| **Wave 3 — Authority + Verticals + Risk Layer + IE Engine + Watchlist** (Teseo+AirDNA expansion + Kalshi data licensing F: ZZ.2-ZZ.4 + Z.3-Z.4 ext + Phase 5 + IE Engine Phase B + Risk Score V2 + Cross-sell + LFPDPPP badge + Watchlist subscribe) | ✅ **100% COMPLETO** (W3.0 → W3.9c · 2026-05-09) | ~197h |
| **Wave 4 RE-BALANCED — Agentic + Brand + Intelligence + Phase Y + Atlax + Polish** (W4.1 ✅ + W4.2 ✅ + W4.3 ✅ + W4.4A-E ✅ + Atlax 38/38h ✅ + W4.5 Y.2A-C ✅ + W4.18.1 Apify Trends 3h en curso · Y.3-Y.5 68h + W4.9 core 16h + W4.9.6 3DGS 16h + W4.10 ext 37h + W4.13 32h + W4.14 partial 14h + W4.15 polish 43h + W4.16 5h + W4.17 partial 8h + W4.18 22h + F0+CC 58h pending) · **107h diferidos a Wave 5** (Studio video 34h + Virtual staging 8h + Dubai 38h + Mortgage sim 15h + Probability UX 6h + Y.2D+E 12h) | 🟡 EN CURSO 182/454h (40.1%) | ~454h |

**Total H1 restante**: ~272h (Wave 1+2+3 cerradas · Wave 4 = 454h - 182h shipped = 272h pending · 107h diferidos a Wave 5 con alimentación clara)

**Shipped to date**: ~821h H1 (Phase 4-refactor + Phase 1-3 + B2B + Wave 1 50h + Wave 2 120h + Wave 3 197h + Wave 4 182h shipped + 272h pending = 821h plan H1)

**Wave 5 H2 sketch (~296h alimentadas + 79h alimentación tardía)**: Ver `memory/WAVE5_PLAN.md` · 22 batches con clasificación alimentación (✅/⚠️) + tier mapping + dependencias arquitectónicas + métricas éxito.

**Origin de adiciones**:
- **+77h Teseo expansion (2026-05-07 ronda 1)**: 17 ideas tropicalizadas (DENUE, Risk Score, Construction Cost, Hedonic DRPI, Methodology, Boletines, Investment Simulator, Lead Journey, AutoNewsletter, Free Audit).
- **+100h Teseo+AirDNA+cofounder ronda 2 (2026-05-07 PM)**: 9 game-changers post-análisis cofounder.co + AirDNA tier strategy + audio webinar Dania (Teseo). Filtro objetivo aplicado: 5 ideas DEFER (Pinterest scrapers, ML clustering, DMX Explorer, Pre-pre-construction Lot Simulator, Buyer educación contextual, White-Label) + DMX Bot home absorbido en Phase 10 Caya (cero overlap).
- **+23h Phase Y reorientación + Behavioral ML (2026-05-08)**: founder catch crítico de subutilización data interacciones. Phase Y reorientado de "5 sub-agents abstractos" a casos ML concretos data-driven (Optimal pricing · Lead matching ML · Project velocity · Drop-off prediction · etc.). +Recommendation Engine Marketplace 15h + Behavioral Tracking Foundation 8h.
- **+22h Kalshi-inspired ronda 3 (2026-05-08 PM)**: análisis Kalshi.com (prediction markets CFTC $185M Series C). 5 ideas: Probability UX (A +8h Wave 4) · Smart notifications (B +6h Wave 4) · Embeddable widgets (C +4h Wave 4) · Data licensing bundles (F +4h Wave 3) · Daily content (D absorbed Phase 8 ext sin sumar). Translate números crudos → narrative humano = "Robinhood for residential RE MX".
- **+60h ronda 4 Data Sources + Studio video + 3DGS (2026-05-09)**: análisis awesome-public-datasets + VibePeak.ai + 3D Gaussian Splatting repos. **W4.18 Data Sources gov MX 22h** (BANXICO SIE API + SIGCDMX uso suelo + Atlas Riesgos CDMX + Catastro CDMX + GTFS Mobility + OSM Geofabrik MX · links verificados memory/DATA_SOURCES.md) + **W4.9 Studio video bundle +14h** (brochure→video narrado multi-ratio + auto-script + TTS ElevenLabs ES/EN/AR · 4 features VibePeak no-over-eng) + **W4.9.5 Virtual staging IA 8h** (Replicate/Flux planos vacíos) + **W4.9.6 3D Gaussian Splatting tour 16h** (Luma API + viewer mkkellogg/GaussianSplats3D MIT · gap real vs Inm24/Lamudi). Descartadas (over-eng): AI avatar presentador, decluttering, sky replacement, analytics propio, push directo portales, World Bank/OECD/Copernicus/Sentinel.
- **+7h ronda 5 Caya/Asistente Unification (2026-05-09)**: founder catch over-engineering Y.1E vs Caya existente. **W4.4E.5 Unification 7h** (refactor caya_engine → invoca asistente_engine · CayaBubble hereda Director Agent + 5 tools público + Phase Y settings + LFPDPPP IP hash + lead capture form · 2 surfaces complementarias: bubble cross-page + /asistente full-page) + **SPLIT W4.11**: W4.11a Phase 10 Caya home 16h (después de unification, cierra bloque Caya end-to-end) + W4.11b A11 audit 10h MOVIDO a W4.15 Phase 20 polish (no romper audit con features posteriores). Wave 4: 556h → 563h.
- **+32h ronda 6 Mapa Cerebro Espacial DMX (2026-05-10)**: análisis SIGCDMX gob.mx + propiedades.com/valores + propiedades.com/explorar/mapa. Founder catch 3 capas distintas (catastro contexto + brokers usada inventario + devs preventa). **W4.18.2 Mapa Cerebro Espacial 32h** (Mapbox 3 capas diferenciadas + 5 cross-features únicos: funnel inverso usada→preventa · demand vs supply gap heatmap · match catastro→preventa personal · save zones inversionista · battle card overlay tier T3 · Atlax contextual click · acciones agénticas one-click · filtros DISC/Match Weights compuestos · /valores AVM público Hedonic · SEO landings auto colonia). Capitaliza 100% Phase Y backend (139.5h) + W4.18 (22h) + Phase 13 brokers shipped previo. Wedge imposible replicar 12-18m por competidores. Mapbox $0/mes free tier 50K loads. Wave 4: 454h → 486h.
- **+1h ronda 7 PostHog setup (2026-05-10)**: founder catch necesidad de session replay + heatmaps + feature flags ANTES de lanzar Mapa W4.18.2A para iterar UX desde launch día 1. **W4.18.2A.0 PostHog setup 1h** (snippet JS + ENV + cookie-less LFPDPPP-compliant config) standalone · complementa W4.3 behavioral (no reemplaza · alimenta sub-agents) · free tier $0/mes 1M events + 5K replays. Wave 4: 486h → 487h.
- **+8h ronda 8 Private Beta Gate brokers-only (2026-05-10)**: founder catch necesidad de testing 2-3 meses con brokers ÚNICAMENTE antes de abrir a compradores. **W4.18.3 Private Beta Gate 8h** (invite codes generables superadmin + role-gate signup `broker` only + landing pública `/` waitlist compradores con form email + página `/broker-portal` oculta con login real · todas features funcionan internamente · waitlist crece warm para growth campaign post-testing). Reduce riesgo bugs en exposición pública + early adopters brokers VIP + waitlist conversion día 1 launch público típicamente 30-50%. Wave 4: 487h → 495h.
- **+41h ronda 9 DMX Insights Layer Wave 5 H2 (2026-05-10)**: founder propuesta knowledge layer global cruzable con data MX + análisis Karpathy LLM Wiki pattern. **W5.20-21 H2 41h** arquitectura dual: (a) Wiki interno Karpathy `/insights-wiki/` con CLAUDE.md curación rules + raw/{fuente}/ + wiki/{temas,ciudades,insights}/ navegable Obsidian + (b) Multi-source scrapers ~25 fuentes Tier 1 globales (JLL · Knight Frank · Savills · CBRE · Cushman · Colliers · PwC · Deloitte · BIS · OECD · IMF · World Bank · FRED · BANXICO · INEGI · SHF · CONAVI · BMV FIBRAs · CNBV · Numbeo · Global Property Guide · Zillow · Redfin · Inmobiliare · Obras Web · Expansión · El Financiero · Forbes MX · ULI · ArchDaily · Espacio Urbano · Real Estate Lifestyle) + (c) Backend MongoDB `knowledge_articles` + `/insights` blog SEO + sitemap + (d) 5 upgrades Tier 1 (AI auth Haiku + PDF lead magnet + asesor citation widget + Atlax cited badge + newsletter wire-up) + (e) Atlax 17vo tool dual-mode wiki+DB. **NO toca H1** (Wave 5 H2 post-launch público). Detalles 80+ fuentes investigadas: `memory/INSIGHTS_SOURCES_RESEARCH.md`. Wedge "referente noticias real estate MX" único en LATAM · paridad Knight Frank/Savills/JLL reports. **Wave 5 H2 sketch: 296h → 337h**.
- **Total H1 adiciones sobre baseline 606h**: +330h. Total H1 = **936h** estimado · **Wave 5 H2: 337h** (incluye W5.20-21 41h DMX Insights Layer).

Detalles: `memory/DATA_SOURCES.md` + secciones "Wave 3 detailed plan" / "Wave 4 detailed plan" en `PRD.md`.

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

#### Wave 3 — Authority + Verticals + Risk Layer + Zone Score (~193h, +53h vs original 140h)
**Adiciones ronda 1 Teseo (+37h)**: Hedonic DRPI · Boletines · Risk Score · DENUE · Cost Predictor · Methodology · R² públicos.
**Adiciones ronda 2 Teseo+AirDNA (+16h)**: Zone Score A-F unified (E +10h) · Investment Explorer view (F +6h).

- ZZ.2 Transaction Network (18h)
- **ZZ.3 Index Provider DRPI ampliado** (26h, +6h) — Hedonic regression #2 + Boletín mensual #4 + Sectoral bulletins per zona #11 + `/methodology` page #14 + **F Investment Explorer view** (+6h: tabla colonias sortable por Score/Yield/Growth/Risk/DOM, filtros buyer-objective)
- **ZZ.4 Risk Layer ampliado** (40h, +18h) — Fraud Detection AI (22h) + DMX Risk Score per propiedad #12 (+18h: SESNSP + CENAPRED + ENVIPE + Atlas Riesgo CDMX)
- Phase Z.3 Public API + Stripe billing (10h)
- Phase Z.4 Vertical Data Products (Bank AVM/Insurance/Notaría/Investor) (14h)
- Phase Z.5 Anonymization + Compliance (6h)
- Phase Z.6 Cross-sell Intelligence (8h)
- **Phase 5 IE Engine completion ampliada** (66h, +21h) — IE original (45h) + DENUE #1 (+6h) + Construction Cost Predictor #13 (+5h) + **E Zone Score A-F unified** (+10h: composite supply/demand/risk/yield/regulation per colonia, AirDNA-style)
- **Z.0 Data Lake spec ampliado** (+3h R² + IC validation públicos #3)
- W3 Polish + Smoke + Audit (4h Claude Code)
- Buffer ~2h

#### Wave 4 — Agentic + Investor Sim + Brand Strategy + Intelligence Layer + Polish (~420h, +124h vs original 296h)
**Adiciones ronda 1 Teseo (+40h)**: AutoNewsletter Pulse · Lead Journey Outbound · Investment Simulator · Free audit.
**Adiciones ronda 2 Teseo+AirDNA+cofounder (+84h)**: Amenities Validator · MCP Brand Strategy · Diagnostic Engine · Real-time Demand · State of CDMX Report · Recommendation engine · Comparables proactivo. **DMX Bot home absorbido en Phase 10 Caya** (cero overlap, -6h ahorrado).

- Phase Y completa Y.0-Y.5 (110h) — Y.3 absorbe **C Real-time demand** (+8h dentro 28h existing → 36h)
- Phase 6 Studio Wave 1.5+2 (36h)
- **Phase 8 ext** (25h, +10h) — WhatsApp + Coms + AutoNewsletter DMX Pulse semanal #8 segmentado
- **Phase 10 Caya + A11 ext** (26h, sin sumar) — extiende Caya para cubrir queries generales mercado en home `dmx.mx` (absorbe DMX Bot público)
- Phase 11 Dubai (38h)
- **Phase 16 ext** (32h, +12h orig + 20h nueva) — Lead Journey Outbound asesor→dev #7 (12h) + **#18 Amenities Validator** (+20h: dev sube proyecto pre-construction → DMX corre A/B campañas Meta Ads automatizadas → recomendaciones cuantificadas % apreciación + ROI + reducción ciclo)
- **Phase 19 ext** (29h, +15h) — Buyer Coach + Mortgage + Investment Simulator #6
- Phase 20 Polish + Launch (23h)
- **W4 marketing/pre-launch ext** (8h, +3h orig + 5h nueva) — Free audit landing #17 + **G State of CDMX Annual Report** (PDF anual auto-generado + AI narrative + media mention play)
- **W4.NEW DMX Brand Strategy** (25h NEW batch) — **#22 MCP server** core (10h) + OG meta tags Schema.org rich (3h) + watermarks + QR exports (2h) + landing pages SEO PER ZONA `/zona/{slug}` 700 colonias auto-generadas (10h)
- **W4.NEW Intelligence Layer** (26h NEW batch) — **A Diagnóstico "por qué no se vende"** (15h) + Recommendation engine in-app always-on (6h) + Comparables matrix proactivo via anomaly detection (5h)
- F0 sweep restante (22h)
- Cross-cutting CC1-4 (28h)
- Buffer integration testing ~-15h optimistic

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

### Wave 5 H2 — Confirmado (post-launch público)

**W5.20-21 DMX Insights Layer** (41h · autorizado founder 2026-05-10): Wiki Karpathy pattern + Backend público + Multi-source scrapers globales (~25 fuentes Tier 1 🟢: JLL · Knight Frank · Savills · CBRE · Cushman · Colliers · PwC · Deloitte · BIS · OECD · IMF · World Bank · FRED · BANXICO ✅ · INEGI · SHF · CONAVI · BMV FIBRAs · CNBV · Numbeo · Global Property Guide · Zillow · Redfin · Inmobiliare · Obras Web · Expansión · El Financiero · Forbes MX · ULI · ArchDaily · Espacio Urbano · Real Estate Lifestyle). Wedge "referente noticias real estate MX" único en LATAM. Detalles ejecutivos: `memory/INSIGHTS_SOURCES_RESEARCH.md` (80+ fuentes investigadas) + `memory/BACKLOG_ENHANCEMENTS.md` (sub-chunks A-G).

**W5.16 Marketing Distribution Channel** (~10h): Social cards multi-formato `/og` (link previews FB/LinkedIn/WhatsApp/Twitter/Telegram/iMessage/Discord/Slack) + `/social/feed.png` 1080×1080 (IG/FB feed) + `/social/story.png` 1080×1920 (IG/TikTok/FB Stories/WA Status). Mapbox Static API + Pillow render compose · pipeline rendering compartido 3 layouts.

**W5.17 Studio Wave 1.5 video bundle + Virtual Staging IA** (42h diferido de W4.9.5): brochure→video narrado multi-ratio + auto-script + TTS ElevenLabs ES/EN/AR + Replicate/Flux planos vacíos staging.

**W5.18 Dubai full** (38h diferido de W4.12): i18n AR + multi-currency MXN/AED/USD + sourcing inicial 50+ projects founder.

**W5.19 Probability UX Kalshi-inspired** (6h diferido de W4.17): odds + interval + tooltips narrative para inversionistas premium.

### Defer H2 (legítimo)
- Lead post-close legal flow (deposit, escrow)
- Multi-currency MXN/USD/AED full
- Tax calculations IVA/ISR
- Asesor tier/ranking system
- Compliance MX nativa (CFDI, Mifiel NOM-151)
- Cross-org agent templates marketplace (Idea 16)
- Wizard duplicación proyecto (post-Phase 4)
- AVM público swap heurístico → hedonic_regression_engine real (P1 tech debt 2h F0 sweep)

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
6. URL preview: `https://latam-realestate.preview.emergentagent.com`

---

**Documentos relacionados** (mismo nivel):
- `01_PRODUCT.md` — identidad + 4 portales + 6 roles
- `02_FEATURES.md` — catálogo 762 features
- `03_INTELLIGENCE.md` — IE Engine 125 scores
- `04_UI_DATA_REF.md` — UI flows + breath cards
- `05_DESIGN_SYSTEM.md` — atoms only navy + cream + 1 gradient
- `memory/PRD.md` — tracking activo con status updates per batch
