import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';

// Landing components
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

// Marketplace pages
import Marketplace from './pages/Marketplace';
import PropertyDetail from './pages/PropertyDetail';
import DevelopmentDetail from './pages/DevelopmentDetail';
import Mapa from './pages/Mapa';

// B9 stubs
import Barrios from './pages/Barrios';
import Inteligencia from './pages/Inteligencia';
import AsesoresLanding from './pages/AsesoresLanding';

// Advisor portal (Phase 4 CRM Pulppo+)
import AsesorDashboard from './pages/advisor/AsesorDashboard';
import AsesorContactos from './pages/advisor/AsesorContactos';
import AsesorBusquedas from './pages/advisor/AsesorBusquedas';
import AsesorCaptaciones from './pages/advisor/AsesorCaptaciones';
import AsesorTareas from './pages/advisor/AsesorTareas';
import AsesorOperaciones from './pages/advisor/AsesorOperaciones';
import AsesorComisiones from './pages/advisor/AsesorComisiones';
import AsesorRanking from './pages/advisor/AsesorRanking';
import StudioDashboard from './pages/advisor/StudioDashboard';
import AsesorBriefings from './pages/advisor/AsesorBriefings';

// Developer portal (Phase 5)
import DesarrolladorDashboard from './pages/developer/DesarrolladorDashboard';
import DesarrolladorInventario from './pages/developer/DesarrolladorInventario';
import DesarrolladorDemanda from './pages/developer/DesarrolladorDemanda';
import DesarrolladorReportes from './pages/developer/DesarrolladorReportes';
import DesarrolladorLegajo from './pages/developer/DesarrolladorLegajo';
import DesarrolladorPricing from './pages/developer/DesarrolladorPricing';
import DesarrolladorCompetidores from './pages/developer/DesarrolladorCompetidores';

// Superadmin (IE Engine Phase A)
import SuperadminDashboard from './pages/superadmin/SuperadminDashboard';
import DataSourcesPage from './pages/superadmin/DataSourcesPage';
import DataSourceDetailPage from './pages/superadmin/DataSourceDetailPage';
import ScoresPage from './pages/superadmin/ScoresPage';
import DocumentsPage from './pages/superadmin/DocumentsPage';
import SuperadminDrivePage from './pages/superadmin/SuperadminDrivePage';
import SuperadminObservabilityPage from './pages/superadmin/SuperadminObservabilityPage';
import AuditLogPage from './pages/superadmin/AuditLogPage';

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

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
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
      <Route path="/desarrollador" element={<AdvisorRoute Page={DesarrolladorDashboard} />} />
      <Route path="/desarrollador/inventario" element={<AdvisorRoute Page={DesarrolladorInventario} />} />
      <Route path="/desarrollador/desarrollos/:slug/legajo" element={<AdvisorRoute Page={DesarrolladorLegajo} />} />
      <Route path="/desarrollador/demanda" element={<AdvisorRoute Page={DesarrolladorDemanda} />} />
      <Route path="/desarrollador/reportes" element={<AdvisorRoute Page={DesarrolladorReportes} />} />
      <Route path="/desarrollador/pricing" element={<AdvisorRoute Page={DesarrolladorPricing} />} />
      <Route path="/desarrollador/competidores" element={<AdvisorRoute Page={DesarrolladorCompetidores} />} />

      {/* Superadmin — IE Engine Phase A */}
      <Route path="/superadmin" element={<AdvisorRoute Page={SuperadminDashboard} />} />
      <Route path="/superadmin/data-sources" element={<AdvisorRoute Page={DataSourcesPage} />} />
      <Route path="/superadmin/data-sources/:id" element={<AdvisorRoute Page={DataSourceDetailPage} />} />
      <Route path="/superadmin/scores" element={<AdvisorRoute Page={ScoresPage} />} />
      <Route path="/superadmin/documents" element={<AdvisorRoute Page={DocumentsPage} />} />
      <Route path="/superadmin/drive" element={<AdvisorRoute Page={SuperadminDrivePage} />} />
      <Route path="/superadmin/observability" element={<AdvisorRoute Page={SuperadminObservabilityPage} />} />
      <Route path="/superadmin/audit-log" element={<AdvisorRoute Page={AuditLogPage} />} />

      <Route path="*" element={<LandingPage />} />
    </Routes>
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
      <AuthProvider>
        <CustomCursor />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
