/**
 * Phase 4 Batch 0 — navByRole.js
 * Canonical navigation config per portal role.
 * Each item: { key, to, label, Icon, end?, badge_source? }
 * badge_source: identifier for dynamic counter fetch
 */
import {
  LayoutDashboard, Building2, Users, CalendarDays, MapPin, BarChart3,
  TrendingUp, FileText, FolderOpen, Settings, Shield, Activity,
  Search, CreditCard, Receipt, Layers, Home, Briefcase, Star,
  Bell, BookOpen, PieChart, Sliders, UserCheck, Globe, Zap,
  ClipboardList, LineChart, Hammer, MessageSquare,
} from 'lucide-react';

const DEV_NAV = [
  // Tier 1 — Operación Core
  {
    tier: 1,
    label: 'Operación',
    items: [
      { key: 'dashboard',    to: '/desarrollador',              label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'inventario',   to: '/desarrollador/inventario',   label: 'Inventario',       Icon: Building2 },
      { key: 'leads',        to: '/desarrollador/leads',        label: 'Leads CRM',        Icon: Users,     badge_source: 'crm_unread_leads' },
      { key: 'citas',        to: '/desarrollador/citas',        label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  // Tier 2 — Inteligencia
  {
    tier: 2,
    label: 'Inteligencia',
    items: [
      { key: 'pricing',      to: '/desarrollador/pricing',      label: 'Precios IA',       Icon: TrendingUp },
      { key: 'demanda',      to: '/desarrollador/demanda',      label: 'Demanda',          Icon: BarChart3 },
      { key: 'site',         to: '/desarrollador/site-selection',label: 'Site Selection',  Icon: MapPin },
      { key: 'cashflow',     to: '/desarrollador/cashflow',     label: 'Flujo de Caja',    Icon: LineChart },
    ],
  },
  // Tier 3 — Documentos y Ajustes
  {
    tier: 3,
    label: 'Gestión',
    items: [
      { key: 'legajo',       to: '/desarrollador/legajo',       label: 'Legajo Legal',     Icon: FolderOpen, badge_source: 'projects_health_below_60' },
      { key: 'equipo',       to: '/desarrollador/equipo',       label: 'Equipo',           Icon: UserCheck },
      { key: 'contenido',    to: '/desarrollador/contenido',    label: 'Contenido',        Icon: BookOpen },
      { key: 'config',       to: '/desarrollador/config',       label: 'Configuración',    Icon: Settings },
    ],
  },
];

const ASESOR_NAV = [
  {
    tier: 1,
    label: 'Principal',
    items: [
      { key: 'inicio',       to: '/asesor',                     label: 'Inicio',           Icon: Home, end: true },
      { key: 'contactos',    to: '/asesor/contactos',           label: 'Contactos',        Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'busquedas',    to: '/asesor/busquedas',           label: 'Búsquedas',        Icon: Search },
      { key: 'citas',        to: '/asesor/citas',               label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  {
    tier: 2,
    label: 'Herramientas',
    items: [
      { key: 'propiedades',  to: '/asesor/propiedades',         label: 'Propiedades',      Icon: Building2 },
      { key: 'argumentario', to: '/asesor/argumentario',        label: 'Argumentario IA',  Icon: MessageSquare },
      { key: 'analytics',    to: '/asesor/analytics',           label: 'Analytics',        Icon: BarChart3 },
    ],
  },
];

const INMOBILIARIA_MEMBER_NAV = [
  {
    tier: 1,
    label: 'Principal',
    items: [
      { key: 'dashboard',    to: '/inmobiliaria',               label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'leads',        to: '/inmobiliaria/leads',         label: 'Leads',            Icon: Users, badge_source: 'crm_unread_leads' },
      { key: 'propiedades',  to: '/inmobiliaria/propiedades',   label: 'Propiedades',      Icon: Building2 },
      { key: 'citas',        to: '/inmobiliaria/citas',         label: 'Citas',            Icon: CalendarDays },
    ],
  },
];

const INMOBILIARIA_ADMIN_NAV = [
  ...INMOBILIARIA_MEMBER_NAV,
  {
    tier: 2,
    label: 'Gestión',
    items: [
      { key: 'equipo',       to: '/inmobiliaria/equipo',        label: 'Equipo',           Icon: UserCheck },
      { key: 'analytics',    to: '/inmobiliaria/analytics',     label: 'Analytics',        Icon: BarChart3 },
      { key: 'config',       to: '/inmobiliaria/config',        label: 'Configuración',    Icon: Settings },
    ],
  },
];

const COMPRADOR_NAV = [
  {
    tier: 1,
    label: 'Mi cuenta',
    items: [
      { key: 'buscar',       to: '/barrios',                    label: 'Explorar',         Icon: Globe, end: true },
      { key: 'favoritos',    to: '/favoritos',                  label: 'Favoritos',        Icon: Star },
      { key: 'comparar',     to: '/comparar',                   label: 'Comparar',         Icon: Layers },
      { key: 'solicitudes',  to: '/solicitudes',                label: 'Mis Solicitudes',  Icon: ClipboardList },
    ],
  },
];

const SUPERADMIN_NAV = [
  {
    tier: 1,
    label: 'Sistema',
    items: [
      { key: 'dashboard',    to: '/superadmin',                 label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'users',        to: '/superadmin/users',           label: 'Usuarios',         Icon: Users },
      { key: 'ie-engine',    to: '/superadmin/ie-engine',       label: 'IE Engine',        Icon: Zap },
      { key: 'ai-usage',     to: '/superadmin/ai-usage',        label: 'Budget IA',        Icon: PieChart },
    ],
  },
  {
    tier: 2,
    label: 'Plataforma',
    items: [
      { key: 'audits',       to: '/superadmin/audits',          label: 'Auditoría',        Icon: Shield },
      { key: 'analytics',    to: '/superadmin/analytics',       label: 'Analytics',        Icon: Activity },
      { key: 'config',       to: '/superadmin/config',          label: 'Config',           Icon: Sliders },
    ],
  },
];

export const navByRole = {
  developer:            DEV_NAV,
  developer_admin:      DEV_NAV,
  asesor_freelance:     ASESOR_NAV,
  advisor:              ASESOR_NAV,
  asesor_admin:         ASESOR_NAV,
  inmobiliaria_member:  INMOBILIARIA_MEMBER_NAV,
  inmobiliaria_admin:   INMOBILIARIA_ADMIN_NAV,
  inmobiliaria_director: INMOBILIARIA_ADMIN_NAV,
  comprador:            COMPRADOR_NAV,
  buyer:                COMPRADOR_NAV,
  superadmin:           SUPERADMIN_NAV,
};

export default navByRole;
