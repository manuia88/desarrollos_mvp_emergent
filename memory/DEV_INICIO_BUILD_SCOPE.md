# DEV Inicio — Revisión de Alcances + Backend + Qué Construir
2026-06-02 · contra DMX_Product_Architecture_Complete (6 capas · 27 productos · 160+ funcs) + Catálogo Maestro (40 fuentes · 97 funcs) + Cruces (A comprador / B desarrollador / C asesor-broker / D mercado / E 2º orden).

## VEREDICTO
El backend NO es el cuello de botella. Hay **~120 motores** (`backend/*_engine.py` + `backend/cerebro/`) que cubren ~90% de la arquitectura. **Casi todo está construido pero LATENTE** (sin UI dev o apagado por flag). El trabajo del rediseño del Inicio es **SURFACEAR + ORQUESTAR + dar protagonismo al Asistente**, NO construir inteligencia desde cero. Net-new backend ≈ thin wrappers dev + 4 gaps reales.

## SECCIONES DEL INICIO (arquitectura del founder) → MOTORES QUE LAS ALIMENTAN

| Sección | Motores backend (existen) | Estado en portal dev | Net-new |
|---|---|---|---|
| **1. Signos vitales** | listProjectsWithStats, health_score | ✅ hecho (cockpit) | 0 |
| **2. Lectura de mercado** | drpi_engine, forecast_engine, fsd, live_pulse_engine, anomaly_detection, apify_trends | 🔸 parcial (charts seed) | wrapper dev DRPI/forecast/pulse reales |
| **3. Detalle por proyectos** | listProjectsWithStats, avm_public_engine, construction_quality, comparable_anomaly | ✅ tabla + 🔸 falta precio-vs-AVM | thin (getUnitAvm ya hecho) |
| **4. Inteligencia de zonas** | zone_score_engine, zone_subscores_compute (incl. GTFS/transit/risk), risk_score_engine, natural_risk, crime_data, colonia_history (gentrif.), denue_engine | 🔸 tarjeta con COLONIAS seed; motores reales LATENTES | wrapper dev de zone_score real |
| **5. Brokers externos y alianzas** | cross_org_partnerships, inmobiliaria_relationships, directories, directory_aggregator, smart_lists, transaction_network, soc_franchise, lead attribution | ❌ CERO en portal dev | **sección UI nueva + endpoint analítica** |
| **6. Asistente / Atlax / Copilot** | cerebro/ (orchestrator+executors+memory+coach+recommendations+guardrails), atlax_engine, voice_atlax, director_agent, auto_pilot, briefing, predictive_alerts | 🔸 Cerebro COMPLETO (E0-E6) pero apagado por flag + escondido en 1 tarjeta | 0 backend · **protagonismo UI + prender lente dev** |

## GAPS REALES net-new backend (poco)
1. **Gentrification radar dev**: `colonia_history.py` existe → empaquetar como score dev-facing (cruce H del catálogo).
2. **AirROI / renta corta** (ROI inversor): `connectors_ie.py` tiene conector → falta endpoint dev + widget (Producto 5.4).
3. **Analítica de brokers/aliados para dev**: `cross_org_partnerships` existe → falta endpoint que agregue "quién vende más, conversión, ranking, comisión".
4. **Demand pre-validation dev** ("N personas buscan lo que vas a construir"): `live_pulse` + `reverse_search` existen → empaquetar (Producto 2.3).

## EL ASISTENTE COMO PROTAGONISTA (clave del founder)
Cerebro ya hace meta→plan→encadena→pausa-en-delicado→aprueba→continúa + memoria + aprendizaje (7 etapas verificadas, apagado por flag). NO se construye nada: se le da **protagonismo** = hero que lee vitales+mercado+zonas+brokers y dice *qué hacer hoy*, con Sala de Control. Hoy vive en una tarjeta fija (`AsistentePanel`). Debe ser el hilo que une las 6 secciones.

## ORDEN DE CONSTRUCCIÓN PROPUESTO (surface-first)
- **P1 · Asistente protagonista** (Cerebro existe) — el hilo conductor, hero arriba.
- **P2 · Inteligencia de zonas con dato REAL** (zone_score_engine en vez de seed) — 50+ variables por zona ya calculadas.
- **P3 · Sección nueva Brokers & Alianzas** (única UI 100% nueva; endpoint analítica de partnerships).
- **P4 · Lectura de mercado real** (DRPI + forecast + live pulse + anomaly).
- **P5 · Detalle por proyecto** con precio-vs-AVM + competidor (battle_card) + demand pre-validation.
- **P6 · Report factory dev** (briefing semanal auto · ya hay `briefing_engine`).

## PRINCIPIO
Surface > build. Cada sección = wrapper dev + UI que consume motor existente. El moat (120 motores + Cerebro) ya está; el rediseño lo hace VISIBLE y ACCIONABLE, con el Asistente al centro.
