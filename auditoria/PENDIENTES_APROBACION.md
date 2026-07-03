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

### AUD-031 ✅ RESUELTO (2026-07-03 · Batch 12, founder ordenó cero deuda): token HMAC-SHA256 embebido en el link + endpoint exige compare_digest (403). Sin gracia (nunca se enviaron correos). Test test_aud_backlog_cierre.py. [Contexto original abajo.]

### AUD-031 (LOW) · newsletter opt-out sin token firmado
- **Problema:** `GET /api/users/{user_id}/newsletter-opt-out/{segment}` (`routes/newsletter.py:176`) desuscribe sin auth con un `user_id` enumerable → un `<img src>`/prefetch (CSRF vía GET) puede desuscribir a un usuario específico. Impacto bajo (molestia reversible, sin fuga de datos).
- **Por qué NO se corrigió ya:** el fix correcto = token de baja HMAC-firmado (no adivinable) embebido en el link del email, validado en el handler. Eso **toca la generación de correos** (plantillas + envío) y rompería los links de unsubscribe ya enviados; quitar el GET viola la UX/compliance de one-click-unsubscribe. Requiere cambio coordinado → N3.
- **Fix propuesto:** generar `unsub_token = HMAC(user_id+segment, SERVER_SALT)` al enviar el email, cambiar el link a `?token=`, y validarlo en el handler (fallback: aceptar el link viejo por una ventana de gracia). Mantener GET (compat email).
- **Riesgo de aplicar:** links viejos dejan de funcionar sin la ventana de gracia.
- **Riesgo de NO aplicar:** un tercero puede desuscribir a un usuario puntual (molestia, no fuga).
- **Rollback:** trivial (revertir el handler a `user_id` crudo).

## Batch 6 — diferidos

**5 de 6 RESUELTOS por decisión del founder (2026-07-02 · ver CORRECCIONES.md):** AUD-043 (Kanban→señal anonimizada), AUD-045 (demanda→solo superadmin), AUD-046 (conteo público→login+rango), AUD-047 y AUD-048 (higiene, corregidos). Queda 1 pendiente de aclaración:

### AUD-044 ✅ RESUELTO (2026-07-02) — el founder confirmó: compartir compradores entre inmobiliarias está PROHIBIDO. Corregido como AUD-050 (red-comercial ya NO expone KPIs derivados de leads del socio, solo branding de la alianza). Ver CORRECCIONES.md. [Contexto original abajo.]

### AUD-044 (MEDIUM) · "Red comercial" muestra el negocio completo de una inmobiliaria aliada
- `services/directory_aggregator.py:138`. CONTEXTO: en DMX una inmobiliaria puede formar una **alianza** con otra para compartir compradores/inventario. En la pantalla "Red comercial", cuando ves a una inmobiliaria **aliada**, hoy se le muestran sus números TOTALES (todos los cierres y leads que ha hecho, incluso con clientes que NADA tienen que ver contigo) — no solo lo que ustedes dos comparten por la alianza.
- **Ejemplo:** te aliaste con "Inmobiliaria X" para pasarse compradores. En su tarjeta ves "X cerró 200 ventas este año" — pero esas 200 son TODO su negocio, no las que hicieron juntos. Eso revela el volumen real del socio.
- **Decisión pendiente del founder:** (a) **acotar** a solo lo compartido por la alianza (lo que hicieron juntos), o (b) **dejar su track-record total** como señal de credibilidad del socio.
