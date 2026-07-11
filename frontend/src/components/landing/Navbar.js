// Navbar — fixed top, 60px, glassmorphism, blur on scroll, with ES/EN toggle.
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Globe, ChevronDown } from '../icons';
import NotificationBellIcon from '../notifications/NotificationBellIcon';
import { Z } from '../../styles/zIndex';
import { TOOLS_FLAT } from '../../lib/toolsCatalog';

const LNG_KEY = 'dmx_lng';
const PRIVATE_BETA_MODE = (process.env.REACT_APP_PRIVATE_BETA_MODE || '').toLowerCase() === 'true';

export default function Navbar({ onLogin, user, onLogout }) {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [lng, setLng] = useState(i18n.language || 'es');

  const NAV_LINKS = [
    { key: 'colonias', label: t('nav.colonias'), href: '/barrios' },
    { key: 'propiedades', label: t('nav.propiedades'), href: '/marketplace' },
    { key: 'inteligencia', label: t('nav.inteligencia'), href: '/inteligencia' },
    { key: 'asesores', label: t('nav.asesores'), href: '/asesores' },
  ];

  // Herramientas — del catálogo ÚNICO (lib/toolsCatalog), mismo contenido que PublicNav/ToolNav.
  // Antes esta lista vivía aparte y le faltaban las 5 nuevas (Picks/Ideas/Screener/Índice/Datos) en 18 páginas.
  const TOOLS_LINKS = TOOLS_FLAT.map((tl) => ({ key: tl.to, label: tl.label, href: tl.to }));

  // Restore language from localStorage on first mount (B7)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LNG_KEY);
      if (stored && stored !== i18n.language) {
        i18n.changeLanguage(stored);
        setLng(stored);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleLng = () => {
    const next = lng === 'es' ? 'en' : 'es';
    i18n.changeLanguage(next);
    try { localStorage.setItem(LNG_KEY, next); } catch { /* ignore */ }
    setLng(next);
  };

  const LngToggle = ({ fullWidth = false }) => (
    <button
      data-testid="nav-lng-toggle"
      onClick={toggleLng}
      aria-label={lng === 'es' ? 'Switch to English' : 'Cambiar a español'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: fullWidth ? '10px 16px' : '5px 11px',
        width: fullWidth ? '100%' : 'auto',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 9999,
        color: 'var(--cream-2)',
        fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'color 0.2s, border-color 0.2s, background 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--cream)'; e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.45)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--cream-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <Globe size={12} />
      <span>{lng === 'es' ? 'ES' : 'EN'}</span>
      <span style={{ color: 'var(--cream-3)', fontSize: 10 }}>·</span>
      <span style={{ color: 'var(--cream-3)', fontWeight: 500 }}>{lng === 'es' ? 'EN' : 'ES'}</span>
    </button>
  );

  return (
    <>
      <nav
        data-testid="navbar"
        role="navigation"
        aria-label="Navegación principal"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 60,
          zIndex: Z.DROPDOWN,
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          background: scrolled ? 'rgba(6,8,15,0.92)' : 'rgba(6,8,15,0.75)',
          backdropFilter: scrolled ? 'blur(40px)' : 'blur(24px)',
          WebkitBackdropFilter: scrolled ? 'blur(40px)' : 'blur(24px)',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'background 0.3s, backdrop-filter 0.3s',
        }}
      >
        <a href="/" data-testid="nav-logo" aria-label="DesarrollosMX — ir al inicio" style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 48, textDecoration: 'none' }}>
          <div style={{
            width: 28, height: 28,
            background: 'var(--grad)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={14} color="#fff" aria-hidden="true" />
          </div>
          <span style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
            color: 'var(--cream)', letterSpacing: '-0.02em',
          }}>
            DesarrollosMX
          </span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }} className="hidden-mobile">
          {NAV_LINKS.map(link => (
            <a
              key={link.key}
              href={link.href}
              data-testid={`nav-link-${link.key}`}
              style={{
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13.5,
                color: 'var(--cream-3)',
                padding: '4px 12px',
                borderRadius: 9999,
                transition: 'color 0.2s, background 0.2s',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { e.target.style.color = 'var(--cream)'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.target.style.color = 'var(--cream-3)'; e.target.style.background = 'transparent'; }}
            >
              {link.label}
            </a>
          ))}

          {/* Herramientas — dropdown (abre en hover/focus) */}
          <div
            data-testid="nav-tools-dropdown"
            style={{ position: 'relative' }}
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              type="button"
              data-testid="nav-tools-trigger"
              aria-haspopup="true"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(o => !o)}
              onFocus={() => setToolsOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13.5,
                color: toolsOpen ? 'var(--cream)' : 'var(--cream-3)',
                background: toolsOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: 'none',
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                transition: 'color 0.2s, background 0.2s',
              }}
            >
              {t('nav.herramientas')}
              <ChevronDown
                size={13}
                style={{ transform: toolsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>

            {toolsOpen && (
              <div
                data-testid="nav-tools-menu"
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  minWidth: 240,
                  background: 'rgba(10,13,22,0.98)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 8,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                {TOOLS_LINKS.map(tool => (
                  <a
                    key={tool.key}
                    href={tool.href}
                    role="menuitem"
                    data-testid={`nav-tool-${tool.key}`}
                    style={{
                      fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13.5,
                      color: 'var(--cream-2)',
                      padding: '9px 12px',
                      borderRadius: 9,
                      textDecoration: 'none',
                      transition: 'color 0.2s, background 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--cream)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--cream-2)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    {tool.label}
                  </a>
                ))}
                <a href="/herramientas" role="menuitem" data-testid="nav-tool-todas" style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--theme)', padding: '9px 12px', borderRadius: 9, textDecoration: 'none' }}>Ver todas las herramientas →</a>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="hidden-mobile">
          <LngToggle />
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NotificationBellIcon />
              <span style={{ fontSize: 13, color: 'var(--cream-2)', fontFamily: 'DM Sans' }}>
                {user.name?.split(' ')[0]}
              </span>
              <button className="btn btn-glass btn-sm" onClick={onLogout} data-testid="nav-logout-btn">
                {t('nav.logout')}
              </button>
            </div>
          ) : PRIVATE_BETA_MODE ? (
            <a
              href="/broker-portal"
              data-testid="nav-broker-access"
              className="btn btn-ghost btn-sm"
              style={{ textDecoration: 'none' }}
            >
              Broker access
            </a>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onLogin} data-testid="nav-login-btn">
                {t('nav.login')}
              </button>
              <a href="/mapa" className="btn btn-primary btn-sm" data-testid="nav-cta-btn" style={{ textDecoration: 'none' }}>
                <MapPin size={12} aria-hidden="true" />
                {t('nav.explore')}
              </a>
            </>
          )}
        </div>

        <button
          data-testid="nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="show-mobile"
          aria-label={mobileOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-sheet"
          style={{
            marginLeft: 'auto',
            background: 'none', border: 'none',
            color: 'var(--cream)', cursor: 'pointer',
            padding: 8,
          }}
        >
          <div aria-hidden="true" style={{ width: 20, height: 2, background: 'var(--cream)', marginBottom: 5 }} />
          <div aria-hidden="true" style={{ width: 20, height: 2, background: 'var(--cream)', marginBottom: 5 }} />
          <div aria-hidden="true" style={{ width: 20, height: 2, background: 'var(--cream)' }} />
        </button>
      </nav>

      {mobileOpen && (
        <div
          id="mobile-nav-sheet"
          data-testid="nav-mobile-sheet"
          style={{
            position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
            background: 'rgba(6,8,15,0.97)',
            backdropFilter: 'blur(24px)',
            display: 'flex', flexDirection: 'column',
            padding: '80px 32px 40px',
          }}
          onClick={() => setMobileOpen(false)}
        >
          {NAV_LINKS.map(link => (
            <a key={link.key} href={link.href}
              style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 28,
                color: 'var(--cream)', padding: '14px 0',
                borderBottom: '1px solid var(--border)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ))}

          {/* Herramientas — sección móvil */}
          <div
            data-testid="nav-tools-mobile"
            style={{
              marginTop: 8, paddingTop: 18,
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}
          >
            {t('nav.herramientas')}
          </div>
          {TOOLS_LINKS.map(tool => (
            <a key={tool.key} href={tool.href}
              data-testid={`nav-tool-mobile-${tool.key}`}
              style={{
                fontFamily: 'Outfit', fontWeight: 600, fontSize: 20,
                color: 'var(--cream-2)', padding: '11px 0',
                borderBottom: '1px solid var(--border)',
                textDecoration: 'none',
              }}
            >
              {tool.label}
            </a>
          ))}
          <a href="/herramientas" data-testid="nav-tool-mobile-todas" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--theme)', padding: '11px 0', textDecoration: 'none' }}>Ver todas las herramientas →</a>

          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LngToggle fullWidth />
            {user ? (
              <button className="btn btn-glass" onClick={onLogout} style={{ width: '100%' }}>{t('nav.logout')}</button>
            ) : PRIVATE_BETA_MODE ? (
              <a href="/broker-portal" className="btn btn-ghost" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
                Broker access
              </a>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={onLogin} style={{ width: '100%' }}>{t('nav.login')}</button>
                <a href="/mapa" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
                  <MapPin size={14} />{t('nav.explore')}
                </a>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </>
  );
}
