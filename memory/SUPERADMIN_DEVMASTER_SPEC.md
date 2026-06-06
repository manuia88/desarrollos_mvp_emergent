# Superadmin "Dev-Master" — Spec + Checklist de construcción

2026-06-06 · Founder pidió: el superadmin no solo el concentrado, sino visibilidad de TODA la plataforma
como un "dev-master" que tiene todos los desarrollos de todos los devs + analítica máxima.

## Hallazgo de auditoría (clave)
El superadmin NO está apagado — está enorme y mayormente prendido: ~73 secciones de menú, ~54 endpoints
con datos reales, +20 motores ML/análisis (AVM, forecast, DRPI, hedónico, demand-gap, close-prob, anomaly,
cube OLAP, knowledge graph, taste model, conversation suite, DI/legal). **El problema no es falta de
analítica — es que está DISPERSA en 73 menús, no junta por proyecto ni en un home.**
Cables genuinamente dormidos: (1) observabilidad del loop ML self-tuning (close_prob_tuning, drift) —
corre por cron sin panel; (2) motores de conversación (hook/plan-venta/enrichment) sin vista agregada;
(3) 3 motores dormidos por falta de llaves (enrich-zone AirROI/GTFS/DENUE/catastro, atom-from-text NLP,
atom-from-photos visión).

## DECISIÓN de la ficha por proyecto: Opción B (3 tabs), NO duplicar las 10
Las 10 tabs del dev son para OPERAR (subir fotos, editar). El superadmin OBSERVA/ANALIZA. Para EDITAR
ya existe "impersonar" (actuar como el dev en su portal real → cero deuda).
- **Tab A · Concentrado** (solo lectura): estado del proyecto, readiness, lo que ve el comprador.
- **Tab B · Analítica**: TODA la analítica del proyecto JUNTA (AVM, forecast, demanda, plusvalía, canales,
  close-prob, hedónico) — junta lo disperso.
- **Tab C · Solo superadmin**: interno (comisión/costos/margen) + comparativo vs cohorte + dev dueño + auditoría.

## HOME del dev-master — catálogo de TODO lo medible (máxima granularidad)
### Áreas base (1ª capa · casi todo tiene motor 🔧)
1. Oferta/Inventario — #devs/proyectos/unidades (disp/apartadas/vendidas), por etapa/tipo/segmento/zona, m², ticket, lanzamientos, concentración por dev.
2. Precios — precio/m² (prom/mediana/percentiles) global+zona, sobre/sub-valuados vs 🔧AVM, plusvalía, 🔧DRPI, 🔧forecast 3/6/12m, descuentos.
3. Demanda — leads (proyecto/zona/canal), qué planes/zonas/prototipos piden (cotizador interes), presupuesto, tipo comprador, tendencia, 🔧reverse-search.
4. Oferta vs Demanda — 🔧demand-gap (dónde construir), absorción (meses para agotar), mismatch.
5. Ventas/Conversión — embudo vista→lead→cita→oferta→cierre, conversión por canal, velocidad, win-rate, 🔧pipeline ponderado close-prob, GMV.
6. Canales/Brokers — inhouse vs broker (leads/cierres/ticket/respuesta), ranking asesores/inmobiliarias, comisiones.
7. Devs/dueños — ranking por inventario/ventas/readiness, salud fichas, concentración, negocio (trials/ingresos).
8. Zonas/Mercado — por alcaldía/colonia (precio/m², inventario, demanda, absorción, riesgo), scores de barrio, comparativo zonas, 🔧hedónico, 🔧heatmap demanda.
9. Riesgo/Control — riesgo legal (verde/ámbar/rojo), inventario estancado, 🔧anomalías, cobertura documental, duplicados/fraude.
10. Calidad/IA — sello constructivo, reviews, salud de modelos (AVM/forecast/close-prob accuracy), costo IA por tenant.

### Cruces killer (2ª capa · las joyas ⭐ · el "Modelo del Mundo DMX")
11. Comportamiento — 🔧gusto visual del mercado (taste model), objeciones (minería conversaciones), 🔧DISC por zona, tiempo de maduración.
12. ⭐ Demanda latente / dónde construir — "N compradores buscan X en zona Y, solo M unidades" → decir a devs dónde construir. + qué amenidades incluir (gusto+hedónico+demanda).
13. Mercado predictivo — stock score por proyecto, predicción sold-out, elasticidad de precio, lookalike de éxitos.
14. ⭐ Macro+ciudad — transporte(GTFS)→precio, negocios(DENUE)→demanda, riesgo sísmico/climático→valor, tasas(BANXICO)→crédito, gentrificación.
15. Competencia/red — 🔧knowledge graph: quién compite, proyectos que comparten compradores, red de asesores, inventario zombie.
16. Calidad→resultado — respuesta<2h→cierre, fotos→leads, ficha completa→ventas, legal→confianza→conversión.
17. Negocio/financiero — margen real por proyecto/dev, LTV del dev, GMV de comisiones, velocidad de capital.
18. ⭐ Brief diario "el mercado en una frase" + índice de salud del mercado CDMX (un VIX inmobiliario vendible).

## CHECKLIST DE CONSTRUCCIÓN (front+back siempre · 🔧=reusa motor existente)

### Fase 0 · Cimientos del portal — ✅ HECHO (commit fa1e00ef)
- [x] Back: GET /api/superadmin/devmaster/projects (filtros zona/segmento/etapa/dev/publicado + facetas) — routes/superadmin_devmaster.py
- [x] Front: sección "Desarrollos" en menú superadmin (tier Principal) + ruta /superadmin/desarrollos
- [x] Front: SuperadminDesarrollos (grid + filtros + buscador)

### Fase 1 · Ficha del proyecto (3 tabs) — ✅ HECHO (commit fa1e00ef)
- [x] Tab Concentrado — comprador + operación + qué falta (reusa project_detail)
- [x] Tab Analítica — REUSA cockpits del dev (InsightsIntel AVM + CanalesIntel + VentasIntel) wrapped theme-light · "junta lo disperso"
- [x] Tab Solo superadmin — interno + COMPARATIVO vs cohorte (percentiles precio/readiness/demanda) + auditoría
- [x] Botón "Impersonar dev" (editar como el dev) — reusa impersonateTenant
- [x] Back: GET /devmaster/project/{id} = project_detail + comparativo

### Fase 2 · Home cockpit global (áreas 1-9) — ✅ HECHO (commit bbe008b6)
- [x] Back: GET /devmaster/home — agrega desde _catalog_rows + db.leads (KPIs, precios, oferta/etapa, concentración devs, ⭐dónde construir, demanda/planes, canales, devs ranking, zonas, riesgo) + filtros zona/segmento/etapa/dev
- [x] Front: DesarrollosPanorama (cockpit oscuro) + toggle Panorama/Catálogo en SuperadminDesarrollos

### Fase 3 · Cruces killer ⭐ (joyas, una por una)
- [x] **Brief diario "el mercado en una frase"** — ✅ HECHO (commit b7b6bba0 + fix loop ec06e528)
      Back: GET /devmaster/brief (resumen narrativo + señales + 3 acciones agénticas con link + fuente=asistente-de-mercado).
      Front: BriefCard arriba del Panorama (titulo "El mercado hoy", señales, acciones clicables). Verificado en vivo.
      ⚠️ LECCIÓN: panoFilters como objeto literal en el padre → loop infinito de fetch ocultaba el brief; fix con useMemo.
- [x] **Demanda latente / dónde construir** — ✅ HECHO (commit Fase 3 #2)
      Back: GET /devmaster/donde-construir — cruza demanda real (leads: budget+prototipo→recámaras+dev→zona)
      vs oferta (units_available por banda×recámaras). Veredicto+mensaje por celda · prototipo pedido ·
      índice por zona · sobreoferta · reusa dmx_demand (cubo). Cotizador+amenidades(taste) stubbeados fail-open.
      Front: DondeConstruir.js (3er toggle) + deep-link Panorama + CTA cierra ciclo (→catálogo filtrado).
      Verificado en vivo: 42 leads → "Lomas Chapultepec 4rec $16-22M: 6 buscando, 0 inventario → construir".
- [x] **Gusto visual del mercado (taste model) + amenidades** — ✅ HECHO (commit Fase 3 #11)
      Back: GET /devmaster/gusto-mercado — rescata el modelo de gusto B5.4 a nivel MERCADO.
      Tag fotos catálogo (photo_tagger) → qué engancha (índice ponderado por demanda) · JOYA:
      amenidad→demanda lift (cava +800%/sky lounge +500% vs gym/roof estándar) + confianza ·
      qué fotos subir · perfil comprador típico · gusto por zona · acciones agentic. Primary:
      asesor_swipe_events (vacío hoy); fallback: catálogo×leads. Cero deuda.
      Front: GustoMercado.js (4o toggle). Verificado en vivo (Polanco $14M, recámara índice 2.18).
- [ ] Objeciones + comportamiento del comprador (🔧minería conversaciones)
- [ ] Stock score + predicción sold-out + elasticidad de precio
- [ ] Macro+ciudad (transporte/negocios/riesgo→valor) — requiere prender conectores gov (llaves)
- [ ] Competencia y red (🔧knowledge graph)
- [ ] Brief diario "el mercado en una frase" + índice de salud CDMX
- [ ] Observabilidad de la IA (cómo aprende close-prob/forecast/drift — el cable dormido)

## Orden recomendado
Fase 0 → Fase 1 (ficha B) → Fase 2 (home) → Fase 3 (joyas, priorizadas por el founder).
Empezar por Fase 0+1 da el "dev-master" navegable con la ficha que junta lo disperso.
