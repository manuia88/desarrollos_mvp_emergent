/**
 * Phase 4 Batch 10 — navByRole.js
 * Canonical navigation config per portal role.
 * Each item: { key, to, label, Icon, end?, badge_source? }
 * badge_source: identifier for dynamic counter fetch
 *
 * IMPORTANT: every `to` MUST have a matching <Route> in App.js.
 * Mismatches fall through to the catch-all `*` and break navigation.
 */
import {
  LayoutDashboard, Building2, Users, CalendarDays, MapPin, BarChart3,
  TrendingUp, FolderOpen, Settings, Shield, Activity,
  Search, Layers, Home,
  ClipboardList, LineChart, FileText, Database,
  Target, Briefcase, DollarSign, Trophy, Sparkles, Megaphone, Boxes,
  MessageSquare, Link, Store, HeartHandshake, Network, BarChart2, FolderUp, Plug,
  AlertTriangle, Key, Package, Mail, GitMerge, ShieldCheck, Swords,
  Share2, Video, MessageCircle, HelpCircle, FlaskConical, Gauge,
  Bot,
} from 'lucide-react';

// ─── DEV (developer / developer_admin) — Phase 4 Batch 10 Reorganizado ────────
// 3 tiers collapsible: Workflow diario | Inteligencia | Configuración
const DEV_NAV = [
  {
    tier: 1,
    label: 'Workflow diario',
    items: [
      { key: 'dashboard',    to: '/desarrollador',                   label: 'Dashboard',      Icon: LayoutDashboard, end: true },
      { key: 'proyectos',    to: '/desarrollador/proyectos',         label: 'Mis Proyectos',  Icon: Building2,       badge_source: 'projects_health_below_60' },
      { key: 'recomendaciones', to: '/desarrollador/recomendaciones',  label: 'Recomendaciones', Icon: Sparkles,   badge_source: 'recomendaciones_nuevas' },
      { key: 'crm',          to: '/desarrollador/crm',               label: 'CRM',            Icon: ClipboardList,   badge_source: 'crm_unread_leads' },
      { key: 'crm-funnel',   to: '/desarrollador/crm/funnel',        label: 'Embudo CRM',     Icon: BarChart3 },
      { key: 'metricas',     to: '/desarrollador/crm/metricas-equipo', label: 'Métricas equipo',Icon: BarChart2 },
      { key: 'asesores-metrics', to: '/desarrollador/crm/asesores-metrics', label: 'Métricas de Asesores', Icon: LineChart },
      { key: 'auto-asignacion', to: '/desarrollador/crm/auto-assignments', label: 'Auto-asignación', Icon: GitMerge },
      { key: 'solicitudes',  to: '/desarrollador/solicitudes',       label: 'Solicitudes',    Icon: Users,           badge_source: 'whitelist_pending_count' },
      { key: 'disputas',     to: '/desarrollador/disputas',          label: 'Disputas leads', Icon: AlertTriangle,   badge_source: 'disputes_pending_count' },
      { key: 'mini-market',  to: '/desarrollador/mini-market',       label: 'Mini Market',    Icon: Store },
      { key: 'mensajes',     to: '/desarrollador/mensajes',          label: 'Mensajes',       Icon: MessageSquare },
      { key: 'battle-card',  to: '/desarrollador/battle-card',       label: 'Battle Card',    Icon: Swords },
      { key: 'studio-brand-kit', to: '/portal/studio/brand-kit',     label: 'Studio · Brand Kit', Icon: Package },
      { key: 'studio-assets',    to: '/portal/studio/assets',        label: 'Studio · Assets',    Icon: FolderOpen },
      { key: 'studio-import',    to: '/portal/studio/import',        label: 'Studio · Importar Listing', Icon: FolderUp },
      { key: 'studio-carruseles', to: '/portal/studio/carruseles',   label: 'Studio · Carruseles', Icon: Sparkles },
      { key: 'studio-auto-content', to: '/portal/studio/auto-content', label: 'Studio · Auto-Content', Icon: Megaphone },
      { key: 'studio-landings', to: '/portal/studio/landings',       label: 'Studio · Landings', Icon: Layers },
    ],
  },
  {
    tier: 2,
    label: 'Inteligencia',
    items: [
      { key: 'mercado',      to: '/desarrollador/mercado',           label: 'Inteligencia de Mercado', Icon: Activity },
      { key: 'reportes',     to: '/desarrollador/reportes',          label: 'Reportes IA',    Icon: LineChart },
      { key: 'estudio-mercado', to: '/desarrollador/estudio-mercado', label: 'Estudio de Mercado', Icon: FileText },
      { key: 'demanda',      to: '/desarrollador/demanda',           label: 'Demanda',        Icon: BarChart3 },
      { key: 'site',         to: '/desarrollador/site-selection',    label: 'Site Selection', Icon: MapPin },
      { key: 'valor-terreno',to: '/desarrollador/valor-terreno',     label: 'Valor de Terreno', Icon: DollarSign },
      { key: 'pricing',      to: '/desarrollador/pricing',           label: 'Precios IA',     Icon: TrendingUp },
      { key: 'competidores', to: '/desarrollador/competidores',      label: 'Competidores',   Icon: Target },
      { key: 'agentes',      to: '/desarrollador/agentes',           label: 'Tus Asistentes IA', Icon: Bot },
    ],
  },
  {
    tier: 3,
    label: 'Configuración',
    items: [
      { key: 'usuarios',     to: '/desarrollador/usuarios',          label: 'Equipo',         Icon: Users },
      { key: 'red-comercial', to: '/desarrollador/red-comercial',    label: 'Red comercial',  Icon: Network },
      { key: 'cross-partnerships', to: '/desarrollador/cross-partnerships', label: 'Alianzas',  Icon: HeartHandshake },
      { key: 'citas-policies', to: '/desarrollador/configuracion/citas-policies', label: 'Políticas de citas', Icon: CalendarDays },
      { key: 'configuracion',to: '/desarrollador/configuracion',     label: 'Configuración',  Icon: Settings },
    ],
  },
];

// ─── ASESOR (advisor / asesor_admin / asesor_freelance) ────────────────────────
const ASESOR_NAV = [
  {
    tier: 1,
    label: 'Principal',
    items: [
      { key: 'inicio',       to: '/asesor',                              label: 'Inicio',           Icon: Home, end: true },
      { key: 'perfil',       to: '/asesor/perfil',                       label: 'Mi perfil',        Icon: Shield },
      { key: 'mini-market',  to: '/asesor/mini-market',                  label: 'Mini Market',      Icon: Store },
      { key: 'desarrollos',  to: '/asesor/desarrollos',                  label: 'Desarrollos',      Icon: Building2 },
      { key: 'contactos',    to: '/asesor/contactos',                    label: 'Contactos',        Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'busquedas',    to: '/asesor/busquedas',                    label: 'Búsquedas',        Icon: Search },
      { key: 'citas',        to: '/asesor/citas',                        label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  {
    tier: 2,
    label: 'Operación',
    items: [
      { key: 'oportunidades', to: '/asesor/oportunidades',               label: 'Oportunidades',    Icon: Target },
      { key: 'captaciones',  to: '/asesor/captaciones',                  label: 'Captaciones',      Icon: Briefcase },
      { key: 'tareas',       to: '/asesor/tareas',                       label: 'Tareas',           Icon: ClipboardList },
      { key: 'operaciones',  to: '/asesor/operaciones',                  label: 'Operaciones',      Icon: Activity },
      { key: 'leads-dev',    to: '/asesor/leads-dev',                    label: 'Leads Dev',        Icon: Megaphone },
      // W6.AS.1 · Workflow Builder Visual
      { key: 'workflows',    to: '/portal/asesor/workflows',             label: 'Workflows',        Icon: GitMerge },
      // W7.AS.3.A · Conversation AI Agent playground
      { key: 'conversaciones', to: '/portal/asesor/conversation-playground', label: 'Conversaciones', Icon: MessageCircle },
      // W7.AS.3.D · Round 2 · Inbox avanzado (3 cols + piloto IA)
      { key: 'conversation-inbox', to: '/portal/asesor/conversation-inbox', label: 'Bandeja IA', Icon: MessageSquare },
    ],
  },
  {
    tier: 3,
    label: 'Performance',
    items: [
      { key: 'comisiones',   to: '/asesor/comisiones',                   label: 'Comisiones',       Icon: DollarSign },
      { key: 'ranking',      to: '/asesor/ranking',                      label: 'Ranking',          Icon: Trophy },
      { key: 'studio',       to: '/asesor/studio',                       label: 'Studio · Director IA', Icon: Sparkles },
      { key: 'studio-video', to: '/portal/asesor/studio-video',          label: 'Studio · Video',   Icon: Video },
      { key: 'studio-brand-kit', to: '/portal/studio/brand-kit',         label: 'Studio · Brand Kit', Icon: Package },
      { key: 'studio-assets',    to: '/portal/studio/assets',            label: 'Studio · Assets',  Icon: FolderOpen },
      { key: 'studio-import',    to: '/portal/studio/import',            label: 'Studio · Importar Listing', Icon: FolderUp },
      { key: 'studio-carruseles', to: '/portal/studio/carruseles',       label: 'Studio · Carruseles', Icon: Sparkles },
      { key: 'studio-auto-content', to: '/portal/studio/auto-content',   label: 'Studio · Auto-Content', Icon: Megaphone },
      { key: 'studio-landings', to: '/portal/studio/landings',           label: 'Studio · Landings', Icon: Layers },
      { key: 'briefings',    to: '/asesor/briefings',                    label: 'Briefings',        Icon: FileText },
      { key: 'briefing-traffic', to: '/asesor/briefing',                 label: 'Tráfico+Clima',    Icon: MapPin },
      { key: 'links',        to: '/asesor/links-tracking',               label: 'Links tracking',   Icon: Link },
      { key: 'cma',          to: '/asesor/cma',                          label: 'CMA · Análisis comparativo', Icon: BarChart3 },
      { key: 'lead-aliases', to: '/asesor/lead-aliases',                 label: 'Conectar fuentes leads', Icon: Plug },
      // W6.4 · Marketplace Templates de workflows
      { key: 'marketplace-templates', to: '/portal/asesor/marketplace-templates', label: 'Marketplace Plantillas', Icon: Layers },
      // W5.10 · Social/Ads Meta multi-tenant (connect + campañas)
      { key: 'social-ads',           to: '/portal/asesor/social-ads',           label: 'Meta Ads · Conectar', Icon: Megaphone },
      { key: 'social-ads-campaigns', to: '/portal/asesor/social-ads/campaigns', label: 'Meta Ads · Campañas',  Icon: Share2 },
      // W5.22 Z.4 · Video Standalone (reusa W5.16 bundle · queue robust + export)
      { key: 'video-standalone', to: '/portal/asesor/video-standalone',  label: 'Studio · Video Standalone', Icon: Video },
    ],
  },
];

// ─── INMOBILIARIA (member / admin / director) ─────────────────────────────────
const INMOBILIARIA_MEMBER_NAV = [
  {
    tier: 1,
    label: 'Principal',
    items: [
      { key: 'dashboard',    to: '/inmobiliaria',                        label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'leads',        to: '/inmobiliaria/leads',                  label: 'Leads',            Icon: Users, badge_source: 'crm_unread_leads' },
      { key: 'studio-brand-kit', to: '/portal/studio/brand-kit',         label: 'Studio · Brand Kit', Icon: Package },
      { key: 'studio-assets',    to: '/portal/studio/assets',            label: 'Studio · Assets',    Icon: FolderOpen },
      { key: 'studio-import',    to: '/portal/studio/import',            label: 'Studio · Importar Listing', Icon: FolderUp },
      { key: 'studio-carruseles', to: '/portal/studio/carruseles',       label: 'Studio · Carruseles', Icon: Sparkles },
      { key: 'studio-auto-content', to: '/portal/studio/auto-content',   label: 'Studio · Auto-Content', Icon: Megaphone },
      { key: 'studio-landings', to: '/portal/studio/landings',           label: 'Studio · Landings', Icon: Layers },
    ],
  },
];

const INMOBILIARIA_ADMIN_NAV = [
  {
    tier: 1,
    label: 'Principal',
    items: [
      { key: 'dashboard',    to: '/inmobiliaria',                        label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'leads',        to: '/inmobiliaria/leads',                  label: 'Leads',            Icon: Users, badge_source: 'crm_unread_leads' },
      { key: 'asesores',     to: '/inmobiliaria/asesores',               label: 'Asesores',         Icon: Users },
      { key: 'usuarios',     to: '/inmobiliaria/usuarios',               label: 'Equipo',           Icon: Users },
      { key: 'red-comercial', to: '/inmobiliaria/red-comercial',         label: 'Red comercial',    Icon: Network },
      { key: 'mini-market',  to: '/inmobiliaria/mini-market',            label: 'Mini Market',      Icon: Store },
      { key: 'alianzas',     to: '/inmobiliaria/alianzas',               label: 'Alianzas dev',     Icon: Briefcase },
      { key: 'cross-partnerships', to: '/inmobiliaria/cross-partnerships', label: 'Cross-org',      Icon: HeartHandshake },
      { key: 'studio-brand-kit', to: '/portal/studio/brand-kit',         label: 'Studio · Brand Kit', Icon: Package },
      { key: 'studio-assets',    to: '/portal/studio/assets',            label: 'Studio · Assets',    Icon: FolderOpen },
      { key: 'studio-import',    to: '/portal/studio/import',            label: 'Studio · Importar Listing', Icon: FolderUp },
      { key: 'studio-carruseles', to: '/portal/studio/carruseles',       label: 'Studio · Carruseles', Icon: Sparkles },
      { key: 'studio-auto-content', to: '/portal/studio/auto-content',   label: 'Studio · Auto-Content', Icon: Megaphone },
      { key: 'studio-landings', to: '/portal/studio/landings',           label: 'Studio · Landings', Icon: Layers },
    ],
  },
];

// ─── COMPRADOR / BUYER ────────────────────────────────────────────────────────
const COMPRADOR_NAV = [
  {
    tier: 1,
    label: 'Explorar',
    items: [
      { key: 'marketplace',  to: '/marketplace',                         label: 'Marketplace',      Icon: Building2, end: true },
      { key: 'mapa',         to: '/mapa',                                label: 'Mapa',             Icon: MapPin },
      { key: 'barrios',      to: '/barrios',                             label: 'Barrios',          Icon: Layers },
      { key: 'inteligencia', to: '/inteligencia',                        label: 'Inteligencia',     Icon: TrendingUp },
    ],
  },
];

// ─── SUPERADMIN — FASE C: sidebar reagrupado en los 6 DOMINIOS del Catálogo Vivo ──────────────
// Antes: 7 tiers técnicos (Datos/Inteligencia/Monetización…). Ahora: los MISMOS 6 dominios que el
// catálogo (Mercado/Demanda/Inventario/Dinero/Operación/Productos) + Principal — un solo lenguaje
// mental en TODO el portal. CERO pérdida: ninguna ruta desaparece, solo cambia de casa. Los
// section_key reusan los colores Aurora existentes (mapeo dominio→color en superadmin-aurora.css).
const SUPERADMIN_NAV = [
  {
    tier: 1, label: 'Principal', section_key: 'principal',
    items: [
      { key: 'inicio',  to: '/superadmin',         label: 'Inicio',   Icon: LayoutDashboard, end: true },
      // La puerta de entrada — todo lo que el portal hace, buscable y en lenguaje humano.
      { key: 'catalogo', to: '/superadmin/catalogo', label: 'El Catálogo', Icon: Search },
    ],
  },
  {
    tier: 2, label: '🏙️ Mercado', section_key: 'datos',   // color cian
    items: [
      { key: 'hub-mercado',  to: '/superadmin/mercado',      label: 'Hub de Mercado',   Icon: TrendingUp },
      { key: 'metrics-cube', to: '/superadmin/metrics-cube', label: 'Cubo de métricas', Icon: Layers },
      { key: 'terminal-zona',    to: '/superadmin/terminal-zona',    label: 'Terminal de Zona',   Icon: Target },
      { key: 'live-pulse',       to: '/superadmin/live-pulse',       label: 'Live Pulse',        Icon: Activity },
      { key: 'terminal-mercado', to: '/superadmin/terminal-mercado', label: 'Terminal de Mercado CDMX', Icon: Layers },
      { key: 'transactions',     to: '/superadmin/transactions',     label: 'Transaction Network', Icon: Network },
      { key: 'intelligence-hub', to: '/superadmin/intelligence-hub', label: 'Inteligencia ejecutiva',  Icon: Sparkles },
    ],
  },
  {
    tier: 3, label: '👤 Demanda y personas', section_key: 'inteligencia',   // color morado
    items: [
      { key: 'inteligencia',      to: '/superadmin/inteligencia',      label: 'Demanda · Tableros', Icon: BarChart3 },
      { key: 'ia-conversacional', to: '/superadmin/ia-conversacional', label: 'IA Conversacional (Atlax)', Icon: MessageCircle },
      { key: 'inmobiliaria-leads', to: '/superadmin/inmobiliaria-leads', label: 'Leads inmobiliaria', Icon: Users },
    ],
  },
  {
    tier: 4, label: '🏗️ Inventario y devs', section_key: 'crecimiento',   // color teal
    items: [
      { key: 'desarrollos', to: '/superadmin/desarrollos', label: 'Desarrollos', Icon: Building2 },
      { key: 'alta-devs',   to: '/superadmin/alta',        label: 'Desarrolladores y carga', Icon: Building2 },
      { key: 'datos-hub',   to: '/superadmin/datos',       label: 'Datos & Fuentes (ingesta)', Icon: Database },
      { key: 'modelo',            to: '/superadmin/modelo',            label: 'Modelo & Aprendizaje', Icon: Activity },
      { key: 'phase5-foundation', to: '/superadmin/phase5-foundation', label: 'Foundation Phase 5', Icon: Database },
    ],
  },
  {
    tier: 5, label: '💰 Dinero e ingresos', section_key: 'monetizacion',   // color verde
    items: [
      { key: 'monetizacion', to: '/superadmin/monetizacion', label: 'Monetización & API', Icon: Briefcase },
      { key: 'tenants',      to: '/superadmin/tenants',      label: 'Clientes', Icon: Users },
    ],
  },
  {
    tier: 6, label: '⚙️ Operación y seguridad', section_key: 'operacion',   // color naranja
    items: [
      { key: 'operacion',       to: '/superadmin/operacion',       label: 'Operación & Seguridad',  Icon: ShieldCheck },
      { key: 'crecimiento',     to: '/superadmin/crecimiento',     label: 'Crecimiento & Distribución', Icon: Megaphone },
      { key: 'knowledge-graph', to: '/superadmin/knowledge-graph', label: 'Knowledge Graph',   Icon: Network },
      { key: 'devtools',        to: '/superadmin/devtools',        label: 'Dev Tools',         Icon: Network },
    ],
  },
  {
    tier: 7, label: '📦 Productos del moat', section_key: 'devtools',   // color morado
    items: [
      // los productos (Estudio DMX, DMX-30, CARFAX) viven en el catálogo filtrado — un clic los abre
      { key: 'productos', to: '/superadmin/catalogo?dominio=productos', label: 'Productos DMX', Icon: Sparkles },
    ],
  },
];

export const navByRole = {
  developer:             DEV_NAV,
  developer_admin:       DEV_NAV,
  developer_member:      DEV_NAV,
  asesor_freelance:      ASESOR_NAV,
  advisor:               ASESOR_NAV,
  asesor_admin:          ASESOR_NAV,
  inmobiliaria_member:   INMOBILIARIA_MEMBER_NAV,
  inmobiliaria_admin:    INMOBILIARIA_ADMIN_NAV,
  inmobiliaria_director: INMOBILIARIA_ADMIN_NAV,
  comprador:             COMPRADOR_NAV,
  buyer:                 COMPRADOR_NAV,
  superadmin:            SUPERADMIN_NAV,
};

export default navByRole;
