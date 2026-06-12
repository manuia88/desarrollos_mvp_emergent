# DesarrollosMX — ROADMAP

## Programa "DMX a Producción Impecable" (F0 Diagnóstico · en curso, 2026-06-12)
Auditoría exhaustiva por bloques (ledger vivo: `REPO_COBERTURA.md`). Branch de trabajo `claude/wizardly-galileo-p6tg41` (sobre `dev-redesign-tandas`).
- **B1 Seguridad ✅** — 13 hallazgos, P0/P1 cerrados: fuga RAG público cross-tenant (scopes), ruteo marketplace al pool dmx_root, JOIN comprador solo con email verificado, magic-link sin token en prod, + hardening IA (DISC/persona/logs). 7 fixes, build verde.
- **B2 Auditoría Técnica ✅** — columna vertebral sólida; 168 motores = 161 VIVO / 7 FLAG-OFF (suite agéntica, decisión de deploy) / 0 CABLE-ROTO / 0 huérfano → nada que despertar con código (Tandas 20-38 ya lo hicieron). Acción: **33 tests críticos** (tenant_scope/entity_resolution/house_pool/data_doctrine, 33/33 verde) + audit de dinero visible. Deuda registrada para F4: violaciones de capa, archivos-dios, contrato de respuesta, handler central de errores.
- **B3 Performance 10k ✅** — la app está bien armada (75+ índices, code-splitting excelente, scheduler real con 30+ crons, cachés materializadas). 5 de 6 "índices faltantes" eran falsos; se añadió 1 real (`units.project_id`) + se optimizó el N+1 del reparto de leads (house_pool: 1+3N → 3 queries) + se afinó el script de carga al SLA. Diferido con destino claro: rate-limit distribuido (Redis, B8/F6), RAG vectorial a escala, agregación server-side de god-views (F4), cap de IA por env (deploy). Veredicto techo: el público lee de caché; lo que se cae primero a 10k es el gasto LLM de Atlax (cap+rate-limit), no el núcleo.
- **B4 Rediseño UX · Marketplace (MKT-1) 🔄** — la maquinaria pública está sorprendentemente completa (7+ motores cableados, ZonePage es la página modelo); los componentes de estado canónicos YA existen (SmartEmptyState/LoadingState/ErrorState) y se reusaron. Arreglado: el "…" eterno de las fichas (con DB vacía cualquier /propiedad o /desarrollo se colgaba), el error de red disfrazado de "sin resultados" en Marketplace, y los sparklines con Math.random() de la página de Confianza (datos falsos en la página de la confianza). Build verde, 0 warnings nuevos. Backlog: despertar live_pulse en ColoniaLanding, Barrios→links SEO, decisión founder sobre las 6 propiedades ficticias del home, a11y, Atlax humano.
- **B4 MKT-3 · Despertar lo apagado ✅** — el momentum de la página de colonia leía un dato viejo; ahora muestra el motor real `live_pulse` (widget que ya existía, se auto-oculta sin dato). Y la página de barrios pasó de 16 chips de texto muerto HARDCODEADOS a una **lista DINÁMICA del catálogo real `db.colonias`** (el que crece con tu sync SIG/zonificación en superadmin): links reales a `/zona/:slug` que AUTO-CRECEN de 16 (seed/fallback) a todas las colonias de CDMX. Tras investigar el feedback del founder se halló el **eslabón que faltaba**: ningún endpoint público listaba `db.colonias` (solo el seed in-memory o el cubo). Se creó `GET /api/colonias/catalog` (`colonias_catalog.public_catalog`, siembra perezosa + fail-open) y se probó con 4 tests (37/37 verdes). Build BE+FE verde, 0 warnings nuevos.
- **B4 MKT-4 · Robustez de la cara pública ✅** — hallazgo de la prueba en navegador (Playwright) durante MKT-3: el componente de scores `ZoneScoreStrip` tumbaba TODA la página al "Algo salió mal" si su API respondía vacío/con forma rara; afectaba 3 páginas públicas (Inteligencia, Barrios, ficha de desarrollo). Blindado (normaliza `scores` a arreglo) + el modal hermano `ScoreExplainModal`. Re-corrí en navegador el escenario EXACTO que crasheaba → ahora la página vive (40 colonias + 3 tiras de scores, 0 errores). Build verde, 0 warnings nuevos.
- Pendiente: prender la suite agéntica (`agentic_enabled`) = decisión de deploy del founder, no código. B4 sigue (MKT-2 ficha que vende · MKT-5 Atlax humano · a11y de botones icon-only · resto de portales). Decisión founder abierta: las 6 propiedades ficticias del home.

## P0 — Phase 2 Comprador — COMPLETADO (Batches 28-30)
- Magic Link Auth, Dashboard, Favoritos, Historial, Privacidad LFPDPPP ✅
- Smart Alerts (4 tipos × 3 canales) ✅
- Comparador Premium buyer tier (5 métricas) ✅
- Chat Asesor In-App (polling 30s, mark-read bidireccional) ✅
- Wrapped Mensual/Anual estilo Spotify ✅
- Smart Match Widget (reusa colonia_quiz.match_colonias) ✅

## P0 — Phase 3 Asesor Tools — COMPLETADO (Batch 31 ✅)
- Briefing Tráfico+Clima (Mapbox + Open-Meteo, cache 15min, fallback graceful) ✅
- Argumentario AI RAG (Claude Sonnet 4.5 + 32 KB entries + drawer global FAB) ✅
- Mapbox token activado · `source=live` operativo ✅

## P0 — Phase 4 Asesor Identity — COMPLETADO (Batch 32 ✅)
- Endorsements públicas con email confirmation (rate limit 3/email/asesor) ✅
- LinkedIn import manual stub (OAuth defer Phase 8) ✅
- DISC 7-question wizard + Claude Haiku narrative ✅
- Trust Score 6-component formula (cap 100) + cache 4h + re-compute hooks ✅
- Public profile `/asesor-publico/:id` sin auth con hero + endorsements + trust + projects + WhatsApp CTA ✅

## P0 — Phase 4 Asesor Daily Tools — COMPLETADO (Batch 33 ✅)
- Calendar bidireccional (Google webhook + polling fallback + auto-renew) ✅
- Visit Auto-prep AI con APScheduler 1h cron (Claude Sonnet 4.5 + 7-source aggregation) ✅
- Cliente Insights tab inline en EntityDrawer (Claude Haiku next-action + sentiment) ✅
- Cache permanente briefing · cache 30min insights ✅

## P0 — Phase 4 Asesor (Batches 32/33/34) — COMPLETADO ✅
- Batch 32: Identity (Endorsements + LinkedIn + DISC + Trust Score) ✅
- Batch 33: Daily Tools (Calendar bidi + Visit briefing + Client insights) ✅
- Batch 34: Smart Match Lead-to-Asesor + "Tu Día Hoy" feed ✅

## P1 — Próximas tareas
- [x] W3.1A Phase 5 Foundation (DENUE + Construction Cost + Zone Score) ✅
- [x] W3.2 Transaction Network (Anonymized closings + price index) ✅
- [x] W3.3 ZZ.3 DRPI ampliado (Hedonic + Bulletins + Methodology + Investment Explorer) ✅ 2026-05-08
- [x] W3.4A ZZ.4 Risk Layer Part 1 (Fraud Detection AI + Risk Score V1 SESNSP) ✅ 2026-05-08
- [x] W3.4B ZZ.4 Risk Layer Part 2 (V2 multi-source + UI alert engine) ✅ 2026-05-08
- [ ] W3.5 Public API + Stripe Billing
- [ ] Phase 7.10: Tab Avance de Obra
- [ ] WhatsApp Business real integration (`whatsapp-web.js` + Caya UI)
- [ ] W3 Billing & Stripe Wiring real (test key disponible en pod)
- [ ] Multi-subscriber digest (Wave 4 #8 AutoNewsletter) — ampliar Resend distribution boletines
- [ ] Briefing tráfico: integrar dentro de fichas de proyecto (auto-fill destination)
- [ ] Argumentario: ampliar KB con casos de éxito reales del equipo
- [ ] Compartir perfil público asesor en marketing assets / firma email

## P2 — Backlog
- [ ] W3.7 Public API: Export Excel/CSV para Intelligence Hub
- [ ] Microsoft OAuth Integration activation
- [ ] Phase 8: LinkedIn OAuth real (deja de ser manual stub)
- [ ] Phase 17 / ML Observability extension
- [ ] Google Calendar OAuth bidireccional en Tareas
- [ ] Studio Wave 1.5
- [ ] Web Push API real para canal push (Phase 8)
- [ ] Chat file attachments (imágenes, planos)
- [ ] Argumentario: feedback loop (asesor califica respuesta)
- [ ] Trust Score público en cards/listados de asesor en marketplace
- [ ] DISC matching: comprador-asesor pairing por compatibilidad

## Bugs diferidos
- Issue 1: Phase 4 Batch 1 UI elements not rendering in DOM (`bulk-upload-btn`) — DEFERRED by user to H1 sweep
- Issue 2: Playwright screenshot runner drops session state for deeply nested routes — BLOCKED (recurrence 12x)
- External scraper HTTP 403 targets (Inmuebles24) — handled as "Source no soportado"

## Completado — Batch 32
- 1 router asesor_identity (13 endpoints) ✅
- 4 services backend (endorsements, linkedin_import, trust_score, disc_test) ✅
- 4 colecciones MongoDB nuevas ✅
- 7 frontend components + 2 pages (asesor own + public profile) ✅
- API helper asesor_identity.js (13 helpers) ✅
- DISC 7-question wizard + Claude Haiku narrative ✅
- Trust Score 6-component formula + 4h cache + invalidate hooks ✅
- Endorsement email confirm flow ✅ (token → 302 redirect → verified)
- WhatsAppAsesorCTA extended con link al perfil público ✅
- yarn build limpio · ruff/eslint 0 issues ✅
- Mapbox token actualizado · B31 traffic ahora `source=live` ✅

## Completado — Batch 31
- Briefing Tráfico+Clima `/asesor/briefing` ✅
- Argumentario AI RAG con FAB global "AI" en todas las páginas asesor ✅
- 32 KB entries semilla en 4 categorías ✅
- 6 endpoints nuevos · 4 colecciones MongoDB nuevas ✅

## Completado — Batch 29
- Smart Alerts (push/email/WA stub) — 4 types × 3 channels
- Comparador Premium buyer tier — 5 métricas (sparkline, momentum, heat, ROI, plusvalía 5y)
- Chat Asesor In-App — polling 30s, mark-read bidireccional, unread badge sidebar
- Build limpio ✅ · 14 endpoints nuevos · 4 colecciones MongoDB nuevas
