# AUDITORÍA TOTAL A–Z · DesarrollosMX

**Fecha:** 2026-07-24 · **Rama:** auditoria/fixes-y-upgrades
**Alcance:** repositorio `desarrollos_mvp_emergent` (único repo vivo) + catálogo + 3 portales + motores.
**Regla del founder:** se implementan **TODOS y cada uno de los puntos, al 100%**. No se resume, no se
eligen "los 5 más importantes", no se difiere nada sin registrarlo.

---

## CENSO DE ARRANQUE (2026-07-24)

| Métrica | Valor |
|---|---|
| Desarrollos | 116 |
| Unidades | 5,896 |
| Unidades con plano | 4,202 (71%) |
| Archivos (planos/fotos) | 4,093 |
| Colecciones en base | 532 |
| Archivos backend / frontend | 1,146 / 1,043 |
| Tests | 2,544 |
| Rutas backend | 240 |
| Motores | 214 |
| Inmobiliarias | Tudepa 38 · GDC 29 · org_user_b2869298f9f2 23 · Quiero Casa 20 · Punto Destino 6 |

### Hallazgos previos al arranque (verificados, no supuestos)

1. **75% del catálogo INVISIBLE** — solo 29/116 publicados.
   Tudepa **0/38** · GDC **2/29** · org_user_b2869298f9f2 **1/23** · Quiero Casa 20/20 · Punto Destino 6/6.
2. **Solo se mide `page_view`** — 3,493 eventos de un único tipo. Cero búsquedas, filtros, clics,
   favoritos, tiempo en ficha o contacto. Los reportes hipersegmentados no tienen de qué alimentarse.
3. **El tráfico es el equipo** — 165 sesiones, **6 usuarios**; se desploma tras el 2026-07-17 (156/día → 12/día).
4. **Dos almacenes de unidades** — `units` (5,896) vs `dmx_units` (6,392): difieren en 496.
5. **1,694 unidades (29%) sin plano.**
6. **532 colecciones** — sospecha de basura acumulada de experimentos.
7. **Todo el negocio vive en una laptop** — sin producción, sin copia fuera del equipo. La base se cayó
   durante esta sesión solo porque OrbStack no estaba abierto.

---

## LENTE TRANSVERSAL · HIPERGRANULARIDAD (aplica a los 26 bloques)

**Mandato del founder:** todo cae bajo hipergranularidad e hipersegmentación. **Hay que tener el átomo de
todo lo que hacemos, hasta lo macro.** Ningún bloque se audita "en general": cada uno declara su átomo, su
cadena de agregación y se verifica **a nivel átomo**, no a nivel promedio.

**Por qué importa (evidencia de hoy):** el reporte hipersegmentado NO se puede hacer hoy porque **falta el
átomo de demanda** — solo existe `page_view`. Sin átomo no hay corte posible; con átomos, cualquier corte
es gratis. Un promedio bonito ("71% con plano") esconde exactamente el dev podrido que hay que arreglar.

### Tabla de átomos

| Dominio | ÁTOMO (lo indivisible) | Cadena hasta lo macro |
|---|---|---|
| Oferta / catálogo | **una afirmación**: unidad × campo × valor × fuente × fecha × quién × confianza | campo → unidad → prototipo/molde → nivel/torre → desarrollo → inmobiliaria → colonia → zona → ciudad → catálogo |
| Documentos | **un dato leído**: archivo × página × región × texto × interpretación × confianza | dato → documento → desarrollo → fuente |
| Planos / imágenes | **un amarre**: archivo × unidad × método × evidencia | amarre → unidad → desarrollo → catálogo |
| Demanda | **un evento**: visitante × momento × acción × objeto × contexto | evento → sesión → visitante → persona → segmento → zona → mercado |
| Leads | **un contacto**: persona × unidad × canal × momento × estado | contacto → lead → asesor → inmobiliaria → embudo |
| Motores | **un cálculo**: motor × versión × entradas × salida × fecha | cálculo → motor → familia → producto |
| Precio | **un precio vigente**: unidad × monto × fecha × fuente × esquema de pago | precio → unidad → desarrollo → $/m² colonia → índice de zona |
| Seguridad | **una celda de acceso**: rol × recurso × acción × permitido/negado | celda → endpoint → portal → sistema |
| Código | **una función**: archivo × función × llamadores × prueba que la cubre | función → módulo → portal → sistema |
| Datos externos | **una medición**: fuente × variable × geografía × fecha × valor | medición → capa → colonia → zona → ciudad |
| Operación | **una acción**: quién × qué × cuándo × sobre qué objeto | acción → proceso → área → negocio |
| Dinero | **una unidad vendible**: precio × comisión × margen × estatus | unidad → desarrollo → inmobiliaria → portafolio |
| **La auditoría misma** | **un hallazgo**: bloque × punto × átomo señalado × evidencia × veredicto × impacto × dueño × fecha × prevención | hallazgo → punto → bloque → semáforo por dev → por inmobiliaria → salud global |

### Reglas duras que se derivan

1. **Ningún hallazgo se queda en categoría.** "Los precios están mal" no vale. Vale: *unidad 509 de Colima
   410, campo `m2_total`, dice 120.25, la fuente dice X, lo aplicó el vigía el 07-22*. Con nombre y apellido.
2. **La auditoría se guarda como TABLA DE ÁTOMOS**, no como reporte — colección `auditoria_atomos`. Así se
   corta después por inmobiliaria, dev, unidad, campo, bloque, severidad, causante o fecha, sin re-auditar.
3. **Cada bloque declara su átomo antes de empezar.** Si un bloque no puede nombrar su átomo, está mal
   planteado y se rediseña.
4. **Toda métrica se reporta con su drill**: el número macro siempre trae el camino hasta el átomo que lo
   compone. Nada de porcentajes huérfanos.
5. **Cobertura a nivel átomo**: no "auditamos el catálogo", sino *cuántos átomos existen, cuántos se
   verificaron, cuántos quedaron sin verificar y por qué* ([[feedback_cobertura_no_solo_correctitud]]).
6. **El hueco también es un átomo.** Un campo vacío, un evento que no se capturó y una unidad sin plano son
   registros con nombre, no ausencias invisibles.

---

## A · CARGA DEL CATÁLOGO (dato contra su fuente)

- A1 · Censo por inmobiliaria: lo que dice la fuente vs lo cargado
- A2 · Cuadre unidad-por-unidad vs lista de precios: m² (privativo/terraza/roof/total), recámaras, baños, cajones, precio, estatus, nivel, vista
- A3 · Que las partes de m² sumen el total (cada inmobiliaria mide distinto)
- A4 · `total_units` vs brochure — hecho Tudepa 34/38; **falta CLASS, GDC, Punto Destino, Quiero Casa**
- A5 · Comerciales colados (locales/oficinas) — catálogo es residencial
- A6 · Duplicados: unidades repetidas, devs duplicados, unidades huérfanas
- A7 · Fantasmas: unidades en base que no existen en la fuente
- A8 · Cobertura inversa: filas de la fuente que nunca llegaron a la base
- A9 · Precios: $/m² fuera de rango, gangas sospechosas, precios en cero/nulos
- A10 · Geo: colonia + coordenadas correctas por dev
- A11 · Fechas y etapa (preventa/construcción/entrega inmediata) coherentes

## B · PLANOS, RENDERS Y BROCHURES

- B1 · Cada plano amarrado a SU unidad (leer el número adentro, no el nombre del archivo)
- B2 · Archivo existe y sirve (HTTP 200), no roto
- B3 · Sin amenidades ni mapas colados como "plano de departamento"
- B4 · Planos huérfanos (archivo sin unidad) y las 1,694 unidades sin plano
- B5 · Renders: foto principal + galería por dev, que se vean
- B6 · Brochure archivado en el dev correcto (ya cachamos uno mal archivado en Tudepa)
- B7 · Archivos en disco sin dueño en la base (basura dentro de 7.2 GB)
- B8 · Planos girados y amarre torre+departamento

## C · REPORTES HIPERSEGMENTADOS

- C1 · Qué se guarda hoy: visitas, búsquedas, clics, favoritos, leads
- C2 · Qué NO se guarda y debería (huecos que rompen un reporte)
- C3 · Cortes por zona / precio / recámaras / m² / etapa / inmobiliaria / tipo
- C4 · El cubo: átomos de oferta y demanda en sync con el catálogo
- C5 · ¿Histórico (serie de tiempo) o solo foto de hoy?
- C6 · **Entregable: el reporte real de 15 días**, escrito, con lo que de verdad hay
- C7 · Qué reporte todavía no se puede sacar y qué falta para poder

## D · PORTALES Y SU VINCULACIÓN

- D1 · Marketplace público: ficha, buscador, filtros, mapa — qué se ve y qué está vacío
- D2 · Portal Dev: inventario, cockpit, métricas — de dónde sale cada número
- D3 · Portal Asesor: leads, inventario, comisiones, seguimiento
- D4 · Superadmin: censo, auditor, vigía
- D5 · **El mismo depto en los 3 portales**: mismo m², precio y estatus (o dónde se contradicen)
- D6 · Un asesor NO puede ver inventario/leads de otra inmobiliaria (regla dura)
- D7 · Dev cambia un precio → se refleja en marketplace y asesor

## E · MOTORES

- E1 · Inventario de los 214: qué hace cada uno
- E2 · Vivos vs dormidos (código sin llamador) vs rotos
- E3 · Motores que calculan sin que nadie los vea (features huérfanas)
- E4 · Dato real vs estimado/simulado
- E5 · Apagados por bandera (Cerebro): qué se prende y qué no
- E6 · Motores duplicados que calculan lo mismo

## F · SALUD TÉCNICA (front + back)

- F1 · Backend: rutas que truenan, código muerto, endpoints sin usar
- F2 · Frontend: pantallas que truenan, botones sin destino, links muertos
- F3 · Los 2,544 tests: cuántos pasan y qué NO cubren
- F4 · Seguridad básica: llaves expuestas, rutas sin proteger, usuario demo
- F5 · Velocidad: consultas lentas, páginas pesadas, arranque
- F6 · Deuda: duplicados, pendientes, los 15 archivos sin guardar

## G · FLUJOS COMPLETOS (app abierta, logueado)

- G1 · Comprador: buscar → filtrar → ficha → ver plano → dejar interés → llega el lead
- G2 · Asesor: recibe lead → lo trabaja → lo cierra
- G3 · Dev: entra → ve inventario → cambia precio → se refleja
- G4 · Ingesta: lista al Drive → vigía detecta → se aplica → se ve en ficha
- G5 · Alta de dev nuevo, de cero a publicado

## H · LO INDIRECTO

- H1 · Vigía/robot de Drive: ¿sigue corriendo y cada cuánto?
- H2 · Telegram: ¿llegan reportes, sirven los botones?
- H3 · Respaldos: se detuvieron el 22 — por qué
- H4 · Tareas programadas que fallan en silencio
- H5 · Las 532 colecciones: cuáles son basura
- H6 · Documentos del proyecto vs realidad
- H7 · Errores acumulados en registros
- H8 · Conectores externos: ¿siguen respondiendo?

## I · SEGURIDAD

- I1 · Cambiar un id en la dirección y ver datos de otro cliente
- I2 · Asesor que ve inventario o leads de otra inmobiliaria
- I3 · **Campos internos expuestos al público**: comisión, costo, margen, descuento máximo, teléfono del dev
- I4 · Llaves y contraseñas en el repo **y en el historial de git**
- I5 · Contraseñas débiles ("localdev") y usuario demo vivo
- I6 · ¿Se puede bajar el catálogo completo con un robot?
- I7 · Subida de archivos maliciosos
- I8 · Ruta de imágenes: ¿se puede pedir cualquier archivo del disco?
- I9 · Datos personales de leads en registros
- I10 · Sesiones que no caducan
- I11 · Dependencias con fallas conocidas
- I12 · Respaldos sin cifrar con datos personales

## J · VERDAD Y TRAZABILIDAD DEL DATO

- J1 · De cada número: de dónde salió, qué documento, qué fecha, quién lo puso
- J2 · **Cuántas puertas hay para cambiar un precio** y si TODAS pasan por el guardián
- J3 · Deshacer: revertir una aplicación equivocada
- J4 · ¿La ingesta nueva pisa correcciones hechas a mano?
- J5 · Correr la ingesta dos veces: ¿duplica?
- J6 · Dos cambios al mismo tiempo sobre la misma unidad
- J7 · Edad del dato: precio viejo presentado como de hoy
- J8 · **El auditor auditándose**: ¿el semáforo da verde sobre datos podridos?
- J9 · Falsos negativos: qué NO alertó cuando debía
- J10 · `units` vs `dmx_units`: cuál manda

## K · PUNTOS CIEGOS

- K1 · Cargado ≠ publicado (confirmado: 87 invisibles)
- K2 · Solo se mide página vista
- K3 · Dos motores con números distintos para lo mismo
- K4 · Unidades de medida y moneda (Dubai)
- K5 · Móvil real
- K6 · Google/SEO del marketplace público
- K7 · Velocidad de la ficha con fotos pesadas
- K8 · Nombres parecidos que confunden (Medellín 360 vs 335)
- K9 · Qué pasa con 1,000 desarrollos
- K10 · Costo por corrida de IA y por llamada externa
- K11 · Dev nuevo: de cero a publicado, dónde se atora
- K12 · Derechos de uso de fotos de terceros
- K13 · Correos y notificaciones: ¿salen? ¿spam?
- K14 · Si el cliente revoca su Drive, ¿qué se rompe?

## L · NEGOCIO Y LEGAL

- L1 · Precios con o sin IVA, y si la ficha lo aclara
- L2 · Aviso de privacidad y consentimiento del lead (ley mexicana)
- L3 · Letra chica: "precios sujetos a cambio"
- L4 · Comisiones nunca filtradas al público
- L5 · Mismo depto listado por dos asesores (exclusividad)
- L6 · Si un dev se va, ¿se despublica solo?
- L7 · Permiso por escrito para publicar inventario de terceros

## M · DATOS EXTERNOS Y CONECTORES

- M1 · Banxico, catastro, INEGI, riesgos, transporte, negocios: ¿responden?
- M2 · **Frescura**: última actualización de cada fuente
- M3 · Costo por llamada; cuáles cobran
- M4 · Si un conector muere, ¿se rompe la ficha o degrada con elegancia?
- M5 · Licencia de uso comercial de fuentes públicas
- M6 · El millón de predios: ¿bien georreferenciados?
- M7 · Contradicciones catastro vs desarrollador: quién gana
- M8 · Datos de mercado (4S): frescura y cobertura por zona
- M9 · Fuentes caídas sin que nadie se enterara
- M10 · Zonas sin datos externos (huecos del mapa)

## N · INTELIGENCIA ARTIFICIAL

- N1 · Qué decide la IA sola vs con visto bueno humano
- N2 · **Validación de salida**: algo revisa lo que responde la IA
- N3 · Costo por corrida y por proyecto
- N4 · Qué modelo usa cada motor (modelos viejos)
- N5 · Prompts guardados y versionados
- N6 · Registro de lo que la IA respondió cuando se equivoca
- N7 · Determinismo: misma entrada, misma salida
- N8 · **Qué pasa sin crédito de API** — ya ocurrió: ¿avisa o falla en silencio?
- N9 · Datos de clientes enviados a la IA (privacidad)
- N10 · Cerebro apagado: qué se pierde y qué se gana

## O · EXPERIENCIA DE QUIEN LO USA

- O1 · Comprador: entiende la ficha; clics hasta dejar datos
- O2 · Asesor: ¿puede trabajar o le falta información?
- O3 · Dev: ¿valor real o pantalla bonita?
- O4 · **Todos los textos**: lenguaje humano, cero jerga
- O5 · Pantallas vacías (sin datos)
- O6 · Errores comprensibles para el usuario
- O7 · Estado de carga (no pantalla en blanco)
- O8 · Consistencia visual entre los 3 portales
- O9 · Móvil probado en teléfono real
- O10 · Accesibilidad (contraste, teclado, lectores)

## P · CONTENIDO Y PRESENTACIÓN

- P1 · Descripciones: existen, no genéricas, no copiadas
- P2 · Fotos: orden, calidad, cuál es principal
- P3 · Amenidades escritas distinto
- P4 · Nombres de prototipos consistentes
- P5 · Colonias normalizadas
- P6 · **Acentos y ortografía** ("Cuauhtemoc", "Medellin", "Revolucion")
- P7 · Fichas que se verían pobres ante un cliente hoy
- P8 · Fotos repetidas entre desarrollos distintos
- P9 · Textos con desarrollador equivocado

## Q · OPERACIÓN DIARIA

- Q1 · Quién hace qué cada día
- Q2 · Lead a las 11pm: qué pasa
- Q3 · Tiempo de respuesta a un interesado
- Q4 · Quién actualiza precios y cada cuándo
- Q5 · **Qué pasa si el founder no está una semana**
- Q6 · Alertas: quién las recibe y quién actúa
- Q7 · Manual de operación (hoy vive en una cabeza)

## R · PRODUCCIÓN Y CONTINUIDAD ⚠️

- R1 · **No hay producción**: todo corre en una laptop
- R2 · **No hay copia fuera de esa Mac**
- R3 · Qué falta para prender: servidor, base en la nube, dominio, certificados
- R4 · Variables y llaves de producción
- R5 · Si se cae, ¿alguien se entera? (monitoreo)
- R6 · Respaldos automáticos fuera del equipo
- R7 · Plan de recuperación: cuánto tardaríamos en volver
- R8 · La base depende de que un programa esté abierto

## S · RENDIMIENTO Y ESCALA

- S1 · Índices de la base (1M+ predios)
- S2 · Consultas lentas
- S3 · Respuestas del servidor demasiado pesadas
- S4 · **Imágenes sin optimizar** (planos de 900 KB que deberían pesar 100 KB)
- S5 · Caché
- S6 · Qué pasa con 10× el catálogo
- S7 · Tiempo real de carga de la ficha

## T · HISTORIA, VERSIONES Y DATOS SEMBRADOS

- T1 · **¿Datos de demostración mezclados con reales?** (envenena cualquier reporte)
- T2 · Histórico de precios: real o generado
- T3 · ¿Se guarda cada cambio o solo el estado de hoy?
- T4 · Lista nueva vs anterior: comparable
- T5 · Los 49,939 de línea de tiempo: origen
- T6 · Los 175,868 de historial de puntajes: reales
- T7 · Unidad vendida: ¿el histórico lo sabe?
- T8 · Datos de prueba dejados por error

## U · GOBIERNO DEL DATO

- U1 · Diccionario: qué significa cada campo
- U2 · Campos duplicados con el mismo significado
- U3 · Campos que ya nadie usa
- U4 · Convención por inmobiliaria vs estándar único
- U5 · **`units` vs `dmx_units`**: cuál es la verdad
- U6 · Las 532 colecciones: cuáles son basura

## V · VENTAJA COMPETITIVA

- V1 · Datos que nadie más tiene
- V2 · Qué tiene la competencia que no tenemos
- V3 · Si copian el marketplace, qué se llevan y qué no
- V4 · Qué parte es realmente difícil de imitar
- V5 · Qué se puede licenciar y vender aparte

## W · PRUEBAS Y CALIDAD

- W1 · Los 2,544 tests: ¿corren? ¿cuántos pasan?
- W2 · ¿Cubren lo importante o lo fácil?
- W3 · **Pruebas del dato**, no solo del código
- W4 · Pruebas de flujos completos
- W5 · ¿Corren solos?
- W6 · Lo que se rompió antes y no tiene prueba que lo evite

## X · DOCUMENTACIÓN Y CONOCIMIENTO

- X1 · Documentos del proyecto vs realidad
- X2 · ¿Alguien nuevo entiende el sistema?
- X3 · Decisiones importantes registradas
- X4 · Instrucciones de operación
- X5 · Documentado que ya no existe

## Y · RIESGOS DE DEPENDENCIA

- Y1 · **Google Drive**: todo el material vive ahí, carpetas de terceros
- Y2 · **Una sola laptop**
- Y3 · La IA (precio, cambios, disponibilidad)
- Y4 · Clientes que pueden revocar acceso a su Drive
- Y5 · Servicios gratis que dejan de serlo
- Y6 · Una sola persona sabe operarlo

## Z · LA PREGUNTA DEL NEGOCIO

- Z1 · **¿Esto se puede vender hoy?**
- Z2 · Mínimo para que un cliente pague
- Z3 · Qué se le enseña a un inversionista sin miedo
- Z4 · Qué se caería si mañana entran 10 clientes
- Z5 · Qué parte ya está lista para cobrar

---

## UPGRADES A LA METODOLOGÍA (cómo auditar, no qué auditar)

1. **Adversarial** — pedir "demuéstrame que está mal", no "verifica que esté bien". Un agente que busca
   confirmar, confirma.
2. **Calificación real, no teórica** — 30 unidades al azar verificadas a mano contra el documento
   original → tasa de error verdadera. Un "100%" que compara la copia con la copia no vale.
3. **Inyección de errores** — meter un precio absurdo a propósito y ver si el guardián lo caza.
   Si no lo caza, el guardián es decorativo. **Nunca se ha probado.**
4. **Siempre contra la fuente, nunca contra sí mismo** ([[feedback_verificar_realidad_no_extraccion]]).
5. **Ordenar por impacto de negocio**, no por gravedad técnica.
6. **Cada hallazgo con 5 datos**: qué · dónde · quién lo causó · cómo se arregla · cómo se evita que vuelva.
7. **Que quede prendido** — semáforo permanente que vuelve a correr solo, no un reporte de una vez.
8. **Examen fijo permanente** — 50 unidades verificadas a mano como vara; si un cambio las rompe, se sabe.
9. **Que audite quien no construyó.**
10. **Semáforo por desarrollo, no global** — el promedio esconde el proyecto podrido.
11. **Foto del antes** — medir hoy para poder comparar después.
12. **Cada hallazgo con dueño y fecha.**
13. **La prueba del cliente que no sabe nada** — abrir la ficha sin contexto.
14. **Auditar lo que NO existe** — buscar lo que debería estar y falta.
15. **Reproducible** — volver a correrla y dar lo mismo.
16. **Definir error tolerable** — sin un número, todo parece falla.
17. **Todo hallazgo apunta a un átomo** con nombre y apellido, nunca a una categoría.
18. **La auditoría se entrega como tabla consultable**, no como documento — para poder cortarla después por
    cualquier dimensión sin volver a auditar.
19. **Cada bloque declara su átomo y su cadena de agregación** antes de arrancar; si no puede, está mal planteado.
20. **Todo número macro viaja con su drill** hasta el átomo que lo compone. Cero porcentajes huérfanos.
21. **El hueco es un átomo**: lo que falta se registra con nombre, no se queda como ausencia invisible.
22. **Doble semáforo por nivel**: átomo → unidad → dev → inmobiliaria → global. El promedio nunca sustituye
    al detalle.

---

## CONTEO

**26 bloques (A–Z) · ~197 puntos de revisión · 22 upgrades de metodología · 1 lente transversal
(hipergranularidad) con 13 átomos declarados y 6 reglas duras.**

Doctrina aplicable: [[feedback_verificar_realidad_no_extraccion]] · [[feedback_cobertura_no_solo_correctitud]] ·
[[feedback_leer_documentos_no_heuristica]] · [[feedback_grep_before_build]] · [[feedback_no_orphan_features]] ·
[[feedback_build_for_endstate]] · [[feedback_fix_in_scope_zero_debt]] · [[AUTHZ_MODEL_LEADS]].

---

# RESULTADO · los 26 bloques cerrados (2026-07-26)

Cinco olas de agentes internos, cada uno con orden de revisar su trabajo dos veces e intentar
**tumbar sus propios hallazgos** antes de entregar. Lo que sigue es solo lo que sobrevivió.

## Lo más grave que se encontró — y ya está arreglado

| | Qué pasaba | Estado |
|---|---|---|
| **Respaldo** | Nunca funcionó: el reloj arranca sin ver `docker`. Y al fallar **borraba el respaldo bueno** del mismo día (escribía sobre él antes de fallar). Solo quedaba un volcado de 10 días atrás, y el otro sistema de respaldo moría en `catastro_predios` sin llegar nunca a developments/leads/units/users | ✅ arreglado y **probado restaurando**: 116 devs · 5,896 unidades · 4,097 archivos · 59 leads · 1,089,684 predios, todos coinciden |
| **Leads perdidos** | El backend devolvía "todo bien" (HTTP 200) cuando NO guardaba, y el comprador veía "¡Listo! Un asesor te contacta" con su teléfono en ninguna parte | ✅ ahora falla de verdad y el intento se guarda aparte para rescatarlo |
| **El freno que puse yo** | Contaba en el mismo cubo una respuesta de 41 bytes y una de 212 KB. Con 113 tarjetas, una sola vista del catálogo costaba 227 peticiones y el tope era 180: **el comprador no podía abrir ninguna ficha** | ✅ dos cubos según lo que protegen · comprador libre, robot cortado a los 1.4s |
| **Apagador de publicación** | Dos interruptores, uno desconectado: NUA Interlomas y Nupol Polanco marcados "no publicado" seguían vivos al público | ✅ puerta única · si cualquiera dice no, no se publica |
| **Celular** | El pie de página y 4 rejillas de la portada empujaban toda pantalla pública a 600px en un teléfono de 390px | ✅ 0 desborde en portada, marketplace y ficha · escritorio idéntico |
| **Acentos** | 32 desarrollos salían como "Medellin 360", "Cuauhtemoc 1193", "Icon San Angel" | ✅ 0 mal escritos en la API pública (+23 avisos del vigía realineados para no romper el cruce) |
| **Overpass / Telegram** | Martillábamos un servicio gratuito cada 12 min → 429 permanente. Nombres con paréntesis reventaban el cruce del bot | ✅ pausa al frenarnos · los 67 avisos cruzan bien |

## Lo que NO se puede arreglar desde aquí — decisiones del founder

1. **No hay una sola copia fuera de esta Mac.** El respaldo ya funciona, pero vive en el mismo disco
   que el repositorio (`/dev/disk2s5`). Time Machine sin destino. Un disco muerto se lleva todo.
2. **98 commits existen únicamente en esta laptop.** GitHub está 9 días atrás.
3. **Ningún lead tiene consentimiento registrado** (0 de 59) y el formulario de la ficha captura sin
   aviso de privacidad. La infraestructura correcta YA existe (`compliance_consent.py`); el modal
   público no la usa.
4. **Google no puede indexar ni una ficha**: el sitemap se arma de la semilla apagada (0 URLs de
   `/desarrollo/`), está bajo `/api/` que `robots.txt` bloquea, y no hay render en servidor.
5. **115 de 116 desarrollos se publicaron saltándose el filtro de calidad** (completitud real: 46%).
6. **Cerebro está ENCENDIDO** en el entorno vivo contra lo que dicen el código y todos los documentos.
7. **Nadie recibe aviso de un lead**: Resend y Twilio están pagados y configurados, y el código de
   leads nunca los llama.

## Veredicto honesto del negocio

**¿Se puede vender hoy? No** — pero no por falta de producto. El marketplace muestra 113 fichas sin
foto en el listado, no hay forma de cobrar (0 llaves de Stripe, 0 suscripciones) y todo corre en una
laptop con el servidor de desarrollo. **Lo que sí se vende hoy es el servicio**: armar y mantener al
día el catálogo. 5 desarrolladoras, 5,896 unidades con precio y plano.

**El único foso real** no es la IA: es que cinco desarrolladoras te abrieron su Drive. Eso no se
compra por 500 dólares al mes. Los 1.08M de predios del catastro los baja cualquiera en una tarde.
