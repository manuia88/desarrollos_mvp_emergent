# Matriz Maestra de Métricas Granulares — DMX

> **Propósito:** una sola vista de qué métrica existe a qué granularidad, dónde vive, qué consume cada portal, y el plan priorizado para cerrar huecos.
> **Regla de oro del documento:** distinguir **CABLEAR** (el dato existe, falta exponerlo/agregarlo) de **CONSTRUIR** (el dato no existe: hay que medirlo/sembrarlo). Y ser honesto: **motor construido ≠ cubo poblado.**
> **Fecha:** 2026-07-01 · basado en inventario de 4 métricas + verificación en repo (`backend/*_engine.py`, `metric_registry.py`, `composite_metrics.py`, `cube_olap_engine.py`, `inversion_v4_finance.py`) y estado de Mongo del inventario.

Leyenda de celda: **✅ EXISTE** (dato real poblado) · **🟡 PARCIAL** (motor listo pero dato pobre/derivado/proxy, o cubre solo un sub-caso) · **❌ FALTA** (ni dato ni materialización).

---

## (1) MATRIZ MAESTRA — métrica × granularidad

| Métrica \ Granularidad | Unidad | Características (rec/m²/piso/amenidad) | Tipo-desarrollo (torre/boutique/preventa) | Calle/Manzana | Colonia | Alcaldía | Ciudad | Tiempo (hist. + proyección) |
|---|---|---|---|---|---|---|---|---|
| **VALOR ($/m², AVM, catastral)** | 🟡 AVM hedónico s/ precio de **lista** · `market_estimate_engine.avm_property`, `dmx_units` 992 | ✅ hedónico maduro r²=0.95 · `dmx_hedonic_atom`→`dmx_hedonic_models` (136) | 🟡 aprox. por `property_type`+`stage` en cubo; sin tipología formal de valor | 🟡 valor **catastral de suelo** por predio (1.08M) · `catastro_predios`; sin AVM de mercado | ✅ 3 capas selladas (mercado/mini-AVM/catastro) · `colonia_valoracion` 1811 | ✅ `cube_aggregations` tier=alcaldia | 🟡 agregado s/ inventario demo · `cube_aggregations` city | 🟡 series de precio $/m² = **motor listo, sin dato** (`price_index_snapshots` 0/522 con median>0) |
| **PLUSVALÍA** | ❌ no existe por unidad | ❌ | ❌ | ❌ | 🟡 serie 2020-26 **derivada de alcaldía** (`es_estimado`) | ✅ **única real/oficial** SHF · `shf_series` 510, 5 propias + estatal | 🟡 SHF nacional en seed, no ciudad-real | 🟡 hist. SHF ✅ · DRPI mensual seco (`drpi_snapshots`=1) · proyección `zone_forecasts`=0 |
| **ABSORCIÓN (meses inv. / velocidad)** | 🟡 status por unidad; sin velocidad ni `days_on_market` · `dmx_units` | ✅ cubo OLAP por tipología×amenidad (`_c_absorcion`) | ✅ por cohorte/stage · `absorcion_engine` (Preventa/Constr./Maduro) | ❌ cubo no corta por calle | ✅ `curva_absorcion.meses_para_agotar` | ✅ `cube_aggregations`/`facts_daily_zone` tier=alcaldia | ✅ `cube_materialized_views` city (absorcion_pct=14.1) | 🟡 hist. 28d real (`facts_daily_zone`) · proyección `zone_forecasts`=0 (sintética determinística) |
| **DEMANDA (señales comprador)** | 🟡 `unit_view`/`unit_save` + `prob_venta` heurística (644/992) | ✅ `demand_by_feature` (feature×colonia×tiempo) — caveat: feature **derivada del dev visto** (proxy) | 🟡 `demanda_insatisfecha` (14) por criterio | ✅ `demand_by_geo` calle→CP (proxy del dev) | ✅ `demand_by_colonia` serie + `grafo_comprador` | ✅ `demand_by_geo` alcaldía | ✅ rollup ciudad | ✅ **serie histórica real** (`buyer_signals` con timestamp→buckets) |
| **OFERTA (inventario)** | ✅ status disp/vendido/reservado por unidad | ✅ cubo por característica | ✅ `stage` en DEVELOPMENTS + `price_index_snapshots.property_type` | 🟡 `dmx_units.geo.calle/cp` existe; cubo no agrega ahí | ✅ `cube_aggregations`/`facts_daily_zone` tier=colonia | ✅ tier=alcaldia | ✅ tier=city | 🟡 serie 28d real; sin proyección |
| **RENTABILIDAD (yield/cap/TIR/…)** | ✅ **deal-level institucional** · `inversion_v4_finance` (TIR/MIRR/VPN/DSCR/eq.mult) · `unidad_insights` | 🟡 yield **plano por tier** (no depende de rec/piso/amenidad; solo vía precio) | ❌ no es dimensión de rentabilidad | ❌ catastro solo suelo, sin renta | 🟡 cap/ROI sobre **depto representativo**, renta = precio×yield-tabla (`RENTAL_YIELDS`, "NO medido") | ❌ cubo tier alcaldia **sin KPI de renta** | ❌ cubo tier city **sin KPI de renta** | ❌ series/forecast son de **precio**, no de yield |

### Métricas institucionales que se creían faltantes — **YA existen** (composites/feeds)

| Métrica institucional | Estado | Dónde vive |
|---|---|---|
| Spread vs CETES | ✅ | `composite_metrics` #24 (cap_rate − cetes) · feed Banxico `market_rates_engine.cetes_364` |
| PML sísmico / riesgo natural | ✅ | `natural_risk_engine` + `natural_risk_layers` · composites #31-33/#108/#114 · `/api/zona/{id}/riesgo` (ASTM E2557/E2026) |
| Elasticidad de precio | ✅ | `metric_grid` "Elasticidad" (228 celdas) + `marketplace_granularity.price_elasticity` |
| Riesgo ajustado (Sharpe / cap-riesgo / frontera) | ✅ | composites #23 Sharpe, #30 cap-rate-riesgo, #37 frontera eficiente, #38 descuento |
| Reporte fondo (TWR/TVPI/DPI/TGER) | ✅ | cableado (`INSTITUTIONAL_METRICS_RESEARCH`) |
| **Comparables de CIERRE** | ❌ dato | `transactions`=1 doc → `precio_cerrado_m2` **latente** |
| **Tiempo-a-venta / days_on_market** | ❌ dato | fórmula lista; `listed_at`/`fecha_venta` no capturado; `units_history`=0 |
| **Gentrificación** | ❌ motor | sin engine dedicado; **derivable** de `catastro_predios` + SHF + crime + demanda YoY |

---

## (2) POR PORTAL — qué consume hoy · qué le falta

### 🛒 COMPRADOR / marketplace
- **Consume:** `/api/mapa/colonia/{id}/valoracion` ($/m²+plusvalía+catastro → `Mapa.js`, `ColoniaComparator`, `PropertyListings`, `AtlaxResults`) · `/api/precio-posicion-batch` (bajo/justo/alto por unidad, `SeccionValor/Dinero/Unidades`) · `/api/zona/{id}/inversion` (cap-rate/ROI/renta zona, `ZonePageV2` tab Invertir → `InversionV4Calculator`) · `/api/zona/{id}/riesgo` (PML real) · demanda vía `buyer_signals`.
- **Le falta:** renta **observada** (hoy yield-tabla) · "se vende rápido" real (days_on_market) · zona-subiendo (gentrificación) · AVM de mercado por predio en el mapa.

### 🧑‍💼 ASESOR
- **Consume:** `asesor_market` ("zonas con demanda alta y poco inventario") · `grafo_comprador` por contacto · casamentera (inventario↔lead) · `/senales-calientes` → `composite_metrics.for_asesor` (packs Lead + STR) · `asesor_metrics`.
- **Le falta:** rentabilidad por zona agregada (hoy hereda fichas sin pantalla propia) · comparables de cierre reales para CMA (hoy comps de lista) · velocidad de venta real para timing.

### 🏗️ DEV (desarrollador)
- **Consume:** `dev_market` (`por_feature`=`demand_by_feature`, benchmark) · `dev_batch2 /analytics/absorption` (inventory_stats REAL vs sintético) · `amenity-ranker` · `demand-gap` (dónde construir) · `unidad_insights` (rentabilidad por unidad) · `/compuestas` → `for_dev` (Pricing/Absorption/Underwriting/Competitive/Suelo).
- **Le falta:** pricing real vs cierre (comparables de cierre) · velocidad de agotamiento **real** (hoy proyección sintética) · absorción/velocidad **por unidad** con Δtiempo.

### 🛠️ SUPERADMIN
- **Consume (el más rico):** `superadmin_metrics_cube` (~28 endpoints: heatmap, cross-cut N-dim, unit/{id}, backfill) · `superadmin_demand_intel` (~45 endpoints: screener, whatif, lookalike, sankey, memorandum, terminal-zona + celda atómica) · `superadmin_granularity` (coverage/stub-diagnosis) · `/inversion-v4/analytics` (demanda revelada 11,674 sims).
- **Le falta:** cubo con KPIs de rentabilidad (hoy 0 campos rent/cap/yield en `cube_aggregations`) · cobertura `metric_grid` a las 1,811 colonias (hoy 15) · cubo **unit-tier real** (hoy rollup falso ciudad).

---

## (3) ¿El Mapa de Valores sirve para estos usos?

**Sí, pero como PISO catastral, no como techo de mercado.** `catastro_predios` = 1,089,684 predios SIGCDMX con `valor_suelo`/`valor_unitario_suelo`/`sup_terreno` + polígono + centroide; agregado a `colonia_catastro_byid`=1,788 colonias vía cruce espacial shapely.

- **Sirve hoy:** valor de **suelo** por predio y colonia · base de la 3ª capa de `colonia_valoracion` · densidad por-predio en el mapa (estilo propiedades.com) · insumo del cruce `colonia_iecm`.
- **No sirve todavía para:** precio de **venta/mercado** por predio, plusvalía sub-colonia, ni renta — el catastro no lo trae (verificado: 0 campos rent/cap/yield).
- **Cómo debería usarse (alto ROI, dato ya existe):**
  1. **AVM por predio** — extender `market_estimate_engine.avm_base` (R²=0.53, ya usa calidad+catastro) a nivel predio usando `colonia_iecm` → AVM de mercado por manzana. Motor existe, falta wrapper/batch. → comprador/inversor.
  2. **Motor de gentrificación** — serie de `valor_suelo` catastral (Δ interanual por predio) × plusvalía SHF × crime × demanda YoY = índice por colonia. Reusa el mapa como columna vertebral. → comprador/inversor/superadmin.

---

## (4) PLAN DE CONSTRUCCIÓN PRIORIZADO

> **Confrontación honesta:** el cubo OLAP **está diseñado y en parte poblado**, no vacío — pero desigual. `cube_aggregations` (160) + `facts_daily_zone` viven en city/alcaldia/colonia/development (real). `metric_grid` tiene **6,168 celdas vivas** pero solo **15 colonias** de 1,811. El nivel **unidad/prototipo del `cube_olap` es rollup falso** (el átomo real está en `dmx_units`=992 y en las dims del grid, no materializado como tier). Y **la espina de CIERRES reales está VACÍA** (`transactions`=1, `precio_cierre`=0, `price_index_snapshots` median=0, `drpi_snapshots`=1, W3 `hedonic_models` 393 todos `available:False`). Todo el aparato de precio-por-tiempo y hedónico-de-cierre corre **en seco sobre precio de LISTA**. **No es problema de código — es de dato.**

### FASE 0 — Encender lo que ya está listo (CABLEAR · días, cero motor nuevo)
| # | Gap | Acción | Portales |
|---|---|---|---|
| 0.1 | `metric_grid` solo 15 colonias | Correr `grid_engine` **backfill** a las 1,811 (código listo) | los 4 (es el cubo base) |
| 0.2 | Cubo unit-tier = rollup falso | Consolidar tier unidad desde `dmx_units`+`metric_grid` en vez del fallback ciudad; materializar tier `corredor` (grid ya lo soporta) | superadmin/dev (moat granular) |
| 0.3 | Salir de DEMO | Al cargar developments/units reales en Mongo, `has_real_sales(db)` flipa `data_basis`→'real' (ya cableado) | oferta/absorción en los 4 |

### FASE 1 — Espina de CIERRES (CONSTRUIR dato + CABLEAR pipeline · **desbloquea 5 celdas rojas**)
| # | Gap | Acción | Reusa | Portales |
|---|---|---|---|---|
| 1.1 | `transactions`/`precio_cierre` vacíos | Ingest de cierres del asesor (ya hay hook de cierre que reentrena) al `data_lake_etl` → poblar `transactions`+`dmx_units.precio_cierre` | `drpi_engine`, `hedonic_regression_engine` (sin motor nuevo) | dev/superadmin/asesor |
| 1.2 | days_on_market null | Capturar `listed_at`/`fecha_venta`+`status_history[]` por unidad; poblar `units_history` (=0); derivar Δtiempo en `cube_olap._aggregate_units` | `is_sold`/`inventory_stats` | dev (velocidad real) / comprador |
| 1.3 | DRPI mensual seco | Con cierres poblados, DRPI base-100 corre solo (ya lee de ahí); serie $/m² real | `drpi_engine` | todos |

### FASE 2 — Rentabilidad agregada (CONSTRUIR renta observada + CABLEAR al cubo)
| # | Gap | Acción | Portales |
|---|---|---|---|
| 2.1 | Renta = yield-tabla plano | Sembrar `renta_observada/colonia` ($/m² real). Fuente cableada: `connectors_ie.AirRoiConnector` (STR, cacheado `airroi_cache`) + input founder (renta larga). Alimentar `RENTAL_YIELDS` con dato medido — **1 punto de cambio** (`investment_simulator_engine:87`, `unidad_insights_engine:116`) | comprador/inversor |
| 2.2 | Cubo sin KPI de renta (alcaldía/ciudad ❌) | Añadir `cap_rate_pct`/`yield_bruto`/`yield_neto`/`renta_m2` a `cube_aggregations` en los 4 tiers existentes (roll-up de precio ya funciona; solo NOI/precio en `dmx_cube_feed`/`metrics_cube_aggregations`) — **llena alcaldía+ciudad de golpe** | superadmin/dev/asesor |
| 2.3 | Sin serie temporal de yield | `yield_snapshots` mensual por zona (espejo de `drpi_snapshots`) + extender `forecast_engine` (mismo ARIMA, otra serie). **Atajo:** agregar `inversion_v4_simulations` (11,674 con ts+zone_id+cap_rate) por mes = cap-rate **revelado** sin dato nuevo | inversor/superadmin |

### FASE 3 — Granularidad fina y motores nuevos (CONSTRUIR)
| # | Gap | Acción | Portales |
|---|---|---|---|
| 3.1 | Oferta/absorción por calle/manzana | Extender `cube_olap._geo_colonias/_dev_units` a `lvl='calle'/'cp'` (`dmx_units.geo` ya existe) — un filtro más, no motor | dev/superadmin |
| 3.2 | AVM por predio | Wrapper/batch de `avm_base` sobre `catastro_predios` geo | comprador/inversor |
| 3.3 | Gentrificación | **Motor nuevo** `gentrification_engine`: catastro Δsuelo × SHF × crime × demanda YoY | comprador/inversor/superadmin |
| 3.4 | Proyección absorción/precio por zona | Correr `forecast_retrain_cron` cuando `facts_daily_zone` acumule ~6m (hoy 28d); reemplazar el sintético determinístico de `dev_batch2` | dev/comprador |
| 3.5 | Demanda×feature es proxy | Front manda `meta.amenidades/features` en el evento `buyer_signal` (motor ya prioriza meta>unidad>foto>dev) | dev/asesor/superadmin |

### DIFERIR (dato = humo hoy · dejar stub en backlog)
- Plusvalía sub-colonia / por unidad (SHF es el techo; derivar de DRPI **cuando** entren cierres — Fase 1).
- Yield hedónico por características (rec/piso/amenidad → ajuste de renta) — hasta tener volumen de renta observada (post-Fase 2).
- Tipo-desarrollo como dimensión formal de valor/rentabilidad (`slice_by='tipologia'` en `cube_olap` es barato si el founder lo pide).
- Rentabilidad por calle/manzana — hasta volumen de renta observada.

---

## Regla transversal (grep-before-build)
**NO crear motores nuevos salvo `gentrification_engine`.** Todo lo demás es **extender** (`inversion_v4_finance`, `investment_simulator`, `cube_feed`, `grid_engine`, `cube_olap`, `forecast_engine`) + **sembrar 1-3 colecciones** (`renta_observada`, `yield_snapshots`, `transactions`/`precio_cierre`). El moat no es el código — es poblar el dato de **cierre** y **renta observada**.
