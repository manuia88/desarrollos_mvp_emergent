# DMX · Auditoría Catálogo (97 funciones × backend + frontend)

> 2026-06-03 · 4 agentes paralelos cruzaron CADA función del Catálogo Maestro v3 contra el repo (backend `backend/` + frontend `frontend/src/`). Estado por función con evidencia de archivo.
> Leyenda: ✅ REAL (motor con datos reales + UI que lo muestra) · 🟡 MEDIAS (existe pero stub/sintético/sin la fuente/sin el framing) · 🔴 FALTA (no construido) · ⚪ SOLO-BACKEND (motor sin UI).

## RESULTADO GLOBAL — 97 funciones
- ✅ **REAL: 58 (60%)** · 🟡 **MEDIAS: 14 (14%)** · 🔴 **FALTA: 25 (26%)** · ⚪ **SOLO-BACKEND: 0**
  - Avances 2026-06-06: B08 Absorción (🟡→✅) · B05 Ciclo + D05 Gentrificación + D07 STR/LTR (🔴→✅, motor `zone_cycle_engine`).
- **Hallazgo:** CERO motores huérfanos. Todo lo construido de verdad ya tiene UI. Lo que no se ve = falta (28) o está a medias (15, casi todo = UI existe pero fuente de datos no conectada).

| Cat | Rol | Total | ✅ | 🟡 | 🔴 |
|---|---|---|---|---|---|
| A | Comprador | 12 | 5 | 2 | 5 |
| B | Desarrollador | 15 | 10 | 1 | 4 |
| C | Asesor | 8 | 6 | 1 | 1 |
| D | Mercado/API | 10 | 6 | 0 | 4 |
| E | Cruces 2º orden | 8 | 7 | 0 | 1 |
| F | Calidad de vida | 17 | 11 | 2 | 4 |
| G | 2º orden 2.0 | 5 | 4 | 0 | 1 |
| H | Fuentes nuevas | 16 | 4 | 7 | 5 |
| I | Productos vendibles | 6 | 5 | 1 | 0 |

## DETALLE POR FUNCIÓN
**A Comprador:** ✅ A01 Affordability (mortgage_calculator+UI) · ✅ A02 Investment Sim · ✅ A06 Neighborhood Quality (zone_score) · ✅ A08 Comparador (comparator_engine) · ✅ A10 Lifestyle Match (smart_match) · 🟡 A09 Risk Score (motor zona real, sin tarjeta por-proyecto comprador) · 🟡 A11 Patrimonio (subsumido en A02) · 🔴 A03 Migration renta→compra · 🔴 A04 Arbitraje preventa/reventa · 🔴 A05 TCO 10a integral · 🔴 A07 Timing comprador · 🔴 A12 Price Fairness vs listado
**B Desarrollador:** ✅ B01 Demand Heatmap (demand_engine real) · ✅ B02 Margen semáforo (dmx_margin) · ✅ B03 Pricing Autopilot (real, mediana zona) · ✅ B06 Project Genesis (site-selection) · ✅ B07 Competitive (battle_card) · ✅ B09 Cash Flow · ✅ B11 Channel (funnel) · ✅ B12 Cost Tracker INPP · ✅ B08 Absorción (real, development_id) · ✅ B05 Market Cycle (zone_cycle_engine) · 🟡 B13 Amenity ROI (ranker hedónico, no ROI costo-ingreso) · 🔴 B04 PMF Score · 🔴 B10 Unit Revenue Optimizer · 🔴 B14 Buyer Persona · 🔴 B15 Launch Timing
**C Asesor:** ✅ C01 Lead Scoring · ✅ C02 Argumentario · ✅ C03 Matching (fit_engine) · ✅ C04 Objection Killer · ✅ C05 Weekly Briefing · ✅ C06 Commission Forecaster · 🟡 C08 Dossier (CMA PDF sí; investor-memo no) · 🔴 C07 Zona Expertise Builder
**D Mercado/API:** ✅ D01 Market Pulse (live_pulse) · ✅ D02 Zona Ranking (zone_score) · ✅ D09 Ecosystem/Health Score · ✅ D10 Data API tiers · ✅ D05 Gentrification (zone_cycle_engine) · ✅ D07 STR/LTR (zone_cycle_engine, renta corta vs larga) · 🔴 D03 Supply Pipeline · 🔴 D04 Correlation Finder · 🔴 D06 Affordability Crisis · 🔴 D08 Foreign Investment
**E Cruces 2º:** ✅ E01 Full Project Score "1 número" (dmx_project_score) · ✅ E03 Predictive Lead-Close (close_probability) · ✅ E04 Anomaly (comparable_anomaly) · ✅ E05 AI Narrative · ✅ E06 Dev Benchmark · ✅ E07 Scenario/stress (investment_sim+whatif) · ✅ E08 Auto Market Report (bulletins) · 🔴 E02 Portfolio Optimizer (Markowitz)
**F Calidad de vida:** ✅ F01-F07 (recipes IE_COL_* → ZoneScoreStrip: seguridad/transporte/DENUE/aire/agua/uso-suelo/predial) · ✅ F12 Risk Map (natural_risk CENAPRED) · ✅ F15 School/Health · ✅ F16 Hipotecas (mortgage_calculator) · ✅ F17 Site Selection AI · 🟡 F13 Commute (drive-time como briefing asesor) · 🟡 F14 Neighborhood Change · 🔴 F08 LQI (no existe como índice propio) · 🔴 F09 Value Score (solo subscore precio) · 🔴 F10 Gentrification 2.0 · 🔴 F11 Supply Pipeline Predictor 2.0
**G 2º orden 2.0:** ✅ G01 Full Score 2.0 · ✅ G02 AI Narrative 2.0 · ✅ G04 Zone Comparison · ✅ G05 Impact Predictor (whatif) · 🔴 G03 Auto Due Diligence Report
**H Fuentes nuevas:** ✅ H03 Seismic Risk · ✅ H11 Infonavit/FOVISSSTE Calc · ✅ H13 Site Selection AI full · ✅ H16 Neighborhood Evolution · 🟡 H01 School (DataPending) · 🟡 H02 Health (DataPending) · 🟡 H05 Developer Trust (interno, sin PROFECO) · 🟡 H06 City Services Locatel (connector sin resource_id) · 🟡 H07 Environmental (recipe real, sin sync NOAA/CONAGUA) · 🟡 H10 Water Crisis (connector sin resource_id) · 🟡 H12 Zona Oportunidad (DataPending) · 🔴 H04 Credit Demand · 🔴 H08 Heritage Zone · 🔴 H09 Real Traffic Commute (Mapbox solo imágenes estáticas) · 🔴 H14 Buyer Persona por zona · 🔴 H15 Due Diligence Express
**I Productos vendibles:** ✅ I01 Market Intelligence API · ✅ I02 Auto Market Report · ✅ I03 Feasibility SaaS · ✅ I05 Insurance Risk API · ✅ I06 Valuador AVM · 🟡 I04 Índices Licenciables (solo **DRPI** real; **IPV/IAB/IDS/IRE/ICO NO existen** con esos nombres)

## OJOS PUESTOS (lo más engañoso)
1. **B08 Absorción = sintético** (`random` win/loss 142/87 hardcoded). El modelo real solo vive dentro del cash-flow (B09).
2. **Recipes DataPending** (escuela/salud/aire/agua/Locatel): UI real, pero el connector CKAN no tiene `resource_id` → devuelve stub. Conectar la fuente = se prenden.
3. **5 índices DMX nombrados no existen** — solo DRPI. IPV/IAB/IDS/IRE/ICO son composites por construir sobre scores existentes.
4. **PROFECO no integrado** (H05 usa track-record interno).

## PLAN para los 28 que faltan + 15 a medias (por palanca)
**TIER 1 · Quick wins (datos/cubo ya listos · alto valor):**
- ✅ B08 Absorción → REAL (2026-06-06). Estaba real en código pero scope-ado por dev_org_id (0 leads) →
  fix a development_id ∈ proyectos del dev → 42 leads reales (win 50%, embudo 42→30→24→6, cohort+heatmap). Verificado.
- ✅ B05 Market Cycle + D05 Gentrification + D07 STR/LTR → REAL (2026-06-06). Motor reusable `zone_cycle_engine.py`
  (compute_zone_cycle: ciclo fase recuperación/expansión/maduro/contracción desde momentum+trend+tier · gentrificación
  velocidad 0-100 · renta larga vs corta por _TIER_YIELD+vitalidad, marca 'estimado' hasta conectar AirDNA). Endpoint
  `GET /api/desarrollador/ciclo-renta` (scoped a zonas del dev) + UI área "Ciclo y Renta" en Centro de Inteligencia
  (DevCicloRenta.js, light theme, por-zona: fase coloreada + gentrificación + renta + jugada). Verificado live:
  Polanco Maduro/Pico gent 38 renta corta 8.1% vs larga 4.2%; Lomas Maduro/Pico gent 30. Motor reusable también
  comprador/superadmin (toma un dict colonia). Renta marcada 'estimado' = autollena al prender conector STR.
- I04: construir los 5 índices DMX como composites (DRPI ya existe; los otros cruzan scores existentes).
- Conectar recipes DataPending (H01/H02/H07/H10/H06): setear `resource_id`/sync.
**TIER 2 · Computable con datos existentes:**
- Comprador: A03 renta-vs-compra · A04 arbitraje · A05 TCO · A07 timing · A12 price fairness (calculadoras sobre datos que ya tenemos).
- E02 Portfolio Optimizer (Markowitz sobre ROI por-unidad de investment_sim) · B10 Unit Revenue Optimizer · D06 Affordability Crisis · D04 Correlation.
**TIER 3 · Necesitan fuente nueva:**
- H04 Credit Demand (CNBV/Infonavit) · H08 Heritage (INAH) · H09 Real Traffic (Mapbox Traffic API) · D08 Foreign Investment · D03/F11 Supply Pipeline (permisos SEDUVI) · G03/H15 Due Diligence.
**TIER 4 · Framing/dedup (bajo esfuerzo):**
- F08 LQI / F09 Value Score (componer/renombrar scores existentes) · A09/A11 vistas dedicadas · C07 Zona Expertise · B14/H14 Buyer Persona.
