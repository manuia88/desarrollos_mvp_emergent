# El Prompt del Comprador / Marketplace

> **Catálogo exhaustivo de todo lo que construimos en el portal COMPRADOR / MARKETPLACE.**
> Sirve como referencia única y como blueprint de reconstrucción: qué hace cada pieza, dónde vive en el front, dónde en el back, y en qué estado real está (vivo / parcial / stub / huérfano).

El portal del comprador es **un sistema de dos caras que aprende**. Por fuera es un marketplace de desarrollos inmobiliarios de CDMX donde la gente busca en lenguaje natural, filtra hasta el nivel de un departamento concreto, explora la ficha de un proyecto como una experiencia, calcula si le alcanza y si es buena inversión, y guarda lo que le gusta. Por dentro, **cada conducta del visitante** (ver, quedarse en una foto, dar like, descartar con motivo, comparar, ceder un criterio) se guarda atada a un `visitor_id` anónimo y alimenta un modelo de gusto granular, un cubo de demanda de mercado y un puente que convierte al visitante en lead del asesor en el momento de alto intento. El moat no es el catálogo: es el **Modelo del Mundo de la Demanda** que se construye con cada interacción. Todo reusa motores; casi nada se inventa por feature.

El portal se organiza en **4 áreas**:

1. **Búsqueda y Descubrimiento** — encontrar el desarrollo (listado, búsqueda IA, filtros granulares, mapa, zona, comparadores, "casi cumple", casamentera).
2. **Ficha / Experiencia** — la página de un desarrollo (lente vivir/invertir, selector de unidad, "¿me alcanza?", "¿buena compra?", calculadoras de inversión, recorrido cinemático).
3. **Gusto / Copiloto** — el cerebro de afinidad (swipe 👍/👎 con motivo del NO, perfil de gusto, "¿dónde vivirías feliz?", favoritos, asistente Atlax, cross-device).
4. **Público + Señales** — landings/SEO, onboarding/auth, el espinazo `buyer_signals`→cubo, y el puente comprador→asesor.

---

## Área 1 · Búsqueda y Descubrimiento

Cómo el comprador encuentra el desarrollo. El grid corre sobre el seed `data_developments.DEVELOPMENTS` (18 desarrollos, 56 unidades) más los wizard publicados — **no** sobre la colección Mongo `developments` (que tiene 1 doc). El filtrado por unidad es real: valida contra las listas de precios reales por unidad.

| Feature | Qué hace | Front | Back | Estado |
|---|---|---|---|---|
| **Listado /marketplace (grid)** | Tarjetas de desarrollos con scroll infinito y orden (recientes/precio/m²/para-ti). | `pages/Marketplace.js` · `components/marketplace/DevelopmentCard.js` · `api/marketplace.js` fetchDevelopments | `GET /api/developments` (`public.py:1602` list_developments) · seed + wizard · `_enrich_listing` (`public.py:186`) | vivo |
| **Filtros granulares** | Filtra por criterios del edificio Y del depto: zona, precio, m², recámaras/baños/cajones, tipo, etapa, plazo, amenidades, features de unidad, orientación, piso, enganche/mensualidad/apartado. | `components/marketplace/TopFilters.js` (barra sticky) en `Marketplace.js:488` y `components/zona/ZonaPropiedades.js` | `GET /api/developments` params (`public.py:1602-1729`) · financieros vía `payment_schemes.compute_breakdown` | vivo |
| **Búsqueda en lenguaje natural (search-ai)** | Escribes "depa 2 rec en Roma máx 8M, 80 m²" → lo convierte en filtros; la zona es filtro duro. | `TopFilters.js` form ai-search → `api/marketplace.js` aiSearchParse → `Marketplace.js` onAIQuery | `POST /api/properties/search-ai` (`public.py:2468`) · Claude Sonnet + fallback regex + caché 24h + rate-limit | vivo |
| **Honestidad de zona + cross-zona + brecha** | Si la zona no tiene inventario te lo dice; si tu presupuesto no alcanza, sugiere otras zonas y muestra la brecha en $/mes. | `Marketplace.js:502-553` (aiNotice/aiCrossZone/aiBrecha) | `search-ai` devuelve zona_no_disponible/cross_zone/brecha_zona/mensualidad_supuesto | vivo |
| **Búsqueda guiada (4 campos obligatorios)** | Si faltan zona·presupuesto·recámaras·m², muestra preguntas tocables que abren el filtro correcto; deja "ver todos". | `Marketplace.js:260-704` (requiredFields, canSearch, browseAll) | reusa `GET /api/developments` | vivo |
| **"Los que más se asemejan" (casi cumple)** | Cuando nada cumple TODO, rankea por criterios cumplidos y dice qué le falta a cada uno; se queda en la zona pedida. | `api/marketplace.js` fetchCasiCumple → `Marketplace.js:319-338` | `GET /api/developments/casi` (`public.py:1857`) · captura demanda insatisfecha con visitor_id | vivo |
| **Conteo predictivo de elasticidad** | Por cada extra calcula cuántas opciones exactas habría si lo quitas, y captura qué cede el comprador. | `Marketplace.js:325-334` relajCounts + relajarCriterio | re-query `GET /api/developments` + `POST /api/buyer/elasticidad` (`buyer_signals.py:177`) | vivo |
| **Similares de un desarrollo** | En la ficha, lista desarrollos parecidos al que ves. | `api/marketplace.js` fetchSimilarDevelopments (en DevelopmentDetail) | `GET /api/developments/{id}/similar` (`public.py:2112`) | vivo |
| **Mapa /mapa** | Mapbox de CDMX: polígonos de colonia por IE Score, capa de calor, marcadores de desarrollos y predios catastrales. | `pages/Mapa.js` (REACT_APP_MAPBOX_TOKEN) | `/api/colonias-geojson` · `/api/developments?limit=200` · `/api/colonias-similar/{id}` · `/api/catastro/*` · `/api/colonia-watch` | vivo |
| **ZonePageV2 /zona/:slug** | Página completa de una colonia: cómo se vive, precios, plusvalía, riesgo, ciclo, reviews, tab de propiedades. | `pages/public/ZonePageV2.js` (`App.js:1017`) · `/marketplace?colonia=X` redirige aquí | endpoints de zona en `public.py` (catastro/market_estimate/zone_cycle/natural_risk/market_rates) + zone_score | vivo |
| **Tab Propiedades de la zona** | Dentro de la zona, lista los desarrollos de esa colonia reusando grid + filtros del marketplace. | `components/zona/ZonaPropiedades.js` (en `ZonePageV2.js:1184`) | `GET /api/developments?colonia=slug` | vivo |
| **Comparador de colonias público /comparar** | Compara colonias lado a lado; versión premium para logueados; exporta PDF y comparte. | `pages/public/ColoniaComparator.js` + landing `components/landing/ColoniaComparator.js` | `POST /api/public/compare` + /pdf (`marketplace_lead_tools.py:243`) · `POST /api/comprador/compare` premium (`comprador_compare.py:46`) | vivo |
| **Comparador del portal /portal/comparador** | Compara desarrollos/propiedades en tabla, con buscador para armar canasta. | `pages/portal/tools/ComparatorPage.js` · `components/comparator/*` · `api/compare.js` | `POST /api/compare` (`compare.py:53` comparator_engine) · `GET /api/marketplace/developments` (`marketplace_search.py:144`) | vivo |
| **Comparador del comprador /comprador/comparar** | Compara los favoritos del comprador con versión premium (matriz + PDF). | `pages/comprador/CompradorComparador.js` | `POST /api/comprador/compare` + /pdf (`comprador_compare.py`) | vivo |
| **FAB canasta de comparación** | Botón flotante que abre el comparador con los desarrollos agregados desde las tarjetas. | `TopFilters.js:30` (comparator-basket-fab) | reusa endpoints de compare | vivo |
| **Búsqueda por URL de competidor** | Pegas el link de otra propiedad y extrae sus características para buscar parecidas aquí. | `components/marketplace/UrlSearchModal.js` → parseExternalUrl | `POST /api/public/search/by-url` (`external_search.py:148`) | vivo |
| **Quiz de colonia** | "¿No sabes qué zona?": test que recomienda colonias y captura lead. | `components/marketplace/ColoniaQuizModal.js` → submitQuiz | `POST /api/public/quiz/submit` (`marketplace_lead_tools.py:176`) | vivo |
| **"¿Dónde vivirías feliz?" (donde-vivir)** | Rankea colonias por calidad de vida + tu presupuesto + afinidad con lo que te gusta. | `components/comprador/DondeVivirCard.js` (en CompradorDashboard) | `GET /api/buyer/donde-vivir` (`buyer_signals.py:473`) · db.colonias scores_reales + visitor_taste | vivo |
| **Mapa de calor de demanda (demanda-mapa)** | Mapa de dónde busca la gente, resaltando las zonas que a ti te laten. | `components/comprador/DemandaMapaComprador.js` | `GET /api/buyer/demanda-mapa` (`buyer_signals.py:544`) · marketplace_searches + geometría colonias | vivo |
| **Reverse Search standalone /portal/buscar** | Buscador conversacional separado: lenguaje natural → filtros parseados + resultados con copy por audiencia. | `pages/portal/tools/ReverseSearchPage.js` · `components/reverseSearch/*` | `POST /api/reverse-search` (`reverse_search.py:81` reverse_search_engine, Claude Sonnet) | vivo |
| **Calculadora de hipoteca pública** | Calcula mensualidad/enganche y guarda el cálculo dejando email. | `components/marketplace/MortgageCalculator.js` (en fichas) | `POST /api/public/mortgage/calculate` + /save (`marketplace_calculator.py:87`) | vivo |
| **"Por tu gusto" / parecidos (Netflix-style)** | Recomienda desarrollos parecidos a los que likeaste y arma el perfil que alimenta Atlax. | `Marketplace.js:82-628` → `/api/buyer/parecidos` | `GET /api/buyer/parecidos` (`buyer_signals.py:957`) + taste_scores | vivo |
| **Orden "Para ti" (taste) del grid** | Reordena resultados por afinidad a lo likeado. | `Marketplace.js:143` sort='taste' + visitor_id | `GET /api/developments?sort=taste` (`public.py:1834`) | vivo |
| **Panel de inteligencia de zona (OportunidadPanel)** | Sidebar cuando hay colonia activa: oportunidad/inversión de esa zona. | `components/marketplace/OportunidadPanel.js` | `GET /api/zona/{id}/inversion` (investment_simulator/zone_cycle/absorcion) | vivo |
| **Sincronización de filtros con la URL** | Refleja filtros en la URL para compartir/volver a la búsqueda. | `utils/marketplaceUrlState.js` en `Marketplace.js:96-234` | n/a (estado front) | vivo |
| **Meta tags dinámicos (SEO)** | Genera title/description según filtros activos. | `components/seo/MarketplaceMetaTags.js` | n/a (render cliente) | vivo |
| **Casi-screener del comprador** | El equivalente del "screener" (que vive en superadmin) es grid + filtros granulares + "casi cumple". No hay screener dedicado en el comprador. | — | — | nota |
| **Colonias /colonias (ColoniasV2)** | Galería de colonias premium (vibe/precio/momentum) que enlaza a /marketplace?colonia. | `pages/public/ColoniasV2.js` · `data/colonias.js` (16, hardcode) | ninguno (data del bundle front) | **parcial** |
| **Búsqueda por foto (by-image)** | Subes una foto y busca desarrollos visualmente parecidos. | `components/marketplace/ImageSearchModal.js` → searchByImage | `POST /api/public/search/by-image` (`marketplace_search.py:54`) Claude Vision + cosine | **parcial** (db.image_embeddings=0 → matches siempre vacíos) |
| **Guardar búsqueda + alertas por email** | Guardas tu búsqueda con tu correo y te avisan al aparecer inventario que encaja. | `components/marketplace/SaveSearchModal.js` → saveSearch | `POST /api/public/saved-search` + confirm/unsubscribe (`external_search.py:194`) | **parcial** (db.saved_searches=0, sin uso/seed) |
| **Casamentera — alertas en el marketplace** | Al volver te muestra arriba lo que el sistema encontró que encaja con tu búsqueda guardada. | `Marketplace.js:91-595` → `/api/buyer/alertas` | `GET /api/buyer/alertas` (`casamentera.py:130`) lee db.buyer_alerts | **parcial** (depende de job que llene buyer_alerts) |
| **Prueba social por cierres (ParecidosCerraron)** | Banner: "gente con búsqueda parecida cerró aquí"; invisible si no hay cierres. | `components/marketplace/ParecidosCerraron.js` (`Marketplace.js:446`) | `GET /api/buyer/parecidos-cerraron` (copiloto_flywheel) | **parcial** (sin cierres no renderiza) |
| **Filtro por sub-scores de zona** | Solo desarrollos cuyo sub-score (seguridad/lifestyle/transporte/etc.) supere un umbral. | `Marketplace.js:104-234` (subscoreMin, solo deep-link URL) | `GET /api/developments?subscore_min` (`public.py:1780`) | **parcial** (backend vivo; UI solo por URL · SubscoreFilterPanel.js huérfano) |
| **Listado/ficha LEGACY (/propiedades, /propiedad/:id)** | Modelo viejo de propiedades sueltas (Phase 3); /propiedades redirige al marketplace; ficha vieja sigue ruteada. | `/propiedades`→Navigate `/marketplace` · `pages/PropertyDetail.js` · `components/marketplace/PropertyCard.js` | `GET /api/properties[/{id}/similares]` (modelo legacy) | **parcial** |
| **Filtro por crecimiento pronosticado 12m** | Filtra a zonas con pronóstico de plusvalía 12m > X%. | `Marketplace.js:117-234` (forecastDeltaMin, sin UI) | `GET /api/developments?forecast_delta_min` (`public.py:1809`) lee db.zone_forecasts | **stub** (zone_forecasts=0 → nunca deja pasar nada; sin UI) |
| **Endpoints de heatmap del marketplace** | API de capas de calor por niveles de zoom para un mapa de inteligencia. | `api/marketplace.js` fetchHeatmapLayer/fetchMapLevels/fetchColoniaFull — SIN consumidor | `GET /api/public/map/levels` · /heatmap · /colonia/{id} (`marketplace_map.py:220`) | **huérfano** (Mapa.js usa colonias-geojson, no estos) |
| **Componentes de overlay de mapa** | LayerToggle, MapFilters, DemandGapToggle, BattleCardOverlay, MatchCatastroPreventa, SaveZoneModal, AtlaxContextualButton. | `components/maps/*.js` | maps.py / maps_cross.py (sin pantalla que los monte) | **huérfano** (0 callsites; ninguna page los importa) |
| **Historia de precios de colonia** | Pestaña con evolución histórica de precios de una colonia. | `components/marketplace/ColoniaHistoryTab.js` → fetchColoniaHistory | `GET /api/public/colonia/{id}/history` | **huérfano** (0 callsites) |
| **Reporte de colonia por email** | Modal que pide un PDF de la colonia a cambio del correo (lead capture). | `components/marketplace/ColoniaReportModal.js` → requestColoniaReport | `POST /api/public/colonia/{id}/report-request` (`marketplace_lead_tools.py:100`) | **huérfano** (endpoint vivo, ninguna página monta el modal) |

> **Notas de cableado clave:** Hay **TRES comparadores** distintos a TRES endpoints (`/api/compare` portal, `/api/public/compare` colonias público, `/api/comprador/compare` premium) — sirven páginas distintas, conviene revisar solapamiento `/api/public/compare` vs `/api/compare`. Hay **DOS buscadores en lenguaje natural**: el inline del marketplace (`search-ai`, el principal, con fallback determinista) y el standalone `/portal/buscar` (`reverse-search`). El loop de demanda está VIVO: marketplace_searches=283 y buyer_signals=303 en DB.

---

## Área 2 · Ficha / Experiencia de propiedad

La página de un desarrollo. **Arquitectura de ruteo:** `/desarrollo/:id` por DEFAULT = `FichaDesarrollo` (el rebuild limpio). `?v3=1` = `FichaCockpit` (prototipo). `?v1=1` = `DevelopmentDetail` (la vieja). La ficha-experiencia cinemática vive en ruta SEPARADA `/experiencia/:id`. `PropertyDetail` (`/propiedad/:id`) es otra ficha (reventa, una sola propiedad). **Regla del founder:** el cliente SIEMPRE cotiza sobre precio de LISTA; los descuentos del dev NO se muestran (`SeccionDinero.js:80-87`).

| Feature | Qué hace | Front | Back | Estado |
|---|---|---|---|---|
| **Router de ficha (/desarrollo/:id)** | Decide qué ficha mostrar: nueva default, ?v3 cockpit, ?v1 vieja. | `App.js` DevelopmentDetailRoute (`:1173-1180`) | n/a (routing) | vivo |
| **FichaDesarrollo (default)** | La página armada paso a paso: lente → unidad → panorama → confianza, con cockpit lateral "Tu decisión". | `pages/FichaDesarrollo.js` | fetchDevelopment + buy-signal + zona/lugares + ownership + inversion-v4 | vivo |
| **Hero + galería + precio editorial** | Encabezado (nombre, colonia, sellos, dirección), galería, precio "desde". | `FichaDesarrollo.js:186-212` · `components/dev/PhotoGallery.js` | fetchDevelopment | vivo |
| **Nav anclas sticky + cockpit "Tu decisión"** | Barra de secciones pegajosa + panel que se llena con lo que eliges + botones Agendar/Atlax/Guardar. | `FichaDesarrollo.js:214-222, 382-418` | n/a (estado local + ganchos vivos) | vivo |
| **Paso 1 · El Lente** | Eliges para qué quieres la propiedad (vivir/invertir, para-ti/institucional) y la ficha se reorganiza. | `FichaDesarrollo.js:270-327` · `components/ficha/SeccionLente.js` | buyer_signals (señal 'lens') | vivo |
| **Paso 2 · Selector de unidades** | Lista de precios real por unidad (tipo, m² desglosado, nivel, disponible/reservado/vendido) con escasez honesta; multi-selección en modo fondo. | `components/ficha/SeccionUnidades.js` | dev.units (fetchDevelopment) · señales unit_view/unit_save | vivo |
| **Paso 3 · Tu Panorama ("¿te queda?")** | 5 preguntas (quién habita, ingreso, ahorro, renta, crédito) → si te alcanza, tu enganche y mensualidad para ESA unidad. | `components/ficha/SeccionPanorama.js` | cálculo local (30% ingreso, préstamo 20a) + plusvalía de dev.config | vivo |
| **Módulo "Tu Dinero" unificado** | Un solo módulo (enganche+plazo) que alimenta 4 vistas: rento-o-compro, crédito multi-banco, plan del dev, como-inversión. | `components/ficha/SeccionDinero.js` | `GET /api/public/ownership/{id}` (`buy_signal.py:241`) · `POST /api/public/mortgage/calculate` | vivo |
| **¿Rento o compro? + TCO** | Compara rentar vs comprar a 10-20 años, break-even, patrimonio, costo total de ser dueño. | `SeccionDinero.js:147-173` | ownership_economics_engine vía `/api/public/ownership/{id}` | vivo |
| **Crédito multi-banco + "¿califico?"** | Tabla de 5 bancos (mensualidad/tasa/CAT) y, con tu ingreso, si calificas (DTI máx 35%). | `SeccionDinero.js:175-205` | `POST /api/public/mortgage/calculate` (`marketplace_calculator.py:87`) | vivo |
| **Plan del desarrollador (preventa)** | Sobre el precio de lista: apartado, firma%, mensualidades% repartidas en meses de preventa, escritura%. | `SeccionDinero.js:207-230` · `components/ficha/PlanDePago.js` | dev.config.formas_pago · `GET /api/public/payment-schemes/{id}` (`public.py:1284`) | vivo |
| **PlanDePago (esquemas del dev)** | Muestra los esquemas que el dev definió en su portal + desglose de crédito para escrituración; hide-if-empty. | `components/ficha/PlanDePago.js` | `GET /api/public/payment-schemes/{project_id}` ← dev_payment_schemes + payment_schemes engine | vivo |
| **Calculadora de inversión completa (V4)** | Grado institucional: TIR apalancada/desapalancada, cap rate, equity multiple, flujo, payback, escenarios, Monte Carlo, sensibilidad, pro-forma, ISR, año óptimo de salida, renta larga vs Airbnb. | `components/investment/InversionV4Calculator.js` (1047 líneas) vía `components/ficha/SeccionCalcInversion.js` | `POST /api/inversion-v4/analyze` (`public.py:640`) ← inversion_v4_finance/tax/veredicto + market_rates | vivo |
| **SeccionCalcInversion (puente ficha→calc)** | Trae la calculadora a la ficha con la unidad ya elegida; veredicto concreto ("le gana a CETES"), números clave; modo individual o fondo. | `components/ficha/SeccionCalcInversion.js` | `GET /api/zona/{col}/inversion` (`public.py:335`) + InversionV4Calculator | vivo |
| **ComparadorInversion (2 unidades)** | Compara la inversión de dos unidades del mismo dev con los mismos supuestos y resalta la mejor por métrica. | `components/ficha/ComparadorInversion.js` | `POST /api/inversion-v4/analyze` | vivo |
| **AirROI — renta corta real por zona** | Tarifa por noche y ocupación reales de Airbnb por colonia para renta larga vs corto plazo (cobra por llamada, cacheado). | `InversionV4Calculator.js:75-86` | `POST /api/inversion-v4/airroi` · cache db.airroi_cache | vivo |
| **¿Es buena compra? (buy-signal / veredicto)** | Cruza precio-en-contexto-de-obra-nueva × momento de mercado → veredicto honesto (buena entrada / en rango / premium). | gancho vivo `FichaDesarrollo.js:112,153` · SeccionLente | `GET /api/public/buy-signal/{dev_id}` (`buy_signal.py:121`) ← _combined + price_context + timing | vivo |
| **¿Cuánto al mes? (gancho de mensualidad)** | Antes de abrir nada, muestra la mensualidad estimada de la unidad elegida y la TIR vs CETES en el cockpit. | `FichaDesarrollo.js:120-121,175` | `GET /api/public/ownership/{id}` + `POST /api/inversion-v4/analyze` | vivo |
| **SeccionUbicacion + LugaresMap** | Mapa interactivo de la zona con lugares por categoría, metro caminando y "la zona en números". | `components/ficha/SeccionUbicacion.js` · `LugaresMap.js` (maplibre lazy) | `GET /api/zona/{col}/lugares` (Google) + `/vida` (OSM) | vivo |
| **SeccionConfianza (risk reversal)** | Desarrollador/track record, sellos legales y de obra (solo si configurados), riesgos honestos (sísmico/inundación/PML/preventa). | `components/ficha/SeccionConfianza.js` | `GET /api/inversion-v4/zona-contexto?colonia` (`public.py:825`) + sellos | vivo |
| **SeccionLente (lectura a la medida)** | Texto a la medida del lente elegido con hechos reales del dev/config, cero inventado. | `components/ficha/SeccionLente.js` | dev.config (sin endpoint propio) | vivo |
| **LeadCaptureModal (cierre del ciclo)** | En alto intento (agendar / PDF / "que un asesor me arme el plan") captura nombre+contacto y crea el lead con todo el contexto del visitor_id → asesor. | `components/ficha/LeadCaptureModal.js` | `POST /api/buyer/registrar` (`buyer_signals.py:860`) → create_buyer_lead → asesor_contactos | vivo |
| **Guardar unidad (átomo) + favoritos** | Botón para guardar la unidad; emite unit_save/unit_unsave que alimenta embudo del dev, demanda superadmin y /favoritos. | `FichaDesarrollo.js:162-169` | sendBuyerSignal unit_save · `GET /api/buyer/favoritos` | vivo |
| **Sensor de señales (la ficha aprende)** | Cada elección/módulo/dwell emite señal (lens, unit_view, module_open, roi_explore, lead) → lead score, demanda, modelo de gusto. | `FichaDesarrollo.js:159-173` · lib/buyerSignal | `buyer_signals.py` · behavioral_tracking_engine · grafo_comprador_engine | vivo |
| **DevStructuredData (SEO/GEO)** | Inserta schema RealEstateListing + FAQPage para buscadores/IA. | `components/seo/DevStructuredData.js` | n/a (deriva del dev) | vivo |
| **PropertyDetail (reventa /propiedad/:id)** | Ficha de una sola propiedad: datos, hipoteca, forecast, probabilidad, briefing, similares. | `pages/PropertyDetail.js` | fetchProperty/Colonia/Similar · MortgageCalculator · ForecastChart · ProbabilityCard | vivo |
| **FichaCockpit V3 (?v3=1)** | Prototipo shell tipo app: header compacto + tabs + sidebar fijo; reusa TODAS las secciones sin motor nuevo. | `pages/FichaCockpit.js` (59KB) | mismos endpoints + fetchDevelopments (comparador 3u/5 proyectos) | **parcial** (solo con ?v3=1; prototipo) |
| **DevelopmentDetail (vieja ?v1=1)** | Ficha original de tabs (lista de precios, unidades por tipo, avance de obra, ubicación) con calculadoras legacy. | `pages/DevelopmentDetail.js` (49KB) | fetchDevelopment/Assets/Similar + behavioral + pricing experiment + briefing IE | **parcial** (solo con ?v1=1; legacy) |
| **Walkthrough scroll-scrub (video por scroll)** | El scroll mueve video.currentTime cuadro por cuadro; sin video, fallback foto-secuencia. | `AtlaxExperiencia.js:118-243` | dev.video_url / parallax_url · demo en /demo/walkthrough-*.mp4 | **parcial** (depende de assets que el dev no sube; corre con DEMO_VIDEOS) |
| **Router de experiencia (mejor asset)** | Detecta qué tiene la unidad (video > parallax > fotos > ficha) y elige el mejor recorrido. | `AtlaxExperiencia.js:30-39` | n/a (lee campos del dev) | **parcial** (3DGS/360 marcado futuro) |
| **Recorrido fotos por gusto (parallax por persona)** | Reordena las fotos por el cuarto/feature que le importa al comprador, con caption a su medida. | `AtlaxExperiencia.js:55-79` | `GET /api/buyer/experiencia-fotos/{id}` (`buyer_signals.py:317`) | **parcial** (fail-open: sin gusto, orden original) |
| **Parallax 3D generado local en tu orden** | Genera recorrido parallax 3D (MiDaS + cv2 + ffmpeg) en el orden de tu gusto, cacheado; si no está listo usa default. | `AtlaxExperiencia.js:59-75` | `GET /api/buyer/experiencia-parallax/{id}` (`buyer_signals.py:387`) + parallax_engine | **parcial** (requiere modelo MiDaS 66MB + cv2/ffmpeg; genera en background) |
| **Hero image-reveal (cursor)** | El cursor revela una 2ª foto bajo la 1ª con máscara radial. | `AtlaxExperiencia.js:88-116` | dev.photos | vivo (dentro de ruta huérfana) |
| **AtlaxExperiencia (/experiencia/:id)** | La propiedad como experiencia cinemática: hero reveal + walkthrough scroll-scrub + cierre con CTA. | `pages/public/AtlaxExperiencia.js` | fetchDevelopment + experiencia-fotos/parallax + buyer_signals (photo_dwell) | **huérfano** (ruta existe, 0 callsites; solo se alcanza tecleando la URL) |
| **SeccionValor (componente de veredicto)** | Tarjeta de veredicto + precio/m², valor de zona, plusvalía y demanda. | `components/ficha/SeccionValor.js` | fetchBuySignal + `/api/public/pulso-zona` | **huérfano** (importado en FichaDesarrollo.js:15 pero SIN JSX; el veredicto se surface vía gancho vivo) |

> **Deudas:** (1) `AtlaxExperiencia` es huérfano de navegación — sus features cinemáticas existen pero el walkthrough/parallax dependen de assets que los devs no suben (corre con DEMO_VIDEOS para tamaulipas-89). (2) `SeccionValor` es import muerto. **Verificación live (:8000):** inversion-v4/analyze devuelve TIR=10.22%, cap=5.02%, equity_multiple=2.13, 9 instrumentos, veredicto SÓLIDA; mortgage/calculate devuelve 5 bancos con DTI/CAT reales (BBVA pago=39935, dti=0.499).

---

## Área 3 · Gusto / Copiloto del comprador

El cerebro de afinidad. El espinazo real es `buyer_signals` (303 docs vivos). El swipe 👍/👎 + motivo del NO **no vive en /comprador** sino en el flujo público Atlax (`AtlaxQuickView` abierto desde `/atlax` y AtlaxResults); `lib/atlaxPrefs.js` es el corazón (REJECT_REASONS, dismiss, toggleSave, photo dwell/zoom). Conviven **dos universos de favoritos**: el público/anónimo (`favoritos.py` + buyer_signals like/save, ruta /favoritos) y el del comprador logueado (`comprador.py` /api/comprador/favorites).

| Feature | Qué hace | Front | Back | Estado |
|---|---|---|---|---|
| **Espinazo de señales (buyer_signals · 8 capas)** | Guarda cada conducta anónima atada a un visitor_id; base de todo el gusto. | `lib/buyerSignal.js` + emisores en DevelopmentCard, FichaCockpit/Desarrollo, AtlaxExperiencia, ZonePageV2, AtlaxSurface, AtlaxResults | `POST /api/buyer/signal` (`buyer_signals.py:104`) → db.buyer_signals + invalida visitor_taste | vivo |
| **Swipe 👍/👎 + MOTIVO del NO** | "Me gusta"/"no me gusta"; si dice que no, elige motivo (fotos/precio/zona/tamaño/amenidades/entrega). | `components/landing/AtlaxQuickView.js` + `lib/atlaxPrefs.js` (REJECT_REASONS) | `POST /api/buyer/signal` type='dismiss' con value=motivo + meta · type='save' | vivo |
| **No-repetir + descartados locales** | Lo que descartaste/guardaste se recuerda en el navegador para no mostrártelo otra vez, sin servidor. | `lib/atlaxPrefs.js` (localStorage, isDismissed/getSavedIds) | n/a (local; el back además filtra zonas evitadas) | vivo |
| **Engagement por FOTO (dwell + zoom)** | Mide cuánto te quedas viendo cada foto y si haces zoom, para inferir si la imagen vende o mata. | `lib/atlaxPrefs.js` logPhotoDwell/logPhotoZoom · AtlaxExperiencia/QuickView | `POST /api/buyer/signal` photo_dwell/photo_zoom · photo_tagger | vivo |
| **Mi Gusto (Atlax ya te conoce)** | Le muestra al comprador el perfil de gusto inferido (cuartos, features, zonas, precio, qué evita). | `components/landing/AtlaxMyList.js` → /api/buyer/mi-gusto | `GET /api/buyer/mi-gusto` (`buyer_signals.py:280`) ← visitor_taste.build_visitor_taste | vivo |
| **Perfil de gusto HIPERGRANULAR (visitor_taste)** | Motor que arma el gusto fino (zona, amenidades, precio-techo, features de foto, perfil negativo) y aprende de cierres. | indirecto (mi-gusto, donde-vivir, experiencia-fotos, sort=taste, casi) | `visitor_taste.py` (build/score_devs) · cache db.visitor_taste_cache | vivo |
| **"Para ti" (reordenar por gusto)** | Pone primero lo que se parece a lo likeado. | `Marketplace.js:143` | `GET /api/developments?sort=taste` (`public.py:1834`) + visitor_taste.score_devs en /casi | vivo |
| **Parecidos (porque te gustó X)** | De lo likeado infiere gusto y recomienda parecidos por amenidades/precio/recámaras. | `Marketplace.js:63-89` → /api/buyer/parecidos | `GET /api/buyer/parecidos` (`buyer_signals.py:957`) | vivo |
| **¿Dónde vivirías feliz? (lente espacial · lista)** | Rankea colonias por calidad de vida + presupuesto + afinidad (excluye las que evitas). | `components/comprador/DondeVivirCard.js` → CompradorDashboard:269 | `GET /api/buyer/donde-vivir` (`buyer_signals.py:473`) · db.colonias scores_reales=2788 | vivo |
| **Mapa de calor de la demanda (lente espacial · mapa)** | Muestra dónde busca la gente y resalta las zonas que a ti te laten. | `components/comprador/DemandaMapaComprador.js` → CompradorDashboard:270 | `GET /api/buyer/demanda-mapa` (`buyer_signals.py:544`) · marketplace_searches=283 | vivo |
| **Favoritos / Mi Lista (cara pública del swipe del asesor)** | Junta lo guardado, con opción de cita o nota; se espeja al tablero del asesor al registrarte. | `components/landing/AtlaxMyList.js` + `pages/comprador/CompradorFavoritos.js` + `pages/Favoritos.js` | `routes/favoritos.py` GET/POST /quitar/cita/nota (espeja a asesor_lead_properties) | vivo |
| **Favoritos del comprador LOGUEADO** | Versión con cuenta, ligada al usuario en vez del visitor anónimo. | `pages/comprador/CompradorFavoritos.js` | `routes/comprador.py` GET/POST/DELETE /api/comprador/favorites | vivo |
| **Registrar búsqueda + Avísame** | Guarda lo buscado como demanda anónima y, si pides aviso, queda como búsqueda que la casamentera vigila. | `pages/public/AtlaxSurface.js` + SaveSearchModal | `routes/perfil_recomendar.py` POST /api/perfil/recomendar + /registrar-busqueda → marketplace_searches | vivo |
| **Elasticidad (qué cediste sin match)** | Cuando relajas un criterio, registra QUÉ cediste (amenidad antes que zona, m² antes que precio). | `Marketplace.js` (emite) · superadmin/dev consumen | `POST /api/buyer/elasticidad` (`buyer_signals.py:177`) | vivo |
| **Asistente Atlax — burbuja de chat pública (RAG)** | Chat flotante en todo el marketplace que responde, busca desarrollos y captura el lead. | `components/landing/AtlaxBubble.js` (global `App.js:1442`) + HeroBar/ThreadsSidebar/VoiceButton | `POST /api/atlax/query` (atlax_engine) + `routes/asistente.py` (/sessions, /ask, /capture-lead) | vivo |
| **Atlax Surface — /atlax** | Página dedicada del asistente: conversa, perfila, muestra resultados + vista rápida con swipe + Mi Lista. | `pages/public/AtlaxSurface.js` + AtlaxResults/QuickView/MyList | /api/atlax/query, /api/buyer/signal, /api/perfil/recomendar, /api/buyer/mi-gusto | vivo |
| **Asistente público /asistente** | Chat de pantalla completa para encontrar casa, con captura de lead y voz. | `pages/public/AsistentePage.js` + `components/asistente/*` | `routes/asistente.py` /sessions/messages/ask/capture-lead | vivo |
| **Cross-device del gusto (claim / visitor_identity)** | Al iniciar sesión vincula tu actividad anónima a tu cuenta; tu gusto y lista te siguen entre dispositivos. | `lib/buyerSignal.js` claimVisitor() en AuthModal, AtlaxBubble, AtlaxSurface, CompradorDashboard | `POST /api/buyer/claim` (`buyer_signals.py:882`) → visitor_identity.link + mirror_favoritos | vivo |
| **Promote a lead por alto intento (login en gate)** | Al autenticarte en un botón de la ficha (agendar/cotizar) te conviertes en lead con tu perfil ya armado. | `pages/DevelopmentDetail.js` (POST /api/buyer/promote) | `POST /api/buyer/promote` (`buyer_signals.py:841`) → create_buyer_lead | vivo |
| **SmartMatch Widget** | Tarjeta que puntúa cuánto encajan tus desarrollos guardados con tu quiz de colonia. | `components/comprador/SmartMatchWidget.js` → CompradorDashboard:239 | `GET /api/comprador/smart-match` (`wrapped.py:236`) → services.smart_match | vivo |
| **Quiz de colonia (perfilador de zona)** | Cuestionario corto que perfila qué colonia te conviene y guarda respuestas para SmartMatch. | `components/marketplace/ColoniaQuizModal.js` + config/quizQuestions.js | endpoint quiz vía marketplace_search/public | vivo |
| **Ficha-experiencia: fotos reordenadas por gusto** | Abre por el espacio/atributo que te importa, con texto a tu medida. | consumido por AtlaxExperiencia | `GET /api/buyer/experiencia-fotos/{id}` + /experiencia-parallax (`buyer_signals.py:317,387`) | vivo |
| **Recomendados del dashboard (logueado)** | Lista de desarrollos sugeridos en el panel del comprador con cuenta. | `pages/comprador/CompradorDashboard.js:8` fetchRecommended | `GET /api/comprador/recommended` (`comprador.py:99`) | vivo |
| **Búsquedas guardadas + Historial + Alertas (logueado)** | Gestiona búsquedas guardadas, historial y alertas dentro de la cuenta. | CompradorSavedSearches/Historial/Alertas.js | `comprador.py` /saved-searches,/history + `buyer_alerts.py` /api/comprador/alerts | vivo |
| **Comparador del comprador** | Compara varios desarrollos lado a lado y exporta PDF. | `pages/comprador/CompradorComparador.js` | `comprador_compare.py` POST /api/comprador/compare + /pdf | vivo |
| **Wrapped del comprador (tipo Spotify)** | Resumen anual/mensual de tu actividad de búsqueda, compartible. | `pages/comprador/CompradorWrapped.js` | `routes/wrapped.py` /wrapped/share/annual-optin | vivo |
| **CompradorChat — chat con asesor humano** | Chat in-app entre comprador y su asesor humano (no IA). | `pages/comprador/CompradorChat.js` | `routes/chat.py` (hilos comprador↔asesor) | vivo |
| **Grafo del comprador (lente de demanda)** | Convierte señales en grafo de demanda consultable por dev/asesor/superadmin. | `pages/superadmin/SuperadminGrafoComprador.js` (espejo) | `routes/grafo_comprador.py` /api/{dev,asesor,superadmin}/grafo-comprador | vivo |
| **Casamentera / Avísame** | Cuando entra/baja de precio inventario que encaja con una búsqueda guardada, crea alerta para comprador y asesor. | `Marketplace.js` (lee) + SaveSearchModal + CompradorAlertas | `routes/casamentera.py` /correr (cron) + /alertas · scheduler APScheduler | **parcial** (motor+cron cableados, db.buyer_alerts=0) |
| **Flywheel del cierre (re-entrena el gusto)** | Al cerrar una operación captura el viaje (qué buscó vs qué compró) y mejora el ranking. | sin UI comprador (lo dispara el asesor al marcar GANADO) | `copiloto_flywheel.py` POST /api/copiloto/cierre → db.copiloto_closings + closing_lifts | **parcial** (db.copiloto_closings=2, poca data) |
| **Parecidos a los que CERRARON** | Muestra qué compraron personas con perfil parecido al tuyo. | `components/marketplace/ParecidosCerraron.js` → Marketplace:445 | `copiloto_flywheel.py` GET /api/buyer/parecidos-cerraron | **parcial** (solo 2 cierres → casi siempre vacío, null-safe) |
| **CompradorAsistente (/comprador/asistente) — agente Cerebro** | Panel donde el comprador aprueba/rechaza tareas que un agente hace por él. | `pages/comprador/CompradorAsistente.js` (api/cerebro) | `/api/cerebro/*` (status/tasks/goal/approve/reject) | **parcial** (depende de CEREBRO_ENABLED, default OFF) |
| **Atlax Persona (voz por tenant)** | Ajusta el tono/personalidad con que Atlax habla, por organización. | `components/superadmin/AtlaxPersonaPanel.js` | `routes/atlax_persona.py` GET/PATCH/preview → atlax_persona_engine | **parcial** (db.atlax_personas=0 → usa default) |
| **Cross-sell del comprador (ofertas de socios)** | Ofertas relacionadas (crédito, mudanza) dentro del flujo del comprador. | `components/comprador/CompradorCrossSellSection.js` + CrossSellOfferCard + PartnerOfferModal | `routes/cross_sell.py` → cross_sell_engine | **parcial** (depende de catálogo de ofertas) |
| **Buyer Coach conversacional (asesor virtual por etapas)** | Coach que te guía por etapas con checklist y recomendaciones de zona. | `components/buyer_coach/BuyerCoachConversation.js` + StageChecklist.js | `routes/buyer_coach.py` /start/message/checklist/advance/zone-recommendations → buyer_coach_engine | **huérfano** (backend vivo, db=2 convos, pero `<BuyerCoachConversation>` no se renderiza en ningún JSX) |

> **`copilot` (routes/copilot.py + services/copilot_engine.py, /api/copilot/ask) NO es del comprador** — lo consumen dev/asesor; incluido solo para descartarlo. Defensa anti-abuso real en señales/donde-vivir/registrar/casamentera (ratelimit + tokens cron fail-closed) tras pentest 2026-06-27.

---

## Área 4 · Público + Señales

Landings/SEO sin login, onboarding/auth, el espinazo de señales, y el puente comprador→asesor. **FUENTE ÚNICA confirmada:** `create_buyer_lead` (`buyer_signals.py:705`) es el único creador de lead de comprador — lo llaman external_search, lead_capture, lead_capture_marketplace_engine, `/api/buyer/registrar` y `/api/buyer/promote` (8 callsites). NO duplicar.

| Feature | Qué hace | Front | Back | Estado |
|---|---|---|---|---|
| **Espinazo de señales (buyer_signals)** | Guarda toda la conducta anónima atada al visitor_id de localStorage. | `lib/buyerSignal.js` en Marketplace, DevelopmentCard, FichaCockpit/Desarrollo, AtlaxResults/Bubble, PublicCotizador | `POST /api/buyer/signal` (`buyer_signals.py:104`, 38 tipos válidos, rate-limit, TTL 120d, ip_hash) | vivo |
| **visitor_id cripto-fuerte + claim cross-device** | Id anónimo no adivinable; al loguear se pega a tu cuenta para que el gusto te siga. | `lib/buyerSignal.js:10-62` (_strongId, claimVisitor) | `POST /api/buyer/claim` (`buyer_signals.py:882`) + visitor_identity | vivo |
| **Elasticidad (qué relaja el comprador)** | Cuando cede un criterio sin match, registra QUÉ cedió → oro de producto/precio. | `Marketplace.js:294` | `POST /api/buyer/elasticidad` (`buyer_signals.py:177`) → db.buyer_elasticidad | vivo |
| **Embudo por unidad (privado del dev)** | Cuántos vieron/guardaron/dejaron lead por cada unidad concreta (#02A). | componentes dev (PriceListTab disparan unit_view/save) | `GET /api/desarrollo/{dev_id}/embudo-unidades` (require_dev + assert_dev_project) | vivo |
| **Interés agregado del desarrollo (prueba social)** | Likes/guardados/vistas con k-anon ≥3 para prueba social en la ficha. | `lib/buyerSignal.js:65` fetchInteres | `GET /api/desarrollo/{dev_id}/interes` (público, k-anon) | vivo |
| **Percepción + porqué del NO (privado del dev)** | Por qué descartan su proyecto (fotos/precio/zona) y si el problema es la presentación (gap fotos→Studio). | dashboard dev | `GET /api/desarrollo/{dev_id}/percepcion` (`buyer_signals.py:611`) | vivo |
| **Mi gusto (visibilidad al comprador)** | Le muestra al comprador el gusto inferido. | perfil del comprador / AtlaxMyList | `GET /api/buyer/mi-gusto` (`buyer_signals.py:280`) ← visitor_taste | vivo |
| **Parecidos (Netflix-style)** | Recomienda desarrollos parecidos con el porqué. | `Marketplace.js:88` | `GET /api/buyer/parecidos` (`buyer_signals.py:957`) + taste_scores | vivo |
| **¿Dónde vivirías feliz? (lente espacial)** | Rankea colonias por calidad de vida + presupuesto + afinidad. | `components/comprador/DondeVivirCard.js` → CompradorDashboard:269 | `GET /api/buyer/donde-vivir` (`buyer_signals.py:473`) | vivo |
| **Mapa de calor de la demanda** | Mapa público de dónde busca la gente, resaltando tus zonas. | `components/comprador/DemandaMapaComprador.js` → CompradorDashboard:270 | `GET /api/buyer/demanda-mapa` (`buyer_signals.py:544`) | vivo |
| **create_buyer_lead — momento de conversión (E3)** | En alto intento engancha el histórico, calcula temperatura por conducta, asigna a la casa y espeja al CRM del asesor. | vía /api/buyer/registrar + /api/buyer/promote | `create_buyer_lead()` (`buyer_signals.py:705`) — FUENTE ÚNICA | vivo |
| **Engagement/temperatura por conducta** | Calor del lead (frío/tibio/caliente) con factores explicables, no por orden de llegada. | Ficha360/Mis Leads del asesor | `compute_engagement()` (`buyer_signals.py:657`) — reusado por create_buyer_lead y lead_bridge | vivo |
| **Registrar lead (alto intento explícito)** | Nombre/email/teléfono → crea/actualiza el lead (idempotente por visitor_id). | LeadCaptureModal, SaveSearchModal, AtlaxLeadModal | `POST /api/buyer/registrar` (`buyer_signals.py:860`, rate-limit 8/min) | vivo |
| **Promote (lead vía login en gate)** | Tras autenticarte en un gate, el usuario logueado se vuelve lead con su perfil. | `components/landing/AuthModal.js` | `POST /api/buyer/promote` (`buyer_signals.py:841`) | vivo |
| **Puente lead → CRM del asesor (lead_bridge)** | Materializa el lead como contacto de primera clase en "Mis Leads", idempotente y con dedup vs alta manual. | portal asesor (Mis Leads / Ficha360) | `services/lead_bridge.py` mirror_lead_to_asesor_contacto() (`:91-254`) | vivo |
| **Ruteo inteligente del lead público** | Asigna por afinidad (zona/proyecto) o round-robin; si no hay asesor activo, queda reclamable. | CRM del asesor/admin | `lead_bridge.py` resolve_public_lead_owner() + resolve_house_public_receiver() | vivo |
| **Auto-reparación de leads (sweep + crones)** | Rutea huérfanos, reintenta espejos, re-sincroniza etapa↔status, recalienta temperatura. | n/a (jobs) | `lead_bridge.py` lead_completeness_sweep/route_orphan_leads/retry_pending_mirrors/etc. (`:356-576`) | vivo |
| **Espejo de favoritos al tablero del asesor** | Baja favoritos/citas/notas/unidades guardadas al Ficha360 al crearse/activarse el lead. | Ficha360 del asesor; comprador guarda en /favoritos | `mirror_favoritos_to_board` (desde create_buyer_lead y lead_bridge._replay_favoritos) | vivo |
| **Favoritos del comprador (Mi Lista)** | Guardar/quitar desarrollos y agendar cita/nota, reusando el espinazo. | `pages/Favoritos.js` · AtlaxMyList.js | `routes/favoritos.py` GET/POST /favoritos[/quitar/cita/nota] | vivo |
| **Marketplace público (buscador)** | Página principal: filtros, IA-parse, casi-cumple, comparador, ParecidosCerraron, alertas, guardar búsqueda. | `pages/Marketplace.js` + TopFilters/DevelopmentCard/OportunidadPanel | `marketplace_search.py` /api/marketplace/developments + public.py /api/developments[/casi] | vivo |
| **Búsqueda por imagen / por URL** | Buscar parecidos subiendo foto o pegando link. | ImageSearchModal.js, UrlSearchModal.js | `marketplace_search.py` /by-image · `external_search.py` /by-url | vivo |
| **Perfilador / reverse-search del comprador** | Declaras tu perfil y recibes desarrollos con match transparente; la zona es sagrada. | AtlaxSurface/Results, reverseSearch, /portal/buscar | `perfil_recomendar.py` POST /api/perfil/recomendar ← reverse_search_engine | vivo |
| **Registrar búsqueda como demanda anónima** | Guarda en marketplace_searches (unmet=true si no hubo resultado) → alimenta Grafo y huecos. | perfilador + Marketplace | `perfil_recomendar.py` /registrar-busqueda + public.py/marketplace_search escriben marketplace_searches | vivo |
| **Guardar búsqueda + alerta (saved search)** | Guarda y pide aviso al entrar inventario que matchee (doble opt-in por email). | SaveSearchModal.js | `external_search.py` POST /api/public/saved-search (+confirm/unsubscribe) → create_buyer_lead | vivo |
| **Casamentera proactiva (E4)** | Cada hora busca por el comprador: si entra inventario que matchea una búsqueda guardada, crea alerta. | alertas en Marketplace:91 + CompradorAlertas | `casamentera.py` /correr + /alertas · cron horario `server.py:2636` | vivo |
| **Alertas del comprador (CRUD)** | Crea/edita/borra alertas (precio, nuevos devs) y ve entregas. | `pages/comprador/CompradorAlertas.js` | `routes/buyer_alerts.py` /api/comprador/alerts[/deliveries] | vivo |
| **Grafo del Comprador (lado-demanda cross-portal)** | Por colonia × etapa de vida, qué quiere la demanda; sirve a dev, asesor y superadmin. | dev dashboard + Ficha360 + superadmin | `grafo_comprador.py` /api/{dev,asesor,superadmin}/grafo-comprador ← grafo_comprador_engine | vivo |
| **Cubo de demanda (señales→OLAP)** | Agrega buyer_signals + marketplace_searches en el cubo granular para superadmin (Bloomberg CDMX). | superadmin (SuperadminDemandaMercado) | cube_olap_engine + demand_intelligence + demand_twin_engine + superadmin_demand_intel | vivo |
| **Onboarding / registro / auth del comprador** | Registro/login email+password (rol forzado a buyer) + magic-link sin contraseña. | `components/landing/AuthModal.js` · `pages/auth/MagicLinkLogin.js` | `routes/auth.py` /register/login/me/session + /comprador/magic-link/request,verify | vivo |
| **Portal del comprador (dashboard logueado)** | Hub: recomendados, recientes, búsquedas guardadas, favoritos, historial, lentes espaciales, smart-match. | `pages/comprador/CompradorDashboard.js` + SmartMatchWidget | `routes/comprador.py` /dashboard/recommended/visitas/profile/saved-searches/favorites/history | vivo |
| **Privacidad del comprador (LFPDPPP)** | Ver consentimientos, exportar datos, solicitar/cancelar borrado de cuenta. | `pages/comprador/CompradorPrivacy.js` | `comprador.py` /privacy/consents,export,delete-account,cancel-delete | vivo |
| **Wrapped del comprador** | Resumen anual estilo Spotify-Wrapped. | `pages/comprador/CompradorWrapped.js` | `routes/wrapped.py` | vivo |
| **Landings SEO de colonia/alcaldía/intent** | Páginas SEO sin inventario por colonia, alcaldía e intención (rentar/vivir/invertir) con top colonias y devs. | AlcaldiaPage, IntentLandingPage, SeoThemedLanding | `routes/landings.py` /colonia/alcaldia/intent + seo_themed.py | vivo |
| **Captura de lead de landing (sin inventario)** | El visitante deja email para avisarle cuando se publique algo en esa zona. | AlcaldiaPage/IntentLandingPage forms | `landings.py` POST /lead → db.landing_leads (+UTM+consent) | vivo |
| **/valor/:slug — AVM público sin login** | Landing por colonia con estimación AVM gratuita + JSON-LD para SEO. | `pages/public/ValorColonia.js` | `routes/avm_public.py` /landing/quick/colonia/top ← avm_public_engine | vivo |
| **/valores — mapa de valores público** | Mapa de Valores por colonia (precio/m² real). | `pages/public/Valores.js` | `public.py` /api/colonias, /colonias-geojson, /precio-posicion | vivo |
| **/confianza — dashboard de exactitud (trust)** | Qué tan acertado es el AVM (reliability, KPIs, por-zona) como prueba de confianza. | `pages/public/ConfianzaPage.js` | `routes/accuracy.py` /meta-dashboard, /per-zone | vivo |
| **/metodologia — metodología pública** | Explica cómo se calculan los modelos (hedónico, fuentes) para credibilidad/SEO de IA. | `pages/public/MethodologyPage.js` | `routes/bulletins.py` / data-lake validation | vivo |
| **Forecast público de zona/propiedad** | Pronóstico de plusvalía público por colonia o propiedad para landings. | ValorColonia / ZonePageV2 | `routes/forecast_public.py` /zone/property/cache-stats | vivo |
| **ZonePageV2 (ficha de zona pública)** | Página rica por colonia: pulso, inversión, riesgo, vida, lugares, demanda. | `pages/public/ZonePageV2.js` | `public.py` /api/zona/{id}/pulso,inversion,ciclo,riesgo,vida,lugares | vivo |
| **AtlaxSurface (LLM inmobiliario público)** | Superficie conversacional pública (no burbuja) donde el comprador escribe lo que busca y Atlax responde/perfila. | `pages/public/AtlaxSurface.js` (/atlax) | perfil_recomendar + asistente público (señales atlax_query/atlax_profile) | vivo |
| **Mercado público (índice + amenity ranker)** | Índice de mercado público y ranking de amenidades por demanda para landings/ZonePage. | DMXMarketIndex.js, DemandaZonaCard.js | `routes/public_market.py` /index, /amenity-ranker · public_zones.py | vivo |
| **SEO files para crawlers/IA** | Sirve llms.txt (inventario real), sitemap.xml dinámico y ai-plugin.json para que IAs citen listings. | n/a (servido a bots) | `routes/seo_files.py` /llms.txt, /sitemap.xml, /.well-known/ai-plugin.json | vivo |
| **Instrumentación funnel + atribución por ref** | Registra eventos de funnel y vistas; captura ?ref=asesor y UTM con cookie 30d. | `lib/funnelTracker.js` + `lib/tracking.js` | `routes/funnel.py` /event · comprador.py /history | vivo |
| **Captura/score de lead de marketplace (F7)** | Capta y puntúa un lead desde el marketplace y lo canaliza a create_buyer_lead. | `components/leadCapture/*` | `lead_capture_marketplace.py` /lead-capture[/score/pdf] (create_buyer_lead en :594) | vivo |
| **Cotizador público + cierre de señal financiera** | Explorar enganche/mensualidad/esquema en la ficha se registra como intención financiera alta. | PublicCotizador.js, OwnershipCalculator.js, MortgageCalculator.js | `public.py` /api/public/payment-schemes/{id} + señales payment_explore/roi_explore | vivo |
| **Cross-sell del comprador (partners)** | Ofertas de aliados (crédito/seguro/mudanza) en dashboard/ficha. | CompradorCrossSellSection, CrossSellOffersBar, PartnerOfferModal | `routes/cross_sell.py` ← cross_sell_engine | vivo |
| **Swipe público (link estilo Tinder)** | Link compartible donde el comprador vota propiedades, agenda cita y deja notas (alimenta el espinazo vía token). | SwipeLinkRoute (/p/:token) | `routes/swipe_public.py` /api/swipe/{token}[/vote/cita/nota/events/profile] | vivo |
| **Demanda de zona / huecos de producto (privado del dev)** | Qué buscaron compradores en su colonia que NO encontró nadie (demanda insatisfecha) → qué construir. | dashboard dev | `GET /api/desarrollo/{dev_id}/demanda-zona` ← db.demanda_insatisfecha (`buyer_signals.py:223`) | **parcial** (depende de jobs que pueblen demanda_insatisfecha) |
| **Ficha-experiencia: parallax 3D local por gusto** | Genera (gratis, local, background) un parallax 3D en el orden del gusto. | AtlaxExperiencia.js | `GET /api/buyer/experiencia-parallax/{id}` (`buyer_signals.py:387`) ← parallax_engine | **parcial** (1ª visita ready:false, personaliza la próxima) |
| **State of CDMX 2026 (reporte anual)** | Reporte público con top colonias por ROI, gap demanda-oferta y predicciones + imagen OG. | `pages/public/StateOfCDMX.js` | `routes/state_of_cdmx.py` /api/state-of-cdmx[/{period}][/og-image] ← state_of_cdmx_engine | **parcial** (predictions/velocity derivadas, es_estimado=true sin zone_scores) |
| **ParecidosCerraron (prueba social de cierres)** | Propiedades parecidas que ya se cerraron como prueba de demanda real. | `components/marketplace/ParecidosCerraron.js` → Marketplace | copiloto_closings leído por el componente | **parcial** (depende de volumen de cierres reales) |

> **Espinazo→cubo:** buyer_signals + marketplace_searches → cube_olap_engine/demand_intelligence/demand_twin_engine + grafo_comprador_engine. marketplace_searches lo escriben 5 sitios (public.py, perfil_recomendar, external_search, marketplace_search, buyer_signals). 38 tipos de señal válidos en `buyer_signals.py:40-63`. Seguridad endurecida tras pentest 2026-06-27 (visitor_id cripto-fuerte, rate-limits, endpoints privados del dev con _require_dev+assert_dev_project, sin cross-tenant/anónimo).

---

## Motores que usa el comprador (lista deduplicada)

Inventario único de los motores backend que alimentan las 4 áreas. La regla del founder es **grep antes de construir, REUSAR siempre**: estos motores se comparten entre comprador, dev, asesor y superadmin.

**Búsqueda y match**
- `public.py` — list_developments (grid · casi · similar · search-ai · colonias), zona, mortgage, inversión
- `reverse_search_engine.py` — parser LLM (Claude Sonnet) + búsqueda (perfilador y /portal/buscar)
- `comparator_engine.py` — `/api/compare` (comparador del portal)
- `services/colonia_comparator.py` — `/api/comprador/compare` premium (matriz + PDF)
- `services/image_search.py` — Claude Vision + image_embeddings (by-image)
- `external_search.py` — parse URL competidor + saved-search
- `zone_score_engine.py` — sub-scores de zona para filtro
- `facet_engine` — screener (vive en SUPERADMIN, no en comprador)

**Finanzas y veredicto**
- `payment_schemes.py` + dev_payment_schemes — esquemas de pago del dev (enganche/mensualidad por unidad)
- `marketplace_calculator.py` — hipoteca multi-banco + DTI (`/api/public/mortgage`)
- `ownership_economics_engine.py` — ¿rento o compro? + TCO (`/api/public/ownership`)
- `inversion_v4_finance` / `inversion_v4_tax` / `inversion_v4_veredicto` — calculadora V4 (TIR/cap rate/escenarios/MonteCarlo/sensibilidad/proforma/ISR)
- `market_rates_engine.py` — mercado vivo CETES/UDIS/inflación/tasa hipotecaria + 9 instrumentos
- `price_context_engine.py` — precio en contexto de obra nueva
- `buy_signal` route — `_combined`: veredicto precio × momento
- `airroi` — renta corta real por zona (cacheada, cobra por llamada)
- `investment_simulator_engine.py` — panel de oportunidad de zona

**Gusto y señales (el cerebro)**
- `buyer_signals.py` — el ESPINAZE (signal/registrar/promote/claim/elasticidad + taste_scores/parecidos/donde-vivir/demanda-mapa/experiencia-fotos/mi-gusto). Es route, no _engine.
- `visitor_taste.py` — perfil de gusto hipergranular del visitante anónimo (aprende de cierres)
- `taste_profile.py` — perfil de gusto del lado asesor/CRM
- `lead_match.py` — match perfil↔dev (casamentera/asesor)
- `photo_tagger.py` — etiqueta cuarto+features de cada foto (alimenta visitor_taste y experiencia-fotos)
- `services/visitor_identity.py` — espinazo cross-device (link/resolve)
- `services/smart_match.py` — compute_buyer_match_score (SmartMatchWidget)
- `behavioral_tracking_engine` — sensor de conducta → lead score, demanda
- `cerebro_mercado_engine.py` — bandas de precio / lifts que el ranking consume
- `parallax_engine.py` — MiDaS + cv2 + ffmpeg → recorrido parallax 3D local

**Asistente / coach**
- `asistente_engine.py` + `atlax_engine.py` + `atlax_blocks.py` — RAG/asistente público (Atlax)
- `atlax_persona_engine.py` — voz de Atlax por tenant (superadmin)
- `buyer_coach_engine.py` — coach conversacional por etapas (backend vivo, sin callsite UI)
- `services/copilot_engine.py` — copiloto autenticado (NO buyer-facing; dev/asesor — descartado)

**Conversión y demanda agregada**
- `create_buyer_lead` (en `buyer_signals.py:705`) — FUENTE ÚNICA de lead de comprador
- `services/lead_bridge.py` — puente lead→CRM del asesor + ruteo + auto-reparación
- `lead_capture_marketplace_engine.py` / `lead_capture_engine.py` / `services/lead_capture.py` — captura+score
- `buyer_score_engine.py` — scoring de lead
- `casamentera` (`routes/casamentera.py`) — cron proactivo búsqueda guardada × inventario
- `grafo_comprador_engine.py` — grafo de demanda cross-portal (colonia × etapa de vida)
- `cube_olap_engine.py` + `demand_intelligence.py` + `demand_twin_engine.py` — cubo de demanda OLAP

**Zona, mapa, mercado**
- `zone_cycle_engine.py` / `absorcion_engine.py` — ciclo y absorción de zona
- `natural_risk_engine.py` / `market_estimate_engine.py` / `catastro_sig_engine` — enriquecen tarjetas/panel
- `maps_engine` / `osm_engine` — lugares Google + vida OSM por zona
- `avm_public_engine.py` — AVM público sin login (/valor/:slug)
- `state_of_cdmx_engine.py` — reporte anual público + OG image
- `forecast_public` (`forecast_public.py`, usa forecast_accuracy/forecast) — pronóstico público
- `cross_sell_engine.py` — ofertas de socios
- `marketplace_map.py` — heatmap/levels (ORFANO en front)

---

## Cómo se conecta (el espinazo)

El portal del comprador no es una colección de páginas: es **un flywheel**. Así viaja un dato:

**1. La señal entra (espinazo `buyer_signals`).**
Cada conducta — abrir una ficha, quedarse 8 segundos en la foto de la terraza, dar like, descartar un proyecto por "fotos malas", ceder la amenidad de gym, escribir en Atlax — emite una señal vía `lib/buyerSignal.js` → `POST /api/buyer/signal` (`buyer_signals.py:104`, 38 tipos válidos). Va atada a un `visitor_id` cripto-fuerte de localStorage. Hoy son 303 señales reales en DB (zone_intent, photo_dwell, like, dismiss, save, unit_save, atlax_query…).

**2. La señal se vuelve gusto (visitor_taste).**
`visitor_taste.py` lee esas señales y arma el perfil fino del visitante: qué zonas le gustan y cuáles evita, qué amenidades pesan, su precio-techo, qué features de FOTO lo enganchan (luz/vista/terraza, vía `photo_tagger`), y un perfil NEGATIVO desde los descartes. Ese gusto reordena el grid ("Para ti"), genera "parecidos", rankea colonias en "¿dónde vivirías feliz?", y reordena las fotos de la ficha-experiencia a la medida de la persona.

**3. La señal se vuelve demanda de mercado (cubo OLAP).**
En paralelo, `buyer_signals` + `marketplace_searches` (283 docs, escritos por 5 sitios) alimentan `cube_olap_engine` / `demand_intelligence` / `demand_twin_engine` y el `grafo_comprador_engine`. El "casi cumple" y la elasticidad capturan **demanda insatisfecha** (qué buscó la gente que nadie tiene, y qué cedió cuando no hubo match). Eso sube al superadmin (Bloomberg CDMX) y al dev (qué construir, huecos de producto en su colonia). Este es el **moat**: el Modelo del Mundo de la Demanda de MX.

**4. La señal se vuelve lead (el puente a asesor).**
Cuando el visitante muestra alto intento (agendar, pedir PDF, "que un asesor me arme el plan", o loguearse en un gate de la ficha), se llama a `create_buyer_lead` (`buyer_signals.py:705`) — **la fuente única** (8 callsites: registrar, promote, external_search, saved-search, lead_capture, lead_capture_marketplace). create_buyer_lead engancha todo el histórico de señales del visitor_id, calcula la **temperatura por conducta** (`compute_engagement`, no por orden de llegada), y llama a `services/lead_bridge.py`, que materializa el lead como contacto de primera clase en el CRM del asesor: lo rutea por afinidad (zona/proyecto) o round-robin, espeja sus favoritos/citas/notas al Ficha360, y corre crones de auto-reparación (huérfanos, reintentos, sincronía etapa↔status, recalentar temperatura).

**5. El cierre re-entrena el gusto (flywheel cerrado).**
Cuando el asesor marca GANADO, `copiloto_flywheel.py` captura el viaje completo (qué buscó vs qué compró) en `copiloto_closings` + `closing_lifts`. `visitor_taste.score_devs` consume esos lifts → el ranking del comprador mejora con cada cierre. Y "ParecidosCerraron" usa esos cierres como prueba social. (Hoy con solo 2 cierres está en su infancia, pero el cable está vivo.)

**Cross-device:** al loguearse, `claimVisitor()` → `/api/buyer/claim` une todos los visitor_id de una persona vía `visitor_identity` (5 identidades vinculadas en DB), así su gusto y su lista lo siguen entre dispositivos.

En una línea: **conducta anónima → gusto granular + demanda de mercado → lead caliente con contexto → cierre que re-entrena.** Cero callejones, todo reusa motores.

---

## Cierre — conteo

Total de features catalogadas en las 4 áreas: **~118 entradas** (con solape deliberado entre Área 3 y Área 4 porque el espinazo de señales vive en ambas vistas).

| Estado | Qué significa | Aprox. |
|---|---|---|
| **Vivo** | Cableado punta a punta, verificado en código y/o backend live. | ~85 |
| **Parcial** | El código está vivo, pero falta DATA sembrada, un job que corra, o un flag prendido (no es deuda de código). | ~20 |
| **Stub** | El cable existe pero la fuente de datos está en 0 → nunca produce resultado. | 1 (filtro forecast_delta_min) |
| **Huérfano** | El backend/componente existe pero NO tiene callsite/consumidor en el front. | ~8 |

**Huérfanos confirmados** (existen, sin consumidor): los endpoints de heatmap del marketplace (`marketplace_map.py` map/levels/heatmap/colonia + sus fetch en api/marketplace.js); **todos** los `components/maps/*` (LayerToggle, MapFilters, DemandGapToggle, BattleCardOverlay, MatchCatastroPreventa, SaveZoneModal, AtlaxContextualButton); `components/zones/SubscoreFilterPanel.js`; `components/marketplace/ColoniaHistoryTab.js`; `components/marketplace/ColoniaReportModal.js`; la ruta `/experiencia/:id` (`AtlaxExperiencia`) huérfana de navegación; el import muerto `SeccionValor`; y `components/buyer_coach/BuyerCoachConversation.js` (backend vivo, sin JSX que lo renderice).

**Parciales por falta de datos/escala (no por código roto):** by-image (image_embeddings=0), saved-search (saved_searches=0), casamentera (buyer_alerts=0), ParecidosCerraron + flywheel (copiloto_closings=2), atlax_personas=0, demanda-zona (demanda_insatisfecha la pueblan jobs), State of CDMX (predictions derivadas, es_estimado=true), CompradorAsistente (CEREBRO_ENABLED default OFF), experiencia-parallax (personaliza en 2ª visita), ColoniasV2 (data hardcodeada en el bundle).

**Lo que está más sólido y vivo:** el espinazo `buyer_signals` → cubo → puente a asesor (la cadena completa de conversión y demanda), la calculadora de inversión V4 (verificada: TIR 10.22%, 9 instrumentos), el módulo "Tu Dinero" unificado, los 3 comparadores, la búsqueda IA con fallback determinista, y la fuente única `create_buyer_lead`. El moat — el Modelo del Mundo de la Demanda — ya está fluyendo: 303 señales + 283 búsquedas reales alimentando el cubo.
