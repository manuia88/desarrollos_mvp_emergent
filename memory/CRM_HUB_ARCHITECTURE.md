# Perfil del Cliente como HUB de Control · Arquitectura (análisis repo)

> 2026-05-29 · Resultado del análisis multi-agente (workflow crm-hub-analysis). Visión founder: el perfil del cliente en el CRM = centro de control de TODAS las acciones del cliente (tareas, notas, calendario, documentos, historial, feedback IA, workflow post-cierre, marketing, videos), reusando el backend que ya existe en otros módulos, scopeado por cliente, para simplificar el trabajo del asesor.

## HALLAZGO CLAVE (te conviene)
**~60% del hub YA está construido** y `contacto_id` ya es la **llave universal** que conecta todo. No hay que crear modelo nuevo — es casi todo wiring, no construcción.
- `contacto_id` (= `asesor_contactos.id`) ya es la clave de join probada: `close_probability.py`, `asesor_busquedas`, `asesor_operaciones`, `asesor_contacto_timeline` todos la usan.
- YA EXISTE un agregador: `GET /api/asesor/lead/{lead_id}/insights` + `services/client_insights.compute_client_insights(db, lead_id)` + **`ClientInsightsTab.js`** — ya juntan: actividad 30d, atribución multi-touch, qué vio/favoritos, conversaciones con sentiment, próxima acción sugerida.
- Aislamiento: `owner_id == user.user_id` (per-asesor) en contactos/busquedas/operaciones/tareas/timeline; `tenant_id` en conversation.
- **Glue nuevo = delgado:** (1) agregador `GET /api/asesor/contactos/{cid}/overview` (fan-out a engines existentes → timeline unificado); (2) wrappers advisor-scoped para documentos/videos que NO tocan superadmin (solo índice `asesor_contacto_links` con owner_id). Lo de otros dominios (video de propiedad, doc de desarrollo) se **referencia por link, no se duplica**.

## PROBLEMA A RESOLVER
Hoy coexisten **DOS vistas de perfil que compiten**: `ContactDetail` (drawer 620px en AsesorContactos.js) y el bento `Ficha360.js`. Hay que **unificar en UNA** (base = Ficha360, el patrón premium).

## LAYOUT DEL PERFIL-HUB (3 capas)
1. **Header fijo:** avatar+nombre · TemperaturePill · ScoreBar (buyer_score ya viene inline) · % cierre (getCloseProbability ya wired) · fuente · **próxima acción IA** (de client_insights) + botón "Hacer ahora".
2. **Action Bar (acciones rápidas, reusa QuickActions+ActionBar):** Llamar · WhatsApp (wa.me ya construido) · Agendar · Nota rápida · Plan venta IA (ArgumentarioForm ya wired) · Generar video/brochure (deep-link).
3. **5 Tabs (lazy-load):**
   - **Resumen** (default): bento Ficha360 + ClientInsightsTab (ya hace casi todo).
   - **Actividad:** timeline UNIFICADO (notas+visitas+ofertas+cambios stage+mensajes IA+citas+docs) del agregador /overview. Input de nota inline (addTimelineEntry ya existe).
   - **Pipeline / Cierre:** busquedas + operaciones del contacto (workflow post-oferta) · chips de stage con transiciones legales del backend · deep-link a op-prefill.
   - **Conversaciones IA:** lista `/api/conversation/lead/{cid}/conversations` + sentiment + confidence (read-mostly).
   - **Documentos & Media:** docs del contacto (wrapper nuevo) + deep-links a videos/brochures de sus propiedades.
   - Regla Ficha360: bloques SIN datos se OCULTAN. Tareas y calendario NO son tab (tarea = acción rápida + aparece en Actividad; calendario = botón Agendar + chips de citas en header).

## POR ÁREA (approach · reuso · glue · esfuerzo)
| Área | Cómo | Reuso | Glue nuevo | Esfuerzo |
|---|---|---|---|---|
| Notas/Timeline | inline | POST contactos/{cid}/timeline + getContacto (100% existe) | ninguno | XS ~1h |
| Tareas | acción+inline | GET/POST /tareas, done, delete | param additive `?contacto_id=` + createTarea entity_id | S ~2-3h |
| Calendario/Visitas | acción+deep-link | oauth_calendar create_event, visit-briefing, busquedas/{bid}/visit | contacto_id en metadata + chips citas | M ~4-5h |
| Documentos | tab (wrapper) | document_intelligence, drive_engine | **wrapper advisor-scoped + colección asesor_contacto_docs · NO tocar routes/documents.py (superadmin)** | M-L ~6-8h · Claude Code |
| Historial (vistas/favoritos/atribución) | tab Resumen | client_insights + ClientInsightsTab (ya existe) | re-hospedar tab | S ~2h |
| Feedback IA status/conversación | tab+header | /api/conversation/lead/{cid}/conversations, confidence, drift | api client JS nuevo + tab read-only | S-M ~3-4h |
| Workflow post-oferta/cierre | tab Pipeline | busquedas+operaciones (máquinas de estado validadas), op-prefill, conversation_workflow_bridge | filtro client-side por contacto_id (sin endpoints nuevos) | M ~4-5h |
| Marketing | deep-link | marketing_mcp, lead_nurture, lead_journey (LeadJourneyTimeline existe), pause-nurture | deep-links + 1-2 acciones nurture | S ~2-3h |
| Videos propiedades | deep-link | studio_video_engine, /api/studio (property-scoped) | deep-links contextuales (cruce via favoritos/history) | XS-S ~1-2h |

## PLAN POR FASES
- **F0 · Consolidar el perfil (SIN backend nuevo):** unificar ContactDetail + Ficha360 en UN componente (header+actionbar+tabs) + re-hospedar ClientInsightsTab como "Resumen". Ya da ~60% del hub. Riesgo casi nulo, additive UI.
- **F1 · Agregador timeline:** `GET /api/asesor/contactos/{cid}/overview` (fan-out, FAIL-OPEN por fuente) → tab Actividad. Claude Code.
- **F2 · Pipeline + Tareas scopeadas:** tab Pipeline (filtro client-side) + tarea como acción (param additive). Bajo riesgo.
- **F3 · Conversaciones IA + Calendario:** api client conversations (tab read-only) + acción Agendar (contacto_id en metadata) + surfacing close_probability/next-action en header.
- **F4 · Documentos (wrapper advisor-scoped):** AL FINAL · mayor riesgo (adyacencia superadmin/storage). **Claude Code OBLIGATORIO, ULTRA-defensivo.** Colección nueva + reuso drive_engine, SIN tocar routes/documents.py.
- **F5 · Deep-links marketing/journey/videos:** acciones contextuales. Puro front + reuso de endpoints lead_id-scoped.

## RIESGOS (del análisis)
- **Aislamiento owner_id vs tenant_id:** el CRM aísla por owner_id; conversation por tenant_id. El /overview DEBE aplicar owner_id en fuentes asesor_* Y pasar tenant_id correcto al ConversationEngine. No mezclar o se filtran datos cross-asesor.
- **Documentos = ZONA AURORA:** routes/documents.py es 100% superadmin (dev_id). Wrapper lo hace Claude Code en /api/asesor con colección nueva, sin importar/modificar superadmin. Docs de desarrollo solo por link.
- **contacto_id vs lead_id vs user_id:** join funciona por fallback `$or` + puente email→user_id. history/favoritos/buyer_scores viven bajo user_id del comprador; si el contacto no tiene email matcheable, esos bloques vienen vacíos (esperado, se ocultan).
- **Additive-only:** `?contacto_id=` y filtros nuevos con default = comportamiento actual. Endpoints nuevos = rutas nuevas, nunca cambian firmas.
- **Dos vistas en paralelo:** consolidar puede romper data-testid de tests Playwright. Preservar: contacts-table, add-note-input, open-arg, wa-contact.
- **Performance /overview:** fan-out a 5-6 colecciones → limitar cada fuente + cachear bloque caro (client_insights ya tiene cache) + lazy-load por tab.
- **NO-ORPHANS:** /overview y wrapper docs deben quedar wired al perfil en el mismo batch o no commitear. ClientInsightsTab hoy apunta al EntityDrawer viejo → al migrar, no dejar host huérfano.

## NOTA DE MÉTODO
Los 8 agentes de mapeo (Explore+schema) fallaron StructuredOutput (caveat conocido: Explore+schema). El agente arquitecto (sin schema-Explore) exploró el repo directo y produjo este análisis con evidencia de archivo. Para futuros workflows de mapeo: usar agentType default (no Explore) cuando se requiere schema, o pedir texto y parsear.
