# Spec canónico — Motor de Historial de Precios y Plusvalía (Appreciation Engine) · 2026-06-05

Origen: founder pidió "ruta de guardado de snapshots de la data para generar historial que alimente
los datos · lista de precios anterior + historial de crecimiento por prototipo/tamaño/características/
unidad/desarrollo/microzona/macrozona · gráfica de crecimiento visible para dev, asesor y superadmin
(global) · captura granularidad total a nivel superadmin, pero a dev/asesor/marketplace mostrar el
incremento desde el lanzamiento". Upgrade y alcance abajo.

## POR QUÉ ES EL PROYECTO MÁS VALIOSO (tesis)
Hoy DRPI, forecast y AVM están VACÍOS/heurísticos (las tarjetas "apreciación proyectada" y "referencia
de zona" que shippeé en Ubicación/Insights están en STUB honesto). La razón: **no capturamos el historial
de precios**. Este motor convierte CADA cambio de precio en dato propietario que:
- entrena DRPI (índice real de zona) → enciende "referencia de zona" en Ubicación/Insights.
- entrena forecast → enciende "apreciación proyectada" 12/24m.
- alimenta comparables y AVM → mejora "valor justo".
- da un argumento de venta comprobable a asesor/marketplace ("plusvalía +X% desde lanzamiento").
Es el primer ladrillo concreto del "Modelo del Mundo DMX" (ver DMX_NORTH_STAR_AI). Flywheel: más
ediciones de precio → mejor índice → mejores predicciones → más confianza → más uso.

## PRINCIPIO DE GOBERNANZA (clave del founder)
**Capturamos SIEMPRE a granularidad máxima (unidad, cada modificación). Exponemos por rol:**
- **Superadmin** → TODO: cada evento, cada unidad, cada dev, índice global, ranking cross-dev, drill-down. Terminal Bloomberg.
- **Dev** → SUS desarrollos: curva por unidad/prototipo/desarrollo desde lanzamiento + vs su colonia/alcaldía. Ve su lista anterior vs actual (diff).
- **Asesor** → desarrollos que vende: "% desde lanzamiento" + proyección (argumento de venta). NO ve la bitácora interna de ajustes/descuentos.
- **Marketplace/cliente** → solo "incremento desde lanzamiento" + proyección por unidad/desarrollo (badge de confianza). NUNCA el log granular (revela estrategia de pricing).

## GRANULARIDADES (las 7 que pidió + 1)
unidad · prototipo · característica (ej. con roof garden) · tamaño (rango m²) · desarrollo · microzona (colonia) · macrozona (alcaldía/región) · [global, solo superadmin].

---

## ARQUITECTURA DE DATOS

### 1. `price_events` — log inmutable a nivel unidad (la verdad)
Cada cambio de precio = 1 evento append-only. Snapshot de atributos de la unidad AL MOMENTO (para análisis por característica histórico).
```
{ event_id, dev_id, dev_org_id, unit_id,
  prototype, m2_privative, m2_total, bedrooms, bathrooms, level, orientation,
  amenities_snapshot: [...], colonia_id, alcaldia,
  old_price, new_price, price_per_m2, delta_abs, delta_pct,
  changed_at, changed_by, source,   # inventory_edit | bulk_upload | api | cron_baseline | launch
  label,                            # "Lanzamiento" | "Ajuste de lista" | "Preventa fase 2" | …
  is_launch: bool }
```
Ya existe el embrión: `units_history` (writer `record_unit_change`, hoy VACÍO) y `price_history` con etiquetas en el seed (no fechado). Estrategia: reusar/renombrar `units_history` para precio o colección dedicada `price_events`; backfill del seed `price_history` como baseline de lanzamiento (fecha = stage start estimado).

### 2. `price_list_snapshots` — foto periódica de la lista completa por desarrollo
Cron diario/semanal guarda el estado de TODA la lista (aunque no haya ediciones) → serie continua + "lista de precios anterior".
```
{ dev_id, snapshot_at, period: 'YYYY-MM-DD',
  units: [{unit_id, prototype, price, price_per_m2, status}],
  agg: {median_pm2, avg_pm2, min, max, by_status} }
```
Habilita el diff "lista anterior vs actual" y la curva aunque el dev no edite seguido.

### 3. `appreciation_index` — rollup materializado por granularidad × periodo
Pre-computado (cron) para UI instantánea.
```
{ entity_type: unit|prototype|characteristic|size_band|development|colonia|alcaldia|global,
  entity_id, dev_id?, period: 'YYYY-MM',
  median_pm2, value_index,            # base 100 en lanzamiento
  launch_period, launch_pm2,
  delta_since_launch_pct, delta_period_pct, annualized_pct,
  sample_size, confidence }
```
Microzona/macrozona = exactamente el DRPI/rollup (se unifican: este motor ALIMENTA drpi_snapshots).

---

## CAPTURA (cómo se crea la data, sin fricción)
1. **Wire en cada mutación de precio**: inventory editor (`patchUnitFields`/`unit-fields-bulk`), bulk upload commit, API. Cada uno llama `record_price_event(...)` fail-open. (El dev NO hace nada extra; se captura solo al editar.)
2. **Baseline de lanzamiento**: al crear proyecto / primer import → evento `is_launch=true` con la lista inicial. Backfill de proyectos existentes desde `price_history` del seed.
3. **Cron snapshot** (`snapshot_price_lists`, diario): foto de cada lista → continuidad temporal.
4. **Cron rollup** (`rebuild_appreciation_index`, diario/post-evento con debounce): recomputa índices por granularidad; publica a `drpi_snapshots` (microzona) para encender los stubs.
5. **Idempotencia + auditoría**: cada evento con `changed_by`+`source`; superadmin ve la bitácora completa.

---

## API (por rol)
- interno: `record_price_event(db, unit, old, new, source, user, label)` · crons `snapshot_price_lists`, `rebuild_appreciation_index`.
- dev: `GET /api/dev/projects/{id}/appreciation?granularity=&entity_id=&from=&to=` → serie + KPIs + benchmark colonia/alcaldía.
- dev: `GET /api/dev/projects/{id}/price-list/history` → snapshots + diff lista anterior↔actual por unidad.
- asesor: `GET /api/asesor/units/{id}/appreciation` → since-launch + proyección (sin bitácora).
- marketplace: `GET /api/public/developments/{id}/appreciation` → since-launch + proyección (badge).
- superadmin: `GET /api/superadmin/appreciation/global?granularity=` → todos los devs, ranking, heatmap colonias, drill a unidad, export.

---

## UI / UX (que quede espectacular)

### Dev — nueva pestaña/sección "Plusvalía" (o dentro de Ventas/Insights)
- **Curva de plusvalía** interactiva (línea/área): X=tiempo, Y=precio/m² o índice base 100. Toggle de granularidad (unidad ▸ prototipo ▸ desarrollo ▸ colonia ▸ alcaldía). Overlays comparativos (tu desarrollo vs tu colonia vs alcaldía) con banda de confianza sombreada.
- **Pines de hito** sobre la curva: lanzamiento, fases de preventa, ajustes de lista, entrega.
- **KPI headline**: "+X% desde el lanzamiento (hace N meses) · +Y%/año · vas Z pts arriba/abajo de tu colonia".
- **Lista anterior vs actual**: tabla diff por unidad (precio viejo → nuevo, Δ%, fecha) — "modificaciones a tu lista".
- **Por característica**: "tus unidades con roof garden subieron +A% vs +B% sin él" (conecta hedónico).

### Asesor — argumento de venta
- Badge "Plusvalía comprobada: +X% desde 2024" + mini-sparkline en la ficha de la unidad/lead. Proyección "a este ritmo, +Y% a 12m".

### Marketplace/cliente
- Badge de confianza en la tarjeta/landing: "Este desarrollo se ha apreciado +X% desde su lanzamiento" + sparkline + "valor proyectado". Sin números internos.

### Superadmin — terminal global
- Heatmap de colonias por apreciación (mapa) + leaderboard de devs (mayor/menor plusvalía) + drill-down hasta unidad + export CSV/PDF Fitch-style. La bitácora completa de cada cambio.

---

## FASES (orden de construcción)
- **F0 · Captura** (cimiento): `price_events` + `record_price_event` cableado en inventory editor/bulk/API + baseline de lanzamiento + backfill seed. Sin esto no hay nada.
- **F1 · Snapshots**: cron `snapshot_price_lists` (continuidad) + endpoint dev "lista anterior vs actual" (diff). Primer valor visible rápido.
- **F2 · Rollup**: `appreciation_index` por las 7 granularidades + publicar microzona a `drpi_snapshots` (enciende stubs de Ubicación/Insights).
- **F3 · UI Dev**: curva de plusvalía + KPI desde-lanzamiento + diff de lista (cockpit práctico, mismo molde cockpitUI).
- **F4 · Asesor + Marketplace**: badge since-launch + proyección.
- **F5 · Superadmin**: terminal global (heatmap + ranking + drill + export).
- **F6 · Modelos**: reentrenar DRPI/forecast/AVM con eventos reales (cierra el flywheel; enciende "apreciación proyectada" y "valor justo" reales).

## DEPENDENCIAS / LO QUE YA EXISTE
- `units_history` + `record_unit_change` (embrión del log, vacío). · `drpi_engine`/`drpi_snapshots` (microzona, espera transacciones — este motor se las da). · `forecast_engine`/`zone_forecasts` (vacío, F6 lo llena). · `dmx_hedonic_atom` (por característica). · seed `price_history` (etiquetas para backfill). · cockpit stubs ya shippeados (Ubicación "referencia de zona"/Insights "apreciación") que esto enciende.

## RIESGOS / DECISIONES ABIERTAS
- ¿Pestaña "Plusvalía" propia vs dentro de Ventas/Insights? (recomiendo sección en Insights + badge en Ventas).
- Backfill: sin fechas reales de lanzamiento, usar stage/seed como aproximación honesta (marcar "estimado" hasta acumular eventos reales).
- Cadencia de snapshot (diaria vs semanal) según volumen de devs.
- Exposición marketplace: confirmar con legal que mostrar "% desde lanzamiento" no compromete (es dato agregado, no precios individuales históricos).
