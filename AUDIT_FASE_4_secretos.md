# AUDIT FASE 4 — Exposición de secretos y datos sensibles
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
Higiene base BUENA: `.env*` está en `.gitignore` y **nunca se commiteó un `.env`** (verificado `git log --all`). Los secretos de servicio viven solo en el backend. PERO: (1) el **salt de hashing de PII se hornea en el bundle del navegador** (`REACT_APP_LFPDPPP_SALT`) con default público hardcodeado → la anonimización de PII es reversible; (2) varios **defaults hardcodeados peligrosos** (admin password, salts); (3) la observabilidad de errores está **muerta** (Sentry DSN inválido), lo que hace invisibles las fugas que sí ocurran en logs. Fuga en respuestas de error: mínima.

**Conteo:** P0: 1 (observabilidad muerta, ver también Fase 10) · P1: 2 · P2: 2

### [P1] Salt de hashing de PII expuesto en el bundle del cliente
- **Ubicación:** `frontend/src/lib/posthog.js:21` → `const SALT = process.env.REACT_APP_LFPDPPP_SALT || 'dmx-2026'`; uso en `:102` `sha256(user_id + SALT)`.
- **Evidencia:** todo `REACT_APP_*` se compila en el JS servido al navegador → el salt es público; y si la env no se setea, cae al literal `'dmx-2026'`.
- **Impacto:** el hash de PII (`user_id`) usado para "anonimizar" en analytics es **reversible por fuerza bruta** del espacio de user_ids con un salt conocido → des-anonimización (incumple el espíritu LFPDPPP que el propio nombre invoca).
- **Fix:** mover el hashing de PII al backend; el cliente nunca debe ver el salt. Hermanos backend (server-side, menos graves pero con default estático): `free_audit_engine.py` (`dmx_lfpdppp_2026`), `tour_3dgs_engine.py`, `fraud_detection_engine.py`, `behavioral_tracking_engine.py`.

### [P1] Defaults hardcodeados peligrosos
- `server.py:1287` `ADMIN_PASSWORD` default `Admin2026!` (ver Fase 2).
- `server.py:26` `JWT_SECRET` default efímero (ver Fase 3).
- Salts LFPDPPP con default literal en front y back (arriba).
- **Fix:** fail-closed en prod si falta cualquiera de estos env; sin literales embebidos.

### [P0] Errores invisibles (Sentry muerto) → fugas en logs no se detectan
- **Ubicación:** `REACT_APP_SENTRY_DSN` / `SENTRY_DSN` contienen un **token `sntryu_…`, NO un DSN URL** → `observability.init_sentry()` lanza `BadDsn` y queda no-op (verificado QA4 ejecutando). PostHog server-side también off.
- **Impacto:** cualquier dato sensible que se filtre en un `log.warning`/excepción (y hay fail-open en todos los engines) muere en logs locales sin alerta. No hay captura de errores cliente ni servidor. (Detalle y fix en Fase 10.)

### [P2] Secretos públicos por diseño (OK, documentar)
- `REACT_APP_MAPBOX_TOKEN` (token público de Mapbox, restringible por dominio), `REACT_APP_POSTHOG_KEY`/`API_KEY` (project key write-only de PostHog), `REACT_APP_SENTRY_DSN` (los DSN son públicos por diseño). Estos son aceptables en el cliente. Recomendación: restringir el token Mapbox por referrer.

### [P2] Fuga en respuestas de error — casi limpia
- **Evidencia (QA4/5):** 404 y 422 devuelven `{"detail": …}` sin stacktrace/pymongo/rutas internas. Único `detail=str(e)` crudo en `feature_visibility.py:672`.
- **Fix:** envolver ese caso en un mensaje genérico.

## Verificación de higiene (LIMPIO)
- `.gitignore` ignora `.env`, `.env.*`, `*.env` (front, back y raíz). ✅
- `git log --all --name-only | grep .env` (excluyendo .example) → **vacío**: ningún archivo de entorno se commiteó jamás. ✅
- Secretos de servicio (Mongo, Stripe, LLM, OAuth, Fernet, CRON_SECRET) NO tienen prefijo `REACT_APP_` → no llegan al bundle. ✅

## Pendiente de verificación (no concluyente desde código)
- Auditoría exhaustiva de `log.*`/`print` que impriman PII de clientes (tokens, emails, queries con datos personales). No se barrió línea por línea; recomendado un grep dirigido a `log.info(f"...{lead`/`{email`/`{phone`. Marcar como tarea.
