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
  AlertTriangle, Key, Package, Mail, Phone, GitMerge, ShieldCheck, Swords,
  Share2, Video,
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
      { key: 'captaciones',  to: '/asesor/captaciones',                  label: 'Captaciones',      Icon: Briefcase },
      { key: 'tareas',       to: '/asesor/tareas',                       label: 'Tareas',           Icon: ClipboardList },
      { key: 'operaciones',  to: '/asesor/operaciones',                  label: 'Operaciones',      Icon: Activity },
      { key: 'leads-dev',    to: '/asesor/leads-dev',                    label: 'Leads Dev',        Icon: Megaphone },
      // W6.AS.1 · Workflow Builder Visual
      { key: 'workflows',    to: '/portal/asesor/workflows',             label: 'Workflows',        Icon: GitMerge },
    ],
  },
  {
    tier: 3,
    label: 'Performance',
    items: [
      { key: 'comisiones',   to: '/asesor/comisiones',                   label: 'Comisiones',       Icon: DollarSign },
      { key: 'ranking',      to: '/asesor/ranking',                      label: 'Ranking',          Icon: Trophy },
      { key: 'soc-asesor',   to: '/portal/asesor/soc',                   label: 'SOC Certificación', Icon: Trophy },
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

// ─── SUPERADMIN — 7 secciones por color (Aurora design) ───────────────────────
const SUPERADMIN_NAV = [
  {
    tier: 1, label: 'Principal', section_key: 'principal',
    items: [
      { key: 'inicio',  to: '/superadmin',         label: 'Inicio',   Icon: LayoutDashboard, end: true },
      { key: 'tenants', to: '/superadmin/tenants', label: 'Clientes', Icon: Users },
    ],
  },
  {
    tier: 2, label: 'Datos', section_key: 'datos',
    items: [
      { key: 'bulk-ingest',  to: '/superadmin/bulk-ingest',  label: 'Ingesta masiva',   Icon: FolderUp },
      { key: 'conectores',   to: '/superadmin/data-sources', label: 'Conectores',       Icon: Plug },
      { key: 'drive',        to: '/superadmin/drive',        label: 'Drive',            Icon: FolderOpen },
      { key: 'documents',    to: '/superadmin/documents',    label: 'Documentos',       Icon: FileText },
      { key: 'data-lake',    to: '/superadmin/data-lake',    label: 'Data Lake',        Icon: Database },
      { key: 'metrics-cube', to: '/superadmin/metrics-cube', label: 'Cubo de métricas', Icon: Layers },
      // ─ W6.MOV.2 · Gov Data MX External Sources (3 tracks) ─
      { key: 'gov-data-mx',  to: '/superadmin/gov-data-mx',  label: 'Gov Data MX',      Icon: Database },
    ],
  },
  {
    tier: 3, label: 'Inteligencia', section_key: 'inteligencia',
    items: [
      // ─ Accuracy & ML (W5.x) ─
      { key: 'avm-accuracy',      to: '/superadmin/avm-accuracy',      label: 'AVM Accuracy',      Icon: TrendingUp },
      { key: 'forecast-accuracy', to: '/superadmin/forecast-accuracy', label: 'Forecast Accuracy', Icon: TrendingUp },
      // ─ Intelligence layer (W3.x legacy) ─
      { key: 'scores',            to: '/superadmin/scores',            label: 'Scores',            Icon: Target },
      { key: 'drpi',              to: '/superadmin/drpi',              label: 'DRPI',              Icon: LineChart },
      { key: 'risk-score',        to: '/superadmin/risk-score',        label: 'Risk Score',        Icon: AlertTriangle },
      { key: 'investment-explorer', to: '/superadmin/investment-explorer', label: 'Investment Explorer', Icon: DollarSign },
      { key: 'intelligence-hub',  to: '/superadmin/intelligence-hub',  label: 'Intelligence Hub',  Icon: Sparkles },
      { key: 'trends',            to: '/superadmin/trends',            label: 'Google Trends',     Icon: BarChart3 },
      { key: 'phase5-foundation', to: '/superadmin/phase5-foundation', label: 'Foundation Phase 5', Icon: Database },
      { key: 'transactions',      to: '/superadmin/transactions',      label: 'Transaction Network', Icon: Network },
      // ─ Graph & Live (W5.x) ─
      { key: 'knowledge-graph',   to: '/superadmin/knowledge-graph',   label: 'Knowledge Graph',   Icon: Network },
      { key: 'live-pulse',        to: '/superadmin/live-pulse',        label: 'Live Pulse',        Icon: Activity },
      // ─ W6.MOV.5 · Construction Quality Index ─
      { key: 'construction-quality', to: '/superadmin/construction-quality', label: 'Construction Quality', Icon: ShieldCheck },
      // ─ W6.MOV.3 · Reviews Residentes ─
      { key: 'reviews-residents', to: '/superadmin/reviews-residents', label: 'Reviews Residentes', Icon: MessageSquare },
    ],
  },
  // ─── tier 4 · OPERACIÓN naranja · 2026-05-18 sidebar fix · features previamente huérfanas ─
  {
    tier: 4, label: 'Operación', section_key: 'operacion',
    items: [
      // ─ System health ─
      { key: 'health',                 to: '/superadmin/health',                 label: 'Salud sistema',          Icon: Activity },
      { key: 'observability',          to: '/superadmin/observability',          label: 'Observabilidad',         Icon: Eye },
      { key: 'phase-y-observability',  to: '/superadmin/phase-y-observability',  label: 'Phase Y Observability',  Icon: BarChart2 },
      // ─ Audit & compliance ─
      { key: 'audit-log',              to: '/superadmin/audit-log',              label: 'Audit log',              Icon: FileText },
      { key: 'audit-chain',            to: '/superadmin/audit-chain',            label: 'Audit Chain (SHA-256)',  Icon: ShieldCheck },
      { key: 'compliance',             to: '/superadmin/compliance',             label: 'Compliance',             Icon: Shield },
      // ─ Fraud & risk ─
      { key: 'duplicates',             to: '/superadmin/duplicates',             label: 'Duplicados pendientes',  Icon: GitMerge },
      { key: 'fraud-patterns',         to: '/superadmin/fraud-patterns',         label: 'Patrones de fraude',     Icon: AlertTriangle },
      { key: 'fraud-alerts',           to: '/superadmin/fraud-alerts',           label: 'Fraud Alerts',           Icon: AlertTriangle },
      { key: 'risk-alerts',            to: '/superadmin/risk-alerts',            label: 'Risk Alerts',            Icon: AlertTriangle },
      // W5.FF3 · Feature Visibility Matrix (GoHighLevel-style snapshot grants)
      { key: 'feature-visibility',     to: '/superadmin/feature-visibility',     label: 'Feature Visibility',     Icon: GitMerge },
      // W5.25 · Widget Embed Analytics (dominios externos que embeben widgets)
      { key: 'widget-embeds',          to: '/superadmin/widget-embeds',          label: 'Widget Embeds',          Icon: Link },
      // W7.AS.6 · Reputation Monitor (Brand24-style · 4 sources · sentiment · alerts)
      { key: 'reputation-monitor',     to: '/superadmin/reputation-monitor',     label: 'Reputation Monitor',     Icon: Eye },
    ],
  },
  // ─── tier 5 · MONETIZACIÓN verde · 2026-05-18 sidebar fix ─────────────────────────────
  {
    tier: 5, label: 'Monetización', section_key: 'monetizacion',
    items: [
      { key: 'ai-cost',           to: '/superadmin/ai-cost',               label: 'AI Cost',            Icon: DollarSign },
      { key: 'commercial',        to: '/superadmin/commercial',            label: 'Comercial',          Icon: TrendingUp },
      { key: 'api-keys',          to: '/superadmin/api-keys',              label: 'API Keys',           Icon: Key },
      { key: 'vertical-products', to: '/superadmin/vertical-products',     label: 'Productos verticales', Icon: Boxes },
      { key: 'data-licensing',    to: '/superadmin/data-licensing',        label: 'Data Licensing',     Icon: Briefcase },
      { key: 'cross-sell',        to: '/superadmin/cross-sell-analytics',  label: 'Cross-sell',         Icon: HeartHandshake },
      // ─ W6.MOV.1 · SOC Franchise (Sistema Operación Certificado) ─
      { key: 'soc-franchise',     to: '/superadmin/soc-franchise',         label: 'SOC Franchise',      Icon: Trophy },
      // ─ W6.4 · Marketplace Templates (moderación + revenue split) ─
      { key: 'marketplace-templates', to: '/superadmin/marketplace-templates', label: 'Marketplace Templates', Icon: Layers },
      // ─ W7.AS.1 · Lead Enrichment Clay-style (waterfall · cache · cost monitoring) ─
      { key: 'lead-enrichment',  to: '/superadmin/lead-enrichment',       label: 'Lead Enrichment',    Icon: Search },
      // ─ W5.10 · Social/Ads Meta multi-tenant (tokens · cost · API health) ─
      { key: 'social-ads',       to: '/superadmin/social-ads',            label: 'Social Ads',         Icon: Megaphone },
      // ─ W5.22 Z.4 · Video Standalone (stats + cost monitoring) ─
      { key: 'video-standalone', to: '/superadmin/video-standalone',      label: 'Video Standalone',   Icon: Video },
    ],
  },
  // ─── tier 6 · CRECIMIENTO teal · 2026-05-18 sidebar fix ───────────────────────────────
  {
    tier: 6, label: 'Crecimiento', section_key: 'crecimiento',
    items: [
      { key: 'whatsapp',     to: '/superadmin/whatsapp',              label: 'WhatsApp',             Icon: MessageSquare },
      { key: 'newsletter',   to: '/superadmin/newsletter',            label: 'Newsletter',           Icon: Mail },
      { key: 'bulletins',    to: '/superadmin/bulletins',             label: 'Bulletins',            Icon: Megaphone },
      { key: 'landing-leads',to: '/superadmin/landing-leads',         label: 'Landing leads',        Icon: Users },
      { key: 'partners',     to: '/superadmin/partners',              label: 'Partners',             Icon: HeartHandshake },
      { key: 'onboarding',   to: '/superadmin/onboarding-analytics',  label: 'Onboarding analytics', Icon: BarChart3 },
      { key: 'free-audit',   to: '/superadmin/free-audit-funnel',     label: 'Free Audit funnel',    Icon: ClipboardList },
      { key: 'lead-sources', to: '/superadmin/lead-sources',          label: 'Lead sources',         Icon: Plug },
      // W5.16 · Social Cards Renderer (viral growth public-facing)
      { key: 'social-cards', to: '/superadmin/social-cards',          label: 'Social Cards',         Icon: Share2 },
      // W6.MOV.4 · Marketing Distribution MCP (Twitter/LinkedIn/Telegram/Discord)
      { key: 'marketing-mcp',to: '/superadmin/marketing-mcp',         label: 'Marketing MCP',        Icon: Megaphone },
    ],
  },
  // ─── tier 7 · DEV TOOLS morado · 2026-05-18 sidebar fix ───────────────────────────────
  {
    tier: 7, label: 'Dev Tools', section_key: 'devtools',
    items: [
      { key: 'primitives-demo', to: '/superadmin/primitives-demo', label: 'Primitives demo', Icon: Sparkles },
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
