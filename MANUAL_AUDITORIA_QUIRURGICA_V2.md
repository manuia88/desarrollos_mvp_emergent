# Manual de Auditoría Quirúrgica v2 — Plataforma AI-Native · Marketplace + CRM Multi-Portal

> Documento operativo único y **prompt maestro** para dirigir la auditoría final antes de producción.
> Mantiene íntegra la estructura v1 (FASE P → FASE 0 → PORTALES ×4 → COSTURAS → GATE) y le añade lo que v1 no veía:
> la **capa de inteligencia** (el producto y su mayor riesgo no probado), el **aislamiento multi-tenant sin RLS**,
> el **linaje de datos**, la **UX/UI**, y un **motor de 4 pasadas escalonadas** (cada una más profunda que la anterior).
> Plataforma: 4 portales — Asesor · Marketplace/Comprador · Desarrollador · Superadmin.
> Severidades: 🔴 CRÍTICO · 🟠 ALTO · 🟡 MEDIO · ⚪ BAJO.

---

## 0 · POR QUÉ v2 (el reencuadre que falta)

v1 es excelente, pero **blinda la caja** (CRUD, login, IDOR, dinero sin float). Está hecho para un marketplace+CRM genérico.
Esta plataforma es **AI-native con moat de datos**: scores, índices, AVM, cubo de demanda, modelos de gusto, un **flywheel**
que reaprende, agentes que **actúan**, y **dato que se vende** (Terminal de Mercado k-anónimo). Ahí está el valor — **y la
superficie de riesgo más grande y menos probada.** Los agujeros más graves de un sistema así no son solo las fronteras entre
portales; son **cuatro clases que v1 no audita**:

1. **Números fabricados** que el usuario cree reales (un AVM o score inventado = trampa de confianza + exposición legal).
2. **Flywheel envenenable**: señales falsas → demanda falsa → scores falsos → mal dato vendido B2B.
3. **Agentes que actúan sin guardrail** (mover precios, mandar WhatsApp, rutear leads).
4. **Dato escrito en un lugar y leído de otro** (fuente de verdad rota) — la clase de bug que más aparece aquí.

> **Regla de oro v2:** no se firma producción hasta que la **caja Y la inteligencia** estén en verde — con las 4 pasadas hechas.

---

## 1 · EL MOTOR DE PROFUNDIDAD — LAS 4 PASADAS ESCALONADAS

No son 4 auditorías independientes: son **un mismo recorrido, cuatro veces, cada vez más hondo**. Cada pasada **consume los
hallazgos de la anterior** y baja un nivel. La profundidad se acumula. Entre pasadas hay un **artefacto de handoff** (la salida
de una es la entrada de la siguiente). Ninguna pasada repite a la anterior; la **profundiza**.

| Pasada | Rol | Pregunta que responde | Profundiza en… | Salida (handoff) |
|---|---|---|---|---|
| **1 · Amplitud** | **Sr Dev** | "¿Qué hay y qué se ve mal?" | Cobertura TOTAL: recorre cada dimensión de cada portal sin saltarse nada. Marca lo evidente + las **zonas sospechosas** (huele a problema, falta cavar). | Inventario completo · hallazgos de 1er nivel · mapa de zonas sospechosas |
| **2 · Profundidad sistémica** | **Master Dev / Arquitecto** | "¿Es síntoma o causa raíz?" | Toma cada hallazgo/zona sospechosa de P1 y CAVA: ¿bug aislado o **patrón arquitectónico**? Traza linaje de datos, acoplamientos ocultos, fronteras. Convierte "1 bug" en **"los otros 9 lugares con el mismo problema"**. | Causas raíz · clases de bug (no instancias) · riesgo sistémico |
| **3 · Rotura adversarial** | **QA / Red-Team** | "¿De verdad se rompe?" | Toma todo lo que P1-P2 marcaron "OK/debería estar bien" e intenta **romperlo de verdad** con tokens reales, curl directo, payloads, carreras, inyección, envenenamiento, escalación. **Ataca el sistema corriendo, no lee código.** | Exploits reproducibles (PoC) · lo que SÍ se rompe vs lo que solo "se ve mal" |
| **4 · Cierre y meta** | **Auditor Maestro** | "¿Está cerrado y qué NO buscamos?" | Re-audita: confirma cada fix **aplicado Y verificado** (no "dicho"), caza **regresiones** (un fix que rompió otra cosa), valida cada gate, y hace **meta-auditoría**: ¿qué clase de problema no buscó NINGUNA pasada? (el unknown-unknown). | Veredicto de producción · riesgos aceptados conscientemente · siguiente nivel de profundidad |

**Reglas de las pasadas:**
- Cada pasada produce su artefacto **antes** de empezar la siguiente. La siguiente arranca leyéndolo.
- Severidad sube si una pasada confirma lo que la anterior solo sospechó (sospecha P1 → causa raíz P2 → exploit P3 = de 🟡 a 🔴).
- **Confronta, nunca infles.** Un hallazgo no existe hasta que tiene evidencia (archivo:línea, endpoint, o PoC). "Parcial" ≠ "resuelto".
- La Pasada 4 puede **devolver el sistema a la Pasada 2** si encuentra una clase nueva: el ciclo se repite hasta que P4 no halle nada nuevo.

---

## FASE P — PLATAFORMA (transversal, una vez) · v1 íntegra + adds

**P.S1 — Secretos en el historial de git — 🔴.** `gitleaks detect --source . -v` · `trufflehog git file://. --only-verified`. Escanear TODO el historial. Si aparece: rotar (asumir comprometido) + limpiar historial.
**P.S2 — Dependencias — 🟠.** `npm audit --production` · `osv-scanner -r .`. CVEs, deps abandonadas, lockfile commiteado. **(v2 add: SBOM — inventario de dependencias firmado; integridad de la cadena de build.)**
**P.S3 — Backups y recuperación — 🔴.** ¿Existen? ¿Automáticos? ¿**Restauración probada**? Un backup nunca restaurado es esperanza, no backup.
**P.S4 — CI/CD y ambientes — 🟠.** Gate real (lint+tests+audit antes de merge/deploy) · build reproducible · secretos del pipeline como secreto · **rollback probado** · ambientes dev/staging/prod con datos aislados.
**(v2 add) P.S5 — Runbook de rotación de secretos — 🟠.** Procedimiento escrito para rotar cada credencial (DB, JWT, ANTHROPIC_API_KEY, tokens de proveedores) sin downtime. Una llave comprometida sin runbook = horas de pánico.

---

## FASE 0 — TRANSVERSAL (prerequisito) · v1 + 3 mapas nuevos

**0.1 — Matriz de autorización (Rol × Recurso × Acción).** v1 íntegra: la fuente de verdad contra la que se valida cada endpoint. Permitido / denegado / condicional para TODOS los recursos.
**0.2 — Mapa de flujos cross-portal.** v1 íntegra: ciclo de lead · ciclo de propiedad · ciclo de transacción/comisión/payout · onboarding · mensajería. Punta a punta.
**0.3 — Inventario de superficie por portal.** v1 íntegra: endpoints, formularios, uploads, params, eventos. `cloc .` · `tree -L 2`.

**(v2 nuevos — sin estos, las fases I y T van a ciegas):**
- **0.4 — Matriz de aislamiento por TENANT** (semilla de la Fase T): por cada colección/recurso, ¿cuál es el campo de scope (`tenant_id`/`developer_id`/`owner_id`)? Tabla colección × campo-de-scope. Lo que no tenga scope declarado = 🔴 sospechoso.
- **0.5 — Mapa de LINAJE DE DATOS** (semilla del upgrade nuevo, §I.2): por cada **dato crítico** (precio de unidad, score, AVM, lead, comisión, demanda), declarar **dónde se ESCRIBE** (colección+llave) y **dónde se LEE** (todos los lectores). Una flecha escribe→lee por cada dato.
- **0.6 — Inventario de SUPERFICIE DE IA**: cada llamada a LLM (entrada, prompt, quién la dispara), cada **acción de agente** (qué muta, con qué guardrail), y cada **número de inteligencia mostrado en UI** (score/índice/AVM/forecast) con su fuente declarada.

> Salida de Fase 0: 3 matrices + 3 mapas. Sin los seis, no se arranca.

---

## FASE T — AISLAMIENTO MULTI-TENANT (NUEVA · 🔴 la de mayor blast radius)

> **Por qué a ti:** eres B2B multi-tenant **sin RLS** — cada query filtra por `tenant_id` a mano. **Una sola query sin el filtro
> = un developer/asesor ve los datos de otro.** Para un SaaS B2B, la fuga cross-tenant es el riesgo #1 catastrófico. v1 lo
> esconde dentro de "IDOR horizontal"; aquí es dimensión propia y se prueba **query por query, no por muestra.**

- **T.1 — Scoping en CADA query — 🔴.** Recorrer cada colección de la matriz 0.4. Toda lectura/escritura debe incluir el campo de scope del usuario actual. Cazar el anti-patrón:
  ```bash
  git grep -nE "find\(|find_one\(|update_one\(|aggregate\(" backend/ | grep -v "tenant_id\|developer_id\|owner_id\|zone_id"
  ```
  Cada match sin scope = revisar a mano si es público legítimo o **fuga**.
- **T.2 — Prueba activa cross-tenant — 🔴.** Token real del tenant A pidiendo recursos del tenant B (por id). Recorrer recurso por recurso. Una respuesta con datos de B = 🔴 que bloquea producción.
- **T.3 — Fuga vía agregados/cubo — 🔴.** Lo más sutil: el cubo OLAP, los scores, el Gemelo, la "inteligencia de mercado" — ¿agregan datos de TODOS los tenants y se los muestran a UNO sin k-anonimato? Verificar que ningún agregado permita inferir el dato de un tenant individual.
- **T.4 — Fuga en eventos/notificaciones — 🟠.** Webhooks/emails/notifs in-app de un tenant nunca llegan a otro.
- **T.5 — Regresión automatizada.** Existe `scripts/concurrent_load.py` (aislamiento 13 colecciones) — **extenderlo a TODAS** las colecciones de 0.4 y dejarlo como gate permanente.

---

## FASE I — INTELIGENCIA (NUEVA · el corazón del producto)

> v1 no audita lo que ES el producto. Estas 7 sub-dimensiones cubren el dato, la IA, los agentes y el flywheel.

**I.1 — Dato honesto / anti-fabricación — 🔴.** Regla núcleo del founder ("no inventes datos"). Tomar N números mostrados en la
UI (score, AVM, índice, demanda, "X% vendido") y **trazar cada uno a su fuente real**. Verificar que cada dato es **real-con-fuente**
o **honestamente marcado** (latente / "muestra insuficiente" / stub con `confidence`+`n`). Cazar valores **hardcodeados o simulados**
que se pasan por reales:
```bash
git grep -niE "mock|fake|dummy|sample|hardcod|TODO.*real|return 0\.|= 42|placeholder" backend/ | grep -iE "score|price|avm|index|demand|rate"
```
Un número fabricado mostrado a un comprador/inversionista = 🔴 (confianza + legal).

**I.2 — Linaje de datos / FUENTE ÚNICA DE VERDAD — 🔴 · ⭐ EL UPGRADE NUEVO.**
> **Por qué es el upgrade que faltaba:** las 3 fugas que esta auditoría ya encontró eran TODAS de esta clase — *se escribe en un
> lugar y se lee de otro*: (a) `apply()` escribía `developments.units` pero la ficha leía `developer_unit_overrides`; (b) el pulso
> cruzaba por `unit.id` pero las señales viven en `unit_number`; (c) `cube_action→marketplace` se escribía sin lector. **Una sola
> dimensión las caza todas a la vez.**
Por cada dato crítico del mapa 0.5: confirmar **una sola fuente de verdad** y que **TODOS los lectores leen de ahí, con la misma llave**.
Buscar las 3 patologías:
1. **Doble store** (el dato vive en 2 colecciones que se desincronizan).
2. **Mismatch de llave** (se escribe con la llave X, se lee con la llave Y → 0 matches silenciosos).
3. **Escritura huérfana** (se escribe a un destino que nadie consume → lazo abierto).
Técnica: para cada dato, listar el writer y todos los readers; diff de colección+llave. Si no coinciden → 🔴/🟠. *(Generaliza a un test: "para cada métrica, el valor que escribe el productor == el que lee el consumidor".)*

**I.3 — Seguridad de IA / LLM — 🔴.** La plataforma usa Claude (argumentario, copy IA, memorándum, copilotos con tool-calling).
- **Inyección de prompt:** un lead/comprador escribe en un campo (nombre, nota, búsqueda) que llega a un prompt → ¿puede secuestrar la instrucción? Probar payloads ("ignora lo anterior y…").
- **Grounding / anti-alucinación:** el copy IA y el memorándum NO deben inventar amenidades/precios/hechos. Verificar que el dato va en el prompt y que el system-prompt prohíbe inventar (regla "real vs generado"). Probar con un dev sin amenidades → el copy no debe inventarlas.
- **PII en prompts:** que no se filtren datos de terceros al LLM.
- **Costo/cuota:** rate-limit y cuota por tenant en cada endpoint LLM (anti-abuso de gasto).
- **Jailbreak del copiloto agéntico:** si el copiloto tiene tool-calling, ¿se le puede ordenar una acción fuera de su scope?

**I.4 — Agentes / acción autónoma — 🔴.** Hay agentes que ACTÚAN (apply muta precio, autopiloto manda WhatsApp/reasigna, cube_actions rutea).
- **Guardrails de dinero:** todo cambio de monto con tope (ej. ±20% en apply) + **never-auto-dinero** sin aprobación humana. Verificar el tope en CADA acción que toca dinero.
- **Human-in-the-loop:** qué acciones son auto vs requieren aprobar. **Kill-switch** global. **Cap diario.**
- **Idempotencia:** re-aplicar la misma acción NO debe duplicar el efecto (re-aplicar un precio o un cobro).
- **Reversibilidad:** toda mutación de agente debe poder deshacerse (undo) + **audit before/after** de cada una.
- **Determinismo para auditoría:** dado el mismo input, ¿se reproduce el mismo número? (un AVM/score no-reproducible es inauditable).

**I.5 — Envenenamiento del flywheel / fraude de negocio — 🔴.** El moat es el dato; ¿se puede gamear?
- **Inyección de señales falsas:** spamear `buyer_signals` para inflar la demanda de una colonia → contamina el cubo, los scores y **el dato que vendes B2B**. ¿Hay anti-spam / dedup / k-anon / detección de bot?
- **Robo/poaching de leads** entre asesores: verificar que la regla "1 broker × proyecto" no se puede saltar.
- **Gaming de comisiones:** manipular atribución para cobrar una comisión que no es.
- **Self-dealing** en cube_actions: ¿el superadmin (o un bug) puede rutear oportunidades a asesores favorecidos sin rastro?

**I.6 — Correctitud financiera (golden tests) — 🟠.** Más allá de "no float": tienes AVM, TIR/MIRR/cap rate/Monte Carlo, esquemas de pago, comisiones, ISR/ISAI. **Probar cada cálculo contra valores correctos conocidos** (usa `golden_calibration_engine` / caso Puente Alvarado como gate). Un TIR mal a un inversionista = 🔴 legal/negocio.

**I.7 — Privacidad/compliance MX + re-identificación del dato B2B — 🟠.** Más allá de "PII en logs":
- **LFPDPPP:** derecho a borrado / DSR, consentimiento capturado, retención definida.
- **Re-identificación:** el **Terminal de Mercado k-anónimo que VENDES** — ¿resiste un ataque de des-anonimización (cruzar con datos externos para identificar a una persona/dev)? Verificar k≥umbral en CADA corte, no solo en el agregado grande.

---

## PROTOCOLO QUIRÚRGICO POR PORTAL (×4 · v1's 9 dimensiones, enriquecidas, + UX/UI)

Se corre el set completo en cada portal, **bajo las 4 pasadas**. El portal no se firma hasta que TODO pase su gate.

**P.1 Superficie e inventario** — v1 íntegra. Todo lo expuesto debe tener fila en la matriz 0.1; lo que no = función fantasma o permiso no documentado.

**P.2 Autorización — 🔴** — v1 íntegra (vertical/escalación + horizontal/IDOR + validación server-side + saltarse la UI con curl). **v2 add:** cruzar con Fase T (cada check de authZ debe incluir el scope de tenant).

**P.3 Autenticación — 🔴** — v1 íntegra (login/logout/sesión, tokens con expiración/refresh/revocación, hashing bcrypt/argon2, rate-limit, reset un-solo-uso). **v2 add: 🔴 CSRF** — tus portales dev/asesor usan auth por **cookie** (`credentials:include`); todo POST que cambia estado (aplicar precio, cerrar venta) necesita **token CSRF** o será atacable cross-site. v1 no lo menciona y a ti te aplica directo.

**P.4 Lógica de negocio — 🟠** — v1 íntegra (validación de input con schema, anti-inyección con queries parametrizadas, dinero como decimal/centavos, máquina de estados, casos borde). **v2 add:** cruzar con I.6 (golden financiero) e I.5 (¿la lógica se puede gamear?).

**P.5 Datos: lectura, escritura, fugas — 🔴** — v1 íntegra (sobre-exposición en responses, transacciones multi-paso, N+1, índices/EXPLAIN, logs sin PII, paginación). **v2 add:** cruzar con I.2 (linaje/fuente única) + T (scope) + I.7 (k-anon en lo que sale).

**P.6 Manejo de errores y resiliencia — 🟠** — v1 íntegra (catch silenciosos, fallas externas, mensaje útil no stack trace, logs con contexto). **v2 add:** ¿qué pasa cuando el **LLM** falla/timeout? (fail-soft, no cuelgue, no precio a medias).

**P.7 Testing — 🟠** — v1 íntegra (tests reales sobre caminos críticos, cobertura prioriza authZ/pagos/escrituras, corren en CI con gate). **v2 add:** existe `scripts/audit_all.sh` (7 suites: smoke, aislamiento-tenant, e2e, propagación×2, concurrencia 1000, flywheel) — **es el gate de regresión; extenderlo, no reinventarlo.**

**P.8 Performance — 🟡** — v1 íntegra (latencia, paginación, bundle/code-splitting, re-renders, memory leaks, estados loading/error). **v2 add:** costo+latencia de los endpoints LLM (caché donde aplique).

**P.9 (NUEVA) UX/UI — 🟠 · minuciosa** → ver dimensión dedicada abajo.

**P.10 GATE DE SALIDA del portal** — todos los checkboxes de v1 **+** tenant-scope verificado **+** cero número fabricado **+** linaje sin mismatch **+** guardrails de agente presentes **+** CSRF **+** UX/UI en verde. "100%" = todo verde, no antes.

---

## DIMENSIÓN UX/UI (NUEVA · minuciosa · aplica a Asesor · Marketplace · Dev — NO a Superadmin)

> **El reencuadre:** no auditar "UX genérica", sino **comparar cada área contra el líder mundial de ESE dominio** y exigir que
> cada pantalla **funcione, genere una acción y se entienda sin manual.** Partir del diseño existente (UPGRADE, no rewrite) y
> **sin tocar la paleta** (rosa/magenta del founder).

**UX.1 — Cero páginas "en negro"/muertas — 🟠.** Inventariar TODAS las rutas (no-superadmin). Cada una debe **renderizar contenido real y funcional** — no vacía, no placeholder, no "próximamente", no spinner infinito. Toda página muerta o en blanco = hallazgo. *(Ya hay precedente: el barrido de páginas sin llamada API.)*

**UX.2 — Todo funciona y genera una ACCIÓN — 🟠.** Cada botón/CTA/link/tarjeta **hace algo real** (cero botones muertos, cero callejones sin salida). Cada pantalla debe permitir **avanzar al siguiente paso** (regla "cero callejones" del founder). Probar cada control: clic → acción observable.

**UX.3 — Title-case inteligente — 🟡.** Capitalización correcta y consistente en headers, botones, labels, tabs: ni TODO MAYÚSCULAS ni todo-minúsculas; respeta nombres propios, siglas (CDMX, AVM, TIR), preposiciones. *(Existe `lib/titleCase` — auditar que se use en todo.)*

**UX.4 — Fácil de entender (lenguaje humano) — 🟠.** Cero jerga, **cero códigos internos** (W5.x, MOAT, F2.x — ya hubo fuga), el número legible "como para un niño de 5 años" (qué es · para qué · de dónde sale · cuánto confío). Microcopy claro. Lo técnico, chiquito y colapsado.

**UX.5 — Estándares de líderes por ÁREA — 🟠 (el corazón de esta dimensión).** Cada pantalla se califica contra su mejor referente del mundo, **según el área específica que se revisa**:
| Área de la plataforma | Referente(s) a igualar |
|---|---|
| Búsqueda / listado marketplace | Zillow · Airbnb · Idealista |
| Ficha de propiedad / experiencia | Airbnb listing · Zillow · (cinemático: Apple) |
| CRM del asesor / pipeline | HubSpot · Salesforce · Attio |
| Dashboards dev / cockpit | Stripe · Linear · Vercel |
| Inteligencia / datos / terminal | Bloomberg Terminal · Tableau · Retool |
| Mapas / demanda | Mapbox Studio · Google Maps |
| Onboarding / wizard | Stripe · Linear · Typeform |
| Calculadoras / inversión | personal-capital · Wall-St-grade |
Por pantalla: ¿qué hace el líder que aquí falta? → hallazgo + referente + fix.

**UX.6 — Minuciosidad por pantalla — 🟠.** Checklist por cada pantalla:
- **Jerarquía visual** (lo importante salta primero) · **consistencia** (1 sistema de diseño: espaciado, tipografía, color, radios — sin tocar la paleta).
- **Estados completos** en cada fetch: loading · vacío (empty-state útil, clickeable) · error · éxito. Sin pantallas que "se quedan pensando".
- **Affordances**: lo clickeable se ve clickeable (hover, cursor, borde — regla `.dmx-card`).
- **Feedback inmediato** a cada acción · **prevención de errores** (confirmación en lo irreversible) · **tiempo a la primera acción útil** (¿cuántos clics para hacer lo principal?).
- **Responsive / móvil** real · **accesibilidad** (contraste AA, foco visible, navegación por teclado, lectores de pantalla, `alt`).
- **Consola del navegador limpia** (cero warnings/errores en la pantalla revisada).

**UX.7 — Nuevo diseño donde no llega — 🟡.** Donde una pantalla no alcanza el estándar de su referente, **proponer el rediseño**
(partiendo de lo existente, UPGRADE no rewrite). Cada propuesta con: qué falla, el referente, el cambio concreto, el valor.

**Gate UX/UI:** cero páginas muertas · cada control genera acción · title-case correcto · cero jerga/códigos internos · cada área ≥ el estándar de su referente · estados completos · móvil + a11y · consola limpia.

---

## FASE DE COSTURAS — CROSS-PORTAL (después de los 4) · v1 + adds

**C.1 Cruce de roles — 🔴.** v1 íntegra: matriz de ataque cada-rol-contra-cada-otro-rol con tokens reales contra la API directa. **v2 add:** incluir cruce cross-**tenant** (Fase T), no solo cross-rol.
**C.2 Flujos end-to-end — 🟠.** v1 íntegra: correr cada flujo del mapa 0.2 punta a punta. *(Ya existe `flywheel_final.py` 12/12 + `propagation_*` — usarlos como base y ampliarlos.)*
**C.3 Consistencia de estado — 🟠.** v1 íntegra: objeto que cambia de manos → todos los portales reflejan el mismo estado; ventanas de inconsistencia; edición concurrente. **v2 add:** cruzar con I.2 (un estado inconsistente casi siempre es un linaje roto).
**C.4 Eventos y notificaciones — 🟠.** v1 íntegra: cada evento llega al portal/rol/**tenant** correcto y SOLO a ese.
**C.5 Integridad referencial global — 🟡.** v1 íntegra: borrar/suspender un usuario → ¿qué pasa con sus objetos (leads huérfanos, propiedades sin dueño, **overrides/señales/cube_actions colgantes**)?
**(v2 add) C.6 — Costuras de IA/flywheel — 🟠.** ¿Una acción de un portal contamina la inteligencia de otro? (un dev inflando señales para subir su propio score; output de IA de un rol filtrándose a otro).

---

## FASE Ω — OBSERVABILIDAD EN RUNTIME (NUEVA · 🟡 convierte "auditoría única" en "siempre verde")

> Esta auditoría encontró 3 cables rotos **a mano**. La pregunta: ¿la plataforma puede **detectar sola** el próximo en producción?
- **Detección de rupturas del flywheel:** alerta si los scores dejan de recomputar, si un feeder cae, si la propagación lead→asesor se rompe. *(Existe `diagnostic_engine`/`health_score` — verificar que alerta, no solo que existe.)*
- **Error tracking** (Sentry o equiv.) con contexto, sin PII · **logging estructurado** · **probes** de liveness/readiness.
- **SLOs**: latencia y tasa de error por endpoint crítico, con alerta. **Auditoría de costo de IA** vivo (gasto LLM por tenant).

---

## GATE GLOBAL DE PRODUCCIÓN v2

Matriz de cobertura — **100% verde** (filas × dimensiones):

| | AuthZ | AuthN+CSRF | Lógica | Datos | Errores | Tests | Perf | **Tenant** | **Inteligencia** | **UX/UI** | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Superadmin | | | | | | | | | | n/a | |
| Marketplace/Comprador | | | | | | | | | | | |
| Asesor | | | | | | | | | | | |
| Desarrollador | | | | | | | | | | | |
| Costuras (cross) | | | | | | | | | | | |

**+ a nivel plataforma (Fase P + Ω):** cero secretos en historial · deps sin CVE crítico/alto · backups + restauración probada · CI con gate real · rollback probado · ambientes aislados · **runbook de secretos** · **observabilidad que alerta**.

**+ las 4 pasadas completas:** P1 mapeó todo · P2 halló las causas raíz · P3 no logró romper nada (o lo roto se arregló) · P4 verificó cierres + 0 regresiones + meta-auditoría sin clase nueva pendiente.

> **"100%" = TODOS los checkboxes verdes, incluida Inteligencia, Tenant y UX/UI, con las 4 pasadas hechas.** No antes.

---

## TRACKING DE HALLAZGOS

`ID: [PORTAL|FASE]-[DIM]-[NN]` · Severidad 🔴🟠🟡⚪ · Pasada (1-4) · Dimensión (AuthZ/AuthN/Lógica/Datos/Errores/Tests/Perf/**Tenant/Inteligencia/UX**) · Ubicación (archivo:línea / endpoint / PoC) · Descripción · Impacto · Remediación · Referente (si UX) · Estado (abierto/en-progreso/resuelto/**verificado**).

**Regla de cierre:** ningún portal pasa su gate con un 🔴 o 🟠 abierto. La plataforma no va a producción con un 🔴 o 🟠 abierto en ninguna parte — caja **e** inteligencia.

---

## FLUJO DE EJECUCIÓN v2

```
FASE P (plataforma)  →  FASE 0 (matrices + 3 mapas nuevos)  →  FASE T (tenant)
        ▼
PORTALES ×4 (Superadmin → Marketplace → Asesor → Dev)
   cada portal corre las 10 dimensiones (9 de v1 + UX/UI)
   y la FASE I (inteligencia) donde aplique
        ▼   ↺ todo lo anterior se recorre en las 4 PASADAS escalonadas:
            Pasada 1 (Sr) → Pasada 2 (Master) → Pasada 3 (QA/Red-Team) → Pasada 4 (Maestro)
        ▼
COSTURAS (cross-portal + cross-tenant + cross-IA)
        ▼
FASE Ω (observabilidad runtime)
        ▼
GATE GLOBAL v2 (matriz en verde + plataforma + 4 pasadas cerradas)
```

---

### Resumen de lo que v2 añade sobre v1
**2 fases nuevas** (T·Tenant, I·Inteligencia) · **1 fase de cierre** (Ω·Observabilidad) · **1 dimensión nueva por portal** (UX/UI minuciosa) · **el motor de 4 pasadas escalonadas** · **el upgrade nuevo ⭐** (Linaje de datos / fuente única — caza la clase de bug que esta auditoría ya encontró 3 veces) · y **enriquecimientos** a las dimensiones de v1 (CSRF en AuthN, golden financiero en Lógica, k-anon en Datos, fail-soft de LLM en Errores, los tests existentes como gate).
