# ANÁLISIS — Qué nos enseñan DIME, Inmuebles24 y BBVA

> Documento nuevo. Mi análisis de los 3 reportes de mercado que me pasó el founder, contra lo que ya
> tenemos construido (los 5 fundamentos + 96 motores + cubo). El founder dijo: *"no me termina de
> convencer cómo está planteado el análisis, cómo se leen y cómo se estructuran los datos."* Aquí el porqué.

---

## 1. Los 3 reportes son 3 LENTES del mismo mercado
| Reporte | Lente | Columna vertebral |
|---|---|---|
| **DIME (Softec)** | OFERTA / desarrollador | Clasificación (S·E·M·R·RP) × Tipología × Zona × Tamaño |
| **Inmuebles24 INDEX** | PRECIO / demanda | Operación (Venta/Renta) × Unidad media × Geografía (alcaldía→colonia) |
| **BBVA Research** | MACRO / causal | Tema × Organismo · Segmento · Estado · Nivel salarial · Afiliación |

Esto valida nuestro moat **"un cerebro, muchos lentes"**: el mismo dato base, leído desde 3 ángulos.

## 2. El ADN que comparten (y que mi presentación NO tiene)
| Patrón de los 3 | Mi tarjeta "Indicador" hoy |
|---|---|
| **Narrativa primero** (titular + 2-3 líneas con el número adentro) | Número primero, frío |
| **Nunca un número solo** — siempre vs inflación / vs peers / vs periodo previo | Comparativo flaco |
| **Distribución, no punto** (Total·Promedio·Mediana·Máx·Mín·Desv·Moda) | Un solo valor |
| **Unidad media estándar** (vara común para comparar lo mismo) | Ad hoc |
| **Espina de segmentación consistente** (todo se corta igual) | 215 dims sueltas, sin rollup |
| **Evolución temporal** + variación acumulada (mes/año/anual) | Foto fija |
| **Métricas de decisión** (absorción, meses inventario, rentabilidad…) | Datos crudos |
| **Bandas de lectura** con umbral ("30-45% = sano") | alto/bajo sin umbral |
| **Términos reales** (deflactado) | Nominal |
| **Fichas por entidad** estructuradas | Drill suelto |
| **Glosario** | "uso" por tarjeta, sin glosario |

## 3. La confrontación honesta
Mi tarjeta `Indicador` resolvió **"¿qué es este número?"** (nombre·valor·uso·fuente). Pero **NO** resolvió
**"¿cómo se lee el mercado?"**. Sigue siendo **un punto flotando en una tarjeta**. Estos reportes JAMÁS
muestran un número solo: lo muestran dentro de una **tabla segmentada + temporal + comparada + interpretada**.

Es decir: maté el sudoku de *etiquetas* (cada número ya dice qué es), pero la presentación sigue
**atomizada**, no estructurada como la lee un desarrollador o un inversionista de verdad. Ese es el gap real.

## 4. Lo bueno: el dato YA está. Falta la CAPA DE PRESENTACIÓN
No es construir más motores. Los 5 fundamentos ya nos dan:
- **ENGINE_ARSENAL** → los ~190 motores (el dato).
- **COMPOSITE_METRICS_120** → las métricas de decisión empaquetadas (absorción, rentabilidad, etc. — ¡ya las tenemos!).
- **HYPERGRANULARITY_MATRIX + CROSS_GRANULARITY** → la espina de segmentación (4 escalas × 75 métricas = cubo de ~4,000 celdas).
- **FUENTES_OFICIALES** → de dónde sale cada número.

Lo que cambia es **cómo se cuentan**: envolver lo que ya existe en el lenguaje de DIME/Inmuebles24/BBVA.

## 5. Qué robar de cada uno (para integrar los tres)
**DE DIME (oferta):**
- Rigor estadístico: Total·Promedio·Mediana·Máx·Mín·Desv·Moda en cada métrica.
- **Absorción + Meses de inventario con banda de salud** (30-45% sano).
- **Ficha de proyecto** con hasta 3 modelos (A/B/C).
- **Accesibilidad** (traduce precio → ingresos requeridos por segmento: "¿quién puede comprarlo?").

**DE INMUEBLES24 (precio/demanda):**
- **Unidad media estándar** (2rec 65m² · 3rec 100m²) — comparar lo mismo contra lo mismo.
- Todo **rankeado** (mayor / zona media / menor) + **heat map** de variación.
- **Rentabilidad bruta** (renta÷precio) + **años para recuperar** como métrica-puente.
- **Spread por zona** (mínimo, mediana, máximo — no solo el promedio).

**DE BBVA (macro/causal):**
- **Narrativa "En resumen"** que cuenta la historia antes de un solo número.
- **Variación % anual REAL** (deflactada) siempre.
- **Índices propios** (Ipavir = precio vs ingreso) que convierten 2 datos en 1 lectura.
- **Concentración / desbalance** como hallazgo, no solo el nivel.

## 6. Veredicto
El founder tiene razón: la segmentación y la presentación actuales **no llegan** al estándar de estos
reportes. La buena noticia es que el **motor del dato ya está construido**; el siguiente salto es la
**capa de presentación** (ver `DOCTRINA_PRESENTACION_TERMINAL.md`), no más backend.
