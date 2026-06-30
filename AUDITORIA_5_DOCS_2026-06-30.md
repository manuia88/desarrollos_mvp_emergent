# AUDITORÍA FINAL — los 5 documentos fundacionales (2026-06-30)

> Verificación honesta (4 agentes en paralelo, contra el repo + la base de datos REAL, no a fe de los docs)
> de que lo de los 5 documentos esté **construido · conectado · visible · funcionando**, front y back.
> Regla: confrontar, no validar por agradar. Donde el doc infla, se dice.

## Veredicto en una línea
**El CÓDIGO está ~100% construido y cableado. La DATA (feeders) está ~85-90% prendida. El cubo de "4 escalas
por métrica" es donde los docs inflan (la realidad es colonia-céntrica, pero la celda ya navega nano↔macro).**
No es un 100% literal — y eso es consistente con la doctrina del founder: *construir completo con stubs honestos;
el feeder lo prende después.*

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

## Lo que ARREGLÉ en esta auditoría (en scope, seguro)
1. **Visibilidad** — el **Gemelo de Demanda** (SimCity de la demanda, ya construido) estaba fuera del menú → agregado a nav superadmin.
2. **Granularidad nano↔macro** — la **celda atómica ahora es tier-aware**: `_oferta`/`_scores` siguen el nivel geo
   (colonia→alcaldía→ciudad→desarrollo) vía `query_slice(tier)`. El drill del átomo devuelve dato real distinto por
   escala (verificado: Polanco $135k → Miguel Hidalgo $123k → CDMX $96k/m²). Cierra el "navegable de lo nano a lo macro".

## Lo que FALTA y cómo prenderlo (data/feeder, no código)
| Gap | Qué necesita | Fuente verificada (Doc 5) |
|---|---|---|
| N04 crimen-trayectoria | Connector FGJ que guarde serie temporal (fecha/mes/año) | resource_id `48fcb848` |
| N05 infra resiliencia | Connector Atlas SGIRPC → obs reales por colonia | ArcGIS `serviciosatlas.sgirpc.cdmx.gob.mx` |
| N07 seguridad de agua | Connector SACMEX cortes → obs reales | resource_id `a8069e94` |
| 12 compuestas null | Se prenden con N04/N05/N07 + forecast histórico + reviews/brokers | mismo origen |
| Cubo unit-tier | `query_slice(unit/prototipo)` debe respetar `tier_id` (hoy hace fallback a ciudad) | bug, no dato |
| Grid 4 escalas materializado | Materializar `metric_grid` en alcaldía/ciudad (la celda ya lo cubre vivo) | optimización |

> **Honestidad (regla del founder):** los scores stub son el comportamiento CORRECTO mientras no haya fuente —
> no se inventa dato. El código está completo; el feeder lo prende. Construir los 3 connectors FGJ/SACMEX/Atlas es
> la siguiente tanda de "prender feeders", con riesgo de correctitud que merece su propio foco (no improvisar).
