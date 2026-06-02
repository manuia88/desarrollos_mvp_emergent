# DEV · MAPA MAESTRO DE PRESERVACIÓN + ENCENDIDO
2026-06-02 · El plan que reorganiza el portal dev **sin perder ni romper nada** Y **enciende el arsenal apagado**.
Norte: `DEV_UX_NORTHSTAR.md` · Inventario ocultas: `DEV_HIDDEN_FEATURES_MAP.md` · Centro: `DEV_IA_MAP_01_CENTRO.md`.

## Cómo leer
Cada pieza de hoy → **CASA** nueva (1 de 6) · **LOOP** que cierra · **ENCENDIDO** · **CUÁNDO**.
- Estado hoy: 🟢 vivo+conectado · 🟡 parcial/stub · 🔴 apagado-flag / dato-falso / huérfano.
- Tipo de encendido: **[FLAG]** prender interruptor · **[CABLE]** montar panel/callsite · **[DATO]** motor real vs falso · **[CASA]** darle ruta/menú · **[RETIRA]** borrar.
- Cuándo: **YA** (construido+seguro+cierra loop) · **ESCALA** (necesita volumen de datos) · **—** (ya prendido).
- Loops: **Precio** · **Lead** · **Proyecto** · **Decisión** (ver North Star §4.5).

═══════════════════════════════════════════════════════════════════
## CASA 1 · PUENTE DE MANDO (Inicio) — DECIDIR
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Loop | Cuándo |
|---|---|---|---|---|
| Dashboard "Resumen" (brief, jugadas, stats, pulso, alertas, actividad) | 🟢 | — (curar/jerarquizar) | Decisión | — |
| WeeklyBrief, DevPlays, SetupChecklist | 🟢 | — | Decisión | — |
| What-if (WhatIfPanel) | 🟢 pero buried tab | [CASA] herramienta de decisión visible aquí + por proyecto | Precio | YA |
| Director AI (DirectorChatPanel) | 🔴 flag Phase Y | [FLAG]+[CABLE] unificar con Cerebro = "Tu asistente" | Decisión | YA |
| Tarjetas alerta precio/competidores | 🟢 | — (link a Inteligencia) | Precio | — |
| LivePulse zonas | 🟡 trend velocity stub | [DATO] cuando haya Apify | Proyecto | ESCALA |
| Tu ROI (AIROIPanelDev) | 🔴 flag observability | [CASA] → mover a Ajustes | — | YA |

═══════════════════════════════════════════════════════════════════
## CASA 2 · PROYECTOS (el activo) — OPERAR · liderado por Insights, hub de tarjetas vivas
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Loop | Cuándo |
|---|---|---|---|---|
| MisProyectos (lista) | 🟢 | — | — | — |
| MisProyectosV2 | 🔴 huérfano | [RETIRA] | — | YA |
| ProyectoDetail 8 tabs | 🟢 | [CASA] → 2 grupos de tarjetas vivas (Operar/Ficha) | — | YA |
| DesarrolladorInventario (pantalla aparte) | 🔴 orphan/duplica Ventas | [RETIRA] → su función vive en tab Ventas | — | YA |
| DesarrolladorIEDetail (inteligencia del proyecto) | 🟢 | [CASA] = base/landing del proyecto (Insights-led) | Proyecto | YA |
| DesarrolladorLegajo (documentos) | 🟢 | [CASA] → tab Ficha/Legal (auto-sync→marketplace) | — | — |
| DesarrolladorCashFlow | 🟢 pero **link roto 404** | [CABLE] arreglar ruta + meter en Insights del proyecto | Proyecto | YA |
| DesarrolladorCalendarioSubidas | 🔴 orphan | [CASA] → dentro de Contenido/Avance, o [RETIRA] | — | YA |
| NuevoProyecto (wizard) | 🟢 | — | — | — |
| **Demanda/forecast por proyecto** | 🔴 dato FALSO (random) | [DATO] cablear forecast_engine (ARIMA real) | Proyecto | YA |
| **Precio por unidad (AVM)** | 🔴 adivinanza Haiku | [DATO] cablear avm+fsd+explain | Precio | YA |
| comparator_engine, narrative(scope=project) | 🔴 sin UI dev | [CABLE] lentes dentro del proyecto | Precio | YA |

═══════════════════════════════════════════════════════════════════
## CASA 3 · VENTAS & CLIENTES (CRM + pipeline + RED COMERCIAL fusionada) — CONVERTIR
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Loop | Cuándo |
|---|---|---|---|---|
| CRM Tablero (CRMShell/DesarrolladorCRM) | 🟢 (tabs con placeholders) | [CABLE] enganchar las páginas varadas | Lead | YA |
| CrmFunnel (Embudo + Sankey + IA) | 🔴 solo por URL | [CASA] al menú CRM | Lead | YA |
| DesarrolladorLeads | 🔴 varada | [CASA] al menú CRM | Lead | YA |
| AutoAssignments (auto-asignación) | 🔴 solo URL | [CASA] + [CABLE] endpoint auto-assign citas | Lead | YA |
| Mensajes (inbox) | 🟢 | [CASA] = pestaña dentro de CRM (vive con leads) | Lead | — |
| SalaDeControl (Cerebro / "Tu asistente") | 🔴 CEREBRO_ENABLED off en prod | [FLAG] prender + surfacear en Inicio también | Decisión | YA (flag tuyo) |
| **Suite IA agéntica** (DISC, smart routing, reply classifier, nurture, match weights, argumentario, visit dossier) | 🔴 agentic_enabled=off + paneles NO montados en dev | [FLAG]+[CABLE] prender + montar paneles en CRM dev | Lead | YA (flag tuyo) |
| RedComercial · Usuarios(Equipo) · MetricasEquipo · AsesoresMetrics · CrossPartnerships(Alianzas) · Solicitudes · Disputas | 🟢 | [CASA] fusionar en Ventas&Clientes (fuerza de venta + sub-área aprobaciones) | Lead | — |
| Atribución multi-touch · historial corridas agentes · distribución DISC · replay webhook | 🔴 endpoints huérfanos | [CABLE] surfacear en CRM | Lead | YA |

**Cross-módulo (preservar):** brokers/co-broking/alianzas/pre-asignación/leads compartidos ↔ **asesor**; Solicitudes usa `advisor_whitelist`; Disputas y AsesoresMetrics tocan asesor.

═══════════════════════════════════════════════════════════════════
## CASA 4 · INTELIGENCIA (laboratorio de mercado) — PROFUNDIZAR (pull)
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Loop | Cuándo |
|---|---|---|---|---|
| Demanda | 🔴 dato FALSO (random) | [DATO] forecast_engine real | Proyecto | YA |
| Precios IA (Pricing) | 🟢 | — | Precio | — |
| Pricing Lab (A/B + bundles) | 🔴 solo URL + **loop inerte** | [CASA]+[CABLE] mitad-visitante `assign-visitor`/`track-event` (sin esto sale vacío) | Precio | YA |
| Competidores | 🟡 verificar alertas render | [DATO] confirmar comparable_anomaly | Precio | YA |
| Battle Card | 🟢 (ya con sidebar) | — | Precio | — |
| Reportes IA | 🟢 | [CABLE] ajuste manual de forecast (endpoint huérfano) | Proyecto | YA |
| Site Selection | 🟢 (usa studio) | — | — | — |
| score_inversion + simulator · comparator · live_pulse · tax_projector · construction_cost · cross_sell | 🔴 motores sin UI dev | [CABLE] lentes nuevos aquí (algunos públicos hoy) | Precio/Proyecto | YA / ESCALA |

═══════════════════════════════════════════════════════════════════
## CASA 5 · MARKETING / DISTRIBUCIÓN — llevar al mercado
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Loop | Cuándo |
|---|---|---|---|---|
| Mini Market | 🟢 | — | — | — |
| Studio (Brand Kit·Assets·Import·Carruseles·Auto-Content·Landings) | 🟢 compartido | [CASA] agrupar; preservar vínculo **marketplace** (ficha pública + auto-sync docs) | Lead | — |
| narrative_layer (scope=unit) | 🔴 solo landing/comprador | [CABLE] copy de venta auto | Lead | YA |

═══════════════════════════════════════════════════════════════════
## CASA 6 · AJUSTES — configurar
═══════════════════════════════════════════════════════════════════
| Pieza hoy | Estado | Encendido | Cuándo |
|---|---|---|---|
| Configuración (org/ERP webhooks) | 🟢 | — | — |
| CitasPolicies | 🔴 enterrada (CTA en empty-state) | [CASA] al menú Ajustes | YA |
| Tu ROI / observability / Phase Y | 🔴 flag | [FLAG]+[CASA] aquí | YA (flag tuyo) |
| feature_flags / feature_visibility (planes/precios) | 🟡 no enforced en dev | [CABLE] confirmar capa | ESCALA |
| Equipo/Alianzas admin | (espejo de Casa 3) | — | — |

═══════════════════════════════════════════════════════════════════
## SUB-PORTAL INMOBILIARIA (no perder) — InmobiliariaDashboard/Asesores/Leads
═══════════════════════════════════════════════════════════════════
Portal hermano (inmobiliaria, no constructora). Comparte `api/developer`. NO se toca su lógica; solo se nota que existe y se preserva el vínculo con asesor.

═══════════════════════════════════════════════════════════════════
## A RETIRAR (deuda muerta · 🔴) — confirmado por auditoría
═══════════════════════════════════════════════════════════════════
MisProyectosV2 · DesarrolladorInventario (como pantalla aparte) · 3 alias kanban-compat · kanban-unified · patch_asset_role_alias · presentation-mode PATCH dedicado · cross-portal/sync-check. Link roto Cash Flow = arreglar (no retirar).

═══════════════════════════════════════════════════════════════════
## ORDEN DE CONSTRUCCIÓN (por loop-closers, no por conteo)
═══════════════════════════════════════════════════════════════════
**Tanda 0 · arreglar loops inertes / dato falso (barato, gran "por fin funciona"): ✅ HECHO+VERIFICADO 2026-06-02**
- ✅ Link roto Cash Flow → ruta real `/desarrollos/:slug/cash-flow`.
- ✅ Demanda `analytics/forecast`: random `Random(1729)` → **ventas reales** (ALL_UNITS status=vendido) + proyección determinística.
- ✅ **AVM por unidad** (era adivinanza Haiku): nuevo `GET /api/dev/units/{dev}/{unit}/avm` = avm_quick_async (hedónico→heurístico) + FSD (intervalo) + explain + **persist_avm_prediction (cierra círculo Precio)**. Surfaceado en ficha de unidad (sección "Valor de mercado"). Verificado: $12.06M, "+22.7% por encima del mercado". Degrada honesto si no hay modelo promovido.
- ✅ **Pricing Lab loop inerte → CERRADO**: nuevo `POST /api/dev/pricing-experiments/resolve` (público: descubre experimento activo + asigna visitante + registra vista) + wrappers `resolvePricingExperiment`/`trackPricingEvent` + cableado en `DevelopmentDetail.js` (público): resuelve al cargar (vista), aplica variante de precio (clamp seguro, fail-open), rastrea lead vía `onCaptured` del LeadCaptureModal. Verificado end-to-end: A 2 vistas/1 lead/50% conv · B 1 vista/0 · resultados dejan de salir vacíos.
- Nota: queda un experimento de prueba en la DB local (altavista-polanco). Frontend `randomVisitorId` usa localStorage. Cero errores nuevos de consola.
**Tanda 1 · CÍRCULO DECISIÓN: ✅ HECHO+VERIFICADO 2026-06-02**
- CEREBRO_ENABLED ya =true en local (flag prod = deploy del founder).
- Nuevo **panel "Tu asistente"** en el Puente de Mando (DesarrolladorDashboard) cableado vivo al Cerebro: muestra "tu turno" (tareas awaiting_approval), "te propongo" (recomendaciones live + botón **Aplicar**) y "cómo voy aprendiendo" (calibración/lecciones/reentrenos). Loop visible verificado: tras learning/demo el Cerebro propone "ya califiqué 3 predicciones, le atiné 1 de 1, lo uso para afinar".
- **Visibilidad backend→frontend:** `getCerebroRecommendations` + `applyCerebroRecommendation` estaban huérfanos → ahora surfaceados en el panel. (Quedan 2 wrappers getter sin UI: getCerebroRun, dealClosed — plumbing, el endpoint deal-closed lo dispara el hook de advisor.)
- Tab Inicio "Director AI" → renombrado **"Asistente · Chat"** (unifica el lenguaje; ambos = "Tu asistente", distintos lentes). Fusión profunda de los 2 backends (39 tools director + ejecutores Cerebro) = NO hecha (riesgo alto, valor bajo; el surfaceo ya da la unificación práctica).
- Verificado en app real, 0 errores nuevos de consola.
**Tanda 2 · CÍRCULO LEAD: 🔄 EN CURSO (la tanda más grande)**
- ✅ [FLAG] `agentic_enabled` encendido para la org dev `constructora_ariel` (local, en `db.phase_y_settings`, simulation_mode=false, features del lead a T3). Mecanismo verificado: el flag es POR-ORG (PATCH `/api/superadmin/phase-y/{org}` es superadmin-only; en local se setea el doc). El flip en prod = decisión del founder.
  - Repro local: `db.phase_y_settings.updateOne({org_id:"constructora_ariel"},{$set:{agentic_enabled:true,...tiers T3}},{upsert:true})`.
- ⬜ [CABLE] Montar la suite en el CRM dev (12 paneles ya existen, hoy montados en asesor/superadmin, NO en dev):
  - Per-lead (en el drawer de lead del CRM dev): `DiscProfileCard` · `ArgumentarioPanel` · `VisitPrepDossier`.
  - Org-level (tab "Suite IA" en CRMShell): `RepliesInbox` (Bandeja IA) · `NurtureIntelligentPanel` · `SmartRoutingPanel` · `MatchWeightsPanel`.
  - + atribución multi-touch (endpoints huérfanos b13) + historial de corridas de los 3 agentes.
- NO marcar Tanda 2 done hasta montar la suite (sin cables sueltos).
**Tanda 3 · CÍRCULO PRECIO completo:** lentes de motores (comparador, score inversión+simulador, tax, costo obra, live pulse) dentro de Inteligencia/Proyecto.
**Tanda 4 · estructura/IA-UX:** rearmar las 6 casas, tarjetas vivas del proyecto, jerarquía del Puente de Mando, ActionBar/ViewToggle/Ficha360 reusados.
**Tanda 5 · limpieza:** retirar deuda muerta + rescatar pantallas varadas restantes + CitasPolicies/AutoAssign al menú.

Regla: nada se construye hasta que esta pieza tenga su CASA marcada arriba. Flags maestros (CEREBRO/agentic) = decisión de deploy del founder; nosotros dejamos el cableado, UX y seguridad listos.
