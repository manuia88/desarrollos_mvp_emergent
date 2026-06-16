# Catálogo maestro Fable5 → qué Encender y Dar Visibilidad en Emergent

> El inventario COMPLETO de specs de Fable5 (la biblia) cruzado con lo que emergent ya tiene.
> Sirve para no dejar ningún índice/score/feature apagado o sin pantalla. Compañero de
> `PLAN_ENCENDER_Y_CONECTAR.md` (las tandas de ejecución). Fuente: 4 agentes sobre `docs/biblia/`
> de Fable5 + auditoría de emergent. Fecha: 2026-06-15.

## Leyenda de estado en emergent
- ✅ **Visible** (círculo cerrado, ya se ve y funciona)
- 🟡 **Existe pero escondido/sin pantalla** → **PRENDER/DAR VISIBILIDAD** (el balde principal)
- 🔌 **Existe pero sin conectar / apagado por flag** → **CONECTAR/PRENDER FLAG**
- ❌ **No existe** → **CREAR** (lo único realmente nuevo)

## Los números (lo que el spec dice que debe existir y verse)
| Bloque | Cantidad | Estado grueso en emergent |
|---|---|---|
| Scores / índices | **118** | ~42 reales · ~21 esperando-fuente · resto motor-sin-UI o por construir |
| Engines de cálculo | **137** (ORO/PLATA/BRONCE) | emergent tiene ~315 archivos engine; casi todos los ORO existen |
| Features de catálogo (con plan/precio) | **61** | la mayoría existe; faltan gating/visibilidad consistentes |
| Features por portal (pantallas+endpoints+widgets) | **~860** | 5 portales construidos; mucho escondido |
| Endpoints | **1,438** | emergent ~190 routers; gran parte sin consumidor UI |
| Familias de IA / asistentes | **9** (175 prompts) + 5 agentes + auto-pilot | existen; mayoría detrás de flag |

---

## 1) Los 118 scores/índices — qué prender y dónde debe verse

### Zone Score (composite A–F + 6 dim) · Risk Score (composite + 5 comp)
Emergent: `zone_score_engine` y `risk_score_engine` existen y son reales. **Acción:** 🟡 card de zona (4-6 ejes) en ficha pública + Site Selection; de-stub **liquidez** (hoy fija 50.0 → DRPI ya existe) y **perception** (ENVIPE, E6). Estado: 🟡 mayormente.

### Recetas IE de Colonia (35) — visibles en ficha de colonia
14 reales en emergent (transporte, sismo, inundación, parques, museos, uso-suelo, demografía ingreso/familia, aire, isla-calor, plusvalía hist, vialidad). 21 esperando-fuente (salud DGIS, educación-calidad SIGED, seguridad-per-cápita FGJ, ROI Airbnb, liquidez/precio DRPI, agua SACMEX, vida nocturna, ghost-zone). **Acción:** 🟡 ficha de colonia con los 14 reales + honestos "esperando" en el resto.

### Recetas IE de Proyecto (23) — visibles en hub del proyecto (tab Inteligencia)
**TODAS tienen motor real en emergent; les falta pantalla.** absorción·velocidad, amenidades, badge-top, competition-pressure, compliance, days-to-sellout, developer-concentration/delivery/trust, inventory-depth, listing-health, marca-trust, precio-rank/vs-mercado, presales-ratio, quality-docs, recency-launch, risk-legal, roi-buyer, score-vs-colonia/ciudad/nacional, tipo-fit. **Acción:** 🟡 **PRENDER el tab "Inteligencia" del proyecto con los 23** (cada uno: valor + por qué + "mejorar este score"). *Alto valor, bajo esfuerzo.*

### Recetas IE de Unidad (5) — visibles en drawer de unidad
precio-vs-prototipo, nivel-premium, parking-fit, orientación-premium, m²-value. Motor real. **Acción:** 🟡 mostrarlos en el drawer de unidad.

### Scores de Lead / Asesor / Developer (14 engines) — visibles en CRM
Reales en emergent: **buyer_score (7D), close_probability (+tuning), DISC, lead_heat, health_score (proy/asesor/cliente), score_inversion, fit_engine, hook_predictor, asesor_trust (ELO 6 comp), productivity, soc_franchise**. Mayormente ✅/🟡 en el CRM asesor (algunos detrás de `agentic_enabled`). **Acción:** 🔌 prender flag + 🟡 surfacear los que falten en Ficha360.

---

## 2) Los 7 índices DMX con marca (el sello "DMX Score") — 🟡 PRENDER CON MARCA
Emergent calcula 5 + un índice maestro (IDM); deben presentarse como **card estilo FICO / Walk Score** en ficha pública + marketplace + reporte + API B2B.

| Índice | Qué mide | Emergent | Acción |
|---|---|---|---|
| **IPV** plusvalía | % plusvalía 12/24/36m | 🟡 real (superadmin) | card "IPV 7.4%" en ficha pública/Dev |
| **IAB** absorción | meses a sellout | 🟡 real | KPI del dev + Site Selection |
| **IDS** demanda/oferta | presión de mercado | 🟡 real | heatmap + pricing |
| **IRE** rentabilidad | TIR vs CETES | 🟡 real | simulador + comparador |
| **ICO** competitividad | percentil vs competidores | 🟡 real (battle card) | ranking + ficha |
| **MOM** momentum | σ vs CDMX (live_pulse) | 🟡 existe motor, no como índice | envolver como índice MOM |
| **LIV** livability | calidad de vida **por perfil** | ❌ no existe branded | **CREAR** (zone_score personalizado) |

**Acción global:** darles **marca + card pública** (5 listos) · envolver **MOM** · construir **LIV**.

## 3) N01–N11 (el moat vs CoStar/Local Logic) — ❌ CREAR (E6)
N01 Ecosystem Diversity · N02 Employment Accessibility · N03 Gentrification Velocity (18-24m antes) · N04 Crime Trajectory · N05 Infrastructure Resilience · N06 School Premium (SIGED) · N07 Water Security (SACMEX) · N08 Walkability MX · N09 Nightlife Economy · N10 Senior Livability (DGIS) · N11 reservado. **Ninguno existe** → es la construcción nueva real (necesita 3 fuentes nuevas: SIGED, SACMEX, DGIS).

---

## 4) Engines ORO + SUBEXPLOTADOS (los candidatos #1 a prender)
**La joya ya existe en emergent:** AVM hedónico (OLS) + loop accuracy→drift→retrain, DRPI, forecast ARIMA, FSD, entity_resolution (8 capas), knowledge_graph (Neo4j ausente→fallback), agent_workforce (5 agentes), argumentario RAG, studio, marketplace 4 modos, atlax+director.

**SUBEXPLOTADOS (existen, no rinden — prender ya):**
1. 🔌 **GTFS** ingestado pero solo lo usa "transporte" → extenderlo a walkability y otros scores.
2. 🟡 **Homepage por perfil** (data existe, no se reordena por joven/familia/senior).
3. 🟡 **MCP server + widgets B2B** (headless, sin link/pantalla comercial).
4. 🔌 **Dynamic Pricing real** (el Pricing Lab A/B está inerte; conectar "Aplicar" que mute precio → mata el RNG viejo).
5. 🔌 **WhatsApp real + Studio Video** (motor en stub, falta llave/provider).
6. 🟡 **Los 7 índices DMX sin marca** (ver arriba).

**Flagships del spec ("la joya"):** AVM+auto-calibración · Auto-Factibilidad (Dev) · Estudio de mercado vivo (auto-4S diario) · Knowledge Graph+Entity Resolution · DRPI temporal · Pipeline maestro de CDMX (superadmin) · Catastro completo.

---

## 5) Las 61 features del catálogo (con plan y precio) — verificar gating + visibilidad
42 dinámicas + 10 legacy + 9 Studio. Por categoría: **intelligence** (zone_score $199, drpi $199, forecast $199, battle_card $299, knowledge_graph $499, transactions_network $499, live_pulse $199, probability_ux $99, avm_public free, external_insights free, mapa free) · **ai** (atlax free, buyer_score $149) · **marketing** (studio_ads/video $249, brochure $99, tour_3dgs $149) · **growth** (whatsapp $299, bulletins/partners/newsletter, lead_journey $149) · **monetization** (data_licensing $999, data_lake $599, metrics_cube $499, vertical_products, ai_cost, cross_sell) · **operations** (audit_chain, entity_resolution $399, bulk_drive $399, duplicates, feature analytics). **Acción:** 🔌 confirmar que cada feature existente respeta su plan/tier y tiene su pantalla (muchas existen pero gating inconsistente — el sistema W5.FF de emergent ya gobierna esto).

## 6) Conectores (11) + Asistentes IA (9 familias)
**Conectores:** Claude (Haiku/Sonnet), Mapbox (geo/static), INEGI, Google Drive/Calendar, **Microsoft Calendar (stub)**, Resend, Sentry, PostHog. + Apify, SESNSP, ElevenLabs, Whisper, gpt-image-1 (referenciados). **Acción:** 🔌 conectar llaves que falten (Mapbox, Apify, ElevenLabs, WhatsApp) para de-stub.

**Asistentes IA (existen, mayoría tras flag):** Atlax (público, 30 tools allow-list) · Buyer Coach · Director + 3 sub-agentes · Copilot Cmd+J + agentic_crm (argumentario/DISC/reply/routing/visit-prep/nurture) · Studio (copy/landings/ads, 10 templates Z8) · Narrativa/Insights/Briefings · Valuación/Scoring · Document Intelligence · 5 agentes workforce + auto-pilot. **Acción:** 🔌 prender `agentic_enabled` + `CEREBRO_ENABLED` (tras la mini-gobernanza).

---

## 7) Killer/moat por portal (lo que el spec corona — cruzar con lo escondido)
- **Developer (~210):** Battle Card · Site Selection (mata Softec) · Pricing IA real · Document Intelligence · Cash-Flow investor-grade · **tab Inteligencia con 23 scores**.
- **Asesor/CRM (~130):** Command Center (5 agentes) · Gemelo Digital (Ficha360) · Auto-Pilot · Studio 100-ads · Trust Score · "el kanban ES el chat".
- **Comprador (~127):** **Zero-Fear Buying** (price-fairness + claridad financiera + hipotecas + legal) ❌ · Compañero de Vida ❌ · Swipe taste-model ✅ · Discover Weekly.
- **Marketplace (~159):** Mapa 5 capas · búsqueda visual/semántica · asistente público · **API v1 + MCP + widgets B2B** (el "Stripe del real estate").
- **Superadmin (~234):** Metrics Cube OLAP · AI-Cost governance + kill-switch · Data Licensing/Verticales B2B · Knowledge Graph · **~55 pantallas "sin ancla" (riesgo de perderse)**.

---

## Resumen de acción (qué cae en cada balde)
- 🟡 **PRENDER/DAR VISIBILIDAD (el grueso):** 23 scores de proyecto + 5 de unidad + 14 colonia reales + 7 índices DMX con marca + scores de lead en Ficha360 + ~20 pantallas escondidas + herramientas públicas. *Motor real, falta pantalla.*
- 🔌 **CONECTAR/PRENDER FLAG:** Cerebro + agentic_enabled + Director + DEV_V2 · GTFS→más scores · Pricing Lab "Aplicar" · llaves (Mapbox/Apify/ElevenLabs/WhatsApp).
- ❌ **CREAR (lo nuevo real):** N01–N11 · LIV branded · Zero-Fear Buying · Compañero de Vida · auto-factibilidad Dev · estudio de mercado vivo.

**Regla de oro (Ley #4 de Fable5):** ningún score calculado se queda sin pantalla + acción. Esta lista ES el inventario de "calculado-pero-oculto" que hay que cerrar.
