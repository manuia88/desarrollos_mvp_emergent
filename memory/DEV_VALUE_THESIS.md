# Tesis de Valor · Inicio vs Mis Proyectos (Dev) — y el verdadero potencial
**2026-06-02.** Founder: "¿qué diferencia hay entre Inicio y Mis Proyectos? Tenemos demasiados
datos/features y no una definición de VALOR real · te quedas por encima del potencial." Este doc
fija la definición y la regla de fusión de datos. Eje: `DEV_PASO_C_DESIGN_DOCTRINE.md`.

## El problema que detectó el founder
La V2 de Mis Proyectos se volvió un mini-dashboard del portafolio (dinero total, KPIs) → **eso ES
Inicio**. Las dos tabs se confunden porque no definimos QUÉ TRABAJO HACE CADA UNA. Y solo usé el
dato PROPIO del dev (ventas, ritmo) — no fusioné la inteligencia de mercado que ya tenemos → me
quedé en la piel, no en el valor.

## La definición (una línea cada una)
- **INICIO = "¿Qué hago HOY?"** → el COCKPIT de decisión. Cross-proyecto, proactivo, accionable:
  el estado del negocio + lo que el MERCADO te está haciendo + las 3 jugadas de mayor palanca,
  priorizadas. Es la casa del asistente (Cerebro). NO operas un proyecto aquí; decides DÓNDE poner
  tu atención y te manda al lugar correcto. (= el briefing del CEO cada mañana.)
- **MIS PROYECTOS = "¿Cómo va cada ACTIVO y cómo lo opero?"** → el LIBRO MAYOR de activos. Por-activo:
  cada proyecto instrumentado a fondo CON su posición de mercado, comparable/ordenable entre sí, y
  es la PUERTA para entrar a trabajarlo (→ las 4 pestañas del detalle). NO te resume el negocio.

**La regla que los separa:** Inicio prioriza ATENCIÓN (cross-proyecto, "hoy", te empuja a actuar).
Mis Proyectos muestra el ESTADO de cada activo + posición de mercado + es donde OPERAS.

## EL VERDADERO POTENCIAL · fusionar TU dato con el MERCADO (lo que un dev nunca tuvo)
El salto NO es mostrar tus ventas más bonitas — es CONTEXTUALIZAR cada número contra el mercado
vivo, fusionando los motores que ya pagamos (AVM · DRPI · Forecast · Live Pulse · Battle Card ·
Demanda · What-if · Comparables). Las "mezclas" que crean valor real:

1. **Sellout vs Entrega (riesgo de inventario parado):** ritmo (`weekly_sales`)→fecha de agotamiento
   (forecast) VS `delivery_estimate`. "Te agotas en 8m y entregas en 18 → vendes todo antes ✅" o
   "te agotas en 30m pero entregas en 12 → llegas con 14 uds sin vender = $200M parados ⚠️". KILLER.
2. **Precio vs Valor real (AVM + DRPI):** tu `price_from` VS AVM de la zona VS tendencia DRPI.
   "Estás 8% ARRIBA del valor real → por eso vas lento" / "5% abajo → dejas $X en la mesa."
3. **Demanda viva (Live Pulse):** "búsquedas en Polanco +22% este mes → empuja marketing AHORA" /
   "la demanda de tu zona cae → no subas precio."
4. **Vs competidores (Battle Card):** "vendes 30% más lento que 2 proyectos parecidos a 800m —
   ellos tienen tour 3D y tú no."
5. **El embudo real (leads→conversión→venta):** de dónde salen las ventas y dónde se caen.
6. **La jugada de mayor palanca (Cerebro + What-if):** la UNA cosa que mueve más dinero
   ("baja 3% → vendes ~30% más rápido y aún ganas $X").

## Cómo se reparte el potencial entre las dos tabs
- **INICIO (cross-proyecto · "hoy"):** dinero del portafolio (cobrado vs por cobrar) · las **3 jugadas
  de mayor palanca** de TODO el portafolio (mezclando 1–6) · movimientos del mercado que te afectan ·
  leads calientes a punto de cerrar. = "atiende esto hoy" (lo arma el Cerebro).
- **MIS PROYECTOS (por activo):** cada card = activo + **posición de mercado** (precio vs AVM ·
  sellout vs entrega · ritmo vs zona/competidor) + la **1 jugada** de ese activo. Ordenable por riesgo/
  palanca. Entras → 4 pestañas (Resumen·Producto·Ventas y precios·Comercialización y mercado).
- Lo que MUEVES de Mis Proyectos → Inicio: el resumen de dinero del portafolio (era de Inicio).
- Lo que SUBE en Mis Proyectos: la fusión de mercado por activo (hoy solo tenía dato propio).

## Datos/motores disponibles HOY para la fusión (front-callable)
list-with-stats (units/price/health/leads/conversion/days_listed/revenue_mtd/**weekly_sales**/delivery)
· getDemand · getForecast + getAbsorptionAnalytics · getUnitMarketComparables · getCompetitorHistory
+ battle_card · zone scores/DRPI · AVM engines · whatif_engine · Live Pulse. (Algunos por-unidad/zona →
fusión real donde hay dato, ejemplo marcado donde falta · build-for-end-state.)
