# DMX — UI Reference + User Flows + "Breath" Components

> Referencias UI inspiradoras + 3 flows usuario clave + componente canónico "breath".

## 1. UI Reference principal — propiedades.com style

> **Inspiración core para Marketplace público + portal Asesor**: heatmap precios m² + sidebar info colonia + IE Score visible + filtros progresivos.

### Layout marketplace público canónico

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Logo DMX | Comprar | Rentar | Vender | Reportes | Login   │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌──────────────────────────────────┐ │
│ │  SIDEBAR INFO COLONIA   │ │   MAPA PRINCIPAL                 │ │
│ │                         │ │   (Mapbox + heatmap)             │ │
│ │  Agricola Oriental      │ │                                  │ │
│ │  ━━━━━━━━━━━━━━━━━━━━   │ │   📍 Markers precio m² visible   │ │
│ │  Precio promedio venta  │ │   $19.4K $20.7K $21.1K           │ │
│ │  $2,146,665             │ │                                  │ │
│ │  m² $32,124             │ │   Heatmap colores intensidad     │ │
│ │                         │ │   demanda / precio               │ │
│ │  Características típicas│ │                                  │ │
│ │  🛏 2  🚿 1  🚗 1       │ │   Zoom progresivo:               │ │
│ │                         │ │   - Alcaldía → Colonia → Manzana │ │
│ │  Plusvalía últimos años │ │                                  │ │
│ │  📈 +5% 2026 (vs 7%     │ │                                  │ │
│ │  alcaldía promedio)     │ │                                  │ │
│ │                         │ │                                  │ │
│ │  IE Score colonia       │ │                                  │ │
│ │  ━━━━━━━━━━━━━━━━━━━━   │ │                                  │ │
│ │  74 / 100   🟢 Bueno    │ │                                  │ │
│ │                         │ │                                  │ │
│ │  Climate twin: Brooklyn │ │                                  │ │
│ │  Park Slope (87% match) │ │                                  │ │
│ │                         │ │                                  │ │
│ │  ⚠️ Riesgo inundación   │ │                                  │ │
│ │  bajo                   │ │                                  │ │
│ │  ⚠️ Riesgo sismo medio  │ │                                  │ │
│ │                         │ │                                  │ │
│ │  💎 Top 3 propiedades   │ │                                  │ │
│ │  • Depto 80m² $4.5M     │ │                                  │ │
│ │  • Casa 120m² $7.2M     │ │                                  │ │
│ │  • Penth 90m² $5.8M     │ │                                  │ │
│ │                         │ │                                  │ │
│ │  [Ver reporte completo] │ │                                  │ │
│ └─────────────────────────┘ └──────────────────────────────────┘ │
│                                                                    │
│ Filtros tabs: Venta | Renta | Tipo inmueble ▾ | Recámaras ▾ | +  │
└──────────────────────────────────────────────────────────────────┘
```

### Diferenciadores DMX vs propiedades.com

| Aspecto | propiedades.com | DMX |
|---|---|---|
| Heatmap | Solo precio | Precio + demanda + IE Score |
| Sidebar | Promedios básicos | IE Score + climate twin + riesgo + AI insights |
| Filtros | Tradicionales | Lenguaje natural + URL externa + foto |
| Asistente | Ninguno | Emmi-style 24/7 WhatsApp + web |
| Branding | Único portal | Asesor puede generar fichas branded |
| Datos | Listings | 18 fuentes cruzadas |

### Zoom progresivo

| Nivel | Vista | Datos visibles |
|---|---|---|
| **Z1 Alcaldía** | Polígonos alcaldías CDMX | Precio promedio + demanda heatmap + count proyectos |
| **Z2 Colonia** | Polígonos colonias (133 CDMX) | + IE Score + plusvalía hist + top 3 proyectos |
| **Z3 Manzana** | Polígonos AGEB INEGI (~3000 CDMX) | + demografía + escuelas + delitos |
| **Z4 Predio** | Marker individual proyecto/unidad | Ficha completa + tour 360 + scoring |

## 2. Componente canónico — Breath card

> Card con efecto "breath" obligatorio. Resto del estilo (paleta, tipografía, spacing) — emergent decide.

### Especificación funcional

- Gradient lineal sutil sube/baja intensidad en ciclos 3-5 segundos
- Efecto **respiratorio**: como pulmón inhalando/exhalando
- Aplica a cards principales: proyecto / propiedad / asesor / colonia / score
- NO a buttons ni a inputs (sería distractor)
- Acepta `prefers-reduced-motion` (respeta accessibility — sin animación si user lo desactiva)

### Pseudo-implementación (emergent decide stack/lib)

```
Card "breath":
  - background: linear-gradient(angle, color-A, color-B)
  - animation:
      keyframes:
        0%: opacity 0.85, gradient angle 90deg
        50%: opacity 1.0, gradient angle 110deg
        100%: opacity 0.85, gradient angle 90deg
      duration: 4s
      easing: ease-in-out
      iteration: infinite
  - prefers-reduced-motion: animation: none
```

Resultado visual: card "respira" suavemente. Da sensación viva al producto, distingue DMX de marketplaces estáticos.

### Variantes (emergent decide colores)

| Variante | Uso |
|---|---|
| Breath-default | Cards proyecto / propiedad |
| Breath-AI | Cards con AI insights (gradient distinto, más violeta/intenso) |
| Breath-score | Cards con score badge (intensidad relacionada al score: amber/red más rápido, green más lento) |
| Breath-warning | Cards con bandera roja (más rápido + tinte rojo) |

## 3. Flujo COMPRADOR (3 entry channels)

### Entry channel #1 — Web público

```
1. Llegada                  → Marketplace público (Z1 alcaldía)
2. Caja "describe tu hogar  → Lenguaje natural / voz / foto / URL externa
   ideal"
3. Resultados               → Rankeados IA con razonamiento por qué
4. Filtros refinamiento     → "y con balcón" / chip filtros
5. Sidebar colonia info     → IE Score + climate twin + plusvalía + riesgo
6. Save search              → Lead magnet email + colonia
7. Quiz colonia (opcional)  → Top 3 colonias soulmate
8. Comparador 3 propiedades → Tabla side-by-side + AI ranking
9. Tour 360°                → Hot spots + WhatsApp asesor
10. Hand-off asesor         → Calendario visita + chat
```

### Entry channel #2 — WhatsApp bot (Caya-style C11)

```
1. Cliente envía WA         → "Busco depa Roma Norte $4M con balcón"
2. Bot DMX procesa          → Lenguaje natural + memoria session
3. Bot responde             → Top 5 matches con razonamiento + fotos
4. Refinamiento conversacional → "y con gym?"
5. Cálculo hipoteca inline  → "$28K/mes a 20 años con 20% enganche"
6. Agendamiento visita      → Calendar asesor sync
7. Score >70 lead caliente  → Hand-off humano automático
8. Asesor toma WA           → Continúa conversación con argumentario AI
```

### Entry channel #3 — Public widget partner (G1)

```
1. Cliente entra a sitio    → BBVA / Santander / FIBRA UNO
   bancario partner
2. Widget <DMXSearch />      → Embebible iframe con branding partner
   embebido
3. Cliente busca propiedad   → Backed por DMX inventory
4. Filtros pre-set partner   → Solo propiedades con financiamiento bank disponible
5. Cliente selecciona         → Se abre flow DMX (puede ser modal o redirect)
   propiedad
6. Pre-aprobación inline      → API bank check capacidad pago
7. Lead generated             → DMX captura + asigna asesor + notif partner
8. Revenue share              → CFDI auto-emit comisión partner mensual
```

## 4. Flujo ASESOR (CRM Pulppo+)

```
1. Login asesor              → Dashboard M01 (saludo + briefing del día WA recap)
                              → Widget tareas del día + leads asignados nuevos

2. Briefing 8am WhatsApp     → Resumen citas hoy + leads en frío + comisiones
   (auto)                     pendientes + clima alertas

3. Captación nueva           → Wizard: dirección + tipo + precio (mín. obligatorio)
                              → 6 etapas pipeline kanban
                              → ACM auto en Valuación
                              → Mifiel firma en Captado

4. Búsqueda comprador        → Wizard: contacto + preferencias (17 fuentes)
   nueva                       → Matcher 5 dim genera top 10
                              → Drag&drop kanban (validaciones HARD)

5. Argumentario AI           → Selecciona contacto + proyecto + objetivo
                              → RAG genera mensaje personalizado citations
                              → Botones Enviar WA / Email / Borrador

6. Marketplace DMX           → Filtros avanzados + capa IE Score + capa
                              ROI Airbnb + capa climate twin
                              → Comparador 3-way + saved searches

7. Cualquier-Link branded    → Pega URL Inmuebles24
   (A11)                       → DMX scrapea + genera ficha branded
                              → URL única trackeable + watermark cliente

8. Wizard ofertar 6 pasos    → Vincula búsqueda + propiedad
                              → "Pegar liga" parser EasyBroker auto
                              → Genera operación con código único

9. Operación seguimiento     → Status canon 6 estados
                              → CFDI 4.0 + Mifiel NOM-151 firma
                              → Multi-currency MXN/USD/AED
                              → Split 20% explícito visible
                              → Comisión auto-calculada con IVA + ISR

10. DMX Studio               → Genera video proyecto desde fotos/URL
                              → 100 ads Meta desde URL
                              → Distribuye reels Instagram + TikTok

11. Wrapped anual asesor     → Diciembre auto-genera "tu 2026"
                              → Top colonias + cierres + Elo score
```

## 5. Flujo DESARROLLADORA

```
1. Login desarrolladora      → Dashboard M10 con 3-col grid
   admin                       → Trust Score Hero + Weekly carousel
                              → Upcoming actions (tareas / landings / CFDIs)

2. Inventario tiempo real    → CRUD proyectos + bulk upload Excel/CSV
   (D1)                        → Estatus por unidad (Disponible / Apartado / etc.)
                              → Esquemas pago + brochures + planos

3. Demand Heatmap (D6)       → Mapa búsquedas vs supply
                              → Demanda no atendida + tendencias
                              → Predicción 30/60/90 días

4. Dynamic Pricing AI (D4)   → Sugerencia por unidad/tipo/torre
                              → Razonamiento "por qué subir/bajar"
                              → A/B test 2 precios mismo modelo
                              → Aprobación director comercial antes aplicar

5. Competitor Radar (D3)     → Mapa competidores radio configurable
                              → Comparativa side-by-side top 3
                              → Alertas: nuevo proyecto / baja precio
                              → Reporte trimestral comparativo IA

6. CRM Dev (M13+)            → Pipeline 5 col Lead → Cierre
                              → Asignación asesor aliado (project_brokers)
                              → Inbox unificado (email + WA + CRM events)
                              → Lead scoring C01

7. M14 Marketing             → Campaigns + multi-touch attribution
                              → Ad spend optimizer heuristics
                              → Studio video auto

8. Site Selection AI (D10)   → Recomienda zonas con demand gap
                              → Análisis terrenos disponibles
                              → Score feasibility 0-100
                              → Reporte deck-ready inversionistas

9. Reporte mensual narrado   → Resumen ejecutivo 1 párrafo
   IA (D9)                     → Top 3 wins + 3 alertas + forecast
                              → PDF branded developer (no DMX)
                              → Distribución auto email stakeholders

10. Document Intelligence     → Upload escrituras / permisos / LPs
   pipeline                    → AI extraction + validations + dedupe
                              → Cross-Check único LATAM
                              → Quality Score por proyecto
```

## 6. Componentes UI clave (resumen)

| Componente | Uso | Especificación |
|---|---|---|
| **Breath card** | Cards proyecto / propiedad / asesor / score | Gradient pulsante respiratorio 3-5s + reduced-motion respect |
| **Score badge** | Display score 0-100 con tier | Verde 80+ / Amber 60-79 / Rojo <60 — tier emergent decide |
| **AI insights panel** | Findings AI + recomendaciones | Visualmente distinguibles del contenido normal (gradient AI / icon) |
| **Heatmap colonia** | Marketplace público + dashboard developer | Mapbox layer + intensidad demanda/precio + zoom progresivo Z1-Z4 |
| **Sidebar info colonia** | Marketplace público | Stats compactos + IE Score + climate twin + riesgos + top 3 |
| **Pipeline kanban** | CRM Pulppo+ búsquedas / captaciones / operaciones | Drag&drop fluido + validaciones HARD + optimistic updates |
| **Wizard multi-step** | Crear captación / operación / publicar | 6 pasos típico + progress visible + validación por paso |
| **Comparador 3-way** | Asesor + Cliente | Tabla comparativa + highlights diff + AI ranking |
| **Tour 360°** | Cliente + Asesor | Hot spots clicables + WhatsApp asesor one-tap |
| **Argumentario AI drawer** | Asesor M03 detalle contacto | Genera mensaje personalizado + citations + Enviar WA/Email |
| **Briefing WA card** | Asesor 8am | Resumen del día + acciones top 3 + alertas meteo / tráfico |
| **Filtros lenguaje natural** | Marketplace público | Caja única + chip filtros refinamiento + sugerencias proactivas |
| **Voice notes input** | Comprador WA bot | Audio → Whisper/Deepgram → procesa intent |

## 7. Mobile + responsive

DMX es **mobile-first** porque:
- Asesores trabajan en campo (visitas / open houses)
- Compradores buscan desde celular (96% México vs desktop)
- WhatsApp es nativo móvil

| Breakpoint | Uso |
|---|---|
| Mobile <768px | UX primaria asesor + comprador |
| Tablet 768-1024px | UX secundaria asesor (laptop en café) |
| Desktop ≥1024px | UX primaria desarrolladora admin (analytics densos) |

PWA installable (iOS + Android home screen). **Inspecciones offline** (post-venta H2) requiere Service Worker.

## 8. Accessibility

| Regla | Detalle |
|---|---|
| Contrast ratio | ≥4.5:1 texto normal, ≥3:1 texto grande |
| Focus visible | Outline en cualquier elemento interactivo |
| Keyboard nav | Tab order lógico + shortcuts (cmd+k búsqueda global, j/k navigation listas) |
| Screen reader | aria-labels + aria-live regions para updates dinámicos |
| Reduced motion | `prefers-reduced-motion: reduce` desactiva breath animation + transitions |
| Multi-idioma | es-MX + en-US |
| Semantic HTML | h1/h2/h3 jerarquía + `<nav>` `<main>` `<aside>` |

## 9. Performance targets

| Métrica | Target |
|---|---|
| LCP (Largest Contentful Paint) | <2.5s |
| FID (First Input Delay) | <100ms |
| CLS (Cumulative Layout Shift) | <0.1 |
| Time to Interactive | <3.5s |
| Bundle JS inicial | <250KB gzipped |
| Image optimization | WebP / AVIF + responsive srcset |
| Cache strategy | CDN edge + ISR (incremental static regeneration) para listings |

## 10. Cierre

**Resumen del paquete emergent**:

| Doc | Tokens | Propósito |
|---|---|---|
| `01_PRODUCT.md` | ~6K | Identidad + portales + roles + reglas + diseño + roadmap |
| `02_FEATURES.md` | ~36K | 762 features tabulados |
| `03_INTELLIGENCE.md` | ~15K | IE 118-125 scores + 18 fuentes + game-changers + moats |
| `04_UI_DATA_REF.md` | ~4K | UI ref propiedades.com + 3 flows + componentes "breath" |
| **TOTAL** | **~61K** | **762 features, 4 docs, 0 inventos** |

**Stack libre — emergent.sh decide**. Único hard requirement: cards "breath" + AI insights distinguibles + multi-tenant data isolation + single-session enforcement (login nuevo gana) + anti-scraping + audit log mutaciones.

Construir DMX = construir el **CoStar de LATAM con AI-native desde día 1**. Moonshot $1-5B 3-5 años vía moats #1-7 (datos temporales + cruzados + Document Intel + embeddings + Argumentario + compliance MX + multi-tenant).

**Inicio recomendado para emergent.sh**:
1. Foundation: auth + multi-tenant + i18n + diseño "breath"
2. Marketplace público (UI ref propiedades.com) con datos seed colonia básicos
3. Portal asesor con CRM Pulppo+ M03-M07
4. Portal desarrollador con D1 inventario + D6 demand + D9 reporte mensual
5. IE Engine N0-N2 (raw + derived + composite scores básicos)
6. DMX Studio v1 (Director IA video básico)
7. Document Intelligence pipeline básico
8. Public widgets B2B (5 partners H1)
9. Caya-style C11 + Cualquier-Link A11 + scaling features

Crece feature por feature siguiendo `02_FEATURES.md` orden de impacto. Cada feature valida hipótesis con métricas reales.

Mucho éxito construyendo.
