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

## Batch 4 — propuesta N3 (barrido IDOR)

### AUD-031 (LOW) · newsletter opt-out sin token firmado
- **Problema:** `GET /api/users/{user_id}/newsletter-opt-out/{segment}` (`routes/newsletter.py:176`) desuscribe sin auth con un `user_id` enumerable → un `<img src>`/prefetch (CSRF vía GET) puede desuscribir a un usuario específico. Impacto bajo (molestia reversible, sin fuga de datos).
- **Por qué NO se corrigió ya:** el fix correcto = token de baja HMAC-firmado (no adivinable) embebido en el link del email, validado en el handler. Eso **toca la generación de correos** (plantillas + envío) y rompería los links de unsubscribe ya enviados; quitar el GET viola la UX/compliance de one-click-unsubscribe. Requiere cambio coordinado → N3.
- **Fix propuesto:** generar `unsub_token = HMAC(user_id+segment, SERVER_SALT)` al enviar el email, cambiar el link a `?token=`, y validarlo en el handler (fallback: aceptar el link viejo por una ventana de gracia). Mantener GET (compat email).
- **Riesgo de aplicar:** links viejos dejan de funcionar sin la ventana de gracia.
- **Riesgo de NO aplicar:** un tercero puede desuscribir a un usuario puntual (molestia, no fuga).
- **Rollback:** trivial (revertir el handler a `user_id` crudo).

## Batch 6 — diferidos (aislamiento multi-tenant · necesitan decisión de PRODUCTO)

Los 4 primeros son conteos/métricas que CRUZAN tenants a propósito o no — hay que decidir si es una **señal de mercado deliberada** (dejar, documentar y agregar/anonimizar) o una fuga (acotar por tenant). Los 2 últimos son higiene BAJA.

### AUD-043 (MEDIUM) · cross_project_count cuenta leads del mismo comprador en TODA la plataforma
- `routes/dev_batch4_2.py:367` (Kanban): por cada lead con `client_global_id`, cuenta cuántos otros leads activos del MISMO comprador existen en todos los tenants. Expone a un dev cuántos competidores trabajan al mismo comprador.
- **Decisión:** ¿es señal intencional ("este comprador está caliente en el mercado")? Si sí → agregarlo/anonimizarlo. Si no → `tenant_filter(user,'leads')` en el count.

### AUD-044 (MEDIUM) · red-comercial expone el volumen TOTAL de negocio del socio
- `services/directory_aggregator.py:138`: KPI de una inmobiliaria socia cuenta TODOS sus deals cerrados/leads, no solo los compartidos por la alianza.
- **Decisión:** acotar a los leads/proyectos de la alianza aprobada, o mostrar solo conteos compartidos.

### AUD-045 (MEDIUM) · índice de demanda lee todas las colecciones sensibles sin tenant
- `services/demand_engine.py:36` (GET /demanda, developer_admin): funnel + top-queries + by-colonia sobre leads/búsquedas/citas/clicks de TODOS los tenants.
- **Decisión:** ¿es un índice de MERCADO (global, ok) o debe ser por-tenant? Si mercado → restringir el endpoint a superadmin o marcarlo como agregado público. Si por-tenant → `tenant_filter` en cada lectura.

### AUD-046 (LOW) · conteo público de leads por proyecto
- `probability_engine.py:164` (GET /api/probability/{type}, T0 público): `value_used` embebe el conteo exacto de leads de cualquier project_id.
- **Decisión:** bucketizar/ocultar el conteo exacto, o exigir auth+propiedad para `sells_complete`.

### AUD-047 (LOW · higiene) · timestamp de weekly_briefs cross-tenant en un probe
- `probes/health_score.py:74`: el probe devuelve el timestamp del brief más reciente de cualquier tenant. Fix: acotar por tenant o volverlo booleano agnóstico.

### AUD-048 (LOW · higiene) · _build_pdf con org='default' no filtra
- `routes/dev_batch5.py:559`: un dev sin tenant real + template con `dev_org_id='default'` genera PDF con leads de todos los tenants. Solo alcanzable por usuario mal-provisionado; en prod `_demo_mode` off lo mitiga. Fix: filtrar por el tenant del CALLER, no del template.
