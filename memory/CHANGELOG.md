# DesarrollosMX — CHANGELOG

## Batch 31 — Phase 3 Asesor Tools (2026-05-06)

### Sub-A: Briefing Tráfico + Clima
- **NEW** `backend/services/traffic_briefing.py` — Mapbox Directions (driving-traffic) + Open-Meteo weather; cache 15 min en `db.traffic_briefings_cache`; fallback graceful Haversine + `last_known` con flag `is_stale=true` cuando Mapbox falla.
- **NEW** `backend/routes_briefing_traffic.py` — `POST /api/asesor/briefing/traffic`, `GET /api/asesor/briefing/traffic/recent`. Persiste log en `db.traffic_briefings_log` (asesor_id, source, is_stale).
- **NEW** `frontend/components/asesor/TrafficBriefingWidget.js` — coords inputs + 3 presets CDMX/GDL, badge minutos con gradient, banner is_stale, weather card.
- **NEW** `frontend/pages/asesor/AsesorBriefingTraffic.js` — `/asesor/briefing` página con widget + tips.
- **EDIT** `App.js` — ruta `/asesor/briefing`.
- **EDIT** `config/navByRole.js` — nav item "Tráfico+Clima" en grupo Operación del asesor.
- **NOTA**: el token MAPBOX en `.env` retornó HTTP 403 en pruebas (token con restricciones de URL/permisos), por lo que el sistema opera en modo `estimated` con fallback Haversine. Cuando se actualice el token con permisos Directions, el campo `source` cambiará a `live` y `is_stale=false` automáticamente.

### Sub-B: Argumentario AI RAG (coach inline)
- **NEW** `backend/services/argumentario_rag.py` — embeddings deterministas 1536-dim (feature hashing, mismo patrón B25/image_embeddings); cosine similarity top-K; Claude Sonnet 4.5 RAG generator (≤180 palabras, es-MX, sin emojis, formato markdown ligero).
- **NEW** `backend/services/argumentario_seed.py` — 32 entradas KB en 4 categorías: 10 objeciones, 8 cierres, 6 comparaciones, 8 producto.
- **NEW** `backend/routes_argumentario.py` — 4 endpoints: `POST /query`, `GET /recent`, `GET /kb`, `POST /seed` (admin).
- **NEW** `frontend/components/shared/ArgumentarioDrawer.js` — drawer lateral right-slide, chips por categoría, sugerencias, recientes, resultado markdown con chips kb_sources + similarity_pct.
- **NEW** `frontend/api/asesor.js` — helpers fetch (briefing + argumentario).
- **EDIT** `frontend/components/advisor/AdvisorLayout.js` — FAB "AI" global (rounded-full, gradient), inserta `<ArgumentarioDrawer />` en cualquier vista de asesor.
- **EDIT** `backend/server.py` — registra routers + ensure indexes + seed_kb_if_empty en startup.

### DB Schema
- `db.traffic_briefings_cache` — `{key, briefing_id, origin, destination, traffic_minutes, distance_km, route_geometry, weather, is_stale, source, cached_at, ttl_minutes}`
- `db.traffic_briefings_log` — `{asesor_id, briefing_id, project_id, is_stale, source, ts}`
- `db.argumentario_knowledge` — `{kb_id, category, title, content, tags, embedding(1536-dim), created_at}`
- `db.argumentario_queries` — `{query_id, asesor_id, question, category, response_markdown, kb_sources, created_at}`

### Endpoints curl-tested OK
- `POST /api/asesor/briefing/traffic` → respuesta con minutos + clima + is_stale
- `GET  /api/asesor/briefing/traffic/recent` → log ordenado descendente
- `POST /api/asesor/argumentario/query` → Claude Sonnet 4.5 generó respuesta 4-bloques markdown citando 3 KB sources
- `GET  /api/asesor/argumentario/kb?category=objeciones&limit=3` → 3 entradas
- `GET  /api/asesor/argumentario/recent` → consultas previas

### Build
- `yarn build` — limpio, 0 warnings nuevos
- `ruff` — 0 issues
- `eslint` — 0 issues

---

## Batch 30 — Phase 2 Comprador Wrapped + Smart Match (2026-05-06)

### Sub-A: Wrapped Mensual Automático + Anual Opt-in
- **NEW** `backend/services/wrapped_generator.py` — generate_monthly_wrapped (Claude Haiku), generate_annual_wrapped (Claude Sonnet), generate_bulk_monthly (scheduler), _notify_wrapped_ready (Resend email)
- **NEW** `backend/routes_wrapped.py` — 5 endpoints: list, get/generate on-demand, annual-optin, share, og-image, smart-match
- **NEW** `backend/scheduler_wrapped.py` — APScheduler: 1ro mes 6am mensual + 1 diciembre opt-in anual
- **NEW** `frontend/api/wrapped.js` — fetch helpers
- **NEW** `frontend/pages/comprador/CompradorWrapped.js` — 7 storytelling cards estilo Spotify Wrapped (hero, views sparkline, top zona, precio, actividad, narrativa IA, CTA share/anual)
- **EDIT** `CompradorLayout.js` — nav item "Tu Wrapped" condicional (solo si ≥1 wrapped) + badge NUEVO si unviewed

### Sub-B: Smart Match Widget + Sparklines Real Toggle
- **NEW** `backend/services/smart_match.py` — compute_buyer_match_score (reusa colonia_quiz.match_colonias), cache 24h en db.smart_match_cache, invalidate_smart_match_cache
- **EDIT** `services/colonia_comparator.py` — PRICE_HISTORY_REAL_DATA toggle (env var, default=false, forward-compat sin romper B29)
- **EDIT** `.env.example` — PRICE_HISTORY_REAL_DATA=false
- **NEW** `frontend/components/comprador/SmartMatchWidget.js` — match ring SVG, top 3 favoritos con match_pct + reasons collapsible, CTA quiz si no hay data
- **EDIT** `frontend/pages/comprador/CompradorDashboard.js` — SmartMatchWidget como 5to widget
- **EDIT** `App.js` — rutas /comprador/wrapped + /comprador/wrapped/:yearMonth
- **EDIT** `icons/index.js` — añade `Award` SVG icon
- **EDIT** `common.json` — strings comprador.wrapped.* + comprador.smartMatch.*

---

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
