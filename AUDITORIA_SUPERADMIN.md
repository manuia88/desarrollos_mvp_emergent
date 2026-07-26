# AUDITORÍA DEL MÓDULO SUPERADMIN · 2026-07-26

> Cinco agentes internos, cada uno con doble pasada y orden explícita de **refutar sus propios
> hallazgos** antes de entregar. Solo sobrevive lo verificado ejecutando. Previa al rebuild que pidió
> el founder: *"no se pierde, no se quita, no se elimina ninguna feature, motor, índice o score"*.

## EL CENSO REAL (y por qué el catálogo se queda corto)

| | |
|---|---|
| Motores en el backend | **179** |
| Que responden por alguna ruta | 173 |
| **Que el catálogo del menú describe** | **41** |
| Rutas de superadmin en el backend | 240 |
| Que ninguna pantalla llama | **76 (31%)** |
| Pantallas | 111 archivos · 55,866 líneas |
| **Entradas en el menú lateral** | **24** |
| Piezas catalogadas | 123 (43 motores · 48 reportes · 29 vistas · 1 índice · 2 productos) |

**El desbalance de origen: 24 puertas para 111 pantallas.** Casi nada está muerto — está construido,
funcionando y pagado, pero **invisible**. Desde la silla del founder eso es idéntico a no existir.

## SALUD PIEZA POR PIEZA (123 probadas una a una)

| Veredicto | Piezas |
|---|---|
| **VIVO** (datos reales y frescos) | 99 |
| **VACÍO** (funciona, no hay datos) | 15 |
| **RELLENO** (muestra números inventados) | 6 |
| **ROTO** | 2 |
| **CONGELADO** | 1 |

El módulo está **más sano de lo que se siente**. El problema no es que falte: es que no se encuentra,
no se entiende, y en puntos concretos **miente**.

---

# LO QUE MIENTE HOY · hay que arreglarlo pase lo que pase con el rebuild

## 1 · "La tasa de Banxico está en 8.8%" — no es una tasa

`routes/superadmin_devmaster.py:1523` lee `banxico_series` **sin filtrar la serie** y toma el registro
más reciente. Verificado a mano:

```
serie SP68257 · valor 8.797743 · fecha 2026-08-10   ← el valor de la UDI en pesos, y del FUTURO
```

De ahí sale la mensualidad de $56,762 que se muestra, y la flecha "subiendo" compara UDIS contra TIIE.
En otra pantalla la tasa es 11.46% **fija en el código**. Dos tasas, ninguna viva.

## 2 · La pantalla borra la honestidad que el backend sí tiene

`CubeReportesView.js:103` mantiene una lista de campos que **nunca se pintan**, y ahí están
`es_estimado` y `fuente`. El backend marca correctamente "esto es una estimación" y la interfaz lo
tacha. Por eso el índice DMX-30 —que internamente dice `es_estimado: true` y saltó de 100 a 147 **el
segundo día con UNA sola colonia con dato**— se lee como un hecho.

## 3 · El índice de precios es 99.8% sintético y se declara disponible

`drpi`: **59,832 de 59,956 registros** traen `synthetic: true`, `sample_size: 0`, `source: proxy_backfill`
— y aun así responde `available: true`. Los 124 honestos dicen `available: false`. **No existe un solo
dato real de DRPI.** Y encima de eso se construye *"92.7% de probabilidad de subida, confianza ALTA"*.

## 4 · Las calificaciones de zona salen al público con relleno

50 de 50 zonas servidas traen `placeholder_flags.liquidez = true` y `denue_density` **exactamente
50.0**. En la base: 5,042 de 5,272 con relleno. Esto se sirve en `/api/public/zone-score`, o sea que
**lo ve el comprador**, no solo el founder.

## 5 · Las gráficas de tu pantalla de inicio son inventadas

`SuperadminFounderConsole.js:334`:
```js
// Simulated 90d sparkline data for visual interest
const mrrSeries = [ mrr*0.78, mrr*0.82, mrr*0.86, mrr*0.91, mrr*0.94, mrr*0.97, mrr ];
```
Una curva siempre ascendente, etiquetada "MRR (90d trend)". Está a un clic de la Sala de Inversionistas.

## 6 · Los números no cuadran entre pantallas

| | Valores según dónde mires |
|---|---|
| Unidades | 5,924 · 5,877 · 6,420 · 5,912 |
| Proyectos | 122 · 121 |
| Clientes | **0** (inicio) · 6 (pantalla a la que ese mismo número lleva) |
| Leads | 10 · 3 |
| Alertas | 83 · 91 · 41 (medidos con 60 s de diferencia) |
| Visitantes | 262 · 38 · 17 · 16 · 14 |
| $/m² Juárez | 114,115 · 66,395 |

Causa raíz del par más visible: el inicio lee `db.tenants` (**vacía**) y la pantalla de clientes lee
`db.dev_orgs` (6). Por eso ingresos = $0 siempre.

## 7 · Lecturas que no se sostienen

- *"262 visitantes únicos"* → hay **17**. Suma el mismo visitante una vez por cada cosa que miró.
- *"175,446 transiciones del mercado"* → 90% son recálculos internos. Cambios de precio reales: **13**.
- *"Inventario limpio"* → en el mismo bloque, 26% sin precio y 30% sin metros.
- *"Absorbe el 95.8%"* → el libro de ventas tiene **1 venta confirmada**.
- *"El nivel 40 vale +25.6%"* → se apoya en **2 edificios**, y la tabla incluye "niveles 203, 204, 205"
  (números de departamento leídos como piso).
- **El 79% de las señales de demanda son de demo** y se presentan como observadas.

## 8 · Dos bugs que ensucian el dato

- **Live Pulse** pasa una variable CSS a Mapbox como color → las capas nunca se agregan → mapa vacío.
  Dice "50 zonas" arriba, "11" en el contador, **0** en el mapa.
- **Transaction Network**: 185 errores de clave duplicada de React. El navegador avisa que "puede
  duplicar u omitir elementos", y en pantalla se ven 4 transacciones idénticas.

## 9 · 11 rutas públicas dependen de la semilla borrada

`/similar` da **404 en los 122 desarrollos** porque lee `DEVELOPMENTS_BY_ID`, que quedó en 0 tras el
apagado de la semilla el 14-jul. Mismo caso: `/rank`, `/compliance-badge`, `/zona/{id}/inversion`,
`/properties/search-ai`.

---

# POR QUÉ SE SIENTE DIFÍCIL (medido, no opinado)

## La prueba del niño de 5 años: 2 de 8

Recorrido en navegador real. De 8 preguntas obvias: **2 con respuesta limpia**, 3 con respuestas
contradictorias, 2 sin respuesta, 1 que aterriza en la pantalla equivocada.

Y en la prueba larga de 20 preguntas: **7 se encuentran sin saber dónde están**, 2 son imposibles
(*"¿qué desarrollo tiene más visitas?"* y *"¿cuántos leads entraron esta semana?"* — la lista de leads
**no tiene filtro de fecha**), 3 dan un número engañoso.

## Buscar no sirve

**Cuatro buscadores** con reglas distintas. `visitas`, `tráfico`, `más visto`, `costo ia`, `roto`,
`sin publicar` → **cero resultados en todos**. Sensibles a acentos: `interés` da 2, `interes` da **0**.
La paleta ⌘K pide 50 de 141 comandos ordenados alfabéticamente por dominio → al abrirla **solo se ve
el dominio "demanda"**. Cuando todo falla, la interfaz empuja al Copilot, que está caído.

## Seis niveles de profundidad

`menú → hub → grupo → pestaña → sub-pestaña → panel con sus propias pestañas`. Los 9 hubs pesan 60-91
líneas —son solo listas de pestañas— mientras las pantallas hoja pesan 300-1,100. **Toda la
complejidad está enterrada donde no se ve.**

- 84 pestañas de hub · 45 sub-pestañas sin URL (no se pueden enlazar ni compartir)
- 8 hubs leen la URL, 1 no → atrás/adelante roto en el Hub de Mercado
- 74 redirecciones con `?tab=` fijo **descartan la query entrante** → 3 cadenas rotas verificadas

## El idioma

**278 ocurrencias de jerga visible en 103 archivos.** En la barra lateral, que se ve en el 100% de las
pantallas: *Cubo de métricas · Live Pulse · Transaction Network · Foundation Phase 5 · Knowledge Graph
· Dev Tools · Productos del moat*. **17 de 24 entradas del menú no dicen qué contienen.**

**145 encabezados de tabla son nombres crudos de la base de datos** —`Pm2 Mediana`, `Dwell Mediano Ms`,
`Visitor Id`, `Gap Vertical 3anos`— y **se imprimen en el "Estudio DMX de Zona"**, el documento con
folio y aviso de licencia que se piensa vender.

A los clientes se les llama `Org User B2869298F9F2`. El nombre bueno (CLASS) existe; no se usa fuera
de Inventario.

## Lo que se muestra cuando algo falla

- El JSON de error de la API, crudo y cortado a media palabra: `'Your credit balance is too lo` —
  **dos veces en la misma pantalla**.
- 41 notificaciones, **todas tituladas "Notificación"**, con el cuerpo vacío.
- Una pantalla que se contradice sola: *"TOP 3 CRECIMIENTO: Cuajimalpa +23.73%"* junto a *"TOP 3
  DECLIVE: Cuajimalpa +23.73%"*.
- `alert('Error: ' + JSON.stringify(e))` → un bloque de JSON en un pop-up del navegador.

---

# OPERACIÓN Y SEGURIDAD

## Lo bueno, verificado

**No hay fuga de acceso.** Se probaron las **674 operaciones** de `/api/superadmin/*` sin sesión:
**100% respondieron 401/403**. Cero excepciones, y los 3 falsos positivos se refutaron uno por uno.

**La automatización está viva**: 52 de 71 trabajos corrieron en las últimas 26 horas, el vigía de Drive
hace 4.4 h. *(Corrección a un agente que reportó 65 trabajos muertos: confundió trabajos mensuales con
trabajos caídos. Genuinamente atrasados hay **4**.)*

## Lo que hay que corregir

- **Las alertas críticas llevan semanas invisibles**: se ordenan alfabéticamente, así que "warning"
  queda por encima de "critical". 83 críticas sin resolver y la pantalla muestra 5 advertencias. Las
  que muestra **no se pueden abrir** porque les falta el identificador.
- **Y el tablero grita de más**: marca "atrasado" un trabajo mensual a los 25 días. Por eso nadie lo
  mira — miente por exceso.
- **Suplantar a un cliente es un cheque en blanco.** El pase emitido es idéntico al de ese cliente: se
  registra entrar y salir, pero **nada de lo que se hace en medio**. Cambiar un precio como GDC queda
  atribuido a GDC.
- **Solo el 22% de las escrituras deja bitácora.** Cinco borrados no dejan ninguna, incluido borrar
  planos y fotos de un desarrollo.
- **Ver datos personales no se registra.** Se leyeron 50 leads con nombre, correo y teléfono: la
  bitácora no se movió. *(Hoy no hay ni un correo real —los 59 leads son de prueba— así que es defecto
  de diseño, no fuga.)*
- **El guardia es opt-in**: no hay middleware; cada uno de los 674 manejadores llama su propio guardia
  y hay 6 variantes distintas. Hoy están todos puestos; un olvido abre un endpoint sin que nada avise.

## Mirar vs. hacer

111 pantallas: **56 permiten hacer algo, 55 solo muestran**. Y de las acciones, 37 son "vuelve a
calcular" contra 47 decisiones de negocio reales. Hay más botones para re-ejecutar motores que para
operar el negocio.

## 13 de 25 preguntas de negocio no tienen respuesta hoy

Entre ellas: *¿cuánto me cuesta cada lead? · ¿qué desarrollador me da más valor? · ¿qué pasó desde
ayer? · ¿qué se está degradando? · ¿cuánto me costó la IA por cliente?*. Las tres del medio son
exactamente lo que un dueño revisa cada mañana.

---

# LO QUE EL REBUILD NO PUEDE PERDER

- **La Bandeja Única** de Inventario — es lo único que hoy dice "esto está roto, arréglalo", y funciona.
- **El modelo del catálogo** (`catalogo_maestro.py`): *qué es · qué me dice · para qué sirve · qué hago*.
  El modelo es correcto; fallan la cobertura (29/123 descritas a mano) y las rutas.
- **Los 7 lentes** de `SuperadminDesarrollos` — 1,600+ líneas de análisis tras un botón escondido.
- **El drill** dev → proyecto → torre → unidad (`SuperadminExpediente`).
- **`data-licensing/bundles`**, que se autodelata bien (`data_basis: "demo"`, `sellable: false`) — ese
  es el patrón honesto a copiar en todo lo demás.
- **Deshacer real** de los cambios auto-aplicados (`sync-revert/{audit_id}`): existe y funciona.

## Borrar sin dudar

`SuperadminProyectoFicha.js` (598 líneas, importado pero **nunca se dibuja**) · 11 rutas legacy sin
un solo enlace en el repo · la página de pruebas de componentes montada en el menú de producción ·
el botón "alerta de prueba" que inyecta 9 alertas falsas al flujo real.

---

# LAS 8 DECISIONES DEL REBUILD

1. **¿Se navega por pantalla o por pregunta?** Hoy conviven menú, catálogo, buscador y paleta, con
   tres reglas de búsqueda distintas y ninguna que responda a las palabras del founder.
2. **¿Cuál es la profundidad máxima?** Hoy son 6 niveles y los hubs no aportan más que un separador.
3. **¿La URL es la fuente de verdad?** Hoy es "a veces": 45 sub-pestañas no tienen URL.
4. **¿Un solo vocabulario de URL?** 113 rutas = 35 pantallas + 78 redirecciones, 67 aún enlazadas.
5. **¿Un dato = un dueño?** Hoy no: seis pantallas responden "leads", el inicio contradice a la
   pantalla a la que lleva.
6. **¿Qué se hace con lo que no tiene datos?** Hoy se ve igual que lo que sí. Regla necesaria: vacío
   se ve vacío, roto se ve roto, y **nada se inventa**.
7. **¿Quién escribe los nombres y con qué regla?** 17 de 24 entradas no dicen qué contienen; 21 de 123
   piezas apuntan a "Monetización" por un `fallback` escrito a mano (`catalogo_maestro.py:419`).
8. **¿Las agrupaciones vienen de una sola fuente?** Hoy son dos y no coinciden — marketing bajo
   "Seguridad", precisión del modelo bajo "Inventario".

## Y lo que falta antes de empezar

1. **Completar el catálogo de 41 a 179 motores.** Es el cimiento; sin él, "no se pierde nada" no se
   puede garantizar.
2. **Decidir el principio de orden** (por pregunta / por objeto / por urgencia) — es la decisión que
   define todo lo demás y es del founder.
3. **Definir cuándo está terminado**: *"el founder responde estas 25 preguntas en ≤2 clics y ninguna
   de las 179 piezas queda sin puerta"*.
4. **Crear la red antes de mover el trapecio**: hoy hay **cero pruebas de interfaz** en 111 pantallas.
