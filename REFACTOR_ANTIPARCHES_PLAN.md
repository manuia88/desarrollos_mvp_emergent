# Plan de refactor anti-parches — 2026-06-16

Objetivo: dejar de parchar endpoint por endpoint. Construir el **enforcement estructural** que
la BIBLIA de Fable5 hace obligatorio, adaptado al stack de emergent (FastAPI + MongoDB + React CRA).
No es reescribir ni migrar stack — es agregar 6 candados **una vez**.

Checkpoint de retorno: `checkpoint-seguridad-2026-06-16`. Regla: cada candado = su propio
commit + verificación, detrás del checkpoint. Si uno falla, rollback sin perder los demás.

---

## ⚠️ REVISIÓN v2 — tras doble filtro (Sr Dev + Master Dev). LEE ESTO PRIMERO.

El plan original (abajo) sirve como **catálogo de deuda**, pero como *estrategia de ahora* tenía
3 fallas reales, confirmadas con evidencia del código:

1. **Secuencia invertida.** El refactor NO desbloquea el soft-launch — eso lo hacen Sentry + el
   load test (operación). La seguridad ya está cerrada y verificada. Hacer 11-13 días de refactor
   antes de tener un usuario = optimizar un problema que aún no tienes (parches futuros) mientras
   el real (ceguera operacional) sigue abierto.
2. **Candado 2 (proxy de tenant) era TRAMPA y estaba mal dimensionado ~10x.** Dije "30-40 rutas";
   la realidad medida: **1,711 call-sites** de `db.<coll>` en 215 archivos (`db.leads` 157×,
   `db.users` 95×…). Y el proxy en Mongo NO es enforcement (el dev igual tiene que usarlo) +
   deja fuera `aggregate`(69)/`bulk_write`/`count`(232) → cobertura parcial = falsa seguridad.
   No hay un campo de dueño único (son 10 campos; en `leads` un set de 5).
3. **Estimaciones ~2x optimistas**, concentradas en candados 2 y 6. Candado 6 (cortar server.py)
   es TRAMPA pre-launch: 142 archivos hacen `from server import get_current_user` y solo funciona
   porque los imports son function-local; sin tests E2E sobre 244 rutas, partirlo puede dejar
   routers a medio registrar en silencio.

### Estrategia corregida (la que se ejecuta)

| Cuándo | Qué | Por qué |
|---|---|---|
| **AHORA (tu mano, horas)** | Sentry DSN + env en emergent.sh + load test en staging | Único camino crítico al launch |
| **½-1 día (yo)** | **`audit_tenant.py` bien hecho** en el CI que ya existe | El keystone real · captura el 80% del valor anti-parche |
| **SOFT-LAUNCH** | Cientos de usuarios, Sentry vivo, datos reales | — |
| **Post-launch / al retomar features** | Lo demás, acoplado al módulo que toques | El ROI del refactor llega cuando vuelves a construir |

**`audit_tenant.py` bien hecho** (no como lo describí): extrae rutas vía `app.routes` en runtime
(no regex); heurística = marcar un handler solo si toca colección-con-dueño Y **no hay ningún
`assert_*`/`_auth*` en el cuerpo** (NO "filtro dentro del find" — el patrón real es guard-en-otra-
línea + find-by-id, eso daría falsos positivos masivos); arranca en **WARN + allowlist curada**,
**falla solo sobre el delta del PR**. Allowlist de colecciones públicas (developments, ie_scores,
colonias, zones).

### Candados corregidos (cuando se hagan, post-launch)
- **Candado 2 → RECORTADO.** Mata el proxy. En su lugar: helper explícito `tenant_filter(user, coll)`
  que devuelve el `$or` correcto, se mete a mano en `find` y compone con `aggregate`
  (`{"$match": tenant_filter(...)}`). El `audit_tenant` lo vigila. Incremental, no big-bang.
- **Candado 3 → "por dentro".** No migrar ~400 handlers a `Depends`. Un `check_role(request, *roles)`
  central que envuelven los ~30 helpers existentes (`_auth_dev`, etc.). Misma ergonomía, una fuente
  de roles, cero cambios de firma. ~1 día.
- **Candado 6 → aplazar post-launch.** Y cuando se haga, extraer SOLO middleware/startup/helpers
  puros, **dejar `get_current_user`/auth en server.py**, con `audit_dead_endpoints` verde antes/después.
- Candados 4 (openapi-ts) y 5 (data_quality) se mantienen como en el catálogo, post-launch (5 opcional
  pre-launch si la seed visible molesta).

El detalle original de cada candado queda abajo como referencia, con el dimensionamiento corregido
por esta revisión.

---

## NIVEL 1 — CORTA EL SANGRADO (lo que mata más parches)

### Candado 1 · Suite de auditorías en CI (el keystone)
**Qué parche elimina:** que yo encuentre a mano 20 componentes muertos, 19 endpoints muertos,
6 cables rotos y 22 fugas. Se acumulan porque NADA los detecta.
**Cómo se construye (concreto):** 4 scripts en `scripts/audit/` + un job de GitHub Actions:
- `audit_dead_endpoints.py` — extrae todas las rutas FastAPI (resolviendo prefijos) y las cruza
  contra cada `/api/...` del frontend. Sin caller → lo lista. (Ya hice el algoritmo a mano; se
  vuelve script.)
- `audit_dead_ui.py` — componentes React sin importador + páginas sin ruta (BFS desde App.js).
- `audit_broken_cables.py` — llamadas del front a paths que NO existen en el backend.
- `audit_tenant.py` — **el más importante:** escanea `backend/routes/*.py` y marca handlers que
  hacen `db.<colección_con_dueño>.find/update` usando un id del request SIN un `assert_dev_*`/
  `assert_*_owner`/filtro de tenant cerca. Es el equivalente al `audit:rls` de Fable5.
- Job CI: corre los 4 + `pytest` en cada PR. **Falla la build** si aparece un huérfano/fuga nueva.
**Esfuerzo:** ~1.5-2 días (el algoritmo de cada uno ya está probado a mano esta sesión).
**Cómo se verifica:** correrlos hoy debe dar ~0 nuevos (ya limpiamos); meter un endpoint sin
guard a propósito y confirmar que el CI truena.
**Por qué es el keystone:** convierte las reglas 2/3 de Fable5 de "acordarse" a "la build no pasa".

### Candado 2 · Enforcement central de tenant (scope por defecto)
**Qué parche elimina:** los 22 `assert_dev_org` que puse uno por uno. Cada endpoint nuevo puede
olvidarlo → nueva fuga → nuevo parche.
**Cómo se construye (concreto):** un helper `scoped(db, collection, user)` en `tenant_scope.py`
que devuelve un proxy de colección con el filtro de tenant ya inyectado en find/update/delete
(superadmin = sin filtro). Los endpoints usan `scoped(db, "leads", user).find(...)` en vez de
`db.leads.find(...)`. El `audit_tenant.py` (candado 1) marca como error el acceso crudo `db.leads`
en routes/. Los `assert_*` actuales quedan como la red de respaldo.
**Esfuerzo:** ~2-3 días (el proxy + migrar las ~30-40 rutas de colecciones con dueño · gradual,
las viejas siguen con assert hasta migrarlas).
**Cómo se verifica:** el test `test_tenant_scope.py` se extiende a `scoped()`; el audit no marca
ningún acceso crudo en las rutas migradas.

### Candado 3 · RBAC uniforme (un solo guard)
**Qué parche elimina:** los chequeos de rol inline e inconsistentes (`_auth`, `_auth_dev`,
`_auth_inm`, `_auth_admin`…), cada uno con su propia lógica.
**Cómo se construye (concreto):** una dependencia `require_role(*roles)` en un módulo central,
declarada por ruta con `Depends(require_role("developer_admin","superadmin"))`. Reemplaza los N
helpers. El `audit_tenant.py` también marca rutas sin rol declarado.
**Esfuerzo:** ~1.5-2 días (crear el guard + migrar las rutas · gradual).

---

## NIVEL 2 — CALIDAD / ESCALA

### Candado 4 · Schema único front↔back
**Qué parche elimina:** validación duplicada (Pydantic atrás, JS reimplementado al frente) que se
desincroniza.
**Cómo se construye:** FastAPI ya autogenera OpenAPI → generar tipos/cliente TS para el front
(`openapi-typescript`). El front consume tipos generados; Pydantic es la única fuente. Empezar por
los formularios críticos (citas, leads, captación).
**Esfuerzo:** ~2-3 días (setup + migrar formularios clave · el resto gradual).

### Candado 5 · Flag `data_quality` + píldora visual
**Qué parche elimina:** manejar "dato real vs semilla vs vacío" feature por feature (lo que hice
con las 6 features a medio construir).
**Cómo se construye:** campo `data_quality('real'|'seeded'|'placeholder')` en colonias/proyectos/
unidades al escribir + un `<DisclosurePill/>` que se renderiza solo donde hay dato semilla.
**Esfuerzo:** ~1.5 días (migration de campo + componente + cablear en las vistas con seed).

### Candado 6 · Cortar `server.py` por dominio (sin archivo-dios)
**Qué parche elimina:** `server.py` = 2,790 líneas (routing + middleware + auth + startup + core).
Cualquier cambio hace ripple.
**Cómo se construye:** extraer middleware → `middleware/`, auth core → `auth_core.py`, startup →
`startup.py`; dejar `server.py` como composition root delgado. Sin cambiar comportamiento.
**Esfuerzo:** ~2 días (mecánico pero requiere cuidado con imports circulares · un commit por extracción).

---

## NIVEL 3 — PULIDO (post soft-launch)
- **Eventos consistentes** (regla 5): middleware que emite un `behavioral_event` en cada mutación,
  en vez de emisión esporádica. ~1 día.
- **Sesión única robusta** (regla 15): `device_fingerprint` + logout instantáneo cross-device. ~1.5 días.

---

## ORDEN RECOMENDADO Y TOTAL
1. **Candado 1 (CI)** primero — es el que evita que todo lo demás se vuelva a degradar. ~2 días.
2. **Candado 2 (tenant central)** + **3 (RBAC)** — cierran la raíz de las fugas. ~4-5 días.
3. Nivel 2 (4,5,6) — calidad. ~5-6 días.
4. Nivel 3 — post soft-launch.

**Total Nivel 1+2: ~11-13 días.** Se puede paralelizar con sub-agentes (cada candado es
independiente salvo que 2 y 3 comparten las rutas). El Nivel 1 solo (~2 días) ya cambia la
trayectoria: a partir de ahí, los parches no se acumulan.

## QUÉ NO ES
No migrar a Next.js/Supabase/tRPC/RLS. Emergent es el keeper. Se aplica la DOCTRINA de Fable5
(enforcement estructural), no su stack.
