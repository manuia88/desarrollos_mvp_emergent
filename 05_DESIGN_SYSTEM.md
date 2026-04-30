# DMX — Design System (canon)

> Sistema de diseño completo para emergent.sh. Si conflicta con `04_UI_DATA_REF.md`, **gana este doc**. Construye la UI siguiendo este spec.

## 1. Filosofía visual

**DMX es Spatial Decision Intelligence — la UI debe transmitir precisión, datos, certeza.** Tono visual: navy oscuro casi-negro + cream cálido + acentos indigo+rose. Cero ruido visual. Cero emoji. Tipografía editorial.

## 2. Design tokens (variables CSS o equivalente)

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
4. **Transforms solo en Y** (translateY). Nada de lateral/tilt en mobile.
5. **Duración máxima** de animaciones: 850ms.
6. **`once: true`** en todas las animaciones viewport-triggered (no se re-disparan al scroll).

## 4. Tipografía

**Fonts**: Outfit (700, 800) + DM Sans (400, 500, 600). Google Fonts.

| Uso | Font | Weight | Size | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| H1 Hero | Outfit | 800 | `clamp(44px, 6vw, 80px)` | 0.95 | -0.03em |
| H2 Section | Outfit | 800 | `clamp(32px, 4.5vw, 54px)` | 1.0 | -0.028em |
| Score big (colonias) | Outfit | 800 | 68 | 0.9 | -0.045em |
| Score big (IE panel) | Outfit | 800 | 56 | 1.0 | -0.04em |
| Property price | Outfit | 800 | 24 | 1.0 | -0.03em |
| Card title | Outfit | 800 | 18 | 1.15 | -0.025em |
| Nav link | DM Sans | 500 | 13.5 | 1.4 | 0 |
| Body paragraph | DM Sans | 400 | 16 | 1.65 | 0 |
| Eyebrow | DM Sans | 600 | 11 | 1.4 | 0.16em uppercase |
| Label (chips) | Outfit | 700 | 10.5 | 1.0 | 0.14em uppercase |
| Monospace data | ui-monospace | 400 | 10 | 1.3 | 0 |

**Text-wrap**: `balance` en títulos card, `pretty` en párrafos largos.

## 5. Sistema de buttons (6 variantes)

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

### Small (`btn-sm`)
Override sobre cualquier variante: `padding: 8px 14px; font-size: 12px;`

### Icon circle
```css
width: 32px; height: 32px;
border-radius: 9999px;
background: rgba(6,8,15,0.55);
border: 1px solid rgba(255,255,255,0.14);
backdrop-filter: blur(8px);
color: #F0EBE0;
display: flex; align-items: center; justify-content: center;
```

## 6. Sistema de cards (4 variantes)

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

### Momentum pill (3 variantes)
- **Positivo**: `bg rgba(34,197,94,0.12); border 1px rgba(34,197,94,0.30); color #86efac;`
- **Neutro/flat**: `bg rgba(129,140,248,0.12); border 1px rgba(129,140,248,0.30); color #a5b4fc;`
- **Negativo**: `bg rgba(239,68,68,0.12); border 1px rgba(239,68,68,0.30); color #fca5a5;`

Common: `padding: 2px 8px; border-radius: 9999px; font: 700 10.5px/1 "Outfit";`

### Glass overlay card (map, hero floating)
```css
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.16);
backdrop-filter: blur(24px);
border-radius: 16px;
```
Con pseudo `::before` gradient border (top bright → middle transparent → bottom subtle).

## 7. Componentes principales

### 7.1 Navbar
- Fixed top, height 60px, z 100, `bg rgba(6,8,15,0.75) + backdrop-blur(24px)`, padding 0 32px.
- Logo: 28×28 mark con gradient + MapPin icon + wordmark "DesarrollosMX" Outfit 800 18px.
- Nav center: `["Colonias", "Propiedades", "Inteligencia", "Asesores"]`.
- Right: Ghost btn "Iniciar sesión" + Primary btn "Explorar mapa" + MapPin.
- Scroll >40px → backdrop-blur(40px) + bg(0.92).
- Mobile <768: Hamburger reemplaza nav center+right; sheet full-screen.

### 7.2 Hero
- Shell: `height 250vh` (scroll track) con sticky inner `100vh`.
- Layer stack z: 0 canvas scrub / 1 vignette radial / 2 bottom fade / 5 MapOverlay / 10 content.
- Eyebrow badge (delay 0.1s): pill glass + interior gradient pill `IE v1 · CDMX` + texto `"Inteligencia espacial para vivir mejor"`.
- H1 BlurText (delay 0.2s, stagger 0.07s): `"Conoce tu colonia antes de decidir."` palabra "antes" en gradient.
- Sub (delay 0.9s): 17px DM Sans, max-width 580px, color cream-2.
- CTA row (delay 1.1s): Primary "Explorar mapa" + Glass "Ver el demo".
- Score pills row (delay 1.4s): 5 pills horizontales con separadores 1px×14px (`DMX-LIV: 87, Seguridad: 74, Movilidad: 91, Momentum: ↑6%, Precio m²: $58k`) + location label debajo.
- Partners row absolute bottom 40px: label `"Integrado con las principales plataformas"` + logos en italic 18px cream-3 (`Christie's`, `Sotheby's`, `Lamudi`, `Propiedades.com`, `Pulppo`, `Habimetro`).

### 7.3 LiveTicker
- Height 52px, `bg #0A0D16`, borders top+bottom.
- Left label fijo (200px): dot pulsante amber + `"Precio m² · En vivo"`.
- Track marquee 60s linear infinite, 12 colonias × 2.
- Item: nombre DM Sans 500 12px + precio Outfit 700 13px + delta pill (verde/rojo/indigo).

### 7.4 SearchBar
- Max-width 920px, margin `-32px auto 0` (overlap hero bottom), padding 24px 28px, `bg #0D1118`, border 1px `rgba(255,255,255,0.14)`, radius 20px, shadow `0 24px 80px rgba(0,0,0,0.45)`.
- Tabs: `["Comprar", "Rentar", "Invertir", "Desarrolladores"]`. Active: `bg rgba(99,102,241,0.12) + color #a5b4fc + weight 600`.
- Search row grid `2fr 1fr 1fr auto` gap 10px:
  - Input height 48px, `bg var(--bg-3)`, border, radius pill, padding `0 18px 0 42px`, icon Search a 16px del left.
  - 2 selects (Tipología + Precio).
  - Submit Primary gradient 48px height + icon Search + "Buscar".
- Filter chips row margin-top 16px: 8 chips (3 active default).

### 7.5 ColoniasBento (Vinyl Tiles)
Grid 3 col (1 col mobile <960), gap 24px. Tile alto ~640px en desktop.

**Estructura tile**:
1. **Top hero** (padding 22px): alcaldía uppercase + nombre Outfit 800 22px + momentum pill top-right + score big Outfit 800 68px gradient + score meta + help box.
2. **Layer switcher** (LIV/MOV/SEC/ECO): 4 pills flex 1, active gradient.
3. **Facts** (3 filas K/V según capa): K DM Sans 11.5px cream-3, V Outfit 700 13px.
4. **Lifeline** (sparkline 24 meses): label uppercase + SVG path con gradient area-fill + row valores ui-monospace.
5. **Footer**: Stat "Precio m²" + Stat "Inventario" + spacer + botón circular 36×36 gradient + ArrowRight (hover translateX(3px)).

**Layers**:
- LIV (Calidad de vida): Parques 10min / Amenidades / Ruido promedio dB
- MOV (Movilidad): Estaciones Metro / Ecobici / Tiempo a Reforma
- SEC (Seguridad): rates FGJ
- ECO (Comercio): densidad DENUE

### 7.6 ColoniaComparator (Radar Battle)
Layout grid `220px 1fr 220px`, gap 32px, padding 32px, `bg linear-gradient(180deg, #0D1017, #06080F)`, border, radius 28px.

**Instructivo "Cómo funciona"**: 3 steps con número circular gradient.

**Panel lateral A/B**:
- Avatar 88×88 radial gradient + iniciales Outfit 800 28px.
- Nombre Outfit 800 20px + alcaldía cream-3.
- 2 mini-cards K/V (Precio m² + Momentum).
- Picker de colonias tipo botón con dot colored.

**Radar central**:
- SVG viewBox `0 0 340 340`. Center 170/170. rMax 118.
- 5 polígonos concéntricos (rings), 6 spokes (6 ejes: Movilidad / Seguridad / Comercio / Momentum / Educación / Riesgo).
- Polígonos data: `mix-blend-mode: plus-lighter` + fill color@0.28 + stroke color@1.6px + drop-shadow.
- Transición 0.8s cubic-bezier `(.22,1,.36,1)`.
- Dots vértices r=3 + center dot r=2.

**Axis pills**: 6 pills clickeables con `AXIS_HELP` dictionary (descripción de cada eje).

**Narrativa auto-generada** + **Ticker numérico** que interpola via rAF cuando cambia colonia.

### 7.7 PropertyListings
Grid 3 col, gap 24px. Card alto ~540px.

**Card**:
1. **Photo carousel** (220px): track flex con slides gradient, SVG `<PhotoScene scene={scene}/>` (`building` / `interior` / `view` / `garden`), vignette top+bottom.
2. **Controles carousel**: flechas opacity 0→1 hover, save heart 32×32, tag pill top-left, momentum pill bottom-left, dots indicadores bottom-right.
3. **Body** (padding 18px 20px gap 14px):
   - Row ubicación: MapPin + colonia + dot + alcaldía.
   - Title Outfit 800 18px text-wrap balance.
   - Meta grid: Bed+Bath+Car+Ruler con valores.
   - Precio row (border-top+bottom dashed): Price Outfit 800 24px + ppm2 cream-3 / Plusvalía label uppercase + valor Outfit 800 16px green.
   - Scores grid 3 col (LIV / MOV / SEC): K Outfit 700 9.5px indigo-3 + V Outfit 800 18px gradient text-clip.
   - Footer: avatar asesor + nombre + label "Asesor DMX" / Primary btn-sm "Ver ficha" + ArrowRight.

### 7.8 IntelligenceEngine
Layout 2 col `1fr 1fr` gap 60px, padding 80px 32px, `bg #0D1017`, borders top+bottom.

**Col izq**: Eyebrow + H2 + Sub + 3 feature rows (Database "50+ fuentes", Clock "Análisis en 3.2s", Lock "Cero conflicto de interés").

**Col der — Score Panel**: nombre colonia + score big 56px gradient + 6 bars animadas (stagger 100ms, duration 1.2s) + CTA full-width "Ver reporte completo — 97 indicadores →".

### 7.9 Stats
Card única: `bg #06080F`, border, radius 20px, inner radial gradient ellipse top.

Grid 4 col con dividers 1px verticales. Stats: `97+`, `50+`, `18`, `3.2s`. Valor Outfit 800 64px gradient. Label uppercase 11px cream-3.

Count-up: `useInView` trigger, easeOut 1800ms.

Footer: label "Actualización más reciente:" + score pill "Benito Juárez · hace 6 horas".

### 7.10 Testimonials
Marquee doble fila con mask gradient en bordes.
- Row 1: marquee 28s linear infinite.
- Row 2: marquee 34s linear infinite reverse.
- Pause on parent hover.

Card: 340px ancho, glass, padding 24px, radius 16px. Quote italic + author row.

### 7.11 FAQ
Layout 2 col `0.85fr 1.15fr` gap 72px.

**Col izq sticky top-24**: Tag pill "FAQ" + H2 + Sub + Glass btn "Hablar con un asesor" + MessageSquare.

**Col der Accordion**: 7 items con border-top 1px (último también border-bottom). Trigger Outfit 600 15px, hover/open color indigo-3, ChevronDown rota 180°. Content max-width 58ch.

### 7.12 CtaFooter
**CTA section**: `bg #0D1017` + radial glow indigo + padding 80px 32px centered + Tag pill "Comienza hoy" + H2 italic Outfit 800 `clamp(38px, 5.5vw, 68px)` "Tu próximo hogar empieza con datos." + Sub + Primary "Explorar colonias" + Glass "Ver precios".

**Footer**: Línea gradient horizontal 1px + bar grid `1fr auto 1fr` con mini-logo / 4 links / copyright.

### 7.13 MapOverlay
Floating absolute, ~300×240. Glass card con grid lines SVG 24px spacing + 3 ellipses radial indigo/rose/green + ping dots animados + content (nombre colonia + 6-score grid 3×2 LIV/MOV/SEC/ECO/MOM/RSK + link "Ver análisis completo →").

### 7.14 CustomCursor
Solo desktop `@media (pointer: fine)`. `body { cursor: none; }`.

3 capas fixed pointer-events none z-index 9999:
- Dot 10×10 indigo + box-shadow 0 0 14px indigo80, lag 50ms.
- Ring 28×28 border 1.5px indigo45, lag 120ms.
- Glow 120×120 radial indigo20 blur 20px, lag 80ms.

Ring expande 40px + crosshair en secciones de mapa.

## 8. Animaciones — 5 primitivas

### `useInView(ref, { once=true, amount=0.3 })`
Hook IntersectionObserver retorna `boolean`. Default once=true (no re-dispara).

### `<BlurText as="h2" gradientWords={[...]}>`
Split por espacio, cada palabra `<span>` con:
```
display: inline-block; white-space: pre;
transition: all 0.7s cubic-bezier(0.22, 1, 0.36, 1);
transition-delay: {index * 0.07}s;
```
Default: `filter: blur(10px); opacity: 0; transform: translateY(24px);`
In-view: reset.

Gradient words: `background: var(--grad); -webkit-background-clip: text; color: transparent;`

### `<FadeUp delay={0}>`
Hijo con `transition: all 0.65s cubic-bezier(0.22,1,0.36,1); transition-delay: {delay}s;`.
Default: `opacity:0; transform: translateY(20px); filter: blur(6px);`. In-view resetea.

### `<StaggerContainer stagger={0.08}>`
Inyecta `style={{'--i': i}}` a cada hijo. CSS `transition-delay: calc(var(--i, 0) * 0.08s);`.

### Marquee
```css
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.marquee-row { animation: marquee 28s linear infinite; }
.marquee-row.reverse { animation-direction: reverse; animation-duration: 34s; }
.marquee-wrap:hover .marquee-row { animation-play-state: paused; }
```

## 9. Iconos

SVG inline (no external library). Cada uno accepts `{ size=N, color='currentColor' }`.

Lista: MapPin, Play, Search, Home, Currency, ArrowRight, ArrowSide, TrendUp, Database, Clock, Lock, Heart, MessageSquare, ChevronDown, ChevronLeft/Right, Menu, Bed, Bath, Car, Ruler.

ViewBox `24 24` para todos.

## 10. Estados & interacciones

| Elemento | Default | Hover | Active | Focus |
|---|---|---|---|---|
| Nav link | `cream-3` | `cream` + pill bg | indigo-3 | outline 2px indigo |
| Primary btn | gradient | brightness 1.08 + ↑1px | translateY(0) | outline indigo |
| Card | sombra 0 | translateY(-6px) + border indigo + sh-card | — | — |
| Layer pill (colonias) | gris | border brighter | bg indigo + color indigo-3 | outline |
| Filter chip | bg 0.04 | bg 0.08 | bg indigo + border indigo | — |
| Heart btn | stroke | — | filled rosa #f472b6 | — |
| Carousel arrow | opacity 0 | opacity 1 + bg más sólido | — | — |
| Radar axis pill | gris | color cream | bg gradient + color white | — |
| FAQ trigger | cream | indigo-3 | indigo-3 + chevron 180° | outline |

## 11. Responsive

Breakpoints: mobile `<640`, tablet `640–960`, desktop `>960`.

| Breakpoint | Cambios |
|---|---|
| `<640` | Nav hamburger; grids → 1 col; H1 44px; padding lateral 16px; custom cursor disabled; radar stack vertical |
| `640–960` | Grids → 2 col donde aplique; padding lateral 24px |
| `>960` | Spec completa 3-col grids, custom cursor activo, tilt 3D en cards |

## 12. Anti-slop checklist (cumplimiento obligatorio)

- [x] Zero emoji en toda la UI.
- [x] Gradientes solo `#6366F1 → #EC4899`.
- [x] No `text-center` en párrafos body fuera de hero/CTA.
- [x] Sin `shadow-2xl`; profundidad vía border + backdrop-blur.
- [x] Zero lorem ipsum; copy exacta (ver sección 14).
- [x] Buttons 100% rounded-full.
- [x] Motion duration ≤ 0.85s.
- [x] No `console.log` en output final.
- [x] Copy es-MX (excepto "Score" como término producto).
- [x] Sin parallax lateral ni tilt en mobile.

## 13. Composición App

Orden de secciones (top → bottom):

```
<App>
  <CustomCursor />
  <Navbar />
  <Hero />
  <SearchBar />        ← overlap hero (-32px margin-top)
  <LiveTicker />
  <ColoniasBento />
  <ColoniaComparator />
  <PropertyListings />
  <IntelligenceEngine />
  <Stats />
  <Testimonials />
  <Faq />
  <CtaFooter />
</App>
```

## 14. Copy completo (es-MX, palabra por palabra)

### Hero
- Eyebrow pill: `IE v1 · CDMX`
- Eyebrow texto: `Inteligencia espacial para vivir mejor`
- H1: `Conoce tu colonia antes de decidir.` (palabra **antes** en gradient)
- Sub: `DMX analiza más de 97 variables por zona — desde movilidad y seguridad hasta momentum de precio — para que compres, vendas o inviertas con certeza real.`
- CTAs: `Explorar mapa` · `Ver el demo`
- Score label: `Del Valle Centro · Benito Juárez · actualizado hace 6h`
- Partners label: `Integrado con las principales plataformas`

### Colonias
- Eyebrow: `Inteligencia por colonia`
- H2: `Las colonias más activas este mes.` (palabra **mes.** en gradient)
- Sub: `Cada colonia tiene 4 scores compuestos — LIV, MOV, SEC, ECO — calculados desde más de 97 variables de fuentes oficiales (DENUE, C5, GTFS, SEDUVI). Cambia la capa en cada tarjeta y verás los datos duros que alimentan el score.`
- Link: `Ver las 18 colonias →`

### Comparador
- Eyebrow: `Comparador de colonias`
- H2: `Compara dos colonias cara a cara.`
- Sub: `Elige dos colonias y DMX las proyecta sobre seis dimensiones de decisión. Los polígonos superpuestos te muestran al instante dónde gana cada una. Haz clic en cualquier eje para ver el detalle y leer la explicación.`

### Propiedades
- Eyebrow: `Marketplace`
- H2: `Propiedades con contexto.` (palabra **contexto.** en gradient)
- Sub: `Fotos, metros y precio — más los scores de su colonia y plusvalía proyectada. Todo en una sola tarjeta, sin saltar de pestaña.`
- Link: `Ver más propiedades →`

### Intelligence Engine
- Eyebrow: `Intelligence Engine`
- H2: `No es un portal. Es una plataforma de decisión.` (frase final en gradient)
- Sub: `Mientras otros muestran fotos, DMX procesa datos reales de 50+ fuentes públicas para darte certeza antes de firmar.`
- Features:
  - `50+ fuentes de datos reales` — `DENUE, FGJ, GTFS, SEDUVI, Atlas de Riesgos. Actualizados semanalmente.`
  - `Análisis en 3.2 segundos` — `97 variables procesadas por colonia. Sin esperar a ningún asesor.`
  - `Cero conflicto de interés` — `DMX no cobra comisión por venta. La inteligencia es el producto.`

### Diccionario AXIS_HELP (ColoniaComparator)
```js
{
  Movilidad: 'Acceso a Metro, Metrobús, Ecobici y tiempos de traslado promedio.',
  Seguridad: 'Incidencia delictiva FGJ, cobertura C5, alumbrado público.',
  Comercio:  'Densidad DENUE: restaurantes, abasto, servicios, vida nocturna.',
  Momentum:  'Tendencia de precio m² últimos 24 meses y volumen transaccional.',
  Educación: 'Escuelas públicas y privadas, rating SEP, ratio estudiantes/plantel.',
  Riesgo:    'Atlas de Riesgos CDMX: sísmico, hundimiento, encharcamiento. (Alto = mejor)',
}
```

### FAQ (7 preguntas)
1. `¿Qué es DMX y por qué es diferente a Lamudi o Inmuebles24?`
2. `¿De dónde vienen los datos? ¿Son confiables?`
3. `¿Qué significan los scores LIV, MOV, SEC, ECO?`
4. `¿Cómo gana dinero DMX si no cobra comisión por venta?`
5. `¿Cuántas colonias tienen IE Score completo?`
6. `¿Puedo confiar en la plusvalía proyectada?`
7. `¿Cómo me contacto con un asesor verificado?`

(Las respuestas se generan con detalles específicos sobre fuentes oficiales, modelo de negocio basado en suscripción, cobertura CDMX, metodología regression+ML, verificación AMPI.)

### CTA final
- Tag pill: `Comienza hoy`
- H2 italic: `Tu próximo hogar empieza con datos.` (palabra final en gradient)
- Sub: `Accede al mapa de inteligencia más completo de la Ciudad de México y toma decisiones que duran décadas.`
- CTAs: `Explorar colonias` · `Ver precios`

### Footer
- Links: `Aviso de privacidad` · `Términos de uso` · `Para asesores` · `Para desarrolladores`
- Copyright: `© 2026 DesarrollosMX SA de CV. Todos los derechos reservados.`

## 15. Datos de ejemplo (Del Valle Centro como seed)

```js
{
  name: 'Del Valle Centro',
  alcaldia: 'Benito Juárez',
  liv: 87,
  price: 58,                 // miles MXN/m²
  mom: { pct: '+6%', positive: true },
  trend: [52,53,54,54,55,56,56,55,56,57,58,58,58,58,58],  // sparkline 24m
  inventory: 142,
  facts: {
    LIV: [
      { k: 'Parques a 10 min', v: '8' },
      { k: 'Amenidades',       v: '412' },
      { k: 'Ruido promedio',   v: '58 dB' },
    ],
    MOV: [
      { k: 'Estaciones Metro', v: '3' },
      { k: 'Ecobici',          v: '14 cicloestaciones' },
      { k: 'Tiempo a Reforma', v: '22 min' },
    ],
    SEC: [ /* score-related facts */ ],
    ECO: [ /* score-related facts */ ],
  },
}
```

## 16. Resumen visual core (one-liner)

**DMX = navy oscuro #06080F + cream cálido #F0EBE0 + gradient indigo→rose en CTAs y números clave + tipografía editorial Outfit/DM Sans + cards con hover sutil translateY + animaciones blur+fade+stagger ≤850ms + cero emoji + zero ruido visual.**

Construir DMX significa transmitir con la UI que **esto es decisión basada en datos, no marketing inmobiliario tradicional**.

---

## Notas de adaptación para emergent.sh

1. **Esta spec es para landing/marketing pública**. La aplicación interna (portales asesor / comprador / desarrollador) puede heredar tokens + tipografía + reglas pero adaptar layouts a workflows productivos (kanban, tablas, dashboards).

2. **Variantes por portal** — usa los mismos tokens pero distintos énfasis:
   - Público (landing): hero impacto + visualización
   - Comprador: warmth + storytelling colonia
   - Asesor: density + productivity (mucha info, decisiones rápidas)
   - Desarrollador: dashboards densos analytics

3. **Stack de implementación**: tu decisión. La spec funciona en cualquier stack moderno (React + Tailwind, Vue + UnoCSS, Svelte + vanilla CSS, etc.). Lo crítico es respetar tokens + reglas inviolables + copy exacta.

4. **Prioridad mobile-first**: spec define desktop primero pero implementa mobile primero (96% México móvil). Custom cursor + tilt 3D solo desktop.

5. **Performance target**: LCP <2.5s, FID <100ms, CLS <0.1, bundle inicial <250KB gzipped.

6. **Compatibilidad con `04_UI_DATA_REF.md`**: el efecto "breath" cards mencionado allí se aplica como variante de la card estándar (gradient pulsante 3-5s respiratorio sobre el `linear-gradient(180deg, #0E1220, #0A0D16)`). Respeta `prefers-reduced-motion`.
