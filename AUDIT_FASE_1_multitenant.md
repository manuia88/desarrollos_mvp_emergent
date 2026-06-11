# AUDIT FASE 1 — Aislamiento multitenant
Fecha: 2026-06-10 · READ-ONLY · Stack: MongoDB NoSQL (aislamiento 100% en capa de aplicación)

## RESUMEN EJECUTIVO
La base es **NoSQL sin RLS** → el aislamiento depende de que cada query filtre por tenant. El patrón sano EXISTE y se usa bien en la mayoría del portal asesor (`{owner_id: user.user_id}`) y en varios endpoints dev (`assert_dev_project` / `tenant_scope.user_dev_ids`). PERO hay **fugas reales confirmadas ejecutando con 2 tenants** (QA5): un cluster de endpoints valida SOLO rol (no pertenencia) y, peor, **2 endpoints de MUTACIÓN permiten sobrescribir inventario de otro tenant**. Además `getattr(user,"id")` (campo inexistente; el modelo usa `user_id`) rompe el chequeo de dueño per-asesor en varios lugares.

**Conteo:** P0: 8 · P1: 3 · P2: 1

## Origen del tenant_id (verificado)
- El identificador se deriva de la **SESIÓN** (JWT → `get_current_user` → `user.user_id` / `user.tenant_id` / `dev_org_id`), NO del cuerpo del request, en los endpoints sanos. ✅ patrón correcto.
- EXCEPCIÓN P0: endpoints que reciben `dev_id`/`project_id`/`unit_id` en el path y NO validan que pertenezca al tenant de la sesión → IDOR (abajo).
- Bug transversal: `getattr(user, "id", …)` se usa en ~33 sitios pero `UserOut` expone `user_id` (no `id`) → siempre cae al default → el chequeo de dueño per-asesor en `lead_enrichment._assert_lead_owner` (lead_enrichment.py:80) queda MUERTO (cae al match por tenant) y atribuciones graban identidad falsa.

## TABLA DE AISLAMIENTO (entidades sensibles)
| entidad/colección | operación | filtra por tenant | origen tenant_id | aislamiento probado | severidad |
|---|---|---|---|---|---|
| inventario unidad (`developer_unit_overrides`) | **WRITE** PATCH `/api/desarrollador/inventario/unit-fields` | ❌ solo `unit_id` | sesión (rol) pero NO pertenencia | **PROBADO: A sobrescribe unidad de B** (QA5) | **P0** |
| estatus unidad | **WRITE** PATCH `/inventario/unit-status` | ⚠️ CAS débil | sesión | **PROBADO: doble-venta 3/10 concurrentes** | **P0** |
| insights de proyecto | READ `/api/dev/projects/{project_id}/insights/*` (×8) | ❌ solo rol | sesión (rol) | **PROBADO: A lee GMV/leads/market-value de B** | **P0** |
| battle card | READ `/api/dev/battle-card/{project_id}` (×5) | ❌ solo tier T3 | sesión (tier) | **PROBADO cross-tenant** | **P0** |
| funnel | READ `/api/funnel/{project_id}` + `/breakdown` | ❌ **SIN AUTH** | ninguno | **PROBADO: 200 sin sesión** | **P0** |
| funnel suggestion / sankey attribution | READ | ❌ solo rol | sesión | PROBADO cross-tenant | **P0** |
| argumentario lead | READ `/api/.../argumentario/{lead_id}` | ❌ `_fetch_lead` cae a `find_one({id})` sin org | sesión | código (PII de lead ajeno → guion LLM) | **P0** |
| deseabilidad unidad | READ `/api/dev/deseabilidad/{dev_id}/{unit_id}` | ❌ solo rol | sesión | código (lee unidad de otro dev) | **P0** |
| atribución lead | R/W `/api/leads/{lead_id}/attribution` | ❌ solo rol | sesión | código | **P1** |
| lead_match | READ `/api/lead-match/{match_id}`, `/lead/{lead_id}/recent` | ❌ sin tenant | sesión | código | **P1** |
| grafo contacto | READ `/api/asesor/grafo/contacto/{id}` | ❌ `infer_contacto_segment` ignora owner_id | sesión (getattr id roto) | código | **P1** |
| asesor_contactos (CRUD) | R/W `/api/asesor/contactos/*` | ✅ `{id, owner_id: user.user_id}` | sesión | código (advisor.py:812) — SANO | 🟢 |
| dev inventario/cash-flow/pricing | READ | ✅ `_user_dev_ids` / `assert_dev_project` | sesión | código — SANO | 🟢 |
| API v1 (productos de datos) | READ `/api/v1/*` | ✅ k-anon + tier | api_key | k-anon PROBADO protege con dato real (QA5) | 🟢 |

## HALLAZGOS

### [P0] Mutación cross-tenant: sobrescribir inventario de otro desarrollador
- **Ubicación:** `routes/developer.py` (o `dev_batch*`) → handler `PATCH /api/desarrollador/inventario/unit-fields` y `/unit-fields-bulk`; el write a `developer_unit_overrides` filtra/upserta por `unit_id` solamente.
- **Evidencia:** QA5 ejecutó con 2 tenants (`quattro`=A, `origen`=B): A envió su propio `dev_id` (pasa `guard_project`) + un `unit_id` de B → **HTTP 200**, flipeó la unidad de B a `vendido`/`price=777` y **envenenó el `dev_id`** guardado.
- **Impacto:** un dev altera precio/estatus del inventario de un competidor; corrompe ficha pública, absorción y cubo del otro tenant. Sabotaje + corrupción de datos cross-tenant.
- **Fix propuesto:** incluir `dev_id` en el filtro del update y validar que el `unit_id` pertenece a ese `dev_id` antes de escribir (verificar contra el catálogo de unidades del proyecto).

### [P0] CAS insuficiente en unit-status → doble venta
- **Ubicación:** PATCH `/api/desarrollador/inventario/unit-status` (read-modify-write con `find_one` previo).
- **Evidencia:** QA5 — 10 transiciones concurrentes `disponible→vendido` → **3×200** (debería ser 1). Path de primer-override (upsert) → 8/8 sin candado.
- **Impacto:** doble registro de venta → contamina absorción/AVM/Cerebro; condición de carrera explotable.
- **Fix:** transición atómica `update_one({unit_id, status: prev_esperado}, {$set}, upsert)` con índice único; eliminar el read previo.

### [P0] IDOR de lectura cross-tenant (cluster) — assert_dev_project ausente
- **Ubicación:** `routes/insights.py` (8 endpoints `/projects/{project_id}/insights/*`), `routes/battle_card.py` (5), `routes/funnel.py:84/147/278`, `routes/maps_cross.py:115`, `routes/diagnostic.py:68-157`.
- **Evidencia:** QA5 ejecutado cross-tenant: A obtiene 200 leyendo market-value/health/GMV de proyecto de B. `_auth_dev` solo valida rol; `_project_or_404` resuelve por id sin filtro de tenant.
- **Impacto:** fuga de inteligencia de negocio entre competidores (precios, leads, conversión, GMV).
- **Fix:** añadir `assert_dev_project(user, project_id)` (tenant_scope, ya existe y funciona) en cada handler.

### [P0] `funnel` sin autenticación alguna
- **Ubicación:** `routes/funnel.py:84` GET `/api/funnel/{project_id}`, `:147` `/breakdown`.
- **Evidencia:** QA5 — HTTP 200 **sin header de sesión**; expone total_events/etapas de cualquier proyecto.
- **Fix:** exigir auth + pertenencia.

### [P0] Argumentario LLM con PII de lead ajeno
- **Ubicación:** `routes/agentic_crm.py:1244/1272/1298` → `argumentario_engine._fetch_lead` (:311) `find_one({"id": lead_id})` sin org.
- **Impacto:** un asesor genera un guion de venta con datos personales (PII) del lead de otro tenant.
- **Fix:** quitar el fallback sin-org; validar `lead.dev_org_id`/owner en la ruta.

### [P0] `getattr(user,"id")` rompe el dueño per-asesor
- **Ubicación:** ~33 sitios; crítico en `routes/lead_enrichment.py:80` `_assert_lead_owner`.
- **Evidencia:** `UserOut` (server.py:1188) define `user_id`, no `id` → `getattr(user,"id",None)` → None → cae a `getattr(user,"email")` → la comparación contra `lead.assigned_to` (un user_id) nunca casa → el gate per-asesor queda neutralizado (solo protege el tenant).
- **Fix:** reemplazar por `user.user_id` en los 33 sitios; grep CI que bloquee `getattr(user,"id"`.

### [P0] Deseabilidad de unidad sin scope de dev
- **Ubicación:** `routes/estudio_mercado.py:111` `GET /api/dev/deseabilidad/{dev_id}/{unit_id}`.
- **Evidencia:** `_auth` valida rol; busca `DEVELOPMENTS` por `dev_id` sin chequeo de tenant.
- **Fix:** validar `dev_id ∈ user_dev_ids(user)` (salvo superadmin).

### [P0] Funciones agregadas/reportes que se brincan el filtro (cubo)
- **Ubicación:** `cube_olap_engine` / `metrics_cube_aggregations`.
- **Evidencia:** El cubo agrega sobre seed/`dmx_units` y NO aplica `developer_unit_overrides` → congelado en seed (dev ve 23% vendido, cubo 14% — QA2/5). No es fuga cross-tenant pero sí inconsistencia de la capa agregada. (Severidad de datos → ver Fase 6; aquí se nota porque las agregaciones "se brincan" la fuente de verdad por-tenant.)

### [P1] attribution / lead_match / grafo-contacto sin scope (ver tabla).

## Lo que quedó LIMPIO (revisado)
- Portal asesor CRUD (`advisor.py`): todas las operaciones de contacto/captación filtran `owner_id == user.user_id` (verificado advisor.py:812/826/856).
- Dev inventario/cash-flow/pricing/documents: usan `_user_dev_ids` / `assert_dev_project` / `_check_dev_access`.
- API v1: k-anon + tier; QA5 confirmó por ejecución que k-anon **suprime celdas <K_MIN** con datos reales (no fuga, no sobre-filtra).
- Escalada de rol por token: imposible — rol y tenant se leen de la BD por `sub`, no del JWT (QA5 verificado: inyectar `role:superadmin` en el token → 403).
