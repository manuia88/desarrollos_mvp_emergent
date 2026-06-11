# AUDIT FASE 10 — Configuración de producción y observabilidad
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
**La observabilidad está MUERTA** (Sentry con DSN inválido → no-op; PostHog server off): con fail-open en todos los engines, los errores en producción son **invisibles** — el problema más peligroso para operar. Faltan **headers de seguridad** (solo CORS configurado), **rate-limit en login**, y **throttle de ráfaga en la API vendible**. Hay envs requeridas con **defaults peligrosos** que no fallan-cerrado en prod. Backups: no verificable desde código.

**Conteo:** P0: 2 · P1: 3 · P2: 2

### [P0] Observabilidad de errores no funciona
- **Ubicación:** `SENTRY_DSN` (y `REACT_APP_SENTRY_DSN`) contienen un **token `sntryu_…`, no un DSN URL** → `observability.init_sentry()` lanza `BadDsn`, queda no-op (verificado QA4 ejecutando: `_sentry_initialized=False`). PostHog server-side sin key.
- **Impacto:** ningún error cliente ni servidor se captura. Combinado con fail-open universal, los bugs silenciosos (campos mal leídos, fuentes muertas, ML inerte) **nunca alertan**. Operar a ciegas.
- **Fix:** poner un DSN real (URL `https://…@…ingest.sentry.io/…`) en `SENTRY_DSN`; validar con `/api/_internal/test-sentry`.

### [P0] Stripe webhook fail-open sin secreto
- **Ubicación:** `routes/public_api_v1.py:591-604` — si falta `STRIPE_WEBHOOK_SECRET`, acepta el JSON sin verificar firma ("Test mode … accept JSON as-is").
- **Impacto:** en prod sin esa env, cualquiera POSTea eventos de billing falsos (suscripciones/upgrades) → fraude de facturación.
- **Fix:** rechazar (fail-closed) si falta el secreto cuando `DMX_ENV=prod`.

### [P1] Faltan headers de seguridad
- **Evidencia:** `server.py` tiene UN solo `add_middleware` (CORS). Sin HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **Impacto:** clickjacking (sin X-Frame-Options), MIME-sniffing, sin forzar HTTPS a nivel app, sin CSP contra XSS.
- **Fix:** middleware de security headers (o configurarlos en el proxy/plataforma).

### [P1] Envs con default peligroso (no fail-closed en prod)
- `JWT_SECRET` → aleatorio efímero si falta (Fase 3); `ADMIN_PASSWORD` → `Admin2026!` (Fase 2); `STRIPE_WEBHOOK_SECRET` → fail-open (arriba); salts LFPDPPP con default. Ninguno aborta el arranque en prod.
- **Lista de envs REQUERIDAS para prod segura:** `JWT_SECRET`, `ADMIN_PASSWORD`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_DSN` (válido), `CORS_ORIGINS`, `MONGO_URL`, `DB_NAME` (sin duplicar), `LFPDPPP_SALT`, `CRON_SECRET`, `IE_FERNET_KEY`.
- **Fix:** validación de arranque que aborte si falta alguna crítica en `DMX_ENV=prod`.

### [P1] Rate-limit incompleto
- Login SIN rate-limit (Fase 3). API v1 (producto vendible) SIN throttle de ráfaga (solo cuota mensual) → martilleable. `avm-public/colonias/top` sin RL (los otros 4 públicos sí). 
- **Fix:** rate-limit en login + throttle por-segundo por api_key en v1 + RL en colonias/top.

### [P2] CORS
- `allow_origins` = lista explícita de `CORS_ORIGINS` (✅ no `*`), `allow_credentials=True`, pero `allow_methods=["*"]` (y probable `allow_headers=["*"]`). Aceptable si `CORS_ORIGINS` está bien seteada en prod; verificar que no quede vacía (cae a localhost → rompería el front prod, no es fuga).
- **Fix:** acotar methods/headers a los usados.

### [P2] Backups / PITR — no verificable desde código
- No hay evidencia en el repo de backups/point-in-time recovery (depende del proveedor Mongo). **PENDIENTE DE VERIFICAR en el panel del proveedor.**

## LIMPIO / OK
- CORS con orígenes explícitos (no wildcard). `.env` no commiteado. Crons con heartbeat (`cron_heartbeats`, 47 jobs, idempotencia del snapshot verificada QA4). Rate-limit SÍ activo en endpoints públicos de marketplace/AVM (429 verificado QA4).
