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
