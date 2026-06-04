# DEV · Mapa de Re-arquitectura (Fase 0 — producto → pantalla → motor)

> 2026-06-03 · Resultado del inventario del repo (3 agentes) cruzado con el catálogo maestro.
> Regla: pantallas simples sin tabs internas · un producto por pantalla · cero features perdidas · detrás del flag V2 · IA-first.
> Leyenda estado motor: ✅ LIVE (datos reales) · 🟡 PARCIAL (existe pero stub/sin ruta/nivel-proyecto) · 🔴 FALTA (construir) · 🔌 existe pero hay que cablear al front.

## 🎉 ESTADO 2026-06-03 — MÓDULO DEV RE-ARQUITECTADO COMPLETO (7/7)
Las 7 pantallas hechas + verificadas en app real + commiteadas + tag por pantalla. Todo detrás del flag `REACT_APP_DEV_V2` (producción/V1 intacta). Prender = deploy con el flag en true.

**Patrón aplicado:** cada pantalla = un CENTRO con switch de áreas (no sub-tabs anidadas). Embed sin doble-layout vía prop `bare` en `DeveloperLayout` + prop `embedded` en cada hoja. Menú DEV_NAV_V2 colapsado (~30 entradas → ~11).

| Pantalla | Re-arquitectura | Upgrade(s) | Tag |
|---|---|---|---|
| Inicio | 4 tabs → 1 flujo; chat→asistente, what-if→Inteligencia, costo-IA→Ajustes | asistente protagonista + disclosure de dato por jugada | `dmx-rearq-inicio-v2`, `dmx-rearq-misproyectos-*` |
| Mis Proyectos | lista + ficha con cockpit IA-first | **Margen semáforo** (motor `dmx_margin`, INPP) + **"1 número"** (`dmx_project_score`) | `dmx-rearq-misproyectos-margen/ficha`, `dmx-rearq-intel-1numero` |
| CRM & Leads | 6 sub-tabs → workspace (Tablero·Embudo·Lista·Bandeja) + Automatizaciones | **Loop 1** asistente agéntico (CrmAssistantStrip, pipeline-scoped) + **Loop 2** cada cierre entrena (cable `on_deal_closed` + CrmLearningPanel) | `dmx-rearq-crm-A1/A2/B/C` |
| Inteligencia | 7 hojas → 1 Centro (6 áreas: Mercado·Demanda·Precios·Competencia·Reportes·Dónde construir) | **Pricing real** (sintético→mediana $/m² zona) + **"1 número"** | `dmx-rearq-intel-pricing/A1/A2/1numero` |
| Red comercial | 7 hojas → Centro "Tu red" (6 áreas) | tira IA "Tu turno" (solicitudes + disputas) | `dmx-rearq-redcomercial` |
| Marketing | 7 hojas → Centro (Mini Market + Studio launcher) | badges IA en herramientas generativas | `dmx-rearq-marketing` |
| Ajustes | 2 rutas → Centro (General + Políticas de cita área) | costo IA re-ubicado | `dmx-rearq-ajustes` |

**Motores nuevos:** `backend/dmx_margin.py` (margen semáforo), `backend/dmx_project_score.py` ("1 número" E01), cable `on_deal_closed` en PATCH dev/leads (Loop 2).
**Componentes nuevos front:** CrmAssistantStrip, CrmLearningPanel, MarketDoorway, AssetOpCockpit (en ProyectoDetail).
**Pricing real:** `routes/developer.py` list_pricing_suggestions ahora ancla a `dmx_demand._colonia_median_pm2`.
**Pendiente menor:** Battle Card / Alianzas quedaron como hijos aparte (layout doble / componente compartido). Diferido por datos: forecast/tarjeta enriquecida del CRM, ruteo ML (afinan con volumen). Warnings pre-existentes en hojas embebidas (no rediseñadas): se limpian si se rediseñan.
Tag global: **`dmx-rearq-dev-complete`**.
─────────────────────────────────────────────────────────────────────

## HALLAZGO CLAVE — arquitectura V1/V2 actual
Las PÁGINAS del dev son COMPARTIDAS V1/V2. El flag `REACT_APP_DEV_V2` solo cambia el **sidebar** (DevSidebarV2 lee DEV_NAV_V2) + el tema claro. NO hay páginas V2 separadas.
→ **Decisión:** la re-arquitectura se construye como **páginas V2 nuevas, ruteadas por el flag** en App.js (V2 on → página nueva; V2 off → página actual intacta). Prod (V2=false) sigue viendo V1 sin tocar. El founder prende el flag al final = todo el dev nuevo de un switch.

## TERMÓMETRO DEL ARSENAL (prueba de "el front es mínimo")
De ~36 productos/funciones/cruces dev mapeados: **~18 ✅ LIVE · ~9 🟡 PARCIAL · ~9 🔴 FALTA.** El front hoy surfacea ~6-8. O sea: el grueso del trabajo es **surfacear + componer + cablear**, no construir de cero.

---

## LAS 7 PANTALLAS — producto → estado → qué se colapsa

### 1 · INICIO → "Cockpit del día" (sin tabs)
- **Producto:** Morning briefing + Jugadas de hoy + Tu asistente (Cerebro) + Signos vitales + puerta a Inteligencia.
- **Motores:** dashboard ✅ · dev_plays ✅ · cerebro (status/tasks/learning) ✅ · benchmark ✅.
- **Colapsa las 4 tabs:** `resumen`=la página · `director`(Chat)→dentro del asistente · `whatif`→Inteligencia · `roi`(Costo de IA)→Ajustes.
- **Trabajo:** re-arquitectura + re-ubicar (casi todo LIVE). YA hecho parcial (Upgrade #1).

### 2 · MIS PROYECTOS → "El activo y su operación" (lista → ficha con instrumentos)
- **Producto:** por unidad/proyecto: Pricing, Absorción, Cash Flow, Margen, Amenity ROI, PMF, Costo construcción, Unit Revenue Optimizer.
- **Motores:** cash-flow ✅ · amenity-ranker ✅ · demand-gap ✅ · absorción% ✅ (cube) · pricing 🟡 (sintético→AVM) · unit-revenue 🟡 (nivel proyecto) · cost-tracker INPP 🟡 (sin ruta dev) · **margen semáforo 🔴** · PMF 🟡 (recipe data-pending).
- **Colapsa:** nada de tabs (hoy usa chips de etapa). La ficha (ProyectoDetail) hospeda los instrumentos por unidad.

### 3 · CRM & LEADS → "Un solo pipeline" (colapsa la fragmentación)
- **Producto:** Lead Intelligence + Scoring + Matching + Channel Performance + Commission + Briefing + Deal Mgmt + Suite IA agéntica.
- **Motores:** kanban/pipeline ✅ · close-probability ✅ · funnel/sankey ✅ · suite IA (replies/routing/nurture/match-weights) ✅ · channel 🟡 (sin costo→ROI) · commission 🔌 · briefing 🔌.
- **Colapsa (mucho):** hoy son CRM-shell(pipeline/suite-ia) + funnel(funnel/sankey) + leads(pipeline/kanban/analytics) + auto-asignación + sala-control(8 metas) + mensajes(placeholder). → UN pipeline con vista conmutable (kanban/lista/embudo), detalle de lead en contexto, canales/comisión como paneles, el asistente (sala-control) integrado, mensajes contextual.

### 4 · INTELIGENCIA → "El terminal de mercado" (la pantalla más rica)
- **Producto:** Market Pulse + Demand Heatmap + Pricing IA + Competidores/Battle Card + Reportes + Site Selection/Factibilidad + AVM + Ciclo de mercado + "1 número" Full Project Score + Scenario Planning + Benchmark + Gentrificación + Supply Pipeline + Índices.
- **Motores LIVE:** live-pulse (5/6) ✅ · demand-heatmap ✅ · battle-card ✅ · competidores ✅ · reportes (executive/absorption/forecast/insights/alerts/branded) ✅ · site-selection+feasibility ✅ · AVM ✅ · scenario (whatif+investment stress) ✅ · benchmark ✅ · DRPI ✅ · anomaly ✅ · narrative LLM ✅ · market report (State of CDMX + newsletter) ✅ · B2B API tiers ✅.
- **🟡/🔴:** pricing 🟡 · Full Project Score 🟡 (unificar 3 scores en 1) · **Market Cycle 4 fases 🔴 · Gentrification 🔴 · Supply Pipeline 🔴 · Affordability Crisis 🔴 · Correlation Finder 🔴 · Portfolio Optimizer 🔴 · STR/LTR equilibrium 🟡 (connector+schema, falta motor) · índices IAB/IDS/IRE/ICO/MOM/LIV 🔴 (solo DRPI live)**.
- **Colapsa:** hoy son 7 páginas-hoja con tabs internas (Reportes 6 tabs, Site Selection 4 tabs, Pricing 4 status). → un terminal con áreas (scope selector), no tabs-en-tabs.

### 5 · RED COMERCIAL → "Tu red"
- **Producto:** Asesor Brand & Community + Benchmark de red + Channel.
- **Motores:** red-comercial ✅ · usuarios/métricas equipo/asesores ✅ · alianzas ✅ · solicitudes/disputas ✅.
- **Colapsa:** 3 tabs (inmobiliarias/in-house/freelance) + 6 hojas → una vista de red con filtro de tipo + drawer de detalle; operación (solicitudes/disputas) como bandeja.

### 6 · MARKETING → "Difusión"
- **Producto:** Content & Visual (video+data overlay, marketing message generator) + Mini Market + Studio.
- **Motores:** Studio ✅ (área aparte) · mini-market ✅.
- **Colapsa:** hub a Studio; Mini Market integrado.

### 7 · AJUSTES → "Configuración"
- **Producto:** Org settings + ERP + **Costo de IA (re-ubicado del Inicio)** + Planes/Snapshots (GoHighLevel).
- **Motores:** org-settings ✅ · ERP webhooks ✅ (stub honesto) · AI ROI ✅ · planes/snapshots ✅ (dmx_plans).
- **Colapsa:** stacked cards (ya sin tabs).

---

## UPGRADES descubiertos (subir 🟡→✅) y NET-NEW (🔴)
- **Upgrade 🟡→✅:** Pricing Autopilot (sintético → AVM hedónico+demanda) · Absorption Forecast (curva sintética → modelo real de velocidad) · Channel Performance (+ costo → ROI real) · Full Project Score (unificar health+IE+inversión en 1 número E01) · Cost Tracker (exponer ruta dev) · Unit Revenue Optimizer (proyecto → por-unidad) · STR/LTR equilibrium (motor sobre connector+schema).
- **Net-new 🔴 (esperan o se construyen por valor):** Margen semáforo · Market Cycle 4 fases · Portfolio Optimizer (Markowitz) · Supply Pipeline Predictor · Gentrification Detector · Affordability Crisis Monitor · Correlation Finder · índices IAB/IDS/IRE/ICO/MOM/LIV · Buyer Persona por zona · Launch Timing.

## ORDEN sugerido (Fase 2)
Inicio (molde, casi listo) → Mis Proyectos → Inteligencia (la más rica) → CRM → Red comercial → Marketing → Ajustes. Cada una: páginas V2 nuevas tras el flag, producto completo, cruces vivos, verificar logueado, checkpoint+tag.
