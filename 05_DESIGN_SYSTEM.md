# DMX — Design System (atoms only)

> **Sistema de átomos de diseño**: paleta + tipografía + buttons + cards + animaciones + reglas. **Estructura, copy, layouts y composición de páginas son libres** — emergent.sh decide creativamente.
>
> Este doc define el **lenguaje visual** (colores, tipos, formas, movimiento). NO define qué secciones tiene una landing, qué dice el copy, ni cómo se componen los portales. Eso es decisión creativa.

## 1. Filosofía visual

**DMX es Spatial Decision Intelligence.** La UI debe transmitir **precisión + datos + certeza**. Tono navy oscuro con cream cálido y acentos indigo+rose. Cero ruido visual. Cero emoji. Tipografía editorial.

**No es un portal inmobiliario tradicional. Es una plataforma de decisión.** Esa narrativa visual debe sentirse en cada pantalla, pero CÓMO transmitirla = decisión creativa de quien construye.

## 2. Design tokens

```css
:root {
  /* Backgrounds */
  --bg:        #06080F;    /* navy casi-negro, fondo principal */
  --bg-2:      #0D1017;    /* surface de cards y secciones */
  --bg-3:      #111827;    /* inputs, panels */

  /* Text */
  --cream:     #F0EBE0;                      /* texto primario */
  --cream-2:   rgba(240,235,224,0.62);       /* texto secundario */
  --cream-3:   rgba(240,235,224,0.32);       /* texto muted */

  /* Accents */
  --indigo:    #6366F1;    /* primary action */
  --indigo-2:  #818CF8;    /* hover */
  --indigo-3:  #a5b4fc;    /* score pills text */
  --rose:      #EC4899;    /* gradient endpoint */
  --green:     #22C55E;    /* positive momentum */
  --amber:     #F59E0B;    /* warning */
  --red:       #EF4444;    /* high risk */

  /* Borders */
  --border:    rgba(255,255,255,0.08);
  --border-2:  rgba(255,255,255,0.14);

  /* Signature gradient (UNICO permitido) */
  --grad:      linear-gradient(90deg, #6366F1, #EC4899);

  /* Radii */
  --r-pill:    9999px;
  --r-card:    22px;
  --r-inner:   14px;
  --r-chip:    10px;

  /* Shadows */
  --sh-card:   0 24px 60px rgba(99,102,241,0.12);
  --sh-elev:   0 24px 80px rgba(0,0,0,0.45);
}
```

## 3. Reglas inviolables (6)

1. **Todo botón** tiene `border-radius: 9999px`. Sin excepciones.
2. **Gradientes** solo `#6366F1 → #EC4899`. No generamos otros.
3. **Cero emoji** en toda la UI.
4. **Transforms solo en eje Y** (translateY). Nada de tilt o lateral en mobile.
5. **Duración máxima** de animaciones: 850ms.
6. **`once: true`** en animaciones viewport-triggered (no se re-disparan al scroll).

## 4. Tipografía

**Fonts**: Outfit (700, 800) + DM Sans (400, 500, 600). Google Fonts.

| Uso | Font | Weight | Size | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Display XL (hero) | Outfit | 800 | `clamp(44px, 6vw, 80px)` | 0.95 | -0.03em |
| Display L (section) | Outfit | 800 | `clamp(32px, 4.5vw, 54px)` | 1.0 | -0.028em |
| Display M (numbers / scores) | Outfit | 800 | 56-68 | 0.9-1.0 | -0.04em |
| Title | Outfit | 800 | 18-24 | 1.15 | -0.025em |
| Body | DM Sans | 400 | 16 | 1.65 | 0 |
| Body S | DM Sans | 500 | 13.5 | 1.4 | 0 |
| Eyebrow | DM Sans | 600 | 11 | 1.4 | 0.16em uppercase |
| Label | Outfit | 700 | 10.5 | 1.0 | 0.14em uppercase |
| Mono data | ui-monospace | 400 | 10 | 1.3 | 0 |

**Text-wrap**: `balance` en títulos, `pretty` en párrafos largos.

**Cuándo aplicar gradient en texto**: solo en una palabra clave por título (la que carga el insight) y en números grandes hero. Nunca en párrafos completos ni en múltiples palabras.

## 5. Sistema de buttons (6 variantes — atoms)

### Primary (gradient)
```css
background: linear-gradient(90deg, #6366F1, #EC4899);
color: #FFFFFF;
font: 600 13.5px/1.2 "DM Sans";
padding: 10px 20px;
border-radius: 9999px;
border: 0;
transition: transform .2s, filter .2s;
```
Hover: `filter: brightness(1.08)` + `transform: translateY(-1px)`.

### Glass
```css
background: rgba(255,255,255,0.04);
color: #F0EBE0;
border: 1px solid rgba(255,255,255,0.14);
backdrop-filter: blur(8px);
font: 500 13.5px/1.2 "DM Sans";
padding: 10px 18px;
border-radius: 9999px;
```
Hover: `background: rgba(255,255,255,0.08)`.

### Ghost (indigo)
```css
background: transparent;
color: #818CF8;
border: 1px solid rgba(99,102,241,0.30);
font: 500 13.5px/1.2 "DM Sans";
padding: 10px 18px;
border-radius: 9999px;
```
Hover: `border-color: rgba(99,102,241,0.55)`, `color: #a5b4fc`.

### Ghost-solid
```css
background: rgba(240,235,224,0.92);
color: #06080F;
font: 700 13.5px/1.2 "DM Sans";
padding: 10px 20px;
border-radius: 9999px;
```

### Small (modifier)
Override sobre cualquier variante: `padding: 8px 14px; font-size: 12px;`

### Icon circle
```css
width: 32px; height: 32px;
border-radius: 9999px;
background: rgba(6,8,15,0.55);
border: 1px solid rgba(255,255,255,0.14);
backdrop-filter: blur(8px);
display: flex; align-items: center; justify-content: center;
```

## 6. Sistema de cards (4 átomos)

### Card estándar
```css
background: linear-gradient(180deg, #0E1220 0%, #0A0D16 100%);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 22px;
overflow: hidden;
transition: transform .5s cubic-bezier(.22,1,.36,1),
            border-color .3s, box-shadow .3s;
```
Hover: `transform: translateY(-6px); border-color: rgba(99,102,241,0.40); box-shadow: 0 24px 60px rgba(99,102,241,0.12);`

### Score pill
```css
display: inline-flex; align-items: center; gap: 4px;
background: rgba(99,102,241,0.10);
border: 1px solid rgba(99,102,241,0.24);
border-radius: 9999px;
padding: 3px 12px;
font: 600 12px/1 "Outfit";
color: #a5b4fc;
```

### Momentum pill (3 colores semánticos)
- **Positivo**: `bg rgba(34,197,94,0.12); border 1px rgba(34,197,94,0.30); color #86efac;`
- **Neutro/flat**: `bg rgba(129,140,248,0.12); border 1px rgba(129,140,248,0.30); color #a5b4fc;`
- **Negativo**: `bg rgba(239,68,68,0.12); border 1px rgba(239,68,68,0.30); color #fca5a5;`

Common: `padding: 2px 8px; border-radius: 9999px; font: 700 10.5px/1 "Outfit";`

### Glass overlay (panels flotantes, modales)
```css
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.16);
backdrop-filter: blur(24px);
border-radius: 16px;
```
Pseudo `::before` opcional con gradient border (top brillante → middle transparent → bottom subtle).

## 7. Animación — 5 primitivas reutilizables

### `useInView(ref, { once=true, amount=0.3 })`
Hook IntersectionObserver retorna boolean. Default `once=true` (no re-dispara).

### `<BlurText>`
Split por palabras. Cada palabra `<span inline-block>` con:
- Default: `filter: blur(10px); opacity: 0; transform: translateY(24px);`
- In-view: reset a `blur(0); opacity: 1; transform: translateY(0);`
- Transición: `all 0.7s cubic-bezier(0.22, 1, 0.36, 1)`
- Stagger: `transition-delay: {index * 0.07}s`
- Opcional: marca palabras "gradient" para pintarlas con `--grad`.

### `<FadeUp delay>`
- Default: `opacity:0; transform: translateY(20px); filter: blur(6px);`
- In-view: reset.
- Transición: `all 0.65s cubic-bezier(0.22,1,0.36,1)` + `transition-delay: {delay}s`.

### `<StaggerContainer stagger>`
Inyecta `style={{'--i': i}}` a hijos. CSS `transition-delay: calc(var(--i, 0) * 0.08s)`.

### Marquee
```css
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.marquee { animation: marquee 28s linear infinite; }
.marquee.reverse { animation-direction: reverse; animation-duration: 34s; }
.marquee-wrap:hover .marquee { animation-play-state: paused; }
```

## 8. Iconos

SVG inline (no library externa). Cada icono accepts `{ size, color='currentColor' }`. ViewBox `24 24`. Stroke + fill según el icono.

**Set base recomendado** (no exhaustivo, agrega lo que necesites):
MapPin, Search, Home, Currency, ArrowRight, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Heart, Bed, Bath, Car, Ruler, Database, Clock, Lock, Play, Menu, MessageSquare, Bell, User, Settings, TrendUp, TrendDown.

## 9. Estados — matriz universal

| Elemento | Default | Hover | Active | Focus |
|---|---|---|---|---|
| Link | `cream-3` | `cream` + bg sutil | `indigo-3` | outline 2px indigo |
| Primary btn | gradient | brightness 1.08 + ↑1px | translateY(0) | outline indigo |
| Card | sombra 0 | translateY(-6px) + border indigo + sh-card | — | — |
| Pill (interactive) | bg 0.04 | bg 0.08 | bg indigo + border indigo | outline |
| Filter chip | bg 0.04 | bg 0.08 | bg indigo + border indigo | — |
| Heart/save | stroke | — | filled rosa #f472b6 | — |
| Carousel arrow | opacity 0 | opacity 1 | — | — |
| Accordion trigger | cream | indigo-3 | indigo-3 + chevron 180° | outline |

## 10. Responsive

Breakpoints: mobile `<640`, tablet `640–960`, desktop `>960`.

| Breakpoint | Cambios típicos |
|---|---|
| `<640` | Nav hamburger; grids → 1 col; padding lateral 16px; custom cursor disabled (si lo usas); transforms 3D solo Y |
| `640–960` | Grids → 2 col donde aplique; padding lateral 24px |
| `>960` | Spec completa multi-col; custom cursor opcional |

**Mobile-first obligatorio**: 96% México accede vía móvil. La densidad de info de desktop NO debe traducirse 1:1 a mobile — debe re-priorizarse.

## 11. Anti-slop checklist

- [ ] Zero emoji en toda la UI.
- [ ] Gradientes solo `#6366F1 → #EC4899`.
- [ ] No `text-center` en párrafos body fuera de hero/CTA.
- [ ] Sin `shadow-2xl`; profundidad vía border + backdrop-blur.
- [ ] Zero lorem ipsum; copy real producción-quality.
- [ ] Buttons 100% rounded-full.
- [ ] Motion duration ≤ 850ms.
- [ ] No `console.log` en output final.
- [ ] Copy es-MX (excepto términos producto: "Score", "Stack", "API").
- [ ] Sin parallax lateral ni tilt en mobile.
- [ ] Respeta `prefers-reduced-motion`.
- [ ] Contrast ratio ≥4.5:1 texto / ≥3:1 elementos UI.
- [ ] Focus visible en todos los interactivos.

## 12. Inspiraciones (referencias creativas, NO copiar literal)

Para cuando necesites inspiración para componentes complejos:

- **Mapas + heatmaps**: propiedades.com (sidebar info colonia), Zillow (zoom progresivo), Compass (clean cards).
- **Dashboards datos**: Linear (density), Vercel Analytics (storytelling), Stripe (clean numbers).
- **Marketing AI-native**: Linear.app, Anthropic.com, Cursor.com, Vercel.com.
- **Real estate copy**: CoStar (B2B serio), The Agency (lujo editorial).
- **Animations**: Awwwards.com inspiración general (PERO respetando regla #5: motion ≤ 850ms).

**Regla**: inspírate, no copies. Cada componente debe ser tu interpretación creativa con los tokens DMX.

## 13. Lo que NO está en este doc (es libre / decisión creativa)

- ❌ Estructura específica de la landing pública (qué secciones, qué orden, qué copy)
- ❌ Spec de componentes concretos (Navbar / Hero / cards de colonia / radar comparator / etc.)
- ❌ Copy textual ("Conoce tu colonia antes de decidir" no es canon — es ejemplo, sustituye)
- ❌ Datos hardcoded de colonias/proyectos (Del Valle Centro / Benito Juárez fueron ejemplos seed)
- ❌ Layout de portales (asesor / comprador / desarrollador)

**Decide tú con criterio creativo**, respetando los átomos de diseño aquí definidos.

## 14. Resumen one-liner

**DMX = navy oscuro + cream cálido + 1 gradient indigo→rose en CTAs y números clave + tipografía editorial Outfit/DM Sans + cards hover sutil translateY + animaciones blur+fade+stagger ≤850ms + cero emoji + cero ruido visual + tono "decisión basada en datos, no marketing inmobiliario tradicional".**

Construir DMX = transmitir con la UI esa narrativa, **creativamente, con tu propio criterio de composición y storytelling**.
