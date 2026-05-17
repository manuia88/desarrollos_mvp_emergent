import React, { createContext, useContext, useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { UndoProvider } from './components/shared/UndoSnackbar';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate, useParams as useReactRouterParams } from 'react-router-dom';
import { PresentationModeProvider } from './hooks/usePresentationMode';
import SkipToContent from './components/a11y/SkipToContent';
import TourLauncher from './components/onboarding/TourLauncher';
// W4.3 — Behavioral tracker (auto page_view on route change)
import { usePageViewTracking } from './utils/behavioralTracker';
// W4.18.2A.0 — PostHog LFPDPPP-compliant helpers
import {
  capturePageview as phCapturePageview,
  identifyUser as phIdentifyUser,
  resetSession as phResetSession,
} from './lib/posthog';
// W4.18.3 — Private Beta · WaitlistForm
import WaitlistForm from './components/private_beta/WaitlistForm';

// Landing components (eager — first-paint critical)
import CustomCursor from './components/landing/CustomCursor';
import Navbar from './components/landing/Navbar';
import Hero from './components/landing/Hero';
import SearchBar from './components/landing/SearchBar';
import LiveTicker from './components/landing/LiveTicker';
import ColoniasBento from './components/landing/ColoniasBento';
import ColoniaComparator from './components/landing/ColoniaComparator';
import PropertyListings from './components/landing/PropertyListings';
import IntelligenceEngine from './components/landing/IntelligenceEngine';
import Stats from './components/landing/Stats';
import Testimonials from './components/landing/Testimonials';
import Faq from './components/landing/Faq';
import CtaFooter from './components/landing/CtaFooter';
import AuthModal from './components/landing/AuthModal';
import RolePicker from './components/landing/RolePicker';
import AtlaxBubble from './components/landing/AtlaxBubble';
const DrpiHeroWidget = lazy(() => import('./components/public/DrpiHeroWidget'));

const PRIVATE_BETA_MODE = (process.env.REACT_APP_PRIVATE_BETA_MODE || '').toLowerCase() === 'true';

// ─── Lazy-loaded page routes ───────────────────────────────────────────────────
// Marketplace
const Marketplace       = lazy(() => import('./pages/Marketplace'));
const PropertyDetail    = lazy(() => import('./pages/PropertyDetail'));
const DevelopmentDetail = lazy(() => import('./pages/DevelopmentDetail'));
const Mapa              = lazy(() => import('./pages/Mapa'));
// W4.18.3 — Private Beta Gate
const BrokerPortal       = lazy(() => import('./pages/public/BrokerPortal'));
const SuperadminInvites  = lazy(() => import('./pages/superadmin/SuperadminInvites'));
// W4.13.A — Lead Journey Outbound
const AsesorOutbound     = lazy(() => import('./pages/advisor/AsesorOutbound'));
// W4.14 — Buyer Coach + Investment Simulator
const Simulador = lazy(() => import('./pages/public/Simulador'));
// W4.17 — Notifications Settings
const NotificationsSettings = lazy(() => import('./pages/portal/NotificationsSettings'));
// W4.9.6 — 3DGS Tour public embed
const Embed3DGSPage = lazy(() => import('./pages/public/Embed3DGSPage'));
// W4.16 — Marketing public pages
const FreeAudit = lazy(() => import('./pages/public/FreeAudit'));
const StateOfCDMX = lazy(() => import('./pages/public/StateOfCDMX'));
const MCPTutorial = lazy(() => import('./pages/public/connect/MCPTutorial'));

const MapaCDMX          = lazy(() => import('./pages/public/MapaCDMX'));
// W4.18.2B Sub-D — public AVM + colonia landings
const Valores           = lazy(() => import('./pages/public/Valores'));
const ColoniaLanding    = lazy(() => import('./pages/public/ColoniaLanding'));
const Barrios           = lazy(() => import('./pages/Barrios'));
const Inteligencia      = lazy(() => import('./pages/Inteligencia'));
const AsesoresLanding   = lazy(() => import('./pages/AsesoresLanding'));

// Advisor portal
const AsesorDashboard   = lazy(() => import('./pages/advisor/AsesorDashboard'));
const AsesorContactos   = lazy(() => import('./pages/advisor/AsesorContactos'));
const AsesorBusquedas   = lazy(() => import('./pages/advisor/AsesorBusquedas'));
const AsesorCaptaciones = lazy(() => import('./pages/advisor/AsesorCaptaciones'));
const AsesorTareas      = lazy(() => import('./pages/advisor/AsesorTareas'));
const AsesorOperaciones = lazy(() => import('./pages/advisor/AsesorOperaciones'));
const AsesorComisiones  = lazy(() => import('./pages/advisor/AsesorComisiones'));
const AsesorRanking     = lazy(() => import('./pages/advisor/AsesorRanking'));
const StudioDashboard   = lazy(() => import('./pages/advisor/StudioDashboard'));
const AsesorBriefings   = lazy(() => import('./pages/advisor/AsesorBriefings'));
const AsesorCitas       = lazy(() => import('./pages/advisor/AsesorCitas'));
const AsesorLeadsDev    = lazy(() => import('./pages/advisor/AsesorLeadsDev'));
// W5.ASR.4 Parte 1 — CMA visual asesor
const AsesorCMA         = lazy(() => import('./pages/asesor/AsesorCMA'));

// Developer portal
const DesarrolladorDashboard         = lazy(() => import('./pages/developer/DesarrolladorDashboard'));
const DesarrolladorInventario        = lazy(() => import('./pages/developer/DesarrolladorInventario'));
const DesarrolladorDemanda           = lazy(() => import('./pages/developer/DesarrolladorDemanda'));
const DesarrolladorReportes          = lazy(() => import('./pages/developer/DesarrolladorReportes'));
const DesarrolladorLegajo            = lazy(() => import('./pages/developer/DesarrolladorLegajo'));
const DesarrolladorPricing           = lazy(() => import('./pages/developer/DesarrolladorPricing'));
const DesarrolladorUsuarios          = lazy(() => import('./pages/developer/DesarrolladorUsuarios'));
const DesarrolladorConfiguracion     = lazy(() => import('./pages/developer/DesarrolladorConfiguracion'));
const DesarrolladorCalendarioSubidas = lazy(() => import('./pages/developer/DesarrolladorCalendarioSubidas'));
const DesarrolladorCompetidores      = lazy(() => import('./pages/developer/DesarrolladorCompetidores'));
const DesarrolladorIEDetail          = lazy(() => import('./pages/developer/DesarrolladorIEDetail'));
const DesarrolladorLeads             = lazy(() => import('./pages/developer/DesarrolladorLeads'));
const DesarrolladorCitas             = lazy(() => import('./pages/developer/DesarrolladorCitas'));
const InmobiliariaDashboard          = lazy(() => import('./pages/developer/InmobiliariaDashboard'));
const InmobiliariaAsesores           = lazy(() => import('./pages/developer/InmobiliariaAsesores'));
const InmobiliariaLeads              = lazy(() => import('./pages/developer/InmobiliariaLeads'));
const InmobiliariaPartnerships       = lazy(() => import('./pages/inmobiliaria/InmobiliariaPartnerships'));
const InmobiliariaSignup             = lazy(() => import('./pages/auth/InmobiliariaSignup'));
const DesarrolladorCRM               = lazy(() => import('./pages/developer/DesarrolladorCRM'));
const DesarrolladorPricingLab        = lazy(() => import('./pages/developer/DesarrolladorPricingLab'));
const DesarrolladorSiteSelection     = lazy(() => import('./pages/developer/DesarrolladorSiteSelection'));
const DesarrolladorCashFlow          = lazy(() => import('./pages/developer/DesarrolladorCashFlow'));
// Phase 4 Batch 10 — Mis Proyectos + CRM Shell
const MisProyectos                   = lazy(() => import('./pages/developer/MisProyectos'));
const ProyectoDetail                 = lazy(() => import('./pages/developer/ProyectoDetail'));
const DesarrolladorCRMShell          = lazy(() => import('./pages/developer/DesarrolladorCRMShell'));
// Phase 4 Batch 21 — Métricas del equipo
const MetricasEquipo                 = lazy(() => import('./pages/developer/MetricasEquipo'));
// Phase 4 Batch 20 — Asesor metrics + tracking links + funnel + sankey
const AsesorMetricas                 = lazy(() => import('./pages/asesor/AsesorMetricas'));
const AsesorLinks                    = lazy(() => import('./pages/asesor/AsesorLinks'));
const AsesoresMetrics                = lazy(() => import('./pages/developer/AsesoresMetrics'));
const CrmFunnel                      = lazy(() => import('./pages/developer/CrmFunnel'));
const AceptarInvitacion              = lazy(() => import('./pages/public/AceptarInvitacion'));
const PublicCitaPage                 = lazy(() => import('./pages/public/PublicCitaPage'));
const PublicBookingPage              = lazy(() => import('./pages/public/PublicBookingPage'));
// Phase 4 Batch 26 — Comparador 3-way
const PublicComparator               = lazy(() => import('./pages/public/ColoniaComparator'));
// Phase 4 Batch 28 — Portal Comprador autenticado
const MagicLinkLogin                 = lazy(() => import('./pages/auth/MagicLinkLogin'));
const CompradorDashboard             = lazy(() => import('./pages/comprador/CompradorDashboard'));
const CompradorSavedSearches         = lazy(() => import('./pages/comprador/CompradorSavedSearches'));
const CompradorFavoritos             = lazy(() => import('./pages/comprador/CompradorFavoritos'));
const CompradorHistorial             = lazy(() => import('./pages/comprador/CompradorHistorial'));
const CompradorPrivacy               = lazy(() => import('./pages/comprador/CompradorPrivacy'));
// Phase 4 Batch 29 — Comprador Engagement
const CompradorAlertas               = lazy(() => import('./pages/comprador/CompradorAlertas'));
const CompradorChat                  = lazy(() => import('./pages/comprador/CompradorChat'));
// Phase 4 Batch 30 — Wrapped + Smart Match
const CompradorWrapped               = lazy(() => import('./pages/comprador/CompradorWrapped'));

// Phase 3 Batch 31 — Asesor Tools (Briefing Tráfico+Clima)
const AsesorBriefingTraffic          = lazy(() => import('./pages/asesor/AsesorBriefingTraffic'));

// Phase 4 Batch 32 — Asesor Identity (Perfil + Endorsements + Trust + DISC)
const AsesorPerfil                   = lazy(() => import('./pages/asesor/AsesorPerfil'));
const PerfilAsesor                   = lazy(() => import('./pages/public/PerfilAsesor'));

// Phase 13 Batch 36 — Marketplace Asesor + Whitelist Developer
const AsesorMiniMarket               = lazy(() => import('./pages/asesor/AsesorMiniMarket'));
const AsesorInventario               = lazy(() => import('./pages/asesor/AsesorInventario'));
const DesarrolladorSolicitudes       = lazy(() => import('./pages/developer/DesarrolladorSolicitudes'));

// Phase 14 Batch 37 — In-house Users + Mini Markets + Cross-Org Partnerships
const InHouseSignup                  = lazy(() => import('./pages/auth/InHouseSignup'));
const DesarrolladorMiniMarket        = lazy(() => import('./pages/developer/DesarrolladorMiniMarket'));
const DesarrolladorCrossPartnerships = lazy(() => import('./pages/developer/DesarrolladorCrossPartnerships'));
const InmobiliariaUsuariosCRUD       = lazy(() => import('./pages/inmobiliaria/InmobiliariaUsuariosCRUD'));
const InmobiliariaMiniMarket         = lazy(() => import('./pages/inmobiliaria/InmobiliariaMiniMarket'));
const InmobiliariaCrossPartnerships  = lazy(() => import('./pages/inmobiliaria/InmobiliariaCrossPartnerships'));

// Phase 15 Batch 38 — Directorio Cruzado
const DesarrolladorRedComercial      = lazy(() => import('./pages/developer/DesarrolladorRedComercial'));
const AsesorMisAliados               = lazy(() => import('./pages/asesor/AsesorMisAliados'));
const InmobiliariaRedComercial       = lazy(() => import('./pages/inmobiliaria/InmobiliariaRedComercial'));

// W1.2 SA1.1 — Superadmin Tenants Management
const SuperadminTenants              = lazy(() => import('./pages/superadmin/SuperadminTenants'));
// W1.3 SA1.2 — Superadmin System Health
const SuperadminHealth               = lazy(() => import('./pages/superadmin/SuperadminHealth'));
// W1.4 ZZ.1 — Bulk Drive Ingestion
const SuperadminBulkIngest           = lazy(() => import('./pages/superadmin/SuperadminBulkIngest'));
// W2.1 SA2 — Data Sources Hub (unified connectors)
const SuperadminDataSourcesHub       = lazy(() => import('./pages/superadmin/SuperadminDataSourcesHub'));
// W2.2 SA3 — Audit Log Viewer (cross-org)
const SuperadminAuditLog             = lazy(() => import('./pages/superadmin/SuperadminAuditLog'));
// W2.3 SA4 — AI Cost Observatory
const SuperadminAiCost               = lazy(() => import('./pages/superadmin/SuperadminAiCost'));
// W2.4 SA5 — Commercial Foundation (feature flags + plan templates + GHL snapshots)
const SuperadminCommercial           = lazy(() => import('./pages/superadmin/SuperadminCommercial'));
// W2.5 SA6 — Granular Metrics Cube
const SuperadminMetricsCube          = lazy(() => import('./pages/superadmin/SuperadminMetricsCube'));
// W2.6 SA8 — Founder Console (root /superadmin)
const SuperadminFounderConsole       = lazy(() => import('./pages/superadmin/SuperadminFounderConsole'));
// W2.7 Phase Z.0 — Data Lake foundation
const SuperadminDataLake             = lazy(() => import('./pages/superadmin/SuperadminDataLake'));
// W2.9 Phase Z.2 — Intelligence Hub (executive bird's-eye)
const SuperadminIntelligenceHub      = lazy(() => import('./pages/superadmin/SuperadminIntelligenceHub'));
const SuperadminTrends               = lazy(() => import('./pages/superadmin/SuperadminTrends'));
const SuperadminPhase5Foundation     = lazy(() => import('./pages/superadmin/SuperadminPhase5Foundation'));
const SuperadminTransactionNetwork   = lazy(() => import('./pages/superadmin/SuperadminTransactionNetwork'));
// W3.3 ZZ.3 — DRPI + Bulletins + Investment Explorer
const SuperadminDRPI                 = lazy(() => import('./pages/superadmin/SuperadminDRPI'));
const SuperadminBulletins            = lazy(() => import('./pages/superadmin/SuperadminBulletins'));
const SuperadminInvestmentExplorer   = lazy(() => import('./pages/superadmin/SuperadminInvestmentExplorer'));
const MethodologyPage                = lazy(() => import('./pages/public/MethodologyPage'));
const BulletinPage                   = lazy(() => import('./pages/public/BulletinPage'));
// W3.4A ZZ.4 — Fraud Detection + Risk Score
const SuperadminFraudAlerts          = lazy(() => import('./pages/superadmin/SuperadminFraudAlerts'));
const SuperadminRiskScore            = lazy(() => import('./pages/superadmin/SuperadminRiskScore'));
const SuperadminRiskAlerts           = lazy(() => import('./pages/superadmin/SuperadminRiskAlerts'));
// W3.5 — Public API + Stripe
const SuperadminApiKeys              = lazy(() => import('./pages/superadmin/SuperadminApiKeys'));
const ApiDocsPage                    = lazy(() => import('./pages/public/ApiDocsPage'));
// W3.6 — Vertical Data Products + Data Licensing (Phase Z.4)
const SuperadminVerticalProducts     = lazy(() => import('./pages/superadmin/SuperadminVerticalProducts'));
const SuperadminDataLicensing        = lazy(() => import('./pages/superadmin/SuperadminDataLicensing'));
// W3.7 — Phase Z.5 Compliance LFPDPPP
const SuperadminCompliance           = lazy(() => import('./pages/superadmin/SuperadminCompliance'));
const PrivacyDsrPage                 = lazy(() => import('./pages/public/PrivacyDsrPage'));
// W4.2B — MCP connect page
const ConnectMcpPage                 = lazy(() => import('./pages/public/ConnectMcpPage'));
const AsistentePage                  = lazy(() => import('./pages/public/AsistentePage'));
// W4.2D2 — Programmatic SEO zone landing pages
const ZonePage                       = lazy(() => import('./pages/public/ZonePage'));
// W4.2D3 — Programmatic SEO Tier 1+2 (alcaldías + intents)
const AlcaldiaPage                   = lazy(() => import('./pages/public/AlcaldiaPage'));
const IntentLandingPage              = lazy(() => import('./pages/public/IntentLandingPage'));
// W4.2D3.5 — Superadmin Landing Leads dashboard
const SuperadminLandingLeads         = lazy(() => import('./pages/superadmin/SuperadminLandingLeads'));
// F0.2·Sub-E — Free Audit funnel dashboard
const SuperadminFreeAuditFunnel      = lazy(() => import('./pages/superadmin/SuperadminFreeAuditFunnel'));
// W4.2.5 — Embeddable widgets + Press kit
const ScoreWidgetPage                = lazy(() => import('./pages/public/widgets/ScoreWidgetPage'));
const RiskWidgetPage                 = lazy(() => import('./pages/public/widgets/RiskWidgetPage'));
const PrensaPage                     = lazy(() => import('./pages/public/PrensaPage'));
// W3.8 — Cross-sell Intelligence
const SuperadminPartners             = lazy(() => import('./pages/superadmin/SuperadminPartners'));
const SuperadminCrossSellAnalytics   = lazy(() => import('./pages/superadmin/SuperadminCrossSellAnalytics'));
const BankAvmWidget                  = lazy(() => import('./pages/public/widgets/BankAvmWidget'));
const InsuranceRiskWidget            = lazy(() => import('./pages/public/widgets/InsuranceRiskWidget'));
const NotariaTitleWidget             = lazy(() => import('./pages/public/widgets/NotariaTitleWidget'));
const InvestorYieldWidget            = lazy(() => import('./pages/public/widgets/InvestorYieldWidget'));
// W5.1 — AVM ML productionization
const AvmWidgetPage                  = lazy(() => import('./pages/widgets/AvmWidgetPage'));
const ValorColonia                   = lazy(() => import('./pages/public/ValorColonia'));
const SuperadminAvmAccuracy          = lazy(() => import('./pages/superadmin/SuperadminAvmAccuracy'));
// W5.3 Parte 2A — Forecast Accuracy dashboard
const SuperadminForecastAccuracy     = lazy(() => import('./pages/superadmin/SuperadminForecastAccuracy'));
// W5.2 — Zone Score desagregado · SEO themed landings
const SeoThemedLanding               = lazy(() => import('./pages/public/SeoThemedLanding'));

// Superadmin
const SuperadminDashboard        = lazy(() => import('./pages/superadmin/SuperadminDashboard'));
const DataSourcesPage            = lazy(() => import('./pages/superadmin/DataSourcesPage'));
const DataSourceDetailPage       = lazy(() => import('./pages/superadmin/DataSourceDetailPage'));
const ScoresPage                 = lazy(() => import('./pages/superadmin/ScoresPage'));
const DocumentsPage              = lazy(() => import('./pages/superadmin/DocumentsPage'));
const SuperadminDrivePage        = lazy(() => import('./pages/superadmin/SuperadminDrivePage'));
const SuperadminObservabilityPage= lazy(() => import('./pages/superadmin/SuperadminObservabilityPage'));
const SuperadminPhaseYObservability = lazy(() => import('./pages/superadmin/SuperadminObservability'));
const SuperadminDataSourcesPage = lazy(() => import('./pages/superadmin/SuperadminDataSources'));
const AuditLogPage               = lazy(() => import('./pages/superadmin/AuditLogPage'));
const PrimitivesDemo             = lazy(() => import('./pages/superadmin/PrimitivesDemo'));
const SystemMapPage              = lazy(() => import('./pages/superadmin/SystemMap'));
const UserDiagnosticsPage        = lazy(() => import('./pages/superadmin/UserDiagnostics'));
// W4.10 — WhatsApp + Newsletter
const SuperadminWhatsApp         = lazy(() => import('./pages/superadmin/SuperadminWhatsApp'));
const SuperadminNewsletter       = lazy(() => import('./pages/superadmin/SuperadminNewsletter'));
const SuperadminOnboardingAnalytics = lazy(() => import('./pages/superadmin/SuperadminOnboardingAnalytics'));

// Phase 4 Batch 12
const NuevoProyecto              = lazy(() => import('./pages/developer/NuevoProyecto'));

// Phase 4 Batch 13
const LinksTrackingPage          = lazy(() => import('./pages/asesor/LinksTracking'));

// Phase 4 Batch 15 — Multi-broker Calendar
const CalendarSettings           = lazy(() => import('./pages/advisor/CalendarSettings'));
const CitasPolicies              = lazy(() => import('./pages/developer/CitasPolicies'));
const AutoAssignments            = lazy(() => import('./pages/developer/AutoAssignments'));

// Phase 4 Batch 18 Sub-A — Density + Preferences page
const PreferenciasPage           = lazy(() => import('./pages/configuracion/PreferenciasPage'));

// Phase 4 Batch 19 — Branding page
const BrandingPage               = lazy(() => import('./pages/configuracion/BrandingPage'));

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const navigate = useNavigate();

  // Role → home portal map
  const portalForRole = (role) => {
    if (role === 'superadmin') return '/superadmin';
    if (role === 'advisor' || role === 'asesor_admin') return '/asesor';
    if (role === 'developer_admin' || role === 'developer_member') return '/desarrollador';
    if (role === 'buyer') return '/comprador';
    return '/marketplace';
  };

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const u = await res.json();
        setUser(u);
        // Phase F0.11 — identify to Sentry + PostHog (legacy)
        try { const { identifyUser } = await import('./observability'); identifyUser(u); } catch {}
        // W4.18.2A.0 — LFPDPPP-compliant identify (hash truncate 16 · sin PII raw)
        try {
          phIdentifyUser(u?.user_id || u?.id, {
            role: u?.role,
            tier: u?.tier,
            tenant_slug: u?.tenant_slug || u?.tenant_id,
          });
        } catch {}
      } else setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    // Phase F0.11 — reset identity
    try { const { resetUser } = await import('./observability'); resetUser(); } catch {}
    // W4.18.2A.0 — PostHog reset (LFPDPPP — separa sesión del próximo usuario)
    try { phResetSession(); } catch {}
  };

  const openAuth = useCallback((mode = 'login') => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, checkAuth, openAuth, closeAuth, authOpen, authMode }}>
      {children}
      <AuthModal
        open={authOpen}
        onClose={closeAuth}
        onSuccess={(u) => {
          setUser(u);
          setAuthOpen(false);
          // Phase F0.11 — identify after login
          try { import('./observability').then(m => m.identifyUser(u)); } catch {}
          // W4.18.2A.0 — LFPDPPP-compliant identify (hash truncate 16 · sin PII raw)
          try {
            phIdentifyUser(u?.user_id || u?.id, {
              role: u?.role,
              tier: u?.tier,
              tenant_slug: u?.tenant_slug || u?.tenant_id,
            });
          } catch {}
          // Phase: redirect to role-specific portal after login.
          // If URL has ?next=... (set by AdvisorRoute on protected redirect), honour it.
          const params = new URLSearchParams(window.location.search);
          const next = params.get('next');
          const dest = next || portalForRole(u?.role);
          // Avoid redirect if already inside that portal subtree (preserve deep links).
          const here = window.location.pathname;
          const portalRoot = dest.split('/')[1] || '';
          if (portalRoot && !here.startsWith(`/${portalRoot}`)) {
            navigate(dest, { replace: !!next });
          } else if (here === '/' && portalRoot) {
            navigate(dest, { replace: !!next });
          }
        }}
        mode={authMode}
      />
      {user && user.onboarded === false && (
        <RolePicker user={user} onDone={(u) => setUser(u)} />
      )}
    </AuthContext.Provider>
  );
}

// ─── Auth Callback ────────────────────────────────────────────────────────────
function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  // Role → home portal map (mirror of AuthProvider.portalForRole)
  const portalForRole = (role) => {
    if (role === 'superadmin') return '/superadmin';
    if (role === 'advisor' || role === 'asesor_admin') return '/asesor';
    if (role === 'developer_admin' || role === 'developer_member') return '/desarrollador';
    return '/marketplace';
  };

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) { navigate('/'); return; }

    const sessionId = match[1];

    fetch(`${API}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user);
        window.history.replaceState({}, document.title, '/');
        const dest = data.user ? portalForRole(data.user.role) : '/';
        navigate(dest, { replace: true });
      })
      .catch(() => navigate('/'));
  }, [navigate, setUser]);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 9999,
          border: '2px solid transparent',
          borderTopColor: 'var(--indigo)',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-2)', fontSize: 14 }}>
          Iniciando sesión…
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

// W5.2 — Dispatcher para /cdmx/:slug: SEO themed (top-*) o intent landing
const SEO_THEMED_KEYS = new Set([
  'top-seguras', 'top-familias', 'top-movilidad',
  'top-vibe', 'mejor-precio-calidad', 'top-amenidades',
]);
function CdmxSlugDispatcher() {
  const { intent } = useReactRouterParams();
  if (intent && SEO_THEMED_KEYS.has(intent)) {
    return <SeoThemedLanding />;
  }
  return <IntentLandingPage />;
}

function AppRouter() {
  const location = useLocation();

  // Scroll restoration — vuelve al top en cada cambio de ruta (excepto anchors)
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  // W4.3 — Behavioral page view tracking (auto-fire on route change)
  usePageViewTracking();

  // W4.18.2A.0 — PostHog pageview tracking (LFPDPPP — capture_pageview manual, no auto)
  useEffect(() => {
    try { phCapturePageview(location.pathname + location.search); } catch {}
  }, [location.pathname, location.search]);

  // Phase 4 Batch 13 — Capture ?ref=asesor_id tracking cookie on initial load
  useEffect(() => {
    import('./lib/tracking').then(({ captureRefCookie }) => {
      try { captureRefCookie(); } catch {}
    });
  }, []);

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Suspense fallback={
      <div style={{ padding: 60, color: 'rgba(240,235,224,0.5)', textAlign: 'center', fontFamily: 'DM Sans', background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid rgba(240,235,224,0.12)', borderTopColor: 'var(--cream)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 12 }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/marketplace" element={<MarketplaceRoute />} />
      <Route path="/propiedad/:id" element={<PropertyDetailRoute />} />
      <Route path="/desarrollo/:id" element={<DevelopmentDetailRoute />} />
      <Route path="/mapa" element={<MapaCDMXRoute />} />
      <Route path="/mapa/:alcaldia" element={<MapaCDMXRoute />} />
      <Route path="/mapa/:alcaldia/:colonia" element={<MapaCDMXRoute />} />
      {/* W4.18.2B Sub-D — public AVM + colonia landings */}
      <Route path="/valores" element={<Valores />} />
      <Route path="/colonia/:slug" element={<ColoniaLanding />} />
      {/* W4.18.3 — Private Beta Gate */}
      <Route path="/broker-portal" element={<BrokerPortal />} />
      <Route path="/superadmin/invites" element={<SuperadminInvitesRoute />} />
      {/* W4.13.A — Lead Journey Outbound */}
      <Route path="/asesor/outbound" element={<AsesorOutboundRoute />} />
      <Route path="/portal/outbound" element={<AsesorOutboundRoute />} />
      {/* W4.17 — Notifications Settings */}
      <Route path="/portal/settings/notifications" element={<NotifSettingsRoute />} />
      <Route path="/portal/notifications" element={<NotifSettingsRoute />} />
      {/* W4.14 — Simulador público */}
      <Route path="/simulador" element={<SimuladorRoute />} />
      <Route path="/embed/3dgs/:unit_id" element={<Embed3DGSPage />} />
      <Route path="/free-audit" element={<FreeAudit />} />
      <Route path="/insights/state-of-cdmx-2026" element={<StateOfCDMX />} />
      <Route path="/connect/mcp/tutorial" element={<MCPTutorial />} />

      {/* B9 differentiated routes */}
      <Route path="/propiedades" element={<Navigate to="/marketplace" replace />} />
      <Route path="/barrios" element={<Barrios />} />
      <Route path="/inteligencia" element={<Inteligencia />} />
      <Route path="/asesores" element={<AsesoresLanding />} />

      <Route path="/asesor" element={<AdvisorRoute Page={AsesorDashboard} />} />
      <Route path="/asesor/contactos" element={<AdvisorRoute Page={AsesorContactos} />} />
      <Route path="/asesor/contactos/:id" element={<AdvisorRoute Page={AsesorContactos} />} />
      <Route path="/asesor/busquedas" element={<AdvisorRoute Page={AsesorBusquedas} />} />
      <Route path="/asesor/captaciones" element={<AdvisorRoute Page={AsesorCaptaciones} />} />
      <Route path="/asesor/tareas" element={<AdvisorRoute Page={AsesorTareas} />} />
      <Route path="/asesor/operaciones" element={<AdvisorRoute Page={AsesorOperaciones} />} />
      <Route path="/asesor/comisiones" element={<AdvisorRoute Page={AsesorComisiones} />} />
      <Route path="/asesor/ranking" element={<AdvisorRoute Page={AsesorRanking} />} />
      <Route path="/asesor/studio" element={<AdvisorRoute Page={StudioDashboard} />} />
      <Route path="/asesor/briefings" element={<AdvisorRoute Page={AsesorBriefings} />} />
      <Route path="/asesor/citas" element={<AdvisorRoute Page={AsesorCitas} />} />
      <Route path="/asesor/leads-dev" element={<AdvisorRoute Page={AsesorLeadsDev} />} />
      {/* W5.ASR.4 Parte 1 — CMA */}
      <Route path="/asesor/cma" element={<AdvisorRoute Page={AsesorCMA} />} />
      <Route path="/asesor/cma/:id" element={<AdvisorRoute Page={AsesorCMA} />} />
      <Route path="/desarrollador" element={<AdvisorRoute Page={DesarrolladorDashboard} />} />

      {/* Phase 4 Batch 10 — Mis Proyectos + CRM Shell */}
      <Route path="/desarrollador/proyectos" element={<AdvisorRoute Page={MisProyectos} />} />
      <Route path="/desarrollador/proyectos/:slug" element={<AdvisorRoute Page={ProyectoDetail} />} />
      <Route path="/desarrollador/crm" element={<AdvisorRoute Page={DesarrolladorCRMShell} />} />
      <Route path="/desarrollador/metricas-equipo" element={<AdvisorRoute Page={MetricasEquipo} />} />
      <Route path="/desarrollador/crm/asesores-metrics" element={<AdvisorRoute Page={AsesoresMetrics} />} />
      <Route path="/desarrollador/crm/funnel" element={<AdvisorRoute Page={CrmFunnel} />} />
      <Route path="/asesor/metricas" element={<AdvisorRoute Page={AsesorMetricas} />} />
      <Route path="/asesor/links" element={<AdvisorRoute Page={AsesorLinks} />} />
      {/* Phase 3 Batch 31 — Briefing pre-visita */}
      <Route path="/asesor/briefing" element={<AdvisorRoute Page={AsesorBriefingTraffic} />} />
      {/* Phase 4 Batch 32 — Asesor Identity */}
      <Route path="/asesor/perfil" element={<AdvisorRoute Page={AsesorPerfil} />} />
      <Route path="/asesor-publico/:id" element={<PerfilAsesor />} />
      <Route path="/desarrollador/mensajes" element={<AdvisorRoute Page={DesarrolladorCRMShell} />} />

      {/* Legacy backward-compat redirects */}
      <Route path="/desarrollador/inventario" element={<Navigate to="/desarrollador/proyectos" replace />} />
      <Route path="/desarrollador/leads" element={<AdvisorRoute Page={DesarrolladorLeads} />} />
      <Route path="/desarrollador/citas" element={<Navigate to="/desarrollador/crm?tab=citas" replace />} />
      <Route path="/desarrollador/calendario-subidas" element={<Navigate to="/desarrollador/proyectos" replace />} />

      <Route path="/desarrollador/desarrollos/:slug/legajo" element={<AdvisorRoute Page={DesarrolladorLegajo} />} />
      <Route path="/desarrollador/desarrollos/:slug/ie" element={<AdvisorRoute Page={DesarrolladorIEDetail} />} />
      <Route path="/desarrollador/desarrollos/:slug/crm" element={<AdvisorRoute Page={DesarrolladorCRM} />} />
      <Route path="/desarrollador/desarrollos/:slug/pricing-lab" element={<AdvisorRoute Page={DesarrolladorPricingLab} />} />
      <Route path="/desarrollador/desarrollos/:slug/cash-flow" element={<AdvisorRoute Page={DesarrolladorCashFlow} />} />
      <Route path="/desarrollador/site-selection" element={<AdvisorRoute Page={DesarrolladorSiteSelection} />} />
      <Route path="/aceptar-invitacion/:token" element={<AceptarInvitacion />} />
      <Route path="/cita/:token" element={<PublicCitaPage />} />
      <Route path="/reservar/:slug" element={<PublicBookingPage />} />
      {/* Phase 4 Batch 26 — Comparador 3-way (página pública) */}
      <Route path="/comparar" element={<PublicComparator />} />
      {/* Phase 4 Batch 28 — Portal Comprador autenticado */}
      <Route path="/login-comprador" element={<MagicLinkLogin />} />
      <Route path="/comprador" element={<CompradorDashboard />} />
      <Route path="/comprador/saved-searches" element={<CompradorSavedSearches />} />
      <Route path="/comprador/favoritos" element={<CompradorFavoritos />} />
      <Route path="/comprador/historial" element={<CompradorHistorial />} />
      <Route path="/comprador/privacidad" element={<CompradorPrivacy />} />
      {/* Phase 4 Batch 29 — Comprador Engagement */}
      <Route path="/comprador/alertas" element={<CompradorAlertas />} />
      <Route path="/comprador/chat" element={<CompradorChat />} />
      {/* Phase 4 Batch 30 — Wrapped + Smart Match */}
      <Route path="/comprador/wrapped" element={<CompradorWrapped />} />
      <Route path="/comprador/wrapped/:yearMonth" element={<CompradorWrapped />} />
      <Route path="/desarrollador/demanda" element={<AdvisorRoute Page={DesarrolladorDemanda} />} />
      <Route path="/desarrollador/reportes" element={<AdvisorRoute Page={DesarrolladorReportes} />} />
      <Route path="/desarrollador/pricing" element={<AdvisorRoute Page={DesarrolladorPricing} />} />
      <Route path="/desarrollador/competidores" element={<AdvisorRoute Page={DesarrolladorCompetidores} />} />
      <Route path="/desarrollador/usuarios" element={<AdvisorRoute Page={DesarrolladorUsuarios} />} />
      <Route path="/desarrollador/configuracion" element={<AdvisorRoute Page={DesarrolladorConfiguracion} />} />
      <Route path="/inmobiliaria" element={<AdvisorRoute Page={InmobiliariaDashboard} />} />
      <Route path="/inmobiliaria/asesores" element={<AdvisorRoute Page={InmobiliariaAsesores} />} />
      <Route path="/inmobiliaria/leads" element={<AdvisorRoute Page={InmobiliariaLeads} />} />
      <Route path="/inmobiliaria/alianzas" element={<AdvisorRoute Page={InmobiliariaPartnerships} />} />
      <Route path="/inmobiliaria/signup" element={<InmobiliariaSignup />} />

      {/* Phase 13 Batch 36 — Marketplace Asesor + Whitelist Developer + Auto-Approve */}
      <Route path="/asesor/mini-market" element={<AdvisorRoute Page={AsesorMiniMarket} />} />
      <Route path="/asesor/inventario" element={<AdvisorRoute Page={AsesorInventario} />} />
      <Route path="/desarrollador/solicitudes" element={<AdvisorRoute Page={DesarrolladorSolicitudes} />} />

      {/* Phase 14 Batch 37 — In-house Users + Mini Markets + Cross-Org Partnerships */}
      <Route path="/in-house/aceptar-invitacion" element={<InHouseSignup />} />
      <Route path="/desarrollador/mini-market" element={<AdvisorRoute Page={DesarrolladorMiniMarket} />} />
      <Route path="/desarrollador/cross-partnerships" element={<AdvisorRoute Page={DesarrolladorCrossPartnerships} />} />
      <Route path="/inmobiliaria/usuarios" element={<AdvisorRoute Page={InmobiliariaUsuariosCRUD} />} />
      <Route path="/inmobiliaria/mini-market" element={<AdvisorRoute Page={InmobiliariaMiniMarket} />} />
      <Route path="/inmobiliaria/cross-partnerships" element={<AdvisorRoute Page={InmobiliariaCrossPartnerships} />} />

      {/* Phase 15 Batch 38 — Directorio Cruzado */}
      <Route path="/desarrollador/red-comercial" element={<AdvisorRoute Page={DesarrolladorRedComercial} />} />
      <Route path="/asesor/mis-aliados" element={<AdvisorRoute Page={AsesorMisAliados} />} />
      <Route path="/inmobiliaria/red-comercial" element={<AdvisorRoute Page={InmobiliariaRedComercial} />} />

      {/* W1.2 SA1.1 — Superadmin Tenants */}
      <Route path="/superadmin/tenants" element={<AdvisorRoute Page={SuperadminTenants} />} />
      {/* W1.3 SA1.2 — Superadmin System Health */}
      <Route path="/superadmin/health" element={<AdvisorRoute Page={SuperadminHealth} />} />
      {/* W1.4 ZZ.1 — Bulk Drive Ingestion */}
      <Route path="/superadmin/bulk-ingest" element={<AdvisorRoute Page={SuperadminBulkIngest} />} />

      {/* Superadmin — IE Engine Phase A */}
      {/* W2.6 SA8 — Founder Console replaces legacy dashboard at /superadmin */}
      <Route path="/superadmin" element={<AdvisorRoute Page={SuperadminFounderConsole} />} />
      <Route path="/superadmin/dashboard-legacy" element={<AdvisorRoute Page={SuperadminDashboard} />} />
      {/* W2.1 SA2 — Data Sources Hub (replaces legacy /data-sources nav item) */}
      <Route path="/superadmin/data-sources" element={<AdvisorRoute Page={SuperadminDataSourcesHub} />} />
      {/* Legacy IE Engine sources page (kept accessible) */}
      <Route path="/superadmin/ie-engine-sources" element={<AdvisorRoute Page={DataSourcesPage} />} />
      <Route path="/superadmin/ie-engine-sources/:id" element={<AdvisorRoute Page={DataSourceDetailPage} />} />
      {/* Legacy detail still reachable via old path */}
      <Route path="/superadmin/data-sources/:id" element={<AdvisorRoute Page={DataSourceDetailPage} />} />
      <Route path="/superadmin/scores" element={<AdvisorRoute Page={ScoresPage} />} />
      <Route path="/superadmin/documents" element={<AdvisorRoute Page={DocumentsPage} />} />
      <Route path="/superadmin/drive" element={<AdvisorRoute Page={SuperadminDrivePage} />} />
      <Route path="/superadmin/observability" element={<AdvisorRoute Page={SuperadminObservabilityPage} />} />
      <Route path="/superadmin/phase-y-observability" element={<AdvisorRoute Page={SuperadminPhaseYObservability} />} />
      <Route path="/superadmin/data-sources" element={<AdvisorRoute Page={SuperadminDataSourcesPage} />} />
      <Route path="/superadmin/audit-log" element={<AdvisorRoute Page={SuperadminAuditLog} />} />
      <Route path="/superadmin/audit-log-legacy" element={<AdvisorRoute Page={AuditLogPage} />} />
      <Route path="/superadmin/ai-cost" element={<AdvisorRoute Page={SuperadminAiCost} />} />
      <Route path="/superadmin/commercial" element={<AdvisorRoute Page={SuperadminCommercial} />} />
      <Route path="/superadmin/metrics-cube" element={<AdvisorRoute Page={SuperadminMetricsCube} />} />
      <Route path="/superadmin/data-lake" element={<AdvisorRoute Page={SuperadminDataLake} />} />
      <Route path="/superadmin/intelligence-hub" element={<AdvisorRoute Page={SuperadminIntelligenceHub} />} />
      <Route path="/superadmin/trends" element={<AdvisorRoute Page={SuperadminTrends} />} />
      <Route path="/superadmin/phase5-foundation" element={<AdvisorRoute Page={SuperadminPhase5Foundation} />} />
      <Route path="/superadmin/transactions" element={<AdvisorRoute Page={SuperadminTransactionNetwork} />} />
      {/* W3.3 ZZ.3 — DRPI / Bulletins / Investment Explorer */}
      <Route path="/superadmin/drpi" element={<AdvisorRoute Page={SuperadminDRPI} />} />
      <Route path="/superadmin/bulletins" element={<AdvisorRoute Page={SuperadminBulletins} />} />
      <Route path="/superadmin/investment-explorer" element={<AdvisorRoute Page={SuperadminInvestmentExplorer} />} />
      {/* W3.4A ZZ.4 — Fraud Detection + Risk Score */}
      <Route path="/superadmin/fraud-alerts" element={<AdvisorRoute Page={SuperadminFraudAlerts} />} />
      <Route path="/superadmin/risk-score" element={<AdvisorRoute Page={SuperadminRiskScore} />} />
      <Route path="/superadmin/risk-alerts" element={<AdvisorRoute Page={SuperadminRiskAlerts} />} />
      <Route path="/methodology" element={<MethodologyPage />} />
      <Route path="/boletin/:slug/:period" element={<BulletinPage />} />
      {/* W3.5 — Public API + Stripe routes */}
      <Route path="/superadmin/api-keys" element={<AdvisorRoute Page={SuperadminApiKeys} />} />
      <Route path="/docs/api" element={<ApiDocsPage />} />
      {/* W3.6 — Vertical Data Products + Data Licensing */}
      <Route path="/superadmin/vertical-products" element={<AdvisorRoute Page={SuperadminVerticalProducts} />} />
      <Route path="/superadmin/data-licensing" element={<AdvisorRoute Page={SuperadminDataLicensing} />} />
      {/* W3.7 — Phase Z.5 Compliance */}
      <Route path="/superadmin/compliance" element={<AdvisorRoute Page={SuperadminCompliance} />} />
      <Route path="/privacy/dsr" element={<PrivacyDsrPage />} />
      {/* W4.2B — MCP connect page */}
      <Route path="/connect/mcp" element={<ConnectMcpPage />} />
      <Route path="/asistente" element={<AsistentePage />} />
      {/* W4.2D2 — Programmatic SEO zone landing */}
      <Route path="/zona/:slug" element={<ZonePage />} />
      {/* W4.2D3 — Programmatic SEO alcaldía + intent landings */}
      <Route path="/alcaldia/:slug" element={<AlcaldiaPage />} />
      <Route path="/cdmx/:intent" element={<CdmxSlugDispatcher />} />
      {/* W4.2D3.5 — Superadmin Landing Leads dashboard */}
      <Route path="/superadmin/landing-leads" element={<AdvisorRoute Page={SuperadminLandingLeads} />} />
      {/* F0.2·Sub-E — Superadmin Free Audit funnel */}
      <Route path="/superadmin/free-audit-funnel" element={<AdvisorRoute Page={SuperadminFreeAuditFunnel} />} />
      {/* W4.2.5 — Embeddable widgets (standalone, sin Navbar) + Press kit */}
      <Route path="/widgets/score/:slug" element={<ScoreWidgetPage />} />
      <Route path="/widgets/risk/:slug" element={<RiskWidgetPage />} />
      {/* W5.1 — AVM widget embeddable + landing SEO + accuracy dashboard */}
      <Route path="/widgets/avm/:slug" element={<AvmWidgetPage />} />
      <Route path="/valor/:slug" element={<ValorColonia />} />
      <Route path="/superadmin/avm-accuracy" element={<AdvisorRoute Page={SuperadminAvmAccuracy} />} />
      <Route path="/superadmin/forecast-accuracy" element={<AdvisorRoute Page={SuperadminForecastAccuracy} />} />
      <Route path="/prensa" element={<PrensaPage />} />
      {/* W3.8 — Cross-sell Intelligence */}
      <Route path="/superadmin/partners" element={<AdvisorRoute Page={SuperadminPartners} />} />
      <Route path="/superadmin/cross-sell-analytics" element={<AdvisorRoute Page={SuperadminCrossSellAnalytics} />} />
      <Route path="/widget/bank-avm" element={<BankAvmWidget />} />
      <Route path="/widget/insurance-risk" element={<InsuranceRiskWidget />} />
      <Route path="/widget/notaria-title-check" element={<NotariaTitleWidget />} />
      <Route path="/widget/investor-yield" element={<InvestorYieldWidget />} />
      <Route path="/superadmin/primitives-demo" element={<AdvisorRoute Page={PrimitivesDemo} />} />
      <Route path="/superadmin/system-map" element={<AdvisorRoute Page={SystemMapPage} />} />
      {/* W4.10 — WhatsApp Business + Newsletter Pulse */}
      <Route path="/superadmin/whatsapp" element={<AdvisorRoute Page={SuperadminWhatsApp} />} />
      <Route path="/superadmin/newsletter" element={<AdvisorRoute Page={SuperadminNewsletter} />} />
      <Route path="/superadmin/user-diagnostics" element={<AdvisorRoute Page={UserDiagnosticsPage} />} />
      <Route path="/superadmin/onboarding-analytics" element={<AdvisorRoute Page={SuperadminOnboardingAnalytics} />} />
      <Route path="/desarrollador/proyectos/nuevo" element={<AdvisorRoute Page={NuevoProyecto} />} />
      <Route path="/asesor/links-tracking" element={<AdvisorRoute Page={LinksTrackingPage} />} />

      {/* Phase 4 Batch 15 — Multi-broker Calendar */}
      <Route path="/asesor/configuracion" element={<AdvisorRoute Page={CalendarSettings} />} />
      <Route path="/desarrollador/configuracion/citas-policies" element={<AdvisorRoute Page={CitasPolicies} />} />
      <Route path="/desarrollador/crm/auto-assignments" element={<AdvisorRoute Page={AutoAssignments} />} />

      {/* Phase 4 Batch 18 Sub-A — Density + Preferences */}
      <Route path="/configuracion/preferencias" element={<AdvisorRoute Page={PreferenciasPage} />} />

      {/* Phase 4 Batch 19 — Branding */}
      <Route path="/configuracion/branding" element={<AdvisorRoute Page={BrandingPage} />} />

      {/* Phase 4 Batch 21 Sub-A — Team metrics */}
      <Route path="/desarrollador/crm/metricas-equipo" element={<AdvisorRoute Page={MetricasEquipo} />} />

      <Route path="*" element={<FallbackRoute />} />
    </Routes>
    </Suspense>
  );
}

function MarketplaceRoute() {
  const { user, logout, openAuth } = useAuth();
  return <Marketplace user={user} onLogin={openAuth} onLogout={logout} />;
}

function PropertyDetailRoute() {
  const { user, logout, openAuth } = useAuth();
  return <PropertyDetail user={user} onLogin={openAuth} onLogout={logout} />;
}

function MapaRoute() {
  const { user, logout, openAuth } = useAuth();
  return <Mapa user={user} onLogin={openAuth} onLogout={logout} />;
}

function MapaCDMXRoute() {
  const { user } = useAuth();
  return <MapaCDMX user={user} />;
}

function SuperadminInvitesRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <SuperadminInvites user={user} />;
}

function AsesorOutboundRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <AsesorOutbound user={user} />;
}

function NotifSettingsRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return null;
  return <NotificationsSettings user={user} />;
}

function SimuladorRoute() {
  const { user, logout } = useAuth();
  return <Simulador user={user} onLogout={logout} />;
}

function DevelopmentDetailRoute() {
  const { user, logout, openAuth } = useAuth();
  return <DevelopmentDetail user={user} onLogin={openAuth} onLogout={logout} />;
}

function AdvisorRoute({ Page }) {
  const { user, logout, loading, openAuth } = useAuth();
  const location = useLocation();

  // Auto-open login modal when user lands on a protected route without session
  useEffect(() => {
    if (!loading && !user) openAuth('login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading) {
    return <div style={{ padding: 60, color: '#807e78', textAlign: 'center', fontFamily: 'DM Sans' }}>Cargando…</div>;
  }
  if (!user) {
    // Redirect home (modal will auto-open above on next render)
    return <Navigate to={`/?login=1&next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Page user={user} onLogout={logout} />;
}

// ─── Fallback route: protects portal users from dropping onto Landing ─────────
// If user is authenticated and URL starts with a known portal prefix, redirect
// to their role's portal root instead of showing Landing (which feels like a
// silent logout). Otherwise render LandingPage.
function FallbackRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  const portalForRole = (role) => {
    if (role === 'superadmin') return '/superadmin';
    if (role === 'advisor' || role === 'asesor_admin' || role === 'asesor_freelance') return '/asesor';
    if (role === 'developer_admin' || role === 'developer_member' || role === 'developer') return '/desarrollador';
    if (role === 'inmobiliaria_admin' || role === 'inmobiliaria_member' || role === 'inmobiliaria_director') return '/inmobiliaria';
    return '/marketplace';
  };

  if (loading) {
    return <div style={{ padding: 60, color: '#807e78', textAlign: 'center', fontFamily: 'DM Sans' }}>Cargando…</div>;
  }

  const path = location.pathname;
  const isPortalPath =
    path.startsWith('/desarrollador') ||
    path.startsWith('/asesor') ||
    path.startsWith('/inmobiliaria') ||
    path.startsWith('/superadmin');

  if (user && isPortalPath) {
    return <Navigate to={portalForRole(user.role)} replace />;
  }
  return <LandingPage />;
}

// ─── Landing page ─────────────────────────────────────────────────────────────
// W4.18.3 — Private Beta — WaitlistForm (moved to top to avoid import/first eslint)


function LandingPage() {
  const { user, logout, openAuth, loading } = useAuth();
  const location = useLocation();

  // Handle ?login=1 query to auto-open modal (B3/B5 redirect target)
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    if (params.get('login') === '1' && !user) {
      openAuth('login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, location.search, user]);

  // W4.18.3 — Si beta mode activo y user no autenticado → waitlist hero
  if (PRIVATE_BETA_MODE && !user && !loading) {
    return <WaitlistLanding />;
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={() => openAuth('login')} user={user} onLogout={logout} />
      <main id="main-content" tabIndex="-1">
        <Hero />
        <SearchBar />
        <LiveTicker />
        <AtlaxHomeHero />
        <ColoniasBento />
        <DrpiHeroWidget />
        <ColoniaComparator />
        <PropertyListings />
        <IntelligenceEngine />
        <Stats />
        <Testimonials />
        <Faq />
        <CtaFooter />
      </main>
    </div>
  );
}

// W4.18.3 — Hero waitlist (public · no auth)
function WaitlistLanding() {
  return (
    <div style={{ background: 'var(--bg, #06080F)', minHeight: '100vh', color: '#F0EBE0' }}>
      <Navbar />
      <main style={{ paddingTop: 100, padding: '100px 24px 80px' }}>
        <section style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 14 }}>
            DESARROLLOSMX · LANZAMOS PRONTO
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(36px, 6vw, 64px)', letterSpacing: '-0.025em',
            lineHeight: 1.05, margin: '0 0 18px', color: '#F0EBE0',
          }}>
            Inteligencia Inmobiliaria CDMX
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'rgba(240,235,224,0.7)', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.55 }}>
            Únete a la waitlist y entérate primero cuando abramos el acceso público.
            Datos de mercado, scoring de zonas, valuaciones automáticas y mucho más.
          </p>
        </section>
        <section style={{ maxWidth: 480, margin: '0 auto' }}>
          <WaitlistForm />
          <div style={{ marginTop: 22, textAlign: 'center' }}>
            <a
              data-testid="broker-portal-link"
              href="/broker-portal"
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                color: '#a5b4fc', textDecoration: 'none', letterSpacing: '0.02em',
              }}
            >¿Eres broker? Acceso temprano →</a>
          </div>
        </section>
      </main>
    </div>
  );
}

// W4.11a · Atlax home hero section — featured CTA card + inline embedded bubble
function AtlaxHomeHero() {
  return (
    <section
      data-testid="atlax-home-hero"
      style={{
        padding: '64px 24px 48px',
        background: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 50%), radial-gradient(circle at 80% 80%, rgba(236,72,153,0.06), transparent 50%)',
      }}
    >
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'grid', gap: 32, alignItems: 'stretch',
        gridTemplateColumns: 'minmax(0, 1fr)',
      }} className="atlax-home-grid">
        {/* Copy column */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <div style={{
            display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.32)',
            color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            <span aria-hidden="true">●</span> Nuevo · Atlax IA
          </div>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 700,
            fontSize: 'clamp(28px, 4vw, 44px)',
            color: 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.1,
            margin: 0,
          }}>
            Pregúntale al mercado de CDMX
          </h2>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-3)',
            lineHeight: 1.6, maxWidth: 520, margin: 0,
          }}>
            Atlax es nuestro asistente de inteligencia inmobiliaria. Explora visión general
            de la ciudad, zonas con mayor crecimiento, tendencias de precio por alcaldía y
            desarrollos en preventa — todo con datos verificados de DesarrollosMX.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            <a
              href="/asistente"
              data-testid="atlax-hero-cta-asistente"
              style={{
                padding: '11px 18px', borderRadius: 9999,
                background: 'var(--grad)', color: '#fff', textDecoration: 'none',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.02em',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: 'none',
              }}
            >
              Abrir conversación completa →
            </a>
            <a
              href="/inteligencia"
              data-testid="atlax-hero-cta-inteligencia"
              style={{
                padding: '11px 18px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)', color: 'var(--cream)', textDecoration: 'none',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.02em',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: '1px solid var(--border)',
              }}
            >
              Inteligencia inmobiliaria
            </a>
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 8,
            color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 11,
          }}>
            <span>16 colonias premium</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Datos en tiempo real</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Sin login requerido</span>
          </div>
        </div>

        {/* Embedded Atlax (home mode) */}
        <div data-testid="atlax-home-embed-wrap" style={{
          width: '100%',
          maxWidth: 480,
          justifySelf: 'center',
        }}>
          <AtlaxBubble mode="home" />
        </div>
      </div>
      <style>{`
        @media (min-width: 900px) {
          .atlax-home-grid {
            grid-template-columns: 1.1fr 0.9fr !important;
            gap: 48px !important;
          }
        }
      `}</style>
    </section>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <SkipToContent />
      <UndoProvider>
        <PresentationModeProvider>
          <AuthProvider>
            <TourLauncher>
              <CustomCursor />
              <AppRouter />
            </TourLauncher>
          </AuthProvider>
        </PresentationModeProvider>
      </UndoProvider>
    </BrowserRouter>
  );
}
