# DMX Data Sources Map (canonical)

**Última actualización**: 2026-06-07 (consolidación canónica · tokens reales cargados + resource_ids verificados + SIG/valor unitario/SHF para valuación + estado real de ingesta + checklist de fundamentación)

Mapa exhaustivo de fuentes de información que DMX consume o consumirá. Estado per fuente + URL exacta + token requerido + Wave/batch que la usa + **tipo de ingesta**.

---

# ⭐ ESTADO REAL · 2026-06-07 (fuente única de verdad)

> Disparado tras detectar AVM/índices con coeficientes inventados. Regla: todo número al usuario se ancla a fuente OFICIAL con fecha, o se muestra como banda/“sin dato aún”. Cero inventos, cero deuda.

## 3 niveles de “conexión” (no confundir)
1. **Registrada** — la fuente está en el catálogo `ie_data_sources` (18 filas). NO significa que haya datos.
2. **Conectada** — el token/resource_id está en `backend/.env.local` y el conector puede pegarle. Listo para jalar.
3. **Ingestada** — los datos YA están en una colección Mongo y alimentan scores/AVM. Esto es lo único que mueve números reales.

## A) Lo que YA quedó CONECTADO en env (2026-06-07)
| Fuente | Env var | Nivel | Alimenta |
|---|---|---|---|
| Banxico SIE (TIIE/tasas/SHF) | `IE_BANXICO_TOKEN` | Conectada ✅ (conector `banxico_rates.py` vivo) | tasas hipoteca/TIIE reales · plusvalía SHF |
| INEGI (Censo/ENIGH/DENUE/SCIAN) | `IE_INEGI_TOKEN` | Conectada ✅ | demografía + comparables |
| DENUE (negocios) | `IE_DENUE_TOKEN` | Conectada ✅ | densidad comercial real por zona |
| NOAA clima | `IE_NOAA_API_KEY` | Conectada ✅ | clima/isla de calor |
| Mapbox | `MAPBOX_TOKEN` | Conectada ✅ | mapas/heatmaps/geocoding |
| Apify (trends) | `APIFY_API_TOKEN` + `APIFY_TRENDS_REAL=true` | Conectada ✅ | velocidad de búsqueda (Live Pulse) |
| AirROI (Airbnb) | `IE_AIRROI_API_KEY` | Conectada ✅ | ROI renta corta real |
| datos.cdmx base | `IE_DATOS_CDMX_BASE_URL` | Conectada ✅ | endpoint CKAN |

## B) Resource_ids CDMX verificados (no llevan token, solo el ID)
| Fuente | Env var | Resource ID | Alimenta |
|---|---|---|---|
| FGJ — carpetas/delitos por colonia (2.1M filas) | `IE_FGJ_CDMX_RESOURCE_ID` | `48fcb848-220c-4af0-839b-4fd8ac812c0f` | IE_COL_SEGURIDAD (riesgo real) |
| SACMEX — cortes de agua | `IE_SACMEX_RESOURCE_ID` | `a8069e94-c7cb-45d7-8166-561e80884422` | IE_COL_AGUA_CONFIABILIDAD |
| Locatel *0311 — reportes ciudadanos (baches/luz/fugas) | `IE_LOCATEL_RESOURCE_ID` | `44913088-806d-4f80-acca-1409a8225e9c` | IE_COL_LOCATEL / trust vecindario |

> Nota Locatel: Cowork sugirió `be32ff48-…` (Servicios Integrales/Línea Mujeres = call center, NO urbano). Para reportes urbanos el correcto es el *0311 `44913088-…`. Documentado para no volver a confundir.

## B.1) CATÁLOGO DE COLONIAS (EX.1 · pipe listo, espera fuente)
El conector de ingesta (`colonias_catalog.ingest_official_catalog`) carga el catálogo oficial y crece la cobertura (hoy 16/CDMX → ~1,800). Acepta DOS modos; pon UNA env var en `backend/.env.local`:
| Modo | Env var | Valor | Fuente |
|---|---|---|---|
| GeoJSON (recomendado para CDMX) | `IE_COLONIAS_CDMX_URL` | URL directa del GeoJSON de "coloniascdmx" | [datos.cdmx · coloniascdmx (IECM)](https://datos.cdmx.gob.mx/dataset/coloniascdmx) · "Catálogo de colonias" |
| CKAN datastore | `IE_COLONIAS_CDMX_RESOURCE_ID` | resource_id (si el dataset es datastore-activo) | datos.cdmx |
> Nota: los resource_id de colonias de datos.cdmx NO son datastore-CKAN (son GeoJSON/Opendatasoft) → usar `IE_COLONIAS_CDMX_URL` con el link directo de descarga GeoJSON. Tras configurar: terminal superadmin → "Cargar Catálogo CDMX". Los scores reales por colonia llegan al correr las recetas (EX.2).

## C) VALUACIÓN — la pieza que ancla el AVM (SIG + valores unitarios + SHF)
La fuente OFICIAL del valor catastral (guía Catastro CDMX, PDF predial):
**valor catastral = valor del suelo + valor de la construcción**
- Suelo = *valor unitario de suelo $/m²* (tablas por colonia catastral/corredor/área de valor) × m² terreno.
- Construcción = *valor unitario de construcción $/m²* (por uso×clase×niveles) × m² construidos.
- Publicado **cada año** en el **Código Fiscal CDMX / Gaceta Oficial**. El PDF de ejemplo es 2020; existe **2024** (transparencia.finanzas.cdmx) y **2026** (Gaceta). **Usar 2026.**

| Pieza | Qué es | Estado | Env var (propuesta) | Cómo se usa |
|---|---|---|---|---|
| **SIG WFS predios** ✅ | Capa `predios2022sig_local` (6.89M predios · `vsuelo` = valor catastral TOTAL del lote · uso) | **HECHO** (`sig_catastro_engine` · WFS por colonia → mediana $/m² = vsuelo/área del polígono · banda por percentil) | `IE_SIG_WFS_URL` (default catalogov2.sig.cdmx) | valor catastral OFICIAL del suelo $/m² por colonia · piso/ancla (NO precio de venta) · surfaceado en valuación del comprador |
| **Modelo suelo→comercial** ✅ | Regresión `comercial = a + b·catastral` ajustada con ventas reales + R² (ING.2) | **HECHO** (`comercial_value_model` · recalibra en cada venta = flywheel · estima la cola larga SOLO si es fiable, si no deja el suelo como piso) | — | convierte el suelo oficial en precio comercial estimado · alimenta valuación del comprador + pricing del dev |
| **Valores unitarios 2026** | Tablas oficiales $/m² suelo + construcción por zona | Pendiente (PDF Gaceta) — OPCIONAL (el modelo aprende el factor de las ventas) | `IE_VALORES_UNITARIOS_2026_URL` | refuerzo del modelo cuando exista |
| **SHF Índice precios vivienda** ✅ | Plusvalía OFICIAL (avalúos de todo crédito hipotecario) | **HECHO** (`shf_engine` · sembrado oficial 1T2026 + pipe refresh XLSX) | `IE_SHF_XLSX_URL` (default gob.mx) | plusvalía oficial CDMX +5.1% · surfaceada en valuación del comprador |

### ⚠️ CORRECCIÓN CLAVE (reporte verificado founder 2026-06-07)
- **SHF NO existe en el SIE de Banxico** (cualquier serie ID es inventada). Solo XLSX en gob.mx (trimestral feb/may/ago/nov). 1T2026: nacional +8.7% · Valle de México +5.1% · nueva +9.1%/usada +8.3% · avalúo mediana $1,331,000. XLSX: `gob.mx/cms/uploads/attachment/file/1077618/Indice_SHF_datos_abiertos_1_trim_2026.xlsx`.
- **No existe precio de CIERRE público** (RPP/notarías no publican). Proxies: INCOIN/Softec (obra nueva, pago) + créditos SNIIV. Por eso el moat = nuestros cierres del asesor (C.1).
- **Catastro vsuelo** ✅ INGESTADO: SIG WFS `geoserver/ows` capa `geonode:predios2022sig_local` (6,886,398 predios · campos clave/vsuelo/ayocon). CLAVE: `vsuelo` es STRING = valor catastral TOTAL del lote (NO $/m²); el unitario sale de `vsuelo/área del polígono` (shoelace sobre el anillo MultiPolygon, grados→m² vía 111320×cos(lat)). bbox axis order = lat,lng con `urn:ogc:def:crs:EPSG::4326`. `sig_catastro_engine.sync_vsuelo_for_city` consulta ~300 predios alrededor del centro de cada colonia → mediana $/m² catastral → banda por percentil de la ciudad → `colonias.vsuelo_pm2_catastral/vsuelo_score`. Verificado live: Lomas $9,423 (muy alta) · Polanco $1,409 · Roma Norte $405 (catastral es ~40-65% del comercial, por eso es PISO no precio). Modelo valor comercial ✅ HECHO (ING.2 · `comercial_value_model`): en vez de un ratio inventado, se AJUSTA una regresión `comercial = a + b·catastral` con las colonias que tienen suelo Y ventas reales + se mide R². Estima la cola larga solo si es fiable (n≥4, R²≥0.3); si no, el suelo queda como piso (cero deuda). Cada venta lo recalibra (`registrar_cierre`→recalibrate = flywheel). Verificado E2E: 8 zonas con ventas → R² alto → estimó Narvarte ($406 suelo) en su comercial exacto desde el modelo. Hoy en stub honesto (0 ventas reales).
- **SNIIV API** (sin token): `sniiv.sedatu.gob.mx/api/CuboAPI/` (GetInfonavit/GetCNBV/GetInventario…) → créditos + inventario por municipio. CDMX = cve 09.
- **Renta corta**: AirROI (~$10 pay-as-you-go, por colonia) fase 2.

## D) Dónde caen los datos (colecciones Mongo) — estado real HOY
| Colección | Conteo (2026-06-07) | Qué guarda |
|---|---|---|
| `ie_data_sources` | 18 | catálogo de fuentes |
| `ie_raw_observations` | 235 | observaciones crudas ingestadas |
| `ie_scores` | 3,422 | scores por colonia (vivo) |
| `ie_score_history` | 17,110 | histórico de scores |
| `ie_ingestion_jobs` | 41 | corridas de ingesta |
| `colonias.vsuelo_pm2_catastral` | **16** ✅ | valor catastral oficial del suelo $/m² por colonia (SIG WFS · sig_catastro_engine) — vivo; crece al sincronizar colonias con centroide |
| `catastro_cdmx` (tabla legacy) | 0 | predios crudos — sin usar; el catastral vive ya por colonia (arriba) |
| `sigcdmx_uso_suelo` | **0** | uso de suelo SEDUVI — **vacío** |
| `gov_data_mx_raw` | 2 | casi vacío |
| (SHF/plusvalia_hist) | **no poblada** | falta disparar serie 736183 |

**Traducción honesta:** el motor de scores por colonia SÍ está vivo (3.4k scores), pero las fuentes pesadas de valuación (**catastro/valores unitarios y SHF**) **todavía NO están ingestadas** — solo registradas/conectadas. Por eso el AVM aún se apoya en heurísticas; al ingestar SIG+valores unitarios+SHF se ancla a oficial.

## E) Checklist de fundamentación (avance · ✅ hecho · ⏳ pendiente)
- ✅ Tasas oficiales vivas (`banxico_rates.py`: TIIE 6.6554% / hipoteca CF303 11.46%) — fin del 7.25% de blog.
- ✅ `investment_simulator` lee tasas de la fuente única (no hardcode).
- ✅ Live Pulse: el score solo cuenta señales reales (el trend sintético ya no contamina).
- ✅ `dmx_demand` / `state_of_cdmx`: fallbacks marcados “estimado”, sin ROI inventado.
- ✅ AVM homologación conservadora (NMX-459/Ross-Heidecke) — no salta 20%.
- ✅ Precio en Contexto: obra nueva vs obra nueva comparable + bandas neutras (no “caro”).
- ✅ Flywheel asesor→AVM: captaciones reales alimentan referencia de reventa.
- ✅ Tokens reales cargados + resource_ids CDMX verificados + bug `.env.local` ($ sin comillas) arreglado de raíz.
- ✅ **Ingestar SIG WFS predios** → valor catastral OFICIAL del suelo $/m² por colonia (`sig_catastro_engine` · vsuelo/área · banda percentil · 16 colonias vivas · botón superadmin "Sincronizar Valor del Suelo" + surfaceado en valuación del comprador). ⏳ resta: valores unitarios 2026 (PDF Gaceta) + modelo comercial = catastral × factor_SHF × ratio.
- ⏳ **Disparar SHF (INEGI 736183)** → poblar plusvalía histórica oficial.
- ⏳ **Tanda B**: scores inventados (IAB/IDS/gentrificación/IDM) → señal direccional (bajo/medio/alto) en toda la UI + “señal DMX, no medición”.
- ⏳ **Tanda C**: valuación afinada contra comparables reales (normalizar por percentiles reales, no topes inventados).
- ⏳ Normalizador por percentiles (`metric_normalizer`) + leyenda honesta de fuente/fecha en cada métrica.

## F) Dato 100% asertivo = imposible hoy en México (decisión de producto)
Los asesores subirán propiedades a veces a valor de mercado y a veces al precio que pide el dueño (inflado). Igual pasa con cualquier portal. **No peleamos por exactitud imposible; peleamos por honestidad y robustez:**
1. **Anclar** a oficial donde exista (valores unitarios, SHF, Banxico).
2. **Filtrar atípicos**: marcar/winsorizar precios fuera de rango vs la colonia (no borrar, etiquetar “fuera de rango”).
3. **Mostrar confianza + fuente**: “estimado”, n de comparables, fecha. Banda, no decimal falso.
4. **Mejorar con volumen**: más captaciones + más devs = la mediana se corrige sola (flywheel).
→ Pendiente operativo: guard de outliers en captación + sello de confianza visible. (va con Tanda C)

---

## Tipos de ingesta soportados (W6.13)

| Tipo | Cómo opera | Effort |
|---|---|---|
| 🟢 **API live** | Auto-pull cron · sin intervención | Alta automatización |
| 🟡 **Cron download** | URL fija · descarga + parse periódica CSV/Excel/GeoJSON | Semi-auto |
| 🟠 **Upload manual** | Founder/admin sube CSV/Excel/PDF en `/superadmin/data-uploads` · valida schema · audit log | Manual pero escalable |
| 🔴 **Partnership only** | Requiere acuerdo bilateral · no público | Bloqueado |

## W6.13 fuentes pendientes activar (post-W5 build · 3 tracks paralelos)

### Track A · API auto-pull (~12-15h)

| Fuente | Tipo | Auth | Datos |
|---|---|---|---|
| INEGI DENUE | 🟢 API | `INEGI_TOKEN` ya tenemos | Empresas SCIAN + lat/lng + empleados |
| BANXICO SIE | 🟢 API | Token gratis | INPC construcción + tasas + USDMXN |
| DataMéxico SE federal | 🟢 API | Sin auth | Macro económico |
| CONAVI subsidios | 🟢 API | Sin auth | Subsidios + crecimiento vivienda |
| SESNSP delitos | 🟢 CSV mensual | Sin auth | Crimen real por municipio |
| CENAPRED Atlas Riesgos | 🟢 GeoJSON estático | Sin auth | Sísmico + hidrometeorológico |

### Track B · Cron download CSV/Excel/PDF periódicos (~10-15h)

| Fuente | Tipo | Frecuencia | Datos |
|---|---|---|---|
| SEP Estadística 911 | 🟡 CSV/Excel | Anual | Escuelas individuales nacional |
| INEGI Censo ITER | 🟡 CSV | Quinquenal + updates | Demografía por AGEB |
| IMSS asegurados | 🟡 Excel mensual | Mensual | Empleo formal por municipio |
| CNBV Portafolio | 🟡 XLS/CSV | Mensual | Cartera hipotecaria |
| ENVIPE INEGI | 🟡 CSV | Anual | Percepción seguridad |
| Atlas Riesgo CDMX | 🟡 GeoJSON | Anual | Riesgo sísmico/hundimiento por colonia |

### Track C · Upload manual admin (~10-15h)

| Fuente | Tipo | Frecuencia | Datos |
|---|---|---|---|
| Notarías CDMX gremio (CNNyM) | 🟠 PDF | Anual | Estadísticas agregadas transacciones |
| Registro Público Propiedad CDMX | 🟠 PDF boletín | Anual/trimestral | Volumen operaciones (sin precio individual) |
| Catastro Miguel Hidalgo + Cuauhtémoc | 🟠 Open data + boletines | Variable | Granularidad predial limitada |
| SHF reportes trimestrales | 🟠 PDF financiero | Trimestral | Índice precios + crédito hipotecario |
| BMV FIBRAS REITs | 🟠 PDF financials | Trimestral | Benchmark cap rates renta |
| CFE cobertura/tarifas | 🟠 PDF reportes | Anual | Cobertura energía |
| CONAGUA cobertura agua | 🟠 Excel sectorial | Anual | Cobertura agua/drenaje municipal |
| CMIC sector construcción | 🟠 Scraping/boletines | Variable | Capex sector + proyectos cartera |

**Implementación Track C**: `routes/admin_data_uploads.py` + `pages/superadmin/SuperadminDataUploads.js` · drag-drop UI · valida schema por fuente · taggea con `source_name + period + uploaded_at + uploaded_by` · audit log inmutable.

### 🔴 Partnership-only (Y2 piloto · NO scrappable)

| Fuente | Razón bloqueador |
|---|---|
| Notarías individuales (no gremio) | Privacidad fuerte · requiere acuerdo bilateral 1-2 notarías piloto |
| RPP CDMX consulta individual | Per-folio paid · NO bulk |

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

## ⏳ A INTEGRAR — Wave 4 ronda 2 (Teseo+AirDNA+cofounder expansion)

### Para Idea #18 Amenities Validator (Phase 16 ext)

| Fuente | URL | Auth | Notas |
|---|---|---|---|
| **Meta Marketing API** | https://developers.facebook.com/docs/marketing-apis/ | Facebook Business Manager + App Review (~2-4 sem) | Crítico para auto-launch A/B campaigns. V1 manual launch (export brief), V2 auto-launch. |
| **Google Ads API** (opcional) | https://developers.google.com/google-ads/api/docs | Developer token + OAuth | Channel adicional A/B testing, defer si Meta basta |

### Para Idea #22 MCP Server público (W4.NEW DMX Brand Strategy)

| Fuente / Lib | URL | Notas |
|---|---|---|
| **fastmcp Python** | https://github.com/jlowin/fastmcp | Open source, mature, mantenida por Anthropic ecosystem |
| **MCP Spec Anthropic** | https://modelcontextprotocol.io/ | Estandar abierto |

### Para SEO landing pages PER ZONA (W4.NEW)

Sin externos. Usa cubo Z W2.5 + DRPI + Risk Score. Sitemap.xml dinámico + Schema.org PostalAddress + RealEstateListing markup.

---

## ⏳ A INTEGRAR — Wave 4 ronda 1 (Phase Y + Polish + Launch)

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
