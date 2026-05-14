# Rediseño Aurora · Portal Superadmin · Notas técnicas

**Inicio**: 2026-05-14
**Estado**: 🟡 in-progress · pre-commit local · validación founder en curso
**Scope**: SOLO `/superadmin/*` · cero impacto otros portales

---

## Decisión arquitectónica clave

### Por qué solo superadmin (y no migrar todos los portales)
Risk-controlled rollout: el founder valida visualmente superadmin primero. Si el design system
gusta, se extiende a `/asesor`, `/desarrollador`, `/inmobiliaria`, `/comprador`, `/landing`
gradualmente. Si NO gusta, rollback es 1 archivo CSS + 1 wrapper.

### Por qué NO crear un doc canónico de "design system rules"
Evaluado y descartado:
- Emergent ignora docs largos · prefiere prompts textuales
- Doble fuente de verdad (código vs MD) = bug factory
- La protección ya está en el código: scoping CSS `.portal-superadmin` + `--theme` default
  indigo en `:root` (componentes shared resuelven a indigo automáticamente en otros portales)
- Cada prompt a emergent lleva 3 líneas de alcance explícito · más enforce-able

---

## Stack del rediseño

### Archivos creados/modificados

**Nuevos:**
- `frontend/src/styles/superadmin-aurora.css` (~400 líneas · paleta + auroras + cards + hover + scroll)
- `scripts/dmx_design_system.reference.css` (1338 líneas · doc canónico de referencia · gitignored)

**Modificados (estructura):**
- `frontend/src/components/superadmin/SuperadminLayout.js` (wrapper `.portal-superadmin` +
  `data-section` derivado de URL + body class sync + bug scroll fix preparado en PortalLayout)
- `frontend/src/components/shared/PortalLayout.js` (NavTier con `data-section-key` + scroll
  preservation via sessionStorage)
- `frontend/src/config/navByRole.js` (`SUPERADMIN_NAV` reorganizado de 2 tiers → 7 secciones
  con `section_key`)
- `frontend/src/index.css` (define `--theme`, `--theme-rgb`, `--theme-2`, `--theme-3` con
  defaults indigo en `:root` · `--grad` reescrito como `linear-gradient(var(--theme),
  var(--theme-3))`)
- `frontend/src/index.js` (import `superadmin-aurora.css`)

**5 páginas envueltas en SuperadminLayout** (antes usaban PortalLayout directo o `<div>` solo):
- `pages/superadmin/PrimitivesDemo.js`
- `pages/superadmin/SuperadminInvites.js`
- `pages/superadmin/SuperadminNewsletter.js`
- `pages/superadmin/SuperadminOnboardingAnalytics.js`
- `pages/superadmin/SuperadminWhatsApp.js`

**Sweep masivo** (~70-100 archivos):
- Hex variantes indigo/purple/pink: `#6366F1`, `#818CF8`, `#EC4899`, `#a5b4fc`, `#c7d2fe`,
  `#7c3aed`, `#9333ea`, `#a855f7`, `#8b5cf6`, `#d946ef`, `#fce7f3`, `#fbcfe8` → `var(--theme)`
- RGBAs: `rgba(99,102,241,X)`, `rgba(236,72,153,X)`, `rgba(124,47,255,X)`, `rgba(217,70,239,X)`
  → `rgba(var(--theme-rgb), X)` (preservando alpha)
- Gradients `linear-gradient(...,#6366F1,...,#EC4899,...)` → `linear-gradient(..., var(--theme),
  var(--theme-3))`
- Labels gris oscuro `rgba(240,235,224, 0.40-0.50)` → `0.68-0.72` (legibilidad)
- Scope: `frontend/src/components/superadmin/*` + `frontend/src/components/documents/*` +
  `frontend/src/components/shared/*` + `frontend/src/components/agentic_crm/*` +
  `frontend/src/components/director/*` + `frontend/src/pages/superadmin/*`
- Preservados: verdes success, rojos error, amarillos warning, blancos, grises bg

---

## Paleta por sección (FUENTE DE VERDAD)

```
PRINCIPAL    rosa    #ff2e7e · 255, 46, 126   → /superadmin · /superadmin/tenants
DATOS        cyan    #00E5FF · 0, 229, 255    → /superadmin/{bulk-ingest|data-sources|drive|
                                                  documents|data-lake|metrics-cube}
INTELIGENCIA morado  #7c2fff · 124, 47, 255   → /superadmin/{scores|drpi|risk-score|
                                                  investment-explorer|intelligence-hub|trends|
                                                  phase5-foundation|transactions}
OPERACIÓN    naranja #FFA040 · 255, 160, 64   → /superadmin/{health|observability|
                                                  phase-y-observability|audit-log|fraud-alerts|
                                                  risk-alerts|compliance}
MONETIZACIÓN verde   #5BE235 · 91, 226, 53    → /superadmin/{ai-cost|commercial|api-keys|
                                                  vertical-products|data-licensing|cross-sell-*}
CRECIMIENTO  teal    #14B8A6 · 20, 184, 166   → /superadmin/{whatsapp|newsletter|bulletins|
                                                  landing-leads|partners|onboarding-analytics}
DEV TOOLS    morado  #7c2fff · 124, 47, 255   → /superadmin/primitives-demo
```

Mapeo URL→sección vive en `sectionFromPath()` de SuperadminLayout.js. Si se agrega ruta nueva,
actualizar ahí + en `superadmin-aurora.css` si requiere data-section custom.

---

## Cómo funciona el theming dinámico

1. **URL change** → React Router actualiza `loc.pathname`
2. **`sectionFromPath(loc.pathname)`** retorna sección actual (ej. `'datos'`)
3. **Wrapper `<div className="portal-superadmin" data-section={section}>`** envuelve el portal
4. **CSS `[data-section="datos"]`** override `--theme: #00E5FF; --theme-rgb: 0, 229, 255;`
5. **Cascade**: TODOS los descendientes que usan `var(--theme)` o `rgba(var(--theme-rgb), X)`
   se actualizan automáticamente (cards · botones · iconos · auroras · cursor)
6. **Cursor**: `useEffect` agrega `body.superadmin-active[data-superadmin-section="X"]` para que
   `.cursor-dot`/`.cursor-ring`/`.cursor-glow` (position: fixed fuera del wrapper) también hereden

---

## Cómo se protege a otros portales (no leak)

1. **CSS scoping**: TODAS las reglas en `superadmin-aurora.css` comienzan con
   `.portal-superadmin` (selector descendant) o `body.superadmin-active` (cursor)
2. **`--theme` default indigo en `:root`**: cuando un componente shared resuelve `var(--theme)`
   fuera de `.portal-superadmin`, obtiene `#6366F1` (indigo) · IDÉNTICO al hex hardcoded
   original · cero cambio visual
3. **5 portales no tienen wrapper** (no se crearon `.portal-asesor` etc.): cero risk de
   activación accidental
4. **Body class cleanup**: `useEffect` quita `superadmin-active` al desmontar SuperadminLayout

---

## Avances · qué se hizo (timeline)

| Fecha | Lo que se hizo | Resultado |
|---|---|---|
| 2026-05-14 | Análisis design doc canónico + arquitectura | Identificadas 7 secciones · paleta · scoping strategy |
| 2026-05-14 | Batch 1-3 V2 wrapper aislado (carpeta `superadmin-v2/`) | DESCARTADO por founder · prefería respetar estructura original |
| 2026-05-14 | Rollback completo a SHA 5092ee5 | Limpio · sin archivos huérfanos |
| 2026-05-14 | Reskin via CSS aurora + sectionFromPath + 3 componentes shared | Marco aurora funcional pero cards seguían morados |
| 2026-05-14 | Sweep masivo colores hardcoded en components/superadmin/* | 35 archivos tokenizados |
| 2026-05-14 | Reorganización sidebar 2→7 secciones (navByRole.js) | Categorías con color en labels |
| 2026-05-14 | Auroras hardcoded → var(--theme-rgb) dinámico | Auroras cambian por sección |
| 2026-05-14 | Sweep ampliado 12 hex variantes en pages+components+shared | 70+ archivos · cero morado fuera de tema |
| 2026-05-14 | --grad reescrito + 5 páginas envueltas + body cursor sync | Botones · cursor · sidebars correctos |
| 2026-05-14 | Hover universal · ampliar selector Tailwind rounded-* | Pending Opción A |

---

## Decisiones técnicas controvertidas (con justificación)

### 1. Por qué Opción A (paquete amplio) y NO Opción B (clase única `.dmx-card`)
Analizado con founder · ver chat 2026-05-14. Resumen:
- Emergent genera código nuevo continuamente (Phase 5 va a meter cientos de cards más)
- B requiere que emergent agregue `.dmx-card` manualmente · NO lo va a hacer
- A funciona automáticamente con cualquier card nueva (selector amplio agarra inline + Tailwind)
- Cost de A: ajustar selector si aparece edge case (avatars circulares, modals)
- Recomendación master: A ahora · `.dmx-card--variant` modifiers SOLO para cards "especiales"
  (alert · success · risk) cuando se necesiten

### 2. Por qué cursor sync via body class (no via component prop)
Cursor es `position: fixed` · vive fuera del wrapper `.portal-superadmin`. CSS descendant
selector no llega. Alternativas:
- ❌ Mover cursor dentro del wrapper · romperia z-index global
- ❌ Pasar `theme` via context · sobrekill para cosmética
- ✅ Body class + data-attribute · 1 useEffect + 7 reglas CSS · cero invasivo

### 3. Por qué `:root` define `--theme` con default indigo
Permite que TODOS los componentes (incluso fuera de superadmin) usen `var(--theme)`. En portales
sin wrapper, resuelve a indigo (idéntico al hardcoded original). En superadmin, override dinámico.
Cero risk de leak · cero risk de "undefined CSS variable" rompiendo otro portal.

---

## Tasks pendientes (post-validación founder)

1. **Aprobación final founder** del rediseño superadmin (visual)
2. **Commit local** del rediseño (NO push hasta confirmar)
3. **Cleanup deuda técnica** del sweep:
   - Algunos `var(--theme)` en pages/superadmin pueden tener variantes inline duplicadas
   - Revisar si quedó `--grad` hardcoded en algún CSS adicional
4. **Migration a otros portales** (decisión founder):
   - Opción 1: portales individuales con sus colores (asesor=rosa, dev=morado, etc) según doc
     canónico
   - Opción 2: mantener legacy en otros · solo superadmin tiene aurora
5. **Refactor `.dmx-card` modifiers** (opcional · si aparecen edge cases en producción)

---

## Reglas de oro · si emergent toca superadmin

3 líneas obligatorias al inicio de CADA prompt a emergent que toque superadmin:

```
ALCANCE: [archivos exactos]
NO TOCAR: frontend/src/styles/superadmin-aurora.css · sectionFromPath en SuperadminLayout.js
Si requieres color por sección, usa var(--theme) y rgba(var(--theme-rgb), X) · ya definidos.
```

Si emergent toca SOLO otros portales (NO superadmin), no necesita reglas extra · el sistema
está aislado por scoping CSS.

---

## Rollback completo (si el rediseño se descarta)

```bash
git checkout -- frontend/src/components/superadmin/SuperadminLayout.js \
                frontend/src/components/shared/PortalLayout.js \
                frontend/src/config/navByRole.js \
                frontend/src/index.css \
                frontend/src/index.js
rm frontend/src/styles/superadmin-aurora.css

# Y rollback del sweep masivo (~70 archivos):
git checkout -- frontend/src/components/ frontend/src/pages/superadmin/
```

Esto restaura el estado pre-rediseño exacto (SHA 5092ee5).
