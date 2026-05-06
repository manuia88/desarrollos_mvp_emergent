# DesarrollosMX — ROADMAP

## P0 — Phase 2 Comprador — COMPLETADO (Batches 28-30)
- Magic Link Auth, Dashboard, Favoritos, Historial, Privacidad LFPDPPP ✅
- Smart Alerts (4 tipos × 3 canales) ✅
- Comparador Premium buyer tier (5 métricas) ✅
- Chat Asesor In-App (polling 30s, mark-read bidireccional) ✅
- Wrapped Mensual/Anual estilo Spotify ✅
- Smart Match Widget (reusa colonia_quiz.match_colonias) ✅

## P0 — Phase 3 Asesor Tools — EN PROGRESO (Batch 31 ✅)
- Briefing Tráfico+Clima (Mapbox + Open-Meteo, cache 15min, fallback graceful) ✅
- Argumentario AI RAG (Claude Sonnet 4.5 + 32 KB entries + drawer global FAB) ✅
- [ ] Verificar token Mapbox con permisos Directions API (actualmente 403 → opera en `estimated`)

## P1 — Próximas tareas
- [ ] Phase 7.10: Tab Avance de Obra (integración progreso construcción en fichas proyecto)
- [ ] WhatsApp Business real integration (`whatsapp-web.js` + Caya UI) — ya hay stubs en buyer_alerts
- [ ] Briefing tráfico: integrar dentro de fichas de proyecto (auto-fill destination del project)
- [ ] Argumentario: ampliar KB con casos de éxito reales del equipo

## P2 — Backlog
- [ ] Microsoft OAuth Integration activation
- [ ] Phase 17 / ML Observability extension
- [ ] Google Calendar OAuth bidireccional en Tareas
- [ ] Studio Wave 1.5
- [ ] Web Push API real para canal push (Phase 8) — stub listo en buyer_alerts
- [ ] Chat file attachments (imágenes, planos) — schema listo en chat_messages
- [ ] Argumentario: feedback loop (asesor califica respuesta → entrenar prompt)

## Bugs diferidos
- Issue 1: Phase 4 Batch 1 UI elements not rendering in DOM (`bulk-upload-btn`) — DEFERRED by user to H1 sweep
- Issue 2: Playwright screenshot runner drops session state for deeply nested routes — BLOCKED (recurrence 12x)
- External scraper HTTP 403 targets (Inmuebles24) — handled as "Source no soportado"
- Issue 3: MAPBOX_TOKEN actual retorna 403 en Directions API — fallback graceful operativo, requiere token con permisos correctos

## Completado — Batch 31
- Briefing Tráfico+Clima `/asesor/briefing` ✅
- Argumentario AI RAG con FAB global "AI" en todas las páginas asesor ✅
- 32 KB entries semilla en 4 categorías ✅
- 6 endpoints nuevos · 4 colecciones MongoDB nuevas ✅
- yarn build limpio · ruff/eslint 0 issues ✅

## Completado — Batch 29
- Smart Alerts (push/email/WA stub) — 4 types × 3 channels
- Comparador Premium buyer tier — 5 métricas (sparkline, momentum, heat, ROI, plusvalía 5y)
- Chat Asesor In-App — polling 30s, mark-read bidireccional, unread badge sidebar
- Build limpio ✅ · 14 endpoints nuevos · 4 colecciones MongoDB nuevas
