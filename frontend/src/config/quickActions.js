/**
 * Phase 4 Batch 14 — Quick Actions config per route.
 * Each route pattern maps to an array of action descriptors.
 * Used by FloatingQuickActions in layout/page components.
 */

export const QUICK_ACTIONS_BY_ROUTE = {
  '/panel': [
    {
      label: 'Crear lead',
      key: 'create_lead',
      testId: 'fqa-create-lead',
    },
    {
      label: 'Crear cita',
      key: 'create_cita',
      testId: 'fqa-create-cita',
    },
    {
      label: 'Ver tareas pendientes',
      key: 'view_tasks',
      testId: 'fqa-view-tasks',
      href: '/asesor/tareas',
    },
  ],
  '/desarrollador/proyectos/new': [
    {
      label: 'Crear proyecto',
      key: 'create_project',
      testId: 'fqa-create-project',
      href: '/desarrollador/proyectos/nuevo',
    },
    {
      label: 'Importar Excel',
      key: 'import_excel',
      testId: 'fqa-import-excel',
    },
  ],
  '/desarrollador/proyectos/:id': [
    {
      label: 'Editar info del proyecto',
      key: 'edit_project',
      testId: 'fqa-edit-project',
    },
    {
      label: 'Marcar unidad vendida',
      key: 'mark_sold',
      testId: 'fqa-mark-sold',
    },
    {
      label: 'Crear cita comprador',
      key: 'create_buyer_cita',
      testId: 'fqa-buyer-cita',
    },
  ],
  '/desarrollador/crm': [
    {
      label: 'Crear lead',
      key: 'create_lead',
      testId: 'fqa-crm-create-lead',
    },
    {
      label: 'Exportar pipeline',
      key: 'export_pipeline',
      testId: 'fqa-export-pipeline',
    },
  ],
  '/desarrollador/proyectos': [
    {
      label: 'Nuevo proyecto',
      key: 'create_project',
      testId: 'fqa-new-project',
      href: '/desarrollador/proyectos/nuevo',
      primary: true,
    },
    {
      label: 'Importar Excel',
      key: 'import_excel',
      testId: 'fqa-import-excel',
    },
  ],
};

/**
 * Resolve quick actions for a given pathname.
 * Matches exact routes first, then pattern routes (:id).
 * Returns the actions array or [].
 */
export function resolveQuickActions(pathname) {
  if (!pathname) return [];
  // Exact match
  if (QUICK_ACTIONS_BY_ROUTE[pathname]) return QUICK_ACTIONS_BY_ROUTE[pathname];
  // Pattern match (replace :id segments)
  for (const [pattern, actions] of Object.entries(QUICK_ACTIONS_BY_ROUTE)) {
    const regex = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$'
    );
    if (regex.test(pathname)) return actions;
  }
  return [];
}

export default QUICK_ACTIONS_BY_ROUTE;
