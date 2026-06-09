# Scorecard QA del Portal Dev — Ola 1: Áreas del Usuario
**2026-06-08 · 5 auditores en paralelo (verificado contra código actual).**
**2026-06-09 · LAS 5 ÁREAS RESUELTAS (B·C·A·D·F ✅). Ola 1 cerrada.**

---

## OLA 2 · QA Técnico (2026-06-09 · 5 auditores: seguridad/robustez/atomicidad/rutas/4-portales)

| Frente | Veredicto | Arreglado |
|---|---|---|
| Seguridad (IDOR/auth/mass-assign/injection) | ✅ | 3 fugas cross-tenant cerradas con `assert_dev_project`: dev_batch6 engagement-units+timeline (fuga de PII de leads ajenos) · dev_batch2 IE breakdown/improve/colonia-benchmark (inteligencia competitiva) · dev_batch5 patch_distribution (pausaba la distribución de otra dev → +filtro `dev_org_id`). NoSQL/mass-assign: ya limpios. |
| Arranque resiliente | ✅ | server.py: el bloque de índices del dev iba SIN red → un conflicto de índice tumbaba todo el server. Ahora cada índice en su try/except (loggea y continúa). |
| Atomicidad | ✅ | `vender_captacion` con CAS (`vendida:{$ne:true}` + modified_count) → ya no registra cierres dobles que ensuciaban el AVM. (operaciones/status ya tenía CAS.) |
| Cross-portal · cierra ciclo | ✅ | (1) Asesor cierra venta de unidad → marca la unidad VENDIDA (units_history `sale_closed`) → sube al ritmo del dev (weekly_sales) + ficha pública + cubo. (2) Ediciones manuales del dev (developer_unit_overrides) → ahora se fusionan en lo que ve el COMPRADOR. Verificado E2E. |
| Robustez (500s/except:pass) | ✅ | dev_batch3 export geo: `float()` con try/except (era 500) · 2 `except: pass` que ocultaban fallos (audit de unit-status + insert de cierre) → `log.warning` · resale_data ahora tiene logger. |
| Rutas/contrato/crons | ✅ verde | 0 endpoints huérfanos · contrato front↔back sano · crons protegidos. (El único 🔴 era el arranque, ya resuelto.) |

**Cola menor — estado (2026-06-09):**
- ✅ CAS en patch_unit_status (filtro por estado actual + 409) + **índice único** en developer_unit_overrides.unit_id (evita filas duplicadas en carrera). Verificado: A gana / B pierde.
- ✅ Rate-limit en el reporte Sonnet (~1/min por usuario · el param `month` ya no fuerza repetir la IA).
- ✅ Pydantic en `ack_alert` (validación + max_length).
- ✅ **Cross-Portal v2 — LOS 3 CERRADOS (2026-06-09 · front+back, verificado E2E):**
  - ✅ #15 asesor ve el dato FRESCO del dev: nuevos helpers batch `get_effective_devs_map/list` (auto_sync_engine, una query $in) · swap en 7 sitios de advisor.py (galería·búsquedas·ficha lead·tablero·AVM·argumentario·RAG) + 2 de mini_market. El pitch IA y los matches citan precio/amenidades reales. (playbook se queda en seed: solo lee org_id inmutable.)
  - ✅ #16 fotos dev→comprador CON CANDADO: allow-list `PUBLIC_ASSET_TYPES` (solo marketing) + candado server-side en GET /developments/{id}/assets (planos técnicos NUNCA salen, aunque el front los pida) · `public_photos_for_dev` con caption IA como alt-text · ficha + listado muestran la foto real del dev.
  - ✅ #17 amenidades + foto en LISTADOS sin frenar: `_enrich_listing` (3 queries batch: overlays→precio fresco · project_amenities · `public_hero_map`) · la tarjeta usa hero del batch (quité el fetch por-tarjeta = fin de N llamadas) + chip "N amenidades · servicios".

**Baseline:** red-team de aislamiento 16/16 (sigue verde tras Cross-Portal v2).

## Resumen (semáforo por área)

| Área | Veredicto | En una línea |
|---|---|---|
| A · Lenguaje | ✅ RESUELTO (2026-06-09) | "/100" → palabra (helper `scoreWord` reusable) · Selección de Sitio traducida · leak "Superadmin/recompute" tapado · eyebrows y nombres de modelo en español |
| B · Honestidad de datos | ✅ RESUELTO (2026-06-09) | Las 3 fabricaciones quitadas y conectadas a su dato real (ver abajo) |
| C · Estados de pantalla | ✅ RESUELTO (2026-06-09) | Las 4 pantallas 🔴 ahora muestran error claro + "Reintentar" (reusa `ErrorState`, reporta a observabilidad). Quedan 2 🟡 menores (error disfrazado de vacío) |
| D · Móvil | ✅ RESUELTO (2026-06-09) | Toda tabla con scroll horizontal + minWidth · modales/drawers con `min(Npx,100vw)` · grids fijos → auto-fit. Patrón estandarizado |
| F · Coherencia entre portales | ✅ RESUELTO (2026-06-09) | Helper canónico único (`dev_price_m2`/`units_price_m2` + `SOLD_STATUSES`) usado por dev, comprador y superadmin → mismo $/m² y misma absorción del mismo proyecto en todos lados. Verificado: cuadran |

---

## B · Honestidad de datos — ✅ RESUELTO (2026-06-09 · front+back, dato real + estado vacío honesto, cierra ciclo)
Competidores, IE, Demanda y Pricing ya estaban limpios. El QA destapó 3 más, ahora arregladas:
1. ✅ **Ventas por semana** (`dev_batch10`): se quitó el generador `_generate_weekly_sales`. Ahora `_real_weekly_sales_map` cuenta las ventas REALES de `units_history` (cada unidad que pasa a "vendido" queda con fecha) en las últimas 8 semanas. Vacío honesto si no hay ventas. **Cierra ciclo**: marcar una unidad vendida en el portal alimenta la curva. Front: FichaHome muestra "Sin ventas registradas aún", MisProyectos oculta el sparkline, Cockpit muestra ceros reales. Verificado E2E (siembra→curva→limpio).
2. ✅ **Historial de precio de unidad** (`dev_batch11`): se eliminó el bloque que inventaba 6 cambios. Devuelve solo cambios REALES + `sin_historial` flag. Front (`UnitDrawerContent`) muestra "Sin cambios de precio registrados aún". **Cierra ciclo**: editar el precio en el portal queda en units_history y aparece.
3. ✅ **Engagement por unidad** (`dev_batch11`): se quitó el stub con `hash(unit_id)`. Usa `unit_engagement` real; si no hay → ceros + `sin_datos` flag (ya no "ESTIMADO" con números aleatorios). Front muestra "Aún no hay visitas ni interacciones registradas". Se autollena con el pipeline de eventos.
- 🟡 Pendientes menores (cola): sparkline de pipeline 90d con random (etiquetado demo) · GeoJSON con offset ±50m fabricado.

## A · Lenguaje — ✅ RESUELTO (2026-06-09 · helper reusable, no parche por spot)
- ✅ Helper único `frontend/src/lib/scoreWord.js` (`scoreWord`/`riskWord`/`bandWord`/`tierLabel`) → fuente única, evita que el "/100" reaparezca.
- ✅ Todos los "/100" de salud → palabra ("Va muy bien"…): `ProyectoDetail` (x2) · `MisProyectos` · `InsightsIntel` · `InsightsComparables` · `RiskScoreBreakdown` (riesgo) · `ZoneScoreBreakdown` (banda) · `BattleCardScoreGauge` (gauge sin "/100").
- ✅ Leak `IeUnitScoreCard`: "recompute/Superadmin/scores" → "Esta calificación se genera automáticamente; aún no está lista".
- ✅ **Selección de Sitio** (`DesarrolladorSiteSelection` + `SiteSelectionWizard` + `CompareTab` + mapas): feasibility→viabilidad (en banda) · narrative→análisis escrito por IA · Claude Haiku/Sonnet→IA · SUB-SCORES→detalle por factor · Wizard→Asistente · Demand Heatmap→Mapa de Demanda.
- ✅ Eyebrows Reportes/Demanda (FORECAST/HEATMAP/COHORT/TOP QUERIES → Pronóstico/Mapa de calor/Grupos/Búsquedas) · `tier` crudo → palabra (Premium/Medio/Económico).

## C · Estados de pantalla — ✅ RESUELTO (2026-06-09 · patrón reusable, no parche por pantalla)
Se reusó el componente compartido `ErrorState` (con botón "Reintentar") + `captureEvent` a
observabilidad. Cierra ciclo: error → mensaje claro → Reintentar → recupera; y queda registrado
para el superadmin. Las 4 🔴:
- ✅ **Ficha del proyecto** (`ProyectoDetail`): distingue 404 ("Proyecto no encontrado · no existe o
  no es de tu cuenta") de fallo de carga (con Reintentar). Antes: pantalla rota con el slug crudo.
- ✅ **Inicio/Dashboard**: error → mensaje + Reintentar (antes "Cargando…" eterno).
- ✅ **Inventario**: se agregó el `catch` faltante + Reintentar + **estado VACÍO honesto** ("Aún no
  tienes inventario…").
- ✅ **Competidores**: error → mensaje + Reintentar (antes "Cargando…" eterno).
- 🟡 Cola (menor, error disfrazado de "no hay datos", no rompe): `MisProyectos` · `DesarrolladorPricing` · `Reportes-Forecast`.

## D · Móvil — 🟡
- 🔴 **Inventario**: tabla de 9 columnas sin scroll (`:181`) + modal "Apartar" se sale (`:298`).
- 🔴 **Métricas Equipo**: drawer de 480px se sale (`TeamAggregatedTable.js:304`).
- 🟡 Mis Proyectos (lista), MetricasEquipo (tabla), ProductivityWidget, CrmFunnel, BattleCard, CitasPolicies, AutoAssignments: tablas/grids sin colapsar.
- Regla a estandarizar: toda `<table>` en `<div overflowX:auto>` + todo modal/drawer en px lleva `maxWidth`.

## F · Coherencia entre portales — 🟡
- ✅ Unificado: valor de zona (`colonia_valuation`), plusvalía SHF por alcaldía, valor del suelo, DRPI, demanda.
- 🔴 **$/m² de un desarrollo**: 3 fórmulas conviviendo — promedio por unidad (dev) vs cubo (comprador/superadmin) vs precio-de-entrada (`price_from/m2[0]`). Mismo proyecto, números distintos. → un solo helper `dev_price_m2()` canónico.
- 🟡 **Absorción**: el dev cuenta solo `vendido`; el cubo cuenta `vendido/cerrado/closed/sold`. Hoy coincide con seed; divergirá con datos reales. → mismo normalizador de estatus.

---

## Orden de arreglo propuesto (por impacto)
1. 🔴 **B — quitar las 3 fabricaciones** (ventas/semana, historial de precio, engagement) → es lo que rompe la confianza.
2. 🔴 **C — manejo de error** en Ficha, Inicio, Inventario, Competidores (que no se queden en "Cargando…" ni se rompan).
3. 🔴 **A — los "/100" + "Selección de Sitio" + el leak de "Superadmin/recompute"**.
4. 🔴 **D — Inventario móvil + los 2 modales que se salen**.
5. 🔴/🟡 **F — helper único de $/m² + normalizar absorción** (antes de que entren datos reales con otros estatus).
Luego la cola 🟡 de cada área en una sola tanda.
