# Rediseño Asesor · PLAN INTEGRADO (diseño + features + IA)

> 2026-05-29 · Aprobado por founder ("me gusta el plan"). Fusiona: rediseño original (ASESOR_REDESIGN_APPROVED.md) + simplicidad EB (EASYBROKER_UX_PATTERNS.md) + features priorizadas (EASYBROKER_TEARDOWN_ANALYSIS.md). Frontend-first; backend solo additive donde una pantalla nueva lo requiera. NO eliminar features (salvo SOC del nav). Protocolo quirúrgico + tags rollback + audit doble por fase.

## Fórmula
**Facilidad de EasyBroker (comportamiento) + Estética DMX (aurora/premium) + Features que DMX ya tiene pero no se ven + Co-piloto IA.** El co-piloto es ADITIVO: la UI manual es la base, el co-piloto acelera. Cero features perdidas.

## FASES

### F0 · Sistema de Diseño asesor (la base — se construye una vez, se reusa en todo)
DMX style (aurora #6366F1→#EC4899, cards premium, glassmorphism, tipografía DMX, microcopy es-MX) materializado en componentes que encarnan los 10 patrones de facilidad de EB:
- `<ActionBar>` (idéntica en cada pantalla: +Agregar · Buscar · Filtros · Toggle vista · Ordenar)
- `<ViewToggle>` (Lista | Pipeline, misma data)
- `<StatusDot>` + paleta semántica de estatus
- `<ScoreBar>` (score con gradiente + tooltip "qué tan listo 0-100")
- `<QuickActions>` (📞 + 💬 universales)
- `<PremiumCard>` (profundidad/sombra, pill temperatura)
- `<Ficha360>` (2 columnas: datos+tabs / acciones)
- Jerarquía CTA (1 primario aurora, resto neutro), contadores en todo, lenguaje humano.
- Inspiración (NO copia) del superadmin design system; asesor tiene el suyo.

### F1 · Leads piloto (sobre F0) + Ola 1 de features
Prueba el sistema en la pantalla que más molesta al founder. Incluye:
- **Pipeline kanban + Foco IA (franja) + cards premium + drawer 360°** (diseño aprobado).
- **Lead score VISIBLE y explicado** ("por qué está caliente") — surface de buyer_score/close_probability.
- **Estatus de leads personalizables** (nombre/color/posición) + **tabla con columnas configurables / vistas guardadas**.
- **Tablero de propiedades por contacto** — lista con nombre ligada al contacto, kanban donde cada propiedad tiene estatus (contactada/esperando/rechazada/cita/visitada/descartada); fit_engine auto-sugiere y rankea.
- **Link Tinder para el cliente** — UN link, swipe 👍/👎 sobre todo el tablero, búsqueda MLS embebida (sin salir de DMX), cada swipe → estatus + señal a lead score (reusa marketplace_search/map, fit_engine, buyer_score, behavioral_tracking, share_meta).
- **Auto-armar tablero desde la conversación** + **aviso inteligente al swipe** (micro-upgrades).
- **Onboarding/tours** que explican qué es/hace/beneficio de cada parte (la queja del founder).
- Backend additive: colección tablero+estatus por propiedad, endpoints público link Tinder + captura de swipes.

### F2 · Co-piloto del asesor (capa aditiva — convive con lo manual)
Unifica copilot.py + asistente_engine + voice + conversation_engine en UN asistente que opera el módulo por chat/voz: "qué hago hoy", "muéstrame leads calientes", "agenda cita", "manda el tablero a Juan", "arma tablero para Ana 2rec Roma <6M". La UI manual SIEMPRE funciona; el co-piloto es atajo. Ni EB ni Pulppo lo tienen.

### F3 · Replicar el diseño a los otros 6 grupos
Mismo Sistema de Diseño (F0) aplicado a: Agenda · Inventario · IA & Automatización · Marketing · Mi Negocio · Configuración. Consistencia = facilidad.

### Olas posteriores (batches después del rediseño)
- **Ola 2 (surfacing inteligencia):** AVM/zona/forecast visible en ficha · oportunidades de captación (brecha oferta-demanda) · ROI por canal · recomendación automática al tablero.
- **Ola 3 (paridad/distribución):** panel estado por portal · feedback de visita estructurado · inbox directas/compartidas + permisos equipo · multi-idioma EN/PT · pipeline de cierre en Operaciones.

## INVARIANTES
- Backend NO se mueve de forma destructiva (additive only). NO eliminar features (salvo SOC del nav). Tenant isolation. Aurora var(--theme-*) no hex. Superadmin design system solo inspiración. Protocolo quirúrgico (3 roles · 4 pasadas) + tag rollback por fase (pre-asesor-fN) + audit doble-pase + 2do recheck independiente. emergent obsoleto → merge directo a main.

## F0 · HALLAZGOS TÉCNICOS (2026-05-29 · para construir consistente)
- **Arquitectura de estilos:** Tailwind (utility classes inline en JSX) + tokens CSS-var. NO hay un CSS de componentes; los componentes se arman en JSX. → F0 = **librería de componentes React** (no un .css).
- **Tokens (index.css :root):** `--cream #F0EBE0` (+ -2/-3 dimmed), `--indigo #6366F1`, `--theme #6366F1` (+ `--theme-2 #818CF8`, `--theme-3 #EC4899`, `--theme-rgb 99,102,241`), `--grad: linear-gradient(90deg, var(--theme), var(--theme-3))` (= aurora indigo→pink), `--navy`. Usar SIEMPRE `var(--theme*)`/`var(--grad)` (theme-aware), nunca hex.
- **Scoping:** superadmin sobreescribe `--theme` en su scope `.portal-superadmin` (rosa) + per-section. El asesor usa el aurora indigo por defecto → **no se duplica nada, solo se reusan tokens.** styles aplicados: index.css, App.css, styles/{a11y,density,superadmin-aurora}.css.
- **Reference existente:** scripts/dmx_design_system.reference.css (v2, 51KB) documenta botones/cards/sidebar/KPI/pills/glassmorphism — vocabulario visual ya definido, F0 no parte de cero.
- **NO-ORPHAN:** los componentes F0 se construyen Y se usan de inmediato en F1 (Leads) — NO se hace una librería suelta sin callsite. F0+F1 (primera pantalla) van juntos.
- **Safety:** tag `pre-asesor-f0` creado en c82adf3a.

## ORDEN DE EJECUCIÓN
F0 (base) → F1 (Leads + Ola 1) → F2 (co-piloto) → F3 (replicar) → Ola 2 → Ola 3.
Siguiente paso inmediato: **construir F0 componentes + aplicarlos en F1 Leads (juntos, sin huérfanos).**
