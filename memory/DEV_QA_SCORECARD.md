# Scorecard QA del Portal Dev — Ola 1: Áreas del Usuario
**2026-06-08 · 5 auditores en paralelo (verificado contra código actual).**

## Resumen (semáforo por área)

| Área | Veredicto | En una línea |
|---|---|---|
| A · Lenguaje | 🟡 Ámbar | El grueso ya está en español claro, pero quedan "/100" de salud, una pantalla (Selección de Sitio) llena de jerga, y términos internos ("Superadmin/recompute") asomándose al dev |
| B · Honestidad de datos | 🔴 Rojo | Siguen vivas 3 fabricaciones que llegan a pantalla como real — una en la métrica más visible (ventas por semana) |
| C · Estados de pantalla | 🟡 Ámbar | 4 pantallas clave se quedan en "Cargando…" para siempre o se rompen si la API falla |
| D · Móvil | 🟡 Ámbar | El chasis aguanta (menú colapsa), pero Inventario y 2 ventanas se salen de la pantalla en celular |
| F · Coherencia entre portales | 🟡 Ámbar | La ZONA ya está unificada; el $/m² de un DESARROLLO tiene 3 fórmulas conviviendo (dev y comprador pueden ver cifras distintas) |

---

## B · Honestidad de datos — 🔴 (lo más urgente)
Ojo: Competidores, IE, Demanda y Pricing SÍ quedaron limpios (confirmado). Pero el QA destapó 3 que se nos pasaron:
1. 🔴 **Ventas por semana fabricadas** (`dev_batch10.py:46-90` `_generate_weekly_sales`): inventa la curva de las últimas 8 semanas. Contamina **Inicio, Mis Proyectos, Ficha y Cockpit** ("+N esta semana", ritmo, meses para agotar, flecha de tendencia). → mostrar el reparto real o "Sin historial semanal aún".
2. 🔴 **Historial de precio de la unidad fabricado** (`dev_batch11.py:506-532`): inventa 6 cambios de precio con fechas/autor; marca `synthetic:true` pero el front lo ignora (`UnitDrawerContent.js:166`). → respetar el flag y mostrar "Sin historial aún".
3. 🔴 **Engagement por unidad fabricado** (`dev_batch11.py:921-967`): vistas/clicks/funnel con `hash(unit_id)`. Etiquetado "ESTIMADO" pero son aleatorios. → "Sin datos de engagement aún".
- 🟡 Menores: sparkline de pipeline 90d con random (etiquetado demo) · GeoJSON con offset ±50m fabricado.

## A · Lenguaje — 🟡
- 🔴 `IeUnitScoreCard.js:156` expone "recompute / Superadmin / scores" al dev → "Estos datos se generan automáticamente; aún no están listos".
- 🔴 "/100" de salud crudos: `ProyectoDetail.js:115,528` · `MisProyectos.js:206` · `InsightsIntel.js:85` · `InsightsComparables.js:167` · `RiskScoreBreakdown.js:81` · `ZoneScoreBreakdown.js:140` · `BattleCardScoreGauge.js:73` → nivel en palabra, sin "/100".
- 🔴 Pantalla **Selección de Sitio** (`DesarrolladorSiteSelection.js` + `SiteSelectionWizard.js` + `CompareTab.js`): "feasibility / narrative / Claude Haiku / SUB-SCORES / Wizard / AI" → traducir todo.
- 🟡 Eyebrows en inglés en Reportes/Demanda (FORECAST/HEATMAP/COHORT/TOP QUERIES) · nombre del modelo "Claude Haiku/Sonnet" visible → "IA".

## C · Estados de pantalla — 🟡 (raíz: `try/finally` sin `catch`)
- 🔴 **Ficha del proyecto** (`ProyectoDetail.js:356`): slug inválido/API caída → pantalla rota, sin "proyecto no encontrado".
- 🔴 **Inicio/Dashboard** (`DesarrolladorDashboard.js:359`): error → "Cargando…" eterno.
- 🔴 **Inventario** (`DesarrolladorInventario.js:67`): sin catch + falta estado vacío.
- 🔴 **Competidores** (`DesarrolladorCompetidores.js:27`): error → "Cargando…" eterno.
- 🟡 Mis Proyectos / Pricing / Reportes-Forecast: el error se disfraza de "no hay datos".
- Patrón bueno a copiar: `DesarrolladorReportes.js:182` (ExecutiveTab) y `DesarrolladorDemanda.js:66`.

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
