# DMX Data Sources Map (canonical)

**Última actualización**: 2026-05-07 (post-análisis Teseo expansion)

Mapa exhaustivo de fuentes de información que DMX consume o consumirá. Estado per fuente + URL exacta + token requerido + Wave/batch que la usa.

---

## 🟢 INTEGRADAS (production)

| Fuente | URL portal/API | Auth | Uso DMX | Phase |
|---|---|---|---|---|
| **INEGI API Indicadores** | https://www.inegi.org.mx/servicios/api_indicadores.html | `INEGI_TOKEN` env (gratis, fallback honest si missing) | Demanda + Site Selection (B7) + Comparables | Phase 4 |
| **Mapbox Geocoding + Maps** | https://www.mapbox.com/ | `MAPBOX_TOKEN` env | Mapas todos portales + Heatmap W2.5 + ZZ.4 Risk | Phase 4 + |
| **Google Drive OAuth** | https://developers.google.com/drive | OAuth tokens per dev_drive_connection | Bulk Drive Ingestion ZZ.1 + Doc sync 7.11 | W1.4 |
| **Resend Email** | https://resend.com/ | `RESEND_API_KEY` env | Notificaciones + Boletines ZZ.3 + Trial alerts W2.4 | B19 + |
| **Claude (Anthropic)** | via emergentintegrations | `EMERGENT_LLM_KEY` env | AI agentic + extraction + narratives + suggestions | All AI |
| **Google Calendar OAuth** | https://developers.google.com/calendar | OAuth per asesor | Availability + slots auto-assign | B15 |
| **CONAGUA/SMN clima** | https://smn.conagua.gob.mx/es/ | API key gratis (solicitar) | Briefing Tráfico+Clima B33 (parcial) | Phase 3 |
| **Sentry** | https://sentry.io/ | `SENTRY_DSN` env | Observability errors | F0.11 |
| **PostHog** | https://posthog.com/ | `POSTHOG_*` env | ML events + analytics | F0.11 |

---

## 🟡 STUB / parcialmente integradas

| Fuente | URL | Bloqueador | Próximo paso |
|---|---|---|---|
| **Microsoft Calendar Graph** | https://learn.microsoft.com/graph/api/calendar | Falta tenant Microsoft 365 founder | Activate when tenant available |
| **LinkedIn OAuth real** | https://learn.microsoft.com/linkedin/ | LinkedIn partnership program approval | Manual paste form B32 (current) |
| **AMPI cédula format check** | — | Format only, no verification real | Drop persiguir (founder decision 2026-05-07) — keep stub for badge B32 |
| **Pedra (renders Studio)** | — | Falta `PEDRA_API_KEY` | Activate Studio Wave 2 |
| **ElevenLabs (voiceover)** | https://elevenlabs.io/ | Falta `ELEVENLABS_API_KEY` | Activate Studio Wave 2 |

---

## ⏳ A INTEGRAR — Wave 3 (Authority + Verticals)

### Para Idea #1 DENUE integration

| Fuente | URL | Auth | Datos clave | Use case DMX |
|---|---|---|---|---|
| **INEGI DENUE API** | https://www.inegi.org.mx/servicios/api_denue.html | Mismo `INEGI_TOKEN` ya tenemos | Registro empresarial: nombre, actividad SCIAN, lat/lng, empleados, antigüedad | Site Selection competidores · Demand pulse businesses · Lead enrichment empresa-a-empresa |

### Para Idea #12 DMX Risk Score per propiedad (ZZ.4 Risk Layer)

| Fuente | URL | Acceso | Frecuencia |
|---|---|---|---|
| **SESNSP Incidencia delictiva** | https://www.gob.mx/sesnsp/acciones-y-programas/incidencia-delictiva-del-fuero-comun-nueva-metodologia | CSV mensual descarga gratis | Mensual |
| **CENAPRED Atlas Nacional Riesgos** | http://www.atlasnacionalderiesgos.gob.mx/ | GeoJSON + WMS service gratis | Estático histórico + updates |
| **ENVIPE INEGI** | https://www.inegi.org.mx/programas/envipe/ | CSV anual gratis | Anual |
| **Atlas Riesgo CDMX** | http://www.atlas.cdmx.gob.mx/ | GeoJSON gratis (riesgo sísmico/hundimiento por colonia) | Estático |
| **Protección Civil CDMX** | https://www.proteccioncivil.cdmx.gob.mx/ | Datasets abiertos | Variable |

### Para Idea #13 Construction Cost Predictor (Phase 5 ext)

| Fuente | URL | Auth | Datos clave |
|---|---|---|---|
| **BANXICO API SIE** | https://www.banxico.org.mx/SieAPIRest/ | Token gratis registro | INPC construcción + tasas + USDMXN |
| **INEGI INPC construcción** | https://www.inegi.org.mx/temas/inpp/ | API ya tenemos | Inflación insumos construcción mensual |
| **CMIC** Cámara Construcción | https://www.cmic.org.mx/ | Sin API pública — scraping/manual | Capex sector + proyectos cartera nacional |

### Para Idea #14 Methodology page + #4 Boletines (ZZ.3 deliverables)

| Fuente | URL | Auth | Uso |
|---|---|---|---|
| **SHF Índice Precios Vivienda** | https://www.gob.mx/shf (sección Información del Mercado de Vivienda) | PDF mensual gratis | Benchmark DRPI nuestro |
| **DataMéxico (SE federal)** | https://www.economia.gob.mx/datamexico/ | Open data gratis | Site Selection ext + boletines macro |
| **CONAVI** | https://www.gob.mx/conavi | Portal abierto | Subsidios + crecimiento vivienda |
| **CNBV Portafolio Información** | https://portafolioinfo.cnbv.gob.mx/ | Public datasets | Cartera hipotecaria + tasas |

---

## ⏳ A INTEGRAR — Wave 4 (Phase Y + Polish + Launch)

### Para Idea #6 Investment Simulator (Phase 19 ext)

Reusa: BANXICO (tasas mortgage) + CONAVI (subsidios) + INEGI INPC (inflación) + DRPI nuestro (apreciación). Sin nuevas fuentes externas requeridas — solo combinatoria.

### Para Idea #7 Lead Journey Outbound asesor→dev (Phase 16)

Reusa: DENUE (#1) + LinkedIn manual paste B32. Sin nuevas fuentes — engine de qualification + tracking.

### Para Idea #8 AutoNewsletter DMX Pulse (Phase 8 ext)

Reusa: cubo Z W2.5/W2.7-W2.8 + DRPI ZZ.3. Distribución vía Resend ya integrado.

---

## 🔴 PRIVADAS / FRAGMENTADAS (defer Y2 o partnership comercial)

| Fuente | Costo/Bloqueador | Valor unique | Quién va a por esto |
|---|---|---|---|
| **Registro Público Propiedad CDMX** | https://rpp.cdmx.gob.mx/ — sin API, búsqueda manual UI | Title chain real per propiedad | ZZ.4 Fraud Detection Y2 partnership |
| **SEDUVI CDMX construcciones** | https://www.seduvi.cdmx.gob.mx/ — portal stale mensual | Manifestaciones construcción autorizadas | Phase 5 IE Engine future |
| **Catastros municipales** | Cada alcaldía portal propio (Miguel Hidalgo, Cuauhtémoc, etc.) | Avalúos oficiales por predio | Y2: piloto 1 alcaldía Polanco/Miguel Hidalgo |
| **Notarías CDMX grandes** | Privacidad fuerte, sin API | Closings reales con precio | ZZ.2 Transaction Network — partnership 1-2 notarías piloto |
| **Tinsa MX** | https://www.tinsa.com.mx/ | Valuación comercial estandarizada | Y2 si AVM enterprise tier |
| **Softec** | https://softec.com.mx/ — ~$100K MXN/año | Análisis mercado vivienda | Defer Y2 |
| **Bloomberg Terminal** | $24K USD/seat/año | Bonds, FX, indices real-time | Defer Y2 |
| **DOF Diario Oficial** | https://www.dof.gob.mx/ | Decretos infraestructura (metro nuevo) | Y2 web scraping |

---

## Cámaras / asociaciones (acceso variable)

| Asociación | URL | Acceso | Valor |
|---|---|---|---|
| **CMIC** Construcción | https://www.cmic.org.mx/ | Sin API, posible partnership | Proyectos cartera nacional |
| **CANADEVI** Desarrolladores Vivienda | https://canadevi.com.mx/ | Sin API | Producción nacional vivienda |
| **AMCI** Concretera (partner Teseo) | https://amci.org.mx/ | Sin API | Precios cemento histórico |
| **AMPI** | https://ampi.org/ | NO data unique value confirmado 2026-05-07 | NO perseguir partnership |

---

## Internacional (gratis, low priority H1)

| Fuente | URL |
|---|---|
| World Bank Open Data | https://datatopics.worldbank.org/world-development-indicators/ |
| OECD Affordable Housing | https://www.oecd.org/housing/data/affordable-housing-database/ |
| IMF | https://data.imf.org/ |
| BBVA Research | https://www.bbvaresearch.com/ (free reports MX) |

---

## Tokens/keys pendientes para founder

| Variable env | Para qué | Estado |
|---|---|---|
| `INEGI_TOKEN` (real) | Demanda + DENUE | Stub fallback honest. Solicitar https://www.inegi.org.mx/servicios/ |
| `BANXICO_TOKEN` | INPC + tasas | Falta. Registro https://www.banxico.org.mx/SieAPIRest/ |
| `CONAGUA_API_KEY` | Clima ext | Falta. Solicitar SMN |
| `MICROSOFT_OAUTH_*` | Calendar Microsoft | Defer hasta tener tenant Microsoft 365 |
| `ELEVENLABS_API_KEY` | Voiceover Studio Wave 2 | Defer Wave 4 |
| `PEDRA_API_KEY` | Renders Studio Wave 2 | Defer Wave 4 |
