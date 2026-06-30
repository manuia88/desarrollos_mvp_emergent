# Auditoría V2 · UX/UI — 3 portales (público/comprador · asesor · desarrollador)

> Excluye superadmin (no cuenta para esta auditoría).
> Fecha: 2026-06-30. Fuente: hallazgos UX confrontados contra el repo (deduplicados, falsos positivos descartados).
>
> **Veredicto general:** la app está **mucho mejor de lo que un grep superficial sugiere**. Los flujos vivos (V2, con los 4 flags en `true`) no tienen tabs/botones muertos en el núcleo, los empty-states son honestos y la mayoría de "Aún no…" son legítimos. Los problemas reales son de **dos clases**: (1) un puñado de **controles/páginas muertos** que cortan el flujo, y (2) una **lacra transversal de jerga/códigos internos** filtrada a la UI. Casi todo es una pasada de copy + cableado de 1-2 días, no arquitectura.

---

## Resumen por tipo

| Tipo | Total | Crítico | Alto | Medio | Bajo |
|---|---|---|---|---|---|
| Control muerto | 5 | 1 | 2 | 0 | 2 |
| Página muerta | 5 | 0 | 1 | 3 | 1 |
| Jerga | 9 | 0 | 5 | 4 | 0 |
| Estado faltante | 7 | 0 | 1 | 4 | 2 |
| Title-case / estándar | 5 | 0 | 0 | 2 | 3 |
| **TOTAL** | **31** | **1** | **9** | **13** | **8** |

> Tras deduplicar: **ASR-02 ≡ TX-03** (misma fuga de env-vars en `StudioDashboard.js`) → unificados en **ASR-02**. **ASR-06 ≡ DEV-06 "Calendario próximamente"** son stubs distintos (asesor vs no aplica) → se mantienen separados. Falsos positivos descartados: comentarios de código `W5.x/F2.x/MOAT` (no visibles), empty-states honestos "Aún no…", `?v1` y `MensajesPlaceholder` son ramas legacy detrás de flag (se listan como página muerta, no como bug vivo).

---

## PÁGINAS / CONTROLES MUERTOS (arreglar PRIMERO)

> Lo que **no genera acción** o lleva a un callejón. Esto rompe el flujo y la confianza; es lo primero.

| id | severidad | ubicación | qué está muerto | fix |
|---|---|---|---|---|
| **CMP-01** | 🔴 CRÍTICO | `FichaDesarrollo.js:182` | Botón fijo `🆕 Probar rediseño →` a `?v3=1` (prototipo inacabado) **visible para TODO comprador público**, sin flag. | Eliminar el `<a>` o gatearlo: `{process.env.REACT_APP_DEV_PREVIEW === 'true' && (...)}`. No debe shippear. |
| **TX-01** | 🔴 ALTO | `components/landing/CtaFooter.js:109` (home `/`) | Los 4 links del footer (Privacidad, Términos, Asesores, Desarrolladores) son `href="#"` → muertos. Privacidad/Términos **ni siquiera tienen página destino** (riesgo legal/compliance). | Mapear `FOOTER_LINKS` a rutas: asesores→`/asesores`, desarrolladores→`/desarrolladores`; crear/enlazar `/aviso-de-privacidad` y `/terminos` (o `/privacy/dsr` mínimo). Ocultar el que no tenga destino. |
| **TX-02** | 🔴 ALTO | `PropertyListings.js:403` · `ColoniasBento.js:252` (home `/`) | CTAs "Ver más" y "Ver todas" son `href="#"` muertos, cuando `/marketplace` y `/colonias` ya existen. | `<Link to="/marketplace">` y `<Link to="/colonias">`. |
| **DEV-01** | 🔴 ALTO | `developer/ProyectoDetail.js:486-495` (`edit-proyecto-btn`) | Botón **"Editar"** en la cabecera de la ficha de proyecto **no tiene `onClick`** — clic = nada. Verificado: el `<button>` no incluye handler. | Cablear `onClick` (togglear edición inline — `useInlineSaver` ya está en la página — o navegar a `?tab=contenido`). Si no hay destino aún, ocultarlo. |
| **CMP-03** | 🔴 ALTO | `pages/PropertyDetail.js` (`/propiedad/:id`) + `marketplace/PropertyCard.js` | Página legacy huérfana del modelo viejo "propiedad única". Solo alcanzable por shares antiguos (`PropertyCard` solo se importa a sí misma). Hero = SVG falso de relleno en cada propiedad; loading/error = un solo `…` permanente. | Retirar `/propiedad/:id` + `PropertyCard`/`PropertyDetail`, o redirigir a `/desarrollo/:id`. Mínimo: distinguir loading de not-found, CTA "Volver al marketplace", quitar el SVG falso. |
| **ASR-06** | 🟡 MEDIO | `asesor/AsesorCitas.js:313-320` | Tab "Calendario" de la Agenda renderiza stub "Vista de calendario disponible próximamente." (tab que no entrega valor). | Ocultar el tab hasta implementarlo, o construir vista mensual básica con las citas ya cargadas. |
| **DEV-09** | ⚪ BAJO | `components/developer/ContenidoTab.js:160,318-336` | Modal de preview de imagen existe completo pero `setPreviewAsset()` **nunca se invoca para abrirlo** (código muerto + función esperada ausente). | Pasar `onPreview` a `AssetThumb` y llamar `setPreviewAsset(asset)` al click en la imagen. |
| **TX-07** | 🟡 MEDIO | `components/dev/Sidebar.js:49` (ficha legacy, solo `?v1=1`) | CTA "Agendar visita" solo dispara `alert()` — no captura, no crea lead. Mitigante: solo accesible con `?v1=1`; la ficha viva (`FichaDesarrollo`) sí captura. | Borrar la página legacy `DevelopmentDetail.js`+`dev/Sidebar.js`, o reemplazar el `alert` por el modal real / `/reservar/:slug`. |
| **TX-06** | 🟡 MEDIO | `developer/DesarrolladorCRMShell.js:138-160` (`/desarrollador/mensajes`, flag OFF) | Con `DEV_V2` OFF cae a placeholder "Disponible en Phase 8" (jerga de fase). Con flag ON va a bandeja real. | Retirar la rama legacy y redirigir a la bandeja real; mínimo quitar "Phase 8" y esconder la entrada si el flag está OFF. |
| **TX-09** | ⚪ BAJO | `templates/landings/VideoFirstTemplate.js:84` | "Tour 3D disponible próximamente" ocupa espacio en vez de ocultarse (sin hide-if-empty). | Si no hay URL de tour, no renderizar la sección (patrón de `FichaDesarrollo`). |

---

## Hallazgos por severidad y tipo

### 🔴 CRÍTICO

| id | tipo | ubicación | fix 1-línea |
|---|---|---|---|
| **CMP-01** | control muerto | `FichaDesarrollo.js:182` | Eliminar/gatear el botón "Probar rediseño →"; hoy lo ve todo comprador público. |

### 🔴 ALTO

| id | tipo | ubicación | fix 1-línea |
|---|---|---|---|
| **TX-01** | control muerto | `CtaFooter.js:109` (home) | Footer legal con 4 `href="#"`; cablear a rutas reales y crear Privacidad/Términos (compliance). |
| **TX-02** | control muerto | `PropertyListings.js:403` · `ColoniasBento.js:252` | "Ver más"/"Ver todas" → `<Link>` a `/marketplace` y `/colonias`. |
| **DEV-01** | control muerto | `ProyectoDetail.js:486-495` | Botón "Editar" sin `onClick`; cablear o esconder. |
| **CMP-03** | página muerta | `PropertyDetail.js` (`/propiedad/:id`) | Retirar/redirigir página legacy; quitar hero SVG falso; arreglar loading/error. |
| **CMP-02** | jerga | `Inteligencia.js:44,78,170` (público) | "MOTOR IE / IE ENGINE" → "Cómo medimos cada zona / En vivo · análisis de la colonia / Quién usa estos datos". |
| **ASR-01** | jerga | `asesor/AsesorLeadsDev.js:15` | Eyebrow "4.29 · LEADS UNIVERSAL" (1ª cosa que ve el asesor) → "CRM · Pipeline" o quitarlo. |
| **ASR-02** *(≡TX-03)* | jerga | `asesor/StudioDashboard.js:35,59,105,341,474` | Quitar env-vars (`STUDIO_VIDEO_ENGINE`/`STUDIO_ADS_ENGINE`), "stub", "WAVE 1"; banner humano "Modo demostración · pide a tu admin activarlo". |
| **ASR-03** | jerga | `i18n/.../conversation_round1.json` (Playground) | "System prompt"→"Instrucciones del asistente"; "Handoff"→"Pasar a un humano"; "LLM key"→"sin IA conectada". |
| **DEV-03** | jerga | eyebrows en ≥9 pantallas dev (D9, 4.14, 4.19, 4.22, 4.24, 4.30, W4.1A…) | Eliminar el prefijo de batch de TODOS los eyebrows visibles (patrón ya usado en `DesarrolladorConfiguracion.js:104`). |
| **DEV-04** | jerga | `DesarrolladorPricingLab.js:24,30,33` | Eyebrow "4.14 · PRICING LAB"+slug crudo+"visitor_id/funnel" → "Experimentos de precio · {nombre}" en español humano. |

### 🟡 MEDIO

| id | tipo | ubicación | fix 1-línea |
|---|---|---|---|
| **CMP-04** | estado faltante | `Marketplace.js:188,705` | El `.catch` iguala error a "0 resultados"; agregar `fetchError` + panel "No pudimos cargar · Reintentar". |
| **CMP-05** | estado faltante | `Marketplace.js:706` · `PropertyDetail.js:65` | Loading público = un `…`; reemplazar por skeleton cards con shimmer. |
| **CMP-06** | jerga | `marketplace/DevelopmentCard.js:98` | Tooltip "Basado en IE Score" → "Según su análisis de inversión vs la zona". |
| **CMP-07** | estado faltante | `ficha/LeadCaptureModal.js:37` | Fail-open: muestra "✅ Un asesor te contacta" aunque falle el POST → en `catch` NO marcar `sent=true`; reintentar/encolar. |
| **DEV-02** | página muerta | `developer/CrmFunnel.js:34,119` | Slug demo `'altavista-polanco'` hardcodeado + input de slug a mano → `<select>` con `listProjectsWithStats()` y default al 1er proyecto real. |
| **DEV-05** | jerga | `CrmFunnel.js` · `DesarrolladorReportes.js:248` · `DesarrolladorLeads.js:505` · `DesarrolladorDemanda.js:300` | "Funnel/Sankey/drop/Booking/Slot/UTM" → "Embudo/Flujo/se pierde/Cita agendada/Horario/por origen". |
| **DEV-06** | jerga | `MisProyectos.js:540` · `ProyectoDetail.js:383` · `Reportes.js:321` | "Revenue MTD/target" → "Ingresos del mes/Meta de ingresos" (ya existe el canon en `Reportes.js:158`). |
| **DEV-07** | title-case | `ProyectoDetail.js:796,809,872,887` | "CAPTURAR NUEVO TOUR/SUBIR ARCHIVO/PREVIEW/BORRAR" → title-case humano vía `titleCase()` (ya importado). |
| **DEV-08** | jerga | `ProyectoDetail.js:777,780` | "Gaussian Splatting / iframe embedable" → "Tours 3D inmersivos · listo para embeber en tu sitio". |
| **DEV-10** | estado faltante | `InmobiliariaDashboard.js:37,70` | Sin estado de error (cae a `—` silencioso) → `<ErrorState onRetry>` + empty honesto. |
| **DEV-11** | title-case | `InmobiliariaDashboard.js:52,76` · `AsesoresMetrics.js:33` | "Dashboard Inmobiliaria/Total Leads/Win Rate/response time" → español sentence-case ("Panel de la inmobiliaria/Leads totales/Tasa de cierre/tiempo de respuesta"). |
| **DEV-12** | jerga | `DesarrolladorDashboard.js:517,533` | "AUTO-SYNC · DOCUMENT INTELLIGENCE" + slug crudo en chips → "Sincronización automática" + nombre legible del desarrollo. |
| **ASR-04** | estado faltante | `asesor/SenalesCalientesCard.js:9,19` | Muestra `e.message` crudo (tope de pantalla Leads) → texto humano fijo + botón reintento. |
| **ASR-05** | estándar | `asesor/SenalesCalientesCard.js:13-55` | Colores hardcodeados (#e5e5e5…) → tokens del tema; nombrar índices mágicos `[85]/[86]/[81]`. |
| **TX-04** | estado faltante | `comprador/CompradorFavoritos.js` · `Historial.js` · `SavedSearches.js` | Las 3 sin `catch`/estado de error: fallo de red se ve como "sin favoritos" → `<ErrorState onRetry>`. |
| **TX-05** | jerga | `comprador/CompradorFavoritos.js:130` | Badge renderiza `{fav.item_type}` crudo ("project/unit") → mapa `{project:'Proyecto', colonia:'Colonia', unit:'Unidad'}`. |

### ⚪ BAJO

| id | tipo | ubicación | fix 1-línea |
|---|---|---|---|
| **CMP-08** | estado faltante | `Inteligencia.js:247` | "top colonias" sin estado vacío → bloque `{!loading && items.length===0 && …}`. |
| **CMP-09** | estado faltante | `Mapa.js:202,480` | Sin token/colonias el mapa queda gris vacío → placeholder con CTA "Ver listado →". |
| **CMP-10** | control muerto | `comprador/CompradorDashboard.js:105,186` | Widget alertas apunta a `/saved-searches` (existe `/alertas`); estado error sin reintento. |
| **ASR-07** | title-case | `MisLeadsPage.js:35` · `AsesorRanking.js:17` · `StudioDashboard.js:136,472` | Eyebrows ALL-CAPS inconsistentes + "BATCH" anglicismo → estilo único, "BATCH"→"lote". |
| **ASR-08** | jerga | `i18n agents.json` · `AsesorAgentsPage.js:167` | "Último run/never run" → "Última ejecución"; fallback de rol no debe ser la clave inglesa (prospector…). |
| **ASR-09** | estándar | `asesor/AsesorContactos.js:1142` | Toggle "Ver con datos de ejemplo" siempre visible en CRM productivo → gatear por flag/superadmin. |
| **TX-08** | jerga | `public/ConnectMcpPage.js:48` · `MCPTutorial.js:91` | "multi-tenant / agentic loop / 18 herramientas agentic" → copy humano; reservar tecnicismos para docs. |
| **TX-10** | estándar | transversal `utils/titleCase.js` (tc) | Util de title-case existe pero adopción parcial (~35 archivos) → aplicar por módulo al tocarlo ("limpiar al avanzar"). |

---

## MEJORAS VS LÍDER (por área)

### Marketplace / Comprador — vs **Zillow / Airbnb**
1. **Skeletons de carga en todas las superficies públicas** — reemplazar los `…` de `Marketplace.js:706` y `PropertyDetail.js:65` por skeleton cards con shimmer. Cambio de mayor impacto percibido ("app rota" → "app premium") con poco esfuerzo.
2. **Mapa-en-resultados sincronizado (Zillow)** — hoy el mapa vive en `/mapa` aparte; cablear split-view real (lista izquierda + Mapbox derecha que filtra por viewport) eleva la búsqueda al estándar Zillow.
3. **Error con reintento, nunca confundido con vacío** — separar `fetchError` de empty en marketplace/ficha (CMP-04). El líder siempre da una salida; aquí un fallo de API se disfraza de "0 resultados".
4. **Barra de comparación sticky inferior (Zillow compare bar)** — el FAB inferior-izquierdo es poco descubrible; una barra "Comparando 2 de 3 · Comparar" con miniaturas es más descubrible.
5. **Galería estilo Airbnb** — estandarizar a grid (1 grande + 4 chicas) + lightbox con contador "X / N fotos"; eliminar todo placeholder SVG sintético del flujo comprador.

### Portal Asesor (CRM) — vs **HubSpot / Pipedrive**
1. **Higiene de lenguaje a nivel sistema** — HubSpot jamás muestra "4.29 / WAVE 1 / stub / system prompt / handoff / run". Un único pase de limpieza (ASR-01/02/03/07/08) convierte la app de "herramienta interna" a "producto". **Mayor relación impacto/esfuerzo del portal.**
2. **Ficha360 de modal → "record page" (HubSpot)** — promover a ruta `/asesor/lead/:id` con layout 3 columnas (datos/score · timeline · propiedades/tareas/deals); ya tiene todos los datos, habilita deep-link/compartir.
3. **Acciones rápidas inline en cada card del pipeline (Pipedrive)** — botones hover WhatsApp/Tarea/Agendar sobre la tarjeta del kanban; reduce clics en el flujo más repetido del día.
4. **Pipeline ponderado + forecast** — multiplicar el `$` por etapa × `close_probability` (ya existe por lead) para el feature estrella de HubSpot/Pipedrive. El dato ya está, falta el cálculo en la cabecera.
5. **Bulk actions en V2** — reponer selección múltiple + acciones masivas (mover etapa, asignar, plantilla WhatsApp) que la legacy tenía y la V2 perdió.

### Portal Desarrollador / Inmobiliaria — vs **Stripe / Linear**
1. **Barrido único de eyebrows y microcopy** — eliminar los ~10 prefijos de batch (D9/4.14/4.19/4.22/4.24/4.30/W4.1A) y traducir titulares en inglés ("Pricing Experiments", "Site Selection AI", "Cash Flow Forecast IA"). ~1 día → de "beta interna" a "producto terminado".
2. **Selector de proyecto consistente (Stripe/Linear nunca piden teclear un id)** — reemplazar input de slug + demo hardcodeado por `<select>` con proyectos reales (patrón ya en `DesarrolladorMercado`); convierte Funnel/PricingLab de "carga vacía" a usable.
3. **Command-palette global Cmd+K (Linear)** — graduar el Cmd+P de `ProyectoDetail` a un Cmd+K de portal (saltar a proyecto/tab/acción).
4. **Densidad "un número que importa" por tabla (Stripe)** — totales/resumen en el encabezado de cada tabla + formato monetario consistente (hoy conviven "Revenue MTD" e "Ingresos MTD").
5. **Trío loading/empty-con-CTA/error-con-reintento en CADA fetch (Linear-grade)** — `InmobiliariaDashboard` y otras caen a `—` silencioso; garantizar el trío para que nada quede ambiguo entre "sin datos" y "API falló".
6. **Retirar ramas legacy detrás de flags** — Linear/Stripe no exponen "Phase 8" ni `?v1`; o la función está o no aparece.
