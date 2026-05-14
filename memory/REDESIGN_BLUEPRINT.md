# DMX · Aurora Design System Blueprint

**Versión**: 1.0 · 2026-05-14
**Estado**: Implementado y validado en `/superadmin/*`
**Propósito**: Documento de referencia para extender el diseño a `/asesor`, `/desarrollador`,
`/inmobiliaria`, `/comprador`, `/landing` cuando founder lo apruebe.

---

## 1 · Filosofía del diseño

**Estética**: aurora elegante sobre fondo dark · inspirado en `retomotiongraphics.com` (Viegas Estudio).
**Principios**:
- Color por contexto · cada zona del portal "respira" su propio matiz
- Auroras ambientales sutiles (NO manchas · NO neón)
- Cards "flotando" con bordes muy delgados que se intensifican al hover
- Cero ruido visual · todo elemento aporta significado
- Glassmorphism en topbar/sidebar (blur + transparencia)
- Tipografía expresiva (display Outfit, body DM Sans)
- Transiciones suaves (0.18-0.22s ease)

---

## 2 · Paleta cromática por sección

7 secciones · cada una con su color identitario:

| Sección | Hex | RGB | Donde aplica |
|---|---|---|---|
| **PRINCIPAL** | `#ff2e7e` | 255, 46, 126 | Inicio · Clientes (rosa) |
| **DATOS** | `#00E5FF` | 0, 229, 255 | Ingesta · Conectores · Drive · Documentos · Data Lake · Cubo (cyan) |
| **INTELIGENCIA** | `#7c2fff` | 124, 47, 255 | Scores · DRPI · Risk · Investment · Intel Hub · Trends · Phase5 · Transactions (morado) |
| **OPERACIÓN** | `#FFA040` | 255, 160, 64 | Health · Observabilidad · Phase Y · Auditoría · Fraud · Risk Alerts · Compliance (naranja brillante) |
| **MONETIZACIÓN** | `#5BE235` | 91, 226, 53 | AI Cost · Comercial · API Keys · Productos · Licensing · Cross-sell (verde lima) |
| **CRECIMIENTO** | `#14B8A6` | 20, 184, 166 | WhatsApp · Newsletter · Boletines · Landing leads · Partners · Tours (teal) |
| **DEV TOOLS** | `#7c2fff` | 124, 47, 255 | UI Primitivas (morado) |

**Variables CSS por sección**:
```
--theme       (color base)
--theme-rgb   (mismo color en formato r, g, b para rgba)
--theme-2     (variante clara · para gradients)
--theme-3     (variante secundaria · para gradients)
--theme-text  (texto que va SOBRE el theme · contrast accesible)
```

**Defaults en `:root`** (para componentes shared que se usan en otros portales):
```css
--theme: #6366F1 (indigo · idéntico al hardcoded original · cero cambio visual fuera de superadmin)
--theme-rgb: 99, 102, 241
--theme-3: #EC4899 (rose)
```

---

## 3 · Tipografía

| Uso | Fuente | Peso | Tamaño |
|---|---|---|---|
| Display (h1 hero) | Outfit | 800-900 | 32-48px |
| H2 sections | Outfit | 800 | 22-28px |
| Body | DM Sans | 400-600 | 13-15px |
| Labels uppercase | DM Sans | 700 | 10.5-11.5px · letter-spacing 0.07em |
| Mono (counts, code) | DM Mono / DM Sans | 600 | 10-12px |

**Imports en `index.css`**:
```
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
```

---

## 4 · Backgrounds del portal

### 4.1 · Aurora layer (capa ambiental)

Capa fija detrás de todo el contenido · 3 radial-gradients que tintan el ambiente con el
color de la sección activa.

**Pattern canónico** (en `.portal-superadmin [data-testid="portal-layout"]::before`):
```
background:
  radial-gradient(ellipse 80% 50% at 20% 10%, rgba(var(--theme-rgb), 0.12), transparent 60%),
  radial-gradient(ellipse 70% 60% at 90% 80%, rgba(var(--theme-rgb), 0.08), transparent 60%),
  radial-gradient(ellipse 60% 40% at 50% 100%, rgba(var(--theme-rgb), 0.045), transparent 60%);
```

**Características**:
- Opacidades: 0.12 / 0.08 / 0.045 (muy sutiles · ambient · NO manchas)
- Gradients elípticos grandes (60-80% del viewport)
- Anclados a esquinas (top-left · bottom-right · bottom-center)
- `transparent 60%` para difuminar suavemente
- `position: fixed` para mantenerse visible aunque el contenido scrollee
- `pointer-events: none` para no interceptar clicks

### 4.2 · Grid layer

Cuadrícula sutil (32px) detrás del aurora · da estructura técnica sin saturar.

```
background-image:
  linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
background-size: 32px 32px;
mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
```

**Características**:
- Líneas blancas 3% opacidad (apenas visibles)
- Mask radial que difumina hacia bordes (el grid se ve más al centro)

---

## 5 · Sistema de cards

### 5.1 · Card base (todas las cards del portal)

```
background: rgba(255, 255, 255, 0.04)        ← cristal tenue
border: 1px solid rgba(255, 255, 255, 0.035) ← borde casi imperceptible
border-radius: 12-16px (varía por tipo)
padding: 14-22px (varía por tipo)
transition: all 0.2s ease
```

### 5.2 · Card en hover (efecto signature)

Cuando el cursor pasa sobre cualquier card · se activa el theme de la sección:

```
border-color: rgba(var(--theme-rgb), 0.65)
box-shadow:
  0 0 0 1px rgba(var(--theme-rgb), 0.30),    ← ring exterior
  0 0 24px rgba(var(--theme-rgb), 0.30),     ← glow medio
  0 0 48px rgba(var(--theme-rgb), 0.15)      ← glow lejano
transform: translateY(-1px)                   ← lift sutil
```

**Selector amplio** (auto-cubre cualquier card futura):
- Inline `style="border-radius:..."` (React kebab-case)
- Tailwind classes: `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-md`, `rounded-sm`

**Excepciones (NO se iluminan)**:
- `<input>`, `<textarea>`, `<select>` (formularios)
- `[role="dialog"]`, `[role="row"]` (modales · tabla rows)
- `rounded-full` (avatares circulares)

### 5.3 · KPI Card (variante)

Card con borde lateral izquierdo accent + valor grande Outfit + label uppercase.

```
border-left: 3px solid var(--theme) (via ::before pseudo-element con glow)
padding: 14-20px 18-22px
border-radius: 12px

Estructura:
  [icon ⏵] [LABEL UPPERCASE]
  [VALOR GIGANTE]                  ← Outfit 800, 24-32px, color: var(--theme)
  [delta opcional · ↑ +12.3%]
```

### 5.4 · Resource Card (horizontal · navegable)

Card con icon-box + título/sub + arrow → · usada en accesos rápidos.

```
display: grid
grid-template-columns: auto 1fr auto
gap: 16px
border-left: 4px solid var(--theme) (con glow más intenso)

Hover:
  transform: translateX(4px)         ← desliza hacia la derecha
  .arrow → translateX(4px)            ← flecha se mueve
```

---

## 6 · Sistema de botones

### 6.1 · Botón theme (acción primaria)

```
background: var(--grad)              ← linear-gradient(90deg, var(--theme), var(--theme-3))
color: #fff
padding: 9px 18px
border-radius: 9999px (pill)
border: none
font: DM Sans 600 12.5-13px
```

**Hover**:
```
box-shadow:
  0 0 0 1px rgba(var(--theme-rgb), 0.5),
  0 8px 32px rgba(var(--theme-rgb), 0.45),
  0 0 64px rgba(var(--theme-rgb), 0.40)
transform: translateY(-1px)
```

### 6.2 · Botón outline (acción secundaria)

```
background: rgba(var(--theme-rgb), 0.10)
border: 1px solid rgba(var(--theme-rgb), 0.40)
color: var(--theme)
padding: 8px 16px
border-radius: 9999px
```

### 6.3 · Botón ghost (acción terciaria)

```
background: transparent
border: 1px solid rgba(255, 255, 255, 0.10)
color: rgba(240, 235, 224, 0.7)
padding: 9px 16px
```

### 6.4 · Pills (toggles · period selectors · tabs)

```
Inactive: bg transparent · border rgba(255,255,255,0.10) · color rgba cream 0.6
Active:   bg var(--grad) · color #fff
```

---

## 7 · Sidebar (sistema de navegación lateral)

### 7.1 · Estructura general

```
width: 240px
background: rgba(7, 7, 15, 0.6) + backdrop-filter: blur(20px)  ← glassmorphism
border-right: 1px solid rgba(255,255,255,0.08)
position: sticky · scrollable independiente
```

### 7.2 · Section labels (cada categoría)

Cada bloque del sidebar (7 categorías para superadmin) tiene:

```
Font: DM Mono / DM Sans 700 9-10px uppercase letter-spacing 0.22em
Color: SU color de sección (rosa · cyan · morado · etc) ¡NO gris!
Padding: 0 20px · margin-bottom 8px

Dot glow antes del label:
  ::before { width: 6px; height: 6px; border-radius: 50%;
             background: currentColor; box-shadow: 0 0 6px currentColor; }
```

### 7.3 · Nav items (cada tab del menú)

```
display: flex · gap: 12px · padding: 10px 14px
border-radius: 0 8px 8px 0 (asimétrico · solo radius derecho)
border-left: 3px solid transparent (placeholder · active lo llena)
font: DM Sans 500 14px
color: rgba(cream, 0.55) por default
```

**Estados**:
- **Inactive**: gris · icon hereda · count gris medio
- **Hover**: bg `rgba(section-rgb, 0.06)` · texto blanco
- **Active**:
  - `background: rgba(section-rgb, 0.12)`
  - `border-left-color: <section-color>`
  - `color: #ffffff` · `font-weight: 600`
  - icon + count en color de sección
- **Tooltip**: hover muestra explicación contextual + audience tag

### 7.4 · Scroll preservation

Bug fix: el sidebar guarda su scroll position en `sessionStorage` y la restaura al navegar
entre rutas (evita que cada click "salte" hacia arriba).

```js
useEffect(() => {
  const nav = navRef.current;
  const saved = sessionStorage.getItem('portal-sidebar-scroll');
  if (saved) nav.scrollTop = parseInt(saved, 10);
  const onScroll = () => sessionStorage.setItem('portal-sidebar-scroll', String(nav.scrollTop));
  nav.addEventListener('scroll', onScroll);
}, []);
```

---

## 8 · Topbar (header sticky)

```
position: sticky · top: 0 · z-index: 50
background: rgba(7, 7, 15, 0.7) + backdrop-filter: blur(24px)  ← glassmorphism
border-bottom: 1px solid rgba(255,255,255,0.06)
padding: 14px 24px
height: 64px
```

**Contenido típico**:
- Izquierda: crumb (DMX · SUPERADMIN · fecha en mono)
- Derecha: search btn · notifications btn · user avatar pill · logout btn
- Cmd+K shortcut para command palette

**Glassmorphism**:
- Background semi-transparente (0.6-0.7 alpha)
- `backdrop-filter: blur(20-24px)` (efecto cristal)
- Border-bottom hairline blanco

---

## 9 · Cursor custom (3 capas)

Cursor del mouse reemplazado por 3 elementos que siguen al cursor con lag:

| Capa | Tamaño | Función | Lag |
|---|---|---|---|
| **dot** | 10px sólido | Cursor "real" | 0 (sigue exacto) |
| **ring** | 28px outline | Anillo elegante | 0.14 lerp (smooth follow) |
| **glow** | 120px blur 20px | Aurora alrededor del cursor | 0.10 lerp |

**Color**: hereda `var(--theme)` y `rgba(var(--theme-rgb), X)` de la sección activa.

**Implementación**:
- Componente: `frontend/src/components/landing/CustomCursor.js`
- CSS en `index.css` líneas 304-332
- Override por sección via `body.superadmin-active[data-superadmin-section="X"]` (porque
  cursor es `position: fixed` fuera del wrapper · necesita sync via body)

**Activación**:
- Solo en desktop (`pointer: fine` media query)
- Mobile/touch: NO se renderea (return null)

---

## 10 · Theming dinámico (cómo cambia por sección)

```
1. URL change (ej. /superadmin/data-lake)
       ↓
2. React Router actualiza loc.pathname
       ↓
3. sectionFromPath() en SuperadminLayout retorna 'datos'
       ↓
4. Wrapper <div className="portal-superadmin" data-section="datos">
       ↓
5. CSS [data-section="datos"] override:
       --theme: #00E5FF
       --theme-rgb: 0, 229, 255
       --theme-3: #38e4be
       --grad: linear-gradient(90deg, var(--theme), var(--theme-3))
       ↓
6. Cascade automático:
       - Auroras (background con rgba(var(--theme-rgb), X)) → cyan tint
       - Cards (border-left, hover glow) → cyan
       - Botones theme (background: var(--grad)) → cyan→teal
       - Iconos (color: var(--theme)) → cyan
       - Sidebar active item → cyan
       - Cursor (via body.superadmin-active[data-superadmin-section="datos"]) → cyan
```

**Transición**: 200ms ease en todas las propiedades de color · cambio suave al navegar.

---

## 11 · Inputs y forms (estilo preservado)

Forms NO se involucran en el hover universal (excluidos del selector).

```
input · textarea · select:
  background: rgba(255, 255, 255, 0.04)
  border: 1px solid rgba(255, 255, 255, 0.10)
  color: var(--cream)
  font: DM Sans 13px
  padding: 9px 13px
  border-radius: 9px

focus:
  border-color: rgba(var(--theme-rgb), 0.40)
  outline: 2px solid rgba(var(--theme-rgb), 0.25)
  outline-offset: 1px
```

---

## 12 · Modales y drawers

```
Backdrop:
  position: fixed; inset: 0
  background: rgba(6, 8, 15, 0.82)
  backdrop-filter: blur(8-18px)
  z-index: 1300-1400

Modal container:
  background: rgba(13, 17, 28, 0.97)
  border: 1px solid rgba(255, 255, 255, 0.10)
  border-radius: 18px
  max-width: 460-540px
  padding: 24-26px
```

**Hover universal NO se aplica a modales** (excluido via `:not([role="dialog"])`).

---

## 13 · Colores semánticos (preservados sin tokenizar)

Estos colores NUNCA se sweepean · representan estados universales:

| Estado | Color | RGB | Uso |
|---|---|---|---|
| **Success** | `#4ADE80` | 74, 222, 128 | OK · Completado · Activo |
| **Warning** | `#FACC15` | 250, 204, 21 | Atención · Pendiente · Trial |
| **Error** | `#F87171` | 248, 113, 113 | Crítico · Failed · Suspended |
| **Info** | `#60A5FA` | 96, 165, 250 | Informativo · Neutral |

Cuando aparecen en cards (ej. "Activo" badge verde) · el hover universal aplica el theme
de sección pero el color del texto se mantiene.

---

## 14 · Scrollbars personalizados

```
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
::-webkit-scrollbar-thumb {
  background: rgba(var(--theme-rgb), 0.20);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--theme-rgb), 0.40);
}
```

---

## 15 · Aplicación a otros portales (cómo escalar)

Si se decide migrar `/asesor`, `/desarrollador`, `/inmobiliaria`, `/comprador`, `/landing`:

### 15.1 · Patrón uniforme (recomendado)

Cada portal tiene UN solo color identitario (sin sub-secciones por URL) · como el doc canónico:

```
.portal-asesor       → rosa #ff2e7e
.portal-developer    → morado #7c2fff
.portal-inmobiliaria → cyan/teal #00B4D8
.portal-marketplace  → lima #84F23C
.portal-comprador    → orange #FF8A33
```

### 15.2 · Wrapper por portal

Cada layout (AsesorLayout · DesarrolladorLayout · etc.) envuelve en:
```jsx
<div className={`portal-${role}`}>
  <PortalLayout role={role}>...</PortalLayout>
</div>
```

### 15.3 · CSS per portal

Definir las CSS vars dentro del scope correspondiente · idéntico al pattern de superadmin
pero sin `data-section` (porque cada portal tiene UN solo color):

```css
.portal-asesor {
  --theme: #ff2e7e;
  --theme-rgb: 255, 46, 126;
  --theme-2: #ff5fa0;
  --theme-3: #d946ef;
}
.portal-asesor [data-testid="portal-layout"]::before {
  background:
    radial-gradient(... rgba(var(--theme-rgb), 0.12) ...),
    radial-gradient(... rgba(var(--theme-rgb), 0.08) ...),
    radial-gradient(... rgba(var(--theme-rgb), 0.045) ...);
}
```

### 15.4 · Decisión: sub-secciones por sidebar?

Para superadmin SÍ tenemos sub-secciones (7 categorías) porque es un portal de operaciones
con MUCHAS áreas distintas. Para otros portales (asesor · dev · comprador) probablemente NO
porque son flujos más unitarios.

**Opciones**:
- A · UN solo color por portal · sin sub-secciones (más limpio · consistente con doc canónico)
- B · Sub-secciones también en otros portales si el founder lo pide

### 15.5 · Backward compat

Cuando se aplique a otro portal, los componentes shared (`components/documents`,
`components/shared`, etc.) que ya usan `var(--theme)` automáticamente toman el color del
portal · cero refactor adicional.

---

## 16 · Stack técnico resumido

| Capa | Tecnología | Archivos clave |
|---|---|---|
| CSS variables global | `:root` en `index.css` | `frontend/src/index.css` |
| CSS scoped aurora | `.portal-superadmin` | `frontend/src/styles/superadmin-aurora.css` |
| Routing wrapper | React Router + `sectionFromPath` | `frontend/src/components/superadmin/SuperadminLayout.js` |
| Sidebar config | Array de tiers con `section_key` | `frontend/src/config/navByRole.js` |
| Sidebar render | `NavTier` component | `frontend/src/components/shared/PortalLayout.js` |
| Cursor follow | useRef + raf + lerp | `frontend/src/components/landing/CustomCursor.js` |
| Body sync | useEffect en SuperadminLayout | (cursor color override) |
| Scroll persist | sessionStorage + useRef | PortalLayout nav |

---

## 17 · Reglas de oro (NO romper)

1. **Cero hardcoded colors fuera del CSS canónico**. Cualquier color en un componente debe
   ser `var(--theme)`, `var(--theme-rgb)`, o un color semántico legítimo (success/warning/error).
2. **Selector hover es global** · si una card nueva no necesita hover · agregar `:not()`
   exception · NO crear regla nueva.
3. **Cero leak entre portales** · todo CSS scoped a `.portal-{role}`. `:root` solo defaults indigo.
4. **Section labels en sidebar tienen color** · cada categoría con su color · NO gris uniforme.
5. **Auroras siempre con `var(--theme-rgb)`** · nunca con hex fijo · cambia con sección/portal.
6. **Backdrop-filter en topbar y sidebar** · glassmorphism es signature del diseño.
7. **Fonts: Outfit display · DM Sans body** · sin excepciones · sin variantes raras.
8. **Transiciones máximo 0.22s ease** · NO efectos lentos · NO bounce.

---

## 18 · Validaciones obligatorias antes de mergear cambios

```bash
# 1. Cero indigo/pink hardcoded en components/superadmin y pages/superadmin
grep -rnE "#6366[Ff]1|#818[Cc][Ff]8|#[Ee][Cc]4899|#a5b4fc|#c7d2fe|#7c3aed|rgba\(99,\s*102,\s*241|rgba\(236,\s*72,\s*153" \
  frontend/src/components/superadmin/ frontend/src/pages/superadmin/

# 2. Babel parse de archivos modificados
node -e "require('@babel/parser').parse(require('fs').readFileSync('PATH','utf8'),{sourceType:'module',plugins:['jsx']});"

# 3. HTTP 200 en rutas clave
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/superadmin
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/asesor

# 4. Visual: hover en cards · auroras visibles · cursor cambia color · sidebar scroll persiste
```

---

**Última actualización**: 2026-05-14
**Mantenedor**: Claude Code · founder Manuel Acosta
