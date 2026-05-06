# DesarrollosMX — CHANGELOG

## Batch 32 — Phase 4 Asesor Identity (2026-05-06)

### Sub-A: Endorsements + LinkedIn Import
- **NEW** `backend/services/endorsements.py` — create_endorsement (con email Resend confirmation patrón B25), confirm_endorsement (idempotente), get_asesor_endorsements (avg + count verified), delete_endorsement; rate limit 3/email/asesor (HTTP 429); verifica asesor existe; log_activity B14.
- **NEW** `backend/services/linkedin_import.py` — modo manual stub (LinkedIn API requiere partnership, OAuth defer Phase 8); valida URL `/in/usuario`; profile_data: full_name, headline, photo_url, years_experience, certifications[], education[], current_company; recompute trust en import.
- **NEW** `frontend/components/asesor/EndorsementsCard.js` — avg rating big number (gradient text) + stars + "Basado en N reseñas verificadas"; expand 3↔todos; modo asesorOwn=true permite borrar; modo canSubmit=true muestra botón "Deja una reseña" → form inline (nombre, email, rating estrellas clickables, texto) → confirmation success state.
- **NEW** `frontend/components/asesor/LinkedInImportModal.js` — modal con URL + 7 form fields manuales; helper text explicando OAuth defer Phase 8; revoke button; pre-llena si ya importado.

### Sub-B: Trust Score + DISC Test
- **NEW** `backend/services/trust_score.py` — formula 6-component cap 100: experience (25, years*5), deals (30, deals/100*30), endorsements (25, avg*count/10), response_time (15, max(0,20-rt)), certifications (5, count*2), disc_bonus (+5); cache 4h en `db.asesor_trust_scores`; invalidate hooks en endorsement/disc/linkedin; tz-safe datetime handling.
- **NEW** `backend/services/disc_test.py` — 7 preguntas force-choice 4-dim weight matrix; scoring normalizado 0-100; primary letter; Claude Haiku 4.5 narrative ≤80 palabras es-MX; cost-gated.
- **NEW** `frontend/config/discQuestions.js` — 7 preguntas frontend (sincronizadas con backend q_id) + PRIMARY_LABELS + PRIMARY_COLORS.
- **NEW** `frontend/components/asesor/DiscTestModal.js` — wizard 7-step con progress bar + auto-advance + result card (letter big colorida + bars D/I/S/C + Claude narrative + "Volver a tomar").
- **NEW** `frontend/components/asesor/TrustScoreBadge.js` — ring SVG cosine animation 0-100; color verde>80 / ámbar 60-80 / gris<60; click → modal breakdown 6 components con bars horizontales.

### Pages + Wiring
- **NEW** `backend/routes_asesor_identity.py` — 1 router · 13 endpoints (5 públicos + 8 asesor auth):
  - Public: POST endorsements, GET confirm/{token} (302 redirect), GET asesor/{id}/endorsements, GET asesor/{id}/profile (compose), GET asesor/{id}/trust-score
  - Auth: POST/GET/DELETE linkedin, POST/GET/DELETE disc, GET trust-score/me, GET/DELETE endorsements/me
- **NEW** `frontend/api/asesor_identity.js` — 13 helpers fetch.
- **NEW** `frontend/pages/asesor/AsesorPerfil.js` — `/asesor/perfil` auth: TrustScoreBadge 120px + 4 stat cards + LinkedIn preview + DISC summary + EndorsementsCard owner mode + 2 modals.
- **NEW** `frontend/pages/public/PerfilAsesor.js` — `/asesor-publico/:id` público sin auth: hero (foto LinkedIn o initial gradient) + nombre + headline + DISC pill colored + TrustScoreBadge + CTA WhatsApp + Sobre mí (años, certs, education, narrative DISC) + EndorsementsCard canSubmit=true + Proyectos cerrados grid; banner "?confirmed=true" success.
- **EDIT** `backend/server.py` — registra router + ensure indexes (4 colecciones B32) en startup.
- **EDIT** `backend/services/asesor_metrics.py` — extend snapshot dict con field `trust_score` (lookup db.asesor_trust_scores).
- **EDIT** `frontend/components/marketplace/WhatsAppAsesorCTA.js` — añade prop `asesorId` + chip "Ver perfil del asesor" → `/asesor-publico/{id}`.
- **EDIT** `frontend/App.js` — rutas /asesor/perfil + /asesor-publico/:id.
- **EDIT** `frontend/config/navByRole.js` — sidebar asesor item "Mi perfil" con icon Shield.
- **EDIT** `frontend/i18n/locales/es-MX/common.json` — keys asesor.perfil/.endorsements/.disc/.trust_score/.public_profile.

### DB Schemas
- `db.asesor_endorsements` — `{endorsement_id, asesor_id, client_email, client_name, rating 1-5, text, project_id?, project_name, verified, confirmation_token, created_at, ip_hash, verified_at?}`
- `db.asesor_linkedin_profiles` — `{asesor_id (PK), linkedin_url, profile_data{...}, import_method, oauth_available, last_synced_at}`
- `db.asesor_trust_scores` — `{asesor_id (PK), score 0-100, components{6 fields}, last_computed, ttl_minutes 240}`
- `db.asesor_disc_profiles` — `{asesor_id (PK), answers[7], result{D,I,S,C,primary}, narrative_text, completed_at}`

### Endpoints curl-tested OK
- `POST /api/public/endorsements` ✅ created · 4ª request → HTTP 429 rate limit
- `GET /api/public/endorsements/confirm/{token}` ✅ HTTP 302 → `/asesor-publico/{id}?confirmed=true`
- `GET /api/public/asesor/{id}/profile` ✅ compose: asesor + linkedin + endorsements + trust + disc + projects
- `POST /api/asesor/linkedin/import` ✅ profile guardado · trust score recompute
- `POST /api/asesor/disc/submit` (7 'a' answers) ✅ result D=100, primary=D, narrative Claude Haiku generada
- `GET /api/asesor/trust-score/me?force=true` ✅ score 50 con 6 components calculados

### MAPBOX TOKEN actualizado
- Nuevo token con permisos Directions activo · `/api/asesor/briefing/traffic` retorna `source=live`, `is_stale=false`, traffic_minutes con datos reales (24 min Roma → Polanco, 4.92 km).

### Build
- `yarn build` — limpio, 0 warnings nuevos
- `ruff` — 0 issues
- `eslint` — 0 issues

---

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
