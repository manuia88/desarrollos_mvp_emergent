# PLAN DE ACCIÓN COMPLETO · REBUILD DEL SUPERADMIN

> Todo lo encontrado en 7 auditorías, ordenado en fases ejecutables. **Nada omitido**: los 55
> errores (E1–E55), los 14 upgrades (U1–U14) más 3 nuevos, los 4 ciclos y las 3 reglas transversales.
> Hallazgos en [[BACKLOG_SUPERADMIN_REBUILD]] · evidencia en [[AUDITORIA_SUPERADMIN]].
>
> **Condición del founder, innegociable:** no se pierde, no se quita, no se elimina ninguna feature,
> motor, índice o score. Las 179 piezas siguen vivas al 100%.

---

## LAS 3 REGLAS TRANSVERSALES

Salen del patrón que se repitió en los 55 errores. Aplican a **todo** lo que sigue.

**R-A · Por defecto, cerrado.** Cuando algo falla o falta, el sistema se cierra: sin datos no se ve
nada, sin muestra suficiente se marca estimado, sin aprobación no se publica.
*Nace de:* el filtro del Cerebro que se abría (E-fuga), el portón público abierto por defecto (E45),
`es_estimado` que significa "¿hay filas?" (U6), el respaldo que destruía al bueno.

**R-B · Ninguna acción sin lector.** Nada entra al sistema si no hay alguien nombrado que lo lea
aguas abajo.
*Nace de:* asignar un lead que nadie recibe (E36), suspender con una llave que 0 documentos usan
(E38), publicar en un campo que la pantalla no lee (E45).

**R-C · Todo dato viaja con su certeza y su origen.** El número, cuántos casos lo respaldan y de qué
archivo salió van juntos o no van.
*Nace de:* la pantalla que borra `es_estimado` (arreglado), el índice de una colonia (arreglado),
las 140 afirmaciones con n<5 (R4), el linaje que llega al archivo en 9.6% de los casos (U9).

---

# FASE 0 · DETENER LA MENTIRA
**Antes que nada. Son baratos y hoy te dan números falsos.**

| Paso | Qué | Ref | Verificación |
|---|---|---|---|
| 0.1 | Filtrar la serie de Banxico por `series_id`. Hoy toma el registro más nuevo sin filtrar: es el valor de la UDI, con fecha del futuro, presentado como "tasa 8.8%" — y de ahí sale una mensualidad | E1 | La tasa mostrada = SF43783 (TIIE 28d) con su fecha real |
| 0.2 | Borrar las 3 gráficas inventadas del inicio, o alimentarlas con historia real | E2 | `grep "Simulated"` → 0 en producción |
| 0.3 | Quitar `momentum`/`trend` escritos a mano de `data/colonias.js` (alimentan el portal del dev, el ticker de la landing y ColoniasBento con un comentario que dice "data real") | E3 | Esos 3 consumidores leen del backend o muestran vacío honesto |
| 0.4 | `drpi` debe responder `available:false` cuando el 99.8% de sus datos son sintéticos. Y "92.7% de probabilidad, confianza ALTA" no se calcula sobre eso | E4 | El bloque declara su naturaleza; la probabilidad no se publica sin base real |
| 0.5 | `/api/public/zone-score` no sirve calificaciones con `placeholder_flags` o `denue_density=50.0` exacto. **Esto lo ve el comprador** | E5 | Muestra de 50 zonas: 0 con relleno servido al público |
| 0.6 | Unificar la fuente de clientes: el inicio lee `db.tenants` (vacía), la pantalla lee `db.dev_orgs` (6). Por eso los ingresos son $0 siempre | E6 | Inicio y pantalla dicen el mismo número |
| 0.7 | Alertas: ordenar por gravedad real, no alfabética ("warning" quedaba encima de "critical"). Y darles identificador para poder abrirlas | E21 | Las 83 críticas aparecen primero y se abren |
| 0.8 | El tablero de salud debe conocer la periodicidad: un trabajo mensual no está atrasado a los 25 días | E22 | Las alertas bajan de 83 a las 4 reales |
| 0.9 | KPI "Anomalías 1" vs panel "(0)" congelado en "Cargando…" · Quick actions duplicados | E55 | Un solo número; los botones aparecen una vez |

---

# FASE 1 · LA PRUEBA DE CABLEADO ⭐
**El upgrade de mayor efecto: ataca la causa de los 55 síntomas, no los síntomas.**

Encontré el mismo error 12 veces esta sesión: **construido, pagado y desconectado.** Lo detecté a
mano cada vez. Es mecanizable.

| Paso | Qué detecta | Ref |
|---|---|---|
| 1.1 | **Motor sin lector**: existe y nadie lo importa ni lo llama | E13 `metric_grid` · E14 `aplicar_precio` · E15 `fuente_plausible` |
| 1.2 | **Ruta sin pantalla**: endpoint que ninguna pantalla llama | 76 de 240 rutas |
| 1.3 | **Campo escrito sin lector**: se guarda y nadie lo consulta | E41 `oculto_ficha` (1,791 unidades ocultas, sin escritor ni lector en UI) |
| 1.4 | **Campo leído sin escritor**: la pantalla pide lo que nadie manda | E24 notificaciones (arreglado) · E39 dashboard del dev |
| 1.5 | **Cálculo que muere en el borde**: el backend lo manda y la UI lo descarta | `es_estimado` (arreglado) · U5 |
| 1.6 | **Tarea programada sin registrar** ni sin latido | E28 `reset_24h_counters` |
| 1.7 | **Importadores de la semilla muerta**: 161 archivos | E44 |
| 1.8 | Correrla en cada cambio y **que truene**, no que avise | — |

**Entregable:** una prueba que falla cuando algo queda desconectado. A partir de ahí, ningún tubo sin
enchufar entra al repositorio.

---

# FASE 2 · UN DATO, UN DUEÑO
**La causa raíz de que ningún número se pueda creer.**

## 2.1 · El conteo de unidades

| Paso | Qué | Ref |
|---|---|---|
| 2.1.1 | Que founder-console, devmaster/home, estado_catalogo y metrics-cube usen `unidades_efectivas()`, que ya existe y usan 12 motores | U8 · E10 |
| 2.1.2 | **Podar el cubo**: 116 filas de desarrollos borrados inflan los totales. El cubo se contradice consigo mismo (ciudad 5,877 · colonias 7,693 · desarrollos 7,798) | E7 |
| 2.1.3 | **Invalidar por antigüedad, no por ausencia.** 4 sitios con `if existing == 0`: solo recalculan si la fila NO existe, jamás si está vieja. Es la causa del 5,877 (foto de 09:00, Liverpool entró 09:26) | E8 |
| 2.1.4 | Incluir `city` en `/tiers` — hoy recalcula alcaldía, colonia y desarrollo pero no ciudad, y el cubo se desincroniza consigo mismo cada vez que abres la pantalla | E9 |
| 2.1.5 | Un solo nombre de campo: hoy conviven `total_units`, `units_total`, `units_count`, `total_units_project` | E12 |
| 2.1.6 | Purgar las 496 unidades fantasma del cubo (desarrollos demo apagados en código, vivos en su proyección) | E7 |

## 2.2 · El estado de publicación

| Paso | Qué | Ref |
|---|---|---|
| 2.2.1 | **Un solo campo.** Hoy la pantalla lee `published_at` (1 registro), el botón escribe `marketplace_published` (115), y el portón filtra `!= False`. Tu catálogo dice 1 publicado y en la calle hay 113 | E45 |
| 2.2.2 | **Portón cerrado por defecto** (R-A): publicado solo si dice explícitamente que sí | E45 |
| 2.2.3 | La puerta pública debe mirar también el estado del cliente: suspendido = fuera del marketplace | E38 |
| 2.2.4 | Registrar publicar/despublicar con actor y fecha (hoy: 0 eventos en toda la base) | E16 |

## 2.3 · El precio efectivo

| Paso | Qué | Ref |
|---|---|---|
| 2.3.1 | Colapsar las **3 implementaciones** en `unidades_efectivas`. Hoy coinciden solo porque los overrides están vacíos; el día que un dev edite, los 3 portales dirán cosas distintas | E42 |
| 2.3.2 | **Un solo punto de entrada para escribir precios**: conectar `aplicar_precio`, que está huérfano. Hoy hay 5 escritores y de 9 cambios reales, 6 no dejaron rastro | E14 |
| 2.3.3 | Conectar `fuente_plausible` — el detector de listas cruzadas, nunca enchufado. Es el que debía cazar la lista de Cova Nuevo León dentro de Tabacalera | E15 |

## 2.4 · El dueño de un lead

| Paso | Qué | Ref |
|---|---|---|
| 2.4.1 | Un solo campo de asignación. Hoy: `assignee_id` (42) · `assigned_to` (17) · `asesor_id` (3) · `assigned_asesor_id` (otra colección) | E43 |
| 2.4.2 | Que el founder pueda reasignar un lead REAL. Hoy escribe en `visit_requests` (3 registros) y el asesor lee `db.leads` (59): nunca se cruzan | E36 |

## 2.5 · La identidad del cliente

| Paso | Qué | Ref |
|---|---|---|
| 2.5.1 | Una sola llave: `tenant_id`. Hoy `Tenants` usa `org_id` y las otras 18 partes usan `tenant_id` — **0 documentos tienen `org_id`**, así que suspender crea un registro fantasma | E38 |

## 2.6 · Enterrar la semilla muerta

| Paso | Qué | Ref |
|---|---|---|
| 2.6.1 | Migrar los **161 archivos** que aún importan `DEVELOPMENTS` (0 elementos) a leer de la base | E44 |
| 2.6.2 | Arreglar las 11 rutas públicas que dependen de ella (`/similar` da 404 en los 122 desarrollos, `/rank`, `/compliance-badge`, `/zona/{id}/inversion`, `/properties/search-ai`) | E27 |
| 2.6.3 | El cotizador del asesor (4 pantallas) devuelve `[]` siempre | E37 |
| 2.6.4 | El dashboard del desarrollador da ceros pase lo que pase (4 endpoints) | E39 |
| 2.6.5 | El dueño legítimo recibe 403 en 2 pantallas | E40 |
| 2.6.6 | `metric_grid`: decidir — conectarlo con su eje geo desde la base, o retirarlo. Hoy congelado desde el 29-jun y si se llamara daría 0 celdas | E13 |

---

# FASE 3 · LA CERTEZA COMO PARTE DEL NÚMERO *(U4)*
**El eje existe (`metric_normalizer`, MIN_REAL=8) y lo usan 12 de 496 archivos.**

| Paso | Qué | Ref |
|---|---|---|
| 3.1 | Aplicar `metric_normalizer` a los 44 bloques de reportes — hoy no lo usa ninguno | U5 |
| 3.2 | `es_estimado` debe significar **"muestra suficiente"**, no "¿hay filas?" — significa lo segundo en el 87.7% de sus 154 usos | U6 |
| 3.3 | **Suprimir, no solo etiquetar**, cuando la muestra es mínima. Hoy 6 de 44 bloques suprimen; ~14 no tienen ninguna defensa | U7 |
| 3.4 | Revisar las **140 afirmaciones con n<5**: `indice_adelantado` (39), `curva_vertical` (22), `screener` (15), `corredores` (15) | R4 |
| 3.5 | Guardar `_archivo` en el 100% de las unidades (hoy **9.6%**) para poder enseñarle al desarrollador el PDF del que salió su precio | U9 |
| 3.6 | Procedencia en `contexto_timeline` (hoy 0 campos) — el DMX-30 es irreconstruible | U9 |
| 3.7 | **El hueco como dato recorrible**: filtro `?falta=plano,precio,m2`. Hoy se puede contar en 5 campos y no recorrer en ninguno | U3 |
| 3.8 | Ampliar el catálogo de huecos: hoy cubre 5 campos. Faltan colonia (56% sin ella), vista (86%), acabados, fecha de entrega (el campo **no existe** por unidad) | U3 |

| 3.9 | **Freno a la explosión combinatoria (R2).** Medido sobre las 5,924 unidades: con **2 cortes el 63%** de las celdas tiene menos de 5 casos; **con 4 cortes, el 90%**, y el 47% tiene exactamente uno. Y está subestimado, porque solo aparecen 22 colonias (el 56% de las unidades no tiene colonia). **La interfaz ya permite cruces múltiples hoy.** El corte no se prohíbe: la celda que no alcanza el mínimo se muestra vacía y se dice por qué | R2 |

---

# FASE 4 · LA HISTORIA QUE SE PUEDE LEER

| Paso | Qué | Ref |
|---|---|---|
| 4.1 | **Cohorte fija en toda comparación.** Un "vs. la semana pasada" ingenuo reportaría **-47% en el mercado de CDMX**: el catálogo pasó de 80 a 5,924 unidades en 12 días. No hubo desplome, hubo carga | R1 · U1 |
| 4.2 | Sacar las salidas del modelo del hash del histórico: de 3,094 unidades que "cambiaron", 1,352 no cambiaron nada del negocio | U13 |
| 4.3 | Snapshot diario garantizado: de 76 fotos del catálogo, **1 sola** vino del cron; 72 son ráfagas de carga (dos separadas por 6 segundos) | U12 |
| 4.4 | Campo `motivo` y **actor real** en los eventos: hoy el precio sube 12.4% y el responsable queda como `"cron"` — que solo lo notó. 0 de 51 eventos de estatus tienen autor | E18 · E19 |
| 4.5 | Bitácora obligatoria en toda escritura (hoy 22%), empezando por los 5 borrados que no dejan rastro — incluido borrar planos y fotos | E17 |
| 4.6 | Revisar las **28 de 51 ventas fantasma revertidas** (14 con `days_to_sell: 0`) que alimentan la métrica de velocidad de venta | E20 |
| 4.7 | Estado + evento juntos: la foto compara, el evento explica. *"Entraron 23 unidades de la lista de Liverpool del 26-jul"* | U2 |
| 4.8 | Sacar el tiempo de APScheduler dentro del proceso: si la Mac duerme, **ese día no existe en ninguna serie** — y un hueco es indistinguible de "no cambió nada" | R3 |

---

# FASE 5 · CERRAR LOS 4 CICLOS

## 5.1 · El ciclo del dato faltante — **al 80%**
La bandeja detecta el hueco · el expediente dice quién lo debe dar · existe "copiar mensaje para
WhatsApp". **Falta:** mandarlo, anotar que se pidió, detectar solo cuándo llegó, y medir qué
desarrollador entrega mal. *Esto convierte la plataforma en algo que le cobra trabajo al
desarrollador en vez de que lo hagas tú.*

## 5.2 · El ciclo del lead — **al 40%**
Entra, se guarda, ahí muere. **Resend y Twilio están pagados y el código nunca los llama.**
**Falta:** avisar al entrar · asignar de verdad (2.4) · reloj de respuesta (hoy `first_response_at`
tiene 6 lectores y **cero escritores**) · detalle del lead con nota e historial (E52) · medir.
*Y antes de abrir al público: consentimiento en el formulario — hoy 0 de 59, y el backend anota que
se mostró un aviso que nunca se mostró.*

## 5.3 · El ciclo del precio — **al 60%**
El guardián detecta el absurdo. **Falta:** punto único de escritura (2.3.2), detector de listas
cruzadas (2.3.3), registro con actor y motivo (4.4), aviso de qué cambió.

## 5.4 · El ciclo de la ingesta — **al 70%**
Drive → vigía → bandeja → aprobar → publicado → visible. **Falta:** confirmación antes de gastar API
(E49) · rechazar/borrar de la cola (E47) · un solo estado de publicación (2.2) · sacar la basura
(los 5 "desarrollos" llamados VIDEO, PLANOS, FOTOS, PRESENTACION, DISPONIBILIDAD Y PRECIOS — E11).

---

# FASE 6 · PODER OPERAR
**2 de 8 flujos se terminan hoy. Encontrar no era el problema.**

| Paso | Acción que falta | Ref |
|---|---|---|
| 6.1 | **Rechazar / borrar** un proyecto pendiente. Hoy: imposible, los 6 quedan atorados para siempre | E47 |
| 6.2 | **Publicar / despublicar desde la ficha del desarrollo** — hoy no existe el botón | E45 |
| 6.3 | Que el mismo objeto tenga **las mismas acciones en todas las pantallas**: hoy "Aprobar" está bloqueado en una y "Publicar" libre en otra, sin candado | E48 |
| 6.4 | **Borrar/suspender un desarrollador** y **corregir su correo de acceso**. Hoy "Editar" cambia el correo de contacto, no el de entrada: un typo = un dev que nunca entra y no se puede quitar | E53 |
| 6.5 | **Confirmación antes de gastar**: "Aprobar e ingerir" dispara una ingesta que cuesta API sin preguntar | E49 |
| 6.6 | *(U11)* **Deshacer** en Ignorar, Silenciar y Asignar — y hacerlo universal: hoy solo existe para los cambios auto-aplicados de la ingesta, donde funciona bien | E49 |
| 6.7 | **Detalle del lead + nota/bitácora**: la pantalla tiene 0 botones y 0 enlaces | E52 |
| 6.8 | **Corregir el dato desde el semáforo**, no solo silenciarlo: hoy la única salida a un error real es 🔇 "esto está bien" | E50 |
| 6.9 | **Una sola bandeja.** Hoy hay tres y la campana lleva a la que no puede arreglar nada; la buena está escondida | E51 |
| 6.10 | **Entregar el reporte**: descargar PDF y liga para el cliente. Hoy se genera excelente y no se puede mandar | E54 |
| 6.11 | **Ocultar/mostrar una unidad al público**: `oculto_ficha` esconde 1,791 (30% del inventario) y solo se toca a mano en la base. 4 disponibles invisibles al comprador | E41 |
| 6.12 | *(U10)* **Una lista navegable de las 387 contradicciones** entre fuentes — hoy son un número, y el contador está escondido detrás de un `if` sobre otra colección | E23 |

---

# FASE 7 · SEGURIDAD Y TRAZABILIDAD

| Paso | Qué | Ref |
|---|---|---|
| 7.1 | **Marcar la suplantación en el pase** para que todo lo hecho en ese modo quede a tu nombre. Hoy es idéntico al del cliente: cambias un precio como GDC y la bitácora dice que lo hizo GDC | E31 |
| 7.2 | Salir de la suplantación devuelve tu sesión, no te expulsa | E32 |
| 7.3 | **Registrar quién consulta datos personales.** 50 leads leídos con nombre, correo y teléfono: la bitácora no se movió. *(Hoy los 59 leads son de prueba: es defecto de diseño, no fuga)* | E33 |
| 7.4 | **Un guardia estructural** (middleware) en vez de 674 manejadores llamando su propio guardia con 6 variantes distintas. Hoy están todos puestos; un olvido abre un endpoint sin que nada avise | E34 |
| 7.5 | Confirmación y bitácora en revocar certificación, subir CSV masivo y cambiar el plan de un cliente | E35 |
| 7.6 | Decidir sobre `CEREBRO_ENABLED=true`: está encendido contra lo que dicen el código y todos los documentos | — |
| 7.7 | Enmascarar teléfono y correo en las listas de leads | E33 |

---

# FASE 8 · EL REBUILD DEL FRONTEND

## 8.1 · Paso cero — el inventario
Completar el catálogo de **41 a 179 motores**. Sin esto no se puede garantizar que nada se pierda.
Cada motor declara: **de qué objeto habla · qué dice · con cuánta certeza**.

## 8.2 · La estructura

**Nivel 0 · Hoy** — cinco frases con verbo, no cinco números:
1. Qué se movió en tu catálogo desde ayer
2. Qué necesita tu decisión (con el botón ahí mismo)
3. Quién te está buscando
4. Qué se rompió
5. Dónde estás mintiendo sin querer
*Regla: si no hay nada que decir, no aparece.*

**Nivel 1 · Cinco objetos** (no siete temas): Desarrollos · Compradores · Asesores · Zonas · Dinero.
Menú de 6 entradas que **nunca crece**. Hoy son 24 y 6 se cortan con "…" en escritorio.

**Niveles 2–4 · La cascada**, dentro de cada objeto, abriéndose en la misma página.

**Los lentes** — ahí viven los 179 motores. Un lente **pinta encima** de lo que ya estás viendo; una
pestaña lo reemplaza. Por eso 179 motores caben en 5 objetos sin perder ninguno.

## 8.3 · Reglas de construcción

| | Regla | Nace de |
|---|---|---|
| 8.3.1 | **Máximo 3 niveles.** Hoy son 6 | 84 pestañas + 45 sub-pestañas |
| 8.3.2 | **La URL es la fuente de verdad**, siempre. Hoy 45 sub-pestañas no se pueden enlazar | 8 hubs sí, 1 no |
| 8.3.3 | **Un solo vocabulario de URL**: 113 rutas = 35 pantallas + 78 redirecciones, 67 aún enlazadas | E-arquitectura |
| 8.3.4 | **Toda acción confirma donde se hizo el clic.** Hoy el mensaje se pinta 4,564 px arriba del botón | E46 |
| 8.3.5 | **Vacío se ve vacío, roto se ve rojo, estimado dice que es estimado. Nada se inventa** | R-A |
| 8.3.6 | **Todo número clicable aterriza en el dato que lo produce**, no en otro número. Sin linaje, no es clicable | E-flujos |
| 8.3.7 | **Una plantilla, no 111 pantallas.** Hoy 55,866 líneas escritas a mano | — |
| 8.3.8 | **Cero jerga.** 278 ocurrencias en 103 archivos; 17 de 24 entradas del menú no dicen qué contienen; 145 encabezados de tabla son nombres crudos de base de datos — y se imprimen en el estudio que piensas vender | E-lenguaje |
| 8.3.9 | **Nombres de negocio, no identificadores**: hoy tus clientes se llaman `Org User B2869298F9F2` | E-UX |
| 8.3.10 | **Móvil de verdad** y accesibilidad (contraste, tamaño de toque) | E-UX |

## 8.4 · Bugs de interfaz a arreglar en el camino

| Paso | Qué | Ref |
|---|---|---|
| 8.4.1 | **Live Pulse** pasa una variable CSS a Mapbox como color → las capas nunca se agregan, el mapa queda vacío y la única acción posible es imposible | E25 |
| 8.4.2 | **Transaction Network**: 185 errores de clave duplicada; se ven 4 transacciones idénticas y los datos pueden estar mal | E26 |
| 8.4.3 | El error crudo de la API impreso **dos veces**, cortado a media palabra | E29 |
| 8.4.4 | La tecla Esc no cierra el Copilot y su fondo bloquea todos los clics | E30 |
| 8.4.5 | Cuatro buscadores con tres reglas distintas; "visitas", "tráfico", "costo ia" dan cero en todos; sensibles a acentos (`interés` 2 · `interes` 0) | E-UX |
| 8.4.6 | La paleta pide 50 de 141 comandos ordenados por dominio → solo se ve un dominio | E-arquitectura |
| 8.4.7 | Los 3 buscadores → **uno solo** que entienda tus palabras | 8.4.5 |

## 8.5 · Borrar sin dudar
`SuperadminProyectoFicha.js` (598 líneas, nunca se dibuja) · 11 rutas legacy sin un solo enlace ·
la página de pruebas de componentes montada en el menú de producción · el botón "alerta de prueba"
que inyecta 9 alertas falsas al flujo real · los 5 "desarrollos" que son carpetas de Drive.

## 8.6 · Medirse a sí misma *(U14)*
La consola nueva registra qué pantallas se abren desde el día uno. Hoy no hay ni un dato, y por eso
la v2 se decidiría a ciegas.

---

# FASE 9 · LO QUE VIENE DE LA AUDITORÍA A–Z Y SIGUE ABIERTO

| Paso | Qué |
|---|---|
| 9.1 | **Aviso de lead por Resend/Twilio** — pagados y nunca llamados (bloqueado por decisión del founder: "no actives aún") |
| 9.2 | **Consentimiento en el formulario público** — 0 de 59 leads, y el backend anota que se mostró un aviso que nunca se mostró |
| 9.3 | **La ficha escrita en el servidor** para que Google lea su contenido (esperando salir de la laptop) |
| 9.4 | **Los 3 desarrollos publicados sin foto** — el cliente debe enviarlas |
| 9.5 | **Rotar las 5 contraseñas temporales** de los desarrolladores |
| 9.6 | **Salir de la laptop**: Atlas, servidor, dominio y 7 variables de producción |

---

# ORDEN RECOMENDADO

| | Fase | Por qué ahí |
|---|---|---|
| **1º** | **Fase 0** · detener la mentira | Barato, y hoy tomas decisiones con números falsos |
| **2º** | **Fase 1** · la prueba de cableado | Evita los próximos 55. Todo lo demás se construye sobre ella |
| **3º** | **Fase 2** · un dato, un dueño | Un rebuild sobre números que se contradicen no sirve de nada |
| **4º** | **Fase 8.1** · completar el catálogo | Paso cero del rebuild: sin él no se garantiza que nada se pierda |
| **5º** | **Fase 8** · el rebuild | Ya con datos confiables y el inventario completo |
| **6º** | **Fases 3, 4, 5, 6** | Se construyen **dentro** del rebuild, no antes: cada objeto nace con sus acciones, su certeza y su historia |
| **7º** | **Fase 7** · seguridad | Antes de que entre el primer cliente real |
| **8º** | **Fase 9** | Cuando salgas de la laptop |

**Las fases 3 a 6 no son etapas separadas**: son las reglas con las que se construye la fase 8. Si se
dejan para después, el rebuild nace con la misma deuda.

---

# CÓMO SE SABE QUE ESTÁ TERMINADO

1. El founder responde **25 preguntas de negocio en 2 clics o menos**. Hoy: 13 no tienen respuesta.
2. **Ninguna de las 179 piezas quedó sin puerta.** Hoy 138 motores no están ni descritos.
3. **Los 8 flujos se completan.** Hoy 2 de 8.
4. **Ningún número se contradice** entre dos pantallas. Hoy hay 8 contradicciones medidas.
5. **Cero jerga** en lo que ve el founder. Hoy 278 ocurrencias.
6. **La prueba de cableado pasa**, y truena si alguien desconecta algo.
7. **La prueba del niño de 5 años: 8 de 8.** Hoy 2 de 8.
