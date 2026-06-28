# FINDINGS LEDGER — Testing E2E Cross-Portal v2 (doble-loop)

Append-only. Cada hallazgo: id · severidad · estado · evidencia ANTES/DESPUÉS · quién verificó.
Estados: `open` → `in-fix` → `fixed` → `verified` (Audit B independiente) · `false-alarm` · `wontfix(razón)` · `deferred(plan)`.
Severidad: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🔵 Oportunidad · 🟢 Upgrade.

Baseline de datos: `scratchpad/baseline_20260628.json` (439 colecciones) · backup: `git tag backup-pretest-20260628`.

---

## F0 — Risk Register (descubrimiento, verificado con queries)

| id | sev | hallazgo | evidencia inicial | estado |
|----|-----|----------|-------------------|--------|
| F0-1 | 🔴→🟡 | "Flywheel asesor→copiloto roto / no aprende" | `copiloto_closings`=2, asesor cerrado=0 | **false-alarm parcial** (ver B1) |
| F0-2 | 🔴 | Dos universos de leads + fantasmas (`leads` 51 vs `asesor_contactos` 4, `mirror_pending`=2) | query F0 | open → **B2** |
| F0-3 | 🟠 | Agentes IA audit-dark (sin `by_ai`; `director_messages`=4 en silo; `audit_log` actor `{}`) | query F0 | open → **B3** |
| F0-4 | 🟡 | Índices compuestos faltantes (leads, buyer_signals, asesor_contactos) | barrido D | open → **B4** |
| F0-5 | 🔵 | Huérfanos de alto valor sin UI (forecast/FSD, battle_card, churn, asesor_digest, conversation cost/kb) | barrido D | open → **FASE R** |
| F0-6 | 🟡 | Reconciliación no-ACID (etapa↔status cron 04:20, temperatura cron 6h, cross-device email-O-tel) | lead_bridge.py | open → **B2** |

---

## B1 — Flywheel del aprendizaje (cierre → re-ranking)

### Definition-of-Done (congelado ANTES de tocar código)
1. **DoD-1** (refutación honesta): demostrar con código si el cierre del asesor alimenta el loop. Aserción: la ruta canónica (operaciones→"cerrada") llama `record_closing(price_closed=...)`. → si SÍ, F0-1 baja de 🔴.
2. **DoD-2** (triangulación-dato): un cierre re-materializa `closing_lifts` y `score_devs` lo consume EN VIVO (no cacheado). Reproducir con cierre sintético tagueado `TEST-b1` → assert `closing_lifts.computed_at` cambia + el lift entra al ranking. Teardown → cero-residuo.
3. **DoD-3** (upgrade): el moat aprende >1 factor. Hoy solo `recamaras`. Materializar también `precio` (motor `lifts_por_factor` ya es genérico) y que `score_devs` lo consuma con nudge acotado. Aserción: `closing_lifts.precio` se puebla y el ranking lo lee.
4. **DoD-4** (lateral): harness e2e 13/13 verde post-cambio; sin huérfano/flag/seguridad nuevo; `score_devs` sigue devolviendo dict y el gusto sigue mandando (nudge ≤ peso del gusto).

### Audit A (pre) — hallazgos
| id | sev | hallazgo | evidencia | estado |
|----|-----|----------|-----------|--------|
| B1-A1 | 🔴→🟡 | "asesor→copiloto no cableado" | **REFUTADO por código**: `advisor.py:3185` (operaciones→cerrada) llama `record_closing(... price_closed=...)`, independiente del flag Cerebro. También `advisor.py:1357` (contacto→cerrado). | false-alarm |
| B1-A2 | 🔵→ok | "cache staleness 0-24h en el loop" | **REFUTADO**: `visitor_taste.py:216` lee `closing_lifts` EN VIVO por ranking (no del taste cacheado); `record_closing:109` re-materializa al instante. | false-alarm |
| B1-A3 | 🟢 | El moat aprende **un solo factor** (recámaras). `materialize_closing_lifts` ignora `precio`/amenidades aunque el motor `lifts_por_factor` ya los soporta (`_FACTOR_EXTRACTORS`). | cerebro_mercado_engine.py:123-132 | **in-fix** (upgrade B1) |
| B1-A4 | 🟡 | Contacto→cerrado exige `_lid AND _did` (advisor.py:1356); un cierre sin dev linkeado se salta el loop. | advisor.py:1356 | evaluado · **wontfix** (defendible: un cierre sin propiedad no debe registrar "qué se compró"; documentado) |

### 🔴 Hallazgo REAL (destapado en la reproducción de Audit A)
| id | sev | hallazgo | evidencia ANTES | evidencia DESPUÉS | estado |
|----|-----|----------|-----------------|-------------------|--------|
| **B1-A5** | 🔴 | **El flywheel recomputaba pero NO aprendía.** `materialize_closing_lifts`→`lifts_por_factor` leía el catálogo ESTÁTICO (`DEVELOPMENTS` sold flags), ignorando el log real `copiloto_closings`. Un cierre real no cambiaba los lifts. | Reproducción tagueada: cierre sintético → `closing_lifts.recamaras` **idéntico** ({1:1,2:-1,3:1,4:1,5:6}) antes y después; cero-residuo. | Fix: `materialize_closing_lifts` ahora agrega `real`={n,recamaras,precio} desde `copiloto_closings`; `score_devs` lo consume EN VIVO (umbral n≥3, nudge acotado). Reproducción: dev 5-rec/Premium **59.8→64.3 (Δ+4.5)** con 3 cierres reales de ese perfil; cero-residuo; harness 13/13. | **verified** ✅ |

### Audit B (independiente / adversarial) — convergencia
| id | sev | hallazgo del verificador | acción | re-verificado |
|----|-----|--------------------------|--------|---------------|
| B1-B1 | ✅ | acoplamiento de bandas idéntico · malformados manejados · sin div/0 · 1 sola I/O · sin huérfanos (6 checks) | — | confirmado correcto |
| B1-B2 | 🟠 | doble conteo: catálogo + real SUMAN | catálogo **se desvanece a la mitad** cuando `real_n≥3` (la verdad de campo manda) | Δ pasó +5.4→+4.5, sigue aprendiendo ✅ |
| B1-B3 | 🟡 | perf: `materialize` escanea TODO `copiloto_closings` por cierre+cron (blocker a 10k+) | **ventana de recencia 18m** (mejora señal + acota scan) · índice `closed_at_dt` → **B4** | scan acotado ✅ · índice deferred(B4) |

**B1 CERRADO.** F0-1 resuelto: el flywheel ahora aprende de cierres reales (recámaras+precio), acotado para que el gusto siga mandando. Archivos: `copiloto_flywheel.py` (materialize), `visitor_taste.py` (score_devs). Verificación triangulada: código + reproducción-dato + harness. Pendiente a B4: índice `copiloto_closings.closed_at_dt`.

---

## B2 — Leads fantasma / espejo al CRM (F0-2, F0-6)

### Definition-of-Done (congelado)
1. **DoD-1**: reproducir por qué un lead `mirror_pending` no llega al CRM.
2. **DoD-2**: el espejo se auto-repara SIN reinicio (cron), no solo en arranque.
3. **DoD-3 (lateral)**: sin COLLSCAN horario; sin spin infinito; harness 13/13.

### Audit A (pre)
| id | sev | hallazgo | evidencia | estado |
|----|-----|----------|-----------|--------|
| B2-A1 | 🟠 | `retry_pending_mirrors` corría SOLO en arranque (server.py:1648); hermanos reconcile/temp SÍ tenían cron → lead con espejo fallido invisible hasta reiniciar | grep schedulers | **fixed** ✅ |
| B2-A2 | 🔵 | Los 2 leads fantasma reales tienen `assigned_to=None` → no es fallo de espejo, es **falta de routing/asignación** (lead sin asesor = invisible) | query: ambos assigned_to=None, contacto_espejo=0 | **deferred** (batch de routing; recomendación: cola de "sin asignar" para el admin de inmobiliaria) |

### Ejecución + Audit B (independiente) + convergencia
- **Fix**: `schedule_mirror_retry_cron` (lead_bridge.py) cada hora :15, registrado en scheduler_ie.py (paridad con hermanos).
- **Audit B refutó 2** → convergidos + re-verificados:
  - 🔴 sin índice → `db.leads.create_index([("mirror_pending",1)], sparse=True)` (dev_batch4_1.py). Verificado: `mirror_pending_1` existe.
  - 🟠 spin infinito (unassigned nunca limpian) → el retry filtra a `$or:[assigned_to, asesor_id] ≠ null` → no re-escanea sin-asignar. Verificado.
- **Triangulación**: reproducción tagueada — ASIGNADO se espeja+limpia bandera; SIN-ASIGNAR queda quieto (no spin) y no se espeja; cero-residuo; harness 13/13.

**B2 CERRADO.** Archivos: `lead_bridge.py`, `scheduler_ie.py`, `dev_batch4_1.py`. Pendiente: B2-A2 (routing de leads sin asignar) → batch propio.

---

## B2-A2 — Leads sin asignar (routing de huérfanos) — CERRADO
**Founder: "termina de corregir lo pendiente antes del siguiente batch."**

### Audit A (reproducido)
- 46/51 leads sin asesor, pero **42 son seed** (`source=None`, `_demo_home`); solo **4 reales**. `resolve_public_lead_owner` AHORA asigna bien (round-robin → asesor activo) → los 2 fantasma son **huérfanos históricos** (creados antes de activar asesor). Routing correcto; faltaba (a) re-rutear huérfanos, (b) auto-rutear futuros.

### Fix
- `route_orphan_leads`: rutea leads REALES sin asesor (excluye seed/demo) vía resolve_public_lead_owner + espeja.
- `lead_completeness_sweep` (route + retry) en arranque + cron horario.

### Audit B (independiente) — refutó/convergió
| id | sev | hallazgo | acción | re-verificado |
|----|-----|----------|--------|---------------|
| 🔴 #5 | crítico | **fuga cross-tenant**: un lead de otra org se rutearía al asesor de la casa-default | filtro `dev_org_id ∈ [default,None]` | lead org_B queda None ✅; default se rutea ✅ |
| 🟠 #1 | alto | si el espejo falla post-asignación, queda sin bandera (invisible) | set `mirror_pending=True` en fallo → retry lo recoge | ✅ |
| 🟠 #6 | alto | no avisaba al asesor del lead auto-asignado | `notify_house_admin_new_lead` tras rutear | ✅ |
| 🟠 #2 | alto | sin índice → COLLSCAN horario | **refutado**: índice `(dev_org_id, assigned_to)` (dev_batch4.py:959) ya cubre la query | ✅ |
| 🟡 #3/#4/#7 | medio | activo $ne / round-robin sesgo / sin tests | `activo $ne False` defendible (no perder legacy); round-robin es de resolve (existente); cubierto por reproducción+harness | documentado |

**Verificado**: los 2 fantasma quedaron asignados+en CRM; 0 huérfanos reales; 42 seed intactos; lead de otra org NO cruza; harness 13/13; teardown cero-residuo. Archivos: `lead_bridge.py`, `server.py`.

### Pendientes restantes (de toda la sesión)
- B1-B3 🟡 índice `copiloto_closings.closed_at_dt` → siguiente.
- B1-A4 🟡 revisar wontfix → siguiente.

---

## Pendientes barridos (antes del siguiente batch)

| id | sev | qué | resolución | verificado |
|----|-----|-----|------------|------------|
| B1-B3 | 🟡 | índice `copiloto_closings.closed_at_dt` (el flywheel escanea por recencia) | creado en el ensure de buyer_signals.py (`cc_closed_at`) | índice presente ✅ |
| UI-jerga | 🟡 | "interacciones registradas del lead" / "evaluar fit con" mostrado al COMPRADOR (regla: cero jerga) | reescrito a lenguaje humano: "Aún no hay actividad registrada" / "evaluar la compatibilidad con" (sirve comprador+dev) | strings fuera ✅ · harness 13/13 |
| B1-A4 | 🟡 | contacto→cerrado exige `_lid AND _did` | **CONFIRMADO wontfix**: no es defecto — un cierre sin propiedad (`_did` None) tendría `comprado` vacío → inflaría `real.n` SIN aportar señal de bucket (recámaras/precio) → DILUIRÍA el aprendizaje de B1. Requerir `_did` es correcto. La ruta de operaciones (cierre canónico con precio+dev) cubre los cierres reales. | decidido |

**TODOS los pendientes de la sesión cerrados.** Abiertos como BATCHES FUTUROS (no pendientes sueltos): B3 (audit-dark agentes), B4 (otros índices compuestos), FASE R (huérfanos de alto valor), FASE A (E2E cohorte).

---

## B3 — Agentes IA "audit-dark" (F0-3) — CERRADO

### Audit A (reproducido)
- `audit_log`: 101 entradas, **27 con actor vacío/role=None** (crons f02 logueaban sin actor), **0 con by_ai**.
- `smart_routing_engine.route_lead` muta `lead.assigned_to` SIN loguear → IA cambia dueño y nadie lo ve.
- Mi propio `route_orphan_leads` (B2-A2) igual: audit-dark.

### Definition-of-Done
1. Distinguir humano vs IA en audit_log (campo `by_ai`, queryable). 2. Acciones de sistema/cron nunca con actor vacío. 3. Acciones-clave de IA (ruteo) logueadas con by_ai. 4. Superadmin PUEDE filtrar/exportar por by_ai. 5. Backward-compat (50+ call sites) + harness verde.

### Fix
- `AuditActor.by_ai`; `log_mutation` deriva by_ai (rol system / user_id de agente·motor) + **sintetiza actor de sistema cuando viene vacío** (nunca audit-dark). Helper `log_agent_action`.
- `scheduler_f02._audit`, `smart_routing.route_lead`, `route_orphan_leads` → ahora logean (by_ai=True).
- Superadmin: `/entries?by_ai=` + `/export?by_ai=` + columna CSV `actor_by_ai` (IA/humano).

### Audit B (independiente) — convergencia
| id | sev | hallazgo | acción | re-verificado |
|----|-----|----------|--------|---------------|
| #1 | 🔴 | heurística by_ai podría dejar fuera un motor sin ':' | ampliada: + `"engine"`/`"agent"` substring (rol system sigue siendo primario) | kg_consumer→by_ai ✅ |
| #2 | 🟠 | f02 insert directo = schema inconsistente | usa `log_agent_action` → entity_type+id+by_ai consistentes | f02 con schema completo ✅ |
| #4 | 🔵 | by_ai existía pero superadmin no lo filtraba | filtro + CSV `actor_by_ai` | endpoint acepta by_ai (no 422) ✅ |
| #5 | 🟡 | actor `{user_id:"", role:"developer"}` se sintetizaría mal | **REFUTADO**: la condición exige user_id Y role vacíos | — |
| #7 | 🔴→ok | org_id→tenant_id naming | **REFUTADO** por el propio verificador (correcto) | — |
| (extra) | 🟡 | `_safe_strip` crasheaba con before/after no-dict (silent audit loss) | endurecido (`{"value": doc}`) | f02 con payload dict ✅ |

**Decisión**: NO se reescriben las 27 entradas históricas sin actor (integridad de auditoría = append-only; el fix es forward).
**Verificado**: derivación humano/IA correcta; f02 schema-consistente; filtro by_ai a nivel dato + endpoint; cero-residuo; harness 13/13. Archivos: `audit_log.py`, `scheduler_f02.py`, `superadmin_audit.py`, `smart_routing_engine.py`, `lead_bridge.py`.

---

## Meta-análisis de los 5 batches — áreas de oportunidad + upgrade aplicado

**Patrones de fondo (no fixes sueltos):**
1. 🔵 "Cableado por fuera, roto por dentro" (B1) — parece conectado, el dato no fluye.
2. 🔵 Auto-reparación incompleta (B2: retry solo en arranque) — puede haber más jobs sin cron.
3. 🔵 Sin garantía de "cero callejones" (B2-A2) — entidades caen en grietas; el patrón `*_completeness_sweep` se puede generalizar.
4. 🔵 Agentes audit-dark (B3) — y la capa agéntica (Cerebro) mutará mucho más; falta vista "qué hizo la IA".
5. 🔴 **Sin RLS → cada escritura es fuga potencial** (B2-A2 casi se fuga) — el riesgo sistémico mayor.

**Upgrade APLICADO (suma directo al método):** el harness era superficial (verifica "responde", no "funciona/aislado/auditado"). Como es el gate de regresión de CADA batch, lo profundicé: ahora 16 checks, +3 invariantes que los batches probaron faltantes —
- **flywheel LIVENESS** (B1): un cierre real mueve el ranking (59.8→64.3).
- **aislamiento de tenant** (B2-A2/#5, sin RLS): un lead de otra org NO se rutea.
- **completitud de auditoría** (B3): acción de agente → by_ai=True.
Cada uno self-cleaning (cero-residuo verificado). `scripts/smoke_e2e.py`.

**Próximos upgrades propuestos (priorizados):**
- **C 🔴** — harness adversarial de aislamiento: probar TODAS las escrituras clave con ids cross-tenant (dado que no hay RLS). El de mayor valor de riesgo.
- **B 🟡** — censo de self-healing: auditar todos los jobs de reconcile/repair por cobertura de cron + generalizar el completeness-sweep.
- **D 🟡** — vista superadmin "Actividad de IA" (visualiza el by_ai; clave antes de prender Cerebro).

---

## Upgrade C — Cross-tenant: por qué recurría + la red sistémica

**Causa raíz (no era el mismo bug 10 veces — es estructural):** NO hay RLS. El aislamiento depende de que CADA acceso
use la guardia central `tenant_scope.tenant_filter` (opt-in). Cada función nueva que toca datos es una fuga potencial
nueva. Las fugas pasan en funciones que NO llaman la guardia (como casi pasó en `route_orphan_leads`).

**Hecho:**
- `scripts/tenant_isolation_probe.py`: prueba SISTEMÁTICAMENTE las 13 colecciones tenant-scoped (`_OWNER_FIELDS`) —
  para cada una: la guardia (a) NO es god-view para no-superadmin, (b) excluye otra org, (c) incluye la propia.
  Resultado: **13/13 OK** → la guardia central es sólida (el riesgo es el USO, no la guardia).
- Integrado al harness (check #15) → corre en CADA batch. Si alguien rompe el mapeo/guard → falla automático.
- + el check function-level (route_orphan_leads no cruza org) ya estaba.

**Honesto (lo que falta para cerrarlo del todo):** la cura completa es pasar de opt-in a ENFORCED (RLS real en Postgres,
o un middleware Mongo que auto-inyecte el tenant_filter). Es un proyecto de arquitectura (la "deuda RLS"). Mientras tanto:
probe (guard) + checks de función en el harness + disciplina (toda escritura nueva usa tenant_filter + su check). El
harness convierte "se descubre a mano" → "se atrapa antes de shipear".

---

## Upgrade B — Censo de self-healing (cobertura de cron)

**Censo de jobs de reparación/reconciliación:** la mayoría son migraciones one-shot (OK en arranque) o ya tienen cron.
**Hallazgo (misma clase que B2):** 2 reparaciones ONGOING corrían SOLO en arranque →
- `reconcile_pending_xp` (advisor.py): si el grant de XP falla al cerrar una venta (`xp_pending`), el asesor PIERDE su
  XP/cierre hasta el próximo reinicio. **Cron diario 04:30.**
- `reconcile_lead_activo` (pipeline_engine.py): red de seguridad del índice de dedup (deriva `activo` del status). **Cron 04:35.**

Registrados en scheduler_ie.py. **Verificado**: reproducción tagueada — una operación `xp_pending` se repara (xp=250,
cierres=1, flag limpia), teardown cero-residuo; backend arranca limpio; harness 17/17.

**Nota de proceso:** mi primer intento rompió el arranque (re-import local de `CronTrigger` → UnboundLocalError); el
harness reforzado (upgrade A/C) lo **atrapó al instante** (12/17). El doble-loop funcionando.

---

## Upgrade D — Vista superadmin "Actividad de IA" (consume by_ai de B3)
- Backend: `GET /api/superadmin/audit/ai-activity?days=` → IA vs humano (conteo + %), por agente, recientes. Reusa audit_log.
- Frontend: panel en SuperadminAuditChain (`getAiActivity`). Compila; harness 17/17.
- Hoy 0% IA (la capa agéntica casi apagada) → la vista se enciende sola cuando los agentes actúen. Es justo el tablero
  "¿qué decide/muta la IA?" que hace falta ANTES de prender Cerebro.

---

## B4 — Índices compuestos faltantes
**Verificado vs inventario F0 (impreciso otra vez):** `leads` y `asesor_contactos` YA están bien indexados (los
"faltantes" de F0 están cubiertos por variantes tenant-scoped: `(dev_org_id, source)`, `(assigned_to, status)`,
`(owner_id, created_at)`). `facts_buyer_signals` (5 docs) con índices que matchean su schema.

**Lo REAL (alto valor):** `marketplace_searches` tenía SOLO `_id` → COLLSCAN en demand-intel / zona-cambios / demanda-mapa
/ donde-vivir (consultan por colonia+fecha y visitor+fecha). Agregados: `(colonia_id, created_at_dt)`,
`(visitor_id, created_at_dt)`. + `buyer_signals (visitor_id, created_at_dt)` (timeline / 'primera señal' del flywheel).
Verificado: los 4 índices (ms_colonia_dt, ms_vid_dt, bs_vid_dt, cc_closed_at) existen; harness 17/17.

---

## FASE R — Rescate de huérfanos: NO hay (F0 inventario equivocado)

Verificación honesta de los 6 "huérfanos de alto valor" de F0 (importado en rutas? superficie frontend?):
| motor | rutas | frontend | veredicto |
|-------|-------|----------|-----------|
| battle_card | 5 | 7 archivos | **cableado** |
| forecast/FSD | 17 | 33 | **cableado** |
| churn_prediction | 4 | 1 | cableado |
| asesor_digest | 2 | 1 | cableado |
| conversation_cost | 4 | 2 | cableado |
| conversation_kb_gaps | 2 | (mi grep dijo 0) | **CABLEADO** — componente `SuperadminKbGaps` (188 líneas) + ruta App.js:790 + nav:253 |

**conversation_kb_gaps**: empecé a rescatarlo (mi grep buscó el nombre del ENGINE, no "kb-gaps") y casi shipeo un
DUPLICADO completo (página+ruta+nav). El compile lo cazó (doble declaración) → **revertido** (regla: no duplicar).

**Conclusión:** el inventario de huérfanos de F0 estaba completamente inflado — los 6 ya tienen UI. No hay rescate que
hacer. Lección: el grep de huérfanos debe buscar la RUTA/feature ('kb-gaps'), no el nombre del motor — los F0 agents
(y yo) buscaron el motor y reportaron falsos huérfanos. (Mismo patrón de imprecisión que B4/B2-A2.)

---

## FASE A — E2E de cohorte (journey real a escala)
`scripts/e2e_cohort.py`: siembra N=20 visitantes tagueados, corre el JOURNEY real (señales anónimas + búsqueda →
`create_buyer_lead` → ruteo → espejo CRM → re-atribución de señales), reconcilia, prueba aislamiento a escala, y hace
teardown con prueba de cero-residuo (diff vs baseline).

**Resultado: 8/8 PASS** — 20/20 leads creados→ruteados→espejados→señales re-atribuidas; reconciliación cuadra
(leads==registrados, contactos==leads); aislamiento 13/13 a escala; cero-residuo. **El journey completo es sólido a
escala; no surgieron bugs** (el único fue de mi test: `create_buyer_lead` devuelve `(lead_id, house_inm)` tupla, no dict).

Queda como prueba E2E repetible del journey, complementaria al smoke harness (17/17).

---

## Auditoría nueva: propagación cross-portal + concurrencia 1000 (evidencia ejecutable)

### Matriz de propagación (`scripts/propagation_matrix.py`) — 12/12
Un journey de marketplace → verificado VISIBLE en cada portal/engine:
- marketplace (señales/búsqueda/lead) · asesor (CRM+temperatura) · dev (sus leads + DEMANDA + PERCEPCIÓN) ·
  superadmin (cubo + auditoría) · engines (gusto, gemelo de demanda).
- **GAP REAL cazado:** `create_buyer_lead` (el camino de lead más común) era **audit-dark** → superadmin no veía las
  creaciones/ruteos de lead de marketplace. **FIX:** log_mutation actor 'marketplace' (system, by_ai=False).

### Concurrencia 1000 (`scripts/concurrent_load.py`) — 8/8 (tras fix)
1000 señales (8522/s) + 50 registros del MISMO visitante + 100 distintos + lecturas cross-portal, todo concurrente.
- **2 RACES CRÍTICAS cazadas (check-then-act):** 50 registros concurrentes del MISMO visitante → **50 leads + 16
  contactos** (debía ser 1). En prod: doble-click / ráfaga → leads y contactos duplicados, asesor inundado.
- **FIX (defensa en profundidad):** índices ÚNICOS PARCIALES `leads_vid_uniq` (visitor_id) + `ac_owner_lead_uniq`
  (owner_id, source_lead_id) + manejo de `DuplicateKeyError` en create_buyer_lead y mirror → la perdedora reusa al
  ganador (idempotente). Resultado: 50 → 1 lead + 1 contacto. Lecturas cross-portal sin error bajo carga.

### Áreas de oportunidad restantes (honesto)
- 🔴 **Deuda RLS** (la grande, nombrada): aislamiento opt-in; el probe (C) es la red, la cura es enforced.
- 🔵 Extender la matriz de propagación a las OTRAS direcciones (dev publica→todos, asesor cierra→todos) — el journey de
  marketplace ya está 12/12; las otras direcciones las cubrieron B1 (cierre→ranking) y los flujos existentes, falta
  formalizarlas en el harness.
- 🔵 Otras escrituras multi-paso usan upsert atómico (cube, closing_lifts, visitor_identity, routing) → ya idempotentes;
  la ruta de registro era la única con check-then-act sin proteger.

---

## Propagación · OTRAS direcciones (asesor-cierra→todos, dev-publica→internos) — 8/8

`scripts/propagation_directions.py` — formaliza las direcciones que faltaban (la de marketplace→todos ya estaba 12/12):
- **ASESOR CIERRA → SUPERADMIN:** la venta entra a `db.transactions` (DRPI). ✓
- **ASESOR CIERRA → FLYWHEEL → RANKING:** cierre→`copiloto_closings`→`closing_lifts`(real.n=3)→`score_devs` lo consume
  VIVO (5 devs rankeados, altavista-polanco=94.3). El marketplace mejora solo con cada venta. ✓
- **ASESOR CIERRA → DEV:** unidad→`units_history` + `developer_unit_overrides` marca VENDIDA (ritmo de venta/ficha). ✓
- **DEV PUBLICA → INTERNOS:** el proyecto del wizard (`db.projects`) es visible a dev/superadmin/asesor/insights/
  auto-approve (12 readers). ✓

**Nota de producto (no es bug):** el marketplace PÚBLICO es catálogo CURADO (`DEVELOPMENTS` estático). Que los
proyectos del wizard (`db.projects`) salgan AUTO al marketplace público es DECISIÓN DE PRODUCTO (¿gate de aprobación?),
no un cable roto — hay un `auto_approve_engine` que sería el punto de arranque si se decide hacerlo.

**Verificación de frescura:** el cache de gusto (`visitor_taste_materialized`) SÍ se invalida en cada señal
(buyer_signals.py:146-147 → `invalidate_visitor_taste`) → el ranking del comprador se refresca con cada like. Sin bug.

### Batería completa (un comando: `bash scripts/audit_all.sh`) — 66/66 verde
smoke 17/17 · aislamiento 13/13 · journey 8/8 · propagación→todos 12/12 · propagación direcciones 8/8 · concurrencia 8/8.

---

## DEV PUBLICA → MARKETPLACE + VISIBILIDAD TOTAL DE GRANULARIDAD

### Dev publica → marketplace (7/7 + live)
Antes los proyectos del wizard (`db.projects`) nunca llegaban al comprador. Ahora se publican: convertidor →
tarjeta, merge en `/api/developments`, fallback en el detalle, gate (marketplace_published + colonia + precio),
control superadmin (publicar/despublicar con auditoría). Marcados `source='wizard'`/`verified=False`.

### Visibilidad de granularidad (respuesta a "¿se refleja todo en superadmin?")
**Verificado contra BD — la respuesta era NO.** El cubo refleja ~13 medidas; los scores estaban fragmentados
(colecciones sueltas, **6 vacías**: buyer_scores/fit_cache/lead_match_scores/asesor_trust_scores/zone_subscores/
avm_predictions) o **efímeros** (se calculan y se tiran). No había vista unificada por entidad.

Construido: `granularity_registry.py` (16 familias persistidas + 5 efímeras, campos verificados) → `coverage` (el MAPA:
estado vivo/apagado/efímero por familia) + `inspect_entity` (la FICHA: todos los scores de una entidad). Endpoints
superadmin + página `/superadmin/granularidad`. Hoy: 10 vivas · 6 apagadas · 5 efímeras.

**Capas siguientes (honesto, no-RLS):**
- 🔵 Drill por-score/por-feature: el mapa es a nivel FAMILIA; expandir `ie_scores` en sus recetas (2050 zonas×recetas)
  y `dmx_units` en sus 160 features sería el siguiente nivel de detalle.
- 🔵 Persistir las 5 efímeras (dmx_project_score, lead_score, churn, hook, absorción) para histórico/auditoría — decisión
  por-motor; hoy ya son VISIBLES como 'efímeras' en el mapa.
- 🔵 Encender las 6 familias apagadas (motores que existen pero no persisten en este entorno).

---

## Granularidad · 3 capas (encender apagadas + persistir efímero + drill)

Investigada CADA familia apagada con evidencia (no asumir). Hallazgos:
- **buyer_scores**: motor HUÉRFANO — compute_user_score solo calcula, upsert_score persiste, nadie los encadenaba. Fix=backfill.
- **asesor_trust_scores / lead_match_scores**: on-demand sin backfill → backfill.
- **zone_subscores**: NO era dark — el dato vive en `zone_scores.subscores_real` (430 zonas). Fix=mi registro.
- **fit_cache**: cache 30 min POR DISEÑO (sí escribe, fsd_engine:673). Marcado kind=cache.
- **avm_predictions**: apagado por DEPENDENCIA DE DATOS (persist_avm_prediction exige fsd.available; el modelo FSD no
  tiene comparables). Backfill listo para cuando haya datos. Honesto — no se fuerza.

Resultado: mapa **10 → 15 familias vivas** (de 17). `granularity_backfill.py` (idempotente, acotado) + cron diario 03:30
+ endpoint POST /backfill + botón en la página.

Capa 2: `dmx_project_score` (efímero de valor) → `score_snapshots` (histórico). Otros 4 efímeros por diseño (etiquetados).
Capa 3: drill — ie_scores→70 recetas (score/receta/stub), dmx_units→14 grupos de features (poblados+completitud).

---

## Conectar fuentes IE / des-stubear (honesto, evidencia)

Investigado el framework de recetas IE: 72 recetas, **87% ya reales**, 13% stub (1,560). Cada receta declara
`dependencies` (source_ids) y es stub cuando su fuente no tiene obs para esa zona.

- **BUG sistémico encontrado+arreglado:** el recompute diario solo toca zonas con obs nuevas en 24h → los stubs STALE
  (fuente ya sincronizada, p.ej. `denue_zone_density` de OSM para 3,166 zonas) nunca se recomputaban. `backfill_ie_stubs`
  los recomputa (dato ya existe → flip). Corrida: **27 flipearon**; añadido al cron diario.
- **El resto es GENUINAMENTE stub** (verificado contra BD, NO se fabrica): 1,028 zonas = OSM escaso real (colonias
  periféricas con pocos POIs, ej. 2 negocios); 261 = dato interno no capturado (proyectos/unidades); 144 = resource_id
  CKAN gratis (founder configura en 'Conectar'); 96 = sin fuente real (CONAGUA/CENAPRED/Atlas/GTFS son conectores stub).
- `stub_diagnosis` + `/stub-diagnosis` + sección en la página: por receta stub → fuente + ACCIÓN exacta. El founder ve
  el camino preciso. Honesto: lo que no se puede des-stubear sin inventar, queda stub y dice por qué.

**Para el founder (acciones libres que des-stubean más):** registrar tokens gratis (NOAA CDO, Banxico SIE, INEGI) +
configurar resource_ids CKAN de datos.cdmx (FGJ/Locatel/SACMEX/uso-suelo) en la UI 'Conectar'. AirROI queda fuera (paga).

---

## Auditoría profunda del portal SUPERADMIN (Tareas 4 + 5)

**Método:** cruce programático back↔front (openapi.json = verdad, NO regex que se infla). 3 iteraciones quitando falsos
positivos del análisis estático de URLs dinámicas (BASE-const, bases-función `base(scope)`, `${qs}` colgante).

**Tarea 4 — veredicto: el miedo es INFUNDADO.** El superadmin SÍ está bien cableado:
- 449 endpoints backend · **0 llamadas frontend muertas** (todo lo que el front llama existe en back).
- **Solo 8 huérfanos REALES** (de 62 que marcó el parser crudo): ai-usage, commercial/trials/run-check,
  conversation-cost/tenant-cost, data-sources-gov-mx/banxico/series-list, google-places/ingest-lugares,
  maps/cache-refresh, narratives/batch-generate, seed-historic-from-upload. TODOS son acciones de cron/admin/ingesta —
  NO features de UI perdidas.
- 93 páginas, TODAS en uso: 84 ruteadas + 9 "sin ruta" que en realidad están ANIDADAS como tabs
  (SuperadminDesarrollos / SuperadminCatalogPulse).

**Tarea 5 — cross-portal registration:** audit_log central cubre las mutaciones clave de los 3 portales (asesor:
operacion/contacto/appointment; dev: document/construction/unit_hold/developer_admin; marketplace: lead). Buyer behavior
(señales/búsquedas/favoritos) va a behavioral_events (1,942) — por diseño, visible vía copiloto funnel.
- **GAP encontrado+arreglado:** ediciones de unidad del dev (estado + precio/campos) registraban SOLO en
  `developer_audit` (trail del portal dev), no en el `audit_log` CENTRAL → el superadmin no las veía. Cableado
  log_mutation(entity=unit) en developer.py (unit-status-change + patch_unit_fields). Verificado.
- Patrón a futuro: trails fragmentados (developer_audit vs audit_log) — unificar lectura del superadmin o mirror.

Herramienta de auditoría reutilizable: scratchpad/superadmin_audit.py (re-corrible cuando se agregue UI/endpoints).

---

## Lectura UNIFICADA de auditoría del superadmin (cierra la fragmentación de trails)

La auditoría detectó que la actividad estaba fragmentada en trails por-portal con esquemas distintos y el superadmin
solo leía audit_log. Construido:
- `unified_audit.py` — normaliza 5 trails (audit_log + developer_audit + lead_events + price_events +
  engagement_events) a una forma común (actor anidado compatible con la página existente) + merge por tiempo, tagueado
  por `source`. audit_immutable queda fuera (su propia página Audit Chain).
- Endpoint `GET /api/superadmin/audit/unified` (filtros source/entity_type/actor/by_ai) + página 'Actividad unificada'
  (timeline + chips de fuente + IA/humano) + ruta + nav.

### Bug de higiene (efecto colateral del fix marketplace-lead→audit_log) — encontrado+arreglado
El lector unificado destapó que los harness de test dejaban residuo EN CADENA: crear leads → el espejo a asesor puebla
lead_events + asesor_lead_properties + notifications + audit_log, y los teardowns no los limpiaban (o usaban la llave
equivocada: asesor_lead_properties se enllava por contacto_id, no lead_id; el audit usa after.source='copiloto_<src>').
**~3,100 huérfanos acumulados** (audit_log inflado 1,251→97 real · lead_events 1,341 · asesor_lead_properties 1,310).
Fix: teardowns capturan lead_ids+contacto_ids antes de borrar y limpian todos los trails derivados. Verificado Δ=0 en
9 colecciones tras 2 corridas. Lección: cada trail que el superadmin lee debe tener teardown de test cero-residuo.

---

## Inteligencia de demanda — ¿la plataforma convierte interacciones en data de mercado? (la pregunta núcleo)

**Diagnóstico (evidencia):** el query asesino del founder NO se podía responder. La cadena interacción→inteligencia se
rompía en la AGREGACIÓN+VISIBILIDAD: las señales capturan dev+colonia+tiempo (y el backend YA acepta unit_number +
meta.amenidades), pero no había motor que agregara por FEATURE ni vista que lo mostrara. Tienes 160 features de OFERTA
por unidad pero la DEMANDA era ciega al feature.

**Construido:** demand_intelligence.py (demanda por feature×colonia×tiempo, precisión 3-niveles meta>unit>dev-proxy;
colonias; atributos; qué-construir demanda-vs-oferta; buckets day/week/month/quarter/year; killer_query). Endpoint
/api/superadmin/demand-intel + página 'Demanda de mercado'. Verificado: 'terraza/polanco'=26.

**Gaps que siguen (para PRECISIÓN total — el próximo upgrade):**
1. CAPTURA: el front solo manda unit_number en unit_view/unit_save (39 señales). Enriquecer para mandarlo + meta.amenidades
   en MÁS interacciones (foto de terraza, comparador, filtros) → feature-demand preciso en todo, no proxy.
2. UNMET DEMAND: marketplace_searches.results_count=0 = lo que se busca y NO existe → capturar y mostrar (oro puro).
3. LOOP demanda→dev/asesor: el dev ve 'el mercado quiere terraza en Del Valle, tú tienes 0'; el asesor pitchea lo que se busca.
4. ANOMALÍA/TENDENCIA: 'demanda de terraza en Del Valle 3x este mes' como alerta.

**Higiene:** barrido 444 colecciones, 5 residuos limpiados. Limpio.

---

## AUDITORÍA PORTAL POR PORTAL (quirúrgica, no atajos) — PORTAL 1: MARKETPLACE/COMPRADOR ✅

**Método:** 4 pasadas (inventario → cableado back↔front → captura/granularidad/visibilidad por interacción → arreglar).
Herramienta reutilizable: scripts/portal_wiring_audit.py.

**Pasada 1-2 (wiring): SANO.** 56 páginas (52 ruteadas + 4 V2 sí usadas), 143 endpoints backend, **0 huérfanos reales**,
0 llamadas muertas. Las 2 'sin API' (Simulador/Barrios) son legítimas (calc client-side / página índice). El miedo de
'front desconectado' NO aplica aquí tampoco.

**Pasada 3 (granularidad): el verdadero hallazgo.** Mapeé las 30+ interacciones (sendBuyerSignal) y su payload:
- ✅ La ficha captura BIEN unit_number (unit_view/section_time/intent/unit_save/compare).
- ✅ atlax_profile captura meta.amenidades = el feature EXPLÍCITO que pide el comprador.
- 🔴 CABLES MUERTOS: section_time / section_view / module_open (tiempo+engagement por sección/módulo de la ficha) →
  capturados y NADIE los consumía. atlax_profile (amenidades) NO alimentaba el motor de demanda.

**Pasada 4 (arreglado):**
- Las amenidades explícitas (atlax_profile/zone_profile) ahora alimentan demanda-por-feature (+_as_feature_list para
  strings). 41 señales precisas.
- engagement_by_content() RESUCITA section_time/view/module_open → 'qué contenido de la ficha engancha' (nuevo). Endpoint
  + tarjeta en 'Demanda de mercado'.

**Follow-up notado:** photo_dwell captura photo_idx, no el feature de la foto → necesita persistir photo_tagger (próximo).

SIGUE: Portal 2 = DEV (oferta + proyectos + métricas).
