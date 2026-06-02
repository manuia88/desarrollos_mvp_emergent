# Cerebro DMX · Roadmap por Etapas (el "departamento muestra": ciclo del lead)
**2026-06-02.** Objetivo: pasar de "AI Agents" a "Agentic AI" construyendo UN ciclo completo
(el del lead) de punta a punta, con gate de verificación por etapa para NO cometer errores.
Doble cierre: (a) empuja cada lead al **cierre de venta** · (b) el loop **se cierra aprendiendo**.

## PRINCIPIOS (cómo evitamos errores)
- **Gate por etapa**: no se avanza a la siguiente hasta verificar la actual (build verde + prueba en navegador/DB aislada). Igual que el playbook que ya nos funcionó.
- **Detrás de flag** (`REACT_APP_DEV_V2` / un flag del Cerebro · default OFF): usuarios reales no ven nada hasta que esté listo.
- **Reusar el ~80% ya construido** (5 agentes, 39 tools, ML, KG, audit chain) — no reinventar.
- **Seguridad desde la línea 1**: aislamiento por org, candados de aprobación, todo auditable.
- **Sin big-bang**: un ciclo primero (lead); el resto se replica después.

═══════════════════════════════════════════════════════════════════
## DECISIÓN (2026-06-02) · relación REDISEÑO FRONTEND ↔ CEREBRO
═══════════════════════════════════════════════════════════════════
"Mantener TODO el backend + rediseñar el frontend por completo" = ESTRATEGIA CORRECTA y la
más SEGURA (backend = el contrato/plomería intacto · frontend = la piel, se reconstruye sin
tocar la plomería). Es literalmente el strangler-fig que ya usamos (V2 detrás de flag, mismos
endpoints). NO es "en Etapa 2": son 2 CAPAS distintas que se ENCUENTRAN —
  · Cerebro (etapas 0-6) = el cerebro (backend).
  · Rediseño FE (por hub/rol) = la piel.
  · Se encuentran en la **Sala de Control** (UI del Cerebro, vive en el hub CRM del rediseño).
**Forma correcta = rebanadas verticales por área** (cada rebanada = rediseño del hub + su pieza
del cerebro, end-to-end, detrás de flag). NO big-bang del frontend completo (trampa de riesgo).
Reusar el Sistema de Diseño de Mis Leads → cada rebanada rápida y consistente.
**Orden:** terminar Cerebro E2 (cablear motores, backend rápido) → 1ª rebanada full-stack =
**hub CRM/Leads** (rediseño FE + Sala de Control, el de mayor impacto y donde el cerebro luce)
→ replicar a Mis Proyectos · Inteligencia · etc. y a los otros roles. Paso C del rediseño = estas rebanadas.

═══════════════════════════════════════════════════════════════════
## E2.5 · AJUSTE DE ALCANCES — Catálogo amplio + Personalización (founder 2026-06-02)
═══════════════════════════════════════════════════════════════════
Founder: "no nos limitemos a estos pocos pasos · demos MÁS · que el DEV personalice su
experiencia y necesidades." → Antes de E4: pasar de PLAYBOOKS fijos hardcodeados a un
**catálogo amplio + playbooks PERSONALIZABLES por dev** (config en `cerebro_config` por tenant).

### Catálogo ampliado de capacidades del DEV (mapeado a motores que YA existen)
| Área | Acciones | Motor real | Auto/Delicado |
|---|---|---|---|
| Inteligencia de mercado | competidores · pronóstico · precio de zona (DRPI) · pulso de zona · dónde construir · riesgo | battle_card · forecast · drpi · live_pulse · site_selection · risk_score | auto |
| Pricing | sugerir precio (AVM) · re-preciar · experimento A/B · promo | avm/pricing · pricing_experiments | sugiere auto · **aplicar=delicado** |
| Marketing & Difusión | brochure/video/carrusel · landing del proyecto · Meta Ads · auto-content redes · social cards · newsletter | Studio · social_ads · social_cards · newsletter | genera auto · **publicar=delicado** |
| Leads & Comercialización | capturar · calificar (DISC+score) · rutear asesor · nurture · reactivar fríos | lead_bridge · disc · smart_routing · nurture | auto · **contactar=delicado** |
| Operación del proyecto | salud+alertas (cuello de botella) · inventario · cash flow · absorción | health_score · units · cashflow | auto/alertas |
| Equipo & Red | asignar asesores · métricas equipo · co-brokering/alianzas | red_comercial · cross_partnerships | auto · asignar=a veces delicado |
| Reportes | reporte semanal · battle card · reporte a inversionistas | reportes · battle_card | auto |

### Personalización (4 perillas que el dev configura)
1. **Nivel de autonomía:** Solo sugiere · Semi (hace lo seguro, pregunta lo delicado · default) · Piloto (con límites).
2. **Canales ON/OFF:** Marketplace · Meta Ads · Redes · Newsletter · WhatsApp.
3. **"Mi delicado":** qué SIEMPRE requiere mi OK (precio · publicar · contactar · gastar presupuesto).
4. **Metas a la medida:** el dev arma su propia meta (elige pasos + orden) o usa plantillas.

### UPGRADES que CIERRAN CICLO (no standalone · founder 2026-06-02)
Principio: la personalización NO es una pantalla de ajustes (eso es standalone) — es un
**candado de confianza que se GANA y aprende solo**. 5 upgrades:
1. **Autonomía que se gana:** el Cerebro mira tu historial de aprobar/editar/rechazar (datos que ya capturamos en E3). Si apruebas un tipo de acción sin cambios N veces → te propone "graduarla" a automática. Si editas/rechazas → la mantiene en "pregúntame". Cierra ciclo: decisión→ajuste de config→menos fricción. (alimenta de E3/E4)
2. **Config movida por RESULTADOS, no por opinión:** "Meta Ads te dio 12 leads/2 ventas, newsletter 0 → ¿muevo el esfuerzo?" Las perillas se recomiendan solas leyendo tus números reales. (alimenta de E4)
3. **Playbooks exitosos → plantillas:** cuando una meta tuya cierra ventas, el Cerebro ofrece copiarla a tus otros proyectos / publicarla como plantilla (marketplace_templates que ya existe). Éxito→plantilla→reuso→más éxito. (conecta tus proyectos + marketplace)
4. **Vive en el FLUJO, no en una pestaña:** la personalización aparece en el momento ("este proyecto entró a preventa y prefieres autopiloto → ¿arranco?") en dashboard/Sala de Control. Contextual = anti-standalone por diseño.
5. **Aprende de la RED (flywheel):** tu config se compara anónima con devs parecidos que SÍ venden ("los que venden preventa en Polanco usan estos 6 pasos + este canal → ¿adopto su receta?"). No parte de cero ni en silo. (alimenta del Modelo del Mundo)

### Cómo se construye (sin romper)
- `cerebro_config` por tenant (autonomía · canales · delicado-personal · metas custom). Aislado por org.
- Los PLAYBOOKS pasan de hardcode → **data-driven** (lee de config; fallback a plantillas default).
- La Sala de Control gana una sección **"Configurar mi Cerebro"**.
- Cada acción del catálogo = una entrada en ACTION_REGISTRY con su ejecutor (defensivo, fallback heurístico hasta que se conecte su API/llave).
- ⚠️ HONESTIDAD: muchas acciones HOY simulan (no hay APIs/llaves conectadas); el catálogo + config se construyen ya (estructura), el músculo real se enchufa cuando lleguen las llaves (build-for-end-state).

═══════════════════════════════════════════════════════════════════
## ARQUITECTURA · dónde vive y cómo se conecta a los 4 perfiles
═══════════════════════════════════════════════════════════════════
**UNO solo, central, en el backend** (`backend/cerebro/`) — NO uno por perfil. Analogía:
la **torre de control central** de un edificio (una sala sirve a todos los pisos; cada quien
ve solo lo suyo; el gerente ve todo). Multi-tenant de raíz.
**Conexión a cada perfil (superadmin · asesor · developer · comprador) por 3 vías:**
1. **Contexto de sesión** (rol + org + usuario) con que cada portal le habla → el Cerebro filtra TODO por ahí (candado #1 aislamiento).
2. **Catálogo de metas + acciones permitidas por rol** (allow-list): comprador "buscar casa", asesor "trabajar lead", dev "vender proyecto", superadmin "vigilar red/modelo".
3. **Memoria compartida y gobernada** (el Modelo del Mundo): todos alimentan y consultan, con candado por org + redacción PII + retención.
→ **Un cerebro, muchos lentes.** Cada usuario manda señales (swipes/conversaciones/acciones) y recibe inteligencia, siempre scopeado.
Archivos E0: `cerebro/contract.py` (lenguaje) · `guardrails.py` (candados) · `store.py` (cola de tareas) · `memory.py` (memoria gobernada). Flag `CEREBRO_ENABLED` apaga la EJECUCIÓN (índices se crean siempre, vacíos).

═══════════════════════════════════════════════════════════════════
## ESTADO
═══════════════════════════════════════════════════════════════════
- ✅ **Etapa 0 HECHA + VERIFICADA** (2026-06-02): módulo `backend/cerebro/` (contract+guardrails+store+memory) · índices cableados en server startup (try/except, lazy) · test verde: buyer no hace acciones de asesor · delicada→awaiting_approval · orgB NO ve/aprueba tarea de orgA · CAS evita doble-aprobación · memoria redacta PII + aislada por org · sintaxis server.py OK.
- ✅ **Etapa 1 HECHA + VERIFICADA** (2026-06-02): orquestador (`cerebro/orchestrator.py`) — meta→plan ordenado→encadena→PAUSA en lo delicado→aprueba→continúa hasta `done`, reversible. PLAYBOOKS por rol (advisor work_lead, buyer find_home, dev sell_project, superadmin monitor_network) + STEP_EXECUTORS (STUB en E1, se cambian por motores reales en E2) + store con ciclo de vida (start/complete/fail/rollback + run_id encadenado). Upgrade hallado: el `agent_workforce/orchestrator.py` viejo era fan-out ciego sin meta/gate/reversibilidad → el Cerebro es la capa de arriba y REUSA los 5 agentes como músculo. Test verde: flag off no corre · pausa en comm.send_external · orgB no aprueba (aislamiento) · resume→done (6/6) · rollback OK.
- ✅ **Etapa 2 HECHA + VERIFICADA** (2026-06-02): `cerebro/executors.py` — ejecutores REALES defensivos (fail-open a heurístico) que reemplazan los stubs. Cablea: enrich→`lead_enrichment_engine.enrich_lead` · classify→`buyer_score_engine` + DISC del lead · angle→`hook_predictor_engine.predict_hook_score` · draft→template con datos reales · route→dueño/`lead_match`. UPGRADE: cada paso ESCRIBE en memoria gobernada (scope lead) → alimenta el Modelo del Mundo desde ya (flywheel). Import perezoso (no arriesga arranque). Test verde con lead real: pausa en delicado · usa nombre/dueño reales · resume→done · memoria escrita · motores que corrieron REAL local: lead_enrichment + hook_predictor (resto heurístico por falta de LLM key/dato, se vuelve real solo cuando lleguen). Envío real guardado (E5): en no-prod simula.
- ✅ **Etapa 3 HECHA + VERIFICADA** (2026-06-02) · 1ª rebanada FULL-STACK visible: BACKEND `routes/cerebro.py` (status/tasks/run/approve/reject/runs · registrado en server.py · gated CEREBRO_ENABLED · multi-perfil por contexto-sesión) + FRONTEND `pages/developer/SalaDeControl.js` + `api/cerebro.js` + ruta `/desarrollador/crm/sala-control` + entrada "Sala de Control IA" en hub CRM (DEV_NAV_V2). UPGRADE: Aprobar / **Editar-y-aprobar** (la edición = señal de aprendizaje RLHF-lite) / Rechazar. Cableé también ejecutores del ciclo DEV (competitor/forecast/price/marketing/publish). Verificado por API con login dev: /status goals OK · run sell_project corrió 4 pasos (forecast_engine REAL) y pausó en content.publish_public · approve con edits → resume → done · aislado a tenant constructora_ariel · frontend compila limpio. Flag CEREBRO_ENABLED=true en backend/.env.local (local), backend reiniciado. dmx_local limpiado para arrancar fresco.
- ✅ **E2.5 HECHA + VERIFICADA** (2026-06-02) · ajuste de alcances + personalización (founder "todos, build-for-end-state"): catálogo ampliado (24 acciones / 6 áreas en `contract.py` + ACTION_AREAS + catalog_for_role) · `cerebro/config.py` (config por usuario: autonomía/canales/"mi delicado"/metas · **confianza que se gana** record_decision→trust_level→graduation_candidates · candado personalizado `effective_needs_approval` con piso de seguridad HARD_DELICATE) · `cerebro/recommendations.py` (feed de los 5 upgrades: trust+template+flow VIVOS · outcome+network STUB hasta datos) · orquestador usa el candado personalizado · router con record_decision en approve/reject + endpoints config/catalog/recommendations/apply · FRONTEND panel "Configurar mi Cerebro" en Sala de Control (autonomía + feed de recomendaciones con Aplicar). Test verde: candado personalizado (default/graduada/piso seguridad/mi-delicado) · orquestador respeta config · 5 aprobaciones→confiable→candidata→recomendación · rechazo baja confianza. API verificada por curl. Sanitizado clave de confianza (punto→· para Mongo).
- ✅ **E2.5+ ampliación UI (2026-06-02, founder "te quedas corto"):** rediseño "Tu asistente" en lenguaje 100% humano (ver feedback-ui-human-language) · **24 metas** (2→24) agrupadas en secciones, grid 4-col compacto · sección **"🔥 Solo en DMX"** = 12 game-changers (precios de cierre REALES, días en venta, valor real, what-if, quién compra, qué amenidad vende, caro/barato, cuándo subir precio, leads calientes, zona que sube, ganancia, lookalike) · **CREADOR DE TARJETAS**: el dev combina acciones del catálogo → tarjeta propia (`cerebro/config.custom_goals` · save/delete/run · candado por rol · orquestador resuelve custom) · ejecutor genérico limpio para acciones sin uno específico. Verificado: 24 metas + game-changer corre + tarjeta propia creada/aparece/corre/pausa en delicado + builder modal en navegador.
- ✅ **Etapa 4 HECHA + VERIFICADA** (2026-06-02) · cerró el loop de aprendizaje + upgrade "El espejo del asistente": `cerebro/coach.py` (calibración honesta por tipo de predicción + lecciones humanas + reentreno real) · colecciones `cerebro_predictions`/`cerebro_lessons`/`cerebro_retrains` (TTL + aisladas por org) · `log_prediction`/`resolve_predictions`/`calibration`/`on_deal_closed` (el GATE) · REUSA motores inertes que PRENDE: `close_probability_tuning.tune` (reentreno real fail-open) + `coaching_analysis.analyze_performance` (lección real) · ejecutores `exec_forecast`/`exec_price_suggest` ahora registran predicciones · `recommendations.py` fuente 'outcome' AHORA viva con datos del loop (cierra upgrade #2 de E2.5) · endpoints `GET /learning` + `POST /deal-closed` (gate) + `POST /learning/demo` · FRONTEND panel **"🌱 Cómo voy aprendiendo"** en Sala de Control (calibración + lecciones + reentreno · botón "ver cómo funciona (ejemplo)"). Test directo VERDE (predice→cierra→resuelve 4/4→calibra "le atiné 1 de 1"/"~5 días"/"~4%"→lección→reentreno · orgB sin fuga · pérdida baja a "1 de 2"). Verificado en app real: panel vacío→demo→loop lleno (lección del Coach real + cierre + reentreno corrió) · consola 0 errores · ESLint 0 warnings. Pendiente real: cablear `POST /deal-closed` al cierre real del pipeline (hook op:1887) para que se alimente solo; 'network'/lookalike siguen STUB hasta escala.
- ✅ **CABLE de cierre conectado** (2026-06-02): `PATCH /api/advisor/contactos/{cid}` ahora, cuando la etapa pasa a ganado/perdido (WON={cerrado,ganada,cerrado_ganado,ganado} / LOST={perdida,cerrado_perdido,perdido}) y antes no lo estaba, dispara `cerebro.on_deal_closed` (fail-open · gated CEREBRO_ENABLED · no rompe el guardado). El loop se alimenta solo con cierres REALES del pipeline. Test directo verde (cierre dispara lección+reentreno · etapas intermedias no disparan). Pendiente menor: log de predicción close_prob por-lead para que la calibración de cierre use cierres reales (hoy el reentreno YA usa asesor_contactos reales vía close_probability_tuning).
- ✅ **Etapa 5 HECHA + VERIFICADA** (2026-06-02) · equipo rojo: suite reusable `backend/cerebro_redteam_test.py` (16 ataques) = GATE para prender el flag. VERDE: gate de aprobación (delicada→awaiting, no auto) · aislamiento por org en TODAS las superficies (tareas: orgB no ve/aprueba orgA · memoria: orgB no lee orgA · learning E4: cross-ref bloqueado, orgB no resuelve predicción de orgA, calibración aislada) · CAS anti-doble-aprobación · piso HARD_DELICATE (gastar/firmar nunca se automatiza aunque se 'gradúe') · redacción PII en memoria · flag-off no ejecuta · robustez/inyección (rangos mal formados, zona con SQL-ish, lista de 5000 ids → no truena). Hardening aplicado: parseo defensivo de rangos de precio en `_focus_projects`/`exec_compare`. Nota (backlog): `POST /deal-closed` podría spamearse para forzar reentrenos (auth-gated · bajo riesgo) → opcional debounce del retrain por org.
- ✅ **Etapa 6 HECHA + VERIFICADA** (2026-06-02) · el loop del DESARROLLADOR cierra con el MISMO motor: (1) cuando el dev enfoca UN proyecto y corre una tarjeta que predice algo (¿Cuánto vale?/Cierre estimado→precio · Días en venderse→días), `_ins` registra la predicción con ref=project_id (frontend pasa `project_id` cuando el enfoque es un solo proyecto · `_demo_project` resuelve del inventario). (2) cuando una OPERACIÓN pasa a "cerrada" (`PATCH /operaciones/{oid}/status`), el hook dispara `on_deal_closed(level='project', ref=dev_id, sale_price=precio, zone=colonia)` → resuelve esas predicciones (calibración real "me equivoco ~X% en precio") + lección + reentreno que ADEMÁS reentrena la valuación (AVM) de la zona del proyecto (`avm_retrain_cron.retrain_and_maybe_promote` · prende el ML del dev, acotado a la zona). Test directo E6 verde + verificado en app real (enfoque Altavista Polanco → ¿Cuánto vale? logueó predicción precio → deal-closed resolvió → panel "Precio de venta: me equivoco ~5%"). ⚠️ Bug corregido: `**_GAME` sobrescribía dev.forecast/price_suggest → la predicción ahora la registra `_ins` (mantiene display + cierra loop). Equipo rojo re-verificado verde tras E6.
- 🎉 **LAS 7 ETAPAS (E0–E6) COMPLETAS Y VERIFICADAS.** El Cerebro DMX es agéntico de verdad de punta a punta (orquesta → ejecuta motores reales → human-in-the-loop en lo delicado → aprende de cada cierre → seguro). Sigue APAGADO por flag (`CEREBRO_ENABLED` default off · true solo en .env.local). Prenderlo en real = decisión de deploy del founder (gate E5 ya pasa). Pendientes menores (backlog): debounce de retrain · log de close_prob por-lead · 'network'/lookalike esperan escala de datos.
- ✅ **E2.5++ pulido UX (2026-06-02):** lenguaje humano (no jerga · ver feedback-ui-human-language) · **resultados = insight estructurado** (respuesta + qué significa + de dónde sale + 👉 qué hacer, datos marcados "ejemplo") · favoritas (estrella) · **alcance** `/api/cerebro/scopes` (Todo / por proyecto / por zona / por rango de precio — TODO derivado del inventario real del dev: zonas solo donde tiene proyectos, bandas de precio de sus precios reales · dropdown opaco) · **comparables** meta `compare_projects` → tabla lado a lado (datos reales nombre/zona/precio/vendido + inteligencia días-en-venta + veredicto mejor/peor por % colocado · respeta alcance: zona→esos proyectos, proyecto→vs pares de su colonia) · tamaños legibles 100% + grid 4 col ancho completo. Cursor-dot (CustomCursor.js) global pendiente decisión founder.
- ✅ **E2.5+++ interacción (2026-06-02):** **chat sobre el resultado** (reusa `POST /api/copilot/ask` · pre-cargado con el contexto del resultado · preguntas/gráficas/"¿y si?"/explicaciones · lee `response_markdown` · sin LLM key muestra mensaje honesto "cableado, conecta la llave") · **comparador multi-select** (clic en "Comparar" abre modal "¿Cuáles comparo?" → elige 2+ proyectos específicos → tabla · exec_compare scope type 'projects') · dropdown cierra al clic-fuera (ref+listener) + hover/bordes/separadores + opaco. api: askCopilot.
- ✅ **E2.5++++ un solo control (2026-06-02, founder "no 2 botones que se parecen"):** dropdown de alcance REDISEÑADO con pestañas (Todo / Proyecto / Zona / Precio + buscador de proyectos + hover/bordes/check claros) · **comparador movido a pestaña "⚖️ Comparar" DENTRO del mismo dropdown** (se quitó el botón duplicado de arriba · palomea 2+ proyectos → "Comparar (N)" → corre y cierra el dropdown). Verificado en la app real (localhost:3000 logueado, flujo completo) — ver [[feedback_verify_in_real_app]].
- Visible YA: login dev → `/desarrollador/crm` → "Tu asistente" → alcance + 25 tarjetas + "🔥 Solo en DMX" (incl. Comparar multi-select) + "Crea tu propia tarjeta" + resultado estructurado + **chat para profundizar** + correr/aprobar.

═══════════════════════════════════════════════════════════════════
## E4 · BATCH "Cerrar el ciclo de aprendizaje" (lo que sigue)
═══════════════════════════════════════════════════════════════════
**Núcleo:** cierre/pérdida de venta → el **Coach** analiza → reentrena el ML + prende los motores self-tuning hoy INERTES (close_prob_tuning, etc.) + las fuentes 'outcome'/'network' de `recommendations.py` dejan de ser STUB. Tus ediciones (RLHF-lite de E3) enseñan estilo.

### ⭐ UPGRADE DE CIERRE (founder 2026-06-02) — "El espejo del asistente"
*El cerebro se CALIFICA solo y convierte cada resultado en una lección que cambia la siguiente jugada.* Dos mecanismos atados (un upgrade, cierra el loop duro):
1. **Calibración honesta (self-scorecard):** cada predicción que hace el Cerebro (prob. de cierre · días en venta · ángulo · precio sugerido) se sella con su valor predicho (`prediction_log`, scope por org). Cuando llega la realidad (cerrado/perdido · unidad vendida · días reales) compara predicho vs real y lleva un marcador VIVO "qué tan bien le atino" por tipo de predicción. Cierra: predecir→observar→medir error→recalibrar.
2. **Lección → siguiente jugada:** cada cierre/pérdida produce UNA lección en lenguaje humano ("los que cerraste respondieron <2h con ángulo precio; los perdidos se enfriaron sin 2º contacto") que el Coach inyecta como ajuste concreto al peso del playbook / a la próxima recomendación. Cierra: resultado→lección→ajuste→mejor resultado.

**Por qué es el upgrade correcto de cierre (no standalone):**
- Es la **confianza-que-se-gana hecha VISIBLE** → el dev ve que el cerebro es honesto con sus aciertos/errores; eso es lo que permite darle autonomía (prerequisito directo de E5).
- Vive en el FLUJO: en la Sala de Control como **"Cómo voy aprendiendo"** + dentro de cada recomendación. No es una pestaña de métricas aparte.
- REUSA todo: captura de decisiones (E3) + captura de outcomes (E4) + ES la señal que prende los motores self-tuning inertes + alimenta los upgrades 'outcome'/'network' de E2.5 que quedaron stubbeados esperando justo este dato.

**Follow-on natural dentro de E4 (cuando ya haya cierres con escala):** "**lookalike de ganados**" — un cierre encuentra leads/proyectos parecidos al ganador y los prioriza solo (el matchmaking proactivo del North Star). Necesita escala de datos → arranca STUB (build-for-end-state).

**GATE E4 (qué se verifica):** marcar un trato como cerrado dispara (1) actualización del marcador de calibración visible en Sala de Control, (2) una lección humana generada, (3) un reentreno/ajuste visible en observabilidad. Todo aislado por org. Gated por `CEREBRO_ENABLED`.

═══════════════════════════════════════════════════════════════════
## LAS 7 ETAPAS (cada una con su gate)
═══════════════════════════════════════════════════════════════════
| # | Etapa | Qué construye (simple) | Qué te asegura | GATE (qué se verifica) |
|---|---|---|---|---|
| **0** | **Cimientos y candados** | El "contrato": lista de tareas de agentes (1 colección) · memoria gobernada (qué recuerda, por cuánto, sin PII de más) · allow-list de acciones + cuáles son DELICADAS (piden tu OK) · aislamiento por org · todo se audita | Que nada se rompa ni se filtre después · base correcta = cero retrabajo | Schema + reglas de seguridad en DB aislada · test: un agente NO puede actuar fuera de su org ni hacer lo delicado sin OK |
| **1** | **El Cerebro mínimo** (orquestador) | Recibe una META → la parte en tareas → las corre en orden → pausa en lo delicado → todo reversible | La pieza que hoy NO tenemos (la que vuelve "agéntico") · de a poco y seguro | Corre una meta de prueba de 2 pasos punta a punta · el gate pausa correcto · se puede deshacer |
| **2** | **Conectar lo que ya existe** al ciclo del lead | Enrichment → DISC/score → mejor señal → ángulo → borrador 1er mensaje → asignar asesor. SIN IA nueva: puro cablear motores que ya pagamos | Aprovecha el 80% construido · nada huérfano | Un lead real de prueba recorre TODOS los pasos con salidas reales · sin fuga entre orgs |
| **3** | **La Sala de Control** (la cara) | Pantalla donde VES "esto hicieron los agentes" + "esto necesita tu OK" + aprobar/editar/rechazar en 1 clic. Vive en el hub CRM (parte del rediseño) | El momento "wow" + tú al mando de lo delicado | Tú procesas un lead y apruebas en tu navegador (te lo muestro) |
| **4** | **Cerrar el ciclo de aprendizaje** | Cada cierre/pérdida → el Coach analiza → reentrena el ML (encender los motores hoy apagados) + tus ediciones enseñan al agente tu estilo | Esto es lo que lo hace "agéntico de verdad": mejora solo · **el loop se cierra** | Un trato cerrado dispara un reentreno visible en observabilidad |
| **5** | **Pruebas duras de seguridad** (QA / equipo rojo) | Intentar romperlo: ¿actúa entre orgs? ¿hace lo delicado sin OK? ¿inyección al agente? + carga + día-en-la-vida del ciclo | Seguridad ANTES de darle autonomía (lo que pediste) | QA pasa → recién entonces se puede prender el flag |
| **6** | **Replicar al ciclo del desarrollador** | Mismo Cerebro para el proyecto: precia → pronostica → genera landing → vigila competidores → propone acciones → tú apruebas lo delicado | El "departamento muestra" → toda la torre · sin reconstruir | El loop del dev corre con el MISMO motor |

═══════════════════════════════════════════════════════════════════
## EL CICLO QUE "LLEVA AL CIERRE" (qué corre punta a punta)
═══════════════════════════════════════════════════════════════════
Entra lead → investiga → clasifica (DISC+score) → detecta señal (hook) → propone ángulo (Plan Venta)
→ redacta 1er contacto → asigna al mejor asesor → **[tú apruebas lo delicado]** → envía
→ sigue en cadencia (para si responde) → detecta respuesta → **mueve pipeline solo**
→ cerrado/ganado o perdido → **Coach analiza → reentrena** → el siguiente lead se trabaja mejor.
Meta del loop = llevar el lead a **cerrado_ganado**. El loop **se cierra** alimentando al ML.

═══════════════════════════════════════════════════════════════════
## CÓMO ENCAJA CON EL REDISEÑO
═══════════════════════════════════════════════════════════════════
- La **Sala de Control (Etapa 3)** se construye DENTRO del hub **CRM & Leads** del rediseño.
- El **ML visible (Etapa 4)** vive en **Inteligencia** + la ficha del lead.
- Etapas 0-2 (Cerebro + seguridad + cableado) son backend → no chocan con el rediseño visual.
- Sugerencia de orden: hacer **Etapa 0-1-2 del Cerebro en paralelo**, y cuando toque el hub CRM en el rediseño, ahí cae la Sala de Control (Etapa 3) ya con el motor listo.

Relacionado: `IA_FIRST_VISION.md`, `DEV_REDESIGN_TRACKER.md`, `ASESOR_AI_RESCUE_MAP.md`, `MODULE_HARDENING_PLAYBOOK.md`, `aurora-bugs-learnings`.
