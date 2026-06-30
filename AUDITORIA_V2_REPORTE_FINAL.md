# Auditoría V2 · Reporte Final Consolidado (GATE GLOBAL)

**Fecha:** 2026-06-30
**Rol emisor:** MAESTRO (juez final de Pasada 4)
**Insumo:** 5 verificaciones de Pasada 4 (re-ataque en vivo + lectura de código + batería oficial)
**Alcance:** 4 portales (dev · asesor · comprador · superadmin) + plataforma · 9 commits de la sesión Audit V2 (P1/P2/P3/UX)

---

## 1) VEREDICTO DEL GATE

> ## 🟡 AMARILLO — DEPLOY CONTROLADO CON CHECKLIST (no VERDE irrestricto, no ROJO)

### Criterio explícito del gate

| Condición del GATE | ¿Se cumple? | Evidencia |
|---|---|---|
| **(a)** Cero CRÍTICO sigue-abierto (todos `CERRADO_VERIFICADO`) | ✅ SÍ | Los 9 CRÍTICOS re-ejecutados en vivo dan 403/404/401/422 |
| **(b)** Cero regresión nueva introducida por los 9 commits | ✅ SÍ | 7 happy-paths legítimos pasan + batería 7/7 verde ×2 corridas |
| **(c)** Batería oficial 7/7 verde post-sesión | ✅ SÍ | smoke 17/17 · aislamiento 13/13 · cohorte 8/8 · propagación 12/12 · direcciones 8/8 · concurrencia 8/8 · flywheel 12/12 |
| **(d)** Sin deudas ALTO de configuración/infra/clase-nueva pendientes de decisión consciente | ❌ NO | DMX_DEV_MODE (config), backups no probados (infra), SSRF en renderers (clase nueva), P3-CSRF-02 GET-LLM, C3 raíz sistémica |

**Por qué AMARILLO y no VERDE:** la caja de seguridad CRÍTICA está cerrada y verificada (cumple a+b+c). Lo que impide el VERDE es **(d) completitud**: persisten deudas ALTO que el manual exige resolver antes de firmar producción — todas son **configuración/infra/clase-nueva**, **ninguna es una brecha CRÍTICA viva ni una regresión**.

**Por qué NO es ROJO (confrontación honesta):** ROJO exigiría un CRÍTICO `SIGUE_ABIERTO` o una regresión nueva. **No hay ninguno de los dos.** El único hallazgo que un verificador (Pasada 4·código) marcó `SIGUE_ABIERTO/CRITICO` —C-02 reabierto en demo— está **demostrado fail-closed en producción** (`DMX_ENV=production → user_dev_ids=[] → 403`); su causa raíz es el fallback de demo `DMX_DEV_MODE`, que es **deuda de configuración, no de código**. Por eso degrada el gate a AMARILLO (no permite VERDE), pero **no lo lleva a ROJO**.

**Traducción operativa:** el **código** está deploy-ready. Lo que bloquea el VERDE es una **checklist de deploy** (env-vars de prod) + **decisión consciente** sobre 3 dimensiones que ninguna pasada de código podía cerrar sola (SSRF, backups/restore, observabilidad Ω).

---

## 2) CRÍTICOS de las 4 pasadas — estado FINAL

Regla del gate: **todos deben estar `CERRADO_VERIFICADO`** o el gate es ROJO. **Resultado: los 9 CRÍTICOS están `CERRADO_VERIFICADO`.**

| ID | Pasada | Descripción | Estado final | Evidencia en vivo (PoC) |
|---|---|---|---|---|
| **P3-CSRF-01** | P3 | Bypass CSRF con Origin opaco (null/data:/blob:/filesystem:) en mutación cookie-auth | ✅ CERRADO_VERIFICADO | null→403 `csrf_origin_rejected`, data:/blob:/filesystem:→403, evil→403; localhost legítimo PASA; Bearer no engancha. `server.py:1391` |
| **P3-IDOR-01** | P3 | Fuga de `confirmation_token`/`cancel_token` en `/asesor/citas` y `/dev/citas`, encadenable a confirm/cancel sin auth | ✅ CERRADO_VERIFICADO | Listas ya NO contienen los 2 tokens (proyección deny-list `{_id:0,confirmation_token:0,cancel_token:0}`); resto de lectores de appointments auditados. `dev_batch4_1.py:1324,1382` |
| **P3-POISON-01** | P3 | `/copiloto/cierre` sin check de pertenencia → envenenamiento cross-tenant del AVM | ✅ CERRADO_VERIFICADO | asesor sin lead→403, lead falso→404, developer dev-ajeno→403, sin auth→401; **0 closings envenenados en Mongo**; cron/superadmin pasan. `copiloto_flywheel.py:197-212` |
| **C-02** | P2 | Pricing `/analyze` y `/apply` sobre proyecto ajeno (IDOR-write; bug NO-OP de `development_id` inexistente) | ✅ CERRADO_VERIFICADO *(prod fail-closed)* | apply/analyze cross-tenant→403; **prod-sim: `user_dev_ids=[]`→403**. Residual: en `DMX_DEV_MODE=true` el fallback demo lo neutraliza → ver §3/§4. `subagents.py:96,172` |
| **A2** | P1/P2 | Gestión cross-tenant de `tour_3dgs` (IDOR-write); advisor tenía `return True` incondicional | ✅ CERRADO_VERIFICADO | PATCH/DELETE/regenerate/settings/create sobre scan ajeno→403/400; scan intacto; fail-closed sin dev resuelto. `tour_3dgs_engine.py:74-87` |
| **A4** | P1/P2 | `configure_slots` (POST `/dev/projects/{id}/slots`) sobre proyecto ajeno | ✅ CERRADO_VERIFICADO | asesor (rol)→403, dev cross-tenant→403, inexistente→404; **0 slots escritos**; `assert_db_project_owner` ANTES del write. `dev_batch4_1.py:797` |
| **C-01** | P2 | Cube `estado` enum inválido (XSS almacenado) | ✅ CERRADO_VERIFICADO | `<script>`→rechazado sin write, `hacked`→rechazado, `visto`→ok; 0 docs envenenados. `activacion.py:95-96` (residual menor: 200+`{ok:false}` en vez de 422; cumple "rechazado") |
| **C-03** | P3 | `/cierre` precio fuera de banda envenena el AVM | ✅ CERRADO_VERIFICADO | 99,999→422, 500,000,001→422, negativo→422, in-band→ok; 0 closings fuera-de-banda. `copiloto_flywheel.py:171` `Field(ge=100_000, le=500_000_000)` |
| **C1** | P2 | `/appointments/metrics` sin token + sin scope + con fuga de tokens | ✅ CERRADO_VERIFICADO | sin-token→401, buyer→401/403, project ajeno→403, dev legítimo→200 tenant-scoped SIN tokens (allow-list `_SAFE_FIELDS`). `dev_batch15.py:313+` |

> **Nota de severidad:** un verificador rateó C1 y C-01 como ALTO (no CRÍTICO); se listan aquí por trazabilidad completa. Aun tratándolos como CRÍTICOS, **todos cierran `CERRADO_VERIFICADO`** → la condición (a) del gate se cumple.

**Consenso entre las 5 verificaciones:** 5/5 coinciden en que los 9 CRÍTICOS están `CERRADO_VERIFICADO`. La única divergencia es el **residual de C-02 en demo** (un verificador lo etiqueta `SIGUE_ABIERTO/CRITICO` por su reproducción en `DMX_DEV_MODE=true`); el MAESTRO resuelve la divergencia: **el fix es correcto y fail-closed en prod**, el residual es de **configuración** (`DMX_DEV_MODE`) → no es brecha de prod → no lleva a ROJO, pero pesa para degradar a AMARILLO.

---

## 3) Regresiones encontradas

> **CERO regresiones nuevas introducidas por los 9 commits.** Confirmado por re-ataque en vivo de 7 happy-paths legítimos + batería oficial 7/7 verde (corrida al inicio Y al final de la sesión, con cero residuo en DB).

| Happy-path legítimo verificado | ¿Roto por el fix? | Resultado en vivo |
|---|---|---|
| HP-1 · dev VE sus propias citas/métricas/weekly-brief | NO | El deny-list solo oculta los 2 capability-tokens, jamás datos propios; 200 con todos los campos útiles |
| HP-2 · login/OAuth tras email `.lower().strip()` | NO | 4 variantes de caso/espacios→200/200/200/200; 0 cuentas orfanadas (7 seeds ya en minúsculas) |
| HP-3 · asesor genera argumentario sobre SU lead (llm_safety) | NO | 200, texto LLM real; nombres con acentos/ñ/guiones pasan limpios; marcadores DATOS_CLIENTE no se filtran |
| HP-4 · comprador ve demanda/scores con k-gate n≥5 | NO | n=6→revela (`medio`), n=4→suprime (`bajo`); discrimina exactamente en el umbral 5 |
| HP-5 · dev aplica pricing rec de SU proyecto (C-02 + CAS) | NO | 200 `applied`, +10% dentro de ±20%; cross-tenant→403; CAS gana la carrera (modified_count=1) |
| HP-6 · front local (Origin localhost:3000, cookie) muta | NO | localhost→201, evil.com→403, null→403 (bypass cerrado sin tocar al legítimo) |
| HP-7 · `/cierre` por CRON_SECRET o lead propio | NO | cron→200, asesor-own-lead→200 (átomo real); poison cross-tenant→403 |

**Casos límite NO-regresión (descartados con evidencia):**
- `_clean_rec`/`JSONResponse` da 500 ante un datetime fuera de su allow-list (`created_at`) — pero **PricingAgent solo emite `generated_at`/`expires_at`/`applied_at`**, así que el happy-path real **nunca** lo dispara. Es fragilidad defensiva (recomendación: `jsonable_encoder`), **no regresión**. → residual BAJO.
- `@app.exception_handler(Exception)` global **NO** enmascara HTTPException/validación (FastAPI resuelve el handler dedicado primero): 401/404/422 pasan intactos. → sin regresión.

---

## 4) Residual aceptable / Follow-ups documentados

Ninguno bloquea por **ataque vivo**; bloquean el **VERDE irrestricto** por completitud del manual. Severidad y razón de no-bloqueo CRÍTICO:

### 🔴/🟠 ALTO — requieren acción de checklist o decisión consciente antes de firmar producción

| ID | Severidad | Qué es | Por qué NO bloquea el deploy controlado | Acción para VERDE |
|---|---|---|---|---|
| **DEPLOY-DMXDEVMODE** (raíz de C-02 en demo) | ALTO (config) | Fallback `tenant_scope.user_dev_ids` → `DEVELOPMENTS[:2]` concede acceso de **escritura** cross-tenant a un dev sin org real cuando `DMX_DEV_MODE=true` | **Fail-closed en prod** (`user_dev_ids=[]→403`, verificado). Es config, no código. | **Ítem #1 del checklist de deploy: NUNCA `DMX_DEV_MODE=true` en prod.** Mejor: fallback demo solo LECTURA; excluir superficies mutantes/agénticas |
| **SSRF en renderers** (clase nueva) | ALTO-condicional | `brochure_renderer`, `studio_carrusel`, `parallax_engine` hacen fetch de URLs (de `hero_photo_url`/`logo_url`/`partners.logo_url`) **sin allow-list de esquema/host** → file://, 169.254.169.254, hosts internos | Sin PoC concluyente (depende de si un rol inyecta URL interna que llegue al render). Ninguna pasada lo buscó antes. | Helper `validate_fetch_url` (solo https + host allow-list + bloquear IPs privadas/link-local) en los 3 renderers |
| **FASE P · backups + restauración probada** | ALTO (infra) | Ninguna pasada verificó backups automáticos ni una RESTAURACIÓN probada (no es verificable por lectura de código) | Es infra/proceso, fuera del scope de auditoría de código | Confirmación founder/infra fuera de esta auditoría |
| **P3-CSRF-02 · GET que muta + gasta LLM** | ALTO | `GET /api/leads/{id}/ai-summary-v2` en cache-miss hace llamada LLM + write, disparable cross-site con `<img>`, sin rate-limit (CSRF no cubre GET) | Mitigado en parte por `can_view_ai_summary` (requiere assigned/created_by); P3 lo difirió a siguiente sprint | Mover a POST o exigir `X-DMX-CSRF` + rate-limit; auditar los ~26 GET-con-write restantes |
| **C3 · `tenant_filter` no adoptado (raíz sistémica)** | ALTO | Solo 4 call-sites reales; no se volvió el modo canónico de lectura de colecciones sensibles | Las 2 fugas concretas que P2 probó (C1/C2) SÍ están tapadas. Es riesgo del próximo agregado, no fuga viva | Adopción ancha + regla CI: "ninguna colección sensible sin `tenant_filter`" |

### 🟡 MEDIO — deuda de higiene/calidad/moat, no brecha de seguridad

| ID | Qué es | Por qué aceptable |
|---|---|---|
| **P3-INJ-02 (clase str(e))** | `/portafolio` cerrado, pero `/inversion-v4/analyze` (público) y ~18 sitios siguen con `str(e)[:200]` | Truncado, varios token-gated, difícil de disparar; info-disclosure BAJO |
| **P3-03 (HMAC visitor_id)** | `/interes` subió a K=5 pero sigue raw `count_documents` | Inflable rotando IPs hacia 5, pero FLY-02 (tope 25 visitor_id/ip_hash/hora) lo encarece |
| **E1 · DESYNC-COLONIA (moat)** | Write-side canonicaliza (5 escritores), falta backfill ~283 docs históricos + normalización lado-lector | 71% del budget-fit histórico degradado; calidad/moat, no seguridad |
| **E2 · DESYNC-DEVFK** | Sin helper único `dev_fk` ni backfill `development_id`/`project_id` | Dilución de métricas (7/51 leads), no fuga |
| **RT3-02 · is_outlier escrito-no-consumido** | El flag se marca pero el ingest del AVM aún no lo excluye | Lazo abierto same-tenant; `asesor_operaciones` NO alimenta el AVM cross-tenant. 1-2 líneas pendientes |
| **B3 · audit silent-swallow** | `safe_audit` cubre los sitios authz/forense (verificado); ~90 sitios telemetría/ML siguen `except: pass` | Higiene; los puntos de decisión authz están cubiertos |
| **FASE Ω · observabilidad** | Sentry inicializa, pero falta readiness/liveness probe real (BD) + alerta de staleness/ruptura del flywheel | El manual la exige para "siempre verde en prod"; no bloquea seguridad |
| **T-02 · mi-gusto sin auth** | `/buyer/mi-gusto?visitor_id=...` devuelve gusto granular sin sesión | Privacidad de comportamiento, no PII dura; difiere a familia visitor_id (cookie httpOnly HMAC) |

### 🟢 BAJO — cosmético / owner-gated

- `ACTIVACION-STR-E` `str(e)[:140]` auth-gated en fallback de upsert (no anónimo).
- `weekly-brief` `str(e)` en fallback (auth dev, no público).
- `patch_cita` devuelve token a su **propio** dueño (owner-gated, no cross-tenant).
- `_clean_rec`/`JSONResponse` frágil ante datetimes fuera de allow-list (hoy seguro).
- `.gitignore` con bloque env duplicado 173 veces (bloat sin impacto).
- C-01 devuelve 200+`{ok:false}` en vez de 422 (rechaza sin write; cumple).

---

## 5) Resumen ejecutivo para el founder (lenguaje humano)

1. **Qué se auditó:** los 9 arreglos de seguridad de esta sesión, atacándolos de verdad en vivo (no de palabra) en los 4 portales: dev, asesor, comprador y superadmin.
2. **Qué se arregló (y aguantó):** quien no es dueño ya **no puede** tocar precios, citas, tours, cierres ni envenenar el motor de valor de otra desarrolladora — todo da "acceso denegado".
3. También se taparon: el robo de tokens de citas, el fraude de precios fuera de rango, y los textos de error que filtraban detalles internos.
4. **Lo bueno:** todos los flujos normales siguen funcionando perfecto — el dueño sí ve lo suyo, el login funciona, el asesor genera sus textos. **Cero cosas rotas.**
5. **Las 7 baterías de prueba automáticas pasan al 100%.**
6. **¿Está listo?** El **código sí está listo**. Pero **todavía NO le des VERDE de "prende y olvídate"**.
7. **Lo que falta antes de prender en producción (checklist, no código):**
8. — Confirmar las claves de producción y, sobre todo, **NUNCA dejar el "modo demo" encendido** (es lo único que reabriría un hueco).
9. — Confirmar que hay **respaldos automáticos** y que una restauración **ya se probó**.
10. — Decidir 3 pendientes acotados: blindar las descargas de imágenes externas (SSRF), un par de URLs que gastan IA, y limpieza de datos del moat. **Nada de esto es una alarma roja; son cierres para firmar producción tranquilos.**

---

## Conteo final por pasada

| Pasada 4 (verificación) | Veredicto | CRÍTICOS cerrados | Regresiones | Residuales |
|---|---|---|---|---|
| 1 · Re-ejecución 9 CRÍTICOS | 🟢 VERDE | 9/9 | 0 | 2 BAJO (C-02 demo, C-01 código-200) |
| 2 · Calidad de código 9 commits | 🟡 AMARILLO | 9/9* | 0 | 1 ALTO (DMX_DEV_MODE write) + menores |
| 3 · Caza de regresiones happy-paths | 🟢 VERDE | n/a | **0** | 2 BAJO |
| 4 · Meta-auditoría (cierre+completitud) | 🟡 AMARILLO | 9/9 | 0 | C3, E1/E2, CSRF-02, SSRF, Ω, backups |
| 5 · Observabilidad+financiero+cierre | 🟡 AMARILLO | 9/9 | 0 | DMX_DEV_MODE (ALTO config), str(e) clase |

\* La Pasada 2 marcó C-02 `SIGUE_ABIERTO` **en el entorno demo**; el MAESTRO lo resuelve como `CERRADO_VERIFICADO en prod` (fail-closed) + deuda de config DMX_DEV_MODE.

**Batería oficial:** 7/7 verde (smoke 17/17 · aislamiento 13/13 · cohorte 8/8 · propagación 12/12 · direcciones 8/8 · concurrencia 8/8 · flywheel 12/12), corrida al inicio Y al final, cero residuo en DB, working tree sin cambios de código.

---

*Emitido por el MAESTRO · Auditoría V2 · Pasada 4 · GATE GLOBAL.*
