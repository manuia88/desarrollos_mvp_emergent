/**
 * Phase 4 Batch 23 — Quick Action templates per role (frontend mirror).
 * Backend duplicate at routes_copilot.py — keep in sync.
 */
export const QUICK_ACTIONS_BY_ROLE = {
  developer_admin: [
    { id: 'tension_inventario', label: '¿Qué corte de mi inventario está caliente?',
      prompt: 'Revisa tension_de_mis_cortes del contexto: ¿qué celda (colonia × recámaras) tiene mayor tensión y cuál está fría (candidata a recorte de precio)?' },
    { id: 'pipeline_summary', label: 'Resume mi pipeline esta semana',
      prompt: 'Dame un resumen ejecutivo de mi pipeline esta semana: leads activos, conversiones, y proyectos con mejor desempeño. Usa viñetas.' },
    { id: 'leads_followup', label: '¿Qué leads necesitan follow-up hoy?',
      prompt: 'Identifica los leads que necesitan follow-up urgente hoy basándote en última interacción y stage. Lista hasta 5 priorizados.' },
    { id: 'top_actions', label: 'Top 3 acciones para vender más rápido',
      prompt: 'Dame las 3 acciones de mayor impacto que puedo ejecutar esta semana para acelerar ventas. Justifica cada una con datos.' },
    { id: 'predict_sales', label: 'Predice ventas próximo mes',
      prompt: 'Estima mis ventas del próximo mes proyecto por proyecto, basándote en velocidad histórica y leads activos. Sé conservador.' },
    { id: 'low_health', label: 'Proyectos con health bajo',
      prompt: 'Lista los proyectos con health score por debajo de 60 y diagnostica la principal causa de cada uno.' },
    { id: 'weekly_report', label: 'Reporte semanal para inversionistas',
      prompt: 'Redacta un reporte semanal en tono ejecutivo (≤200 palabras) con KPIs, riesgos y siguiente semana.' },
  ],
  advisor: [
    { id: 'cortes_calientes', label: '¿Qué cliente tiene el corte más peleado?',
      prompt: 'Revisa cortes_de_mis_clientes: ¿qué búsqueda tiene mayor tension_por_unidad, de qué cliente es, y qué le digo HOY con esos números (unidades que le quedan + compradores compitiendo)?' },
    { id: 'my_pipeline', label: 'Mi pipeline esta semana',
      prompt: 'Resume mi pipeline activo esta semana: cantidad de leads por stage, valor estimado y próximas citas. Sé breve.' },
    { id: 'next_call', label: '¿A quién debo llamar primero?',
      prompt: 'De mis leads activos, ¿a quién debería contactar primero hoy y por qué? Prioriza por score y tiempo desde último contacto.' },
    { id: 'best_match', label: 'Mejor proyecto para mis leads top',
      prompt: 'Para mis 3 leads con mayor score, recomienda el proyecto del catálogo que mejor encaja con su perfil.' },
    { id: 'close_today', label: 'Leads que puedo cerrar esta semana',
      prompt: 'Identifica leads en stage avanzado que tienen alta probabilidad de cierre en los próximos 7 días.' },
    { id: 'best_links', label: 'Mis links con mejor desempeño',
      prompt: 'Resume cuáles de mis tracking links están convirtiendo mejor y qué puedo hacer para amplificarlos.' },
    { id: 'improve_perf', label: 'Cómo subir mi health score',
      prompt: 'Mi health score actual está en el contexto. Dame 3 acciones concretas para subirlo en 7 días.' },
  ],
  inmobiliaria_admin: [
    { id: 'team_perf', label: 'Performance de mi equipo este mes',
      prompt: 'Resume el performance de mi equipo de asesores este mes: top 3, pipeline total y dónde hay cuellos de botella.' },
    { id: 'top_asesores', label: 'Mis mejores asesores',
      prompt: 'Lista a mis top 5 asesores ordenados por pipeline activo y leads convertidos.' },
    { id: 'pipeline_org', label: 'Pipeline total de la org',
      prompt: 'Dame el pipeline consolidado de la inmobiliaria y los principales proyectos que aportan.' },
    { id: 'low_perf', label: 'Asesores que necesitan apoyo',
      prompt: 'Identifica asesores con desempeño por debajo del promedio del equipo y sugiere acciones de coaching.' },
    { id: 'weekly_brief', label: 'Brief semanal para mi equipo',
      prompt: 'Redacta un brief semanal para mi equipo con foco, prioridades y reto colectivo. Tono motivador.' },
  ],
};

QUICK_ACTIONS_BY_ROLE.superadmin = QUICK_ACTIONS_BY_ROLE.developer_admin;
QUICK_ACTIONS_BY_ROLE.developer_director = QUICK_ACTIONS_BY_ROLE.developer_admin;
QUICK_ACTIONS_BY_ROLE.developer_member = QUICK_ACTIONS_BY_ROLE.developer_admin;
QUICK_ACTIONS_BY_ROLE.asesor = QUICK_ACTIONS_BY_ROLE.advisor;
QUICK_ACTIONS_BY_ROLE.asesor_admin = QUICK_ACTIONS_BY_ROLE.inmobiliaria_admin;
QUICK_ACTIONS_BY_ROLE.inmobiliaria_member = QUICK_ACTIONS_BY_ROLE.advisor;

export function getQuickActionsForRole(role) {
  return QUICK_ACTIONS_BY_ROLE[role] || QUICK_ACTIONS_BY_ROLE.advisor;
}

export default { QUICK_ACTIONS_BY_ROLE, getQuickActionsForRole };
