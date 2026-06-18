import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import { tc } from '../../lib/titleCase';

/**
 * DMX UI · PublicNav — navbar público (estilo loft/quintoandar). Conecta TODAS las áreas y los
 * accesos a los 4 portales: comprar (marketplace), barrios/inteligencia, asesores, desarrolladores,
 * herramientas (dropdown de las públicas) + Entrar. Sticky, fondo claro, con sombra al hacer scroll.
 */
const TOOLS = [
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

const LINKS = [
  { label: 'Comprar', to: '/marketplace' },
  { label: 'Colonias', to: '/colonias' },
  { label: 'Asesores', to: '/asesores' },
  { label: 'Desarrolladores', to: '/desarrolladores' },
];

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [tools, setTools] = useState(false);
  const [favCount, setFavCount] = useState(0);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    const read = () => { try { setFavCount(JSON.parse(localStorage.getItem('dmx.favorites') || '[]').length); } catch { setFavCount(0); } };
    read();
    const onFav = (e) => setFavCount(e?.detail?.count ?? 0);
    window.addEventListener('dmx:favorites', onFav);
    window.addEventListener('focus', read);
    return () => { window.removeEventListener('dmx:favorites', onFav); window.removeEventListener('focus', read); };
  }, []);

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? 'rgba(255,255,255,0.82)' : 'transparent',
      backdropFilter: scrolled ? 'blur(14px)' : 'none', WebkitBackdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
      transition: 'background .2s ease, border-color .2s ease',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/" style={{ textDecoration: 'none', marginRight: 14 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: -0.3, color: 'var(--cream)' }}>
            Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {LINKS.map((l) => <NavLink key={l.to} {...l} />)}
          {/* Herramientas dropdown */}
          <div style={{ position: 'relative' }} onMouseEnter={() => setTools(true)} onMouseLeave={() => setTools(false)}>
            <button style={navBtnStyle} onClick={() => setTools((v) => !v)}>{tc('Herramientas')} ▾</button>
            {tools && (
              <div className="dmx-card" style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 248, padding: 7,
                background: 'var(--bg-2)', boxShadow: 'var(--sh-card)', borderRadius: 'var(--r-inner)',
              }}>
                {TOOLS.map((tl) => (
                  <Link key={tl.to} to={tl.to} style={{
                    display: 'block', padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
                    color: 'var(--cream-2)', fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.08)'; e.currentTarget.style.color = 'var(--theme)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--cream-2)'; }}>
                    {tc(tl.label)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <span style={{ fontSize: 12.5, color: 'var(--cream-3)', fontWeight: 600 }}>ES · EN</span>
        <Link to="/favoritos" title="Mis favoritos" data-testid="nav-favoritos"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5 }}>
          <span style={{ fontSize: 15, color: 'var(--theme)' }}>♥</span> {tc('Favoritos')}
          {favCount > 0 && (
            <span data-testid="nav-fav-count" style={{ background: 'var(--theme)', color: '#fff', borderRadius: 9999, padding: '1px 7px', fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, minWidth: 18, textAlign: 'center' }}>{favCount}</span>
          )}
        </Link>
        <Link to="/login" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">Entrar</Button></Link>
        <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="sm">Abrir mapa</Button></Link>
      </div>
    </div>
  );
}

function NavLink({ label, to }) {
  return (
    <Link to={to} style={navBtnStyle}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme)'; e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.07)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--cream-2)'; e.currentTarget.style.background = 'transparent'; }}>
      {tc(label)}
    </Link>
  );
}

const navBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 13px', borderRadius: 'var(--r-pill)',
  fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--cream-2)',
  background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'none',
  transition: 'color .14s ease, background .14s ease',
};
