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
  ClipboardList, LineChart, FileText, Database, Eye,
  Target, Briefcase, DollarSign, Trophy, Sparkles, Megaphone, Boxes,
  MessageSquare, Link, Store, HeartHandshake, Network, BarChart2, FolderUp, Plug,
  AlertTriangle, Key, Package, Mail, Phone,
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
      { key: 'crm',          to: '/desarrollador/crm',               label: 'CRM',            Icon: ClipboardList,   badge_source: 'crm_unread_leads' },
      { key: 'metricas',     to: '/desarrollador/crm/metricas-equipo', label: 'Métricas equipo',Icon: BarChart2 },
      { key: 'solicitudes',  to: '/desarrollador/solicitudes',       label: 'Solicitudes',    Icon: Users,           badge_source: 'whitelist_pending_count' },
      { key: 'mini-market',  to: '/desarrollador/mini-market',       label: 'Mini Market',    Icon: Store },
      { key: 'mensajes',     to: '/desarrollador/mensajes',          label: 'Mensajes',       Icon: MessageSquare },
    ],
  },
  {
    tier: 2,
    label: 'Inteligencia',
    items: [
      { key: 'reportes',     to: '/desarrollador/reportes',          label: 'Reportes IA',    Icon: LineChart },
      { key: 'demanda',      to: '/desarrollador/demanda',           label: 'Demanda',        Icon: BarChart3 },
      { key: 'site',         to: '/desarrollador/site-selection',    label: 'Site Selection', Icon: MapPin },
      { key: 'pricing',      to: '/desarrollador/pricing',           label: 'Precios IA',     Icon: TrendingUp },
      { key: 'competidores', to: '/desarrollador/competidores',      label: 'Competidores',   Icon: Target },
    ],
  },
  {
    tier: 3,
    label: 'Configuración',
    items: [
      { key: 'usuarios',     to: '/desarrollador/usuarios',          label: 'Equipo',         Icon: Users },
      { key: 'red-comercial', to: '/desarrollador/red-comercial',    label: 'Red comercial',  Icon: Network },
      { key: 'cross-partnerships', to: '/desarrollador/cross-partnerships', label: 'Alianzas',  Icon: HeartHandshake },
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
      { key: 'mis-aliados',  to: '/asesor/mis-aliados',                  label: 'Mis aliados',      Icon: Network },
      { key: 'inventario',   to: '/asesor/inventario',                   label: 'Inventario aliados', Icon: Building2 },
      { key: 'contactos',    to: '/asesor/contactos',                    label: 'Contactos',        Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'busquedas',    to: '/asesor/busquedas',                    label: 'Búsquedas',        Icon: Search },
      { key: 'citas',        to: '/asesor/citas',                        label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  {
    tier: 2,
    label: 'Operación',
    items: [
      { key: 'captaciones',  to: '/asesor/captaciones',                  label: 'Captaciones',      Icon: Briefcase },
      { key: 'tareas',       to: '/asesor/tareas',                       label: 'Tareas',           Icon: ClipboardList },
      { key: 'operaciones',  to: '/asesor/operaciones',                  label: 'Operaciones',      Icon: Activity },
      { key: 'leads-dev',    to: '/asesor/leads-dev',                    label: 'Leads Dev',        Icon: Megaphone },
    ],
  },
  {
    tier: 3,
    label: 'Performance',
    items: [
      { key: 'comisiones',   to: '/asesor/comisiones',                   label: 'Comisiones',       Icon: DollarSign },
      { key: 'ranking',      to: '/asesor/ranking',                      label: 'Ranking',          Icon: Trophy },
      { key: 'studio',       to: '/asesor/studio',                       label: 'Studio',           Icon: Sparkles },
      { key: 'briefings',    to: '/asesor/briefings',                    label: 'Briefings',        Icon: FileText },
      { key: 'briefing-traffic', to: '/asesor/briefing',                 label: 'Tráfico+Clima',    Icon: MapPin },
      { key: 'links',        to: '/asesor/links-tracking',               label: 'Links tracking',   Icon: Link },
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

// ─── SUPERADMIN — IE Engine Phase A ───────────────────────────────────────────
const SUPERADMIN_NAV = [
  {
    tier: 1,
    label: 'Sistema',
    items: [
      { key: 'inicio',       to: '/superadmin',                          label: 'Inicio',           Icon: LayoutDashboard, end: true },
      { key: 'tenants',      to: '/superadmin/tenants',                  label: 'Tenants',          Icon: Users },
      { key: 'bulk-ingest',  to: '/superadmin/bulk-ingest',              label: 'Ingesta masiva',   Icon: FolderUp },
      { key: 'conectores',   to: '/superadmin/data-sources',             label: 'Conectores',       Icon: Plug },
      { key: 'scores',       to: '/superadmin/scores',                   label: 'Scores',           Icon: BarChart3 },
      { key: 'documents',    to: '/superadmin/documents',                label: 'Documentos',       Icon: FileText },
    ],
  },
  {
    tier: 2,
    label: 'Plataforma',
    items: [
      { key: 'drive',        to: '/superadmin/drive',                    label: 'Drive',            Icon: FolderOpen },
      { key: 'health',       to: '/superadmin/health',                   label: 'Salud del sistema', Icon: Activity },
      { key: 'observability',to: '/superadmin/observability',            label: 'Observabilidad',   Icon: Eye },
      { key: 'phase-y-observability',to: '/superadmin/phase-y-observability', label: 'Phase Y · Observability', Icon: Eye },
      { key: 'data-sources', to: '/superadmin/data-sources', label: 'Data Sources gov MX', Icon: Database },
      { key: 'audit-log',    to: '/superadmin/audit-log',                label: 'Auditoría',        Icon: Shield },
      { key: 'ai-cost',      to: '/superadmin/ai-cost',                  label: 'Costos IA',        Icon: DollarSign },
      { key: 'commercial',   to: '/superadmin/commercial',               label: 'Comercial',        Icon: Briefcase },
      { key: 'metrics-cube', to: '/superadmin/metrics-cube',             label: 'Cubo de métricas', Icon: Layers },
      { key: 'data-lake',    to: '/superadmin/data-lake',                label: 'Data Lake',        Icon: Database },
      { key: 'intelligence-hub', to: '/superadmin/intelligence-hub',     label: 'Inteligencia ejecutiva', Icon: Eye },
      { key: 'trends',           to: '/superadmin/trends',                label: 'Google Trends · CDMX',   Icon: TrendingUp },
      { key: 'phase5-foundation', to: '/superadmin/phase5-foundation',   label: 'Foundation Phase 5',     Icon: Activity },
      { key: 'transactions',     to: '/superadmin/transactions',         label: 'Transaction Network',    Icon: Network },
      { key: 'drpi',             to: '/superadmin/drpi',                  label: 'DRPI',                   Icon: TrendingUp },
      { key: 'bulletins',        to: '/superadmin/bulletins',             label: 'Boletines',              Icon: FileText },
      { key: 'investment-explorer', to: '/superadmin/investment-explorer', label: 'Investment Explorer',   Icon: Target },
      { key: 'fraud-alerts',     to: '/superadmin/fraud-alerts',          label: 'Fraud Alerts',           Icon: Shield },
      { key: 'risk-score',       to: '/superadmin/risk-score',            label: 'Risk Score',             Icon: Shield },
      { key: 'risk-alerts',      to: '/superadmin/risk-alerts',           label: 'Risk Alerts',            Icon: AlertTriangle },
      { key: 'api-keys',          to: '/superadmin/api-keys',              label: 'API Keys + Stripe',      Icon: Key },
      { key: 'vertical-products', to: '/superadmin/vertical-products',     label: 'Productos Verticales',   Icon: Package },
      { key: 'data-licensing',    to: '/superadmin/data-licensing',        label: 'Data Licensing',         Icon: Briefcase },
      { key: 'compliance',        to: '/superadmin/compliance',            label: 'Compliance',             Icon: Shield },
      { key: 'partners',          to: '/superadmin/partners',              label: 'Partners',               Icon: HeartHandshake },
      { key: 'cross-sell',        to: '/superadmin/cross-sell-analytics',  label: 'Cross-sell Analytics',   Icon: BarChart2 },
      { key: 'landing-leads',     to: '/superadmin/landing-leads',         label: 'Leads landing',          Icon: Megaphone },
      { key: 'whatsapp',          to: '/superadmin/whatsapp',              label: 'WhatsApp Business',      Icon: Phone },
      { key: 'newsletter',        to: '/superadmin/newsletter',            label: 'Newsletter Pulse',       Icon: Mail },
      { key: 'primitives',   to: '/superadmin/primitives-demo',          label: 'UI Primitivas',    Icon: Boxes },
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
