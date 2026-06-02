# Mapa de Arquitectura (IA) — Portal Dev · ÁREA 1: CENTRO (Inicio + Mis Proyectos)
2026-06-02 · Inventario para reorganizar la estructura "por trabajo del dev". Solo lectura, no se tocó código.
Hermanos: DEV_HIDDEN_FEATURES_MAP.md (ocultas) · DEV_VALUE_THESIS.md (el QUÉ de valor) · DEV_REDESIGN_TRACKER.md.

Leyenda dato: 🟢 real (Mongo/cálculo) · 🟡 parcial/stub · 🔴 apagado por flag · 🔗 link a otra sección.

═══════════════════════════════════════════════════════════════════
## MENÚ ACTUAL (7 secciones) — `config/navByRoleV2.js`
═══════════════════════════════════════════════════════════════════
1. **Inicio** → /desarrollador
2. **Mis Proyectos** → /desarrollador/proyectos
3. **CRM & Leads** → Tablero · Embudo · Leads · Auto-asignación · Mensajes · Tu asistente (Cerebro)
4. **Inteligencia** → Demanda · Precios IA · Competidores · Battle Card · Reportes IA · Site Selection
5. **Red comercial** → Red comercial · Equipo · Métricas equipo · Métricas asesores · Alianzas · Solicitudes · Disputas leads
6. **Marketing** → Mini Market · Brand Kit · Assets · Importar Listing · Carruseles · Auto-Content · Landings
7. **Ajustes** → Configuración · Políticas de cita

═══════════════════════════════════════════════════════════════════
## A. INICIO  (`pages/developer/DesarrolladorDashboard.js`, 390 líneas)
═══════════════════════════════════════════════════════════════════
Estructura: PageHeader + 4 TABS internos (Resumen / Director AI / What-if / Tu ROI Phase Y).

### Tab "Resumen" (el cockpit real)
| Bloque (lo que ve) | Componente | API → endpoint | Dato | A dónde lleva / veredicto |
|---|---|---|---|---|
| Hero "Esta semana · IA" | WeeklyBriefWidget (inline) | GET /api/panel/weekly-brief (dev_batch14.py:436) | 🟢 narrativa/cálculo | botón acción + riesgo (sin ruta) |
| "Tus jugadas de hoy" | DevPlaysWidget (inline) | api.getDevPlays → GET /api/dev/projects/plays (dev_batch10.py:339) | 🟢 fusión proyectos reales + mediana mercado (seed) | cada jugada → action_route |
| Checklist configuración | SetupChecklist (shared) | GET /api/panel/setup-progress (dev_batch14.py:313) | 🟢 real | links a pasos |
| 8 stats (desarrollos, unidades, absorción, ingresos, pipeline) | Stat ×8 | api.getDashboard → GET /api/desarrollador/dashboard (developer.py:53) | 🟢 real (DEVELOPMENTS + counts Mongo) | — |
| "Pulso de tus zonas" | LivePulseZoneWidget ×N | live_pulse | 🟡 parcial (trend velocity = stub Apify) | — |
| Tarjeta "Sugerencias de precio" | Card inline | getDashboard.pricing_alerts | 🟢 real | 🔗 /desarrollador/pricing (Inteligencia) |
| Tarjeta "Alertas de competidores" | Card inline | getDashboard.competitor_alerts | 🟢 real | 🔗 /desarrollador/competidores (Inteligencia) |
| Card Auto-Sync (condicional) | Card inline | docsApi.getSyncPending('developer') | 🟢 real | 🔗 /desarrollador/inventario?dev=X |
| "Desarrollos activos" (tarjetas) | Card inline | getDashboard.developments | 🟢 real | ⚠️ → /desarrollador/**inventario**?dev=X (NO a /proyectos/:id) |
| "Actividad reciente" | ActivityFeed (shared) | feed | 🟢 real | — |
| Quick actions flotantes | FloatingQuickActions | resolveQuickActions | 🟢 | crear lead / cita |

### Otros 3 tabs (herramientas pesadas metidas como tabs del Inicio)
| Tab | Componente | Dato | Nota |
|---|---|---|---|
| Director AI | DirectorChatPanel (components/director) | 🔴 flag Phase Y (estado phaseYOff) + necesita LLM key | chat 39-tools sobre el portafolio |
| What-if | WhatIfPanel (components/whatif) | 🟢 simulación (whatifApi) | usa data.developments; 3 escenarios |
| Tu ROI Phase Y | AIROIPanelDev (components/agentic_crm) | 🔴 flag observability T1+ | costo/ROI de la IA |

═══════════════════════════════════════════════════════════════════
## B. MIS PROYECTOS
═══════════════════════════════════════════════════════════════════
### Lista — `pages/developer/MisProyectos.js` (553 líneas, render = MisProyectosV1)
- API: listProjectsWithStats 🟢 real. Filtro por etapa, orden, cards/lista, HealthScore, duplicar proyecto.
- Tarjeta → `/desarrollador/proyectos/:id` (ProyectoDetail). "Nuevo" → /proyectos/nuevo (wizard).

### Detalle — `pages/developer/ProyectoDetail.js` (8 tabs) — todo CRUD real de `api/developer.js`
| Tab | Componente | API principal | Dato | Tipo de trabajo |
|---|---|---|---|---|
| Ventas | VentasTab (+ sub-tabs Inventario/Por prototipo/Vista de planta) | listInventory(devId) | 🟢 real | OPERAR / vender |
| Contenido | ContenidoTab | listDevAssets + /developments/ | 🟢 real | SETUP / ficha |
| Avance de obra | AvanceObraTab | getConstructionProgress / updateConstructionStage | 🟢 real | OPERAR |
| Ubicación | GeolocalizacionTab | getProjectLocation / saveProjectLocation | 🟢 real | SETUP / ficha |
| Amenidades | AmenidadesTab | getProjectAmenities / patchProjectAmenities | 🟢 real | SETUP / ficha |
| Legal | LegalTab | listDevDocuments / uploadDevDocument | 🟢 real | SETUP / ficha |
| Comercialización | ComercializacionTab | getCommercialization / listBrokers / listPreassignments | 🟢 real | OPERAR / red |
| Insights | insights/InsightsTab (sub: Resumen/Engagement/CashFlow/Comparables/IA) | insights | 🟢 real | INTELIGENCIA (per-proyecto) |
- Header del detalle: HealthScore + Diagnóstico (DiagnosticReportContent) + Brochure (BrochureGenerator) + KPIStrip (summary).

═══════════════════════════════════════════════════════════════════
## C. LA PANTALLA "FANTASMA" — Inventario  (`pages/developer/DesarrolladorInventario.js`)
═══════════════════════════════════════════════════════════════════
- Header "D1 · INVENTARIO TIEMPO REAL". API: listInventory, listHolds, patchUnitStatus, createHold/releaseHold + "Legajo del desarrollo".
- NO está en el menú; se llega SOLO desde Inicio (tarjetas + auto-sync).
- ⚠️ DUPLICA el tab "Ventas" de ProyectoDetail (ambos = listInventory). Son DOS puertas distintas a "un proyecto".

═══════════════════════════════════════════════════════════════════
## D. FLUJO ACTUAL (cómo navega el dev) — y por qué confunde
═══════════════════════════════════════════════════════════════════
- Para "ver un proyecto" hay DOS caminos con contenido solapado:
  (1) Mis Proyectos → /proyectos/:id (8 tabs ricos)
  (2) Inicio "Desarrollos activos" → /inventario?dev=X (inventario tiempo real + legajo)
- El Inicio mezcla "panorama" (Resumen) con 3 HERRAMIENTAS pesadas como tabs (Director AI, What-if, ROI).
- La inteligencia está partida: tab Insights (por proyecto) vs sección Inteligencia (portafolio). Inicio manda alertas a Inteligencia. No se sabe cuándo usar cuál.
- Health score aparece en 3 lados (lista, detalle, Insights).
- ProyectoDetail = 8 tabs planos que mezclan "armar el proyecto" (Contenido/Ubicación/Amenidades/Legal) con "venderlo/operarlo" (Ventas/Comercialización/Avance/Insights).

═══════════════════════════════════════════════════════════════════
## E. PROPUESTA DE REESTRUCTURA DEL CENTRO (por trabajo del dev)
═══════════════════════════════════════════════════════════════════
1. **Inicio = cockpit puro** ("¿qué hago hoy?"): brief + jugadas + salud del portafolio + dinero + alertas accionables + pulso. Una sola vista limpia, sin tabs pesados.
2. **Sacar las 3 herramientas de los tabs del Inicio**: What-if → dentro del proyecto (simular sobre ESE activo); Director AI → asistente global (botón/Cmd, no tab del home); Tu ROI → a Ajustes/observabilidad. El home deja de estar sobrecargado.
3. **Un solo "Proyecto"**: fusionar las dos puertas. Inicio cards → /proyectos/:id. La pantalla Inventario deja de existir como pantalla aparte; su función (tiempo real + holds + legajo) vive DENTRO del tab "Ventas" del proyecto.
4. **ProyectoDetail: agrupar los 8 tabs en 2 grupos** para bajar la carga:
   - **Operar** (lo de todos los días): Ventas/Inventario · Comercialización · Avance de obra · Insights.
   - **Ficha del proyecto** (se llena una vez): Contenido · Ubicación · Amenidades · Legal.
5. **Aclarar inteligencia**: Insights (tab) = "este proyecto"; sección Inteligencia = "todo el portafolio + mercado". Enlazar uno con otro, no duplicar.
6. **Health score = un solo lugar canónico** (detalle del proyecto) + un número resumen en la lista; quitar el tercero.

Siguiente áreas a mapear (mismo formato): CRM & Leads → Inteligencia → Red comercial → Marketing → Ajustes.
