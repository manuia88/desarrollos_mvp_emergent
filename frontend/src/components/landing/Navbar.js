// Navbar — fixed top, 60px, glassmorphism, blur on scroll
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '../icons';

export default function Navbar({ onLogin, user, onLogout }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV_LINKS = [
    { key: 'colonias', label: t('nav.colonias'), href: '#barrios' },
    { key: 'propiedades', label: t('nav.propiedades'), href: '#propiedades' },
    { key: 'inteligencia', label: t('nav.inteligencia'), href: '#inteligencia' },
    { key: 'asesores', label: t('nav.asesores'), href: '#faq' },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <nav
        data-testid="navbar"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 60,
          zIndex: 100,
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
        <a href="/" data-testid="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 48, textDecoration: 'none' }}>
          <div style={{
            width: 28, height: 28,
            background: 'var(--grad)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={14} color="#fff" />
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="hidden-mobile">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--cream-2)', fontFamily: 'DM Sans' }}>
                {user.name?.split(' ')[0]}
              </span>
              <button className="btn btn-glass btn-sm" onClick={onLogout} data-testid="nav-logout-btn">
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onLogin} data-testid="nav-login-btn">
                {t('nav.login')}
              </button>
              <button className="btn btn-primary btn-sm" data-testid="nav-cta-btn">
                <MapPin size={12} />
                {t('nav.explore')}
              </button>
            </>
          )}
        </div>

        <button
          data-testid="nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="show-mobile"
          style={{
            marginLeft: 'auto',
            background: 'none', border: 'none',
            color: 'var(--cream)', cursor: 'pointer',
            padding: 8,
          }}
        >
          <div style={{ width: 20, height: 2, background: 'var(--cream)', marginBottom: 5 }} />
          <div style={{ width: 20, height: 2, background: 'var(--cream)', marginBottom: 5 }} />
          <div style={{ width: 20, height: 2, background: 'var(--cream)' }} />
        </button>
      </nav>

      {mobileOpen && (
        <div
          data-testid="nav-mobile-sheet"
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
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
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {user ? (
              <button className="btn btn-glass" onClick={onLogout} style={{ width: '100%' }}>{t('nav.logout')}</button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={onLogin} style={{ width: '100%' }}>{t('nav.login')}</button>
                <button className="btn btn-primary" style={{ width: '100%' }}>
                  <MapPin size={14} />{t('nav.explore')}
                </button>
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
