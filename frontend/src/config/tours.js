/**
 * Batch 19 Sub-A — Tours configuration
 * 5 tours: dev_first_login, asesor_first_login, inmobiliaria_first_login,
 *           comprador_first_login, dev_post_first_project
 */

export const TOURS = {
  dev_first_login: {
    id: 'dev_first_login',
    role: 'developer_admin',
    steps: [
      {
        target: '[data-testid="portal-layout"]',
        title: 'Bienvenido a DesarrollosMX',
        content: 'Tu plataforma AI-native para gestionar proyectos residenciales en LATAM.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="portal-sidebar"]',
        title: 'Navegación por niveles',
        content: 'El sidebar organiza todas las funciones en 3 niveles: Proyectos, Ventas y Configuración.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-proyectos"] , [data-testid="nav-item-mis_proyectos"]',
        title: 'Mis Proyectos',
        content: 'Aquí encuentras todos tus desarrollos con health scores, leads activos y métricas clave.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nuevo-proyecto-btn"] , [data-testid="search-trigger-btn"]',
        title: 'Crea tu primer proyecto',
        content: 'Usa el wizard guiado de 7 pasos para subir tu desarrollo y publicarlo en el marketplace.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-crm"] , [data-testid="nav-item-leads"]',
        title: 'CRM de Ventas',
        content: 'Gestiona tu pipeline de leads con Kanban visual, filtros inteligentes y heat scoring IA.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="diagnostic-widget"] , [data-testid="portal-topbar"]',
        title: 'Motor de Diagnóstico',
        content: 'El engine analiza tu proyecto en 35 dimensiones y genera acciones correctivas priorizadas.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-testid="search-trigger-btn"]',
        title: 'Project Switcher · Cmd+/',
        content: 'Usa Cmd+/ para cambiar de proyecto al instante. Cmd+K para búsqueda universal.',
        placement: 'bottom',
        disableBeacon: true,
      },
    ],
  },

  asesor_first_login: {
    id: 'asesor_first_login',
    role: 'advisor',
    steps: [
      {
        target: '[data-testid="portal-layout"]',
        title: 'Bienvenido, Asesor',
        content: 'Tu portal CRM con IA para gestionar contactos, búsquedas y cerrar más operaciones.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-busquedas"] , [data-testid="nav-item-contactos"]',
        title: 'CRM Kanban',
        content: 'Arrastra contactos entre columnas del pipeline. Validaciones inteligentes protegen el flujo.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-citas"] , [data-testid="nav-item-configuracion"]',
        title: 'Calendar OAuth',
        content: 'Conecta tu Google Calendar para gestionar disponibilidad y confirmar citas automáticamente.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-contactos"]',
        title: 'Mis Leads',
        content: 'Cada contacto tiene timeline completo, resumen IA y argumentario Claude personalizado.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="portal-topbar"]',
        title: 'Links de Tracking',
        content: 'Genera links únicos con UTM para rastrear qué canales te traen más conversiones.',
        placement: 'bottom',
        disableBeacon: true,
      },
    ],
  },

  inmobiliaria_first_login: {
    id: 'inmobiliaria_first_login',
    role: 'inmobiliaria_admin',
    steps: [
      {
        target: '[data-testid="portal-layout"]',
        title: 'Bienvenido a tu Portal',
        content: 'Dashboard centralizado para gestionar tu red de asesores y pipeline de ventas.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-dashboard"] , [data-testid="portal-topbar"]',
        title: 'Portfolio Overview',
        content: 'Vista consolidada de todos tus desarrollos activos, unidades disponibles y revenue MTD.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-asesores"] , [data-testid="portal-sidebar"]',
        title: 'Gestión de Asesores',
        content: 'Invita asesores, asigna roles y monitorea el leaderboard con ranking Elo en tiempo real.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="portal-main"]',
        title: 'Métricas del Equipo',
        content: 'Conversión, citas realizadas, leads activos y revenue por asesor en un solo dashboard.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-reportes"] , [data-testid="portal-topbar"]',
        title: 'Reportes Automáticos',
        content: 'Genera reportes PDF branded con insights IA para compartir con desarrolladoras.',
        placement: 'bottom',
        disableBeacon: true,
      },
    ],
  },

  comprador_first_login: {
    id: 'comprador_first_login',
    role: 'buyer',
    steps: [
      {
        target: 'body',
        title: 'Bienvenido al Marketplace',
        content: 'Encuentra tu departamento ideal con búsqueda inteligente y datos reales de ubicación.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="search-bar"] , [data-testid="marketplace-search"]',
        title: 'Búsqueda AI',
        content: 'Describe lo que buscas en lenguaje natural: "2 recámaras en Roma Norte hasta $5M".',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-testid="property-card"] , [data-testid="development-card"]',
        title: 'Desarrollos con datos reales',
        content: 'Cada proyecto tiene scores de vida, movilidad, seguridad y plusvalía proyectada.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-testid="portal-topbar"] , body',
        title: 'Favoritos',
        content: 'Guarda tus favoritos y compara proyectos lado a lado antes de agendar una visita.',
        placement: 'center',
        disableBeacon: true,
      },
    ],
  },

  dev_post_first_project: {
    id: 'dev_post_first_project',
    role: 'developer_admin',
    steps: [
      {
        target: '[data-testid="portal-main"]',
        title: 'Proyecto creado con éxito',
        content: 'Ahora activa el motor de inteligencia para medir la salud de tu desarrollo.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-reportes"] , [data-testid="portal-sidebar"]',
        title: 'Insights & Reportes',
        content: 'Análisis de absorción, forecast de ventas y comparativa con competidores del mercado.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="nav-item-crm"] , [data-testid="nav-item-leads"]',
        title: 'Activar Comercialización',
        content: 'Configura el CRM de leads, asigna asesores y define reglas de auto-asignación.',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-testid="search-trigger-btn"]',
        title: 'Publicar en Marketplace',
        content: 'Publica tu proyecto y empieza a recibir leads calificados del marketplace público.',
        placement: 'bottom',
        disableBeacon: true,
      },
    ],
  },
};

/**
 * Returns the tour_id for the role's first login tour.
 */
export function getFirstLoginTourId(role) {
  if (role === 'developer_admin' || role === 'developer_member' || role === 'developer') {
    return 'dev_first_login';
  }
  if (role === 'advisor' || role === 'asesor_admin') return 'asesor_first_login';
  if (role === 'inmobiliaria_admin' || role === 'inmobiliaria_member') return 'inmobiliaria_first_login';
  if (role === 'buyer') return 'comprador_first_login';
  return null;
}
