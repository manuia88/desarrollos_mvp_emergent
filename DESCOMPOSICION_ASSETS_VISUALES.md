# LA DESCOMPOSICIÓN DE ASSETS VISUALES — fotos, renders, brochure y planos

> Spec canónica (founder + Claude, 2026-07-14). Hermana de DESCOMPOSICION_LISTA_PRECIOS.
> Pregunta: *"¿cuánta data se puede descomponer de fotos/renders/brochure/planos y cómo se
> integra a los portales y los ~200 motores?"* Respuesta: **~20 señales por asset en 6 niveles**.
> Caso de calibración: Almina (216 assets: 12 brochure + 7 amenidades + 29 muestra + 158 planos
> + video + brochure).

## Nivel 0 · CRUDOS por asset (~8)
Archivo, tipo (render/foto/plano/brochure/video), huella md5, fecha real, resolución,
**amarre** (¿de qué unidad/molde/nivel es?), fuente y linaje (Drive file, carpeta, quién lo subió).
El amarre es el moat: "plano de la A-1503", no "un plano".

## Nivel 1 · del PLANO (el más rico, ~25 por prototipo/unidad)
- **Distribución real**: ambientes (comedor/estancia/cocina/baños/vestidor/terraza), cuántos y dónde.
- **Cotas → m² por AMBIENTE** (el átomo debajo del m² total: recámara de 12 vs 9 m² al mismo precio).
- **Eficiencia de planta**: % circulación vs habitable (dos deptos de 112 m² NO valen igual).
- **Flex rooms detectadas**: la "3ª recámara" que el brochure niega y la lista presume (Almina: cazada).
- Orientación, frente/fondo, muros compartidos, ventanas por fachada, posición del balcón.
- **Motores que alimenta**: prototipos exactos ✅ (hecho hoy) · valuación por layout · comparador
  de plantas entre devs · la ECUACIÓN del precio gana el término "layout".

## Nivel 2 · de FOTOS y RENDERS (~15)
- **Amenidades VERIFICADAS**: alberca techada DICHA vs VISTA (Almina: 7 verificadas con foto real)
  → sello "verificado visualmente" en la ficha. Nadie en MX lo tiene.
- **Calidad de acabados percibida** (motor saliencia_visual de la Ola E, ya construido).
- **Promesa vs realidad**: render (promesa) ↔ foto del entregado (realidad) → score de cumplimiento
  del dev. Oro para confianza y para el CARFAX del desarrollador.
- Luz/orientación por sombras · vistas reales · clasificación render/obra/muestra (regla founder:
  muestra JAMÁS pública ✅ aplicada hoy: 29 privadas).

## Nivel 3 · del BROCHURE (~12)
- **Specs oficiales del arquitecto**: los PT con terraza exacta (HOY: reemplazaron al clustering).
- **Claims del dev** (promesas verificables: "28 años, 218 desarrollos" → bloque confianza ✅ hecho).
- Narrativa/estilo de marca (motor prima_marca, Ola E) · contactos · disclaimers legales
  (el disclaimer del Excel nos dijo qué fuente era fresca — leerlos SIEMPRE).

## Nivel 4 · CRUCES (el sello de verificación visual, ~15)
- Plano ↔ lista: **las cotas validan los m² declarados** (anti-inflado de metros — auditoría
  automática que ningún portal hace).
- Render ↔ foto real: cumplimiento de promesa por proyecto y por dev.
- Amenidad dicha ↔ amenidad vista: % verificado.
- Muestra ↔ acabados prometidos.
- Foto con fecha ↔ avance declarado (el vigía ya guarda fecha real de cada archivo).
→ Cada afirmación de la ficha con EVIDENCIA visual y linaje = confianza licenciable.

## Nivel 5 · PRODUCTOS (~12)
Plano por unidad en la ficha ✅ (hecho) · comparador visual de layouts entre devs · score
promesa-vs-realidad publicable · valuación por ambiente · "elige tu depto por sol" (orientación) ·
staging virtual sobre plano real (motor existente) · banco de renders etiquetado licenciable ·
material de venta por proyecto para el ASESOR (el gap #1 que encontró el agente: hoy no tiene
nada descargable — los assets cosechados SON ese material) · CARFAX visual del proyecto
(su evolución en fotos fechadas).

## INTEGRACIÓN CON PORTALES (dónde aterriza cada cosa)
- **Marketplace**: galería (hero+renders) ✅ · plano de TU unidad ✅ · amenidades con sello
  verificado · tour · promesa-vs-realidad en la ficha.
- **Portal DEV**: score de contenido (check #8 ✅) · qué foto CONVIERTE (cruzar assets con
  engagement_events — ya se registran) · benchmark visual vs competencia (battle card).
- **Portal ASESOR**: kit de venta descargable por proyecto (planos + renders + brochure) ·
  plano por WhatsApp al cliente · argumentos visuales en su playbook.
- **Motores**: saliencia visual · prima de amenidades · prototipos · staging · calidad de obra ·
  ecuación del precio (término layout) · confianza/fraude (m² inflados).

## La cuenta (Almina real)
216 assets × ~20 señales ≈ **4,300 puntos visuales** + los cruces. Con los 25 proyectos de
CLASS: **~50-80K puntos** — y cada señal con linaje (archivo, huella, fecha).

## Regla de construcción
Mismo registro universal de métricas derivadas que la spec hermana: señal nueva = 1 renglón.
La clasificación visual pesada (saliencia, promesa-vs-realidad) puede correr EN SESIÓN (como las
37 de hoy, $0) o con API cuando haya crédito — el pipeline es el mismo.
