# AUDIT FASE 6 — Consistencia del modelo de datos (NoSQL / MongoDB)
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
Base **documental sin validación de schema a nivel de motor** → todo depende del código, y el código tiene **modelo de datos forkeado** (mismo concepto, nombres distintos) que es la raíz de la mayoría de bugs financieros y de cables rotos. Dos esquemas de unidad coexisten (seed plano vs átomo `commercial.*`), el campo de score se lee con la llave equivocada en 12+ sitios, y hay **290 colecciones vacías** + 43 leídas-sin-escritor + duplicados de nombre.

**Conteo:** P0: 1 · P1: 3 · P2: 4

### [P0] Campo `score` forkeado: se lee `score_total`/`score`, el dato es `score_numeric`
- **Ubicación:** investment_simulator_engine.py:246/391, score_inversion_engine.py:79, free_audit_engine.py:140/178/291, buyer_coach_engine.py:438, avm_public_engine.py:141, brochure_renderer.py:382, state_of_cdmx_engine.py:65, narrative_collector.py:94.
- **Evidencia (QA5, BD real):** `zone_scores` guarda `score_numeric` (Polanco=46.2 real, hasta 88 con dato poblado) + `score_letter`; `tier`="colonia" es GEO, no grado. Los lectores buscan `score_total`/`score` (no existen) → caen a 0/"F"/65 constante.
- **Impacto:** con datos reales produce NÚMEROS FALSOS (no solo defaults): tier F para todas las colonias, yield mal ~36%, bancabilidad y score de inversión corruptos. Verificado poblando dmx_qa5.
- **Fix:** normalizar `get_score_or_compute` para exponer `score_total=score_numeric`, o corregir cada lector a `score_numeric`/`score_letter`.

### [P1] Dos esquemas de unidad coexisten (forma inconsistente de documentos)
- **Evidencia:** seed `data_developments` usa campos planos (`price`, `bedrooms`, `m2`); el átomo `dmx_units` usa anidados (`commercial.precio_lista_mxn`, `interior.recamaras`, `areas.m2_privativo`). Los extractores divergen: `unidad_insights._unit_price` cubre ambos; `cube_olap._unit_price` solo `price/price_mxn`; varios usan `precio_lista` ignorando `precio_cierre`.
- **Impacto:** el mismo número (precio, m², recámaras) se extrae distinto según el motor → divergencia entre vistas. Sin validación de schema que lo atrape.
- **Fix:** un solo `unit_price/unit_m2/unit_beds` canónico (público en data_developments) que cubra ambos esquemas; importarlo en todos.

### [P1] Definición de "vendido" forkeada + estado femenino invisible
- **Evidencia:** canónico `data_developments.is_sold` = {vendido,sold,cerrado,closed}; ~10 sitios usan literal `=="vendido"` (subcuentan); `dmx_indices.py:70` cuenta solo "vendido" sobre seed crudo. Y `"vendida"` (femenino, común en UI ES) **no está** en SOLD_STATUSES → venta invisible para absorción/cubo/on_unit_sold.
- **Fix:** importar `is_sold` en todos; incluir `vendida`.

### [P1] Referencias huérfanas y sin integridad (NoSQL sin FKs)
- 43 colecciones leídas sin escritor (Fase 5) — referencias a colecciones que nunca se pueblan. `db.zones`/`marketplace_searches`/`matches` consultadas pero vacías. No hay nada que impida IDs apuntando a documentos inexistentes.
- developer_unit_overrides: índice único en `unit_id` solo, pero los queries usan clave `{dev_id, unit_id}` → integridad de clave inconsistente.
- **Fix:** cablear escritores o eliminar lecturas; alinear la clave única del override.

### [P2] Ausencia total de validación de schema a nivel de base
- No hay JSON Schema validators en Mongo → cualquier documento malformado entra si el código no lo valida. La validación Pydantic está en la capa de request (entrada API), pero escrituras internas/seed/migraciones no pasan por ahí.
- **Fix:** considerar validators de colección para las entidades críticas (units, leads, zone_scores).

### [P2] Colecciones muertas / duplicadas / naming inconsistente
- 290/390 colecciones vacías. Pares de nombre que conviven: `zones` vs `dim_zones`, `behavioral_tracking_events` vs `behavioral_events`, `ie_scores` vs `ie_engine_scores`/`ie_unit_scores`, `developments` (0) vs seed in-memory, `db.projects` vs `db.developments` (dos uniones distintas en código).
- **Fix:** consolidar/renombrar; documentar la colección canónica por concepto.

### [P2] 6 hermanos más de campo inexistente
Ver Fase 5 (last_synced_at, hedonic coefficients, risk score_letter/numeric, denue safety_score). Todos producen None/stub silencioso.

### [P2] DB activa ambigua
`DB_NAME` duplicado en .env.local (dmx_local → desarrollosmx). Riesgo de leer/escribir la DB equivocada según orden de carga.

## LIMPIO
- El contrato de las pantallas nuevas con su backend es consistente (Fase 5). Los engines nuevos manejan ambos esquemas con `.get()` defensivo (no crashean), aunque divergen en el valor (de ahí los P1).
