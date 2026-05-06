/**
 * Phase 4 Batch 26 · Config — Quiz "Encuentra tu colonia ideal"
 * 10 preguntas. Las claves coinciden con los keys que el backend espera en
 * services/colonia_quiz.py.
 */

export const QUIZ_QUESTIONS = [
  {
    id: 'presupuesto',
    title: '¿Cuál es tu presupuesto aproximado?',
    subtitle: 'Para encontrar colonias accesibles a tu rango.',
    type: 'single',
    options: [
      { value: 'lt3m',   label: 'Hasta $3M MXN' },
      { value: '3to6m',  label: '$3M – $6M MXN' },
      { value: '6to12m', label: '$6M – $12M MXN' },
      { value: 'gt12m',  label: 'Más de $12M MXN' },
    ],
  },
  {
    id: 'uso',
    title: '¿Cuál es el principal uso?',
    subtitle: 'Cambia las dimensiones que pesan más en el match.',
    type: 'single',
    options: [
      { value: 'vivir',              label: 'Vivir aquí' },
      { value: 'invertir-renta',     label: 'Invertir para renta' },
      { value: 'invertir-plusvalia', label: 'Invertir por plusvalía' },
    ],
  },
  {
    id: 'etapa_vida',
    title: '¿Cómo describirías tu momento de vida?',
    subtitle: 'Familia, soltero, pareja… cada uno necesita cosas distintas.',
    type: 'single',
    options: [
      { value: 'soltero',             label: 'Soltero/a' },
      { value: 'pareja',              label: 'En pareja' },
      { value: 'familia con hijos',   label: 'Familia con hijos' },
      { value: 'retirado',            label: 'Retiro / pre-retiro' },
    ],
  },
  {
    id: 'recamaras_min',
    title: '¿Cuántas recámaras necesitas como mínimo?',
    type: 'single',
    options: [
      { value: '1', label: '1 recámara' },
      { value: '2', label: '2 recámaras' },
      { value: '3', label: '3 recámaras' },
      { value: '4', label: '4 o más' },
    ],
  },
  {
    id: 'lifestyle',
    title: '¿Qué buscas en tu día a día?',
    subtitle: 'Puedes elegir varias.',
    type: 'multi',
    options: [
      { value: 'gastronomy', label: 'Gastronomía' },
      { value: 'nightlife',  label: 'Vida nocturna' },
      { value: 'culture',    label: 'Cultura y arte' },
      { value: 'nature',     label: 'Áreas verdes' },
      { value: 'family',     label: 'Ambiente familiar' },
      { value: 'shopping',   label: 'Compras y centros' },
    ],
  },
  {
    id: 'movilidad',
    title: '¿Cómo te mueves principalmente?',
    type: 'single',
    options: [
      { value: 'auto',         label: 'Auto propio' },
      { value: 'transporte',   label: 'Transporte público' },
      { value: 'bici',         label: 'Bici / scooter' },
      { value: 'mixto',        label: 'Mixto' },
    ],
  },
  {
    id: 'seguridad_importance',
    title: '¿Qué tan importante es la seguridad para ti?',
    type: 'single',
    options: [
      { value: 'muy alta', label: 'Muy importante — top prioridad' },
      { value: 'alta',     label: 'Importante' },
      { value: 'media',    label: 'Razonable, no decisiva' },
    ],
  },
  {
    id: 'distancia_trabajo',
    title: '¿Necesitas estar cerca del trabajo o escuela?',
    type: 'single',
    options: [
      { value: 'centro',        label: 'Cerca del centro / Reforma' },
      { value: 'sur',           label: 'Sur de la ciudad' },
      { value: 'poniente',      label: 'Poniente / Santa Fe' },
      { value: 'no-relevante',  label: 'No es relevante' },
    ],
  },
  {
    id: 'tipo_propiedad',
    title: '¿Qué tipo de propiedad prefieres?',
    type: 'single',
    options: [
      { value: 'departamento', label: 'Departamento' },
      { value: 'casa',         label: 'Casa' },
      { value: 'townhouse',    label: 'Townhouse / loft' },
      { value: 'cualquiera',   label: 'Cualquiera' },
    ],
  },
  {
    id: 'plazo_compra',
    title: '¿En cuánto tiempo planeas comprar?',
    type: 'single',
    options: [
      { value: 'ya',          label: 'En los próximos 3 meses' },
      { value: '3-6',         label: '3 – 6 meses' },
      { value: '6-12',        label: '6 – 12 meses' },
      { value: 'explorando',  label: 'Solo estoy explorando' },
    ],
  },
];
