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

### FASE 2 · Capas IA sobre el cubo
- [ ] 2.1 AVM hedónico por unidad (cada atributo explica precio/m²) + **amenity value ranker**.
- [ ] 2.2 Demanda: absorción, demand-gap, lead scoring, prob. cierre por unidad.
- [ ] 2.3 DL visión (auto-tag fotos) + self-improving loop (cada cierre recalibra).
- [ ] 2.4 Cerebro agéntico lee el cubo → detecta → propone → ejecuta con OK (dev y superadmin).

### FASE 3 · Las lentes (mismo cubo, distinto permiso)
- [ ] 3.1 **Superadmin**: god-view (terminal Bloomberg, cubo crudo milimétrico) + control plane (provisionar tenants, asignar planes/snapshots).
- [ ] 3.2 **Dev mold**: su slice + benchmark anónimo + **Asistente protagonista**. Idéntico para los N devs.
- [ ] 3.3 **Asesor mold**: su slice + Copilot. Idéntico para los millones de asesores.
- [ ] 3.4 **Comprador**: lente pública (marketplace).

### FASE 4 · Distribución / monetización (del doc)
- [ ] 4.1 SEO programático por AGEB (del cubo).
- [ ] 4.2 IE as API / data marketplace (vender el cubo).
- [ ] 4.3 Transparency Index público (cubo anónimo).

### FASE 5 · Activación por plan (GoHighLevel)
- [ ] 5.1 Definir planes (qué features incluye cada uno).
- [ ] 5.2 Snapshots: superadmin prende features por tenant/plan.
- [ ] 5.3 Todo construido y conectado; se prende por plan + llegada de dato.

## ARRANQUE
Fase 0.1 (audit multi-tenant) + 0.2 (contrato de unidad milimétrico). Es el cimiento del que cuelgan superadmin, dev, asesor y la API.
