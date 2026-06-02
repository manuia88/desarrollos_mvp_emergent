# Asesor · Catálogo CONSOLIDADO de Upgrades (priorizado por olas)

> 2026-05-29 · Consolida TODOS los upgrades acumulados en la sesión de rediseño (perfil-hub + bandeja Conversaciones). Diseño aprobado: tema claro, acento violeta #6D4AFF + degradado violeta→rosa en hero, tarjetas blancas con relieve, secciones con filo de color. Mockups: `mockups/asesor-leads-cockpit.html` (Leads + perfil-hub 4 tabs) y `mockups/asesor-conversaciones.html` (bandeja 3 columnas estilo GHL). Regla: TODO additive, reusa motores existentes, NO mueve backend de forma destructiva. Ver también CRM_HUB_ARCHITECTURE.md (arquitectura) y ASESOR_REDESIGN_APPROVED.md (diseño Leads).
> Nota: NO hay telefonía/llamadas (founder lo quitó). Todo seguimiento es por WhatsApp/IG/FB/TikTok/LinkedIn + notas internas.

## OLA 1 — Base (perfil-hub + bandeja) · frontend-first, reusa lo existente
- **Perfil-hub 4 tabs**: Resumen · Propiedades · Conversaciones · Actividad. Unifica las 2 vistas que competían (ContactDetail + Ficha360).
- **Header del perfil**: avatar+nombre, temperatura, % cierre, **mover etapa del pipeline** (chips Nuevo→Cerrado), WhatsApp + Agendar, "Asignada a ti".
- **Resumen**: Datos del cliente + **enriquecimiento** (redes verificadas LinkedIn/IG/FB · `lead_enrichment_engine`) · **DISC "Cómo tratarla"** (`conversation_disc_adapter`, DiscProfileCard) · Qué tan listo (anillo de score) · Qué busca · **Pendientes** (tareas/citas + completar) · Avance al cierre.
- **Co-piloto contextual** en el perfil (Resumir · Redactar seguimiento · ¿Qué le ofrezco?) — `copilot/asistente_engine/conversation_engine`.
- **Tablero de propiedades por contacto** (kanban estatus por propiedad) + **Link Tinder** (swipe 👍/👎, búsqueda MLS embebida, `marketplace_search`/`fit_engine`/`buyer_score`).
- **Importar link de propiedad del cliente automático** (`studio_listing_importer`) → se agrega a su catálogo.
- **Bandeja global de Conversaciones** (3 columnas estilo GHL): lista de leads (prioridad IA) + hilo multicanal + **panel de contexto** (Datos · Citas · Tareas · Notas).
- **Multicanal con canales activos**: solo aparecen canales con mensajes (WA/IG/FB/TikTok/LinkedIn) + "+ canal" manual. Responder por el último canal de entrada. `conversation_channels`.
- **Actividad**: notas + tareas + citas (+ Nota/Tarea/Cita, completar) + timeline de eventos.
- **Consentimiento LFPDPPP** registrado (cumplimiento MX).
- Backend additive: agregador `GET /api/asesor/contactos/{cid}/overview`, colección tablero+estatus por propiedad, wrapper docs advisor-scoped.

## OLA 2 — IA/ML surfacing + bandeja inteligente (reusa motores, hacerlos visibles)
- **Borrador IA listo** por conversación (1 clic enviar) — `ai_suggestions`. Badge "Borrador IA" en la lista.
- **Resumen + intención** por conversación (precio/visita/objeción/spam) — `conversation_engine`.
- **Señales IA** en perfil: **mejor hora + canal de contacto** (`behavioral_tracking_engine`) · **riesgo de enfriamiento con razón** (`churn_prediction_engine`).
- **Oferta sugerida óptima** ("$7.4M · 82% prob.") — AVM + comparables (`avm`, `cma_engine`).
- **Sentimiento (ánimo) + estado** de la conversación (`conversation` sentiment/confidence) — versión clara, sin jerga.
- **Objeción detectada** + cómo responder.
- **Recalibrado por rechazo** (swipe → preferencia revelada ajusta búsqueda) — `fit_engine` + `behavioral_tracking`.
- **Recomendación de propiedades al tablero** ("3 en Polanco 92% fit") — `fit_engine`.
- **Engagement del link** ("abrió hace 2h · vio 8 · 👍3") — `behavioral_tracking`.
- **Auto-traducción EN/PT** de mensajes (internacional · Dubái).
- **SLA de respuesta** (escalado de color si se pasa) + **Snooze** (posponer conversación).

## OLA 3 — Automatización + equipo
- **Piloto automático del lead** (pipeline se mueve solo + cadencia por etapa) — `auto_pilot_engine`, `auto_nurture_cron`, `lead_nurture_engine`. Toggle visible y controlable.
- **Constructor de workflows visual** (si pasa X → haz Y, estilo GHL) — `workflow_engine`, `workflow_queue`.
- **Anti-no-show + post-visita**: recuerda la cita al cliente solo; tras la visita, pide feedback automático (`feedback de visita estructurado`).
- **Reactivación de dormidos** 30/60/90 días (campaña automática) — `lead_nurture_engine`.
- **Asignar conversación a compañero** + filtro "asignadas a mí" + **acciones en lote** (marcar leídas/asignar/etiquetar) + **round-robin** de leads entrantes.
- **Auto-armar tablero desde la conversación** + **aviso inteligente al swipe**.

## OLA 4 — ML avanzado + cierre/distribución
- **Forecast de comisiones del mes** (ingreso esperado según pipeline) — `forecast_engine`.
- **Score que aprende de TUS cierres** (personalizado por asesor) — `buyer_score_cron`/retrain.
- **Lead falso / duplicado** (números falsos, bots, mismo comprador en 2 canales) — `fraud_detection_engine` + `entity_resolution_engine`.
- **Entrenador / role-play** (practicar objeciones contra cliente simulado) — `coaching_analysis`.
- **Generación de propuesta/contrato** desde el deal — `brochure_engine`/`documents`/`studio`.
- **Extracción de compromisos** de los chats ("prometiste mandar la ficha") — `conversation_engine`.
- **Win/loss analysis** (por qué se perdió un lead) — patrones.
- **Panel de estado por portal** + validación pre-publicación (distribución) — `mcp_distribution`.
- **Atribución de ROI por canal** (qué portal da leads que cierran) — `tracking_links`, `widget_embed_analytics`.

## OLA 5 — Otros / plataforma
- **Metas + gamificación + ranking de equipo** — `team_productivity`, `leaderboard`.
- **App móvil / PWA** (trabajar desde el celular).
- **Nota por voz** (dictado interno · `voice`) · **Programar envío** de mensajes · **Respuestas rápidas/snippets** (plantillas por canal).
- **Onboarding guiado / tours** que explican qué es/hace cada parte.

## REGLAS DE CONSTRUCCIÓN
- Frontend-first; backend solo additive (endpoints/colecciones nuevas, rutas nuevas — nunca cambiar firmas). Tenant/owner isolation. `contacto_id` = llave universal. NO tocar superadmin (documentos = wrapper advisor-scoped, Claude Code). Protocolo quirúrgico + tags rollback + audit doble por fase.
- Construir por olas: O1 (base, ~60% ya existe) → O2 (surfacing IA) → O3 (automatización) → O4 (ML avanzado) → O5 (plataforma).
