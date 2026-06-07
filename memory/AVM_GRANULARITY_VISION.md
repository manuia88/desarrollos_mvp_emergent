# Visión de Granularidad del AVM + Captación del Asesor

> 2026-06-06 · Análisis (4 agentes / read-only) del esquema de propiedades, qué usa el AVM y si el asesor puede subir propiedades. Disparado por founder: "los asesores también subirán sus propiedades → datos para el AVM. ¿Tenemos granularidad máxima o hay que buscarla?"

## VEREDICTO
**La visión de granularidad máxima YA EXISTE en el esquema** (`backend/dmx_unit_schema.py`): **~170 campos por propiedad** en 12 categorías. Cubre y EXCEDE los ejemplos del founder (edad, calle, zona, amenidades, vista interior/exterior, precio, m2, rec, baños, estacionamiento). El problema NO es capturar — es que:
1. **El AVM solo usa 8 de esos ~170 campos** (ignora vista, orientación, acabados, amenidades, piso, etc.).
2. **El asesor NO puede subir propiedades todavía** (la captación es solo un enum + colección vacía, sin endpoint ni UI).
3. **Nueva vs usada existe solo como enum** (`PropertyType.resale`), no operacionalizado — y eso es justo lo que el "Precio en Contexto" necesita para comparar nueva vs reventa con dato real.

## LO QUE YA CAPTURAMOS (~170 campos · dmx_unit_schema.py)
- **Posición física:** torre, piso, número, niveles (flat/dúplex/tríplex), planta baja/penthouse/garden, orientación (8 rumbos), **vista** (calle/interior/parque/ciudad/área verde), esquina, **horas de luz al día**.
- **Áreas:** construido, privativo, terreno, terraza, balcón, roof garden, jardín, **doble altura, altura de techo (m)**.
- **Interior:** recámaras, en-suite, vestidor, baños completos/medios, cuarto+baño de servicio, estudio/home-office, family room, tipo de cocina, antecomedor, lavandería, chimenea, jacuzzi, alberca privada.
- **Bodega (lista):** incluida, m², ubicación, costo extra. **Estacionamiento (lista):** arreglo, mecanismo (elevador/hidráulico), techado, **cargador EV**, visitas, moto, bici.
- **Acabados:** nivel (gris/blanco/llave en mano/amueblado), piso (madera/porcelánico/mármol), cubierta cocina, marcas, ventanería (doble cristal acústico), personalizable.
- **Sustentabilidad:** paneles/calentador solar, medición individual, doble cristal, cerradura/termostato smart, persianas automáticas, fibra, certificación EDGE/LEED.
- **Legal:** régimen, escriturable, libre de gravamen, predial al corriente, uso de suelo, pet-friendly (+límite kg), accesible.
- **Costos recurrentes:** mantenimiento ($/mes y $/m²), fondo de reserva, predial anual, servicios incluidos, cuota amenidades.
- **Comercial:** precio lista/cierre ($ y $/m²), spread, descuento, enganche, mensualidades preventa, contra-entrega, financiamiento del dev, créditos aceptados, status, fechas (alta/aparta/reserva/cierre/escritura), días en mercado, reservas caídas, promociones.
- **Demanda:** leads, visitas, vistas portal, favoritos, comparaciones, distribución DISC, objeciones, micro-compromisos, prob. venta ML.
- **Inversión:** ROI renta larga/corta, yield bruto/neto, plusvalía 12/24/60m, mensualidad, punto de equilibrio, hold óptimo.
- **Geo:** calle, número, CP, colonia, alcaldía, AGEB, lat/lng, zona. + provenance por campo + `data_completeness`.
- **Desarrollo (~25):** etapa, avance de obra %, fechas entrega, amenidades, seguridad (CCTV/casetas/control), verificación trust (constitución, entregados, sin PROFECO).

## EL AVM HOY (gap #1 · hedonic_regression_engine.py)
Solo 8 features numéricos: m2, recámaras, baños, year_built, piso, cercanía metro, densidad DENUE, índice costo construcción. **NO usa** vista, orientación, amenidades, acabados, sustentabilidad, esquina, doble altura, nivel, certificación, etc. → captamos 170 y el modelo aprovecha 8.

## ASESOR (gap #2 · routes/advisor.py)
NO existe upload de propiedades del asesor. `asesor_lead_properties` es solo-lectura (ve unidades asignadas a un lead). `CaptacionIn` está documentado pero sin endpoint. → la fuente de datos de reventa que pide el founder NO existe aún.

## NUEVA vs USADA (gap #3 · studio_property_intake_schema.py)
`PropertyType` enum (development/resale/rental/commercial/land) + campos resale (owner_type, years_owned, reason) existen, pero NO operacionalizados. `antiguedad_anos` es transitorio (parámetro del AVM), NO se guarda por unidad. → para comparar nueva vs reventa con dato real (lo que necesita "Precio en Contexto") falta el stream.

## FOTOS (photo_tagger.py)
Tag por foto (room + 4 features, vía visión GPT-4o-mini, fail-open) pero a nivel asesor (`asesor_photo_tags`), NO ligado a la unidad. La vista (interior/exterior/ciudad) ya es un CAMPO de la unidad pero no se llena desde fotos.

## PLAN — el Flywheel de Datos (cierra ciclo, IA-first)
**Asesor capta propiedad (granular)** → **alimenta el AVM (que ahora SÍ usa los atributos ricos)** → **mejor "precio en contexto" (distingue nueva vs usada con dato real)** → **más confianza/leads** → **más captación**. Tandas propuestas:
- **G1 · Operacionalizar nueva/usada:** `property_type` + `antiguedad`/year_built + `estado_conservacion` por unidad; el AVM y "Precio en Contexto" los usan (reventa real reemplaza la referencia estimada). Back+front.
- **G2 · Captación del Asesor (front+back):** UI "Subir propiedad" con el formulario granular (las 12 categorías, progresivo, `data_completeness`), guarda en colección propia multi-tenant, status borrador/publicada. Alimenta su cartera + el AVM.
- **G3 · AVM rico:** expandir el modelo hedónico para consumir vista/orientación/amenidades/acabados/piso/sustentabilidad (categóricos) → mejor R² y precio por-unidad real (no solo $/m² de zona).
- **G4 · Fotos→unidad:** ligar el tagger a la unidad; autollenar `vista` y calidad desde las fotos (feed visual al AVM/taste).

## AVANCE (2026-06-06)
- ✅ **G2 captación asesor**: el captador real (`AsesorCaptaciones` "Nueva captación", NO el landing) ahora tiene
  características finas en chips (condición a-estrenar/seminueva/usada · antigüedad · estado · vista · orientación ·
  piso) + amenidades interactivas (reusa `amenitiesUI` del dev, catálogo compartido `/api/asesor/amenities-catalog`).
  `CaptacionIn` extendido (condicion/antiguedad/estado/vista/orientacion/nivel/amenity_keys) + selector de colonia.
- ✅ **G1 nueva/usada operacionalizada + flywheel cerrado**: `resale_data.resale_reference(db,colonia)` = mediana
  $/m² de las captaciones (venta) de la zona. Cuando hay ≥2, el "Precio en Contexto" del comprador usa **reventa REAL**
  ("Reventa real de la zona (N)") en vez de la estimada. Y el asesor ve **valor estimado en vivo** mientras captura
  (`captacion_value_engine` + `GET /api/asesor/captacion-estimate`), que SUBE con cada detalle y marca su fuente
  (real vs estimada). Verificado punta a punta: 3 captaciones → referencia real → comprador la consume.
- ✅ **G3 AVM rico**: motor compartido `avm_feature_engine.feature_adjustments` (vista/estado/condición/antigüedad/
  amenidades/orientación/piso → multiplicador + "drivers" en lenguaje normal: "Vista al parque ↑", "Para remodelar ↓").
  Lo usan el AVM público (`avm_quick`/`avm_quick_async` aceptan `attrs` + devuelven `drivers`), la valuación de
  captación del asesor (unificada, sin duplicar) y queda listo para la unidad del dev. Surfaceado en el valuador
  público (`Valores.js`: inputs Vista+Estado + "Qué mueve el precio") y en el captador del asesor (chips ↑/↓).
  Verificado: mismo depa $6.12M→$7.36M con vista+estado+amenidades, explicado en lenguaje normal.
- PENDIENTE (escala): alimentar el modelo hedónico con captaciones cuando haya volumen (hoy heurística + atributos).

## REGLA QUE QUEDA
Capturamos máximo (170 campos), pero **el valor está en USAR y ALIMENTAR**: conectar atributos→AVM (G3), abrir la captación del asesor (G2) y operacionalizar nueva/usada (G1). Doc en repo `memory/AVM_GRANULARITY_VISION.md`.
