# Auditoría — Conectividad de la ficha del dev con portales + wizard · 2026-06-05

Origen: founder preguntó si TODO lo construido en las tabs está conectado con superadmin/asesor/
marketplace + si el wizard "Nuevo proyecto" carga toda la info de las tabs (para quedar listo para los
portales, y luego el dev modifica). Auditado por 2 agentes. Veredicto: **NO está conectado (~10-15%).**

## HALLAZGO RAÍZ: dos universos de datos paralelos
- **Realidad operativa del dev** = colecciones Mongo por-tab: `project_amenities`, `project_commercialization`,
  `dev_payment_schemes`, `project_construction_progress`, `price_events`, `db.projects` (wizard), `db.leads`.
- **Vitrina pública / superadmin** = `data_developments.py`/`data_seed.py` (SEED estático) + overlay angosto
  (`auto_sync_engine` sincroniza solo ~7-9 campos planos) + `db.developments`.
- Casi NO se cruzan. La ficha del dev es hoy un back-office privado; el comprador/superadmin ven otro dataset.

## ¿Qué del dato del dev llega a los portales?
| Dato del dev | Marketplace | Asesor | Superadmin |
|---|---|---|---|
| Amenidades catálogo (77) + servicios con tipo + scope | 🔴 silo (público lee `dev.amenities` plano de seed; studio landing mapea 15 slugs hardcoded) | 🔴 | 🔴 |
| Sistema constructivo | 🔴 | 🔴 | 🔴 |
| Formas de pago + políticas | 🔴 (cotizador público usa slider genérico, no los schemes) | 🔴 (acceso real corre por advisor_whitelist, desconectado de broker_policy) | 🔴 |
| price_events / historial de precios | 🔴 | 🔴 | 🟡 parcial (metrics_cube lee `units_history`/seed, no el motor nuevo) |
| Leads enriquecidos (canal/budget/etapa) | n/a | ✅ **CONECTADO** (`services/lead_bridge.py` materializa el lead en "Mis Leads", idempotente/dedup/fail-open) | 🟡 parcial |
| *-intel (location/sales/insights/amenity/broker/channel) | 🔴 gate solo dev | 🔴 | 🔴 |
| Scores IE por proyecto | — | — | 🟡 (superadmin ve IE por zona, no por proyecto) |

**El único cable sólido = el lead** (`lead_bridge`, ejemplar — usarlo como patrón para los demás).

## Wizard "Nuevo proyecto" — ¿captura todo?
5 de 7 pasos persisten; faltan piezas grandes (back `routes/wizard.py:create_project`):
| Paso/dato | ¿Captura UI? | ¿Persiste? |
|---|---|---|
| Categoría, Operación, Ubicación (lat/lng) | ✅ | ✅ |
| Amenidades — lista | ✅ | ✅ |
| Amenidades — **servicios con tipo** + **amenity_scope** | 🔴 | 🔴 GAP |
| **Contenido** (fotos/planos/renders/brochure/video/tour) | UI sí (DragDrop) | 🔴 **stub — solo nombres en estado React; el back ignora el payload** |
| **Legal** (docs uso suelo/SEDUVI/contratos + estado) | UI sí | 🔴 **stub — se pierden** |
| Comercialización (brokers/comisión/IVA) | ✅ | ✅ |
| **Políticas** (broker_policy/sales_policy) | 🔴 | 🔴 (solo default si entra a la tab después) |
| **Formas de pago** (dev_payment_schemes) | 🔴 no hay paso | 🔴 |
| **Sistema constructivo** | 🔴 no hay paso | 🔴 |
- El wizard escribe `db.projects`, pero **NUNCA escribe `db.developments`** → los proyectos del wizard son
  **invisibles** para superadmin (que itera `db.developments`/seed) y para el marketplace (seed+overlay).

## CONCLUSIÓN
La visión del founder ("crear proyecto → todas las tabs llenas → listo para portales → luego el dev edita")
HOY NO se cumple. Dos problemas a resolver, en orden:
1. **Unificar el modelo de datos** (raíz): que el wizard escriba/espeje en `db.developments` (o que superadmin/
   marketplace lean `db.projects` + las colecciones por-tab). Sin esto, todo lo demás sigue en silo.
2. **Completar la captura del wizard**: servicios+scope, subida real de assets (Contenido), docs (Legal),
   formas de pago, sistema constructivo, políticas → al crear, las tabs quedan llenas.
3. **Cablear cada dato a su portal** (5 cables, orden de impacto):
   (a) amenidades catálogo → marketplace + studio landings (lo más visible/barato),
   (b) formas de pago del dev → cotizador público,
   (c) broker_policy → acceso real del asesor (unir advisor_authorization con project_commercialization/brokers),
   (d) sistema constructivo → ficha pública (sello de confianza),
   (e) price_events → módulo de plusvalía público.
Patrón a copiar: `lead_bridge` (idempotente, dedup, fail-open, auto-reparable en arranque).
