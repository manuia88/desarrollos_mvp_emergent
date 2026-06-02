/**
 * F1 · navByRoleV2.js — Asesor Sidebar Reorg V2 (additive, parallel to navByRole.js)
 *
 * Reorganiza ASESOR_NAV (34 items planos en 3 tiers) → 10 grupos jerárquicos.
 * REGLA NO ORPHANS: cada hoja conserva su `to:` original (verificado vs App.js).
 * Activado por feature flag REACT_APP_SIDEBAR_V2 === 'true' (ver AdvisorLayout.js).
 * Labels/descriptions se traducen vía namespace i18n 'asesor_sidebar_v2'; los strings
 * aquí son fallback y sirven de type hint.
 *
 * @typedef {Object} NavLeafV2
 * @property {string} key            — identificador estable (= clave i18n)
 * @property {string} to             — ruta destino (DEBE existir en App.js)
 * @property {string} label          — fallback es-MX (i18n override)
 * @property {React.ComponentType} Icon — icono lucide-react
 * @property {string} [badge_source] — id de contador dinámico (BADGE_SOURCES PortalLayout)
 *
 * @typedef {Object} NavGroupV2
 * @property {string} key
 * @property {string} to             — ruta del grupo (click navega aquí)
 * @property {string} label
 * @property {React.ComponentType} Icon
 * @property {string} description     — explicación 1 línea del grupo
 * @property {string} [badge_source]
 * @property {NavLeafV2[]} [children] — sub-items desplegables (accordion)
 */
import {
  Home, Users, Search, Plug, CalendarDays, ClipboardList,
  Building2, Briefcase, Store, Megaphone, MessageCircle, MessageSquare,
  GitMerge, Layers, Sparkles,
  Share2, BarChart3, DollarSign, FileText, MapPin,
  Activity, Link, Bot, Bell, Radar, LineChart,
  // DEV_NAV_V2 (B7-dev F2 · sidebar reorg desarrollador)
  LayoutDashboard, TrendingUp, Target, Swords, Network, HeartHandshake,
  Settings, Package, FolderOpen, FolderUp, BarChart2, AlertTriangle,
} from 'lucide-react';

/** @type {NavGroupV2[]} */
export const ASESOR_NAV_V2 = [
  // 1 · Inicio (link directo · sin submenú)
  {
    key: 'inicio', to: '/asesor', label: 'Inicio', Icon: Home, end: true,
    description: 'Tu vista del día · KPIs · próximas citas · leads calientes',
  },
  // 2 · Mis Leads
  {
    key: 'mis-leads', to: '/asesor/mis-leads', label: 'Mis Leads', Icon: Users,
    description: 'Tu centro de leads · pipeline, búsquedas y captaciones en un lugar',
    children: [
      { key: 'contactos',   to: '/asesor/contactos',             label: 'Lista de leads',      Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'pipeline',    to: '/asesor/mis-leads',             label: 'Pipeline',            Icon: Megaphone },
      { key: 'busquedas',   to: '/asesor/mis-leads/busquedas',   label: 'Búsquedas',           Icon: Search },
      { key: 'captaciones', to: '/asesor/mis-leads/captaciones', label: 'Captaciones',         Icon: Briefcase },
      { key: 'alertas',     to: '/portal/asesor/alertas',        label: 'Alertas predictivas', Icon: Bell },
      { key: 'outbound',    to: '/asesor/outbound',              label: 'Captura proactiva',   Icon: Radar },
    ],
  },
  // 3 · Agenda
  {
    key: 'agenda', to: '/asesor/citas', label: 'Agenda', Icon: CalendarDays,
    description: 'Citas confirmadas + tareas hoy y semana',
    badge_source: 'citas_today',
    children: [
      { key: 'citas',  to: '/asesor/citas',  label: 'Citas',  Icon: CalendarDays, badge_source: 'citas_today' },
      { key: 'tareas', to: '/asesor/tareas', label: 'Tareas', Icon: ClipboardList },
    ],
  },
  // 4 · Inventario
  {
    key: 'inventario', to: '/asesor/desarrollos', label: 'Inventario', Icon: Building2,
    description: 'Desarrollos + Mini Market público (tus captaciones viven en Mis Leads)',
    children: [
      { key: 'desarrollos', to: '/asesor/desarrollos', label: 'Desarrollos',          Icon: Building2 },
      { key: 'mini-market', to: '/asesor/mini-market', label: 'Mini Market',          Icon: Store },
    ],
  },
  // 5 · Conversaciones IA
  {
    key: 'conversaciones-ia', to: '/portal/asesor/conversation-playground', label: 'Conversaciones IA', Icon: MessageCircle,
    description: 'Agente IA califica leads · bandeja Slack-style · handoff',
    children: [
      { key: 'playground', to: '/portal/asesor/conversation-playground', label: 'Playground IA',    Icon: MessageCircle },
      { key: 'inbox',      to: '/portal/asesor/conversation-inbox',      label: 'Bandeja IA',       Icon: MessageSquare },
    ],
  },
  // 5b · Conexiones (B7 F2 · unifica Canales + Anuncios Meta + Campañas + Fuentes en un hub)
  {
    key: 'conexiones', to: '/portal/asesor/conexiones', label: 'Conexiones', Icon: Plug,
    description: 'Canales, anuncios Meta y fuentes de leads — todo en un lugar',
    children: [
      { key: 'conexiones-hub', to: '/portal/asesor/conexiones', label: 'Canales y anuncios', Icon: Share2 },
      { key: 'lead-aliases',   to: '/asesor/lead-aliases',      label: 'Fuentes de leads',   Icon: Plug },
    ],
  },
  // 6 · Automatizaciones
  {
    key: 'automatizaciones', to: '/portal/asesor/workflows', label: 'Automatizaciones', Icon: GitMerge,
    description: 'Workflows que se disparan solos + plantillas marketplace',
    children: [
      { key: 'agents',      to: '/portal/asesor/agents',                 label: 'Agentes IA',             Icon: Bot },
      { key: 'workflows',   to: '/portal/asesor/workflows',              label: 'Mis workflows',          Icon: GitMerge },
      { key: 'marketplace', to: '/portal/asesor/marketplace-templates',  label: 'Marketplace plantillas', Icon: Layers },
    ],
  },
  // 7 · Studio Marketing (B7 F4 · 8 ítems → 1 hub con 2 áreas: Crear + Marca y Biblioteca)
  {
    key: 'studio', to: '/asesor/studio', label: 'Studio Marketing', Icon: Sparkles,
    description: 'Todo tu contenido con IA · Crear (video/carruseles/landings) + Marca y Biblioteca',
  },
  // 8 · Mi Performance
  {
    key: 'performance', to: '/asesor/comisiones', label: 'Mi Performance', Icon: BarChart3,
    description: 'Comisiones · ranking · SOC · análisis comparativo',
    children: [
      { key: 'metricas',         to: '/asesor/metricas',       label: 'Métricas',          Icon: LineChart },
      { key: 'equipo',           to: '/asesor/equipo',         label: 'Equipo (gerente)',  Icon: Users },
      { key: 'comisiones',       to: '/asesor/comisiones',     label: 'Comisiones',        Icon: DollarSign },
      { key: 'operaciones',      to: '/asesor/operaciones',    label: 'Operaciones',       Icon: Activity },
      { key: 'cma',              to: '/asesor/cma',            label: 'CMA · Análisis',    Icon: BarChart3 },
      { key: 'briefings',        to: '/asesor/briefings',      label: 'Briefings',         Icon: FileText },
      { key: 'links-tracking',   to: '/asesor/links-tracking', label: 'Links tracking',    Icon: Link },
    ],
  },
  // 9 · Tráfico + Clima (Anuncios Meta + Campañas migraron a Conexiones · B7 F2)
  {
    key: 'herramientas', to: '/asesor/briefing', label: 'Tráfico + Clima', Icon: MapPin,
    description: 'Tráfico + clima de la zona antes de cada visita',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// DEV_NAV_V2 — Sidebar Reorg V2 del DESARROLLADOR (B7-dev · Paso B + fusión 7 tabs)
// Aditivo y paralelo a DEV_NAV (navByRole.js). Activado por REACT_APP_DEV_V2.
// REGLA NO ORPHANS: cada `to:` existe en App.js (verificado).
// Consolida 24 ítems casi planos → 2 accesos directos + 5 hubs = 7 entradas.
// FUSIÓN (2026-06-02): Mensajes→dentro de CRM · Operación(Solicitudes/Disputas)→Red comercial
//   · Mini Market→Marketing(ex-Studio). RESCATA 5 pantallas antes solo-URL.
// (Lo apagado que necesita pantalla nueva — motores, suite IA — llega en Paso C.)
/** @type {NavGroupV2[]} */
export const DEV_NAV_V2 = [
  // 1 · Inicio (acceso directo)
  {
    key: 'inicio', to: '/desarrollador', label: 'Inicio', Icon: LayoutDashboard, end: true,
    description: 'Tu panel del día · salud de proyectos · alertas',
  },
  // 2 · Mis Proyectos (CENTRO · acceso directo)
  {
    key: 'proyectos', to: '/desarrollador/proyectos', label: 'Mis Proyectos', Icon: Building2,
    badge_source: 'projects_health_below_60',
    description: 'Tu centro · cada proyecto abre inventario, precios, demanda y leads',
  },
  // 3 · CRM & Leads (hub · Embudo, Leads, Auto-asignación + Mensajes fusionado)
  {
    key: 'crm', to: '/desarrollador/crm', label: 'CRM & Leads', Icon: ClipboardList,
    badge_source: 'crm_unread_leads',
    description: 'Embudo, leads, auto-asignación y conversaciones — todo el pipeline',
    children: [
      { key: 'crm-tablero',  to: '/desarrollador/crm',                  label: 'Tablero',         Icon: ClipboardList, badge_source: 'crm_unread_leads' },
      { key: 'crm-embudo',   to: '/desarrollador/crm/funnel',           label: 'Embudo',          Icon: GitMerge },
      { key: 'crm-leads',    to: '/desarrollador/leads',                label: 'Leads',           Icon: Users },
      { key: 'crm-autoasig', to: '/desarrollador/crm/auto-assignments', label: 'Auto-asignación', Icon: Share2 },
      { key: 'crm-mensajes', to: '/desarrollador/mensajes',             label: 'Mensajes',        Icon: MessageSquare },
      { key: 'crm-cerebro',  to: '/desarrollador/crm/sala-control',     label: 'Tu asistente', Icon: Sparkles },
    ],
  },
  // 4 · Inteligencia (hub · cerebro de mercado)
  {
    key: 'inteligencia', to: '/desarrollador/demanda', label: 'Inteligencia', Icon: Sparkles,
    description: 'Demanda, precios, competidores y reportes — tu cerebro de mercado',
    children: [
      { key: 'int-demanda',      to: '/desarrollador/demanda',        label: 'Demanda',        Icon: BarChart3 },
      { key: 'int-pricing',      to: '/desarrollador/pricing',        label: 'Precios IA',     Icon: TrendingUp },
      { key: 'int-competidores', to: '/desarrollador/competidores',   label: 'Competidores',   Icon: Target },
      { key: 'int-battle',       to: '/desarrollador/battle-card',    label: 'Battle Card',    Icon: Swords },
      { key: 'int-reportes',     to: '/desarrollador/reportes',       label: 'Reportes IA',    Icon: LineChart },
      { key: 'int-site',         to: '/desarrollador/site-selection', label: 'Site Selection', Icon: MapPin },
    ],
  },
  // 5 · Red comercial (hub · Asesores/Equipo/Métricas/Alianzas + Solicitudes/Disputas fusionados)
  {
    key: 'red-comercial', to: '/desarrollador/red-comercial', label: 'Red comercial', Icon: Network,
    description: 'Asesores, equipo, métricas, alianzas y bandeja de solicitudes/disputas',
    children: [
      { key: 'rc-red',         to: '/desarrollador/red-comercial',        label: 'Red comercial',     Icon: Network },
      { key: 'rc-equipo',      to: '/desarrollador/usuarios',             label: 'Equipo',            Icon: Users },
      { key: 'rc-met-eq',      to: '/desarrollador/crm/metricas-equipo',  label: 'Métricas equipo',   Icon: BarChart2 },
      { key: 'rc-met-ase',     to: '/desarrollador/crm/asesores-metrics', label: 'Métricas asesores', Icon: BarChart2 },
      { key: 'rc-alianzas',    to: '/desarrollador/cross-partnerships',   label: 'Alianzas',          Icon: HeartHandshake },
      { key: 'rc-solicitudes', to: '/desarrollador/solicitudes',          label: 'Solicitudes',       Icon: Users,         badge_source: 'whitelist_pending_count' },
      { key: 'rc-disputas',    to: '/desarrollador/disputas',             label: 'Disputas leads',    Icon: AlertTriangle, badge_source: 'disputes_pending_count' },
    ],
  },
  // 6 · Marketing (hub · ex-Studio + Mini Market fusionado)
  {
    key: 'marketing', to: '/portal/studio/brand-kit', label: 'Marketing', Icon: Megaphone,
    description: 'Mini Market + Studio: tu suite de difusión y contenido con IA',
    children: [
      { key: 'mk-minimarket',   to: '/desarrollador/mini-market',  label: 'Mini Market',      Icon: Store },
      { key: 'mk-brand-kit',    to: '/portal/studio/brand-kit',    label: 'Brand Kit',        Icon: Package },
      { key: 'mk-assets',       to: '/portal/studio/assets',       label: 'Assets',           Icon: FolderOpen },
      { key: 'mk-import',       to: '/portal/studio/import',       label: 'Importar Listing', Icon: FolderUp },
      { key: 'mk-carruseles',   to: '/portal/studio/carruseles',   label: 'Carruseles',       Icon: Sparkles },
      { key: 'mk-auto-content', to: '/portal/studio/auto-content', label: 'Auto-Content',     Icon: Megaphone },
      { key: 'mk-landings',     to: '/portal/studio/landings',     label: 'Landings',         Icon: Layers },
    ],
  },
  // 7 · Ajustes (hub · rescata Políticas de cita)
  {
    key: 'ajustes', to: '/desarrollador/configuracion', label: 'Ajustes', Icon: Settings,
    description: 'Configuración general, integraciones y políticas',
    children: [
      { key: 'aj-config',  to: '/desarrollador/configuracion',                label: 'Configuración',     Icon: Settings },
      { key: 'aj-citas',   to: '/desarrollador/configuracion/citas-policies', label: 'Políticas de cita', Icon: CalendarDays },
    ],
  },
];

export default ASESOR_NAV_V2;
