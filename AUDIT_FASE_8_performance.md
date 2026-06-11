# AUDIT FASE 8 — Performance
Fecha: 2026-06-10 · READ-ONLY · (hoy LATENTE: BD con 100 colecciones pobladas pero las "vivas" de negocio vacías; estos bugs muerden a escala)

## RESUMEN EJECUTIVO
Los riesgos de performance son **estructurales y latentes**: faltan índices en colecciones que crecerán, hay **full-scans en cada request** (el Grafo del Comprador escanea TODO `asesor_busquedas`/`asesor_contactos` por llamada), modelos que se **re-entrenan/recalculan sin caché**, y agregados que iteran todo el seed por request. A 10k usuarios concurrentes (Fase 12) esto colapsa.

**Conteo:** P1: 4 · P2: 4

### [P1] Índices faltantes en colecciones calientes
- `developer_reports`: solo `_id_`. Consultada por `{owner_id, type, colonia_id}` sort `version`/`generated_at` en cada guardar/historial/autopiloto. → collection scan.
- `market_index_snapshots`: sin índice único en `fecha` (upsert no idempotente bajo concurrencia + sort sin índice).
- `cerebro_predictions`: índice `{tenant_id,kind,resolved}` no cubre el sort por `resolved_at` de `detectar_drift` → sort en memoria de todo el tenant `__market__` (agrega TODOS los portales) por cada carga del panel.
- `units`/`dmx_units`: lookups por `{id}` sin índice dedicado.
- **Fix:** crear los índices en startup (`ensure_*_indexes`).

### [P1] Full-scans en cada request (el Grafo del Comprador)
- **Ubicación:** `grafo_comprador_engine.py:127/142` `db.asesor_busquedas.find({})` y `db.asesor_contactos.find({})` SIN filtro en query; el filtro de fecha (`dias`) y colonia se aplican en Python. `amenidades_engine.py:53` igual.
- **Agravante:** `estudio_mercado_engine.generar_estudio` invoca build_grafo 2+ veces por estudio; unidad_insights y la API pública también.
- **Impacto:** con N búsquedas reales = escaneo completo por request, x cada estudio/insight/llamada pública. Explota a escala.
- **Fix:** empujar el filtro (`{created_at:{$gte:since}}`, colonia) al query + índice `{created_at:-1}` + caché corto por (colonia, dias).

### [P1] Recalcular sin caché
- `ranking_bancabilidad`/`portfolio_bancabilidad` iteran TODOS los DEVELOPMENTS y llaman `lifts_por_factor` (recorre todas las unidades) por proyecto → `lifts_por_factor` se recalcula N veces idéntico por request. Hoy barato (seed in-memory ~18 devs); a escala con DB real = O(devs × units) por request.
- `detectar_drift` corre `to_list(500)` por cada kind en cada carga del panel.
- **Fix:** calcular `lifts_por_factor` UNA vez y pasarlo; cachear el ranking.

### [P1] Modelos entrenados sobre muestra truncada SIN orden (sesgo + costo)
- `drpi_engine.py:68` y `hedonic_regression_engine.py:156` `.to_list(2000)` SIN sort → mediana/regresión sobre 2000 tx arbitrarias; `transaction_network_engine.py:292` `.to_list(500)`; `fraud_detection_engine.py:97` `.limit(2000)`.
- **Impacto:** a escala, el modelo no es representativo (sesgo presentado como "de la zona") Y carga grandes sets a memoria.
- **Fix:** sort por recencia + cap mayor o agregación server-side (`$group`); flag de muestra truncada.

### [P2] Queries sin paginación / cap fijo sin "hay más"
- Rankings y búsquedas devuelven listas con cap fijo (top-N, `to_list(N)`) sin `has_more`/`total` → el cliente no sabe que hay más. cube roll-up city itera cursor completo a memoria.
- **Fix:** paginación con metadata (total, cursor).

### [P2] N+1 potenciales
- Patrones de loop con lookup por iteración en agregados (cube, bancabilidad, grafo). No medido bajo carga; marcar para profiling.

### [P2] Bundle frontend (CRA)
- 893 archivos JS, Create React App (react-scripts 5). No verificado code-splitting/lazy real (App.js usa `lazy()` para páginas → bien), imágenes sin optimizar (18 `<img>` sin alt detectados; tamaño no auditado).
- **Fix:** auditar bundle size + lazy de librerías pesadas (mapbox, recharts).

### [P2] Cómputo costoso del Intelligence Engine sin caché
- Scores/índices (IE, zone scores) — verificar que los crons los precalculen y los endpoints lean cache, no recalculen por request. Parcialmente cacheado (cube_aggregations, ie_scores persistidos); el Grafo NO (arriba).
