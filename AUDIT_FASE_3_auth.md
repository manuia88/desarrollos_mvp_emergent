# AUDIT FASE 3 — Auth, sesiones y autorización
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
Las primitivas están BIEN: contraseñas con **bcrypt** (fuerte), JWT HS256, y un dependency central **`get_current_user`** consistente. Rol y tenant se leen de la **BD** por `sub` (no del token) → escalada por token imposible (verificado QA5). PERO: (1) la autorización por rol existe pero **NO siempre incluye pertenencia al objeto/tenant** (cae en Fase 1 IDOR); (2) **sin rate-limit en login** (fuerza bruta); (3) `JWT_SECRET` cae a un valor aleatorio por proceso si falta el env (invalida sesiones al reiniciar / inconsistente con múltiples instancias); (4) JWT stateless → **logout no invalida realmente** el token hasta expiración; (5) ruta frontend del Estudio usa un guard sin chequeo de rol.

**Conteo:** P0: 1 (hereda IDOR de Fase 1) · P1: 3 · P2: 2

## Flujo de auth (mapeo)
- Hash password: `server.py:1167` `bcrypt.hashpw(pw, gensalt())`; verify `:1171` `bcrypt.checkpw`. ✅ **fuerte**.
- Emisión JWT: `server.py:1179/1185` `pyjwt.encode(payload, JWT_SECRET, "HS256")`.
- Validación: `server.py:1214 get_current_user` → `:1244 pyjwt.decode(..., algorithms=["HS256"])`; lee usuario de BD por `sub`. Consistente como dependency.

### [P1] `JWT_SECRET` con default efímero
- **Ubicación:** `server.py:26` `JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))`.
- **Impacto:** si no se setea el env, cada reinicio/instancia genera un secreto distinto → todas las sesiones se invalidan al reiniciar y, con varias instancias, un token emitido por A es rechazado por B (login roto intermitente bajo escala). Está en `.env.local` para dev, pero el default es una trampa de prod.
- **Fix:** fail-closed si `JWT_SECRET` no está seteado en prod; nunca generar uno efímero.

### [P1] Sin rate-limit en login
- **Evidencia:** `grep rate_limit/limiter` en `server.py` y `routes/auth.py` → sin resultados. Los endpoints públicos de marketplace/AVM sí tienen `_rate_limit_check` (QA4), pero **login no**.
- **Impacto:** fuerza bruta de credenciales / credential stuffing sin freno.
- **Fix:** rate-limit por IP+email en login (reusar el helper `_rate_limit_check` ya existente).

### [P1] Logout no invalida el token (JWT stateless)
- **Impacto:** un token robado sigue siendo válido hasta su expiración aunque el usuario "cierre sesión". Verificar expiración configurada y si hay blocklist/rotación.
- **Fix:** lista de revocación (jti) o expiración corta + refresh con rotación; al menos confirmar TTL razonable.

### [P0→Fase1] Autorización por rol sin pertenencia
- La autorización está en el BACKEND (no solo UI) — bien. PERO varios gates validan SOLO rol/tier y no que el objeto sea del tenant (insights, battle_card, funnel, deseabilidad…). Detalle y severidad en Fase 1. Aquí se registra que el **modelo de autorización es incompleto** (rol ✅, objeto ❌ en un cluster).

### [P2] Guard de rol faltante en ruta frontend del Estudio
- **Ubicación:** `frontend/src/App.js:859` enruta `/desarrollador/estudio-mercado` con `<AdvisorRoute>`; `AdvisorRoute` (App.js:1083) solo verifica que haya sesión, NO el rol.
- **Impacto:** cualquier usuario logueado (comprador/asesor/otro dev) renderiza el shell de la vista estratégica del dev. El backend la protege (403 por ROLES) → no hay fuga de datos, pero sí superficie de UI indebida. Contrasta con `SuperadminRoute` (:1105) que sí valida rol.
- **Fix:** usar un guard de rol dev.

### [P2] Quién-ve-qué inconsistente entre endpoints dev
- `estudio_mercado.py` ROLES = {developer_admin, developer_member, developer_director, superadmin} (member ve toda la inteligencia estratégica) vs `/desarrollador/bancabilidad` = solo {developer_admin, superadmin}. Decisión de producto, hoy incoherente.

## LIMPIO (revisado)
- Contraseñas con bcrypt+salt ✅. Rol/tenant desde BD, no del token ✅ (escalada por token bloqueada, QA5). Mass-assignment de `role`/`is_admin`/`owner_id` bloqueado por allowlist en unit-fields (QA5). NoSQL operator injection en ids → bloqueado (params son strings, no dicts).
- Pendiente de verificar (no concluyente desde código): flujo de recuperación de contraseña (existencia/seguridad del token de reset) y TTL exacto del JWT → marcar para verificación.
