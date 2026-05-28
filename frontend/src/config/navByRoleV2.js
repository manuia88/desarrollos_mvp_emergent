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
  GitMerge, Layers, Sparkles, Package, FolderOpen, FolderUp, Video,
  Share2, BarChart3, DollarSign, Trophy, ShieldCheck, FileText, MapPin,
  Activity, Link,
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
    key: 'mis-leads', to: '/asesor/contactos', label: 'Mis Leads', Icon: Users,
    description: 'Todos tus prospectos · filtros · scoring',
    children: [
      { key: 'contactos',    to: '/asesor/contactos',    label: 'Lista de leads',       Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'busquedas',    to: '/asesor/busquedas',    label: 'Búsquedas guardadas',  Icon: Search },
      { key: 'lead-aliases', to: '/asesor/lead-aliases', label: 'Conectar fuentes',     Icon: Plug },
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
    description: 'Desarrollos + tus captaciones + Mini Market público',
    children: [
      { key: 'desarrollos', to: '/asesor/desarrollos', label: 'Desarrollos',          Icon: Building2 },
      { key: 'captaciones', to: '/asesor/captaciones', label: 'Mis captaciones',      Icon: Briefcase },
      { key: 'mini-market', to: '/asesor/mini-market', label: 'Mini Market',          Icon: Store },
      { key: 'leads-dev',   to: '/asesor/leads-dev',   label: 'Leads de developers',  Icon: Megaphone },
    ],
  },
  // 5 · Conversaciones IA
  {
    key: 'conversaciones-ia', to: '/portal/asesor/conversation-playground', label: 'Conversaciones IA', Icon: MessageCircle,
    description: 'Agente IA califica leads · bandeja Slack-style · handoff',
    children: [
      { key: 'playground', to: '/portal/asesor/conversation-playground', label: 'Playground IA', Icon: MessageCircle },
      { key: 'inbox',      to: '/portal/asesor/conversation-inbox',      label: 'Bandeja IA',    Icon: MessageSquare },
    ],
  },
  // 6 · Automatizaciones
  {
    key: 'automatizaciones', to: '/portal/asesor/workflows', label: 'Automatizaciones', Icon: GitMerge,
    description: 'Workflows que se disparan solos + plantillas marketplace',
    children: [
      { key: 'workflows',   to: '/portal/asesor/workflows',              label: 'Mis workflows',          Icon: GitMerge },
      { key: 'marketplace', to: '/portal/asesor/marketplace-templates',  label: 'Marketplace plantillas', Icon: Layers },
    ],
  },
  // 7 · Studio Marketing
  {
    key: 'studio', to: '/asesor/studio', label: 'Studio Marketing', Icon: Sparkles,
    description: 'Crea videos · carruseles · landings · brand kit con IA',
    children: [
      { key: 'studio-director',         to: '/asesor/studio',                    label: 'Director IA',         Icon: Sparkles },
      { key: 'studio-brand-kit',        to: '/portal/studio/brand-kit',          label: 'Brand Kit',           Icon: Package },
      { key: 'studio-assets',           to: '/portal/studio/assets',             label: 'Assets · Mood Board', Icon: FolderOpen },
      { key: 'studio-import',           to: '/portal/studio/import',             label: 'Importar Listing',    Icon: FolderUp },
      { key: 'studio-video',            to: '/portal/asesor/studio-video',       label: 'Videos',              Icon: Video },
      { key: 'studio-video-standalone', to: '/portal/asesor/video-standalone',   label: 'Video Standalone',    Icon: Video },
      { key: 'studio-carruseles',       to: '/portal/studio/carruseles',         label: 'Carruseles',          Icon: Sparkles },
      { key: 'studio-auto-content',     to: '/portal/studio/auto-content',       label: 'Auto-Content',        Icon: Megaphone },
      { key: 'studio-landings',         to: '/portal/studio/landings',           label: 'Landing Pages',       Icon: Layers },
    ],
  },
  // 8 · Anuncios Meta
  {
    key: 'anuncios', to: '/portal/asesor/social-ads', label: 'Anuncios Meta', Icon: Megaphone,
    description: 'Campañas FB + IG · presupuesto IA · ROI',
    children: [
      { key: 'social-ads-connect',   to: '/portal/asesor/social-ads',           label: 'Conectar cuenta', Icon: Plug },
      { key: 'social-ads-campaigns', to: '/portal/asesor/social-ads/campaigns', label: 'Campañas',        Icon: Share2 },
    ],
  },
  // 9 · Mi Performance
  {
    key: 'performance', to: '/asesor/comisiones', label: 'Mi Performance', Icon: BarChart3,
    description: 'Comisiones · ranking · SOC · análisis comparativo',
    children: [
      { key: 'comisiones',       to: '/asesor/comisiones',     label: 'Comisiones',        Icon: DollarSign },
      { key: 'ranking',          to: '/asesor/ranking',        label: 'Ranking equipo',    Icon: Trophy },
      { key: 'soc',              to: '/portal/asesor/soc',     label: 'SOC Certificación', Icon: ShieldCheck },
      { key: 'cma',              to: '/asesor/cma',            label: 'CMA · Análisis',    Icon: BarChart3 },
      { key: 'briefings',        to: '/asesor/briefings',      label: 'Briefings PDF',     Icon: FileText },
      { key: 'briefing-traffic', to: '/asesor/briefing',       label: 'Tráfico + Clima',   Icon: MapPin },
      { key: 'operaciones',      to: '/asesor/operaciones',    label: 'Métricas equipo',   Icon: Activity },
      { key: 'links-tracking',   to: '/asesor/links-tracking', label: 'Links tracking',    Icon: Link },
    ],
  },
];

export default ASESOR_NAV_V2;
