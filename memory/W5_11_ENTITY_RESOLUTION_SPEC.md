# W5.11 · Entity Resolution + Audit Inmutable + Disputes · Spec canónico

**Versión**: 1.0 retroactivo · 2026-05-19
**Origen**: rescatado post-audit forense 10 batches 2026-05-19 · sesiones `25b3b744-fdb5-4491-93b8-4b16f4aee391` (2026-05-01 origen reglas founder · 31 menciones) + WAVE_PROGRESS L253-255 + commits SHAs canónicos
**Status**: ✅ SHIPPED COMPLETO (3 partes) · documentación trazabilidad retroactiva
**SHAs shipped**:
- P1 origen `ca5256a3` (Emergent Agent · 2026-05-17) · merge `ab868c5a`
- P1 docs `9cb1e5e3` (Claude Code · WAVE_PROGRESS update)
- P2 origen `cda4776` (Emergent Agent) · merge `c10f63e1`
- P2 aurora fix `9d81e1e8` + `0d92469c` (Claude Code · 32 hex hardcoded → tokens)
- P3 origen `35508cf4` (DMX Agent) · merge `6be67984`
**Horas reales**: 36h shipped (18h P1 + 9h P2 + 9h P3)
**Quién shipped**: Emergent (cores) + Claude Code (UI fixes + WAVE_PROGRESS sync)

⚠️ **RETROACTIVO**: spec reconstruido post-shipped desde WAVE_PROGRESS verbose + LEAD_REGISTRATION_RULES.md canónico + commits. Reglas founder (sesión 2026-05-01) NO reinterpretadas — copiadas desde `LEAD_REGISTRATION_RULES.md` (doc canónico previo).

---

## 1 · Resumen ejecutivo

W5.11 es el **músculo anti-fraude + arbitraje de leads** de DMX. Tres patas independientes pero acopladas:

1. **Entity Resolution Engine**: 8 capas dedup (normalize email Gmail · phone MX · nombre+títulos · address) + score ponderado weighted multi-campo + thresholds 95/75 + cross-asesor isolation + ventana temporal 1-year + blacklist + 30d undo.
2. **Audit Inmutable Engine**: chain criptográfico SHA-256 prev_checksum encadenado · insert-only · verify_chain detecta tampering · cierra todos los flows críticos del sistema.
3. **Dispute Resolution**: dev_admin arbitra disputas mismo-lead+mismo-proyecto+diferente-asesor via 3 endpoints + UI dedicada · cooldown 90d post-reject · WA template 3 genérica al asesor original cuando activity_score cross-project ≥1.0.

**Valor diferencial**: ningún competidor (Inmuebles24/Lamudi/HouseCanary) tiene audit chain SHA-256 verificable + dedup engine multi-capa + arbitraje formal dev-side. Investor-grade auditability.

**Audience**: superadmin DMX (gestión técnica) + dev_admin (arbitraje día-a-día) + asesores (notificaciones + cooldown enforcement).

---

## 2 · Arquitectura técnica

### 2.1 Backend

#### Engines (P1)
- `backend/entity_resolution_engine.py` (745L · 8 capas dedup)
  - `normalize_email()`: Gmail dedup `dot-removal + plus-tag strip`
  - `normalize_phone()`: prefix MX +52 · 10 digits
  - `normalize_name()`: títulos (Lic/Dr/Ing) · diacritics · whitespace
  - `normalize_address()`: tokenize + sort
  - `compute_match_score()`: weighted email×0.40 + phone×0.30 + nombre×0.20 + address×0.10
  - `MIN_MATCHED_FIELDS=2` · evita falsos positivos solo-nombre
  - Thresholds: **HIGH=95** (auto-merge candidate) · **MEDIUM=75** (manual review)
  - `BLACKLIST` collection bidireccional · `temporal_window=365 días`
  - `auto_merge()` + `undo_merge()` 30d window
  - Cross-asesor: SIEMPRE manual review (NO auto-merge entre asesores distintos)
  - Edge case guard: `MAX_PAIRS_PER_RUN=2000` + `500 docs/entity_type` para evitar O(n²) explosivo
  - `_levenshtein` inline (NO dependencia externa)
- `backend/audit_immutable_engine.py` (265L · SHA-256 chain)
  - `log(action, entity_id, payload)`: insert-only · computa `checksum = sha256(prev_checksum + payload)` · `prev_checksum` enlaza al doc anterior por entity
  - `verify_chain(entity_id)`: re-computa chain · retorna `{valid, broken_at, total_entries}`
  - `query_audit()`: read-only · paginated
  - `ensure_indexes()`: registrado en startup
- `backend/entity_resolution_cron.py` (153L · 2 jobs APScheduler)
  - `dedup_detection_cron` @ 06:00 UTC daily (top 500 candidates · idempotent)
  - `fraud_pattern_cron` @ 07:00 UTC daily (`detect_broker_fraud_pattern` flags asesores con ≥3 variantes mismo cliente)
  - `register_jobs(sched)` invocado en server.py startup
  - Guards: `sched can be None init no falla`

#### Engines (P3)
- `backend/routes/disputes.py` (350L) — NEW
  - `POST /api/disputes/resolve` (dev_admin)
  - `GET /api/disputes/pending`
  - `GET /api/disputes/history`
- `backend/routes/dev_batch4_1.py` EXTENDED
  - **CHECK 0** cooldown agregado al TOP de `_run_antifraude` (raises 409 con fecha+razón previa)
  - `_compute_activity_score()` helper (pesos 7d=1.0 · 7-14d=0.5 · 14-21d=0.25 · >21d=0)
  - `_build_wa_template_3()` mensaje genérico (sin nombre asesor ni proyecto otro)
- `backend/notifications_engine.py` EXTENDED
  - `NOTIF_TYPES`: `dispute_resolved` · `dispute_resolved_rejected_cross_project_alert`
  - `DEFAULT_CATEGORIES` registra defaults (in_app + email · severity high)

#### Routes (P1)
- `backend/routes/entity_resolution.py` (265L · 11 endpoints superadmin · ver §3)

#### Collections Mongo
| Collection | Propósito | TTL |
|---|---|---|
| `entity_resolution_pending` | Pares candidate ≥75 sin resolver | indefinido |
| `entity_resolution_blacklist` | Pares marcados "NO match" bidireccional | indefinido |
| `entity_resolution_merged_archive` | Historial merges · soporta undo 30d | 30d post-merge |
| `entity_resolution_dedup_runs` | Audit cron runs | 90d |
| `entity_resolution_broker_fraud_patterns` | Asesores con ≥3 variantes mismo cliente | indefinido |
| `audit_immutable_log` | Chain SHA-256 prev_checksum · insert-only | indefinido (legal evidence) |
| `asesor_dispute_history` | Disputes resueltas con cooldown_until | indefinido (audit) |

### 2.2 Frontend

#### Pages superadmin (P2 · 3 NEW)
- `frontend/src/pages/superadmin/SuperadminDuplicates.js` (381L)
  - Queue ordenado por score desc
  - Action buttons merge/dismiss
  - Side-by-side compare via `DuplicateDiffCard`
- `frontend/src/pages/superadmin/SuperadminFraudPatterns.js` (239L)
  - Lista asesores con ≥3 variantes mismo cliente
  - Drill-down a leads sospechosos
- `frontend/src/pages/superadmin/SuperadminAuditChain.js` (329L)
  - Verify chain UI · summary `verified/broken_at/total_entries`
  - Filtros por entity_type + date range

#### Pages developer (P3 · 1 NEW)
- `frontend/src/pages/developer/DesarrolladorDisputas.js` (552L)
  - KPI strip (pendientes · aprobadas 30d · rechazadas 30d · cooldown activos)
  - Cards layout (NO table) con approve/reject pill buttons
  - `ApproveModal` + `RejectModal` (select reason_code + textarea required if "other")
  - `SmartEmptyState` + Toast feedback + click → `/crm?lead_id=`
  - Design system canónico: rounded-full · backdrop-blur 24px · gradient solo CTAs · cero emoji

#### Components shared
- `frontend/src/components/superadmin/DuplicateDiffCard.js` (122L)
  - Side-by-side compare nombre/email/teléfono/dirección
  - Diff highlight diferencias

#### API clients
- `frontend/src/api/entity_resolution.js` (80L · 11 endpoints)
- `frontend/src/api/badges.js` (14L · NEW · `disputes_pending_count` fetcher)

#### Nav + i18n
- `navByRole.js` tier 4 Operación: 3 entries (`audit-chain` · `duplicates` · `fraud-patterns`)
- `navByRole.js` DEV_NAV tier 1: entry `disputas` con `badge_source: 'disputes_pending_count'`
- `PortalLayout.js` `BADGE_SOURCES` registra `disputes_pending_count`
- i18n `es-MX/common.json`: namespace `disputes` 28 strings + entity_resolution 71 strings (P2 + P3)

### 2.3 Integraciones cross-módulo

- **W4.4 asistente_engine (Atlax)**: 22 tools existentes consumen audit_immutable_engine para log de calls sensibles
- **W5.12 Knowledge Graph**: edge `DUPLICATE_OF` se construye desde `entity_resolution_merged_archive` (W5.11 P1 alimenta KG ETL)
- **W4.10 notifications_engine + Resend**: emit `dispute_resolved` notif al asesor (in_app + email)
- **W4.3 behavioral_events**: feed activity_score cross-project (notas/WA/email/audit/apts)
- **W5.FF feature_gate_engine**: audit_immutable usado para audit chain mandatory cada gate check
- **W4.10 dev_batch4_1.py POST /api/cita**: 6 checks (now 7 with CHECK 0 cooldown)

---

## 3 · Endpoints (11 P1 superadmin + 3 P3 developer)

### 3.1 Entity Resolution (P1 · superadmin-only)

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/entity-resolution/scan` | Trigger manual dedup scan |
| GET | `/api/entity-resolution/pending` | Queue pares candidate ≥75 |
| POST | `/api/entity-resolution/merge` | Auto-merge par approved |
| POST | `/api/entity-resolution/undo` | Undo merge dentro de 30d |
| GET | `/api/entity-resolution/merged-archive` | Lista merges con TTL info |
| POST | `/api/entity-resolution/blacklist` | Marcar par como "NO match" bidireccional |
| GET | `/api/entity-resolution/blacklist` | Lista blacklist actual |
| DELETE | `/api/entity-resolution/blacklist/{id}` | Quitar par de blacklist |
| GET | `/api/entity-resolution/fraud-patterns` | Asesores con ≥3 variantes |
| GET | `/api/entity-resolution/runs` | Historial dedup_runs TTL 90d |
| GET | `/api/entity-resolution/stats` | KPIs dashboard |

### 3.2 Audit Chain (P2 · superadmin-only)

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/audit-chain/log` | Query audit entries paginated |
| GET | `/api/audit-chain/log/entity/{id}` | Chain de entity específica |
| GET | `/api/audit-chain/log/stats` | total_entries + first/last timestamps |
| POST | `/api/audit-chain/verify` | Re-compute chain · retorna `{valid, broken_at}` |

### 3.3 Disputes (P3 · dev_admin)

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/disputes/resolve` | Resolver disputa pending (approve/reject) |
| GET | `/api/disputes/pending` | Lista disputas asignadas al dev |
| GET | `/api/disputes/history` | Resoluciones 30d con stats |

---

## 4 · Crons y scheduled tasks

| Job | Schedule | Idempotency | Audit |
|---|---|---|---|
| `dedup_detection_cron` | 06:00 UTC daily | `dedup_runs` collection registra `run_id` (skip si ya corrió hoy) | `audit_immutable.log(action="dedup_run", payload=summary)` |
| `fraud_pattern_cron` | 07:00 UTC daily | flags asesor solo si nuevo pattern (no duplica row) | `audit_immutable.log(action="fraud_pattern_detected")` |

---

## 5 · Decisiones founder históricas

Origen reglas: sesión `25b3b744-fdb5-4491-93b8-4b16f4aee391.jsonl` (2026-05-01) · founder Manuel L547/554/561/574/581/587.

### Regla núcleo (L581)
> **"2+ asesores pueden registrar al mismo lead en DIFERENTES proyectos, pero solo 1 asesor puede registrar al mismo lead en el MISMO proyecto."**

**Quién arbitra**: el **developer (dev)** según sus políticas internas. **DMX NO arbitra** — solo facilita comunicación via WA + cooldown enforcement.

### Anti-fraude (L554)
> "los asesores cambian 1 o varios dígitos del teléfono o correo. si nombre/teléfono/correo hay un 85% de coincidencia → 'Tu registro está en revisión'."

**Decisión**: thresholds DMX **95** (auto-merge candidate) + **75** (manual review) son MÁS estrictos que el 85% original founder · founder approved post-implementación.

### Flag unificado (L561)
> "El desarrollador validará en menos de 24h"

Flag `under_review` UNIFICADO: mismo mensaje aplica a duplicate exacto + match ≥85% + velocity flag. Founder lo prefirió así por simplicidad UX.

### DMX inmobiliaria semilla (L574)
> "el lead que se registra a cita SIN asesor cae a la BD directa de DMX. NO cae como lead directo de dev. Es mi inmobiliaria."

Implicación: tenant `dmx_house` ruta vía round-robin/score.

### Tone disputa (L587)
- Plantilla 3 (movement alert al asesor original): **NO** incluir nombre del otro asesor ni proyecto específico
- **NO** mencionar "los clientes no son propiedad de nadie"

### Cooldown 90d (P3 decisión emergent-aprobada founder retro)
Tras reject de disputa, asesor entra cooldown 90d en `(asesor_id, project_id)` · CHECK 0 en POST /api/cita bloquea 409.

---

## 6 · Scope shipped vs scope discutido

### ✅ Shipped completo (3 partes · 36h)

**P1 · Entity Resolution engine + Audit Immutable + crons (18h)**:
- 8 capas dedup + weighted score + thresholds 95/75 ✅
- Cross-asesor isolation ✅
- 1-year temporal window ✅
- Blacklist bidireccional ✅
- Auto-merge + undo 30d ✅
- 11 endpoints superadmin ✅
- 2 crons APScheduler (dedup 06:00 + fraud 07:00 UTC) ✅
- Audit Inmutable SHA-256 chain insert-only + verify_chain ✅
- Edge case guards (MAX_PAIRS_PER_RUN=2000) ✅

**P2 · UI Superadmin Duplicates + Fraud + Audit Chain (9h)**:
- 3 pages superadmin (Duplicates · FraudPatterns · AuditChain) ✅
- DuplicateDiffCard component side-by-side ✅
- API client 11 endpoints ✅
- navByRole 3 entries tier 4 Operación ✅
- Aurora audit fix posterior (32 hex hardcoded → tokens) ✅

**P3 · Dispute Resolution + Cooldown 90d + Audit Chain Integration (9h)**:
- 3 endpoints disputes ✅
- `asesor_dispute_history` collection con cooldown_until +90d ✅
- CHECK 0 cooldown en POST /api/cita (409 con fecha+razón) ✅
- `_compute_activity_score` weighted pesos 7/14/21d ✅
- `_build_wa_template_3` genérico (sin nombre asesor ni proyecto otro) ✅
- DesarrolladorDisputas page con KPIs + ApproveModal + RejectModal ✅
- navByRole DEV_NAV tier 1 entry `disputas` con badge ✅
- WA template 3 dispara SOLO si rejected + activity_score cross-project ≥1.0 ✅
- audit_immutable SHA-256 integrado en cada resolve ✅

### 🟡 Diferido conscientemente (BACKLOG)

| Item | Score | Razón diferir | Backlog ref |
|---|---|---|---|
| **Auto-merge masivo high score ≥95** | 7/10 | Sin volumen real esperar leads reales (founder pidió wait-and-see) | WAVE_PROGRESS L254 |
| **audit_log_id clickeable hacia /superadmin/audit-chain en notif asesor** | 7/10 | Sin volumen aún · enhancement post-launch | WAVE_PROGRESS L253 |
| **Bulk merge UI** | 6/10 | Caso de uso TBD post-launch | implícito |

### 🔴 Perdido — CERO (auditoría confirma)

Audit forense 2026-05-19 verificó 10 batches incluyendo W5.11 P1+P2+P3 · CERO sesgo sistémico detectado.

---

## 7 · BACKLOG enhancements asociados (deferreds)

- `auto-merge masivo high score≥95` (7/10) · WAVE_PROGRESS L254
- `audit_log_id clickeable en notif asesor` (7/10) · WAVE_PROGRESS L253

---

## 8 · Riesgos residuales NO bloqueantes (documentados al shipping)

1. **Edge case O(n²)**: `MAX_PAIRS_PER_RUN=2000` + `500 docs/entity_type` evitan explosivo · monitorear si vol leads >10K/mes
2. **Cross-asesor SIEMPRE manual**: NO auto-merge entre asesores distintos · puede generar backlog si volumen alto · founder approved trade-off
3. **Chain SHA-256 grows linearly**: collection `audit_immutable_log` insert-only sin TTL · estimado 50K entries/año a tier T3 actual · evaluar cold archive post-Year-1
4. **Cooldown 90d hardcoded**: NO configurable per-tier/per-dev · post-launch evaluar si dev tier enterprise pide 30d/60d/180d
5. **WA template 3 trigger threshold (activity_score ≥1.0)** hardcoded en `_build_wa_template_3` · NO config UI superadmin · evaluar post-volumen real
6. **fraud_pattern_cron** detecta solo asesores con `assigned_to or created_by = asesor_id` · leads huérfanos NO flageados (acceptable per founder)

---

## 9 · Conexiones cross-módulo (cierre ciclos)

### 📥 Consume (módulos shipped previos)
- ✅ `leads` collection (W4.10 Phase Y)
- ✅ `appointments` (W4.10)
- ✅ `notifications_engine` + Resend (W4.10)
- ✅ `permissions.py` (superadmin/dev_admin gates)
- ✅ `APScheduler` sched_ie (Phase Y registrado)
- ✅ `behavioral_tracking_events` (W4.3 · activity_score feed)
- ✅ `aurora design system` (Phase X)
- ✅ `i18n es-MX` (Phase Y)

### 📤 Alimenta (módulos posteriores)
- ✅ `W5.12 Knowledge Graph` → edge `DUPLICATE_OF` desde `entity_resolution_merged_archive`
- ✅ `W5.FF feature_gate_engine` → audit_immutable_engine mandatory cada gate check (audit chain)
- ✅ `W5.20 external_insights_cron` → audit_immutable.log("cron_run") chain
- ✅ `W5.16 social_cards` → audit log first-time render best-effort
- ✅ `W5.FF4 churn_prediction_cron` → audit_immutable.log("churn_detection_run")
- 🔜 `W5.6 Scenario Storyteller` → puede narrativizar dispute history
- 🔜 `Atlax tool nuevo` (futuro) `query_audit_chain` para superadmin via IA

---

## 10 · Métricas de éxito / KPIs

| KPI | Target | Cómo medir |
|---|---|---|
| **Dedup detection rate** | ≥95% true positive en pairs score≥95 | `entity_resolution_dedup_runs` collection summary |
| **False positive rate** | ≤5% en auto-merge | `undo_merge` count / `auto_merge` count en 30d window |
| **Cross-asesor isolation effectiveness** | 100% (cero auto-merge entre asesores distintos) | Code-enforced + audit chain verify |
| **Audit chain integrity** | `verify_chain.valid=True` siempre | Cron daily o on-demand superadmin |
| **Dispute resolution SLA** | <24h (founder L561) | `dispute_resolved.timestamp - dispute_created.timestamp` |
| **Cooldown enforcement** | 0 leads creados en cooldown window | CHECK 0 returns 409 verificable |
| **Fraud pattern detection** | ≥3 variantes flageadas en 90d | `broker_fraud_patterns` collection |
| **WA template 3 trigger precision** | Solo dispara si activity_score ≥1.0 cross-project | code-enforced + audit log |

---

## 11 · Referencias

- **Doc canónico previo**: `memory/LEAD_REGISTRATION_RULES.md` (reglas founder · 6 checks · 3 plantillas WA · 6 reglas inviolables)
- **WAVE_PROGRESS rows**:
  - L255 W5.11 P1 (18h · merge previo desde origen `ca5256a3`)
  - L254 W5.11 P2 (9h · merge `c10f63e1` origen `cda4776`)
  - L253 W5.11 P3 (9h · merge `6be67984` origen `35508cf4`)
- **Commits canónicos**:
  - `ca5256a3` Emergent W5.11 P1 origen
  - `ab868c5a` Claude Code merge P1
  - `9cb1e5e3` docs P1 shipped
  - `cda4776` Emergent W5.11 P2 origen
  - `c10f63e1` Claude Code merge P2
  - `9d81e1e8` + `0d92469c` aurora audit fix posterior
  - `35508cf4` DMX Agent W5.11 P3 origen
  - `6be67984` Claude Code merge P3
  - `00374677` docs persist LEAD_REGISTRATION_RULES.md
  - `eba900a6` docs W5.11 CERRADO
- **Sesiones**: `25b3b744-fdb5-4491-93b8-4b16f4aee391.jsonl` (2026-05-01 · founder reglas L547/554/561/574/581/587)
- **Engines código**: `backend/entity_resolution_engine.py` · `backend/audit_immutable_engine.py` · `backend/entity_resolution_cron.py` · `backend/routes/entity_resolution.py` · `backend/routes/disputes.py` · `backend/routes/dev_batch4_1.py` (CHECK 0 + helpers)
- **UI superadmin**: `SuperadminDuplicates.js` · `SuperadminFraudPatterns.js` · `SuperadminAuditChain.js` · `DuplicateDiffCard.js`
- **UI dev**: `DesarrolladorDisputas.js`
- **API clients**: `frontend/src/api/entity_resolution.js` · `frontend/src/api/badges.js`

---

## 12 · Reglas inviolables (heredadas de LEAD_REGISTRATION_RULES §8)

1. **2+ asesores DIFERENTE proyecto = SIEMPRE permitido**
2. **2+ asesores MISMO proyecto = solo 1 gana · arbitra el dev**
3. **Match ≥85% multi-campo = `under_review`, NO block** (excepto exact match 100% mismo proyecto = 409 block)
4. **DMX NO arbitra disputas** · facilita comunicación dev↔asesor vía WA
5. **Leads sin asesor = pool DMX `dmx_house`** (no van directo a dev)
6. **Mensajes de disputa = genéricos** (sin nombrar asesor ni proyecto del otro)
7. **Audit chain SHA-256 insert-only** · NUNCA delete · NUNCA update (legal evidence)
8. **Cross-asesor SIEMPRE manual review** · NUNCA auto-merge
9. **Cooldown 90d enforced server-side** · CHECK 0 NO bypasseable client
10. **WA template 3 dispara SOLO si rejected + activity_score cross-project ≥1.0**
