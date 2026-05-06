/**
 * Phase 4 Batch 32 · DISC Questions Config (frontend)
 *
 * 7 preguntas force-choice. Cada answer ID coincide con backend services/disc_test.py.
 * El backend hace el scoring; el frontend solo presenta y captura q_id+value.
 */

export const DISC_QUESTIONS = [
  {
    q_id: 'q1',
    prompt: 'En equipo prefieres…',
    options: [
      { value: 'a', label: 'Liderar y marcar el ritmo' },
      { value: 'b', label: 'Motivar y conectar con la gente' },
      { value: 'c', label: 'Apoyar y mantener la armonía' },
      { value: 'd', label: 'Organizar y cuidar los detalles' },
    ],
  },
  {
    q_id: 'q2',
    prompt: 'Bajo presión tiendes a…',
    options: [
      { value: 'a', label: 'Actuar rápido y tomar control' },
      { value: 'b', label: 'Buscar el apoyo de la gente' },
      { value: 'c', label: 'Mantener la calma y escuchar' },
      { value: 'd', label: 'Analizar antes de decidir' },
    ],
  },
  {
    q_id: 'q3',
    prompt: 'Tu comunicación es…',
    options: [
      { value: 'a', label: 'Directa y enfocada al resultado' },
      { value: 'b', label: 'Expresiva y entusiasta' },
      { value: 'c', label: 'Paciente y empática' },
      { value: 'd', label: 'Precisa y basada en datos' },
    ],
  },
  {
    q_id: 'q4',
    prompt: 'En proyectos te motiva…',
    options: [
      { value: 'a', label: 'Competir y ganar' },
      { value: 'b', label: 'Entusiasmar al grupo' },
      { value: 'c', label: 'Estabilizar las relaciones' },
      { value: 'd', label: 'Asegurar precisión y calidad' },
    ],
  },
  {
    q_id: 'q5',
    prompt: 'Tomas decisiones…',
    options: [
      { value: 'a', label: 'Rápido, confiando en tu instinto' },
      { value: 'b', label: 'De forma intuitiva consultando con otros' },
      { value: 'c', label: 'Buscando consenso del equipo' },
      { value: 'd', label: 'Solo cuando tienes todos los datos' },
    ],
  },
  {
    q_id: 'q6',
    prompt: 'Tus colegas te describirían como…',
    options: [
      { value: 'a', label: 'Ambicioso y enfocado' },
      { value: 'b', label: 'Sociable y persuasivo' },
      { value: 'c', label: 'Leal y confiable' },
      { value: 'd', label: 'Cauteloso y metódico' },
    ],
  },
  {
    q_id: 'q7',
    prompt: 'Frente a un nuevo reto prefieres…',
    options: [
      { value: 'a', label: 'Asumir el control desde el día uno' },
      { value: 'b', label: 'Generar ideas con el equipo' },
      { value: 'c', label: 'Cuidar al equipo en la transición' },
      { value: 'd', label: 'Documentar el proceso paso a paso' },
    ],
  },
];

export const PRIMARY_LABELS = {
  D: 'Dominante',
  I: 'Influyente',
  S: 'Estable',
  C: 'Cauteloso',
};

export const PRIMARY_COLORS = {
  D: '#EF4444',  // rojo intenso
  I: '#F59E0B',  // ámbar
  S: '#22C55E',  // verde
  C: '#6366F1',  // indigo
};
