# Scorecard QA del Portal Dev — Ola 1: Áreas del Usuario
**2026-06-08 · 5 auditores en paralelo (verificado contra código actual).**

## Resumen (semáforo por área)

| Área | Veredicto | En una línea |
|---|---|---|
| A · Lenguaje | ✅ RESUELTO (2026-06-09) | "/100" → palabra (helper `scoreWord` reusable) · Selección de Sitio traducida · leak "Superadmin/recompute" tapado · eyebrows y nombres de modelo en español |
| B · Honestidad de datos | ✅ RESUELTO (2026-06-09) | Las 3 fabricaciones quitadas y conectadas a su dato real (ver abajo) |
| C · Estados de pantalla | ✅ RESUELTO (2026-06-09) | Las 4 pantallas 🔴 ahora muestran error claro + "Reintentar" (reusa `ErrorState`, reporta a observabilidad). Quedan 2 🟡 menores (error disfrazado de vacío) |
| D · Móvil | 🟡 Ámbar | El chasis aguanta (menú colapsa), pero Inventario y 2 ventanas se salen de la pantalla en celular |
| F · Coherencia entre portales | 🟡 Ámbar | La ZONA ya está unificada; el $/m² de un DESARROLLO tiene 3 fórmulas conviviendo (dev y comprador pueden ver cifras distintas) |

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
