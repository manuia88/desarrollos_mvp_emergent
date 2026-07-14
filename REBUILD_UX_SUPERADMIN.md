# REBUILD UX SUPERADMIN — plan y avance (2026-07-13)

Objetivo (founder): ~24 tabs × ~300 subtabs → navegación por PREGUNTA, lenguaje humano en cada
pieza (qué es · qué me dice · para qué sirve · qué hago), 6 dominios, CERO pérdida de motores/
scores/reportes/tabs. Anclado a la verdad viva (OpenAPI + registros auto-descritos), no a regex.

## Concepto: EL CATÁLOGO VIVO
Un registro maestro server-driven que INDEXA (no reimplementa) todo lo que el portal hace, con
capa humana + 6 dominios. El front pinta buscador + filtros; una pieza nueva en el backend
aparece sola. Base: MAPA_SUPERADMIN_FULLSTACK.md + MAPA_CONEXIONES_FULLSTACK.md + verdad viva.

## FASES
- **A · Catálogo maestro** ✅ 2026-07-13
- **A.1 · Auditoría + upgrades de Fase A** ✅ 2026-07-13 — audité mi propia Fase A y encontré 5 defectos, todos corregidos:
  (1) 🔴 7 vistas del sidebar faltaban en el catálogo (mi test de cero-pérdida solo cubría bloques) → agregadas (tenants, ia-conversacional, phase5, transactions, knowledge-graph, granularidad, inmobiliaria-leads) + test reforzado contra el crawl.
  (2) 🔴 CARFAX duplicado (producto + reporte) → dedup (carfax/dmx30 viven solo como producto/índice).
  (3) 🔴 el placeholder del buscador daba 0 resultados con sus propios ejemplos → ejemplos reales (absorción/renta/escasez) + chips de sugerencias clicables.
  (4) 🟡 el 'Ir' de los 44 reportes iba al Hub genérico → DEEP-LINK (?tab=reportes&bloque=X abre el reporte ya marcado; verificado: 'Generar reporte (1 bloques)').
  (5) 🟡 filtro 'necesita' disponible en API pero no en UI → chips 'Necesita: una zona/fecha/unidad' + las 41 features genéricas enriquecidas con lenguaje humano real (29 descritas a mano, 13 con fallback honesto marcado 'por_describir').
  111 piezas. Suites: backend 1544 · front 181. Verificado en navegador. — `catalogo_maestro.py` (registro + 6 dominios + agrega
  los 44 bloques auto-descritos + 41 features del feature_registry + 3 productos = 105 piezas) +
  GET /api/superadmin/catalogo (con búsqueda/filtros) + vista `SuperadminCatalogo.js` (buscador +
  chips de dominio/tipo + cards con lenguaje humano expandible + botón Ir) + entrada 'El Catálogo'
  como puerta del sidebar. Verificado en navegador: 105 piezas, búsqueda 'renta'→1 exacto, filtros
  por dominio. Tests: test_catalogo_maestro.py (3). CERO pérdida probada por test.
- **B · Home Pregunta-y-Filtra** ✅ 2026-07-13 — (1) buscador del catálogo AL FRENTE de la Home
  (`CatalogoQuickSearch`): '¿Qué quieres saber? 111 herramientas en 6 áreas' + sugerencias
  clicables + resultados en vivo con qué-es → clic navega a la pieza. (2) el ⌘K global ahora
  INDEXA las 111 piezas del catálogo (antes ~12 estáticas) con su lenguaje humano + deep-link;
  sublabel con el 'qué es' bajo cada comando. Verificado en navegador: 'renta'→Cap rate, ⌘K
  'absorci'→2 reportes con deep-link. Suites: backend 1544 · front 181.
- **B (antes)** ⬜ — elevar la home a filtros universales (tema/territorio/tiempo)
  + conectar ⌘K al catálogo.
- **C · Sidebar 6 dominios** ⬜ — reagrupar las 24 rutas en los 6 dominios + hubs por dominio +
  redirects de rutas viejas (nada se rompe).
- **D · Prender huecos** ⬜ — comercio-pb/cuota dev · zones-public · tablero de telemetría ·
  terminal-mercado enriquecida.
- **E · Matriz de trazabilidad** ⬜ — cada tab del crawl → su casa nueva, verificado antes/después.

## ENRIQUECIMIENTO PENDIENTE (mejora incremental, no bloqueante)
Las 41 features del feature_registry entran al catálogo con descripción genérica ("Capacidad del
sistema (X), del plan Y"). Fase A las INDEXA (cero pérdida); su capa humana rica se llena
incrementalmente igual que las 44 vistas/reportes/productos ya descritos a mano.
