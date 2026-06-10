# DMX — CHECKLIST DE CONSTRUCCIÓN (re-arquitectura total, multi-tenant, IA-first)
2026-06-02 · founder rulings: (1) "sin datos ≠ humo": construir TODO conectado con stubs, se activa al llegar el dato. (2) Molde multi-tenant: N devs + N asesores idénticos (mismo molde), 1 superadmin único = plano de control que provisiona tenants y activa features por plan estilo GoHighLevel (snapshots). (3) Construir el molde de una empresa de 1,000,000,000 usuarios. Continúa DMX_SPINE_MASTER + DEV_GRANULAR_DATA_SPINE.

## DECISIÓN DE ARQUITECTURA (mi postura PM/Dev master)
Falso binario "superadmin-first vs conectar-a-superadmin". La verdad:
- **Primero el ESPINAZO COMPARTIDO + PLANO DE CONTROL** (que superadmin gobierna): dato multi-tenant + cubo + entitlement/snapshots. NO la UI de superadmin primero (esa es el último consumidor).
- **Luego los MOLDES** (dev, asesor) como lentes scope-adas del mismo cubo, con features prendidas por plan.
- Superadmin = god-view del cubo + control plane (provisiona tenants, asigna planes/snapshots). Dev/Asesor = molde idéntico para todos, su slice.
- Ya existe ~80%: scoping tenant_id/org_id en todo + feature-gate W5.FF (GoHighLevel) + tiers T0-T5. Falta COHERENCIA y COMPLETUD, no empezar de cero.

## PRINCIPIOS TRANSVERSALES (aplican a cada paso)
- **Multi-tenant siempre**: toda entidad lleva org/tenant; un helper único de scoping; superadmin ve todo, dev/asesor su slice. Cero hardcode single-tenant.
- **Build-for-endstate**: construir todos los campos/canales/features con conectores en stub. Sin dato = null/dormido, NO ausente.
- **Self-registering + entitlement**: cada feature se registra en catálogo + check FAIL-OPEN + se prende por plan (snapshot).
- **IA-first**: ML/DL/Agentic conectados desde el día 1 aunque entrenen con poco dato.
- **Cero deuda**: sin huérfanos/cables sueltos/warnings; verificar en app real; checkpoint por paso.

═══════════════════════════════════════════════
## CHECKLIST DE PASOS (foundation-first)
═══════════════════════════════════════════════

### FASE 0 · Cimientos del molde (control plane + contrato de datos) ✅ COMPLETA 2026-06-02
- [x] 0.1 Multi-tenant: `backend/tenant_scope.py` fuente única · FUGA cerrada (developer.py daba TODO a todos) · superadmin=god/dev=slice · tag dmx-fase0.1-multitenant.
- [x] 0.2 `backend/dmx_unit_schema.py` — contrato UNIDAD milimétrico (17 grupos A-Q · 12 tipologías · ENUM estacionamiento completo · 77 amenidades · todo nullable) · tag dmx-fase0.2-unit-contract.
- [x] 0.3 Zona + relaciones + Development/Prototype/Amenity/Security (en dmx_unit_schema) · IE composite fiel a zone_score_engine · tag dmx-fase0.3-0.4.
- [x] 0.4 `backend/dmx_snapshots.py` snapshots append-only (write/read_timeseries/latest, dedup) · round-trip Mongo verificado · tag dmx-fase0.3-0.4.
- [x] 0.5 `backend/dmx_plans.py` planes/snapshots GoHighLevel + 3 endpoints superadmin · apply_plan=snapshot, downgrade limpio, self-maintaining · tag dmx-fase0.5-plans-snapshots.

### FASE 1 · El cubo (motor de inteligencia de mercado) ✅ COMPLETA 2026-06-03
- [x] 1.1 `dmx_cube_feed.py` alimenta el cubo desde el ÁTOMO (backfill 496 unidades reales en dmx_units) · cube lee átomo-primero + seed enriquecido · tag dmx-fase1.1-1.2-cubo.
- [x] 1.2 +6 dimensiones (tipologia/recamaras/banda_m2/has_roof/has_bodega/parking_type) + medidas (avg_m2/absorcion_pct/por_cobrar) · dim 'zone' arreglada · responde precio/m² y absorción por tipología/zona/roof.
- [x] 1.3 `dmx_atom_autofill.py` brochure/'lp' → átomo fill-only + extract_lp_units (Claude, dormant-safe) + POST /atom/from-text.
- [x] 1.4 `dmx_external_enrich.py` AirROI/GTFS/DENUE/catastro → Zona vía connectors_ie (is_stub dormido hasta key) + POST /enrich-zone. tag dmx-fase1.3-1.4 · dmx-fase1-complete.

### FASE 2 · Capas IA sobre el cubo ✅ COMPLETA 2026-06-03
- [x] 2.1 `dmx_hedonic_atom.py` hedónico (OLS, statsmodels) sobre el átomo + amenity value ranker (roof +6%, R²=0.95) + GET /amenity-ranker. tag dmx-fase2.1-hedonico.
- [x] 2.2 `dmx_demand.py` demand-gap por zona×tipología (dónde construir) + prob_venta por unidad en el átomo + GET /demand-gap, POST /score-close-prob. tag dmx-fase2.2-demanda.
- [x] 2.3 `dmx_self_improving.py` loop cierre→resuelve predicción→re-ajusta hedónico→calibración (coach E4) + visión photo_tagger dormant-ready + POST /unit-closed, /atom/from-photos. tag dmx-fase2.3-self-improving.
- [x] 2.4 `dmx_cerebro_market.py` el Cerebro lee el cubo → propone tareas (dev.where_to_build/best_amenity/deal.change_price) con candados → Sala de Control + POST /cerebro/detect-market. tag dmx-fase2.4-cerebro-cubo · dmx-fase2-complete.

### FASE 3 · Las lentes (mismo cubo, distinto permiso) ✅ COMPLETA 2026-06-03
- [x] 3.1 **Superadmin** ✅ 2026-06-03: god-view (`CubeIntelPanel` hedónico+demand-gap sobre el Cubo de métricas crudo) + control plane (`PlansPanel` asigna plan/snapshot a tenant, GoHighLevel, en /superadmin/feature-visibility). fix dmx_plans catálogo legacy (consistencia). verificado en app. tags dmx-fase3.1-*.
- [x] 3.2 **Dev mold** ✅ 2026-06-03: `routes/dev_market.py` (benchmark anónimo + amenity ranker + demand-gap, scope-ado) · `CubeIntelligence.js` (3 tarjetas en el Inicio) · **Asistente protagonista** (lee el cubo vía detect-market → 'Veo N jugadas' + Aprobar/Descartar, dedup) · verificado en app. tags dmx-fase3.2-*.
- [x] 3.3 **Asesor mold** ✅ 2026-06-03: `routes/asesor_market.py` (amenity-ranker + demand-gap, auth advisor) · `AsesorMarketIntel.js` 'INTELIGENCIA DE MERCADO · PARA VENDER' (argumentos de valor 'Destaca roof +6%' + zonas con compradores) en AsesorCommandCenter · verificado en app. tag dmx-fase3.3-asesor-mold.
- [x] 3.4 **Comprador** ✅ 2026-06-03: `routes/public_market.py` (amenity-ranker público, sin auth, rate-limited) · `MarketValueCard.js` 'POR QUÉ VALE' (atributos que suman valor, 'no es opinión es dato') en la ficha pública DevelopmentDetail · verificado en app. tag dmx-fase3.4-comprador.

### FASE 4 · Distribución / monetización (del doc) 🔵 4.2+4.3 ✅ 2026-06-03
- [~] 4.1 SEO programático por AGEB — DATA LAYER listo (GET /api/public/market/index + /amenity-ranker por colonia). Las páginas SSR son infra (Next.js; el app es CRA) → diferido a infra.
- [x] 4.2 IE as API / data marketplace: `GET /api/public/market/index` (+ amenity-ranker) — cubo ANÓNIMO consumible vía API, sin auth, rate-limited, k-anon (<5 omitido). tag dmx-fase4-data-marketplace.
- [x] 4.3 Transparency Index público: `DMXMarketIndex.js` en /inteligencia (15 colonias · precio/m²/absorción/inv · 'DMX no opina, mide'). verificado en app.

### FASE 5 · Activación por plan (GoHighLevel) ✅ COMPLETA 2026-06-03
- [x] 5.1 Features del cubo en FEATURE_CATALOG (cube_market_intel, ai_assistant · plan_tier pro) → entran en planes Pro/Enterprise + matriz Feature Visibility.
- [x] 5.2 Snapshots: superadmin asigna plan a tenant (PlansPanel · /plans/assign) → prende las features de un jalón. Verificado (Enterprise→constructora_ariel, 21 features).
- [x] 5.3 Activación end-to-end: CubeIntelligence gateado por useFeatureFlag (FAIL-OPEN) → plan asignado prende cube_market_intel en /api/me/feature-flags → la lente APARECE. tag dmx-fase5-complete.

### FASE F1 · Autopiloto de Underwriting del Terreno ✅ COMPLETA 2026-06-09
Primer pilar del "Modelo del Mundo DMX" para el dev: el ciclo de decisión del SUELO en una pantalla (cuánto pagar → qué revisar → cómo ganar más). Detalle + checklist fino: **`memory/DEV_UNDERWRITING_WORLD_MODEL.md`** · tabla por chunk: **`memory/WAVE_PROGRESS.md`**.
- [x] F1.0 Poblar SIG catastral CDMX (1,524 colonias · ~90% COS/CUS · ~91% valor suelo) — `colonias_catalog` + superadmin.
- [x] F1.1 Doctrina de Datos visible cross-portal (`data_doctrine.py` + `/api/doctrine` + `shared/DataOrigin.js`) · tag checkpoint-f11-doctrina.
- [x] F1.2 Motor de Valor Residual (`valor_residual_engine.py` + pantalla dev Valor de Terreno) · tag checkpoint-f12-valor-residual.
- [x] F1.3 Due Diligence del predio (`predio_due_diligence_engine.py`, despierta riesgos FGJ/Atlas) · tag checkpoint-f13-due-diligence.
- [x] F1.4 Detector Norma 3 / fusiones rentables (`norma3_engine.py`) · tag checkpoint-f14-norma3.
- [x] F1.5 1-pantalla + Veredicto del lote agéntico (`lote_veredicto_engine.py` + `/analizar`) · tag checkpoint-f15-veredicto.
- [x] F1.6 Calibración vs Puente Alvarado + aplicar (`golden_calibration_engine.py` + `SuperadminCalibracion.js`) · examen global CALIBRADO · tag checkpoint-f16-calibracion.
- Rulings founder 2026-06-09: comisión 2% (CDMX) + honorarios 16% referencia, ambos editables. **Siguiente: F2 Autopiloto de Memorándum.**

## ARRANQUE
Fase 0.1 (audit multi-tenant) + 0.2 (contrato de unidad milimétrico). Es el cimiento del que cuelgan superadmin, dev, asesor y la API.
