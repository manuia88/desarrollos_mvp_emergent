# DesarrollosMX — ROADMAP

## P0 — Phase 2 Comprador — COMPLETADO (Batches 28-30)
- Magic Link Auth, Dashboard, Favoritos, Historial, Privacidad LFPDPPP ✅
- Smart Alerts (4 tipos × 3 canales) ✅
- Comparador Premium buyer tier (5 métricas) ✅
- Chat Asesor In-App (polling 30s, mark-read bidireccional) ✅
- Wrapped Mensual/Anual estilo Spotify ✅
- Smart Match Widget (reusa colonia_quiz.match_colonias) ✅

## P1 — Próximas tareas
- [ ] Phase 7.10: Tab Avance de Obra (integración progreso construcción en fichas proyecto)
- [ ] WhatsApp Business real integration (`whatsapp-web.js` + Caya UI) — ya hay stubs en buyer_alerts

## P2 — Backlog
- [ ] Microsoft OAuth Integration activation
- [ ] Phase 17 / ML Observability extension
- [ ] Google Calendar OAuth bidireccional en Tareas
- [ ] Studio Wave 1.5
- [ ] Web Push API real para canal push (Phase 8) — stub listo en buyer_alerts
- [ ] Chat file attachments (imágenes, planos) — schema listo en chat_messages

## Bugs diferidos
- Issue 1: Phase 4 Batch 1 UI elements not rendering in DOM (`bulk-upload-btn`) — DEFERRED by user to H1 sweep
- Issue 2: Playwright screenshot runner drops session state for deeply nested routes — BLOCKED (recurrence 11x)
- External scraper HTTP 403 targets (Inmuebles24) — handled as "Source no soportado"

## Completado — Batch 29
- Smart Alerts (push/email/WA stub) — 4 types × 3 channels
- Comparador Premium buyer tier — 5 métricas (sparkline, momentum, heat, ROI, plusvalía 5y)
- Chat Asesor In-App — polling 30s, mark-read bidireccional, unread badge sidebar
- Build limpio ✅ · 14 endpoints nuevos · 4 colecciones MongoDB nuevas
