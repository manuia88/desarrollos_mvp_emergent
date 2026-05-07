# DesarrollosMX — CHANGELOG


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
