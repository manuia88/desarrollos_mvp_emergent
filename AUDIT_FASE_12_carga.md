# AUDIT FASE 12 — Carga y escalabilidad (objetivo 10,000 usuarios concurrentes)
Fecha: 2026-06-10 · READ-ONLY · Análisis white-box + script de carga en `/load-tests/dmx_load.js` (correr SOLO contra staging)

## RESUMEN EJECUTIVO
El sistema **NO aguanta 10k concurrentes** en su estado actual. Lo primero que cae es cualquier endpoint que toca el **Grafo del Comprador / Estudio** (full-scan de colecciones por request, sin índice ni caché) y los endpoints de **IA/LLM** (latencia + explosión de costo). Bajo carga real con datos, las **queries sin índice** y el **recálculo sin caché** saturan el pool de conexiones de Mongo. Hoy parece "rápido" solo porque la BD está casi vacía (seed in-memory).

> Nota: el arnés QA `scripts/qa_load.py` ya probó 20k docs + 2000 req @ concurrencia 100 → 0 errores 5xx, p95 ~1.1s. Eso valida que NO hay crashes a baja concurrencia, pero NO prueba 10k (y corrió con colecciones de negocio vacías, así que los full-scans no se activaron).

## A) PUNTOS DE QUIEBRE a 10k (análisis de código)

### 1. Base de datos — el cuello principal
- **Full-scan por request:** `grafo_comprador_engine.py:127/142` hace `db.asesor_busquedas.find({})` y `db.asesor_contactos.find({})` SIN filtro, filtrando en Python. A 10k usuarios con datos reales = 10k escaneos completos concurrentes → satura I/O y el pool. `amenidades_engine` igual. `estudio_mercado` llama grafo 2+ veces.
- **Índices faltantes** (Fase 8): developer_reports, market_index_snapshots, cerebro_predictions, units → collection scans bajo concurrencia.
- **Pool de conexiones Motor** (default ~100): se agota con queries lentas concurrentes → requests encolados/timeouts.
- **Sin paginación:** rankings y roll-ups del cubo iteran cursores completos a memoria.

### 2. Caché — recálculo costoso por request
- `lifts_por_factor` se recalcula N veces por request en bancabilidad; el Grafo no cachea; `detectar_drift` ordena en memoria por kind. El Intelligence Engine: scores persistidos (ok) pero el Grafo/Estudio recalculan en vivo.

### 3. Bloqueo / serialización
- Llamadas LLM síncronas dentro de requests (argumentario, copy, predicciones) bloquean el worker mientras esperan al modelo (segundos) → con 10k, los workers se agotan esperando IA.

### 4. Estado en memoria (escala horizontal)
- **Rate-limit in-memory por proceso** (QA4): con varias instancias, el límite se multiplica por nº de instancias y no es global → protección inefectiva a escala. Cachés LRU por proceso. `data_developments.DEVELOPMENTS` es estático en memoria (read-only, no rompe, pero ocupa RAM por instancia).
- **JWT_SECRET efímero** si falta el env (Fase 3): con múltiples instancias, tokens de una no validan en otra → login roto al escalar horizontalmente.

### 5. APIs externas — costo y rate-limit
- **LLM (el más caro):** 10k usuarios pegándole a endpoints de IA = explosión de costo + rate-limit de OpenAI/Anthropic. `studio_buyer_copy` NO tiene guard de presupuesto (Fase 11) → costo descontrolado.
- **Overpass/OSM, BANXICO, INEGI:** rate-limits de terceros; `data_sources/osm_engine` ya da 504 hoy (Fase 10/QA4).

### 6. Otros
- Uploads (PDF/assets) sin límite de tamaño verificado (Fase 7) → memoria/disco bajo carga.
- API v1 sin throttle de ráfaga (Fase 10) → un cliente puede saturar.

## B) SCRIPT DE CARGA
`/load-tests/dmx_load.js` (k6): rampa progresiva 0→10% →50%→100%→sostenido→bajada, sobre 5 journeys (marketplace search, AVM público, dashboard/IE, estudio/grafo, captura de lead). Thresholds: p95<1.5s, p99<3s, errores<2%. **Empezar con `STAGE_MAX=200` y subir gradualmente.** Instrucciones en el header del script. Correr SOLO contra staging.

## C) CAPACIDAD ESTIMADA (sin los fixes)
- **Techo estimado:** bajo — del orden de **cientos de usuarios concurrentes** activos golpeando endpoints de Estudio/Grafo/IA antes de degradarse, una vez que las colecciones tengan datos reales (los full-scans se activan con dato). Los endpoints estáticos/cacheados (ficha pública, colonias) aguantan más.
- **Qué cae primero:** (1) Estudio/Grafo (full-scan) → latencia se dispara y satura el pool Mongo; (2) endpoints LLM → timeouts + costo; (3) login si hay múltiples instancias con JWT efímero.
- **Curva de costo a 10k:** dominada por LLM — sin guard de presupuesto en todas las rutas, el costo crece lineal con usuarios y sin tope. Estimar tras medir % de tráfico que toca IA.

## D) FIXES PARA ESCALAR (prioridad)
1. Índices (Fase 8) + empujar filtros al query (matar full-scans del Grafo) + caché con TTL.
2. Rate-limit global (Redis, no in-memory) + throttle de ráfaga en API v1 + guard de presupuesto en TODA llamada LLM.
3. JWT_SECRET fijo (no efímero) para escalar horizontalmente.
4. Paginación en listas/rankings; agregación server-side ($group) en el cubo.
5. LLM asíncrono (cola) para no bloquear workers.

## Pendiente de verificar (requiere staging + acción tuya)
Correr `/load-tests/dmx_load.js` contra staging con datos realistas para obtener p95/p99/throughput/tasa de error reales y el techo numérico. El análisis de arriba es white-box.
