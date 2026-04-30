# DesarrollosMX (DMX) — PRD

## Identidad del producto
**DesarrollosMX** — AI-native Spatial Decision Intelligence Platform para real estate residencial nuevo en LATAM.
Combina CoStar (analytics) + marketplace + Salesforce CRM + Plaid/Stripe APIs.
Moonshot: $1–5B valuation en 3–5 años.

---

## Stack técnico
- **Backend**: FastAPI (Python) + Motor (async MongoDB)
- **Frontend**: React 18 + Tailwind + CSS Variables (design tokens) + **react-i18next** (es-MX first)
- **Auth**: Google OAuth (Emergent-managed) + JWT, single-session enforcement
- **LLM**: Claude Sonnet 4.5 + OpenAI text-embedding-3-small (Emergent LLM Key)
- **DB**: MongoDB (motor async)
- **Map**: Mapbox GL JS (Fase 3)

---

## Design System (NON-NEGOTIABLE)
- Colors: Navy `#06080F` + Cream `#F0EBE0` + Gradient `#6366F1→#EC4899`
- Fonts: Outfit (headings) + DM Sans (body)
- Zero emoji — SVG icons only (lucide-style)
- Buttons: always border-radius 9999px (pill)
- Animations: ≤850ms, `once: true`, `prefers-reduced-motion` respected
- Transforms: translateY only (never X/scale/rotate)

---

## Score system (labels creativos 2026-04-30)
Reemplazan los acrónimos LIV/MOV/SEC/ECO:
- **Vida** (Leaf icon) — habitabilidad, parques, ruido, amenidades
- **Movilidad** (Route icon) — Metro, Metrobús, Ecobici, tiempos
- **Seguridad** (Shield icon) — FGJ, C5, alumbrado
- **Comercio** (Store icon) — DENUE densidad, restaurantes, servicios

Ejes extendidos del radar comparator: Movilidad, Seguridad, Comercio, Plusvalía, Educación, Riesgo.

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
- `i18n/index.js` + `locales/{es,en}.json` — full es-MX copy (refactored 2026-04-30)
- `data/colonias.js` — 16 CDMX colonias compartidas (Polanco, Lomas, Roma N/S, Condesa, Juárez, Cuauhtémoc, Del Valle, Narvarte, Nápoles, Escandón, Anzures, Doctores, Coyoacán Centro, Pedregal, Santa Fe)
- `components/icons/index.js` — SVG set ampliado: Leaf, Route, Shield, Store, Share, Bookmark, Sparkle, BarChart, Radio
- `components/animations/{BlurText,FadeUp}.js`
- `components/landing/*.js` — 12 secciones, todas con `useTranslation`
- `hooks/useInView.js`

### Landing sections (all i18n-wired)
1. Navbar — glass + mobile sheet
2. Hero — 250vh sticky, H1 "Antes de elegir una dirección, lee el mapa.", overlay Roma Norte con scores + iconos
3. SearchBar — tabs, filter chips, select es/en
4. LiveTicker — 14 barrios con precio m² + absorción
5. ColoniasBento — 6 barrios diversos (Polanco, Roma Norte, Condesa, Del Valle, Juárez, Narvarte)
6. ColoniaComparator — radar 6 ejes, picker de 8 barrios
7. PropertyListings — 6 propiedades (Polanco, Roma Norte, Condesa, Juárez, Del Valle, Narvarte)
8. IntelligenceEngine — panel Roma Norte, 6 bars animados
9. Stats — 117 variables / 50+ fuentes / 16 barrios / 3.2s
10. Testimonials — 8 quotes diversos (marquee doble)
11. Faq — 7 Q&A i18n driven
12. CtaFooter

---

## Testing Status
- **2026-04-30 (Refactor Landing)**:
  - Hero y ColoniasBento verificados visualmente vía screenshot tool
  - Lint JS 100% limpio
  - Frontend compila sin errores (solo deprecation warnings de webpack-dev-server)
- **2026-04-26 (pre-refactor)**: Backend 9/9 tests · Frontend 13 secciones render OK

---

## Refactor del 2026-04-30 — resumen
1. **react-i18next cableado** en `index.js`, todos los componentes usan `useTranslation`.
2. **Copy fresca es-MX** — cero frases reutilizadas del prototipo anterior; "Conoce tu colonia antes de decidir" reemplazado por "Antes de elegir una dirección, lee el mapa."
3. **Diversidad urbana** — 16 colonias CDMX unificadas en `data/colonias.js` (Miguel Hidalgo, Cuauhtémoc, Benito Juárez, Coyoacán, Álvaro Obregón, Cuajimalpa).
4. **Score labels nuevos** — LIV/MOV/SEC/ECO → Vida/Movilidad/Seguridad/Comercio con iconos Leaf/Route/Shield/Store.
5. **Zero emoji**, solo SVG. Zero transforms X/scale/rotate en la parte refactorizada.

---

## Backlog Priorizado

### P0 — Fase 3 (siguiente sprint — ya planeada con usuario)
- [ ] Backend: `/api/properties` con filtros reales (colonia multi, precio range, m², rec, baños, parking, amenities, tipo)
- [ ] Backend: `/api/properties/:id` (detalle) y `/api/colonias/:id/propiedades` (relacionadas)
- [ ] Backend: seed de 20–30 propiedades diversas en 12–18 colonias CDMX
- [ ] Frontend `/marketplace`: filtros sidebar + grid de property cards
- [ ] Frontend `/propiedad/:id`: ficha con calc hipoteca, WhatsApp CTA, favorito localStorage, share menu, scores de colonia, 3 similares, mini Mapbox map
- [ ] Frontend `/mapa`: Mapbox GL JS con polígonos de colonia coloreados por IE Score + heatmap toggle precio/m²
- Token Mapbox: `pk.eyJ1IjoibWFudXJlYWxlc3RhdGUiLCJhIjoiY21tcDhtZG10MG0xaTJzcTI2c2o1cHc4aSJ9.NoXR8crDQ9IW1ra8J862NA` (pendiente agregar a backend/.env)

### P1 — Fase 4–5
- [ ] Portal Asesor (CRM Pulppo+): M03–M07, argumentario AI, kanban
- [ ] Portal Desarrollador: inventario D1, demanda D6, reporte mensual AI D9
- [ ] Multi-tenant aislamiento DB completo

### P2 — Fase 6–8
- [ ] IE Engine N0–N2: scores reales de DENUE, FGJ, GTFS, SEDUVI
- [ ] DMX Studio v1: AI Director video
- [ ] Búsqueda por lenguaje natural (Claude parser)
- [ ] OpenAI embeddings para búsqueda semántica
- [ ] Dubai/UAE expansion (en-US completo ya cableado)

---

## Usuarios objetivo
1. Comprador (C) — CDMX/Dubai
2. Asesor (A) — AMPI certificado
3. Desarrolladora (D) — constructora
4. Superadmin (S) — operaciones DMX

---

## Variables de entorno
- `MONGO_URL`, `DB_NAME`
- `EMERGENT_LLM_KEY`
- `MAPBOX_TOKEN` — pendiente agregar en Fase 3

---

## URL preview
https://31364a48-e9ea-4119-b8c5-755ae7a76d0c.preview.emergentagent.com
