# AUDIT FASE 2 — Credenciales privilegiadas y bypass de acceso
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
**No hay credenciales privilegiadas filtradas al navegador** (la conexión a MongoDB y las API keys de servicio viven solo en el backend; `MONGO_URL`/`JWT_SECRET`/`STRIPE_*`/LLM keys NO tienen prefijo `REACT_APP_`). PERO: (1) el backend usa **UNA sola conexión Mongo con permisos completos para todo**, sin una credencial de menor privilegio ni scope por tenant a nivel de motor → el aislamiento queda 100% en la capa de aplicación (riesgo de la Fase 1); (2) hay un **default de contraseña de admin hardcodeado** (`Admin2026!`); (3) la única "credencial" que sí llega al cliente es el **salt de hashing de PII** (`REACT_APP_LFPDPPP_SALT`, ver Fase 4).

**Conteo:** P0: 1 · P1: 1 · P2: 2

### [P0] Default público de contraseña de admin
- **Ubicación:** `backend/server.py:1287` → `admin_pw = os.environ.get("ADMIN_PASSWORD", "Admin2026!")`; `:1286` `admin_email default "admin@desarrollosmx.io"`.
- **Evidencia:** `server.py:1289` loguea un warning si el default se usa en entorno no-dev, pero **NO bloquea el arranque ni la creación del admin**.
- **Impacto:** si `ADMIN_PASSWORD` no está seteada en producción, existe una cuenta superadmin con credencial conocida públicamente (`admin@desarrollosmx.io` / `Admin2026!`) → toma total del sistema (cross-tenant, todos los datos).
- **Fix propuesto:** fail-closed — abortar el arranque (o NO crear el admin) si `ADMIN_PASSWORD` no está seteada en `DMX_ENV=prod`. Nunca un default embebido.

### [P1] Una sola conexión Mongo con permisos totales sirve a TODOS los requests
- **Ubicación:** `MONGO_URL` única; `request.app.state.db` compartido por todos los endpoints (públicos y autenticados).
- **Impacto:** no hay defensa en profundidad a nivel de motor; un solo query sin filtro de tenant (Fase 1) lee/escribe cualquier dato. No existe una credencial read-only para superficies públicas.
- **Fix:** (mínimo) mantener el rigor del filtro app-layer (Fase 1); (ideal) usuario Mongo de menor privilegio para lecturas públicas y, si el plan lo permite, views/roles por scope.

### [P2] No se usa la conexión privilegiada para "ahorrarse" el filtro de tenant
- Revisado: los endpoints sanos SÍ filtran por `owner_id`/`dev_org_id` aunque usen la conexión única. No encontré un patrón de "usar admin para saltarse el scope" deliberado. Las fugas de Fase 1 son por **olvido del filtro**, no por uso intencional de superusuario. (Se documenta como limpio salvo lo de Fase 1.)

### [P2] Claves de entorno duplicadas
- `.env.local` define `DB_NAME`, `MONGO_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` **dos veces** → ambigüedad de configuración (gana la última; `DB_NAME` salta de `dmx_local` a `desarrollosmx`). Riesgo de apuntar a la DB equivocada según el orden.
- **Fix:** dejar una sola definición por clave.

## Credenciales de servicio (server-side, NO llegan al cliente) — inventario
MONGO_URL, JWT_SECRET, CRON_SECRET, IE_FERNET_KEY, STRIPE_* (secret), OPENAI_API_KEY, ANTHROPIC_API_KEY, EMERGENT_LLM_KEY, GOOGLE_OAUTH_CLIENT_SECRET, GITHUB_TOKEN, NEO4J_PASSWORD, APIFY_API_TOKEN, ELEVENLABS/DEEPGRAM/HEYGEN/FAL/PEDRA keys, IE_*_TOKEN/RESOURCE_ID. **Ninguna con prefijo `REACT_APP_`** → confirmado que no se hornean en el bundle. ✅
