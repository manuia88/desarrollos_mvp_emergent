# Auditoría V2 — Pasada 1 (Consolidado del líder)

> Fecha: 2026-06-30 · Alcance: 7 fases de amplitud (multi-tenant, dato honesto/linaje, IA/LLM/agentes, flywheel/financiero/k-anon, superadmin+marketplace, asesor+dev, backend cross-portal datos/lógica/errores, UX/UI). Hallazgos verificados en vivo (curl + Mongo) donde se indica. Este documento confronta y deduplica: varios sub-auditores reportaron el MISMO bug con severidades distintas — aquí se fija la severidad canónica y se marcan los falsos positivos.

## Veredicto del líder

La plataforma está **mejor defendida de lo que su tamaño sugiere**: aislamiento multi-tenant del CRUD sólido (owner_id/tenant_filter fail-closed), AuthN robusta (bcrypt+JWT+revocación+throttle), AuthZ de superadmin sin escalación vertical, guardrails de agentes serios (kill-switch, denylist, ±20%, audit), motor financiero con golden tests reales, y doctrina de honestidad mayormente respetada (esperando-fuente/None, no random/fake en scores).

Los problemas reales se concentran en **tres clusters**: (A) un grupo de **IDOR de escritura cross-tenant** en superficies agénticas/flywheel que SÍ mutan datos compartidos (cube_actions, pricing subagent, /cierre) — el agujero estructural más grave; (B) **CSRF sistémico** (SameSite=None + cero tokens anti-CSRF) confirmado en vivo; (C) **envenenamiento del moat** (señales anónimas forjables + k-anon con garantía falsa en productos vendidos).

### Deduplicación clave (confrontación)
- **cube_actions IDOR** fue reportado 4 veces con severidades dispares: T-01 (ALTO), AG-IDOR-01 (CRÍTICO), CUBE-IDOR-WRITE (ALTO). Es **UN solo bug**. Severidad canónica fijada en **CRÍTICO**: escritura cross-tenant y cross-destino verificada en vivo, persiste string arbitrario (XSS almacenado), y es el núcleo del flywheel agéntico (moat). Consolidado en **C-01**.
- **/api/buyer/mi-gusto sin auth** (T-02) y **visitor_id forjable** (MKT-01, FLY-02) son facetas del mismo problema raíz: *visitor_id es un secreto bearer cliente, no firmado*. Se mantienen como hallazgos separados por remediación distinta (mi-gusto = lectura de perfil; signal = envenenamiento de escritura) pero comparten el fix de fondo (HMAC del visitor_id).
- **No-falsos-positivos confirmados**: T-03/T-04 (DELETE 200 vs 404, $in en respuesta) son cosméticos reales, no brechas — se conservan como BAJO. Los "114 endpoints superadmin sin gate" del scan estático fueron **FALSOS POSITIVOS** (helpers locales envuelven require_superadmin); se documenta abajo para que Pasada 2 no los re-persiga.

---

## Tabla de hallazgos (ordenada por severidad)

| ID | Sev | Dimensión | Ubicación | Impacto | Remediación (resumen) |
|----|-----|-----------|-----------|---------|------------------------|
| **C-01** | 🔴 CRÍTICO | IDOR write cross-tenant / agentes | `backend/activacion.py:59-61` · `routes/cube_inbox.py:47-54,117-124` | Cualquier dev/asesor muta el estado de CUALQUIER cube_action (otro tenant, otro destino, incl. marketplace público) con string arbitrario. Verificado en vivo (XSS almacenado). Sabotea el buzón agéntico = núcleo del moat. | `update_one` debe filtrar por `{id, destino, owner/tenant}`; validar `estado` contra enum; 404 si matched==0; idealmente estado per-usuario. |
| **C-02** | 🔴 CRÍTICO | IDOR write cross-tenant / pricing | `routes/subagents.py:85-108,147-240` · `sub_agents/pricing_agent.py:407-519` | Una desarrolladora corre `/pricing/analyze` sobre proyecto AJENO (sin check de pertenencia); `/apply` solo valida `org_id` del doc que ella creó → escribe el precio público de una unidad de otro tenant (±20%, repetible). Verificado: pedregal-brutalist-01A bajó 19.8M→15.84M. | `guard_project` ANTES de `analyze`; en `apply` revalidar `guard_project`+`_assert_unit_in_dev` sobre la unidad destino antes de escribir el override. |
| **C-03** | 🔴 CRÍTICO | Flywheel / envenenamiento cross-tenant | `routes/copiloto_flywheel.py:173-194` → `record_closing` → `market_comps_closings`+`closing_lifts` → `visitor_taste.py:216` | Cualquier asesor autenticado registra un cierre con `dev_id` arbitrario y `price_closed` sin cota → envenena el AVM por colonia y re-entrena el ranking global del comprador. Verificado: cierre 'altavista-polanco' por $999,999,999 → ok. | Verificar ownership del lead/dev vs el asesor; acotar `price_closed` (Field ge/le); derivar el cierre SOLO de operación marcada GANADA por el dueño; validar dev_id contra catálogo. |
| **CSRF-01** | 🟠 ALTO | CSRF | `routes/auth.py:32` (SameSite=None) · `server.py:111-119,1248-1296` (sin middleware CSRF) · ~15 archivos `request.json()` | Cookies SameSite=None+Secure en prod + cero tokens anti-CSRF. Mutaciones con auth por cookie disparables cross-site. Verificado: `/asesor/autopilot/pause` y `/run-now` y `PATCH unit-status` ejecutan con `Content-Type: text/plain` + Origin malicioso. Toca dinero/operación (precios, leads, autopiloto). | Double-submit token O SameSite=Lax + validar Origin/Referer en middleware para métodos mutantes cuando la auth viene de cookie. Rechazar content-type no-json donde se espera JSON. Cubrir multipart. |
| **AVM-CONF-01** | 🟠 ALTO | Dato honesto | `avm_public_engine.py:25-59,110-125` | AVM público SIEMPRE devuelve `pricing_model='heuristic'`, `confidence='media'` HARDCODEADO sobre seed `price_m2_num`; los 393 hedonic_models tienen `available:False`/`sample_size:0`. 'media' sobrevende certeza de un seed×heurística. | Cuando es heurístico, degradar confidence a 'baja'/'referencial' y exponer `fuente='heuristico_seed'`/`es_estimado:true`. No mostrar 'media' hasta ≥30 transacciones reales. |
| **LEAD-TIER-JOIN-02** | 🟠 ALTO | Linaje / fuente-única | `advisor.py:429-437,563-574,810-830` · `auth.py:196-209` | Tier del lead sale de JOIN `contactos.emails[0]→users.email→buyer_scores` case-sensitive. OAuth (auth.py) y create_contacto escriben email RAW; lectura asume minúsculas → write-X/read-Y: TODOS los leads quedan 'cold' silenciosamente al primer registro con mayúsculas. | Normalizar `.lower().strip()` en TODAS las escrituras (OAuth, magic-link, create/update_contacto); colación case-insensitive; JOIN sobre todos los emails, no solo [0]. |
| **LLM-INJ-01** | 🟠 ALTO | LLM / inyección indirecta | `agentic_crm/argumentario_engine.py:330-340,398-405,555-611` | `lead_name` + historial de mensajes que el lead escribió a Atlax entran CRUDOS al prompt del argumentario (sin `sanitize`/`wrap_untrusted`) → inyección lead→copiloto del asesor (altera scripts, inyecta tel/links falsos, exfiltra prompt). | `sanitize_user_input(lead_name)`, `wrap_untrusted` del historial, `safe_system_boundary()` al system prompt. Reusar el módulo `llm_safety` ya existente. |
| **LLM-INJ-02** | 🟠 ALTO | LLM / frontera de confianza | `asistente_engine.py:1107-1257` · `routes/asistente.py` | El Atlax PÚBLICO real (cableado a `/api/asistente`) NO importa `llm_safety`: user_message y RAG/contexto externo se concatenan sin wrap/sanitize. Asimetría vs `atlax_engine` que SÍ los aplica. Acotado por PUBLIC_TOOLS (no exfiltra CRM) pero permite jailbreak/fabricación al comprador. | `sanitize_user_input(msg,1000)`, `wrap_untrusted` del RAG, `safe_system_boundary()`. 3-4 líneas reusando módulo existente. |
| **LLM-GND-01** | 🟠 ALTO | LLM / grounding | `studio_buyer_copy_engine.py:133-160,142` | Copy de venta que VE el comprador no tiene candado 'no inventes amenidades/precios'; contexto default es placeholder con precio/entrega concretos → alucina amenidades/precios en marketing público (engaño + exposición legal). Otros engines SÍ tienen el candado. | Añadir 'usa EXCLUSIVAMENTE datos provistos; NO inventes amenidades/precios/m2/fechas'. Sin context_extra real, degradar a copy sin cifras. |
| **FLY-02** | 🟠 ALTO | Flywheel / anti-spam | `routes/buyer_signals.py:104-168` · `services/ratelimit.py:28-38` | `/api/buyer/signal` anónimo acepta visitor_id arbitrario; rotando ids+IPs se fabrican likes/searches que inflan demanda/social-proof/grafo (data B2B vendida). Único freno: rate-limit por IP en-proceso (no compartido, sin dedup/bot-detection); `ip_hash` se guarda y nunca se usa. | Bot-detection: límite por `ip_hash`, plausibilidad (n visitors/ip), señales cuentan tras filtro de cordura, firmar visitor_id (HMAC), rate-limit en Redis. |
| **KAN-01** | 🟠 ALTO | K-anon / re-identificación | `grafo_comprador_engine.py:40,276-306` → `public_api_v1.py:318-330` (enterprise) | El k-anon solo anula el PRODUCTO de la celda; sigue exponiendo `demanda_total`/conteo-por-segmento/`segmento_dominante` con n=1, en un producto VENDIDO. k=3 declarado es garantía FALSA (cubre 1 dimensión). | Gatear TODAS las dimensiones bajo K canónico (5): suprimir conteos/segmento sub-K o agregar a banda; importar `K_ANON_MIN` de anonymization_engine. |
| **KAN-02** | 🟠 ALTO | K-anon / endpoint público | `routes/buyer_signals.py:544-608` | `/api/buyer/demanda-mapa` SIN auth devuelve `searches_count` raw por colonia sin k-gate (solo filtra ==0). Colonias con 1 búsqueda (Santa Fe, Anzures) expuestas en mapa público → re-identificación gratis para competidores. | k-gate: omitir colonias con raw<5 o reportar en bandas (bajo/medio/alto). |
| **LEAD-01** | 🟠 ALTO | Robo de leads / race | `routes/house_leads.py:208-220` | `asesor_claim` hace check-then-update NO atómico: dos asesores pasan el check antes de escribir → last-write-wins, ambos creen tener el lead. Viola '1 asesor por solicitud'. Contraste: `outbound_claim` SÍ es CAS. | CAS: `update_one({id, assigned None}, ...)`, si `modified_count!=1` → 409. No leer-y-luego-escribir. |
| **CSRF-NO-TOKEN-MUTACIONES** | 🟠 ALTO | CSRF (asesor/dev) | `server.py:1248-1296` · `auth.py:32,144` | *(Misma raíz que CSRF-01, eje asesor/dev)* PATCH unit-status con cookie + Origin malicioso → 200. Confirma que CSRF aplica a TODA mutación dev/asesor (cerrar venta, etapa, precio). | Consolidar con CSRF-01: SameSite=Lax o middleware Origin/Referer + token. |
| **MOMENTUM-SEED-03** | 🟡 MEDIO | Dato honesto | `data_seed.py:12...` · `zone_cycle_engine.py:43` · `dmx_indices_engine.py:118-152` | `momentum` de 16 colonias es string seed ('+3%'); IPV/ICO lo consumen y se etiquetan 'real' sin flag. Indicadores 'vivos' anclados a demo. | Etiquetar momentum `fuente='seed'`; propagar a IPV/ICO (degradar a 'mixto' como IDM). Reusar live_pulse/MOM cuando exista. |
| **OVR-KEY-SUBAGENT-04** | 🟡 MEDIO | Linaje / fuente-única | `routes/subagents.py:191,200` · `developer.py:991,1001` | `developer_unit_overrides` tiene 2 convenciones de llave (`{unit_id}` vs `{dev_id,unit_id}`) sobre índice único en `unit_id`. El upsert de pricing NO captura `DuplicateKeyError` → la mutación de dinero puede fallar con 500 silencioso. | Unificar llave a `{unit_id}` o capturar DuplicateKeyError (espejo de developer.py:1000-1004). |
| **CSRF-02** | 🟡 MEDIO | CSRF / multipart | `documents.py:245,674,899,1003` · `ie_engine.py:566` · etc. | Uploads multipart (content-type 'simple', sin preflight) + SameSite=None → CSRF de subida/borrado de documentos dirigido al tenant víctima. | Defensa CSRF de CSRF-01 también en multipart (no confiar en preflight). |
| **MKT-01** | 🟡 MEDIO | AuthZ / integridad | `routes/buyer_signals.py:104-157` | *(Faceta de FLY-02)* upsert de like/save por `{visitor_id,type,entity}` con visitor_id 100% cliente → falsificar el taste de otra persona / spam masivo del cubo. | Firmar visitor_id (HMAC/cookie httpOnly) y validar en signal; atar visitor_id↔ip_hash en upserts de estado. |
| **AG-MONEY-01** | 🟡 MEDIO | Agentes / guardrail dinero | `routes/subagents.py:176-209` | ±20% es POR-apply sobre el precio vigente (base móvil), sin tope acumulativo ni cap diario → 3 applies ≈ -49%. El 'límite duro' anunciado es falsa sensación. | Anclar ±20% a precio de referencia (lista original/mediana comparables); cap diario por unidad leyendo price_events. |
| **LLM-PII-01** | 🟡 MEDIO | LLM / PII | `argumentario_engine.py:558-559` · `lead_enrichment_engine.py` · `visit_auto_prep.py` | Nombre/ID/teléfono/email/historial de leads van a Anthropic sin minimización ni flag de consentimiento. `anonymization_engine` existe pero no se aplica. Riesgo LFPDPPP. | Minimizar (primer nombre/seudónimo, nunca tel/email salvo necesario); documentar propósito/retención; reusar anonymization_engine. |
| **LLM-RL-01** | 🟡 MEDIO | LLM / rate-limit por tenant | `routes/argumentario.py` · `copilot.py` · `whatsapp_copiloto.py` · `narrative.py` | Endpoints LLM sin `within_budget`/`track_ai_call`/rate-limit propios (grep=0). `within_budget` es opt-in por call-site; solo el kill-switch es universal → DoS económico. | Garantizar `within_budget`+rate-limit+`track_ai_call` por endpoint; centralizar vía `send_with_timeout(db=,tenant_id=)`. |
| **KAN-03** | 🟡 MEDIO | K-anon / constante canónica | `anonymization_engine.py:18` (=5) vs `grafo:40`/`terminal:24`/`buyer_signals:267` (=3) | La 'fuente única' K=5 se ignora; 3 sitios hardcodean 3 justo en los productos vendibles. `/snapshot` usa k=5, `/demand` no → enforcement asimétrico. | Importar `K_ANON_MIN` en grafo/terminal/interes; aplicar `check_k_anonymity` uniforme en todos los `/api/v1/zones/*`. |
| **LEAD-02** | 🟡 MEDIO | Robo de leads / cross-house | `lead_journey_engine.py:261-297` | `outbound_claim` es atómico (bien) pero `inmobiliaria_id` es opcional: si resuelve None/'' el CAS reclama sin filtro de casa → claim cross-house. | Exigir `inmobiliaria_id` no vacío; si no resuelve, 403 en vez de claim sin filtro. |
| **FIN-01** | 🟡 MEDIO | Financiero / float | `inversion_v4_finance.py` (todo) · `advisor.py:3134-3138` | Dinero como float en todo el stack (cero Decimal). Tolerable para TIR/AVM, pero comisión/splits/IVA en float+round → riesgo de centavos en liquidación. | Usar Decimal+quantize para money math liquidable (comisiones/splits/IVA); float OK para analytics. |
| **FLY-03** | 🟡 MEDIO | Flywheel / gaming comisiones | `advisor.py:155-166,3127-3160` | `valor_cierre`/`comision_pct` auto-reportados por el asesor sin cruce con precio de unidad → gaming de KPIs/ranking; si alimenta cubo/AVM, sesga agregados. | Cruzar valor_cierre vs precio de unidad (±X%), marcar outliers; validar comision_pct vs blueprint del dev. |
| **CUBE-IDOR-WRITE** | 🟡 MEDIO | Lógica | *(Duplicado de C-01)* | — | Ver C-01. |
| **ERR-DETAIL-LEAK** | 🟡 MEDIO | Errores / info-disclosure | ~155 sitios: `subagents.py:106`, `documents.py:370`, `ie_engine.py:721`, etc. | `raise HTTPException(5xx, f"...{e}")` reexpone mensajes internos de Mongo/FS/cifrado al cliente. Sin exception_handler global. | log.exception + mensaje genérico ('Error interno · ref <uuid>'); `app.exception_handler(Exception)` global. |
| **REGEX-INJECTION** | 🟡 MEDIO | Lógica / ReDoS | `public.py:1074` (no-auth) · `advisor.py:767-769` · `feature_visibility.py:121` | Input de usuario en `{'$regex': v}` sin `re.escape` → ReDoS (CPU spike) y match no intencionado. public.py:1074 alcanzable sin auth. | `re.escape()` + acotar longitud; helper `safe_regex(s)` centralizado. |
| **AUDIT-SILENT-SWALLOW** | 🟡 MEDIO | Errores / forensia | `dev_batch4_2.py:83-87` · `dev_batch4_4.py:58-62` | Escrituras de auditoría (incl. `permission_denied_attempt`) en `try: ... except: pass` sin log → si log_mutation falla, el rastro forense de seguridad desaparece silenciosamente. | `except Exception as e: log.warning(...)` + métrica; no romper request pero no ser invisible. |
| **PERM-FAILOPEN-IMPORT** | 🟡 MEDIO | Lógica / fail-open | `dev_batch4_4.py:312-330,446-452` | Gate de permiso (`can_view_full_client_data`/`can_view_ai_summary`) importado en try con `except ImportError: pass` → si el import falla, el control de acceso se OMITE (sirve PII del lead). | Import al top del módulo; si defensivo, fail-CLOSED (`except ImportError: raise 403`). |
| **RAW-JSON-NOSCHEMA** | 🟡 MEDIO | Lógica | 30+ endpoints `await request.json()` sin Pydantic | Type-confusion/input no acotado a la lógica/DB (caso explotable: cube estado). Superficie sin contrato. | Migrar endpoints mutantes a modelos Pydantic con Field constraints; priorizar los que escriben estado. |
| **SLOTS-PROJECT-NO-OWNERSHIP** | 🟡 MEDIO | AuthZ / scoping | `dev_batch4_1.py:788-829` | `configure_slots` escribe `project_slots` con `project_id` del path sin verificar pertenencia; lector público filtra solo por project_id → un dev contamina la agenda de citas de un proyecto ajeno. | `guard_project` antes de escribir; lector filtra por `dev_org_id` dueño. |
| **MKT-02** | 🟢 BAJO | AuthZ / abuse | `routes/public.py:2449-2466` | Lead-magnet `/registro-interes` sin rate-limit → spam de la cola de leads. | Aplicar `services.ratelimit.allow(...)` + captcha/honeypot. |
| **AUTHN-01** | 🟢 BAJO | AuthN | `server.py:27` | `JWT_SECRET` cae a secreto efímero si falta env; mitigado por `_prod_env_guard` solo si prod está declarado explícitamente. | Hacer JWT_SECRET obligatorio salvo `DMX_DEV_MODE=true`; raise en vez de fallback. |
| **OBS-01** | 🟢 BAJO | AuthZ / higiene | `documents.py` (prefijo `/api/superadmin/`) · `public.py:948` vs `dmx_indices.py:274` | (a) ~35 endpoints `/api/superadmin/documents*` accesibles a developer_admin (naming engañoso). (b) `/superadmin/shf/refresh` definida 2 veces (shadowing del gate). Hoy ambos gateados. | Renombrar prefijo documents a `/api/dev/documents`; eliminar la ruta shf duplicada. |
| **LEAD-OWNER-DEMO-BYPASS** | 🟢 BAJO | IDOR / fail-open demo | `tenant_scope.py` (assert_lead_owner) | Leads SIN dueño accesibles cuando `DMX_DEV_MODE=true` (42/51 ownerless en demo). En prod fail-closed. | Garantizar DMX_DEV_MODE jamás true en prod; seedear leads con dueño. |
| **FIN-02** | 🟢 BAJO | Financiero / IRR | `inversion_v4_finance.py:23-51` | IRR por bisección devuelve la PRIMERA raíz en flujos no convencionales (multiplicidad) sin advertir. Bajo (flujos típicos convencionales; existe MIRR). | Detectar >1 cambio de signo → preferir/mostrar MIRR o marcar 'TIR no única'. |
| **FIN-03** | 🟢 BAJO | Financiero / golden | `tests/test_inversion_v4_finance.py` · `golden_calibration_engine.py` | Golden cubre terreno, NO TIR/flujo end-to-end ni AVM/comisión → deriva de fórmula podría pasar tests. | Añadir golden de TIR/flujo y de AVM (rango esperado por colonia) cuando exista dato F2/F3. |
| **T-03** | 🟢 BAJO | Consistencia respuesta | `advisor.py:1408-1419` | DELETE de contacto ajeno → 200 `{ok:false}` (no-op aislado) mientras GET/PATCH → 404. Oráculo débil, no brecha. | Devolver 404 cuando matched==0 (alinear con GET/PATCH). |
| **T-04** | 🟢 BAJO | Higiene respuesta | `buyer_signals.py:280-289` → `visitor_taste` | `/mi-gusto` devuelve el filtro Mongo crudo `visitor_id:{"$in":[...]}`. Cosmético, sin fuga de aislamiento. | Devolver visitor_id string plano en build_visitor_taste. |
| **COMISION-DEFAULTS-05** | 🟢 BAJO | Dato honesto | `advisor.py:163` · `golden_calibration_engine.py:42` · `investment_simulator_engine.py:581` · `dev_batch11.py:327` | Default de comisión difiere por módulo (4.0/3.0/2.0/5.0%). El cierre real usa el pct capturado (consistente); solo el default mostrado confunde. | Centralizar un default único o etiquetar cada contexto (comercialización vs venta secundaria). |
| **T-02** | 🟢 BAJO→MEDIO | Privacidad comportamiento | `buyer_signals.py:280-289` | `/api/buyer/mi-gusto` devuelve perfil de gusto granular (zonas, techo de precio, amenidades) solo con visitor_id, SIN auth → perfilado de demanda ajena por quien intercepte el id. *(Sube a MEDIO por exponer presupuesto.)* | Atar a sesión/cookie httpOnly firmada; no aceptar visitor_id de query cuando hay cookie; HMAC. |
| **N1-LEAD-COUNTS** | 🟢 BAJO | Datos / N+1 | `dev_batch4_2.py:362-372` · `casamentera.py:95` | N+1 acotado (paginado/batch). Bajo impacto. | Reemplazar por una aggregation `$group` / `find({id:$in})`. |
| **LLM-NO-TIMEOUT** | 🟠 ALTO | Errores / DoS | `llm_client.py` (~97-122) · 87 archivos con `.send_message()` crudo | Cliente Anthropic/OpenAI sin `timeout=` ni `wait_for`; solo ~11 usan `send_with_timeout`. Un LLM colgado ocupa un worker ~600s → agotamiento de recursos bajo carga. | Pasar `timeout=` al construir el cliente en `llm_client.py` (protege a TODOS sin tocar 87 archivos) + acotar max_retries. |

> **Falsos positivos descartados (no perseguir en Pasada 2):** "114 endpoints superadmin sin gate" del scan estático (usan helpers `_auth`/`_require_superadmin` que envuelven `require_superadmin`; verificado con curl: 403 en todos salvo `/documents` que es by-design dev+tenant-scoped). Igual los `~78 find/find_one con id-param sin guard central` resultaron casi todos con filtro inline `owner_id/_tenant`. `STUB-HONESTO-09` (UnitDrawerContent 'IA deshabilitada temporalmente') es un stub honesto **correcto**, no bug.

---

## FIXES PRIORITARIOS (orden de ataque)

Atacar en este orden: primero los 3 CRÍTICOS de escritura cross-tenant (comparten patrón: *gate de rol presente, gate de pertenencia ausente*), luego la familia CSRF (un solo middleware cubre casi todo), luego honestidad/grounding (riesgo legal/confianza), luego endurecimiento.

### 1. C-01 — IDOR write en cube_actions (CRÍTICO)
- **Archivo:** `backend/activacion.py:59-61` (`actualizar_estado`) + `backend/routes/cube_inbox.py:47-54` (dev), `:117-124` (asesor).
- **Fix:** Cambiar `db.cube_actions.update_one({'id': action_id}, ...)` por `update_one({'id': action_id, 'destino': <destino del portal>, <owner/tenant del caller>}, ...)`. Validar `estado` contra enum `{pendiente,visto,descartado,aplicado}`. Devolver 404 si `matched_count==0`. Pasar `user`/`destino_esperado` desde cada ruta. Mejor: estado per-usuario en colección `cube_action_user_state` keyed por `(action_id, tenant_id)` para no mutar el doc global compartido.

### 2. C-02 — IDOR write en pricing subagent (CRÍTICO)
- **Archivo:** `backend/routes/subagents.py:85-108` (`analyze_pricing`) y `:147-240` (`apply_recommendation`, esp. `:158`, `:191-201`).
- **Fix:** En `analyze_pricing` (y `analyze_marketing`): `await guard_project(db, user, body.project_id, 'subagents/analyze')` ANTES de invocar el agente. En `apply_recommendation`: además del check `org_id`, revalidar la unidad destino con `guard_project(db, user, doc['development_id'], ...)` y `_assert_unit_in_dev(db, doc['development_id'], doc['unit_id'])` justo antes de escribir el override. (Aprovechar para OVR-KEY-SUBAGENT-04 y AG-MONEY-01 en el mismo PR.)

### 3. C-03 — Cierre flywheel sin ownership ni cota (CRÍTICO)
- **Archivo:** `backend/routes/copiloto_flywheel.py:173-194` (endpoint `/api/copiloto/cierre`) + `CierreIn:170`.
- **Fix:** Verificar que `lead_id`/`dev_id` pertenezcan al asesor/inmobiliaria del caller (cruzar `leads.assigned_to`/operaciones cerradas del owner). Acotar `price_closed: float = Field(ge=0, le=10_000_000_000)`. Idealmente derivar el cierre SOLO de `on_deal_closed` (operación GANADA por el dueño), no de un POST con `dev_id` libre. Validar `dev_id` contra el catálogo antes de escribir comps. (Pendiente Pasada 2: robustez del AVM a 1 comp outlier — winsorización/mediana.)

### 4. CSRF-01 / CSRF-NO-TOKEN-MUTACIONES / CSRF-02 — CSRF sistémico (ALTO)
- **Archivo:** `backend/routes/auth.py:32` (SameSite) + nuevo middleware en `backend/server.py:1248-1296`.
- **Fix:** Añadir un middleware HTTP que, en métodos `POST/PUT/PATCH/DELETE` con auth por cookie (no Bearer), valide `Origin`/`Referer` contra la allowlist `_CORS_ORIGINS` **o** exija token double-submit (`X-CSRF-Token`). Cambiar `COOKIE_SAMESITE` a `'lax'` salvo razón cross-site real (confirmar si hay widget embebido). Rechazar content-type no-json donde se espera JSON (forzar preflight). Cubrir también multipart (CSRF-02). Front: emitir cookie csrf no-HttpOnly + reflejar header en los 699 fetch `credentials:include`.

### 5. LLM-NO-TIMEOUT — DoS por LLM colgado (ALTO)
- **Archivo:** `backend/llm_client.py` (~97-122, construcción de `AsyncAnthropic`/`AsyncOpenAI`).
- **Fix:** `AsyncAnthropic(api_key=key, timeout=httpx.Timeout(25.0), max_retries=2)` (y equivalente OpenAI). Un solo punto cubre los 87 callers sin tocarlos.

### 6. AVM-CONF-01 — confidence 'media' falsa (ALTO, honestidad)
- **Archivo:** `backend/avm_public_engine.py:25-59,110-125`.
- **Fix:** Cuando `pricing_model=='heuristic'`, fijar `confidence` a 'baja'/'referencial' y exponer `fuente='heuristico_seed'`/`es_estimado:true`. No 'media' hasta ≥30 transacciones y `r_squared` no-null. Revisar consumidores que propagan 'media' (cma_engine, forecast, battle_card).

### 7. LEAD-TIER-JOIN-02 — JOIN email case-sensitive (ALTO, linaje)
- **Archivo:** `backend/routes/auth.py:196-209` (OAuth) + `backend/routes/advisor.py:810-830` (create_contacto), lectura `:432`.
- **Fix:** Normalizar `email.lower().strip()` en TODAS las escrituras (OAuth, magic-link, create/update_contacto, espejo de `phones_norm`); colación case-insensitive en `users.email`; JOIN sobre todos los emails del contacto.

### 8. LLM-INJ-01 / LLM-INJ-02 / LLM-GND-01 — inyección y grounding (ALTO)
- **Archivos:** `agentic_crm/argumentario_engine.py:555-611`, `asistente_engine.py:1107-1257`, `studio_buyer_copy_engine.py:133-160`.
- **Fix:** Reusar `llm_safety` ya existente: `sanitize_user_input` + `wrap_untrusted` (historial/RAG/inputs) + `safe_system_boundary()` en argumentario y asistente público. En studio_buyer_copy añadir candado 'usa EXCLUSIVAMENTE datos provistos; NO inventes amenidades/precios' y eliminar el placeholder con cifras concretas.

### 9. FLY-02 / KAN-01 / KAN-02 — envenenamiento y k-anon en productos vendidos (ALTO)
- **Archivos:** `routes/buyer_signals.py:104-168,544-608`, `grafo_comprador_engine.py:40,276-306`.
- **Fix:** Firmar visitor_id (HMAC server-side) + bot-detection por ip_hash. Gatear TODAS las dimensiones del grafo bajo K=5 (importar `K_ANON_MIN`), suprimir conteos/segmento sub-K. k-gate en `/demanda-mapa` (omitir colonias raw<5 o bandas).

### 10. LEAD-01 — claim no atómico (ALTO)
- **Archivo:** `backend/routes/house_leads.py:208-220`.
- **Fix:** CAS: `update_one({'id':lead_id, 'assigned_asesor_id': {'$in':[None]}}, {...})`; si `modified_count!=1` → 409 (espejo de `lead_journey_engine.outbound_claim`).

---

## Zonas sospechosas consolidadas (insumo Pasada 2)

**A. Cubo / activación / flywheel (epicentro).**
- Mapear TODOS los lectores/escritores de `cube_actions` (cube_actions_engine, activacion.activar callers) y si superadmin escribe payloads con datos identificables de un dev (pricing/unidad/lead). Probar con MÚLTIPLES tenants reales sembrados (no solo demo) para medir blast radius del cross-read.
- Confirmar k-anon real de TODOS los buzones/listados del cubo (cube_inbox dev/asesor/marketplace, superadmin_demand_intel, terminal_mercado) y que ningún buzón mezcle dato tenant-privado con señal global.
- C-03 cadena AVM: cómo se fusionan `market_comps_closings`+`market_comps` en el AVM/DRPI por colonia y cuánto mueve UNA comp envenenada (¿winsorización/mediana robusta o un outlier domina?). Robustez de hedonic_regression/drpi a outliers.
- `visitor_taste.score_devs`: cuánto pesa `closing_lifts['real']` en el ranking y si un solo cierre falso mueve el orden mostrado; ¿hay piso de n antes de aplicar el lift?
- `demand_twin_engine.build_demand_twin` / `cube_olap` a nivel ENGINE: confirmar que ningún route NO-superadmin importe estos engines y exponga el agregado crudo (grep callers).

**B. CSRF en profundidad.**
- Enumerar EXHAUSTIVAMENTE los ~15 archivos con `await request.json()` (public.py, advisor.py, cube_inbox.py, lead_capture.py, dev_batch1/4_3/5/14/19, b13.py, investment_simulator.py, whatsapp.py, superadmin_demand_intel.py, superadmin_devmaster.py) y confirmar EN VIVO con cookie+text/plain si cada endpoint mutante ejecuta. Foco en cube-actions/estado y mover-lead/etapa.
- **GET-mutación:** grep `@router.get` con `update_one`/`insert_one` en el cuerpo (GET nunca tiene preflight → CSRF trivial).
- `social_ads_oauth.py`/`oauth_calendar.py`: el CSRF state es dict in-memory → en multi-instancia el callback rompe o abre CSRF si hay fallback laxo.

**C. visitor_id como secreto bearer (todo el copiloto de compra).**
- Cómo se genera (cliente plano vs httpOnly firmado); cualquier endpoint que acepte visitor_id por query/body sin sesión hereda T-02/MKT-01. Cubrir buyer_signals, favoritos, swipe, taste, donde-vivir, experiencia-fotos, parecidos-cerraron.

**D. Tokens públicos token-gated.**
- swipe_public.py `/api/swipe/{token}`, dev_batch4_3 `/api/cita/public/{token}` (confirm/cancel/reschedule), dev_batch16 `/book`: auditar entropía/expiración/revocación. Si son cortos/predecibles/no-expiran = IDOR efectivo sobre lead/cita.

**E. LLM / agentes restantes.**
- Inventario motor-por-motor de los ~76 callers LLM sin guard: cuáles en ruta de request síncrona (priorizar timeout) y cuáles meten input de usuario sin sanitizar.
- `whatsapp_copiloto.py:75,87`: ¿AUTO-ENVÍA respuestas LLM a leads sin human-in-the-loop? ¿pasa por NEVER_AUTO/denylist? Vector de mayor riesgo agéntico no auditado.
- `conversation_engine.send_message` (Agent #54): ¿auto-SENDS o sugiere? ¿tope de dinero/descuentos en lo que dice?
- `rag_context_helper` (get_rag_context/get_external_context/get_lead_context): epicentro de inyección indirecta — auditar de dónde sale (reseñas/web/terceros) y qué call-site lo pasa SIN wrap_untrusted.
- `PUBLIC_TOOLS` allow-list de asistente: probar params adversarios por cada tool (reverse_search, generate_narrative, query_avm_estimate, buyer_coach_consult) por si filtran tenant/CRM o ejecutan mutaciones costosas.
- `pricing_agent._layer_llm` incrusta org_id/project_id en system; `get_unit_score` lee `ALL_UNITS` global sin filtro org — confirmar que project_id no es atacante-controlado para pivotar a otra org.

**F. AuthZ horizontal aún sin barrer línea-por-línea.**
- dev_batch10/11/14/15/17, location_intel, lead_enrichment, lead_match: cavar `aggregate()` pipelines con `$match` sin `tenant_filter` (fuga vía agregado).
- `subagents.apply` de marketing/lead: mismo patrón org_id-only sin revalidar pertenencia (marketing solo cambia status hoy, confirmar que no escriba landings/ads cross-tenant).
- `documents.py` `{dev_id}` (upload/bulk-extract/sync-apply/assets): probar developer_admin tenant A vs dev_id de tenant B; verificar cobertura de `_check_dev_access` en TODOS los {dev_id}.
- `get_slot_availability` y lectores de `project_slots`/appointments por project_id sin dev_org_id (dev_batch4_1).
- dev_batch16/dev_batch18: mutaciones con 0 refs de guard en el grep, no inspeccionados.
- Barrido COMPLETO de los 196 paths `/superadmin` con token developer_admin real Y advisor real (descartar 200 inesperado fuera de documents; house_leads/diagnostic dieron 404 — confirmar si están montados).

**G. K-anon / data products.**
- Auditar todos los `/api/v1/*` por tier: strip_pii correcto y ningún endpoint enterprise devuelve micro-data des-anonimizable (re-id por join m2+zona+features).
- `facts_buyer_signals` con solo 9 docs: confirmar que es supresión K-anon (correcto) y no bug de agregación; que el Gemelo/founder_console no presente '9 zonas' como cobertura total.
- `parecidos-cerraron` (sin auth, lee copiloto_closings): k sobre cierres individuales.

**H. Datos honestos / seed servido como real.**
- `data_seed.py` 16 colonias (scores 7 ejes, price_m2_num, inventory, momentum, trend) hardcodeadas sin flag → alimentan AVM, 5 índices DMX, demand_index. Verificar si en prod se reemplazan o el seed demo se sirve como real; revisar /superadmin/granularidad.
- `colonia_stats.demand_index = inventory` MISLABELED (inventory presentado como demanda, default constante 50).
- `hedonic_models` 393 docs `available:False`: confirmar que el dashboard AVM no muestre 393 como 'modelos activos'.
- `developer_unit_overrides`: mapear las ~14 rutas que escriben/leen y confirmar `unit_id` como PK consistente; buscar lector que keyee solo por dev_id (aplicaría override de otro tenant).
- Case-sensitivity de TODOS los JOINs por email Y por colonia (slug vs name) en advisor, favoritos, lead_bridge, casamentera, demand_twin.
- `isr/inversion_v4_tax`: tramos ISR_ANUAL_2026 con comentario 'base 2024' — verificar vs Anexo 8 RMF 2026.

**I. Infra / multi-instancia.**
- Rate-limit en-proceso por worker (no Redis) → límite efectivo ×#workers, debilita TODOS los anti-spam (FLY-02).
- Lista de revocación JWT `_REVOKED_JTIS` per-proceso → ventana de token válido tras logout en multi-instancia.
- `JWT_SECRET` fallback: confirmar que el deploy real entra por `_is_explicit_prod()==True` (si no, AUTHN-01 sube a ALTO).
- `tenant_scope.assert_lead_owner` rama demo: reproducir el 404 inesperado en lead_demo_0 y confirmar fail-closed real en prod; que el match por `inmobiliaria_id=dmx_root` no agrupe orgs distintas.

**J. UX/UI (Pasada 2 de producto).**
- Páginas con loading/404 ambiguo: PropertyDetail (`/propiedad/:id`, default, alcanzable por share) y DevelopmentDetail (?v1=1) renderizan solo '…' — separar estados (DEAD-PAGE-01, MEDIO).
- CTA muerto: 'Agendar visita' de la ficha legacy `dev/Sidebar.js:49` solo hace `alert()` (CTA-DEAD-04, MEDIO).
- **Jerga interna FILTRADA a UI pública (ALTO):** `RiskScoreBreakdown.js:102,110` muestra 'W3.4B','RPP Y2','CENAPRED' a compradores; `ZoneScoreBreakdown.js:14-17` muestra 'Placeholder hasta W3.3','cubo W2.5'; `CMAKpiStrip.js:87` 'Tendencia DRPI'. Limpiar todos los códigos de wave/acrónimos.
- Spinner infinito: `AsesorComisiones.js:16-30` Promise.all sin catch/finally (INF-SPINNER-05, MEDIO).
- Placeholder 'Disponible en Phase 8' en `/desarrollador/mensajes` con flag off; 2 libs titleCase duplicadas (utils vs lib).
- Benchmarks de líder (Pasada 2 producto): marketplace vs Zillow (sort/saved-search/chips removibles/skeletons), ficha vs Airbnb (galería lightbox/escape a vista clásica), CRM asesor vs HubSpot (kanban drag-drop/timeline/bulk-actions en Ficha360 + CrmWorkspaceV2), dashboards dev vs Stripe/Linear ('qué hago hoy' accionable). Verificar claves i18n existentes (no mostrar key cruda).

---

## Conteo por severidad

| Severidad | Conteo (deduplicado) |
|-----------|----------------------|
| 🔴 CRÍTICO | 3 |
| 🟠 ALTO | 11 |
| 🟡 MEDIO | 14 |
| 🟢 BAJO | 11 |

> Nota: cube_actions se cuenta una sola vez como C-01 (CRÍTICO); CUBE-IDOR-WRITE/T-01/AG-IDOR-01 son el mismo bug. CSRF-NO-TOKEN-MUTACIONES se cuenta junto a CSRF-01. T-02 contado como MEDIO (sube por exponer presupuesto).
