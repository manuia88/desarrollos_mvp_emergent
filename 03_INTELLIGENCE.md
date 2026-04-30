# DMX — Intelligence Engine + Data Sources + Game Changers

> 118-125 scores AI calculados sobre 18 fuentes datos. Datos temporales acumulados = moat irrepetible.

## 1. IE Engine — qué es

DMX calcula scores AI 0-100 por **colonia / proyecto / lead / asesor** cruzando datos públicos + datos propios + algoritmos AI. Cada score tiene:

- **Código** (ej. C01 lead score, IE_PRECIO, IE_CLIMA)
- **Dimensión** (precio / clima / seguridad / etc.)
- **Fuente input** (qué datos consume)
- **Output** (rango 0-100 + tier verde/amber/rojo)
- **Nivel N0-N5**:
  - **N0 Raw**: datos crudos sin transformar (ej. observación temperatura NOAA)
  - **N1 Derived**: agregados básicos (ej. promedio temperatura mensual)
  - **N2 Composite**: scores compuestos (ej. IE Score colonia)
  - **N3 Cohort**: comparativas entre colonias similares
  - **N4 Predictive**: predicciones futuras (plusvalía 5 años)
  - **N5 AI-narrative**: narrativas naturales generadas por LLM

## 2. Por qué es moat (irrepetible)

| Razón | Detalle |
|---|---|
| **Datos temporales acumulados** | Cada mes que pasa, DMX tiene más histórico. En 12 meses tiene 12x más data que un nuevo entrante. En 5 años, 60x más. |
| **Datos cruzados únicos** | NOAA + INEGI + AirROI + DENUE + datos.cdmx en una sola plataforma — nadie más en LATAM lo hace. |
| **AI extracts únicos** | Document Intelligence (escrituras / permisos / LPs) + Compliance Cross-Check único LATAM. |
| **Embeddings multimodales** | Búsqueda foto / texto / URL → embeddings vectoriales. Cada query mejora el modelo. |
| **Argumentario contextual** | RAG sobre histórico cliente + zone scores → mensaje personalizado. Modelo entrena con resultados (qué argumentos cierran). |

## 3. Catálogo de scores (118-125)

### Scores de COLONIA (40)

| Código | Dimensión | Fuente input | Nivel |
|---|---|---|---|
| IE_COL_PRECIO | Precio promedio m² vs ciudad | datos.cdmx + DMX listings | N2 |
| IE_COL_PLUSVALIA_HIST | Plusvalía 12m / 24m / 60m | datos.cdmx + INEGI | N1 |
| IE_COL_PLUSVALIA_PROYECTADA | Plusvalía 5 años predictive | regression sobre plusvalía hist + INEGI demografía | N4 |
| IE_COL_LIQUIDEZ | Días promedio venta | DMX operations history | N1 |
| IE_COL_DEMANDA_NETA | Búsquedas vs supply | DMX search logs | N2 |
| IE_COL_CLIMA_INUNDACION | Riesgo inundación | Atlas Riesgos CDMX + CONAGUA | N2 |
| IE_COL_CLIMA_SISMO | Riesgo sísmico | Atlas Riesgos CDMX + INEGI tipo suelo | N2 |
| IE_COL_CLIMA_ISLA_CALOR | Calor urbano | NOAA + CONAGUA temp anómala | N2 |
| IE_COL_AIRE | Calidad aire histórica | datos.cdmx (SEDEMA estaciones) | N1 |
| IE_COL_TWIN_MATCH | Climate twin (similitud climática) | NOAA + CONAGUA cosine similarity | N3 |
| IE_COL_SEGURIDAD | Delitos por 100k habitantes | FGJ CDMX carpetas investigación | N1 |
| IE_COL_SEGURIDAD_TENDENCIA | Tendencia 12m delitos | FGJ histórico | N4 |
| IE_COL_LOCATEL | Reportes ciudadanos urgencias | Locatel 0311 (STUB) | N1 |
| IE_COL_CONECTIVIDAD_TRANSPORTE | Distancia metro / metrobús / EcoBici | GTFS CDMX (STUB) | N2 |
| IE_COL_CONECTIVIDAD_FIBRA | Fibra óptica disponible | datos.cdmx telecom + IFT | N1 |
| IE_COL_CONECTIVIDAD_VIALIDAD | Acceso vialidades primarias | OSM + INEGI | N1 |
| IE_COL_EDUCACION | Escuelas radio 1-3km | INEGI DENUE educación | N1 |
| IE_COL_EDUCACION_CALIDAD | Calidad escolar (proxy SEP/PISA) | datos.gob.mx SEP | N2 |
| IE_COL_SALUD | Hospitales / clínicas radio 5km | DGIS (STUB) + DENUE salud | N1 |
| IE_COL_AGUA_CONFIABILIDAD | Cortes agua frecuencia | SACMEX (STUB) | N1 |
| IE_COL_CULTURAL_PARQUES | Parques + áreas verdes m²/habitante | OSM + INEGI | N1 |
| IE_COL_CULTURAL_VIDA_NOCTURNA | Bares / restaurantes / vida nocturna | DENUE | N1 |
| IE_COL_CULTURAL_MUSEOS | Museos / centros culturales | DENUE + datos.cdmx | N1 |
| IE_COL_DEMOGRAFIA_FAMILIA | % familias con hijos | INEGI Censo + AGEB | N1 |
| IE_COL_DEMOGRAFIA_JOVEN | % población 25-40 | INEGI Censo | N1 |
| IE_COL_DEMOGRAFIA_INGRESO | Ingreso promedio hogar | INEGI ENIGH | N1 |
| IE_COL_DEMOGRAFIA_EDUCACION | % con licenciatura+ | INEGI Censo | N1 |
| IE_COL_DEMOGRAFIA_ESTABILIDAD | Antigüedad promedio residentes | INEGI Censo | N2 |
| IE_COL_ROI_RENTA_TRADICIONAL | ROI renta anual % | DMX listings + AirROI | N2 |
| IE_COL_ROI_AIRBNB | ROI Airbnb anual % | AirROI markets | N2 |
| IE_COL_ROI_AIRBNB_OCUPACION | Ocupación Airbnb % | AirROI | N1 |
| IE_COL_DESARROLLOS_ACTIVOS | Cantidad proyectos en preventa | DMX inventory | N1 |
| IE_COL_USO_SUELO_HABITACIONAL | % uso habitacional | datos.cdmx SEDUVI | N1 |
| IE_COL_USO_SUELO_MIXTO | % uso mixto (hab + comercio) | datos.cdmx SEDUVI | N1 |
| IE_COL_GENTRIFICACION_INDEX | Tendencia precio vs ingresos | INEGI + DMX | N4 |
| IE_COL_GHOST_ZONE | Zona en pausa (vacancia alta) | DMX listings + INEGI | N2 |
| IE_COL_PMF_GAP | Gap demanda no atendida | DMX search vs inventory | N2 |
| IE_COL_INFRA_PLANEADA | Obras gobierno 5 años | datos.cdmx infraestructura + Atlas | N4 |
| IE_COL_TRUST_VECINDARIO | Trust score basado en reviews + reportes | DMX feedback + Locatel | N2 |
| IE_COL_NARRATIVE | Narrativa AI 1 párrafo | LLM Sonnet + todos scores anteriores | N5 |

### Scores de PROYECTO (30)

| Código | Dimensión | Fuente input | Nivel |
|---|---|---|---|
| IE_PROY_SCORE_VS_COLONIA | Score 0-100 vs colonia | DMX comparativa | N2 |
| IE_PROY_SCORE_VS_CIUDAD | Score 0-100 vs ciudad | DMX | N2 |
| IE_PROY_SCORE_VS_NACIONAL | Score 0-100 vs benchmark | DMX | N3 |
| IE_PROY_PRECIO_VS_MERCADO | % por encima / debajo zona | DMX listings comparable | N1 |
| IE_PROY_AMENIDADES | Amenities count weighted | DMX inventory | N1 |
| IE_PROY_MARCA_TRUST | Trust desarrolladora | DMX historial dev | N2 |
| IE_PROY_ABSORCION_VELOCIDAD | Días promedio venta unidad | DMX operations | N1 |
| IE_PROY_ABSORCION_PROYECCION | Cuándo cerrará inventario | regression DMX | N4 |
| IE_PROY_PRESALES_RATIO | % preventa | DMX inventory | N1 |
| IE_PROY_DEVELOPER_TRUST | Trust score histórico developer | DMX projects.dev | N2 |
| IE_PROY_DEVELOPER_DELIVERY_HIST | % proyectos entregados a tiempo | DMX | N1 |
| IE_PROY_FEASIBILITY | Score factibilidad construcción | datos.cdmx uso suelo + costos | N2 |
| IE_PROY_DESIGN_QUALITY | Calidad arquitectónica AI evaluation | AI vision sobre fotos/planos | N3 |
| IE_PROY_LISTING_HEALTH | Score listing optimization | DMX listings | N1 |
| IE_PROY_DEMAND_FIT | Match demanda zona | DMX search logs | N2 |
| IE_PROY_VIEW_TO_LEAD | Funnel ficha → contacto % | DMX engagement | N1 |
| IE_PROY_LEAD_TO_VISIT | % leads que agendan | DMX | N1 |
| IE_PROY_VISIT_TO_OFFER | % visitas que ofertan | DMX | N1 |
| IE_PROY_OFFER_TO_CLOSE | % ofertas que cierran | DMX | N1 |
| IE_PROY_PRICE_ELASTICITY | Elasticidad precio-demanda | regression DMX | N4 |
| IE_PROY_DAYS_TO_SELLOUT | Días estimados sellout | predictive DMX | N4 |
| IE_PROY_COMPETITION_PRESSURE | Presión competidores 5km | D3 Competitor Radar | N2 |
| IE_PROY_ROI_BUYER | ROI estimado comprador 5 años | IE_COL_PLUSVALIA + IE_COL_ROI | N4 |
| IE_PROY_DEVELOPER_ROI | ROI estimado desarrollador | costos + ventas DMX | N4 |
| IE_PROY_RISK_DELAY | Riesgo retraso entrega | dev historial + obras avance | N4 |
| IE_PROY_RISK_LEGAL | Riesgo legal (permisos / escrituración) | Document Intel + datos.cdmx | N2 |
| IE_PROY_QUALITY_DOCS | Calidad documental | Document Intel score | N2 |
| IE_PROY_COMPLIANCE_SCORE | Cross-check docs (escritura / permiso / LP coherentes) | Document Intel cross-check | N2 |
| IE_PROY_NARRATIVE | Narrativa AI proyecto | LLM | N5 |
| IE_PROY_BADGE_TOP | Badge "Top IE Score colonia" si aplica | derived | N2 |

### Scores de LEAD (10)

| Código | Dimensión | Fuente input | Nivel |
|---|---|---|---|
| C01_LEAD_SCORE | Score 0-100 probabilidad cierre | engagement + demografía + intent | N4 |
| C01_HEAT | Tier frío/tibio/caliente | DMX activity | N2 |
| C01_TIME_IN_STAGE | Tiempo en etapa pipeline | DMX | N1 |
| C01_INTENT | Intent fuerte (calculadora hipoteca + tour 360 + comparador 3) | DMX behavior | N2 |
| C01_LOOKALIKE | Match con clientes que cerraron | similarity vector | N3 |
| C01_NEXT_STEP | Sugerencia AI siguiente paso | LLM + C01_HEAT | N5 |
| C01_FROZEN_RISK | Riesgo enfriamiento | regression activity | N4 |
| C01_BUDGET_FIT | Match presupuesto vs property | match score | N1 |
| C01_FAMILY_FIT | Match family unit (hijos/mascotas) | DMX family_units | N2 |
| C01_NARRATIVE | Narrativa lead AI | LLM | N5 |

### Scores de ASESOR (10)

| Código | Dimensión | Fuente input | Nivel |
|---|---|---|---|
| ASESOR_SCORE | Score Elo 0-1000 | operaciones + reviews | N2 |
| ASESOR_NPS | NPS clientes | reviews | N1 |
| ASESOR_VELOCITY | Velocidad cierre | DMX operations | N1 |
| ASESOR_QUALITY | Calidad servicio (reviews 5★) | DMX | N1 |
| ASESOR_COLONIA_EXPERTISE | Especialización colonia | operations historic | N2 |
| ASESOR_BREADTH | Diversidad colonias trabajadas | DMX | N1 |
| ASESOR_VOLUME | Volumen mensual / trimestral | DMX | N1 |
| ASESOR_CONSISTENCY | Streak cierres consecutivos | DMX | N1 |
| ASESOR_TRUST_VERIFIED | Cédula AMPI verificada | external check | N1 |
| ASESOR_NARRATIVE | Narrativa asesor AI (Wrapped style) | LLM | N5 |

### Scores especializados (28-35)

| Código | Dimensión | Fuente input | Nivel |
|---|---|---|---|
| C02_ARGUMENTARIO | Argumentario AI mensaje personalizado | RAG cliente + zone + projects | N5 |
| C03_SEMANTIC_MATCH | Match semántico búsqueda vs inventory | embeddings | N3 |
| ACM_VALUACION | Análisis Comparativo Mercado | comparables top 5 | N3 |
| ACM_CONFIDENCE | Confianza ACM (alta/media/baja) | data quality | N2 |
| AIRBNB_PROFITABILITY | Rentabilidad Airbnb específica | AirROI listing | N2 |
| AIRBNB_RISK_REGULATION | Riesgo regulatorio Airbnb zona | datos.cdmx STR | N2 |
| HEAT_DEMANDA_30D | Heat demanda 30 días | predictive | N4 |
| HEAT_DEMANDA_60D | Heat demanda 60 días | predictive | N4 |
| HEAT_DEMANDA_90D | Heat demanda 90 días | predictive | N4 |
| FAMILY_FIT_PROYECTO | Match familia → proyecto | DMX family + project | N3 |
| DISC_PROFILE | Perfil DISC + Big Five comprador | quiz | N1 |
| LIFESTYLE_MATCH | Match estilo de vida → colonia | quiz colonia | N3 |
| PRICE_NEGOTIATION_AI | Margen negociación recomendado | precio vs absorption | N4 |
| INVESTMENT_THESIS | Tesis inversión 5 años AI | LLM + scores aggregated | N5 |
| FUTURE_5Y_NARRATIVE | Narrativa colonia 5 años | LLM + IE_COL_PLUSVALIA_PROYECTADA | N5 |
| WRAPPED_PERSONAL | Wrapped anual cliente | DMX behavior | N5 |
| WRAPPED_ASESOR | Wrapped anual asesor | DMX operations | N5 |
| WRAPPED_DEVELOPER | Wrapped anual developer | DMX | N5 |
| WRAPPED_COLONIA | Wrapped anual colonia | DMX zone | N5 |
| MOAT_DATA_ACCUMULATION | Score moat datos acumulados | DMX longevity | N3 |
| LISTING_HEALTH_SCORE | Health listing 0-100 | DMX | N2 |
| SPEECH_QUALITY | Quality speech asesor (filler words / sentiment) | Deepgram | N2 |
| AI_COACH_RECOMMEND | Recomendación AI Coach asesor | LLM | N5 |
| FEASIBILITY_SCORE | Score factibilidad construcción D10 | datos.cdmx + costs | N3 |
| VIDEO_ENGAGEMENT_SCORE | Engagement videos DMX Studio | analytics | N1 |
| VIDEO_HOOK_QUALITY | Quality hook primeros 3s | AI vision | N2 |
| AD_WINNER_SCORE | Best ad creative Propads | analytics | N3 |
| ZONE_TWIN_GLOBAL | Climate twin global (Roma Norte ↔ Brooklyn Park Slope) | NOAA global | N3 |
| INVESTMENT_TIMING | Timing óptimo compra | predictive | N4 |
| LIQUIDITY_DAYS | Días estimados venta usado | regression | N4 |
| BANDERA_ROJA | Banderas rojas (precio sospechoso, etc.) | rules + LLM | N2 |
| BANDERA_VERDE | Oportunidades (descuento, ROI alto) | rules + LLM | N2 |

**Total estimado**: 118-125 scores. Crece orgánicamente conforme datos acumulan.

## 4. Fuentes de datos (18)

| # | Fuente | Tipo | Endpoint | Status |
|---|---|---|---|---|
| 1 | NOAA | Clima global | `https://www.ncei.noaa.gov/data/...` (free) | ✅ Activa |
| 2 | CONAGUA | Clima MX | scrapeable web + datos.gob.mx | ✅ Activa |
| 3 | INEGI Censo | Demografía MX | `https://www.inegi.org.mx/programas/ccpv/` | ✅ Activa |
| 4 | INEGI AGEB | Granularidad manzana | INEGI shapefiles | ✅ Activa |
| 5 | INEGI ENIGH | Ingresos hogar | `https://www.inegi.org.mx/programas/enigh/` | ✅ Activa |
| 6 | SCIAN | Actividad económica | INEGI | ✅ Activa |
| 7 | SHF + Banxico | Banca + precios | Banxico API + SHF | ✅ Activa |
| 8 | DENUE | Puntos de interés | `https://www.inegi.org.mx/app/api/denue/` | ✅ Activa |
| 9 | AirROI | Airbnb data nativa | API key (paid, ~$0.10/call) | ✅ Activa |
| 10 | Mapbox | Geo + heatmaps + tiles | API key (paid Pro plan recommended) | ✅ Activa |
| 11 | OSM (OpenStreetMap) | Polígonos + POIs | overpass-api.de | ✅ Activa |
| 12 | datos.cdmx.gob.mx | Open Data CDMX (CKAN) | `https://datos.cdmx.gob.mx/api/...` | ✅ Activa (SIG CDMX MGN, SEDUVI uso suelo) |
| 13 | Catastro CDMX | Predios + valores | datos.cdmx subset | ✅ Documentado |
| 14 | FGJ CDMX | Carpetas investigación (delitos) | `datos.cdmx.gob.mx/dataset/carpetas-de-investigacion` | 🟡 Driver 606 LOC ready, falta HTTP fetch (~4h) |
| 15 | Atlas Riesgos CDMX | Riesgo sísmico/inundación | `geoinformacionpublica.cdmx.gob.mx` | 🟡 STUB endpoint pivot pendiente |
| 16 | SACMEX | Agua | datos.cdmx subset | 🟡 STUB pendiente |
| 17 | DGIS | Salud | `dgis.salud.gob.mx` | 🟡 STUB pendiente |
| 18 | GTFS CDMX | Transporte | `gtfs.cdmx.gob.mx` (DNS issue, pivot CKAN) | 🟡 STUB endpoint |
| 19 | Locatel 0311 | Reportes ciudadanos | datos.cdmx subset | 🟡 STUB endpoint |
| 20 | Reelly | Inventario Dubai | API key (H2) | 🔵 H2 |

**Status leyenda**:
- ✅ Activa: integración funcional
- 🟡 STUB: driver listo, falta endpoint HTTP fetch (~4-8h work cada uno)
- 🔵 H2: post-launch (Dubai expansion)

**Fuera del catálogo**: SSP (Secretaría Seguridad Pública) — sin API/token documentado. NO incluir.

## 5. Game-changers

> Diferenciadores DMX vs competidores (Inmuebles24 / Vivanuncios / propiedades.com / Pulppo / EasyBroker / portales tradicionales).

### Game-changers DIRECTOS (DMX construye desde cero, único LATAM)

| GC | Nombre | Por qué moat |
|---|---|---|
| **GC-D1** | **IE Score colonia 0-100** | Cruzar 18 fuentes datos en 1 score. Imposible replicar sin datos temporales acumulados. |
| **GC-D2** | **Document Intelligence pipeline** | Extracción AI escrituras + permisos + LPs + Cross-Check único LATAM (Onyx canadiense no tiene compliance MX). |
| **GC-D3** | **Argumentario AI inline (C02)** | RAG sobre cliente + zone + projects → mensaje personalizado con citations. Sin precedente LATAM. |
| **GC-D4** | **Dynamic Pricing AI con razonamiento** | Sugiere precio + explica por qué + A/B testing. Inmuebles24 NO tiene esto. |
| **GC-D5** | **Demand Heatmap real (no autoreportado)** | Búsquedas reales DMX vs supply. Datos que Inmuebles24 NO comparte con desarrolladores. |
| **GC-D6** | **Site Selection AI con feasibility** | Datos.cdmx uso suelo + costos + demanda + plusvalía proyectada → recomendación zonas. Único LATAM. |
| **GC-D7** | **Cualquier-Link → Ficha DMX branded asesor** | Asesor multiplica catálogo virtual sin exclusivas. Trampa demanda competidores. |
| **GC-D8** | **CRM Pulppo+ (80 features avanzadas)** | Drag&drop fix + matcher 5 dim + wizard ofertar parser + ACM auto + acuerdo Mifiel + RFC/CFDI nativo. |
| **GC-D9** | **AI Compliance Cross-Check** | Cruza permiso + LP + escritura para detectar inconsistencias. Único LATAM. |
| **GC-D10** | **DMX Studio Director IA video** | Texto/foto/URL → video con voz + avatar + music. Único LATAM. |

### Game-changers LATERALES (inspirados en otras industrias / startups)

| GC | Inspiración | Aplicación DMX |
|---|---|---|
| **GC-L1** | Spotify Wrapped | Wrapped anual cliente + asesor + colonia + developer (Diciembre auto-genera) |
| **GC-L2** | Strava Segments | Leaderboard asesor por colonia + streaks cierres |
| **GC-L3** | Robinhood gamification | Score Elo asesor + badges + achievements |
| **GC-L4** | Yelp reviews | Reviews asesor 5★ + NPS + endorsements |
| **GC-L5** | Zillow Zestimate | IE Score colonia equivalente automatizado pero más rico (18 fuentes) |
| **GC-L6** | Tinder swipe | Quiz colonia → match propiedades / colonias soulmate |
| **GC-L7** | Uber driver app | Briefing diario asesor 8am WhatsApp con citas + tráfico + alertas |
| **GC-L8** | Stripe Connect | Marketplace fotógrafos B2B2C + revenue share auto |
| **GC-L9** | Caya (Emmi) | Asistente conversacional comprador WhatsApp + web entry channel |
| **GC-L10** | Propads ad creatives | Generación masiva 100 ads desde URL en 8-10 min |
| **GC-L11** | Stripe / Plaid platform play | Public widgets B2B embebibles (BBVA / Santander / FIBRAs) |

### Game-changers CROSS (combinaciones únicas)

| GC | Cross | Resultado |
|---|---|---|
| **GC-X1** | DMX Studio + CRM operaciones | Auto-genera video promocional cuando captación pasa a etapa Captado |
| **GC-X2** | Document Intel + IE Engine | Quality Score proyecto basado en cross-check docs (no solo confidence Anthropic) |
| **GC-X3** | Argumentario AI + Tracking cliente | Mensaje personalizado se adapta según fotos que el cliente miró |
| **GC-X4** | Compliance Cross-Check + Dynamic Pricing | Si Cross-Check detecta inconsistencia critical → bloquea ajuste precio hasta resolver |
| **GC-X5** | Cualquier-Link + IE Score | Ficha externa muestra IE Score colonia DMX (data que el portal source NO tiene) |
| **GC-X6** | Public widgets B2B + Lead pipeline | Banco genera leads → DMX asigna asesor → revenue share auto |
| **GC-X7** | Studio video + Marketplace público | Videos colonia indexables en marketplace público → SEO masivo |
| **GC-X8** | DISC + Matcher engine | Matcher 5 dim incluye 10% peso DISC para family fit |
| **GC-X9** | Heat demanda + Dynamic Pricing | Demanda no atendida → sugiere subir precio a developers |
| **GC-X10** | Wrapped + Argumentario | Cliente recibe Wrapped + asesor recibe argumentario optimizado para reactivar |

## 6. Moats — qué hace DMX irrepetible

### Moat #1 — Datos temporales acumulados

Cada mes acumulamos:
- ~10K observaciones climáticas nuevas
- ~3K transacciones operaciones (proyección H1)
- ~50K búsquedas comprador
- ~5K leads cross-channel
- Cambios IE Score por colonia (snapshots mensuales)

A los 12 meses, DMX tiene 12x los datos de un nuevo entrante. A 5 años, 60x. **Plusvalía 5 años proyectada con confianza alta requiere ≥3 años de histórico** — no se puede comprar.

### Moat #2 — Datos cruzados únicos

NOAA + INEGI + AirROI + DENUE + datos.cdmx + FGJ + Atlas Riesgos en una sola plataforma con embeddings unificados. **Nadie en LATAM lo hace**. Cada nueva fuente se cruza con todas las anteriores → growth combinatorio.

### Moat #3 — AI Document Intelligence

Pipeline AI que extrae datos estructurados de:
- Listas de precios PDF
- Brochures
- Escrituras notariales
- Permisos SEDUVI
- Estudios de suelo
- Licencias construcción
- Predial
- Planos arquitectónicos
- Contratos compra-venta
- Constancia situación fiscal

Cross-Check único LATAM detecta inconsistencias entre docs (ej. permiso SEDUVI 50 unidades vs LP 60 unidades). **Imposible replicar sin saldo Anthropic + system prompts canon + 7 reglas validación + AI reasoning natural español**.

### Moat #4 — Embeddings multimodales

- Búsqueda foto → similar
- Búsqueda URL externa → DMX recomienda mejores
- Búsqueda voz (Whisper / Deepgram nova-3 ES-MX)
- Búsqueda lenguaje natural → embeddings vectoriales

Cada query mejora el modelo. **Network effect en datos**.

### Moat #5 — Argumentario contextual (RAG)

Cliente tiene historial → DMX genera mensaje personalizado por proyecto/unidad. Argumentos exitosos (que cierran) entrenan al modelo. Asesor nuevo entra con argumentario nivel top performer desde día 1. **Imposible replicar sin volumen + closures historic**.

### Moat #6 — Compliance MX nativa

CFDI 4.0 + Mifiel NOM-151 + RFC + retención ISR + multi-currency MXN/USD/AED. Pulppo NO tiene esto. Onyx (canadiense) NO tiene esto. **Construir estos integrations toma 6+ meses + alianzas PAC**.

### Moat #7 — Multi-tenant data isolation perfecto

Cada desarrolladora ve SOLO lo suyo. Datos cruzados anonimizados para benchmarks (no se filtran datos privados). **Confianza enterprise requirements**.

## 7. Estado actual datos (snapshot últimas 5 días pre-recovery)

| Categoría | Cantidad |
|---|---|
| Climate observations | 76,756 (NOAA + CONAGUA) |
| Climate monthly aggregates | 46,226 |
| Climate twin matches | 1,140 |
| Climate zone signatures | 228 |
| Zones boundary real | 133 CDMX + 30 cities new |
| INEGI census zone stats | 226 |
| ENIGH zone income | 208 |
| Zone constellations edges | 43,890 |
| Ghost zones ranking | 420 |

**Tiempo recovery emergent.sh**: re-ingesta ~4-8 horas si quieres bootstrap con datos históricos. Alternativa: empezar greenfield y dejar que datos acumulen orgánicamente desde Day 1 launch.

## 8. Inversión inicial recomendada AI

| Servicio | Costo H1 estimado |
|---|---|
| Anthropic Claude Sonnet 4 | $500-1000 USD (testing + early launch) |
| OpenAI text-embedding-3-small | ~$50 USD (embeddings 50M tokens H1) |
| AirROI | $100-300 USD (markets nativos colonia) |
| Replicate Kling video | Variable (DMX Studio user-driven) |
| ElevenLabs TTS + Music | Variable |
| Deepgram nova-3 ES-MX | ~$200 trial credits |
| Mapbox | Pro plan ~$50/mo |
| Stripe Connect | Variable (revenue share fotógrafos) |
| **TOTAL H1** | **$1,000-3,000 USD** |

Continúa: `04_UI_DATA_REF.md` (UI ref + flows usuario + componentes "breath").
