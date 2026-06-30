# Versiones · Consolidación del Frontend

> Auditoría de versiones/flags por superficie + plan para dejar UNA sola versión canónica por pantalla.
> Verificado contra el código (no inventado). Punto único de ruteo: `frontend/src/App.js`.

## Contexto crítico de gobernanza (leer primero)

Los 4 flags de rediseño (`REACT_APP_DEV_V2`, `REACT_APP_SIDEBAR_V2`, `REACT_APP_LEADS_V2`, `REACT_APP_COMMAND_CENTER`) viven **SOLO** en `frontend/.env` y `frontend/.env.local`, **ambos GITIGNORADOS** (confirmado: `git ls-files frontend/.env` = vacío; no están en HEAD). No hay `frontend/.env.example`.

Consecuencia — hay **DOS realidades**:
- **PROD (deploy limpio, sin .env):** CRA cae al fallback `=== 'true'` → **FALSE** → renderiza **V1/legacy** en Dev y Asesor (fail-closed).
- **LOCAL HOY:** `.env` y `.env.local` tienen los 4 = `true` → renderiza **V2/rediseño**.

> El rediseño que se ve en la laptop NO es lo que ve un usuario en producción. Resolver esta divergencia (decidir conscientemente prender los flags en el deploy) es el tema #1 antes de cualquier merge/limpieza.

**Discrepancia de rama:** el encargo decía `dev-redesign-tandas`, pero `git branch --show-current` = **`feat/p1-feeders`**. Confirmar de dónde se mergea antes de consolidar.

**Valores reales hoy** (lectura directa): `PRIVATE_BETA_MODE=false`, `SIDEBAR_V2=true`, `COMMAND_CENTER=true`, `LEADS_V2=true`, `DEV_V2=true`, `ONBOARDING_TOURS=false`. `REACT_APP_DEV_PREVIEW` **NO existe** en ningún .env (botón puente v2→v3 oculto por default — bien).

---

## (1) MATRIZ por superficie

| Superficie | Versiones existentes | Default HOY (prod / local) | CANÓNICA recomendada | Qué retirar | Acción de código concreta | Riesgo |
|---|---|---|---|---|---|---|
| **Home pública `/`** | V1 `LandingPage()` inline (oscura, App.js:686, hardcodeada) · V2 `HomeV2` (claro, solo en `/v2` y fondo de `/login`) | V1 LandingPage (igual prod y local — sin flag) | **HomeV2** (rediseño claro) | `LandingPage()` + imports de landing oscuro, tras verificar paridad | Cambiar App.js:686 a `<HomeV2/>`; redirigir `/v2`→`/`; verificar paridad de secciones (AtlaxHomeHero, DrpiHeroWidget, IntelligenceEngine, Stats, Testimonials, Faq) ANTES de borrar | Medio (técnico bajo, impacto visual alto — cambia la cara del producto) |
| **Ficha `/desarrollo/:id`** | V1 `DevelopmentDetail` (legacy, `?v1=1`) · V2 `FichaDesarrollo` (rebuild, DEFAULT) · V3 `FichaCockpit` (prototipo, `?v3=1`) — selección por **query-param**, NO env | V2 FichaDesarrollo (igual prod y local — es código, no flag) | **FichaDesarrollo (V2)** hoy; V3 es la *dirección* pero NO está lista (ver §2) | V1 `DevelopmentDetail.js` ya; V3 archivar o portar ideas (decisión founder) | Retirar rama `?v1` (App.js:1179) + borrar `DevelopmentDetail.js` tras confirmar paridad. Corregir comentario STALE FichaDesarrollo.js:2 ("preview con ?v2=1 · no toca la ficha actual" — FALSO, ya es default). Limpiar import muerto `SeccionValor` (FichaDesarrollo.js:15, importado, nunca renderizado — verificado) | Bajo (confirmar V2) / Medio (retirar V3) |
| **Marketplace `/marketplace`** | Única: `Marketplace` | Única (sin flags) | Marketplace | — | Mantener. Sin acción | Ninguno |
| **Zona `/zona/:slug`** | Única: `ZonePageV2` (V1 oscura YA BORRADA; sufijo V2 vestigial) | ZonePageV2 (única) | ZonePageV2 | — | Limpieza opcional: renombrar `ZonePageV2`→`ZonePage` (sin V1 con qué colisionar). Baja prioridad | Bajo (cosmético) |
| **Públicas secundarias** (`/colonias`, `/asesores`, `/desarrolladores`) | `ColoniasV2`, `AsesoresV2`, `DesarrolladoresV2` (sufijo V2 vestigial, NO hay V1) | Los V2 (únicos) | Los mismos V2 | — | Limpieza opcional: quitar sufijo V2 de los 3 nombres | Bajo (cosmético) |
| **Portal Dev `/desarrollador*`** | env-flag `REACT_APP_DEV_V2` · V1 (nav legacy + tabs) vs V2 (DevSidebarV2 + cockpit). Ramas **inline** en ~10 archivos | PROD: V1 · LOCAL: V2 | **V2 (DEV_V2=true)** — "UPGRADE no rewrite" aprobado, validado en local | Tras prender+validar: ramas `!DEV_V2`, `navByRole.js` (rama dev), tabs legacy | Prender `REACT_APP_DEV_V2=true` en env-vars de prod. Fase 2: eliminar ramas `!DEV_V2` archivo por archivo | Alto (10+ archivos con ramas inline entrelazadas — trabajo cuidadoso) |
| **Asesor — Sidebar** | env-flag `REACT_APP_SIDEBAR_V2` · nav default vs `AsesorSidebarV2` (archivos paralelos) | PROD: V1 · LOCAL: V2 | **V2 (SIDEBAR_V2=true)** — reorg B7 | `navByRole.js` (rama asesor) + rama renderSidebar legacy en PortalLayout | Prender `SIDEBAR_V2` en prod; coordinar con DEV_V2 (mismo PortalLayout) | Medio |
| **Asesor — Leads `/asesor/contactos`** | env-flag `REACT_APP_LEADS_V2` · `AsesorContactosLegacy` (~700 líneas) vs `AsesorContactosV2`, mismo archivo (selector :43) | PROD: V1/Legacy · LOCAL: V2 | **V2 (LEADS_V2=true)** — primer flag del rollout asesor | `AsesorContactosLegacy` (líneas 46-747) + wrapper-selector | Prender `LEADS_V2` PRIMERO (orden acordado); validar en prod; luego borrar Legacy | Medio (pantalla núcleo: Ficha360/pipeline) |
| **Asesor — Dashboard `/asesor`** | env-flag `REACT_APP_COMMAND_CENTER` · `AsesorDashboard` (V1) vs `AsesorCommandCenter` (archivos paralelos, selección App.js:163) | PROD: V1 · LOCAL: V2 | **AsesorCommandCenter (COMMAND_CENTER=true)** | `AsesorDashboard` (V1) | Prender `COMMAND_CENTER` en prod; validar; luego import directo de CommandCenter en App.js:162-163 | Medio (landing del asesor) |
| **Dashboard Comprador `/comprador*`** | Única: `CompradorDashboard` | Única (sin flags) | CompradorDashboard | — | Mantener. (Nota: `DondeVivirCard.js` con cambios sin commitear, no es tema de versiones) | Ninguno |
| **Portal Inmobiliaria `/inmobiliaria*`** | Única por pantalla | Única (sin flags propios) | Las únicas existentes | — | Mantener. Sin acción | Ninguno |

---

## (2) FICHA v2 vs v3 — veredicto honesto

**Veredicto: v3 NO está lista para ser default. Se queda v2 como default; v3 sigue en prototipo hasta cerrar 1 gap bloqueante + 2 bugs.**

v3 `FichaCockpit` es un prototipo **bien construido, no fachada**: reusa los mismos fetches y motores que v2 (cero motor nuevo, cero dato inventado), maneja loading/empty/error, tiene title-case real con tooltips en lenguaje humano, y su **Atlax agéntico está REALMENTE cableado bidireccional** (dispara/escucha `dmx:atlax-action` y `dmx:ask-atlax`; quickActions llaman IA real, no botones falsos). En esto incluso **supera a v2**, donde el bubble conversacional NO se monta en la ficha. Pero v3 NO está lista **por gaps de paridad, no por bugs graves**.

**GAPS de v3 vs v2 (todos verificados en código):**

1. **ALTO (bloqueante) — `SeccionPanorama` ausente.** v3 NO importa el wizard "¿te alcanza esta unidad?" (calcula alcance 30% ingreso, enganche, mensualidad, recomienda mejor unidad, genera lead caliente "vivir"). Confirmado: las 3 secciones `SeccionPanorama`/`SeccionValor`/`SeccionLente` están ausentes de `FichaCockpit.js`; v2 las importa (FichaDesarrollo.js:15,19,22 y renderiza :307,347). El comprador "para vivir" en la pestaña "Tu dinero" de v3 solo recibe `SeccionDinero(rentobuy)` → **pierde la calificación de comprador**. Es el único bloqueante de VALOR.
2. **MEDIO — `SeccionValor` ausente.** La tarjeta "El veredicto" (buy-signal + plusvalía + "personas buscando aquí") se degrada a un fragmento de texto (`hk.verdict` en la línea de specs).
3. **MEDIO — `SeccionLente` ausente.** Bloque contextual del lente "vivir" que v2 muestra. Menor (v3 lo resuelve parcialmente con LensToggle).
4. **MEDIO (bug) — control muerto `goTo`.** `FichaCockpit.js:534` solo atiende `'panorama'`/`'inversion'`; ignora el ancla `'unidades'`. El botón "cambiar ↑" de `SeccionCalcInversion.js:68` (`onGoTo('unidades')`, flujo institucional) **no hace nada** en v3. En v2 ese ancla sí scrollea.
5. **BAJO (bug) — import muerto `Stat`.** `FichaCockpit.js:15` importa `Stat` y nunca lo usa (verificado: 0 usos). Warning de lint.
6. **BAJO — gating inconsistente.** `?v3=1` es alcanzable en prod **sin flag** (App.js:1180), mientras el botón puente v2→v3 está detrás de `REACT_APP_DEV_PREVIEW` (que ni existe). Gatear v3 o invertir el default al consolidar.
7. **BAJO — limpieza.** v1 `DevelopmentDetail` (879 líneas) sigue ruteado `?v1=1`; retirar al consolidar.

**Camino para promover v3 (cuando founder lo decida):** portar `SeccionPanorama` (gap #1, único bloqueante de valor) → arreglar `goTo` (#4) → limpiar import (#5). El resto (#2, #3, #6, #7) es pulido posterior.

---

## (3) PLAN DE CONSOLIDACIÓN (ordenado de menor a mayor riesgo)

**Regla de oro: NO borrar ningún V1/Legacy hasta que su V2 esté PRENDIDO y VALIDADO EN PRODUCCIÓN.** Hoy prod todavía sirve los V1.

| # | Paso | Acción | Riesgo |
|---|---|---|---|
| 0 | **Confirmar rama + decidir prender flags en deploy** | Verificar rama de merge (hoy `feat/p1-feeders`, no `dev-redesign-tandas`). Decisión consciente: setear los 4 flags en env-vars de prod (no viajan vía .env gitignored) | Bloqueante de gobernanza |
| 1 | **Limpiar la FICHA (sin tocar default)** | Borrar comentario STALE FichaDesarrollo.js:2 (y App.js:53 si aplica); quitar import muerto `SeccionValor` (FichaDesarrollo.js:15); retirar v1 `DevelopmentDetail` + rama `?v1` tras confirmar paridad | Bajo |
| 2 | **PRENDER `LEADS_V2` en prod** | Setear `REACT_APP_LEADS_V2=true`; validar Leads V2 en prod; LUEGO borrar `AsesorContactosLegacy` (46-747) + selector | Medio |
| 3 | **PRENDER `SIDEBAR_V2` + `COMMAND_CENTER` en prod** | Setear ambos; validar nav y dashboard asesor; LUEGO retirar `navByRole.js` (rama asesor), rama renderSidebar legacy, `AsesorDashboard` (V1), simplificar App.js:162-163 | Medio |
| 4 | **PRENDER `DEV_V2` en prod** | Setear `REACT_APP_DEV_V2=true`; validar portal Dev; LUEGO eliminar ramas `!DEV_V2` archivo por archivo (~10) + `navByRole.js` (rama dev) + tabs legacy | Alto (volumen, ramas inline) |
| 5 | **Decidir V3 de la ficha** | Si se promueve: portar `SeccionPanorama` + fix `goTo` + limpiar `Stat`, gatear/invertir default. Si no: archivar `FichaCockpit` + rama `?v3` + `REACT_APP_DEV_PREVIEW` | Medio |
| 6 | **Promover HomeV2 a `/`** | Cambiar App.js:686 a `<HomeV2/>`, redirigir `/v2`→`/`, retirar `LandingPage()` tras verificar paridad de secciones | Medio (impacto visual alto) |
| 7 | **Limpieza cosmética (opcional, baja prioridad)** | Quitar sufijo V2 vestigial: `ZonePageV2`→`ZonePage`, `ColoniasV2`/`AsesoresV2`/`DesarrolladoresV2` | Bajo |

**Promover a default:** HomeV2, FichaDesarrollo (ya), Dev V2, Asesor V2 (sidebar/leads/dashboard).
**Retirar:** `DevelopmentDetail` (?v1), `AsesorContactosLegacy`, `AsesorDashboard` (V1), `navByRole.js`, ramas `!DEV_V2`, `LandingPage()` oscura, sufijos V2 vestigiales. Decidir: `FichaCockpit` (?v3) + `REACT_APP_DEV_PREVIEW`.
**Prender:** `REACT_APP_DEV_V2`, `REACT_APP_SIDEBAR_V2`, `REACT_APP_LEADS_V2`, `REACT_APP_COMMAND_CENTER`.

---

## (4) CHECKLIST de flags para deploy

**PRENDER en env-vars del entorno de prod (Vercel/host — NO viajan vía .env gitignored):**
- [ ] `REACT_APP_DEV_V2=true` — portal Dev V2 canónico (riesgo ALTO si se olvida: prod muestra V1)
- [ ] `REACT_APP_LEADS_V2=true` — Leads asesor V2 (primero en el rollout)
- [ ] `REACT_APP_SIDEBAR_V2=true` — nav asesor V2
- [ ] `REACT_APP_COMMAND_CENTER=true` — dashboard asesor V2
- [ ] `REACT_APP_BACKEND_URL=…` — crítico: ambas fichas lo usan en cada fetch; sin él la ficha queda sin datos

**MANTENER OFF / ausente:**
- [ ] `REACT_APP_DEV_PREVIEW` — no setear (botón puente v2→v3 oculto en prod)
- [ ] `REACT_APP_ONBOARDING_TOURS=false` — los tours rompen UI durante rediseño
- [ ] `REACT_APP_PRIVATE_BETA_MODE=false` — gate waitlist (hoy off)
- [ ] `CEREBRO_ENABLED` (BACKEND) — dejar OFF por decisión founder; el Atlax de la ficha NO lo necesita (usa endpoint público `/api/public/buy-signal`)

**Flags NO-de-versión (no togglean superficie, no confundir):** `PRIVATE_BETA_MODE`, `ONBOARDING_TOURS`, `DMX_ENV`/`DMX_RELEASE` (Sentry), `POSTHOG_*`, `MAPBOX_TOKEN`, `WA_PROVIDER`, `LANDING_DOMAIN`.
