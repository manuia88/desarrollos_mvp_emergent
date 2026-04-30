# DesarrollosMX (DMX) — PRD

## Identidad del producto
**DesarrollosMX** — AI-native Spatial Decision Intelligence Platform para real estate residencial nuevo en LATAM.  
Combina CoStar (analytics) + marketplace + Salesforce CRM + Plaid/Stripe APIs.  
Moonshot: $1–5B valuation en 3–5 años.

---

## Stack técnico
- **Backend**: FastAPI (Python) + Motor (async MongoDB)
- **Frontend**: React 18 + Tailwind CSS + CSS Variables (design tokens)
- **Auth**: Google OAuth (Emergent-managed) + JWT, single-session enforcement
- **LLM**: Claude Sonnet 4.5 (Emergent key) + OpenAI text-embedding-3-small
- **DB**: MongoDB (motor async)
- **i18n**: React estructurado para es-MX primero, en-US en H2

---

## Design System (05_DESIGN_SYSTEM.md — NON-NEGOTIABLE)
- Colors: Navy `#06080F` + Cream `#F0EBE0` + Gradient `#6366F1→#EC4899`
- Fonts: Outfit (headings) + DM Sans (body)
- Zero emoji — SVG icons only
- Buttons: always border-radius 9999px (pill)
- Animations: max 850ms, `once: true`, `prefers-reduced-motion` respected

---

## Arquitectura implementada

### Backend `/app/backend/server.py`
- `GET /api/health`
- `POST /api/auth/session` — exchange Emergent OAuth session_id
- `GET /api/auth/me` — current user
- `POST /api/auth/logout` — single-session invalidation
- `GET /api/colonias` — 3 colonias seed (Del Valle, Condesa, Roma Norte)
- `GET /api/colonias/{id}` — colonia detail
- `GET /api/properties` — 3 properties seed

### Frontend `/app/frontend/src/`
- `App.js` — BrowserRouter + AuthContext + AppRouter + AuthCallback
- `components/landing/CustomCursor.js` — 3-layer CSS cursor (desktop only)
- `components/landing/Navbar.js` — fixed 60px, glassmorphism, mobile sheet
- `components/landing/Hero.js` — 250vh sticky, BlurText H1, MapOverlay, score pills
- `components/landing/SearchBar.js` — tabs, grid row, filter chips
- `components/landing/LiveTicker.js` — 52px marquee, 12 colonias × 2
- `components/landing/ColoniasBento.js` — 3-col grid, LIV/MOV/SEC/ECO switcher, sparklines
- `components/landing/ColoniaComparator.js` — SVG radar battle 6 axes
- `components/landing/PropertyListings.js` — 3-col cards, photo carousel, scores
- `components/landing/IntelligenceEngine.js` — 2-col, animated score bars
- `components/landing/Stats.js` — 4-col count-up
- `components/landing/Testimonials.js` — double marquee
- `components/landing/Faq.js` — 2-col accordion, 7 preguntas
- `components/landing/CtaFooter.js` — CTA + footer bar
- `components/animations/BlurText.js` — word-by-word blur+fade animation
- `components/animations/FadeUp.js` — translateY+blur on viewport entry
- `components/icons/index.js` — SVG icon components
- `hooks/useInView.js` — IntersectionObserver hook, once:true

---

## Testing Status (2026-04-30)
- Backend: 100% (9/9 tests) — all APIs functional
- Frontend: 100% — all 13 sections render, auth redirect works

---

## Lo que está implementado (Fases 1–2 ✓)
- [x] Foundation: auth multi-tenant + design system
- [x] Public landing: 13 secciones exactas según 05_DESIGN_SYSTEM.md
  - Navbar, Hero, SearchBar, LiveTicker, ColoniasBento, ColoniaComparator
  - PropertyListings, IntelligenceEngine, Stats, Testimonials, FAQ, CtaFooter
- [x] Google OAuth + JWT + single-session enforcement
- [x] RBAC skeleton (6 roles en modelo User)
- [x] IE Score visual (barras animadas, score pills, MapOverlay)

---

## Backlog Priorizado

### P0 — Fase 3 (próximo sprint)
- [ ] Public marketplace: listados con filtros reales (colonia, precio, tipo, scores)
- [ ] Fichas de propiedad individuales con reporte de colonia
- [ ] Mapa interactivo (Mapbox GL JS) con polígonos de colonia

### P1 — Fase 4–5 (Advisor + Developer portals)
- [ ] Portal Asesor: CRM Pulppo+ (M03–M07), argumentario AI, kanban pipeline
- [ ] Portal Desarrollador: inventario D1, demanda D6, reporte mensual AI D9
- [ ] Multi-tenant aislamiento completo (advisor/developer ven solo sus datos)

### P2 — Fase 6–8
- [ ] IE Engine N0–N2: scores reales desde APIs (DENUE, FGJ, GTFS, SEDUVI)
- [ ] DMX Studio v1: AI Director video generación
- [ ] Document Intelligence: OCR + AI extraction
- [ ] Widgets B2B (5+ partners H1)
- [ ] Dubai/UAE expansion (en-US, i18n completo)
- [ ] OpenAI text-embedding-3-small para búsqueda semántica

---

## Usuarios objetivo
1. **Comprador** (C) — Primera vivienda o inversión en CDMX/Dubai
2. **Asesor** (A) — Broker o agente inmobiliario certificado AMPI
3. **Desarrollador** (D) — Constructora o empresa de desarrollo inmobiliario
4. **Superadmin** (S) — Operaciones DMX

---

## Variables de entorno
- `MONGO_URL` — conexión MongoDB
- `DB_NAME` — nombre de la base de datos
- `EMERGENT_LLM_KEY` — clave universal Emergent para Claude/OpenAI

---

## URL de producción preview
https://31364a48-e9ea-4119-b8c5-755ae7a76d0c.preview.emergentagent.com
