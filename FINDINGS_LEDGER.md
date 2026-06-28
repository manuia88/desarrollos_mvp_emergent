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
