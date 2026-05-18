# W5.FF · Feature Visibility Matrix · Spec canónico

**Última actualización**: 2026-05-18 (founder approved Plan híbrido 80/20 · 28h en 5 batches)

**Doc canónico** que define el sistema de visibility configurable per-user/per-feature estilo GoHighLevel snapshots.

---

## 0 · Origen + decisión arquitectónica

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-18 | actual | Founder propuso: "no dejarlo solo para tier 3 · todas funciones/datos/métricas que tiene superadmin · elegir qué dev/asesor puede ver qué · estilo GHL snapshots ya tenemos vertical_products" |
| 2026-05-18 | actual | Master Dev análisis: 45 features visibles (18 DEV + 19 ASESOR + 8 INMOB) vs FEATURE_CATALOG actual 10 keys · gap 35 features |
| 2026-05-18 | actual | Founder approved: 5 batches · checkpoint strategy · plan híbrido Claude Code 22h + Emergent 6h |

---

## 1 · Defense in Depth · 7 contramedidas arquitectónicas (NO cascada)

### 1.1 · FAIL-OPEN default · NO bloqueante
Si `feature_flags_engine` cae → todos los features quedan VISIBLES (degraded permissive). Mejor mostrar de más que bloquear todo.

### 1.2 · 3-Layer Cache (defense in depth)
- **L1** request-scope cache · 0ms overhead intra-request
- **L2** memoria LRU 5min · resiliente backend down
- **L3** sessionStorage browser 24h · resiliente network fail

### 1.3 · Self-registering features
Cero refactor para feature N+1. Cada componente declara su key vía `@requires_feature("battle_card")` decorator · catalog auto-builds al startup.

### 1.4 · Legacy adapter
Features existentes (Battle Card · FSD · etc) mantienen tier check actual. Adapter middleware mapea tier→feature_flag transparente. Migration gradual.

### 1.5 · Eventual consistency
Cambio superadmin → publish event. Cliente refresh al próximo poll (max 5min). Acceptable lag · cero infra realtime.

### 1.6 · Versioning + Migration safe
FEATURE_CATALOG schema versionado. Auto-migrate al startup. Rollback safe.

### 1.7 · Observability mandatory
Cada gate check → metric logged (denial · grant · cache_hit). Cierra ciclo con audit_immutable W5.11.

---

## 2 · Plan híbrido · 5 batches · 28h

### W5.FF1 · Foundation Core defensiva · 6h · **Claude Code** ✅ SHIPPED 2026-05-18

| Sub | h | Status |
|---|---|---|
| A | 3h | ✅ `backend/feature_gate_engine.py` NEW 206L · decorator + FAIL-OPEN + delegación pura W2.4 SA5 · audit log |
| B | 2h | ✅ `frontend/src/hooks/useFeatureFlag.js` EXTENDED · L3 sessionStorage + alias useFeatureFlags + clearCache export · `api/feature_flags.js` NEW |
| C | 1h | ✅ Endpoint `/api/me/feature-flags` EXTENDED backward compat aditivos (tier+cached_at+expires_in_s) · Opción C+ no greenfield |

**Decisión arquitectónica clave 2026-05-18** (founder approved Opción C+):
- NO crear `/api/me/features` paralelo · usar legacy `/api/me/feature-flags` existente con campos aditivos backward compat
- NO replace `useFeatureFlag.js` · EXTEND para mantener consumers W2.4 SA5 (UpgradeTeaser.js)
- Delegación pura `feature_gate_engine.get_user_features()` → `feature_flags_engine.get_tenant_flags()` (cero duplicación)

**Tags rollback**:
- pre-W5.FF1-foundation-20260518-0930 (rollback safe)
- shipped-W5.FF1-foundation-20260518-0946 (post-checkpoint)
- SHA main + conflict: `6816d80`

**Riesgos residuales NO bloqueantes** (resolver en W5.FF2-4):
1. Audit chain volume (45 features × N requests) → sample rate 10% en W5.FF4
2. Tier "free" si 0 flags activos → W5.FF2 Legacy adapter mapea tier de org doc
3. L3 sessionStorage NO se limpia en logout → W5.FF2 conectar `clearFeatureFlagsCache()` al logout handler

**Files NEW**:
- `backend/feature_gate_engine.py` (decorator + FAIL-OPEN)
- `frontend/src/hooks/useFeatureFlag.js` (hook + 3-layer cache)
- `frontend/src/api/feature_flags.js` (client)

**Files EDIT**:
- `backend/feature_flags_engine.py` (extend existing W2.4 SA5 · NO replace)
- `backend/server.py` (register endpoint)

**Validar antes de P2**: 24h producción · graceful degradation tests · cero cascada confirmada.

---

### W5.FF2 · Self-registering catalog + Legacy adapter · 4h · **Claude Code** ✅ SHIPPED 2026-05-18

| Sub | h | Status |
|---|---|---|
| A | 2h | ✅ `backend/feature_registry.py` NEW 130L · @register_feature decorator + ensure_catalog_synced startup + SCHEMA_VERSION=1 · get_extended_catalog merge |
| B | 2h | ✅ `backend/feature_legacy_adapter.py` NEW 102L · TIER_TO_FEATURES inheritance free⊂pro⊂enterprise · resolve_features_from_tier · merge_legacy_with_flags |

**Decisión arquitectónica**:
- Legacy FEATURE_CATALOG MANTIENE autoridad (consumers existentes intactos)
- get_extended_catalog() MERGE aditivo · legacy gana en conflict
- merge_legacy_with_flags() dual-path: si adapter [] → fallback W5.FF1 (cero regresión)
- Lazy imports evitan circular · startup FAIL-SOFT

**Tags rollback**:
- pre-W5.FF2-catalog-20260518-1047
- shipped-W5.FF2-catalog-20260518-1056
- SHA main + conflict: `89f009d5`

**Riesgos residuales NO bloqueantes**:
1. Concurrent startup index warnings → idempotente, no fatal
2. _REGISTRY vacío hasta W5.FF4 migration → esperado, ensure_catalog_synced sincroniza 0 si vacío
3. merge tenant-scoped, no user-scoped → W5.FF3+ extender signature si necesario

---

## 🏆 PLAN W5.FF · CERRADO COMPLETO 2026-05-18

**Total**: 28h / 28h · 5 batches Claude Code ULTRA-defensivo · 0 bugs aurora · 0 reescrituras críticas

| Batch | Horas | SHA | Tag rollback |
|---|---|---|---|
| W5.FF1 Foundation defensiva | 6h | `6816d80` | `pre-W5.FF1-foundation-20260518-0930` |
| W5.FF2 Catalog+Adapter | 4h | `89f009d5` | `pre-W5.FF2-catalog-20260518-1047` |
| W5.FF3 UI Visibility Matrix | 6h | `be6d2e4b` | `pre-W5.FF3-matrix-20260518-1101` |
| W5.FF4 Migration+Analytics+Churn | 8h | `d0d4c27e` | `pre-W5.FF4-migration-churn-20260518-1159` |
| W5.FF5 A/B Testing + Bulk CSV | 4h | `4775ec37` | `pre-W5.FF5-abtest-csv-20260518-1227` |

**Sistema activo**:
- Feature visibility per user/feature configurable desde superadmin
- 10 endpoints superadmin (`/api/superadmin/features/*`)
- Atlax tool #22 `query_my_features` con sources_breakdown
- Cron churn detection daily 04:00 UTC + sales alerts
- A/B testing per feature con chi-square stats
- Bulk CSV import 100 users transactional
- Audit chain inmutable cada operación
- Defense in depth: FAIL-OPEN + 3-layer cache + legacy adapter + dependencies cascade

---

### W5.FF3 · UI Visibility Matrix + Plantillas + Atlax · 6h · **Claude Code ULTRA-defensivo** ✅ SHIPPED 2026-05-18

**SHA**: `be6d2e4b` · post-tag `shipped-W5.FF3-matrix-20260518-1154`
**Audit independiente Master Dev**: 10/10 PASSED · cero hex hardcoded · sidebar 7 secciones intactas · SuperadminLayout diff mínimo (1 línea real) · navByRole +1 item tier 4 (cero renumeración) · build 19.76s
**Cumplió contrato anti-recurrencia**: Claude Code ULTRA-defensivo pasó al primer intento donde emergent falló 5 veces consecutivas en aurora superadmin



⚠️ **DECISIÓN ARQUITECTÓNICA 2026-05-18**: emergent intento 1 (SHA `5b8079f` · NUNCA mergeado) **ROLLBACK** por 3 bugs catastróficos: SuperadminLayout.js reescrito completo · paleta inventada (operacion=#F59E0B vs canónico #FFA040) · syntax error variable `section` duplicada · build FAIL.

Track record emergent superadmin: 5 bugs aurora consecutivos en 5 batches. Reassigned a **Claude Code terminal con prompt ULTRA-defensivo** "solo añadir · NUNCA reescribir": Edit puntual 1 línea regex sectionFromPath · Edit puntual 1 item navByRole tier 4 · cero reescritura archivos críticos.

Pre-checkpoint activo: `pre-W5.FF3-matrix-20260518-1101` (rollback safe <2 min).

| Sub | h | Qué hace |
|---|---|---|
| A | 4h | UI `/superadmin/feature-visibility` aurora INTELIGENCIA · grid 45 features grouped by portal (DEV 18 · ASESOR 19 · INMOB 8) · search + bulk apply |
| B | 1h | 3 Plantillas Snapshots: Starter · Pro · Enterprise · endpoint POST `/api/superadmin/features/apply-template` · 1-click apply |
| C | 1h | Atlax tool #22 `query_my_features` + system prompt extension |

**Files NEW** (emergent):
- `frontend/src/pages/superadmin/SuperadminFeatureVisibility.js`
- `frontend/src/components/superadmin/FeatureMatrixGrid.js`
- `frontend/src/components/superadmin/FeatureTemplateModal.js`
- `frontend/src/api/feature_visibility.js`
- `backend/routes/feature_visibility.py` (4 endpoints superadmin)

**Validar antes de P4**: superadmin grant/revoke manual · plantillas funcionan · Atlax responde.

---

### W5.FF4 · Migration 40 features + Analytics + Dependencies + Churn · 8h · **Claude Code**

| Sub | h | Qué hace |
|---|---|---|
| A | 2h | 40 features remaining migration (añadir decorator a 40 archivos backend · cero código business tocado) |
| B | 2h | Usage analytics: agregación `behavioral_tracking_events` per feature_key · endpoint `/api/superadmin/features/usage` · UI pequeña embed en matrix |
| C | 1h | Dependencies enforcement: `requires_features[]` validation cascade UP/DOWN al grant/revoke |
| D | 3h | Churn prediction cron daily 04:00 UTC · detecta features con usage drop >70% vs baseline 30d · emit notif `churn_risk_alert` a sales + email auto al user |

**Files NEW**:
- `backend/feature_usage_analytics.py` (agregación behavioral)
- `backend/feature_dependencies.py` (validator)
- `backend/churn_prediction_engine.py` + `backend/churn_prediction_cron.py`

**Files EDIT** (40 features):
- Cada feature backend añade `@requires_feature("key")` decorator (1 línea)

**Validar antes de P5**: 45 features bajo flags · analytics muestra usage real · churn alerts funcionan.

---

### W5.FF5 · A/B testing + Bulk CSV · 4h · **Claude Code**

| Sub | h | Qué hace |
|---|---|---|
| A | 3h | A/B testing per feature: bucket assignment `hash(user_id) % 100 < threshold` · variant tracking collection `ab_test_variants` TTL 90d · stats aggregation endpoint · admin UI variant assignment (mini-widget en matrix) |
| B | 1h | Bulk CSV import 100 users: endpoint `POST /api/superadmin/features/bulk-csv` · file upload + parse + validate + transactional bulk apply (rollback if error) |

**Files NEW**:
- `backend/ab_testing_engine.py`
- `backend/feature_bulk_csv.py`

**Files EDIT**:
- `frontend/src/pages/superadmin/SuperadminFeatureVisibility.js` (mini-widget A/B + button CSV upload)

---

## 3 · Cierre ciclos · TODOS los módulos shipped tocados

### 📥 Consume (módulos shipped)
- ✅ `feature_flags_engine` W2.4 SA5 (extend NO replace)
- ✅ `vertical_products_engine` W3.6 (pattern reference GHL-style)
- ✅ `permissions.py` (auth role/tier)
- ✅ `audit_immutable_engine` W5.11 (audit chain cada gate check)
- ✅ `behavioral_tracking_events` W4.3 (usage analytics)
- ✅ `notifications_engine` + Resend W4.10 (churn alerts + email)
- ✅ `asistente_engine` Atlax W4.4 (tool #22)
- ✅ `APScheduler` sched_ie (churn cron)
- ✅ `navByRole.js` (filter features enabled)

### 📤 Alimenta (cross-modules)
- ✅ TODAS las 45 features visibles dev/asesor/inmob portales
- ✅ Superadmin Visibility Matrix dashboard
- ✅ NotificationCenter (churn alerts)
- ✅ Sales workflow (proactive retention)
- ✅ Atlax tool #22

---

## 4 · Checkpoint Strategy (rollback safe)

### Pre-checkpoint cada batch
```bash
git tag pre-W5.FF<N>-<name>-$(date +%Y%m%d-%H%M)
git push origin --tags
```

### Post-checkpoint si validado
```bash
git tag shipped-W5.FF<N>-<name>-$(date +%Y%m%d-%H%M)
git push origin --tags
```

### Rollback plan
- **Bug pre-docs**: `git revert <merge-sha>` · <2 min
- **Bug producción**: `git reset --hard pre-W5.FF<N>-<tag>` · <2 min
- **Catastrófico**: FAIL-OPEN default ya activado · features quedan visibles mientras rollback

---

## 5 · Reglas inviolables

1. **FAIL-OPEN siempre default** · NUNCA cascada bloqueante
2. **Legacy adapter mantiene tier checks** · cero refactor 45 features hoy
3. **Self-registering decorator** · cero refactor para feature N+1 mañana
4. **Audit chain mandatory** cada gate check
5. **Tests verificables** después cada sub-chunk
6. **yarn build + python syntax** check en cada commit Claude Code
7. **Pre-checkpoint tag** antes de cada batch · zero downtime rollback

---

## 6 · Next step inmediato

1. Persistir spec ✅
2. Pre-checkpoint tag creado ✅ `pre-W5.FF1-foundation-20260518-0930`
3. Generar prompt para Claude Code terminal (otra sesión) para ejecutar W5.FF1
4. Después de W5.FF1 shipped → post-checkpoint tag + validar 24h → continuar W5.FF2
