/**
 * Phase 4 Batch 0 — navByRole.js
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
  Search, Layers, Home, Star,
  ClipboardList, LineChart, FileText, Database, Film, Eye,
  Target, Handshake, DollarSign, Trophy, Sparkles, Megaphone,
} from 'lucide-react';

// ─── DEV (developer / developer_admin) ─────────────────────────────────────────
// All routes verified against App.js (Phase 4 B0 sync)
const DEV_NAV = [
  {
    tier: 1,
    label: 'Operación',
    items: [
      { key: 'dashboard',    to: '/desarrollador',                       label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'inventario',   to: '/desarrollador/inventario',            label: 'Inventario',       Icon: Building2 },
      { key: 'leads',        to: '/desarrollador/leads',                 label: 'Leads CRM',        Icon: Users,     badge_source: 'crm_unread_leads' },
      { key: 'citas',        to: '/desarrollador/citas',                 label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  {
    tier: 2,
    label: 'Inteligencia',
    items: [
      { key: 'pricing',      to: '/desarrollador/pricing',               label: 'Precios IA',       Icon: TrendingUp },
      { key: 'demanda',      to: '/desarrollador/demanda',               label: 'Demanda',          Icon: BarChart3 },
      { key: 'site',         to: '/desarrollador/site-selection',        label: 'Site Selection',   Icon: MapPin },
      { key: 'competidores', to: '/desarrollador/competidores',          label: 'Competidores',     Icon: Target },
    ],
  },
  {
    tier: 3,
    label: 'Gestión',
    items: [
      { key: 'reportes',     to: '/desarrollador/reportes',              label: 'Reportes',         Icon: LineChart },
      { key: 'calendario',   to: '/desarrollador/calendario-subidas',    label: 'Calendario',       Icon: CalendarDays },
      { key: 'usuarios',     to: '/desarrollador/usuarios',              label: 'Usuarios',         Icon: Users },
      { key: 'configuracion',to: '/desarrollador/configuracion',         label: 'Configuración',    Icon: Settings },
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
      { key: 'contactos',    to: '/asesor/contactos',                    label: 'Contactos',        Icon: Users, badge_source: 'asesor_contacts_new' },
      { key: 'busquedas',    to: '/asesor/busquedas',                    label: 'Búsquedas',        Icon: Search },
      { key: 'citas',        to: '/asesor/citas',                        label: 'Citas',            Icon: CalendarDays, badge_source: 'citas_today' },
    ],
  },
  {
    tier: 2,
    label: 'Operación',
    items: [
      { key: 'captaciones',  to: '/asesor/captaciones',                  label: 'Captaciones',      Icon: Handshake },
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
      { key: 'dashboard',    to: '/superadmin',                          label: 'Dashboard',        Icon: LayoutDashboard, end: true },
      { key: 'data-sources', to: '/superadmin/data-sources',             label: 'Data Sources',     Icon: Database },
      { key: 'scores',       to: '/superadmin/scores',                   label: 'Scores',           Icon: BarChart3 },
      { key: 'documents',    to: '/superadmin/documents',                label: 'Documentos',       Icon: FileText },
    ],
  },
  {
    tier: 2,
    label: 'Plataforma',
    items: [
      { key: 'drive',        to: '/superadmin/drive',                    label: 'Drive',            Icon: FolderOpen },
      { key: 'observability',to: '/superadmin/observability',            label: 'Observabilidad',   Icon: Eye },
      { key: 'audit-log',    to: '/superadmin/audit-log',                label: 'Auditoría',        Icon: Shield },
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
