// SuperadminLayout — backward-compat wrapper around PortalLayout.
import React, { useEffect } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { PortalLayout } from '../shared/PortalLayout';
import { useAuth } from '../../App';

const ROLES_OK = new Set(['superadmin']);

// Section keys must match tier.section_key in navByRole.js SUPERADMIN_NAV
// AND .portal-superadmin[data-section="..."] rules in superadmin-aurora.css.
// FASE C: el color de cada ruta sigue su DOMINIO nuevo (reusa los 7 section_key de color Aurora,
// mapeados a los 6 dominios del catálogo). El resaltado del item activo lo da NavLink por `to`;
// esto solo pinta el tema del dominio.
function sectionFromPath(p) {
  if (p === '/superadmin' || p.startsWith('/superadmin/catalogo')) return 'principal';
  if (p.startsWith('/superadmin/productos')) return 'productos';   // 📦
  // 🏙️ MERCADO
  if (/^\/superadmin\/(mercado|metrics-cube|terminal-zona|live-pulse|terminal-mercado|transactions|intelligence-hub|cerebro-mercado|trends)/.test(p)) return 'mercado';
  // 👤 DEMANDA Y PERSONAS
  if (/^\/superadmin\/(inteligencia|ia-conversacional|rag-inspector|conversation-cost|granularidad|demanda-mercado|gemelo-demanda|grafo-comprador|inmobiliaria-leads|conversations|copilot|kb-gaps|ab-testing|conversation-drift|reviews-residents|virtual-staging|climate-migration|investment-explorer)/.test(p)) return 'demanda';
  // 🏗️ INVENTARIO Y DEVS
  if (/^\/superadmin\/(desarrollos|alta|datos|bulk-ingest|data-sources|recipes-coverage|drive|documents|data-lake|gov-data-mx|catalog-pulse|modelo|aprendizaje|scores|drpi|indices|risk-score|fsd-accuracy|avm-accuracy|forecast-accuracy|phase5-foundation|construction-quality|calibracion)/.test(p)) return 'inventario';
  // 💰 DINERO E INGRESOS
  if (/^\/superadmin\/(monetizacion|ai-cost|commercial|api-keys|vertical-products|data-licensing|cross-sell-analytics|soc-franchise|marketplace-templates|lead-enrichment|social-ads|video-standalone|tenants)/.test(p)) return 'dinero';
  // ⚙️ OPERACIÓN Y SEGURIDAD (incluye crecimiento/canales + devtools + KG)
  if (/^\/superadmin\/(operacion|entity-resolution|health|observability|phase-y-observability|audit-log|audit-chain|fraud-alerts|fraud-patterns|risk-alerts|compliance|duplicates|feature-visibility|widget-embeds|reputation-monitor|crecimiento|whatsapp|newsletter|bulletins|landing-leads|partners|invites|onboarding-analytics|free-audit-funnel|lead-sources|social-cards|marketing-mcp|knowledge-graph|devtools|primitives-demo|system-map|user-diagnostics)/.test(p)) return 'operacion';
  return 'principal';
}

export default function SuperadminLayout({ user: propUser, onLogout: propOnLogout, children, bare }) {
  const loc = useLocation();
  const ctx = useAuth();
  const user = propUser || ctx.user;
  const onLogout = propOnLogout || ctx.logout;
  const section = sectionFromPath(loc.pathname);

  // Sync body class + data-attribute so cursor custom (position:fixed at body
  // root) can pick up the section --theme. Cleaned up on unmount.
  useEffect(() => {
    // en modo bare (página embebida como pestaña de un Hub) NO tocamos body: el layout OUTER
    // del hub ya lo maneja. Evita la carrera cleanup/setup al cambiar de pestaña.
    if (bare) return undefined;
    document.body.classList.add('superadmin-active');
    document.body.setAttribute('data-superadmin-section', section);
    return () => {
      document.body.classList.remove('superadmin-active');
      document.body.removeAttribute('data-superadmin-section');
    };
  }, [section, bare]);

  if (!user) return <Navigate to={`/?login=1&next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!ROLES_OK.has(user.role)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div className="eyebrow">403</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '8px 0 14px' }}>
            Acceso restringido al panel superadmin
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 18 }}>
            Tu rol actual es <strong>{user.role}</strong>. Solo el equipo de operaciones DMX puede acceder.
          </p>
          <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>Volver al inicio</Link>
        </div>
      </div>
    );
  }

  // bare = renderiza SOLO el contenido (sin sidebar/chrome) — para embeber la página como
  // pestaña dentro de un Hub (metodología Hub de Mercado: el hub pone el layout una vez).
  if (bare) return <>{children}</>;

  return (
    <div className="portal-superadmin" data-section={section}>
      <PortalLayout role="superadmin" user={user} onLogout={onLogout}>
        <div data-testid="sa-main" style={{ padding: '22px 28px 80px', maxWidth: 1500 }}>
          {children}
        </div>
      </PortalLayout>
    </div>
  );
}
