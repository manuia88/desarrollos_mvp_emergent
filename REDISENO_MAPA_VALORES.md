# Rediseño /mapa-valores — Mapa de Valores DMX

**Referencias:** Propiedades.com (data + ficha lateral) + Monopolio (polígonos choropleth + estética limpia)
**Fecha:** 2026-07-01 · **Archivo:** `frontend/src/pages/Mapa.js` (733 líneas) · Ruta `/mapa` y `/mapa-valores` → mismo `Mapa.js` (`App.js:698-703`)
**Veredicto de una línea:** Es un rediseño de **PRESENTACIÓN, no de datos.** El 70-80% ya está construido y cableado sobre datos reales; el mapa se ve mal porque **encima 4 sistemas visuales que compiten**, no porque falten datos.

---

## 1. QUÉ ES HOY /mapa-valores (y por qué se ve mal — concreto)

Hoy `/mapa-valores` NO es un stub. Es un **choropleth Mapbox de los 1,811 polígonos reales de colonia IECM** (`db.colonias.geometry`, servidos por `/api/colonias-geojson`), coloreados por **valor catastral real del suelo $/m²** con rampa calibrada a la distribución (mediana ~$2,400/m², p90 ~$5,000). Fondo claro (`mapbox/light-v11`). Al hacer click en una colonia abre un **panel lateral rico** (~80% de la ficha de Propiedades.com). Al acercar a zoom ≥14 pinta **polígonos de predio** del catastro SIGCDMX con popup de valor + unidades del edificio (`/api/catastro/predios-bbox`). Los desarrollos aparecen como puntos verdes.

**Por qué se ve "horrible" (es estético, y es concreto):** sobre el choropleth limpio se pintan AL MISMO TIEMPO cuatro capas que compiten (`Mapa.js:293-326`):
1. **`colonia-glow`** — círculo morado difuso gigante (radio 26-58) por colonia.
2. **`colonia-dot`** — punto morado (radio 7-17) con borde blanco por colonia.
3. **`colonia-price`** — etiqueta `"Nombre\n$Xk/m²"` flotante por colonia.
4. **`price-heat`** — heatmap opcional de manchas rojo/naranja.

Estas **3 burbujas** son exactamente las "burbujas sueltas feas" que el founder rechaza. Tapan el gradiente del polígono, saturan la vista y son justo lo contrario de Monopolio (que usa SOLO polígonos rellenos). Además: **el hover no muestra tooltip** (solo cambia opacidad), y la **toolbar es un toggle pobre de 2 estados** ("Precio/m²" vs "Mapa de calor"), sin las herramientas de Monopolio.

---

## 2. BLUEPRINT del rediseño (Propiedades data + Monopolio estética)

### 2.1 El mapa (choropleth Monopolio puro)
- **Un solo sistema visual: el polígono relleno.** Colonia = polígono con gradiente por $/m² (rampa clara semitransparente, bordes finos). **MATAR las 3 capas de burbujas** (`colonia-glow`/`colonia-dot`/`colonia-price`) y el heatmap. El valor se lee por el **color del polígono**.
- **Hover → tooltip flotante** que sigue el cursor: nombre + $/m² + plusvalía YoY. El dato ya vive en las properties del feature (`buildGeoJSON`); hoy solo se cambia opacidad.
- **Click → panel lateral** (patrón Monopolio puro: color + tooltip + panel, nada encimado).

### 2.2 El panel lateral (ficha tipo Propiedades.com)
- **Precio $/m² grande** + plusvalía (▲/▼ %) — YA existe.
- **Gráfica histórica** de valorización — YA existe (SVG 24m), pero hoy solo con datos para 16 colonias seed → hay que resolver la serie (ver §3).
- **Valor del suelo · Catastro oficial** ($/m² + predio típico + n predios reales SIGCDMX) — YA existe.
- **4 scores en lenguaje de beneficio** (Tranquila / Llegas Rápido / Todo a la Mano / Mucha Vida) — YA existe, alimentado por engines reales (FGJ, DENUE).
- **Plusvalía YoY: barras Colonia vs Alcaldía** — dato real existe (SHF) pero **NO cableado al mapa** (ver §3).
- **Características típicas** (recámaras/baños/autos) — **el único dato genuinamente ausente** (el catastro no lo trae; ver §3).
- **Parecidas a esta** (similares por taste) + **Vigila esta colonia** (watchlist) + **CTA Ver desarrollos** — YA existen.

### 2.3 La toolbar flotante (limpia, tipo Monopolio)
Reemplazar el toggle de 2 estados por una toolbar horizontal limpia: **Mapa de precios · Desarrollos (toggle real) · Ver zona · Dibujar**.
- "Desarrollos" con toggle real (hoy la capa `dev-point` está siempre-on).
- "Ver zona" ya tiene destino (`Link a /zona/:id?ver=propiedades` en el panel) — solo exponerlo.
- "Dibujar" = net-new (única pieza que pide dependencia nueva).

### 2.4 La jerarquía de zoom (Alcaldía → Colonia → Predio)
- **Colonia** (choropleth, todo zoom) — YA.
- **Predio** (polígonos de lote catastral a zoom ≥14, popup de valor + unidades) — YA. Mejor que las "burbujas por manzana" de la referencia: son polígonos reales del lote.
- **Alcaldía** (rollup agregado a zoom lejano, color promedio) — **FALTA** (nivel superior no existe sobre datos reales).

---

## 3. QUÉ TENEMOS vs QUÉ FALTA (cada pieza del diseño → su dato real)

| Pieza del diseño | ¿Tenemos? | Dato / fuente real | Estado |
|---|---|---|---|
| Choropleth polígonos de colonia por $/m² | **SÍ** | `db.colonias.geometry` (1,811 IECM) + `valor_catastral`, endpoint `/api/colonias-geojson` | Construido y cableado |
| Escala de color por valor | **SÍ** | rampa calibrada a distribución real | Construido |
| Hover con highlight | **SÍ** (parcial) | feature-state | Falta el **tooltip** |
| Panel: precio $/m² grande + plusvalía | **SÍ** | `market_estimate_engine` (mini-AVM 3 capas, sello fuente/confianza) | Construido |
| Panel: valor de suelo catastral | **SÍ** | `catastro_sig_engine.colonia_catastro` (`/api/catastro/colonia`) | Construido |
| Panel: 4 scores de zona | **SÍ** | `zone_subscores_compute` (FGJ, DENUE) inyectados en geojson | Construido |
| Panel: gráfica histórica de plusvalía | **PARCIAL** | serie `trend[]` **sintética, solo 16 seed**; SHF real por alcaldía | Falta serie por colonia |
| Panel: plusvalía YoY Colonia vs Alcaldía | **DATO SÍ / CABLE NO** | `shf_engine.get_appreciation`/`get_series` — real por alcaldía (5 propias + fallback CDMX 4.5%); hoy solo cableado en `buy_signal.py` por `dev_id`, **no público, no en el mapa** | **Falta cablear** |
| Panel: características típicas (rec/baños/autos) | **NO** | catastro no trae estos campos (solo valor, terreno, construcción, año, unidades) | **Dato ausente** |
| Nivel predio (polígonos de lote) | **SÍ** | `/api/catastro/predios-bbox` (`$geoWithin`, zoom ≥14) | Construido |
| Nivel alcaldía (rollup) | **NO** | — | Falta (net-new sobre datos reales) |
| Toolbar limpia + toggle Desarrollos | **PARCIAL** | capa `dev-point` existe (siempre-on) | Falta rediseñar toolbar |
| Herramienta Dibujar | **NO** | primitiva `$geoWithin` ya existe en backend | Net-new (dep `mapbox-gl-draw`) |
| Similares + Watchlist + CTA zona | **SÍ** | `/api/colonias-similar`, `/api/colonia-watch` | Construido |

### Confrontación honesta (lo que hace o rompe el diseño)
- **Geometría de polígonos: LA TENEMOS.** 1,811 colonias reales + predios como polígono. **No es un riesgo de diseño.**
- **Serie de plusvalía por colonia: NO la tenemos por colonia.** La gráfica histórica del panel hoy es **sintética para ~16 colonias seed**; las otras ~1,795 no tienen serie. SHF real existe pero **solo a nivel alcaldía** (5 propias + estatal). **Esto SÍ afecta el diseño:** la gráfica "24 meses por colonia" y las barras "colonia vs alcaldía" no se pueden pintar con dato real por-colonia — hay que **derivarlas del índice SHF de su alcaldía y marcarlas como estimadas**, o mostrarlas solo a nivel alcaldía.
- **Características típicas (rec/baños/autos): NO existe** del lado oferta. El catastro no lo trae y no scrapeamos anuncios. Es el **único bloque del panel de Propiedades que no podemos poblar con dato real hoy.**
- **RIESGO OPERATIVO a verificar:** Mongo está **apagado localmente** (no pude confirmar ingesta en vivo). `DATA_SOURCES.md` (2026-06-07) reportaba valor catastral vivo **por colonia=16, `catastro_predios` crudo=0.** El código y endpoints existen, pero **antes de prometer nivel-predio y choropleth-1,811 hay que confirmar conteos reales** en `db.colonias(geometry)`, `colonia_catastro_byid`, `catastro_predios(poly+geo)`.
- **DEUDA de arquitectura:** coexisten **dos APIs de mapa**. El bueno (`public.py`, datos reales) y uno **legacy huérfano** (`marketplace_map.py` + `colonia_intelligence.get_colonia_full`, corre sobre ~18 colonias seed). El rediseño debe **quedarse con el real y retirar el legacy** para no tener dos fuentes de verdad.

---

## 4. PLAN POR FASES

### Fase 0 — Verificar ingesta (bloqueante, ~1-2h)
Prender Mongo, confirmar conteos reales de `colonias(geometry)`, `colonia_catastro_byid`, `catastro_predios(poly+geo)`. Si están parciales, correr los ingest de catastro (CSV + shapefile). **Sin esto no se puede prometer el choropleth completo ni el nivel-predio.**

### Fase 1 — Pase estético (YA, reusa todo lo existente · ~4-6h) ← el "se ve horrible"
1. **Eliminar** las 3 capas de burbujas (`colonia-glow`/`colonia-dot`/`colonia-price`) + el heatmap. (`Mapa.js:268-326`)
2. Pulir el choropleth: opacidad más suave, bordes finos, rampa limpia (estética Monopolio).
3. **Añadir tooltip en hover** (nombre + $/m² + plusvalía; dato ya en el feature).
4. **Toolbar limpia** (Mapa de precios · Desarrollos con toggle real · Ver zona) reemplazando el toggle pobre.
> Resultado: mata el 90% del problema del founder sin tocar backend.

### Fase 2 — Cablear plusvalía real (reusa data existente · ~3-4h)
5. Exponer `shf_engine` en un **endpoint público** por colonia (hereda alcaldía→colonia). Renderizar **barras Colonia vs Alcaldía** en el panel.
6. Resolver la gráfica histórica: **derivar la serie del índice SHF de la alcaldía**, marcada "estimada", para las colonias sin serie propia (o mostrar solo nivel alcaldía). Elimina la serie sintética de 16 seed.
7. Aplicar `hideIfEmpty` a "Características típicas" (o sustituir por "tamaño típico" desde `sup_construccion` mediana, que **sí** tenemos).

### Fase 3 — Consolidación (deuda · ~2-3h)
8. Retirar/deprecar el API legacy (`marketplace_map.py` + `colonia_intelligence.get_colonia_full`). Una sola fuente de verdad.
9. **Nivel alcaldía (rollup)** a zoom lejano, sobre datos reales (NO cablear el legacy seed).

### Fase 4 — Net-new (P2, no bloquea · ~6-10h + data nueva)
10. Herramienta **Dibujar**: dep `mapbox-gl-draw` + endpoint que acepte polígono arbitrario (`$geoWithin` ya existe) → colonias/predios/desarrollos dentro.
11. **Características típicas reales**: requiere fuente de atributos por unidad (backlog hasta tener el dato). Seguir alimentando `db.market_comps` / cierres del asesor para subir confianza del AVM.

---

## RESUMEN

**Qué es hoy:** `/mapa-valores` NO es un stub — ya es un choropleth Mapbox de los **1,811 polígonos reales de colonia IECM** coloreados por valor catastral del suelo, con panel lateral rico (~80% de la ficha de Propiedades.com), nivel predio a zoom cercano, catastro oficial, similares y watchlist. Se ve "horrible" porque **encima 4 sistemas visuales que compiten** (choropleth + glow + dot + etiqueta de precio + heatmap), no porque falten datos.

**El blueprint (6 puntos):** (1) Un solo sistema visual — el polígono relleno estilo Monopolio; matar las 3 capas de burbujas. (2) Hover → tooltip flotante (nombre + $/m² + plusvalía). (3) Panel tipo Propiedades: precio grande + gráfica de valorización + valor de suelo + scores + barras colonia-vs-alcaldía + similares + watchlist + CTA. (4) Toolbar limpia (precios · desarrollos con toggle · ver zona · dibujar). (5) Jerarquía Alcaldía→Colonia→Predio. (6) Una sola fuente de datos (retirar el API legacy seed).

**Tenemos vs falta:** TENEMOS — geometrías reales (colonias + predios), valor catastral $/m², AVM de venta etiquetado, scores de zona reales, panel casi completo, watchlist/similares. FALTA — pase estético (lo principal), tooltip, toolbar, cablear SHF al panel (dato existe, no cableado), serie histórica por colonia (hoy sintética para 16 seed), características típicas (dato ausente), nivel alcaldía, herramienta Dibujar.

**Plan:** F0 verificar ingesta (1-2h, bloqueante) → F1 pase estético que mata el 90% del problema sin tocar backend (4-6h) → F2 cablear plusvalía real y gráfica (3-4h) → F3 consolidar deuda + rollup alcaldía (2-3h) → F4 Dibujar + características típicas (net-new, P2).

**Decisión clave que el founder debe tomar:** la **serie de plusvalía por colonia no existe** con dato real (SHF solo llega a nivel alcaldía). ¿Aceptamos **derivar la plusvalía de cada colonia del índice de su alcaldía, marcada como "estimada"** (permite pintar la gráfica y las barras para las 1,811), o mostramos plusvalía **solo a nivel alcaldía** (100% oficial pero menos granular)? Esa decisión define si el panel se ve completo o con huecos. (Y confirmar F0: que la ingesta de catastro esté realmente poblada antes de prometer el choropleth completo.)
