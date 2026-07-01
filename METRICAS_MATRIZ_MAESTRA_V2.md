# Matriz Maestra de Métricas × Dimensiones — DMX · V2 (DEFINITIVA)

> **Sucesor de** `METRICAS_GRANULARES_MATRIZ.md` (V1, 6 métricas × 8 niveles). Esta V2 contabiliza el arsenal **completo**: ~48 métricas en 8 grupos, ~180 dimensiones en 10 ejes, y la matriz cruzada con la máxima granularidad real por celda.
> **Fecha:** 2026-07-01 · verificado contra repo real (`backend/*_engine.py`, `dimension_registry.py`, `metric_registry.py`, `composite_metrics.py`, `cube_olap_engine.py`, `metrics_cube_aggregations.py`, `grid_engine.py`, `inversion_v4_finance.py`) + Mongo VIVO (456 colecciones, `db=desarrollosmx`).
>
> **Regla de oro:** distinguir **CABLEAR** (dato existe, falta exponer/agregar) de **CONSTRUIR** (falta motor) de **ESPERA-DATO / flywheel** (motor listo, dato no existe: se llena con el ciclo del asesor). Y ser honesto: **motor construido ≠ cubo poblado.**
>
> **Leyenda de celda:** ✅ **EXISTE** (dato real poblado) · 🟡 **PARCIAL** (motor listo, dato pobre / derivado / proxy / sub-caso) · 🟢 **DERIVABLE** (dato ya existe, falta wrapper/cruce — no hay motor nuevo) · ❌ **FALTA** (ni dato ni materialización; casi siempre = cierres reales, renta observada, o timestamps de listado).
>
> **Confrontación de raíz (verificada en Mongo):** la espina de **CIERRES está VACÍA** (`transactions`=1, `dmx_units.precio_cierre`=0/992, `listed_at`/`fecha_venta`=null, `units_history`=0, `drpi_snapshots`=1, `price_index_snapshots` median=0, `hedonic_models` 393 todos `available:False`, `zone_forecasts`=0). **Todo lo hedónico/precio-en-el-tiempo corre EN SECO sobre precio de LISTA.** El moat NO es código faltante — los ~120 motores existen. El moat es **poblar CIERRE + RENTA OBSERVADA + timestamps de listado**, y prender los feeders SEDUVI/GTFS. Eso llega por el flywheel del asesor (`routes/advisor.py` ya ingesta cada cierre a `db.transactions`; el hook de cierre ya re-entrena el ranking del comprador — commit `4499f79d`).

---

## Resumen ejecutivo de conteos

- **Métricas totales: ~48** en 8 grupos (Valor · Retorno · Riesgo · Liquidez · Demanda · Oferta · Contexto/Calidad · Desarrollo/Pipeline). De las 6 base subimos a 48 al contabilizar 3 capas institucionales que ya viven pobladas: **Sistema IE** (70 códigos, ~15,372 scores), **`composite_metrics.py`** (120 compuestas en 12 packs) e **`inversion_v4_finance.py`** (suite deal-level: DSCR, debt yield, TWR/NCREIF, break-even, equity multiple).
- **Dimensiones totales: ~180** en 10 ejes (`dimension_registry.py`: DÓNDE · QUÉ · QUIÉN · CUÁNDO · PRECIO · OFERENTE · RIESGO · SEÑALES · DATO · EXPERIENCIA). No hay que inventar el universo — hay que **poblarlo**. `metric_grid` (6,168 celdas) ya materializa 7 ejes simultáneos.

---

# (1) UNIVERSO DE MÉTRICAS (filas)

Cada métrica: estado + dónde vive (motor · colección · endpoint). Agrupadas por familia institucional.

## 1.1 VALOR

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| V1 | **$/m² de mercado (precio de lista)** | ✅ | `dmx_units` (992) · `colonia_valoracion` (1,811, 3 capas: mercado/mini-AVM/catastro) · `/api/mapa/colonia/{id}/valoracion` |
| V2 | **AVM (valor automatizado, hedónico)** | 🟡 | `market_estimate_engine.avm_property` + `dmx_hedonic_atom`→`dmx_hedonic_models` (136, r²≈0.95) + `avm_explain_engine`. Corre sobre **lista**, no cierre |
| V3 | **AVM por PREDIO (malla catastral)** | 🟢 | Wrapper batch de `avm_base` sobre `catastro_predios` (1.09M, geo 2dsphere). Motor existe, falta `avm_predio()` |
| V4 | **Valor catastral de suelo (piso)** | ✅ | `catastro_sig_engine` · `catastro_predios` (1,089,684: `valor_suelo`/`valor_unitario_suelo`) → `colonia_catastro_byid` (1,788). NO es mercado |
| V5 | **Precio cerrado real $/m² (CMA de cierre)** | ❌ | `cma_engine` + `market_comps_closings` (1) + `transactions` (1). Motor existe, **cierre vacío** → flywheel asesor |
| V6 | **Costo de reemplazo / construcción $/m²** | ✅ | `construction_cost_engine.predict_cost_per_m2` (Banxico INPC/INEGI INPP) → `construction_costs` (14). Composites #101/#102/#107 |
| V7 | **Índice de precios por tiempo (DRPI base-100)** | 🟡 | `drpi_engine` (envuelve `hedonic_regression_engine`) + `price_index_snapshots` (522, median=0). Schema completo, **SECO** por cierres |

## 1.2 RETORNO

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| R1 | **Rentabilidad deal-level (TIR/MIRR/VPN/DSCR/cap/eq.mult)** | ✅ | `inversion_v4_finance.analyze()` + `inversion_v4_simulations` (11,674, con ts+zone+cap_rate). Deal-level completo |
| R2 | **Cap-rate / yield agregado por zona (KPI del cubo)** | 🟢 | Roll-up: NOI = precio×yield_tier, cap=NOI/precio → nuevos campos en `_finalize()` de `metrics_cube_aggregations.py`. Cubo tiene precio, 0 renta |
| R3 | **Renta observada real ($/m² + STR RevPAR/ADR/ocup)** | 🟡 | `connectors_ie.AirRoiConnector` → `airroi_cache` (STR real, **solo Polanco**). Renta larga NO medida (tabla `RENTAL_YIELDS` por tier) |
| R4 | **Spread vs CETES (prima de riesgo)** | ✅ | `composite_metrics` #24 (cap−cetes) + `market_rates_engine.cetes_364` (Banxico vivo) |
| R5 | **Equity build-up (amortización de capital)** | ✅ | `inversion_v4_finance.amortization()` → `equity_buildup` + tabla anual |
| R6 | **Break-even ocupación / renta de equilibrio** | ✅ | `inversion_v4_finance.analyze()` → `ocupacion_equilibrio_pct` + `renta_equilibrio_mensual` + NOI lease-up/estabilización |
| R7 | **Rendimiento total / TWR desagregado (income+apreciación, NCREIF)** | 🟢 | `inversion_v4_finance.twr_horizontes` (deal) + `shf_series` (apreciación real). Falta AGREGADO por zona = cap-rate del cubo (R2) + Δ-SHF |
| R8 | **Reporte de fondo (TWR/TVPI/DPI/MIRR)** | ✅ | Cableado (`INSTITUTIONAL_METRICS_RESEARCH`) sobre `cash_flow_forecasts` (195). Falta empaquetar agregación cartera |
| R9 | **Serie cap-rate revelado por zona (yield-over-time)** | 🟢 | Agregar `inversion_v4_simulations` (11,674) por mes×zona = serie SIN dato nuevo. Atajo a `yield_snapshots` |
| R10 | **Plusvalía (apreciación histórica y proyectada)** | 🟡 | `shf_series` (510, oficial SHF, real a **alcaldía**) + `IE_COL_PLUSVALIA_HIST/PROYECTADA` + `drpi_engine`. Sub-colonia derivada; DRPI seco |
| R11 | **Plusvalía real vs nominal (descontar inflación)** | 🟢 | Derivar: `shf_engine` (nominal) − `banxico_rates` (INPC). Composite nuevo, sin motor |
| R12 | **Plusvalía ajustada por riesgo (Sharpe inmobiliario)** | ✅ | `composite_metrics` #23 Sharpe · #30 cap-riesgo · #37 frontera eficiente · #38 descuento |
| R13 | **Plusvalía neta (después de costos de propiedad y salida)** | 🟡 | `dimension_registry` EJE EXPERIENCIA (`exp.costo_total_propiedad`) + `inversion_v4_tax` (ISR). Costos recurrentes = capturar del dev |
| R14 | **Plusvalía esperada / forecast (proyección 1-5 años)** | 🟢 | `composite_metrics` #28 (plusvalía×demanda) + `_shf_forecast_by_alcaldia`. Forecast propio (`forecast_engine` ARIMA) seco (`zone_forecasts`=0) |

## 1.3 RIESGO

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| K1 | **PML sísmico / riesgo natural físico** | ✅ | `natural_risk_engine` (0.40 sismic+0.35 flood+0.25 subsidence) + `seismic_zone_colonia` (753) + `natural_risk_layers` · composites #31-33 · `/api/zona/{id}/riesgo` (ASTM E2557/E2026) |
| K2 | **Riesgo delictivo (incidencia + trayectoria)** | ✅ | `crime_fgj_engine` + `crime_zone_colonia` (4,189, `safety_score`) + `fgj_trajectory_zone` (1,034, `trend_ratio`) · `IE_COL_N04_CRIME_TRAJECTORY` |
| K3 | **Riesgo hídrico (desabasto SACMEX)** | ✅ | `sacmex_water_ingest` → `sacmex_zone_colonia` (1,051) · `IE_COL_N07_WATER_SECURITY` |
| K4 | **Riesgo climático / migración (inflow/outflow)** | 🟡 | `climate_migration_engine` → `climate_migration_heatmap` (16, cobertura baja) + composites #17/#35 |
| K5 | **Riesgo de mercado / volatilidad** | 🟡 | composites #23/#37/#38 + `risk_scores_zone` (1,999) + `fsd_engine` (Forecast Std Dev per-property). Volatilidad real limitada por serie seca |
| K6 | **Riesgo de crédito / DSCR / debt yield** | ✅ | `inversion_v4_finance` (`dscr`, `debt_yield_pct`, `prestamo_max_dscr`) + `bancabilidad_engine`. Deal-level |
| K7 | **Riesgo de concentración (broker/dev)** | 🟡 | `IE_PROY_DEVELOPER_CONCENTRATION` + composites #73/#78 + `battle_card_engine`. Sobre inventario cargado |
| K8 | **Riesgo regulatorio / uso de suelo** | 🟡 | `IE_COL_USO_SUELO_*` (DataPending SEDUVI) + `IE_PROY_RISK_LEGAL` + `predio_due_diligence_engine` + composite #40. Requiere prender SEDUVI |
| K9 | **Ghost-zone / riesgo de sobreoferta (vacancy)** | 🟢/✅ | `IE_COL_GHOST_ZONE` (ya computado) + `IE_PROY_COMPETITION_PRESSURE` + `demanda_insatisfecha` (14) + `absorcion_engine`. Aflorar, no construir |
| K10 | **Score de bancabilidad (A–F, proxy DSCR)** | ✅ | `bancabilidad_engine` (cruza prob_venta + `risk_scores_zone`). Fail-open honesto |

## 1.4 LIQUIDEZ

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| L1 | **Días en mercado (Days-on-Market)** | ❌ | `metric_registry` `of.dias_en_mercado` (fórmula lista) + `cube_aggregations.days_on_market_avg` (null) + `metrics_cube_aggregations._dev_days_on_market()`. **Plomería lista, falta capturar `listed_at`/`fecha_venta`** |
| L2 | **Sell-through / % vendido** | 🟡 | `metric_registry` `of.sell_through` + `absorcion_engine` + `dmx_units.status` (992). Status existe, demo hasta ventas reales |
| L3 | **Absorción / meses de inventario** | 🟡 | `absorcion_engine` + `cube_olap` `_c_absorcion` + `facts_daily_zone` (1,479, 28d real). Proyección sintética (`zone_forecasts`=0) |
| L4 | **Recortes de precio / markdown velocity** | 🟢 | `price_events` (18, `old→new`, `delta_pct`, `changed_at`). Agregar `delta_pct<0` por zona = índice **sin cierres**. Proxy #1 de sobreprecio |
| L5 | **Descuento de negociación (ask-vs-close)** | ❌ | `metric_registry` `of.descuento_negociacion` + `transactions.discount_pct` + `price_index_snapshots.median_discount_pct` (0). LATENTE por cierres |
| L6 | **Liquidez de zona / profundidad de mercado** | ✅ | `IE_COL_LIQUIDEZ` + `IE_COL_DEMANDA_NETA` + `IE_PROY_INVENTORY_DEPTH_RELATIVE` + `IE_PROY_DAYS_TO_SELLOUT` (ya computados). Empaquetar composite. `recipes/colonia/ie_col_economia.py IEColLiquidez` DataPending para el brazo de cierre |
| L7 | **Liquidez de salida (meses para agotar)** | 🟡 | composite #29 + `absorcion_engine.curva_absorcion.meses_para_agotar`. Vivo sobre inventario (demo) |

## 1.5 DEMANDA

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| D1 | **Demanda revelada (índice 0-100)** | ✅ | `metric_registry` `x.indice_demanda_revelada` + `demand_intelligence` + `grafo_comprador_engine` · `buyer_signals` (388) + `behavioral_events` (2,101) + `marketplace_searches` (283). **Moat, serie histórica real** |
| D2 | **Demanda insatisfecha / gap oferta-demanda** | 🟡 | `metric_registry` `x.gap_oferta_demanda` + `demanda_insatisfecha` (14) + composites #11/#51/#99. Caveat: feature derivada del dev visto (proxy) |
| D3 | **Presión de demanda (ratio demanda/inventario)** | 🟢 | `marketplace_granularity` + `heatmap_tension.py` + `metric_grid`. Derivable de `buyer_signals`/inventario ya poblados |
| D4 | **Affordability gap (presupuesto vs precios)** | ✅ | `metric_registry` `x.affordability_gap` + composite #1 · `marketplace_searches` (precio_max) + `buyer_signals` (meta.presupuesto/enganche/crédito) |
| D5 | **Elasticidad de precio** | 🟡/✅ | `metric_grid` "Elasticidad" (228 celdas) + `marketplace_granularity.price_elasticity` + composite #10. Cobertura = colonias del grid (15 de 1,811) |
| D6 | **Disposición a pagar (DAP/WTP) por atributo** | 🟡 | `marketplace_granularity.willingness_to_pay` (top-12) + `premium_atributo/piso/vista/orientacion` en registry. Proxy (precio medio visto); hedónico de cierre lo vuelve duro |
| D7 | **Migración / flujos poblacionales** | 🟡 | `climate_migration_engine` → `climate_migration_heatmap` (16). Cobertura parcial |
| D8 | **Sentiment / reputación de zona** | 🟡 | `reputation_monitor_engine` (37 mentions) + `reviews_residents_engine` + `IE_COL_TRUST_VECINDARIO` + composite #66. Dato escaso (se acumula) |

## 1.6 OFERTA

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| O1 | **Inventario activo (disp/vendido/reservado)** | 🟡/✅ | `dmx_units.commercial.status` (992) + `developments.units` + `cube_aggregations`. Real a nivel unidad; falta cortar cubo por calle/manzana |
| O2 | **Densidad (hab/predios/construida)** | ✅ | `catastro_predios` (1.09M, `sup_terreno`/`sup_construccion`) → `colonia_catastro_byid` (1,788) + `denue_zone_density` (businesses_per_km2) + INEGI |
| O3 | **STR / Airbnb yield (ADR/ocup/RevPAR/revenue/listings)** | ✅ | `connectors_ie.AirRoiConnector` → `airroi_cache` → `IE_COL_ROI_AIRBNB/_OCUPACION` + composites Pack 12 (#111-120). AirROI cobra-por-llamada |
| O4 | **Vacancy / ocupación residencial** | 🟢 | `IE_COL_GHOST_ZONE` (proxy INEGI vivienda deshabitada). Vacancy censal derivable de INEGI; vacancy de renta directa NO existe |

## 1.7 CONTEXTO / CALIDAD

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| C1 | **Score de zona compuesto (6 dims: lifestyle/seguridad/transporte/amenidades/precio/vibe)** | ✅ | `zone_score_engine` + `zone_subscores_compute` (25 runs) + `zone_scores` (1,131, tier=colonia, `subscores_real`) |
| C2 | **Walkability / caminabilidad** | ✅ | `IE_COL_N08_WALKABILITY_MX` sobre `osm_engine`/`denue_zone_density` (3,192, by_category) + `zone_subscores_compute` |
| C3 | **Transit-score / conectividad transporte** | 🟡 | `IE_COL_CONECTIVIDAD_TRANSPORTE` (deps=GTFS, **DataPending stub**) + OSM 'transporte' POIs como proxy. Exacto espera GTFS real |
| C4 | **Servicios / densidad comercial (DENUE)** | ✅ | `denue_zone_density` (3,192, by_category + per_km2) + `denue_businesses` (4,749, scian/employees) + `IE_COL_N01_ECOSYSTEM_DIVERSITY` |
| C5 | **Áreas verdes / parques** | ✅ | `IE_COL_CULTURAL_PARQUES` (osm_overpass) sobre `osm_pois` (5,000) + `denue_zone_density` recreación |
| C6 | **Ruido / contaminación acústica** | ❌ | Sin colección ni motor. Proxy débil derivable de densidad de bares/vialidad (`IE_COL_CULTURAL_VIDA_NOCTURNA` + vialidad OSM). Sin fuente abierta |
| C7 | **Employment accessibility (acceso a empleo)** | ✅ | `IE_COL_N02_EMPLOYMENT_ACCESSIBILITY` sobre densidad DENUE/OSM + demografía INEGI |
| C8 | **School premium (prima escolar)** | ✅ | `IE_COL_N06_SCHOOL_PREMIUM` + `IE_COL_EDUCACION/_CALIDAD` (SEP/INEGI) + composite #62 |
| C9 | **Infraestructura / resiliencia** | 🟡 | `IE_COL_N05_INFRASTRUCTURE_RESILIENCE` (Atlas Riesgos) + `IE_COL_CONECTIVIDAD_FIBRA/VIALIDAD` + `IE_COL_AGUA_CONFIABILIDAD`. Fibra DataPending |
| C10 | **ESG / clima (inundación, isla de calor, agua)** | ✅ | `IE_COL_CLIMA_INUNDACION` (Atlas+CONAGUA) + `IE_COL_CLIMA_ISLA_CALOR` + `IE_COL_N07_WATER_SECURITY` + `natural_risk_layers` |
| C11 | **Gentrificación / revalorización temprana** | 🟡 | `zone_cycle_engine.compute_zone_cycle` (bloque `gentrificacion`, D05) + composites #93/#100 + `dmx_indices` IPV. `gentrification_engine` dedicado (Δsuelo×SHF×crime×demanda) **NO construido** |
| C12 | **Momentum / ciclo inmobiliario** | ✅ | `zone_cycle_engine.compute_zone_cycle` (`fase_key`+`momentum_pct`) + composites Pack 10 (#91-100) + `live_pulse_engine` |
| C13 | **Calidad de construcción (defectos/acabados)** | 🟡 | `construction_quality_engine` (progreso 50%+acabados 25%+defectos 25%). Motor existe, señales sin poblar (`construction_quality_signals`=0, fail-open) |

## 1.8 DESARROLLO / PIPELINE

| # | Métrica | Estado | Dónde vive |
|---|---|---|---|
| P1 | **Pipeline / oferta futura (permisos SEDUVI)** | ❌ | `IE_COL_DESARROLLOS_ACTIVOS` (DataPending SEDUVI) + `IE_PROY_RECENCY_LAUNCH` + `metric_registry` `of.ritmo_lanzamientos`. Feeder SEDUVI NO conectado; sin colección de permisos |
| P2 | **Construcción activa / unidades por entregar** | 🟡 | `project_construction_progress` (2) + `developments.stage` + composite #47 (pipeline vs demanda). Estructura lista; dato escaso |
| P3 | **Potencial de desarrollo (FAR/CUS/COS/subutilización)** | 🟢 | DERIVABLE: `catastro_predios.sup_construccion/sup_terreno` = FAR observado por predio (1,067,085 poblados). `norma3_engine` (fusión) + composite #55 + `valor_residual_engine`. Falta CUS/COS normativo (SEDUVI) |
| P4 | **Edad del parque / % construcción nueva (vintage)** | 🟢 | DERIVABLE: `catastro_predios.anio` (~1M, limpiar outliers). edad = año_actual − anio; %_nueva = anio≥2015. Alimenta gentrificación |
| P5 | **Uso de suelo / mix habitacional-comercial** | 🟢/❌ | `IE_COL_USO_SUELO_*` (DataPending SEDUVI) + `sigcdmx_uso_suelo` (0). Derivable de mezcla DENUE mientras tanto; zonificación real FALTA |

---

# (2) UNIVERSO DE DIMENSIONES (columnas)

Fuente única = `backend/dimension_registry.py` (~180 dims, 10 ejes). Cada eje declara `campo` real, `origen` y `estado` (real/derivado/latente/por_crear). `metric_grid` (6,168 celdas) ya cruza 7 de estos simultáneamente. Estados: ✅ computable/materializado hoy · 🟢 derivable (dato existe, falta wrapper) · ❌ falta dato.

## EJE 1 · DÓNDE (geografía) — 17 niveles (0-16)

| Nivel | Dimensión | Estado | Campo / dónde |
|---|---|---|---|
| 0-3 | País · Zona-metro · Estado · **Alcaldía** | ✅ | `city`/`alcaldia` real; cubo tier=alcaldia materializado |
| 4 | Sector · **Corredor** | 🟢 | corredor derivado (`_corridor` cluster); sector por_crear |
| 5 | **Colonia** | ✅ | `colonia_id` real — el nivel donde casi todo el entorno vive (1,811) |
| 6 | Barrio/sub-colonia · **CP** | 🟢/✅ | `postal_code` real; barrio por_crear |
| 7-8 | **AGEB** · **Manzana** | ❌ | por_crear (join INEGI/catastro fino) |
| 9-10 | **Calle** · Tramo | ✅/❌ | `street` real (átomo + catastro); tramo por_crear. Cubo no agrega a calle aún |
| 11 | **Predio / lote** | ✅ | `center` lat/lng real · `catastro_predios` 2dsphere (1.09M) → `$geoWithin`/`$near` LISTO. **El nivel más fino real** |
| 12-13 | **Desarrollo** · Torre | ✅/❌ | `id` real; torre por_crear (multi-torre) |
| 14 | **Piso / nivel** | ✅ | `level` real (`dmx_units.position.piso` 992/992) — B_PISO 6 bandas |
| 15 | **Unidad** | ✅ | `unit_number` real (992) |
| 16 | Espacio (recámara/baño/terraza) | ❌ | por_crear (m² por espacio) |
| — | **Proximidad a POI (radio/isócrona '15-min')** | 🟢 | `osm_pois` (5,000) + `denue_zone_density` (per_km2, radius_m) + `catastro` 2dsphere. Radio computable HOY; isócrona real = falta GTFS |
| — | **Radio / buffer arbitrario ($geoWithin)** | 🟢 | `catastro_predios` 2dsphere + `osm_pois`. Motor de query espacial existe; falta wrapper 'métrica-en-radio' genérico |

## EJE 2 · QUÉ (producto / ficha técnica)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Tipología (studio/1r/2r/3r/PH)** | ✅ | `dmx_units.tipologia` + `metric_grid` (795 celdas) + cube_olap `tipologia`/`recamaras` (B_REC) |
| **m²-bucket (banda de superficie)** | ✅ | `dmx_cube_feed.banda_m2` (<60/60-90/90-120/120-180/180+) — dim `banda_m2` en `cube_olap.query_cross_cut`. B_M2 7 bandas |
| **Amenidad específica (roof/gym/alberca/pet/bodega/…)** | ✅ | `metric_grid` `dims.atributo` (2,199 celdas) + `dmx_units.amenity_keys` (992/992, roof en 622). `amen.lista` |
| **Piso / altura** | ✅ | `metric_grid` `dims.piso` (1,188 celdas: PB-bajo/medio/alto/muy-alto) + `dmx_units.position.piso` (992/992) |
| **Orientación / vista** | 🟡 | `metric_grid` `dims.vista` (482 celdas, interior/exterior derivado) + `dmx_units.position.orientacion` (496/992). Vista formal por unidad = 0 |
| **Antigüedad (0-4/5-9/decade)** | ❌ | cube_olap `year_built_decade` slice LISTO pero `year_built`=0/992 → seco. Derivable de `catastro.anio` por join geo (no cableado) |
| **Estado (nuevo/reventa/remate)** | ❌ | `prod.estado` por_crear |

## EJE 3 · QUIÉN (comprador / demanda)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Intención (vivir/invertir/institucional)** | 🟡 | `buyer_signals` type='intent' (4) + `metric_grid` "Vivir vs invertir" (465 celdas). Real, POCO volumen |
| **Sub-intención / etapa de vida (first-home/upgrade/2ª-casa; soltero/familia/nido-vacío)** | ❌ | `dem.intencion_sub`/`dem.edad`/`dem.arquetipo` por_crear. Derivable de `taste_scores` + `atlax_profile`; campo formal falta |
| **Segmento de comportamiento (preferencia-revelada/co-viewed/market-basket)** | 🟡 | `buyer_signals` (388) + `facts_buyer_signals` (9, K-anon≥3) + `metric_grid` demanda-revelada (62). Conducta real, volumen creciente |

## EJE 4 · CUÁNDO (tiempo)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Cohorte de SEÑALES (demanda)** | ✅ | `buyer_signals.created_at_dt` → buckets. Serie histórica real de demanda |
| **Cohorte de LISTADO / venta (mes de listado)** | ❌ | `listed_at` no capturado, `dmx_units.dias_en_mercado`=null, `units_history`=0. Cohorte de venta FALTA dato |
| **Fase de ciclo (recuperación/expansión/maduro/contracción)** | ❌ | `zone_cycle_engine` (motor conceptual existe) pero serie seca (`facts_daily_zone` 0 fechas distintas, `zone_forecasts`=0) |
| **Grano/ventana (día/semana/mes)** | ✅ | real vía `buyer_signals`; `facts_daily_zone` (1,479 docs) |

## EJE 5 · PRECIO / TRANSACCIÓN (hiper-segmentado)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Tier / rango de precio** | ✅ | `metric_grid` `dims.tier_precio` (854 celdas, 6 bandas) + cube_olap `PRICE_TIERS` (`slice_by='price_tier'`). B_TIER 8 bandas |
| **Esquema / enganche de pago (%enganche/mensualidades-obra/tasa implícita)** | 🟢 | `payment_schemes.py` + `dev_payment_schemes` (3). `px.esquema`/`px.enganche_pct`. Corte por %enganche derivable |
| **Costos de cierre / comisión broker** | ❌ | `px.costos_cierre`/`px.comision_broker` por_crear |

## EJE 6 · OFERENTE / COMPETENCIA (hiper-segmentado)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Developer / marca** | 🟡 | `dmx_units.developer_id` (real, 10 devs) + `battle_card_engine`. Cortar POR developer = EXISTE; sub-atributos marca/gama/HHI = por_crear |
| **Etapa (preventa/construcción/entrega)** | ✅ | `metric_grid` `dims.etapa` (367 celdas) + `absorcion_engine` + `developments.stage` + `prod.avance` (B_AVANCE) |
| **Tipo-desarrollo (torre/boutique)** | 🟡 | slice `property_type` del cubo; sin tipología formal de valor |

## EJE 7 · RIESGO (transversal, 16 dims)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Riesgo-nivel colonia (sísmico/inundación/crimen/sobreoferta/iliquidez)** | ✅ | `natural_risk_layers` + `crime_zone_colonia` (4,189) + `seismic_zone_colonia` (753) + `risk_scores_zone` (1,999) + composites #31-33 |
| **Sísmico por microzona (predio)** | 🟢 | cruce espacial Atlas × `catastro_predios.poly` (derivable) |
| **Régimen / gravámenes / norma-sísmica** | ❌ | por_crear (papelería del predio) |

## EJE 8 · SEÑALES (comportamiento, 13 dims)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Preferencia revelada · co-viewed/sustitución · market-basket · whitespace · DAP · tendencia-zona** | 🟡 | `buyer_signals` (view/save/compare/photo_dwell/dwell/scroll_depth) + `facts_buyer_signals` + `demanda_insatisfecha` (14). Mayoría derivado, capturado real |

## EJE 9 · DATO (calidad / confianza — meta)

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Filtrar por solidez (real/derivado/estimado, n, confianza)** | ✅ | meta-eje; usado para marcar `es_estimado` en UI y celdas |

## EJE 10 · EXPERIENCIA / POST-VENTA + COSTO DE PROPIEDAD

| Dimensión | Estado | Campo / dónde |
|---|---|---|
| **Costo de propiedad (mantenimiento $/m²/mes · predial · cuota-equipamiento)** | ❌ | `exp.cuota_mantenimiento`/`exp.predial`/`exp.costo_total_propiedad` (`costo_total` derivado; el resto por_crear). Falta capturar en la ficha del dev |

**Veredicto dimensiones:** de las ~18 dimensiones "nuevas" fuera de los 8 niveles base — **~7 VIVAS y materializadas** (amenidad, piso, vista, tier-precio, etapa, tipología, developer), **~6 DERIVABLES hoy** (proximidad-POI/radio, CP/manzana-vía-catastro, segmento-intención, m²-bucket, uso-suelo-parcial, esquema-pago), **~5 FALTAN por dato** (antigüedad, orientación/vista formal, cohorte-de-listado, fase-de-ciclo, AGEB). **El moat no es el eje de corte — es poblar cierres + renta + timestamps.**

---

# (3) MATRIZ métrica × dimensión (máxima granularidad por celda)

Formato de celda: **hoy** / *derivable* / [ideal]. Estado con emoji. Columnas = las dimensiones de corte más usadas.

| Métrica \ Dim | Unidad | Característica (rec/m²/piso/amenidad/vista) | Etapa / tipo-desarrollo | Calle/Manzana/**Predio** | Colonia | Alcaldía | Ciudad | Tiempo (hist + forecast) |
|---|---|---|---|---|---|---|---|---|
| **V · Valor $/m² / AVM** | 🟡 AVM s/ **lista** (`avm_property`, `dmx_units` 992) | ✅ hedónico r²=0.95 (`dmx_hedonic_atom`→136) | 🟡 aprox `property_type`+`stage`; sin tipología formal | 🟡 catastral suelo/predio (1.08M); *AVM predio derivable* | ✅ 3 capas (`colonia_valoracion` 1811) | ✅ cube tier=alcaldia | 🟡 rollup demo | 🟡 DRPI **seco** (`price_index_snapshots` median=0) · [cierres] |
| **R10 · Plusvalía** | ❌ · *derivada SHF×hedónico* | ❌ · *SHF×Δatributo* | 🟡 SHF nueva 9.1% vs usada 8.3% | ❌ · *catastro=suelo, no venta* [cierres] | 🟡 derivada de alcaldía (`es_estimado`) | ✅ **única real** SHF (`shf_series` 510) | 🟡 SHF nacional seed | 🟡 hist SHF ✅ · DRPI seco · forecast `zone_forecasts`=0 |
| **L3 · Absorción / velocidad** | 🟡 status; sin Δtiempo | ✅ cube por tipología×amenidad (`_c_absorcion`) | ✅ por cohorte/stage (`absorcion_engine`) | ❌ cubo no corta calle | ✅ `meses_para_agotar` | ✅ `facts_daily_zone` tier=alcaldia | ✅ `cube_materialized_views` city | 🟡 28d real · proyección sintética |
| **L1 · Días en mercado** | ❌ [captura `listed_at`] | ❌ | ❌ | ❌ | 🟡 15 colonias en `metric_grid` [cierres] | ❌ | ❌ | ❌ [flywheel asesor] |
| **L4 · Recortes de precio** | 🟢 `price_events` por unidad | 🟢 *agregar por atributo* | 🟢 por dev/prototipo | 🟢 *por colonia* | 🟢 *agregar `delta_pct<0`* | 🟢 *rollup* | 🟢 *rollup* | 🟢 **sin cierres** (schema real ya crece) |
| **D1 · Demanda revelada** | 🟡 `unit_view`/`save`+prob_venta (644/992) | ✅ `demand_by_feature` (proxy dev visto) | 🟡 `demanda_insatisfecha` (14) | ✅ `demand_by_geo` calle→CP (proxy) | ✅ `demand_by_colonia` serie + grafo | ✅ `demand_by_geo` alcaldía | ✅ rollup ciudad | ✅ **serie real** (`buyer_signals` ts→buckets) |
| **O1 · Oferta / inventario** | ✅ status por unidad | ✅ cube por característica | ✅ `stage` + `property_type` | 🟡 `geo.calle/cp` existe; cubo no agrega | ✅ tier=colonia | ✅ tier=alcaldia | ✅ tier=city | 🟡 28d real; sin proyección |
| **R1/R2 · Rentabilidad** | ✅ **deal-level** (`inversion_v4_finance`) | 🟡 yield plano por tier (solo vía precio) | ❌ no es dim de rentabilidad | ❌ catastro sin renta | 🟡 *cap/ROI depto repr., yield-tabla* [R2 cubo] | ❌ cube tier alcaldia sin KPI renta [R2] | ❌ cube tier city sin KPI renta [R2] | 🟢 R9 serie cap-rate revelado (`inversion_v4_simulations`) |
| **K1 · Riesgo (PML/crime/agua)** | 🟡 hereda de colonia | ❌ | 🟡 concentración por dev | 🟢 sísmico microzona por predio (Atlas×poly) | ✅ real (`crime` 4189 · `seismic` 753 · `sacmex` 1051) | ✅ rollup | ✅ rollup | 🟡 `fgj_trajectory` YoY real; volatilidad limitada |
| **C · Contexto (walk/DENUE/score)** | 🟢 por radio del punto | ❌ | ❌ | 🟢 radio arbitrario (`osm_pois`+2dsphere) | ✅ `zone_scores` 1131 · IE (walk/empleo/escuela) | 🟡 rollup | 🟡 rollup | 🟡 mayormente snapshot |
| **P3 · FAR / potencial desarrollo** | — | — | — | 🟢 **PREDIO** `sup_construccion/sup_terreno` (1.06M) | 🟢 *rollup densidad construida* | 🟢 *rollup* | 🟢 *rollup* | ❌ [2º corte catastral para serie] |
| **C11 · Gentrificación** | ❌ | ❌ | ❌ | 🟢 *sub-colonia derivable Δsuelo* | 🟡 `zone_cycle` (percentil ciudad) | 🟡 SHF (señal más fuerte) | — | 🟡 momentum+trend; [motor dedicado nuevo] |

**Lectura clave:** la columna **Predio** solo la llena la **espina catastral** (valor de suelo, FAR, riesgo microzona, AVM-derivable). La fila **Tiempo** y las métricas de **cierre/liquidez real** (V5, L1, L5, R10 medida) corren **en seco** hasta el flywheel. Todo lo `🟢` es "un wrapper de distancia".

---

# (4) ROADMAP de construcción priorizado

Distinción dura: **CABLEAR** (aflorar dato/motor ya poblado) · **CONSTRUIR** (motor nuevo — solo 1 autorizado) · **ESPERA-DATO / flywheel** (motor listo, dato no existe).

## FASE 1 — Cerrar el cubo de retorno y afeitar lo derivable (0 dato nuevo, alto ROI)

| # | Entrega | Tipo | Reusa | Endpoint nuevo/extendido | Colección/cubo | Portales |
|---|---|---|---|---|---|---|
| 1.1 | **Rentabilidad como KPI del cubo (R2)**: cap/yield-bruto/yield-neto/renta_m2/NOI en los 4 tiers | CABLEAR | `inversion_v4_finance.analyze` + `RENTAL_YIELDS` | **extender** `/api/superadmin/metrics-cube` (no crear ruta) + aflora en `/api/zona/{id}/inversion` | `cube_aggregations.kpis` (nuevos campos en `_finalize`) | inversor · asesor · dev · superadmin |
| 1.2 | **AVM de mercado por PREDIO (V3)**: batch `avm_predio()` sobre 1.09M predios | CABLEAR (batch) | `market_estimate_engine.avm_base`+`avm_property` | **nuevo** `/api/mapa/colonia/{id}/predios-avm` (mismo router que `/valoracion`) | `avm_predios` (materializada) | comprador (mapa) · superadmin |
| 1.3 | **Índice de recortes de precio (L4)**: price_cut_pct + recorte_medio + días_a_1er-recorte | CABLEAR | `price_events` (18, schema real) | composite en `composite_metrics.py` (pack Pricing `for_dev`) o KPI extra cubo | `cube_aggregations` / composite | dev · asesor · comprador · superadmin |
| 1.4 | **FAR / intensidad de construcción por predio (P3)** + **vintage/edad del parque (P4)** | CABLEAR (batch) | `catastro_predios.sup_construccion/anio` + `sig_catastro_engine` | batch → campo por predio + rollup colonia | `catastro_predios.far_aprovechado` / `colonia_catastro_byid` | dev (land intel) · superadmin |
| 1.5 | **Liquidez de zona + ghost-zone (L6/K9/O4)**: empaquetar IE ya computados | CABLEAR | `ie_scores` (`IE_COL_LIQUIDEZ`, `_GHOST_ZONE`, `IE_PROY_*`) | composite en `composite_metrics.py` / `superadmin_intelligence_hub` | — (aflorar) | inversor · dev · comprador · superadmin |
| 1.6 | **Serie cap-rate revelado (R9)** + **real vs nominal (R11)** | CABLEAR | `inversion_v4_simulations` (11,674) + `banxico_rates` (INPC) | agregación mes×zona → `yield_snapshots`; composite plusvalía-real | `yield_snapshots` | inversor · superadmin |

## FASE 2 — Las 4 confirmadas + plusvalía segmentada

| # | Entrega | Tipo | Reusa | Endpoint | Colección/cubo | Portales |
|---|---|---|---|---|---|---|
| 2.1 | **GENTRIFICACIÓN (C11)** — el **único motor nuevo autorizado** | **CONSTRUIR** | `shf_series` + `fgj_trajectory_zone` + demanda YoY (`buyer_signals`+`IE_COL_DEMANDA_NETA`) + `catastro.anio` (edad, NO serie de precio) | **nuevo** `/api/zona/{id}/gentrificacion` | campo en `colonia_valoracion` + `gentrification_engine` | comprador · inversor · asesor · superadmin |
| 2.2 | **Plusvalía por atributo/amenidad (hedónica)** = SHF_zona × (1+Δhedónico) | CABLEAR | `dmx_hedonic_atom` (impacto_pct por roof/terraza/bodega) + `shf_engine` | corte en ficha de unidad (SeccionValor) | `plusvalia_grid` (ver §5) | dev · comprador · asesor |
| 2.3 | **Plusvalía por tipo-desarrollo / price-tier × zona** | CABLEAR/🟡 | SHF nueva-vs-usada + `cube_olap slice_by='property_type'/'price_tier'` + `drpi` (schema zona×tier) | — | `plusvalia_grid` + `drpi_snapshots` | dev · inversor · superadmin |
| 2.4 | **Plusvalía KPI del cubo** (`plusvalia_pct`+`apreciacion_velocidad` en los 4 tiers) | CABLEAR | `shf`/`colonia_valoracion` + `price_history` | — | `cube_aggregations.kpis` (hoy 0/160) | superadmin · dev · asesor |
| 2.5 | **Días en mercado / velocidad / sell-through real (L1/L2)** — plomería lista | **ESPERA-DATO** (flywheel) | `cube_aggregations.days_on_market_avg` + `_dev_days_on_market()` + `transactions` (schema completo) | hook de cierre asesor → `data_lake_etl` | `transactions` + `dmx_units.precio_cierre` + `units_history[]` | dev · asesor · comprador |

## FASE 3 — Espina de cierres + feeders (desbloquea el moat de golpe)

| # | Entrega | Tipo | Reusa | Colección/cubo | Portales |
|---|---|---|---|---|---|
| 3.1 | **Comparables de cierre reales (V5)** + **descuento de negociación (L5)** + **DRPI vivo (V7)** | **ESPERA-DATO** (flywheel) | `cma_engine` + `drpi_engine` + `hedonic_regression_engine` (0 motor nuevo) | `transactions` · `market_comps_closings` · `drpi_snapshots` (hoy 1) | asesor (CMA) · dev · comprador (AVM real) · superadmin |
| 3.2 | **Pipeline / permisos SEDUVI (P1)** + **uso de suelo real (P5/K8)** | **ESPERA-DATO** (feeder) | `IE_COL_DESARROLLOS_ACTIVOS`/`_USO_SUELO_*` (DataPending) | colección `seduvi_permisos` (por crear) | dev · superadmin · comprador |
| 3.3 | **Transit-score exacto (C3)** | **ESPERA-DATO** (feeder GTFS) | `IE_COL_CONECTIVIDAD_TRANSPORTE` (stub) + `osm_engine` | — | comprador · inversor |
| 3.4 | **Renta observada larga (R3)** + cobertura STR AirROI | **ESPERA-DATO** (input founder + presupuesto AirROI) | `AirRoiConnector` + `airroi_cache` | `renta_observada`/colonia → `RENTAL_YIELDS` | inversor · asesor · comprador |
| 3.5 | **Corte sub-colonia real (calle/manzana/AGEB)** en el cubo | CABLEAR + join | `dmx_units.geo.calle/cp` + `catastro` 2dsphere; AGEB=join INEGI | extender `cube_olap` a `lvl='calle'/'cp'` | superadmin · inversor · dev |

## Conexión roadmap → portales (síntesis)

- **COMPRADOR:** 1.2 (AVM predio en mapa) · 2.1 (zona-subiendo) · 2.2 (plusvalía por atributo en ficha) · 3.1 (AVM/plusvalía real) · 3.4 (renta observada).
- **ASESOR:** 1.3 (recortes→timing/CMA) · 2.5 (velocidad de venta real) · 3.1 (comparables de cierre para CMA).
- **DEV:** 1.1 (rentabilidad zona) · 1.3 (price-cut pricing) · 1.4 (FAR/land intel) · 2.2-2.3 (plusvalía por atributo/segmento) · 3.2 (pipeline SEDUVI).
- **SUPERADMIN:** 1.1/1.5/1.6 (cubo de retorno+liquidez) · 2.4 (plusvalía KPI cubo) · §5 `plusvalia_grid` completo · 3.1 (DRPI vivo licenciable) · 3.5 (cubo sub-colonia = moat granular).

---

# (5) ESTRUCTURA de datos unificada (cubo/colección)

Objetivo: soportar **métrica × dimensión × tiempo**, poblado por el flywheel, con **honestidad por celda** (real vs derivado). Regla dura: NO crear engine nuevo salvo `gentrification_engine`; todo lo demás extiende `shf`/`drpi`/`hedonic_atom`/`cube_feed`/`grid_engine` + siembra 1 colección.

## 5.1 `cube_aggregations` (existente) — extender KPIs

Hoy: un doc por `(tier, tier_id, period)` con los 4 tiers reales (`city`/`alcaldia`/`colonia`/`development`). Ya tiene `avg_price_per_m2`, `absorcion_pct`, `days_on_market_avg` (null). **Añadir a `kpis`:** `cap_rate_pct`, `yield_bruto`, `yield_neto`, `renta_m2`, `noi`, `plusvalia_pct`, `apreciacion_velocidad`, `price_cut_pct`, `far_aprovechado_medio`, `edad_parque`, `vacancy_pct`. Escritura desde `metrics_cube_aggregations._finalize()` / `dmx_cube_feed.py`.

## 5.2 `plusvalia_grid` (NUEVA) — espejo de `metric_grid` especializado en apreciación

Patrón `grid_engine` (que ya materializa `metric_grid`, 6,168 celdas). Un doc por celda:

```json
{
  "_id": "geo:col_condesa|tipologia:2rec|atributo:roof|tipo_dev:preventa|tier:5-8M|periodo:2026-Q2",
  "dims": { "geo": "col_condesa", "geo_nivel": 5, "tipologia": "2rec",
            "atributo": "roof", "tipo_desarrollo": "preventa",
            "price_tier": "5-8M", "periodo": "2026-Q2" },
  "valor_pct": 9.4,
  "base": "derivado_hedonico",          // real | derivado_shf | derivado_hedonico | medido_drpi
  "factor_shf": 8.3,                     // ancla real de la alcaldía
  "ajuste_hedonico": 1.013,             // Δ del atributo (dmx_hedonic_atom)
  "es_estimado": true,
  "n": 42, "confianza": 0.61,
  "fuente": "shf_series + dmx_hedonic_models",
  "actualizado": "2026-07-01T..."
}
```

**Poblador batch** (patrón `grid_engine`, NO motor pesado): `shf_engine` (factor base por alcaldía) → `dmx_hedonic_atom` (ajuste por atributo) → `drpi_engine` (sustituye a `base:'medido_drpi'` cuando lleguen cierres) → `gentrification_engine` (sub-colonia). Clave dims:`{geo(nivel 0-16), tipologia, atributo, tipo_desarrollo, price_tier, periodo}`.

## 5.3 Espina de dimensiones = `dimension_registry.py` (fuente única)

Ya declara los ~180 ejes con `campo`/`origen`/`estado`. El árbol, screener y frontend leen de aquí. **No inventar dimensiones — poblarlas.** `metric_grid` es el cubo que ya cruza geo×tipología×tier×atributo×etapa×vista×piso; `cube_olap_engine.query_cross_cut` es el motor de query N-dim.

## 5.4 Espina de cierres (el dato que falta) — flywheel del asesor

`hook de cierre (advisor.py)` → `data_lake_etl` → `transactions` (schema completo: `listed_price`, `closing_price_mxn`, `days_on_market`, `discount_pct`, `closed_at`, `confidence_score`) + `dmx_units.commercial.precio_cierre` + `units_history[]`. **Esto desbloquea de golpe:** DRPI vivo, hedónico de cierre, descuento de negociación, days-on-market real, plusvalía medida por unidad/calle/manzana. Cero motor nuevo — `drpi`/`hedonic` ya leen de ahí.

---

## Confrontación final (honesta)

1. **El arsenal es mucho más grande que las 6 base** — ~48 métricas, ~180 dimensiones, ~120 motores ya viven. La V1 subestimó 3 capas institucionales (IE, composites, inversion_v4).
2. **Motor ≠ dato poblado.** Todo lo hedónico/precio-por-tiempo corre sobre **lista**, no cierre. `drpi_snapshots`=1, `transactions`=1, `zone_forecasts`=0, `hedonic_models` 393 todos `available:False`.
3. **El moat NO es código.** Es poblar **cierre + renta observada + timestamps de listado** (flywheel asesor) y prender **SEDUVI + GTFS**. Todo lo demás listado como `🟢 DERIVABLE` es un wrapper/batch de distancia, sin dato nuevo.
4. **Solo 1 motor nuevo justificado:** `gentrification_engine`. El resto es extender `_finalize` del cubo, un batch de AVM-predio, empaquetar `ie_scores`/`price_events`/`inversion_v4_simulations`, y sembrar `plusvalia_grid`.
5. **Corrección a planes previos:** `catastro.anio` = año de construcción (edad/vintage), **NO** serie de avalúo. El Δ-valor para gentrificación viene de **SHF/DRPI**, no de deltas catastrales. El catastro aporta edad, densidad y FAR — no la serie de precio.
