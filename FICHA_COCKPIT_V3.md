# Ficha "Cockpit" V3 — rediseño de la ficha de propiedad

Rama: `dev-redesign-tandas`. Última actualización: 2026-06-26.

Rediseño de la ficha pública de un desarrollo como **app-cockpit**: en vez de apilar todo en una página larga,
enfoca por pestañas y mantiene a la mano el precio, el asistente y la acción. **Reusa todos los motores** (cero
data inventada); reescribe la presentación.

## Cómo se prende
- Route: `/desarrollo/:id?v3=1` (paralelo a la ficha actual, no la reemplaza todavía).
- `App.js` → `DevelopmentDetailRoute`: `?v1=1` → `DevelopmentDetail` (viejo) · `?v3=1` → `FichaCockpit` (este) · default → `FichaDesarrollo`.
- Archivo principal: `frontend/src/pages/FichaCockpit.js`.

## Layout
- **Header compacto sticky**: nombre + precio + breadcrumb (Colonia · Alcaldía · CDMX) + botón **Comparar** + badges (Verificado / Preventa).
- **Barra de 4 tabs**: El Proyecto · Tu Unidad · Tu Dinero · Confianza.
- **Sidebar sticky 320px**: precio + número clave (TIR/mensualidad) + Agendar visita + Pregúntale a Atlax + Guardar.
- **Móvil (<920px)**: el grid colapsa (`.dmx-cockpit-grid`) + barra de acción fija abajo (precio + Agendar).
- **Lente global** (`¿Para qué la quieres?` vivir / invertir) + modo (Para ti / Inversión Institucional) — UN solo toggle persistente entre Tu Unidad y Tu Dinero.

## Las 4 pestañas
| Tab | Componente | Contenido |
|---|---|---|
| El Proyecto | `TabProyecto` (en FichaCockpit) | Orden adentro→afuera: Galería · Características · Amenidades · Ubicación · Lo que puedes comprar · Memoria de acabados · Construcción y servicios · Avance de obra · Disponibilidad · Formas de pago · El precio desde el lanzamiento · Desarrollador · La historia. Globitos `InfoTip` educativos. |
| Tu Unidad | `SeccionUnidades` | Lista por tipo + **comparador hasta 3 unidades** (precio/m², AVM vs obra nueva, prima de estrenar vs usado, enganche/escrituración/inversión inicial, parking, plano, cap rate, plusvalía) + detalle. Botón **"Ver los números de la X →"** lleva directo a Tu Dinero. |
| Tu Dinero | `PlanDePago` + `SeccionCalcInversion` (invertir) / `SeccionDinero` (vivir) | Plan de pago **FIJO del dev** (esquema de lista, solo enganche editable) · desglose de crédito hipotecario · gastos de escrituración · calculadora de inversión. |
| Confianza | `SeccionConfianza` + `SeccionUbicacion` | Mapa con pins (dev + negocios reales), la zona en números, arma tu sábado. |

## Datos (todo reusa motores — cero inventado)
- **Dev**: `DEVELOPMENTS_BY_ID` (`data_developments.py`) + `project_public_overlay` (servicios/amenidades/sistema/formas_pago que el dev edita en su portal) + `dev_payment_schemes` + `project_amenities`. Endpoint: `get_development` en `routes/public.py`.
- **Esquemas de pago**: endpoint público `/api/public/payment-schemes/{project_id}` (lee `dev_payment_schemes`, fallback a `payment_schemes.default_schemes()`). El plan que se muestra es el de **lista** (menor descuento), valores exactos, sin rangos.
- **AVM (precio vs mercado)**: `market_estimate_engine.price_position` (banda ±12%, 3 niveles: Buen precio / En línea / Sobre mercado) + nuevo-vs-usado ("prima de estrenar"). Endpoint `/api/public/precio-posicion-batch`.
- **Flywheel buyer_signals**: `sendBuyerSignal(type, payload)` → colección `buyer_signals` → `grafo_comprador` + embudo del dev + cubo de demanda del superadmin. Señales que emite el cockpit: `unit_view`, `lead`, `intent`, `unit_save/unsave`, `section_view`, `section_time`, `compare`.

## Atlax integrado (asistente IA)
- `AtlaxBubble` montado en la ficha, **consciente del contexto** (`atlaxContext`: sección activa, unidad elegida + specs + precio, lente vivir/invertir, número clave). El lead que captura llega al asesor **con ese contexto**.
- **FAB toggle**: persiste siempre, alterna abrir/cerrar (icono X cuando está abierto, aria "Cerrar"). El panel sube a `bottom:96` para no tapar el FAB.
- Hover **glow** (sin `transform:scale` — evitaba glitch de compositing). Chips de sugerencia **envuelven** (flexWrap, sin scroll horizontal). **Negritas** markdown renderizadas (`renderRich`). Fade suave en el borde superior de los mensajes.

## Diseño limpio (directiva founder: "se ve mejor limpio sin tanto color")
- **0 emojis de color** en el cockpit (solo glifos tipográficos ✓ ★ → ♥). Amenidades/características/técnica como texto.
- **Sin mayúsculas gritando**: title case inteligente (helper `titleCase` + `TITLE_SMALL`) en eyebrows, headers del comparador y breadcrumb. Quitado todo `textTransform:uppercase`.
- **Aro del cursor** (`CustomCursor`, `.cursor-ring`) a `z-index` máximo (2147483647) → siempre encima del panel/modales (antes empataba en 9999 y quedaba detrás).

## Pendiente
- **Pase de color**: reducir verde/morado/rojo a 1 acento + 1 semántico; tokens y jerarquía consistentes.
- **Cierre con IA**: "Atlax lee la ficha por ti" — síntesis personalizada + brief al asesor.
- Migrar de `?v3=1` a flag/encendido cuando esté validada.
