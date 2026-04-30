# DesarrollosMX (DMX) — PRD

## Identidad del producto
**DesarrollosMX** — AI-native Spatial Decision Intelligence Platform para real estate residencial nuevo en LATAM. Marketplace público = desarrollos nuevos. Individuales (reventa) viven en el portal asesor privado (Fase 4 CRM Pulppo+). Moonshot: $1–5B valuation en 3–5 años.

---

## Stack técnico
- **Backend**: FastAPI + Motor (Mongo) + emergentintegrations (Claude Sonnet 4.5)
- **Frontend**: React 18 + Tailwind + CSS vars + react-i18next + Mapbox GL JS
- **DB**: MongoDB con caches weekly/24h
- **Map**: Mapbox GL JS
- **AI**: Claude Sonnet 4.5 (briefings, argumentarios, parser NLP)

---

## Design System (NON-NEGOTIABLE)
- Navy `#06080F` + Cream `#F0EBE0` + Gradient `#6366F1→#EC4899`
- Outfit (headings) + DM Sans (body)
- Zero emoji · solo SVG (lucide-style en `/components/icons/`)
- Buttons border-radius 9999px
- Motion ≤850ms, `once:true`, transforms Y-only

---

## Score system
Vida (Leaf) / Movilidad (Route) / Seguridad (Shield) / Comercio (Store)  
+ Plusvalía / Educación / Riesgo (extension comparador).

---

## Arquitectura implementada

### Backend `/app/backend/`
- `server.py` — core: auth, public marketplace, Claude briefing/parser (973 líneas)
- `routes_advisor.py` — **nuevo Fase 4**: CRUD contactos/búsquedas/captaciones/tareas/operaciones/comisiones + argumentario AI + briefing + leaderboard
- `data_seed.py` — 16 colonias CDMX
- `data_developments.py` — 10 developers + 15 developments + ~420 units

Endpoints públicos (marketplace + ficha):
- `GET /api/colonias`, `/api/colonias/{id}`, `/api/developments`, `/api/developments/{id}`, `/api/developments/{id}/units`, `/api/developments/{id}/similar`, `/api/developers/{id}`
- `POST /api/developments/{id}/briefing`, `POST /api/properties/search-ai`
- `POST /api/auth/{login,register,session,logout}`, `GET /api/auth/me`

Endpoints asesor (Fase 4, gated por role `advisor|asesor_admin|superadmin`):
- `GET/PATCH /api/asesor/profile`
- `GET /api/asesor/dashboard`
- `GET/POST /api/asesor/contactos`, `GET /api/asesor/contactos/{id}`, `PATCH/DELETE` idem, `POST /api/asesor/contactos/{id}/timeline`
- `GET/POST /api/asesor/busquedas`, `PATCH /api/asesor/busquedas/{id}/stage` (hard validations), `POST /visit`, `POST /offer`, `GET /matches` (motor 5 dim determinístico)
- `GET/POST /api/asesor/captaciones`, `PATCH /stage`, `GET /{id}`
- `GET/POST /api/asesor/tareas`, `PATCH /done` (+5 XP), `DELETE`
- `GET/POST /api/asesor/operaciones`, `PATCH /status` (con transiciones válidas), `GET /{id}`. Al crear: código único 3-4-4, IVA 16%, split asesor 80% / DMX 20%, cierre otorga +250 XP + cierres_total.
- `GET /api/asesor/comisiones` (forecast 6m, by_status, totales)
- `POST /api/asesor/argumentario` (Claude Sonnet 4.5, cache semanal)
- `POST /api/asesor/briefing/daily` (stub con datos reales del usuario)
- `GET /api/asesor/leaderboard`
- `GET /api/asesor/perfil-publico/{slug}`
- `POST /api/asesor/_seed-demo` (6 contactos + 3 búsquedas + 2 captaciones + 4 tareas + 2 operaciones)

### Frontend `/app/frontend/src/`
- `App.js` — rutas: `/`, `/marketplace`, `/propiedad/:id`, `/desarrollo/:id`, `/mapa`, `/asesor/*`.
- `pages/DevelopmentDetail.js` — **completo Iteración B**: 5 tabs + sticky sidebar + paywall gating
- `pages/Marketplace.js` — refactor completo Iteración A
- `pages/advisor/*` — **nuevo Fase 4**:
  - `AsesorDashboard.js` (widgets + briefing IA + perfil score)
  - `AsesorContactos.js` (tabla + detalle drawer + argumentario Claude drawer)
  - `AsesorBusquedas.js` (Kanban 6 columnas con DnD + validaciones duras + matches motor)
  - `AsesorCaptaciones.js` (Kanban 6 columnas + gate de campos mínimos)
  - `AsesorTareas.js` (3 columnas por scope + wizard 2 pasos)
  - `AsesorOperaciones.js` (tabla + wizard 6 pasos + transiciones de estado)
  - `AsesorComisiones.js` (stats + desglose + recientes)
  - `AsesorRanking.js` (leaderboard Elo)
- `components/advisor/AdvisorLayout.js` — sidebar nav + role gate
- `components/advisor/primitives.js` — PageHeader, Card, Stat, Badge, Empty, Toast, Drawer
- `components/dev/*` — Iteración B complete (DescriptionTab, PriceListTab, ProgressTab, AmenitiesTab, LocationTab, Sidebar, RegistrationModal, PhotoGallery, FloorPlan)
- `i18n/locales/{es,en}.json` — keys dev.* (~80 nuevas) + gate.* expandidos
- `api/advisor.js` — helpers consolidados del portal

---

## Flujos clave (Fase 4)

1. **Role gating**: `/asesor/*` redirige a `/` si no hay sesión; muestra 403 si rol ≠ advisor|asesor_admin|superadmin.
2. **Kanban drag&drop**: optimistic UI + validación servidor:
   - `busqueda → visitando` requiere `visits >= 1`
   - `busqueda → ofertando/ganada` requiere `offers >= 1`
3. **Argumentario IA**: POST `/api/asesor/argumentario` con `{contacto_id, desarrollo_id, objetivo}`. Cache semanal (MD5 key con ISO-week). Fallback text si Claude falla.
4. **Operación split 80/20 transparente**: wizard 6 pasos visualiza cálculo en vivo (valor × pct = base, +IVA 16%, split asesor 80% / DMX 20%).
5. **Matcher motor**: 5 dimensiones deterministas (precio 30% + zona 25% + amenidades 20% + recámaras 15% + urgencia 10%). Retorna top 12 con rationale chips.

---

## Testing
- 2026-04-30 **Phase 6 Wave 1 — DMX Studio**:
  - Backend `routes_studio.py`: video stub (Claude script + storyboard), ads engine (Claude copies + gpt-image-1 hero images lazy-loaded). Adapter pattern via `STUDIO_VIDEO_ENGINE` / `STUDIO_ADS_ENGINE` env vars.
  - Verified: video script generation (3-scene storyboard + voice + music); ads batch (10 unlocked + 90 locked) with real Claude copies and 1 gpt-image-1 hero per ángulo.
  - Frontend Studio dashboard + 2 wizards + batch detail drawer screenshot-verified with real generated content in es-MX.
- 2026-04-30 **OAuth profile_completed flag**: explicit boolean replaces derived check; PATCH /profile auto-flips on min fields satisfied.
- 2026-04-30 **Phase 5 Developer Portal MVP**:
  - Backend: 9+ endpoints curl-verificados (`/api/desarrollador/*`)
  - Backend Claude D9 reportes: genera resumen ejecutivo real con Sonnet 4.5
  - Frontend smoke screenshots: dashboard (15 devs, $589M booked, $947M pipeline), demanda (16 colonias heatmap + 10 top queries + funnel), pricing (27 sugerencias renderizadas)
- 2026-04-30 **Iteración B + Fase 4 backbone** (iteration_3 + smoke tests)
  - Backend: manual curl verificó 8+ endpoints (dashboard, busquedas stage validation, comisiones, operaciones creation/status, briefing, role check superadmin)
  - Frontend: smoke screenshot del `/asesor` dashboard
- 2026-04-30 Iteración A (iteration_3.json): Backend 24/24 pytest + Frontend 100%.

⚠️ **No se ejecutó testing_agent_v3_fork end-to-end** — programado para próxima sesión cubriendo todos los flujos públicos + asesor + desarrollador.

---

## Credenciales de prueba (ver `/app/memory/test_credentials.md`)
- `admin@desarrollosmx.com` / `Admin2026!` → superadmin
- `asesor@demo.com` / `Asesor2026!` → advisor
- `developer@demo.com` / `Dev2026!` → developer_admin

Demo data CRM: `POST /api/asesor/_seed-demo` (idempotente).

---

## 2026-04-30 — QA bug fixes (B1–B9)
Sesión de QA E2E del usuario arrojó 8 bugs. Fixed todos en este iterate:
- **B1** AuthModal wired en "Entrar" (landing + todas las rutas). Google OAuth + email/password + switch a registro.
- **B2** Role picker:
  - Email register: selector Comprador / Asesor / Developer dentro del AuthModal (ya estaba, se conservó).
  - Google OAuth: nuevo flag `onboarded` en `users`. Usuarios nuevos de OAuth `onboarded=False` → el hook del AuthProvider monta `<RolePicker/>` modal no-dismissible hasta que eligen.
  - Nuevo endpoint `POST /api/auth/select-role` (solo acepta `onboarded is False`, idempotente).
  - Usuarios existentes (onboarded=None o True) no ven el picker.
- **B3** `AsesorDashboard.load()` envuelto en try/catch: 401 → redirect a `/?login=1&next=/asesor`; otros errores muestran bloque "Reintentar" en vez de crash.
- **B4** Null-safe render en AsesorDashboard (`!data` → empty state limpio).
- **B5** AdvisorRoute en App.js: fuerza redirect a `/?login=1&next=...` si no hay user (pattern mirror de `/desarrollador`).
- **B7** Toggle ES/EN en Navbar (desktop + mobile sheet) + persistencia `localStorage.dmx_lng`.
- **B8** PriceListTab: PUBLIC_VISIBLE_COUNT 4 → 3, + overlay CTA absoluto encima de las filas blur con "Regístrate para ver toda la lista".
- **B9** Rutas diferenciadas:
  - `/propiedades` → redirect a `/marketplace` (vía `<Navigate>`)
  - `/barrios` → stub educativo "16 barrios de CDMX leídos por IE Score" + CTA mapa
  - `/inteligencia` → moat narrativo "97 indicadores detrás de cada precio" (7 categorías)
  - `/asesores` → landing B2B con 6 pilares + 4 steps + CTA "Crear mi cuenta de asesor" (abre AuthModal en `mode='register'`)

---

## Variables de entorno
- Backend: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MAPBOX_TOKEN`, `DMX_FALLBACK_WHATSAPP`
- Frontend: `REACT_APP_BACKEND_URL`, `REACT_APP_MAPBOX_TOKEN`

---

## Backlog priorizado

### P0 — Antes del próximo release
- [ ] **E2E testing con `testing_agent_v3_fork`** — 3 personas: buyer (landing→ficha→paywall→login), advisor (login→argumentario→búsqueda ganada→prefill operación), developer admin (inventario→demanda→pricing approve→radar competidores)
- [ ] Onboarding form post-OAuth Google (no solo email/password login)
- [ ] Fix warnings ESLint residuales

### P1 — Phase 4 extensiones
- [ ] Mifiel NOM-151 real (acuerdo comercial captación + escritura)
- [ ] WhatsApp Business API real para briefing diario
- [ ] Google Calendar OAuth bidireccional en tareas
- [ ] Adjuntos/fotos captaciones (upload + AI classify)
- [ ] Elevación de rol desde superadmin UI

### P1 — Phase 5 extensiones
- [ ] Inventario: bulk Excel/CSV upload + drag reorder fotos + tour 360° upload
- [ ] Pricing: A/B test, bundle pricing, calendario subidas programadas
- [ ] Reportes: PDF branded developer + distribución email auto + link único trackeable
- [ ] Demanda: mapa Mapbox real-time (hoy es lista) + export GeoJSON
- [ ] Competidores: alertas push, histórico precios 12m, SEO/SEM presence

### P2 — Mejoras
- [ ] Búsqueda semántica embeddings OpenAI en marketplace público
- [ ] Comparador 3-way de desarrollos
- [ ] Wrapped anual del asesor
- [ ] Expansión Dubai / Miami
- [ ] Public profile `/asesor/perfil/:slug` con endorsements

### Refactor (no blocker)
- [ ] Split `server.py` en routers (auth/marketplace/developments/briefings/ai-search)
- [ ] Split landing components grandes (ColoniasBento, Hero)
- [ ] Backend tests unit (pytest) por router

---

## URL preview
https://propiedades-next.preview.emergentagent.com

- `/` Landing
- `/marketplace` Grid desarrollos + AI search + filtros horizontales
- `/desarrollo/altavista-polanco` Ficha completa (Iteración B)
- `/mapa` Mapbox CDMX
- `/asesor` Panel asesor (login `asesor@demo.com`)
- `/asesor/contactos|busquedas|captaciones|tareas|operaciones|comisiones|ranking`
