# DesarrollosMX — CHANGELOG

## Batch 29 — Phase 2 Comprador Engagement (2026-05-06)

### Sub-A: Smart Alerts
- **NEW** `backend/services/buyer_alerts.py` — evaluate_alerts, trigger_alert (email/push/WA stub), register_match_handler
- **NEW** `backend/routes_buyer_alerts.py` — 5 endpoints CRUD + deliveries (auth buyer)
- **NEW** `backend/scheduler_buyer_alerts.py` — APScheduler: instant 5min, daily 8am, weekly Mon 8am
- **NEW** `frontend/api/buyer_alerts.js` — helpers fetch
- **NEW** `frontend/components/comprador/AlertSettingsForm.js` — form tipo/canal/condiciones/frecuencia
- **NEW** `frontend/pages/comprador/CompradorAlertas.js` — tabs Activas + Historial, modal nueva alerta
- **EDIT** `CompradorLayout.js` — nav item "Alertas"
- **EDIT** `App.js` — ruta /comprador/alertas

### Sub-B: Comparador Premium
- **EDIT** `backend/services/colonia_comparator.py` — param buyer_tier='public'|'buyer'|'asesor' + 5 métricas premium
- **NEW** `backend/routes_comprador_compare.py` — POST /api/comprador/compare + /pdf (auth buyer)
- **EDIT** `frontend/api/marketplace.js` — compareEntitiesBuyer + downloadComparePdfBuyer
- **EDIT** `frontend/pages/public/ColoniaComparator.js` — PremiumSections (Sparklines, Momentum, Heat, ROI)

### Sub-C: Chat Asesor In-App
- **NEW** `backend/services/chat_engine.py` — start_thread (idempotente), send_message, get_unread_count, mark_thread_read
- **NEW** `backend/routes_chat.py` — 6 endpoints (threads CRUD + messages + read + unread count)
- **NEW** `frontend/api/chat.js` — helpers fetch
- **NEW** `frontend/components/comprador/ChatComposer.js` — textarea Enter envía / Shift+Enter salto
- **NEW** `frontend/components/comprador/ChatThread.js` — burbujas buyer/asesor + polling 30s + auto-scroll
- **NEW** `frontend/pages/comprador/CompradorChat.js` — layout split 320px threads + ChatThread
- **EDIT** `CompradorLayout.js` — nav item "Chat" con badge unread count (poll 30s)
- **EDIT** `UnitDrawerContent.js` — DrawerSection "Chat con comprador" para asesor (ChatSection)
- **EDIT** `App.js` — ruta /comprador/chat

### i18n + infrastructure
- **EDIT** `i18n/locales/es-MX/common.json` — strings comprador.alerts.* + comprador.chat.* + compare_premium.*
- **EDIT** `server.py` — registra 3 routers + buyer_alerts scheduler + indexes
- **EDIT** `icons/index.js` — añade `Send` SVG icon
- **FIX** `UnitDrawerContent.js` — hook rules violation (useInlineSaver after conditional return)

---

## Batch 28 — Phase 2 Comprador Foundations (2026-05)
- Magic Link Auth (Resend), Comprador Dashboard layout, Buyer Favorites, Buyer History, LFPDPPP Privacy Center
- 83/83 tests passing

## Batch 27 — Mortgage Calculator + Colonia History + Share OG (2026-05)
- Infonavit/Fovissste/Banca mortgage calc, Claude Sonnet colonia history, WhatsApp Asesor CTA, PIL og:image

## Batch 26 — Marketplace Lead Capture Tools (2026-05)
- Colonia Report PDF, Colonia Quiz, ColoniaComparator page

## Batch 24-25 — Mapa Intelligence + Saved Searches (2026-04)
- Heatmaps, Colonia profiles, Image AI search, External parsers, Saved searches + email alerts

## Batch 1-23 — Developer Portal (2026-01 to 2026-04)
- Full developer CRM: Units, Leads, Canales, AI pricing, OAuth Calendar, Caya, RAG, ML, etc.
