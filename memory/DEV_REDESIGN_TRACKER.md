# DEV · Tracker de Rediseño + Endurecimiento (LIVE)
**Fuente única de verdad del avance.** Actualizar al cerrar cada chunk. Todo LOCAL/sin commitear salvo que diga "pushed".
Última actualización: 2026-06-02.

Leyenda: ✅ hecho+verificado · 🔄 en curso · ⬜ pendiente · 🅿️ backlog (después) · ⚠️ deuda/bug

Docs hermanos: `DEV_HIDDEN_FEATURES_MAP.md` (qué está oculto) · `DEV_PHASE0_CHECKLIST.md` (receta strangler-fig) · `DEV_MODULE_WORKPLAN.md` (fases 1-4) · `feedback_warnings_clean_as_built.md` (política warnings).

═══════════════════════════════════════════════════════════════════
## WAVE · Rediseño + Endurecimiento del módulo Desarrollador
═══════════════════════════════════════════════════════════════════
Objetivo: menú claro + features ocultas surfaceadas + cero bugs/deuda + aislamiento cross-dev-org.
Patrón: strangler-fig (V2 detrás de flag `REACT_APP_DEV_V2`, conviven, se retira V1 al verificar).

───────────────────────────────────────────────────────────────────
### BATCH DEV-A · Descubrir features ocultas (Paso A) ✅ HECHO
───────────────────────────────────────────────────────────────────
- ✅ A.1 Sondeo quirúrgico 4 agentes (endpoint↔api↔componente↔nav).
- ✅ A.2 Mapa en `DEV_HIDDEN_FEATURES_MAP.md` · 6 categorías de oculto.
- Resultado: 9 pantallas fuera del menú · suite IA apagada por flag · 2 pantallas con datos falsos · 10 motores sin UI dev · 27 endpoints huérfanos · 1 link roto.

───────────────────────────────────────────────────────────────────
### BATCH DEV-B · Rediseño del sidebar / navegación (Paso B) ✅ HECHO
───────────────────────────────────────────────────────────────────
- ✅ B.1 Leer mecanismo V2 de asesor (flag + componente separado).
- ✅ B.2 `DEV_NAV_V2` en `config/navByRoleV2.js` · 9 entradas (3 directas + 6 hubs).
- ✅ B.3 `components/developer/DevSidebarV2.js` (acordeón, espejo del de asesor).
- ✅ B.4 Cableado en `PortalLayout.js` (flag `DEV_V2` + `DEV_ROLES` + branch + ancho).
- ✅ B.5 Flag `REACT_APP_DEV_V2`: ON en `.env.local` (local), OFF en `.env` (real users V1).
- ✅ B.6 Verificado en navegador (login dev, sidebar nuevo renderiza, 9 grupos).
- ✅ B.7 Rescatadas 5 pantallas varadas al menú: Embudo · Auto-asignación · Leads · Métricas asesores · Políticas de cita.
- ✅ B.9 FUSIÓN a 7 tabs (founder aprobó 2026-06-02): Mensajes→dentro CRM · Solicitudes/Disputas→Red comercial · Mini Market→Marketing(ex-Studio). Verificado en navegador: 7 secciones (Inicio·Mis Proyectos·CRM & Leads·Inteligencia·Red comercial·Marketing·Ajustes).
- ⬜ B.8 Retirar V1 (DEV_NAV viejo) — SOLO después de gates (build verde + qa_journey_dev). NO hacer aún.

───────────────────────────────────────────────────────────────────
### BATCH DEV-C · Rediseño por tab (hubs por dentro · Paso C) ⬜ PENDIENTE
───────────────────────────────────────────────────────────────────
Orden sugerido (centro primero): empezar por **Mis Proyectos**.
- ⚠️ **GIRO DE ENFOQUE (founder 2026-06-02):** rechazó 3 rediseños desde cero del Inicio/Mis Proyectos (incl. el cambio a tema CLARO `.portal-asesor` + los mockups). NUEVA regla → ver [[feedback_dev_upgrade_not_redesign]]: PARTIR del diseño ORIGINAL (oscuro, el que ya existe) y darle UPGRADES de VALOR con ML/IA/agentic/cierre-de-ciclo. NO rewrite, NO asumir tema claro. La tesis de valor `DEV_VALUE_THESIS.md` sigue válida (el QUÉ); cambia el CÓMO = incremental sobre lo existente. `MisProyectosV2.js` (tema claro) queda en pausa/posible descarte.
- 🔄 C.1 **Inicio (DesarrolladorDashboard) — 4 upgrades elegidos por founder** (sobre el diseño actual): brief→jugadas · cada número con su lectura · salud explicada · Live Pulse accionable · "que incluyan ML/IA/DL/agentic/cierre de ciclos".
    - ⚠️ **2º GIRO (founder 2026-06-02):** rechazó también el "agregar jugadas sobre el diseño oscuro" → "agregaste cosas, no cambiaste nada, el fondo sigue oscuro, se ve encimado, NO te pongas creativo, no lo haces bien." Instrucción FINAL y mínima: **deja el diseño como está · solo cambia los FONDOS (a claro) · dale upgrade a lo que ya existe · cero creatividad/rewrite.**
    - ✅ **Fondo claro en TODO el portal dev** (1 línea, sin tocar estructura): `PortalLayout.js` `<main>` ahora aplica `.portal-asesor` (tema claro aprobado del asesor) también cuando `useDevV2` (flag `REACT_APP_DEV_V2`). Real users (flag off) siguen oscuro. Verificado en app: Inicio + Mis Proyectos = MISMO diseño, fondo claro.
    - ✅ **Revertido lo creativo:** quitado `DevPlaysWidget` de DesarrolladorDashboard + quitado el gate a `MisProyectosV2` (Mis Proyectos vuelve a su diseño V1 original, ahora claro). `MisProyectosV2.js` queda huérfano (posible descarte). El endpoint `GET /api/dev/projects/plays` queda en backend (no se usa en UI por ahora).
    - ✅ **Upgrade legibilidad (lo que existe):** `WeeklyBriefWidget` "Esta semana" usaba colores hardcodeados oscuros → ahora usa tokens del tema (`var(--accent-text)`/`var(--warm)`/`var(--cream-3)`/`var(--surface-2)`) → legible en claro Y oscuro. Consola 0 · ESLint 0.
    - ✅ **Pulido de contraste/carácter (founder aprobó "claro con carácter fuerte" + "me gusta el diseño"):** Card primitive → superficie + sombra + hover · Stat → barra de acento + hover + número grande · Badge primitive → paleta SÓLIDA (texto blanco, no pastel) · hero de marca con gradiente en Inicio · números grandes con lectura · tarjetas elevadas. Verificado en app.
    - ✅ **Los 4 upgrades de VALOR cerrados (2026-06-06, Bloque 1.1):** jugadas (DevPlaysWidget, ya estaba) + **PortfolioReading.js** = "La Lectura del Portafolio" (aditivo, no rewrite): cada número con su lectura+veredicto (bien/ojo/mal) · salud explicada (qué proyectos la arrastran+por qué+link) · Live Pulse accionable (reusa live_pulse_engine, fail-open). Back: GET /api/desarrollador/portfolio-reading. Verificado en vivo (developer@demo.com). C.1 INICIO ✅.

───────────────────────────────────────────────────────────────────
### BATCH DEV-C · RONDA 2 (founder reportó tabs/vistas que faltaban: What-if/Director AI/Disputas grises + battle card sin sidebar) ✅ HECHO+VERIFICADO
───────────────────────────────────────────────────────────────────
**Causa raíz del faltante:** (1) directorios de componentes que el dev usa pero NUNCA barrí: `components/whatif·director·documents·marketplace·dev·brochure` (seguían crudos). (2) el valor oscuro `rgba(13,16,23,…)` (#0D1017) NUNCA estuvo en mi lista de conversión → quedó oscuro en TODO el dev (ProyectoDetail/Disputas/NotificationsBell/etc). (3) pasteles claros como texto (#fca5a5/#fcd34d/#86efac/#a5b4fc/#f0ebe0…) se lavaban en blanco.
- ✅ Barrido COMPLETO en los 9 dirs del dev (incl. los nunca tocados): familia oscura `rgba(13,16,23 · 6,8,15 · 13,17,28 · 8,10,18 · 15,18,28 · 14,18,32 · 13,17,24)` → `rgba(var(--bg-rgb),…)` · cream `rgba(240,235,224,…)` → `rgba(var(--cream-rgb),…)` · blanco `rgba(255,255,255,0.x)` → `rgba(var(--cream-rgb),…)`. **74 archivos.** (Todas las conversiones son theme-aware-seguras: los tokens resuelven al valor original fuera de `.portal-asesor`, así que usuarios reales y asesor no cambian salvo para mejor.)
- ✅ Pasteles-como-texto → tokens semánticos theme-aware (`var(--red/amber/green/blue/rose/theme)`). **86 archivos.** Añadí `--blue` a `:root` (oscuro #818CF8) y `--rose` a `.portal-asesor` (claro #C63FAE) para que existan en ambos.
- ✅ Cream literal `#F0EBE0` como texto (invisible en blanco) + colores dark-theme (#f59e0b/#ef4444/#ec4899…) → tokens. **28 archivos.**
- ✅ `#11151d` (dropdown SalaDeControl) → `var(--surface,…)`.
- ✅ **Battle Card de vuelta al sidebar**: era standalone (renderizaba `<div 100vh>` sin layout) → envuelta sus 5 ramas en `<DeveloperLayout user onLogout>` (sidebar + tema claro automáticos). Parse OK, 5/5 tags.
- ✅ Verificado en app (1280px, login dev): tabs Inicio **Director AI · What-if · Tu ROI Phase Y** (antes grises/negros con labels invisibles) → claros y legibles · **Disputas** stat cards claras + empty state claro · **Battle Card** con sidebar + claro. Asesor "Mis Leads" re-verificado intacto (toqué components/shared). 0 errores nuevos de consola (el único warning es pre-existente: llave duplicada en AsesorAgentsPage, flagged aparte).

───────────────────────────────────────────────────────────────────
### BATCH DEV-C · CIERRE 100% (founder 2026-06-02 tarde: "termina todo, no preguntes, completa al 100%") ✅ HECHO+VERIFICADO
───────────────────────────────────────────────────────────────────
Sweep exhaustivo de consistencia visual en TODO el portal dev (tema claro + carácter fuerte). Todo LOCAL.
- ✅ **Fondos oscuros hardcodeados → flip seguro** (`var(--token, fallback)`; tokens NO existen en `:root` oscuro → usuarios reales intactos): 36 `background:'#0D1118/#0E1220/#0b0e18/#06080F/...'` + 7 hex Tailwind `bg-[#0f1320/#0d1022]` en KPIStrip/SmartWizard/LoadingState/InlineEditField/FloatingQuickActions/EntityCard.
- ✅ **KPIStrip** (cajas oscuras en CADA ficha de proyecto) → blanco. Raíz del bug "cajas negras" reportado.
- ✅ **Botones invertidos rotos** (`bg-[var(--cream)] text-[var(--navy)]`, `--navy` indefinido en TODO el repo) → botón primario de marca `bg-[var(--theme)] text-white` (10 sitios) + toggle NuevoProyecto.
- ✅ **Badges SÓLIDOS** (texto blanco, no pastel): estados de unidad (VentasTab/UnitDrawerContent) · etapa proyecto (ProyectoDetail) · usuarios · alianzas (CrossPartnerships) · brokers (ComercializaciónTab) · citas · disputas (toast) · CRM kanban · avance de obra · métricas equipo · severidad diagnóstico (oscurecida).
- ✅ **Semánticos dev legacy en tema claro** (`--red/--amber/--green/--blue` existían en `:root` oscuro pero NO en `.portal-asesor` → heredaban brillante): añadidos con contraste sobre blanco (#DC2626/#C77F12/#1FA06A/#2563EB).
- ✅ **NewCitaModal** (modal con gradiente oscuro `#0D1118→#111827`) → `var(--surface,…)` (blanco en claro) + texto error rojo legible.
- ✅ **Battle Card** (era página STANDALONE oscura fuera de PortalLayout, no recibía tema): tokenizada (`#06080F→var(--bg)`, `#F0EBE0→var(--cream)`, pastel→sólido) + `className="portal-asesor"` en sus 5 ramas → ahora CLARA y consistente. Verificado (estados vacío/insuficiente claros).
- ✅ **Mapbox** (Demanda): mapa estilo claro, polígonos morados, heatmap OK (paint con rgba literal, no var → no crashea).
- ✅ **Auditoría de tokens limpia**: todo token que dev usa y está en `:root` también está en claro, salvo `--frame-*` (barra lateral oscura INTENCIONAL, igual que asesor) · `--r-*` (radios, sin color) · `--rose/--sh-*/--focus-ring` (sin uso en dev).
- ✅ **Chrome oscuro + contenido claro** = patrón deliberado (espejo exacto del módulo asesor "Mis Leads" que el founder aprobó como gold standard).
- ✅ **Verificado en app real** (login dev, 1280px): Inicio · Mis Proyectos · ProyectoDetail (Ventas/Insights/header) · CRM · Usuarios · Competidores · Reportes · Battle Card · Demanda · Inventario→Proyectos. **0 errores de consola · 0 cajas oscuras en `main` (detector automático).**
- Pendiente menor (NO bloquea): full chart-view de Battle Card requiere ≥3 competidores (solo 2 seedeados local) → no verificable local, pero colores mid-sat sirven en claro. Micro-vida (count-up/skeletons) y focus-ring a11y = enhancements futuros, fuera del rediseño.
    - 📌 LECCIÓN: no rediseñar ni agregar; cambiar fondos + pulir lo existente. Ver [[feedback_dev_upgrade_not_redesign]].
  - ⚠️ **3er GIRO (founder 2026-06-02):** "no estés parchando, analiza el repo y haz el rediseño bien hecho" + battle-card roto + colores aún mal. ANÁLISIS: el portal dev se construyó para OSCURO con **~914 colores escritos a mano** (`rgba(240,235,224,…)` crema 638 · `rgba(255,255,255,0.X)` 223 · fondos oscuros 53) en 22+ páginas → por eso el flip a claro rompía todo y parchar 1×1 era inviable.
    - ✅ **FIX DE RAÍZ (founder aprobó "hazlo de raíz"):** 2 tokens nuevos — `--cream-rgb` (oscuro `240,235,224` / claro `30,34,48`) y `--bg-rgb` (oscuro `6,8,15` / claro `241,242,246`) en index.css + asesor-aurora.css. Reemplazo sistemático (sed) en `pages/developer` + `components/developer`: `rgba(240,235,224,` y `rgba(255,255,255,0.` → `rgba(var(--cream-rgb),` (861) · `rgba(6,8,15,`/`rgba(13,17,24,` → `rgba(var(--bg-rgb),` (53). **0 hardcodeados restantes** → TODO el portal voltea claro/oscuro solo. Compila + consola 0. Verificado en app: Inicio + Mis Proyectos limpios en claro.
    - ✅ **battle-card:** crash del mapa (Mapbox no parsea `rgba(var(--theme-rgb))` → literal `rgba(109,74,255,…)` en `DemandHeatmapMap`) + ruta sin proyecto ya no gira (estado "Elige un proyecto"). Es página oscura standalone (no usa el layout · bg #06080F hardcodeado intencional).
    - ✅ **Botones/pills invertidos** (`background: var(--cream)` = oscuro en claro) arreglados en Mis Proyectos (Nuevo proyecto + filtro activo + barra progreso → `var(--grad)`). Quedan ~4 botones más (AmenidadesTab/ComercializacionTab/DiagnosticReportContent) + ~11 hex oscuros (#06080F…) en páginas no abiertas → ajustar al verificar cada página (1-2 colores c/u, ya NO 570).
    - 📌 PATRÓN para nuevas páginas: usar SIEMPRE `var(--cream)`/`rgba(var(--cream-rgb),…)`/`var(--surface)`/`var(--grad)`, NUNCA colores crema/blancos/oscuros hardcodeados. Botón primario = `var(--grad)` + `#fff`.
  - ⚠️ **4º GIRO (founder 2026-06-02):** "¿esto es clase mundial? brutalmente honesto" → NO. El flip era legible pero PLANO (sin sombra/profundidad, bajo contraste, sin hover, sin bordes definidos). Diagnóstico: el primitivo `Card` (advisor/primitives) usaba `background: rgba(255,255,255,0.03)` + SIN sombra → todo plano. Mis Leads brilla por `.asr-premium` (superficie sólida + sombra + hover + borde).
    - ✅ **NIVEL MIS LEADS (founder aprobó "sí"):** (1) `Card` primitive → `background: var(--surface, <fallback>)` + `boxShadow: var(--asr-shadow, none)` + prop `hover` (clase asr-premium) → TODAS las tarjetas dev ganan superficie sólida + sombra + borde nítido en claro; oscuro INTACTO (fallback). Stat usa Card → todos los KPIs elevados. (2) Brief "Esta semana" rediseñado: jerarquía fuerte, sin espacio muerto, 3 KPI tiles blancos nítidos (borde+sombra+tendencia), acción = botón gradiente real. (3) SetupChecklist: filas con borde+sombra+HOVER (lift+borde aurora). Verificado en app: Inicio se ve elevado/con contraste/jerarquía (nivel Mis Leads). Consola 0 · ESLint 0.
    - ⬜ Si founder aprueba el nivel → replicar el mismo tratamiento (Card elevado + hover + jerarquía + botones gradiente) en Mis Proyectos cards, ProyectoDetail y demás. El Card primitive ya las eleva; falta jerarquía/hover/botones por página.
  - ⚠️ **5º GIRO (founder 2026-06-02):** "muy frágil/suave/apagado · letras se pierden · dale vida, dopaminico" → eligió **"Claro con carácter fuerte"** (fondo claro + contraste real + hero de marca + badges sólidos + bordes/sombras marcados).
    - ✅ **HERO de marca sólido** (brief "Esta semana" = bloque morado gradiente con texto blanco, KPI tiles blancos que resaltan, botón blanco). Ancla de color/personalidad.
    - ✅ **Contraste de raíz:** en `.portal-asesor` oscurecí `--cream-2` (#5A6172→#434A5C) y `--cream-3` (#969CAB→#6B7385) → etiquetas dejan de "perderse" en TODO el tema claro.
    - ✅ **Badges SÓLIDOS + texto blanco** (Badge primitive · PREVENTA morado / EN CONSTRUCCIÓN ámbar / etc.) — el nombre ya no se pierde dentro del globo.
    - ✅ **Dinero compacto** ($778.7M/$1.09B, no se desborda) · **stats 4×2 sin huérfano** · **Stat con barra de acento + hover + borde-2** · valores de color por significado.
    - ✅ **Container "Desarrollos activos" en plata** (var(--surface-2)) → las tarjetas blancas de dev RESALTAN (+hover lift).
    - ✅ **Fix de raíz extendido a `components/shared/`** (320 colores crema → tokens · ActivityFeed/etc. eran invisibles en claro porque no estaban en el sed inicial). "Actividad reciente" ya legible.
    - ⬜ Pendiente menor: cajas "Sugerencias/Alertas" siguen en gradiente pálido → subir a sólido. Luego replicar TODO el sistema a Mis Proyectos + resto.
    - ✅ C.1.0 **Lista de proyectos V2 = CENTRO DE MANDO** (`MisProyectosV2.js`) HECHA+VERIFICADA en app real (2 iteraciones · founder "no me encanta" → upgrade al EJE "ojos del dev/qué mueve la aguja"). Tema CLARO aurora (.portal-asesor). **Centro de mando** con lo que un dev necesita para DECIDIR (de datos REALES de list-with-stats): **Dinero del portafolio** (por cobrar vs cobrado, hero) · Colocado% · **Ritmo total/sem** + conversión · Leads · **Necesitan acción**. **Cards ricas por proyecto**: $ por cobrar · % colocado · **ritmo de venta con SPARKLINE (weekly_sales)** · **meses para agotar** (derivado) · leads + conversión · salud. Orden por ritmo/colocado/salud/atención. **Upgrade que cierra ciclo**: franja "Tu asistente sugiere" = el proyecto que más frena el portafolio + "Ver qué hacer". Detrás de `REACT_APP_DEV_V2` (gate en MisProyectos.js → V1 fallback). Centro de mando calculado de los MISMOS proyectos visibles (coherente · NO del /dashboard global que trae 18). Bug resuelto: V2 debía pasar `user`/`onLogout` a DeveloperLayout (si no rebota a /?login=1). Consola 0 · ESLint 0. EJE persistido en `DEV_PASO_C_DESIGN_DOCTRINE.md` (catálogo de métricas que mueven la aguja del dev).
    - ⬜ C.1.1 **Detalle de proyecto V2** → DECISIÓN FOUNDER (2026-06-02): consolidar las 13 superficies actuales (8 tabs + 5 páginas sueltas: legajo/ie/crm/pricing-lab/cash-flow) en **4 pestañas**: RESUMEN (salud+IA+acciones) · EL PRODUCTO (contenido+amenidades+ubicación+avance+legal/legajo) · VENTAS Y PRECIOS (inventario+precios/pricing-lab+cash-flow) · COMERCIALIZACIÓN Y MERCADO (landing+CRM del proyecto+demanda/ie+insights). `ProyectoDetailV2.js` detrás del flag.
    - Tabs/páginas actuales (a absorber): VentasTab·ContenidoTab·AvanceObraTab·GeolocalizacionTab·AmenidadesTab·LegalTab·ComercializacionTab·InsightsTab + páginas /desarrollos/:slug/{legajo,ie,crm,pricing-lab,cash-flow}.
    - ⬜ C.1.a cablear motor REAL en Demanda (hoy `random.Random(1729)` en dev_batch2:199 → `forecast_engine`). ⚠️ dato falso.
    - ⬜ C.1.b arreglar link roto Cash Flow (`InsightsCashFlow.js` → ruta inexistente, 404). ⚠️ bug.
    - ⬜ C.1.c per-unit: usar AVM/FSD reales en vez de "adivinanza" LLM (dev_batch11:566).
- ⬜ C.2 **CRM & Leads** hub → Embudo+Sankey · Leads · Auto-asignación · IA del lead (montar suite agéntica).
- ⬜ C.3 **Inteligencia** hub → Demanda · Precios · Competidores · Battle Card · Reportes + nuevos (What-if · Comparador · Inversión · Pulso).
- ⬜ C.4 **Red comercial** hub → Asesores · Equipo · Métricas · Alianzas.
- ⬜ C.5 **Operación** hub → Solicitudes · Disputas · Mini Market (decidir exponer/esconder).
- ⬜ C.6 **Studio** hub (6 herramientas) + **Ajustes** hub.
> Regla por tab: misma API (contrato intacto) + cero warnings al cerrar + cablear motor real / surfacear endpoint huérfano que aplique.
> **Diseño = IDÉNTICO a asesor/Mis Leads (founder 2026-06-02):** REUSAR componentes `components/asesor/design/` (ActionBar · ViewToggle · StatusDot · ScoreBar · Ficha360) · tema CLARO (`frame-light`) · eyebrow + pills aurora para tabs (patrón `MisLeadsPage.js`) · estética DMX (aurora #6366F1→#EC4899, glassmorphism), NO el azul de EB. Patrones EB (`EASYBROKER_UX_PATTERNS.md`): mismo esqueleto cada pantalla, contadores, 1 CTA primario, copy humano.
> **Construcción C.1 (Mis Proyectos):** strangler-fig — `MisProyectosV2.js` detrás de `REACT_APP_DEV_V2`, mismo endpoint `listProjectsWithStats` (contrato intacto), tema claro local. ProyectoDetail = hub de pestañas estilo MisLeadsPage. Migración incremental (tema claro por página, no flip global que rompería las ~30 pantallas no rediseñadas).

───────────────────────────────────────────────────────────────────
### BATCH DEV-FIX · Bugs sueltos (limpiando al avanzar) — en curso
───────────────────────────────────────────────────────────────────
- ✅ FIX.1 "Pulppo" eliminado del código (8 lugares front+back · 0 referencias).
- ✅ FIX.2 Bug modal/tour "pantalla congelada" ELIMINADO (3 capas: auto-tour OFF flag `REACT_APP_ONBOARDING_TOURS` + filtro de pasos a target existente + limpieza de overlay huérfano). Verificado: 0 overlay.
- ✅ FIX.3 Consola navegador limpia: Sentry DSN inválido (guard en `observability.js`) + 2 React Router future-flags (en `BrowserRouter`). 0 errores / 0 warnings.
- ✅ FIX.4 Acceso dev local: `developer@demo.com` / `localdev` (rol developer_admin).
- 🅿️ FIX.5 Revivir tour de onboarding con anchors estables / walkthrough propio sin react-joyride — DESPUÉS del rediseño (flag `REACT_APP_ONBOARDING_TOURS=true`).

───────────────────────────────────────────────────────────────────
### BATCHES DEV-F1..F4 · Endurecimiento (después del rediseño) 🅿️ BACKLOG
───────────────────────────────────────────────────────────────────
Ver `DEV_MODULE_WORKPLAN.md`. Foco #1 = **aislamiento cross-dev-org**.
- 🅿️ F1 Auditoría de arquitectura (flujos + cables rotos + huérfanos).
- 🅿️ F2 Auditoría de producción (8 familias · IDOR cross-dev-org el más crítico).
- 🅿️ F3 Reparación por patrones (mucho heredado de asesor).
- 🅿️ F4 QA (7 olas + "día del desarrollador" qa_journey_dev).

───────────────────────────────────────────────────────────────────
### SETUP transversal
───────────────────────────────────────────────────────────────────
- ✅ Tema claro del portal dev = reusa `.portal-asesor` (tokens del asesor) en `<main>` cuando `REACT_APP_DEV_V2`. NO se creó `.portal-dev` aparte (fuente única). Contenido claro + chrome oscuro (igual que asesor). Real users (flag off) = oscuro V1.
- ⬜ Candado `check-dev-theme.sh` (opcional · análogo a `check-asesor-theme.sh`).
- ⬜ Commit + push (cuando founder diga · hoy TODO local sin commitear).

═══════════════════════════════════════════════════════════════════
## BACKLOG · Features ocultas a surfacear (del DEV_HIDDEN_FEATURES_MAP) 🅿️
═══════════════════════════════════════════════════════════════════
Se irán enganchando dentro del tab que corresponda en Batch DEV-C (no como features huérfanas).
- 🅿️ Suite IA agéntica (flag `agentic_enabled=False`): DISC · ruteo · dossier visita · bandeja respuestas · nurture · match weights · argumentario → montar paneles en portal dev (hoy solo en asesor/director). Va en C.2.
- 🅿️ Motores sin UI dev: forecast real, AVM/FSD, score inversión+simulador, what-if, comparador, live pulse, tax, construction cost, cross-sell, narrative scope=project|unit. Van en C.1/C.3.
- 🅿️ 27 endpoints huérfanos: atribución multi-touch · mitad-visitante de experimentos A/B (Pricing Lab sale vacío sin esto) · run-history de agentes · auto-assign citas · adjustForecast. Enganchar en su tab.
- ⚠️ Limpieza (borrar, no surfacear): ~7 endpoints muertos (alias kanban, kanban-unified, patch_asset_role_alias, presentation-mode PATCH, cross-portal/sync-check).
- 🅿️ 3 pantallas orphan por `<Navigate>` (Inventario/Citas/CalendarioSubidas): decidir exponer o borrar en C.

═══════════════════════════════════════════════════════════════════
## WARNINGS (política: limpiar al avanzar · ver feedback_warnings_clean_as_built)
═══════════════════════════════════════════════════════════════════
- Estado app: **284 warnings únicos / 150 archivos** (214 no-unused-vars · 51 hooks/exhaustive-deps · 8 anon-export · 3 a11y). Pre-existentes, solo terminal.
- ✅ Consola navegador (lo que el founder ve): 0/0.
- ✅ Código nuevo de esta wave: 0 warnings (DevSidebarV2, navByRoleV2, useTour, TourLauncher, observability, App.js).
- Regla: cada módulo de Batch DEV-C queda sin warnings al cerrarlo. NO barrido masivo.
