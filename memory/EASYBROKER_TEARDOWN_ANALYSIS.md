# EasyBroker Teardown × DMX · Análisis y Plan de Upgrades

> 2026-05-29 · Fuente: ~/Desktop/EasyBroker-Teardown (84 videos, 10 módulos destilados) cruzado contra el código real de DMX (repo desarrollos_mvp_emergent, branch main). Solo lectura. Clasificación honesta ✅ ya existe / ⬆️ mejorable / ❌ falta, con evidencia de archivo.
> Nota: el prompt original del founder traía constraints de OTRO proyecto (Supabase, "Dopamine Edition", crema #F5F3F0, Outfit/DM Sans, docs/upgrades/). DMX = MongoDB + aurora var(--theme-*) + gradiente #6366F1→#EC4899. Se usó solo la metodología (matriz ✅/⬆️/❌).

## VEREDICTO EJECUTIVO
**DMX no necesita "alcanzar" a EasyBroker — ya lo rebasó en capacidad.** El teardown asume que DMX debe *construir* la capa de inteligencia (AVM con precios de cierre, scores de zona, lead score, home prescriptivo, atribución ROI, captaciones). **Casi todo eso YA está construido** (W5/W6/W7). EasyBroker es ancho en *distribución* (su foso: Bolsa MLS ~500k + multi-portal), pero **descriptivo, no inteligente**. DMX es lo contrario: profundo en inteligencia, con la distribución como frente a reforzar.

Evidencia de capacidad DMX (engines reales):
- **AVM completo:** avm_public_engine, avm_cache, avm_explain_engine, avm_retrain_cron, hedonic_regression_engine, golden_avm_data, model_validation_engine, weight_optimizer → EB usa **precio de publicación**; DMX tiene **AVM con cierre real + retrain**. Rebasa por completo el CMA de EB.
- **Forecast + bandas de confianza:** forecast_engine, forecast_retrain_cron, fsd_engine (Forecast Std Dev), probability_engine, close_probability.
- **Scores de zona:** zone_score_engine, zone_subscores_compute/cron, drpi_engine, public_zones, risk_score_engine, crime_data_engine, perception_risk_engine.
- **Lead score ML:** buyer_score_engine + cron, fit_engine, lead_match, recommendations → EB tiene **probabilidad manual** (estrellas a criterio humano).
- **Conversación IA omnicanal:** conversation_engine + suggested replies + confidence + drift + ab_testing + cost + whatsapp_engine → EB solo centraliza, envía a WhatsApp/email externos.
- **Studio de contenido IA:** studio_video/carrusel/brand_kit/auto_content/landing/buyer_copy/listing/narrative → EB **manda al agente a un blog externo** para redactar títulos.
- **Captaciones:** AsesorCaptaciones + live_pulse (brecha oferta-demanda) → **EB NO tiene módulo de captación (0/84 videos).**
- **Home prescriptivo:** command_center_actions + agent_workforce + predictive_alerts + health_score → EB tiene home descriptivo ("cuántos").
- Extra que EB ni contempla: knowledge_graph, battle_card (intel competitiva), construction_quality, virtual_staging, tour_3dgs, transaction_network, trends/apify, gov_data_mx.

## MATRIZ POR MÓDULO (resumen · evidencia en código)

### Contactos / CRM
| Feature EB | DMX | Evidencia |
|---|---|---|
| Ficha lead (datos/fuente/asignado/tags) | ✅ | advisor.py contactos, AsesorContactos.js |
| Historial categorizado + adjuntar propiedad | ✅ | addTimelineEntry, timeline |
| Descripción privada | ✅ | ficha contacto |
| Probabilidad de cierre | ✅ **STRONGER** (ML, no manual) | close_probability.py, probability_engine, buyer_score_engine |
| Matching propiedades por contacto | ✅ **STRONGER** (fit ranking) | fit_engine, lead_match, buyer_alerts, comparable_alerts |
| Leads enfriándose (N días) | ✅ | nurturer (agent_workforce), auto_nurture_cron, lead_nurture_engine |
| Bulk + Pin | ✅ | P5.B bulkContactos, pinContacto |
| Convo segmentación + respuestas sugeridas IA | ✅ **STRONGER** | conversation suggested replies, confidence |
| Funnel analytics | ✅/PARTIAL | funnel.py, pipeline_drift_personal, team_productivity |
| **Estatus personalizables (nombre/color/posición)** | ⬆️ | etapas existen; personalización por usuario falta |
| **Tabla columnas configurables / vistas guardadas** | ⬆️/❌ | smart_lists filtra; columnas custom faltan |
| **Kanban drag-drop en Leads** | ⬆️ | búsquedas YA tiene kanban full (AsesorBusquedas: drag/stage); contactos ligero → el rediseño Leads lo agrega |
| **Inbox directas vs compartidas + permisos equipo** | ⬆️ | ConversationInbox fuerte en IA; modelo team-share falta |
| **Tablero colaborativo cliente↔asesor (link, cliente edita)** | ❌ FALTA | no existe board cliente-editable (fit/smart_lists/watchlist son del lado asesor) |

### Propiedades / Inventario
| Feature EB | DMX | Evidencia |
|---|---|---|
| Alta propiedad (campos/fotos/docs) | ✅ | desarrollos, captaciones, studio_property_intake |
| Ficha hub (badges/tags/priv/relacionados) | ✅ | AsesorDesarrollos/Inventario |
| PDF ficha técnica profesional | ✅ | brochure_engine, cma_pdf_renderer, studio_landing_pdf |
| Sugerencia de precio al capturar | ✅ **STRONGER** | avm, score_inversion, comparable |
| Redacción IA título/descripción | ✅ **STRONGER** | studio_buyer_copy, studio_listing, narrative |
| Listing health / publicabilidad | ✅/PARTIAL | free_audit_engine, studio_hook_score, construction_quality |
| Dato de cierre alimenta AVM | ✅ **STRONGER** | avm_retrain_cron, golden_avm_data |
| Bloque inteligencia de mercado en ficha | ✅ **STRONGER** | zone scores, drpi, forecast, widget_embed |
| **Validación pre-publicación por portal** | ⬆️ | asesor_daily_tools parcial; UX de avisos delgada |
| **Panel estado de sincronización por portal + errores** | ⬆️ | mcp_distribution distribuye; panel estado/errores accionables falta |
| **Archivar vs estatus (separación)** | ⬆️/? | verificar UX |
| **Tablero colaborativo** | ❌ | igual que CRM |

### Búsquedas
| Feature EB | DMX | Evidencia |
|---|---|---|
| Filtros + mapa split + clustering | ✅ | maps_engine, marketplace_map, search_prefs |
| Alertas guardadas ligadas a contacto | ✅ | buyer_alerts, scheduler_saved_search_alerts, comparable_alerts |
| Matching por fit (no binario) | ✅ **STRONGER** | fit_engine, reverse_search_engine, lead_match |
| Brecha oferta-demanda | ✅ **STRONGER** | live_pulse, trends → alimenta Captaciones |
| Búsqueda lenguaje natural | ✅/PARTIAL | reverse_search, conversation |
| **Silenciar alertas por estatus** | ⬆️/? | verificar |
| **Guardar a tablero desde mapa** | ❌ | depende del tablero (gap) |

### Estadísticas / CMA
| Feature EB | DMX | Evidencia |
|---|---|---|
| CMA (comparables, mapa, PDF/Excel, comentarios) | ✅ | cma_engine, cma_pdf_renderer, cma.py |
| CMA con precio de **cierre** real | ✅ **STRONGER** (EB usa publicación) | golden_avm_data, avm |
| Selección/ponderación auto comparables + outliers | ✅ **STRONGER** | comparable_anomaly_engine, hedonic_regression |
| Banda confianza + días-en-mercado + prob venta | ✅ **STRONGER** | fsd_engine, forecast, probability_engine |
| Scores de zona en CMA | ✅ **STRONGER** | zone_score_engine, zone_subscores |
| Reportes desempeño por asesor/periodo | ✅ | team_productivity, asesor_metrics, metrics_cube |
| Reportes predictivos + benchmark mercado | ✅ **STRONGER** | forecast, predictive_alerts, battle_card |

### Operaciones
| Feature EB | DMX | Evidencia |
|---|---|---|
| Cierre (precio/fechas/split comisión) | ✅ | operaciones, comisiones (advisor.py) |
| Privacidad por permisos | ✅ | permissions.py, data_scoping |
| Gestión documental | ✅ | documents.py, document_intelligence |
| Precio de cierre alimenta AVM | ✅ **STRONGER** | avm_retrain |
| **Pipeline de cierre (oferta→apartado→contrato→escrituración)** | ⬆️ | hay stage/etapa; embudo completo con hitos falta |
| **Dashboard de ingresos (proyectado vs cerrado)** | ✅/PARTIAL | comisiones; forecast de ingreso |

### Tareas
| Feature EB | DMX | Evidencia |
|---|---|---|
| Tareas ligadas contacto+propiedad | ✅ | tareas (advisor.py), AsesorTareas |
| Auto-generación / cadencias | ✅ **STRONGER** | auto_nurture_cron, lead_nurture, autopilot, agent_workforce |
| Priorización por lead score | ✅ **STRONGER** | buyer_score, command_center priority |
| Integración calendario | ✅ | oauth_calendar.py, CalendarSettings |
| Recordatorios push+email + vencidas | ✅/PARTIAL | notifications, digest |
| **Feedback de visita estructurado → reporte propietario** | ❌ FALTA | no existe rating estructurado de visita |

### Dashboard / Home / Equipo / Config
| Feature EB | DMX | Evidencia |
|---|---|---|
| Home prescriptivo "qué hacer ahora" | ✅ **STRONGER** | command_center_actions, agent_workforce, "Foco de hoy" |
| Score de salud de cuenta | ✅ | health_score.py |
| Alertas management proactivas | ✅ **STRONGER** | predictive_alerts, risk_alerts |
| Audit log | ✅ | audit_log, audit_immutable_engine, superadmin_audit |
| Roles / equipo / ranking | ✅ | internal_users, team_productivity, AsesorRanking, leaderboard |
| Perfil independiente vs inmobiliaria | ✅/PARTIAL | asesor_identity, inmobiliaria |
| Integraciones / API / webhooks | ✅/PARTIAL | connector_registry, public_api_v1, mcp_distribution |
| **Última actividad real por usuario (admin)** | ⬆️/? | verificar |
| **Checklist de activación / onboarding guiado** | ⬆️/❌ | probable gap |
| **Tours interactivos in-app** | ❌ | gap |
| **App móvil con paridad** | ❌ | web-first |

### Marketing / Distribución
| Feature EB | DMX | Evidencia |
|---|---|---|
| Generación de contenido IA (video/carrusel/landing/brand) | ✅ **MASSIVELY STRONGER** | studio_* (EB no tiene nada) |
| Inteligencia de zona embebida en fichas públicas | ✅ **STRONGER** | widget_embed, zones_public |
| Marketplace público + micrositio agente | ✅ | marketplace_*, asesor_identity perfil-publico, AsesorPerfil |
| Compartir con mis datos | ✅ | share_meta, social_cards |
| Red de colaboración + comisión compartida | ✅ | partners, transaction_network, mcp_distribution |
| Moderación de anuncios | ✅/PARTIAL | compliance, fraud_detection |
| **Distribución multi-portal (envío auto/masivo)** | ⬆️ | mcp_distribution existe; envío masivo + directorio gratis/pago a reforzar |
| **Panel estado por portal + errores + export** | ⬆️ | igual que Inventario |
| **Atribución ROI por canal** | ✅/PARTIAL | tracking_links, widget_embed_analytics, tour_analytics |
| **Multi-idioma auto-translate EN/PT de fichas** | ⬆️ | i18n es-MX/en-US; PT + traducción auto de listings falta |
| **Sitio web propio multi-página (no solo landings)** | ⬆️/? | studio_landing existe; sitio completo a verificar |
| **Enlace único de colección (tablero)** | ❌ | depende del tablero (gap) |

### Captaciones
**EB = ❌ inexistente (0/84). DMX = ✅ lo tiene** (AsesorCaptaciones + brecha oferta-demanda live_pulse + valuación AVM como pitch). Ventaja por default. ⬆️ posible: pipeline completo de propietarios + generador de "listing pitch".

## GAPS REALES — lo que SÍ vale sumar (lista corta, honesta)
Descartado todo lo redundante. Solo ⬆️/❌ con impacto:

| # | Oportunidad | Tipo | Módulo | Impacto/Esfuerzo |
|---|---|---|---|---|
| 1 | **Tablero colaborativo cliente↔asesor** (shortlist por link, cliente arrastra/comenta, co-edición) ligado al CRM como señal de lead score | ❌ FALTA · diferenciador EB | Leads + Inventario | 🔴 Alto / Medio-Alto |
| 2 | **Panel de estado de publicación por portal** + validación pre-publicación + errores accionables | ⬆️ | Inventario + Marketing | 🔴 Alto / Medio |
| 3 | **Estatus de contacto personalizables** (nombre/color/posición) + **tabla con columnas configurables/vistas guardadas** | ⬆️ | Leads | 🟡 Medio / Bajo |
| 4 | **Feedback de visita estructurado** (rating precio/ubicación/estado) → reporte al propietario | ❌ | Agenda/Tareas + Captaciones | 🟡 Medio / Bajo-Medio |
| 5 | **Inbox: conversaciones directas vs compartidas + permisos de equipo** (DMX fuerte en IA, débil en modelo team-share) | ⬆️ | Conversaciones IA | 🟡 Medio / Medio |
| 6 | **Onboarding guiado / checklist de activación** + tours in-app | ⬆️/❌ | transversal | 🟡 Medio / Bajo |
| 7 | **Multi-idioma EN/PT** con auto-traducción de fichas públicas (captar internacionales — fuerte en Dubái) | ⬆️ | Marketing/público | 🟡 Medio / Medio |
| 8 | **Kanban drag-drop en Leads** + acciones rápidas en card | ⬆️ (YA en plan rediseño) | Leads | ✅ cubierto por rediseño |

## TOP 5 PRIORIZADO (impacto/esfuerzo) + cómo conecta con el rediseño en curso
1. **Tablero colaborativo cliente↔asesor** — el feature estrella de EB que DMX no tiene. **Conecta nativo con el rediseño de Leads** (patrón tablero↔contacto) y con el drawer 360°. Cierra ciclo: las acciones del cliente alimentan el lead score que ya tenemos.
2. **Kanban Leads + estatus personalizables + tabla configurable** — **ya es parte del rediseño** (pipeline + cards premium). Sumar customización de estatus es barato y de paridad.
3. **Panel de estado de publicación por portal** — paridad crítica de mercado; el motor de distribución ya existe, falta la capa UX de estado/errores.
4. **Feedback de visita estructurado** — barato, cierra ciclo comprador↔propietario, alimenta sugerencia de ajuste de precio (que el AVM ya puede dar).
5. **Onboarding guiado** — encaja perfecto con el rediseño (módulo nuevo = momento ideal para tours que expliquen cada parte, justo la queja del founder de "no se explica qué hace cada cosa").

## DECISIONES ABIERTAS (requieren input del founder)
- ¿El **tablero colaborativo** entra al rediseño de Leads como pieza nueva (sumaría alcance) o se difiere a un batch propio post-rediseño?
- ¿La **distribución multi-portal** (panel estado) es prioridad ahora o el foco se mantiene 100% en rediseño visual primero?
- Verificaciones pendientes (no bloquean): silenciar alertas por estatus, archivar vs estatus UX, última actividad por usuario, sitio web multi-página.

---

# EXPANSIÓN (founder 2026-05-29) — no limitarse · "qué más suma o amplía"

## Verdict confirmado del "Tablero de propiedades por contacto"
Modelo real DMX: `asesor_busquedas` está ligada a `contacto_id` y tiene UN `stage` (buscando→visitando→ofertando→ganada) que mueve **la búsqueda completa**; las propiedades son **matches automáticos de solo lectura** (busqueda_matches, top 12 por score; fit.py top-properties). `watchlist.py` = alertas públicas de zona. **NO existe** una lista curada de propiedades por contacto donde **cada propiedad** sea tarjeta con **su propio estatus** (contactada/rechazada/esperando respuesta/cita agendada/visitada/descartada). Gap real confirmado. DMX tiene las piezas (link + fit scoring) para hacerlo MÁS inteligente que EB.

## INSIGHT CLAVE que me faltó (la mayor oportunidad)
Gran parte de "lo que vale sumar" **NO es construir capacidad nueva** — es **HACER VISIBLE en la UI del asesor la inteligencia que YA está construida** (engines existen, superficie asesor falta o es delgada). Esto: (a) cierra ciclos (trabajo W5/W6 ya hecho, invisible), (b) es exactamente la queja del founder ("no se ve, no se explica qué hace cada parte"), (c) cae nativo en el rediseño visual. La distancia "engine existe" → "asesor lo ve/usa" es el filón.

## LISTA EXPANDIDA (organizada por los verbos del founder: implementar/sumar/crear/ampliar)

### 🎯 A · El feature que pediste (crear)
1. **Tablero de propiedades por contacto** — lista con nombre, ligada al contacto, kanban donde **cada propiedad** es tarjeta con estatus (contactada/esperando/rechazada/cita/visitada/descartada). Más inteligente que EB: el `fit_engine` auto-sugiere qué propiedades agregar y las rankea; el cliente rechaza una → la IA propone otra (matching). Conecta con el rediseño de Leads (drawer 360°).

   **1b · Link Tinder para el cliente (founder 2026-05-29 — pieza clave):** el asesor manda **UN solo link** (no 200 links sueltos) que abre una experiencia para el cliente:
   - **Modo Tinder/swipe** sobre TODAS las propiedades del tablero: 👍 me gusta / 👎 no.
   - **Búsqueda embebida en la Bolsa Inmobiliaria / MLS desde el mismo link** — el cliente descubre más inventario **sin salir de DMX** (no se va a Inmuebles24/competencia). Reusa marketplace_search + marketplace_map (público ya existe).
   - **Cada swipe regresa al asesor en tiempo real:** 👍 → estatus "interesado" + señal a buyer_score/behavioral_tracking; 👎 → estatus "descartada" + el matching propone alternativa. El cliente también agrega al tablero lo que encuentre en la Bolsa.
   - **Valor estratégico (MOAT):** retención — el cliente se queda en terreno DMX; cada deslizada es **dato de intención propietario** que alimenta lead score + matching. Convierte el "ping-pong de 200 WhatsApps" en una sola superficie medible.
   - Sin fricción (no requiere cuenta para swipe; cuenta opcional para guardar). Privacidad: ubicación aproximada en público (patrón ya existe).
   - **Piezas que se reusan:** marketplace_search/map (búsqueda MLS pública), fit_engine (ranking), buyer_score + behavioral_tracking_engine (señal), share_meta/widget_embed (link público). Lo nuevo: colección curada por contacto + estatus por propiedad + UI swipe + captura de eventos.

   **1c · Workflow del tablero de propiedades (founder 2026-05-29):** estados ricos en 2 fases.
   - **Fase A · Verificar (asesor ↔ dueño/broker):** Candidata → Preguntando disponibilidad → Disponible / No disponible.
   - **Fase B · Con el cliente:** Preseleccionada/Enviada → Le gustó 👍 / Descartada 👎 → Cita/Recorrido → Oferta.
   - **CONTROL MANUAL TOTAL DEL ASESOR (no negociable):** el asesor arrastra CUALQUIER propiedad a CUALQUIER etapa, siempre (kanban drag) + botones rápidos que cambian estado y disparan acción ("Marcar disponible", "Enviar al cliente", "Agendar", "Hacer oferta"). El swipe del cliente (👍/👎 desde el link) es UN input/señal, NO el motor — auto-marca pero el asesor decide/override. Mismo principio que copilot+manual: lo automático ayuda, lo manual manda.
   - **"Armar recorrido":** seleccionar varias propiedades (Le gustó/Cita) → genera itinerario de un día de visitas.
   - **DOS vistas del tablero:** (a) **por cliente** dentro del perfil (lo que María revisa); (b) **vista global "Propiedades en juego"** — pantalla nueva con TODAS las propiedades activas de TODOS los clientes en kanban por estado, filtrable por cliente/zona/estado; cada tarjeta indica a qué cliente pertenece ("8 esperando disponibilidad", "3 con oferta").
   - Backend additive: colección propiedad↔contacto con estado + historial de cambios; endpoints mover-estado, armar-recorrido, vista global.

   **1d · Upgrades del workflow (founder 2026-05-29 · TODAS aprobadas · additive · reusan motores existentes):**
   - **A1 · Auto-detección de respuesta del broker:** conversation_engine lee el WhatsApp ("sí está disponible") y SUGIERE mover a Disponible (1 tap, asesor confirma). Reusa conversation_engine + whatsapp_engine.
   - **A2 · Chase automático de disponibilidad:** sin respuesta en 48h → re-pregunta al broker (plantilla) o alerta al asesor "3 esperando, ¿reenvío?". Reusa auto_nurture_cron / cadencias.
   - **B1 · Recorrido optimizado por ruta:** "Armar recorrido" ordena las visitas por mapa + sugiere horarios + crea entradas de agenda + itinerario compartible. Reusa maps_engine + agenda/citas.
   - **B2 · Alerta de cambio en propiedad del tablero:** si una propiedad del board baja precio / se aparta / se vende → alerta accionable ("bajó $300k, buen momento" / "se apartó, avísale a María"). Reusa predictive_alerts / comparable_alerts.
   - **B3 · Recalibrado por rechazo (preferencia revelada):** si el cliente descarta N por "precio alto" → la IA infiere presupuesto/taste real y ajusta lo que se busca/envía. Reusa fit_engine + behavioral_tracking_engine.
   - **B4 · Oferta con respaldo de datos:** al llegar a "Oferta", jala AVM/comparables ("AVM $7.6M, listada $8M → ofrece $7.4M"). Reusa avm / cma_engine.
   - **G1 · Vista global con cuellos de botella prescriptivos:** "Propiedades en juego" muestra dónde se atora ("12 esperando disponibilidad >48h · 5 enviadas sin reacción 5d"), no solo conteos. Reusa funnel / pipeline_engine.
   - Todos additive, asesor en control total, no destructivos del backend.

### 💎 B · Inteligencia que YA tienes pero el asesor NO ve (surfacing — máximo ROI, cierra ciclos)
2. **AVM / banda de valor + precio sugerido** visible al capturar y en ficha (avm_public_engine, avm_explain_engine).
3. **Scores de zona** (plusvalía/seguridad/servicios/liquidez) en cada ficha + al compartir (zone_score_engine, zone_subscores).
4. **Forecast: días-en-mercado esperados + probabilidad de venta por precio** por propiedad (forecast_engine, fsd_engine, probability_engine).
5. **Lead score explicado** ("por qué está caliente") en cada lead (buyer_score_engine + close_probability).
6. **Brecha oferta-demanda / Live Pulse** como "oportunidades de captación" en Captaciones + Leads (live_pulse_engine, trends).
7. **Battle card competitiva** surface al asesor (battle_card_engine).
8. **Construction quality / risk scores** en ficha (construction_quality_engine, risk_score_engine, natural_risk_engine).
9. **Atribución ROI por canal** (qué portal/fuente da leads que cierran) dashboard (tracking_links, widget_embed_analytics, tour_analytics).

### 🔧 C · Patrones de EasyBroker que suman (paridad+)
10. **Panel de estado de publicación por portal** + validación pre-publicación + errores accionables (motor mcp_distribution existe; falta UX).
11. **Estatus de leads personalizables** (nombre/color/posición) + **tabla con columnas configurables / vistas guardadas**.
12. **Feedback de visita estructurado** (rating precio/ubicación/estado) → reporte propietario.
13. **Inbox: conversaciones directas vs compartidas + permisos de equipo** (DMX fuerte en IA, débil en team-share).
14. **Reporte automático al propietario** para retener exclusiva (puente Captaciones/Estadísticas).
15. **Última actividad real por usuario** (admin) + alertas de management proactivas surface.
16. **Compartir-con-mis-datos + personalizar** (título/desc/fotos/idioma) re-brand de cualquier listing (share_meta + AI copy).
17. **Multi-idioma EN/PT** con auto-traducción de fichas públicas (clave Dubái).
18. **Onboarding guiado / tours in-app** que expliquen qué es/hace/beneficio de cada parte (la queja directa del founder).

### 🚀 D · Ampliar más allá de EB (usar la ventaja DMX)
19. **Recomendación automática de propiedades al tablero** (cliente rechaza X → IA sugiere Y) — EB es 100% manual.
20. **Sugerencia de ajuste de precio al propietario** respaldada por feedback de visitas agregado + AVM.
21. **Cadencias de seguimiento automáticas visibles** por estatus (auto_nurture_engine, autopilot) que el asesor controla.
22. **Pipeline de cierre real en Operaciones** (oferta→apartado→contrato→escrituración) con hitos + documentos + forecast de ingreso.
23. **Enlace único de colección** (compartir el tablero completo) — depende de #1.

## Re-priorización (impacto × cierra-ciclo × encaja-rediseño)
- **Ola 1 (con el rediseño):** #1 tablero por contacto, #5 lead score explicado, #11 estatus/tabla custom, #18 onboarding/tours. (Todo cae en Leads + transversal.)
- **Ola 2 (surfacing, alto ROI):** #2-#4 AVM/zona/forecast en ficha, #6 oportunidades captación, #9 ROI por canal, #19 recomendación al tablero.
- **Ola 3 (paridad/distribución):** #10 panel portales, #12 feedback visita, #13 inbox team, #17 multi-idioma, #22 pipeline cierre.

**Nota:** ninguna de estas elimina features ni mueve el backend de forma destructiva — #2-#9 son **lectura** de engines existentes; #1/#10-#23 son additive (endpoints/colecciones nuevas + UI). Compatible con el rediseño frontend-first.
