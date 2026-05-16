# Matriz exhaustiva · features por CRM · análisis 10 CRMs para LivooDMX

**Versión**: 2.0 (correctiva) · 2026-05-15
**Corrección clave**: WhatsApp es vía **QR + OAuth Facebook página** (no Business API oficial)
**Objetivo**: por cada feature observada · qué hace · valor para DMX · anclaje técnico · quién la construye

---

## Convenciones

**Anclaje técnico:**
- `🎨 FE-nuevo` · frontend nuevo desde cero
- `🎨 FE-extender` · extender frontend existente
- `⚙️ BE-nuevo` · backend nuevo
- `⚙️ BE-extender` · extender backend existente
- `🔗 integra` · integración con API/SDK externo
- `📦 ambos` · requiere FE + BE nuevos coordinados

**Quién construye:**
- `🟦 emergent` · módulo grande/funcional · emergent shipea
- `🟩 Claude Code` · refactor mecánico · cleanup · CSS · sweeps · fixes pequeños
- `🟨 mixto` · emergent base · Claude Code polish post-push

**Prioridad para DMX:**
- 🔴 P1 crítico · sin esto el CRM no compite
- 🟠 P2 alto · diferenciador relevante
- 🟡 P3 medio · nice to have con valor real
- 🟢 P4 bajo · post-MVP o descartable

---

## 🟦 LEADSALES (referencia primaria · es el CRM mexicano más cercano)

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| L1 | **WhatsApp QR con OAuth Facebook** | Asesor escanea QR desde su WA · vincula página FB con OAuth · backend recibe mensajes vía webhook Meta | Inbox WhatsApp nativo en el CRM · #1 absoluto para MX | 🔗 integra Meta OAuth + ⚙️ BE-nuevo webhook + 🎨 FE-nuevo inbox | 🟦 emergent | 🔴 P1 |
| L2 | **Inbox unificado 3 columnas** | Lista de conversaciones + chat activo + panel atributos del lead | Asesor trabaja toda la comunicación dentro del CRM | 📦 ambos | 🟦 emergent | 🔴 P1 |
| L3 | **Fast Replies con variables `/snippet`** | Templates con `{Nombre}` `{Propiedad}` · activación con `/` slash | Asesor responde 5x más rápido · 20-40 leads en paralelo | 🎨 FE-nuevo + ⚙️ BE-nuevo CRUD templates | 🟦 emergent | 🔴 P1 |
| L4 | **Programar mensaje inline** | Date/time picker arriba del compositor · queue job despacha a la hora | Follow-up automático sin recordatorios manuales | 📦 ambos · scheduler con cron | 🟦 emergent | 🟠 P2 |
| L5 | **Sentimiento del lead (🔥 Urgente · ⭐ Importante · 🍺 Pendiente · 🧊 Atorado)** | Etiqueta visual interna en cada conversación · no visible al lead | Priorización visual instantánea de la bandeja | 🎨 FE-extender + ⚙️ BE-extender campo en lead | 🟦 emergent | 🟠 P2 |
| L6 | **Mensajes destacados (pin)** | Marcar mensajes importantes · panel lateral con todos los destacados | Acceso rápido a info crítica sin scroll | 🎨 FE-nuevo + ⚙️ BE-extender flag is_highlighted | 🟦 emergent | 🟡 P3 |
| L7 | **Menú contextual de mensaje (Responder/Destacar/Reenviar)** | Hover sobre burbuja muestra chevron · 3 acciones | Reply con cita en grupos · reenviar ficha de propiedad multi-lead | 🎨 FE-nuevo + ⚙️ BE-extender | 🟦 emergent | 🟠 P2 |
| L8 | **Audit log Historial completo del lead** | Timeline de eventos: creación · cambio asignado · cambio nombre WA · mensajes | Memoria institucional · evita "¿qué pasó con este lead?" | ⚙️ BE-nuevo audit_log table + 🎨 FE-extender tab | 🟦 emergent | 🟠 P2 |
| L9 | **Banner de desconexión + reconnect** | Cuando WA pierde conexión muestra banner amarillo · click reconecta | Asesor no manda mensajes que fallan en silencio | 🎨 FE-extender + ⚙️ BE-extender heartbeat | 🟩 Claude Code post-emergent | 🟠 P2 |
| L10 | **Resumen IA de conversación** | Botón en chat genera resumen ejecutivo del thread | Pre-call brief sin leer 50 mensajes | 🔗 integra LLM + 🎨 FE-extender | 🟨 mixto · emergent integra · CC mejora prompt | 🟡 P3 |
| L11 | **Filtros bandeja (Todos · Asignados a mí · No leídos · Archivados)** | Tabs superiores en inbox | Asesor encuentra rápido la conversación correcta | 🎨 FE-nuevo + ⚙️ BE-extender queries | 🟦 emergent | 🔴 P1 |
| L12 | **Asignación de conversación con dropdown** | Header del chat tiene dropdown de usuarios para reasignar | Handoff entre asesores sin perder contexto | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟠 P2 |
| L13 | **Sidebar Atributos editable inline** | Cada campo del lead se edita directo en el panel derecho · no modal | UX rápido sin abrir formularios | 🎨 FE-extender | 🟦 emergent | 🟠 P2 |
| L14 | **Conversaciones grupales WA** | Grupos de WA aparecen como leads con nombre del emisor sobre cada burbuja | Captura leads de grupos de inversión / referidos | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟢 P4 |
| L15 | **Reordenamiento dinámico de lista en realtime** | Nueva mensaje sube la conversación al top con animación | UX moderno tipo WhatsApp nativo | 🎨 FE-extender Supabase Realtime · BE existente | 🟩 Claude Code | 🟡 P3 |

---

## 🟦 FOLLOW UP BOSS

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| F1 | **Smart Lists con badge contador en sidebar** | Listas filtradas guardadas (Today's Leads · Clients · Closings) con contador realtime | Pantalla de inicio operativa · "qué tengo que hacer hoy" | 🎨 FE-nuevo + ⚙️ BE-nuevo saved_filters | 🟦 emergent | 🔴 P1 |
| F2 | **Activity Feed unificado por contacto** | Timeline cronológico con email · SMS · llamadas · notas · web activity · property inquiries | Sin esto el asesor pierde 50% del contexto del lead | 📦 ambos · view sobre activities | 🟦 emergent | 🔴 P1 |
| F3 | **Action Plans con pausa automática al detectar respuesta** | Secuencias multi-touch · si lead responde el plan se pausa automáticamente | Anti-spam · respeta conversación humana | 📦 ambos · workflow engine + DB trigger | 🟦 emergent | 🟠 P2 |
| F4 | **@Mentions en notas para team collaboration** | `@Manuel` en una nota genera notificación push al usuario mencionado | Coordinación interna sin salir a Slack/WhatsApp | 🎨 FE-extender parser + ⚙️ BE-extender notifications | 🟦 emergent | 🟠 P2 |
| F5 | **Ponds / Bolsa de leads compartida (claim)** | Pool de leads no atendidos que cualquier asesor puede reclamar | Anti-pérdida · si asesor A satura otro toma | 📦 ambos · queue + claim atomic | 🟦 emergent | 🟡 P3 |
| F6 | **Voicemail con transcripción** | Llamadas perdidas con audio + transcripción + botón play | Convierte llamada perdida en lead actionable | 🔗 integra Twilio + LLM transcripción + 🎨 FE-extender | 🟦 emergent | 🟢 P4 |
| F7 | **People relationships (vinculación entre contactos)** | Linkear cónyuge · socio · referidor entre contactos del CRM | Decisión inmobiliaria es de pareja · trackear ambos | ⚙️ BE-nuevo tabla relationships + 🎨 FE-extender | 🟦 emergent | 🟡 P3 |
| F8 | **Property visit tracking en portal externo** | Si el lead visita ficha de propiedad en marketplace público · registra evento en timeline | Señal de "lead caliente listo para contactar" | ⚙️ BE-extender event tracker + 🎨 FE-extender timeline | 🟦 emergent | 🟠 P2 |
| F9 | **Stage edit inline con un click** | Cambiar etapa del pipeline desde el perfil sin modal · dropdown directo | -3 clicks por cambio de etapa · multiplicado 50 leads = horas | 🎨 FE-extender | 🟩 Claude Code | 🟠 P2 |
| F10 | **Keyboard shortcuts globales (g h · g p · g c)** | Atajos de teclado para navegar (Gmail-style) | Power users 3x más rápido | 🎨 FE-extender hotkey listener | 🟩 Claude Code | 🟢 P4 |
| F11 | **Navegación entre leads con flechas izq/der** | Press ← / → para ir al lead anterior/siguiente sin volver a lista | Revisión secuencial de leads · campaña call-blitz | 🎨 FE-extender keyboard + state next/prev | 🟩 Claude Code | 🟡 P3 |
| F12 | **Tipos de tarea (Call · Text · Email · To-Do)** | Tareas con tipo + icono · click en task tipo "Call" abre dialer | Diferencia visual + acción 1-tap | 🎨 FE-extender enum + ⚙️ BE-extender | 🟦 emergent | 🟠 P2 |
| F13 | **Lifecycle stages como inboxes automáticos** | Cada etapa del pipeline genera su propio inbox filtrado | Asesor trabaja desde "Hot Leads inbox" directo | 🎨 FE-extender + ⚙️ BE-extender views | 🟦 emergent | 🟠 P2 |
| F14 | **Conversation status (Open · Closed · Snoozed)** | Conversaciones cerrables · snooze para volver en X horas | Bandeja siempre limpia · no acumula | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟠 P2 |
| F15 | **Sound de notificación de nuevo mensaje** | Beep audible cuando llega mensaje nuevo | Asesor responde rápido sin estar mirando | 🎨 FE-extender Audio API | 🟩 Claude Code | 🟡 P3 |

---

## 🟦 WISE AGENT

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| W1 | **Important Dates auto en dashboard** | Calcula cumpleaños · aniversarios · home_sale_anniversary de contacts ±7 días | Top-of-mind para nurturing · genera referidos | ⚙️ BE-nuevo cron + 🎨 FE-extender widget Inicio | 🟦 emergent | 🟠 P2 |
| W2 | **Drip Campaigns multi-touch** | Secuencias email/SMS/WhatsApp/llamada con timing relativo (Día 0 · Día 7 · Día 30) | Nurturing automático ciclo 3-8 meses | 📦 ambos · workflow engine | 🟦 emergent | 🔴 P1 |
| W3 | **Transaction Portal público (URL compartible)** | Genera URL pública con código de acceso para que comprador/propietario vea progreso del cierre | Anti-llamadas "¿cómo vamos?" · diferencia profesional | 📦 ambos · public route + token | 🟦 emergent | 🟡 P3 |
| W4 | **Email-to-Lead Parsing con alias único** | Cada asesor recibe alias `xxx@leads.dmx.io` · portales reenvían email allí · parser crea lead automático | Captura automática Inmuebles24/Lamudi/Vivanuncios sin API | ⚙️ BE-nuevo SMTP inbound + parser por portal | 🟦 emergent | 🟠 P2 |
| W5 | **Lead Rules Engine (if/then)** | Reglas declarativas que actúan sobre lead nuevo: asignar categoría · iniciar drip · agregar a call list | Pre-procesamiento automático | 📦 ambos · rule engine | 🟦 emergent | 🟡 P3 |
| W6 | **Capture Forms embebibles (script tag)** | Forms en cualquier web del asesor con UTM tracking · POST a CRM | Lead capture en landing pages propias | 🎨 FE-nuevo widget público + ⚙️ BE-extender endpoint | 🟦 emergent | 🟠 P2 |
| W7 | **Goal Tracker anual + semanal/mensual** | Set goals (Gross sales · Avg sale price · Homes sold) y track progreso | Gamificación + accountability del asesor | 📦 ambos · goals table + dashboard | 🟦 emergent | 🟡 P3 |
| W8 | **Family fields (spouse · children · pets)** | Campos extra en perfil del contacto | Genera conversación humana · momentos clave (cumpleaños hijos) | 🎨 FE-extender + ⚙️ BE-extender JSONB | 🟩 Claude Code · custom field | 🟢 P4 |
| W9 | **Spouse/cónyuge linkable** | Marcar contacto como pareja de otro contacto · timeline compartido | Pareja decide juntos compra · trackear ambos lados | 🎨 FE-extender + ⚙️ BE-extender FK | 🟦 emergent | 🟡 P3 |
| W10 | **Call List separada de Task List** | Lista específica de "leads a llamar hoy" separada de tareas generales | Power dialer mode · sesiones de llamadas seriales | 🎨 FE-extender vista filtrada | 🟩 Claude Code | 🟡 P3 |

---

## 🟦 TOKKO BROKER

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| T1 | **Widget "Pendientes de contactar" con tiempo de inactividad** | Lista de contactos con badge rojo "14 días" "13 días" sin contacto | El widget más usado del Home Tokko · evita pérdida de leads | 🎨 FE-nuevo widget + ⚙️ BE-extender query | 🟦 emergent | 🔴 P1 |
| T2 | **Estado Actual (snapshot inventario)** | KPIs en tiempo real: contactos activos · propiedades disponibles · pipeline por etapa con drill-down clickeable | Vista panorámica 1-vistazo del negocio | 🎨 FE-nuevo + ⚙️ BE-extender aggregations | 🟦 emergent | 🟠 P2 |
| T3 | **Performance con comparativa período anterior** | KPI con delta % vs período previo (↑ 15% vs mes pasado) | Detecta tendencias · acelera/frena estrategias | 🎨 FE-extender + ⚙️ BE-extender views | 🟦 emergent | 🟠 P2 |
| T4 | **Filtro por sucursal + agente combinables** | Selector global de Sucursal + Agente · todo el dashboard se filtra | Manager de equipo ve toda la zona · asesor ve solo lo suyo | 🎨 FE-extender + ⚙️ BE-extender RLS | 🟦 emergent | 🟠 P2 |
| T5 | **Auto-asignación de leads al agente de la propiedad consultada** | Si lead pregunta por Propiedad X · se asigna al agente de Propiedad X automáticamente | Cero leads sin asignar · response time bajo | ⚙️ BE-extender rule on webhook | 🟦 emergent | 🔴 P1 |
| T6 | **Alertas portales (errores de publicación)** | Widget que muestra propiedades con errores de sync en portales externos | Detecta proactivamente anuncios caídos | ⚙️ BE-extender + 🎨 FE-extender widget | 🟦 emergent | 🟢 P4 |
| T7 | **Próximos vencimientos (reservas por vencer)** | Lista de operaciones con fecha de reserva próxima · semáforo de urgencia | Evita pérdida de operaciones por timing | 🎨 FE-extender widget + ⚙️ BE-extender query | 🟦 emergent | 🟠 P2 |
| T8 | **Drag-to-reorder widgets del Home** | Asesor personaliza orden de widgets en su dashboard | Cada asesor adapta su día | 🎨 FE-extender DnD + localStorage | 🟩 Claude Code | 🟢 P4 |

---

## 🟦 EASYBROKER

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| E1 | **CMA Análisis Comparativo de Mercado con 15 comparables** | Auto-genera reporte: tu propiedad vs 15 similares mismo barrio · valor estimado bajo/medio/alto · $/m² · mapa con letras | Herramienta de captación más poderosa · convence al propietario del precio | 🎨 FE-nuevo + ⚙️ BE-nuevo algo comparables + PDF | 🟦 emergent | 🟠 P2 |
| E2 | **Reporte propietario auto mensual con métricas portales** | Cada 1° del mes envía WA al propietario con leads + visitas en portal + status | Retiene exclusivas · diferencia profesional | 📦 ambos · cron + PDF + WA template | 🟦 emergent | 🟡 P3 |
| E3 | **Wizard propiedad con autocomplete Mapbox** | Form en 4 pasos · paso 2 ubicación con autocomplete Google/Mapbox + GPS | UX captación 10x mejor que form raw actual | 🎨 FE-nuevo + 🔗 integra Mapbox | 🟦 emergent | 🟠 P2 |
| E4 | **Vista doble grid + mapa interactivo** | Lado izquierdo grid de cards · lado derecho mapa con pins clusterizados | Asesor ve propiedades en contexto geográfico | 🎨 FE-nuevo + 🔗 integra Mapbox GL | 🟦 emergent | 🟡 P3 |
| E5 | **Listas de propiedades compartibles con cliente** | Curar set de 5-10 propiedades · link único con branding del asesor para cliente | Substitutes WhatsApp de 10 fotos sueltas | 📦 ambos · public route + token | 🟦 emergent | 🟠 P2 |
| E6 | **Bolsa MLS / Co-broker con comisión compartida** | Marketplace interno de propiedades de otros asesores · 50/50 split | Amplía inventario sin captar más exclusivas | 📦 ambos · flag commission_shared | 🟦 emergent | 🟡 P3 |
| E7 | **Compartir con mis datos (link branded)** | Compartir ficha de propiedad de otro asesor con TU branding como contacto | Intermediario aparece como contacto · no el propietario original | ⚙️ BE-extender public route + 🎨 FE-extender | 🟦 emergent | 🟡 P3 |
| E8 | **Alertas de búsqueda guardadas** | Cliente guarda filtros · le llega notificación cuando hay match nuevo | Re-engagement automático · clientes inactivos vuelven | 📦 ambos · cron + WA notification | 🟦 emergent | 🟡 P3 |
| E9 | **Cotizaciones (Propuesta de Servicios de Intermediación)** | Documento formal con dirección · % comisión · monto estimado · comisión calculada | Profesionaliza propuesta a propietario | 📦 ambos · template + PDF | 🟦 emergent | 🟢 P4 |
| E10 | **Hard validations entre stages (kanban)** | No permite mover lead a "Visitando" si no hay visitas registradas · etc | Anti-pipeline-vacío · founder reportó este bug | 🎨 FE-extender + ⚙️ BE-extender validators | 🟩 Claude Code · es fix puntual | 🔴 P1 |
| E11 | **Sub-pipelines Compradores vs Vendedores separados** | 2 pipelines independientes con etapas diferentes | Reflejan procesos reales distintos · 19 vs 18 etapas | 🎨 FE-extender + ⚙️ BE-extender pipeline_type | 🟦 emergent | 🟠 P2 |

---

## 🟦 RESPOND.IO

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| R1 | **Workflow Builder visual drag-drop con 10 triggers + 16 actions** | Canvas tipo flowchart · trigger → conditions → actions · branches | Automatización sin código · admin construye flujos | 🎨 FE-nuevo (React Flow) + ⚙️ BE-nuevo workflow engine | 🟦 emergent | 🟠 P2 |
| R2 | **Lifecycle stages personalizables generan inbox automático** | Cada etapa = un inbox filtrado · asesor trabaja desde "Hot Leads inbox" | Mismo concepto que F13 · validar | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟠 P2 |
| R3 | **Snippets con `#shortcut`** | Frases cortas reutilizables · ej `#bienvenida` inserta texto | Más granular que templates completos | 🎨 FE-nuevo + ⚙️ BE-nuevo | 🟦 emergent | 🟠 P2 |
| R4 | **Closing Notes con categorías** | Al cerrar conversación asigna categoría (General · Sales · Payment · etc) + summary | Analytics de calidad de cierre · motivos de pérdida | 🎨 FE-nuevo + ⚙️ BE-nuevo | 🟦 emergent | 🟡 P3 |
| R5 | **AI Prompts (Change tone · Translate · Fix grammar · Simplify)** | Botones en compositor que transforman texto antes de enviar | Asesor envía mensajes 5x mejor escritos | 🔗 integra LLM + 🎨 FE-extender botones | 🟦 emergent | 🟠 P2 |
| R6 | **AI Agents con knowledge base RAG** | Bot WA 24/7 que responde con docs/URLs del negocio · escala a humano si no puede | Cubre noches/fines de semana | 🔗 integra LLM + Vector DB + 🎨 FE-nuevo builder | 🟦 emergent | 🟠 P2 |
| R7 | **Segments dinámicos (queries guardadas que se actualizan)** | Listas que recalculan automático cuando cambian propiedades del lead | Audiencias dinámicas para broadcasts/workflows | 🎨 FE-extender + ⚙️ BE-extender query JSONB | 🟦 emergent | 🟠 P2 |
| R8 | **Reports completos (Conversations · Responses · Resolutions · Messages · Users · Leaderboard · Assignments)** | 11 dashboards de productividad · response time · resolution time · breakdown por canal | Manager view robusta · accountability del equipo | 📦 ambos · views materializadas + dashboards | 🟦 emergent | 🟡 P3 |
| R9 | **Broadcasts masivos segmentados** | Envío masivo a Segment + plantilla + scheduled | Campañas de WA tipo "Nuevas propiedades Polanco" | 📦 ambos · broadcast queue | 🟦 emergent | 🟠 P2 |
| R10 | **GetStream Chat como backend de mensajería** | SaaS de chat real-time con SDK React · maneja WebSocket · historial · audio | Acelera build · no reinventar mensajería | 🔗 integra GetStream.io | 🟨 mixto · emergent integra | 🟡 P3 |

---

## 🟦 GOHIGHLEVEL

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| G1 | **Workflows con 16 step types** | Send SMS · Send Email · Send WhatsApp · Add Tag · Update Field · Wait · If/Else · Webhook · GPT call · Stripe charge · Math operation · etc | Motor de automatización completo | 📦 ambos · workflow runtime | 🟦 emergent | 🟠 P2 |
| G2 | **Pipeline inmobiliario en español MX con 19 etapas** | Etapas pre-built: New Lead → Lead Contactado → Perfilado → Búsqueda Opciones → Envío Opciones → Cita Agendada → Cita Concretada → Oferta Enviada → Oferta Aceptada → Documentación → Firma Contrato → Escritura Programada → Escritura Firmada → Comisión Pagada · + descartes | DMX adopta etapas exactas · onboarding sin configurar | 🎨 FE-extender seed data + ⚙️ BE-extender | 🟩 Claude Code · es seed | 🔴 P1 |
| G3 | **Conversation AI Bot multi-canal** | Bot que responde WA/SMS/Email con KB del negocio | Cubre 24/7 sin asesor | 🔗 integra LLM + RAG | 🟦 emergent | 🟠 P2 |
| G4 | **Forms / Funnels / Landing pages builder** | Constructor visual de páginas web con captura de leads · UTM tracking | Lead capture en propiedades / desarrollos / asesor personal | 🎨 FE-nuevo builder + ⚙️ BE-nuevo public route | 🟦 emergent | 🟡 P3 |
| G5 | **Calendar booking público (Calendly)** | URL pública del asesor donde cliente agenda visita | Reduce fricción de coordinación · -10 mensajes por cita | 📦 ambos · slots availability + public route | 🟦 emergent | 🟠 P2 |
| G6 | **Manual Actions (workflow steps que crean tareas humanas)** | Workflow puede crear tarea "Llamar a Juan" en lugar de acción automática | Híbrido auto + manual · workflow no necesita ser 100% bot | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟡 P3 |
| G7 | **Custom Values (variables globales)** | Variables como `{Empresa.Nombre}` `{Asesor.Telefono}` disponibles en todos los templates | Cambias 1 vez · actualiza en 100 templates | ⚙️ BE-extender + 🎨 FE-extender token resolver | 🟩 Claude Code | 🟡 P3 |
| G8 | **Stripe One Time Charge desde workflow** | Workflow puede cobrar al lead automáticamente | Cobro anticipo de reserva auto-flow | 🔗 integra Stripe + ⚙️ BE-extender | 🟦 emergent | 🟢 P4 |
| G9 | **WhatsApp: Send Flows (formulario interactivo)** | Envía formularios estructurados de Meta WhatsApp Flows | Calificación lead interactiva dentro de WA | 🔗 integra Meta Flows API · NOTA: NO disponible con QR (solo Business API) | descartado para DMX (QR) | 🟢 P4 |
| G10 | **Reply In Comments (Facebook/Instagram)** | Auto-responde comentarios en posts de FB/IG | Captura leads de comentarios de anuncios | 🔗 integra Meta Graph API | 🟦 emergent | 🟢 P4 |

---

## 🟦 HUBSPOT

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| H1 | **Breeze AI con citas verificables [1][2]** | Resumen IA del lead con referencias numeradas a actividades específicas del timeline | Transparencia · auditoría · no hallucinations | 🔗 integra LLM + ⚙️ BE-extender citation parser | 🟦 emergent | 🟠 P2 |
| H2 | **Breeze Assistant chat global con @mentions** | Chat IA accesible desde cualquier pantalla · puede mencionar registros del CRM (`@Juan`) para inyectar contexto | Atlax expandido · ya tenemos base | 🔗 integra LLM + 🎨 FE-extender Atlax | 🟨 mixto · emergent expande Atlax existente | 🟠 P2 |
| H3 | **Sales Sequences semi-automáticas con LinkedIn** | Cadencias multi-touch · email envía desde correo personal del asesor (no masivo) · pasos de LinkedIn manual | Outreach personalizado · escala sin perder personalización | 📦 ambos · scheduler + Gmail/Outlook OAuth | 🟦 emergent | 🟡 P3 |
| H4 | **Playbooks (guiones de llamada estructurados)** | Panel lateral con preguntas + textarea de respuestas · al cerrar guarda como nota estructurada | Onboarding nuevos asesores · estandariza calificación | 🎨 FE-nuevo + ⚙️ BE-nuevo | 🟦 emergent | 🟡 P3 |
| H5 | **Snippets con `#shortcut`** | Igual que R3 · valida en doble | duplicado de R3 | - | - | - |
| H6 | **Sales Documents con tracking por página** | Sube PDF/PPT/DOCX · genera link único · trackea quien lo abrió · qué páginas vio · cuánto tiempo | Detecta interés real · saber qué páginas captan atención | 📦 ambos · S3 + viewer + analytics | 🟦 emergent | 🟡 P3 |
| H7 | **Meeting Scheduler público (Calendly)** | URL `meet.dmx.io/manuel-acosta` · público elige slot · sync Google/Outlook | Mismo que G5 | dup G5 | - | - |
| H8 | **Forecast / Previsión de comisiones** | Manager ve forecast: Pipeline · Best Case · Committed · Closed Won por agente | Manager planea recursos · asesor planea ingresos | 🎨 FE-nuevo + ⚙️ BE-nuevo | 🟦 emergent | 🟢 P4 |
| H9 | **Audit Log inmutable** | Log de quién hizo qué · cuándo · valor anterior y nuevo (cambios de field) | GDPR/LFPDPPP compliance · resolución de disputas | ⚙️ BE-nuevo audit table append-only + 🎨 FE-extender | 🟦 emergent | 🟡 P3 |
| H10 | **Notifications con @mentions cross-CRM** | Sistema central de notificaciones in-app + email + push mobile | Coordinación interna sin Slack/WA | 📦 ambos · centro notificaciones | 🟦 emergent | 🟠 P2 |
| H11 | **Búsqueda Global Cmd+K** | Buscar contactos · deals · propiedades · tareas con shortcut · normalización de teléfono | Power user feature · acceso 1-shortcut | 🎨 FE-nuevo + ⚙️ BE-extender FTS | 🟩 Claude Code | 🟠 P2 |
| H12 | **Data Import wizard CSV con mapeo de columnas** | Sube CSV · UI mapea columnas a propiedades · valida · importa | Migración inicial · imports masivos sin programador | 🎨 FE-nuevo + ⚙️ BE-extender batch processor | 🟦 emergent | 🟡 P3 |
| H13 | **Tickets (servicio post-venta)** | Pipeline independiente para issues post-cierre (escrituración · trámites · soporte propietario) | Gestiona post-venta · alta retención | 📦 ambos · objeto Tickets | 🟦 emergent | 🟢 P4 |
| H14 | **Custom Fields configurables por admin** | Admin crea fields personalizados sin código · tipos: text · number · date · select · multiselect · checkbox · calculated | Cada agencia/franquicia adapta CRM a su proceso | 🎨 FE-nuevo + ⚙️ BE-extender JSONB + schema dinámico | 🟦 emergent | 🟠 P2 |
| H15 | **Lifecycle stages cross-objeto (contacts · deals · companies)** | Stages personalizables por objeto · mismo motor reutilizable | Configuración unificada | 🎨 FE-extender + ⚙️ BE-extender | 🟦 emergent | 🟡 P3 |
| H16 | **Conditional logic en propiedades (mostrar/ocultar campos)** | Si "Financiamiento = Sí" → muestra "Banco" · oculta si "No" | UI limpia · formularios inteligentes | 🎨 FE-nuevo conditional renderer | 🟦 emergent | 🟢 P4 |
| H17 | **Companies + Contact-Company many-to-many con role labels** | Empresa asociada a contacto con rol (Decision Maker · Manager · Family · Cónyuge) | Multi-stakeholder en una decisión inmobiliaria | 🎨 FE-extender + ⚙️ BE-extender association_type | 🟦 emergent | 🟡 P3 |
| H18 | **Workflows con 55 triggers** | Eventos del sistema: contact_created · stage_changed · form_submit · email_open · property_viewed · birthday · stale_opportunity · etc | Cada cambio dispara automatización | ⚙️ BE-extender event bus | 🟦 emergent | 🟠 P2 |
| H19 | **Onboarding checklist con progress %** | Lista de 10 tareas para configurar el CRM · auto-marca completadas | Reduce time-to-value asesores nuevos | 🎨 FE-nuevo + ⚙️ BE-nuevo | 🟩 Claude Code | 🟢 P4 |
| H20 | **Sales Document tracking + email tracking pixel** | Email tiene pixel · sabe cuándo lo abrieron · qué links clickearon | Detecta interés real del lead | 🔗 integra Pixel + 📦 ambos | 🟦 emergent | 🟡 P3 |

---

## 🟦 CLAY

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| C1 | **AI Context de negocio (system prompt persistente)** | Workspace tiene descripción de empresa + ICP · se inyecta en todos los prompts | Mensajes IA personalizados a la voz/posicionamiento de DMX | ⚙️ BE-extender + 🎨 FE-nuevo settings | 🟩 Claude Code · es config | 🟠 P2 |
| C2 | **Sculptor copiloto natural language** | Chat global · "busca leads sin contactar 5 días" → ejecuta acción | Atlax v2 · ya tenemos base | 🔗 integra LLM + 🎨 FE-extender Atlax | 🟨 mixto · expandir Atlax | 🟠 P2 |
| C3 | **Tablas con columnas IA (Use AI 0.1 cred/row)** | Columna de tabla ejecuta prompt IA por cada fila · enriquecimiento masivo | Score automático · clasificación · generación masiva | 📦 ambos · column actions | 🟦 emergent | 🟡 P3 |
| C4 | **Signals · alertas por eventos** | Monitor periódico de cambios: lead vio propiedad · cambió stage · sin actividad X días | Trigger acciones proactivas | ⚙️ BE-nuevo cron jobs + 🎨 FE-nuevo configurador | 🟦 emergent | 🟠 P2 |
| C5 | **Connections hub (conectar APIs externas)** | UI para conectar credenciales OAuth/API key de proveedores externos | Founder configura nuevos portales/datos sin dev | 🎨 FE-nuevo + ⚙️ BE-extender credentials encrypted | 🟦 emergent | 🟡 P3 |
| C6 | **Versioning de agentes IA** | Edit prompt del agente · genera nueva versión · rollback si rompe | Iterar sin romper producción | ⚙️ BE-nuevo versioning + 🎨 FE-extender | 🟦 emergent | 🟢 P4 |
| C7 | **Templates pre-hechos de agentes IA** | Biblioteca de prompts: Qualify Lead · Generate WA Message · Analyze Profile · Suggest Next Action | Onboarding · best practices | 🎨 FE-extender gallery + seed data | 🟩 Claude Code | 🟡 P3 |
| C8 | **Cost preview antes de ejecutar IA masiva** | Antes de correr enrichment en 1000 leads muestra costo estimado | Control de gastos IA | 🎨 FE-extender + ⚙️ BE-extender pricing | 🟩 Claude Code | 🟡 P3 |
| C9 | **Dry-run de agente IA en 1 lead** | Test del prompt en 1 fila antes de masivo · ve output antes de gastar tokens | Anti-error de prompt mal escrito | 🎨 FE-extender + ⚙️ BE-extender | 🟩 Claude Code | 🟢 P4 |

---

## 🟦 BRAND24

| # | Feature | Qué hace | Valor para DMX | Anclaje | Quién | Prioridad |
|---|---|---|---|---|---|---|
| B1 | **Brand Monitoring (menciones públicas de keyword)** | Crawler busca menciones de keyword en TikTok · Twitter · News · Blogs · Web | Monitorea reputación de DMX/desarrolladora/asesor en redes | 🔗 integra Apify Trends (ya tenemos) + ⚙️ BE-nuevo crawler | 🟦 emergent | 🟡 P3 |
| B2 | **Storm Alerts configurables (% variación)** | Alerta cuando volumen menciones > 200% o alcance > 500% vs período anterior | Detecta crisis o viralidad temprano | ⚙️ BE-nuevo anomaly detection + 🎨 FE-nuevo configurador | 🟦 emergent | 🟢 P4 |
| B3 | **Influence Score 0-10 por autor** | Score de impacto de cada autor que menciona la marca | Identifica voces clave para PR · partnerships | ⚙️ BE-nuevo scoring algorithm | 🟦 emergent | 🟢 P4 |
| B4 | **AI Insights con citas verificables [1][2]** | Mismo concepto que H1 · referencias numeradas a fuentes | duplicado con H1 | - | - | - |
| B5 | **Sentiment auto + manual override** | IA clasifica sentimiento · usuario puede corregir | Mejora dataset · mejor calidad insights | 🔗 integra LLM + 🎨 FE-extender dropdown | 🟦 emergent | 🟢 P4 |
| B6 | **Lightning Search (búsqueda semántica)** | Embeddings sobre menciones · búsqueda por significado no keywords | Find "burbuja inmobiliaria" aunque no use ese término exacto | 🔗 integra Vector DB + LLM embeddings | 🟦 emergent | 🟢 P4 |
| B7 | **Demografía de autores (age · gender · country)** | Perfil agregado de quienes hablan del tema | Valida si audiencia orgánica = target | 🔗 integra Clearbit/SimilarWeb + ⚙️ BE-nuevo | 🟦 emergent | 🟢 P4 |

---

## 📊 Resumen consolidado · features únicas a integrar en DMX

**Total únicas (deduplicadas):** ~95 features
**Distribución por prioridad:**
- 🔴 P1 crítico: **9 features** (~7 semanas implementación)
- 🟠 P2 alto: **28 features** (~12 semanas)
- 🟡 P3 medio: **35 features** (~10 semanas)
- 🟢 P4 bajo: **23 features** (post-MVP)

**Distribución por quién:**
- 🟦 emergent: **~70 features** (módulos grandes · workflows · integraciones)
- 🟩 Claude Code: **~15 features** (CSS · refactor · sweeps · configs · seeds)
- 🟨 mixto: **~10 features** (emergent base · Claude Code polish)

**Distribución por anclaje:**
- 📦 ambos (FE+BE): ~50 features
- 🎨 solo FE: ~20 features
- ⚙️ solo BE: ~10 features
- 🔗 integra (terceros): ~15 features

---

## 🎯 Lista priorizada para los próximos 8 batches de Wave 5 (asesor track)

### W5.ASR.1 — WhatsApp QR + Inbox (40-50h) · 🟦 emergent
**Features incluidas:**
- L1 WhatsApp QR + OAuth FB (no API)
- L2 Inbox 3 columnas
- L3 Fast Replies con `/snippet` + variables
- L11 Filtros bandeja
- L12 Asignación dropdown
- L13 Sidebar Atributos editable inline
- T5 Auto-asignación al agente de la propiedad

### W5.ASR.2 — Pipeline + Lead Profile 360° (35-45h) · 🟦 emergent + 🟩 CC fix
- E10 Hard validations entre stages (🟩 fix el bug founder reportó)
- E11 Sub-pipelines Compradores vs Vendedores
- G2 Pipeline inmobiliario 19 etapas seed (🟩 seed data)
- F2 Activity Feed unificado
- L8 Audit log del lead
- F7 People relationships
- H17 Multi-stakeholder con roles
- Buyer Profile estructurado (campos nuevos)

### W5.ASR.3 — HOY + Smart Lists + Tareas (25-35h) · 🟦 emergent + 🟩 CC polish
- F1 Smart Lists con badge contador
- T1 Widget Pendientes con tiempo inactividad
- T2 Estado Actual snapshot
- T7 Próximos vencimientos
- W1 Important Dates auto
- F12 Tipos de tarea con iconos
- Tasks con push notifications (PWA)

### W5.ASR.4 — Captaciones → Mis Propiedades · CMA + Wizard (30-40h) · 🟦 emergent
- E3 Wizard 4 pasos con Mapbox
- E1 CMA Análisis Comparativo 15 comparables
- E4 Vista grid + mapa
- E5 Listas compartibles
- E7 Compartir con mis datos
- E2 Reporte propietario auto mensual
- H6 Documents tracking

### W5.ASR.5 — Sequences + Templates IA + AI Tools (30-40h) · 🟦 emergent
- W2 Drip Campaigns multi-canal
- F3 Action Plans con pausa al detectar respuesta
- R3 Snippets con `#`
- R5 AI Prompts (Change tone · Translate · Fix · Simplify)
- L10 Resumen IA conversación
- H1 Breeze-style citas verificables
- C1 AI Context de negocio
- Templates HSM-equivalent para WA

### W5.ASR.6 — Email-to-Lead + Forms + Calendar (25-35h) · 🟦 emergent
- W4 Email-to-Lead Parsing con alias único
- W6 Capture Forms embebibles
- G4 Forms/Funnels builder
- G5 Calendar booking público
- W5 Lead Rules Engine
- E8 Alertas búsqueda guardadas

### W5.ASR.7 — Workflows + Reports + Notifications (35-45h) · 🟦 emergent
- R1 Workflow Builder visual
- H18 Workflows con 55 triggers
- R8 Reports completos (11 dashboards)
- T3 Performance comparativa período anterior
- H10 Notifications cross-CRM con @mentions
- F4 @Mentions en notas

### W5.ASR.8 — Mobile-first refactor + Cleanup (40-50h) · 🟩 Claude Code + 🟨 mixto
- Refactor todos los layouts a mobile-first
- Sidebar 17 → 8 tabs (consolidar)
- Rename Captaciones → Mis Propiedades
- Mover Mi perfil + Ranking a menú usuario
- Mover Briefings/Tráfico+Clima → tab Atlax
- L9 Banner desconexión
- L15 Reordenamiento dinámico realtime
- F15 Sound notification
- H11 Cmd+K búsqueda global
- F10/F11 Keyboard shortcuts

**Total Wave 5 asesor track:** ~260-340h (~6-8 semanas con 1 senior)

---

## ⚠️ Features descartadas o bajísima prioridad para DMX

- **G9 WhatsApp Flows (Meta)** · requiere Business API · NO compatible con QR · descartado
- **G8 Stripe Charge desde workflow** · DMX no procesa pagos directos · post-Wave 6
- **B6 Lightning Search semántica** · feature avanzada · post-MVP
- **B7 Demografía** · requiere data provider externo · costo alto
- **H13 Tickets servicio post-venta** · útil pero baja frecuencia
- **W8 Family fields (pets · spouse)** · over-engineering para CDMX
- **C9 Dry-run agente IA** · feature dev · no usuario

---

## 🔑 Aclaración técnica · WhatsApp QR (correctiva)

**Lo que hace Leadsales/Tokko y replicamos en DMX:**

1. Asesor en DMX hace OAuth con Facebook (vincula su cuenta personal de FB)
2. DMX detecta páginas de FB Business del asesor · le pide elegir cuál
3. Backend usa Meta Graph API + protocolo WhatsApp Web (whatsapp-web.js o baileys library)
4. Backend genera QR code · frontend lo muestra
5. Asesor escanea QR con su WhatsApp del celular (como WhatsApp Web)
6. Sesión queda activa · mensajes llegan al backend via webhooks
7. Asesor puede tener su celular apagado · pero la sesión WA debe mantenerse viva en backend

**Implicaciones:**
- Costo: $0 (sin API oficial)
- Risk: Meta puede banear el número si detecta uso comercial (mitigar con rate limits)
- Tech stack: `whatsapp-web.js` (Node.js) o `Baileys` (TypeScript) · ambos open source
- Backend mantiene WebSocket con Meta WhatsApp Web servers
- Si conexión cae · banner reconnect (L9)

**Alternativa post-MVP (cuando volumen justifique):** migrar a WhatsApp Business API oficial vía 360dialog · gana legalidad y estabilidad · pierde costo $0.

---

## Próximos pasos

1. Founder revisa esta matriz · valida prioridades · descarta features que no quiere
2. Confirma orden de batches (W5.ASR.1 → W5.ASR.8)
3. Por cada batch · armo prompt detallado para emergent (~150 líneas siguiendo plantilla canónica)
4. emergent shipea · Claude Code cleanup post-push · founder valida

**Última actualización:** 2026-05-15
**Mantenedor:** Claude Code · founder Manuel Acosta
