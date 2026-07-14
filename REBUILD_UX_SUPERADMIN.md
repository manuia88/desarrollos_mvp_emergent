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
- **C · Sidebar 6 dominios** ✅ 2026-07-13
- **C.1 · Auditoría Fase C** ✅ 2026-07-13 — 2 defectos detectados y corregidos:
  (1) 🔴 GRAVE (arrastrado de Fase A): SuperadminCatalogo NO envolvía con SuperadminLayout → la
  página del Catálogo se renderizaba SIN sidebar. Envuelto (los 3 return: err/loading/main).
  (2) 🔴 'Productos DMX' nunca se resaltaba (su `to` con ?query no vive en pathname, así el
  isActive por startsWith fallaba y 'El Catálogo' se robaba el activo) → ruta propia
  /superadmin/productos (SuperadminCatalogo con dominioInicial='productos') + SuperadminRoute
  pasa props (...rest) + sectionFromPath mapea /productos. Verificado en navegador: catálogo CON
  sidebar, 'Productos DMX' resaltado, color devtools, filtro 3 de 111. CERO pérdida confirmada
  (diff rutas nav viejo vs nuevo: idénticas). Front 181. — el sidebar se reagrupó de 7 tiers técnicos
  (Datos/Inteligencia/Monetización…) a los MISMOS 6 dominios del catálogo:
  Principal · 🏙️ Mercado · 👤 Demanda y personas · 🏗️ Inventario y devs · 💰 Dinero e ingresos ·
  ⚙️ Operación y seguridad · 📦 Productos del moat. Un solo lenguaje mental en todo el portal.
  CERO pérdida / CERO redirect necesario: ninguna URL cambió, solo su casa en el nav. Los colores
  Aurora se reusan (mapeo dominio→section_key en sectionFromPath + verificado: tenants→verde/Dinero,
  transactions→cian/Mercado, KG→naranja/Operación). 'Productos DMX' abre el catálogo filtrado
  (?dominio=productos → 3 productos). Verificado en navegador: nav de 6 dominios + rutas movidas
  cargan + color correcto. Front 181.
- **C (antes)** ⬜ — reagrupar las 24 rutas en los 6 dominios + hubs por dominio +
  redirects de rutas viejas (nada se rompe).
- **D · Prender huecos** ✅ 2026-07-13 — AUDITORÍA: los 5 huecos del mapa estaban SOBREESTIMADOS
  (heurístico del crawl contaba botones + memoria desactualizada). Verificado con grep +
  orphan-detector (194 motores, 0 aislados; 46 'endpoints sin front' = falsos positivos por URLs
  dinámicas): los 5 YA están cableados o se retiraron a propósito (comercio/cuota con endpoint+UI ·
  zones-public retirado · lens/module_open consumidos · terminal-mercado página rica · inmo-leads
  vista plana por diseño). HUECO REAL encontrado y prendido: los 7 LENTES de Desarrollos→Inteligencia
  (ricos, antes solo descubribles con clic interno) → +7 piezas al catálogo (118) con deep-link
  ?view=inteligencia&lente=X. Verificado en navegador: 'construir' en el catálogo → abre el lente.
  Suites: backend 1544 · front 181.
- **D (antes)** ⬜ — comercio-pb/cuota dev · zones-public · tablero de telemetría ·
  terminal-mercado enriquecida.
- **E · Matriz de trazabilidad** ⬜ — cada tab del crawl → su casa nueva, verificado antes/después.

## ENRIQUECIMIENTO PENDIENTE (mejora incremental, no bloqueante)
Las 41 features del feature_registry entran al catálogo con descripción genérica ("Capacidad del
sistema (X), del plan Y"). Fase A las INDEXA (cero pérdida); su capa humana rica se llena
incrementalmente igual que las 44 vistas/reportes/productos ya descritos a mano.

## AUDITORÍA FASE B + ATLAX — ✅ 2026-07-13
Pregunta founder: "¿el buscador es lo mismo que Atlax? ¿dónde queda Atlax?". Reveló un defecto
real de arquitectura/etiqueta. Mapa aclarado y corregido:

### Las 3 cosas (distintas y complementarias)
- **El Catálogo + ⌘K** (Fase A/B) = NAVEGACIÓN. Escribes el nombre de una herramienta → te LLEVA.
  Instantáneo, sin IA, sin costo. Responde "¿a dónde voy?".
- **Copilot DMX (⌘J)** = el ATLAX del superadmin. Chat de IA (Claude) que RESPONDE con datos y
  ejecuta acciones (askCopilot). Responde "¿cuál es la respuesta?".
- **Atlax público** = el mismo tipo de asistente pero para COMPRADORES (/asistente, /atlax), 55+
  tools. No es superadmin.

### El defecto (founder lo cazó)
Mi buscador decía "¿Qué quieres saber?" — esa es la PROMESA de Atlax (responder). Pero solo
navegaba: una pregunta natural daba 0 resultados. Confusión de superficies.

### El fix (los hago trabajar JUNTOS)
- Re-etiqueta: "Encuentra tu herramienta · escribe y te llevo · ¿es una pregunta? te la responde
  el Copilot DMX". Ya no compite con Atlax; lo COMPLEMENTA.
- HANDOFF: cuando el buscador da 0 herramientas (es una pregunta, no un nombre) → botón
  "Pregúntale al Copilot DMX" que ABRE el Copilot y ENVÍA la pregunta sola (preguntarAlCopilot →
  evento con prompt → useAICopilot auto-send). En Home y en la página del Catálogo.
- Verificado end-to-end en navegador: 'cuánto cuesta un depa en condesa' → detectado pregunta →
  Copilot abierto + pregunta auto-enviada. (La respuesta cae a fallback solo por falta de API key
  local — el cableado es correcto.)
Regla de oro: el Catálogo te LLEVA, el Copilot te RESPONDE, y el buscador te pasa de uno al otro
sin que tengas que saber cuál es cuál. Suites: backend (catálogo+seguridad) · front 181.


## FASE C — CERO DEUDA (upgrades post-auditoría) — ✅ 2026-07-13
Orden founder: 'cero deuda, corrige, mejora e implementa'. Las 2 oportunidades anotadas, hechas:
- **Deuda de color eliminada**: los section_key ya no aliasean (antes 'Inventario' usaba color-key
  'crecimiento'). Ahora los 6 dominios son section_key de PRIMERA CLASE (mercado/demanda/inventario/
  dinero/operacion/productos) con su propia regla de color en superadmin-aurora.css + campo `dominio`
  en el nav. sectionFromPath devuelve el dominio real. Productos estrena color ámbar (#FF9F1C).
- **Conteo por dominio en el sidebar**: cada tier muestra su nº de herramientas (🏙️ Mercado 30 ·
  👤 Demanda 33 · 🏗️ Inventario 9 · 💰 Dinero 13 · ⚙️ Operación 23 · 📦 Productos 3), server-driven
  del catálogo (fetch solo superadmin, fail-soft). El sidebar y el catálogo muestran el MISMO número.
Verificado en navegador: 6 dominios con su color propio + conteo correcto. Front 181.
