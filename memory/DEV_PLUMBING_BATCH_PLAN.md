# Plan de batches — Plomería (unificación + wizard + cables a portales + granularidad) · 2026-06-05

Cierra los gaps de DEV_PORTAL_CONNECTIVITY_AUDIT + DEV_FUNNEL_GRANULARITY_MAP. Orden por dependencia.
Esfuerzo: S≈≤media tanda · M≈1 tanda · L≈2+ tandas.

## B0 · Unificación del modelo (CIMIENTO — bloquea B1-B3)
- ✅ B0.1 · Capa de lectura única `project_full(pid)` (fusiona seed + tabs) + `project_readiness` ("ficha X% lista para publicar", consumido por indicador en el Inicio · chips → tab). GET /api/dev/projects/{id}/full. Commit 0b56d9f4. · dep: — · M · base de todo
- ✅ B0.2 · `publish_to_developments()` espeja el payload canónico a `db.developments` (campos dev-compat + bloque `config` rico: servicios/scope/sistema/pagos/políticas/plusvalía). POST /api/dev/projects/{id}/publish + auto-publish en wizard.create_project. Front: botón "Publicar a portales" en ProjectReadiness (→ "↻ Actualizar portales" + "✓ Publicado" + fecha). Verificado: clic real crea doc Mongo (readiness 89%, source manual). · dep: B0.1 · M · visibilidad global
- B0.3 · Migrar portales (público/asesor/superadmin) a leer la capa única (adaptadores) · dep: B0.1 · M · fin del silo

## B1 · Wizard completo (al crear = tabs llenas)
- B1.1 · Servicios con tipo + amenity_scope en Step4 + persistir · dep: B0 · S
- B1.2 · Subida REAL de assets (Contenido → project_assets) · dep: B0 · M
- B1.3 · Docs legales + estado (Legal) · dep: B0 · M
- B1.4 · Paso Formas de pago (dev_payment_schemes) · dep: B0 · S
- B1.5 · Sistema constructivo (paso/sub-sección) · dep: B0 · S
- B1.6 · Políticas broker/venta en Comercialización · dep: B0 · S

## B2 · Cables a Marketplace (visible al comprador)
- B2.1 · Amenidades catálogo (+servicios/scope) → ficha pública + studio landings (quita los 15 slugs hardcoded) · dep: B0 · M · lo más visible
- B2.2 · Formas de pago del dev → cotizador público · dep: B0 · M
- B2.3 · Sistema constructivo → ficha pública (sello de confianza) · dep: B0 · S
- B2.4 · price_events → módulo de plusvalía público · dep: B0 · M

## B3 · Cables a Asesor + Superadmin
- B3.1 · broker_policy → acceso real del asesor (unir advisor_authorization con project_commercialization/brokers/preassignments) · dep: B0 · M · la política SÍ aplica
- B3.2 · Superadmin: agregador global por-tab (terminal Bloomberg) · dep: B0.1 · L

## B4 · Granularidad profunda del embudo (parcialmente independiente de B0-B3)
- B4.1 · Unificar los 2 universos de leads (db.leads ↔ asesor_contactos) · dep: — · L · habilita todo cross-etapa
- B4.2 · Captura estructurada: cotización (precio/descuento/forma) + razón de pérdida (taxonomía+competidor) + rondas de negociación · dep: B4.1 · M
- B4.3 · Embudo por asesor/canal + por prototipo (en Canales) · dep: B4.1 · M
- B4.4 · Cross-features en cockpits (presupuesto×pago, objeción×prototipo, fuente×cierre, zona×inventario) · dep: B4.1-2 · M
- B4.5 · "+info" por unidad = expediente (precio+cotizaciones+objeciones+vistas+AVM+ofertas) · dep: B4.2 · M
- B4.6 · Match óptimo lead→asesor (vía Cerebro) — el apex/moat · dep: B4.1-4 · L

## Paralelización
- B0 va PRIMERO y solo (cimiento, toca core compartido). Aquí, secuencial.
- Tras mergear B0: B1 / B2 / B3 / B4 tocan áreas casi disjuntas → paralelizables en terminales/worktrees separados (1 branch c/u).
- B4 es el más independiente (mundo leads/asesor) → puede correr en paralelo desde ya (salvo B4.5 que toca la tabla de precios).
- Cuidado: archivos compartidos (server.py registro de rutas, api/developer.js, FichaHome) conflictúan → un terminal "dueño" de esos, o rebase frecuente.
