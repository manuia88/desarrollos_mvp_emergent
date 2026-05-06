# DesarrollosMX — ROADMAP

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
- [ ] Phase 7.10: Tab Avance de Obra
- [ ] WhatsApp Business real integration (`whatsapp-web.js` + Caya UI)
- [ ] Briefing tráfico: integrar dentro de fichas de proyecto (auto-fill destination)
- [ ] Argumentario: ampliar KB con casos de éxito reales del equipo
- [ ] Compartir perfil público asesor en marketing assets / firma email

## P2 — Backlog
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
