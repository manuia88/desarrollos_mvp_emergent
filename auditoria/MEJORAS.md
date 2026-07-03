# MEJORAS — backlog priorizado (producto · código · infra · UX)

## Producto e Inteligencia
(se llena en Fase 3 — T6)

## Código / Infra

### Batch 11 · RENDIMIENTO (workflow 18 archivos calientes · 43 hallazgos)

> **Estado honesto:** los finders leyeron el código real y marcaron anti-patrones específicos, pero la
> **verificación adversarial se cayó por rate-limits del servidor** (casi todos los verify fallaron). Trátese
> como hallazgos de ALTA confianza a **confirmar+corregir antes de escalar**, no como confirmados.
> **No urge:** hoy no hay tráfico en producción (app solo local, DB chica) → estas optimizaciones no tienen
> impacto actual; su valor es pre-lanzamiento/escala. Por eso NO se reescribieron los N+1 (riesgo en código
> que funciona, sin beneficio inmediato). Sí se agregaron los **índices seguros** (ver abajo).

**✅ Ya aplicado (índices seguros · `dev_scale_indexes.py`, idempotentes, background):**
- `colonias.id` — confirmado FALTANTE (colección solo tenía `_id_`); usado por `_colonia_value`/`colonia_watch_list` (público) sobre 2,788 docs. **El win más claro.**
- `buyer_signals (type, created_at_dt)` — para los scans de demanda filtrados por type+ventana.
- `marketplace_searches (created_at_dt)` — para `demanda_mapa` por rango de fecha.
- `asistente_messages (role, created_at)` — prepara el fix de query de `conversation_intel`/`competitor_mentions`.

**Patrones dominantes:** N+1 (12) · filtrado en Python que debería ir en `$aggregate` (10) · consultas sin `.limit()` (9) · índice faltante (7) · lecturas redundantes en el mismo request (4) · bloqueo síncrono en handler async (1).

**Backlog a corregir (orden: P0 primero · casi todo = mover el cómputo a `$aggregate`/query + batchear con `$in`):**

| Sev | Tipo | Ubicación | Problema | Corrección |
|---|---|---|---|---|
| P0 | filtro_python | `demand_intelligence.py:932` | conversation_intel() hace `asistente_messages.find({'role':'user'})` SIN filtro de fecha ni limit: trae TODO el histórico y filtra en Python | Filtrar en la query `{'role':'user','created_at':{'$gte':cutoff}}` + índice (role, created_at) |
| P0 | filtro_python | `marketplace_granularity.py:423` | competitor_mentions() mismo patrón: todos los mensajes + scan de keywords en Python (idem urgency_signals:595) | Añadir `{'created_at':{'$gte':cutoff}}` + pre-agregar menciones/urgencia en cron |
| P0 | indice_faltante | `routes/dev_batch4_1.py:692` | count por `colonia` con `$regex` case-insensitive sin índice en `leads.colonia` → COLLSCAN × cada candidato del N+1 | Guardar `colonia_norm` + índice compuesto (asesor_id, status, colonia_norm), igualdad exacta (sin regex) |
| P0 | n_plus_1 | `entity_resolution_engine.py:256` | detect_duplicates: 2 queries DENTRO del doble loop O(n²) de pares (blacklist + pending) | Precargar blacklist+pending una vez a un set en memoria antes del loop |
| P0 | n_plus_1 | `routes/buyer_signals.py:737` | percepcion_unidades: por CADA unidad 3 count + 1 find contra buyer_signals (dev de 60 units = 240 queries) · dashboard dev | 1 solo `$aggregate` $group por unit_number con $cond por type |
| P0 | n_plus_1 | `routes/dev_batch4_1.py:686` | _pick_best_inmobiliaria_asesor: loop de ≤50 asesores × 4 count sobre leads = 200 queries · dentro de POST /api/cita | 1 `$aggregate` $group por asesor_id (won/closed/active) o precomputar en el doc del asesor |
| P0 | n_plus_1 | `routes/scores.py:143` | POST /scores/refresh-moat-feeders: 3 recetas × cada colonia en doble for anidado · request superadmin síncrono | Convertir a tarea de fondo (asyncio.create_task + task_id) como /scores/recompute-all en el mismo archivo |
| P0 | redundante | `routes/dev_market.py:93` | el endpoint dev encadena 6+ funciones que CADA UNA re-escanea buyer_signals/searches de la misma ventana (15-20×) | Cargar la ventana UNA vez (o pre-materializar por feature/colonia/día en cron) y pasar el agregado |
| P0 | sin_limite | `demand_intelligence.py:217` | demand_by_feature() streamea TODA la ventana (365d) de buyer_signals por type IN _ENGAGE sin limit · base de dev_market | Índice (type, created_at_dt) [✅ agregado] + mover a $group en Mongo o materializar (facts_buyer_signals) |
| P1 | bloqueo_sync | `routes/dev_batch1.py:977` | quote_pdf: `doc.build()` de ReportLab + PIL SÍNCRONO en handler async → congela el event loop | `run_in_executor(None, _render_quote_pdf, ...)` |
| P1 | filtro_python | `marketplace_granularity.py:235` | rfm_segments() trae todos los buyer_signals (365d) sin type/limit y arma dict por visitor_id en Python | $group por visitor_id (min/max/count/sum) o materializar RFM en cron |
| P1 | filtro_python | `routes/buyer_signals.py:577` | donde_vivir: find() SIN LÍMITE sobre 2,788 colonias + scoring por visitante en Python | Mover el peso a $project/aggregate; cachear el pool base (cambia por cron) |
| P1 | filtro_python | `routes/buyer_signals.py:621` | demanda_mapa: marketplace_searches 90d find() sin límite + Counter en Python | `$aggregate` $group por colonia_id → devuelve el conteo ya agregado |
| P1 | indice_faltante | `marketplace_granularity.py:302` | price_elasticity/predicted_budget/willingness_to_pay filtran buyer_signals por type sin índice de type | Índice (type, created_at_dt) [✅ agregado] |
| P1 | indice_faltante | `routes/public.py:1158` | `_colonia_value` → `colonias.find_one({'id':...})` sobre campo `id` (no _id), COLLSCAN | Índice `colonias.id` [✅ agregado] |
| P1 | indice_faltante | `routes/public_api_v1.py:245` | v1_comparables (API pública de pago) bounding-box sobre lat/lng crudos, sin usar el 2dsphere existente | Reescribir con `$geoWithin`/`$geoNear` usando el índice `txn_geo_2dsphere` |
| P1 | n_plus_1 | `notifications_engine.py:702` | check_pending_whatsapp_replies: ≤200 outbound × find_one(reply)+find_one(lead) en serie | Batch con `$in` de lead_ids; agrupar en memoria |
| P1 | n_plus_1 | `routes/dev_batch4_1.py:1327` | list_asesor_citas: ≤200 citas × find_one(lead) por cada una | 1 `leads.find({"id":{"$in":lead_ids}})` + map en memoria |
| P1 | n_plus_1 | `routes/dev_batch4_2.py:366` | _run_kanban: por cada client_global_id único un count sobre leads (≤1000 leads) | 1 `$aggregate` $group por client_global_id con `$in` |
| P1 | n_plus_1 | `routes/dev_batch4_2.py:398` | _run_kanban: enrich_lead_metadata por CADA lead (≤1000) | Batchear branding/comisión por project_id/dev_org_id fuera del loop |
| P1 | n_plus_1 | `routes/public.py:1196` | colonia_watch_list: por cada colonia vigilada `_colonia_value` (2 queries) | Batch: recolectar ids → 1 find con `$in` |
| P1 | n_plus_1 | `routes/dev_batch1.py:336` | bulk_commit: ≤2,000 filas × update_one(upsert) en SERIE | `bulk_write([UpdateOne(upsert)])` en lotes de ~500, ordered=False |
| P1 | sin_limite | `demand_intelligence.py:1382` | temporal_demand() streamea 90d de buyer_signals sin type/limit para agrupar por hora/día | `$group` por `$hour`/`$dayOfWeek` en Mongo (<200 buckets) |
| P1 | sin_limite | `marketplace_granularity.py:898` | substitution() find().sort sobre 365d sin limit | Limitar/muestrear ventana o $group por visitor_id; materializar en cron |
| P1 | sin_limite | `marketplace_granularity.py:465` | locale_split()/attribution() hacen `asistente_sessions.find({})` SIN filtro ni limit (colección entera) | Filtrar por created_at>=cutoff + índice; o $group en Mongo |
| P1 | sin_limite | `routes/buyer_signals.py:248` | embudo_unidades: 2 find() sin límite (unit_view/save del dev) + 1 find sin límite sobre leads | $aggregate $group por unit_number; leads con $in |
| P2 | filtro_python | `lead_nurture_engine.py:751` | _nrt_layer_cached: SequenceMatcher en Python sobre ≤80 secuencias | Filtrar por lead_signature exacto/prefijo en la query (indexar) |
| P2 | filtro_python | `routes/buyer_signals.py:704` | percepcion_desarrollo: todas las dismiss + Counter en Python | `$group` por value con $sum |
| P2 | filtro_python | `routes/dev_batch4_2.py:351` | _run_kanban: q_search filtrado en Python tras traer ≤1000 leads | Empujar la búsqueda a la query ($or normalizado + índice) |
| P2 | filtro_python | `routes/public.py:1417` | para_ti: 2 cursores full sobre colonias + similitud en Python | Cachear el pool de _db_colonias_scored (TTL) o precomputar vecinos |
| P2 | filtro_python | `routes/dev_batch2.py:137` | absorption_analytics: ≤5,000 leads + todo el analítico en Python | Mover funnel/win-loss a `$group` por status |
| P2 | indice_faltante | `cube_olap_engine.py:570` | _agg_demand: 2do pipeline sin índice ideal (cron) | allowDiskUse + $group en 1 pipeline · bajo (cron) |
| P2 | indice_faltante | `routes/buyer_signals.py:284` | demanda_zona filtra `demanda_insatisfecha` por zona sin índice | `create_index([('zona',1)])` + $group |
| P2 | n_plus_1 | `notifications_engine.py:422` | rule_forecast_trend_alert: por usuario dedupe.find_one + emit | Multikey index en saved_zones + dedupe con $in |
| P2 | n_plus_1 | `routes/dev_batch4_1.py:1778` | inmobiliaria_dashboard: ≤20 asesores × 3 count sobre leads | 1 `$aggregate` $group por asesor_id |
| P2 | redundante | `demand_intelligence.py:869` | trend_alerts: 5 full-scans independientes de buyer_signals | 1 query del rango total + partición en Python, o asyncio.gather |
| P2 | redundante | `routes/dev_batch4_1.py:375` | _activity_score: 3 queries en serie × cada other_lead (≤20) en antifraude | asyncio.gather de las 3; o solo el 1er other_lead |
| P2 | sin_limite | `entity_resolution_engine.py:577` | detect_broker_fraud_pattern: O(n²) fuzz sobre ≤200 leads en Python puro | Bloquear por nombre normalizado + run_in_executor + limit |
| P2 | sin_limite | `routes/buyer_signals.py:842` | create_buyer_lead: find() sin límite del histórico 'liked' (el 'viewed' sí tiene limit(50)) | `.limit(50)` al find de likes |
| P2 | sin_limite | `routes/public.py:1724` | list_developments precarga TODOS los `dev_payment_schemes.find({})` por request | Filtrar por project_id de los results (`$in`) o cachear |
| P2 | sin_limite | `routes/scores.py:217` | GET /zones/{id}/scores: to_list(200) sin `.limit()` en la query | `.limit(MAX_RECIPES)` + proyección |
| P3 | indice_faltante | `buyer_score_engine.py:144` | compute_user_score: count sobre appointments por user_id sin índice de user_id | `create_index('user_id', sparse=True)` si el campo existe |
| P3 | redundante | `notifications_engine.py:142` | _send_email_notification crea un httpx.AsyncClient nuevo por email | Reutilizar un AsyncClient a nivel módulo (keep-alive) |

### Batch 11 · DEPENDENCIAS (pip-audit + yarn audit)
- **Backend (52 avisos / 14 paquetes):** subir versión en `requirements.txt` — `starlette`/`fastapi`, `python-multipart` (DoS), `pyjwt` (firma sesiones), `cryptography`, `urllib3`, `aiohttp`, `pymongo`, `idna`, `python-dotenv`, `msgpack`, `pydantic-settings`. `litellm` (7 avisos): probablemente ya no se usa (migración a Anthropic/OpenAI directo) → **evaluar borrar**. Requiere bump + smoke test (riesgo de incompatibilidad).
- **Frontend (59 avisos · 2 críticos/19 altos):** casi todos son transitivos del andamiaje de build (webpack/babel/react-scripts: shell-quote, serialize-javascript, nth-check, ws) → **no viajan al bundle** del navegador. Exposición runtime baja.
