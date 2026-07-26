# REGISTRO VIVO · REBUILD DEL SUPERADMIN

> Todo lo que se va descubriendo: errores, mejoras, decisiones y pendientes. **Documento vivo** — se
> agrega en cada hallazgo para que nada se pierda entre sesiones.
> Auditoría completa en [[AUDITORIA_SUPERADMIN]] · doctrina general en [[AUDITORIA_TOTAL_A_Z]].
>
> Estados: 🔴 sin arreglar · 🟡 en curso · ✅ arreglado · 🔵 decisión del founder · ⚪ diferido

---

## 1 · YA ARREGLADO EN ESTA SESIÓN

| | Qué pasaba | Commit |
|---|---|---|
| ✅ | **El listado decía 48 unidades y la ficha del mismo edificio decía 1.** Dos causas: el total del brochure se leía con un nombre de campo que solo 1 de 122 devs usa, y la ficha pisaba el total siempre. Afectaba a **109 de 113** devs publicados | `0a3153fc` |
| ✅ | **"262 visitantes únicos" eran 16.** Sumaba conteos de únicos por dimensión entre 40 filas | `2f937540` |
| ✅ | **El índice DMX-30 marcaba 147 y era 91.** Bastaba UNA colonia para reencadenar el nivel; el 14-jul saltó +46.9% con una sola. Ahora exige mínimo 3 | `2f937540` |
| ✅ | **"Nivel 40 vale +25.6% (94 edificios)"** — el 94 era el total del bloque; ese nivel se apoya en 2. Ahora cita el n de ese nivel y avisa "son pocos casos" | `2f937540` |
| ✅ | **La pantalla borraba `es_estimado` y `fuente`** antes de pintar, y cortaba las tablas a 8 columnas justo donde caían las que dicen cuántos casos hay | `2f937540` |
| ✅ | **FUGA DE DATOS ENTRE CLIENTES en el Cerebro.** El filtro leía la semilla vacía → lista vacía → `{}` = sin filtro. Cada dev veía las **6,420 unidades de todos** y el Cerebro le proponía bajar el precio de una unidad de otro cliente. Cerrado y probado en ambos sentidos | `3d7d8aa1` |
| ✅ | **Prueba nueva que vigila el error real**: un día con una sola colonia no puede mover el índice | `2f937540` |

---

## 2 · ERRORES ABIERTOS · ordenados por daño

### 🔴 CRÍTICO — mienten hoy

| # | Qué | Dónde | Costo |
|---|---|---|---|
| E1 | **"La tasa de Banxico está en 8.8%"** — no es una tasa: es el valor de la UDI, con fecha del FUTURO. Se lee la tabla sin filtrar la serie. De ahí sale la mensualidad de $56,762 que se muestra | `routes/superadmin_devmaster.py:1523` | chico |
| E2 | **Las 3 gráficas de tendencia del inicio son inventadas.** `mrr*0.78, *0.82, *0.86…` — el propio código dice *"Simulated 90d sparkline data for visual interest"*. Está a un clic de la Sala de Inversionistas | `SuperadminFounderConsole.js:334` | chico |
| E3 | **16 colonias con `momentum` y `trend` escritos a mano** que alimentan el portal del desarrollador, el ticker de la landing y ColoniasBento — con un comentario que dice "data real" | `frontend/src/data/colonias.js` | chico |
| E4 | **El índice de precios DRPI es 99.8% sintético** (59,832 de 59,956 con `synthetic:true`) y responde `available:true`. Encima de eso se calcula *"92.7% de probabilidad de subida, confianza ALTA"* | `drpi` | medio |
| E5 | **Las calificaciones de zona salen al PÚBLICO con relleno**: 50/50 con `placeholder_flags`, `denue_density` exactamente 50.0. Lo ve el comprador | `/api/public/zone-score` | medio |
| E6 | **Clientes: 0 en el inicio vs 6 en la pantalla a la que ese número lleva.** El inicio lee `db.tenants` (vacía), la pantalla lee `db.dev_orgs`. Por eso los ingresos son $0 siempre | `founder_console.py:75` vs `superadmin_tenants.py:140` | chico |


### 🔴 CRÍTICO — vinculación rota entre portales *(agente 07-26)*

| # | Qué | Costo |
|---|---|---|
| E36 | **Asignar un lead a un asesor NO llega.** El founder escribe `assigned_asesor_id` en `visit_requests` (3 registros); el asesor lee `assigned_to`/`asesor_id` en `db.leads` (59). Nunca se cruzan. El founder **no puede reasignar un lead real** | medio |
| E37 | **El cotizador del asesor lee la semilla muerta** → devuelve `[]` siempre. Afecta 4 pantallas. El mismo asesor ve dos catálogos distintos según la pantalla | medio |
| E38 | **Suspender un cliente no despublica su inventario.** Corta el acceso, pero sus proyectos siguen en el marketplace. Y la suspensión se guarda en un documento fantasma: `Tenants` usa `org_id`, las otras 18 partes usan `tenant_id` — **0 documentos tienen `org_id`** | medio |
| E39 | **El dashboard del desarrollador calcula sobre la semilla vacía** → le salen ceros pase lo que pase (4 endpoints) | medio |
| E40 | **El dueño legítimo recibe 403 en 2 pantallas** (`dev_can_access_project` usa la semilla) | chico |
| E41 | **`oculto_ficha` esconde 1,791 unidades (30%) y NO tiene un solo escritor** en código ni interfaz. Solo se puede tocar a mano en la base. Entre ellas 4 disponibles invisibles al comprador | chico |
| E42 | **"El precio efectivo de una unidad" tiene 3 implementaciones distintas.** Hoy coinciden solo porque los overrides están vacíos; el día que un dev edite, los tres portales dirán cosas distintas | medio |
| E43 | **"El dueño de un lead": 4 campos en 3 colecciones** (`assignee_id` 42 · `assigned_to` 17 · `asesor_id` 3 · `assigned_asesor_id`) | medio |
| E44 | **161 archivos siguen importando la semilla muerta** | grande |

**El founder NO puede desde su consola:** reasignar un lead real · borrar un desarrollo o unidad ·
resetear la contraseña de un cliente (por eso quedaron 5 cuentas sin acceso) · crear o administrar
asesores · ocultar/mostrar una unidad al público · limpiar los 5 desarrollos basura.

### 🔴 ALTO — datos sucios

| # | Qué | Costo |
|---|---|---|
| E7 | **El cubo nunca se poda**: 116 filas de desarrollos del seed borrado inflan los totales. El mismo cubo se contradice: ciudad 5,877 · suma de colonias 7,693 · suma de desarrollos 7,798 | minutos |
| E8 | **Recalcula solo si la fila NO EXISTE, jamás si está vieja.** 4 sitios con `if existing == 0`. Es la causa del 5,877: foto de las 09:00, Liverpool entró 09:26 | una tarde |
| E9 | **`/tiers` fuerza el recálculo de alcaldía, colonia y desarrollo — pero NO de `city`**. El cubo se desincroniza consigo mismo cada vez que alguien abre la pantalla | 1 línea |
| E10 | **`devmaster/home` muestra 164 unidades** para 122 desarrollos: lee un escalar que solo 1 de los 122 tiene | chico |
| E11 | **5 "desarrollos" que son carpetas de Drive**: VIDEO, PLANOS, FOTOS, PRESENTACION, DISPONIBILIDAD Y PRECIOS. Creados 26-jul 08:27, 0 unidades, contaminan todos los conteos 🔵 *requiere OK para borrar* | minutos |
| E12 | **Cuatro nombres para lo mismo**: `total_units`, `units_total`, `units_count`, `total_units_project`. De ahí nacen el 164 y el 9,658 del marketplace | medio |
| E13 | **`metric_grid` congelado desde el 29-jun** (6,168 docs). Su escritor existe (`grid_engine.py:709`) pero **nadie lo llama** y no está registrado como tarea. Y si se llamara daría 0 celdas: construye su eje geo desde el seed borrado | medio |

### 🔴 ALTO — se pierde información

| # | Qué | Costo |
|---|---|---|
| E14 | **Mi `guardian_precio.aplicar_precio` está huérfano** — nadie lo llama. Era el punto único de registro. Por eso hay 5 escritores de precios y **de 9 cambios reales, 6 no dejaron rastro** | chico |
| E15 | **`fuente_plausible` nunca se conectó** — el detector de listas cruzadas. Es justo el que debía cazar la lista de Cova Nuevo León guardada dentro de Tabacalera | chico |
| E16 | **Publicar/despublicar no deja traza**: 0 eventos en toda la base. `published_at` existe en 1 de 122 | chico |
| E17 | **Solo el 22% de las escrituras deja bitácora.** 5 borrados no dejan ninguna, incluido borrar planos y fotos | medio |
| E18 | **`quien` es el observador, no el autor**: el precio subió 12.4% y el responsable queda como `"cron"`. 0 de 51 eventos de estatus tienen actor | medio |
| E19 | **No existe el campo `motivo`** en ninguna serie temporal. Se sabe qué cambió, nunca por qué | medio |
| E20 | **28 de 51 ventas son fantasmas revertidos** (`revertido:true`, "la unidad no aparecía en la lista nueva"). 14 con `days_to_sell: 0`. La métrica de velocidad de venta come de ahí | medio |

### 🟠 MEDIO — la consola no sirve para operar

| # | Qué | Costo |
|---|---|---|
| E21 | **Las alertas críticas llevan semanas invisibles**: se ordenan alfabéticamente, "warning" queda encima de "critical". 83 sin resolver, la pantalla muestra 5 advertencias. Y las que muestra **no se pueden abrir** (les falta el identificador) | chico |
| E22 | **El tablero de salud grita de más**: marca "atrasado" un trabajo mensual a los 25 días. Por eso nadie lo mira | chico |
| E23 | **387 contradicciones entre fuentes sin ninguna pantalla que las liste.** Y el contador está escondido detrás de un `if` sobre OTRA colección: si no hay solicitudes pendientes, las 387 desaparecen de pantalla | chico |
| E24 | **41 notificaciones, todas tituladas "Notificación"**, cuerpo vacío | chico |
| E25 | **Live Pulse nunca dibuja nada**: se le pasa una variable CSS a Mapbox como color, las capas no se agregan. Dice "50 zonas", el contador "11", el mapa 0 | chico |
| E26 | **Transaction Network: 185 errores de clave duplicada.** El navegador avisa que "puede duplicar u omitir elementos" y se ven 4 transacciones idénticas | chico |
| E27 | **11 rutas públicas dependen del seed borrado**: `/similar` da 404 en los 122 desarrollos. También `/rank`, `/compliance-badge`, `/zona/{id}/inversion` | medio |
| E28 | **`cron_heartbeat.reset_24h_counters` nunca corre** → `fail_count_24h` solo sube y el tablero lo lee como ventana de 24 h | chico |
| E29 | **El error crudo de la API impreso dos veces** en Intelligence Hub: `'Your credit balance is too lo` cortado a media palabra | chico |
| E30 | **La tecla Esc no cierra el Copilot** aunque su propio pie diga que sí. Su fondo bloquea todos los clics de la app | chico |

### 🟡 MEDIO — seguridad y trazabilidad

| # | Qué |
|---|---|
| E31 | **Suplantar a un cliente es un cheque en blanco**: el pase es idéntico al suyo. Se registra entrar y salir, **nada de lo que se hace en medio** |
| E32 | **Salir de la suplantación te expulsa** (borra los dos tokens) → desincentiva salir |
| E33 | **Ver datos personales no se registra.** 50 leads leídos con nombre, correo y teléfono: la bitácora no se movió |
| E34 | **El guardia es opt-in**: 674 manejadores llaman su propio guardia a mano, con 6 variantes. Un olvido abre un endpoint sin que nada avise |
| E35 | **Acciones sin confirmación ni bitácora**: revocar certificación, subir CSV masivo, cambiar el plan de un cliente |

---

## 3 · LO QUE FALTA (no es error, es ausencia)

- **13 de 25 preguntas de negocio no tienen respuesta hoy.** Las tres que más duelen: *¿cuánto me
  cuesta cada lead? · ¿qué pasó desde ayer? · ¿qué se está degradando?*
- **No existe pantalla de "qué necesita mi atención"** que funcione (la que hay engaña, ver E21).
- **El hueco no se puede recorrer.** Se puede contar en 5 campos (`valor_informacion`), pero ningún
  endpoint acepta "dame las unidades sin plano". `$exists` aparece 6 veces en todo el backend y
  ninguna expuesta como filtro.
- **Huecos medidos:** 1,522 unidades sin precio (26%) · 1,792 sin m² (30%) · 2,022 sin recámaras ·
  1,674 sin plano · **3,300 sin colonia (56%)** · 5,063 sin vista (86%). Desarrollos: 101 sin fecha
  de entrega · 64 sin fotos · 32 sin total de unidades · **0 con dirección marcada "exacta"**.
- **Cero pruebas de interfaz** en 111 pantallas.
- **Cero medición del uso de la propia consola** — no se sabe qué pantallas abre el founder.
- **Linaje incompleto**: 95.5% de las unidades tienen el renglón crudo, solo **9.6% el nombre del
  archivo**. De 10 números rastreados, 2 llegan al archivo original, 2 se cortan del todo.

---

## 4 · MEJORAS Y UPGRADES IDENTIFICADOS

| | Idea | Por qué |
|---|---|---|
| U1 | **Todo número trae su "vs. ayer"** — pero con cohorte fija | Ver R1: sin eso reporta un desplome del 47% que no existió |
| U2 | **Estado + evento juntos**: la foto compara, el evento explica | *"Entraron 23 unidades de la lista de Liverpool del 26-jul"* es lo que se quiere leer |
| U3 | **El hueco como dato buscable**: `?falta=plano,precio,m2` | Saber qué desarrollador entrega mal la lista |
| U4 | **La certeza como parte del número**, no como campo oculto | Ya existe `metric_normalizer` (MIN_REAL=8) y **lo usan 12 de 496 archivos** |
| U5 | **Aplicar `metric_normalizer` a los 44 bloques de reportes** | Hoy no lo usa ninguno |
| U6 | **`es_estimado` debe significar "muestra suficiente"**, no "¿hay filas?" | Hoy significa lo segundo en el **87.7%** de sus 154 usos |
| U7 | **Suprimir, no solo etiquetar**, cuando la muestra es mínima | Solo **6 de 44** bloques suprimen; ~14 no tienen ninguna defensa |
| U8 | **Un solo helper de conteo** — ya existe `unidades_efectivas()` y lo usan 12 motores | Falta que lo usen founder-console, devmaster/home, estado_catalogo y metrics-cube |
| U9 | **Guardar `_archivo` en el 100% de las unidades** (hoy 9.6%) | Poder enseñarle al desarrollador el PDF del que salió su precio |
| U10 | **Lista navegable de las 387 peleas** | Hoy son un número sin drill |
| U11 | **Reversibilidad universal** | Existe `sync-revert` y funciona, pero solo para un caso |
| U12 | **Snapshot diario garantizado** | De 76 fotos del catálogo, **1 sola** vino del cron semanal; 72 son ráfagas de carga (dos separadas por 6 segundos) |
| U13 | **Sacar las salidas del ML del hash del histórico** | De 3,094 unidades que "cambiaron", 1,352 no cambiaron nada del negocio: quedó grabado que el modelo cambió de opinión |
| U14 | **Medir la consola nueva desde el día uno** | Para que la v2 se decida con datos |

---

## 5 · RIESGOS ANOTADOS

- **R1 · La composición mata la comparación.** El catálogo pasó de 80 a 5,924 unidades en 12 días.
  Un "vs. la semana pasada" ingenuo reportaría **-47% en el mercado de CDMX**. Toda comparación
  necesita cohorte fija (mismas unidades en ambas fechas).
- **R2 · La explosión combinatoria es real y peor de lo estimado.** Medido sobre las 5,924 unidades:
  con **2 cortes ya el 63%** de las celdas tiene menos de 5 casos; **con 4 cortes, el 90%**, y el 47%
  tiene exactamente uno. Y está subestimado: solo aparecen 22 colonias porque el 56% de las unidades
  no tiene colonia. **La UI ya permite cruces múltiples hoy.**
- **R3 · Todo el tiempo depende de APScheduler dentro del proceso.** Sin crontab, sin cola
  persistente. Si la Mac duerme o el backend reinicia, **ese día no existe en ninguna serie** — y
  como el diseño deduplica, un hueco es indistinguible de "no cambió nada".
- **R4 · 140 afirmaciones con n<5** hoy en los reportes. Las peores: `indice_adelantado` (39),
  `curva_vertical` (22), `screener` (15), `corredores` (15).

---

## 6 · DECISIONES PENDIENTES DEL FOUNDER

| | |
|---|---|
| 🔵 **El principio de orden del rebuild** | Propuesta: la pregunta en la puerta · 5 objetos en el primer nivel (Desarrollos, Compradores, Asesores, Zonas, Dinero) · la cascada adentro · los 179 motores como **lentes** que se prenden encima, no como destinos |
| 🔵 **Borrar los 5 "desarrollos" que son carpetas de Drive** | Evidencia en contra: se llaman VIDEO/PLANOS/FOTOS, 0 unidades, creados por una corrida de ingesta |
| 🔵 **Liverpool: publicar o no** | Cargado y verificado, esperando visto bueno |
| 🔵 **¿Se mide primero el uso de la consola, o se diseña por lógica de negocio?** | Medir tarda días en dar datos |

---

## 7 · LO QUE EL REBUILD NO PUEDE PERDER

- **La Bandeja Única** de Inventario — lo único que hoy dice "esto está roto, arréglalo", y funciona.
- **El modelo del catálogo** (`catalogo_maestro.py`): *qué es · qué me dice · para qué sirve · qué hago*.
- **Los 7 lentes** de `SuperadminDesarrollos` — 1,600+ líneas tras un botón escondido.
- **El drill** dev → proyecto → torre → unidad, y la **biografía de la unidad** (que reconstruye
  precio y venta completos).
- **`data-licensing/bundles`**, que se autodelata bien (`data_basis:"demo"`, `sellable:false`) — el
  patrón honesto a copiar en todo lo demás.
- **`metric_normalizer`** — la primitiva correcta de la certeza, ya escrita.
- **La capa del átomo**: `dmx_units` (6,420) sincronizada cada hora, con su propio juez que reporta
  `fantasmas: 0 · convergen: True`.

## Borrar sin dudar

`SuperadminProyectoFicha.js` (598 líneas, nunca se dibuja) · 11 rutas legacy sin un solo enlace ·
la página de pruebas de componentes montada en el menú de producción · el botón "alerta de prueba"
que inyecta 9 alertas falsas al flujo real.

---

## 8 · CORRECCIONES A MIS PROPIAS AFIRMACIONES

Se anotan porque el founder decide con esto y merece saber qué cambió:

| Dije | La verdad |
|---|---|
| "El cubo del átomo está vacío" | **Falso.** Confundí nombres de módulo con nombres de tabla. `dmx_units` = 6,420, sincronizado cada hora, `convergen: True` |
| "Ninguna pantalla compara contra el pasado" | **Falso.** Hay ~24 comparaciones reales; el vigía muestra deltas correctos |
| "La maquinaria del tiempo está casi vacía" | **Parcial.** 23 series con ≥20 días. No está vacía: es **joven** (techo ~54 días) |
| "Falta el cuarto eje, la certeza" | **Mal enunciado.** El eje existe y el 77.5% de las afirmaciones trae su n. Se calcula, se transporta y **la pantalla lo tira** |
| "El guardián de precios quedó conectado a 3 puertas + wizard" (auditoría anterior) | **Parcial.** El detector de saltos sí; el **punto único de registro quedó huérfano** y el detector de listas cruzadas nunca se conectó |
