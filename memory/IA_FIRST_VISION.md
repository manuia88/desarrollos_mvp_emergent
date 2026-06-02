# DMX · Visión IA-First (de IA-augmented → IA-native) + catálogo de upgrades
**2026-06-02.** Disparador: founder compartió el framework "Agentic AI" + la distinción
IA-augmented vs IA-first ("si empiezas desde la tarea humana, la IA se queda en asistente").

## VEREDICTO
Tenemos **todas las piezas IA-first ya construidas**, pero desplegadas como **IA-augmented**:
- 2 asistentes (Atlax cliente · Copilot asesor 39 tools) · 5 agentes (prospector/nurturer/closer/analyst/coach + Modo Piloto + guardrails) · Conversation Agent cycle-closers (RAG KG+DISC+Plan Venta+SOC+Hook Predictor+Lead Enrichment) · 11 motores ML (close_probability, buyer_score, taste model, self_tuning, drift, A/B, confidence, hook predictor).
- PROBLEMA: corren en silos (cada uno en su página), apagados por flag (`agentic_enabled=off`), disparados a mano. close_prob_tuning estaba INERTE.
**El salto IA-first NO es más IA — es ORQUESTAR la que existe en un ciclo cerrado** con human-in-the-loop solo en lo delicado. El rediseño actual es el vehículo para lograrlo.

═══════════════════════════════════════════════════════════════════
## EL LOOP IA-FIRST (ciclo del lead) — qué existe vs upgrade para CERRARLO
═══════════════════════════════════════════════════════════════════
| Paso del ciclo | Pieza que YA existe | Hoy | Upgrade IA-first |
|---|---|---|---|
| Entra lead | puente marketplace→CRM | manual/auto | dispara el loop solo |
| Investiga | Lead Enrichment (tool) | dormant | corre auto al entrar |
| Clasifica | DISC + buyer_score | dormant/manual | etiqueta+score auto |
| Detecta señales | Live Pulse + Hook Predictor | dormant | "mejor gancho" auto |
| Propone ángulo | Plan Venta IA | manual | propone al asesor |
| Crea tarea + redacta 1er contacto | nurturer + argumentario | dormant | borrador listo |
| Rutea al mejor asesor | Smart Routing (DISC+zona+capacidad) | dormant | asigna auto |
| **[HUMANO aprueba lo delicado]** | Modo Piloto + Command Center cola | toggle escondido | **gate de aprobación visible** |
| Sigue en cadencia | nurture sequences | dormant | cadencia auto, para si responde |
| Detecta respuesta | Reply Classifier | dormant | clasifica+escala auto |
| Mueve pipeline | move-column | manual (clicks) | auto por acción |
| Cierra/pierde | hook cierre + Coach | manual | Coach analiza el flujo |
| **Aprende** | close_prob_tuning + match_weights + taste self-tune | **INERTE/dormant** | **outcomes → retrain → loop mejora** |

Hoy cada ✅ existe suelto. IA-first = encadenarlos + Modo Piloto default + gate humano solo en lo delicado.

═══════════════════════════════════════════════════════════════════
## CATÁLOGO DE UPGRADES (los 4 ejes que pediste)
═══════════════════════════════════════════════════════════════════
### A · CERRAR CICLOS (autonomía)
| # | Upgrade | Sobre qué |
|---|---|---|
| A1 | **Sala de Control / Bandeja de Agente** (NUEVO · core): una pantalla donde ves QUÉ hicieron los agentes + QUÉ espera tu aprobación (lo delicado). Es la superficie IA-first que falta. | Command Center cola + 5 agentes |
| A2 | Modo Piloto = DEFAULT para pasos de bajo riesgo (no toggle escondido); agentes encadenados (output de uno alimenta al siguiente) | Agent Workforce |
| A3 | Loop de feedback: cada cierre/pérdida → Coach analiza → alimenta ML | Coach + self_tuning |
| A4 | Pipeline que se mueve SOLO por acciones (cero clicks) | move-column + triggers |

### B · SEGURIDAD (Governance del framework)
| # | Upgrade | Sobre qué |
|---|---|---|
| B1 | **Gate de aprobación** para acciones delicadas (enviar a VIP, cambiar precio, firmar, mandar masivo) | toda acción de agente |
| B2 | Allow-list de acciones/tools de agente (ya lo hicimos para Atlax público → extender a TODOS) | asistente_engine 39 tools |
| B3 | **Memoria gobernada**: retención + redacción PII por tenant (qué recuerda cada agente y por cuánto) | conversation memory |
| B4 | Observabilidad + rollback de CADA decisión (por qué decidió X · reversible · auditable) | phase-y obs + audit chain + drift |
| B5 | Aislamiento cross-tenant en la capa de agentes (un agente NUNCA cruza orgs) = foco #1 endurecimiento Dev | agentic_crm |

### C · IA (capacidades de agente)
| # | Upgrade | Sobre qué |
|---|---|---|
| C1 | **Planning real** (descompone meta→tareas, estilo ReAct) en vez de acciones sueltas | Agent Workforce |
| C2 | **Multimodal**: ya leemos fotos (taste). Sumar documentos (contratos/brochures) + voz (Voice Atlax dormant) | taste + voice_atlax |
| C3 | **Human-in-the-loop que APRENDE**: cuando editas el borrador del agente, esa edición = señal de entrenamiento (RLHF-lite, aprende tu estilo) | nurturer/argumentario |
| C4 | Copilot CONTEXTUAL (no escondido en Cmd+J) — aparece donde lo necesitas | asistente_engine |

### D · ML (loop de aprendizaje)
| # | Upgrade | Sobre qué |
|---|---|---|
| D1 | **Encender los self-tuning inertes/dormidos** (close_prob_tuning, match_weights_adaptive, taste self-tune): outcomes → retrain | motores ML |
| D2 | Demanda/forecast REAL (fix ya en C.1) alimenta accuracy → retrain | forecast_engine |
| D3 | Lookalike/embeddings (diferido B8): "este lead se parece a 10 que cerraste" → prioriza | taste model |
| D4 | Drift detector activo: si el agente se degrada, auto-flag + reentrena (existe en superadmin, conectar) | conversation_drift |

═══════════════════════════════════════════════════════════════════
## EL MISMO LOOP PARA EL DEV (no solo asesor)
═══════════════════════════════════════════════════════════════════
Entra proyecto → agente lo precia (pricing agent) → pronostica (forecast real) → genera landing (Studio)
→ vigila competidores (Battle Card) → propone acciones (director agent) → **tú apruebas lo delicado**.
Los 3 agentes de director (pricing/marketing/lead) + su run-history (endpoint huérfano) = el loop dev.

═══════════════════════════════════════════════════════════════════
## CÓMO SE CONECTA CON EL REDISEÑO (no es tangente)
═══════════════════════════════════════════════════════════════════
Estas superficies IA-first se construyen DENTRO de los tabs que ya rediseñamos:
- **Sala de Control / Bandeja de Agente** (A1) → vive en el hub **CRM & Leads** (Dev) y en **Conversaciones** (asesor).
- Gates de aprobación (B1) → en cada acción de los hubs.
- ML visible (D) → en Inteligencia (Dev) y en la ficha del lead.
O sea: el rediseño es el VEHÍCULO para volverlo IA-native; no se construye aparte.

═══════════════════════════════════════════════════════════════════
## DÓNDE ESTAMOS en las 5 capas del framework Agentic AI
═══════════════════════════════════════════════════════════════════
| Capa | ¿La tenemos? | Qué tenemos hoy |
|---|---|---|
| **AI & ML** (data→decisiones) | ✅ propio, fuerte | close_prob · buyer_score · AVM hedónico · DRPI · risk/zone score · demanda · taste model · self-tuning · drift |
| **Deep Learning** (CNN/LSTM/transformers) | ✅ vía APIs (NO propio · y está bien) | embeddings · vision tagging (fotos) · LLM por debajo. Paramos sobre DL de proveedores; NO entrenamos redes propias (no hay que reinventar commodity) |
| **Gen AI** (crear contenido) | ✅ fuerte | Studio (brochure/video/carrusel/landing/auto-content) · RAG sobre Knowledge Graph · Plan Venta IA · narrative · prompt engineering · voz (Voice Atlax, dormant) |
| **AI Agents** (tools, HITL) | ✅ con tools + human-in-loop | Copilot 39 tools · 5 agentes · Conversation Agent · Modo Piloto · "Tomar yo". DÉBIL: auto-reflexión / recuperación de error |
| **Agentic AI** (metas autónomas, multi-agente) | ⚠️ **EL GAP** | Tenemos los AGENTES, falta la CAPA que los vuelve agénticos: coordinación/comunicación · descomposición de metas · encadenamiento de metas · colaboración multi-agente · **memoria gobernada** · delegación/handoff · observabilidad total |

**Diagnóstico:** estamos en **"AI Agents"**. El salto a **"Agentic AI"** es una sola capa que NO tenemos: la **orquestación**.

═══════════════════════════════════════════════════════════════════
## EL UPGRADE HIPERMASIVO = el "CEREBRO DMX" (capa de orquestación agéntica)
═══════════════════════════════════════════════════════════════════
Una sola capa que conecta TODO lo que ya existe en un sistema multi-agente dirigido por
metas y auto-mejorante. = la ring "Agent Management" + "Agentic AI" del framework.
Componentes (★ = la pieza YA existe, solo hay que conectarla):
| Componente del Cerebro | Estado |
|---|---|
| Metas → descomposición → sub-tareas (orquestador) | 🆕 NUEVO (el corazón) |
| Coordinación/comunicación entre agentes (blackboard de estado) | ★ 5 agentes + Command Center (cola) |
| **Memoria gobernada compartida** (retención + PII por tenant) | ★ Knowledge Graph (sustrato) + políticas 🆕 |
| Scheduler de tareas (cron + por evento) | ★ crons + dispatch_event |
| Loops de feedback + auto-mejora (outcomes→retrain+tune prompts) | ★ drift + A/B + self-tuning (hoy INERTES → conectar) |
| Rollback + guardrails + gates humanos (lo delicado) | ★ audit chain + Modo Piloto |
| Observabilidad de cada decisión (por qué/qué/resultado) | ★ phase-y obs + drift dashboard |
| Delegación / handoff (agente↔agente, agente↔humano) | ★ "Tomar yo" (humano) + 🆕 agente↔agente |

**CLAVE: ~80% de las piezas ya existen, desconectadas.** El upgrade es CABLEARLAS en un cerebro,
NO construir 5 capas desde cero. El **Cerebro = el motor**; la **Sala de Control de Agentes = su cara**.
Se construye **incremental como columna del rediseño** (NO big-bang · respeta no-rush + Aurora learnings).
El Cerebro es el norte; cada hub del rediseño engancha su pedazo (CRM = ciclo del lead · Inteligencia = ML visible · etc.).

Relacionado: `ASESOR_AI_RESCUE_MAP.md`, `DEV_HIDDEN_FEATURES_MAP.md`, `DEV_REDESIGN_TRACKER.md`, `feedback_build_for_endstate.md`.
