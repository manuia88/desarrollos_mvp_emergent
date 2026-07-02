# PENDIENTES DE APROBACIÓN (N3) — el dueño decide

> Nada de esto se mergea sin aprobación explícita. Cada entrada: problema, riesgo de aplicar, riesgo de NO aplicar, rollback.

(vacío — Fase 0)

## Batch 3 — propuestas N3 (tocan auth/tokens/permisos/gating → requieren OK del dueño)

### AUD-024 · derive_user_tier: escalación cross-feature
- **Problema:** `feature_gate_engine.derive_user_tier(flags)` devuelve el `plan_tier` más permisivo de CUALQUIER flag activo del tenant (no por-feature). Con `FEATURE_GATING_ENFORCED=true`, un tenant con un solo flag enterprise obtiene 'enterprise' para TODAS las features.
- **Riesgo de aplicar:** cambiar la semántica de tier podría denegar features que hoy (fail-open) pasan → hay que mapear cada feature a su tier requerido antes de activar enforcement.
- **Riesgo de NO aplicar:** el día que se prenda `FEATURE_GATING_ENFORCED`, bypass de gating/billing.
- **Fix propuesto:** tier POR-feature (el flag que la otorga define su tier), no un máximo global; el fallback in-catalog-inactive no debe conceder el tier tope.
- **Rollback:** revertir a la lógica actual (inactiva hoy).

### AUD-021b (defensa extra) · JWT_SECRET fail-closed en env ambiguo
- **Problema:** `_prod_env_guard` solo exige JWT_SECRET con DMX_ENV EXPLÍCITO prod. Con DMX_ENV vacío/typo arranca con secreto efímero.
- **Fix propuesto:** tratar "ni dev ni prod-explícito" como prod para el secreto (abortar si JWT_SECRET falta). Alinear con la regla fail-closed de cookies/HSTS.
- **Riesgo:** podría abortar arranques dev mal etiquetados (mitigable exigiendo DMX_ENV=local explícito en dev).

### AUD-023b (defensa extra) · tenant_of() nunca colapsar a 'default' compartido
- **Fix propuesto:** que `tenant_of()` caiga a `f"user:{user_id}"` en vez de `'default'` cuando no hay tenant/org. Requiere revisar los 244 callsites + si existe data legítima con tenant_id='default' (seed) → migración. Por eso N3.
