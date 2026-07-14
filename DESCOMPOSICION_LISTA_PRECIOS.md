# LA DESCOMPOSICIÓN DE UNA LISTA DE PRECIOS — el átomo y sus 6 niveles

> Spec canónica (founder + Claude, 2026-07-14). Pregunta que responde: *"¿cuánta data se puede
> descomponer de una sola lista de precios?"* Respuesta: **~150 señales distintas en 6 niveles**,
> que alimentan a los ~200 motores de la plataforma. Caso de calibración: Almina San Ángel
> (CLASS, 80 unidades, PDF 13-jul + Excel maestro).

## Nivel 0 · CAMPOS CRUDOS (~45)
**Por unidad (del PDF + Excel):** número, torre, piso (derivado), m² habitable, m² balcón,
m² patio, m² roof garden, m² total, recámaras, recámaras opcionales, baños, estacionamientos,
tipo de estacionamiento, bodegas, cuarto de servicio, amueblado, depto muestra, notas,
precio, crédito, enganche, reservación, contrato, a diferir.
**Por desarrollo (del Excel):** nombre, torres/fases, etapa, fecha de entrega, alcaldía, colonia,
dirección, GPS, amenidades (lista → ~20 flags), acabados, fondo de mantenimiento, cuota de
equipamiento, TOTAL de deptos del desarrollo, contacto.
**Por documento (del vigía):** fecha real del archivo, huella md5, versión, fuente, linaje.

## Nivel 1 · DERIVADOS ARITMÉTICOS por unidad (~35 — puro código, $0)
$/m² habitable · $/m² total · **índice de honestidad** (% del precio en metros no habitables) ·
exterior total (balcón+patio+roof) · ratio exterior/interior · enganche % · reservación % ·
contrato % · a diferir % · **liquidez de entrada** (lo que necesitas HOY) · % financiable ·
piso desde el número · posición en el piso (terminación) · flags tiene-balcón/patio/roof ·
m² por recámara · precio por recámara · baños/recámara · precio vs su molde (dispersión
intra-prototipo) · rank de precio en la torre · delta vs gemela un piso arriba (prima local) ·
TCO (precio + fondo + cuota) · cajones incluidos vs precio.

## Nivel 2 · AGREGADOS por molde / torre / proyecto (~30)
Prototipos (n, spread m², precio desde) · curva vertical (prima por piso, pendiente $/nivel) ·
mix de producto (2R vs 3R %) · ticket promedio/mediano · dispersión de precios (¿pricing
disciplinado o caótico?) · disponibles por piso/molde · concentración del inventario ·
**⭐ COLOCACIÓN ACUMULADA (stock): total del desarrollo (245) − disponibles hoy (80) =
165 colocadas = 67% — un solo snapshot la revela. ⚠️ NO confundir con absorción: esto dice
CUÁNTO se ha vendido desde siempre, NO a qué ritmo (corrección founder 07-14)** ·
inventario restante en $ · la ABSORCIÓN real (u/periodo) vive en el Nivel 3: necesita ≥2 fotos.

## Nivel 3 · SERIES TEMPORALES (cada ronda del vigía suma un punto, ~25)
**ABSORCIÓN (flujo): u/periodo por molde/torre/proyecto — la métrica de ritmo de verdad; con ella: meses de inventario = disponibles ÷ ritmo** · days-on-market por unidad · cambios
de precio (dirección, magnitud, frecuencia) · **elasticidad medida** (¿qué bajada acelera la
venta?) · descuento real lista→venta · reapariciones (caídas de apartado) · ETA de sold-out
por molde · estacionalidad de actualizaciones del dev (cronobiología) · frescura del dato ·
ventas inferidas por diff de fuentes (Excel vs PDF).

## Nivel 4 · CRUCES con la plataforma (~30 — aquí está el moat)
Sobre-mercado % vs AVM de colonia · espejo vs demanda del genoma (por molde, precio, zona) ·
**matcheo financiero** comprador↔unidad (liquidez + mensualidad vs esquema de pago real) ·
prima de riesgo (sísmico/agua/crimen de la colonia) · prima de caminabilidad (DENUE) · prima
de amenidades (hedónico) · prima de marca del dev · comps a nivel UNIDAD cruzando devs ·
gap de valor (componentes que la demanda busca vs los que el precio premia) · predial estimado
por valor · cap rate con rentas de la zona · **LA ECUACIÓN DEL PRECIO** (descomposición
hedónica completa: cada peso explicado por componente).

## Nivel 5 · PRODUCTOS DERIVABLES (~15)
CARFAX por unidad · ficha del marketplace · Estudio DMX del proyecto · battle card del dev ·
índice de honestidad del m² (publicable) · curvas de prima por piso por colonia (para
arquitectos) · reporte "física de precios CDMX" · TCO index · alertas de arbitraje (unidades
mal preciadas) · buscador por mensualidad alimentado con esquemas reales · DMX-30 · boletín
de zona · API licenciable por señal · sintetizador de precio para lanzamientos.

## La cuenta
- 1 lista ≈ **150 señales** × 80 unidades ≈ **~7,000 puntos de dato** del primer proyecto.
- 25 proyectos de CLASS ≈ **~150,000 puntos** + los agregados.
- Cada ronda del vigía re-alimenta el Nivel 3 GRATIS (metadata → diff → bitácora).
- Todo señal lleva LINAJE (de qué archivo/huella/fecha salió) — auditable y licenciable.

## Regla de construcción (universalidad)
Un solo **registro de métricas derivadas**: cada señal = 1 entrada {nombre, grano
(unidad/molde/torre/proyecto/colonia), fórmula, insumos, motores que la consumen}. Se calculan
en cascada post-ingesta/ronda. Agregar la señal #151 = 1 renglón, nunca un desarrollo.

## Secuencia acordada
1. Almina → cola de revisión (piloto). 2. Los 24 restantes de CLASS (founder marca orden).
3. Con ~500 unidades: ecuación del precio v1 + niveles 1-2 completos. 4. Nivel 3 madura solo
(vigía). 5. Nivel 4-5 al tener 3+ devs.
