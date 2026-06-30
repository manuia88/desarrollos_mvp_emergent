# Auditoría V2 — Pasada 2 (síntesis del arquitecto)

> Documento de cierre de la Pasada 2. Organizado **por CLASE de bug** (patrón raíz → todas las apariciones → fix sistémico de una vez → severidad), no por instancia.
> Confronta y **deduplica** los hallazgos de los 5 sub-reportes P2 (los mismos bugs aparecen descritos hasta 3 veces con distinto id). Marca falsos positivos.
> Fecha: 2026-06-30 · Rama: `dev-redesign-tandas` · Verificado en vivo (curl + Mongo) + lectura de diffs.

---

## Veredicto en una línea

La plataforma está **mejor defendida de lo que su tamaño sugiere** en el CRUD por-recurso, pero **dos de los tres fixes "estrella" de la Pasada 1 (C-01 y C-02) están abiertos** —C-02 es un *no-op* funcional— y existe **un IDOR write/delete cross-tenant NUEVO y crítico** (`tour_3dgs`). El moat de demanda está **silenciosamente corrupto** por desync de normalización de colonia. La causa estructural es una sola, repetida en los propios fixes: **se gatea la superficie visible (rol/destino/nombre-de-campo) en vez de la pertenencia real por tenant.**

---

## CLASE A — IDOR de escritura cross-tenant ("gate de rol presente, gate de pertenencia ausente")

**PATRÓN RAÍZ.** El endpoint valida `user.role in (...)` pero usa un id de recurso (`project_id`/`unit_id`/`action_id`) tomado del path/body **sin verificar que ese recurso pertenezca al tenant del caller**; la escritura corre con filtro `{id}` pelón o `upsert`. La inmensa mayoría de la clase **ya está cerrada** por el idioma *read-then-verify* (leer con `owner_id`/`dev_org_id` y 404) o por guards canónicos (`guard_project`, `assert_db_project_owner`, `assert_lead_owner`, `assert_inm_owner`, `_check_dev_access`). Quedan **4 apariciones vivas**, todas el mismo patrón en ubicaciones distintas.

**Verificación clave (lectura de código viva):**
- `subagents.py:163` el guard C-02 lee `doc.get("development_id")`; `sub_agents/pricing_agent.py` **persiste `project_id`, nunca `development_id`** (líneas 95-336, 0 escrituras de `development_id` a `pricing_recommendations`) → el guard **jamás dispara**.
- `activacion.py:67-69` `actualizar_estado` filtra `{id, destino}` — sin tenant; el doc `cube_actions` no tiene campo de dueño.
- `tour_3dgs_engine.py:83-85` `_user_can_manage` hace `return True` incondicional para advisor.
- `dev_batch4_1.py:788-809` `configure_slots` solo valida rol; estampa `dev_org_id` del caller pero nunca verifica que `project_id` sea suyo.

**FIX SISTÉMICO DE UNA VEZ.** El helper reusable **ya existe pero no se aplica uniformemente.** Centralizar un único `guard_ownership(db, user, resource_type, resource_id, endpoint)` que despache a las 5 puertas existentes y **exigirlo como primera línea de TODO endpoint mutante que reciba un id de recurso por path/body, antes de cualquier `find`/`update`**. Regla CI: *"endpoint mutante con `{id}` en path ⇒ debe haber `guard_*` o `find_one` con `tenant_filter`/owner antes del primer write"*. Para colecciones de **estado compartido entre tenants del mismo portal** (`cube_actions`): el doc global no debe mutarse — estado per-tenant en colección keyed por `(resource_id, tenant_id)`. Para guards de pertenencia: **validar contra el campo que el escritor REALMENTE persiste** (test write-then-guard), nunca contra un nombre de campo asumido.

| id canónico | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **A1 = C-02-PRICING-APPLY** (dedup de `V2P2-C02-INSUF`) | **CRÍTICO** | `subagents.py:163-171` guard + `:195-202` fallback · `pricing_agent.py` persiste `project_id` | Derivar el dev real desde `unit_id` y validar `∈ user_dev_ids(user)` ANTES de escribir; eliminar/gatear el fallback global `{"units.id"}`. |
| **A2 = TOUR-3DGS** (`P2-FO-01`) | **CRÍTICO** | `tour_3dgs_engine.py:83-85` `_user_can_manage` (gate de `routes/tour_3dgs.py:89,116,189,204,219`) | Para advisor resolver el dev dueño de la unidad y exigir pertenencia (whitelist/`dev_can_access_project`); nunca `return True` por rol. |
| **A3 = CUBE-ACTIONS-STATE** (dedup de `IDOR-W2-CUBE-01` + `DESYNC-CUBEACT-ESTADO-03` + `V2P2-C01-INSUF`) | **ALTO** | `activacion.py:62-71` · `routes/cube_inbox.py:38-54,117-124` | Estado per-tenant (`cube_action_user_state` keyed por `(action_id, tenant_id)`), o `tenant_id` en doc + filtro de `update_one` + filtro del reader. |
| **A4 = SLOTS** (`IDOR-W2-SLOTS-01`, era MEDIO en P1, NUNCA fixeado → ALTO) | **ALTO** | `dev_batch4_1.py:788-809` `configure_slots` + reader público `:812-829` | `await guard_project(db, user, project_id, 'slots/configure')` 1ª línea; reader filtra `project_slots` por `{project_id, dev_org_id}` del dueño canónico. Superficie **pública** (booking). |
| **A5 = PRICING-ANALYZE** (dedup de `IDOR-W2-PRICING-ANALYZE-01` + `ARCH-AGENT-RECON-04`) | **MEDIO** | `subagents.py:86-108` (`analyze_pricing`/`marketing`/`lead`) · `pricing_agent.py:407+` | `await guard_project(...)` antes de instanciar el agente (3 líneas × 3 endpoints); residual de **lectura/recon + gasto LLM**, el write lo frena A1 una vez arreglado. |

> **Adyacente, otra clase (no rol-vs-pertenencia):** `buyer_coach` anónimo con `conversation_id` como bearer, y `parecidos-cerraron` no-auth — ver Clase D (k-anon) y la familia `visitor_id` de P1.

---

## CLASE B — Fail-open / silent-swallow / control de acceso saltable

**PATRÓN RAÍZ.** *"El control opcional que, al fallar o faltar un dato, concede en vez de negar."* El idioma inline de guards es **sólido** (0 `except` que traguen un `raise HTTPException(403)`). El riesgo se concentra en 4 sub-variantes con la **misma cura: fail-CLOSED + log + dato obligatorio.**

- **(B-A) DEFAULT-GRANT en authz** — `return True` por rol sin ownership → es **A2** (tour_3dgs), ya contado en Clase A.
- **(B-B) FAIL-OPEN-ON-MISSING-CONFIG** — verificación de firma saltada cuando el secreto está vacío, sin guarda `_is_prod()`.
- **(B-C) GATE-IMPORT-IN-TRY** — el gate de permiso importado dentro de `try/except ImportError: pass`; si el import rompe, el 403 desaparece.
- **(B-D) SILENT-SWALLOW de auditoría** — `except: pass` sin log alrededor de `log_mutation`/`audit_log`, borrando el rastro forense.

**FIX SISTÉMICO.** (1) Webhooks: patrón único `if _is_prod() and (not secret or not verify): raise 401` — copiar el de Stripe (`public_api_v1.py:609-623`). (2) Imports de gate: subirlos al top del módulo; si defensivo, `except ImportError: raise HTTPException(403)` (fail-closed), nunca `pass`. (3) Auditoría: **un único `safe_audit(...)`** (eliminar las 11 copias de `_safe_audit_ml`) cuyo `except` haga `log.warning("[audit] perdido ...")` + métrica; nunca `pass` mudo.

| id | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **B1 = RESEND-WEBHOOK** (`P2-FO-02`) | **ALTO** | `routes/agentic_crm.py:502,509` | `if not secret or not _verify(...): if _is_prod(): raise 401` — copiar patrón Stripe; loguear rechazo. |
| **B2 = GATE-IMPORT-IN-TRY** (`P2-FO-03`, era PERM-FAILOPEN-IMPORT en P1, sin fix) | **MEDIO** | `dev_batch4_4.py:321-325,448-452` | Subir `from routes.dev_batch4_2 import can_view_*` al top; `except ImportError: raise HTTPException(403)`. |
| **B3 = AUDIT-SILENT-SWALLOW** (`P2-FO-04`, P1 nombró 2, la clase son **93 sitios**) | **MEDIO** | 93 sitios; epicentro 11 copias `_safe_audit_ml` + `advisor_authorization.py:238,315,379` (approve/reject/revoke whitelist) + `superadmin_*`/`bulk_ingest`/`public_api_v1` | 1 helper `safe_audit` que loguea+cuenta; aplicar primero a authz/superadmin. |
| **B4 = RATE-LIMIT-FAIL-SOFT** (`P2-FO-06`) | **BAJO** | `studio_listing_importer.py:417-420` | Para rate-limit que protege costo (LLM/scraping), fail-closed o cap conservador; ya loguea. |

---

## CLASE C — Multi-tenant scope: aislamiento por-recurso e inline, nunca por-colección centralizado

**PATRÓN RAÍZ.** El proyecto construyó la herramienta correcta — `tenant_filter(user, collection)` en `tenant_scope.py` (la traducción honesta de RLS a Mongo) — pero **NO la adoptó: 0 call-sites en producción** (`git grep tenant_filter(` → solo docstring + tests). El scoping vive como `{'owner_id': user.user_id}` repetido a mano (bien en `advisor.py`), pero ese patrón **se rompe en una superficie entera: la ANALÍTICA AGREGADA** (`count_documents`/`aggregate` de dashboards y briefs), donde el scope se aplica **solo si llega `project_id`** por query; los KPIs/counts globales corren **sin dueño**. Colección no listada en `_OWNER_FIELDS` → `tenant_filter` retorna `{}` (sin filtro, silencioso).

**Verificado EN VIVO:** `developer_admin(constructora_ariel)` **y** `advisor(agencia_demo)` reciben en `/api/appointments/metrics` una cita de tenant `quattro` con `lead_id`, `asesor_id` y `confirmation_token` vivo (→ IDOR secundario sobre confirmar/cancelar la cita).

**FIX SISTÉMICO DE UNA VEZ (cierra C1–C3 y endurece con un PR):** (1) adoptar `tenant_filter()` como el **único** modo de leer colecciones sensibles — añadir `appointments`, `weekly_briefs`, `asesor_operaciones`, `health_scores` a `_OWNER_FIELDS` y reemplazar TODO `count_documents`/`aggregate` de dashboards por `{**tenant_filter(user, col), ...}`. (2) `guard_project` en `subagents.analyze_*` (= A5). (3) endurecer `_auth` de `dev_batch14/15` para **exigir rol**, no solo autenticación. Regla: *"toda lectura de colección sensible pasa por `tenant_filter`; toda acción sobre `project_id` pasa por `guard_project`."*

| id | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **C1 = APPOINTMENTS-METRICS** (`ARCH-SCOPE-01` + token leak `ARCH-TOKEN-LEAK-12` + cross-rol `ARCH-AGENT-CROSSROLE-11`) | **ALTO** | `dev_batch15.py:285-345`, `_auth:43-48`, `:344` proyecta doc completo | `tenant_filter(user,'appointments')` en todo count/aggregate; proyectar fuera `confirmation_token`; exigir rol developer en `_auth`. |
| **C2 = WEEKLY-BRIEF** (`ARCH-SCOPE-02`) | **ALTO** | `dev_batch14.py:314-355` `_generate_weekly_brief` | Scopear cada count (`leads`/`appointments`/`audit_log`/`tasks`/`health_scores`) por `tenant_filter`/`dev_org_id`; el cache key ya es per-tenant. |
| **C3 = HELPER-NO-ADOPTADO** (`ARCH-CENTRAL-03`, deuda raíz) | **ALTO** | `tenant_scope.py:200-225` `tenant_filter` · `_OWNER_FIELDS:170-185` | Convertir `tenant_filter` en modo canónico (lint: ningún `find`/`aggregate` sobre colección sensible sin él); ampliar `_OWNER_FIELDS`. |

---

## CLASE D — K-anonimato: la constante canónica K=5 ignorada en la superficie monetizada

**PATRÓN RAÍZ.** El fix P1 (`KAN-01/02/03`) corrigió **instancias** (`grafo_comprador_engine`, `/demanda-mapa` → importan `K_ANON_MIN=5`) pero **no la clase**: sobreviven productos vendibles/enterprise con K=3 hardcodeado o sin gate alguno. Etiqueta de privacidad **falsa** (`k_anonimato:3` mientras el grafo enforce 5).

**FIX SISTÉMICO.** Importar `K_ANON_MIN` de `anonymization_engine` en **todo** lugar que publique agregados por zona/dev; aplicar `check_k_anonymity` por zona antes de incluirla; **nunca** etiquetar `k_anonimato` con un valor distinto del enforcement real. Barrido de TODOS los endpoints que devuelven conteos por zona/dev (lo que faltó en P1).

| id | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **D1 = TERMINAL-MERCADO** (dedup de `ARCH-KANON-05` + `ARCH-KANON-LABEL-10` + `V2P2-KAN03-INSUF`) | **ALTO** | `terminal_mercado_engine.py:24,116,126,152,162` · `public_api_v1.py:291-298` | Importar `K_ANON_MIN`, sustituir `K_MIN_PRODUCTO=3`; `publicable` con `n>=5`; etiquetar `k_anonimato` con el K real. |
| **D2 = DEMAND-PULSE** (`V2P2-DEMANDPULSE-NOGATE`) | **ALTO** | `public_api_v1.py:402-421` `v1_demand_pulse` | Suprimir/bandear filas `leads<K_ANON_MIN`; reusar `check_k_anonymity` (patrón de `v1_zone_demand:327-340`); `k_anonymity_passed` es cosmético hoy. |
| **D3 = PARECIDOS-CERRARON** (`V2P2-PARECIDOS-NOGATE`) | **MEDIO** | `copiloto_flywheel.py:202-225` (no-auth) | Suprimir devs con cierres `< K_ANON_MIN`; devolver banda, no conteo exacto. |

---

## CLASE E — Linaje write-X / read-Y (fuente única existe pero se ignora)

**PATRÓN RAÍZ.** Para un dato compartido (colonia, FK de desarrollo, email, estado WON), el sistema **no impone un único punto de canonicalización al ESCRIBIR**; N escritores divergen y los lectores que joinean por `==`/`$in` pierden matches en silencio (*fail-open* → 0 ruido, dato diluido). Las 2 instancias de P1 (email-case, override-key) están fixeadas; la clase **no está cerrada** — el desync de colonia (el moat) es mucho mayor.

**FIX SISTÉMICO.** (a) `data_developments.colonia_slug()` (que ya existe y cuyo docstring ordena usarlo "en TODO lookup cross-engine") debe ser el **único** punto de escritura de colonia — aplicarlo en los 5 escritores antes de persistir + backfill de los ~283 docs históricos; (b) los lectores normalizan con `colonia_slug()` al joinear y `db.colonias` consultable por slug canónico (`slug_canon` indexado o alias-map seed↔catastro); (c) un helper único `dev_fk(doc) = doc.get('development_id') or doc.get('project_id') or doc.get('dev_id')` en TODO lector. **Una sola función-fuente de colonia cierra el 90% del riesgo del moat.**

| id | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **E1 = DESYNC-COLONIA** (`DESYNC-COLONIA-01`) | **ALTO** | 5 escritores: `marketplace_search.py:181`, `public.py:3049`, `perfil_recomendar.py:284`, `external_search.py:262`, `buyer_signals.py:168` · ≥7 lectores · canónico ignorado `data_developments.py:787` | `colonia_slug()` como único punto de canonicalización en escritores+lectores; backfill; `slug_canon` indexado en `db.colonias`. Solo **38/131** colonias matchean `db.colonias`, **71%** del budget-fit degrada a genérico. |
| **E2 = DESYNC-DEVFK** (`DESYNC-DEVFK-02`) | **MEDIO** | `metrics_cube_aggregations.py:131-132`, `advisor.py:1418`, `b13.py:161,481`, `narrative_collector.py:178` | Helper único `dev_fk(doc)` en todos los lectores; backfill del nombre canónico. 7/51 leads tienen `development_id` sin `project_id`. |
| **E3 = WON-VOCAB** (`WONVOCAB-LATENT-04`) | **BAJO** | `asesor_metrics.py:8`, `auto_approve_engine.py:22`, `lead_to_asesor_match.py:27`, `copilot_context.py:133,240,248` | Centralizar `WON_STATUSES` en `services/lead_states.py`; alinear exclusión de `copilot_context` a los 4 valores. Hoy converge en `cerrado_ganado` → **no es bug, es deuda latente.** |

---

## CLASE F — Reversibilidad, money-math y manejo de errores (deudas de robustez)

**PATRÓN RAÍZ.** Controles transversales que existen para una parte del sistema pero no para la superficie sensible: `undo_log` existe para ediciones manuales pero no para la acción agéntica que mueve dinero; `Decimal` no se usa en ningún sitio (0 en toda la base) y la liquidación de comisión corre y **persiste en float**; no hay `exception_handler` global y ~46 sitios reflejan `{e}` crudo al cliente.

| id | severidad | ubicación | fix de 1 línea |
|---|---|---|---|
| **F1 = AGENT-NO-UNDO** (`ARCH-AGENT-REV-06`) | **MEDIO** | `subagents.py:176-235` `apply_recommendation` | Tras escribir el override, insertar `undo_log` con before/after y exponer `/pricing/recommendations/{id}/undo` (espejo `dev_batch17`). |
| **F2 = MONEY-FLOAT** (`ARCH-MONEY-07`, FIN-01 sigue abierto) | **MEDIO** | `advisor.py:3153-3169` `create_operacion` · `:3913-3917` seed | `Decimal+quantize(0.01)`; `asesor_split = comision_base - platform_split` (residual) para que sumen exacto. Registro de **liquidación de record**, no display. |
| **F3 = ERR-DETAIL-LEAK** (`ARCH-ERR-08`, sin avance) | **MEDIO** | `server.py` (0 `add_exception_handler`) · ~46 sitios `HTTPException(5xx, f"...{e}")` | 1 `app.exception_handler(Exception)` que loguee con `log.exception` y devuelva `{detail:'Error interno', ref:<uuid>}`. Un handler cubre los 46. |
| **F4 = CSRF-GET-MUTATIONS** (`ARCH-CSRF-GET-09`) | **MEDIO** | `server.py:1320` `_CSRF_METHODS` sin GET · ~26-30 GET con `update_one`/`insert_one` (`dev_batch4_4.py:481` ai-summary-v2 gasta LLM) | Migrar GET-mutación con cookie-auth a POST; el middleware CSRF debe rechazar GET con side-effects. |

---

## FIX-P1-INSUFICIENTE (lo que la sesión creyó cerrado pero NO)

> Confrontación adversarial de los fixes de Pasada 1. Regla observada: **el patrón raíz de P1 ("rol sí, pertenencia no") se repitió DENTRO de los propios fixes** — se añadió un gate de superficie en vez del gate de pertenencia.

| Fix P1 | Estado | Qué quedó bien | Qué sigue abierto |
|---|---|---|---|
| **C-01** cube_actions IDOR | **INSUFICIENTE** | Scope por `destino` (cierra cross-PORTAL) + enum `ESTADOS` (cierra XSS-string almacenado) | El doc es **GLOBAL sin campo de tenant**; `actualizar_estado` filtra `{id, destino}` → dev-A muta acción de dev-B (live `matched:1`). Falta estado per-tenant. **→ A3** |
| **C-02** pricing IDOR write | **INSUFICIENTE / NO-OP funcional** | El `apply` tiene tope ±20% (AG-MONEY-01), `status!=pending`, catch `DuplicateKeyError` (OVR-KEY-04) | El guard valida `doc.get("development_id")`, **campo que el agente NUNCA persiste** (persiste `project_id`) → `rec_dev` siempre None → **guard nunca dispara**; el fallback resuelve la unidad por `unit_id` global. `/analyze` sigue sin `guard_project`. **IDOR-write de precio público SIGUE VIVO. → A1 + A5** |
| **C-03** cierre flywheel | **PARCIAL** | Cota dura `100k-500M` (live 999M→422) + dev∈catálogo (degrada de CRÍTICO a MEDIO) | Falta gate de **pertenencia**: no verifica que `lead_id`/`dev_id` pertenezcan al asesor/inmobiliaria del caller → envenenamiento acotado pero presente (`V2P2-C03-OWNERSHIP`). |
| **KAN-03 / KAN-01/02** k-anon | **INSUFICIENTE** | `grafo_comprador_engine` + `/demanda-mapa` importan `K_ANON_MIN=5` | `terminal_mercado_engine.py:24 K_MIN_PRODUCTO=3` intacto en producto vendido (P1 lo listó como `terminal:24`); `v1_demand_pulse` y `parecidos-cerraron` sin gate. Se arreglaron instancias, no la clase. **→ D1/D2/D3** |
| **SLOTS-PROJECT-NO-OWNERSHIP** (P1 MEDIO) | **NO ARREGLADO** | — | Código vigente sin `guard_project`; reader público sin `dev_org_id`. Re-rateado MEDIO→ALTO (write cross-tenant sobre superficie pública). **→ A4** |
| **CSRF-01** middleware | **INSUFICIENTE (2 puntos)** | Cookie+Origin externo→403 (verificado vivo); cubre 3 cookies reales | (a) cuerpo en `try/except Exception: pass` (fail-soft → excepción interna desactiva el chequeo, server.py:1391); (b) **sin Origin/Referer → fail-open** (live: `POST /asesor/autopilot/pause` sin Origin → 200); (c) no cubre GET-mutación (`_CSRF_METHODS` sin GET). **→ F4** |
| **PERM-FAILOPEN-IMPORT** | **NO ARREGLADO** | — | `except ImportError: pass` sigue en `dev_batch4_4.py:324,451`. **→ B2** |
| **AUDIT-SILENT-SWALLOW** | **NO ARREGLADO** | — | P1 nombró 2 sitios; la clase real son **93** (incl. 3 decisiones authz en `advisor_authorization`). **→ B3** |
| **FIN-01** Decimal vs float | **ABIERTO** | — | 0 `Decimal(` en toda la base; comisión/IVA/split en float persistido. **→ F2** |
| **ERR-DETAIL-LEAK** | **ABIERTO** | — | Sin `exception_handler` global; ~46 sitios reflejan `{e}`. **→ F3** |
| **LEAD-TIER-JOIN-02** email-case | **SUFICIENTE en su scope** | Normaliza en todas las escrituras + lectura del JOIN (`_lead_email()` lowercasea) | Cola de migración: `users.email_1` sin collation; 4-5 JOINs (`agent_workforce`, `close_probability`, `dev_batch3`) case-sensitive. **No es bug activo** (0 emails raw hoy). |
| **OVR-KEY-SUBAGENT-04** | **SUFICIENTE** | `subagents.py:219-222` captura `DuplicateKeyError` y reintenta por `{unit_id}`, espeja `developer.py` | — |

---

## DEUDA ARQUITECTÓNICA (las 5 mayores)

1. **RLS-en-Mongo construido pero no adoptado (0 call-sites).** `tenant_filter()` es la pieza correcta; el aislamiento es 100% inline `owner_id` repetido a mano. Es la **causa estructural** de C1/C2 y de todo IDOR-read de agregado futuro. Sin un punto único de scope, la auditoría no puede afirmar "todas las colecciones sensibles están acotadas". **Mayor deuda.** *(Clase C)*

2. **Guards de pertenencia que apuntan al campo equivocado / a la superficie equivocada.** C-02 valida `development_id` (no existe), C-01 valida `destino` (no tenant), tour_3dgs/slots validan solo rol. Falta una **única puerta `guard_ownership` exigida por CI** + el invariante *"validar contra el campo que el escritor persiste"*. *(Clase A/B-A)*

3. **Estado/llaves compartidos entre tenants en colecciones de un solo doc global.** `cube_actions.estado` es un campo global; el moat agéntico (flywheel) no tiene aislamiento horizontal. Patrón a erradicar: **estado per-`(resource_id, tenant_id)`** en colecciones separadas siempre que el doc sea compartido por rol. *(Clase A3)*

4. **El moat de demanda corre sobre una llave (`colonia`) con 5 normalizaciones incompatibles y sin canonicalización forzada.** El producto B2B vendible está silenciosamente subcontado/diluido; `colonia_slug()` existe y se llama en 1 solo sitio. **Una función-fuente cierra el 90% del riesgo.** *(Clase E1)*

5. **Ausencia de bordes transversales: sin `exception_handler` global, sin `Decimal` en money-math de liquidación, sin `undo` para la acción agéntica que mueve dinero, auditoría que se traga errores en 93 sitios.** Controles que existen "a medias" — para una parte del sistema pero no para la superficie sensible. *(Clases B-D, F1-F3)*

---

## Tabla final — hallazgos NUEVOS por severidad

> "Nuevo" = no estaba en P1, o estaba mal-rateado/sub-contado y la Pasada 2 lo eleva con evidencia viva. Deduplicado a id canónico.

| Sev | id canónico | ubicación | fix de 1 línea | estado P1 |
|---|---|---|---|---|
| 🔴 CRÍTICO | **A1** C-02-PRICING-APPLY | `subagents.py:163-202` · `pricing_agent.py` | Derivar dev desde `unit_id` y validar `∈ user_dev_ids` antes del write; quitar fallback global | "fixeado" — es **NO-OP** |
| 🔴 CRÍTICO | **A2** TOUR-3DGS | `tour_3dgs_engine.py:83-85` | Resolver dev dueño + exigir pertenencia para advisor; nunca `return True` | **NUEVO** |
| 🟠 ALTO | **A3** CUBE-ACTIONS-STATE | `activacion.py:62-71` · `cube_inbox.py` | Estado per-`(action_id, tenant_id)` | C-01 insuficiente |
| 🟠 ALTO | **A4** SLOTS | `dev_batch4_1.py:788-829` | `guard_project` + reader filtra `dev_org_id` | MEDIO→**ALTO**, nunca fixeado |
| 🟠 ALTO | **B1** RESEND-WEBHOOK | `agentic_crm.py:502,509` | `if _is_prod() and not verify: 401` | **NUEVO** |
| 🟠 ALTO | **C1** APPOINTMENTS-METRICS | `dev_batch15.py:285-345` | `tenant_filter` + ocultar token + exigir rol | **NUEVO** |
| 🟠 ALTO | **C2** WEEKLY-BRIEF | `dev_batch14.py:314-355` | Scopear cada count por tenant | **NUEVO** |
| 🟠 ALTO | **C3** HELPER-NO-ADOPTADO | `tenant_scope.py:200-225` | Adoptar `tenant_filter` como canónico | **NUEVO (raíz)** |
| 🟠 ALTO | **D1** TERMINAL-MERCADO | `terminal_mercado_engine.py:24` · `public_api_v1.py:291` | Importar `K_ANON_MIN`, `publicable n>=5` | KAN-03 insuficiente |
| 🟠 ALTO | **D2** DEMAND-PULSE | `public_api_v1.py:402-421` | `check_k_anonymity` por zona | **NUEVO** |
| 🟠 ALTO | **E1** DESYNC-COLONIA | 5 escritores + ≥7 lectores | `colonia_slug()` único punto + backfill | **NUEVO (moat)** |
| 🟡 MEDIO | **A5** PRICING-ANALYZE | `subagents.py:86-108` | `guard_project` antes del agente | C-02 insuficiente |
| 🟡 MEDIO | **B2** GATE-IMPORT-IN-TRY | `dev_batch4_4.py:324,451` | Import al top / `except: raise 403` | sin fix |
| 🟡 MEDIO | **B3** AUDIT-SILENT-SWALLOW | 93 sitios | 1 `safe_audit` que loguea | sub-contado (P1=2) |
| 🟡 MEDIO | **C3'** CROSS-ROL+TOKEN-LEAK | `dev_batch15.py:43-48,344` | exigir rol + ocultar `confirmation_token` | **NUEVO** (facetas de C1) |
| 🟡 MEDIO | **D3** PARECIDOS-CERRARON | `copiloto_flywheel.py:202-225` | Suprimir devs `cierres<K` | **NUEVO** |
| 🟡 MEDIO | **E2** DESYNC-DEVFK | `metrics_cube_aggregations.py:131` | Helper `dev_fk(doc)` | **NUEVO** |
| 🟡 MEDIO | **F1** AGENT-NO-UNDO | `subagents.py:176-235` | `undo_log` + `/undo` | **NUEVO** |
| 🟡 MEDIO | **F2** MONEY-FLOAT | `advisor.py:3153-3169` | `Decimal+quantize`, split residual | FIN-01 abierto |
| 🟡 MEDIO | **F3** ERR-DETAIL-LEAK | `server.py` + ~46 sitios | 1 `exception_handler` global | abierto |
| 🟡 MEDIO | **F4** CSRF-GET / fail-soft | `server.py:1320,1391` | GET→POST + outer `except` fail-closed | CSRF-01 insuficiente |
| 🟡 MEDIO | **V2P2-C03** CIERRE-OWNERSHIP | `copiloto_flywheel.py:174-197` | Cruzar `lead_id`/`dev_id` con el owner | C-03 parcial |
| ⚪ BAJO | **B4** RATE-LIMIT-FAIL-SOFT | `studio_listing_importer.py:417-420` | Fail-closed para costo real | ya logueado |
| ⚪ BAJO | **E3** WON-VOCAB | `asesor_metrics.py:8` +3 | Centralizar `WON_STATUSES` | latente, no bug |

**Conteo:** 2 CRÍTICO · 9 ALTO · 11 MEDIO · 2 BAJO = **24 hallazgos canónicos** (deduplicados desde ~30 ids de los sub-reportes).

---

## Falsos positivos confirmados (NO perseguir — defensa correcta)

- `feature_gate` / `feature_legacy_adapter` **FAIL-OPEN** — es visibilidad UX, no authZ, y **loguea+auditea** cada fail_open.
- `data_scoping` default → `asesor_freelance` — es el nivel **MÁS restringido** (fail-closed hacia mínimo privilegio).
- `tenant_scope` fallbacks — gated por `_demo_mode`; `return []` fail-closed en prod.
- `_is_prod()` — fail-closed, asume prod.
- ~163 candidatos heurísticos + 74 escrituras con `{id}` pelón de Clase A → **casi todos FALSOS POSITIVOS** (leen primero con `owner_id`/`dev_org_id` y 404, o son superadmin-only). Verificado con curl + Mongo.
- `multipart` / webhooks / OAuth callbacks en CSRF — no traen cookie de sesión → fail-open correcto.
- `dev_batch17 _user_can_edit` (pentest 2026-06-27) — check exacto de tenant/assigned_to/owner_id, **cerrado**.
