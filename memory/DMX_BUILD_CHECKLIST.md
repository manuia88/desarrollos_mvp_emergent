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

### FASE 0 · Cimientos del molde (control plane + contrato de datos)
- [ ] 0.1 Auditar y cerrar el modelo multi-tenant: un helper único de scoping (org/tenant), confirmar superadmin=god / dev=slice / asesor=slice. Cerrar fugas cross-tenant.
- [ ] 0.2 **Contrato de datos: esquema UNIDAD milimétrico** (Pydantic + Mongo) — 17 grupos A-Q de DMX_SPINE_MASTER. Todo nullable (sin dato = null).
- [ ] 0.3 Esquemas DESARROLLO · PROTOTIPO · AMENIDAD (taxonomía ~50 enum) · ZONA. Relaciones + índices.
- [ ] 0.4 Snapshots temporales (colección append-only, nunca sobreescribir). El historial = activo.
- [ ] 0.5 Entitlement/Snapshot engine (GoHighLevel): catálogo self-registering de features + definición de planes + asignación por tenant + check FAIL-OPEN. (sobre W5.FF.)

### FASE 1 · El cubo (motor de inteligencia de mercado)
- [ ] 1.1 Alimentar `cube_olap_engine` con el átomo rico (todas las dimensiones/medidas).
- [ ] 1.2 Agregaciones por 6 jerarquías (geo/producto/tiempo/amenidad/comprador/banda).
- [ ] 1.3 Auto-llenado NLP (extraction_engine): leer brochure/PDF → llenar el átomo.
- [ ] 1.4 Conectores en stub de fuentes que aún no fluyen (AirROI, DENUE, GTFS, catastro…): listos y dormidos.

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
