# AUDITORÍA FINAL — los 5 documentos fundacionales (2026-06-30)

> Verificación honesta (4 agentes en paralelo, contra el repo + la base de datos REAL, no a fe de los docs)
> de que lo de los 5 documentos esté **construido · conectado · visible · funcionando**, front y back.
> Regla: confrontar, no validar por agradar. Donde el doc infla, se dice.

## Veredicto en una línea
**El CÓDIGO está ~100% construido y cableado. La DATA (feeders) subió a ~95% prendida: conecté las fuentes
oficiales VIVAS (SACMEX agua, FGJ crimen, zonificación sísmica) y los 3 scores que estaban "esperando fuente"
(N04/N05/N07) ahora leen dato REAL.** Lo único que falta es dato que genuinamente no existe (serie histórica de
precios para forecast, reseñas, brokers) — no se fabrica. El cubo de "4 escalas por métrica" sigue colonia-céntrico
(la celda ya navega nano↔macro vivo).

## Actualización (mismo día) — los 3 scores "esperando fuente" → PRENDIDOS con dato real
- **N07** seguridad hídrica: **1,051 colonias** (SACMEX 313k reportes, CKAN vivo).
- **N04** trayectoria del delito: **1,034 colonias** (FGJ 2.1M carpetas × año).
- **N05** resiliencia sísmica: **761 colonias** (join espacial shapely sobre la zonificación sísmica oficial, de 5 → 761).
- **Compuestas forecast** (7: #10/#12/#28/#91/#94/#97/#100): encendidas con la apreciación oficial **SHF** por alcaldía + CDMX estatal (forecast_pct 0→20/20 zonas, cobertura 55→60%).
- **Feeders re-ejecutables**: `POST /api/superadmin/scores/refresh-moat-feeders` (re-corre los 3 + recompute).
- Patrón: flags `needs_water`/`needs_crime_trajectory`/`needs_natural_risk` + `_build_*_context` (como `needs_denue`).

### El piso honesto — lo único que falta NO tiene fuente (no se fabrica)
Las compuestas que siguen null (#66 reseñas, #78 brokers, #35 clima, #39 fraude, #40 título) leen de colecciones
**VACÍAS** (`reviews_residents`, `broker_zone`, `climate_migration_zone`, `fraud_alerts`, `di_cross_checks` = 0 docs)
sin dataset abierto que las llene. Per la regla #1 del founder ("no inventes datos"), el stub honesto es lo correcto:
se prenden solas cuando la plataforma acumule reseñas/cierres/brokers (el código ya está cableado).

---

## Por documento

### Doc 1 · Arsenal (~190 motores) — ✅ el doc SUBESTIMA
- Real: **157 `_engine.py` raíz (177 recursivo) · 251 routers** (el doc decía 154/223).
- Muestra de 26 motores 🟢 verificada en 3 capas (existe · ruta · UI): **26/26 completos end-to-end. 0 huérfanos.**
- Cuello de botella = **prender feeders**, no construir. Confirmado.

### Doc 2 · 120 compuestas — ✅ reales y visibles (motor real = `composite_metrics.py`)
- 120 compuestas en 12 packs. Polanco **107/120 con valor real (89%)**, Condesa 98/120, global 55%.
- Visible end-to-end: `GET /demand-intel/terminal-zona?axis=compuestas` + tab "Las 120 compuestas" + `Compuestas100`.
- Packs 11 (suelo) y 12 (STR/AirROI) computan. **Gap: 12 compuestas null en TODAS las zonas** (#10,#12/#91,#28,#35,#39,#40,#66,#78,#94,#97,#100) por feeder muerto — mismo origen que N04/N05/N07.

### Doc 4 · Feeders / fuentes — ✅ ciudad completa, mayoría prendida
- Colonias: **2,788 (1,811 con polígono)** — ciudad-completa, no demo. (`/api/health` dice 16 = seed legacy engañoso.)
- Scores moat reales: **N01 1,518 · N06 1,324 · N08 1,501 · N09 1,194 · N10 1,115** (cuadran con el doc).
- FGJ crimen **4,189 docs / 2,500 colonias** con safety_score (doc decía 1,573 → superado). Catastro **1.08M predios**.
- Gov Data MX **4/5 OK** (BANXICO·INEGI·SESNSP·SGIRPC); **CONAVI 404** (externo).
- **GAP real: N04 (crimen-trayectoria) · N05 (infra/Atlas) · N07 (agua/SACMEX) = 0 reales (stub).** Sus connectors
  escriben obs STUB en `ie_raw_observations`; la data real no está en forma derivable in-repo (N04 necesita serie
  temporal FGJ; `crime_zone_colonia` es snapshot 2-años sin tiempo). **Construir esos 3 connectors = el feeder pendiente.**

### Doc 3 · Hipergranularidad (75×4) + Cubo ~3,880 — ⚠️ aquí los docs INFLAN
- `metric_registry`: **58 medidas** reales (no 75/100). `cube_olap` slicea **city·alcaldia·colonia·development con dato real**; **unit/prototipo es falso** (devuelve el rollup de ciudad).
- "4 escalas por métrica": **NO materializadas** — `metric_grid` cubre solo ~15 colonias; `grid/cell` da n=0 en alcaldía/corredor. Solo `/zonas` sirve 4 escalas on-the-fly.
- **Cubo direccionable poblado/visible: ~30-40%.** La capa colonia es rica; "4 escalas" y "unit-tier" son aspiracionales.

---

## Lo que ARREGLÉ / PRENDÍ en esta auditoría (en scope, seguro, sin inventar dato)
1. **Visibilidad** — el **Gemelo de Demanda** (SimCity de la demanda, ya construido) estaba fuera del menú → agregado a nav superadmin.
2. **Granularidad nano↔macro** — la **celda atómica ahora es tier-aware**: `_oferta`/`_scores` siguen el nivel geo
   (colonia→alcaldía→ciudad→desarrollo) vía `query_slice(tier)`. El drill del átomo devuelve dato real distinto por
   escala (verificado: Polanco $135k → Miguel Hidalgo $123k → CDMX $96k/m²). Cierra el "navegable de lo nano a lo macro".
3. **Los 3 scores stub → PRENDIDOS desde dato externo REAL (cero inventado):**
   - **N07 Seguridad hídrica** — nuevo `sacmex_water_ingest.py`: SACMEX CKAN (resource `a8069e94`, **313,756 reportes
     reales** de agua) agregado por colonia → `sacmex_zone_colonia`. Receta lee incidentes reales (`needs_water`).
     **1,051 colonias** (992 alineadas con el universo N0x). Agricola Oriental 8003 inc → 0.05 (peor agua).
   - **N04 Trayectoria del delito** — nuevo `fgj_trajectory_ingest.py`: FGJ CKAN (resource `48fcb848`, **2,098,743
     carpetas**) agregado por colonia × año (2022-2024) → tendencia real → `fgj_trajectory_zone`. Receta lee el ratio
     (`needs_crime_trajectory`). **1,034 colonias.** Texmic 9→2 = 99.9 (mejorando); Juventud Unida 5→14 = 0.05 (empeorando).
   - **N05 Resiliencia de infraestructura** — receta lee el riesgo natural REAL de Atlas CDMX (`risk_scores_zone`,
     sismo/inundación/hundimiento, `needs_natural_risk`). **5 colonias** (lo que el Atlas tiene hoy); auto-expande
     cuando corra el join espacial Atlas×polígonos city-wide.
   Patrón común: nuevo flag `needs_*` + `_build_*_context` en `score_engine.py` (mismo que `needs_denue` de N01/N08).
   HONESTO: real donde hay reporte, stub honesto donde no.

## Lo que FALTA y cómo prenderlo (data/feeder, no código)
| Gap | Qué necesita | Fuente verificada (Doc 5) |
|---|---|---|
| ~~N04 crimen-trayectoria~~ | ✅ **PRENDIDO** (1,034 colonias, FGJ 2.1M × año) | resource_id `48fcb848` |
| ~~N05 infra resiliencia~~ | ✅ **receta PRENDIDA** (5 colonias hoy); falta correr join espacial Atlas×polígonos city-wide | ArcGIS `serviciosatlas.sgirpc.cdmx.gob.mx` |
| ~~N07 seguridad de agua~~ | ✅ **PRENDIDO** (1,051 colonias, SACMEX 313k) | resource_id `a8069e94` |
| 12 compuestas null | Dependen de forecast histórico / reseñas / brokers (otra data) — no de N04/05/07 | distinto origen |
| Feeders re-ejecutables | `sacmex_water_ingest` / `fgj_trajectory_ingest` corren on-demand; falta agendarlos en el cron IE | — |
| Cubo unit-tier | `query_slice(unit/prototipo)` debe respetar `tier_id` (hoy hace fallback a ciudad) | bug, no dato |
| Grid 4 escalas materializado | Materializar `metric_grid` en alcaldía/ciudad (la celda ya lo cubre vivo) | optimización |

> **Honestidad (regla del founder):** los scores stub son el comportamiento CORRECTO mientras no haya fuente —
> no se inventa dato. El código está completo; el feeder lo prende. Construir los 3 connectors FGJ/SACMEX/Atlas es
> la siguiente tanda de "prender feeders", con riesgo de correctitud que merece su propio foco (no improvisar).
