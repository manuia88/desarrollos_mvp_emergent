/**
 * Phase 4 Batch 16 · Sub-Chunk B — Smart Empty States config.
 *
 * Keys are context identifiers. Consumers pass `contextKey` to
 * <SmartEmptyState /> which renders copy + CTAs.
 */

export const EMPTY_STATES = {
  'leads.none': {
    title: 'Aún no hay leads en este pipeline',
    body: 'En cuanto llegue el primer prospecto aparecerá aquí. Mientras tanto, comparte el link público del proyecto para empezar a captar.',
    ctas: [
      { label: 'Nuevo lead', key: 'create_lead', testId: 'empty-cta-create-lead', primary: true },
      { label: 'Copiar link público', key: 'copy_public_link', testId: 'empty-cta-copy-link' },
    ],
  },
  'leads.filtered': {
    title: 'Sin resultados con los filtros actuales',
    body: 'Prueba a relajar los filtros o limpiar la búsqueda.',
    ctas: [
      { label: 'Limpiar filtros', key: 'clear_filters', testId: 'empty-cta-clear-filters', primary: true },
    ],
  },
  'appointments.none': {
    title: 'No hay citas próximas',
    body: 'Cuando un lead agende a través del portal público, o un asesor cree una cita manual, aparecerá aquí.',
    ctas: [
      { label: 'Agendar cita', key: 'create_cita', testId: 'empty-cta-create-cita', primary: true },
      { label: 'Configurar política', key: 'configure_policy',
        href: '/desarrollador/configuracion/citas-policies',
        testId: 'empty-cta-policy' },
    ],
  },
  'units.no_photos': {
    title: 'Este proyecto aún no tiene fotos',
    body: 'Súbelas desde el Legajo para que el marketplace público las muestre. Las fotos con marca de agua mejoran la conversión.',
    ctas: [
      { label: 'Ir al Legajo', key: 'open_legajo', testId: 'empty-cta-open-legajo', primary: true },
    ],
  },
  'tasks.none': {
    title: 'Bandeja al día',
    body: 'No tienes tareas pendientes. Excelente — considera crear un recordatorio para tus próximos follow-ups.',
    ctas: [
      { label: 'Nueva tarea', key: 'create_task', testId: 'empty-cta-create-task', primary: true },
    ],
  },
  'suggestions.none': {
    title: 'Sin sugerencias activas',
    body: 'La IA necesita un poco más de contexto para sugerir acciones útiles. Prueba a regenerar o vuelve cuando haya más actividad.',
    ctas: [
      { label: 'Regenerar', key: 'regen_suggestions', testId: 'empty-cta-regen', primary: true },
    ],
  },
  'activity.none': {
    title: 'Sin actividad reciente',
    body: 'Conforme tu equipo trabaje en el portal, verás aquí los eventos: creación de leads, cambios de status, cierres, etc.',
    ctas: [],
  },
  'inventory.none': {
    title: 'Aún no hay unidades registradas',
    body: 'Sube tu lista de precios o crea unidades desde el wizard para empezar a vender.',
    ctas: [
      { label: 'Subir lista de precios', key: 'bulk_upload',
        testId: 'empty-cta-bulk-upload', primary: true },
      { label: 'Nuevo proyecto', key: 'create_project',
        href: '/desarrollador/proyectos/nuevo',
        testId: 'empty-cta-create-project' },
    ],
  },
  'projects.none': {
    title: 'Aún no has creado proyectos',
    body: 'Crea tu primer proyecto para activar el CRM, los leads y el marketplace público.',
    ctas: [
      { label: 'Nuevo proyecto', key: 'create_project',
        href: '/desarrollador/proyectos/nuevo',
        testId: 'empty-cta-create-project', primary: true },
    ],
  },
  'briefings.none': {
    title: 'Todavía no hay briefings IE generados',
    body: 'Genera uno desde la ficha de cualquier desarrollo para tener argumentarios listos para WhatsApp o correo.',
    ctas: [
      { label: 'Explorar desarrollos', key: 'browse_developments',
        href: '/marketplace',
        testId: 'empty-cta-browse-dev', primary: true },
    ],
  },
};

export function getEmptyState(contextKey) {
  return EMPTY_STATES[contextKey] || {
    title: 'Sin datos por ahora',
    body: 'Vuelve más tarde cuando haya información para mostrar.',
    ctas: [],
  };
}

export default EMPTY_STATES;
