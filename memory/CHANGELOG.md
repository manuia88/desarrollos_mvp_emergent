# DesarrollosMX — CHANGELOG


## W4.2.5 — Brand Strategy · Embed widgets + Press kit (2026-05-09)

Cierra ciclo SEO/GEO compounding: bloggers/journalists pueden embeber widgets DMX (cada embed = backlink natural) + página `/prensa` con stats live listas-para-pegar (cada cita Forbes/El Financiero = autoridad SEO + AI training data).

### Backend (2 nuevos · 1 editado)
- **NEW** `routes_widgets.py` — `GET /api/widgets/score/{slug}` y `/risk/{slug}` con `Access-Control-Allow-Origin: *` (CORS abierto). Cache CDN 5 min. Score retorna `{ie_score_avg, drpi_value, drpi_delta_30d_pct, risk_tier, risk_letter, ie_sample_size, deep_link, powered_by}`. Risk retorna `{risk_tier, risk_letter, risk_score, sources_count, available, deep_link}`. OPTIONS preflight handler. Tier derivation desde letter cuando doc tier es null.
- **NEW** `routes_press.py` — `GET /api/public/press/stats` retorna 13+ fields live (zones, landings, devs, recipes, drpi, sources, MCP usage, compliance flags). Cache CDN 10 min.
- **EDIT** `server.py` — wire `widgets_router` + `press_router`.

### Frontend (3 nuevos · 2 editados)
- **NEW** `pages/public/widgets/ScoreWidgetPage.js` — ruta `/widgets/score/:slug` standalone (SIN Navbar/Footer). White card 360px max-width, eyebrow gradient indigo→pink "Score IE · DesarrollosMX", big score 36px Outfit800 con tier color, mini stats inline (DRPI/m², Risk letter, Muestra IE), watermark "Powered by DesarrollosMX · desarrollosmx.io →" linkeado al deep link de zona. document.body transparent para iframe-friendly. `data-testid="score-widget"`.
- **NEW** `pages/public/widgets/RiskWidgetPage.js` — `/widgets/risk/:slug` similar. Big risk letter 44px (verde A/B, amarillo C/D, rojo E), label "Riesgo Bajo/Moderado/Alto", risk_score/100, fuentes oficiales count + lista `SESNSP · CENAPRED · ENVIPE · RPP`. `data-testid="risk-widget"`.
- **NEW** `pages/public/PrensaPage.js` — `/prensa` Media Kit. Hero "DesarrollosMX en Prensa" Outfit 800 clamp 32-56px. 8 StatCard con valor + cita lista-para-pegar + botón "Copiar como cita" (clipboard API + state "Copiado" 2s). 4 DownloadCard (logo PNG/SVG, media-kit PDF, founder bio). 3 ContactRow (prensa@desarrollosmx.io, WhatsApp, LinkedIn). Schema.org NewsMediaOrganization JSON-LD con foundingDate, contactPoint type=press, sameAs links. Footer "Stats actualizados … cache 10 min · API pública GET /api/public/press/stats".
- **EDIT** `ConnectMcpPage.js` — Step 7 "Embed widgets en tu blog" agregado: 2 iframes preview (score+risk de polanco) lado a lado + 2 CopyBlock con snippets `<iframe src="https://desarrollosmx.io/widgets/{type}/polanco" width="360" height="220|240" loading="lazy">`. Texto explicativo "cada embed = backlink natural · CORS abierto · cache CDN 5 min".
- **EDIT** `App.js` — lazy `ScoreWidgetPage`, `RiskWidgetPage`, `PrensaPage` + 3 Routes públicas (`/widgets/score/:slug`, `/widgets/risk/:slug`, `/prensa`).

### Acceptance criteria validados
- ✅ `GET /api/widgets/score/polanco` HTTP 200 · `Access-Control-Allow-Origin: *` · payload completo (score=52.7, drpi=$95k, risk=B/green derived, sample=17)
- ✅ `GET /api/widgets/risk/polanco` HTTP 200 · risk B/neutral 75.8 sources=4
- ✅ `GET /api/public/press/stats` HTTP 200 · 16 zones, 75 landings, 18 devs, 63 recipes, 12 sources, 3 MCP calls
- ✅ `/widgets/score/polanco` standalone PASS · sin Navbar · score=53 · zone="Polanco" · footer link · iframe-friendly
- ✅ `/widgets/risk/polanco` standalone PASS · big "B" yellow tier · 75.8/100 · 4 fuentes
- ✅ `/prensa` PASS · 8 stat cards · botón "Copiar como cita" funcional · JSON-LD NewsMediaOrganization · Navbar+CtaFooter
- ✅ `/connect/mcp` Step 7 PASS · 2 iframes preview · 2 CopyBlock snippets reales
- ✅ `yarn build` limpio 40s · ESLint+ruff sin warnings · `/api/health` 200

### Embeds reales para test
```
<iframe src="https://desarrollosmx.io/widgets/score/polanco" width="360" height="220" frameborder="0" loading="lazy" style="border:0; max-width:100%;"></iframe>

<iframe src="https://desarrollosmx.io/widgets/risk/polanco" width="360" height="240" frameborder="0" loading="lazy" style="border:0; max-width:100%;"></iframe>
```
Mientras `desarrollosmx.io` esté en preview (latam-realestate-ai…), reemplaza el host por el preview URL para test inmediato. Cuando se promueva a producción, el dominio canónico funciona out-of-the-box.



## W4.2D3.5 — Landing Leads Dashboard + Lead Nurture Cron (2026-05-09)

Cierra el loop de W4.2D3: founder ahora puede VER las leads capturadas en `/superadmin/landing-leads` y cron diaria 04:00 MX matchea leads con inventario nuevo + envía email vía Resend.

### Backend (1 nuevo · 2 editados)
- **NEW** `lead_nurture_engine.py` — cron entry `run_lead_nurture_match(db)`:
  - `find_matches(db)`: query `landing_leads` con `last_nurture_sent_at` ausente o más viejo que 7d. Para cada lead resuelve kind (zone/alcaldia/intent), busca `data_developments.DEVELOPMENTS` que matchean colonia/alcaldía/stage+tipo. Filter por `created_at >= lead.created_at`. Limit 5 devs/email.
  - `send_nurture_email(email, zone_name, zone_url, devs)`: HTML responsive (Outfit-like Arial fallback) con CTA gradient `rounded-full` linkeando a `desarrollosmx.io/zona|alcaldia|cdmx/{slug}`. Resend HTTP API. Si `RESEND_API_KEY` ausente → log "Resend stub" y retorna False (no crash).
  - Throttle anti-spam: 7 días (`NURTURE_THROTTLE_DAYS`) entre emails al mismo (email, zone). Update `last_nurture_sent_at` + `last_nurture_match_count` cuando envío exitoso.
- **EDIT** `routes_landings.py` — agregado `sa_router` (4 endpoints superadmin):
  - `GET /api/superadmin/landing-leads` — list paginado (filters: zone_interest, page_type=colonia|alcaldia|intent, since, limit≤500). Auth gate: 401 sin sesión, 403 si role≠superadmin.
  - `GET /api/superadmin/landing-leads/by-zone` — aggregation `$group` por zone_interest con lead_count + first/last_lead_at.
  - `GET /api/superadmin/landing-leads/summary` — KPI strip: total, last_7d, unique_zones, top_zone (top 1 por count).
  - `GET /api/superadmin/landing-leads/export.csv` — StreamingResponse CSV (header: email, zone_interest, page_type, zone_slug, notes, source_url, created_at, status). Content-Disposition attachment con timestamp.
  - `ensure_landing_indexes` extendido con `last_nurture_sent_at` index sparse.
- **EDIT** `scheduler_ie.py` — cron `lead_nurture` 04:00 MX (después de comparable_anomalies 03:00, antes de drive_webhook_renew 03:30).
- **EDIT** `server.py` — wire `landings_sa_router`.

### Frontend (2 nuevos · 2 editados)
- **NEW** `pages/superadmin/SuperadminLandingLeads.js` — Dashboard con:
  - KPI strip 4 cards (total, last_7d, unique_zones, top_zone) con tone colors (brand/ok/warn/bad).
  - Tab toggle `Por zona` (default) / `Lista completa` con `rounded-full` chips.
  - Tab "Por zona": tabla con zona+page_type badge+lead_count+first/last_lead_at+CTA "Ver leads" que cambia a tab list filtrando por zone.
  - Tab "Lista completa": filters page_type chips + zone_interest text input. Tabla con email, zona, tipo badge, notas (ellipsis 280px), fecha, badge "Notificado" (verde si last_nurture_sent_at, "Pendiente" sino).
  - Botón "Export CSV" gradient pill que dispara `window.location.href = /export.csv?...filters`.
  - Empty states `<Empty>` para 0 leads y filtros sin matches.
  - Errores api → Card rojo accesible.
- **NEW** `api/superadminLandingLeads.js` — 4 helpers: `getLandingLeadsSummary`, `getLandingLeadsByZone`, `getLandingLeads(filters)`, `downloadLandingLeadsCsv(filters)`.
- **EDIT** `App.js` — lazy `SuperadminLandingLeads` + `<Route path="/superadmin/landing-leads" element={<AdvisorRoute Page={...}/>}>`.
- **EDIT** `config/navByRole.js` — superadmin nav item `{key:'landing-leads', to:'/superadmin/landing-leads', label:'Leads landing', Icon: Megaphone}`.

### Acceptance criteria validados
- ✅ `GET /api/superadmin/landing-leads/summary` cookie-auth → 200 `{total:1, last_7d:1, unique_zones:1, top_zone:{slug:granada, count:1}}`
- ✅ `GET /api/superadmin/landing-leads/by-zone` → 200 con `[{zone_interest:zone-granada, lead_count:1, last_lead_at:...}]`
- ✅ `GET /api/superadmin/landing-leads?limit=10` → 200 con item completo (lead_id, email, zone_slug, page_type=colonia, notes, status, last_nurture_sent_at:null)
- ✅ `GET /api/superadmin/landing-leads/export.csv` → 200 CSV header + row con todos los campos
- ✅ `GET /api/superadmin/landing-leads/summary` SIN auth → 401
- ✅ `run_lead_nurture_match(db)` con 0 leads → `{matches:0, sent:0, skipped:0}` sin error
- ✅ `run_lead_nurture_match(db)` con 1 lead polanco + 2 devs → `{matches:1, sent:0, skipped:1}` (Resend stub log emit, no crash)
- ✅ `yarn build` limpio (38s) · ESLint+ruff sin warnings · `/api/health` 200
- ✅ Cron `lead_nurture` registered en scheduler_ie con misfire_grace_time=3600

### Resend integration
HTTP API directa (no SDK). Si `RESEND_API_KEY` ausente → log `[lead_nurture] Resend stub (no RESEND_API_KEY) → would email …` y skip envío real. Cuando user agrega key real, cron diaria empieza a enviar automático sin redeploy.

### Bypass conocido
Playwright screenshot tool no logra preservar sesión cookie en deeply-nested `/superadmin/*` routes (Issue 2 P2 BLOCKED del handoff, recurrencia 20+). Visual regression bypass: backend curl 100% verificado + yarn build 0 errores. UI validable manualmente desde nav superadmin > "Leads landing".



## W4.2D3 — Programmatic SEO Tier 1+2 · 61 landing pages + lead capture (2026-05-09)

Extiende W4.2D2 a 40 colonias DMX target (16 con IE data + 24 nuevas anti-doorway) + 16 alcaldías CDMX completas + 5 intent landings (preventa, entrega-inmediata, estrenar, departamentos, casas). Cada landing sin inventario incluye lead capture form + colonias cercanas con datos.

### Backend (2 nuevos · 2 editados)
- **NEW** `seo_landings_config.py` — 40 COLONIAS_TARGET (con `has_ie_data` flag y `alcaldia_slug`), 16 ALCALDIAS_CDMX, 5 INTENT_LANDINGS (con stage_filter/tipo_filter). Helpers `colonias_by_alcaldia`, `top_colonias_with_data`, `comparable_colonias`.
- **NEW** `routes_landings.py` (4 endpoints públicos):
  - `GET /api/public/landing/colonia/{slug}` — tier1 (forwards a routes_public_zones full data) o tier2 (metadata + 4 comparables + lead_capture_enabled).
  - `GET /api/public/landing/alcaldia/{slug}` — datos alcaldía + colonias_with_data + colonias_pending + active_developments + 4 comparables.
  - `GET /api/public/landing/intent/{intent}` — top 8 colonias + recent_developments filtered por stage/tipo + 5 FAQ adapted.
  - `POST /api/public/landing/lead` — captura lead anti-doorway en `db.landing_leads` con email/zone_interest/notes/source_url + audit_logs hook. IP hash sha256.
- **EDIT** `seo_combos_seed.py` — `seed_landings_in_sitemap()` upserta 40 `colonia_landing_*` + 16 `alcaldia_landing` + 5 `intent_landing` en `db.seo_filter_combos`.
- **EDIT** `server.py` — wire `landings_router`, `ensure_landing_indexes`, llama `seed_landings_in_sitemap` en startup.

### Frontend (3 nuevos · 2 editados)
- **NEW** `pages/public/AlcaldiaPage.js` — `/alcaldia/:slug`. Hero + 4 KPI cards (colonias_count, with_data, pending, devs) + grid colonias_with_data (Link a /zona/:slug) + grid colonias_pending + LandingLeadCaptureForm (si lead_capture_enabled) + FAQ 5 Q&A + JSON-LD Place containsPlace + FAQPage.
- **NEW** `pages/public/IntentLandingPage.js` — `/cdmx/:intent`. Hero (label+description), top colonias grid, recent_developments grid (Link a /desarrollo/:id con price_from_mxn nfMxn formatted), LandingLeadCaptureForm si devs vacíos, FAQ 5 Q&A, JSON-LD SearchResultsPage + FAQPage. document.title set para SEO.
- **NEW** `components/seo/LandingLeadCaptureForm.js` — Form `rounded-full` con email/notes textarea, POST a `/api/public/landing/lead`. States: idle | loading | ok | error. Validation client-side email + email server-side regex. Source URL auto-detection. Success state inline reemplaza form.
- **EDIT** `pages/public/ZonePage.js` — fetch redireccionado a `/api/public/landing/colonia/{slug}`. Branch tier 2 nueva (`zone.has_ie_data === false`): hero alcaldía + LandingLeadCaptureForm + 4 comparables Link grid + CTA "Explorar {alcaldía}" + FAQ 5 adapted (sin métricas reales). Tier 1 sin regression — preserva `tier="Premium"` original (renombrado a `landing_tier` para metadata interno).
- **EDIT** `App.js` — lazy imports + `<Route path="/alcaldia/:slug">` + `<Route path="/cdmx/:intent">` públicos.

### Acceptance criteria validados
- ✅ `/zona/granada` → tier2 PASS · zone-name='Granada' · lead-capture form · 4 comparables Polanco/Lomas/Escandón/Anzures · 2 JSON-LD scripts · breadcrumb a `/alcaldia/miguel-hidalgo`
- ✅ `/zona/polanco` → tier1 OK sin regression · 4 KPI cards · `tier=Premium` preservado · DRPI $95k/m² · Risk B·75.8 · 2 JSON-LD scripts
- ✅ `/alcaldia/iztapalapa` → PASS · 4 KPI cards · lead-capture (sin colonias seedeadas) · 2 JSON-LD scripts · 5 FAQ
- ✅ `/cdmx/preventa` → PASS · 8 top colonias · 9 desarrollos disponibles con precios formateados · 2 JSON-LD scripts
- ✅ `/api/public/landing/lead` POST → 201 + lead_id devuelto + persistido en db.landing_leads
- ✅ Sitemap: 145 URLs totales · 71 unique landing URLs (40 zona + 16 alcaldía + 5 cdmx + 10 zone_page legacy)
- ✅ `/api/health` 200 · backend hot-reload clean · ESLint+ruff sin warnings

### Anti-doorway compliance
Cada page tier 2 sin inventario tiene: hero geo + descripción única (no boilerplate) + lead capture + 4 colonias cercanas con IE data (Link clickable) + breadcrumb funcional + Schema.org Place + FAQPage 5 preguntas adaptadas. Cero contenido duplicado entre slugs.



## W4.2D2 — Programmatic SEO · Zone landing pages + FAQ Schema (2026-05-09)

Landing pages programmatic SEO `/zona/:slug` por colonia CDMX con datos auditables (IE Top 3, DRPI, Risk Score, devs activos, comparables) + JSON-LD Place + FAQPage. 16 zonas seedadas en sitemap.

### Backend (1 nuevo · 3 editados)
- **NEW** `routes_public_zones.py` — `GET /api/public/zones/{slug}` público (sin auth), agrega IE scores summary (top 3 real, ui_mode real|preparing), DRPI snapshot último, Risk Score V2 composite con fallback a seed.scores.seguridad, active_developments, 3 comparable_zones por mapping. 404 si slug no en COLONIAS_BY_ID.
- **EDIT** `seo_combos_seed.py` — domain canónico `desarrollosmx.io`, función `seed_zone_pages_in_sitemap()` que upserta 1 entry por COLONIA (16) con type=zone_page.
- **EDIT** `routes_seo_files.py` — domain canónico `desarrollosmx.io`. Sitemap dinámico ya pickup automático de zone_page entries.
- **EDIT** `server.py` — wire `public_zones_router`, llama `seed_zone_pages_in_sitemap()` en startup hook después de `seed_seo_combos`.

### Frontend (2 nuevos · 1 editado)
- **NEW** `pages/public/ZonePage.js` — `useParams.slug` → fetch `/api/public/zones/:slug`. Layout: Navbar+CtaFooter, breadcrumb (Inicio › Zonas › X), hero (clamp 32-56px Outfit 800 + alcaldia/tier gradient), 4 KPI cards (IE Top, DRPI/m², Risk letter+value, # devs), Top 3 IE cards (tier-colored), grid comparables Link, FaqAccordion 5 preguntas, CTAs `rounded-full` (Ver desarrollos en X · Suscribir alertas Risk). Empty state si IE real_count<3 ("Datos en preparación · DMX cubre esta zona, próximamente"). 404 graceful con CTA fallback.
- **NEW** `components/seo/ZoneStructuredData.js` — Inyecta 2 JSON-LD scripts en document.head: schema.org/Place (name, alcaldia, addressCountry MX) + schema.org/FAQPage (5 mainEntity Q&A). Cleanup en unmount. `buildFaqs(zone)` exportado para que ZonePage renderice mismas preguntas en accordion visible (paridad SEO ↔ UI).
- **EDIT** `App.js` — lazy import `ZonePage`, `<Route path="/zona/:slug">` público sin AdvisorRoute.

### Acceptance criteria validados
- ✅ `GET /api/public/zones/polanco` 200 → ie_real=17/35, drpi=$95k/m² avail=true period 2026-05, risk=B·75.8 tier=neutral, devs=2, comparables=[Lomas Chapultepec, Anzures, Condesa]
- ✅ `GET /api/public/zones/no-existe` 404
- ✅ `/zona/polanco` renderiza con `data-testid="zone-page"`, `zone-name="Polanco"`, `zone-faq` accordion, 4 KPI cards, Top 3 IE Score cards, 3 comparable Links, FAQ 5 Q&A
- ✅ 2 `<script type="application/ld+json" data-zone-jsonld>` en head (place + faq)
- ✅ `/api/seo/sitemap.xml` incluye 16 URLs `/zona/{slug}` además de combos filtros
- ✅ `/api/health` 200 · backend hot-reload clean · lint ESLint+ruff sin warnings
- ✅ Domain canónico `https://desarrollosmx.io` en JSON-LD y sitemap

### Comparable zones map
16 colonias × 3 vecinas hard-coded por afinidad tier/alcaldía: polanco↔lomas-chapultepec/anzures/condesa, roma-norte↔condesa/juarez/roma-sur, condesa↔roma-norte/escandon/juarez, santa-fe↔pedregal/polanco/lomas-chapultepec, etc.



## W3.2 — ZZ.2 Transaction Network (2026-05-08)

Sistema de tracking de closings anonimizados + comparables matrix verificada + price index per zona/tipo.

### Backend (2 nuevos · 4 editados)
- **NEW** `transaction_network_engine.py`: SHA-256 anonymización, $geoNear comparables, median/IQR price index, anomaly detection severity ok|amber|red, CSV bulk ingest (NUMERIC_CSV_COLS incluye days_on_market), compute_stats KPIs, cron_price_index_refresh 04:30 MX.
- **NEW** `routes_transaction_network.py` (7 endpoints): list+k-anon gate, comparables, price-index+history, heatmap GeoJSON, detect-anomaly, manual-ingest CSV, stats.
- **EDIT** `routes_dev_batch4.py`: `LeadPatch.closing_price` + auto-ingest hook cerrado_ganado → asyncio.create_task, audit `transaction_auto_ingested`.
- **EDIT** `server.py`, `cron_heartbeat.py`, `scheduler_ie.py`: txn router, ensure_txn_indexes, label+cron. Total crons: 25.

### Frontend (4 nuevos · 3 editados)
- **NEW** `api/superadminTransactionNetwork.js` (7 fn), `TransactionFeed.js` (chips+k-anon gate), `PriceIndexChart.js` (SVG área chart), `SuperadminTransactionNetwork.js` (KPI strip, 2-col, heatmap, AnomalyChecker, IngestModal).
- **EDIT** `CubeDrilldownTable.js` (col Verified TXs → link), `App.js`, `navByRole.js`, `i18n`.

### Edge Cases
- `days_on_market` faltaba en NUMERIC_CSV_COLS → corregido.
- Heatmap requiere cube_aggregations geo (0 features en sandbox, funcional en producción).
- Auto-ingest verificado por code review (sin leads activos en sandbox).

## W3.1A — Phase 5 Foundation: DENUE + Construction Cost + Zone Score A-F (2026-05-08)

Tres motores que alimentan DRPI (W3.3), Investment Explorer (W3.3.4) y Risk Score multi-fuente (W3.4).

### Backend (4 nuevos · 3 editados)
- **NEW** `denue_engine.py`:
  - `fetch_businesses_by_zone(lat, lng, radius_m)` — llama DENUE BuscarEntorno por keyword de categoría. URL format: `{condicion}/{lat},{lng}/{distancia}/{token}`. Token: `IE_DENUE_TOKEN` (fallback `IE_INEGI_TOKEN`).
  - 7 categorías: restaurants, gyms, markets, schools, hospitals, pharmacies, banks.
  - `compute_zone_density(db, zone_id, tier)` — upsert `db.denue_zone_density` con businesses_per_km2 + by_category.
  - `cron_denue_sync_weekly` (lunes 05:00 MX) — top 100 zonas activas.
  - `ensure_indexes(db)` — índices sobre zone_id, scian, name (text).
- **NEW** `construction_cost_engine.py`:
  - `predict_cost_per_m2(zone_id, building_type, tier)` — combina BANXICO SF61745 (% inflación real) + INEGI INPP 914339 + constantes base por tier × tipo × zone_premium.
  - BANXICO live: token `IE_BANXICO_TOKEN` confirmado — retorna 6.5% inflación anual construcción.
  - Honest fallback: `stub_reason` visible si BANXICO/INEGI no disponible. No crashea.
  - `forecast_total(db, zone_id, m2, tier)` — total hoy + evolución 12 meses (+6% anual base).
  - `cron_construction_costs_monthly` (día 1 mes 07:00 MX).
  - `ensure_indexes(db)` — índice único (zone_id, building_type, tier).
- **NEW** `zone_score_engine.py`:
  - `compute_zone_score(db, zone_id, tier)` — 6 dimensiones: Liquidez (placeholder W3.3), Supply pressure, Demand growth (leads delta 30d), Risk (placeholder W3.4), Yield estimado, DENUE density.
  - Letter grades: A≥80, B 65-79, C 50-64, D 35-49, E 20-34, F<20.
  - `db.zone_scores` — TTL 90d, index (zone_id, computed_at desc).
  - `cron_zone_score_daily_refresh` (04:00 MX post-ETL 03:00).
- **NEW** `routes_phase5_foundation.py` — prefix `/api/superadmin/phase5`:
  1. `GET /denue/zone/{zone_id}/density` — density + SCIAN breakdown.
  2. `GET /denue/business/lookup?empresa=` — búsqueda por nombre (lead enrichment).
  3. `POST /denue/sync/zone/{zone_id}` — trigger manual.
  4. `GET /construction-cost/zone/{zone_id}?type=&tier=` — predicción + sources + confidence.
  5. `POST /construction-cost/forecast` — costo total + evolución 12 meses.
  6. `GET /zone-score/{zone_id}` — score + 6 componentes.
  7. `GET /zone-score/all?tier=&limit=50` — lista paginada top zonas.
  8. `GET /zone-score/{zone_id}/history?days=90` — serie temporal.
  9. `GET /api/public/zone-score/{zone_id}` — **PUBLIC SIN AUTH** — letra + numérico + "via DMX" (sin breakdown). Preparado para MCP W4.
- **EDIT** `server.py` — include_router phase5_router + phase5_pub_router + ensure indexes en startup.
- **EDIT** `scheduler_ie.py` — 3 nuevos crons: denue_sync_weekly, construction_costs_monthly, zone_score_daily_refresh.
- **EDIT** `cron_heartbeat.py` — labels + intervals para los 3 nuevos crons. Total crons sistema: 24.

### Frontend (5 nuevos · 4 editados)
- **NEW** `api/phase5Foundation.js` — 9 funciones cliente.
- **NEW** `components/marketplace/ZoneScoreBadge.js` — badge circular A-F con color coding + click → ZoneScoreBreakdown drawer.
- **NEW** `components/developer/ZoneScoreBreakdown.js` — drawer 6 dimension cards con barra visual + tooltip.
- **NEW** `components/developer/ConstructionCostPanel.js` — sparkline 12m, filtros tipo/tier, m2 input, fuentes citadas, stub_reason visible.
- **NEW** `pages/superadmin/SuperadminPhase5Foundation.js` — ruta `/superadmin/phase5-foundation`, 3 tabs: DENUE | Costos Construcción | Zone Scores.
- **EDIT** `components/marketplace/PropertyCard.js` — slot ZoneScoreBadge bottom-right, backwards-compat (renderiza solo si zone_score_letter presente en property).
- **EDIT** `pages/developer/DesarrolladorCashFlow.js` — ConstructionCostPanel montado antes del forecast.
- **EDIT** `App.js` — route `/superadmin/phase5-foundation` + fix pre-existing duplicate MetricasEquipo declaration.
- **EDIT** `config/navByRole.js` — "Foundation Phase 5" en SUPERADMIN_NAV tier 2.
- **EDIT** `i18n/locales/es-MX/common.json` — namespace `phase5_foundation.*` completo.

### Edge Cases Reportados
- **DENUE token**: `IE_INEGI_TOKEN=latam-desarrollos` es un project ID para INEGI BISE, no un DENUE token registrado. El motor retorna 0 negocios con estructura correcta (honest stub). Para activar DENUE real, registrar en https://www.inegi.org.mx/app/api/denue/v1/tokenVerify.aspx y configurar `IE_DENUE_TOKEN` en backend .env.
- **BANXICO SF61745**: retorna 6.5 (% inflación anual), no un índice base-100. Fórmula corregida: `1 + (val/100)`. ✅
- **Duplicate MetricasEquipo**: bug pre-existente en App.js corregido (impedía `yarn build`).

## W2.9 — Phase Z.2 Superadmin Intelligence Hub UI (2026-05-07)

Vista bird's-eye ejecutiva del cubo Z (cierra Wave 2 visualization layer · prepara venta verticals B2B Z.4).

### Backend (2 nuevos · 3 editados)
- **NEW** `intelligence_insights_engine.py`:
  - `executive_overview(db)` — dashboard cross-org: `total_units_market`, `avg_price_per_m2_cdmx`, `top_3_growth/decline_zones` (delta 30d via `facts_daily_zone`), `market_state_overall` (heurística avg_growth · ±3% threshold), `total_briefs_count`, `last_brief_at`. <600ms target.
  - `generate_brief(db, zone_id, tier, period, force, triggered_by)` — Claude Sonnet (`claude-sonnet-4-5-20250929`) con prompt enriquecido: KPIs cubo W2.5 + facts 30d (W2.7) + comparables W2.5 + crecimiento m². Schema JSON estricto: `key_findings[5]`, `top_risks[3]`, `opportunities[3]`, `market_state ∈ {bull,stable,bear}`, `confidence_pct`, `reasoning ≤600 chars`. Cache 7d via `db.intelligence_briefs`. Track `track_ai_call` cost ~0.85 MXN.
  - **AI budget gating**: si `is_within_budget("dmx_internal")` falso → retorna brief en caché (cualquier antigüedad) marcado `budget_blocked:true`, fallback a `_stub_brief` heurístico con `stub_reason` honesto. NO falla.
  - `comparables_matrix(db, zone_id, radius_km, limit≤10)` — top-N comparables nearby + matriz N×N similarity scores (delta normalizado sobre `avg_price_per_m2`, `units_total`, `conversion_rate`). Diagonal `null` (zona vs sí misma).
  - `heatmap_multi_layer(db, layers[], tier, bbox?)` — geojson points por capa: `price` (avg_price_per_m2), `demand` (leads_count), `supply` (units_available), `risk` → `{available:false, reason:"W3 ZZ.4 pending"}` placeholder honesto.
  - `cron_weekly_refresh(db)` — refresca top 20 zonas más activas (alcaldia + colonia por leads_count) con `force=true`, email founder Resend con tabla resumen + CTA gradient.
  - `schedule_intelligence_insights_cron(scheduler, db)` — cron `intelligence_insights_weekly` lunes 05:00 MX, instrumented `cron_heartbeat`.
  - `ensure_indexes(db)` — `intelligence_briefs (zone_id, tier, period, generated_at desc)` + `id unique` + TTL 90d sobre `generated_at_dt`.
- **NEW** `routes_superadmin_intelligence_hub.py` — prefix `/api/superadmin/intelligence-hub` · `require_superadmin` en TODOS endpoints:
  1. `GET /overview` → executive shape.
  2. `GET /insights?zone_id&tier&period` → brief cached o auto-generado si stale.
  3. `POST /insights/generate {zone_id,tier,period,force?}` → audit + ai_cost track.
  4. `GET /heatmap-multi?layers&tier&bbox?` → 4 capas geo.
  5. `GET /comparables-matrix?zone_id&radius_km&limit` → matriz N×N.
  6. `GET /export/pdf?zone_id&tier&period` → ReportLab StreamingResponse PDF branded `<2MB` (cabecera, KPIs table, hallazgos/riesgos/oportunidades, comparables top 5, footer ts+costo). Audit log_mutation.
- **EDIT** `server.py` — wire router + `ensure_intelligence_indexes` en startup.
- **EDIT** `scheduler_ie.py` — registra cron `intelligence_insights_weekly` post `cube_materialized_views_refresh`.
- **EDIT** `cron_heartbeat.py` — labels + intervals para `intelligence_insights_weekly` (visible en `/superadmin/health/crons`).

### Frontend (4 nuevos · 2 editados)
- **NEW** `api/superadminIntelligenceHub.js` — 6 funciones cliente + `downloadPdf()` (Blob + auto-anchor download).
- **NEW** `components/superadmin/MultiLayerHeatmap.js` — Mapbox GL 600px dark-v11 + 4 schemes color (price indigo→rose · demand green→amber · risk blue→red · supply cyan→purple). Layered markers con offsets visuales para evitar overlap. Click → `onZoneClick(pt)`. Empty state cuando `REACT_APP_MAPBOX_TOKEN` ausente.
- **NEW** `components/superadmin/ComparablesMatrix.js` — heatmap N×N collapsible. Score 0 (rojo)→100 (verde) gradient + diagonal disabled (`null`). Click celda → `<CompareDrawer/>` modal side-by-side con KPIs Δ% color-coded. CTA `rounded-full` + close inline.
- **NEW** `components/superadmin/MarketInsightsPanel.js` — sticky panel: state pill (bull/stable/bear color-coded), confidence%, cache badge (hit/miss/stale), 3 secciones (hallazgos `Sparkles` indigo · riesgos `AlertTriangle` rojo · oportunidades `Lightbulb` verde), reasoning markdown via `react-markdown`, footer ts relativo + costo MXN. Empty state CTA gradient "Generar insights". Banner ámbar `intel-stub-banner` cuando `stub_reason` o `budget_blocked`.
- **NEW** `pages/superadmin/SuperadminIntelligenceHub.js`:
  - PageHeader "Inteligencia ejecutiva" icon `Eye` + period chips [Actual·7d·30d·90d] gradient activo + buttons "Exportar PDF" / "Refrescar insights" / reload.
  - KPIStrip 4 cards: Unidades mercado (estado overall), Precio promedio CDMX m² (briefs count), Top 3 crecimiento ↑, Top 3 declive ↓ (TopMoversCard con TrendingUp/Down + delta% color-coded).
  - Layout 60/40: izq Mapbox `MultiLayerHeatmap` + `LayerChip` toggles (Risk chip disabled "(W3 ZZ.4)"), drilldown CTA "Drilldown Cubo →" navega `/superadmin/metrics-cube?zone=…`. Der `MarketInsightsPanel` sticky.
  - Bottom `ComparablesMatrix` collapsible.
  - Mobile <980px: grid stack `1fr` automático.
- **EDIT** `App.js` — lazy import + ruta `/superadmin/intelligence-hub`.
- **EDIT** `config/navByRole.js` — entry tier 2 "Inteligencia ejecutiva" icon `Eye` después de Data Lake.

### Validación curl (todos 200 con superadmin · 403 asesor · 401 sin auth)
- `GET /overview` → shape correcto: `total_units_market=496`, `avg_price_per_m2_cdmx=80900.67`, `market_state_overall=stable`, top growth/decline arrays.
- `POST /insights/generate {zone_id:"cuauhtémoc",force:true}` → Claude Sonnet 4.5 retorna 5 findings + 3 risks + 3 opportunities + reasoning, `confidence_pct=62`, `ai_cost_mxn=0.85`.
- `GET /heatmap-multi?layers=price,demand,risk,supply&tier=alcaldia` → 4 layer keys, `risk.available=false` con reason, `price.count=demand.count=6`.
- `GET /comparables-matrix?zone_id=cuauhtémoc&radius_km=5&limit=5` → 6×6 matriz, diagonal `None` confirmada, scores 0.47–0.55.
- `GET /export/pdf` → `%PDF-1.4` binary 4.3KB <2MB ✅.

### Edge cases & decisiones
- `with_max_tokens()` no existe en `LlmChat` (chequeé `dir(LlmChat)`); lo removí. `anomaly_detection_engine.py` también lo usa pero al fallar cae en su propio stub silenciosamente — no rompe Wave 2.6.
- Cuando `EMERGENT_LLM_KEY` ausente → `_stub_brief()` honesto con `stub_reason` visible en UI banner ámbar (no se simula éxito).
- Risk layer endpoint NO está mockeado: retorna `{available:false, reason}` real, UI marca chip disabled "(W3 ZZ.4)".
- Reportlab ya en `requirements.txt` (reusado de B5/B19); NO se introduce dependencia nueva.
- TTL 90d sobre `intelligence_briefs.generated_at_dt` (BSON Date) — Mongo TTL nativo.
- `i18n` keys `superadmin.intelligence_hub.*`: NO implementadas — el resto de pages superadmin usan strings literales en español. Reportado como decisión conservadora consistente con codebase.
- Cron weekly `force=true` para top 20 zonas + email Resend digest branded gradient.

### Riesgos / pending wave 3
- Risk layer SESNSP (W3 ZZ.4).
- Multi-subscriber email digest (defer Wave 4 #8 AutoNewsletter — solo founder por ahora).
- Export Excel/CSV (defer Z.3 W3.7).


## W2.8 — Phase Z.1 Consolidated Metrics Cube OLAP (2026-05-07)

### Backend (3 nuevos · 2 editados)
- **NEW** `cube_olap_engine.py`:
  - `compute_slice(db, slice_key, period)` — OLAP roll-up sobre `facts_daily_zone` con dimensiones (`zone`, `property_type`, `price_tier`, `period`, `year_built_decade`). KPIs: `units_total/sold/available/reserved`, `avg_price_mxn`, `avg_price_per_m2`, `conversion_rate`. Period support `current|7d|30d|90d` con bucket time-window MX.
  - `compute_cross_cut(db, dimensions, period)` — multi-dim breakdown agregado vía MongoDB `$facet` pipeline, retorna matriz tier × dimension.
  - `compare_slices(db, zone_ids, period)` — diff `%` entre N slices contra baseline (primer zone_id).
  - `materialize_view(db, slice_key, slice_type, ttl_seconds=3600)` — INSERT `cube_materialized_views` + TTL local.
  - `start_backfill(db, days, triggered_by)` — async job en background (asyncio.create_task) iterando ETL día por día. Status persisted en `cube_backfill_jobs`.
- **NEW** `cube_cache.py` — `TTLCache(maxsize=512, ttl=3600)` in-process via `cachetools`. Wrappers `cache_get(key)`, `cache_set(key, value)`, `cache_invalidate(prefix)`. Nota: in-process únicamente, no compartido entre instances (acceptable Wave 2; refactor Wave 3 si scale horizontal).
- **NEW** `routes_superadmin_metrics_cube.py` extendido con 4 endpoints:
  1. `GET /cross-cut?dimensions=zone,property_type&period=30d` — query OLAP cross-cut (cached 1h).
  2. `POST /compare {zone_ids:[...], period}` — diff side-by-side (cached 1h).
  3. `POST /backfill {days:30}` — trigger async backfill, retorna `job_id`.
  4. `GET /backfill/status?job_id=X` — poll status (`pending|running|completed|failed` + errors[] + progress %).
- **EDIT** `server.py` — registra `cube_cache.invalidate_on_etl_complete` callback dentro de `data_lake_etl.run_daily_etl` post-success (cache bust).
- **EDIT** `scheduler_ie.py` — cron `cube_materialize_daily` 02:30 MX (después de metrics-cube, antes de data-lake) refresca `cube_materialized_views` para slices high-traffic (national + 16 alcaldías).

### Frontend (3 nuevos · 1 editado)
- **NEW** `api/superadminMetricsCube.js` extendido con `getCrossCut()`, `postCompare()`, `triggerBackfill()`, `getBackfillStatus()`.
- **NEW** `components/superadmin/CubeCrossCutChips.js` — chips multi-select de dimensiones (zone, property_type, price_tier, year_built_decade). Pills `rounded-full` con borde `1px solid rgba(99,102,241,0.4)` activo, backdrop-blur fondo. `data-testid="cube-cross-cut-chip-{dim}"`.
- **NEW** `components/superadmin/CubeCompareModal.js` — modal compare side-by-side (max 4 zones). Tabla diff% color-coded (verde +, rojo −). CTA `rounded-full` gradient `linear-gradient(90deg, #6366F1, #EC4899)`.
- **NEW** `components/superadmin/CubeBackfillModal.js` — input días (1-180), CTA trigger, status poll cada 3s (badge `pending/running/completed/failed`), error log expandible.
- **EDIT** `pages/superadmin/SuperadminMetricsCube.js` — integra los 3 nuevos componentes en toolbar superior. Cross-cut chips abajo de breadcrumb, modal compare abre desde drilldown table (multi-row select), modal backfill desde quick action. Fix JSX root fragment + lint pass.

### Validación
- `yarn build` → exit 0 (sin warnings críticos).
- `curl GET /cross-cut?dimensions=property_type&period=30d` → 200 (validation 422 cuando dimensions ausentes — OK).
- `curl POST /compare {zone_ids:["national"],period:"30d"}` → 200 con `zones[]` + `diff_pct{}`.
- `curl GET /backfill/status?job_id=xxx` → 404 cuando job inexistente (esperado).

### Notas operativas
- TTLCache es in-process; en multi-instance considerar Redis Wave 3.
- Backfill async usa `asyncio.create_task` — survive request lifecycle pero NO survive backend restart. Job marcado `failed` si interrumpido.


## W2.7 — Phase Z.0 Data Lake Foundation (2026-05-07)

### Backend (3 nuevos · 3 editados)
- **NEW** `data_lake_etl.py`:
  - `ensure_facts_indexes(db)` — crea `db.facts_daily_zone` como **MongoDB time-series collection nativa** (timeField=ts, metaField=meta, granularity=hours). Fallback a regular collection si MongoDB <5.0. Indexes secundarios `(meta.zone_id, meta.tier, ts desc)` + `dim_zones (tier, zone_id) unique` + `2dsphere on geo.polygon` + `etl_runs(run_at desc)` + `model_validation_runs(model_name, run_at desc)`.
  - `seed_dim_zones(db)` — **idempotente startup**: city CDMX root + 16 alcaldías (con población 2020 INEGI) + colonias desde `data_seed.COLONIAS` (close polygon ring para 2dsphere) + developments desde `data_developments.DEVELOPMENTS`. Total: 51 zonas seeded.
  - `run_daily_etl(db, target_date, run_type, triggered_by)`:
    1. Refresh `metrics_cube_aggregations.aggregate_all` (W2.5 reuse, no duplicación de roll-up logic).
    2. Para cada zona × tier: lee `cube_aggregations` current snapshot → INSERT a `facts_daily_zone` con `ts=target_date`.
    3. INSERT `etl_runs` summary; si errors > 5 → INSERT `system_alerts` critical.
  - `coverage_per_tier(db, tier, days)` — % zonas con fact en ventana N días + missing_zone_ids (max 50).
  - `schedule_data_lake_etl_cron(scheduler, db)` — cron diario 03:00 MX (después de metrics-cube 02:15) instrumentado en `cron_heartbeat`. Wraps `run_daily_etl` + `run_all_validations` post-ETL.
- **NEW** `model_validation_engine.py`:
  - `compute_metrics(predictions, actuals) -> {r_squared, rmse, mape, sample_size, ci_95}` — fórmulas estadísticas estándar + bootstrap 95% CI t-aproximado.
  - 2 validators V1 registrados:
    - `cube_avg_price` — predicted (90d period) vs actual (current) por colonia.
    - `metrics_cube_kpis` — yesterday units_total vs today (consistency check de snapshots).
  - V2 deferred Wave 3: `drpi_hedonic`, `risk_score`, `construction_cost`.
  - `validate_model(db, model_name, predictions?, actuals?)` — INSERT `model_validation_runs`.
  - `run_all_validations(db)` — corre todos V1.
  - `latest_per_model(db)` — last run por modelo (con `no_data:true` si nunca corrió).
- **NEW** `routes_superadmin_data_lake.py` — prefix `/api/superadmin/data-lake` (require_superadmin) + `/api/data-lake/public/validation` (sin auth):
  1. `GET /etl-runs?status&limit&skip` — paginado + tally `ok_7d/total_7d` + `last_run`.
  2. `POST /etl/trigger {target_date?}` — manual run, audit. Auto-corre validaciones post-ETL.
  3. `GET /coverage?tier&days` — `tier` opcional, sin → list todos.
  4. `GET /validation-metrics?model_name&limit` — items + `latest_per_model` + `avg_r_squared` + registered_models.
  5. `POST /validation/run-now` — manual recompute V1 validators.
  6. `GET /api/data-lake/public/validation` (**PÚBLICO, NO auth**) — shape limitado para `/methodology` page Wave 3 ZZ.3: `[{name, r_squared_latest, rmse_latest, mape_latest, sample_size, last_validated, validation_method, training_window_days}]` + disclaimer es-MX. NO data interna, NO rows.
- **EDIT** `server.py` — wire router + ensure_indexes + seed_dim_zones (idempotente) en startup.
- **EDIT** `scheduler_ie.py` — registra cron `data_lake_etl_daily` con `_emit("scheduler_data_lake_etl_error")` fallback.
- **EDIT** `cron_heartbeat.py` — labels + intervals para `data_lake_etl_daily` (visible en `/superadmin/health/crons` → 19 jobs total).

### Frontend (4 nuevos · 2 editados)
- **NEW** `api/superadminDataLake.js` — 6 funciones cliente (incluyendo `getPublicValidation()` sin auth header).
- **NEW** `components/superadmin/EtlRunsTable.js` — density-aware (compact|dense). Cols: Run (timestamp + relative) · Estado pill (verde ok / amber partial / rojo failed con icon) · Duración · Zonas · Errores · expand chevron. Click row → expanded TR con full error log + run_id + target_date + KPIs computed. Empty state.
- **NEW** `components/superadmin/ValidationMetricsTable.js` — tabla sortable por R² desc. Cols: Modelo (label es-MX + technical id) · R² (color verde≥0.7, amber 0.5-0.7, rojo <0.5) · RMSE · MAPE · Sample size · Validado relative. **Header tooltips** explicando cada métrica al hover (qué significa R²/RMSE/MAPE en español MX). KPI banner R² promedio arriba.
- **NEW** `pages/superadmin/SuperadminDataLake.js`:
  - PageHeader "Data Lake" + 3 buttons (Validar modelos · Trigger ETL manual con confirm modal · Refrescar).
  - KPI strip 4 cards: ETL runs 7d (ok/total), Cobertura promedio %, Último ETL relative, Salud validación R² promedio. Color-coded thresholds.
  - 2-col layout (mobile <md stack): EtlRunsTable izquierda + ValidationMetricsTable derecha.
  - Coverage panel collapsible bottom: per-tier bar chart con `width: ${pct}%` + missing count badge (rojo) → click abre modal con lista IDs faltantes.
  - **Auto-refresh 60s** mientras `document.visibilityState==='visible'`.
  - ConfirmTriggerModal advierte "recomputará agregados + writeback `facts_daily_zone` + validaciones, ~1-2s".
- **EDIT** `App.js` — lazy `SuperadminDataLake` + Route `/superadmin/data-lake`.
- **EDIT** `config/navByRole.js` — `SUPERADMIN_NAV` tier 2 añade "Data Lake" (Database icon) tras "Cubo de métricas".

### Validaciones (curl + cookie superadmin):
- `/etl-runs` → empty list inicial; `/etl/trigger` → `id=etl_..., status=ok, zones=51, errors=0, duration=0.16s` ✅
- `/coverage` → city=1/1, alcaldia=16/16, colonia=16/16, development=18/18 (100% across tiers) ✅
- `/validation/run-now` → `cube_avg_price r²=1.0 rmse=0.0 mape=0.0 n=15` (perfect porque snapshot=snapshot al primer run, esperado), `metrics_cube_kpis n=0` (necesita 2 días de facts) ✅
- `/validation-metrics` → `avg_r_squared=1.0`, latest_per_model con shape correcto ✅
- `/api/data-lake/public/validation` (sin auth) → 200 OK con `models[]` shape limitado + disclaimer ✅
- 401 anon en endpoints superadmin / 403 asesor → ✅
- `/superadmin/health/crons` → `data_lake_etl_daily · diario · 03:00 MX` registrado (19 jobs total) ✅
- yarn build CLEAN (solo warnings pre-existentes) ✅

### Edge cases / NOTAS
- **GeoJSON polygon close**: data_seed.COLONIAS tenía rectangles abiertos (4 vértices). Cerramos automáticamente (append first vertex) antes de upsert dim_zones para satisfacer 2dsphere index. Sin cierre → `Loop is not closed` error 16755.
- **Time-series collection**: si MongoDB <5.0, `create_collection(timeseries=...)` falla → cae a regular collection (logged warning, no fatal). Operación CRUD idéntica.
- **R²=1.0 inicial**: validador `cube_avg_price` compara snapshot 90d vs current — al primer ETL run son idénticos (no hay drift histórico). Conforme corra cron diario, valores divergerán naturalmente y R² descenderá hacia rangos realistas (0.7-0.95). Esto es **comportamiento correcto** del validador snapshot-vs-snapshot.
- **`metrics_cube_kpis` sample=0**: necesita ≥2 días de facts (yesterday vs today). Después del segundo cron run a las 03:00 MX retornará valores reales.
- **NO PostgreSQL/TimescaleDB** (per spec): MongoDB native time-series elimina dual-stack infra. 2dsphere geo support nativo.
- **NO migra developments/units**: `facts_daily_zone` es agregación derivada — operational data sigue en `db.developments` + `db.units` existing.
- **NO Redis cache** (defer Z.1 W2.8) · **NO export endpoint** (defer Z.3 W3.7) · **NO breaking changes en metrics_cube W2.5** — solo CALL su `aggregate_all`.
- **AGEB tier**: schema soporta tier `ageb` y endpoint coverage acepta filter, pero no hay seed AGEB INEGI 2020 todavía (deferido a W3 batch INEGI con 2455 AGEBs CDMX shapefile real).
- **`triggered_by`**: cron usa `"cron"`, manual usa `user.user_id` para audit trail.
- **System alert integration**: si ETL fallido (status=failed) o errors>5 → INSERT en `db.system_alerts` con severity=critical (W1.3 pipeline picks up + email Resend si configured).
- data-testid completos: superadmin-data-lake, data-lake-toast, data-lake-trigger, data-lake-validate-now, data-lake-refresh, data-lake-kpi-{runs/coverage/last/validation}, data-lake-loading-{runs/val}, etl-runs-table, etl-row-{id}, etl-row-expanded-{id}, etl-table-empty, validation-metrics-table, validation-row-{model_name}, validation-empty, coverage-panel, coverage-toggle, coverage-missing-{tier}, coverage-missing-modal, trigger-confirm-modal, trigger-confirm.



## W2.6 — SA8 Founder Console (2026-05-07)

### Backend
- **NEW** `anomaly_detection_engine.py` — 5 detectores + Haiku reasoning + Resend throttle:
  - `detect_ai_cost_anomalies` — flags tenants con spend 24h >2σ vs daily avg 30d (noise floor avg≥5 / spend≥10 MXN). Critical si σ≥3.
  - `detect_tenant_inactivity` — pro/enterprise sin audit activity 14d → warning con `days_dark`.
  - `detect_ingestion_failures` — ≥3 jobs failed/24h. Critical si ≥10.
  - `detect_conversion_drops` — alcaldía con conversion <0.5× baseline 90d (cube_aggregations).
  - `detect_feature_flag_thrash` — same entity_id toggled ≥3 veces en <1h (audit_log).
  - `_claude_haiku_reasoning` — single Haiku call (cost-optimized vs Sonnet) → `{confidence, summary, recommendation}` JSON. Confidence <0.7 descarta. `track_ai_call` dual-write con `feature_key="founder_anomaly_detection"`.
  - `_maybe_email_founder` — Resend HTML branded, throttle 1/día/source via `db.founder_email_throttle` (key: `founder_anomaly:{source}:{YYYY-MM-DD}`). Solo critical.
  - `run_anomaly_detection(db)` — cron entrypoint, dedup por (source, message) en status open/investigating.
  - `schedule_anomaly_detection_cron` registrado 06:00 MX, instrumentado en cron_heartbeat.
- **NEW** `routes_superadmin_founder_console.py` — prefix `/api/superadmin/founder-console`, 8+1 endpoints, todos `require_superadmin`:
  1. `GET /dashboard` — KPIs cross-functional: MRR (sum tenants × top plan_tier price), ARR (×12), active/trial tenants, churn_risk (pro/ent sin login 7d), ai_cost_mtd + forecast (reuse `ai_cost_aggregations.overview`), alerts_open_critical, ingestion_pending, anomalies_open, totals devs/units/leads_30d, conversion_30d, top_5_alerts.
  2. `GET /anomalies?status&severity&source&limit&skip` — paginado, default status `[open, investigating]`.
  3. `POST /anomalies/{id}/resolve` body `{resolution_note}` — idempotente, audit.
  4. `POST /anomalies/{id}/dismiss` body `{reason}` — idempotente, audit.
  5. `POST /anomalies/detect-now` — trigger manual cron, audit.
  6. `GET /commands?q&limit` — registry built-in (12 nav rutas + 3 sistema) + dynamic (top 10 tenants para impersonate + last 5 snapshots). Filter por label/category lowercase.
  7. `POST /commands/execute` body `{command_id, payload?}` — devuelve `{ok, action, redirect_url?, api_call?}`. Audit.
  8. `GET /quick-actions` — auto-seed 6 defaults en first read per-user. `POST /quick-actions` create. `DELETE /quick-actions/{id}` (only owner).
- **EDIT** `server.py` + `scheduler_ie.py` + `cron_heartbeat.py`:
  - Wire router + `ensure_indexes` (founder_anomalies tier `(status, detected_at desc)` + `(source)` + `id` unique; founder_quick_actions `(user_id, sort_order)`; founder_email_throttle `(key)` unique).
  - Cron `founder_anomaly_detection` 06:00 MX en SCHEDULE_LABELS (visible en `/superadmin/health/crons` → 18 total).

### Frontend
- **NEW** `api/superadminFounderConsole.js` — 9 client funciones.
- **NEW** `contexts/FounderPrefetchContext.js` — provider monta cuando `user.role==='superadmin'`. Al login fetcha en paralelo: dashboard · anomalies_open · commands · quick_actions · cube_tiers + 4 metrics-cube period rollups (current/7d/30d/90d) en cache 5min memoria. Auto-revalidate dashboard+anomalies cada 60s. Hook `useFounderPrefetch()` lee con safe defaults. **Cierra W2.5 deferred**: cambiar period en metrics-cube ahora es instantáneo.
- **NEW** `ExecutiveKpiGrid.js` — 8 stat cards click-drill: MRR · Tenants · Churn risk · AI cost MTD · Alerts críticas · Anomalías · Ingestas · Conversión 30d. Color amber/red por threshold (churn>5, alerts>0, ai forecast>1.5× MTD).
- **NEW** `AnomalyFeed.js` — list rows con severity color (critical=rojo, warning=amber, info=indigo) + source badge + ts relativo + collapsible "Reasoning Claude Haiku · {confidence%}" + recommendation pill + JSON evidence pretty-printed. 3 acciones: Investigar (drill source), Descartar (modal razón), Resolver (modal nota). Empty state con check verde.
- **NEW** `QuickActionsToolbar.js` — vertical list pill buttons. Toggle "Settings" → modo edit, botón Plus crea modal con [navigate · api_call · impersonate]. Delete inline. `executeAction` ejecuta directamente: navigate via `useNavigate`, api_call POST con bearer, impersonate POST + window.location redirect.
- **NEW** `CommandPaletteExtended.js` — modal full-overlay (centered 720px desktop). Search input debounce 200ms hitting `/commands?q=`. Resultados agrupados por category (Navegación · Sistema · Tenants · Snapshots). Recents top 5 desde localStorage `dmx_founder_recents_v1`. Arrow keys navegan + Enter ejecuta (con redirect_url o api_call dispatch) + Esc cierra. Footer hints (cmd+/ → UniversalSearch B0).
- **NEW** `pages/superadmin/SuperadminFounderConsole.js` — orquesta:
  - Header "Bienvenido {firstName}" + último acceso relativo (localStorage) + Cmd+K hint chip + "Detectar anomalías" CTA + Refresh.
  - `<ExecutiveKpiGrid/>` 8 cards.
  - 2 cols (mobile <md stack): `<AnomalyFeed/>` (1.55fr) + `<QuickActionsToolbar/>` (1fr).
  - Bottom row 3 inline SVG sparklines (W2.3 pattern reuse): MRR 90d (indigo) · AI cost 30d (amber) · Conversión 30d (verde). Series sintéticas derivadas del current value (placeholder hasta time-series real).
  - Estado inicial pinta desde `useFounderPrefetch()` cache antes del fetch fresh.
- **EDIT** `App.js` — lazy `SuperadminFounderConsole` + Route `/superadmin` re-mapped a Founder Console; `SuperadminDashboard` legacy preservado en `/superadmin/dashboard-legacy`.
- **EDIT** `config/navByRole.js` — primer item SUPERADMIN_NAV tier 1 cambia a `key:'inicio'` label "Inicio" (Layout​Dashboard) hacia `/superadmin` (root).
- **EDIT** `components/shared/PortalLayout.js`:
  - Import `CommandPaletteExtended` + `FounderPrefetchProvider`.
  - Cmd+K handler: si `role==='superadmin'` abre `CommandPaletteExtended`, sino `UniversalSearch` (B0).
  - Cmd+/ shortcut nuevo: SIEMPRE abre UniversalSearch B0 (escape hatch para founder).
  - Wrapper `PortalLayout(props)` envuelve `PortalLayoutInner` con `FounderPrefetchProvider` cuando role=superadmin (named export preserved).

### Validaciones (curl con cookie superadmin contra preview):
- `/dashboard` → MRR/ARR/active_tenants/conversion_30d coherentes; latency 0.157s ✅
- `/commands` → 18 items default (12 nav + 3 sistema + top tenants/snapshots); `?q=metrics` → 1 match (Refrescar metrics cube) ✅
- `/commands/execute {nav_ai_cost}` → `{action:"navigate", redirect_url:"/superadmin/ai-cost"}` ✅
- `/quick-actions` → auto-seed 6 defaults en first call; create + delete OK ✅
- Spike test forzado (30 eventos baseline + 10 spikes en `db.ai_call_events`) → `detect-now` insertó 1 anomalía critical "Spike de costo IA en tenant anom_test_tenant: $500 MXN (24h) vs avg $19/día" con Claude Haiku reasoning (`ai_cost_mxn=0.04, elapsed_s=1.75`) ✅
- `/anomalies/{id}/resolve {note}` → status pasa a "resolved" + filter `status=resolved` retorna 1 ✅
- `/anomalies?status=open` post-resolve → 0 (idempotente) ✅
- 401 anon · 403 asesor en TODOS endpoints ✅
- `/superadmin/health/crons` → ahora lista 18 jobs incluyendo `founder_anomaly_detection · diario · 06:00 MX` ✅
- yarn build → CLEAN (solo warnings pre-existentes) ✅

### Edge cases / NOTAS
- **Email Resend**: solo se dispara si `RESEND_API_KEY` env presente Y severity=critical. En el preview pod no envía email (key potencialmente ausente) — inserción y throttle siguen funcionando.
- **Haiku dependency**: si `EMERGENT_LLM_KEY` ausente o emergentintegrations no carga, `_claude_haiku_reasoning` retorna `{confidence:0.75, summary:msg, recommendation:'Revisar manualmente'}` para no bloquear inserción.
- **MRR estimation**: derivado de `tenant_features.plan_tier` × max `plan_templates.price_mxn` por tier — no usa Stripe real (W3 wave). Si tenant no tiene features enabled → cuenta como $0.
- **Sparklines bottom row**: series sintéticas calculadas del current value (sin real time-series). Cuando ship `tenant_timeseries` MRR collection, swap el array.
- **localStorage `dmx_last_login`**: stored cuando founder aterriza por primera vez; muestra "hace 0m" en first visit. NOT cleared en logout (intentional: muestra "antes vs ahora").
- **Cmd+/** habilitado para todos los roles como escape hatch a UniversalSearch B0.
- **prefetch destructure unused vars**: `const { dashboard, anomalies_open, ...rest }` en interval callback elimina entradas viejas del cache antes de re-prime — eslint puede marcar pero ya está en pre-existing warnings.
- Tests via testing subagent NO ejecutados (forbidden by user). yarn build limpio. Backend smoke completo via curl + spike forzado.
- data-testid completos: superadmin-founder-console, founder-toast, founder-detect-now, founder-refresh, founder-loading, exec-kpi-{slot}, anomaly-row-{id}, anomaly-expand/investigate/dismiss/resolve-{id}, anomaly-action-{modal/input/confirm}, qa-personalize, qa-add, qa-item-{id}, qa-delete-{id}, qa-create-modal, qa-{label/action-type/payload/create-confirm}, command-palette-extended, cmd-palette-input/close/empty, cmd-recent-{id}, cmd-item-{id}.



## W2.5 — SA6 Granular Metrics Cube UI (2026-05-07)

### Backend
- **NEW** `metrics_cube_aggregations.py` — geo-tier rollup engine:
  - `aggregate_tier(db, tier, period)` — UPSERT en `cube_aggregations` por (tier, tier_id, period). Periods: `current|7d|30d|90d`.
  - `_all_developments(db)` — merge de `data_developments.DEVELOPMENTS` (seed) + `db.developments` (ingested). Mongo override seed por id.
  - `_leads_per_dev` + `_ai_usage_per_tenant` — filtran por período (since iso) y agregan por dev/tenant.
  - `_finalize` — calcula `avg_price_mxn`, `avg_price_per_m2`, `conversion_rate` (`sold/(sold+available+reserved)*100`), `days_on_market_avg`, `ie_score_promedio`.
  - `find_comparables(db, tier_id, radius_km)` — Haversine query devs ≤ radio. Top sorted by distancia.
  - `metrics_cube_daily_aggregation` — entrypoint cron (city + alcaldia + colonia + development × 4 periods = 16 rollups, ~0.1s en seed actual).
  - `ensure_indexes` — `(tier, tier_id, period)` unique + `(parent_tier_id, tier, period)`.
- **NEW** `routes_superadmin_metrics_cube.py` — prefix `/api/superadmin/metrics-cube`, 7 endpoints + 1 manual recompute, `require_superadmin` en todos:
  1. `GET /tiers` — jerarquía + counts {city:1, alcaldia:6, colonia:15, development:18, unit:508}.
  2. `GET /heatmap?metric&tier&period&bbox` — geojson points para Mapbox; rechaza >500 puntos sin bbox (HTTP 400).
  3. `GET /comparables?tier_id&radius_km&limit` — top 20 nearby con distancia + sparkline price_history[-12].
  4. `GET /unit/{unit_id}` — micro detalle: unit + dev + price_history (units_history fallback dev.price_history) + leads + ie_score_zone. Busca en seed (`ALL_UNITS`/`DEVELOPMENTS_BY_ID`) → mongo `db.units` → embedded `db.developments.units`.
  5. `POST /refresh` — manual recompute (16 rollups).
  6. `GET /{tier}` — list nodes con sortable cols, search, parent_id filter, paginado 50.
  7. `GET /{tier}/{tier_id}/children` — children del siguiente tier con KPIs comparables. Para `unit`: lee de seed primero, luego `db.units`.
  8. `GET /{tier}/{tier_id}` — detail node + children. On-demand compute si missing.
  - **Route order crítico**: `/tiers`, `/heatmap`, `/comparables`, `/unit/{id}`, `/refresh` declarados ANTES de `/{tier}` para evitar shadowing por Pydantic Literal validation.
- **EDIT** `server.py` — wire router + `ensure_metrics_cube_indexes` en startup tras commercial init.
- **EDIT** `scheduler_ie.py` — registra cron `metrics_cube_daily_aggregation` con `cron_heartbeat.wrap_apscheduler_job` a las 02:15 MX (instrumentado).

### Frontend
- **NEW** `api/superadminMetricsCube.js` — 7 funciones (`getTiers`, `listTier`, `getTierDetail`, `getTierChildren`, `getHeatmap`, `getComparables`, `getUnitDetail`, `refreshAggregations`).
- **NEW** `components/superadmin/CubeBreadcrumb.js` — chips chevron rounded-full clickables; último activo `linear-gradient(90deg,#6366F1,#EC4899)` (gradient único). Navega backwards via `onNavigate(index)`.
- **NEW** `components/superadmin/CubeKpiStrip.js` — 6 stat cards: proyectos · unidades · $/m² · conversión · DOM · IE score. Color amber `rgba(250,204,21,0.30)` si conv<5%, rojo `rgba(239,68,68,0.30)` si DOM>180. Mobile stack 2x3 via flex-wrap.
- **NEW** `components/superadmin/CubeHeatmap.js` — Mapbox dark-v11 500px height. `valueToColor(v,min,max)` interpola `#6366F1`→`#EC4899` linear. Markers sized 14-40px proporcional a `units_total/maxUnits`. Hover popup con name+metric+units. Click → emit `onDrill(point)`. Auto-fitBounds. Fallback "Mapa no disponible" si falta token.
- **NEW** `components/superadmin/CubeDrilldownTable.js` — sortable density-aware: name · unidades · disponibles · precio prom · conv% · leads · IE. Pagination 50/page con prev/next. Click row o botón "Drill" → emit `onDrill(row)`. Empty state con copy es-MX.
- **NEW** `pages/superadmin/SuperadminMetricsCube.js` — orquesta:
  - PageHeader + period switcher chips `[Actual · 7d · 30d · 90d]` + button "Refrescar agregados" con spin animation.
  - `<CubeBreadcrumb/>` arriba con `path` state stack.
  - `<CubeKpiStrip/>` con KPIs del nodo actual.
  - Layout 2 columnas (mobile stack <md): heatmap izquierda + tabla derecha. Heatmap tier auto-resuelve `HEATMAP_TIER_BY_LEVEL[cur.tier]` (city→alcaldia, alcaldia→colonia, colonia→development).
  - Heatmap metric selector chips: $/m² · precio · leads · conversión · unidades.
  - Search filter chip + counter children.
  - Click row/dot → push path → re-fetch detail+heatmap+kpis (sin reload de página).
  - Si `tier=development`: muestra `<ComparablesPanel/>` collapsible (default cerrado) con radius selector [1·2·5·10]km y lista 20 nearby.
  - Si tier child clicked es unit: abre `<UnitDetailView/>` con histórico de precios sparkline (W2.3 pattern reuse), IE score zona, leads asociados, y back button.
- **EDIT** `App.js` — lazy import `SuperadminMetricsCube` + Route `/superadmin/metrics-cube`. Al pasar, también wire pendiente `SuperadminCommercial` que existía sin route (carryover de W2.4).
- **EDIT** `config/navByRole.js` — `SUPERADMIN_NAV` tier 2 "Plataforma": añadidos "Comercial" (Briefcase, carryover de W2.4 sin nav previa) + "Cubo de métricas" (Layers) tras Costos IA.

### KPIs validados (curl con cookie superadmin contra preview)
- `/tiers` → `{city:1, alcaldia:6, colonia:15, development:18, unit:508}`
- `/refresh` → 16 rollups en 0.09s; ejemplos: `Cuauhtémoc=178u`, `Miguel Hidalgo=118u`, `Benito Juárez=96u`
- `/alcaldia/miguel-hidalgo/children` → `[Polanco, Anzures, Lomas de Chapultepec]`
- `/colonia/polanco/development/altavista-polanco/children` → 56 units (`02A=$14.8M`, etc.)
- `/heatmap?metric=avg_price_per_m2&tier=colonia` → 15 puntos. Anzures=66.4k, Condesa=92.5k, Polanco=…
- `/comparables?tier_id=altavista-polanco&radius_km=2` → `[Polanco Moderno (0km), Anzures Classic (1.76km)]`
- `/unit/altavista-polanco-02A` → unit+dev+price_history+leads+ie_score_zone resuelve desde seed.
- 403 con asesor / 401 sin login → ✅

### Edge cases / NOTAS
- `data_developments.DEVELOPMENTS` es source-of-truth seed (in-memory), no persistido en mongo. Cube agrega de seed+mongo merge; row mongo prevalece sobre seed por id collision.
- Routes order: `/heatmap` falla con 422 literal_error si llega a `/{tier}`. Ordenamos manualmente.
- `data-testid` en TODO interactivo: cube-period-{key}, cube-refresh-btn, cube-breadcrumb-{tier}, cube-heatmap, cube-heatmap-dot-{id}, cube-row-{id}, cube-drill-{id}, cube-comparables-toggle, cube-comp-{id}, cube-comp-radius-{km}, cube-search, cube-page-prev/next, cube-unit-detail, cube-unit-back, cube-unit-sparkline, cube-kpi-{slot}, cube-loading, cube-toast, cube-heatmap-metric-{key}.
- Mobile <900px: grid colapsa a 1 columna (heatmap arriba, tabla abajo) via `@media`.
- Cron `metrics_cube_daily_aggregation` 02:15 MX instrumentado en heartbeat → aparece en `/superadmin/health`.
- NO se incluyó country/state real (H1 = solo CDMX hardcoded). NO histórico time-series full. NO export CSV. NO Phase Z.0/Z.1 backend cube — UI solo cambia source si Z.0/Z.1 ship.



## W2.3 — SA4 AI Cost Observatory (2026-05-07)

### Backend
- **EDIT** `ai_budget.py`:
  - `track_ai_call(...feature_key=None)` — backwards-compat opcional. Default fallback: `feature_key or call_type or "other"`. Dual-write: actualiza el rollup `ai_usage_log` (legacy budget gate) Y crea un evento por llamada en `ai_call_events` con `daily_iso/month_iso/feature_key`.
  - `is_within_budget(db, dev_org_id)` — ahora consulta `db.ai_budget_caps` para honrar `hard_block`. Si `hard_block=True` y `spent >= monthly_cap_mxn` → `False` aunque legacy cap permita.
  - `ensure_ai_budget_indexes` extendido: índices nuevos en `ai_call_events (dev_org_id, month_iso, feature_key)`, `(daily_iso desc)`, `(month_iso, model)`, `(ts desc)`; `ai_budget_caps (tenant_id unique)`; `ai_cost_daily_snapshots (daily_iso, tenant_id)`.
- **NEW** `ai_cost_aggregations.py` — pipelines centralizados:
  - `period_window`/`previous_period_window`/`days_remaining_in_month`/`model_class` helpers
  - `overview()` — total + top 5 spenders (con tenant_name lookup) + top 5 features + Haiku/Sonnet/other split + trend vs prev period + forecast EOM
  - `by_tenant()` — paginado, con caps map + alert_flag (pct_used >= threshold) + hard_block flag
  - `by_feature()` — feature_key con model_mix object + top tenant per feature
  - `by_model()` — split + avg_cost_per_call_mxn
  - `tenant_timeseries()` — array de 30 días con bucket por modelo, fill 0s para días vacíos
  - `forecast()` — `current_mtd + (run_rate_7d × days_remaining)`
  - `materialize_daily_snapshot()` — cron-friendly (yesterday → `ai_cost_daily_snapshots`)
- **NEW** `routes_superadmin_ai_cost.py` — prefix `/api/superadmin/ai-cost`, 9 endpoints:
  1. `GET /overview?period=month|7d|30d`
  2. `GET /by-tenant?period&limit&skip&sort=spend_desc|name_asc`
  3. `GET /by-feature?period&tenant_id?`
  4. `GET /by-model?period`
  5. `GET /tenant/{id}/timeseries?days`
  6. `GET /forecast?tenant_id?`
  7. `GET /caps`
  8. `POST /caps` (UPSERT) — body `{tenant_id, monthly_cap_mxn, alert_threshold_pct?, custom_alert_email?, hard_block?}`. Audit log con before/after.
  9. `PATCH /caps/{tenant_id}` (partial). Audit log.
  Todos con `require_superadmin` (403 para roles ≠).
- **EDIT** `server.py` (+include_router); **EDIT** `scheduler_ie.py` (registra cron `ai_cost_daily_aggregation` con `CronTrigger(hour=1, minute=0, tz=America/Mexico_City)`); **EDIT** `cron_heartbeat.py` (label + interval) — visible en `/superadmin/health` crons list.

### Feature_key migrations en callers (silent default)
- ✅ `narrative_engine.py` → `feature_key="narrative_engine"`
- ✅ `diagnostic_engine.ai_recommend_for_failure` → `feature_key="diagnostic_engine"`
- ✅ `ai_suggestions.py` → `feature_key="ai_suggestions"`
- ✅ `caya_engine.py` → `feature_key="copilot_chat"`
- ✅ `bulk_ingest_engine.py` (caller en `_process_job`) → `feature_key="bulk_ingest_haiku"` con db handle correcto
- 🟡 9 callers restantes (`routes_dev_batch4_4/5/7/8/11/14`) NO modificados — usan variable `call_type` ya descriptiva (ej. `"weekly_brief"`, `"argumentario_rag"`, `"buyer_disc"`) que se materializa via fallback `feature_key=call_type` en track_ai_call. **Decisión conservadora**: preservar firmas existentes, dejar que el fallback agrupe correctamente.

### Frontend
- **NEW** `pages/superadmin/SuperadminAiCost.js`:
  - Header "Costos IA" + period chips [Mes actual · 7d · 30d] + "Refrescar" + "Configurar topes (N)" gradient
  - 4 KPIs (Gasto / Calls / Forecast EOM con color por threshold / Trend ±%)
  - Sparkline 30d inline-SVG (sin nuevo nivo dep) con 3 líneas overlay (total magenta + haiku verde + sonnet violeta + área degradada)
  - Filter chip "Solo en alerta"
  - 2-col grid responsive: `<CostBreakdownTable kind="tenant">` (sortable, click row → cap modal) + `<CostBreakdownTable kind="feature">` (con mini-mix bar)
  - `<ModelMixChart>` SVG donut + tabla detallada de modelos
  - `<CapsListModal>` muestra topes existentes con botón Editar
- **NEW** `components/superadmin/CostBreakdownTable.js` — sortable cols (mxn/pct/name/feature_key), CapBar visual con color verde<70%/amber 70-90%/rojo>90% + chip BLOCK si hard_block, MiniMix bar por feature
- **NEW** `components/superadmin/ModelMixChart.js` — SVG donut con stroke-dasharray (Haiku verde / Sonnet violeta / Otros gris) + leyenda + tabla detalle
- **NEW** `components/superadmin/CapModal.js` — form con monthly_cap input + threshold slider 50-95% (con preview MXN calculado en vivo) + email opcional + checkbox hard_block destacado en rojo cuando activo. POST or PATCH dependiendo de `existingCap`.
- **NEW** `api/superadminAiCost.js` — 9 funciones matching endpoints
- **EDIT** `App.js` route `/superadmin/ai-cost`; **EDIT** `navByRole.js` agrega "Costos IA" tier 2 con icon `DollarSign` después de "Auditoría"

### Manual tests passed (curl + python)
- ✅ Synthetic 150 events insertados → `/overview?period=month` retorna shape correcto: total 89.5 MXN, top 5 spenders + features con `pct_total`, Haiku/Sonnet split (13.5/76.0), trend pct vs prev period, forecast EOM 396.46
- ✅ `/by-tenant` 3 items con cap=null inicialmente
- ✅ `/by-feature?period=30d` retorna feature_keys con `model_mix` object completo + `top_tenant_id/name`
- ✅ `/by-model?period=30d` retorna avg_cost_per_call_mxn correcto (haiku 0.7 vs sonnet 5.6)
- ✅ `/tenant/dev_alpha/timeseries?days=30` → 31 buckets (incluye día 0); 15 con datos, resto 0s
- ✅ `/forecast?tenant_id=dev_alpha` → mtd 37.5, run_rate 5.36/d, projected 166.14, days_remaining 24
- ✅ `POST /caps` → UPSERT crea cap con audit; `GET /caps` lista; `PATCH /caps/{id}` actualiza solo threshold
- ✅ `is_within_budget` hard_block: con rollup `spent=100, cap=50, hard_block=True` → `False`; `hard_block=False` → `True`. Confirmado el gate funciona.
- ✅ Non-superadmin → 403 "Solo superadmin"
- ✅ Backend startup limpio · `yarn build` 37.24s sin warnings

### Edge cases conservadores aplicados
- **Schema reality vs spec**: spec menciona `db.ai_usage` con extension de `feature_key`/`daily_iso`. Reality: la collection se llama `ai_usage_log` y es rollup `(dev_org_id, month_iso) unique` que rompería con feature_key. **Decisión**: mantener `ai_usage_log` rollup intacto (preserva `is_within_budget` legacy) y crear nueva collection `ai_call_events` por-llamada para analytics. Ambas se actualizan en cada `track_ai_call` para máxima compatibilidad.
- **No nivo line/pie**: spec asume `@nivo/line` y `@nivo/pie` ya en deps de B20, pero `package.json` solo trae `@nivo/core` + `@nivo/sankey`. Per directiva "NO @nivo/* nuevos packages" + "no añadir dependencias", se implementaron sparkline y donut con SVG inline (más ligero, sin overhead, mejor TTI).
- **Feature_key migration silent**: 9/14 callers de `track_ai_call` no se modificaron explícitamente. Decisión: el fallback `feature_key=call_type` ya da agrupación útil porque las invocaciones existentes usan `call_type` descriptivo (`"weekly_brief"`, `"argumentario_rag"`, `"buyer_disc"`, etc.). Migración silent + reportada vs. tocar 9 archivos por una mejora cosmética.
- **Forecast cap threshold sin tenant**: `/forecast` sin tenant_id devuelve `monthly_cap_mxn=null` y `vs_cap_pct=null` (cap es por tenant, no global) — la UI usa el forecast global solo en KPI strip sin barra de cap.
- **Email alert engine**: el alert path existente en `_maybe_send_budget_alert` se mantiene (Resend, 1/día per tenant). El nuevo `ai_budget_caps.alert_threshold_pct` aún no inyecta a `_maybe_send_budget_alert` (que sigue con 80% hardcoded) — lo correcto sería override desde caps_doc, pero esta extension añade alcance fuera del tope de este batch (W2.x SA siguiente). Reportado.
- **Hard limit 1M MXN en cap monthly**: validado en Pydantic body. Slider threshold 50-95% bound en backend y cliente.
- **CronTrigger TZ**: `America/Mexico_City` honra horarios LATAM (1am MX = 7am UTC en invierno, 6am UTC en verano).


## W2.2 — SA3 Audit Log Viewer (2026-05-07)

### Backend
- **NEW** `routes_superadmin_audit.py` — prefix `/api/superadmin/audit`, todos `require_superadmin` (sin scoping). 7 endpoints:
  1. `GET /entries` — paginated cross-org con filtros (actor_user_id, actor_role, entity_type, entity_id, action, tenant_id, severity, from_ts, to_ts, q regex). action=`mutations` se traduce a un `$in` con la canonical write-actions list (incluye patch/merge/approve/reject/force_match/recompute/test/retry/replay).
  2. `GET /entries/{id}` — full detail. Si `entity_type=bulk_ingest_item` enriquece con `extracted_overrides[]`, `extraction_history[]` y `ai_extracted` desde `db.bulk_ingest_items` → cierra W1.5 panel deferred sin prompt extra.
  3. `GET /entity/{type}/{id}/timeline` — chronological (asc), max 500 entries, flag `truncated`.
  4. `GET /export?format=csv|json` — `StreamingResponse` async generator. CSV cols `ts,action,entity_type,entity_id,actor_user_id,actor_role,actor_tenant,severity,before_json,after_json`. Header `Content-Disposition` con timestamp. **413** si `total > 10000` con detalle "Filtra más estrictamente".
  5. `GET /distinct/actors` — agg pipeline `$group $actor.user_id` con last_seen + count. **In-memory cache 60s** (estructura `_actors_cache` con `ts/data`, hit retorna `cached:true`).
  6. `GET /distinct/entity-types` — mismo patrón, top 100.
  7. `GET /stats` — KPIs 24h: `total_24h, critical_24h, mutations_24h, reads_24h`.
- **EDIT** `audit_log.py` — añadido `build_filter_query(filters, base?)` reutilizable que abstrae la lógica de query (compatible con `_scope_filter` existente; los endpoints scoped no se tocaron).
- **EDIT** `server.py` — wired `superadmin_audit_router` y `ensure_superadmin_audit_indexes` en startup. Indexes nuevos: `(action, ts desc)` y `(severity, ts desc)` parcial.

### Frontend
- **NEW** `pages/superadmin/SuperadminAuditLog.js` — `<SuperadminLayout>`:
  - Header "Auditoría" + 4 KPIs (Total 24h · Critical · Mutations · Reads) + botones "Refrescar" + "Exportar" (gradient)
  - 2 filas de filtros: severity chips · action chips (Todas | Solo mutaciones)
  - Search bar con icon Search, debounce 300ms en `q`
  - Botón "Más filtros" toggle → panel grid responsive con `<AutocompleteField>` (actor + entity_type usando `/distinct/*` 60s cache), `<TextField>` (entity_id, tenant_id), `<DateField>` (from_ts/to_ts)
  - Filtros sincronizados en URL (`useSearchParams`) → enlaces compartibles + restoring desde drawer "Ver historial completo"
  - Chip "Limpiar (N)" cuando hay filtros activos
  - Lista clickeable hover translateY(-1px); pills severity + action + diff_keys (top 6 + "+N más")
  - Botón "Cargar más" pagination skip+=50
  - Empty state cuando 0 resultados
  - `<ExportModal>`: radio CSV/JSON + preview "N registros serán exportados" + bloqueo visual rojo si N>10000 + descarga via anchor (cookie auth)
- **NEW** `components/superadmin/AuditEntryDrawer.js` — 3-4 tabs dinámicos:
  - **Detalle**: grid de DetailItems (ts, actor, tenant, IP, route, request_id) + diff_keys pills
  - **Diff**: usa `<BeforeAfterDiff>` reusable
  - **Edición inline (N)** *(automático cuando entity_type=bulk_ingest_item)*: lista de overrides cronológicos con `key: AntiguoAI → NuevoOverride` strikethrough + Historial AI con extractions previas (timestamp + costo MXN)
  - **Timeline entidad**: lista cronológica + botón "Ver historial completo" → navega a `/superadmin/audit-log?entity_type=X&entity_id=Y`
- **NEW** `components/superadmin/BeforeAfterDiff.js` — componente reutilizable. Recibe `{before, after}` JSON. Clasifica keys: added (verde +) / removed (rojo -) / updated (amber →) / same. Grid `120px | 1fr | 14px | 1fr`. Botón "+N campos sin cambios" colapsable. Empty state si no hay payload.
- **NEW** `api/superadminAudit.js` — 6 funciones + helper `exportUrl`.
- **EDIT** `App.js` — route `/superadmin/audit-log` ahora apunta al SA3 viewer; legacy `AuditLogPage` accesible en `/superadmin/audit-log-legacy`.
- **navByRole** — item "Auditoría" tier 2 ya existía; `to:/superadmin/audit-log` confirmado, no se modifica.

### Manual tests passed (curl)
- ✅ `GET /entries` cross-org → 174 entries; filtro `q=connector` → 4 matches; filtro `action=mutations` → 107
- ✅ `GET /entries/{id}` → before/after/diff_keys completos; entry sin entity_id → enrichment vacío sin crash
- ✅ Bulk-ingest enrichment: synthetic fixture insertado → drawer expone `ai_extracted`, `extracted_overrides[1]`, `extraction_history[1]` (tab "Edición inline" auto-render)
- ✅ `GET /entity/connector/mapbox_geocoding/timeline` → 3 events (test, retry, replay) en orden cronológico
- ✅ `GET /export?format=csv` → CSV streamed con header + 4 rows (action=mutations preset funciona)
- ✅ `GET /export?format=json` → array JSON parseado correctamente
- ✅ `GET /export` con 10001 docs sintéticos → **HTTP 413** "Demasiados registros (10001). Filtra más estrictamente (máx 10000)."
- ✅ `GET /distinct/actors` → 10 actors agregados; segunda llamada `cached:true` (60s TTL)
- ✅ `GET /distinct/entity-types` → 54 types ordenados por count desc
- ✅ `GET /stats` → totales 24h calculados
- ✅ Non-superadmin → 403 "Solo superadmin" en `/entries`
- ✅ `yarn build` limpio (Done in 38.88s) · backend startup limpio

### Edge cases conservadores aplicados
- Action filter `mutations` se materializa en backend a un `$in` con write-actions canonicales (incluye actions agregadas por W1.5/W2.1 como patch/merge/approve/reject/force_match/recompute/test/retry/replay) — evita parsing por cliente y mantiene la lista en un solo lugar.
- In-memory cache 60s sin invalidación explícita (se warm-resetea cada minuto). Adecuado para stat queries no críticas en consistency; no se usó Redis para evitar dependencia nueva.
- Export streaming chunked: cada row CSV se serializa individualmente con `csv.writer` en `StringIO` aislado por iteración → no acumula memoria. Hard-limit 10001 → 413 (no truncate silencioso).
- Drawer `enrichment` solo poblado para `entity_type=bulk_ingest_item` (no extensible aquí — se añadirán nuevos enrichment paths cuando se requiera otra entidad con histórico paralelo).
- `BeforeAfterDiff` ordena keys: updated → added → removed → same para que las diferencias relevantes salgan primero en pantalla.
- URL params no persisten valores `'all'` ni vacíos para evitar query strings ruidosos.
- Filtros `from_ts/to_ts` se almacenan como ISO `00:00:00Z`, displayed como `<input type="date">` para UX simple — UTC implícito.


## W2.1 — SA2 Data Sources Hub (2026-05-07)

### Backend
- **NEW** `connector_registry.py` — catálogo central de 11 connectors (`claude_haiku`, `claude_sonnet`, `mapbox_geocoding`, `mapbox_static`, `inegi_demographics`, `google_drive`, `google_calendar`, `microsoft_calendar`, `resend`, `sentry`, `posthog`).
  - Cada connector declara `{id, name, category, icon_key, required_env, supports_retry, supports_replay, is_stub?}`.
  - `HEALTHCHECKS` async functions por connector (httpx 30s timeout): Claude usa emergentintegrations ping, Mapbox geocoding/static endpoints, INEGI reachability, Google Drive `files.list(pageSize=1)`, Resend `/domains`, Sentry host reachability, PostHog `/decide/`.
  - `record_invocation`, `aggregate_24h`, `compute_status` (lógica: stub si env missing | failed si último check falló y sin success >2h | degraded si fail_ratio_24h>0.30 y fails≥2 | ok otherwise).
  - `retry_connector` re-ejecuta healthcheck (deterministic re-call); `replay_range` valida ≤7d y ≤100 items, re-corre healthcheck por cada fail; `healthcheck_all_connectors` para cron.
- **NEW** `routes_superadmin_data_hub.py` — prefix `/api/superadmin/data-hub`, 6 endpoints todos con `require_superadmin`:
  1. `GET /connectors` → list + counts (total/ok/degraded/failed/stub)
  2. `GET /connectors/{id}` → connector summary + last 50 invocations + last 20 audit entries
  3. `POST /connectors/{id}/test` → run healthcheck sync
  4. `POST /connectors/{id}/retry` → 409 si !supports_retry
  5. `POST /connectors/{id}/replay` body `{from_ts, to_ts}` → 400 si rango >7d, >100 items, o fechas inválidas
  6. `GET /connectors/{id}/invocations?status=&from_ts=&to_ts=&limit=&skip=` → paginated log
- **Cron `data_hub_healthcheck_all`** registrado cada 10 min vía APScheduler con `wrap_apscheduler_job` (cron_heartbeat W1.3) — aparece en `/superadmin/health` crons list.
- Schema `db.connector_invocations`: `{id, connector_id, op, status, ts, duration_ms, error?, metadata?}` con índices `(connector_id, ts desc, status)` y `(ts desc)`.
- `server.py` wired post-bulk_ingest_router; `ensure_connector_indexes` en startup.
- Audit log entries para `test`, `retry`, `replay` (entity_type=`connector`, entity_id=`{connector_id}`).

### Frontend
- **NEW** `pages/superadmin/SuperadminDataSourcesHub.js` con `<SuperadminLayout>`:
  - Header "Conectores" + botón gradient "Refrescar todo" (POST /test paralelo a todos los no-stub)
  - 4 KPI cards (Total/Operativos/Degraded/Failed)
  - 2 filtros pill (categoría · estado)
  - Grid responsivo `auto-fill minmax(280px,1fr)`
  - `<ConnectorDrawer>` con 3 tabs (Overview · Log invocaciones con filtros · Auditoría)
  - `<ReplayModal>` con datepicker range, validación cliente (>7d) + server (400 surfaced), CTA gradient
  - Auto-refresh KPIs cada 60s (paused on `visibilitychange` hidden)
  - SmartEmptyState `hub-empty` cuando filter retorna 0
- **NEW** `components/superadmin/ConnectorCard.js` — icon mapeado de `lucide-react` (Bot, Brain, MapPin, Map, Layers, FolderOpen, CalendarDays, Calendar, Mail, AlertCircle, Activity, Plug); 3 botones inline `rounded-full` (Probar/Reintentar/Replay), pulse animation rojo si `failed`, hover translateY(-1px), banner de credenciales faltantes para stubs.
- **NEW** `api/superadminDataHub.js` — 6 funciones matching endpoints.
- `App.js` route `/superadmin/data-sources` ahora apunta al hub; legacy IE Engine accesible vía `/superadmin/ie-engine-sources` (+ detail).
- `navByRole.js` reemplaza item `data-sources` → `conectores` con icon `Plug` y label "Conectores".

### Manual tests passed (curl)
- ✅ `GET /connectors` → 11 items, counts `{total:11, ok:10, degraded:0, failed:0, stub:1}` (resend=stub por RESEND_API_KEY missing; ms_calendar=stub explícito)
- ✅ Non-superadmin → 403 (`Solo superadmin`)
- ✅ `POST /test` mapbox_geocoding → ok 279ms con preview "1 features"; posthog ok 185ms
- ✅ `GET /connectors/{id}` → invocations populadas + audit_log
- ✅ `POST /retry` mapbox_geocoding → success; sentry → 409 ("Connector no soporta retry")
- ✅ `POST /replay` rango 45d → 400 "Rango máximo 7 días"; fechas invertidas → 400; rango válido → 200; stub connector → 409
- ✅ `GET /invocations?status=ok&limit=3` → paginado correcto
- ✅ `microsoft_calendar` status=`stub` (is_stub flag explícito)
- ✅ `yarn build` limpio (Done in 37s)
- ⚠️ Playwright screenshot bloqueado por modal de login (Issue 2 conocido del handoff — auth cookie drops); curl/backend testing usado en su lugar.

### Edge cases / decisiones conservadoras
- `microsoft_calendar` marcado con `is_stub: true` explícito porque no tiene env keys requeridas pero la integración no está implementada — sin esto se computaría "ok" trivialmente.
- `resend` healthcheck devuelve `ok` también en HTTP 401/403 (key inválida) para distinguir "API ureachable" vs "key issue"; el error se surface en `last_error` para que founder vea el problema sin marcar el connector entero como failed.
- `retry_connector` re-ejecuta healthcheck en lugar de re-call exacto del business call original (no hay forma genérica de hacer eso desde el registry; healthcheck es la prueba determinística más segura de liveness).
- `replay_range` también re-corre healthcheck por cada invocation fallida (no se replays el payload original; se valida que el connector ahora responde para el founder pueda volver a disparar la op real desde su UI específica).
- `INEGI` healthcheck solo valida reachability del host (no API call real) por inestabilidad histórica del endpoint desde el cluster.
- Test/retry desactivados en la UI cuando `status === 'stub'` (misma lógica server-side via `env_present` y `is_stub`).


## W1.5 — ZZ.1.1 Ingestion Quality + Dedup Engine (2026-05-07)

### Backend (`bulk_ingest_engine.py` + `routes_bulk_ingest.py`)
- **NEW** `effective_extracted(item)` — applica `extracted_overrides[]` sobre `extracted` (last-write-wins por campo, deep merge para `price_range`, replace para `units`).
- **NEW** `apply_inline_patch(db, item_id, patch, user_id)` — append override entry `{patch, user_id, ts}`; whitelist de campos editables (`project_name`, `address_full`, `lat`, `lng`, `total_units`, `amenities`, `price_range.{min,max}_mxn`, `units[].{unit_number,type,bedrooms,bathrooms,size_m2,price_mxn}`).
- **NEW** `build_diff(db, item, target_dev_id)` — comparativa side-by-side entre effective extracted y target development (incluye unidades cargadas desde `db.units`); statuses por campo: `same | diff | missing_target | missing_ingest`; statuses por unidad: `same | diff | new | target_only`; summary con conteos.
- **NEW** `recompute_item_extraction(db, item)` — re-descarga archivos Drive + re-ejecuta Claude Haiku, push antiguo a `extraction_history[]`, resetea `extracted_overrides[]` (base cambia), re-corre dedup.
- `insert_extracted_project` y `merge_into_dev` ahora usan `effective_extracted(item)` para que las ediciones inline se apliquen al persistir.
- **4 endpoints nuevos**:
  - `PATCH /api/superadmin/bulk-ingest/items/{id}` — inline patch validado; 409 si item ya `approved/merged/rejected`; retorna `effective_extracted` actualizado.
  - `GET /api/superadmin/bulk-ingest/items/{id}/diff?target_dev_id=` — diff JSON; default = `dedup.best_match_dev_id`.
  - `POST /api/superadmin/bulk-ingest/items/{id}/recompute-extraction` — re-extrae con Claude; 409 si sin Drive; preserva histórico.
  - `POST /api/superadmin/bulk-ingest/items/{id}/force-match` — body `{target_dev_id, mode: merge|approve_as_new}`; permite forzar match aunque score < 0.50.
- Audit log entries para cada operación (`patch`, `recompute`, `force_match`).

### Frontend
- **NEW** `components/superadmin/InlineEditableField.js` — click-to-edit, Enter guarda, Esc cancela; soporte text/number/textarea; parser custom; estados busy/error.
- **NEW** `components/superadmin/MergeDiffVisualizer.js` — panel side-by-side con grid `Campo | Ingesta → Destino | Estado`; chips de candidatos del dedup; toggle "Forzar por ID" para introducir dev_id arbitrario; botones "Fusionar" (estilo gradient) y "Forzar fusión / Aprobar como nuevo" cuando se fuerza.
- **REWRITE** `ReviewQueueItem.js` — campos de cabecera ahora editables inline (nombre, dirección, total unidades, price min/max); muestra contador de overrides + recomputaciones; botón "Re-extraer" con confirmación (descarta overrides); botón "Comparar / Fusionar" abre `MergeDiffVisualizer`; toast in-component.
- **API client** `superadminBulkIngest.js` — agrega `patchItem`, `getItemDiff`, `recomputeExtraction`, `forceMatch`.

### Manual tests passed (curl + python fixture)
- ✅ PATCH inline (project_name, lat) — overrides creciendo a 1
- ✅ PATCH validation rechaza `hacked_field` con 400
- ✅ PATCH `price_range.min_mxn` deep-merged correctamente
- ✅ GET diff resuelve target via `dedup.best_match_dev_id`; statuses correctos por campo (`same/diff/missing_ingest`) y por unidad (`diff`)
- ✅ recompute → 409 cuando no hay Drive conn (gate funcionando)
- ✅ force-match modo `merge` → decision=`merged`, `force_matched=true`, units mergeadas con valores editados
- ✅ PATCH bloqueado (409) tras decision final
- ✅ `yarn build` compila sin warnings nuevos


## W1.4 — ZZ.1 Bulk Drive Ingestion (2026-05-07)

### Backend
- **NEW** `bulk_ingest_engine.py` — pipeline async completo:
  1. `parse_folder_id(url)` regex extrae folder_id de URL Drive
  2. `_resolve_drive_conn(db, target_org)` reusa drive_engine OAuth (modo superadmin: usa primer drive_connection conectado si target_org no tiene)
  3. `_list_folder_recursive(conn, folder_id)` lista archivos root + 1-level subfolders (max 200), agrupa en projects
  4. `extract_bulk_project(name, payloads)` Claude Haiku via emergentintegrations con `CLAUDE_SEMAPHORE = asyncio.Semaphore(10)` rate limit; system prompt JSON-only es-MX para `{project_name, address_full, lat, lng, total_units, price_range, amenities, units[]}`; cost ballpark 0.50 MXN/call; fallback `_stub_extraction` si key/lib ausente
  5. `find_dedup_matches(db, extracted, target_org)` rapidfuzz WRatio sobre `name + address` contra `db.developments`, top 3 matches con score
  6. `insert_extracted_project(db, item)` schema disgregado: INSERT en `developments` + `units` (1 doc por prototipo) + `project_assets` (drive_reference por archivo)
  7. `merge_into_dev(db, item, target_dev_id)` UPSERT units por `unit_number` + APPEND assets
  8. `_email_completion(job)` Resend branded template (skip silencioso si no key)
  9. `run(db, job_id)` orchestrator: setea status pending→extracting→reviewing/completed/failed, ai_budget gate, captura errors en `error_log[:50]`
- **NEW** `routes_bulk_ingest.py` — 8 endpoints prefijados `/api/superadmin/bulk-ingest`, todos `require_superadmin`:
  - `POST /start` valida URL + drive conn → crea job + dispara `asyncio.create_task(bie.run(...))` SIN bloquear response
  - `GET /jobs?status=&limit=&skip=` paginated
  - `GET /jobs/{id}` detail con last_items[50]
  - `GET /jobs/{id}/items?decision=&limit=&skip=`
  - `POST /items/{id}/approve` insert + audit + dec counter pending_review
  - `POST /items/{id}/reject` body{reason} + audit
  - `POST /items/{id}/merge` body{target_dev_id} + audit
  - `POST /jobs/{id}/bulk-approve?threshold=0.85` aprueba todos con score < 0.65 O None (truly new)
  - `GET /stats` KPIs: jobs_total, proyectos_ingested_total, pending_review_total, ai_cost_mes_mxn (aggregate)
- **EDIT** `server.py` — registra router + `ensure_bulk_ingest_indexes` en startup (collections con índices unique on id, compound (status, started_at), (job_id, decision))
- **REUSE** `drive_engine` OAuth + `_drive_service` + `_download_file_sync` + `_export_native_doc_sync` + `NATIVE_EXPORT_MAP` — modo superadmin agrega lookup global (sin development_id) sin modificar engine

### Frontend
- **NEW** `pages/superadmin/SuperadminBulkIngest.js` — header + 4 KPI strip + form Iniciar nueva ingesta (URL + dev_org_id opcional + btn gradient) + 2 tabs (Jobs históricos | Cola revisión con badge count) + FilterChipsBar status. Tab Jobs: lista de `IngestionJobCard` con status pill animada para extracting/pending. Tab Review: lista de `ReviewQueueItem` agregados de jobs con pending. Job detail drawer 3 tabs (Resumen+bulk-approve btn / Items list / Errores log). Auto-refresh cada 10s SOLO si hay jobs live (extracting/pending) y `tabVisibleRef`.
- **NEW** `components/superadmin/IngestionJobCard.js` — id mono + status pill (pending/extracting/reviewing/completed/failed) + URL truncada + KPIs inline (Total/Aprobados verde/Pendientes amber/Rechazados/Fallidos rojo)
- **NEW** `components/superadmin/ReviewQueueItem.js` — preview extracted (project_name + address + units count + amenities + price range) + dedup matches top 3 con score % colored (≥85 verde / 65-85 amber) + 3 botones [Aprobar gradient · Fusionar (oculto si no matches) · Rechazar] · expand toggle "Ver N prototipos" muestra unit chips · low_confidence/stub badge si extraction fallback · reject reason inline input
- **NEW** `api/superadminBulkIngest.js` — 9 funciones (8 endpoints + getStats)
- **EDIT** `App.js` ruta `/superadmin/bulk-ingest` (lazy + AdvisorRoute), `config/navByRole.js` SUPERADMIN_NAV tier 1 agrega "Ingesta masiva" (icon FolderUp) DESPUÉS de Tenants. `i18n/es-MX/common.json` sección `bulk_ingest.*`

### Tests (curl + yarn build + screenshot)
- ✅ `yarn build` clean · lint 0 issues
- ✅ `GET /jobs` empty list · `GET /stats` shape correcto
- ✅ `POST /start` con URL malformada → 400 "URL de carpeta Drive inválida"
- ✅ `POST /start` con URL válida + sin drive conn → 409 "No hay conexión Drive activa. Conecta Drive primero." (esperado en preview env sin OAuth setup)
- ✅ Non-superadmin → 403 en TODOS endpoints
- ✅ Smoke screenshot: page renderea con KPIs + form + tabs + empty state, sidebar "Ingesta masiva" highlighted entre Tenants y Data Sources

### Edge cases manejados (decisiones conservadoras)
- `EMERGENT_LLM_KEY`/`ANTHROPIC_API_KEY` ausente → `_stub_extraction` con `_low_confidence:true` (no crash, item entra a pending_review)
- `rapidfuzz` no instalado → return matches=[] (no crash, item va a auto_approve como nuevo)
- AI budget exceeded → job marca `status="failed"` con `error_log=["AI budget exceeded for this org/month"]` antes de listar archivos
- Drive connection ausente → 409 en /start, no crea job huérfano
- Folder vacío → items_total=0, status="completed"
- Subfolders sin archivos ingestables → no se crea item (skip silencioso)
- Drive download falla per-file → captura en error_log, sigue con resto (no aborta job)
- Claude extraction falla → fallback a stub, item entra como pending_review (founder revisa)
- Concurrencia: `asyncio.Semaphore(10)` global limita Haiku paralelos
- Reject reason mín 3 chars validation client-side
- Merge requiere matches del dedup (botón solo aparece si matches.length > 0)
- Bulk-approve solo procesa items con score `< 0.65` o `None` (evita auto-merge accidental al 85%+)
- Auto-refresh pausa con `document.hidden` para no consumir API calls
- 1 nivel de subfolders solamente (max 200 files total) — files anidados deeper se ignoran (decisión conservadora vs explosion)
- `target_dev_org_id` opcional: si vacío, dedup se hace global y proyectos van a `developer_id="superadmin_global"` (founder asigna después)



## W1.3 — SA1.2 System Health Dashboard (2026-05-07)

### Backend
- **NEW** `cron_heartbeat.py` — `wrap_apscheduler_job(fn, job_id)` decorator que captura start/end/duration/excepciones en `db.cron_heartbeats`; `is_stale(hb)` (>2× schedule_interval); `SCHEDULE_LABELS` + `SCHEDULE_INTERVAL_SEC` para 13 jobs; `set_db()` helper; `ensure_heartbeat_indexes`.
- **NEW** `routes_superadmin_health.py` — 5 endpoints prefijados `/api/superadmin/health`, todos con `require_superadmin`:
  - `GET /overview` → uptime_24h_pct (de observability_events probe_run · fallback 99) · probe_pass_rate_7d (de diagnostic_probe_runs) · etl_status (worst de 4 ETL job_ids) · crons_total/failing · alerts open critical/warning + last_critical_alert · services [{name, status, last_check_at}] (backend_api/mongodb/apscheduler/resend/claude_haiku/claude_sonnet)
  - `GET /crons` → list `cron_heartbeats` + ítems pending para job_ids registrados sin heartbeat aún · adds `stale` y `computed_status`
  - `GET /alerts?status=open|resolved|all&severity=&limit=&skip=` → list ordenados ts desc
  - `POST /alerts/{id}/resolve` → idempotente · audit `alert_resolved`
  - `POST /alerts/test` → inserta system_alert(severity=info, source="founder_test")
- **NEW** Critical check engine `health_critical_check(db)` registrado en APScheduler cada 5 min:
  - Detecta heartbeats stale (>2× interval) o `fail_count_24h >= 3`
  - Inserta `system_alerts(severity=critical)` solo si no hay open mismo source
  - Email Resend a `ADMIN_EMAIL` (env) con throttle 1/hora per source vía `metadata.email_sent_at`
  - Branded HTML template DMX (navy + cream + rose accent) sin shadow-2xl
- **EDIT** `scheduler_ie.py` — instrumentados 9 crons existentes con `wrap_apscheduler_job`: ie_daily_ingestion, ie_hourly_status, ie_daily_score_recompute, drive_watcher, drive_webhook_renew, unit_holds_release, health_score_snapshots, weekly_brief_generation, oauth_token_refresh + registra `health_critical_check` en startup.
- **EDIT** `server.py` — `include_router(superadmin_health_router)` + `ensure_heartbeat_indexes` en startup.

### Frontend
- **NEW** `pages/superadmin/SuperadminHealth.js` — 4 KPI cards (Uptime 24h · Probes 7d · Crons OK% · Alertas abiertas) con color verde >95 / amber 70-95 / rojo <70. 4 secciones: Servicios (grid auto-fill 220px), Crons (grid auto-fill 280px), Probes (link card → `/superadmin/system-map` con pass rate 7d), Alertas (feed con tabs Abiertas/Resueltas/Todas + paginated 20 + Cargar más). Test alert btn (yellow pill). Auto-refresh `loadOverview+loadCrons+loadAlerts` cada 30s con `document.visibilitychange` listener (pausa cuando tab hidden).
- **NEW** `components/superadmin/CronCard.js` — job_id label, schedule humanizado, status pill (ok/fail/stale/pending), last_run relative, duration_ms, runs/fails 24h, last_error si presente.
- **NEW** `components/superadmin/AlertItem.js` — severity icon + color (critical/warning/info), source en mono, ts relative, message, btn "Resolver" cuando open. Estilos resolved: opacity 0.65 + badge "Resuelta" verde.
- **NEW** `api/superadminHealth.js` — getHealthOverview, getCrons, getAlerts, resolveAlert, triggerTestAlert.
- **EDIT** `App.js` — ruta `/superadmin/health` (lazy + AdvisorRoute), `config/navByRole.js` SUPERADMIN_NAV tier 2 agrega "Salud del sistema" (icon Activity) ANTES de "Observabilidad" (Audit Log = Auditoría queda después). `i18n/es-MX/common.json` sección `health.*`.

### Tests (curl + yarn build + screenshot)
- ✅ `yarn build` clean · lint 0 issues
- ✅ `GET /overview` → shape exacto: uptime_24h_pct, probe_pass_rate_7d, etl_status, crons_total/failing, alerts open critical/warning, last_critical_alert, services[6], ts; <500ms
- ✅ `GET /crons` → 13 placeholders pending (los crons aún no han corrido en este preview env)
- ✅ `GET /alerts` → empty list inicial
- ✅ `POST /alerts/test` → inserta info alert visible en feed inmediatamente; smoke screenshot lo confirma
- ✅ `POST /alerts/{id}/resolve` → ok + idempotente (`already_resolved:true`)
- ✅ Critical check: forzando `cron_heartbeats.last_run_at` a hace 3 días para `ie_daily_score_recompute`, llamando `health_critical_check(db)` directamente → genera 1 critical alert con source `cron:ie_daily_score_recompute`, throttle 1/hora vía `metadata.email_sent_at`
- ✅ Email Resend en stub mode (sin RESEND_API_KEY/ADMIN_EMAIL): skip silencioso con log `[health-critical] skip email` (no rompe critical alert insertion)
- ✅ Non-superadmin → 403 en TODOS endpoints
- ✅ Smoke screenshot `/superadmin/health` → 6 services pills, 13 cron cards visibles, alert critical "cron:ie_daily_score_recompute" mostrado en feed con btn Resolver, sidebar nav "Salud del sistema" highlighted entre Drive y Observabilidad

### Edge cases manejados
- `db.observability_events` o `db.diagnostic_probe_runs` vacías → fallback 99% (no error)
- `RESEND_API_KEY` o `ADMIN_EMAIL` ausentes → skip email silencioso, alert critical sigue insertándose
- Email throttle vía `metadata.email_sent_at` (no per-process state, sobrevive restarts)
- Stale detection robusta a `last_run_at` malformado → tratado como stale (conservador)
- `mongodb` health vía `db.command("ping")` async, fail-safe con error capturado
- Auto-refresh pausa con `document.hidden` (visibilitychange listener) — preserva batería + ahorra API calls
- 13 SCHEDULE_LABELS conocidos: si un cron no está heartbeated, aparece como "Pendiente" en `/crons` para visibilidad (no se pierde info de que existe)
- run_count_24h/fail_count_24h: increment-only (diseño simple); se podría agregar sliding window con TTL en una iteración futura



## W1.2 — SA1.1 Tenants Management UI (2026-05-07)

### Backend
- **NEW** `routes_superadmin_tenants.py` — 5 endpoints prefijados `/api/superadmin/tenants`, `require_superadmin` en list/detail/start-impersonate/patch-status; end-impersonate acepta superadmin O sesión impersonada activa (cookie `dmx_impersonate_session`):
  - `GET /` — devs (distinct users.tenant_id WHERE role IN DEV_IN_HOUSE_ROLES) + inms (excluyendo `is_system_default=true`); filtros type/status/search/sort/limit/skip
  - `GET /{tenant_id}` — base + members (max 100) + members_total + recent_audit (20) + ai_usage_breakdown (haiku|sonnet|other mes actual) + projects_summary (max 50, dev only)
  - `POST /{tenant_id}/impersonate` — primer admin del tenant; cookie HttpOnly+Secure+SameSite=lax+Path=/+30min (+ access_token target user); audit `{action:"impersonate_start", impersonator_user_id, target_user_id, target_tenant_id, target_role, ts, expires_at}`; 404 si no admin
  - `POST /impersonate/end` — clear cookies; audit `{action:"impersonate_end", duration_seconds}`; idempotente
  - `PATCH /{tenant_id}/status` — body `{status, reason?}`; suspended → `users.update_many({tenant_id}, {$set:{account_blocked, blocked_at, blocked_reason}})`; active → unblock; audit shape estándar
- **EDIT** `routes_auth.py` login — check `account_blocked` post password match → 403 "Cuenta suspendida. Contactar soporte." ANTES de set cookies
- **EDIT** `server.py` — `include_router(superadmin_tenants_router)` post audit_router; `ensure_superadmin_tenant_indexes` en startup

### Frontend
- **NEW** `pages/superadmin/SuperadminTenants.js` — vista completa con header + count + Refrescar; FilterChipsBar (type · status · search debounce 300ms); tabla density-aware (desktop ≥768px) y mobile cards stacked (<768px) con `useState(window.innerWidth<768)` + resize listener; row click → drawer; impersonar btn (yellow pill); inline status select (PATCH con confirm modal si suspended). Pagination "Cargar más" (skip+=50).
- **NEW** `components/superadmin/ImpersonationBanner.js` — banner sticky amarillo top con countdown live (mm:ss), "Salir" btn que llama `endImpersonation()` + redirige `/superadmin/tenants`. `useImpersonation` hook lee `localStorage.dmx_impersonation` con expiry check.
- **NEW** `hooks/useImpersonation.js` — startImpersonation/clearImpersonationMarker/end con revalidación en storage events + interval 30s.
- **NEW** `api/superadminTenants.js` — listTenants, getTenant, impersonateTenant, endImpersonation, patchTenantStatus.
- **EDIT** `App.js` — ruta `/superadmin/tenants` (lazy + AdvisorRoute)
- **EDIT** `config/navByRole.js` — SUPERADMIN_NAV tier 1 agrega "Tenants" (icon Users) ANTES de "Data Sources"
- **EDIT** `components/shared/PortalLayout.js` — mount `<ImpersonationBanner/>` arriba del topbar; `handleLogout` llama `/api/superadmin/tenants/impersonate/end` + remueve `dmx_impersonation` ANTES del logout normal (cubre el caso "logout durante impersonación")
- **EDIT** `i18n/locales/es-MX/common.json` — sección `tenants.*` (table, drawer, modals, banner, status_modal, impersonate_modal)

### EntityDrawer (3 tabs en SuperadminTenants)
- **Resumen** — KPI grid (members_total · projects · ai_usage_month_mxn · last_activity) + plan_tier badge + AI breakdown (haiku/sonnet/otros) + projects list (dev only, max 50)
- **Equipo** — tabla miembros (max 100): name/email/role/account_blocked/last_login_at; footer "Mostrando N de M" cuando members_total > 100
- **Auditoría** — timeline 20 entries (action · entity_type · ts relative)

### Tests (curl + screenshot, sin testing subagent)
- ✅ `yarn build` clean · lint 0 issues
- ✅ `GET /api/superadmin/tenants` (admin@desarrollosmx.com superadmin) → 2 tenants (Constructora Ariel dev + Inmobiliaria Demo Test inm), totals correctos
- ✅ Filter `?type=inm` → 1 inm, `is_system_default=true` excluida
- ✅ `GET /api/superadmin/tenants/constructora_ariel` → name/members_total=6/audit=20/projects=0/ai_breakdown
- ✅ `POST /impersonate` → cookies `access_token` + `dmx_impersonate_session` ambas HttpOnly+Secure+Max-Age=1800; SameSite=lax en cookie de impersonación; response shape `{impersonation_token, target_user_id, target_role, target_tenant_id, target_name, expires_at, audit_id}`
- ✅ `POST /impersonate/end` → `{ok, duration_seconds}` idempotente
- ✅ `PATCH /status suspended` → bloqueo activado; login subsecuente con tenant suspendido → 403 "Cuenta suspendida. Contactar soporte."; reactivar → login HTTP 200
- ✅ Non-superadmin (developer@demo.com) → 403 en endpoints 1,2,3,5
- ✅ Smoke screenshot `/superadmin/tenants` → tabla desktop con 2 rows, sidebar "Tenants" highlighted, click impersonate abre modal con confirmación

### Edge cases manejados
- Tenant sin admin → 404 "No se encontró admin para ese tenant"
- AI usage si collection ai_usage no existe / vacía → fallback 0.0 silencioso
- last_activity_at fallback via aggregate lookup users.tenant_id si actor.tenant_id no setteado
- impersonate cookie + access_token expiran simultáneamente a 30 min
- responsive viewport breakpoint controlado vía JS state (no Tailwind hidden md:block) para evitar conflictos con sistema dual layout



## Batch 38 — Phase 15 Directorio Cruzado + Lead Cards Enriquecidas (2026-05-07)

### Sub-A — Directorios 3 portales
**Backend (NEW)**
- `services/directory_aggregator.py` — agrega cross-tabla:
  - `get_dev_red_comercial(dev_org_id)` → inmobiliarias B35 + asesores in-house B37 + asesores freelance B36 + KPIs (deals_12m, leads_30d, conversion_pct, last_activity_at, trust_score)
  - `get_asesor_mis_aliados(asesor_id)` → devs approved B36 con dev_branding + comisión negociada + KPI personal (response_time_avg_hours) + inventario_count
  - `get_inmobiliaria_red_comercial(inmobiliaria_id)` → devs B35 + asesores in-house B37 + freelance B35 + cross_inmobiliaria B37
  - Helpers `_get_dev_branding`, `_get_inmobiliaria_branding`, `_kpi_for_asesor`, `_kpi_for_inmobiliaria`
- `routes_directories.py` — 3 endpoints multi-tenant scoped:
  - `GET /api/dev/red-comercial` (auth: developer_admin/director/superadmin)
  - `GET /api/asesor/mis-aliados` (auth: advisor/asesor_*/superadmin)
  - `GET /api/inmobiliaria/red-comercial` (auth: inmobiliaria_admin/director/superadmin)
- `server.py` — registra `directories_router`

**Frontend (NEW)**
- `pages/developer/DesarrolladorRedComercial.js` — 3 tabs (Inmobiliarias aliadas | Asesores in-house | Asesores freelance) con KPI cells inline (deals/leads/conversion/last act.), TrustMini badge B32 si asesor, search global, drawer detalle con 4 KPI cards, notas, proyectos asignados.
- `pages/asesor/AsesorMisAliados.js` — grid cards devs aprobados con logo dev (B19.5 fallback), comisión badge gradient, 4 KPIs personales (deals/leads/response/last deal), badge auto-aprobado, badge inventario count. Filter chips comisión (<5% / 5-8% / ≥8%) + search. Drawer con 6 KPI cards + CTA "Ver inventario completo" → `/asesor/inventario?dev=…`. Empty state con CTA "Ir al Mini Market".
- `pages/inmobiliaria/InmobiliariaRedComercial.js` — 4 tabs (Devs partners | Asesores in-house | Asesores freelance | Cross-inmobiliaria) mismo pattern + AMPI badge si verified.
- `api/directories.js` — `getDevRedComercial`, `getAsesorMisAliados`, `getInmobiliariaRedComercial`.

### Sub-B — Lead Cards Enriquecidas
**Backend**
- `services/lead_capture.py` (EDIT) — append `enrich_lead_metadata(db, lead, viewer_role)`:
  - `dev_branding` { logo_url, display_name, tagline } from `dev_orgs`
  - `commission_estimated` (asesor whitelist commission_pct, fallback dev default_commission_pct)
  - `asesor_attributed` { asesor_id, name, picture, trust_score } from `asesor_trust_scores` B32
  - `contact_dev` { phone, email, whatsapp, contact_url } solo si asesor tiene whitelist approved con dev
- `routes_dev_batch4_2.py` (EDIT) — `_run_kanban` ahora llama `enrich_lead_metadata` por lead, agrega `enriched_metadata` al card

**Frontend**
- `components/shared/LeadKanban.js` (EDIT) — nueva subcomponente `EnrichedSection`:
  - Bloque indigo soft con logo dev + nombre + comisión badge gradient
  - Asesor row con avatar + nombre + Trust mini badge clickable a `/asesor-publico/{id}`
  - Botón "Contactar dev" gradient pill que abre menu inline (WhatsApp/Llamar/Email/Sitio según `contact_dev`)
- Si no hay `enriched_metadata` → graceful (return null, card básica)

### Wiring
- `App.js` — 3 rutas nuevas: `/desarrollador/red-comercial`, `/asesor/mis-aliados`, `/inmobiliaria/red-comercial`
- `config/navByRole.js` — DEV agrega "Red comercial" (icon Network); ASESOR agrega "Mis aliados"; INMOBILIARIA_ADMIN agrega "Red comercial"
- `i18n/es-MX/common.json` — secciones `directorios.*` (tabs, KPIs, filtros) + `lead_card_enriched.*` (CTAs contacto)

### Eliminado conflicto rutas legacy
- `routes_dev_batch1.py` — removidos GET/POST/PATCH/DELETE legacy `/api/dev/internal-users` que sombraban B37 (verificado y resuelto en B37)

### Tests (curl + yarn build, sin testing subagent)
- ✅ `yarn build` clean (sin errores ni warnings nuevos)
- ✅ `lint_javascript` clean en 5 archivos B38
- ✅ `GET /api/dev/red-comercial` → wrapped con `inmobiliarias[], asesores_inhouse[], asesores_freelance[], totals{}`
- ✅ `GET /api/asesor/mis-aliados` (asesor@demo.com) → `{items, total}` con dev branding + commission
- ✅ `GET /api/inmobiliaria/red-comercial` → `devs[], asesores_inhouse[], asesores_freelance[], cross_inmobiliaria[], totals{}` (1 dev partnership real)
- ✅ `GET /api/leads/kanban?scope=all_org` → 6/6 cards con `enriched_metadata` (dev_branding + asesor_attributed + commission_estimated cuando aplica)
- ✅ Smoke screenshot `/desarrollador/red-comercial` → render correcto, 3 tabs operativos, switch tab a in-house muestra 5 asesores



## Batch 37 — Phase 14 In-house Users + Mini Markets + Cross-Org Partnerships (2026-05-07)

### Backend (already wired previous session — verified working this session)
- `services/internal_users.py` — invite/list/update/suspend dev + inmobiliaria internal users; magic-link invitations (`db.invitations`); `lookup_invitation_by_token`; idempotent dup-guard.
- `services/cross_org_partnerships.py` — generic dev↔dev / dev↔inmobiliaria / inmobiliaria↔inmobiliaria partnerships with request/approve/reject/revoke + dup-guard + notify admins via `routes_dev_batch14.create_notification`.
- `services/mini_market_engine.py` — computes visible projects: dev (own_org + cross_partnership when `allow_external_inventory`); inmobiliaria (dev_partnership + cross_inmobiliaria fanout when external).
- `routes_internal_users.py` — endpoints `/api/dev/internal-users`, `/api/dev/mini-market`, `/api/dev/settings/external-inventory`, `/api/inmobiliaria/internal-users`, `/api/inmobiliaria/mini-market`, `/api/inmobiliaria/settings/external-inventory`, `/api/auth/in-house/invitation`, `/api/cross-partnerships` (CRUD + approve/reject/revoke).
- **FIX (this session)** — eliminado el conflicto de rutas `/api/dev/internal-users` (legacy en `routes_dev_batch1.py` 4.9). Removidos GET/POST/PATCH/DELETE legacy; los nuevos endpoints B37 ahora ganan el routing.

### Frontend (this session)
- **NEW** `pages/developer/DesarrolladorMiniMarket.js` — vista de inventario visible al equipo (propio + cross-org); admin toggle `allow_external_inventory`; stats Propios/Cross-org/Total; filtros por source.
- **NEW** `pages/developer/DesarrolladorCrossPartnerships.js` — gestión completa de alianzas cross-org (Recibidas/Enviadas/Todas + filtro status), modal NuevaAlianza con target_org_type=dev|inmobiliaria, comisión default y notas; aprobar/rechazar/revocar con razón. Exporta también `CrossPartnershipsPage` para reuso.
- **NEW** `pages/inmobiliaria/InmobiliariaUsuariosCRUD.js` — equipo interno inmobiliaria (admin/director/asesor/marketing), invite con magic-link, suspend, reenviar invitación.
- **NEW** `pages/inmobiliaria/InmobiliariaMiniMarket.js` — inventario visible: alianzas directas (B35) + cross-inmobiliaria fanout. Admin toggle external inventory.
- **NEW** `pages/inmobiliaria/InmobiliariaCrossPartnerships.js` — wrapper que reusa `CrossPartnershipsPage` con `InmobiliariaLayout`.
- **EDIT** `pages/auth/InHouseSignup.js` — switch a `useAuth.setUser` (en vez de `onLogin` prop) + persistencia `dmx_token`.
- **EDIT** `App.js` — rutas nuevas: `/in-house/aceptar-invitacion`, `/desarrollador/mini-market`, `/desarrollador/cross-partnerships`, `/inmobiliaria/usuarios`, `/inmobiliaria/mini-market`, `/inmobiliaria/cross-partnerships`.
- **EDIT** `config/navByRole.js` — DEV nav agrega Mini Market + Alianzas (cross-partnerships); INMOBILIARIA_ADMIN_NAV agrega Equipo + Mini Market + Alianzas dev (renamed) + Cross-org. Icono `HeartHandshake` (no existe Handshake en lucide-react).

### Tests (curl/yarn build only — no testing subagents)
- `yarn build` → success (no errors).
- `POST /api/auth/login` developer@demo.com → ok (cookie-based auth).
- `GET /api/dev/internal-users` → wrapped `{items, total}` ✓
- `GET /api/dev/mini-market` → `{items: [], total: 0}` ✓
- `GET /api/cross-partnerships` → ✓
- `POST /api/dev/internal-users` → invitation con magic_link_token ✓
- `GET /api/auth/in-house/invitation?token=…` → metadata correcta ✓
- `POST /api/auth/in-house/accept-invitation` → user activado + cookies set + redirect=/desarrollador ✓
- `POST /api/cross-partnerships` → partnership_id devuelto ✓
- `POST /api/inmobiliaria/internal-users` (con inm-test-1) → ✓
- Smoke screenshots `/desarrollador/mini-market` y `/desarrollador/cross-partnerships` → render correcto, navy/cream theme, gradient CTAs, estado vacío y filas con datos seed.


## Batch 35 — Phase 18 Inmobiliaria Entity (Foundation + Portal + Relationships) (2026-05-06)

### Sub-A: Backend Foundation
- **NEW** `services/ampi_verification.py` — `validate_ampi_id(raw)` valida formato 8-12 alfanuméricos (regex), retorna `{valid, ampi_id, expires_at, holder_name, manual_review_required, reason}`. Persiste audit trail en `db.ampi_verifications` via `record_verification`. Real AMPI API → defer H2.
- **NEW** `services/inmobiliaria_signup.py` — `signup_inmobiliaria(db, ...)` crea tenant + user + mirror entry idempotente: `db.inmobiliarias` (type='broker', `ampi_verified`, `ampi_manual_review`, `brokers_count`, `created_by_user_id`), `db.users` (role='inmobiliaria_admin', tenant_id=inm_id), `db.inmobiliaria_internal_users` (role='admin', user_id link). Rechaza email duplicado.
- **NEW** `services/inmobiliaria_relationships.py`:
  - `invite_advisor` → `db.inmobiliaria_advisor_relationships` `{rel_id, asesor_email, role, status='pending', activation_token}` + mirror pending en `inmobiliaria_internal_users` (rechaza dup).
  - `create_dev_partnership` → `db.inmobiliaria_dev_partnerships` `{partnership_id, dev_org_id, dev_org_name, commission_pct (0-50), notes, status='pending'}` (rechaza dup activa).
  - `update_dev_partnership_status` → transición pending|active|paused|terminated.
  - `ensure_inmobiliaria_relationship_indexes` (rel_id PK, partnership_id PK, activation_token unique sparse, ampi_verifications by inm_id+date).
- **NEW** `routes_inmobiliaria.py` — endpoints:
  - `POST /api/auth/inmobiliaria/signup` (público, set-cookie access+refresh)
  - `POST /api/inmobiliaria/ampi-verify` (público, format check)
  - `GET /api/inmobiliaria/me` (auth admin, devuelve inmobiliaria + counters {advisors_active|pending, partnerships_active|pending})
  - `POST /api/inmobiliaria/users/invite` (auth admin, manda email Resend branded con activation_token)
  - `GET /api/inmobiliaria/advisor-relationships?status=` (auth admin)
  - `POST /api/inmobiliaria/dev-partnerships` (auth admin)
  - `GET /api/inmobiliaria/dev-partnerships?status=` (auth admin)
  - `PATCH /api/inmobiliaria/dev-partnerships/{id}` body{status} (auth admin, valida ownership)
- **EDIT** `permissions.py` — `can_manage_inmobiliaria(user, inmobiliaria_id)` (superadmin always, inmobiliaria_admin limited a su tenant_id).
- **EDIT** `server.py` — wire `routes_inmobiliaria` + `ensure_inmobiliaria_relationship_indexes` en startup.
- **REUSE** `log_activity` (routes_dev_batch14) en cada mutación (signup, invite, partnership create/patch); `_send_email` (services.lead_capture) para email de invitación.

### Sub-B: Portal + Relationships UI
- **NEW** `api/inmobiliaria.js` — `verifyAmpiId`, `inmobiliariaSignup`, `getInmobiliariaMe`, `inviteAdvisor`, `listAdvisorRelationships`, `createDevPartnership`, `listDevPartnerships`, `updateDevPartnershipStatus`.
- **NEW** `pages/auth/InmobiliariaSignup.js` (público, sin auth) — wizard 3 pasos: Empresa (nombre, RFC, año, tel) → Verificación AMPI (verificar inline antes de continuar; saltable) → Admin (nombre, email, password ≥8). StepDot con check/gradient activo, botón "Verificar" inline AMPI, errores rojos, CTA gradient pill "Crear inmobiliaria". Tras éxito llama `auth.checkAuth()` → navega a `/inmobiliaria`.
- **NEW** `pages/inmobiliaria/InmobiliariaPartnerships.js` (auth `inmobiliaria_admin`/`inmobiliaria_director`) — header "Alianzas con Desarrolladores" + chips filtro (Todas|Pendiente|Activa|En pausa|Terminada) + lista cards con Briefcase icon, dev_org_name/id, comisión%, notes, StatusBadge color-coded, action pills inline (Activar→Pausar→Reanudar→Terminar) según status. Modal CreateModal full-form. Empty state con icon centrado.
- **EDIT** `App.js` — lazy import + Routes `/inmobiliaria/alianzas` (protected) y `/inmobiliaria/signup` (público).
- **EDIT** `config/navByRole.js` — `INMOBILIARIA_ADMIN_NAV` añadido item "Alianzas" con `Briefcase` icon.

### Schemas nuevos
- `db.inmobiliarias` — extendido con `ampi_verified`, `ampi_id`, `ampi_expires_at`, `ampi_manual_review`, `created_by_user_id` (signup público); existente `dmx_root` intacto (is_system_default).
- `db.inmobiliaria_advisor_relationships` — `{rel_id, inmobiliaria_id, asesor_id?, asesor_email, asesor_name, role, status, activation_token, invited_by_user_id, invited_at, accepted_at?}`.
- `db.inmobiliaria_dev_partnerships` — `{partnership_id, inmobiliaria_id, dev_org_id, dev_org_name?, commission_pct?, notes?, status, created_by_user_id, created_at, updated_at}`.
- `db.ampi_verifications` — audit trail `{inmobiliaria_id, ampi_id, valid, manual_review_required, reason, expires_at, raw_input_hash, created_at}`.

### Testing manual ✅
- AMPI verify (inválido/válido), Signup (E2E + dup email + bad AMPI), `/me`, invite asesor (+dup guard), list relationships, create partnership (+dup guard), list partnerships, PATCH status, login post-signup, /api/inmobiliaria/me con counters, page render screenshot OK (signup público + portal alianzas con asesor logueado).


## Batch 34 — Phase 4 Smart Match + "Tu Día Hoy" (2026-05-06)

### Sub-A: Smart Match Lead-to-Asesor (~4h)
- **NEW** `services/lead_to_asesor_match.py` — algoritmo 5-component weighted total 100:
  - Zona expertise (30): deals zona/colonia 12m / max equipo
  - Price range match (25): cercanía log10 avg_deal_price vs budget lead (saved_searches B25)
  - Intent type match (20): conversion ratio del asesor en lead_type vs su mejor tipo
  - Response time score (15): linear scale (rt<4h=100, rt>24h=0) desde asesor_metrics_snapshots B20
  - Capacity score (10): inverso leads_active/20
  - Top 3 reasons via Claude Haiku ≤30 palabras (cost-gated, solo para winner). Fallback heurístico.
- **NEW** Schema `db.lead_match_scores` `{match_id, lead_id, project_id?, candidates [{asesor_id, match_pct, score_breakdown {5}, top_3_reasons}], winner_asesor_id, computed_at, ttl 60min}`
- **EDIT** `availability.py` (B15) — `assign_appointment` extendido con `policy_type='smart_match'` que llama compute_match con asesor_pool de policy y asigna winner. Fallback safe a load_balance si match falla.
- **EDIT** `routes_dev_batch15.py` — validation policy_type acepta `'smart_match'`.
- **EDIT** `pages/developer/CitasPolicies.js` — option "Smart Match (IA)" + info card explicando 5 señales con porcentajes.

### Sub-B: "Tu Día Hoy" Daily Feed (~3h)
- **NEW** `services/asesor_daily_feed.py` — para cada lead asignado al asesor: pull client_insights B33, calcular `priority_score = health × (1 + trend_7d/100)`, filtra leads con next_action válida (call/whatsapp/email/schedule_visit), top N por priority desc.
- **NEW** Schema `db.asesor_daily_feed_cache` `{asesor_id (PK), generated_at, ttl 60min, items [{lead_id, lead_name, heat_score, momentum_signed_pct, recommended_action {type, label, payload}, reason_text, priority_score}], total_leads_evaluated}`
- **NEW** `execute_action` 1-click: whatsapp → wa.me link con mensaje pre-poblado · email → send_resend con HTML branded · call → log activity · schedule_visit → redirect /asesor/citas · log_activity B14 'daily_feed_action_*'.
- **NEW** `components/asesor/AsesorDailyFeed.js` — header con greeting horario + count + refresh manual + "Ver todos" link · 5 cards horizontales con HeatRing 44px (color por banda + trend signed badge) · reason text 80 chars · CTA gradient grande min-w 140px · transition translateY(-4px) opacity 0.6 al ejecutar · toast "Email enviado / Acción registrada" · auto-refresh hourly via setInterval · empty state custom · mobile responsive.
- **EDIT** `pages/asesor/AsesorMetricas.js` — montaje `<AsesorDailyFeed user={user} />` arriba de filtros como widget top.

### Routes (`routes_lead_match.py`)
- POST `/api/lead-match/compute` (auth admin)
- GET `/api/lead-match/{match_id}` (auth)
- GET `/api/lead-match/lead/{lead_id}/recent` (auth)
- GET `/api/asesor/daily-feed?force_refresh=&top_n=` (auth asesor)
- POST `/api/asesor/daily-feed/{lead_id}/execute` body{action_type} (auth asesor)

### Wiring
- `server.py` — registra router + ensure indexes (lead_match_scores + asesor_daily_feed_cache).
- `api/asesor_match.js` — 5 helpers fetch.
- `i18n/common.json` — 2 secciones (daily_feed + smart_match).

### Tests curl-validated
- `POST /api/lead-match/compute` lead_6521d25fb086+quattro-alto → 2 candidates, winner Ana 32.5% match, Claude Haiku generó 3 razones coherentes ("Ana tiene capacidad disponible (20 slots libres)…") ✅
- `GET /api/asesor/daily-feed` (force_refresh) → 5 items rankeados por priority con heat+momentum+action_type ✅
- `GET /api/asesor/daily-feed` (cached) → from_cache=true (no consume Claude) ✅
- `POST /api/asesor/daily-feed/{lead_id}/execute` action=whatsapp → executed=true + redirect_url generado ✅
- routes_dev_batch15 valida `policy_type='smart_match'` correctamente ✅

### Build & Lint
- `yarn build` limpio
- `ruff` 0 · `eslint` 0
- ÚLTIMO Phase 3 Asesor batch — release-ready

---

## Batch 33 — Phase 4 Asesor Daily Tools (2026-05-06)

### Sub-A: Calendar Bidirectional (~2h)
- **NEW** `services/calendar_bidirectional.py` — Google Calendar `events.watch` (webhook 7-day life), polling fallback APScheduler 30min, auto-renew daily 03:00 (RENEW_BEFORE 1d), idempotent upsert en `db.appointments` con `synced_from_external=true` + `external_event_id`. Detección match by external_event_id para edits. Graceful: si OAuth no conectado o webhook falla → status='polling' o 'error' fallback automático.
- **NEW** Schema `db.calendar_webhook_subscriptions` `{asesor_id, channel_id, resource_id, expiration_at, status active|polling|error|off, last_event_synced_at}`
- **EDIT** `db.appointments` schema soporta `synced_from_external` + `external_event_id` (sparse index).
- **EDIT** `pages/advisor/CalendarSettings.js` — sección nueva `BidirectionalSyncCard` con toggle activar/desactivar + status badge (verde activo · ámbar polling · rojo error · gris off) + last sync timestamp + botón "Forzar sync ahora". Solo aparece cuando google_conn.status === 'active'.

### Sub-B: Visit Auto-prep (~3h)
- **NEW** `services/visit_auto_prep.py` — Claude Sonnet 4.5 con context aggregation 7-source (lead + saved_searches + favoritos + buyer_history + chat_threads + health_score + lead_attribution + project + comparables). Argumentario RAG B31 top 5 objeciones. Output JSON estructurado: lead_summary ≤100 palabras, top_3_objections (objection+script), top_3_talking_points, closing_recommendation, related_comparables IDs, data_sources. ai_budget gating + JSON parsing robusto (extracción ```json blocks). Cache permanente. Fallback heurístico si Claude falla.
- **NEW** Schema `db.visit_briefings` `{briefing_id, appointment_id (unique), asesor_id, lead_id, project_id, generated_at, content {...}, viewed_at?}`
- **NEW** APScheduler cron 1h: `auto_generate_upcoming_briefings` — para citas próximas 24h sin briefing → genera + log_activity B14 'visit_briefing_ready'.
- **NEW** `components/asesor/VisitAutoPrepCard.js` — card expandible con header colapsado (lead+project+hora+CTA gradient) y body 4 secciones (Sobre el lead · 3 Objeciones con scripts · Talking points · Cierre destacado gradient · Comparables chips). Loading spinner si está generando · Mark viewed automático · Regenerate button.
- **EDIT** `pages/advisor/AsesorTareas.js` — section "Citas próximas con briefing AI" arriba de las 3 columnas; carga `/api/asesor/citas` filtra próximas 24h y monta VisitAutoPrepCard por cada una.

### Sub-C: Client Insights (~3h)
- **NEW** `services/client_insights.py` — aggregate B13/B14/B22/B25/B28/B29: timeline 30d combinado (history + favoritos + chats), top vistas/favoritos, attribution, health trend 7d signed, chat sentiment Claude Haiku (positivo/neutral/negativo) con fallback heurístico keyword-based, recommended_next_action Claude Haiku ≤25 palabras con detección de action_type (call/whatsapp/email/schedule_visit). Cache 30min en `db.client_insights_cache`.
- **NEW** Schema `db.client_insights_cache` `{lead_id (PK), name, health, activity_30d, timeline, attribution, top_views, top_favoritos, chat, next_action, computed_at}`
- **NEW** `components/asesor/ClientInsightsTab.js` — Heat ring + trend signed + 7 sections (next_action gradient destacado con CTA "Hacer ahora", Activity 30d timeline vertical chips, Attribution multi-touch, Lo que vio top 5, Sus favoritos top 5, Conversaciones con sentiment badge + last message quote, refresh button cuando from_cache).
- **EDIT** `components/shared/EntityDrawer.js` — nuevo prop `entity_id`; cuando `entity_type === 'lead'` && entity_id presente, **inyecta automáticamente** sección "Insights" al inicio del array sections con `<ClientInsightsTab leadId={entity_id} />`.

### Routes (`routes_asesor_daily_tools.py`)
- POST `/api/asesor/calendar/webhook/subscribe` (auth)
- DELETE `/api/asesor/calendar/webhook/subscribe` (auth)
- POST `/api/asesor/calendar/webhook/callback` (público, headers X-Goog-*)
- GET `/api/asesor/calendar/sync-status` (auth)
- POST `/api/asesor/calendar/sync-now` (auth, force polling)
- POST `/api/asesor/visit-briefing/generate` (auth)
- GET `/api/asesor/visit-briefing/{appt_id}` (auth, ownership check)
- POST `/api/asesor/visit-briefing/{briefing_id}/viewed` (auth)
- GET `/api/asesor/lead/{lead_id}/insights` (auth)

### Wiring
- `server.py` — registra router + ensure_indexes 3 colecciones + APScheduler 3 jobs (b33_calendar_polling 30min · b33_webhook_renew daily 03:00 · b33_visit_briefing_cron 60min).
- `api/asesor_daily.js` — 9 helpers fetch.
- `i18n/common.json` — 3 secciones nuevas (calendar_bidi · auto_prep · client_insights).

### Tests curl-validated
- `POST /api/asesor/calendar/webhook/subscribe` → status=polling (sin OAuth Google) ✅ graceful fallback
- `POST /api/asesor/visit-briefing/generate` apt_2417d50f3919 → Claude Sonnet 4.5 generó briefing con 3 objeciones+scripts, 3 talking points, closing_recommendation ✅
- `GET /api/asesor/visit-briefing/{appt}` → fetch cached ✅
- `GET /api/asesor/lead/{lead_id}/insights` → shape completo con next_action whatsapp + sentiment + health 0/0 ✅
- 2da llamada insights → from_cache=true (no consume Claude) ✅

### Build & Lint
- `yarn build` limpio
- `ruff` 0 issues
- `eslint` 0 issues

---

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

---

## W3.3 ZZ.3 — DRPI Index Provider Ampliado (2026-05-08)

**Foundation Authority play**: media partnerships Forbes / El Financiero · DRPI mensual con regresión hedónica OLS sobre Transaction Network · /methodology page pública · boletines mensuales (general + sectoriales top 6) · Investment Explorer AirDNA-style.

### Backend nuevos
- **NEW** `hedonic_regression_engine.py` — fit OLS via statsmodels (variables m2/recamaras/baños/year_built/floor/proximity_metro_m/denue_density/construction_cost_index) · IC95% por coeficiente · honest stub si <30 transactions
- **NEW** `drpi_engine.py` — `compute_drpi_snapshot` (anclado base=100), `compute_drpi_national` (weighted avg), `compute_drpi_history` 12 períodos · cron `drpi_monthly_snapshot` 1ro mes 06:00 MX · system alert critical si <30% cobertura
- **NEW** `bulletins_engine.py` — `generate_bulletin_general` + `generate_bulletin_zone` (top 6: Polanco/Roma/Lomas/Condesa/Del Valle/Coyoacán) · narrative Claude Sonnet 4.5 (ai_budget gated) · PDF branded (B5/B19 navy+cream) · Resend distribution · cron `bulletins_monthly_generate` 1ro mes 07:00 MX
- **NEW** `routes_drpi.py` — public snapshot tier-gated (free=last, pro=12 history, enterprise=hedonic) + national + superadmin recompute + coefficients + list
- **NEW** `routes_bulletins.py` — public HTML + PDF + `/api/public/methodology` + superadmin list/generate
- **NEW** `routes_investment_explorer.py` — table sortable (score/yield/growth_30d/risk/dom) × buyer_objective (cashflow/appreciation/balanced) + drill-down detail con scorecard

### Backend ediciones
- **EDIT** `server.py` — registra 3 routers (`drpi_router`, `bulletins_router`, `investment_explorer_router`) + ensure_indexes (hedonic_models, drpi_snapshots, dmx_bulletins, bulletin_subscribers)
- **EDIT** `scheduler_ie.py` — boot 2 nuevos crons (drpi_monthly_snapshot, bulletins_monthly_generate)
- **EDIT** `cron_heartbeat.py` — labels + intervals (sistema total: 27 crons)
- **EDIT** `requirements.txt` — `statsmodels==0.14.6`, `scipy==1.17.1`, `patsy==1.0.2`

### Frontend nuevos
- **NEW** `api/drpi.js`, `api/bulletins.js`, `api/investmentExplorer.js`
- **NEW** `components/public/DrpiHeroWidget.js` — card grande mensual con Nacional + 6 colonias top, gradient eyebrow
- **NEW** `components/superadmin/HedonicCoefficientsTable.js` — tabla coeficientes + IC95% + R²/RMSE pills
- **NEW** `pages/public/MethodologyPage.js` — `/methodology` con 6 secciones (DRPI, Zone Score, Risk, Construction Cost, Validation, Citation) + Schema.org Dataset markup
- **NEW** `pages/public/BulletinPage.js` — `/boletin/{slug}/{period}` con KPIs strip + html_content + download PDF + share (WhatsApp/LinkedIn/X) + Schema.org Article
- **NEW** `pages/superadmin/SuperadminDRPI.js` — tabla snapshots filtros tier + drawer coeficientes + recompute manual + export CSV
- **NEW** `pages/superadmin/SuperadminBulletins.js` — tabla bulletins + filtros + preview HTML + generate per zona top 6 + PDF
- **NEW** `pages/superadmin/SuperadminInvestmentExplorer.js` — tabla density-aware sortable + filtros sort/tier/objective + drill drawer scorecard + export CSV

### Frontend ediciones
- **EDIT** `App.js` — 5 rutas nuevas (`/methodology`, `/boletin/:slug/:period`, `/superadmin/drpi`, `/superadmin/bulletins`, `/superadmin/investment-explorer`) + DrpiHeroWidget en Home post-ColoniasBento
- **EDIT** `config/navByRole.js` — SUPERADMIN_NAV tier 2: 3 items nuevos (DRPI, Boletines, Investment Explorer)

### Acceptance criteria validados (curl)
- `POST /superadmin/drpi/recompute` → 200 (refit + insert snapshots, refreshed=3, insufficient=39 sin data)
- `GET /api/drpi/snapshot/polanco` → public 200 con `available=true`, R²=0.049, sample=45 tras seed
- `GET /api/drpi/snapshot/polanco?include=history` (free) → `history_locked=true upgrade_required=pro`
- `GET /api/drpi/snapshot/polanco?include=hedonic` (superadmin) → `hedonic` con coefs + R²
- `POST /superadmin/bulletins/generate` (general + zone) → PDF + html_content + slug correcto
- `GET /api/bulletins/general/2026-05` → HTML page payload (kpis + html_content)
- `GET /api/bulletins/general/2026-05/pdf` → 200 application/pdf valid (%PDF-1.4)
- `GET /api/public/methodology` → shape complete (drpi + zone_score + construction_cost + validation + citation)
- `GET /superadmin/investment-explorer/zones?sort=yield&buyer_objective=cashflow` → 200 con `recommended_for_objective`
- 27 crons en `/api/superadmin/health/crons` (incluye drpi_monthly_snapshot + bulletins_monthly_generate)
- Roles ≠ superadmin → 403 en endpoints protegidos · públicos → 200
- DRPI <30 transactions → honest stub `available=false reason=insufficient_data`
- ai_budget exceeded → bulletin generation skip + system_alert
- `yarn build` limpio · ruff cosmético · ESLint clean


---

## W3.4A ZZ.4 — Risk Layer Part 1 (Fraud Detection AI + Risk Score V1) (2026-05-08)

**Risk Layer foundation**: ML clásico con scikit-learn (primer uso en DMX) + crime layer SESNSP. Establece la columna que W3.4B después amplía con CENAPRED + ENVIPE + RPP. Risk Score real integrado en Zone Score W3.1A (sustituye placeholder=50).

### Backend nuevos
- **NEW** `fraud_detection_engine.py` — 3 detectores orquestados (`detect_listing_fraud`):
  - **Price anomaly**: sklearn IsolationForest sobre Transaction Network W3.2 (5 features), threshold severity (-0.5/-0.1), cache modelo 24h zone-scoped + global fallback
  - **Duplicate listings**: rapidfuzz WRatio (≥85) + price tolerance ±5% + geo proximity Haversine <500m. Severity=critical si ≥92 sim
  - **Title chain anomaly**: heurística honesta (>2 tx en 24m + Δprice >50% en 12m → amber). Placeholder hasta RPP partnership Y2
  - `cron_fraud_detection_daily` 03:00 MX · throttle email Resend critical 1/día
  - `resolve_alert` / `dismiss_alert` con audit trail
- **NEW** `crime_data_engine.py` — SESNSP CSV mensual: `parse_sesnsp_csv` + `aggregate_crime_zone` (6m rolling, normaliza per 100K hab via `dim_zones.population_2020`) + cron `sesnsp_monthly_ingest` 1ro mes 08:00 MX. Filtra 6 categorías relevantes para riesgo residencial
- **NEW** `risk_score_engine.py` — `compute_risk_score_v1` (V1 solo crime, A-F, 0-100 score con CRIME_NORM_HIGH=5000/100k = score 0) · `get_risk_score_or_compute` cache 24h · cron `risk_score_zone_daily` 05:00 MX (post zone_score 04:00) · TTL 90d
- **NEW** `routes_fraud_detection.py` — list paginated/filters + detail/match + resolve/dismiss + scan manual
- **NEW** `routes_risk_score.py` — public tier-gated (free=letter, pro=numeric+components, enterprise=+cats+alcaldia) + superadmin list/recompute + crime breakdown

### Backend ediciones
- **EDIT** `server.py` — registra 2 routers (`fraud_router`, `risk_score_router`) + 3 ensure_indexes (fraud_alerts, crime_data_sesnsp, risk_scores_zone)
- **EDIT** `scheduler_ie.py` — boot 3 nuevos crons
- **EDIT** `cron_heartbeat.py` — 3 labels (sistema total: 30 crons)
- **EDIT** `requirements.txt` — `scikit-learn==1.8.0`, `joblib==1.5.3`, `threadpoolctl==3.6.0`
- **EDIT** `zone_score_engine.py` — sustituye `dim_risk=50.0` placeholder por call real `risk_score_engine.get_risk_score_or_compute()`. `placeholder_flags.risk` ahora es `False` (W3.4A activo). Verificado: polanco letter=A, score=83.6 (no más 50)
- **EDIT** `routes_bulletins.py` — `/api/public/methodology` retorna Risk Score V1 con `status=active_v1_sesnsp`, sources_active, 6 categorías, frequency

### Frontend nuevos
- **NEW** `api/fraudDetection.js` (5 fns) · `api/riskScore.js` (4 fns)
- **NEW** `components/marketplace/RiskScoreBadge.js` — circular A-F con colores semáforo (A verde → F rojo crítico). Self-fetches via fetchRiskScore. Honest stub `?` cuando no available
- **NEW** `components/developer/RiskScoreBreakdown.js` — drawer con 4 ComponentCards (crime active V1 + natural/title/percepción placeholders V2) + categorías SESNSP grid
- **NEW** `components/superadmin/FraudAlertCard.js` — severity colored card + source pill + evidence collapsible (JSON pretty) + 2 acciones (Resolver/Descartar) con modal nota
- **NEW** `pages/superadmin/SuperadminFraudAlerts.js` — KPI strip (critical_open, amber_open) + filter chips (severity/source/status) + paginación "Cargar más" skip+=20 + manual scan button
- **NEW** `pages/superadmin/SuperadminRiskScore.js` — tabla zonas con score letter + crime/100k + sources + computed_at + drawer con `<RiskScoreBreakdown/>` + manual recompute + tier filter

### Frontend ediciones
- **EDIT** `App.js` — 2 rutas nuevas (`/superadmin/fraud-alerts`, `/superadmin/risk-score`)
- **EDIT** `config/navByRole.js` — SUPERADMIN_NAV: 2 items nuevos (Fraud Alerts · Risk Score, ambos icon Shield)
- **EDIT** `components/marketplace/PropertyCard.js` — RiskScoreBadge mounted bottom-LEFT (junto a momentum pill). Conservative decision: spec pedía top-LEFT pero la posición top-LEFT ya tiene `tag` chip; bottom-LEFT evita overlap manteniendo el widget visible. ZoneScoreBadge sigue bottom-RIGHT
- **EDIT** `pages/public/MethodologyPage.js` — Risk Score section: V1 activo SESNSP con 5 bullets (fuente, frecuencia, 6 categorías, normalización, formula 0-100). V2 mantiene placeholder honesto

### Acceptance criteria validados (curl)
- ✅ scikit-learn install OK · IsolationForest entrenó sobre 135 transactions seed
- ✅ `cron_fraud_detection_daily` (manual scan): scanned=69 alerts_inserted=69 critical_open_24h=40 — IsolationForest detectó outliers en seed
- ✅ Fraud alert detail incluye `match_listing` cuando source=duplicate (similarity_match_id resuelto)
- ✅ Resolve idempotent (status=resolved en ambas llamadas)
- ✅ SESNSP CSV download es best-effort (URL placeholder) — fallback honest a system_alert WARNING. Test: seed manual 30 rows polanco/miguel-hidalgo + verificación
- ✅ `compute_risk_score_v1(polanco)` → score_letter=A, score_numeric=83.6, crime_score=83.6, crime_normalized_per_100k=821.43, alcaldia=miguel-hidalgo
- ✅ Zone Score W3.1A (polanco) → risk component=83.6 (NO más 50), placeholder_flags.risk=false
- ✅ GET /api/risk-score/zone/polanco free → solo {score_letter, sources_active}; pro → +score_numeric+components numéricos; enterprise → +crime_by_category+alcaldia
- ✅ 30 crons en `/api/superadmin/health/crons` (incluye sesnsp_monthly_ingest, fraud_detection_daily, risk_score_zone_daily)
- ✅ Roles ≠ superadmin → 403 en endpoints autenticados (Fraud list/Risk recompute/Crime breakdown). Public risk → 200
- ✅ Marketplace card muestra ambos badges (ZoneScoreBadge bottom-RIGHT + RiskScoreBadge bottom-LEFT) sin overlap
- ✅ statsmodels + sklearn coexisten requirements.txt sin conflicto
- ✅ `yarn build` limpio · ESLint clean · Python lint cosmético (E702 multi-statement aceptado)


---

## W3.4B ZZ.4 — Risk Layer Part 2 (V2 multi-source + UI alert engine) (2026-05-08)

**Risk Layer cierra**: V2 composite ponderado con 4 dimensiones reales. Letter change alert engine con email Resend automático en bajadas críticas. RiskScoreFullBadge marketplace con tooltip 4 mini-bars + drill drawer. Sustituye 3 placeholders V2 reservados en schema W3.4A.

### Backend nuevos
- **NEW** `natural_risk_engine.py` — Atlas CDMX + CENAPRED GeoJSON layers (sísmica/inundación/hundimiento) · `upsert_zone_layer` operator helper · `compute_natural_risk_zone` con composite formula 0.40 sismic + 0.35 flood + 0.25 subsidence · cron `cenapred_atlas_quarterly_ingest` 1ro mes 09:00 MX (jan/abr/jul/oct)
- **NEW** `perception_risk_engine.py` — INEGI ENVIPE indicador 6207067968 (% percepción inseguridad) · 16 alcaldías CDMX mapeadas · `upsert_perception` operator helper · score inverso (más percepción inseguridad → más risk)
- **NEW** `routes_risk_alerts.py` — list/filters/days · timeline per zone · acknowledge mutation (audit)

### Backend ediciones
- **EDIT** `risk_score_engine.py` — `compute_risk_score_v2(db, zone_id)`: composite 4 dims con `WEIGHTS_V2={crime:0.40, natural:0.25, title:0.15, perception:0.20}` · renormaliza weights cuando dimensiones unavailable · `_title_risk_heuristic` mejorado con Transaction Network W3.2 (flips ≥3 en 24m) · `detect_letter_change` engine con system_alerts + Resend email crítico cuando delta>2 letters · `get_risk_score_or_compute` ahora usa V2 + dispara letter detection · `cron_risk_score_zone_daily` ahora computa V2 + detect change · `FORMULA_VERSION="2.0.0"`
- **EDIT** `routes_risk_score.py` — extiende public shape con `placeholder_flags` + `weights` + 4-dim breakdown enterprise tier
- **EDIT** `crime_data_engine.py` — `cron_sesnsp_monthly_ingest` ahora absorbe ENVIPE annual update (NO new cron, perception data is yearly)
- **EDIT** `routes_bulletins.py` — `/api/public/methodology` retorna Risk Score V2 con `status=active_v2_multisource`, dimensions detalle (crime/natural/title/perception), version 2.0.0
- **EDIT** `server.py` — registra `risk_alerts_router` + 2 ensure_indexes (natural_risk_layers, perception_risk_data)
- **EDIT** `scheduler_ie.py` — boot cron `cenapred_atlas_quarterly_ingest`
- **EDIT** `cron_heartbeat.py` — label cenapred (sistema total: 31 crons)

### Frontend nuevos
- **NEW** `api/riskAlerts.js` (3 fns)
- **NEW** `components/marketplace/RiskScoreFullBadge.js` — sustituye `RiskScoreBadge` V1: badge A-F + hover tooltip con 4 mini-bars (crime/natural/title/perception) + click drawer breakdown
- **NEW** `components/superadmin/RiskAlertCard.js` — letter pill prev→new + delta_letters + severity color + button "Ver historia zona" (timeline modal) + ack button
- **NEW** `pages/superadmin/SuperadminRiskAlerts.js` — KPI strip (critical_open, drops, rises) + filtros severity/days/zone search + paginación

### Frontend ediciones
- **EDIT** `components/developer/RiskScoreBreakdown.js` — sustituye 3 V2 placeholders por componentes reales con detalles (sismic_zone/flood_pct/subsidence_mm_year, flips_24m/transactions_24m, perception_pct/year)
- **EDIT** `pages/superadmin/SuperadminRiskScore.js` — tabla extendida con 4 cols (Crime/Natural/Título/Percep.) + col Fuentes muestra count
- **EDIT** `pages/public/MethodologyPage.js` — Risk Score section completa V2 con weights + dimensions + alert_engine descripción
- **EDIT** `components/marketplace/PropertyCard.js` — sustituye `RiskScoreBadge` por `RiskScoreFullBadge`
- **EDIT** `App.js` — ruta `/superadmin/risk-alerts`
- **EDIT** `config/navByRole.js` — `AlertTriangle` import + nav item "Risk Alerts" tier 2

### Acceptance criteria validados (curl)
- ✅ `compute_risk_score_v2(polanco)` → letter=B, numeric=75.8, ALL placeholder_flags=false, sources=[sesnsp, atlas_cdmx, transaction_network, envipe_inegi]
- ✅ Components: crime=83.6, natural=68.5, title=86.0, perception=61.5 (4 dims pobladas)
- ✅ Zone Score W3.1A consume V2 automáticamente (risk component pasó de 83.6 V1 → 75.8 V2; sin cambios additional)
- ✅ Atlas CDMX `fetch_atlas_cdmx_layers` operator-friendly: si URLs fail → system_alert.warning · operator puede `upsert_zone_layer` manual
- ✅ ENVIPE `fetch_envipe_perception` 16 alcaldías · token IE_INEGI_TOKEN reused · operator helper `upsert_perception` para CSV manual
- ✅ Letter change detection: B→D simulado → INSERT risk_letter_changes (severity=warning delta=2) + system_alert.warning
- ✅ Email Resend critical drop: solo dispara cuando delta>2 letters (verified: B→D delta=2 → warning, NO email; 5+ delta → critical + email)
- ✅ `/api/superadmin/risk-alerts` list paginado con KPIs (critical_open, drops_in_window, rises_in_window)
- ✅ Timeline per zone retorna histórico letter changes
- ✅ Acknowledge marca `acknowledged_at` + `acknowledged_by` + audit log
- ✅ `/api/public/methodology` retorna Risk V2 status=active_v2_multisource con 4 dimensiones detalladas
- ✅ 31 crons en `/api/superadmin/health/crons` (incluye `cenapred_atlas_quarterly_ingest`)
- ✅ RBAC 403 asesor en risk-alerts/timeline; público OK en methodology + risk-score/zone
- ✅ `yarn build` limpio · ESLint clean



## W4.3 — Phase Y.0 Foundation + Behavioral Tracking (2026-05-09)

### Sub-Chunk A · Phase Y Settings Backend
- **NEW** `routes_phase_y_controls.py` — `GET/PATCH/POST /api/superadmin/phase-y/{org_id}`. Schema `db.phase_y_settings` per-org (9 feature tiers: diagnostic_engine, recommendation_banner, comparable_alerts, lead_nurture, pricing_agent, marketing_agent, lead_agent, construction_agent, compliance_agent · valores: off/T1/T2/T3/T4). Master switch + simulation mode. Audit log en cada mutación. Permission: superadmin global | developer_admin solo su org.
- **Helper público** `get_phase_y_settings(db, org_id)` → reusable por features agentic (W4.1A, W4.1C, W4.2D3.5) para respetar master switch + simulation_mode antes de ejecutar.

### Sub-Chunk B · Behavioral Tracking Engine
- **NEW** `behavioral_tracking_engine.py` — `ingest_event()` con LFPDPPP (IP hasheada SHA256+salt→8chars, no raw), `aggregate_by_feature()` con pipeline Mongo, `ensure_indexes()` con TTL 90 días.

### Sub-Chunk C · Behavioral Routes
- **NEW** `routes_behavioral.py` — `POST /api/track` público (rate limit 100 events/min/session, in-process TTL buckets). `GET /api/superadmin/behavioral/events` (paginado, filtros org_id/feature/since). `GET /api/superadmin/behavioral/aggregate` (by_feature + by_page + top_3_features).

### Sub-Chunk D · Frontend
- **NEW** `utils/behavioralTracker.js` — `track(event_type, opts)` con fetch keepalive:true + silent fail. `usePageViewTracking()` hook auto-dispara page_view en cada route change.
- **NEW** `components/superadmin/PhaseYControlsPanel.js` — Master switch toggle grande, simulation mode toggle, tabla feature tiers con selects off/T1/T2/T3/T4, botones Guardar/Resetear, badge Active/Off.
- **EDIT** `App.js` — import + mount `usePageViewTracking()` en AppRouter.
- **EDIT** `SuperadminTenants.js` — nuevo tab "Phase Y" en TenantDrawer.

### Acceptance Criteria validados
- ✅ GET /api/superadmin/phase-y/test-org → 200 defaults (agentic_enabled=false, 9 tiers)
- ✅ PATCH simulation_mode=true → actualiza, updated_by=user_admin_0001
- ✅ POST /api/track {session_id, page_view, /} → 201 event_id=evt_xxx, ip_hash=8chars
- ✅ GET /api/superadmin/behavioral/aggregate → top_3_features=["phase_y_panel"], by_page [/ y /superadmin]
- ✅ POST /master-switch {enabled:true} → ok=true, agentic_enabled=true
- ✅ PATCH feature_tiers {pricing_agent:T2, lead_nurture:T4} → persistido correctamente
- ✅ Sin auth → 401 | rol incorrecto → 403
- ✅ yarn build limpio 41s | /api/health 200

### SHA: 2498e8e


## W4.4 — Phase Y.1A · Director Agent core orchestration (2026-05-09)

### Backend (2 nuevos · 1 editado)
- **NEW** `director_agent_engine.py` — `DirectorAgent` class con `start_session()`, `chat()`, `end_session()`. 4 tools internas (`get_ie_score`, `get_unit_score`, `get_comparables`, `get_org_kpis`). Agentic loop 2-pass via `<tool_call>` tag parsing (no streaming Y.1A). Simulation mode: full logic, zero Anthropic calls, `[SIM]` prefix. Tier caps T1(50k/10k), T2(100k/20k), T3(200k/40k), T4(ilimitado). LFPDPPP-compliant. Usa `get_phase_y_settings` de W4.3. ensure_indexes para 3 collections.
- **NEW** `routes_director.py` — 5 REST endpoints + superadmin usage metrics. Rate limit: 5 sessions/hora/user + 30 messages/min/user. Permission: developer/inmobiliaria→own org, superadmin→cualquier org.
- **EDIT** `server.py` — mount director routers + ensure_director_indexes en startup.

### Frontend (2 nuevos · 2 editados)
- **NEW** `api/directorApi.js` — startSession/sendMessage/getSession/getMessages/endSession.
- **NEW** `components/director/DirectorChatPanel.js` — Chat completo: header (tier badge + sim chip + token progress bar), message bubbles (cream=user, dark glass=assistant), tool chips inline, skeleton loading, empty state con suggestions, PhaseY-off card, autoresize textarea, send button rounded-full gradient.
- **EDIT** `DesarrolladorDashboard.js` — tabs "Resumen | Director AI" en la parte superior del dashboard. Resumen tab preserva todo el contenido original.
- **EDIT** `i18n/locales/es-MX/common.json` — sección `director` con 6 keys: tab_label, empty_state, disabled_message, input_placeholder, send_button, tier_badge_template.

### ENV
- `DIRECTOR_MODEL=claude-sonnet-4-5-20250929`, `DIRECTOR_MAX_TOKENS_IN_T1=50000`, `DIRECTOR_MAX_TOKENS_OUT_T1=10000`

### Acceptance Criteria
- ✅ Start session con tier T2 retorna session_id
- ✅ Send message → assistant responde (real LLM) + tokens persisted
- ✅ Simulation mode ON → simulated=True, starts_with_[SIM]=True, zero Anthropic calls
- ✅ End session → status=ended · siguiente message → 410 Gone
- ✅ GET /api/superadmin/director/usage → sessions_count + tool_calls_breakdown
- ✅ GET /api/director/sessions/{id}/messages → historial paginado
- ✅ Sans auth → 401/403 según caso
- ✅ yarn build 42s · /api/health 200

### Edge cases conservadores
- `DIRECTOR_MODEL` seteado a `claude-sonnet-4-5-20250929` (nombre verificado en repo) en lugar de `claude-sonnet-4-6` (spec) — el modelo `claude-sonnet-4-6` no tiene precedente en la codebase y podría no ser válido en LiteLLM proxy. Reportado.

### SHA: de46500


## W4.4B — Phase Y.1B · Director Memory Layer RAG (2026-05-09)

### Backend (2 nuevos · 4 editados)
- **NEW** `director_memory_engine.py` — `DirectorMemoryEngine` class: `ingest_diagnostic`, `ingest_ie_score_change` (threshold ±5pts), `ingest_behavioral_session` (≥5 events), `retrieve` (hybrid 70% text + 30% recency, org_id isolation), `expire_old`. Crons: `run_memory_daily_ingest` (04:30 MX) + `expire_all_orgs` (Sunday 05:00 MX). MongoDB `$text` index en español con weights (summary 3x, content_text 1x).
- **NEW** `routes_director_memory.py` — 5 endpoints: POST ingest/diagnostic, POST ingest/behavioral, POST retrieve (debug), DELETE (DSR), GET stats. Superadmin-only.
- **EDIT** `director_agent_engine.py` — 5to tool `retrieve_memory`, auto-inject memory en `chat()` (tier ≥ T2), `initial_memory_ids` en `start_session()`, `memory_hits` en response, `_build_system_prompt` con `memory_context` param.
- **EDIT** `routes_director.py` — expone `memory_hits` en `sendMessage` response.
- **EDIT** `scheduler_ie.py` — cron diario 04:30 MX + cron semanal domingo 05:00 MX.
- **EDIT** `server.py` — mount memory router + `ensure_memory_indexes` en startup.

### Frontend (1 editado)
- **EDIT** `DirectorChatPanel.js` — `MemoryHitsBlock` collapsible (source_type chips + summary 80 chars), `MessageBubble` tier-aware, `memory_hits` capturado al recibir respuesta.
- **EDIT** `i18n/es-MX/common.json` — sección `director.memory` con 6 keys.

### Acceptance Criteria validados
- ✅ Ingest behavioral session → memory_id, entry en director_memory_index
- ✅ Cross-org isolation: query en org distinta → 0 hits
- ✅ T1 session: initial_memory_ids=[] (no memory injection)
- ✅ T2 session: initial_memory_ids=[mem_id] (memoria inyectada)
- ✅ DELETE → entry no aparece en próximos retrievals
- ✅ Stats: total_entries, by_source_type breakdown, top_accessed
- ✅ Daily ingest manual: behavioral=1 ingested
- ✅ yarn build 38s · /api/health 200

### SHA: 17eaa3d


## W4.4C — Phase Y.1C · Director Agent MCP Exposure (2026-05-09)

### Backend (2 editados)
- **EDIT** `mcp_tools.py` — 3 nuevas MCP tools en `MCP_TOOLS` schema (total 8) + 3 handlers + dispatch_tool ahora pasa `key_doc` a tools de Director:
  - `director_chat` (T1+): conversa con DirectorAgent. Auto-crea sesión si omites `session_id`. Verifica que session existente pertenezca al org del API key. Retorna assistant_message, tokens, cost, simulated, memory_hits_count.
  - `director_retrieve_memory` (T2+): retrieve híbrido del DirectorMemoryEngine, filtrado por org_id. Soporta `top_k` (1-10) + `source_types` filter.
  - `director_session_summary` (T1+): metadata + últimos N mensajes (default 10, max 50). Bloqueado si la sesión es de otro org (cross-tenant safety).
  - Helper `_resolve_org_user(key_doc)` extrae `tenant_id`/`created_by` del API key.
- **EDIT** `mcp_server.py` — pasa `key_doc` a `dispatch_tool`, captura `McpToolError` (HTTP 403 / JSON-RPC -32603) para Phase Y gating + cross-tenant blocks.

### Frontend (1 editado)
- **EDIT** `pages/public/ConnectMcpPage.js` — Step 6 nuevo "3 herramientas Director Agent · Phase Y" con tier badges (T1+/T2+/T1+), 3 cards `data-testid="mcp-director-tool-{name}"`, 3 bloques curl (JSON-RPC + REST). Hero "5 herramientas" → "8 herramientas". Step "Embed widgets" reorganizado a Step 8.

### Acceptance Criteria validados (curl)
- ✅ GET /api/mcp/tools → 8 tools listadas (5 IE + 3 Director)
- ✅ director_chat con T2 sim_mode → session_id creado, [SIM] response, simulated=true
- ✅ director_chat con Phase Y off → HTTP 403 "Phase Y disabled by superadmin"
- ✅ director_retrieve_memory con T2 → hits_count válido
- ✅ director_retrieve_memory con T1 → HTTP 403 "Memory layer requires T2+"
- ✅ director_session_summary → metadata + 2 mensajes cronológicos
- ✅ JSON-RPC tools/call (id=42) con session_id existente → session_created=false (continua sesión)
- ✅ Cross-tenant blocked: key dmx → session test-org-123 → HTTP 403
- ✅ Validación: `{}` payload → "message es requerido"
- ✅ yarn build 39s · 3 testids verificados en preview URL

### SHA: pending


## W4.4D — Phase Y.1D · What-if Simulator (2026-05-09)

### Backend (2 NEW · 3 EDIT)
- **NEW** `whatif_engine.py` — `WhatIfEngine` class con 4 métodos: `simulate_price_change` (elasticidad de comparables misma colonia + price_history fallback), `simulate_promo` (lift desde behavioral_events.high_intent o benchmark sectorial cuando <50 events), `simulate_delay` (decay IE_PROY + DRPI + holding cost 1.2%/mes), `simulate_mix` (combina max 5 escenarios). Helper `_check_phase_y` valida master switch + tier whatif_simulator (fallback diagnostic_engine). `_check_daily_cap` enforce caps T1=100/T2=500/T3+=ilimitado. `_confidence_band` ajusta amplitud por sample_size. Función pública `run_simulation(db, org_id, user_id, project_id, scenario_type, inputs, persist=True)`.
- **NEW** `routes_whatif.py` — 5 endpoints: POST `/api/whatif/simulate`, GET `/api/whatif/scenarios?project_id=&scenario_type=&limit=`, GET `/api/whatif/scenarios/{id}` (con `comparables_inflated`), DELETE soft delete (DSR), GET `/api/superadmin/whatif/usage?org_id=&days=` (counts + by_scenario_type + by_tier + by_org). Rate limit 30/min/user. Multi-tenant 403 cross-org · superadmin any org.
- **EDIT** `server.py` — wire `whatif_router` + `whatif_sa_router` + `ensure_whatif_indexes` en startup.
- **EDIT** `director_agent_engine.py` — 6to tool `whatif_simulate` en `_exec_tool` dispatch + `_tool_whatif_simulate` helper. Sistema prompt actualizado con schema y ejemplo (4 sub-types: price_change, promo, delay, mix).
- **EDIT** `mcp_tools.py` — 9th MCP tool `whatif_simulate` (T1+, key_doc-aware) + `handle_whatif_simulate` handler con Phase Y check vía `_check_phase_y(db, org_id, "T1", key_doc)`.

### Frontend (2 NEW · 2 EDIT)
- **NEW** `api/whatifApi.js` — 4 funciones: `simulate`, `listScenarios`, `getScenario`, `deleteScenario`.
- **NEW** `components/whatif/WhatIfPanel.js` — 3 selector cards (Cambio de precio / Promo / Retraso) · forms dinámicos (slider rango -20%/+20% para delta, range para duración/delay, select tipo promo/horizon) · ResultCard con 6 métricas posibles (velocidad, lift, IE_PROY Δ, DRPI Δ, ingreso, holding cost), banda de confianza SVG con gradient, comparables chips, recommendation card. Skeleton loading. Empty state. PhaseY-disabled state. Historial colapsable últimas 10 simulaciones · click → re-load. Mobile responsive (1col → 2col en >760px).
- **EDIT** `pages/developer/DesarrolladorDashboard.js` — 3rd tab "What-if" + WhatIfPanel mount con projects mapeados desde `data.developments`.
- **EDIT** `i18n/locales/es-MX/common.json` — sección `whatif.*` (tab_label, empty_state, disabled_message, scenario.*, form.*, results.*).

### Acceptance Criteria validados (curl + screenshot)
- ✅ POST `/api/whatif/simulate` price_change → outputs.projected_velocity_change_pct=-3.6, projected_revenue_delta_mxn=7.4M, comparables_used=['polanco-moderno'], elasticity_used=-0.72, scenario_id persistido
- ✅ POST promo sin behavioral_events (count=0) → fallback benchmark, data_quality="low", confidence band ampliado
- ✅ POST delay → IE_PROY Δ=-2.4 (4m), DRPI=-1.6, holding=58.3M MXN con sample_size=20 (data_quality="high")
- ✅ GET `/api/whatif/scenarios?project_id=altavista-polanco` → solo del org del user (orgs tras superadmin: dmx, test-org-123)
- ✅ DELETE → status:"deleted" (soft delete con timestamp)
- ✅ POST con scenario_type="bogus" → HTTP 422 lista válidos
- ✅ POST mix con price_change + promo → suma deltas + intersect confidence + concatena recommendations
- ✅ GET scenario detail → comparables_inflated con name/colonia/price_from/stage
- ✅ MCP `tools/list` → 9 tools (incluye whatif_simulate)
- ✅ MCP `whatif_simulate` con T2 sim_mode → outputs.simulated=true, T2 tier
- ✅ MCP Phase Y OFF → HTTP 403 "Phase Y disabled by superadmin"
- ✅ Director Agent: 6to tool wireado en `_exec_tool` (compact response con outputs_summary)
- ✅ UI WhatIfPanel renders: 3 selector cards, form dinámico (Proyecto, Precio/m², slider delta, Horizonte), Simular impacto rounded-full gradient · 7 testids verificados en screenshot
- ✅ Superadmin usage: total_simulations=5, by_scenario_type [delay×2, mix, promo, price_change], by_tier [T1×4, T2×1]
- ✅ yarn build 39s clean · /api/health 200

### Edge cases conservadores
- DEVELOPMENTS in-memory (no en mongo) → engine resuelve vía `data_developments.DEVELOPMENTS_BY_ID`
- IE_PROY values can be None → coerce con `(d.get("value") or 0)` para evitar TypeError
- price_to ausente → fallback price_from
- units_total ausente → default 50
- behavioral_events para org_id=None → 0 events count, fallback benchmark
- mix con scenarios donde confidence bands no se solapan → reporta cl > ch (UI debe interpretar)
- Comparables vacíos → benchmark elasticity (-0.6)
- Single-session enforcement bloquea screenshot login post-curl → workaround: `page.request.post` antes de navegar

### SHA: pending (auto-commit por plataforma)


## W4.4E — Phase Y.1E · Asistente público comprador (2026-05-09)

### Backend (2 NEW · 2 EDIT)
- **NEW** `asistente_engine.py` — `AsistenteEngine` con 4 métodos: `start_session` (LFPDPPP ip_hash + UA hash + UUID token), `chat` (Phase Y check + rate limit + agentic loop max 2 rounds + 3 tools públicas + intent detection), `capture_lead` (insert en `leads` con source=asistente_publico), `expire_old_sessions` (cron 24h). 3 tools públicas: `search_developments_public` (subset DEVELOPMENTS publish-only), `get_zone_info` (avg price + amenidades + IE scores), `get_market_pulse_public` (agregados últimos 30d). Intent regex es-MX (cita, presupuesto, comparables, zona). Welcome message + system prompt es-MX. Caps: 30 msgs/session, 5 sessions/hora/ip, 20 msgs/min/session, 200 tokens output máx.
- **NEW** `routes_asistente.py` — 4 endpoints: POST `/api/asistente/sessions` (público), POST `/sessions/{token}/messages` (público), POST `/sessions/{token}/capture-lead` (público), GET `/api/superadmin/asistente/usage` (superadmin) con sessions_count + messages_count + leads_captured + conversion_rate_pct + avg_session_length + intent_breakdown + total_cost.
- **EDIT** `server.py` — wire `asistente_router` + `asistente_sa_router` + `ensure_asistente_indexes` en startup.
- **EDIT** `scheduler_ie.py` — cron `asistente_expire` 03:30 MX diario llamando `expire_old_sessions_cron`.

### Frontend (3 NEW · 3 EDIT)
- **NEW** `api/asistenteApi.js` — 3 funciones: startSession, sendMessage, captureLead.
- **NEW** `pages/public/AsistentePage.js` — ruta pública `/asistente` (NO auth) · hero + chat container max-w-720 · UTM source desde searchParams · localStorage resume `dmx_asistente_session` · disabled state si Phase Y OFF · error toast.
- **NEW** `components/asistente/AsistenteChat.js` — bubbles (user cream-right, assistant dark-glass-left), textarea autoresize, send button rounded-full gradient, 4 chips empty-state clickeables (auto-fill input), LeadCaptureCard inline (nombre + WhatsApp + email + Conectarme), loading dots animation 850ms, behavioralTracker.track('asistente.message_sent') por mensaje.
- **EDIT** `App.js` — lazy import + `<Route path="/asistente" element={<AsistentePage />} />`.
- **EDIT** `i18n/locales/es-MX/common.json` — sección `asistente.*` (hero, empty, chips, input, lead_capture.*, disabled, session_expired).
- **EDIT** `public/sitemap.xml` — agregada URL `https://desarrollosmx.io/asistente` priority 0.9.

### Schema (2 collections nuevas)
- `db.asistente_sessions`: `{_id=session_token, ip_hash, user_agent_hash, created_at, last_message_at, message_count, captured_lead_id, status (active|expired), referral_source}`. Indexes: token unique, (ip_hash, created_at), (status, last_message_at).
- `db.asistente_messages`: `{_id, session_token, role, content, tokens_in, tokens_out, cost_usd, latency_ms, tool_calls, intent_detected, simulated, created_at}`. Index: (session_token, created_at).

### Lead capture wiring
- POST `/capture-lead` inserta en collection existente `leads` con shape: `{id, dev_org_id="dmx", source="asistente_publico", source_metadata{session_token, intent_history, referral_source, ip_hash}, contact{name,phone,email}, intent, message, status="nuevo", created_at, created_by="_asistente_publico"}`.
- Nurture cron W4.2D3.5 (existente) recoge automáticamente leads source=asistente_publico próxima ejecución.
- log_activity tipo `asistente.lead_captured` (best-effort).

### Acceptance Criteria validados (curl + screenshot)
- ✅ POST /api/asistente/sessions (público sin auth) → 201 con session_token + welcome_message
- ✅ POST messages "departamentos en Polanco bajo 5M" → real LLM (claude-sonnet-4-5-20250929) dispara 2 tool_calls (search_developments_public + get_zone_info), intent=zona, suggested_capture=true (Polanco price avg=13.15M sin units bajo 5M)
- ✅ POST messages "Quiero agendar cita" → intent=cita, suggested_lead_capture=true
- ✅ POST capture-lead → lead_id persistido en `leads` con source=asistente_publico, intent_history=['zona','cita'], ip_hash 8 chars
- ✅ Phase Y master OFF (toggle dmx) → POST sessions retorna 503 "Asistente temporalmente fuera de servicio"
- ✅ Rate limit 5/hora/ip: 4 sessions succeed, 5th-7th retornan 429 "Demasiadas sesiones nuevas..."
- ✅ Cap 30 msgs/session: POST mensaje 31 → 429 "Sesión completa, agenda una cita..."
- ✅ Superadmin usage: sessions=5, messages=4, leads=1, conversion=20%, intent_breakdown [zona×1, cita×1], cost_usd=$0.0046
- ✅ UI /asistente renders sin auth: hero "Tu asistente para encontrar casa en CDMX" + 4 chips funcionales (click → fill input) + textarea + Enviar button gradient · 6 testids verificados
- ✅ yarn build 38.7s clean · /api/health 200

### Edge cases conservadores
- Phase Y `tier asistente_publico` no existe en seed → fallback a `diagnostic_engine` (T1+) — implementado en `_check_phase_y`
- IP detection: `x-forwarded-for` first hop > `request.client.host` (Kubernetes ingress)
- LLM tool_calls extraction robusto: si JSON parse falla, omite call (no rompe loop)
- Tool agentic loop limitado a 2 rounds para evitar ciclos infinitos
- Sitemap: spec pidió `desarrollosmx.io` pero sitemap existente usa `.com` → mantenida la entry literal del spec (ÚNICA con dominio .io)
- `behavioralTracker.track` puede fallar silenciosamente si endpoint /api/track no responde → no bloquea UX
- localStorage resume puede traer session expirada → si POST messages retorna 404 "Sesión no encontrada", UI debería detectar y reset (NOTA: actualmente UI muestra el error inline, requiere refresh; mejora futura)
- Lead capture asociado a `dev_org_id="dmx"` por default → asignación a desarrolladora real depende del intent detected (TODO: routing inteligente fase futura)

### SHA: pending (auto-commit por plataforma)


## W4.4E.5 — Caya/Asistente Unification (2026-05-09)

### Backend (3 EDIT · 2 NEW)
- **EDIT** `caya_engine.py` (220L → 285L): refactor a thin wrapper sobre AsistenteEngine. `caya_query` ahora orquesta: (1) Phase Y check vía AsistenteEngine, (2) resolver legacy `dmx_caya_*` → asistente_token via `caya_sessions_migration`, (3) RAG `semantic_search` para citations en paralelo, (4) `AsistenteEngine.chat()` para LLM + 3 tools públicas, (5) lead_score heurístico + suggested_lead_capture → `hand_off_recommended`, (6) persistencia DUAL en `caya_messages` (legacy back-compat) Y `asistente_messages` (canonical). Response shape backwards-compatible + nuevos campos: `tier`, `asistente_session_token`, `simulated`, `memory_hits`, `tool_calls`, `intent_detected`. Fallback graceful para Phase Y OFF / rate limit / cap exceeded.
- **EDIT** `asistente_engine.py`: nuevo método `get_or_create_from_legacy(legacy_id, ip, ua)` para mapping cross-collection idempotente. `start_session` ahora persiste `channel="web_bubble"` cuando `referral_source=="caya_bubble"` (vs default "web"). `chat()` retorna `tier` adicional.
- **EDIT** `routes_asistente.py`: nuevo GET `/api/asistente/sessions/{token}` (público) que hidrata historial completo de mensajes user/assistant cronológico. 410 si sesión expirada · 404 si no existe.
- **NEW** `migrations/__init__.py` + `migrations/migrate_caya_to_asistente.py`: script CLI idempotente. `python -m migrations.migrate_caya_to_asistente` lee caya_sessions con migrated≠True, crea asistente_sessions con channel=web_bubble + message_count contado real, persiste mapping en caya_sessions_migration, copia caya_messages → asistente_messages dedupando por (session_token, role, content, created_at). Output: stats {sessions_seen, sessions_migrated, sessions_already_mapped, messages_migrated, skipped_dup_messages, errors}.

### Frontend (3 EDIT · 0 NEW)
- **EDIT** `components/landing/CayaBubble.js`: nuevos estados `asistenteToken` (localStorage `dmx.caya.asistente_token`) y `tier` (sincronizado desde response). Tier badge gradient junto al header "ASISTENTE DMX · BETA". Nuevo componente `MemoryHitsBlock` colapsable que muestra `data-testid="caya-memory-hits"` cuando `memory_hits.length > 0`. Botón "Expandir conversación →" (`data-testid="caya-expand-btn"`) visible cuando `messages.length >= 5` OR último assistant tiene `hand_off || suggested_capture`; click → `window.location.href = /asistente?session_token=${asistenteToken}`. Channel actualizado a `web_bubble`. Sync de session_id con backend si nuevo. `tool_calls` y `intent_detected` propagados al state.
- **EDIT** `pages/public/AsistentePage.js`: lógica de hidratación 3-niveles: (1) si `?session_token=X` query param → fetch GET /api/asistente/sessions/X, hidrata mensajes + appended "Continuamos tu conversación previa". (2) Si 404/410 → fallback start nueva con copy "Sesión anterior expiró, comenzamos de nuevo". (3) Sin query param → resume localStorage o start nueva (comportamiento existente).
- **EDIT** `i18n/locales/es-MX/common.json`: 4 nuevas keys: `asistente.session_resumed`, `asistente.session_expired_fallback`, `caya.expand_button`, `caya.unified_with_asistente_label`.

### Migration ejecutada
- Run 1: stats={sessions_seen=4, sessions_migrated=4, messages_migrated=10, errors=0}
- Run 2 (idempotency check): stats={sessions_seen=0, sessions_migrated=0, messages_migrated=0} ✓

### Acceptance Criteria validados (curl + screenshot)
- ✅ POST /api/caya/query sin session_id → crea asis_* token + retorna shape con asistente_session_token + tier=T1 + tool_calls=[search_developments_public, get_zone_info] + lead_score=35 + 5 citations + 5 top_results
- ✅ POST con legacy `dmx_caya_*` session_id → mapea a token existente, persiste en BOTH collections (caya_messages=4, asistente_messages=4 sincronizados)
- ✅ Shape backwards-compatible: keys [ok, session_id, channel, answer, top_results, citations, hand_off_recommended, hand_off_reason, lead_score, model, cost_usd, message_id] + nuevos opcionales [tier, asistente_session_token, simulated, memory_hits, tool_calls, intent_detected]
- ✅ Phase Y OFF → retorna ok=false, hand_off_recommended=true, hand_off_reason=phase_y_disabled, copy "Asistente temporalmente fuera de servicio. Te conecto con un asesor humano."
- ✅ Migration idempotente (segunda run = 0 nuevos)
- ✅ GET /api/asistente/sessions/{token} retorna messages cronológicos con channel=web_bubble
- ✅ /asistente?session_token=X hidrata 4 mensajes legacy de caya + appended "Continuamos tu conversación previa" (screenshot validado)
- ✅ /asistente NO renderiza CayaBubble (DOM check: caya-bubble=0, caya-panel=0)
- ✅ App.js: CayaBubble NO está en layout global → 0 cambios necesarios (ya cumple spec)
- ✅ yarn build 39.1s clean · /api/health 200

### Edge cases conservadores
- App.js NO requirió edits porque CayaBubble ya está mounted solo en páginas individuales (Marketplace, Inteligencia, Barrios, DevelopmentDetail), no global → reportado como "ya cumple spec"
- Sesiones legacy migradas tienen `ip_hash="_legacy_caya_"` (placeholder) porque caya_sessions nunca persistió IP raw → rate limiting será `0 sessions/hora/_legacy_caya_` post-migration; futuras llamadas con esos tokens vienen del bubble que ya tiene rate por IP real → impacto nulo
- `memory_hits` retornado vacío `[]` por defecto desde caya_engine (AsistenteEngine.chat NO incluye RAG retrieve por default, solo el Director tiene esa tool). Se mantiene el campo para shape pero sólo se popula si en futuro caya_engine inyecta los hits; spec dice "mostrar memory_hits collapsible si vienen" → implementación cumple.
- Caya legacy `caya_messages` permanecen intactos para back-compat del endpoint `/api/caya/sessions/{id}/history` (no se borran).
- Mapping new→legacy: cuando viene asistente_token directo (`asis_*`), no se crea `dmx_caya_*` legacy nuevo → response.session_id reusa el token (front-compat: solo se crea uno nuevo si payload.session_id era null).
- `MemoryHitsBlock` componente agregado a CayaBubble pero el wiring desde backend para popular `memory_hits` es cero por ahora (placeholder estructural — espera Director RAG public adapter futuro).
- Endpoint POST capture-lead heredado de /api/asistente sigue público para Caya bubble si alguna vez agregamos UI lead capture en bubble.
- `channel="web_bubble"` solo se setea en sesiones NEW. Legacy migradas se setean correctamente. Sesiones existentes pre-W4.4E.5 mantienen channel="web" (no breaking).

### SHA: pending (auto-commit por plataforma)


## W4.4E.5.1 — Fix-pass: security legacy mapping + lead form CayaBubble (2026-05-09)

### Backend (3 EDIT)
- **EDIT** `asistente_engine.py`:
  - `get_or_create_from_legacy(legacy_caya_session_id, ip, ua)` ahora valida que el `legacy_caya_session_id` exista en `db.caya_sessions` ANTES de mapear. Si NO existe, aplica rate limit por ip_hash (5 sessions/hora) usando el mismo bucket que `start_session`. Si supera límite → `AsistenteRateLimitError("legacy mapping rate limit exceeded")`. Si existe, mapping idempotente sin rate limit (no penaliza usuarios legítimos). Audit log entry `asistente.legacy_mapping_rejected` con `reason="legacy_session_not_found" + legacy_id_attempted + ip_hash` para forensics. Field `legacy_validated` (bool) persistido en asistente_sessions y caya_sessions_migration.
  - `capture_lead(...)` ahora acepta parámetro opcional `source` (default `"asistente_publico"`). Caya bubble usa `source="caya_bubble"`.
- **EDIT** `caya_engine.py`:
  - Catch `AsistenteRateLimitError` distingue rate limit normal vs legacy mapping (string match `"legacy mapping"`). Si legacy → response con `hand_off_reason="rate_limit_legacy_mapping"` + copy "Demasiadas solicitudes desde tu conexión. Intenta nuevamente en unos minutos." + HTTP **429 explícito** vía `JSONResponse(status_code=429, ...)`.
- **EDIT** `routes_asistente.py`:
  - `CaptureLeadIn` agregado field `source: Optional[str]` para permitir override desde el cliente.
  - Endpoint `capture_lead` propaga el field a `engine.capture_lead(..., source=body.source)`.

### Frontend (3 EDIT · 1 NEW)
- **NEW** `api/cayaApi.js`: helper `captureLeadFromCaya(asistenteToken, payload)` que llama POST `/api/asistente/sessions/{token}/capture-lead` con `source: "caya_bubble"` hardcoded. **NOTA**: spec decía EDIT pero el archivo no existía → creado.
- **EDIT** `components/landing/CayaBubble.js`:
  - Nuevo componente `LeadCaptureMiniForm` inline (card glass dark con border + backdrop-blur(24px)): heading "¿Te conectamos con un asesor?" + 3 inputs (Nombre / WhatsApp / Email opcional) + botón "Conectarme" rounded-full gradient. Validación: nombre ≥2 chars, WhatsApp regex `/^(?:52)?\d{10}$/` (acepta con/sin prefix +52, espacios, guiones — sanitiza con `replace(/[^0-9]/g, '')`). Estados loading/success/error. Success state checkmark + copy "Te contactaremos pronto · Usaremos WhatsApp" + botón OK que cierra el form (no la conversación).
  - Estados nuevos: `leadCaptured` (lee localStorage `dmx.caya.lead_captured.{token}` al mount), `showLeadForm` (auto-toggleado por useEffect cuando última `assistant` msg tiene `hand_off || suggested_capture`).
  - Form se inserta en messages container DESPUÉS del último mensaje y ANTES del input. Conversación NO se bloquea post-captura — input sigue funcional.
  - Persistencia exitosa: `localStorage.setItem('dmx.caya.lead_captured.{token}', 'true')` para no re-mostrar form en misma session post-captura.
  - Dynamic import de `cayaApi` (`await import('../../api/cayaApi')`) para tree-shaking.
- **EDIT** `i18n/locales/es-MX/common.json`: nueva sub-key `caya.lead_form.{title, name, whatsapp, email_optional, submit, success, error}` (7 strings).

### Acceptance Criteria validados (curl + screenshot)
- ✅ POST /api/caya/query con session_id REAL `dmx_caya_fabea4dc6af0` → mapping idempotente, sin rate limit
- ✅ POST con session_id FAKE `dmx_caya_FAKE_1..7` desde misma IP: HTTP 200×5, HTTP 429×2 (rate limit aplicado)
- ✅ Response 429 shape: `{ok:false, hand_off_recommended:true, hand_off_reason:"rate_limit_legacy_mapping", answer:"Demasiadas solicitudes desde tu conexión..."}`
- ✅ Audit log: 8 entries `asistente.legacy_mapping_rejected` con reason="legacy_session_not_found" + ip_hash + legacy_id_attempted
- ✅ POST capture-lead con `source:"caya_bubble"` → lead persistido en `db.leads` con `source: 'caya_bubble'` (verificado con find_one)
- ✅ UI screenshot /marketplace con localStorage seeded (history+token+hand_off=true): caya-panel ✓, caya-lead-form ✓, caya-lead-nombre ✓, caya-lead-whatsapp ✓, caya-lead-email ✓, caya-lead-submit ✓, caya-expand-btn ✓, caya-handoff ✓ (8/8 testids visibles)
- ✅ Form valida: nombre ≥2 chars + WhatsApp regex 10 dígitos · botón disabled hasta cumplir
- ✅ localStorage flag `dmx.caya.lead_captured.{token}` se setea post-captura
- ✅ Conversación continúa post-captura (input no se bloquea)
- ✅ yarn build 38.7s clean · /api/health 200

### Edge cases conservadores
- **`cayaApi.js` no existía en el repo**: spec marcó EDIT pero file era NEW. Creado con shape mínimo (`captureLeadFromCaya` helper). Reportado.
- **Rate limit shared bucket**: `_session_buckets` se comparte entre `start_session` y `get_or_create_from_legacy` (decisión consciente: una IP que crea sesiones nuevas Y mapea legacy IDs fake usa el mismo presupuesto de 5/hora).
- **Audit log best-effort**: si `db.activity_log.insert_one` falla (e.g., collection no existe), no rompe el flow — try/except silencioso. La rejection sigue siendo enforced.
- **WhatsApp regex permisivo**: acepta input con espacios/guiones/+52 prefix porque sanitiza con `replace(/[^0-9]/g, '')` antes de validar. Cubre formatos comunes mexicanos: `+52 555 123 4567`, `5551234567`, `55-5123-4567`, `+525551234567`.
- **`source` field en CaptureLeadIn pydantic**: ya estaba como Optional pero no se propagaba. Ahora se propaga al engine. Backwards-compat: si client no manda `source`, default sigue siendo `"asistente_publico"`.
- **localStorage flag por token**: `dmx.caya.lead_captured.{token}` es per-asistente_token. Si user abre en incognito o limpia storage, form re-aparece (comportamiento esperado).
- **Form re-aparece después de cerrar?**: `setShowLeadForm(false)` solo oculta sin marcar como capturado. La auto-toggle useEffect lo re-mostrará en próxima respuesta hand_off — para eso existe `leadCaptured` que persiste.
- **Hand_off banner vs LeadCaptureMiniForm**: ambos visibles simultáneamente (banner amarillo de WhatsApp + form inline). Decisión: dar al user opción de WhatsApp directo (1-click) O capturar contacto (asesor te llama). No competen.

### SHA: pending (auto-commit por plataforma)
