# Fuentes oficiales para cargar — Intelligence Engine (verificadas 2026-06-16)

> Catálogo de las fuentes que encienden los scores hoy en "esperando-fuente". Cruce de los
> docs de Fable5 (`13_CONECTORES_INTEGRACIONES.md` + `memory/DATA_SOURCES.md`, donde ya estaban
> catalogadas con resource_id/env) + verificación web en vivo. Todas las URLs marcadas ✅ se
> probaron (HTTP 200) salvo nota. Acceso CKAN recomendado: `datos.cdmx.gob.mx/api/3/action/datastore_search?resource_id=<id>` (paginado, no bajar el CSV de 50 MB).

## 🥇 La de mayor palanca — cargar PRIMERO
**Catálogo de colonias CDMX (1,543 polígonos, con nombre de colonia + alcaldía).** Hoy el demo tiene **16 colonias**; cargar esto lleva TODO el IE al universo real de la ciudad (Ley #1 "datos completos, no muestra"). Es el join espacial base de TODOS los scores (crimen, escuelas, salud, riesgo, OSM).
- GeoJSON (10.3 MB, **1,543**, props `colonia`/`alc`/`cve_col`): `https://datos.cdmx.gob.mx/dataset/02c6ce99-dbd8-47d8-aee1-ae885a12bb2f/resource/026b42d3-a609-44c7-a83d-22b2150caffc/download/catlogo-de-colonias.json` · resource_id `026b42d3-a609-44c7-a83d-22b2150caffc` ✅
- env del pipe: `IE_COLONIAS_CDMX_URL`. Pipe de ingesta ya existe (espera el link); shapefile alterno `4f831409-...`.

## Listas para ingerir HOY (URL/ID exactos, keyless o token ya cargado)
| Fuente | Enciende | resource_id / URL | Formato | Acceso | Verif |
|---|---|---|---|---|---|
| **FGJ carpetas** (crimen + serie temporal) | N04 Crime Trajectory · `IE_COL_SEGURIDAD` · `IE_COL_TRUST` · Risk-crime (0.40) | `48fcb848-220c-4af0-839b-4fd8ac812c0f` (cols `fecha/mes/año/lat/lng/colonia/categoria`) | CSV / CKAN | keyless · `IE_FGJ_CDMX_RESOURCE_ID` | ✅ id vigente |
| **SACMEX reportes agua** | N07 Water Security · `IE_COL_AGUA` | `a8069e94-c7cb-45d7-8166-561e80884422` | CSV / CKAN | keyless · `IE_SACMEX_RESOURCE_ID` | ✅ 200 (incidentes, no calendario) |
| **Locatel 0311** | `IE_COL_LOCATEL` · trust | `44913088-806d-4f80-acca-1409a8225e9c` (urbano, NO el de call center) | CKAN | keyless · `IE_LOCATEL_RESOURCE_ID` | ✅ doc |
| **SEP centros de trabajo (CDMX)** | N06 School Premium (proximidad) · educación | `1672c5af-0583-4918-b676-b3d4b2329638` (lat/lng + CCT; "09"=CDMX) | CSV (21 MB) | keyless (datos.gob.mx) | ✅ 200 — ⚠️ calidad/PLANEA NO georref. abierta (solo ubicación) |
| **DGIS CLUES (salud)** | N10 Senior · `IE_COL_SALUD` | `gobi.salud.gob.mx/gobi/catalogos/.../ESTABLECIMIENTO_SALUD_202604.xlsx` (LAT/LONG) | XLSX (26 MB) | libre (cert TLS vencido → http) | ✅ 200 |
| **SGIRPC Atlas Riesgos CDMX** | N05 Infra Resilience · `IE_COL_CLIMA_SISMO/_INUNDACION` · Risk-natural (0.25) | `serviciosatlas.sgirpc.cdmx.gob.mx/arcgis/rest/services/AtlasCapasPublicas/{Geologicos,Hidrometeorologicos}/MapServer` (id 6 hundimiento, 23 sismo, flood) | ArcGIS REST → GeoJSON/WFS | keyless | ✅ directo (mejor que CENAPRED para CDMX) |
| **Banxico SIE** | plusvalía/tasas · IPV | `banxico.org.mx/SieAPIRest/service/v1/` (FIX `SF43718`, TIIE28 `SF60648`, UDIS `SP68257`, INPC `SP1`) | API JSON | token `IE_BANXICO_TOKEN` (cargado) | ✅ |
| **INEGI BISE + DENUE** | N01 Ecosystem · N02 Employment · demografía/ingreso | BISE `inegi.org.mx/app/api/indicadores/...` · DENUE `.../denue/v1/...` | API JSON | token `IE_INEGI_TOKEN`/`IE_DENUE_TOKEN` (cargado) | ✅ |
| **SHF índice precios vivienda** | plusvalía por zona metro/municipio | `gob.mx/cms/uploads/attachment/file/1077618/Indice_SHF_datos_abiertos_1_trim_2026.xlsx` (id cambia c/trimestre → resolver del hub) | XLSX | keyless | ✅ 200 |
| **SNIIV / SEDATU** | benchmark precio · inventario | `sniiv.sedatu.gob.mx/api/CuboAPI/` (CDMX cve `09`) | API JSON | keyless | ✅ (sin usar aún) |

## Requieren scrape/atención (no hardcodear)
| Fuente | Nota |
|---|---|
| **SESNSP incidencia** | Hub `gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva` → links OneDrive con token que ROTA → scrapear el hub cada vez (no CKAN). |
| **CENAPRED nacional** | `servicios1.cenapred.unam.mx:6080/arcgis/rest/services/ANR` — puerto :6080 (verificar desde prod). Para CDMX usa SGIRPC. |
| **Catastro valores unitarios 2026** | `transparencia.finanzas.cdmx.gob.mx/.../valores_unitarios_cfcdmx_2026_parte1.pdf` (PDF escaneado → OCR diferido). SIG predios `geonode:predios2022sig_local` ya parcial. |
| **AirROI (STR)** | de PAGO (token cargado, on-demand) — el cron nunca lo toca. |

## DRPI (liquidez/precio por colonia) — NO es URL externa
Índice hedónico interno (`transactions`→`hedonic_models`→`drpi_snapshots`). El dato pendiente son **cierres reales** (los aporta el CRM del asesor vía el flywheel del Cerebro), no un dataset.

## Orden de carga recomendado (máxima palanca primero)
1. **Colonias 1,543** (`026b42d3`) → de 16 a la ciudad real. Recompute.
2. **FGJ** (`48fcb848`) → crimen + seguridad + trust + Risk-crime + N04 (serie).
3. **SGIRPC Atlas** → sismo/inundación/hundimiento real → N05 + climate + Risk-natural.
4. ~~**SEP + DGIS** (POIs georref. oficiales)~~ → **N06 + N10 ya REALES vía OSM** (proximidad escolar/salud). La capa AUTORITATIVA (calidad SEP/DGIS) quedó en backlog: ⚠️ **datos.gob.mx migró a CKAN 2.11.5** (2026-06-15: `datastore_search` del resource SEP `1672c5af` devuelve HTML, no JSON) y DGIS es XLSX con TLS vencido + URL `YYYYMM` cambiante. Ver `memory/BACKLOG_ENHANCEMENTS.md`.
5. **SACMEX** → N07. **Banxico** → plusvalía/IPV. **SNIIV** → benchmark.
6. **Catastro valores 2026 (OCR)** → ancla del AVM (proyecto aparte).

> **Estado del moat N0x (2026-06-15, ciudad-completa sobre 1,524 colonias):** N01=1,512 · N06=1,312 · N08=1,495 · N09=1,173 · N10=1,101 reales. FGJ crimen=1,573 colonias con safety_score. Recompute N0x ciudad-completa via `POST /api/superadmin/scores/recompute-all {colonia_source:"catalog", codes:[...N0x]}` (cache de distribución de ciudad lo hace ~30s).

## Patrón de ingesta
- CKAN: `datastore_search?resource_id=<id>&limit=...&offset=...` (paginado) — no bajar CSV de 50 MB.
- Colonias: bajar GeoJSON una vez → indexar polígonos → join espacial PostGIS/punto-en-polígono.
- Atlas riesgo: WMS/WFS/GeoJSON del geoserver SGIRPC.
- Cada fuente que ya tiene `@register`/env solo necesita su `resource_id`/URL en env + correr el cron de ingesta + recompute.
