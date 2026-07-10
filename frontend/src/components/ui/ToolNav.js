import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tc } from '../../lib/titleCase';

/**
 * ToolNav — navbar CLARO unificado para las páginas de herramientas (mapa, simulador, tax-projector,
 * comparador, probabilidad, valores). Reemplaza los headers ad-hoc que cada tab traía (unos sin nav,
 * otros con "Herramientas" como LINK que navegaba en vez de desplegar el menú → bug del founder).
 *
 * Texto oscuro sobre blanco (NO usa var(--cream), que es para fondos oscuros). Sticky, sombra al scroll.
 * Herramientas = dropdown REAL (botón que togglea + puente de hover), nunca navega.
 */
const LINKS = [
  { label: 'Comprar', to: '/marketplace' },
  { label: 'Colonias', to: '/colonias' },
  { label: 'Asesores', to: '/asesores' },
  { label: 'Desarrolladores', to: '/desarrolladores' },
];

const TOOLS = [
  { label: 'DMX Picks IA', to: '/picks' },
  { label: 'Screener inmobiliario', to: '/screener' },
  { label: 'El Índice DMX', to: '/indice' },
  { label: 'Datos por API (B2B)', to: '/datos' },
  { label: 'Mapa de Valores', to: '/mapa-valores' },
  { label: 'Simulador de inversión', to: '/simulador' },
  { label: 'Proyector de impuestos', to: '/tools/tax-projector' },
  { label: 'Comparador de colonias', to: '/portal/comparador' },
  { label: 'Probabilidades', to: '/portal/probability' },
  { label: 'Vibra de la zona', to: '/portal/vibe' },
  { label: 'Valores catastrales', to: '/valores' },
  { label: 'Confianza / verificación', to: '/confianza' },
  { label: 'Sala de prensa', to: '/prensa' },
];

const linkStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 13px', borderRadius: 9999,
  fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: '#5A5F6E',
  background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'none',
  transition: 'color .14s ease, background .14s ease',
};

export default function ToolNav() {
  const [scrolled, setScrolled] = useState(false);
  const [tools, setTools] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 860);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    const onR = () => setIsMobile(window.innerWidth <= 860);
    onR(); window.addEventListener('resize', onR);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', onR); };
  }, []);

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${scrolled ? '#E7E8EE' : 'rgba(231,232,238,0.6)'}`,
      boxShadow: scrolled ? '0 6px 24px rgba(16,24,40,0.06)' : 'none',
      transition: 'box-shadow .2s ease, border-color .2s ease',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '11px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ textDecoration: 'none', marginRight: 10 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: '#1E2230' }}>
            Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
          </span>
        </Link>

        {!isMobile && (<>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} style={linkStyle}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme)'; e.currentTarget.style.background = 'rgba(124,92,255,0.07)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5A5F6E'; e.currentTarget.style.background = 'transparent'; }}>
                {tc(l.label)}
              </Link>
            ))}
            {/* Herramientas: DROPDOWN real por CLICK (nunca navega) + backdrop para cerrar al hacer click fuera. */}
            <div style={{ position: 'relative' }}>
              <button style={{ ...linkStyle, color: tools ? 'var(--theme)' : '#5A5F6E' }} onClick={() => setTools((v) => !v)} data-testid="toolnav-herramientas"
                aria-haspopup="menu" aria-expanded={tools} aria-controls="toolnav-menu">
                {tc('Herramientas')} <span style={{ fontSize: 10, transform: tools ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
              </button>
              {tools && (<>
                <div onClick={() => setTools(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
                <div id="toolnav-menu" data-testid="toolnav-menu" role="menu" style={{ position: 'absolute', top: '100%', left: 0, paddingTop: 6, minWidth: 256, zIndex: 60 }}>
                  <div style={{ padding: 7, background: '#fff', border: '1px solid #ECECEF', boxShadow: '0 16px 44px rgba(16,24,40,0.16)', borderRadius: 14 }}>
                    {TOOLS.map((tl) => (
                      <Link key={tl.to} to={tl.to} onClick={() => setTools(false)} style={{
                        display: 'block', padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
                        color: '#5A5F6E', fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,92,255,0.08)'; e.currentTarget.style.color = 'var(--theme)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5A5F6E'; }}>
                        {tc(tl.label)}
                      </Link>
                    ))}
                  </div>
                </div>
              </>)}
            </div>
          </nav>

          <Link to="/favoritos" title="Mis favoritos" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, color: '#5A5F6E', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, marginRight: 4 }}>
            <span style={{ fontSize: 15, color: 'var(--theme)' }}>♥</span> {tc('Favoritos')}
          </Link>
          <Link to="/login" style={{ textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: '#1E2230', padding: '8px 16px', border: '1px solid #E2E3E9', borderRadius: 10 }}>{tc('Entrar')}</Link>
        </>)}

        {isMobile && (
          <button onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="toolnav-mobile-menu" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, border: '1px solid #E2E3E9', background: '#fff', color: '#1E2230', fontSize: 20, cursor: 'pointer' }}>{menuOpen ? '✕' : '☰'}</button>
        )}
      </div>

      {isMobile && menuOpen && (
        <div id="toolnav-mobile-menu" style={{ borderTop: '1px solid #ECECEF', background: '#fff', padding: '10px 20px 18px', boxShadow: '0 12px 30px rgba(16,24,40,0.10)' }}>
          {LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '11px 0', textDecoration: 'none', color: '#1E2230', fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, borderBottom: '1px solid #F1F2F6' }}>{tc(l.label)}</Link>)}
          <div style={{ color: '#9AA0AE', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '14px 0 4px' }}>Herramientas</div>
          {TOOLS.map((tl) => <Link key={tl.to} to={tl.to} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '8px 0', textDecoration: 'none', color: '#5A5F6E', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 600 }}>{tc(tl.label)}</Link>)}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
            <Link to="/favoritos" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none', color: '#5A5F6E', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14 }}>♥ Favoritos</Link>
            <Link to="/login" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none', marginLeft: 'auto', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: '#1E2230', padding: '8px 16px', border: '1px solid #E2E3E9', borderRadius: 10 }}>Entrar</Link>
          </div>
        </div>
      )}
    </div>
  );
}
