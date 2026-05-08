import React, { createContext, useContext, useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { UndoProvider } from './components/shared/UndoSnackbar';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { PresentationModeProvider } from './hooks/usePresentationMode';

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
const DrpiHeroWidget = lazy(() => import('./components/public/DrpiHeroWidget'));

// ─── Lazy-loaded page routes ───────────────────────────────────────────────────
// Marketplace
const Marketplace       = lazy(() => import('./pages/Marketplace'));
const PropertyDetail    = lazy(() => import('./pages/PropertyDetail'));
const DevelopmentDetail = lazy(() => import('./pages/DevelopmentDetail'));
const Mapa              = lazy(() => import('./pages/Mapa'));
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
const BankAvmWidget                  = lazy(() => import('./pages/public/widgets/BankAvmWidget'));
const InsuranceRiskWidget            = lazy(() => import('./pages/public/widgets/InsuranceRiskWidget'));
const NotariaTitleWidget             = lazy(() => import('./pages/public/widgets/NotariaTitleWidget'));
const InvestorYieldWidget            = lazy(() => import('./pages/public/widgets/InvestorYieldWidget'));

// Superadmin
const SuperadminDashboard        = lazy(() => import('./pages/superadmin/SuperadminDashboard'));
const DataSourcesPage            = lazy(() => import('./pages/superadmin/DataSourcesPage'));
const DataSourceDetailPage       = lazy(() => import('./pages/superadmin/DataSourceDetailPage'));
const ScoresPage                 = lazy(() => import('./pages/superadmin/ScoresPage'));
const DocumentsPage              = lazy(() => import('./pages/superadmin/DocumentsPage'));
const SuperadminDrivePage        = lazy(() => import('./pages/superadmin/SuperadminDrivePage'));
const SuperadminObservabilityPage= lazy(() => import('./pages/superadmin/SuperadminObservabilityPage'));
const AuditLogPage               = lazy(() => import('./pages/superadmin/AuditLogPage'));
const PrimitivesDemo             = lazy(() => import('./pages/superadmin/PrimitivesDemo'));
const SystemMapPage              = lazy(() => import('./pages/superadmin/SystemMap'));
const UserDiagnosticsPage        = lazy(() => import('./pages/superadmin/UserDiagnostics'));

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
        // Phase F0.11 — identify to Sentry + PostHog
        try { const { identifyUser } = await import('./observability'); identifyUser(u); } catch {}
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
function AppRouter() {
  const location = useLocation();

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
      <Route path="/mapa" element={<MapaRoute />} />

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
      <Route path="/superadmin/audit-log" element={<AdvisorRoute Page={SuperadminAuditLog} />} />
      <Route path="/superadmin/audit-log-legacy" element={<AdvisorRoute Page={AuditLogPage} />} />
      <Route path="/superadmin/ai-cost" element={<AdvisorRoute Page={SuperadminAiCost} />} />
      <Route path="/superadmin/commercial" element={<AdvisorRoute Page={SuperadminCommercial} />} />
      <Route path="/superadmin/metrics-cube" element={<AdvisorRoute Page={SuperadminMetricsCube} />} />
      <Route path="/superadmin/data-lake" element={<AdvisorRoute Page={SuperadminDataLake} />} />
      <Route path="/superadmin/intelligence-hub" element={<AdvisorRoute Page={SuperadminIntelligenceHub} />} />
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
      <Route path="/superadmin/api-keys" element={<AdvisorRoute Page={SuperadminApiKeys} />} />
      <Route path="/docs/api" element={<ApiDocsPage />} />
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
      <Route path="/widget/bank-avm" element={<BankAvmWidget />} />
      <Route path="/widget/insurance-risk" element={<InsuranceRiskWidget />} />
      <Route path="/widget/notaria-title-check" element={<NotariaTitleWidget />} />
      <Route path="/widget/investor-yield" element={<InvestorYieldWidget />} />
      <Route path="/superadmin/primitives-demo" element={<AdvisorRoute Page={PrimitivesDemo} />} />
      <Route path="/superadmin/system-map" element={<AdvisorRoute Page={SystemMapPage} />} />
      <Route path="/superadmin/user-diagnostics" element={<AdvisorRoute Page={UserDiagnosticsPage} />} />
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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={() => openAuth('login')} user={user} onLogout={logout} />
      <main>
        <Hero />
        <SearchBar />
        <LiveTicker />
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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <UndoProvider>
        <PresentationModeProvider>
          <AuthProvider>
            <CustomCursor />
            <AppRouter />
          </AuthProvider>
        </PresentationModeProvider>
      </UndoProvider>
    </BrowserRouter>
  );
}
