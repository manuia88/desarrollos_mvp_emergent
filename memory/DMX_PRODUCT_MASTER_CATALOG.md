# DMX · Catálogo Maestro de Productos (fuente de verdad para la re-arquitectura front)

> 2026-06-03 · Síntesis de los 6 archivos que el founder adjuntó (en `~/Downloads/`):
> `DMX_Product_Architecture_Complete.md`, `catalogo_maestro_dmx_v3.docx` (+v2),
> `cruces_metricas_dmx.docx`, `DMX_IE_Cross_Industry_Strategy.md`, `Reporte_AirDNA_Visualizacion_Datos.md`.
> ESTE doc es el QUÉ. La re-arquitectura (pantallas simples, sin tabs internas, un producto por pantalla) es el CÓMO.
> Regla: el front debe surfacear **productos** (varios features con un propósito), **cruces** (lo que se alimenta), y **paquetes** — no piezas sueltas. Hoy el front muestra una fracción.

## 1) Arquitectura de producto — 27 productos / 6 capas + transversal (160+ features)

- **CAPA 1 · CRM Transaccional:** 1.1 Asesor Business OS · 1.2 Lead Intelligence · 1.3 Gemelo Digital del Comprador · 1.4 Deal Management · 1.5 Asesor Brand & Community
- **CAPA 2 · Intelligence Engine (IE, core IP):** 2.1 Price Intelligence (AVM, price truth, oráculo precio futuro, elasticidad) · 2.2 Zone Intelligence (DNA por AGEB, livability por perfil, risk composite, gentrification radar, zona gemela) · 2.3 Demand Intelligence (demand graph, gap alerts, pre-validación dev) · 2.4 Market Oracle (absorción forecast, timing, competitor radar, self-improving loop) · 2.5 Verification Layer (trust)
- **CAPA 3 · Engagement Engine:** 3.1 Conversation Intelligence (WhatsApp con contexto IE, voice notes, objection playbook) · 3.2 Sequence Engine (cadencias, triggers conductuales, omnicanal) · 3.3 Smart Matching ("3 y listo", precision selling) · 3.4 Value-First Outreach (reporte como primer contacto, simulador financiero)
- **CAPA 4 · Marketplace/Distribución:** 4.1 Intelligent Marketplace (SEO programático por AGEB, discover weekly, waiting lists, AR) · 4.2 Content & Visual (video+data overlay, reviews verificadas) · 4.3 IE as API (widget B2B, data marketplace)
- **CAPA 5 · Revenue Intelligence:** 5.1 Revenue Forecasting · 5.2 Dynamic Pricing (precio óptimo, unit-level, launch pricing) · 5.3 Developer Financial Intelligence (price justification, CFO virtual, unit-mix optimizer, amenity ROI, pre-sale intel) · 5.4 Investor Platform (portfolio, timing alerts, AirROI, hold period) · 5.5 Gamification & Retention
- **CAPA 6 · Agente Autónomo:** 6.1 Opportunity Engine · 6.2 Report Factory · 6.3 Full Cycle Agent (detecta→matchea→contacta→nutre→agenda→propone; human-in-the-loop)
- **TRANSVERSAL · Buyer Experience:** T.1 Zero Fear Buying · T.2 Compañero de Vida Inmobiliario
- **7 MEGA-MUTATIONS (cruces de cruces):** M1 Trust Infra ("Bloomberg del real estate") · M2 Persistent Matching · M3 Market Maker · M4 Autonomous Investment Advisor · M5 Self-Improving Loop ("Tesla FSD") · M6 Invisible Infrastructure ("Plaid/Stripe") · M7 Real Estate como Servicio

## 2) Catálogo Maestro v3 — 40 fuentes · 97 funciones · 6 productos vendibles

Funciones por categoría (cada una = PARA rol + inputs cruzados):
- **A · Comprador (12):** Affordability · Investment Sim · Migration (renta→compra) · Arbitraje preventa/reventa · TCO · Neighborhood · Timing · Comparador · Risk proyecto · Lifestyle Match · Patrimonio 20a · Price Fairness
- **B · Desarrollador (15):** Demand Heatmap · Margin Pressure (semáforo) · Pricing Autopilot · PMF Score · Market Cycle · Project Genesis (factibilidad AI) · Competitive Intel · Absorption Forecast · Cash Flow · Unit Revenue Optimizer · Channel Performance · Cost Tracker (INPP) · Amenity ROI · Buyer Persona · Launch Timing
- **C · Asesor (8):** Lead Scoring · Argumentario auto · Client-Project Matching · Objection Killer · Weekly Briefing · Commission Forecaster · Zona Expertise · Dossier de Inversión PDF
- **D · Inteligencia de Mercado / Admin / API (10):** Market Pulse (Bloomberg) · Zona Ranking dinámico · Supply Pipeline · Correlation Finder · Gentrification Detector · Affordability Crisis Monitor · STR vs LTR · Foreign Investment · Ecosystem Health · Data API (tiers free/pro/enterprise)
- **E · Cruces de segundo orden (8):** Full Project Score (un nº 0-100, "PageRank del real estate") · Portfolio Optimizer (Markowitz) · Predictive Lead-to-Close · Market Anomaly Detector · AI Market Narrative · Developer Benchmark (anónimo) · Scenario Planning (stress test) · Automated Market Report
- **F (17) + G (5) · Calidad de vida + 2º orden (v2):** Safety/Transit/DENUE/Air/Water/LandUse/Tax/LQI/Value/Gentrification2.0/Supply2.0/RiskMap/Commute/NeighborhoodChange/School+Health/Hipotecas/SiteSelectionAI; Full Score 2.0/AI Narrative 2.0/Auto Due Diligence/Zone Comparison/Impact Predictor
- **H (16) · fuentes nuevas v3:** School Quality · Health Access · Seismic Risk · Credit Demand · Developer Trust (PROFECO) · City Services (*0311) · Environmental · Heritage · Traffic Commute (Mapbox) · Water Crisis · Infonavit Calc · Zona Oportunidad · **Site Selection AI full-stack (H13, producto estrella vs Softec/Tinsa $200-500K)** · Buyer Persona Profiler · **Due Diligence Express (H15, $2-5K/reporte)** · Neighborhood Evolution
- **I · Productos vendibles (6):** I01 Market Intelligence API ($500-5K USD/mes) · I02 Automated Market Report ($10-50K MXN/trim) · I03 Developer Feasibility SaaS ($5-15K MXN/mes) · I04 Índices Licenciables (DMX-IPV/IAB/IDS/IRE/ICO, $2-10K USD/mes) · I05 Insurance Risk API · I06 Valuador Automatizado AVM ($200-500/valuación)

## 3) Cruces (cross-features) — mapa de dependencias clave para wiring

Cruces base muy reutilizados (load-bearing):
- **A01 Affordability** → A08, C01, C03, E01
- **A02 Investment Scenarios** → A08, C02, C03, C08, E01, E02
- **B05 Market Cycle** → B15, D03, E03, E05, E07
- **B08 Absorption Forecast** → B09, C06, E01
- **C08 Dossier** ← agrega todos los cruces A (acción de cierre del asesor)
- **E01 Full Project Score** ← A01+A02+A12+A09+B08+B04+A06+D09 (el "1 número")
- **E08 Automated Market Report** ← todos los cruces A+D+E

Regla del doc: "la ventaja no es tener los datos — es cruzarlos como nadie más puede".

## 4) Cross-industry / paquetes (IE-as-API) + GTM por rol

- **IE-as-API** (modelo AWS/Stripe): freemium 100 queries/mes → $5K-50K/mes. 5 productos licenciables: DMX Livability API · DMX-MOM (momentum) · DMX Risk Score · DMX Site Selection · DMX Market Reports.
- **Índices propios:** DMX-MOM (momentum) + DMX-LIV (livability con impacto en $) + los 5 del catálogo (IPV/IAB/IDS/IRE/ICO).
- **Flywheel 4 lados:** Contenido → Marketplace (devs listan ⇄ buyers buscan) genera dato → IE (97+ scores) → API → terceros consumen+validan → más usuarios.
- **GTM por rol:** Comprador = "Discover Weekly" + score que se adapta al perfil · Asesor = sensor + herramienta diaria · Desarrollador = "seller" con inteligencia que no puede generar solo + competitive intel · Terceros (bancos/aseguradoras/portales/gov) = consumen API.
- **"OTA updates":** los scores no son estáticos; recalculan al refrescar fuentes; el usuario ve deltas ("hace 3 meses Safety 6.8, hoy 7.2").

## 5) Stack de visualización prescrito (Reporte AirDNA) — construir nativo, NO Tableau/PowerBI

- **Charts simples:** Recharts · **complejos:** Nivo o Apache ECharts · **mapas:** Mapbox GL JS · **dashboard/KPIs:** Tremor + Tailwind · **tablas:** @tanstack/react-table · **export PDF:** html2canvas + jsPDF.
- **Layout por portal (blueprint a replicar):**
  - Público home: heatmap desarrollos + ticker de métricas.
  - Ficha de desarrollo: precio (línea) + absorción (barras) + zone score (badge).
  - Comparador: radar (Nivo) + tabla.
  - Asesor Dossier: KPI cards + mini charts + mini-mapa.
  - Asesor Market Intel: heatmap por alcaldía + líneas de precio.
  - **Desarrollador Dashboard: INPP costos + absorción + pipeline (Recharts + Tremor KPI).**
  - **Desarrollador Competitive Intel: comparación vs competidores (tablas + barras).**
  - Superadmin: todo lo anterior + macro (command center).
- KPIs/metricas con su viz sugerida y serie temporal 2018-2025 (occupancy/ADR/RevPAR/revenue por percentil 25/50/75/90 → percentile band).

## 6) Implicación para la re-arquitectura del MÓDULO DEV (siguiente paso, Fase 0)

El dev debería surfacear ~30 funciones B + cruces E + productos vendibles I03/H13/I06/I02, agrupadas en POCAS pantallas-producto (no tabs). Próximo entregable Fase 0: cruzar cada función dev con el motor que YA existe en el repo (vivo/stub/apagado) y mapear "producto → pantalla" antes de construir. NADA se pierde; todo se re-ubica.
