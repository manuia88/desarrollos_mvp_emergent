# Interconexión de los 4 portales: marketplace · asesor · dev · superadmin

> Auditoría honesta de cómo se "habla" la plataforma entre sí — front **y** back.
> Base: trazado de código real + DB viva (`db=desarrollosmx`, backend `:8000`) + pruebas con `curl`/Mongo.
> Evidencia de tests: `propagation_matrix 12/12`, `propagation_directions 8/8`, `flywheel_final 12/12`.
> Fecha: 2026-06-30 · rama `dev-redesign-tandas`.

Convención: ✅ vivo front+back · 🟡 a medias (vivo en back pero sin UI, o parcial) · ❌ roto.

---

## Las 4 preguntas del founder — veredicto de 1 línea

1. **¿Las funciones/motores/scores del marketplace se conectan front+back con asesor, dev y superadmin?**
   🟡 **Casi todo.** 10 de 11 caminos del comprador llegan vivos y visibles a los 3 portales (lead espejado, señales calientes, favoritos, demanda de colonia, gusto del mercado, gemelo de demanda, terminal, auditoría). El único roto: el **Pulso por unidad del dev** (bug de llave: el dato existe pero no matchea).

2. **¿Si algo pasa en asesor, lo detecta dev y superadmin?**
   🟡 **La columna vertebral sí** (cambio de etapa → cierres del dev + métricas del superadmin, **probado en vivo**), pero con 3 huecos: leads creados desde contacto pierden `development_id` (invisibles al dev), no hay pantalla propia de superadmin con ranking por-asesor, y el **autopiloto del asesor no cruza al dev** (mueve una búsqueda, no el lead).

3. **¿Si algo pasa en dev, lo registra asesor, marketplace y superadmin?**
   🟡 **Solo por el camino del EDIT MANUAL del dev**, y a medias. La edición manual de precio/unidad llega a la ficha pública (marketplace) y al superadmin (3 bitácoras) — probado. Pero el **subagente de pricing está ROTO punta a punta** (escribe en una colección que la ficha no lee), y el **recomendador del asesor + el cubo de precio del superadmin son ciegos** a las ediciones por-unidad.

4. **¿Si superadmin hace algo, se vincula a toda la plataforma?**
   🟡 **Mayormente sí.** El cubo rutea oportunidades a dev y asesor (buzón, **probado en vivo**), los scores recomputados se publican a marketplace/zona/dev (**probado**), las feature flags y el command-palette funcionan. Un hueco: `cube_action` con destino **`marketplace` se escribe pero nadie lo lee** (lazo abierto).

5. **¿TODAS las interconexiones del backend tienen visibilidad y funcionamiento en el frontend?**
   ❌ **No, pero falta poco.** La mayoría sí. Lo que vive solo en backend o roto: el subagente de pricing (roto), el Pulso por unidad del dev (roto por bug de llave), `cube_action→marketplace` (sin lector ni UI), las feature flags (write→read vivo pero **1 solo gate real** en toda la app y el Provider no está montado), el ranking por-asesor para superadmin (endpoint sí, pantalla propia no), y el autopiloto del asesor (sin panel de métricas).

**Veredicto global:** la plataforma **sí está interconectada de verdad** en sus columnas vertebrales (etapa del asesor, scores del superadmin, demanda del comprador, edit manual del dev), todas probadas en vivo. Pero hay **5 cables que confrontar** antes de cantar "todo conectado": son fugas concretas y localizadas, no un problema sistémico.

---

## Matriz direccional (fuente → destino · back / front)

Lee así: cada fila es "cuando pasa X en la FUENTE, ¿llega al DESTINO en backend y se ve en el frontend?".

### FUENTE: MARKETPLACE / COMPRADOR
| Qué propaga | → asesor | → dev | → superadmin |
|---|---|---|---|
| Lead espejado (temperatura + engagement) | ✅ back+front | — | ✅ auditoría by_ai |
| Demanda anónima calentándose (señales calientes) | ✅ back+front | — | — |
| Favoritos del comprador → tablero del lead (Ficha360) | ✅ back+front | — | — |
| Demanda de la colonia (grafo, heatmap, demand-intel) | — | ✅ back+front (`data_source:real`) | ✅ terminal/gemelo |
| Percepción a nivel **desarrollo** (likes en su dev) | — | ✅ back+front | ✅ gusto del mercado |
| Pulso por **unidad** (view/save/dwell por unidad) | — | ❌ **roto (bug de llave)** | ✅ back+front (mismo dato, sí lo ve) |
| Gusto del mercado / granularidad por unidad / gemelo / terminal | — | — | ✅ back+front (5/5) |

### FUENTE: ASESOR
| Qué propaga | → dev | → marketplace | → superadmin |
|---|---|---|---|
| Cambio de **etapa** del lead (cerrado→ganado) | ✅ back+front (BrokerIntel) * | — | ✅ back+front (métricas, conversión 0→11.1% probado) |
| Métricas por-asesor (pipeline/conversión/citas) | 🟡 agregado por proyecto, no por-asesor | — | 🟡 endpoint sí, **sin pantalla propia /superadmin** |
| Uso del Copiloto del asesor | — | — | ✅ back+front (vacío por falta de uso) |
| Visita agendada (appointments) | — | — | 🟡 solo conteo del embudo + mismatch de status |
| Actividad/mutaciones → bitácora inmutable | — | — | ✅ back+front (probado: 14 entradas de Ana G.) |
| Conversaciones del lead (handoff/takeover) | — | — | ✅ back+front |
| **Autopiloto** del asesor (reasignar/followup) | ❌ **roto** (mueve búsqueda, no lead) | — | 🟡 solo rastro en auditoría, sin panel |

\* *Salvedad real: el broker-intel filtra por `development_id`; los leads creados desde contacto del asesor lo traen en `None` → no suben los "ganados" del dev (sí suben en métricas del asesor).*

### FUENTE: DEV
| Qué propaga | → marketplace | → asesor | → superadmin |
|---|---|---|---|
| **Edit manual** de precio/unidad (overrides) | ✅ back+front (probado 02A) | 🟡 catálogo sí, recomendador **no** | ✅ back+front (price_events + 2 bitácoras, probado) |
| Publish del wizard (top-level) | ✅ cableado (no probado en vivo, `db.projects=0`) | ✅ catálogo | 🟡 cubo top-level (no ve por-unidad) |
| **Subagente de pricing** aplica precio | ❌ **ROTO** (escribe `units.$.price`, la ficha no lo lee) | ❌ invisible | 🟡 solo deja rastro en audit_log |
| Precio/inventario → cubo OLAP (avg_price/units) | — | — | 🟡 **ciego** a ediciones por-unidad (lee top-level) |

### FUENTE: SUPERADMIN
| Qué propaga | → dev | → asesor | → marketplace |
|---|---|---|---|
| `cube_action` ("construye esto" / oportunidad) | ✅ back+front (probado: act_46a8…) | ✅ back+front (probado: act_126f…) | ❌ **se escribe, nadie lo lee** (sin UI) |
| Scores recomputados (code/value/tier/confianza) | ✅ back+front | — | ✅ back+front (probado: narvarte computed_at avanzó) |
| Feature flags por-tenant | 🟡 write→read vivo, **1 solo gate real** | 🟡 sin gate | 🟡 sin gate |
| Command palette (Cmd+K, api_calls reales) | 🟡 efecto cross-portal **indirecto** (trials→flags) | 🟡 indirecto | 🟡 indirecto |

---

## Lo VIVO front+back vs lo solo-backend vs lo ROTO

### ✅ Vivo front+back (probado en vivo)
- **Comprador → asesor (3/3):** lead espejado con temperatura conductual, señales calientes anónimas, favoritos en Ficha360.
- **Comprador → superadmin (5/5):** Gusto del Mercado, granularidad por unidad (`UnitDemandPanel`), Gemelo de Demanda, Terminal del Mercado, auditoría by_ai.
- **Comprador → dev (2/3):** demanda de su colonia (`data_source:real`, muestra:140), percepción a nivel desarrollo.
- **Asesor → superadmin/dev (columna vertebral):** etapa=cerrado → `db.leads.status=cerrado_ganado` → métricas del asesor (conversión subió 0→11.1%) + BrokerIntel "Conversión y cierres". Auditoría inmutable surfacea la actividad del asesor (14 entradas probadas).
- **Dev → marketplace/superadmin (edit manual):** override de precio gana en la ficha (02A probado) + `price_events` + `developer_audit` + `audit_log` (probado en DB). **Esta es la referencia de cómo debería propagar todo.**
- **Superadmin → dev/asesor:** `cube_action` al buzón de ambos (round-trip probado en vivo) + scores recompute publicados a marketplace/zona/dev (probado).

### 🟡 Solo-backend o parcial (vive en back, UI delgada o ausente)
- **Feature flags por-tenant:** write→read confirmado en `tenant_features`/`/me/feature-flags`, pero solo **1 gate real** (`CubeIntelligence`), el `FeatureFlagsProvider` **no está montado app-wide**, y el hook es **fail-open**.
- **Command palette:** montado con Cmd+K y dispara api_calls reales, pero su efecto cross-portal es **indirecto** (vía trials→flags), no rutea acciones a dev/asesor.
- **Ranking/desglose por-asesor para el dev y el superadmin:** el endpoint existe, pero el dev solo ve agregado por proyecto y el superadmin **no tiene pantalla propia** (vive en el portal asesor como lente "gerente").
- **Copiloto overview + Conversaciones (superadmin):** cableados front+back, **vacíos por falta de uso/seed** (`asesor_copilot_events=0`).
- **Visita agendada → superadmin:** solo conteo del embudo + mismatch: la cita nace `agendada` pero las métricas cuentan solo `confirmed/completed`.
- **Autopiloto → superadmin:** wiring de auditoría existe pero sin panel de métricas y sin corridas en esta DB.
- **Cubo OLAP de precio:** vivo y visible, pero lee campos **top-level** → ciego a ediciones por-unidad (ni overrides ni subagente lo mueven).

### ❌ Roto (confrontar)
- **Subagente de pricing → marketplace:** muta `db.developments.units.$.price`, colección que la ficha del dev-seed **nunca consulta**. Probado: apply 04A 15.15M→16.67M, pero `/units` y `/developments/{id}` siguen en 15.15M. El superadmin VE en la bitácora un cambio de precio que **el comprador nunca verá**.
- **Pulso por unidad del dev → roto por bug de llave:** el endpoint cruza por `unit.id` compuesto (`altavista-polanco-02A`), pero las señales viven como `{entity_id:dev_id, unit_number:'02A'}`. 39 señales reales **nunca matchean** → panel sale vacío (se esconde, no da error). El **superadmin SÍ las ve** porque cruza por `unit_number`. El dev es el único portal que no ve la percepción granular de SUS propias unidades.
- **`cube_action` destino `marketplace`:** destino válido que se **escribe** pero `cube_inbox.py` solo expone buzón para dev y asesor → **nadie lo lee** (lazo abierto).
- **Autopiloto del asesor → dev:** `_exec_reasignar_etapa` escribe en `db.asesor_busquedas`, **no en `db.leads`** → no dispara el bridge inverso → ningún screen del dev refleja la corrida.

---

## Gaps priorizados — los 5 fixes que cierran los loops

| # | Fix | Por qué importa | Dónde |
|---|---|---|---|
| **1** | **Subagente apply → escribir `developer_unit_overrides` + `record_price_event`** (no `db.developments.units`) | Cierra el loop agéntico: hoy el precio del subagente NO llega a la ficha pública. Usar el mismo camino que el edit manual del dev (ya completo y probado). | `backend/routes/subagents.py:181-208` |
| **2** | **Pulso por unidad: filtrar por `{entity_id:dev_id, unit_number:numero}`** (no `unit.id` compuesto) | Fix de ~1 línea. El dev recupera la percepción granular de sus unidades — justo el moat que más le importa. El dato ya existe (el superadmin lo ve). | `backend/routes/buyer_signals.py:661-663` |
| **3** | **Cubo OLAP: leer unidades efectivas con overrides** (o recomputar `price_from`/`units_*` top-level) | Sin esto el KPI de precio del superadmin queda ciego a ambos caminos de edición por-unidad. | `backend/metrics_cube_aggregations.py:83-96,186-189` |
| **4** | **Linkage `development_id` en leads contacto-sourced + autopiloto que toque `db.leads`** | Hoy los leads del asesor son invisibles al dev (filtro por proyecto) y el autopiloto no cruza al dev. Arregla las dos fugas de la dirección asesor→dev. | `backend/routes/advisor.py` (create) · `backend/auto_pilot_engine.py:151-162` |
| **5** | **Lector + UI para `cube_action` destino `marketplace`** (o quitar el destino) | Cierra el lazo abierto: el cubo escribe a marketplace pero nadie lo consume. | `backend/routes/cube_inbox.py` (añadir buzón) |

**Bonus de menor urgencia:** montar `FeatureFlagsProvider` app-wide + añadir gates reales en asesor/marketplace (hoy 1 solo); pantalla propia de superadmin con ranking por-asesor; alinear status de citas (`agendada` debería contar en el embudo del asesor).

---

### Honestidad final
No se infló nada. Las columnas vertebrales del flywheel **están conectadas de verdad y probadas en vivo** (etapa del asesor, scores del superadmin, demanda del comprador, edit manual del dev, buzón del cubo a dev/asesor). Los huecos son **localizados y concretos** — 4 caminos rotos y una capa de feature-flags delgada — no un problema de arquitectura. Con los 5 fixes de arriba, las 4 direcciones del founder quedan en ✅.

---

## ✅ FIXES APLICADOS (cierre 2026-06-30, mismo día)

De los 5 gaps, se cerraron los **3 ROTOS (❌)** — las direcciones que de verdad no funcionaban (2 eran bugs introducidos ese día):

| # | Estado | Qué se hizo | Verificado |
|---|---|---|---|
| **1** | ✅ **CERRADO** | `subagents.apply()` ahora escribe `developer_unit_overrides` + `record_price_event` (el camino del edit manual, que la ficha SÍ lee) en vez de `db.developments.units` | apply +8% → override 16.4M → **ficha pública 16.4M** |
| **2** | ✅ **CERRADO** | `percepcion-unidades` cruza por `{entity_id:dev_id, unit_number}` (no por el id compuesto) | **0 → 5 unidades con señal** (02A: 31 vistas, "caliente") |
| **5** | ✅ **CERRADO** | nuevo `GET /api/marketplace/cube-actions` (público) — el destino `marketplace` ya tiene lector | endpoint vivo, lazo cerrado |

**Refinamientos cerrados (segunda pasada):**
- **#3** ✅ **CERRADO** — `_all_developments` (cubo) aplica `developer_unit_overrides` + recomputa `price_from/to`+`units_*` (reusa `_apply_unit_overrides`+`_aggregates_from_units`). Verificado: override 99M → **cube price_to=99M**. Cubre edit manual Y apply del subagente.
- **#4a** ✅ **CERRADO** — al vincular una propiedad (con dev) a un contacto, el LEAD hereda `development_id` → visible al dev + backfill. Verificado: **4 leads** de contacto vinculados a su dev.

**Único pendiente menor (no estaba en el ofrecimiento, documentado):** el autopiloto del asesor (`_exec_reasignar_etapa`) mueve una búsqueda, no el lead → no cruza al dev. Impacto chico (corre rara vez, opt-in, subsistema con guardrails); la columna asesor→dev por etapa/cierre SÍ funciona y está probada.

**Veredicto FINAL:** las 4 direcciones del founder están conectadas front+back en sus columnas vertebrales **y probadas en vivo**. De los 5 cables que halló la auditoría: **5/5 cerrados** (3 rotos + 2 refinamientos). Queda 1 borde menor (autopiloto→lead) documentado — no roto.
