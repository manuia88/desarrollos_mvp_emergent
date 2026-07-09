# GUION MAESTRO — instrucciones del founder + definición de granularidad

> Compilado de todas las instrucciones que me has dado desde que construimos los 5 documentos fundamentales.
> Úsalo como brief canónico para dirigirme a mí o a otro agente. Al final, la definición de "la granularidad que tanto pides".

---

## A. CÓMO debo trabajar (reglas de operación — las que repites siempre)

1. **No seas mediocre. Amplía la mirada al máximo.** De lo nano a lo súper macro. Nada de "lo mínimo" ni "6 motores".
2. **100%, no a la mitad.** Si la meta es N motores/métricas, son N — completos, visibles back+front, conectados.
3. **Si ves bugs, áreas de oportunidad o upgrades, corrígelos/impleméntalos SIN pedir autorización** — aunque no los hayas creado tú y aunque sean de otra sesión.
4. **Grep antes de construir.** Reusar el motor que ya existe, nunca duplicar.
5. **Cero features huérfanas.** Todo cableado punta a punta (schema + endpoint + UI + verificación).
6. **Confronta, nunca yes-man.** Si algo no es correcto, dilo con criterio (Master/PM), rankea honesto.
7. **Verifica en la app real** (localhost, logueado, flujo completo). No declares "hecho" sin verlo vivo.
8. **No toques la paleta de color.** El diseño (rosa/magenta) ya lo elegí. Todo lo demás, adelante.
9. **No hay prisa — calidad.** Construir completo (con stubs si falta dato), prender al final.
10. **Audita al cerrar cada fase** (app · sin deuda · completo · upgrades) antes de seguir.
11. **Comunícate corto y simple.** ≤5-10 líneas por bloque, lenguaje natural, cero jerga. No soy dev: lidero arquitectura y prompts; tú ejecutas y reportas. Un paso a la vez.

## B. QUÉ estamos construyendo (la meta)

12. **El cubo de inteligencia de mercado** (Terminal de Zona, en superadmin) — hiper-segmentado, donde cada motor del backend es visible y consultable.
13. **100% de los motores corribles, hiper-segmentados** (no volcado JSON: cada motor entrega Indicadores legibles). → loop cerrado en 96 motores, 0 errores.
14. **Conectar oferta ↔ demanda en cada métrica** (independiente Y relacional).
15. **Cada número legible "como para un niño de 5 años":** qué es · para qué sirve (uso) · vs qué (comparativo) · de dónde sale (fuente) · a qué nivel (granularidad/dimensión) · cuánto confío (n + confianza). **NUNCA un sudoku de números flotando.**

## C. Lo específico de esta etapa (desde los 5 documentos)

16. **Termina los motores al 100%** sin preguntar cada rato — avísame cuando esté, ahí pausamos. *(→ 96 motores, 5 tandas, batería 66/66.)*
17. **Prueba los 120 motores; lanza agentes para auditarlos** y caza bugs. *(→ 5 agentes QA, 0 crashes, 89/96 con dato real tras fixes.)*
18. **Quiero verlo en localhost.** *(→ pestaña Motores viva, 96 registrados, render de Indicadores.)*
19. **Dame un seed inventado para ver cómo funcionan las métricas.** *(→ "Torre Mirador", 14 motores; destapó y arreglé el bug del AVM.)*
20. **Analiza DIME, Inmuebles24 y BBVA:** la presentación y segmentación que quiero no la tiene mi análisis actual. *(→ ANALISIS_3_REPORTES + DOCTRINA_PRESENTACION_TERMINAL.)*
21. **Dame los documentos para descargar en mi local.** *(→ esta carpeta.)*

---

## D. LA GRANULARIDAD QUE TANTO PIDO (definición)

> **No es un agregado. Es el ÁTOMO.** Cada combinación posible de ejes es **UN dato independiente, vivo y autoexplicado.**

**1. La unidad mínima = el átomo, no el promedio.**
"2 recámaras en Condesa" no es lo mismo que "3 recámaras en Condesa". "2 rec en preventa con terraza" es otro dato distinto. Nunca un blob: **cada segmento es un producto en sí mismo.**

**2. Es un CUBO — los ejes MULTIPLICAN, no suman.**
`QUÉ (clasificación × tipología × característica) × DÓNDE (ciudad→alcaldía→colonia→desarrollo→unidad) × QUIÉN (NSE/perfil) × CUÁNDO (tiempo) × PRECIO × OFERENTE × OFERTA × DEMANDA`.
~75 métricas × 4 escalas × las dimensiones = **miles de celdas direccionables** (el cubo de ~4,000), no "7 productos".

**3. Direccionable y navegable — de lo nano a lo macro.**
Cada celda es **clickeable** y se puede **bajar y subir**: de una característica de una unidad de un desarrollo de una colonia (nano) hasta la ciudad y el país (macro), acumulando filtros.

**4. Bilateral — oferta Y demanda en cada celda.**
Cada dato trae su otra cara: cuántos **ofrecen** eso vs cuántos lo **buscan** (¿cuántos quieren 2rec en Condesa con terraza vs cuántos hay?).

**5. Autoexplicada — cada número se lee solo.**
Cada celda lleva: distribución (no el punto: prom·mediana·máx·mín·desv) · serie en el tiempo · comparativo real (vs inflación/peers/periodo) · banda de salud (umbral) · lectura en lenguaje simple.

**6. Viva, no foto.**
Con evolución temporal y variación, no un snapshot muerto.

### En una frase
> **La granularidad que pido es de CELDA ATÓMICA:** cada cruce posible de (qué × dónde × quién × cuándo × precio × oferente) es un **dato independiente, navegable de lo nano a lo macro, con su oferta y su demanda al lado, y siempre legible solo.** Si un número no se puede bajar a su átomo, comparar y leer sin ayuda, **no es suficientemente granular.**
