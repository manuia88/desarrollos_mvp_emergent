# DOCTRINA DE PRESENTACIÓN DEL TERMINAL DE ZONA

> Documento nuevo (spec). Cómo debe **leerse y estructurarse** el Terminal para que tenga la segmentación
> y presentación de DIME + Inmuebles24 + BBVA. No es backend nuevo: es la **capa de presentación** sobre
> los 96 motores / 120 métricas / cubo que ya existen. Borrador para revisión del founder.

---

## Regla de oro
> **Ningún número se muestra solo.** Cada dato vive dentro de un marco de 5 capas:
> **DISTRIBUCIÓN + SERIE + COMPARATIVO REAL + BANDA + LECTURA.**

## 1. La espina de segmentación (todo se corta igual)
Una sola taxonomía, consistente en todo el Terminal (ya existe en HYPERGRANULARITY_MATRIX):
- **CLASIFICACIÓN** (por precio, estilo DIME): S · E · M · R · RP (con rangos $ y VUMA).
- **TIPOLOGÍA** (por producto): Horizontal (Casa Sola·Condo·Villa·PH) / Vertical (Depto·Loft).
- **GEOGRAFÍA** (4 escalas): Ciudad → Alcaldía → Colonia → Desarrollo → Unidad.
- **TAMAÑO** (rangos de unidades): 0-20·21-50·51-100·101-200·201-500·+500.
- **OPERACIÓN** (estilo I24): Venta / Renta.
> Cada celda del cubo = una combinación. Cada combinación es **un dato independiente** (lo que el founder pidió desde el inicio).

## 2. Cómo se presenta CADA métrica (las 5 capas)
Plantilla obligatoria para todo indicador:
1. **Distribución** (estilo DIME): Total · Promedio · **Mediana** · Máx · Mín · Desv · Moda. (No el punto solo.)
2. **Serie temporal** (estilo I24/BBVA): evolución + variación **MES / AÑO / ANUAL**.
3. **Comparativo real** (estilo BBVA): vs inflación (términos reales), vs CETES, vs periodo previo, vs peers rankeado.
4. **Banda de lectura** (estilo DIME): umbral con semáforo ("30-45% = sano").
5. **Lectura narrativa** (estilo BBVA): 1 frase que dice qué significa para la decisión.

## 3. Unidad media estándar (la vara común) — adoptar de I24
Definir 2-3 **unidades-tipo** por ciudad y anclar todo a ellas:
- `2 rec · 65 m² · 1 estac.` y `3 rec · 100 m² · 1 estac.`
- Toda comparación de precio/$m²/renta/rentabilidad se hace sobre la **misma unidad-tipo** → comparable entre colonias.

## 4. Las métricas de decisión (derivadas — ya están en COMPOSITE_METRICS_120)
Exponerlas con su **fórmula + banda**, no como dato crudo:
| Métrica | Fórmula | Banda de lectura |
|---|---|---|
| **Absorción** | unidades vendidas / mes | — (cuanto más alta, mejor) |
| **Meses de inventario** | inventario / absorción | 30-45% inv/total = sano; >45% sobreoferta |
| **Éxito comercial** | vendidas mes / total | benchmark vs zona |
| **Rentabilidad bruta** | renta anual / precio venta | vs CETES (¿le gana al gobierno?) |
| **Años para recuperar** | precio / renta anual | menor = mejor |
| **LTV** | crédito / precio | salud del financiamiento |
| **Asequibilidad (tipo Ipavir)** | precio vs ingreso del NSE | brecha de acceso |
| **Posición de precio** | percentil vs peers | entrada / medio / tope de gama |

## 5. Ranking + heat map (adoptar de I24)
- Toda geografía se muestra **rankeada** con etiquetas **MAYOR / ZONA MEDIA / MENOR** + mapa choropleth.
- **Spread por zona**: mínimo (colonia más barata) · mediana · máximo (colonia más cara). No solo el promedio.
- **Heat map de variación**: el CAMBIO (no solo el nivel), con % de zonas que suben.

## 6. Ficha por entidad (adoptar de DIME)
Cada desarrollo/unidad = una ficha estandarizada:
```
ID · Clasificación · Tipología · Colonia · lat/long
Unidades: proyectadas / totales / vendidas / inventario
Desempeño: absorción · meses inventario · éxito comercial
Financiamiento: 1ª / 2ª recomendación
Fechas: inicio comercialización / entrega / actualización
Modelos A·B·C: precio · m² · $/m² · rec · baños · cajones
```

## 7. Estructura narrativa de cada sección (adoptar de BBVA)
1. **Titular** (la conclusión, no el dato): *"Polanco está en tope de gama; cuida el sobreprecio."*
2. **Párrafo-historia** (2-3 líneas con los números adentro).
3. **Tabla segmentada** (clasificación × tipología, columnas consistentes).
4. **Serie / ranking / heat map** de respaldo.
5. **Lectura de decisión** (qué hacer).

## 8. Glosario (adoptar de DIME)
Un glosario único del Terminal que define cada término (absorción, meses inventario, éxito comercial,
rentabilidad bruta, LTV, asequibilidad, unidad media…). Ya tenemos el `uso` por indicador; falta consolidarlo.

## 9. Mapeo a lo que YA existe (no se tira nada)
| Doctrina pide | De dónde sale (ya construido) |
|---|---|
| Espina de segmentación | HYPERGRANULARITY_MATRIX + CROSS_GRANULARITY (cubo 4,000 celdas) |
| Métricas de decisión | COMPOSITE_METRICS_120 (los 12 packs) |
| Los datos crudos | ENGINE_ARSENAL (190 motores) / 96 en el hub |
| Fuentes (banda real, no humo) | FUENTES_OFICIALES_PARA_CARGAR |
| Indicador con uso/fuente | `engine_present.py` (ya hecho) — solo falta envolverlo en las 5 capas |

## 10. Plan de adopción sugerido (por tandas)
1. **Sección PRECIOS** como prueba (estilo I24: unidad media + ranking + heat map + variación real + spread).
2. **Sección OFERTA** (estilo DIME: absorción + meses inventario con banda + ficha de proyecto).
3. **Resumen ejecutivo narrativo** (estilo BBVA: titular + historia por sección).
4. **Glosario** consolidado.
5. Extender las **5 capas** a todos los Indicadores del cubo.
