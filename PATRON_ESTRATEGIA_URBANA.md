# PATRÓN DEL DEV · ESTRATEGIA URBANA

> Redactado por Claude tras la radiografía del 2026-07-26 (paso 4 del [[PLAYBOOK_INGESTA_LISTAS]]).
> Se enriquece con cada proyecto ingerido (directriz D8: el patrón es un organismo).

## Identidad

- **Org:** `org_estrategia_urbana` · Estrategia Urbana · `pending_claim`
- **Marcas:** SENNSE (5 proyectos) y COVA (2). El nombre público del proyecto **lleva la marca**
  (`Sennse Hamburgo`, no `Hamburgo`) — sin ella choca con Icon Hamburgo de GDC, Casa Juárez 22 de
  GDC y Chilpancingo 57 de Punto Destino, que son edificios distintos en la misma calle.
- **Fuente del track record:** su propio CV en PDF, leído (fundada 2012 · Jonathan Cohen CEO ·
  Moisés Zapan CCO · Laura Ambia COO · CDMX + Costa Este EUA).
- **Origen del material:** carpeta compartida de **Dropbox** (`BROKERS.zip`, 2.9 GB, 201 archivos).
  NO es Google Drive → el vigía **no** puede vigilarla todavía; esta primera carga es en sesión.

## Estructura de la carpeta

```
<N> <MARCA> <PROYECTO>/
  ├─ Listas de precios/          · una lista POR ESQUEMA DE PAGO (aquí está la trampa, ver abajo)
  ├─ Brouchure/ | Presentacion/  · el brochure (PDF pesado, 20-100 MB)
  ├─ Renders/
  │    ├─ <ESPACIO>/             · BAÑO · COWORKING · GYM · LOBBY · ROOF COMUN · ROOF PRIVADO · DEPTO 01…
  │    ├─ PLANTAS/               · LOS PLANOS, como PNG: `Planta_<Proyecto>_Depto01_ed2.png`
  │    ├─ BAJA/                  · ¡versiones LIGERAS ya hechas por ellos! (usar estas, no las de 20-40 MB)
  │    └─ fonts/ · Videos renders/ · material de marketing, NO es dato
  ├─ PLANOS/                     · en Tabacalera: planos con cotas en PDF (más ricos que el PNG)
  ├─ VISTAS/ | INFOGRAFÍAS/ | MEDIA KIT/  · marketing
  └─ SOLICITUD DE COMPRA/        · formatos en blanco · ⚠️ aquí se colaron listas de OTRO proyecto
```

La carpeta numerada `1 CV E URBANA` **no es un proyecto**: es el CV de la empresa. Se salta.

## LA TRAMPA · cuatro precios por unidad

Cada proyecto trae **una lista por forma de pago**, y el mismo departamento cuesta distinto en cada
una. Liverpool 202, mismo depa, misma fecha:

| Esquema | Precio | Descuento vs. el más caro |
|---|---|---|
| 10% firma / 10% mensualidades / 80% escritura | $6,317,042 | — |
| 20% / 10% / 70% | $6,234,078 | 1.31% |
| 20% / 70% / 10% | $6,019,241 | 4.71% |
| Contado (90% / 10%) | $5,689,142 | 9.94% |

**11% de diferencia.** Extraer las 6 listas sin saber esto genera 4 copias de cada unidad y el
guardián de plausibilidad las marca como conflicto de precio — cuando no lo son.

**Cómo se resuelve, sin código nuevo:** encaja tal cual en `payment_schemes.py`, que ya usa
`firma_pct / mensualidades_pct / escritura_pct` + `descuento_pct` por esquema, y ya interpola
cualquier enganche intermedio (`discount_for_enganche`, el "cotizador no fijo").

- **`precio_base` = el precio MÁS ALTO** (decisión del founder 07-26). Los demás esquemas cuelgan
  como descuento. Así el precio nunca sube respecto de lo publicado, solo baja.
- **La lista `comparativo` es la fuente primaria**: trae los 4 esquemas juntos MÁS campos que las
  individuales no tienen (`Nivel`, `M2 Interiores`, `Balcón`, `Garden/Roof`, `Mensualidades`).
  Directriz D2: la fuente más granular gana campo por campo.
- Las listas individuales aportan el desglose fino del enganche (montos, no porcentajes).

## Campos que traen sus listas (mejor que el promedio del catálogo)

`Depto · Nivel · Tipología · Vista · M2 Interiores · Balcón · Garden/Roof · M2 Totales · Estatus ·
Mensualidades · precio por esquema`

- **`Vista`** es un dato real y nombrado ("Liverpool", "Insurgentes", "Sunken Garden", "Hotel Andaz",
  "Jardín Interior") → alimenta `vista`/`orientacion`, que casi nadie más da.
- **`Tipología` viene en inglés**: `2Bed/1Bath`, `Large Studio`, `Studio`, `2Bed/2.5Bath Duplex`
  → hay que traducir a recámaras/baños. `Large Studio` NO es 1 recámara: es estudio.
- **El desglose de m² ya viene separado** (interiores / balcón / garden-roof / total) → se puede
  validar la ecuación de L12 en la extracción misma.

## Vicios de formato · uno por proyecto (no sirve un solo parser)

| Proyecto | Vicio |
|---|---|
| **Liverpool · Juárez · Hamburgo** | tabla limpia, un renglón por unidad, número de depto puro (`202`) |
| **Cova Chilpancingo** | el número trae letras y prefijo: `GH A 101`, `A 302`, `PH C 501` → codifica tipo + torre + piso |
| **Monumento** | NO es tabla por renglón: se organiza por PISO en rejilla (`N19`, `N18`…) |
| **Vasconcelos** | 61 unidades legibles en las listas por esquema, pero su `comparativo` y su `enganche diferido` son **imágenes** (sin texto) |
| **Reventa Elysée** | otra tabla más: `m² Habitable · m² Jardín · Precio · Disponibilidad`, y marca **VENDIDO explícito** |

## Fechas · el nombre del archivo manda

Nombran con **DDMMYY al inicio o al final**: `200726 lista de precios contado.pdf` = 20/07/2026 ·
`NL Lista de precios 150726.pdf` = 15/07/2026.

⚠️ **La fecha del archivo y la del nombre no siempre coinciden.** Tabacalera: la carpeta dice "LISTAS
DE PRECIOS VIGENTES", el nombre dice `250626` (25/jun) y el archivo se modificó el 23/jul. Y el
`comparativo` de Liverpool dice "Período: junio 2026" dentro, con nombre de julio. **Regla: gana la
fecha del NOMBRE, y si el contenido declara período, se anota la discrepancia como pregunta al dev.**

Los comparativos traen **versión** (`V16`, `V12`) — señal de frescura adicional.

## Anomalías a confirmar con el dev (no se adivinan)

1. **Lista cruzada**: `2 SENNSE TABACALERA/SOLICITUD DE COMPRA/NL Lista de precios 160426.pdf` es de
   Cova Nuevo León, guardada dentro de Tabacalera. `guardian_precio.fuente_plausible` lo bloquea.
2. **Chilpancingo con dos esquemas al mismo precio**: `15% 10% 75%` y `20% 70% 10%` dan
   $9,901,812.98 idéntico en varias unidades. Parece error de su hoja.
3. **Listas viejas**: Monumento del 20/mar (4 meses) · Elysée de enero (6 meses).
4. **Faltan las carpetas 3 y 8** de su numeración → o no las compartieron, o están vacías.
5. **Cova Nuevo León trae 1 sola unidad disponible** (PH 101, $13.1M). Por la regla del founder, la
   lista son los DISPONIBLES: el total sale del brochure.

## Inventario disponible (radiografía, no extracción)

| Proyecto | Disponibles | Lista del | Formato |
|---|---|---|---|
| Sennse Vasconcelos | 61 | 20-jul-26 | texto (comparativo es imagen) |
| Sennse Liverpool | 23 | 13-jul-26 | texto |
| Sennse Hamburgo | 12 | 23-jun-26 | texto |
| Sennse Monumento | 12 | 20-mar-26 | texto, rejilla por piso |
| Sennse Juárez | 8 | 23-jun-26 | texto |
| Sennse Tabacalera | 8 | 25-jun-26 | texto |
| Cova Chilpancingo | 5 | 23-jun-26 | texto, número con letras |
| Cova Nuevo León | 1 | 15-jul-26 | texto |
| Reventa Elysée | 1 (+11 vendidos) | ene-26 | texto, marca VENDIDO |
| **Total** | **131** | | |

## Lecciones NUEVAS que este dev agrega al playbook

- **L16 · Una lista por forma de pago no es un duplicado.** Antes de tratar dos precios de la misma
  unidad como conflicto, revisar si las listas se distinguen por esquema de pago. El costo de no
  verlo: 4 unidades fantasma por unidad real y el guardián gritando por algo correcto.
- **L17 · Los zips de las carpetas compartidas rompen los acentos.** `SENNSE JU�?REZ` en vez de
  `SENNSE JUÁREZ`: el zip marca UTF-8 en unos archivos y CP437 en otros. Hay que normalizar al leer
  el índice o los nombres de proyecto nacen mal escritos.
- **L18 · Buscar las listas por CARPETA, no por nombre de archivo.** Monumento nombra sus listas
  `200326 Monumento contado.pdf` — sin las palabras "lista" ni "precio". Un filtro por nombre las
  pierde en silencio (a mí se me perdieron 3 en la primera pasada).
- **L19 · El dev a veces ya hizo el trabajo pesado.** Antes de reducir 96 renders de 20-40 MB,
  revisar si hay una carpeta `BAJA`/`compressed` hecha por ellos.
- **L20 · La carpeta del render es el concepto de la foto.** `Renders/GYM/`, `Renders/ROOF PRIVADO/`,
  `Renders/PLANTAS/` → el nombre de la carpeta clasifica la imagen gratis, sin adivinar.
