# PLAN — Upgrade de Tabs + Mapa (Apple-tier · surface > build · cero deuda)

> **Fecha:** 2026-07-01 · **Rama:** `dev-redesign-tandas`
> **Tesis maestra:** El backend está ~85–90% construido. El hueco es de **SURFACE + rediseño**, no de motor. Cada número lleva su sello **fuente / confianza / es_estimado** (doctrina de honestidad). Ningún motor, fórmula fiscal ni coeficiente se toca — solo se cablea y se re-viste.
>
> **Sistema visual único (Apple-tier):** el look de referencia es `InversionV4Calculator.js` — tema claro (`#fff`), serif **Playfair Display** para titulares/números héroe, **DM Sans** cuerpo, aire, `.dmx-card` (borde + hover eleva + glow), un solo acento, microinteracciones sobrias. Se **retira** el look "v1 negro" (`#06080F`, glassmorphism indigo→rosa, Outfit) de tax-projector, comparador, probability, valores y simulador.

---

## 0 · Regla de oro para TODOS los tabs

| Regla | Detalle |
|---|---|
| Grep antes de construir | Todo lo que sigue **reusa** endpoints/motores existentes. Si aparece "endpoint nuevo", es un **read-only wrapper** sobre un motor ya escrito. |
| Cero features huérfanas | Cada componente nuevo tiene callsite + route + registro en `granularity_registry`. |
| Honestidad por celda | `fuente` + `confianza` + `es_estimado`/`is_stub` visibles (chip + tooltip). Nunca número crudo. |
| Contrato Option A (IE) | Se expone **titular público** (value/tier/confidence). NUNCA `inputs_used`/`model_version`/`operations` (= moat). |
| Seguridad congelada | Rate-limits, `client_ip` anti-spoof, cap bbox `0.06`/`limit 3000` (public.py:1341), `with_explain=False` público (avm_public.py:69) — **NO se relajan**. |

---

## 1 · MAPA — `/mapa-valores` → `frontend/src/pages/Mapa.js`

### 1.1 Estado actual
Choropleth Mapbox honesto y limpio, dos niveles reales: **colonia** (valor catastral SIGCDMX) y **predio/lote** (zoom≥14, con unidades). Ya supera a propiedades.com en dato de suelo. Carencias vs Monopolio:
- **No hay selector de capas real.** El pill arriba-derecha (Mapa.js:714–731) es un botón fijo (`cursor:default`). El estado `layer` existe (Mapa.js:89, `useState('ie')`) pero está **MUERTO**: el useEffect (Mapa.js:326–339) depende de `layer` pero solo hace `setVisibility` fijo — nunca reasigna `fill-color`. **VERIFICADO.**
- **Leyenda no flotante:** vive dentro de la bienvenida del sidebar (Mapa.js:513–524) y desaparece al seleccionar colonia.
- Sin microinteracciones premium, sin skeletons, sin búsqueda in-map.
- **Deuda de cableado:** ignora dos infra ya construidas — `/api/public/map/heatmap` y `/api/maps/layers/{key}`.

### 1.2 Rediseño Apple-tier (layout · jerarquía · color · microinteracciones)
- **Layout:** nav 56px + sidebar 400px + mapa (se conserva). El sidebar pasa de "apilado 8 bloques" a **ritmo visual**: número héroe Playfair 800 arriba, cuerpo DM Sans, secciones con aire y separadores sutiles.
- **Control de capas (arriba-derecha):** el pill muerto → **dropdown "¿Qué pinto?"** (segmented + drill por grupos). Grupos: *Precio* (valor catastral · mercado $/m² · AVM-predio) · *Plusvalía* · *Intensidad* (FAR/vintage) · *Gentrificación* · *5 índices DMX* · *70 IE* (por categoría de `recipe_catalog.py`: Salud/Escuelas/Agua/Seguridad/Aire/Riesgo/Moat) · *120 compuestas* (por pack).
- **Leyenda FLOTANTE viva** (glass claro, abajo-izq): persiste al seleccionar colonia; cambia rampa/unidad/rango **según capa activa** + chip fuente/confianza/es_estimado.
- **Jerarquía alcaldía → colonia → predio:** a zoom bajo pinta ALCALDÍA, espejando el `tier` del cubo superadmin.
- **Color:** se **conserva** la rampa violeta→magenta calibrada para valor; cada capa nueva define su propia rampa derivada de SU distribución (nunca reusar ciegamente).
- **Microinteracciones:** swap bienvenida↔panel con fade/slide (hoy ternario duro, Mapa.js:503); `flyTo` con easing; hover con transición suave de opacity; cambio de capa con **cross-fade** del fill (`setPaintProperty` animado); **skeleton shimmer** en valoración/catastro/similar (hoy `setState(null)` pre-fetch → parpadeo, Mapa.js:356,366).
- **Búsqueda in-map:** search bar flotante colonia/alcaldía/predio (reusa patrón `?colonia=ID`, Mapa.js:145–162, disparado desde el mapa).

### 1.3 Upgrades de features / granularidad
Selector de capas real (alto) · leyenda flotante viva (alto) · nivel alcaldía (alto) · cablear heatmap+índices+far-vintage+gentrificación+plusvalía ya construidos (alto) · búsqueda in-map (medio) · microinteracciones+skeleton (medio) · resolver el `layer` muerto al implementar el selector (medio).

### 1.4 PRESERVAR (archivo:línea)
- `frontend/src/pages/Mapa.js:229–240` — rampa choropleth por `valor_catastral` (mediana ~$2,400 / p75 ~$3,300 / p90 ~$5,000). **NO recalibrar** sin re-derivar de la distribución real.
- `frontend/src/pages/Mapa.js:396–402` — fill de predios (AVM si existe, si no catastral). **NO romper el join AVM.**
- `backend/catastro_sig_engine.py:203` `colonia_catastro` + `:452` `far_vintage_colonia` — valor suelo Catastro SIGCDMX 2021 oficial (`es_estimado=False`). **CONGELADO.**
- `backend/market_estimate_engine.py` `_COEF` — venta = 0.900·suelo + 105.5·calidad + 53541 (error ~14%). **NO tocar coeficientes ni FLOOR/CEIL 12000/220000.**
- `backend/colonia_valoracion_engine.py` `get_valoracion` — plusvalía derivada del índice SHF por alcaldía (`es_estimado=True`). **REUSA `shf_engine`, no fabricar por colonia.**
- `backend/dmx_indices_engine.py` `IDM_WEIGHTS {IPV .20, IAB .20, IDS .20, IRE .15, ICO .25}`. **CONGELADO.**
- `backend/routes/public.py:1134` `_similar_to` + `:1115` `_SCORE_KEYS` (vida/movilidad/seguridad/comercio/plusvalia/educacion). **NO cambiar keys.**
- `backend/routes/public.py:1341` — cap bbox `0.06` + `limit 3000` (pentest 2026-06-27). **NO relajar.**

### 1.5 Plan del SELECTOR DE CAPAS IE (la pieza faltante) — ver §6

---

## 2 · SIMULADOR — `/simulador` → `Simulador.js` monta `InvestmentSimulator.js` (v1)

### 2.1 Estado actual
**"v1 negro" confirmado.** `/simulador` (App.js:61/815/1169) monta el calculador **VIEJO** `InvestmentSimulator.js`: fondo `rgba(13,16,23,.92)`, no reactivo (botón "Calcular"), **16 colonias hardcodeadas** (InvestmentSimulator.js:11–15), sin fiscal/USD/portafolio/radar/Monte Carlo. **GAP central:** ya existe el bueno — `InversionV4Calculator.js` (1047 líneas, Apple-tier claro, institucional) — pero solo vive en `ZonePageV2.js` y la ficha, **nunca en `/simulador`**.

### 2.2 Rediseño = MIGRAR, no rediseñar la v1
- Reemplazar `<InvestmentSimulator/>` por `<InversionV4Calculator/>` en `Simulador.js` (o wrapper standalone con el flow individual/institucional de `ZonePageV2.js:1687–1744`). Elimina de un golpe el "v1 negro" y trae tema claro, USD/MXN, fiscal MX, radar, portafolio, Monte Carlo — **sin tocar matemática**.
- Tematizar la página contenedora `Simulador.js` en **claro** (hoy fondo negro): crema/blanco, aire, hero serif Playfair, jerarquía "resultado primero".
- Selector real de **1,811 colonias** (command-palette) → alimenta `zoneId` al V4 (activa cap-rate-vs-mercado, zona-contexto, AirROI).
- Reactividad en vivo (debounce 250ms, como InversionV4Calculator.js:130).
- Comparador colonia-vs-colonia / dev-vs-dev (corre `/api/inversion-v4/analyze` en paralelo).
- Granularidad **unidad** (flow individual/institucional público).
- Actualizar la metodología del footer (Simulador.js:60–65) — hoy describe el motor v1.

### 2.3 PRESERVAR (archivo:línea) — matemática y fiscal INTOCABLES
- `backend/inversion_v4_finance.py` — `irr()` :23, `npv()` :18, `mirr()` :54, `pmt()` :66, `amortization()` :75, `analyze()` :142, `cap_rate` :185, `cash_on_cash` :234, `equity_multiple` :321, `DSCR` :216, `TWR/NCREIF` :383–394, `montecarlo()` :656, `portafolio()` :613. **NO tocar.**
- `backend/inversion_v4_tax.py` — `ISR_ANUAL_2026 art.152` :13–24, `RESICO_PF` :27–30, `isr_renta_anual()` :75–117 (LISR vigente). **NO alterar tramos/tasas.**
- `backend/inversion_v4_veredicto.py` — umbrales semáforo :22–30.
- `backend/investment_simulator_engine.py` — `simulate()` (aún usado por `/api/zona/{id}/inversion`). **NO tocar** (dejarlo solo para ese endpoint; V4 = fuente-de-verdad).
- `backend/score_inversion_engine.py` — pesos Zone Score 30% :5, `ZONE_TIER_TO_SCORE` :27.
- `backend/market_rates_engine.py` — catálogo CETES/FIBRA/AFORE (Banxico vivo). **NO fabricar.**
- `backend/routes/public.py:728–742` — log demanda revelada `db.inversion_v4_simulations` (anónimo LFPDPPP, ip_hash). **Preservar el sensor.**

---

## 3 · TAX PROJECTOR — `/tools/tax-projector` → `TaxProjectorPage.js` (App.js:730)

### 3.1 Hallazgo clave: son DOS calculadoras distintas — **preservar ambas, NO fusionar fórmulas**
- **(A) TaxProjectorPage** = impuestos de **transacción** (ISR vendedor + ISAI comprador + predial 10y + costo de cierre) sobre UNA propiedad. Tema negro, mono-propiedad, sin granularidad de zona.
- **(B) InversionV4Calculator** = **rentabilidad** (TIR/cap rate/flujo/equity multiple/VPN/DSCR/Monte Carlo). Tema claro = look a replicar. Ya compara 2 unidades vía `ComparadorInversion.js`.

### 3.2 Plan del TAX-PROJECTOR — duplicar la calc de inversión + comparar SIN romper fiscal
1. **Duplicar (B) dentro de (A):** un solo route `/tools/tax-projector` con tabs **Impuestos | Inversión | Comparar**. La tab Inversión monta `<InversionV4Calculator/>` con su tema claro (literal, sin `lockPrice`) → reusa `POST /api/inversion-v4/analyze` tal cual. **Cero motor nuevo.**
2. **Comparador multi-COLONIA (2–3):** extender el patrón de `ComparadorInversion.js:13–114` para que cada columna sea una colonia; hidratar cada una con `GET /api/zona/{colonia_id}/inversion` (public.py:335) y correr `/api/inversion-v4/analyze` con **supuestos idénticos** (comparación justa). Ganador-por-métrica ya resuelto en `ComparadorInversion.js:86–97`.
3. **Comparador multi-DESARROLLO/UNIDAD:** reusar `POST /api/compare` (compare.py:54, scope `unit|project`, ≤3, deltas + veredicto IA ya construidos) — **NO duplicar `comparator_engine`.**
4. **Capa FISCAL de la comparación:** por cada colonia/dev comparado, correr `GET /api/tax/full-scenario` y pintar ISR/ISAI/predial/cierre lado a lado (la decisión real: *"¿cuál me deja más neto tras impuestos?"*). **Fusiona impuestos + inversión SIN mezclar sus fórmulas** — son dos motores fiscales distintos que conviven, no se cruzan.
5. **Tema claro unificado** — retirar `#06080F` de tax-projector.
6. **Registrar** la vista comparador en `granularity_registry` + nav (no huérfana). Quitar el `ProyectorLink` hardcoded (InversionV4Calculator.js:27) cuando ambas convivan.

### 3.3 PRESERVAR (archivo:línea) — DOS motores fiscales, ninguno se toca
- **Motor impuestos transacción** — `backend/tax_projector_engine.py`: `LISR_ART_126_BRACKETS_2026` :29–41 (SAT Anexo 8 RMF 2026), `ISAI_CDMX_BRACKETS_2026` :48–60 (Gaceta CDMX 1762), `PREDIAL_CDMX_BRACKETS_2026` :68–85 (ART 130 CFCDMX), `INPC_ANCHORS` :90–101, `calculate_isr_vendedor` :217, `calculate_isai_comprador` :311, `project_predial_10y` :347, `calculate_closing_cost_total` :468 (validado ±$5 vs PDF notario ref 212279, self-test :548–595). **NO tocar montos/brackets/factores.**
- **Motor fiscal de inversión** (distinto) — `backend/inversion_v4_tax.py:13–40` (art.152 + RESICO), `isr_renta_anual`/`isr_venta`/`make_isr_fn` :75–184 (exención casa habitación 700k UDIS, depreciación art.124). **NO tocar.**
- `backend/inversion_v4_finance.py` + `inversion_v4_veredicto.py` — motor financiero + veredicto.
- `backend/routes/public.py:640` `inversion_v4_analyze`, `:773` `portafolio`, `:335` `zona_inversion` (fuente de `capRateMercado`).
- `backend/routes/compare.py:18–42` rate-limit 5/min + `client_ip`; `backend/comparator_engine.py:170–224` `METRICS_LOWER/HIGHER_BETTER` + `compute_deltas` (fuente-de-verdad del ganador); `:322` `compare` + cache TTL 30min.
- `frontend/src/api/tax_projector.js:16–27` wrappers `/api/tax`.

---

## 4 · COMPARADOR — `/portal/comparador` → `ComparatorPage.js` (App.js:732)

### 4.1 Estado actual + BUGS reales verificados
Tema **v1 negro** (`#06080F`, Outfit/DM Sans), backend sólido y honesto pero UI mediocre. Tres bugs confirmados en fuente:
1. **Honestidad rota:** `comparator_engine.py:65` `_val()` desenvuelve `{value,source}` y **descarta la fuente**; la tabla pinta números crudos. El `source` solo se re-inyecta al prompt del LLM (`custom_facts`, :267–278), **nunca al usuario**. **VERIFICADO.**
2. **Ganador calculado DOS veces:** backend `compute_deltas` (comparator_engine.py:186) etiqueta ganadores, pero el frontend **RE-CALCULA** con `bestIdxFor` (ComparatorTable.js:79, usado en :151–175) ignorando los deltas → riesgo de incoherencia. **VERIFICADO.**
3. Selector ofrece 5 perfiles (ComparatorPicker) pero backend acepta **7** (compare.py:48: +boutique +urgent) → 2 inalcanzables. **VERIFICADO.**
4. Scope hardcodeado a `project` aunque backend soporta `unit` (compare.py:46). `—` mudo ante error (ComparatorTable.js:14–24). "Cierre fiscal" solo muestra ISAI+TOTAL aunque el motor calcula RPP/notario/avalúo/IVA.

### 4.2 Rediseño Apple-tier + fixes
- Tabla oscura → **centro de mando** claro: veredicto arriba, **columnas-tarjeta** `.dmx-card` por propiedad, diff highlight sutil, badge ganador animado, skeletons, empty states.
- **FIX honestidad:** propagar `source`/confianza/es_estimado por métrica (chip + tooltip). Cierra la violación de doctrina.
- **FIX ganador:** consumir `result.deltas` del backend, retirar `bestIdxFor`.
- Cablear scope `unit` (toggle proyecto/unidad). Exponer los 7 perfiles. Desglose fiscal completo (ya lo devuelve `calculate_closing_cost_total`, tax_projector_engine.py:513–530).
- Eje **tiempo** (sparkline DRPI/IE/precio m² 24m vía `ie_score_history`, scores.py:199–206).
- Sección "inteligencia de zona" con `composite_metrics` `for_comprador/for_inversor/for_dev/for_asesor` según audiencia (ver §6).
- `—` mudo → "sin dato" vs "error" diferenciados. CTA a ficha/asesor + export/share (reusar `services/colonia_comparator.generate_comparison_pdf`).

### 4.3 PRESERVAR (archivo:línea)
- `backend/tax_projector_engine.py:48` `ISAI_CDMX_BRACKETS_2026` (validado $7.4M→$431,464 ±$5, :567), `:311` `calculate_isai_comprador`, `:217` `calculate_isr_vendedor`, `:347` `project_predial_10y`, `:468` `calculate_closing_cost_total`. **NO tocar.**
- `backend/comparator_engine.py:170–183` `METRICS_LOWER/HIGHER_BETTER`+`LABEL_MAP` (fuente-de-verdad ganador — el front debe CONSUMIRLA), `:186` `compute_deltas`, `:33` `make_comparison_key` + cache TTL 30min.
- `backend/narrative_collector.py:51` `_wrap {value,source}` (envoltura honestidad — **preservar Y propagar al front**); fuentes por score (`ie_scores`/`drpi_zones`/`avm_cache`/`risk_scores_zone`, :85–128). **NO cambiar collections/campos.**
- `backend/routes/compare.py:18–42` rate-limit 5/min + anti-spoof.
- `backend/composite_metrics.py:640` estado honesto `vivo`/`esperando_dato` — consumir read-only, **no romper**.

---

## 5 · PROBABILITY — `/portal/probability` → `ProbabilityPage.js` (App.js:740)

### 5.1 Estado actual + hallazgos verificados
UNA sola página pública (no hay superadmin/dev separada). Lo que suena a "dev/superadmin" son **motores distintos**: `close_probability.py` (cierre de LEAD, surface en portal asesor) y `dmx_demand.score_close_probabilities` (venta por UNIDAD, endpoint superadmin **sin UI**). El motor público `probability_engine.py` calcula 3 eventos.
- Tema v1 negro; formulario exige **tipear IDs internos a mano** (project_id/zone_slug/property_id sintético) — inusable sin conocerlos.
- **BUG de datos VERIFICADO:** `ProbabilityCard.js:117` lee bien `sources_breakdown`, pero `:196–203` lee `s.weight_pct`/`s.label` cuando el backend manda `contribution_pct`/`source`/`value_used` → "Fuentes que pesan" siempre 0% y "Fuente 1/2". `Badge` y `Bar` sí leen bien.
- `drpi_up` recibe `colonia_id` numérico en DevelopmentDetail/PropertyDetail pero el forecast espera `zone_slug` → `insufficient_data` silencioso.

### 5.2 Rediseño Apple-tier + fixes
- **FIX bug datos:** mapear `contribution_pct`/`source`/`value_used` en ProbabilityCard.js:196–203 (sin tocar motor).
- Inputs de texto → **selectores con autocomplete** (proyecto / colonia 1,811 / mini-form unidad m2·rec·baños·antigüedad que arma el property_id sintético por detrás).
- Migrar página a tema claro LightScope (la Card ya es clara → hoy desentona).
- FIX `drpi_up`: resolver slug antes de pasar el id.
- **Tablero SUPERADMIN unificado** (hoy inexistente): las 3 públicas + `close_probability` (lead) + `score_close_probabilities` (unidad, sin UI) con fuente/confianza/es_estimado.
- CTAs contextuales desde ficha/colonia/unidad que pre-cargan la página.

### 5.3 PRESERVAR (archivo:línea)
- `backend/probability_engine.py:126` `compute_sells_complete` (0.70·absorción + 0.30·leads, sigmoid), `:223` `compute_zone_drpi_up` (ARIMA, degrada si MAPE>5), `:307` `compute_closes_below_listed` (norm_cdf, sigma de FSD, Z_80=1.28), `:432` endpoint (cache 60s, rate-limit 60/min, audit, feature_registry). **NO tocar fórmulas/calibración.**
- `backend/close_probability.py:79` (heurística lead, pesos aprendidos, FAIL-OPEN neutral 50) + `backend/close_probability_tuning.py` (cron @04:30 re-aprende). **Preservar loop.**
- `backend/dmx_demand.py:151` `score_close_probabilities` (escribe `demand.prob_venta`). `backend/probability_cron.py` (job semanal). `backend/asistente_engine.py:1809` Atlax tool #20.

---

## 6 · SELECTOR DE CAPAS IE + HIPERGRANULARIDAD (backend + frontend, cero deuda)

### 6.1 Backend — UN endpoint que sirve CUALQUIER métrica por colonia
**Problema:** el mapa colapsa 67 IE en 1 número; `for_comprador`/`for_inversor` están **definidos pero SIN ruta** (composite_metrics.py:704/716 — **grep confirma cero callsites en `routes/`** → huérfanos, violan la regla no-orphan).

**Plan (todo son read-only wrappers sobre motores ya escritos):**

| Endpoint nuevo (wrapper) | Motor que reusa | Devuelve |
|---|---|---|
| `GET /api/mapa/capa/{code}` | `db.ie_scores` por `code` (score_engine) | `{colonia_id: {value, tier, confidence, es_estimado}}` — colorea el choropleth por **cualquiera de los 67 IE**. Contrato Option A (titular público). |
| `GET /api/mapa/capa/composite/{id}` | `composite_metrics.COMPOSITES` | valor por colonia de cualquiera de las 120 compuestas, con estado `vivo`/`esperando_dato`. |
| `GET /api/composites/comprador` | `composite_metrics.for_comprador` (:716) | cablea el huérfano → portal comprador. |
| `GET /api/composites/inversor` | `composite_metrics.for_inversor` (:704) | cablea el huérfano → portal inversor. |
| (existentes, solo cablear) | `/api/public/map/heatmap`, `/api/maps/layers/{key}`, `/api/indices/zona/{id}`, `/api/catastro/colonia/{id}/far-vintage`, `/api/zona/{id}/gentrificacion`, `/api/plusvalia/{id}` | ya construidos, hoy ignorados por el mapa. |

- **Respeta `feature_visibility` por tier** de usuario (fail-open, 3-layer cache ya existe).
- **Espeja el selector superadmin** `/api/superadmin/metrics-cube/heatmap` (metric × tier alcaldia/colonia/development) con las capas permitidas por tier.

### 6.2 Frontend — selector "¿Qué pinto?" que repinta el choropleth
- Dropdown/segmented alimentado por **catálogo** (67 IE agrupados por `recipe_catalog.py` categorías + 5 DMX + 120 compuestas por pack + precio/plusvalía/FAR/gentrificación).
- Al elegir capa → fetch `/api/mapa/capa/{code}` → `setPaintProperty('colonias-fill','fill-color', …)` con **cross-fade** + rampa derivada de la distribución de ESA capa + leyenda flotante actualizada (unidad/rango/fuente/es_estimado).
- **Selector de segmento (hipergranularidad)** leyendo `dimension_registry.py` (~180 dims, 10 ejes) como fuente única: cortar por geo(nivel)/tipología/tier/atributo/etapa. Mismo registry lo leen superadmin + 4 portales.
- **Honestidad por celda en el mapa:** `es_estimado`/`is_stub` con hachurado/opacidad distinta + popup con fuente+confianza.

### 6.3 Conexión superadmin + 4 portales (cero deuda)
- **Superadmin:** unificar las 3 capas (67 IE + 120 compuestas + 58 registry) en `/superadmin/granularidad` con `coverage(db)` de `granularity_registry` → por familia: docs, cobertura %, frescura, qué está APAGADO (0 docs) vs vivo. Mapa de calor cobertura code×colonia. **Superadmin solo AUDITA** (no rediseña emergent).
- **Dev / Asesor:** rediseñar las tablas densas de compuestas (`DesarrolladorDemanda.js:403`, `SenalesCalientesCard.js:58`) → tarjetas `.dmx-card` con lenguaje humano (el campo `descubre`/`uso` de cada composite ya trae la explicación en español) + es_estimado badge.
- **Comprador / Inversor:** consumir `/api/composites/comprador` e `/api/composites/inversor` (los huérfanos cableados) — mismo motor, lentes distintos.

### 6.4 PRESERVAR (archivo:línea) — el moat de datos
- `backend/composite_metrics.py:351–635` las 122 fórmulas puras (`_price_cuts_by_colonia` :73, `_ie_liquidez_ghost_by_zone` :128). **Solo AÑADIR wiring de rutas, NO tocar lambdas.**
- `backend/score_engine.py:112` `register()` / `:136` `all_recipes()` (67 recetas IE). **NO renombrar codes ni scope.**
- `backend/recipes/**` recetas con `dependencies`/`formula_version`/`is_stub`. `backend/recipe_catalog.py:104` `USER_FACING_CODES`.
- `backend/routes/scores.py:211–374` contrato público Option A. **NO exponer inputs_used/model_version/operations.**
- `backend/metric_registry.py:36` + `grid_engine.py:685` (58 medidas con procedencia). **NO publicar celda sin procedencia.**
- `backend/dimension_registry.py` + `granularity_registry.py` — fuentes únicas. **AMPLIAR agregando filas, NUNCA inventar ejes.**
- `backend/shf_series`, `backend/market_rates_engine` (CETES Banxico), `backend/inversion_v4_finance.py` — fuentes oficiales.

---

## 7 · ACM / VALORES — `/valores` → `Valores.js` (App.js:705) [bonus, mismo patrón]
Mini-AVM de 1 pantalla, no ACM. Bug: `<ExplainabilityCard>` (Valores.js:229) **muerto** — `avm_public.py:69` fuerza `with_explain=False` (pentest) → `explain` siempre undefined. **Fix:** reemplazar por drivers en lenguaje normal (`avm_feature_engine`, ya viene en `result.drivers`); NO reactivar explain público. Convertir en ACM cableando los ~10 endpoints ya construidos (precio-posicion, colonias-similar, valoracion/plusvalía, predios-avm, far-vintage). **PRESERVAR:** fórmula heurística `avm_public_engine.py:111–116`, selección hedónico+guards :130–201, sello honestidad :334–359, supresión explain público, rate-limit 30/min.

---

## 8 · ORDEN DE EJECUCIÓN (valor / esfuerzo)

| # | Tarea | Valor | Esfuerzo | Por qué primero |
|---|---|---|---|---|
| 1 | **Bugs de honestidad/datos** (front, ~horas): ProbabilityCard field-map (ProbabilityCard.js:196), Comparador consumir `deltas` (retirar bestIdxFor) + propagar `source`, ExplainabilityCard muerto en /valores | ALTO | XS | Correcciones puntuales, cero motor, cierran violaciones de doctrina. |
| 2 | **Migrar /simulador → V4 + tema claro** | ALTO | S | Un swap de componente elimina el peor "v1 negro"; cero matemática. |
| 3 | **Selector de capas IE del mapa** (`/api/mapa/capa/{code}` + dropdown "¿Qué pinto?" + leyenda flotante viva + `layer` muerto resuelto) | ALTO | M | El moat de datos por fin visible; desbloquea §6 para los 4 portales. |
| 4 | **Cablear huérfanos** `for_comprador`/`for_inversor` (2 rutas) → comprador/inversor | ALTO | XS | Features definidas sin ruta; regla no-orphan. |
| 5 | **Tax-projector = tabs Impuestos\|Inversión\|Comparar** (duplicar V4 + comparador multi-colonia reusando ComparadorInversion + /api/compare + capa fiscal /api/tax/full-scenario) | ALTO | M | Cero motor nuevo; fusiona sin tocar fórmulas. |
| 6 | **Comparador rediseño Apple** (columnas-tarjeta, scope unit, eje tiempo, composites por audiencia, fiscal completo) | ALTO | M | Tras fix bugs (#1), el rediseño luce honesto. |
| 7 | **Probability: selectores autocomplete + tema claro + tablero superadmin** | MEDIO-ALTO | M | Tras fix bug (#1), hacer la página usable. |
| 8 | **Mapa: nivel alcaldía + microinteracciones + búsqueda in-map + skeletons** | MEDIO | M | Pulido premium sobre el selector ya vivo. |
| 9 | **Superadmin granularidad: coverage unificado + rediseño tablas dev/asesor** | MEDIO | M | Auditoría del moat; superadmin solo audita. |
| 10 | **/valores → ACM real** (cablear ~10 endpoints + mini-mapa predio) | MEDIO | M | Surface, no build. |

**Regla de cierre por chunk:** tras cada tarea, actualizar el doc del feature (✅+fecha) y auditar (app real logueada · sin deuda · completo · honesto) antes de seguir.
