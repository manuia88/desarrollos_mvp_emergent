# DesarrollosMX (DMX) — PRD

## Identidad del producto
**DesarrollosMX** — AI-native Spatial Decision Intelligence Platform para real estate residencial nuevo en LATAM. Marketplace público = desarrollos nuevos (preventa / en construcción / entrega inmediata / exclusiva). Individuales (segunda mano) viven en el portal asesor privado (Fase 4). Moonshot: $1–5B valuation en 3–5 años.

---

## Stack técnico
- **Backend**: FastAPI + Motor (Mongo) + emergentintegrations (Claude Sonnet 4.5)
- **Frontend**: React 18 + Tailwind + CSS vars + react-i18next + Mapbox GL JS
- **LLM**: Claude Sonnet 4.5 (briefings, AI search parser) + OpenAI embeddings (futuro)
- **DB**: MongoDB con caches para briefings y AI search queries (por ISO week / 24h)
- **Map**: Mapbox GL JS

---

## Design System (NON-NEGOTIABLE)
- Navy `#06080F` + Cream `#F0EBE0` + Gradient `#6366F1→#EC4899`
- Outfit (headings) + DM Sans (body)
- Zero emoji · solo SVG
- Buttons border-radius 9999px
- Motion ≤850ms, `once:true`, transforms Y-only

---

## Score system
Vida (Leaf) / Movilidad (Route) / Seguridad (Shield) / Comercio (Store)
+ Plusvalía / Educación / Riesgo (comparator radar extension)

---

## Arquitectura implementada (post Iteración A)

### Backend `/app/backend/`
- `server.py` — 973 líneas (split a routers pendiente)
- `data_seed.py` — 16 colonias CDMX
- `data_developments.py` — **10 developers + 15 developments + ~420 units**
- Endpoints marketplace:
  - `GET /api/colonias`, `/api/colonias/{id}`, `/api/colonias/{id}/propiedades`
  - `GET /api/developments` con filtros `colonia` (multi), `min_price/max_price`, `min_sqm/max_sqm`, `beds`, `baths`, `parking`, `stage`, `amenity` (multi), `featured`, `sort` (recent|price_asc|price_desc|sqm_desc)
  - `GET /api/developments/{id}` — detalle con units embebidas
  - `GET /api/developments/{id}/units` con filtros `status`, `beds`, `baths`, `parking`
  - `GET /api/developments/{id}/similar` — 3 similares
  - `GET /api/developers/{id}` — perfil + proyectos activos
  - `POST /api/developments/{id}/briefing` — Claude Sonnet 4.5 cached weekly
  - `POST /api/properties/search-ai` — Claude parser NL→filtros JSON, cached 24h
- Endpoints legacy (Fase 3 original, mantener hasta Iteración B):
  - `GET /api/properties`, `/api/properties/{id}`, `/api/properties/{id}/similares`
  - `POST /api/properties/{id}/briefing`
- Auth: `POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`

### Frontend `/app/frontend/src/`
- `App.js` — rutas: `/`, `/marketplace`, `/propiedad/:id`, `/desarrollo/:id`, `/mapa`. **CustomCursor mounted at App root** (fix cross-route).
- `pages/Marketplace.js` — **refactor completo**: 4-col grid, hero, sticky filter bar
- `pages/DevelopmentDetail.js` — **stub** (iteración B completará 5 tabs + paywall)
- `pages/PropertyDetail.js`, `pages/Mapa.js` — sin cambios
- `components/marketplace/TopFilters.js` — horizontal pills + drawer
- `components/marketplace/DevelopmentCard.js` — 480px compact card con stage band colored
- `api/marketplace.js` — extendido con developments + AI search helpers
- `i18n/locales/{es,en}.json` — nuevas keys `marketplace_v2.*`, `dev.*`, `detail.*`, `mapa.*`

---

## Moats activos
- **Briefing Claude (weekly cache)** — WhatsApp-shareable por desarrollo o propiedad.
- **AI search parser (24h cache)** — queries NL convertidas a filtros estructurados visibles como chips.
- **IE Score compuesto transparente** — receta pública.
- **Cero comisión transaccional**.

---

## Testing
- 2026-04-30 **Iteración A** (iteration_3.json): Backend 24/24 pytest · Frontend 100% (marketplace refactor, AI search, stub, cursor fix). Cero issues.
- 2026-04-30 Fase 3 inicial (iteration_2.json): 26/26 pytest + 100% frontend.
- 2026-04-30 Fase 2 refactor: Hero + Bento validados visualmente.

---

## Variables de entorno
- Backend: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MAPBOX_TOKEN`, `DMX_FALLBACK_WHATSAPP` (+525512345678)
- Frontend: `REACT_APP_BACKEND_URL`, `REACT_APP_MAPBOX_TOKEN`

---

## Backlog Priorizado

### P0 — Iteración B (próxima)
- [ ] `/desarrollo/:id` completa con 5 tabs:
  - Descripción (resumen + etapa proyecto + historial precio + developer card con verificaciones)
  - Lista de precios (tabla con columns ID/Prototipo/Nivel/m²priv/Balcón/Terraza/RG/m²total/Rec/Baños/Cajones/Tipo cajón/Bodega/Precio/Estado)
  - Avance de obra (barra % + timeline 7 fases + log fechado + fotos)
  - Amenidades (grid con iconos)
  - Localización (Mapbox + DENUE toggles)
- [ ] Sticky sidebar derecha:
  - Precio desde + CTAs (Agendar visita modal, Ver lista, WhatsApp funcional sin login)
  - Calculadora de inversión (slider plusvalía anual + Hoy/Entrega/Delta)
  - Plan de pagos (slider enganche + mensualidades derivadas de time-to-delivery)
- [ ] **Paywall público vs registrado**:
  - Público: 3-5 unidades visibles, resto blurred con CTA registro persuasivo, avance log último entry visible
  - Registrado: todo visible, click en row auto-actualiza calculadora, brochure + planos descargables
- [ ] Modal de registro con flow Google OAuth existente + mensaje persuasivo

### P0 — Iteración C
- [ ] Fase 4 Advisor Portal (CRM Pulppo+):
  - M03 Contactos (CRUD + scoring IE)
  - M04 Búsquedas kanban
  - M05 Captaciones (resale properties upload)
  - M06 Tareas · M07 Operaciones
  - Argumentario AI inline · daily WA briefing al asesor
- [ ] Roles `asesor`, `asesor_admin` con route guards
- [ ] Multi-tenant `tenant_id` en colecciones

### P1 — Fase 5 Developer Portal
- [ ] D1 Inventory real-time · D6 Demand Heatmap · D9 Monthly AI Report · D4 Dynamic Pricing · D3 Competitor Radar

### P2 — Mejoras
- [ ] Búsqueda semántica (embeddings OpenAI) además del parser
- [ ] Paginación + infinite scroll marketplace
- [ ] Galería real de fotos con upload en portal dev
- [ ] Comparador 3-way de desarrollos
- [ ] Expansión Dubai/Miami

### Refactor técnico (no blocker)
- [ ] Split `server.py` en routers (auth / marketplace / developments / briefings / ai-search / auth)
- [ ] Split landing components grandes (ColoniasBento, Hero)

---

## URL preview
https://31364a48-e9ea-4119-b8c5-755ae7a76d0c.preview.emergentagent.com

- `/` Landing
- `/marketplace` Grid desarrollos + AI search + filtros horizontales
- `/desarrollo/tamaulipas-89` Ficha stub (Iteración B la completa)
- `/propiedad/p007` Ficha propiedad legacy
- `/mapa` Mapbox CDMX con polígonos IE Score
