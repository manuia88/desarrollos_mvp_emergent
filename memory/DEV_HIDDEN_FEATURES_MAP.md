# DEV · Mapa Quirúrgico de Features Ocultas (Paso A del rediseño)
**2026-06-01 · auditoría forense 4 agentes read-only** · cruce real endpoint↔api-client↔componente↔nav.
Tesis (igual que asesor): "el módulo no sobra de features, sobran ESCONDIDAS." **CONFIRMADA — hay más oculto que en asesor.**

> Regla: este doc es el INVENTARIO para Paso B (sidebar) y Paso C (rediseño por tab).
> NO se construye nada aquí; se decide qué rescatar, qué limpiar, qué dejar igual.

═══════════════════════════════════════════════════════════════════
## RESUMEN POR CATEGORÍA (lo que está construido pero el desarrollador NO ve)
═══════════════════════════════════════════════════════════════════
| # | Categoría | Cuántas | Severidad | Acción |
|---|---|---|---|---|
| A | Pantallas COMPLETAS fuera del menú (solo por URL o redirect muerto) | 9 | 🟡 alto valor | Rescatar al menú (Paso B) |
| B | Suite IA agéntica APAGADA por interruptor maestro (`agentic_enabled=False`) | ~10 features con panel FE hecho | 🟢 oro | Prender flag + montar en portal dev |
| C | Pantallas que muestran datos FALSOS teniendo el motor real al lado | 2 | 🔴 calidad | Cablear motor real (Fase posterior) |
| D | Motores de inteligencia valiosos sin pantalla para el dev | 10 | 🟡 alto valor | Nueva ruta+página dev |
| E | Capacidades de backend sin botón (endpoints huérfanos in-scope) | 27 | 🟡 medio | Surfacear las jugosas / borrar las muertas |
| F | Limpieza: duplicados muertos + 1 link roto | ~8 | ⚪ deuda | Borrar / arreglar |

Dato de contexto: el sidebar dev REAL tiene **24 entradas** (no ~35), en 3 niveles (15 workflow · 5 inteligencia · 4 config). 6 de esas 24 son Studio (compartido).

═══════════════════════════════════════════════════════════════════
## A · PANTALLAS COMPLETAS FUERA DEL MENÚ (9)
═══════════════════════════════════════════════════════════════════
**6 ROUTED-NOT-IN-NAV** (existen, tienen ruta y contenido rico, pero NO hay entrada de menú ni link → solo se llega tecleando la URL):
- `DesarrolladorPricingLab` (`/desarrollos/:slug/pricing-lab`) — **Laboratorio de precios: experimentos A/B + bundles.** Cero links en toda la app. Todo el backend de `pricing-experiments` (dev_batch5) cuelga de aquí.
- `CrmFunnel` (`/crm/funnel`) — Embudo + **Sankey (@nivo)** + sugerencia IA + breakdown.
- `AutoAssignments` (`/crm/auto-assignments`) — KPIs de auto-asignación + distribución + tabla últimas 50 (round-robin/load-balance/pre-selección).
- `AsesoresMetrics` (`/crm/asesores-metrics`) — tabla equipo + drawer por asesor.
- `DesarrolladorLeads` (`/desarrollador/leads`) — página de leads del dev, sin nav ni link.
- `CitasPolicies` (`/configuracion/citas-policies`) — solo alcanzable por un CTA enterrado en un empty-state.

**3 ORPHAN** (importadas pero la ruta es un `<Navigate>` redirect → el componente NUNCA se renderiza, código muerto vivo):
- `DesarrolladorInventario` (redirige a /proyectos), `DesarrolladorCitas` (→/crm?tab=citas), `DesarrolladorCalendarioSubidas` (→/proyectos).

**Nota cohesión:** el CRM Shell tiene tabs (leads/citas/slots/brokers/métricas) que renderizan `PlaceholderContent` ("disponible en el próximo release") — o sea las páginas reales (DesarrolladorLeads/Citas/MetricasEquipo) quedaron VARADAS fuera de cualquier menú/tab.

═══════════════════════════════════════════════════════════════════
## B · SUITE IA AGÉNTICA APAGADA POR INTERRUPTOR (el oro — igual que Bandeja IA en asesor)
═══════════════════════════════════════════════════════════════════
`backend/routes/phase_y_controls.py` arranca con `agentic_enabled: False` y casi todos los tiers en `"off"`.
**29 endpoints `/api/agentic-crm/*` con PANELES FRONTEND YA HECHOS que renderizan vacío:**
| Feature (tier default) | Qué hace | Panel FE que ya existe |
|---|---|---|
| `smart_routing_lead` (off) | Rutea lead→asesor con IA | `director/SmartRoutingPanel.js` |
| `visit_prep_dossier` (off) | Dossier de prep de visita auto | `agentic_crm/VisitPrepDossier.js` |
| `reply_classifier` (off) | Clasifica/escala respuestas entrantes | `agentic_crm/RepliesInbox.js` |
| `disc_inferencer` (off) | Perfil DISC (personalidad) por lead | `agentic_crm/DiscProfileCard.js` |
| `nurture_intelligent` (off) | Secuencias de nurture inteligentes | `agentic_crm/NurtureIntelligentPanel.js` |
| `match_weights_adaptive` (off) | Auto-tuneo de pesos de match | `agentic_crm/MatchWeightsPanel.js` |
| `argumentario_adaptive` (off) | Argumentario de venta adaptativo | `agentic_crm/ArgumentarioPanel.js` |
| `pricing_agent`/`marketing_agent`/`lead_agent` (off) | 3 agentes autónomos | paneles director |
| `observability_dashboard` (off) | Tablero de observabilidad agéntica | `agentic_crm/observability_engine.py` |
| `atlax_persona`/`voice_atlax`/`whatsapp_business`/`newsletter_pulse` (off) | persona/voz/WA Business/newsletter | — |

Prender = cambio de settings, NO código nuevo. ⚠️ Pero esos paneles hoy se montan en asesor/director/SuperadminTenants — el portal DEV solo monta `AIROIPanelDev`. Para que el DEV los vea hay que (a) prender flag + (b) montar paneles en el portal dev.
Segundo catálogo: `feature_flags_engine.py` mapea features dev a planes/precios (demanda $199, pricing_ai $299, site_selection $499, etc.) y falla CERRADO, **pero hoy no está enforced en ninguna ruta dev** — verificar si vive en la capa `feature_visibility` o está diferido.

═══════════════════════════════════════════════════════════════════
## C · PANTALLAS CON DATOS FALSOS TENIENDO EL MOTOR REAL (🔴 calidad)
═══════════════════════════════════════════════════════════════════
1. **Demanda/Pronóstico** muestra al dev un forecast fabricado con `random.Random(1729)` (`dev_batch2.py:199`) — mientras `forecast_engine.py` (ARIMA real, CI95, 6/12/24m) ya existe y alimenta las páginas públicas. **El dev ve números inventados con el motor real a un cable de distancia.**
2. **Predicción de precio por unidad** (`dev_batch11.py:566`) usa una llamada a Claude Haiku (texto libre + fallback heurístico) en vez de los motores calibrados `avm_public_engine`+`fsd_engine`+`avm_explain_engine` (valuación hedónica + intervalo + "por qué este precio").

═══════════════════════════════════════════════════════════════════
## D · MOTORES DE INTELIGENCIA SIN PANTALLA PARA EL DEV (10 · priorizados)
═══════════════════════════════════════════════════════════════════
1. **forecast_engine** (ARIMA real) — ver C1. PRIORIDAD 1.
2. **avm + fsd + avm_explain** — valuación por unidad con intervalo y explicación. PRIORIDAD 2.
3. **score_inversion + investment_simulator** — rating AAA–B + ROI/TIR/stress 3 escenarios por colonia (hoy solo público).
4. **whatif_engine** — "si bajo precio 5% / agrego promo / retraso entrega 3m → ¿absorción y revenue?" (hoy solo director-agent + MCP).
5. **comparator_engine** — tu proyecto vs 2 rivales (AVM+IE+DRPI+riesgo+impuestos + veredicto IA). Complementa Battle Card.
6. **live_pulse_engine** — momentum de zona en vivo (búsqueda/vista/lead/precio).
7. **tax_projector_engine** — ISR/ISAI/predial + costos de cierre.
8. **construction_cost_engine** — costo por m² por zona×tipo×tier (BANXICO/INEGI) para pro-forma.
9. **cross_sell_engine** — hipoteca/notario/seguro (monetizar base de compradores).
10. **narrative_layer_engine** — ya acepta `scope=project|unit`, solo lo llaman landing/comprador. Narrativa auto de venta sin backend nuevo.

(INTERNAL-ONLY por diseño, NO surfacear al dev: knowledge_graph, cube_olap, fraud_detection, transaction_network, churn_prediction — son superadmin/cron.)

═══════════════════════════════════════════════════════════════════
## E · ENDPOINTS HUÉRFANOS IN-SCOPE (27 · capacidades sin botón)
═══════════════════════════════════════════════════════════════════
Las JUGOSAS (surfacear):
- **Modelo de atribución multi-touch** (b13): `GET/POST /leads/{id}/attribution` + `GET/PATCH /dev/settings/attribution-model` — motor configurable (first/last/linear touch), CERO UI.
- **Mitad-visitante de experimentos A/B** (dev_batch5): `assign-visitor` + `track-event` — sin esto, los resultados de Pricing Lab salen SIEMPRE vacíos (loop inerte).
- **Historial de corridas de los 3 agentes IA** (subagents): `/pricing|marketing|lead/runs` — los paneles muestran recomendaciones pero nunca el historial.
- **Auto-asignación de citas** (dev_batch15): `POST /appointments/auto-assign` (round-robin), `oauth/google/revoke`.
- **Ajuste manual de pronóstico** (dev_batch2): `POST /analytics/forecast/adjust` — wrapper `adjustForecast` existe, ninguna UI lo llama.
- **Timeline de engagement por unidad** (dev_batch6), **distribución DISC org** (agentic_crm), **replay de webhook entrante** (agentic_crm), primitivas bulk de health/activity/notifications.

Las MUERTAS (borrar, no rescatar): 3 alias kanban-compat + `kanban-unified` + `patch_asset_role_alias` (include_in_schema=False, superseded) + `presentation-mode` PATCH dedicado (superseded por prefs genérico) + `cross-portal/sync-check`.

═══════════════════════════════════════════════════════════════════
## F · LIMPIEZA / DEUDA
═══════════════════════════════════════════════════════════════════
- **Link roto:** `components/developer/insights/InsightsCashFlow.js:112,160` apunta a `/desarrollador/cash-flow/:projectId` que NO existe (la ruta real es `/desarrollos/:slug/cash-flow`) → 404 hoy.
- Ruta duplicada: `/desarrollador/metricas-equipo` duplica `/crm/metricas-equipo` (esta sí en nav).
- ~7 endpoints duplicados muertos (sección E "muertas").

═══════════════════════════════════════════════════════════════════
## CAVEATS / VERIFICAR EN PASO C (no asumir)
═══════════════════════════════════════════════════════════════════
- `comparable_anomaly_engine` (página Competidores) y `construction_quality_engine` (ProyectoDetail): marcados PARTIAL — confirmar en UI que las ALERTAS/el índice realmente renderizan antes de contarlos como surfaced.
- `feature_flags_engine` no enforced en rutas dev hoy — confirmar contra capa `feature_visibility` antes de depender de él.
- Matching estático: los api-wrappers dev usan strings literales `/api/...` → confianza alta, sin falsos negativos detectados.

═══════════════════════════════════════════════════════════════════
## CÓMO ALIMENTA PASO B (sidebar) Y PASO C (rediseño por tab)
═══════════════════════════════════════════════════════════════════
- **Paso B (sidebar IA):** el nuevo hub debe DAR LUGAR a las 9 pantallas varadas (A) + decidir dónde montar la suite IA (B) → encaja con M4 Pricing (Lab), M5 Inteligencia (motores D), M6 CRM (Funnel/Auto-assign/Leads/DISC), M8 Red Comercial (AsesoresMetrics/AutoAssign), M9 Reportes (ajuste forecast).
- **Paso C (por tab):** al rediseñar cada tab, cablear el motor real donde hoy hay fake (C) y exponer los endpoints huérfanos jugosos (E) que correspondan a ese tab.
- Esto convierte el rediseño de "mover cajas" a "rediseñar + encender lo apagado", que es exactamente lo que pediste.

Relacionado: `DEV_PHASE0_CHECKLIST.md`, `DEV_MODULE_WORKPLAN.md`, `MODULE_HARDENING_PLAYBOOK.md`, [[asesor-prod-audit]], [[feedback-module-hardening-playbook]].
