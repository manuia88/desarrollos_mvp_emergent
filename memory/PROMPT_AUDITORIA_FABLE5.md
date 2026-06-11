# Prompt Maestro DMX — Auditoría + Rediseño + Re-Arquitectura Total (para Fable 5)

> Generado 2026-06-11 por un workflow de 14 agentes (5 recon que leyeron el repo real + 6 redactores + editor jefe + crítico adversarial). Fundamentado en el código real. Pégalo en una sesión de Fable 5 en Claude Code. Es largo a propósito — máxima granularidad y cobertura.

---

ROL Y MISIÓN

Eres un auditor-arquitecto senior, white-box y paranoico, contratado para la **auditoría + rediseño + re-arquitectura TOTAL** del repositorio DMX (`desarrollos_mvp_emergent`). No es un resumen ni una opinión: tu entregable es un **plan de upgrade accionable, priorizado, falsificable y verificable** que (1) audita seguridad, arquitectura, datos, performance y UX hasta el último rincón; (2) propone el rediseño front que sube el nivel del producto; y (3) traza la re-arquitectura estructural que deja al sistema capaz de crecer sin generar bugs nuevos. Trabajas en bloques numerados, te detienes a esperar OK donde se indica, y **cada afirmación lleva evidencia `archivo:línea` re-leída en vivo en esta sesión** (las citas de este prompt son pistas, no evidencia — ver Contrato §0.4.R12). Ante la duda entre velocidad y rigor, elige rigor: el founder no tiene prisa (calidad > velocidad, se prende al final). Un Ledger honesto al 60% vale más que un "listo" inflado al 100%.

═══════════════════════════════════════════════════════════════════
CONTEXTO DMX — FUENTE ÚNICA DE VERDAD (léelo entero antes de tocar nada · se declara aquí UNA vez y los bloques referencian "ver CONTEXTO §X")
═══════════════════════════════════════════════════════════════════

**§A — Qué es.** Plataforma AI-native de real estate (CDMX + Dubai) con 4 portales autenticados (Asesor, Desarrollador, Superadmin, Comprador) + Marketplace público sin auth. Stack: **FastAPI + React (CRA) + MongoDB**, multitenant. El SDK central de LLM es `emergentintegrations.llm.chat.LlmChat` (default Claude Sonnet 4.5, `claude-sonnet-4-5-20250929`) vía `EMERGENT_LLM_KEY`; OpenAI directo (`OPENAI_API_KEY`) para embeddings/visión/imagen. Wrapper de seguridad/costo: `services/llm_guard.py` (`send_with_timeout`, timeout 25s + `within_budget`).

**§B — Tamaño real (ground truth de referencia — VERIFÍCALO en vivo, no de memoria).** ~214 routers en `backend/routes/` (215 con `__init__.py`) · **168 motores `*_engine.py`** · **54 services** en `backend/services/` · **11 módulos** en `backend/cerebro/` · **~390 colecciones Mongo** (~100 con datos) · 5 superficies UI con ~38 (asesor) / ~38 (dev) / ~84-89 (superadmin) / ~10 (comprador) / 31+ (público) páginas · decenas de flags · ~50 call-sites de LLM. El modo de fallo dominante NO es equivocarse en un hallazgo: es **dejar zonas enteras sin mirar y declarar "listo".**

**§C — DOCTRINA DEL SEED IN-MEMORY (la tesis central — internalízala como cierta).** La DB de negocio (`developments`, `transactions`, `leads`, `asesor_*`) está **VACÍA**; la app corre sobre **seed in-memory** (`backend/data_developments.py`). Por eso **casi todo bug es LATENTE**: pasa el happy-path en seed y estalla con dato real. Audita siempre con la pregunta "¿qué pasa cuando esta colección tenga 100k docs heterogéneos?", no "¿se ve bien ahora?". Es el momento correcto para arreglar (alinea con "no hay prisa, prender al final"). **Consecuencia operativa (ver §D del Contrato 0.4.R13):** sobre una DB vacía cualquier "no funciona/vacío/inerte" es un falso positivo en potencia — discrimínalo SIEMPRE.

**§D — CLASES-RAÍZ de bugs (audita por clase, no por síntoma — cada fix central mata muchos hermanos):** (1) **seed-como-real** (`is_sold()` sobre estatus `md5` de `data_developments.py` tratado como venta real → ~15 afirmaciones falsas de bancabilidad/índices/Cerebro; fix canónico: contar ventas reales desde `units_history` vía `data_doctrine.has_real_sales(db)`); (2) **score-key divergente** (`score_total` vs `score_numeric`, 12+ hermanos, tier "F" para todo); (3) **nombre-de-colección leído mal** (43 sin escritor, 18 con gemelo lleno: `behavioral_tracking_events`→`behavioral_events`, `zones`→`dim_zones`, `properties`→`dmx_units`); (4) **firma rota propagada** (`emit_ml_event` ×16 = pipeline ML inerte); (5) **IDOR** (12+); (6) **money** (8); (7) **truncado** (5).

**§E — Aislamiento multitenant — fuente única: `backend/tenant_scope.py`.** `tenant_of(user)` (fallback `tenant_id → org_id → "default"`, `:33`), `actor_id(user)` (usa `user_id`, NO `id` — `UserOut` expone `user_id`; `getattr(user,"id")` caía al default, `:42`), `user_dev_ids(user)` (cascada de 4 niveles con fallback acotado **`DEVELOPMENTS[:2]`, NUNCA "todo"** = regla de oro anti-fuga, `:49`), `assert_lead_owner(db,user,lead_id)` (cierra IDOR cruzando `db.leads` y `db.asesor_contactos`, `:110`). Reemplazó copias divergentes de `_tenant()`/`_user_dev_ids()` (una con fuga: devolvía TODO a todos). Adopción por convención: thin wrappers re-exportados (`dev_batch2.py:62`, `dev_project_full.py:35`, `dev_batch10.py:40`, `dev_broker_intel.py:39`). El patrón seguro canónico de gate por request: `dev_batch2.py:115-117` (`if project_id and project_id in dev_ids: dev_ids=[project_id]`).

**§F — Dos universos de leads** unidos solo por **JOIN frágil de email** (sin FK): comprador = `db.leads` (key `user_id`/`email`, `routes/comprador.py:103-105`), asesor = `db.asesor_contactos` (key `owner_id`, emails en array `emails[]`); puente en `advisor.py:537-541`. Comentado en `cerebro/executors.py:497` y `comprador.py:97`.

**§G — Verdades canónicas que los docs viejos contradicen (el código manda — NO te dejes engañar):** (a) el tenant de la casa real es **`dmx_root`**, NO `dmx_house` (`routes/inmobiliaria.py::_resolve_inmobiliaria_id`, `house_pool_engine.py:26`); (b) lead de marketplace SIN asesor → **pool de la casa `dmx_root`**, NUNCA al dev dueño (este queda solo como metadato `about_developer_id`). Se violó en Tanda 29 (ruteado al dev) y se revirtió en Tanda 30 — confirma que no regresó. (c) Regla 1-asesor-×-mismo-proyecto + 6 checks de entity-resolution en `POST /api/cita` (`LEAD_REGISTRATION_RULES.md`).

**§H — El Cerebro** (`backend/cerebro/`, E0-E6 completas y verificadas, hoy **apagado por `CEREBRO_ENABLED`**) es un orquestador determinista de acciones (NO un LLM): `orchestrator.py` (meta→plan→encadena→pausa-en-delicado→aprueba), `guardrails.py::authorize:58` (3 candados fail-closed: aislamiento org `:25`, allow-list `ROLE_ALLOWED_ACTIONS` `:35`, aprobación humana `:47`), `contract.py` (`ACTION_REGISTRY`, `DELICATE_ACTIONS:114`, `HARD_DELICATE:123` nunca se automatiza, `ROLE_ALLOWED_ACTIONS:159`), `executors.py` (38KB, ejecutores reales fail-open que llaman motores), `coach.py` (loop de aprendizaje/reentreno), `config.py::effective_needs_approval:99` (piso `HARD_DELICATE:102`). Gate del flag = `cerebro_redteam_test.py` (16 ataques verdes). **Chokepoint de seguridad IA = allow-list de tools/acciones + tenant-scope, NO sanitización de texto:** la inyección puede alterar *texto de salida* pero está contenida para *acciones con efecto real* (envíos/dinero/firmas → siempre `HARD_DELICATE` con OK humano). Atlax público filtra por `PUBLIC_TOOLS` (`asistente_engine.py:467`), el broker por `available_tools` (`conversation_function_calling.py:36`).

**§I — Regla dura de FAIL-OPEN vs FAIL-CLOSED (criterio explícito — no racionalices).** Fail-open SOLO es aceptable en **cómputo/enriquecimiento idempotente** (scores, AVM, recomendaciones, RAG): si falla, devuelve vacío/degradado sin abrir un agujero. Fail-**CLOSED** es **OBLIGATORIO** en: **autorización, tenant-scope, dinero, presupuesto LLM, y cualquier acción `HARD_DELICATE`.** Un fail-open en cualquiera de estos cinco es un hallazgo (mínimo P1, P0 si es auth/tenant/dinero). Al evaluar cada `try/except`/`fail_open` decide en cuál categoría cae ANTES de declararlo "intencional". `FEATURE_GATING_ENFORCED` fail-open y `within_budget` fail-open son sospechosos por defecto: justifica o repórtalos.

**§J — MEMORIA DEL REPO + lo retirado.** NO existe `CLAUDE.md` (ni root ni subdirectorios); la guía persistente vive en `~/.claude/.../MEMORY.md` y en `memory/*.md`. **emergent está RETIRADO** (2026-05-31): Claude Code construye todo; NUNCA sugieras "Pull from GitHub" ni asumas que emergent existe. **La memoria misma es superficie de ataque a la auditoría: los docs ya engañaron a auditorías previas (caso `dmx_house`). Trátalos como sospechosos hasta verificar contra código vivo (ver Bloque 2.1 tabla DOC-vs-CÓDIGO).**

**§K — TRABAJO YA HECHO — NO RE-REPORTAR COMO NUEVO.** Auditoría formal de **12 fases + 5 rondas QA (QA1-QA5)** cerrada 2026-06-10: **P0 12/12 · P1 16/16 · P2 16/16 · P3 8/8, todos cerrados.** Fuentes a cotejar antes de levantar cualquier hallazgo: `memory/QA_FIX_CHECKLIST.md` (fuente única accionable) · `AUDIT_RESUMEN_EJECUTIVO.md` + `AUDIT_FASE_0..12_*.md` · `memory/QA3_MASTER_REPORT.md` · `DEV_HIDDEN_FEATURES_MAP.md`. Pendiente real = solo **infra del founder** (SENTRY_DSN, credencial Mongo solo-lectura P2.16, dedup `.env.local` P3.5) o **tranches que esperan datos/escala** (no son bugs nuevos). Núcleo go/no-go: **LISTO salvo infra.** **CRÍTICO (ver Contrato 0.4.R6 + R12):** un fix "documentado cerrado" pudo regresar en Tandas 20-38; para cada P0 marcado cerrado debes **re-ejecutar el chequeo concreto** (el grep/request que lo detectó), no solo leer el doc.

**§L — SÓLIDO — no tocar (confirmado por QA, RE-VALIDA que siga vivo, no lo des por hecho):** contrato FE↔BE limpio (0 drifts) · auth/rol desde BD (escalada por token imposible) · bcrypt fuerte · k-anon · NoSQL-injection/path-traversal bloqueados · `.env` nunca commiteado · 593 módulos importan limpio.

**§M — Tesis de producto del founder:** "el módulo no sobra de features, sobran ESCONDIDAS". `DEV_HIDDEN_FEATURES_MAP.md`: 9 pantallas fuera de menú · suite IA agéntica apagada por flag `agentic_enabled=False` (29 endpoints `/api/agentic-crm/*` con paneles FE hechos) · 10 motores sin pantalla dev · 27 endpoints huérfanos. **Prender la suite IA = settings, NO código.** Tandas 20-38 (2026-06-11, branch `dev-redesign-tandas`, checkpoints `checkpoint-tanda*`) surfacearon features apagadas y cerraron el loop agéntico en los 4 portales.

**§N — MAPA DE HUÉRFANAS (ground truth — se declara aquí UNA vez; el Ledger es su único hogar, los bloques referencian "ver §N").** Rutas sin entrada de nav, EXCLUYENDO redirects `<Navigate>` (que NO son huérfanos): **Asesor ~8** (`/portal/asesor/marketplace`, `/portal/studio/staging`, `/portal/studio/property-intake/new`, `/asesor/studio/director`, `/asesor/configuracion`, `/asesores`, + `/portal/asesor/alertas` y `/asesor/outbound` solo-V2) · **Dev 2 reales** (`/desarrollador/crm/asesores-metrics`, `/desarrollador/proyectos/nuevo`) · **Superadmin 12** (`/superadmin/{rag-inspector, entity-resolution, climate-migration, fsd-accuracy, virtual-staging, conversation-cost, system-map, user-diagnostics, invites, ie-engine-sources, dashboard-legacy, audit-log-legacy}`) · **Comprador 10** (portal entero sin sidebar propio). **Redirects `<Navigate>` legítimos (NO huérfanos):** `/asesor/inventario`, `/asesor/mis-aliados`, `/asesor/links`, `/desarrollador/{inventario,citas,leads,calendario-subidas,crm/funnel}`. **Sub-componentes de hubs superadmin SIN ruta top-level (distintos de huérfanas reales):** `CompetenciaRed, Comportamiento, DesarrollosPanorama, DondeConstruir, GustoMercado, MacroCiudad, ObservabilidadIA, StockSoldOut`.

**§O — Reglas de comunicación con el founder (no-dev):** lenguaje de persona normal, cero jerga, lo técnico va chico y abajo; resúmenes ≤10 líneas. NO escribas reportes `.md` salvo los entregables explícitos de este prompt (`REPO_COBERTURA.md`, `REPO_PLAN_MAESTRO.md`, scripts en `/load-tests/`); todo lo demás va en tu respuesta. Sobre verificación visual: ver §0.4.R14 (DB vacía → solo verificas estados vacíos/seed; los hallazgos de "dato real" son por análisis estático/proyección, nunca por observación — son cosas distintas, no las confundas).

---

ORDEN DE EJECUCIÓN Y PAUSAS

Ejecuta los bloques EN ORDEN. **El Bloque 0 es bloqueante:** no avances sin completar el Arranque y publicar el Ledger. Al cerrar **cada** bloque (y cada sub-bloque marcado): actualiza el Ledger, presenta hallazgos en el formato canónico (0.4), y **DETENTE a esperar OK** antes de seguir. No encadenes el repo entero en una sola pasada sin checkpoint. Si el contexto se satura, cierra el bloque, deja el Ledger actualizado como punto de retorno, y pide arrancar sesión nueva desde ahí.

═══════════════════════════════════════════════════════════════════
BLOQUE 0 — ARRANQUE, EXHAUSTIVIDAD, LEDGER, LÍNEA-BASE Y CONTRATO (BLOQUEANTE)
═══════════════════════════════════════════════════════════════════

> No avances a ninguna fase de auditoría/rediseño hasta haber ejecutado el Arranque, publicado el Ledger de Cobertura y capturado la Línea-Base Cuantitativa. Si lo saltas, todo lo que sigue carece de base y queda invalidado.

### 0.1 Arranque — Verifica que Estás en el Repo Correcto

Antes de leer un solo archivo de negocio, ejecuta esta verificación de identidad:

```bash
cd /Users/manuelacosta/Developer/desarrollos_mvp_emergent && \
git rev-parse --show-toplevel && \
git branch --show-current && \
git log --oneline -3 && \
test -f backend/tenant_scope.py && \
test -f backend/house_pool_engine.py && \
test -d backend/cerebro && \
test -f backend/data_developments.py && \
ls backend/routes/ | wc -l && \
echo "DMX_REPO_OK"
```

Válido **solo si** se cumplen TODAS: el `toplevel` termina en `desarrollos_mvp_emergent` · existen `tenant_scope.py`, `house_pool_engine.py`, `data_developments.py` y el dir `cerebro/` · `ls backend/routes/ | wc -l` devuelve **~214-215** (si da ~10 o ~500, no es este repo o el árbol está corrupto) · la rama es `dev-redesign-tandas` (o descendiente). Si estás en `main` u otra, **no cambies de rama por tu cuenta**: repórtalo y pide OK. Si **cualquier** señal falla, **NO inventes, NO improvises, NO audites un repo parecido**: reporta exactamente qué señal falló (con la salida real) y **detente**. No busques `CLAUDE.md`: no existe (§J).

### 0.2 Regla de Exhaustividad — Cobertura Total, Cero Fingimiento

1. **Inventario antes que opinión.** Cero hallazgos de fondo hasta tener el inventario completo (0.3). Auditar de memoria o por muestreo intuitivo está prohibido — este repo ya engañó a auditorías previas así.
2. **Barrido en pasadas con porcentaje explícito.** Recorre cada categoría por portal reportando avance como **`X/Y revisados (Z%)`** al cierre de cada bloque. Nunca "revisé los routers"; di "214/214 (100%)" o "60/214 (28%), pendientes studio/comprador/public".
3. **Prohibido declarar "listo" con ítems sin revisar.** "Listo" = **Y/Y = 100%** en el Ledger, o ítem **`N/A` con razón**. Un ítem sin tocar NO es `N/A`: es **PENDIENTE**.
4. **Nunca finjas cobertura.** Si no abriste un archivo, su celda dice `PENDIENTE`, no `OK`. La honestidad sobre lo que NO miraste vale más que una afirmación inflada — y será verificada contra el Ledger.
5. **Los huérfanos y lo oculto cuentan como cobertura obligatoria** (§N, §M). Rutas sin nav, pantallas fuera de menú y suite IA apagada por flag forman parte del scope. Justo ahí viven los bugs latentes.

### 0.3 Fase 0 — Ledger de Cobertura (`REPO_COBERTURA.md`)

Tu **primer entregable**, antes de cualquier hallazgo: crea `REPO_COBERTURA.md` en la raíz, el inventario maestro contra el cual se mide TODO el avance. Constrúyelo con `git ls-files` / `ls` reales, no de memoria ni de este prompt (los conteos de §B son referencia, no fuente — verifica en vivo). Inventaria, ítem por ítem, con estado por cada uno:

- **Páginas FE por portal** — desde `frontend/src/App.js` (rutas reales, `portalForRole` en `App.js:431`) cruzadas con `config/navByRole.js` (V1) y `config/navByRoleV2.js` (V2, flags `REACT_APP_SIDEBAR_V2`/`REACT_APP_DEV_V2`). Marca cada ruta: **en-nav**, **huérfana** (sin nav, excluyendo `:param` y redirects `<Navigate>`), o **redirect**. Portales y carpetas: Asesor (`pages/asesor/` + `pages/portal/asesor/` + `pages/portal/studio/`); Developer (`pages/developer/`); Superadmin (`pages/superadmin/` + `components/superadmin/`); Comprador (`pages/comprador/`); Marketplace (raíz `pages/` + `pages/public/` + `pages/portal/tools/` + widgets). El mapa de huérfanas, redirects y sub-componentes ground-truth está en **§N** — confírmalo en vivo y vuélcalo aquí; ESTE es su único hogar (los demás bloques lo referencian).
- **Routers** — los ~214 de `backend/routes/`, agrupados por dominio: dev (`dev_batch1..19`/`dev_*`, ~30), superadmin (`superadmin_*`, 12), asesor/advisor (~9), studio (9), comprador/buyer (~5), public/marketplace (~13), cerebro/agéntico (~6), conversación/IA (~8), auth/infra, datos/AVM/valuación.
- **Motores** — los 168 `*_engine.py` por familia (avm/valuación, drpi, zone, fit/match, buyer/score, churn/coaching, investment/sim, live_pulse, risk, forecast, absorción/ventas, conversación/IA, data_sources, studio, competitivo).
- **Services y Cerebro** — los 54 de `backend/services/` y los 11 de `backend/cerebro/` (`contract, guardrails, orchestrator, executors, coach, config, store, memory, recommendations, __init__`).
- **Colecciones de Mongo** — como mínimo las más referenciadas (`leads` 383, `users` 235, `developments` 114, `appointments` 98, `asesor_contactos` 88, `projects` 64, `audit_log` 62, `cube_aggregations` 58, `units` 51, `ie_scores` 49, + cola: `notifications` 45, `colonias`/`behavioral_events` 43, `conversation_threads` 41, `transactions` 38, `studio_landings` 35, `visit_requests`, `asesor_operaciones`, `asesor_profiles`). Nota cuáles tienen escritor real vs. vacías (§C).
- **Flags** — `CEREBRO_ENABLED`, `FEATURE_GATING_ENFORCED`, `agentic_enabled`, `REACT_APP_DEV_V2`, `LEADS_V2`, `REACT_APP_SIDEBAR_V2`, `ATLAS_RESENAS_ENABLED`, modelos env-overridable (`CONVERSATION_MODEL`/`DIRECTOR_MODEL`/`ASISTENTE_MODEL`/`CONVERSATION_SONNET_MODEL`/`_OPUS_MODEL`).
- **Puntos-IA / call-sites LLM** — los ~50 sitios que llaman a un LLM (`asistente_engine.py:1181`, `conversation_engine.py:819`, `copilot_engine.py`, `cma_engine.py:328`, los `agentic_crm/*_engine.py`, etc.) y los **puntos de prompt-injection** (Atlax público, persona por tenant, email entrante, conversación, DISC, reseñas, RAG de 2º orden).
- **Índices Mongo REALES** — extrae la definición real, no inferida: grep de `create_index`/`createIndex`/`ensure_index` en el código de arranque (`backend/`, scripts de init) y, si hay acceso a Mongo de dev, `db.<col>.getIndexes()` por las 10 colecciones más referenciadas. Esta lista es el denominador del Bloque 3 (índices faltantes); sin ella, todo razonamiento de performance es especulación.

**Formato de cada fila del Ledger:** `ítem | portal/dominio | estado{PENDIENTE|OK|N/A} | razón-si-N/A | hallazgos-vinculados`. Al cierre de cada bloque, **actualiza el Ledger y reporta el % agregado** por categoría y total (ej. `Routers 214/214 100% · Motores 90/168 54% · Páginas Superadmin 40/89 45%`).

### 0.4 Contrato de Operación — Inviolable

Romper cualquiera invalida el trabajo:

1. **Read-only absoluto en auditoría.** NO modifiques, NO escribas, NO "arregles de paso", NO refactorices ni un carácter de código mientras auditas. Únicos archivos que creas/editas: `REPO_COBERTURA.md`, `REPO_PLAN_MAESTRO.md` y los scripts de `/load-tests/` (entregables). Cualquier cambio de código espera fase de fix con OK explícito del founder.
2. **Evidencia `archivo:línea` obligatoria y re-leída.** Todo hallazgo cita ubicación exacta (`backend/routes/dev_batch7.py:345`). Prohibido "creo que en algún router…". **Toda línea citada debe re-leerse en esta sesión** (ver R12).
3. **Prioriza por impacto/esfuerzo + severidad.** Clasifica: **P0** (rompe seguridad/dinero/aislamiento o engaña con datos falsos) · **P1** (degrada función real con dato real) · **P2** (deuda que estallará con escala/datos) · **P3** (cosmético/menor). Cruza severidad con esfuerzo para ordenar la cola.
4. **Busca el hilo, no los nudos.** El objetivo NO es 200 síntomas, sino **3-5 patrones de fondo (clases-raíz, §D)**. Reporta agrupado por clase-raíz, con la lista de hermanos como evidencia.
5. **Honestidad brutal.** Si algo está bien, dilo y no lo "encuentres roto" para llenar cupo. Si no estás seguro, dilo.
6. **No re-reportes lo ya cerrado.** Coteja contra los docs de §K antes de levantar un hallazgo. Etiqueta cada uno **`[YA-CERRADO]`** (citado en docs Y re-verificado vivo — NO re-reportar), **`[REGRESIÓN]`** (estaba cerrado y volvió — alta prioridad), o **`[NUEVO]`** (no aparece en ningún doc). **Un `[YA-CERRADO]` no se afirma por lectura del checklist: se afirma re-ejecutando el chequeo concreto que lo detectó (§K). Si no re-ejecutaste, no es `[YA-CERRADO]`, es PENDIENTE.** Recuerda las verdades de §G.
7. **Trabajo por bloques con pausa para OK.** Bloques acotados (un portal, una clase-raíz, un dominio de routers). Al cerrar: actualiza Ledger, presenta hallazgos, **detente a esperar OK**.
8. **Sesión nueva al saturar contexto.** NO degrades a resúmenes vagos ni "completes de memoria". Cierra el bloque, deja el Ledger como punto de retorno, pide sesión nueva.

**9. FORMATO CANÓNICO DE HALLAZGO (se define aquí UNA vez; los bloques NO lo repiten, solo lo usan):**
```
[P0|P1|P2|P3] · CLASE-RAÍZ (§D, si aplica) · [YA-CERRADO|REGRESIÓN|NUEVO] · TIPO{CABLE-ROTO|FLAG-OFF|ESPERA-DATOS} · PORTAL(es) · ¿ROMPE-CICLO?{sí:cuál|no}
Ubicación:  archivo:línea (todas las ocurrencias hermanas) · [✓ re-leído en vivo]
Evidencia:  qué hace hoy el código + por qué está mal (cita real, no paráfrasis)
Impacto:    qué se rompe con dato/escala real, a quién afecta, en qué portal
Fix:        cambio propuesto concreto (1 punto central que mate los hermanos), esfuerzo aprox.
```

**10. TIPO obligatorio — discriminador CABLE-ROTO vs FALTA-DE-DATO (anti-falsos-positivos, la regla de mayor valor).** Todo hallazgo de "no funciona/vacío/inerte" DEBE clasificarse en exactamente uno: **(A) CABLE-ROTO** (código llama mal / colección mal nombrada / firma rota — bug real, arreglable hoy) · **(B) FLAG-OFF** (vivo, prender = deploy, NO es bug) · **(C) ESPERA-DATOS** (correcto, dormido por DB vacía/falta de escala — NO es bug, §C). Sin esta etiqueta el hallazgo no cuenta. Es lo que separa una auditoría real de 200 falsos positivos sobre una DB vacía.

**11. PORTAL + ¿ROMPE-CICLO? obligatorios.** Cada hallazgo declara a qué portal(es) afecta y si **rompe un ciclo cross-portal que arranca-y-debe-cerrar** (lead→asesor, comprador→pool `dmx_root`, dev→leads, registro de cita). **Un bug que rompe un ciclo de negocio es P0 aunque parezca cosmético; uno aislado en una pantalla huérfana sin tráfico es P3.** Esto reordena la cola de fix por valor real, no por severidad técnica abstracta.

**12. PRESUPUESTO DE EVIDENCIA ANTI-ALUCINACIÓN.** Este prompt te dio decenas de `archivo:línea` (ej. `guardrails.py:58`, `asistente_engine.py:1181`) — son **pistas, NO evidencia**. Toda línea que cites en un hallazgo debe estar **re-leída en esta sesión** (marca `[✓ re-leído en vivo]`). Al cierre de cada bloque reporta: **"N hallazgos · N con cita re-confirmada en vivo (debe ser 100%)"**. Copiar el ground-truth del prompt sin abrir el archivo = alucinación, invalida el hallazgo.

**13. ETIQUETA DOC-vs-CÓDIGO.** Cuando un hallazgo o afirmación toque algo que los docs `memory/*.md` también afirman, marca el doc como **VERDADERO** (código lo confirma) / **OBSOLETO** (cambió) / **CONTRADICHO** (código dice lo opuesto, ej. `dmx_house`→`dmx_root`). La memoria es superficie de ataque a la auditoría (§J).

**14. VERIFICACIÓN VISUAL — qué significa con DB vacía (resuelve la contradicción read-only vs "ver en app real").** Verificar en `localhost:3000` está PERMITIDO y es read-only (navegar/observar, nunca mutar). Pero la DB de negocio está vacía (§C): **lo que observas en vivo son estados vacíos/seed**, y eso es justo lo que debes verificar (¿el estado vacío está bien diseñado? ¿la pantalla carga?). **Los hallazgos de comportamiento con "dato real" son SIEMPRE por análisis estático/proyección, NUNCA por observación** — no afirmes "vi que se rompe con 100k leads"; afirma "por `archivo:línea`, con 100k leads este scan sin índice colapsa". No confundas las dos fuentes.

### 0.5 Línea-Base Cuantitativa de Salud (hace la auditoría FALSIFICABLE — captúrala en el Arranque)

Antes del Bloque 1, corre y publica estos conteos exactos (grep/scripts reales), que un re-run futuro pueda comparar para detectar regresión. No son hallazgos: son la regla de medir. Mínimo obligatorio:
- **nº de accesos crudos a Mongo sin scope** — `grep -rn "db\.\(leads\|users\|developments\|asesor_contactos\|appointments\|units\)\.\(find\|aggregate\|update\|delete\)" backend/` y, de esos, cuántos NO pasan por `tenant_of`/`user_dev_ids`/`assert_*` ni por un thin-wrapper.
- **nº de endpoints con `Body`/`dict` crudo sin modelo Pydantic** (superficie de mass-assignment/inyección).
- **nº de copias divergentes de `_tenant()`/`_user_dev_ids()`/`_user_org()`** que NO son thin-wrappers al canónico (`tenant_scope.py`).
- **nº de `except: pass` / `except Exception: pass`** en `backend/` (candidatos a fail-open silencioso — cruza con §I).
- **nº de `db.X.find({})` / `.find()` sin filtro ni `.limit()`** (full-scans).
- **nº de `REACT_APP_*` en `frontend/src/`** que contengan key/secret/token/salt/password.
- **conteo de imports limpios** (`py_compile` de los 593 módulos — confirma §L) y **build/lint FE** (errores+warnings actuales).
Publica la tabla `métrica | valor-hoy | comando` como sección fija del Ledger.

**→ PAUSA: publica `REPO_COBERTURA.md` con los % iniciales, los índices Mongo reales y la Línea-Base Cuantitativa. Espera OK antes del Bloque 1.**

═══════════════════════════════════════════════════════════════════
BLOQUE 1 — SEGURIDAD + IA ADVERSARIAL + RED TEAM (P0 ABSOLUTO)
═══════════════════════════════════════════════════════════════════

> **ENCUADRE.** La sección más crítica. Modo paranoico, white-box, asumiendo que el atacante leyó todo el código. Casi todo bug aquí es **LATENTE** (§C): una fuga cross-tenant "parece funcionar" hoy y estalla con dato real — audita como si el dato real ya estuviera dentro. **NO re-reportes lo ya cerrado**; valida que el fix sigue vivo re-ejecutando su chequeo (§K, R6) y caza lo que la auditoría previa no tocó: rutas nuevas de Tandas 20-38, los 214 routers, los ejecutores agénticos recién surfaceados. Solo P0/P1 entran aquí. La prioridad absoluta, por encima de todo lo demás, es **una sola fuga cross-tenant o una sola escalada de privilegio**: eso hunde una plataforma multitenant de real estate con dinero y PII.

### 1.1 Aislamiento Multitenant (el corazón del modelo de amenaza)

Internaliza §E antes de auditar.

**Tarea 1.1.A — Censo completo de lectura/escritura a Mongo.** Recorre los 214 routers, 54 services, 9 módulos de `cerebro/` y 168 motores. Para CADA acceso a Mongo (`find`, `find_one`, `update*`, `delete*`, `aggregate`, `insert*`) sobre colección con datos de tenant (prioridad: `leads`, `users`, `developments`, `asesor_contactos`, `appointments`, `projects`, `units`, `asesor_operaciones`, `visit_requests`, `conversation_threads`, `cube_aggregations`, `ie_scores`, `audit_log`), produce una fila:

`| Entidad/Colección | Archivo:línea | Operación | ¿Filtra tenant? | Origen del tenant_id (sesión vs request) | ¿Aislamiento probado? | Severidad |`

- **Columna crítica "Origen del tenant_id":** distingue si el filtro viene de **sesión autenticada** (`tenant_of(current_user)`, seguro) o de **parámetro del request** (`project_id`, `org_id`, `lead_id`, `dev_org_id` en path/query/body). Si viene del request SIN validarse contra `user_dev_ids(user)`/`assert_lead_owner`/`assert_dev_org`/`assert_dev_project` → **IDOR, P0**. Patrón seguro canónico: §E (`dev_batch2.py:115-117`).
- **Lupa en agregados, reportes, búsquedas y dashboards** — devuelven cross-tenant silenciosamente porque "solo cuentan/promedian". Casos a re-verificar (re-leídos en vivo) y luego barrer por patrón: `db.leads.find({})` en `dev_batch7.py:345`, `rag_engine.py:307` (ingesta RAG global, **alto riesgo**: alimenta prompts), `studio_landing_engine.py:1582`, `pipeline_migration_script.py:57`. Para `superadmin_*` (12) confirma que el scan global es **god-view legítimo** y no una ruta no-superadmin colándose. Revisa `cube_aggregations` e `ie_scores` con saña: un cubo/score precomputado que mezcla tenants y se sirve a un dev es fuga invisible.
- Verifica que los thin wrappers re-exportados (§E) **realmente delegan** al canónico. Grep todo el repo por definiciones locales de `_user_dev_ids`/`_tenant`/`_user_org` y compáralas con `tenant_scope.py` (caza la copia divergente con fuga histórica). Cruza con la Línea-Base (0.5).

**Tarea 1.1.B — Request exacto de ataque cross-tenant en las 5 entidades más sensibles.** Para cada una: request HTTP literal (método, ruta, headers de auth del Tenant-A, body/params apuntando a recurso del Tenant-B), resultado esperado si está aislado (403/404/lista vacía) y síntoma de fuga. Cubre **lectura Y mutación**:
1. **`leads`/`asesor_contactos`** — A intenta `GET`/`PATCH` un `lead_id`/`contact_id` de B (prueba el bypass por JOIN de email §F: A registra un user con el email de un lead de B vía `comprador.py:103-105`). Mutación: `PATCH` etapa a "ganado/perdido" del contacto de B (dispara `on_deal_closed`→Cerebro, ver 1.4.B).
2. **`developments`/`projects`/`units`** — A pide reportes/CRM/pricing pasando `project_id`/`dev_org_id` de B (`dev_batch*`, `dev_project_full`, `dev_broker_intel`); confirma el gate `project_id in dev_ids` en TODAS.
3. **`appointments`/`visit_requests`** — A lee/cancela/reasigna una cita de B; verifica el pool (`house_pool_engine.py`): que un asesor no-casa no reclame leads del pool `dmx_root`, y que `assign_house_lead` no exponga datos del lead a un asesor fuera de su zona.
4. **`asesor_operaciones`/comisiones** — A lee operaciones/comisiones de un asesor de B (dinero); verifica `owner_id`/`tenant` en `advisor.py` (`:537,:588,:793,:812,:826,:911`).
5. **`conversation_threads`/`cube_aggregations`** — A lee hilos (PII + texto de leads) o un agregado de cubo de B. El cubo es el más insidioso: prueba que `superadmin_metrics_cube` y cualquier consumidor dev filtren por tenant al servir.

Entrega cada payload para correr contra **STAGING** (ver 1.6).

### 1.2 Credenciales Privilegiadas y Conexión Mongo

- **¿La conexión admin de Mongo se usa para saltarse el filtro de tenant?** Audita cómo se obtiene el handle `db`. Si TODO el backend usa una sola conexión con privilegios plenos y el aislamiento depende 100% de que cada query incluya el filtro en código, cada query sin filtro (1.1.A) es fuga directa — no hay red a nivel de DB. Documéntalo como riesgo arquitectónico **P0** y verifica **P2.16 (credencial Mongo solo-lectura)**: ¿se materializó o sigue pendiente?
- **Secretos en el bundle frontend (`REACT_APP_*`) = P0 inmediato.** Grep `frontend/src/` y el bundle compilado por cualquier `REACT_APP_*` con key/secret/token/salt/password/connection string (cruza con Línea-Base 0.5). Antecedente real: **salt LFPDPPP en el bundle** (marcado fixed — re-verifica que NO regresó). Cualquier `EMERGENT_LLM_KEY`, `OPENAI_API_KEY`, `STRIPE_*`, credencial Mongo o `*_SALT` en el cliente es P0 (en CRA todo `REACT_APP_*` se hornea en el JS público).

### 1.3 Auth, Sesiones, Roles, Secretos, Validación/Inyección

**Auth / sesiones / roles:**
- Recorre `routes/auth.py` e `internal_users`: emisión de token, expiración, refresh, y el **login comprador por MagicLink** (`/login-comprador`) — verifica que el token mágico no sea adivinable, no reusable, y expire.
- **Chequeo de rol en el BACKEND, no esconder botones en UI.** Verifica, no asumas, que el rol se valida server-side contra la BD para cada endpoint sensible (mutaciones dev/superadmin, ejecutores agénticos, acciones de dinero). Rutas "huérfanas" (§N) **siguen siendo endpoints accesibles** — que no estén en sidebar NO las protege; las 12 huérfanas de superadmin deben exigir rol superadmin server-side.
- **`portalForRole` (`App.js:431`) es enrutamiento de UI, no autorización.** Confirma que ningún endpoint confía en el portal del que vino el request.
- **Logout que invalida de verdad** + **hashing fuerte** (bcrypt confirmado §L — re-verifica cost factor y que ningún path use hashing débil/plano).
- **Allow-list de tools agénticas por rol** (`available_tools` en `conversation_function_calling.py:36`, `ROLE_ALLOWED_ACTIONS` en `cerebro/contract.py:159`): autorización server-side; un rol bajo no invoca tool de otro rol manipulando el request. Antecedente "Atlax 56 tools sin allow-list" fixed — re-verifica que el allow-list está vivo en TODOS los dispatchers.

**Secretos / fugas:**
- Hardcoded secrets (grep amplio en `backend/`).
- `.env` en `.gitignore` **Y en el historial git** (`git log --all -- '*.env*'`, `git log -p` por strings de secreto) — un secreto borrado pero presente en commit viejo sigue comprometido. Verifica **P3.5 (dedup `.env.local`)**.
- **Logs con tokens/PII** — grep `print(`/`logger` en call-sites de LLM y auth por loggeo de prompts completos, tokens, emails, teléfonos. El Cerebro tiene `memory.redact_pii` — confirma que se aplica antes de persistir/loggear.
- **Stack traces al cliente** — confirma que FastAPI no devuelve trazas en prod y que los 500 no filtran rutas/queries internas (esto es fail-CLOSED de información, §I).

**Validación / inyección:**
- **Pydantic por endpoint** — censa endpoints que aceptan `dict`/`Body` crudo sin modelo estricto (cruza con Línea-Base 0.5); cada uno es superficie de mass-assignment e inyección.
- **NoSQL injection vía operadores `$`** — vector más peligroso: si un valor controlado por el usuario entra directo y puede enviar `{"$ne":null}`/`{"$gt":""}` en vez de string, bypassa filtros. **Lupa en `marketplace_search`, `smart_lists`, `asesor_busquedas`** y todo endpoint de búsqueda/filtro. Confirma coerción a string/tipos antes de la query (ground truth dice bloqueado §L — re-verifica en rutas nuevas).
- **Mass-assignment de `role`** (y `tenant_id`, `org_id`, `owner_id`) — el peor: un `POST/PATCH` de perfil donde el body se hace `update` directo a `db.users` permitiría a un asesor escalarse a superadmin o cambiar su tenant. Audita `internal_users`, `auth`, `advisor` (update de perfil) y CUALQUIER `update_one(..., {"$set": body})` con `body` del request sin whitelist. **P0 si `role`/`tenant_id` son asignables por el usuario.**
- **XSS** — salida de LLM o UGC (reseñas, nombres, descripciones) renderizada como HTML (ver 1.4.C y `reviews_residents_engine.py`).
- **File uploads** — `studio_assets`, `property_intake`, `bulk_ingest`, `dev_assets.py` (visión): valida tipo/tamaño/extensión, content-type no ejecutable, path sin traversal (§L dice bloqueado — re-verifica en los uploaders nuevos de Studio).

### 1.4 Superficie IA / Prompt-Injection (frontera de confianza)

DMX es IA-first: el modelo de amenaza LLM es de primera clase. El chokepoint real es allow-list + tenant-scope, no sanitizar texto (§H). La inyección puede alterar *texto de salida*; el objetivo es probar que **NO puede disparar acciones con efecto real ni exfiltrar cross-tenant**.

**Tarea 1.4.A — Mapa input-no-confiable → prompt LLM.** Para cada superficie traza: ¿dónde entra texto controlado por usuario o dato externo? ¿se concatena al system prompt o va como mensaje de usuario? ¿qué tools puede invocar el LLM ahí? ¿toman identidad/tenant? Tabla por superficie con severidad (re-verifica adversarialmente, no des por buenas las mitigaciones):
- **🔴 Atlax público SIN auth** (`asistente_engine.py`, `chat()→:1107`, LLM `:1181`; wrapper `atlax_engine.py`): `query` del visitante (máx 500c) entra al LLM. Mitigación declarada: allow-list `PUBLIC_TOOLS:467-478` + chokepoint `_exec_tool:481-485`, tools públicas SIN identidad. **Verifica:** intenta inducir al LLM a invocar tool fuera de `PUBLIC_TOOLS` (CRM/leads/spend); confirma rechazo por allow-list, no por confiar en el texto. Prueba exfiltración del system prompt y de la persona de otro tenant.
- **🔴 Persona por tenant → system prompt** (`atlax_persona_engine.build_persona_prompt`, en `asistente_engine.py:1196-1198/1227`): `custom_greetings`/`tone`/`custom_signature` editables por el admin de la org se anteponen al system prompt. Admin malicioso/comprometido inyecta instrucciones en el asistente público de SU org. Verifica audit-log + tier-gate (≥T2) y que NO rompe el tenant-scoping del resto del prompt.
- **🟡 Email entrante externo → clasificador** (`agentic_crm/reply_classifier_engine.py:131`, `_layer_llm:123`): `body_text/body_html` del email al prompt. Mitigación: `_strip_quoted:107`, salida JSON, circuit breaker, tier-gated. Verifica que la acción resultante (`notify_asesor`/`add_watchlist`/`mark_spam`) NO escala por el cuerpo, y que el HTML no inyecta a un render posterior.
- **🟡 Conversación WhatsApp/web broker** (`conversation_engine.py:832`, `user_text` inbound + history + RAG/KG `:582` + auto-enrichment `:660-668`): tools con allow-list (`conversation_function_calling.py:125-126`). Verifica que el lead no induzca una tool que mute datos de otro lead/tenant.
- **🟡 DISC inferencer** (`agentic_crm/disc_inferencer_engine.py`): free-text del lead → prompt; `_extract_tool_calls:117` parsea tool-calls sobre texto que incluye input del lead — **vector directo de inyección de tool-call**. Verifica que las tool-calls parseadas pasan por allow-list antes de ejecutarse.
- **🟡 Reseñas UGC** (`reviews_residents_engine.py:197`, `Reseña:{text[:1500]}` directo) y **🟡 RAG de 2º orden** (`rag_context_helper.py`): texto de conversación/reseña/`external_*` indexado se propaga a futuros system prompts (`asistente_engine.py:1212`, `conversation_engine.py:582`). **Inyección indirecta:** mete una instrucción en una reseña/mensaje, que se indexe en `dmx_embeddings`, y verifica si contamina el prompt de otro usuario. Confirma filtro por `tenant_id`/`user_id_owner`.
- **🟢→eleva si aplica: Bulk ingest / OCR** (`bulk_ingest_engine.py:211`, `extraction_engine`): documento subido (OCR no confiable) → prompt de extracción.

**Tarea 1.4.B — El Cerebro como amplificador de acciones (P0).** El Cerebro ejecuta acciones reales vía `executors.py` (llama `lead_enrichment_engine`, `buyer_score_engine`, `forecast_engine`, `avm_public_engine`, `fit_engine`, `risk_score_engine`, escribe memoria). Pregunta de oro: **¿puede una inyección de prompt de cualquier superficie de 1.4.A encadenarse hasta disparar un ejecutor del Cerebro con efecto real cross-tenant?** Verifica las 3 capas fail-closed de `guardrails.py` (§H). Confirma que `HARD_DELICATE` **nunca se automatiza** y `effective_needs_approval` respeta el piso `HARD_DELICATE` incluso con la "confianza que se gana" al máximo (esto es fail-CLOSED obligatorio, §I). Re-corre `cerebro_redteam_test.py` (16 ataques) y confirma VERDE; añade ataques nuevos para los ejecutores `buyer.*` recién surfaceados (Tandas 20-38) y para el cable `on_deal_closed` (disparado por `PATCH` de etapa de contacto — prueba que A no lo dispare sobre un deal de B). `CEREBRO_ENABLED` está OFF en prod, pero audita como si estuviera ON (es flag de deploy, no de código — TIPO FLAG-OFF no degrada la severidad de seguridad).

**Tarea 1.4.C — Salida LLM renderizada / exfiltración.** Verifica que ninguna respuesta del LLM (Atlax, Copilot, broker) se renderiza como HTML sin sanitizar (XSS). Confirma que el prompt no contiene secretos que el LLM pueda ser inducido a repetir, y que `services/llm_guard.py` (`send_with_timeout`, `within_budget`) **no falle-abierto en presupuesto** de forma que permita abuso de costo ilimitado (DoS económico vía Atlax público sin auth — esto es fail-CLOSED obligatorio §I; prueba rate-limit en `/api/asistente/*`).

### 1.5 Validación cruzada con reglas de negocio (fugas disfrazadas de lógica)

- **Regla pool DMX (§G.b):** lead de marketplace SIN asesor → pool `dmx_root`, **NUNCA al dev**. Se VIOLÓ en Tanda 29 y se revirtió en Tanda 30. Re-verifica (re-leído en vivo) que no regresó: el dev/propiedad queda como metadato `about_developer_id`, nunca como `owner`. Un dev viendo un lead que no le toca es fuga cross-tenant disfrazada de feature (rompe-ciclo: sí).
- **Regla 1-asesor-por-mismo-proyecto + entity resolution** (§G.c, `entity_resolution_engine.py`, 6 checks en `POST /api/cita`): verifica que los mensajes de disputa son genéricos (no filtran nombre del asesor/proyecto del competidor = fuga de inteligencia competitiva cross-tenant) y que el check de similarity (≥85% → `under_review`) no se puede abusar para enumerar leads existentes de otros (oráculo de existencia).

### 1.6 Red Team White-Box — Cadenas de Ataque Encadenadas

Entrega cadenas **encadenadas y completas** (no hallazgos sueltos), cada una anclada a OWASP **Web Top 10**, **API Security Top 10** y **LLM Top 10**, con: (a) precondición, (b) pasos numerados, (c) payload literal, (d) impacto, (e) severidad P0/P1, (f) fix recomendado. Genera los payloads para correr **contra STAGING, NUNCA producción** — cada cadena lleva `[SOLO STAGING]` y, donde mute datos, instrucciones de rollback. Cadenas mínimas:
1. **Endpoint-abierto → IDOR → volcado cross-tenant** (API1 BOLA + API3): endpoint de reporte/CRM/cubo que tome `project_id`/`org_id`/`lead_id` del request sin pasar por `user_dev_ids`/`assert_*`; auth de A → request con id de B → volcado de leads/operaciones/dinero de B.
2. **Mass-assignment de `role`/`tenant_id` → escalada** (API3/API5 + Web A01): asesor → `PATCH` perfil con `{"role":"superadmin"}` o `{"tenant_id":"otra_org"}` → god-view o salto de tenant.
3. **NoSQL injection en búsqueda → auth/filter bypass** (API8 + Web A03): `{"$ne":null}` en email/id de búsqueda o login → bypass de filtro de tenant o enumeración.
4. **Prompt-injection indirecta (RAG 2º orden) → exfiltración cross-tenant** (LLM01 + LLM06): instrucción en reseña/conversación → se indexa en `dmx_embeddings` → contamina prompt de Atlax/broker de otro usuario → exfiltra datos de otro tenant o dispara tool.
5. **Prompt-injection → cadena de tool-call → ejecutor Cerebro con efecto real** (LLM01 + LLM07 Excessive Agency): vía DISC inferencer / conversación, induce un tool-call que el parser ejecute → verifica si allow-list + `HARD_DELICATE` lo detienen; si no, P0.
6. **DoS económico sobre Atlax público** (API4 + LLM10): flood a `/api/asistente/*` sin auth → agota presupuesto LLM (`within_budget` fail-open) → confirma rate-limit.
7. **Secreto en bundle / historial git → toma de credencial** (Web A05/A07): extrae cualquier `REACT_APP_*` sensible o secreto en historial git → úsalo contra la API.

**→ PAUSA: presenta el censo de tenant (1.1.A), las 5 entidades atacadas (1.1.B), el mapa IA (1.4) y las 7 cadenas. Reporta "N hallazgos · N con cita re-confirmada en vivo (100%)". Actualiza Ledger. Espera OK.**

═══════════════════════════════════════════════════════════════════
BLOQUE 2 — AUDITORÍA TÉCNICA (ARQUITECTURA · BACKEND · DATOS · DEUDA · CALIDAD)
═══════════════════════════════════════════════════════════════════

> **Regla de oro:** todo hallazgo usa el formato canónico (0.4.9) con sus etiquetas obligatorias (`[YA-CERRADO/REGRESIÓN/NUEVO]` + TIPO + PORTAL + ¿ROMPE-CICLO?) y se reporta por **clase-raíz** (§D), no por síntoma hermano. Asume cierta la doctrina del seed (§C). Entrega cuatro sub-bloques (2.1-2.4), cada uno con su checklist marcable `[ ]`, su tabla de hallazgos y un veredicto honesto al cierre. Rutas absolutas y nombres reales.

### 2.1 Arquitectura Real (Grafo de Dependencias · Mapa de Capas · Flujo E2E · Módulo-Dios Medido · DOC-vs-CÓDIGO · Veredicto)

- [ ] **Grafo de dependencias REAL como artefacto (no prosa).** Corre un import-graph sobre `backend/` (`pydeps`, o `grep -rE "^(from|import) " backend/` agregado a un grafo). Entrega: **ranking por fan-in** (nº de módulos que lo importan = el más peligroso de tocar) y **ranking por fan-out** (nº de módulos que importa = el que más acopla). El **módulo-Dios se NOMBRA por `fan-in × fan-out` medido, no por hipótesis** — corre el grafo, ordena, y el centro de gravedad es el resultado, no los candidatos del prompt. Reporta los top-10 de cada eje + dependencias circulares reales (ciclos `routes/`↔`services/`↔`*_engine.py`).
- [ ] **Mapa de capas en ASCII** de las capas reales y su dirección de dependencia: `routes/` (214) → `services/` (54) → `*_engine.py` (168) → `cerebro/` (9) → datos (Mongo + seed `data_developments.py`). Marca con flechas qué llama a qué. Señala **violaciones de dirección** (router que importa otro router, motor que importa un service de aplicación, service que importa rutas).
- [ ] **Flujo E2E del click al dato y de vuelta, para 3 features representativas**, con archivos y líneas reales re-leídas:
  1. **Registro de lead/cita** (`POST /api/cita`): frontend → router → `entity_resolution_engine.py` (6 checks en orden: exact-match 409 → similarity ≥85% `under_review` → velocity ≥5/30min → geo → cross-project → success) → escritura en `db.leads`/`db.asesor_contactos` → ruteo al pool (`house_pool_engine.py::pick_house_asesor`, orden zona→carga→cierres) → respuesta. **Verifica §G** (lead sin asesor → pool `dmx_root`, NUNCA al dev; no regresó la violación de Tanda 29).
  2. **Valuación pública (AVM)** (`/api/avm/...` o widget `/widget/bank-avm`): click → router público → `avm_feature_engine`/`avm_public_engine`/`avm_explain_engine` → ¿de dónde saca las ventas? **Verifica que cuente ventas reales desde `units_history`, NO desde el estatus seed** (§D.1, helper `data_doctrine.has_real_sales(db)`) → respuesta + explicación.
  3. **Una acción agéntica del Cerebro**: trigger → `orchestrator.py::run_goal` → plan → `guardrails.py::authorize` (3 candados §H) → `executors.py` (motor con fallback fail-open) → memoria gobernada (`memory.py`, `redact_pii`) → respuesta. Confirma el gate `CEREBRO_ENABLED`.
- [ ] **Módulo-Dios (confirmado por el grafo, no a priori).** Cruza el top del grafo con tamaño (`wc -l`). Candidatos a contrastar: familia `dev_batch1..19`, `superadmin_devmaster.py`, `studio_landing_engine.py` (1582+), `asistente_engine.py`, `executors.py` (38KB). Por cada uno confirmado: ¿cuántas responsabilidades mezcla? ¿debería partirse?
- [ ] **DOC-vs-CÓDIGO como tabla obligatoria de primera clase.** El repo tiene ~40 docs `memory/*.md` que pueden estar mintiendo (§J). Barre: por **cada afirmación canónica de los docs que toque seguridad / dinero / tenant**, verifícala contra código vivo y márcala **VERDADERO / OBSOLETO / CONTRADICHO** (0.4.R13). Caso obligatorio sembrado: docs dicen `dmx_house`, código resuelve `dmx_root` (§G.a, `routes/inmobiliaria.py::_resolve_inmobiliaria_id`) → CONTRADICHO. Mínimo 8 afirmaciones verificadas, priorizando las de mayor consecuencia (pool/tenant/dinero/flags).
- [ ] **Veredicto de columna vertebral.** Sin rodeos: ¿patrón consistente (router fino → service → engine → datos) o cada módulo improvisa? Cita `tenant_scope.py` como evidencia de intento de columna vertebral y mide qué % de routers la adopta vs. reimplementa el filtro local (usa el conteo de Línea-Base 0.5).

**Tabla 2.1-grafo:** `| Módulo | fan-in | fan-out | fan-in×fan-out | wc -l | ¿módulo-Dios? | responsabilidades |`
**Tabla 2.1-doc:** `| Afirmación del doc | doc origen | archivo:línea código | VERDADERO/OBSOLETO/CONTRADICHO |`

### 2.2 Backend a Fondo (Router por Router · Motor por Motor · Datos · Negocio · Respuesta · Errores)

No revises 214 routers en prosa: **construye una tabla-matriz** y rellénala por muestreo dirigido + grep, priorizando dominios sensibles (leads, citas, dinero, superadmin god-view, públicos sin auth).

- [ ] **Router por router (matriz).** Por cada router (agrupado por dominio): **¿Exige auth?** (rojo a todo router que mute estado sin auth; Atlax `/api/asistente/*` es público por diseño — confirma `PUBLIC_TOOLS`) · **¿Valida rol?** · **¿Filtra tenant?** (CON vs SIN filtro; casos SIN filtro conocidos a confirmar en vivo: `dev_batch7.py:345`, `rag_engine.py:307`, `superadmin_devmaster.py:45,449,664,819,1156` god-view legítimo, `pipeline_migration_script.py:57`, `studio_landing_engine.py:1582`; marca cada scan: legítimo o fuga IDOR) · **¿Forma de respuesta consistente?**
- [ ] **Motor por motor — callsite real o huérfano, con TIPO.** Por cada uno de los 168: (a) ¿callsite real (router/service/`executors.py`) o huérfano?; (b) ¿qué lo alimenta (colección/seed/otro motor/externa)?; (c) **TIPO (0.4.10): CABLE-ROTO (código muerto/firma rota) vs FLAG-OFF (vivo, apagado) vs ESPERA-DATOS (correcto, dormido)**. Cruza con `DEV_HIDDEN_FEATURES_MAP.md` (10 motores sin pantalla dev, 27 endpoints huérfanos). Confirma si `apify_trends_engine` está stubbeado.
- [ ] **Capa de datos: consistente o improvisa.** ¿Capa de acceso común o cada router hace `db.X.find` directo? Mide cuántos routers usan `tenant_scope.py` vs. reimplementan el filtro (Línea-Base 0.5). Documenta el patrón de adopción real (thin wrappers §E) y cuántos **aún no lo adoptaron**.
- [ ] **Lógica de negocio: en rutas vs. capa propia.** Detecta routers con negocio gordo embebido (cálculos, reglas, LLM en el handler). La regla canónica vive en `entity_resolution_engine.py` (bien); busca el anti-patrón opuesto (reglas críticas hardcodeadas en un handler de `dev_batch*`).
- [ ] **Forma de respuestas API.** Cuantifica los formatos que conviven (objeto plano vs `{items:[...]}` vs lista cruda vs `{data,meta}`). Reporta inconsistencia y propón **un** contrato único (solo diagnóstico).
- [ ] **Manejo de errores: uniforme o ad-hoc.** ¿Handler central o cada router con su `try/except`/status propio? ¿Los 403/404 de IDOR (`assert_lead_owner`, `assert_dev_project`) son consistentes? ¿Hay `except: pass` que tragan errores? **Clasifica cada uno por §I: fail-open OK (cómputo idempotente) vs fail-open PELIGROSO (auth/tenant/dinero/presupuesto).** Confirma que el fail-open de los executors sea intencional y loggeado, no silencio accidental (cruza con conteo de Línea-Base 0.5).

**Tabla 2.2 (routers):** `| Router | Dominio | Auth | Valida rol | Tenant (CON/SIN) | Scan global legítimo? | Forma respuesta | Hallazgo | Etiquetas(0.4.9) |`
**Tabla 2.2 (motores):** `| Motor *_engine.py | Callsite o HUÉRFANO | Qué lo alimenta | TIPO{CABLE-ROTO/FLAG-OFF/ESPERA-DATOS} |`

### 2.3 Modelo de Datos Mongo Schemaless (Forma · Tipos Mixtos · Refs Huérfanas · Sin Validación · Colecciones Muertas/Duplicadas)

Concéntrate en las más referenciadas (`leads` 383 · `users` 235 · `developments` 114 · `appointments` 98 · `asesor_contactos` 88 · `projects` 64 · `audit_log` 62 · `cube_aggregations` 58 · `units` 51 · `ie_scores` 49).

- [ ] **Forma inconsistente.** Para `db.leads` y `db.asesor_contactos` (los dos universos §F), documenta la forma real esperada de cada uno y dónde divergen. El puente es **email** (JOIN frágil sin FK: `advisor.py:537-541`). Marca este JOIN como **riesgo arquitectónico estructural**: ¿qué pasa si dos leads comparten email, o un email cambia?
- [ ] **Tipos mixtos del mismo campo.** Clase-raíz conocida (§D.2, confirma que no haya hermanos vivos): score-key (`score_total` vs `score_numeric`, 12+ hermanos, tier "F" a todo). Busca otros: ¿`price` string vs número? ¿`emails` string vs array? ¿IDs `ObjectId` vs string? ¿fechas ISO-string vs `datetime`?
- [ ] **Referencias huérfanas.** FKs lógicas a docs inexistentes: `lead.assigned_asesor_id`→`db.users`? `lead.project_id`→`developments`/`projects`? `appointment.lead_id`? Para el estado-final, define qué integridad referencial DEBE validarse en escritura antes de prod.
- [ ] **Ausencia de validación de schema.** ¿JSON Schema validators de Mongo (probablemente ninguno)? ¿Pydantic en escritura consistente o cada `insert_one` mete lo que sea? Para `leads`, `appointments`, `transactions`, `asesor_operaciones` (dinero/citas/leads): ¿qué campos son obligatorios de facto en lectura pero no se garantizan en escritura? Esta es la **fuente raíz de los bugs latentes** (§C) — documéntala como tal.
- [ ] **Colecciones muertas/duplicadas (clase-raíz "nombre leído mal", §D.3).** Ground truth: 43 sin escritor, 18 con gemelo lleno. Pares conocidos: `behavioral_tracking_events`→`behavioral_events`, `zones`→`dim_zones`, `properties`→`dmx_units`. Tabla completa **colección-leída → colección-real-con-datos**; marca `[YA-CERRADO]` (re-verificado) vs `[NUEVO]`/`[REGRESIÓN]` + TIPO. Distingue de las 25 colecciones inertes sin gemelo (P2.7, TIPO ESPERA-DATOS — no bug de nombre). De las ~390 totales (~100 con datos): ¿cuáles muertas (candidatas a borrar) vs. dormidas-por-falta-de-dato?

**Tabla 2.3:** `| Colección | Forma esperada vs real | Tipo mixto? (campo) | Refs huérfanas | Validación en escritura? | Gemelo lleno / Muerta / Dormida | Etiquetas(0.4.9) |`

### 2.4 Deuda + Calidad (Duplicación · Código Muerto · Archivos-Dios Top 10 · Cables Rotos · TODO/FIXME · Build+Lint · Tests)

Cada hallazgo lleva conteo y archivo, no adjetivos. Reusa la Línea-Base (0.5) como punto de partida cuantitativo.

- [ ] **Duplicación de lógica crítica (auth/tenant/validación).** Conteo de copias divergentes de `_tenant()`/`_user_dev_ids()` vivas en `dev_batch*.py`/`developer.py` que no sean thin-wrappers (Línea-Base 0.5). Repite para: validación lead-owner (¿todos usan `assert_lead_owner`?), resolución de colonia (¿resolvedor canónico quita-acentos o parsers ad-hoc?).
- [ ] **Código muerto.** Funciones públicas sin callsite (cruza con motores huérfanos 2.2), imports sin usar, ramas inalcanzables, scripts one-off committeados (`pipeline_migration_script.py` y similares). **TIPO obligatorio: muerto-de-verdad (CABLE-ROTO) vs apagado-por-flag (FLAG-OFF) vs dormido (ESPERA-DATOS).**
- [ ] **Archivos-Dios Top 10.** Los 10 más grandes de `backend/` por `wc -l`, con responsabilidad y veredicto de partir — **cruza con el grafo de 2.1** (tamaño es proxy débil; fan-in×fan-out manda). Lo mismo para `frontend/src/` (pages-Dios).
- [ ] **Cables rotos front↔back (conteo por categoría):** **Huérfanos** (§N; decide por cada huérfano real: exponer/borrar/dejar como deep-link intencional) · **Fantasma** (`fetch`/`axios` a endpoints que el BE no expone) · **Muertos** (endpoints que ningún FE llama; algunos son API pública/widgets legítimos) · **Forms sin lógica** (`onSubmit` que no pega/no persiste) · **Mismatch** (payload FE ≠ BE; §L reportó 0 drifts — confirma si sigue en 0 o hay `[REGRESIÓN]`).
- [ ] **Features apagadas tras flag o sin ruta.** Inventaria flags y estado real (TIPO FLAG-OFF, no son bugs): `CEREBRO_ENABLED` (solo `.env.local`, OFF en prod), `agentic_enabled=False` (29 endpoints `/api/agentic-crm/*` con paneles FE hechos), `REACT_APP_DEV_V2` (ON local), `LEADS_V2`, los 3 flags gitignored del rediseño asesor (default OFF), `FEATURE_GATING_ENFORCED` (fail-open — clasifícalo por §I). Por cada flag: ¿qué prende, documentado, prender es deploy o código? Esto **alimenta el rediseño** (Bloque 4).
- [ ] **TODO/FIXME/HACK.** `grep -rn "TODO\|FIXME\|HACK\|XXX\|HARDCODE" backend/ frontend/src/`; conteo total + top-20 por severidad (dinero/tenant/seguridad primero).
- [ ] **Build + lint.** Backend: `py_compile`/import-check de los 593 módulos (§L — verifica). Frontend: `yarn build` + `yarn lint`; pega conteo de errores/warnings (Línea-Base 0.5). Doctrina: código nuevo en cero warnings; **NO barrido masivo** de los ~284 históricos.
- [ ] **Tests + las 3-5 piezas críticas sin test.** Inventaria los tests (`cerebro_redteam_test.py` — 16 ataques, gate del flag; ¿qué más?). Nombra las 3-5 piezas más críticas SIN test y por qué duelen: candidatos → los 6 checks de `entity_resolution_engine.py`, `house_pool_engine.py::pick_house_asesor`, el CAS anti-doble-venta, `assert_lead_owner` (IDOR), `data_doctrine.has_real_sales`. Prioriza por "qué se rompe en silencio con dato real".

**Tabla 2.4:** `| Categoría | Conteo | Archivos top | Ejemplo (archivo:línea) | TIPO | Acción (exponer/borrar/test/refactor) | Etiquetas(0.4.9) |`

**Cierre Bloque 2 — veredicto técnico honesto (≤10 líneas):** (1) ¿columna vertebral o archipiélago? (2) ¿el mayor riesgo es arquitectura, datos o deuda? (3) ¿qué % del backlog es `[YA-CERRADO]` re-descubierto vs `[NUEVO]`? (4) **separa siempre CABLE-ROTO (bug) de FLAG-OFF/ESPERA-DATOS (no bug)** — el módulo no sobra de features, sobran ESCONDIDAS (§M). (5) go/no-go ya emitido: **núcleo LISTO salvo infra** — si tu auditoría lo contradice, justifícalo con archivo:línea re-leído o no lo afirmes.

**→ PAUSA: presenta 2.1-2.4 con sus tablas (incluido el grafo de dependencias y la tabla DOC-vs-CÓDIGO) y el veredicto. Reporta "N hallazgos · N con cita re-confirmada en vivo (100%)". Actualiza Ledger. Espera OK.**

═══════════════════════════════════════════════════════════════════
BLOQUE 3 — PERFORMANCE Y ESCALA A 10,000 USUARIOS CONCURRENTES
═══════════════════════════════════════════════════════════════════

> **Primero declara los supuestos de infra, o el veredicto es inventado.** "Techo real" es incomputable sin saber el entorno. Antes de cualquier hallazgo, declara explícitamente los supuestos de despliegue (réplicas de backend, RAM/CPU por instancia, tamaño del pool de conexiones Mongo, ¿Mongo standalone o replica-set?, ¿un solo proceso uvicorn o gunicorn con N workers?). Si no puedes leerlos del repo (`Dockerfile`, `docker-compose`, `Procfile`, config de uvicorn/gunicorn, `MONGO_*` env), declara el supuesto que usas y márcalo como tal. El SLA objetivo: **p95 < 500ms en lecturas, error rate < 1%, bajo el mix realista** (~70% marketplace público sin auth, ~20% comprador, ~8% asesor, ~2% dev/superadmin). Recuerda §C: hoy todo corre sobre seed/colecciones vacías, así que casi todo cuello de botella es LATENTE — no descartes un hallazgo porque "ahora va rápido".

- [ ] **N+1 queries y fan-out por request.** Endpoints que iteran resultados y disparan una query por ítem (loops sobre `leads`/`asesor_contactos`/`units`/`appointments` con `find_one` adentro). Atención al puente "dos universos" por email (§F, `advisor.py:537-541`) y al ruteo del pool (`house_pool_engine.py::pick_house_asesor`, cruza `asesor_profiles`, `visit_requests` abiertos y `asesor_operaciones` por cada lead). Marca cada uno N+1 confirmado o no.
- [ ] **Índices faltantes — contra la lista REAL de índices (0.3), no inferida.** Para las 10 colecciones más referenciadas, lista los campos sobre los que se filtra/ordena en caliente y crúzalos con los índices reales extraídos en el Ledger (`getIndexes()`/`create_index`). Prioridad máxima a tenant/ownership en CADA request: `leads.{dev_org_id, inmobiliaria_id, user_id, email}`, `asesor_contactos.{owner_id, emails}`, `units.project_id`, `appointments.{owner,asesor}`, `audit_log.{tenant_id, ts}`. Un full-scan sin índice sobre `db.leads` a escala = incidente P0.
- [ ] **Full-collection scans sin scope ni paginación.** Evidencia a re-leer: `dev_batch7.py:345` (cap 10000, sin tenant), `rag_engine.py:307` (`limit(10000)` global), god-views `superadmin_devmaster.py:45,449,664,819,1156`, `pipeline_migration_script.py:57`, `studio_landing_engine.py:1582`. Por cada uno: ¿legítimo (god-view/job offline) o bomba a escala que debe paginarse/scopearse? Barre además TODO endpoint que devuelva listas sin `limit`/`skip`/cursor (Mis Leads, Contactos, Operaciones, `/marketplace`, SEO `/colonia/:slug`).
- [ ] **Cómputo caro recalculado sin caché.** Los 168 motores son el mayor riesgo de CPU: AVM/hedonic, scores (`buyer_score_engine`, `zone_score_engine`, `ie_scores`), forecast/FSD, `live_pulse_engine`, `absorcion_engine`. Identifica cuáles se computan sincrónicamente dentro del request HTTP vs. se leen de colección materializada (`ie_scores`, `cube_aggregations`) o caché. Señala dónde un score que cambia poco se recalcula en cada pageview público (marketplace, ficha, widgets embed `/widgets/{score,risk,avm}/:slug`) — eso tumba el CPU primero bajo el 70% de tráfico público.
- [ ] **Falta de jobs en background.** ¿La materialización del cubo (`cube_aggregations`, hoy congelado en seed) corre como job o inline? Lista todo trabajo pesado que debería ser background/cron y hoy bloquea el request: reentrenos del Cerebro (`coach.py`, AVM por zona), `apify_trends_engine`, generación Studio (`studio_*_engine`, imágenes `gpt-image-1`), envío masivo de notificaciones, ingesta RAG. ¿Existe cola/worker real o todo vive en el ciclo de request de FastAPI?
- [ ] **Bundle frontend pesado / sin code-splitting.** Mide el bundle de producción y confirma lazy-loading por ruta. Con ~84 superadmin, ~38 dev, ~38 asesor, ~10 comprador + público, el riesgo es que el anónimo (70%) descargue JS de portales que nunca verá. Reporta tamaño total, si `App.js` hace imports estáticos vs `React.lazy`, los chunks más pesados, y si el marketplace arrastra código de portales autenticados. Lighthouse sobre `/`, `/marketplace`, `/propiedad/:id`.
- [ ] **Costo y rate-limit de LLM a escala.** Con ~50 motores que llaman LLM (Sonnet 4.5 vía `EMERGENT_LLM_KEY`; OpenAI para embeddings/visión/imagen) y Atlax PÚBLICO sin auth (`asistente_engine.py:1181`), modela costo y rate-limit a 10k concurrentes. ¿Aguanta `services/llm_guard.py` un pico público? Ojo: fail-open en presupuesto = bajo abuso el gasto NO se frena solo (§I, fail-CLOSED obligatorio). Estima costo/hora del peor caso de Atlax público, si hay rate-limit por IP/sesión, y si los embeddings RAG (`rag_engine.py`, cosine in-memory sobre `dmx_embeddings`) escalan o explotan en RAM.
- [ ] **Script de carga en `/load-tests/` (ENTREGABLE, no sugerencia).** k6 o Locust versionado, listo para STAGING (nunca prod), con 3 escenarios: (a) marketplace anónimo — `/`, `/marketplace`, `/propiedad/:id`, Atlax `/api/asistente`; (b) asesor autenticado — login + Mis Leads + Contactos + detalle de lead; (c) dev autenticado — dashboard + ProyectoDetail + un motor de inteligencia. Rampa hasta 10k VUs, thresholds (p95 < 500ms lecturas, error rate < 1%) y nota de cómo apuntarlo a staging con credenciales de prueba.

**Cierre Bloque 3 (obligatorio):** con los supuestos de infra declarados arriba, declara el **TECHO ACTUAL** (orden de magnitud de concurrentes que la arquitectura aguanta hoy con datos reales) y **QUÉ SE CAE PRIMERO** en orden (ej. "1º CPU por scores recalculados en marketplace público → 2º Mongo por scan sin índice en `db.leads` → 3º gasto LLM de Atlax sin rate-limit → 4º RAM por embeddings in-memory"). Sin supuestos declarados + veredicto, el bloque está incompleto.

**→ PAUSA: presenta supuestos de infra, hallazgos de performance, el script de carga y el veredicto techo/qué-se-cae. Actualiza Ledger. Espera OK.**

═══════════════════════════════════════════════════════════════════
BLOQUE 4 — REDISEÑO FRONT / UX / UI (PROPOSITIVO, NO SOLO AUDITAR)
═══════════════════════════════════════════════════════════════════

Aquí NO diagnosticas pasivamente: **propones el rediseño que sube el nivel.** Para cada problema entregas: cómo debería verse, por qué mueve la aguja, qué cuesta. Trabajas sobre `frontend/src/` (4 portales + marketplace), respetando que el backend ya está auditado y SÓLIDO (§L) — el valor está en cómo se ve y se usa, no en romper contratos FE↔BE (0 drifts, no introduzcas ninguno).

### Tesis Rectora: El Mejor ROI Es Despertar Lo Apagado, No Inventar Pixeles

El repo no sufre de pocas features, sufre de features ESCONDIDAS (§M). 168 motores y 214 routers, pero el FE expone una fracción. **Surfacear bien una feature que ya existe en backend es 10x más barato y valioso que diseñar algo nuevo.** Por cada propuesta de pantalla nueva, justifica primero por qué no bastaba con exponer algo que ya corre (TIPO FLAG-OFF de 0.4.10). Arranca por ahí: lee `DEV_HIDDEN_FEATURES_MAP.md`, cruza las huérfanas (§N) contra `navByRole.js`/`navByRoleV2.js`.

### 4.1 Sistema de Diseño — Auditar y Unificar

Haz cumplir los fragmentos canónicos, no los reinventes: **`.dmx-card`** en `index.css` (toda tarjeta: borde + hover que eleva + glow discreto) · tokens de tema asesor (`asesor-aurora.css`, `.portal-asesor` fuente única en `PortalLayout`, candado `check-asesor-theme.sh`; superadmin oscuro NO se toca) · flags de tema/rediseño (`REACT_APP_DEV_V2` ON local, `REACT_APP_SIDEBAR_V2`, `LEADS_V2` default OFF).

Entregables: **Inventario hardcodeo vs tokens** (barre `frontend/src/` por hex/font-size/spacing hardcodeados; lista los 20 peores con conteo + token que los reemplaza; NO barrido masivo de los 284 warnings históricos — limpiar al avanzar) · **Componentes duplicados a unificar** (botones, modales, tablas, badges de estado/semáforo, sparklines, tarjetas de métrica, estados vacíos; por cada familia, UN componente canónico + dónde vive + call-sites a migrar; prioriza la **tarjeta de métrica con fusión dato+tendencia+semáforo** — patrón núcleo del rediseño Dev, `DEV_PASO_C_DESIGN_DOCTRINE.md` y `DEV_FICHA_HOME_SPEC.md` — y los **badges de estado** Nueva/En curso/Resuelta) · **Consistencia de patrones** (divergencias entre portales que deberían ser idénticas: loading, error 403, vacío, breadcrumb, sidebar activo).

### 4.2 Revisión Por Portal — Pantalla Por Pantalla (formato ANTES/DESPUÉS obligatorio)

Usa el mapa real (`App.js`, `portalForRole:431`). No inventes pantallas: parte del diseño existente y dale upgrades de valor (el founder rechazó 3 rewrites desde cero — PARTIR del original y mejorarlo). **Toda propuesta de rediseño de pantalla se entrega en formato ANTES/DESPUÉS: ASCII del layout ACTUAL al lado (o encima) del PROPUESTO. Un mockup sin el "antes" no prueba que mejora nada — solo describe una pantalla.** Por CADA pantalla evalúa las **6 dimensiones**: (1) **Jerarquía visual** (¿el dato que mueve la aguja arriba o enterrado? catálogo por rol en `DEV_PASO_C_DESIGN_DOCTRINE.md` y `DEV_VALUE_THESIS.md`); (2) **Estados de cada fetch** (loading=skeleton no spinner desnudo · vacío=copy humano + acción siguiente, no "No data" · error=incluido el 403 cross-tenant, con dignidad; con DB vacía §C los estados vacíos son LO QUE VES EN VIVO — diséñalos de verdad, 0.4.R14); (3) **Consistencia** (`.dmx-card`, tokens, componentes canónicos de 4.1); (4) **Accesibilidad** (contraste AA, focus visible, teclado completo, tap targets ≥44px, alt, labels, headings); (5) **Responsive** (móvil/tablet/desktop de verdad); (6) **Lenguaje humano** (cero jerga, flujo obvio; lo técnico chico/abajo/colapsado: "Sala de Control de Agentes"→"Tu asistente", "Espera tu OK"→"Tu turno").

**Cobertura mínima por portal** (las huérfanas a auditar están en §N — no las re-enumeres, refiérete a §N):
- **Asesor** (~40 rutas): Inicio/CommandCenter, MisLeads (estándar de oro de detalle — referencia para los demás), Contactos, Citas, Operaciones, Studio (hub+director+6 tools), Conversaciones, Asistente (SalaControl/TuEspejo del Cerebro). Audita las huérfanas de §N: exponer en nav o retirar (regla `feedback_no_orphan_features`).
- **Developer** (~38 rutas, `REACT_APP_DEV_V2` ON): Dashboard/Inicio (cockpit cross-proyecto "¿qué hago hoy?", `DEV_VALUE_THESIS.md`), MisProyectos/ProyectoDetail (ficha-home con corona del Cerebro + 4 categorías ~13 indicadores, spec OFICIAL `DEV_FICHA_HOME_SPEC.md`), CRM (+funnel/sala-control/métricas-equipo), Mercado, BattleCard, Pricing+Lab, Demanda. Huérfanas de §N: exponer o retirar.
- **Superadmin** (~84 rutas, oscuro): rol SOLO auditoría + exponer huérfanas, NO rediseño desde cero (es la "terminal Bloomberg CDMX" vendible). Foco en las 12 huérfanas de §N (terminales de inteligencia ya construidas sin nav: el ROI es exponerlas).
- **Comprador** (~10 rutas): **caso crítico — el portal entero NO tiene sidebar nav propio** (§N); las 10 pantallas se alcanzan solo por links internos del CompradorDashboard. Propón la navegación del portal como pieza de mayor impacto. El Asistente agéntico (6 ejecutores `buyer.*`) ya surfaceado — verifica que se vea como asistente, no como debugger.
- **Marketplace público** (sin auth): core, SEO programático, tools T0, widgets embed. Jerarquía visual, velocidad percibida y accesibilidad importan el doble (cara pública + motor SEO). Atlax debe sentirse confiable y humano.

### 4.3 Doctrina DMX "Simple Pero Hermoso" — 4 filtros

Todo lo que propongas pasa: (1) **Flujo obvio** sin tutorial; (2) **Lenguaje de persona normal** (lo técnico chico/abajo/colapsado); (3) **Centro de mando, no tabla plana** (referencia: Mis Leads del asesor — cada elemento es un componente con dato fusionado tu-dato+mercado, tendencia/sparkline, semáforo y puerta a profundizar); (4) **Hermoso al detalle** (`.dmx-card`, sin warnings de consola en lo que toques). El valor está en **fusionar TU dato con MERCADO** (6 mezclas en `DEV_VALUE_THESIS.md`: sellout-vs-entrega, precio-vs-AVM/DRPI, demanda-viva-LivePulse, vs-competidores-BattleCard, embudo real, jugada de mayor palanca What-if).

### 4.4 Entregables Concretos

**A. Mockups ASCII ANTES/DESPUÉS de las 5 pantallas de mayor impacto** (por palanca, una por audiencia), cada una con el layout ACTUAL y el PROPUESTO lado a lado: (1) **Dev — ProyectoDetail** (corona Salud-del-activo + "la jugada de hoy" del Cerebro con Aprobar/Editar/Rechazar + 4 categorías; spec `DEV_FICHA_HOME_SPEC.md`); (2) **Asesor — Inicio/CommandCenter** (cockpit "¿qué hago hoy?" + jugada del Cerebro + leads calientes + Tu Espejo); (3) **Comprador — navegación del portal + Dashboard** (resolver portal-sin-nav; Asistente visible como asistente); (4) **Superadmin — exposición de una terminal huérfana** (ej. `/superadmin/system-map` o `/rag-inspector`: cómo entra al nav y se lee); (5) **Marketplace — ficha de desarrollo `/desarrollo/:id`** (jerarquía pública, confianza, CTA, Atlax humano). Para cada mockup: layout antes+después, jerarquía, los 3 estados (loading/vacío/error) de al menos una zona de datos, copy humano real (no lorem), y qué motor/endpoint lo alimenta (nombre real: `avm_public_engine`, `live_pulse_engine`, `battle_card_engine`, `cerebro/orchestrator.py`).

**B. Tabla de mejoras priorizadas por pantalla:** `| Portal | Pantalla | Mejora propuesta | Tipo (surfacear-apagado/fix-UX/a11y/rediseño) | Impacto (alto/medio/bajo) | Esfuerzo (S/M/L) | Motor/endpoint que la alimenta | Flag que la gobierna |`. Ordena por impacto/esfuerzo descendente. Las filas **surfacear-apagado** dominan la cabeza (mejor ROI por tesis). Toda fila a11y nombra el criterio concreto. Si depende de prender un flag de deploy, dilo en la columna Flag.

**C. Resumen de 5-8 líneas** en lenguaje de founder (§O): qué está bien hoy, las 3 jugadas de mayor palanca del rediseño front, y qué decisión de flag/deploy desbloquea el mayor valor sin tocar código.

**Restricciones inviolables:** NO rompas el contrato FE↔BE (si una pantalla pide un dato que el endpoint no devuelve, anótalo como gap, no improvises el shape) · NO rediseñes superadmin desde cero (solo audit + exponer huérfanas) · NO propongas Pull de GitHub ni asumas emergent (§J) · respeta los flags (se PRENDEN en deploy, no se hardcodean ON) · verifica en la app real en `localhost:3000` con flujo completo, entendiendo que ves estados vacíos/seed (0.4.R14) · NO escribas reportes `.md` con los hallazgos (van en tu respuesta, §O).

**→ PAUSA: presenta los 5 mockups ASCII ANTES/DESPUÉS, la tabla priorizada y el resumen de founder. Actualiza Ledger. Espera OK.**

═══════════════════════════════════════════════════════════════════
BLOQUE 5 — RE-ARQUITECTURA TOTAL (VISIÓN OBJETIVO + MIGRACIÓN INCREMENTAL)
═══════════════════════════════════════════════════════════════════

DMX nació *vibecoded*: 214 routers, 168 motores, 54 services y ~390 colecciones crecieron sin columna vertebral deliberada. Funciona, pero el acoplamiento está regado: el aislamiento multitenant vive copiado, las queries a Mongo se escriben crudas en los handlers, y la lógica de negocio se mezcla con el transporte HTTP. Tu trabajo NO es reescribir el repo. Es: (a) describir la arquitectura objetivo, (b) probar la brecha con evidencia real (re-leída), (c) trazar la migración por slices que nunca rompa lo que ya pasó QA, (d) nombrar los módulos-Dios (usando el grafo de 2.1, no a priori) y abstracciones faltantes, (e) anclar el norte IA-first con el Cerebro como motor central gobernado. Cada propuesta lleva **impacto / esfuerzo / por qué importa para escalar sin colapsar**. La re-arquitectura es la capa *estructural* que la auditoría de bugs no tocó (§K) — NO re-reportes lo ya cerrado. Cita archivo:línea reales re-leídos.

### 5.1 Describir la Arquitectura Objetivo

Sistema de capas limpias y dependencias unidireccionales (presentación → API → servicios → datos; nunca al revés ni saltando capas). Con nombres concretos del repo:
- **Capa de datos / repositorios.** Hoy Mongo se toca crudo desde los handlers (`db.leads` ×383, `db.users` ×235; ej. `dev_batch6.py:126`, `advisor.py:537`). La capa objetivo encapsula cada colección de alto tráfico (`leads`, `users`, `developments`, `appointments`, `asesor_contactos`, `projects`, `units`) detrás de un repositorio con métodos de negocio (`LeadsRepo.for_owner(owner_id)`, `LeadsRepo.house_pool()`) donde NINGÚN filtro de tenant se escribe a mano. Define qué entra al repo (todo acceso a `db.<colección>`) y qué queda prohibido fuera (queries crudas en routers/motores). El repo absorbe los dos universos de leads (§F) detrás de una interfaz que los reconcilie en un punto único.
- **Capa de servicios / negocio.** Las reglas de dominio (6 checks de `entity_resolution_engine.py`, reparto del pool `house_pool_engine.py::pick_house_asesor` orden zona→carga→cierres, scoring) viven en services orquestables, sin saber de `Request`/`Response` ni Mongo directo. Distingue service (wiring, `backend/services/` 54) de engine (cómputo ML puro, 168 en raíz).
- **Capa de API delgada.** Los 214 routers quedan en: parsear input, llamar UN service, serializar salida, mapear errores a HTTP. Cero negocio, cero query cruda, cero re-implementación de tenant-scope.
- **Aislamiento multitenant en UN choke-point obligatorio (la pieza más importante).** Ya existe `tenant_scope.py` (§E), creado porque había copias divergentes con fuga. Pero la adopción es por convención (thin wrappers); nada IMPIDE escribir una query sin scope (prueba viva: scans sin tenant en `dev_batch7.py:345`, `rag_engine.py:307`). **El objetivo: que el scope sea estructuralmente imposible de olvidar**, no recordable. Propón el mecanismo (repositorio tenant-aware que reciba el `user` y aplique `tenant_of`/`user_dev_ids` SIEMPRE; y/o un decorador/dependencia obligatoria de tenant-scope sobre cada endpoint no-público que **falle-CERRADO** si el handler intenta una query cruda, §I). Conserva la cascada de 4 niveles y el fallback acotado; lo que cambia es que dejen de ser opcionales.
- **Cliente HTTP y manejo de errores comunes.** Ya hay wrapper para LLM (`llm_guard.py::send_with_timeout`, timeout 25s + presupuesto), pero los errores HTTP y códigos (403/404/409 de `assert_lead_owner`, 409 del registro de leads) están dispersos. Define un manejador de errores central (excepción-de-dominio → status HTTP) y un cliente único saliente, de modo que timeout/reintento/presupuesto/logging vivan en un solo lugar reutilizable por los ~50 motores que llaman LLM.
- **Superficie IA gobernada con frontera de confianza y allow-list por rol.** El patrón correcto YA existe y debe volverse el estándar (§H): el chokepoint real es la allow-list de acciones/tools, no la sanitización. El objetivo: toda nueva superficie IA pasa obligatoriamente por allow-list por rol + tenant-scope antes de ejecutar cualquier acción con efecto real (envíos/dinero/firmas → `HARD_DELICATE` con OK humano, fail-CLOSED §I). Frontera de confianza explícita: input de usuario y datos externos (RAG 2º orden, persona por tenant, email entrante) pueden alterar *texto de salida* pero NUNCA *acciones*.

### 5.2 Mapear la Brecha (Real → Objetivo) con Evidencia

Tabla brecha-por-brecha, cada fila: síntoma · evidencia (archivo:línea re-leído) · capa violada · impacto al escalar. **Separa explícitamente brecha estructural (esta sección) de bug latente (ya cubierto §K), para no duplicar trabajo cerrado.** Mínimos obligatorios:
- **Sin capa de datos.** 383 refs crudas a `db.leads`, 235 a `db.users`, 114 a `db.developments`. Impacto: imposible cambiar de motor de datos, indexar consistentemente o garantizar scope; cada colección nueva multiplica los call-sites.
- **Tenant-scope por convención, no por estructura.** Existe el canónico pero su uso es opt-in; los scans sin scope (`dev_batch7.py:345`, `rag_engine.py:307`) demuestran que nada lo fuerza. Impacto: una query nueva mal escrita = fuga cross-tenant (ya pasó).
- **Dos universos de leads sin reconciliación de primera clase** (§F). Impacto: el puente frágil de email se rompe con datos reales y duplica lógica de lectura.
- **Divergencia doc↔código del tenant de la casa** (§G.a). Acción: una constante única `DMX_HOUSE_ORG` (ya en `house_pool_engine.py:26`) debe ser el único literal; prohibir el string suelto.
- **Routers como módulos-Dios** (los que el grafo de 2.1 confirme, no a priori). Impacto: el cambio más pequeño obliga a tocar archivos de miles de líneas con tres responsabilidades.
- **Manejo de errores y códigos HTTP dispersos.** Impacto: contrato de error inconsistente entre los 214 routers.

### 5.3 Estrategia de Migración Incremental (Explícitamente NO Big-Bang)

El repo está en `dev-redesign-tandas` con checkpoints `checkpoint-tanda*` y go/no-go salvo infra. Una reescritura total lo destruiría. Migración **por slices, ordenada por dependencias y riesgo, sin romper lo verde**:
- **Principio rector:** *strangler fig* — capa nueva al lado de la vieja, migra un slice, verifica, retira lo viejo de ese slice. Los 593 módulos que hoy importan limpio son una invariante a preservar en cada slice.
- **Orden por riesgo (menor a mayor blast-radius):**
  1. **Slice 0 — `LeadsRepo`.** Envuelve `db.leads` + `db.asesor_contactos` con tenant-scope obligatorio (reusando `tenant_of`/`assert_lead_owner`). Migra primero un solo portal (comprador, universo `db.leads` puro).
  2. **Slice 1 — Decorador/dependencia de tenant-scope obligatoria** sobre `/desarrollador/*` (donde estuvo la fuga histórica), apoyado en Slice 0.
  3. **Slices 2..N — Una familia de routers a la vez** (empezar por la más acoplada con mayor ROI según el grafo; `dev_batch*` candidato natural). Extraer negocio a service, datos a repo, dejar el router delgado.
  4. **Slice final — Superadmin y rutas god-view** al último: god-view legítimo (`superadmin_devmaster.py`), su scope es "todo" por diseño; tocarlas temprano agrega riesgo sin ROI.
- **PRUEBA DE NO-REGRESIÓN EJECUTABLE POR SLICE (no "criterios en prosa").** Cada slice entrega el **comando/grep/test concreto** que prueba (a) y (b), porque "Done = QA verde" es inauditable y "Done = `grep -rn 'db.leads' routes/ → 0 hits fuera de LeadsRepo`" es verificable. Big-bang se previene con **gates ejecutables**, no con buena intención. Mínimo por slice:
  - (a) **Cero queries crudas a la colección migrada fuera del repo:** ej. `grep -rn "db\.leads\." backend/routes/ backend/*_engine.py | grep -v "leads_repo" → 0 hits`.
  - (b) **Lo verde sigue verde:** `py_compile` de los 593 módulos sin error nuevo + `cerebro_redteam_test.py` 16/16 si el slice toca superficie IA + el grep de fuga del Bloque 1 sin nuevos hits.
  - (c) **Tenant-scope estructural:** un test de regresión que pruebe que un endpoint sin scope **falla-cerrado** (§I).
  - (d) Verificación en la app real logueada (localhost:3000, estados vacíos/seed §C, 0.4.R14).
  - (e) Cero warnings nuevos en el código tocado + un checkpoint git por slice (espejo de `checkpoint-tanda*`).
- **Prohibiciones:** NO fusionar las 3 colecciones de pipeline (distintas por diseño; se unifica la *vista*, no el almacenamiento — `ASESOR_B7_REDESIGN_PLAN.md`) · NO tocar el tema oscuro de superadmin · NO mover carpetas por gusto · NO prender flags como parte de la re-arquitectura (es deploy del founder).

### 5.4 Módulos-Dios a Descomponer y Abstracciones Faltantes

**Módulos-Dios a descomponer** (los que el grafo de 2.1 confirme por fan-in×fan-out, cada uno con impacto/esfuerzo): contrasta familia `dev_batch1..19`, `executors.py` (38KB, llama ~10 motores crudos con fallback fail-open — candidato a apoyarse en services), `asistente_engine.py` (system prompt ~355 líneas `_system_prompt:102-457`, chat+tools+RAG+persona en un archivo). Descomponer = extraer negocio a services y datos a repos, dejando el orquestador delgado.

**Abstracciones faltantes a introducir:** **Capa de repositorios** (la ausencia más cara, habilita todo lo demás; impacto alto / esfuerzo alto-incremental) · **Decorador/dependencia de tenant-scope obligatoria** sobre `tenant_scope.py` (impacto alto / esfuerzo medio; convierte la regla anti-fuga de "recordable" a "imposible de olvidar") · **Reconciliador de leads de primera clase** (interfaz única sobre los dos universos §F; impacto alto / esfuerzo medio) · **Manejador de errores de dominio central** (excepción → HTTP; impacto medio / esfuerzo bajo) · **Cliente saliente único** (extiende `llm_guard` a toda llamada externa: LLM, OpenAI directo en `rag_engine.py:47`/`photo_tagger.py:126`, conectores `data_sources/`; impacto medio / esfuerzo medio) · **Constante única de tenant de la casa** (`DMX_HOUSE_ORG`, prohibir el literal suelto, alinear docs; impacto bajo / esfuerzo bajo). Cada propuesta declara **por qué importa para escalar**: hoy agregar un portal/colección/endpoint multiplica los call-sites; con estas abstracciones el costo marginal de cada feature baja en vez de crecer.

### 5.5 El Norte IA-First / Agentic Bien Arquitecturado

El Cerebro (E0-E6 completas, hoy apagado por `CEREBRO_ENABLED`) como **motor central gobernado y único**, no como un agente más:
- **Un cerebro, muchos lentes.** El patrón ya existe (§H). El norte: TODA capacidad agéntica de los 4 portales pasa por este orquestador con allow-list por rol, no cada portal cableando su propio agente.
- **El Cerebro consume la capa de servicios, no motores crudos.** Hoy `executors.py` llama motores directo. En la arquitectura objetivo los ejecutores se apoyan en services (que ya combinan repos + reglas + tenant-scope), de modo que el agente hereda gratis el aislamiento y la frontera de confianza. Permite escalar a más acciones sin multiplicar superficie de riesgo.
- **Frontera de confianza como invariante.** `HARD_DELICATE` (envíos/dinero/firmas) nunca se automatiza; el piso se respeta incluso con personalización (`config.py::effective_needs_approval:99`, fail-CLOSED §I). El equipo rojo (`cerebro_redteam_test.py`, 16 ataques verdes) es el gate para prender el flag. La re-arquitectura preserva este gate como parte del criterio de "hecho" de cualquier slice que toque superficie IA (ver 5.3.b).
- **Por qué importa:** el moat de DMX (el "Modelo del Mundo DMX", flywheel de 4 puntas — `DMX_NORTH_STAR_AI.md`) solo es construible si el agente puede crecer en acciones sin que cada acción nueva abra un agujero de tenant o de confianza.

**Cierre Bloque 5:** la re-arquitectura no compite con la auditoría de bugs ya cerrada — la completa. La auditoría dejó el sistema sin bugs latentes conocidos; esta capa estructural lo deja **capaz de crecer sin generarlos de nuevo.** Cada slice entregado baja el costo marginal de la siguiente feature; ese es el único criterio de éxito que importa.

**→ PAUSA: presenta arquitectura objetivo, tabla de brecha, plan de slices con sus gates ejecutables y abstracciones. Actualiza Ledger. Espera OK.**

═══════════════════════════════════════════════════════════════════
BLOQUE 6 — COBERTURA POR PORTAL + ENTREGABLE FINAL (`REPO_PLAN_MAESTRO.md`)
═══════════════════════════════════════════════════════════════════

### 6.1 Cobertura por Portal (Confirmar los 4 Portales + Marketplace COMPLETOS)

No se acepta auditoría parcial. Confirma, con conteo explícito **X/Y pantallas** y **X/Y endpoints revisados**, que recorriste la superficie entera de cada portal. Usa el mapa de rutas reales (`App.js`, `navByRole.js`, `navByRoleV2.js`) como denominador, no el menú visible. Para cada portal reporta: `pantallas revisadas / total`, `endpoints revisados / total` (denominador = los 214 routers), rutas huérfanas confirmadas (§N), rutas rotas/inalcanzables (excluye redirects `<Navigate>` legítimos §N).

Cobertura mínima: **Marketplace público** (~70% del tráfico): core + SEO programático + tools T0 + widgets embed — cero excusas · **Comprador** (~10 rutas, todas huérfanas de sidebar §N — verifica que ninguna quedó inalcanzable) · **Asesor** (~40 rutas V1+V2) · **Developer** (~38 rutas) · **Superadmin** (~84 rutas, 7 tiers + las 12 huérfanas; el riesgo arquitectónico vive en los god-views sin scope).

**Verificación de ciclos cross-portal (arrancan Y cierran).** El valor de DMX está en los ciclos que cruzan portales. Para cada uno traza el flujo E2E y declara si ARRANCA y si CIERRA, con el archivo donde se cose o se rompe (recuerda 0.4.R11: un bug que rompe un ciclo es P0):
- **comprador → inmobiliaria/asesor:** lead nace en `db.leads` y debe llegar a un asesor real. Verifica el puente por email (§F) y el pool. **Regla canónica §G.b:** lead de marketplace SIN asesor → pool `dmx_root` (NO `dmx_house` ni el dev dueño). Confirma `house_pool_engine.py` rutea zona→carga→cierres y que no hay regresión de Tanda 29.
- **dev → leads:** lead/cita de un proyecto scopeado al `dev_org_id`/`project_id` correcto, visible en el CRM del dev (`dev_batch6.py:126-134` ramifica por rol). Arranca en captura, cierra en la vista del dev sin fuga cross-tenant.
- **lead → asesor (registro de cita):** las 6 validaciones en orden de `POST /api/cita` (`entity_resolution_engine.py`, §G.c) respetan "1 asesor × mismo proyecto, N asesores × proyectos distintos". Confirma que el ciclo cierra (cita creada y asignada) o nombra dónde se rompe.

### 6.2 Entregable Final: `REPO_PLAN_MAESTRO.md`

Cierra TODA la auditoría en un único `REPO_PLAN_MAESTRO.md` en la raíz. Lo lee el founder (no-dev) y también es el plan de acción técnico. No es un volcado de hallazgos: es síntesis priorizada. Contiene, en este orden:
1. **Cobertura lograda — 100% por categoría y por portal.** Tabla con el conteo X/Y de 6.1 (pantallas y endpoints por portal) y por categoría (seguridad, multitenant, performance, datos/seed, IA/LLM, UX/cobertura). El "100%" se afirma solo si las tablas de 6.1 lo respaldan.
2. **Salud general 1-10 con justificación.** Nota global + sub-nota por portal y por categoría, cada una con 1-2 líneas ancladas en evidencia. Punto de partida: §K/§L (P0/P1/P2/P3 cerrados, núcleo SÓLIDO). La nota refleja que la deuda restante es mayormente infra y escala, no corrección de bugs.
3. **Los 3-5 patrones de fondo (§D).** Clases-raíz, no síntomas. Di cuáles SIGUEN abiertas vs cuáles ya se mataron (re-verificado, no por checklist); un patrón mata muchos hermanos — nómbralos así.
4. **Matriz impacto/esfuerzo — 4 cuadrantes.** **Quick-Wins** (alto/bajo) · **Apuestas** (alto/alto) · **Relleno** (bajo/bajo) · **Evitar** (bajo/alto). Concreta: nombre de acción, archivo(s), por qué cae en ese cuadrante.
5. **"Si solo pudiera hacer 5 cosas".** Las 5 acciones de mayor palanca, EN ORDEN, cada una con el porqué en una línea. Debe ser obvio cuál es la #1.
6. **Alertas P0 go/no-go de producción.** Lista corta y binaria: lo que IMPIDE prender en prod a escala real. Separa código de infra del founder (SENTRY_DSN, credencial Mongo solo-lectura, dedup `.env.local`, backups/load-test en staging, flags). Por cada uno: GO o NO-GO y qué falta exactamente.
7. **Riesgos de no actuar si DMX crece.** Qué pasa si llegan datos reales y tráfico sin tocar nada: dónde estalla primero (enlázalo al veredicto "qué se cae primero" del Bloque 3 y a sus supuestos de infra), qué bug latente se vuelve incidente, y qué afirmación de negocio (bancabilidad, índices licenciables $80-120k, "lifts reales" del Cerebro) se cae si sigue parada sobre seed.
8. **Resumen para el founder — máximo 10 líneas, lenguaje de persona normal, CERO jerga (§O).** Sin nombres de archivo ni siglas: en qué estado está la plataforma, qué tan lejos de prod, las 3 cosas que mueven la aguja y la decisión que se le pide. Es lo primero que leerá el founder; va al inicio del documento aunque se redacte al final.

**Regla de oro del entregable:** todo hallazgo lleva archivo:línea re-leído en vivo; toda recomendación cae en un cuadrante de la matriz; nada se reporta como bug nuevo si ya está cerrado y re-verificado en `QA_FIX_CHECKLIST.md`; cada hallazgo de "no funciona" lleva su TIPO (CABLE-ROTO/FLAG-OFF/ESPERA-DATOS, 0.4.10); el documento se afirma "100% cobertura" solo si las tablas de 6.1 lo respaldan; reporta el % final de hallazgos con cita re-confirmada en vivo (debe ser 100%, 0.4.R12).

**→ FIN: entrega `REPO_PLAN_MAESTRO.md` y el Ledger `REPO_COBERTURA.md` al 100%. Espera OK final del founder antes de cualquier fase de fix.**
