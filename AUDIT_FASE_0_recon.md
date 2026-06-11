# AUDIT FASE 0 — Reconocimiento y detección de stack
Fecha: 2026-06-10 · Modo: READ-ONLY · Repo verificado: `desarrollos_mvp_emergent` (DMX) · rama `dev-redesign-tandas` · remote `github.com/manuia88/desarrollos_mvp_emergent`

> Nota de método: esta auditoría formal capitaliza 5 rondas previas (QA1–QA5, ver `memory/QA3_MASTER_REPORT.md` y `memory/QA_FIX_CHECKLIST.md`) donde ya se ejecutó y verificó gran parte de los hallazgos con archivo:línea y pruebas en runtime contra la BD real. Las fases siguientes citan esa evidencia + verificación fresca de esta ronda.

## ▓▓ STACK DETECTADO ▓▓
| Capa | Tecnología | Versión | Evidencia |
|---|---|---|---|
| Backend | Python + **FastAPI** | 0.104.1 | backend/requirements.txt |
| Driver DB | **Motor** (MongoDB async) + pymongo | 3.3.2 / 4.6.0 | requirements.txt |
| **Base de datos** | **MongoDB — DOCUMENTAL / NoSQL** | — | motor/pymongo; `MONGO_URL` en .env.local |
| Validación input | **Pydantic** | 2.9.2 | requirements.txt |
| Auth | python-jose / PyJWT (HS256) + **bcrypt** (passwords) | 3.5.0 / 4.1.3 | server.py:1167 `bcrypt.hashpw`, :1244 `pyjwt.decode` |
| Frontend | **React (Create React App)** | 18.2 / react-scripts 5.0.1 | frontend/package.json |
| Router FE | react-router-dom | 6.16 | package.json |
| ASGI server | uvicorn | 0.24.0 | requirements.txt |
| Pagos | Stripe | 15.0.1 | requirements.txt |
| IA/LLM | OpenAI 1.99.9 + Anthropic + Emergent LLM | — | requirements.txt + env |
| Observabilidad | sentry-sdk | 2.20.0 | requirements.txt |
| Analytics FE | posthog-js | 1.205.1 | package.json |
| Mapas | mapbox-gl | 3.23 | package.json |

**IMPLICACIÓN CLAVE PARA LA AUDITORÍA:** Base **NoSQL sin seguridad a nivel de fila**. El aislamiento entre tenants depende 100% de que CADA query filtre por el identificador de tenant en la capa de aplicación. Esa es la cacería principal de la Fase 1.

## Tamaño del sistema
- Backend: **311** archivos `.py` (raíz) + **214** archivos en `backend/routes/`.
- Frontend: **893** archivos `.js/.jsx` en `frontend/src`.
- Estructura raíz: `backend/`, `frontend/`, `docs/`, `memory/`, `mockups/`, `scripts/`, `test_reports/`.

## Base(s) de datos — colecciones
- DB activa: **`desarrollosmx`** (`.env.local` tiene `DB_NAME` DUPLICADO: dmx_local y desarrollosmx → gana el último). **390 colecciones**; **100 con datos, 290 vacías**.
- Top por volumen: ie_score_history (10266), denue_businesses (4749), connector_invocations (4565), ie_scores (3422), crime_zone_colonia (1573), denue_zone_density (1571 · poblada por OSM), colonias (1524 · gov), dmx_units (496), zone_scores (168), cube_aggregations (160).
- **VACÍAS las colecciones "vivas" de negocio**: `developments`=0, `transactions`=0, `leads`=0, `asesor_busquedas`=0, `asesor_contactos`=0 → el sistema corre sobre **seed in-memory** (`data_developments.py`, estatus generado por md5). Esto vuelve LATENTES casi todos los bugs (estallan al entrar dato real). Detalle en QA5.

## Inventario de endpoints (resumen)
- ~**1,317** paths backend (FastAPI routers). El arnés `scripts/qa_sim3.py` barrió **557 rutas GET** sin params → 0 errores 500 reales (dist: 200×477, 400×6, 401×3, 403×2, 404×1, 422×59, 503×7 KG-off).
- Auth: la mayoría exige sesión vía `get_current_user` (server.py:1214) + gates por rol (`require_dev_admin`, `require_advisor`, `require_superadmin`, `validate_api_key` para API v1). **Endpoints públicos** (sin auth) por diseño: marketplace/`public.py`, `avm-public`, landings, `funnel` (este último es un HALLAZGO, ver Fase 1/11). Inventario detallado de auth por endpoint → Fase 3.

## Variables de entorno
**Backend (.env.local · solo nombres):** ADMIN_EMAIL, **ADMIN_PASSWORD**, ANTHROPIC_API_KEY, APIFY_API_TOKEN, CEREBRO_ENABLED, CORS_ORIGINS, **CRON_SECRET**, DB_NAME, EMERGENT_LLM_KEY, FRONTEND_URL, GITHUB_TOKEN, GOOGLE_OAUTH_CLIENT_SECRET, **IE_FERNET_KEY**, IE_BANXICO_TOKEN, IE_*_RESOURCE_ID, **JWT_SECRET**, **LFPDPPP_SALT**, MAPBOX_TOKEN, **MONGO_URL**, NEO4J_PASSWORD, OPENAI_API_KEY, STRIPE_*, etc. ⚠️ Claves DUPLICADAS: DB_NAME, MONGO_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD aparecen 2× (riesgo de configuración ambigua).
**Frontend (REACT_APP_* → SE HORNEAN EN EL BUNDLE DEL NAVEGADOR):** REACT_APP_BACKEND_URL, REACT_APP_MAPBOX_TOKEN (público OK), REACT_APP_POSTHOG_KEY / API_KEY / HOST, REACT_APP_SENTRY_DSN, **REACT_APP_LFPDPPP_SALT** ⚠️ (salt de hashing de PII expuesto al cliente — ver Fase 4), feature flags (DEV_V2, LEADS_V2, COMMAND_CENTER, etc.).

**Higiene git (verificado):** `.gitignore` ignora `.env`, `.env.*`, `*.env` (correcto) · `git log --all` **NO muestra ningún `.env` jamás commiteado** (limpio).

## Deploy / servicios externos
- CI: `.github/workflows/ci.yml`. No hay Dockerfile/vercel.json/render.yaml en raíz → deploy vía plataforma Emergent (externa).
- Servicios externos conectados (mapa vivo/muerto en QA4 → Fase 10): Stripe, OpenAI/Anthropic/Emergent, Sentry, PostHog, Mapbox, Twilio (WA), Resend (email), Google Drive/OAuth/Calendar, BANXICO, OSM/Overpass, INEGI, NOAA, AirROI, Apify, SIGCDMX, Catastro, Atlas, GTFS, FGJ, Neo4j (KG).

## Conteo por severidad de esta fase
Fase 0 es reconocimiento — sin severidades. 1 observación de configuración (claves env duplicadas → P3) que se documenta en Fase 4.
