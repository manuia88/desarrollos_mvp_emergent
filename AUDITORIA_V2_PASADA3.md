# Auditoría V2 — Pasada 3 (síntesis del líder de red-team)

> Documento de cierre de la **Pasada 3**. Consolida los 5 sub-reportes ofensivos P3 (IDOR, AuthN/AuthZ/CSRF, Inyección, Moat/k-anon, Lógica-de-negocio/race).
> Solo cuenta lo **reproducible con PoC**. Sin PoC = no entra. Deduplicado, confrontado, y **re-verificado contra el código vivo** (no solo contra la narrativa del agente).
> Fecha: 2026-06-30 · Rama: `dev-redesign-tandas` · Entorno PoC: backend `:8000`, `DMX_DEV_MODE=true`, tokens minteados con `JWT_SECRET` de `.env`.

---

## Veredicto en una línea

La Pasada 2 cerró el grueso del CRUD por-recurso, pero la Pasada 3 abre **un agujero nuevo y grave en la capa de CSRF** (el guard de Origin se evade con `Origin: null`, en PROD) y confirma que **el patrón "gate de rol, no de pertenencia" sigue vivo en dos endpoints que escriben al moat**: `/api/copiloto/cierre` (envenenamiento cross-tenant del AVM) y la **fuga del `confirmation_token` de citas** vía proyección `{_id:0}`, que reabre el control no-auth de la cita. La causa raíz es la misma de P2: **se valida quién eres, no qué te pertenece** — y ahora también **se valida un Origin presente-pero-malformado como si estuviera ausente.**

---

## Cómo se consolidó (regla de conteo)

- **Confirmado** = el agente dio PoC reproducible **Y** el código lo respalda (re-leído en esta síntesis). 6 hallazgos.
- **Desestimado por no-reproducible / por diseño** = sin PoC, o el PoC depende de un grant gateado por `DMX_DEV_MODE` que fail-closea en prod (es deuda de checklist de deploy, no rotura). Ver sección final.
- **Dedup clave:** la "hipótesis C1 de IDOR en confirm/cancel de cita por `confirmation_token`" aparece en **4 de los 5** sub-reportes — **DESMENTIDA por todos** (el token ES la llave de lookup, 256 bits, rate-limited, validado contra el doc). El riesgo real NO es la falta de validación, es la **fuga** del token (P3-IDOR-01). Se cuenta una sola vez, como fuga.

---

## Brechas CONFIRMADAS (PoC reproducible)

| id | sev | vector (1 línea) | ubicación | fix de 1 línea |
|---|---|---|---|---|
| **P3-CSRF-01** = CSRF-NULL-ORIGIN-BYPASS | **CRÍTICO** | Guard CSRF se salta con `Origin: null` (o `data:`/`blob:`/sin-esquema): `netloc==''` hace truthy el src pero falsea `if src_host and src_host not in allowed` → pasa, **en PROD**. | `server.py:1382-1394` (`csrf_cookie_origin_guard` + `_csrf_host_of:1323`) | Tratar src presente-pero-no-parseable como hostil: `if src and (not src_host or src_host not in allowed): reject`. |
| **P3-IDOR-01** = fuga `confirmation_token` de cita | **CRÍTICO** | `GET /api/asesor/citas` y `GET /api/dev/citas` proyectan `{_id:0}` → devuelven el `confirmation_token` (capability), encadenable a `/api/cita/public/{token}/{confirm,cancel,reschedule}` **sin auth**. C1 lo tapó en `/appointments/metrics` pero dejó estos dos. | `dev_batch4_1.py:1322,1378` (`find(q,{_id:0})`) | Allow-list `_SAFE_FIELDS` (sin `confirmation_token`/PII de terceros) en **toda** lectura de `db.appointments` que vuelve al cliente. |
| **P3-POISON-01** = cierre cross-tenant (moat) | **CRÍTICO** | `POST /api/copiloto/cierre` valida auth + cota precio (C-03) + catálogo, **pero NUNCA pertenencia** del `dev_id` al tenant del actor → cualquier asesor/dev escribe cierres forjados al AVM (`market_comps_closings`) y al flywheel (`copiloto_closings`) de OTRO tenant. | `routes/copiloto_flywheel.py:174-196` (falta `assert_dev_project`/`assert_db_project_owner`) | Tras validar catálogo, exigir pertenencia (dev → `assert_dev_project`; asesor → cierre derivado de `lead` propio con `assert_lead_owner` y `lead.development_id==dev_id`). |
| **P3-CSRF-02** = GET-que-muta sin guard CSRF | **ALTO** | El guard solo cubre `{POST,PUT,PATCH,DELETE}`; `GET /api/leads/{id}/ai-summary-v2` hace llamada LLM + `update_one` en cache-miss **sin rate-limit**, disparable cross-site con `<img>`. | `server.py:1320` (`_CSRF_METHODS`) + ruta `ai-summary-v2` | Mover el gasto/escritura a `POST` (con rate-limit) o exigir header no-simple (`X-DMX-CSRF`/`X-Requested-With`) en el GET; auditar los ~26 GET-con-write. |
| **P3-INJ-01** = prompt-injection sin frontera en `/argumentario` | **MEDIO** | `POST /api/asesor/argumentario` interpola `first_name`/`last_name`/`tags` (controlados por el lead anónimo) **sin `sanitize_user_input`/`wrap_untrusted`**, a diferencia de `/argumentario-rag` que sí blinda. Hoy solo lo salva la alineación del modelo. | `advisor.py:~3416-3470` (vs la variante RAG `:3496-3568`) | Envolver los campos del cliente con `wrap_untrusted(...)` (frontera «DATOS_CLIENTE») y/o `sanitize_user_input`. Reusa `llm_safety.py` (ya importado). |
| **P3-INJ-02** = fuga de `str(e)` en endpoint público | **MEDIO** | `POST /api/inversion-v4/portafolio` (sin auth, body crudo) devuelve `str(e)` de Python al cliente ante type-confusion → info-disclosure (tipos/operaciones internas). Sin 500. | `public.py:~773-800` | Reemplazar `error: str(e)` por mensaje genérico fijo + log server-side; opcional: schema Pydantic → 422. |

**Reclasificados de CRÍTICO→no-CRÍTICO con justificación (confronto al agente):**

- **P3-IDOR-02** (evasión del guard C-02 de pricing para los 2 primeros devs del seed) → **NO entra como prod-crítico.** El acceso a `altavista-polanco`/`lomas-signature` proviene **solo** del fallback demo `tenant_scope.user_dev_ids → DEVELOPMENTS[:2]`, gateado por `_demo_mode()==DMX_DEV_MODE`, que **fail-closea (`return []`) en prod**. Es **deuda de checklist de deploy** (no setear `DMX_DEV_MODE` en prod), no una rotura del guard. El guard C-02 mismo AGUANTÓ (403 fuera del fallback). Se registra como **acción de remediación de configuración**, no como brecha de código.
- **RT3-01** (TOCTOU en pricing apply) y **RT3-02** (gaming de `valor_cierre`) → **MEDIO** (hardening), no crítico: el tope ±20% anclado a lista neutraliza el dinero en RT3-01; RT3-02 no es cross-tenant. Ver Clase Lógica abajo.
- **P3-02** (re-id n<K en totales de colonia del grafo) y **P3-03** (inflado de prueba social FLY-02 + K=3) → **MEDIO**. Ver Clase Moat/k-anon abajo.

---

## Clases (patrón raíz → cura sistémica)

### Clase 1 — CSRF: allow-list de Origin como única defensa (frágil por construcción)
**Raíz.** La defensa CSRF-01 depende de comparar `Origin` contra una allow-list, derivando el host con `urlsplit().netloc`. Dos fallas estructurales: (a) un `Origin` **presente-pero-no-parseable** (`null`, `data:`, `blob:`, sin esquema) produce `netloc==''` y se cuela por el corto-circuito `if src_host and …`; (b) la defensa **no aplica a GET**, dejando fuera toda mutación/gasto vía GET.
**Cura.** (1) `Origin` presente con `netloc==''` ⇒ **403** (hostil, no ausente). (2) Adoptar defensa **positiva**: double-submit token o header custom `X-DMX-CSRF` exigido y verificado, que un `<img>`/form cross-site no puede setear — deja de depender de la allow-list de Origin. (3) Mover toda mutación/gasto fuera de handlers GET; si un GET escribe, exigir el header custom y rate-limit.
**Hallazgos:** P3-CSRF-01 (CRÍTICO), P3-CSRF-02 (ALTO).

### Clase 2 — IDOR/Moat: "gate de rol presente, gate de pertenencia ausente" (continúa de P2 Clase A)
**Raíz.** Misma raíz que la Clase A de P2: el endpoint valida `role`/auth pero usa un `dev_id`/`token` del body/proyección **sin verificar pertenencia al tenant**. P2 lo cerró en pricing apply/analyze, tour_3dgs, slots; P3 lo encuentra **vivo en dos rutas nuevas que tocan el moat**: `/cierre` (escribe AVM) y la **fuga del token de cita** (que entrega la capability cross-tenant).
**Cura.** El helper de pertenencia YA existe (`assert_dev_project`/`assert_db_project_owner`/`assert_lead_owner`). Exigirlo como primera línea en `/cierre`. Para citas: **el token jamás debe viajar en una respuesta JSON de listado** — solo en el email del magic-link; allow-list de campos en toda lectura de `db.appointments`.
**Hallazgos:** P3-IDOR-01 (CRÍTICO), P3-POISON-01 (CRÍTICO). Adyacente y gateado-por-demo: P3-IDOR-02.

### Clase 3 — Inyección: defensa-en-profundidad inconsistente entre rutas gemelas
**Raíz.** La frontera anti-prompt-injection (`sanitize_user_input`+`wrap_untrusted`) está aplicada en el asistente público y en `/argumentario-rag`, pero **falta en `/argumentario` básico** con flujo de dato atacante-controlado real (nombre auto-declarado del lead). Y endpoints públicos sin schema reflejan `str(e)`.
**Cura.** Aplicar la MISMA frontera en ambas variantes de `/argumentario` (reusar `llm_safety.py`, cero motor nuevo); mensaje de error genérico + log en públicos.
**Hallazgos:** P3-INJ-01 (MEDIO), P3-INJ-02 (MEDIO).

### Clase 4 — Moat/k-anon e integridad de señales (atenuada, no rota)
**Raíz.** k-anon=5 se respeta casi en todos lados, pero **dos fugas residuales**: (a) los **totales de colonia** del grafo del comprador (`demanda_total`/`busquedas_marketplace`) se devuelven crudos con n=1..4 (los segmentos sí están gateados); (b) la **prueba social pública** (`/api/desarrollo/{dev}/interes`) usa **K=3** (no el canónico 5) y FLY-02 limita pero no impide inflarla (25 likes/IP/hora vuelcan bajo→alto).
**Cura.** (1) Aplicar el k-gate también a los totales de colonia (n<5 → null + banda '<5'); acotar `colonia_id` al tenant en `/api/dev/grafo-comprador`. (2) Subir el K de `/interes` a `K_ANON_MIN` (5) y derivar el conteo de social-proof por `ip_hash` distinto (no por `visitor_id`), idealmente con HMAC del `visitor_id`.
**Hallazgos:** P3-02 (MEDIO), P3-03 (MEDIO).

### Clase 5 — Lógica de negocio / race (hardening, sin robo)
**Raíz.** (a) El pricing apply hace check-then-act no atómico (find_one luego update_one) → N concurrentes pasan el guard de idempotencia; (b) `POST /api/asesor/operaciones` acepta `valor_cierre`/`comision_pct` sin cruzar contra el precio de catálogo → gaming de track-record + data-poisoning del AVM/DRPI.
**Cura.** (a) CAS atómico: `update_one({_id, status:'pending'}, {$set:{status:'applied'}})`; `modified_count!=1 → 409` (igual que ya se hizo en operaciones). (b) Banda de catálogo en create/close de operación (p.ej. `[precio*0.7, precio*1.5]`) o flag `precio_fuera_de_catalogo` que excluya del agregado.
**Hallazgos:** RT3-01 (MEDIO), RT3-02 (MEDIO).

---

## FIXES QUE NO AGUANTARON (el red-team los evadió)

| fix previo (de quién venía) | cómo se evadió | hallazgo P3 |
|---|---|---|
| **CSRF-01** (allow-list de Origin externo) | Origin `null`/`data:`/`blob:`/sin-esquema → `netloc==''` salta el corto-circuito `if src_host and …`. Verificado en vivo (200/201 + escritura) y con lógica aislada bajo `DMX_ENV=production`. | **P3-CSRF-01 (CRÍTICO)** |
| **C1** (allow-list `_SAFE_FIELDS` en `/appointments/metrics`) | El token solo se ocultó en metrics; `/api/asesor/citas` y `/api/dev/citas` siguen proyectando `{_id:0}` con el `confirmation_token` → fuga + control no-auth de la cita. | **P3-IDOR-01 (CRÍTICO)** |
| **C-03** (auth + cota de precio + catálogo en `/cierre`) | Aguantó auth/cota/catálogo, pero **omite el assert de pertenencia** que sí está en C-02 → escritura cross-tenant al AVM. PoC ×2 (agencia_demo→quattro@12.3M; constructora_ariel→quattro@99M) con verificación en Mongo. | **P3-POISON-01 (CRÍTICO)** |
| **Cobertura del guard CSRF** | El guard solo cubre métodos mutantes; un GET que llama LLM + escribe (ai-summary-v2) queda 100% fuera y se dispara cross-site. | **P3-CSRF-02 (ALTO)** |
| **Blindaje de prompt-injection** (aplicado en Atlax público y `/argumentario-rag`) | NO aplicado en `/argumentario` básico; el dato atacante-controlado (nombre del lead) llega al LLM sin frontera. Hoy solo lo salva la alineación del modelo. | **P3-INJ-01 (MEDIO)** |
| **FLY-02** (tope 25 visitor_id/ip_hash/hora) + K de social-proof | Limita pero no impide: 25 likes falsos/IP vuelcan `/interes` bajo→alto; agravado porque `/interes` usa K=3, no el canónico 5. | **P3-03 (MEDIO)** |
| **k-gate del grafo** (KAN-01, a nivel segmento) | Los **totales de colonia** quedaron crudos con n=1..4 (segmentos sí gateados). | **P3-02 (MEDIO)** |
| **Idempotencia de pricing apply** (check `status!=pending`) | No atómico: 6 de 10 applies concurrentes pasaron el guard (TOCTOU). Dinero a salvo por el tope ±20%; daño = audit-log/hooks ×6. | **RT3-01 (MEDIO)** |
| **Cota de `valor_cierre` en operaciones** (`ge=0 le=10B`) | La cota frena lo absurdo pero **no cruza contra catálogo**: 9.99B sobre unidad de 6.5M aceptado (gaming + poisoning de AVM/DRPI, mismo tenant). | **RT3-02 (MEDIO)** |

---

## FIXES QUE AGUANTARON (verificación positiva del red-team)

- **CSRF Origin externo "normal"** — `Origin: https://evil.com` en POST/PATCH cookie-auth → **403** en atlax-settings, comprador/profile, asesor/contactos. (El fix funciona para lo que se diseñó; solo se rompe con el Origin malformado.)
- **Forja de JWT** — `alg=none` → **401** (`algorithms=['HS256']` fijo, `server.py:1601`); secreto **no** adivinable con ~14 claves comunes (es `secrets.token_hex(32)` efímero, no leakeado). **No forjable.**
- **Escalación vertical a superadmin** — `require_superadmin` aguanta: asesor/comprador/developer_admin contra `/api/superadmin/devmaster/*` y `/marketplace` → **403** en todos.
- **C-02 pricing guard** (`assert_dev_project`) — dev de constructora_ariel contra `pedregal-brutalist` (otra desarrolladora) → **403**. El único acceso logrado es el fallback demo gateado por `DMX_DEV_MODE` (fail-closed en prod).
- **C-02 apply (project_id)** y **defense-in-depth (unit_id foráneo)** — apply con project_id ajeno → 403; con project_id propio pero unit_id ajeno → 200 **sin** price_change (override foráneo intacto). El NO-OP previo (development_id vs project_id) está corregido.
- **Tope ±20% acumulativo anclado a LISTA** (AG-MONEY-01) — 8 recs de +20% sobre la misma unidad → todos clampan a exactamente `lista×1.2`; N applies NO componen. Doble clamp neutraliza delta extremo/`inf`/`abc`.
- **Máquina de estados de operación + CAS** — transición ilegal → 400; 12 closes concurrentes → 1×200 + 11×400; XP exacta +250/cierre (sin doble-grant). Reconciliación de centavos del split → descuadre 0.
- **IDOR de cita por `confirmation_token`** (hipótesis C1, en 4 sub-reportes) — **DESMENTIDA**: el token ES la llave de lookup (`find_one({confirmation_token})`), 256 bits (`token_urlsafe(32)`), rate-limit 10/60s, path-param tipado (NoSQL `$ne`/regex → 404), excluido de proyecciones de email. No es IDOR; el riesgo es la **fuga** (P3-IDOR-01).
- **IDOR cross-asesor en contactos** (read/patch/delete/timeline scopeados por `{id, owner_id:uid}`) → 404. **PATCH /api/dev/leads** scopeado por dev_org → 404. **PATCH /api/cita/{id}** (`assert_dev_org`) → 403.
- **IDOR de ai-summary de lead ajeno** (`can_view_ai_summary` exige assigned_to/created_by) → 403. **Funnel breakdown** ahora gateado por `_require_owner` (el P0 sin-auth previo, cerrado).
- **Prompt-injection del asistente público** — directa, ofuscada (`i-g-n-o-r-a`, `s1stema`), indirecta con delimitadores forjados, y jailbreak roleplay/traducción → todos refusados; `sanitize_user_input` deja huella `[removido]` verificable en Mongo. Defensa en capas sólida.
- **Type-confusion / mass-assignment** — `/inversion-v4/analyze` con dict/array/`$ne` → 200 sin 500 (str-cast de zone_id bloquea operador Mongo); PATCH contactos con `owner_id:{$ne}` → 422 (schema). `re.escape` aplicado en buscadores (marketplace_search, public). ReDoS no aplica (MongoDB RE2, inmune a backtracking).
- **k-anon=5** en demanda-mapa, demand-pulse, parecidos-cerraron (banda), segmentos del grafo, transaction-network, public-market → aguantan. Gating superadmin en terminal/celda/terminal-zona → 403.
- **C-03 cota + catálogo de `/cierre`** — 99999/500000001 → 422; `dev_id` inexistente → no escribe. (La auth nueva también: no-auth → 401.) *Lo que falta es solo la pertenencia.*
- **Anti-spoofing de IP** (`ratelimit.client_ip`) — en dev ignora XFF y usa el socket; en prod toma `-hops`/`cf-connecting-ip`. No spoofeable localmente.

---

## Plan de remediación priorizado

### P0 — antes de cualquier deploy (CRÍTICO, code fix)
1. **P3-CSRF-01** · `server.py:1387` — cambiar `if src_host and src_host not in allowed` por `if src and (not src_host or src_host not in allowed)` (tratar Origin presente-no-parseable como hostil). **Además**, sumar defensa positiva (header `X-DMX-CSRF` double-submit) para no depender solo de la allow-list. *Esfuerzo: ~1-2 h. Bloquea la clase entera de mutaciones cookie-auth cross-site.*
2. **P3-IDOR-01** · `dev_batch4_1.py:1322,1378` (+ auditar `dev_batch4_4`, `dev_batch5`, `dev_batch6`, `advisor.py`, `team_aggregated.py`) — proyección allow-list `_SAFE_FIELDS` sin `confirmation_token`/`cancel_token`/PII de terceros en **toda** lectura de `db.appointments`. *~2-3 h.*
3. **P3-POISON-01** · `routes/copiloto_flywheel.py:191` — tras validar catálogo, exigir pertenencia (`assert_dev_project`/`assert_db_project_owner` para dev; `assert_lead_owner`+`lead.development_id==dev_id` para asesor). Mantener bypass `CRON_SECRET` para el cron. *~2 h.*

### P1 — siguiente sprint (ALTO/MEDIO de gasto/abuso)
4. **P3-CSRF-02** · convertir `ai-summary-v2` a POST con rate-limit (o exigir header custom en el GET) + auditar los ~26 GET-con-write. *~3-4 h.*
5. **P3-INJ-01** · `advisor.py:~3441-3450` — `wrap_untrusted`/`sanitize_user_input` sobre `first_name`/`last_name`/`tags`/`notas` (copiar de la variante RAG). *~1 h.*
6. **P3-03** · subir K de `/interes` a 5 + contar social-proof por `ip_hash` distinto. **P3-02** · k-gate a los totales de colonia del grafo + acotar `colonia_id` al tenant. *~2-3 h.*

### P2 — hardening (sin robo, sin urgencia)
7. **RT3-01** · CAS atómico en pricing apply (`update_one({_id, status:'pending'})` → 409 si `modified_count!=1`). *~1 h.*
8. **RT3-02** · banda de catálogo en create/close de operación o flag `precio_fuera_de_catalogo`. *~2 h.*
9. **P3-INJ-02** · mensaje de error genérico + log en `public.py:800` y análogos. *~1 h.*

### Configuración / checklist de deploy (no es código)
10. **P3-IDOR-02 + fuente única de pertenencia** · NO setear `DMX_DEV_MODE=true` en prod (el fallback `DEVELOPMENTS[:2]` es un grant implícito). **Unificar** `tenant_scope.user_dev_ids` y `tenant_dev_map` en UN solo helper de pertenencia (hoy discrepan), y que rutas de dinero/mutación usen siempre esa verdad única. *Acción de checklist + ~3-4 h de unificación.*

---

## Conteo

- **CRÍTICO: 3** (P3-CSRF-01, P3-IDOR-01, P3-POISON-01) — todos con PoC en vivo (200/201 + escritura en BD/Mongo) y respaldo de código re-verificado.
- **ALTO: 1** (P3-CSRF-02).
- **MEDIO: 5** (P3-INJ-01, P3-INJ-02, P3-02, P3-03, RT3-01, RT3-02 → 6 ítems MEDIO; nota: RT-pair contado como 2).
- **Desestimados/Reclasificados:** IDOR de cita por token (desmentido ×4), P3-IDOR-02 (gateado por demo, fail-closed en prod → checklist, no brecha de código).
