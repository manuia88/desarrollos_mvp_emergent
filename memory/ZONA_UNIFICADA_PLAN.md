# Plan de acción — Página de Zona Unificada (header + 2 tabs)

**Fecha:** 2026-06-22 · **Branch:** `dev-redesign-tandas` · **Estado:** PLAN (aprobado para arrancar)

## Objetivo (founder)
Al entrar a una colonia: **info general arriba** + **2 tabs** (Propiedades · Conoce la zona). Cambiar entre "ver propiedades" y "entender la zona" = un clic, **sin salir ni doble scroll**. Los 4 perfiles (invertir/familia/primera/vivir) viven en "Conoce la zona". **Upgrade:** el perfil es un **lente global** que personaliza también el tab Propiedades.

## Estado actual (mapeado por 4 agentes)
- **2 páginas separadas:** `/marketplace?colonia=X` (`Marketplace.js` · filtros en URL via `marketplaceUrlState.js`) y `/zona/:slug` (`ZonePageV2.js` · perfil en localStorage `dmx_zone_profile`, NO en URL).
- **Doble scroll:** grid 2-col con sidebar `OportunidadPanel` sticky `overflowY:auto` (`Marketplace.js:597-598`).
- **Detalle:** `/desarrollo/:id` (`DevelopmentDetail`, 5 tabs, página propia).
- **General marketplace** (sin colonia) + **mapa** (`/mapa`) = browse global → se quedan APARTE.

### Comparten (reusar)
PublicNav · Footer · **DevelopmentCard** · AtlaxBubble · SaveSearchModal · LightScope · comparador (localStorage `comparator_basket`) · `sendBuyerSignal`.

### Datos (ya existen)
- **Tab Propiedades:** `GET /api/developments?colonia=X&<filtros>` (fuente viva · soporta sort + paginación).
- **Tab Conoce la zona:** `/api/zona/{id}/inversion` · `/vida` · `/lugares` · `/pulso` · `/inversion-v4/zona-contexto`.
- **Header/snapshot:** `/api/zona/{id}/inversion` (el más completo: precio min/prom/max, renta, ROI/TIR/plusvalía, veredicto).
- **Intención:** `POST /api/buyer/signal` type=`zone_intent`.

## Decisión de arquitectura
- **Ruta unificada = `/zona/:slug`** (mínima ruptura: TODAS las landings SEO ya apuntan ahí). El marketplace-por-colonia se absorbe aquí.
- **Tabs por URL:** `/zona/roma-sur?ver=propiedades` · `?ver=zona`. Perfil también en URL: `&perfil=invertir`. → compartible + botón atrás funciona.
- **Default tab = Propiedades** (vienes a comprar); el header da el resumen; "Conoce la zona" a un toque. Landings editoriales pueden enlazar con `?ver=zona`.
- **Estado preservado:** ambos tabs se montan y se ocultan con CSS (`display:none`), NO se desmontan → no se pierden filtros/scroll/perfil. El tab inactivo se carga perezoso la 1ª vez y queda vivo.
- **Header mata el doble scroll:** el `OportunidadPanel` (sidebar) se reconvierte en un **header horizontal fijo** (snapshot + veredicto + perfil-chips) arriba de los tabs. Un solo scroll por tab.
- **Marketplace general + mapa:** intactos. El mapa → clic colonia → `/zona/X?ver=propiedades`.

## Fases (ordenadas)
1. **Shell + header + tabs.** Nueva estructura en `/zona/:slug`: header sticky (nombre + veredicto + 2 números + chips de perfil) + tabs `?ver=` (URL-driven, estado preservado). Reusa el dato de `/inversion`.
2. **Tab "Conoce la zona"** = el contenido actual de `ZonePageV2` (los 4 perfiles que ya estamos rediseñando · Fase A dedup ya hecha). El selector de perfil sube al header (global).
3. **Tab "Propiedades".** Extraer la parte colonia-scoped del marketplace (TopFilters + grid + filtros + comparar) a un componente `<ZonaPropiedades colonia profile />`. Reusa DevelopmentCard + TopFilters. Filtros en URL. Lazy + montado-oculto.
4. **Perfil = lente global.** El perfil del header personaliza AMBOS tabs: Propiedades reordena/resalta por perfil (familia→+recámaras/escuelas · primera→precio asc · etc.), Conoce-la-zona cuenta esa historia. Opcional (sin perfil = neutral).
5. **Migración + cleanup.** Redirects `/marketplace?colonia=X` → `/zona/X?ver=propiedades` y `/colonia/:slug` → `/zona/:slug`. Actualizar puntos de entrada: `Mapa.js:683`, `HomeV2.js:105,144`, `ColoniasV2.js:55-57,67`. Quitar el sidebar `OportunidadPanel` de la vista colonia (ya es el header). Verificar los entry points editoriales (IntentLanding/Alcaldia/Seo/widgets) — siguen a `/zona/:slug` (sin cambio, o con `?ver=zona`).

## Riesgos + mitigación
| Riesgo | Mitigación |
|---|---|
| Marketplace 40+ estados; desmontar pierde filtros/scroll | Tabs montados-ocultos (display:none), no unmount |
| Filtros en URL (mkt) vs perfil en localStorage (zona) | Esquema único de URL: `?ver=&perfil=&<filtros>` |
| Infinite scroll (mkt) vs cargar-todo (zona) | Propiedades mantiene infinite scroll dentro del tab |
| Perfil como lente global = polimorfismo | Lente OPCIONAL (default neutral) · empezar solo con orden/resalte, no rehacer cards |
| SEO de las landings editoriales | `/zona/:slug` se mantiene como ruta; default Propiedades pero `?ver=zona` disponible |

## Upgrades extra (que el founder no mencionó)
- **CTA/registro + Atlax contextual en el header** → una sola vía de conversión en toda la página, sin importar el tab.
- **Comparador abarca ambos tabs** (ya es localStorage compartido).
- **Header inteligente** que muestra los 2 números que importan según el perfil (invertir→TIR/plusvalía · familia→precio/escuelas).
- Dedup backend: `comparable_zones` está duplicado (`/colonias-similar` == `zones.comparable_zones`) — unificar al pasar.

## Conexión con lo en curso
La **redesign de los 4 perfiles** (Fase A-D) = el contenido del tab "Conoce la zona". Primero la casa (esta página unificada), luego amueblar cada perfil dentro del tab.
