# DEV — Reporte de datos por tab (ficha de proyecto) · 2026-06-04

Origen: 6 agentes auditaron, por cada pestaña de `ProyectoDetail.js` (flag `REACT_APP_DEV_V2`), **(1) qué se podría analizar** y **(2) qué tenemos REAL en backend**. Disparado por feedback del founder: los cockpits con palabras vagas ("Áreas verdes: Algunas", "Vida: Animada") no aportan. El dato debe ser PRÁCTICO.

## DOCTRINA DEL DATO PRÁCTICO (regla para TODOS los cockpits)
Cada métrica debe pasar el "¿y eso de qué me sirve?". Necesita 4 partes:
1. **NÚMERO** (la cifra real, no un puntaje 0-100).
2. **PLAZO** (anual/mensual/en X tiempo).
3. **COMPARATIVO** (vs CDMX, vs zona, vs competidores, vs periodo anterior).
4. **CASO DE USO / ACCIÓN** (para quién / qué hacer).

- MALO: "Plusvalía +3.2%" · "Áreas verdes: Algunas" · "Nivel: Líder" · "40/100".
- BUENO: "Plusvalía +3.2%/año vs CDMX +6% → la zona crece a la mitad del promedio; véndela como 'consolidada y segura', no como 'gran inversión'." · "Roof garden = +6.2% al precio/m² ($+5,700/m²) → en tus 18 uds son ~$9.7M de premium defendible."

## HALLAZGO CENTRAL (cross-tab)
**~85% del músculo YA está construido pero apagado o desconectado.** Los cockpits salen vagos porque leen puntajes 0-100 (IE scores) en vez del NÚMERO real que ya existe debajo (plusvalía %, # de negocios, ROI, días-a-agotar, % de docs, vistas de landing). El trabajo dominante es **surfacear/cablear**, no construir. Gaps de dato real son pocos y acotados.

---

## TAB POR TAB

### UBICACIÓN (hoy: solo un selector de mapa, 0 análisis)
**Construir YA (front-callable o casi):**
- **Precio/índice zona (DRPI)** `GET /api/drpi/snapshot/{zone_id}` → mediana $/m² + Δ%/periodo + muestra. (requiere transacciones cargadas; fallback `public_zones`)
- **ROI por estrategia (Investment Simulator, PÚBLICO)** `GET /api/investment-simulator/colonia/{slug}/baseline` + `POST /stress-test` → `roi_pct`, `tir`, `renta_mensual`, `break_even_months`. Renta tradicional vs Airbnb vs reventa. **La joya, ya construida y pública.**
- **Negocios/POIs por categoría + densidad (DENUE INEGI, real)** `denue_zone_density` → conteos reales (restaurantes, escuelas, hospitales, súper, bancos) en 1-2km + negocios/km². (hoy gated superadmin → abrir wrapper dev)
- **Demanda viva de la zona (dev, ya accesible)** `GET /api/dev/analytics/demand-heatmap` → leads+búsquedas por colonia, ranking.
- **Demand-gap + amenity-ranker (dev, ya accesible)** `GET /api/dev/market/demand-gap` · `/amenity-ranker`.
- **Forecast apreciación 6/12/24m (ARIMA)** `GET /api/forecast-public/zone/{slug}` → delta% + banda 95% + MAPE.
- **Paquete agregado** `GET /api/public/zones/{slug}` → drpi + risk + comparables + climate_twin en 1 llamada.

**Gaps de dato (necesitan fuente):** seguridad real (CSV SESNSP sin ingerir, parser listo) · demografía $ real (falta mapeo AGEB→colonia) · Airbnb noche/ocupación reales (hoy yield por tier) · riesgo sísmico/inundación geoespacial (mock 16 colonias) · tiempos reales a metro/POI (hoy inventados en la pública).
**Patrón recomendado:** 1 endpoint dev `GET /api/dev/projects/{id}/location-intel` que haga fan-out a DRPI+DENUE+investment-sim+demand-heatmap+forecast y devuelva payload unificado.

### VENTAS (hoy: inventario puro, 0 analítica)
**Cableable YA sin tocar backend:** % vendido + embudo (`/summary`) · días-a-agotar vs entrega (`IE_PROY_DAYS_TO_SELLOUT`) · precio/m² vs zona (`IE_PROY_PRECIO_VS_MERCADO` + `dmx_margin`) · **what-if de precio/elasticidad COMPLETO y productivo** `POST /api/whatif/simulate` (velocity_change + revenue_delta_mxn + recomendación) · **forecast target-vs-actual + 12m** `GET /api/dev/analytics/forecast` · margen semáforo.
**Construir (código chico) sobre `units_history` (fechas reales):** ritmo real uds/sem + tendencia · unidades estancadas (+X días) · mix por prototipo con velocidad.
**Gap:** `weekly_sales` HOY es SINTÉTICO (LCG por project_id); `IE_PROY_ABSORCION_VELOCIDAD` es % de stock, NO velocidad temporal. La fuente real (`units_history`) existe, falta agregarla.

### INSIGHTS (hoy: ~4 métricas reales sobre un arsenal desconectado)
**Cablear (sin IA nueva):** AVM real del proyecto (`avm_public_engine`) vs precio lista · amenity-value-ranker (`dmx_hedonic_atom`, % + significancia) · forecast zona (`forecast-public`) · project-score + desglose (`dmx_project_score`) · embudo vista→lead→cita→cierre · prob de cierre por proyecto (agregando `close_probability` de leads).
**🔴 Bugs:** comparables precio/m² ≈ 0 (consulta `sqm` pero el dato es `m2_priv` — fix 1 línea) · engagement siempre en 0 (`engagement_events` no tiene writer de telemetría) · contexto de la IA es pobre (no recibe AVM/comparables/forecast → "razona a ciegas").
**Gaps que SÍ necesitan escala:** accuracy/MAPE (≥20 cierres) · FSD per-property (colección `avm_predictions` vacía) · "quién compra en tu zona" (no existe agregación de perfil).

### PAGOS Y BROKERS + LEGAL
**Cablear YA:** **`GET /api/dev/leads/analytics`** ya computa funnel + win_rate + avg_time_to_close + **`per_assignee`** (ranking de brokers) + `lost_reasons` — REAL y SIN cablear a ningún tab · SOC por broker (bronze→platinum, `soc_franchise_engine`) · split broker/directo/in-house (`origin_type`) · scores legales (`QUALITY_DOCS` X/10 + cuáles faltan, `RISK_LEGAL`, `COMPLIANCE`, `MARCA_TRUST`, `DELIVERY_HIST`) + cross-check 5 reglas legales.
**🔴 Bug bloqueante:** upload legal roto — el front manda `doc_type='legal'` que el backend rechaza (400); hay que mapear categorías → slugs `DI_DOC_TYPES` (escritura, permiso_seduvi, predial...).
**Gap de dato #1 (alto valor):** no existe vínculo esquema-de-pago ↔ venta (`chosen_scheme_id`). Sin él NO se puede calcular "qué plan convierte más" ni "enganche real vs ofrecido". También falta tabla de comisiones liquidadas (solo hay `commission_pct` configurado).

### AVANCE DE OBRA (hoy: registro operativo, no cockpit)
**Construir (1 wrapper `GET /api/dev/construction/{id}/health`):** combina `progress` real + `delivery_estimate` → % real vs % plan, días adelantado/atrasado, fecha proyectada vs prometida, ritmo pts/mes, semáforo de riesgo, días desde último reporte.
**Cablear YA:** costo de construcción $/m² `getDevConstructionCost` (BANXICO+INEGI, ya front-callable, no está en la tab).
**Gaps menores:** falta campo `fecha_inicio_obra` (1 campo) · snapshots históricos del % (hoy solo se guarda al comentar).

### CONTENIDO (hoy: gestor de archivos, 0 métricas) — casi CERO backend nuevo
**Cablear YA:** **salud del anuncio** `IE_PROY_LISTING_HEALTH` (score + desglose + qué falta) · **rendimiento de landing** `GET /api/studio/landing/{id}/analytics-summary` (vistas + tendencia + conversión vista→lead + scroll depth + heat por sección + clics CTA, filtrable por `project_id`) · estado de landings `GET /api/studio/landings?project_id=` · tira de tours 3D `GET /api/tour-3dgs/scans?dev_id=` · checklist de fotos por `ai_category` (ya etiquetadas con visión) · hook score del copy `studio_hook_score_engine`.
**Gaps:** agregador de cargas de tour ("X cargas/30d", eventos existen en `tour_3dgs_embed_logs`) · vistas foto-por-foto (solo hay heat por sección) · `foto_hero` sin sub-tab (fix trivial).

### AMENIDADES (hoy: checklist mudo)
**Cablear YA (0 backend):** meter el **amenity-ranker** `GET /api/dev/market/amenity-ranker` (`dmx_hedonic_atom`) DENTRO de la tab → "qué sube tu precio/m²" con +X.X% + significancia. UI reusable en `CubeIntelligence.js`.
**Construir (chico):** "$ extra en TU inventario" (% × unidades reales × m² × precio) · cobertura vs zona/competidores ("te falta coworking que 2/3 competidores tienen").
**Gap estructural #1:** el hedónico solo modela **5 atributos a nivel unidad** (roof, terraza, balcón, bodega, 2+cajones). De las 28 amenidades del checklist (gym, alberca, spa, cowork...) **solo "roof" tiene $ calculado**. Para el resto haría falta un hedónico a nivel proyecto (no existe). También faltan: amenidad→absorción, ROI con costos, demografía×amenidad.

---

## ORDEN DE CONSTRUCCIÓN RECOMENDADO (palanca/esfuerzo)
1. **Ubicación** (piloto del dato práctico) — el simulador de inversión + DRPI + DENUE son la joya y casi todo es público/cableable.
2. **Contenido** — casi 0 backend nuevo, todo cableable (listing health + landing analytics).
3. **Ventas** — what-if + forecast ya productivos, sin cablear; + agregadores sobre `units_history`.
4. **Insights** — fix bug `sqm` + enriquecer contexto IA + cablear AVM/forecast/score.
5. **Pagos y brokers** — cablear `leads/analytics` + SOC; **fix bug upload legal**.
6. **Avance de obra** — 1 wrapper `/construction/{id}/health` + cablear costo.
7. **Amenidades** — meter amenity-ranker; $ extra en inventario.

## Datos reales verificados (altavista-polanco, demo)
IE_COL: ingreso=100, familia=76.3, plusvalia_proyectada=3.21%, conectividad=43, parques=40, vida_nocturna=50 (varios IE_COL=50 son stub default).
IE_PROY: amenidades=100, competition_pressure=20, precio_vs_mercado=55.89, days_to_sellout=1147.5, marca_trust=94, delivery_hist=96.89, quality_docs=0, listing_health=75, score_vs_colonia=47.5.
