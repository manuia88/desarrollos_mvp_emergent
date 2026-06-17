# Veredicto de producción + plan de refactor — 2026-06-16

Síntesis master-dev de: auditoría formal F0-F12 (2026-06-10), 2 sub-agentes de prod-readiness
(seguridad + operación, 2026-06-16), las correcciones de esta sesión, y la doctrina de Fable5
(`desarrollosmx-mvp/docs/00_BIBLIA.md`). Rama `dev-redesign-tandas`.

---

## 1. VEREDICTO

**NO-GO para escala masiva (10k concurrentes). GO-CON-CONDICIONES para soft-launch (cientos
de usuarios)** una vez: (a) seteas el env de prod en emergent.sh, (b) corres el load test en
staging. **La base de seguridad es sólida** — las 4 cadenas de ataque P0 están cerradas y
verificadas, y esta sesión se taparon 22 fugas más que las auditorías viejas no vieron.

El sistema NO truena. Los dos riesgos reales son: **(1) estarías ciego** a errores en prod
(Sentry muerto) y **(2) techo bajo** por unas consultas que barren todo cuando haya datos reales
(2 de 3 ya corregidas hoy).

---

## 2. SEGURIDAD — sólida

**Las 4 cadenas P0 del AUDIT_RESUMEN: CERRADAS y verificadas.**
| Cadena | Estado |
|---|---|
| Funnel sin auth → IDOR insights/battle-card → volcado de BI | ✅ `_require_owner` + `assert_dev_project` |
| Sesión dev → mutar inventario con unit_id ajeno | ✅ `guard_project` + `_assert_unit_in_dev` + CAS atómico |
| Admin default público → superadmin → todo | ✅ `_prod_env_guard` aborta el boot (hoy más estricto) |
| Stripe webhook falso → tier enterprise → exfiltrar datos | ✅ webhook fail-closed en prod |

**Esta sesión, además:** 22 fugas cross-tenant nuevas tapadas (12 🔴 mutación + 10 🟡 lectura) +
2 candados centrales (`assert_db_project_owner`, `assert_inm_owner`) + test permanente.

**Queda (🟡, no bloquea soft-launch):** KPIs agregados sin filtro de tenant (backlog) ·
auditoría profunda a nivel de MOTOR (¿algún engine ignora el tenant_id que recibe? — verificación
en curso) · prompt-injection: `llm_safety` solo en 2 motores.

---

## 3. OPERACIÓN — cerca, con punch-list

**🔴 Bloqueante #1 — Sentry muerto en prod** (`.env:79` tiene un token `sntryu_…`, no una URL).
Con fail-open en todos los motores, **ningún error de prod se reportaría**. → tu mano: setear el
`SENTRY_DSN` real (ya lo tienes en `.env.local`).

**Perf a escala (full-scans que muerden con datos reales):**
- ✅ `cerebro_predictions` sin índice → **CORREGIDO hoy** (índice de drift).
- ✅ `amenidades_engine` barrido ilimitado → **CORREGIDO hoy** (cap 50k).
- ✅ `bancabilidad` recalcula lifts por proyecto → **CORREGIDO hoy** (caché TTL).
- 🟡 LLM síncrono dentro del request (satura workers bajo carga) → mover a background/cola.
- 🟡 Rate-limit + login-guard in-memory por proceso → con N instancias el límite es N×límite →
  Redis, o documentar single-instance como restricción de deploy.

**Ya cerrado (no re-flag):** índices market_index/units/developer_reports · secretos fail-closed ·
security headers · rate-limit login · Stripe webhook · kill-switch IA · tope de costo LLM.

---

## 4. PLAN DE REFACTOR — los candados que matan los parches (doctrina Fable5)

La razón de fondo de seguir parchando: en emergent el aislamiento, los roles y la conexión
end-to-end **dependen de que cada endpoint se acuerde**. En Fable5 son estructurales. El refactor
no es reescribir — es construir el enforcement una vez.

**Nivel 1 — corta el sangrado (máxima palanca):**
1. **Suite de quality-gates en CI**: `audit:dead-ui` + dead-endpoints + auditoría-de-tenant +
   tests. *Esto solo* hace que huérfanos y fugas no puedan acumularse otra vez. (Reglas Fable5 1, 10.)
2. **Enforcement central de tenant** (scope por defecto / "db con scope" por request) → reemplaza
   los 22 asserts puntuales como el comportamiento normal. (Regla 2.)
3. **RBAC uniforme** (un `require_role` por ruta). (Regla 3.)

**Nivel 2 — calidad/escala:**
4. Schema único front↔back (generar validación/tipos del front desde Pydantic). (Regla 4.)
5. Flag `data_quality('real'|'seeded'|'placeholder')` + píldora visual automática. (Regla 13.)
6. Cortar `server.py` (2,790 líneas) por dominio — sin archivo-dios. (Regla 14.)

**Nivel 3 — pulido:** emisión consistente de eventos (regla 5) · sesión única robusta (regla 15).

No incluye migrar a Next.js/Supabase: emergent es el keeper, se aplica la DOCTRINA, no el stack.

---

## 5. CAMINO A PRODUCCIÓN (3 pasos)

**Paso A — tu mano en emergent.sh** (sin esto, prod arranca roto o ciego):
`DMX_ENV=prod` · `SENTRY_DSN` (URL real) · `JWT_SECRET` · `ADMIN_PASSWORD` (≠ default) ·
`STRIPE_WEBHOOK_SECRET` · `LFPDPPP_SALT` · `IE_FERNET_KEY` · `CRON_SECRET` ·
`CORS_ORIGINS=https://desarrollosmx.io` · `REACT_APP_POSTHOG_API_KEY` (frontend) ·
+ correr la carga de datos 1 vez. **Atlas:** confirmar backups/PITR + replica set.

**Paso B — verificar a escala (staging):** correr `scripts/preflight_staging.py` (confirma 403/404
cross-tenant) + `load-tests/dmx_load.js` (k6, STAGE_MAX=200→subir) para el techo numérico real.

**Paso C — soft-launch** (cientos de usuarios) con Sentry vivo. Antes de escalar a miles:
Nivel 1 del refactor (CI gates + enforcement central) + LLM a background + rate-limit a Redis.
