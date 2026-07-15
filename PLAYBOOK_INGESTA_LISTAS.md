# PLAYBOOK DE INGESTA — carpetas de listas de precios + Excel + datos del desarrollo

> Doctrina canónica destilada del piloto CLASS/Almina (2026-07-14, founder + Claude).
> Responde: *"¿qué orden de acción, lecciones, patrones, guías y directrices sacamos de una
> carpeta de dev con listas de precios?"* Se aplica a TODO dev nuevo; el patrón específico de
> cada dev vive en su manifiesto y se enriquece con cada proyecto.

## 1 · ORDEN DE ACCIÓN (el pipeline por dev, en secuencia estricta)

1. **Identidad primero** — mapear carpeta → dev en el manifiesto. Sin dueño, NADA se ingiere.
2. **Radiografía** — listar toda la carpeta (metadata, $0): cuántos proyectos, dónde están las
   listas, de cuándo son. Detectar el **maestro** (Excel multi-desarrollo en la raíz) si existe.
3. **Jerarquía de verdad por campo** — declarar QUÉ fuente manda en QUÉ campo (ver §4-D2).
4. **Redactar el patrón del dev** (Claude, no el founder) — naming, vicios de formato, qué ignorar.
5. **Extraer proyecto por proyecto** — el founder marca el orden; nunca big-bang.
6. **Cruce por unidad + validación** — matches, choques de precio, fantasmas, filas basura.
7. **Resumen → cola de revisión → clic del founder** — la única puerta al catálogo.
8. **Vigía armado** — de ahí en adelante solo deltas (lista cambió → tarjeta → clic).

## 2 · LECCIONES (cazadas en el piloto — cada una costó un error real)

- **L1 · La fecha del acceso directo miente**: nunca cambia; la de los archivos reales sí.
- **L2 · Cada generador de PDF tiene un vicio**: el de CLASS desfasa el número de depto UNA fila
  arriba de sus datos. Un LLM a ciegas habría corrido todos los precios. El vicio se documenta
  en el patrón del dev y el parser lo corrige explícito.
- **L3 · El Excel trae texto legal como filas** → sin filtro, nacen "desarrollos fantasma"
  ("La presente lista pretende ser…"). Filtrar filas no-unidad SIEMPRE.
- **L4 · Colapsado vs desglosado**: el Excel aplasta balcón/terraza/patio en una columna; el PDF
  los separa. **La fuente más granular gana CAMPO POR CAMPO** (no archivo por archivo).
- **L5 · Stock ≠ flujo**: total del desarrollo (245) − disponibles (80) = colocación acumulada
  (67%). La ABSORCIÓN (u/periodo) requiere ≥2 fotos. No confundirlas jamás.
- **L6 · El diff entre fuentes ES una señal**: unidades en el Excel ausentes del PDF fresco =
  ventas/apartados inferidos. Se registra como señal, no como unidad.
- **L7 · Multi-torre = UN proyecto**: Almina A+B comparten dirección → 1 proyecto, 2 torres.
  Criterio: misma dirección/carpeta = mismo proyecto.
- **L8 · El número de unidad codifica datos**: "A-902" = torre A, piso 9, posición 02. Piso y
  línea vertical se derivan gratis.
- **L9 · El esquema de pagos vive en la lista**: crédito/enganche/reservación/contrato/a diferir
  por unidad — extraerlo SIEMPRE (alimenta matcheo financiero y buscador por mensualidad).
- **L10 · El disclaimer del maestro dice la verdad**: "no necesariamente actualizada" → el
  propio dev te dice qué fuente es la fresca. Leer los avisos, no solo las tablas.

## 3 · PATRONES (estructuras que se repiten — reconocerlas acelera todo)

- Carpeta por proyecto con la **etapa en el nombre** ("- ENTREGA INMEDIATA", "- PREVENTA").
- Naming de listas: "VP_Lista_de_Precios {proyecto} {torre} SF.pdf" (CLASS); cada dev tendrá el
  suyo — se aprende una vez y va al manifiesto.
- **Maestro en la raíz** con todo el catálogo (28 columnas ricas: amenidades, dirección, GPS,
  cuotas, total de deptos, muestra, amueblado) + pestañas (CDMX / UNIDADES ÚNICAS).
- Archivos de acabados, brochure y planos conviven con la lista → se aprovechan después
  (planos → prototipos; brochure → ficha).
- Actualización disciplinada (CLASS: diaria) → frescura alta = dev confiable.

## 4 · DIRECTRICES (reglas duras, no negociables)

- **D1 · Identidad antes que datos**: sin manifiesto no entra nada (nada al costal genérico).
- **D2 · Doble jerarquía de verdad**: la fuente más FRESCA manda en precio/disponibilidad;
  la más GRANULAR manda campo por campo (m², desgloses).
- **D3 · Todo con linaje**: cada dato sabe de qué archivo, huella y fecha salió.
- **D4 · Choque entre fuentes → cuarentena**, nunca adivinar. (Almina: 0 choques = aprobar.)
- **D5 · Solo el PDF fresco define el catálogo VIVO**; lo ausente = señal de venta inferida.
- **D6 · La IA no mide, el código mide**: parseo determinístico + reglas; la IA etiqueta/nombra.
- **D7 · Nada gasta API sin clic del founder** (la cola de revisión es la compuerta).
- **D8 · El patrón del dev es un organismo**: cada proyecto ingerido lo enriquece (manifiesto +
  huella de correcciones). El proyecto 2 siempre es más rápido que el 1.

## 5 · MÉTRICA DEL PLAYBOOK (piloto Almina como referencia)

80 unidades · 100% con esquema de pago · 99% con desglose exterior · 11 moldes auto-derivados ·
0 choques de precio · 898 eventos de línea base · $0 de API · 1 clic del founder.

## 5 · LECCIONES DEL PILOTO CLASS/ALMINA (2026-07-15 — post-auditoría completa)

**De extracción:**
- **L11 · Ninguna fuente es la verdad completa — cada una miente por omisión.** La lista dijo
  3R donde el plano dice 2R+FLEX; el renglón del PH venía sin recámaras; el piso 15 esconde
  ~120m² de roof en el "total". Regla: mínimo 2 fuentes por dato importante y cotejo
  automático ANTES de dar el dato por bueno.
- **L12 · Los totales agregados esconden datos.** Validar la ecuación de m² (habitables +
  exteriores ≈ totales) EN la extracción; el delta no es error de captura — es un espacio
  sin desglosar que se convierte en PREGUNTA al dev.
- **L13 · Un renglón roto en 80 no se ve a ojo.** La revisión humana ve promedios; solo las
  reglas invariantes ven átomos. Auditar el lote ANTES de aprobar, no después de publicar.
- **L14 · Los nombres de archivo son datos** (Copia de A-1503 = unidad exacta · ARQ_N 4,6…
  = línea×niveles · PT_112m2 = molde). El patrón de nombres del dev se declara en el
  manifiesto desde la primera carpeta.

**De colocación en plataforma:**
- **L15 · La identidad estable precede a la métrica.** Nada se puede medir sobre entidades
  que se demuelen (moldes v1). Toda entidad nueva nace con id estable + biografía.
- **L16 · "Construido" ≠ "conectado".** Tres piezas quedaron sin disparador (cotejo,
  conceptos, programa) hasta que la auditoría lo cazó. Nada existe sin trigger automático
  + test que lo congele.
- **L17 · Dato sin dueño = dato que nunca llega.** Cada campo faltante declara QUIÉN lo
  llena (lista/plano/dev/founder) — eso convirtió huecos en tareas.

**De distribución:**
- **L18 · Una fuente, muchas vistas, UN contrato.** El portal dev escribía en una capa que
  los motores no leían (overrides). Toda superficie lee del fusionador canónico
  (unidades_efectivas); toda exposición pública pasa por contrato registrado + test.
- **L19 · Atribución honesta o inflación.** 390 "búsquedas compatibles" eran 1 real: un
  cruce sin criterios mínimos infla demanda. Todo cruce declara su nivel de atribución.
- **L20 · El sistema debe auditarse a sí mismo en cada ciclo.** El Auditor cazó errores del
  dev (roofs), del código (huella sin baños) y del propio proceso (cotejo caducado) en su
  primera corrida. La auditoría de una vez caduca; la regla viva no.

## 6 · LECCIONES DE VISIÓN AMPLIA (07-15, tras el reclamo del founder "te falta visión")

- **L21 · Extraer ≠ colocar.** La sesión capturó tipo de estacionamiento, acabados, maps y
  fecha de entrega — y nunca aterrizaron en la ficha. Toda extracción produce un manifiesto
  de campos capturados y el sistema verifica que CADA uno aterrizó en su campo canónico o
  fue descartado a propósito. Lo capturado que no se coloca es trabajo tirado.
- **L22 · Un nombre canónico por dato, con registro de alias.** `address` vs `address_full`
  dejó la dirección invisible 2 días. Regla alias_invisible del Auditor + todo campo nuevo
  declara su nombre canónico UNA vez.
- **L23 · Cada reclamo del founder = una REGLA permanente, no solo un fix.** A-1505 →
  m2_coherencia · dirección → alias_invisible · 390 búsquedas → criterio mínimo · moldes
  borrados → conciliador. El QA de campo del founder es la mejor fuente de invariantes:
  institucionalizarlo.
- **L24 · La FALTA visible vale más que el dato oculto.** Mostrar el hueco con su dueño
  ("FALTA · el desarrollador") convirtió la UI en un gestor de tareas que se llena solo.
- **L25 · Los registros son la universalidad.** DIMENSIONES (corte), REGLAS (auditor),
  CONTRATO (marketplace), SECCIONES (ficha), CADENCIAS (parte): 5 registros donde "agregar
  algo" = 1 renglón. Cuando algo nuevo pida código por-dev o por-campo, está mal diseñado.

## 7 · EL MODELO DE EXTRACCIÓN v2 (post-prueba NUA/Nupol, 2026-07-15 · 99.6%)
- **L26 · Familias de layout**: la IA solo toca layouts nunca vistos; familia conocida =
  parser determinista ($0, instantáneo, reproducible). Registro en extractores_layout.py.
- **L27 · Totales de proyecto repetidos por renglón se toman por MODA, jamás se suman**
  (el caso 516→258 que cazó el founder preguntando "¿de dónde sale el 516?").
- **L28 · Merge, jamás reemplazo**: toda carga pasa por merge_into_dev con identidad
  canónica de unidad — cada lista nueva apila deltas, nunca pisa historia.
- **L29 · El juez integrado**: 20 campos con semilla fija por lote, visibles en la bandeja
  ANTES de aprobar — el gate del 98% es parte del producto.
