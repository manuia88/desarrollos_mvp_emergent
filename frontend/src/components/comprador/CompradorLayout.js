/**
 * CompradorLayout — Phase 4 Batch 28 + Batch 29
 * Layout para el portal /comprador con sidebar navigation.
 * Si el usuario no está autenticado, redirige a /login-comprador.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { logoutComprador } from '../../api/comprador';
import { Home, Search, Heart, Clock, Shield, Bell, MessageSquare, Award, Brain, Layers } from '../icons';
import { fetchUnreadCount } from '../../api/chat';
import { fetchWrappedList } from '../../api/wrapped';
import { Z } from '../../styles/zIndex';

const NAV_BASE = [
  { to: '/comprador', label: 'Dashboard', icon: Home, end: true },
  { to: '/comprador/radar', label: 'Radar', icon: Layers },
  { to: '/comprador/asistente', label: 'Asistente', icon: Brain },
  { to: '/comprador/saved-searches', label: 'Búsquedas', icon: Search },
  { to: '/comprador/favoritos', label: 'Favoritos', icon: Heart },
  { to: '/comprador/comparar', label: 'Comparar', icon: Layers },
  { to: '/comprador/historial', label: 'Histórico', icon: Clock },
  { to: '/comprador/alertas', label: 'Alertas', icon: Bell },
  { to: '/comprador/chat', label: 'Chat', icon: MessageSquare, badge: 'chat_unread' },
  { to: '/comprador/wrapped', label: 'Tu Wrapped', icon: Award, conditional: 'has_wrapped', badge: 'wrapped_new' },
  { to: '/comprador/privacidad', label: 'Privacidad', icon: Shield },
];

export default function CompradorLayout({ children }) {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [wrappedState, setWrappedState] = useState({ hasWrapped: false, hasNew: false });

  // Poll unread chat count every 30s
  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { unread } = await fetchUnreadCount();
      setChatUnread(unread || 0);
    } catch {
      // silent
    }
  }, [user]);

  // Check wrapped availability (once on mount)
  useEffect(() => {
    if (!user) return;
    fetchWrappedList()
      .then(list => {
        const hasNew = list.some(w => !w.viewed_at);
        setWrappedState({ hasWrapped: list.length > 0, hasNew });
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [loadUnread]);

  // Build NAV with dynamic badge values + conditional items
  const NAV = NAV_BASE.filter(item => {
    if (item.conditional === 'has_wrapped') return wrappedState.hasWrapped;
    return true;
  }).map(item => ({
    ...item,
    badgeCount: item.badge === 'chat_unread' ? chatUnread : 0,
    badgeLabel: item.badge === 'wrapped_new' && wrappedState.hasNew ? 'NUEVO' : null,
  }));

  useEffect(() => {
    if (!loading && !user) navigate('/login-comprador', { replace: true });
  }, [user, loading, navigate]);

  const onLogout = async () => {
    try { await logoutComprador(); } catch {}
    setUser(null);
    navigate('/login-comprador', { replace: true });
  };

  if (loading || !user) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg, #06080F)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)',
      }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #06080F)',
      color: 'var(--cream, #F0EBE0)',
      display: 'flex',
    }}>
      {/* Sidebar desktop */}
      <aside
        data-testid="comprador-sidebar"
        className="cmp-sidebar"
        style={{
          width: 240, padding: '24px 16px',
          background: 'rgba(13,16,23,0.92)',
          border: '1px solid rgba(240,235,224,0.08)',
          borderTop: 'none', borderBottom: 'none',
          backdropFilter: 'blur(24px)',
          position: 'sticky', top: 0,
          height: '100vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
          marginBottom: 6,
        }}>
          DesarrollosMX
        </div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
          color: 'rgba(var(--theme-rgb),0.85)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          marginBottom: 22,
        }}>
          Portal Comprador
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(({ to, label, icon: Icon, end, badgeCount, badgeLabel }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`nav-${label.toLowerCase()}`}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: isActive ? 'rgba(var(--theme-rgb),0.14)' : 'transparent',
                border: isActive ? '1px solid rgba(var(--theme-rgb),0.30)' : '1px solid transparent',
                color: isActive ? 'rgba(165,180,252,1)' : 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: isActive ? 700 : 600,
                textDecoration: 'none',
                transition: 'all 0.15s',
              })}
            >
              <Icon size={14} />
              <span style={{ flex: 1 }}>{label}</span>
              {badgeCount > 0 && (
                <span data-testid={`nav-badge-${label.toLowerCase()}`} style={{
                  minWidth: 16, height: 16, borderRadius: 9999,
                  background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'DM Sans', fontWeight: 800, fontSize: 9, color: '#fff',
                  padding: '0 4px',
                }}>
                  {badgeCount}
                </span>
              )}
              {!badgeCount && badgeLabel && (
                <span data-testid={`nav-badge-label-${label.toLowerCase()}`} style={{
                  padding: '1px 6px', borderRadius: 9999,
                  background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  fontFamily: 'DM Sans', fontWeight: 800, fontSize: 8, color: '#fff',
                  letterSpacing: '0.05em',
                }}>
                  {badgeLabel}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid rgba(240,235,224,0.08)' }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            color: 'rgba(240,235,224,0.4)', marginBottom: 4,
          }}>
            Sesión activa
          </div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
            color: 'var(--cream, #F0EBE0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 10,
          }}>
            {user?.name || user?.email}
          </div>
          <button
            data-testid="comprador-logout"
            onClick={onLogout}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.7)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="cmp-topbar-mobile" style={{
        display: 'none',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: Z.DROPDOWN,
        padding: '12px 18px',
        background: 'rgba(13,16,23,0.95)',
        borderBottom: '1px solid rgba(240,235,224,0.08)',
        justifyContent: 'space-between', alignItems: 'center',
        backdropFilter: 'blur(24px)',
      }}>
        <button
          onClick={() => setMobileOpen(v => !v)}
          data-testid="comprador-mobile-menu"
          aria-label="Menú"
          style={{
            width: 36, height: 36, borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(240,235,224,0.15)',
            color: 'var(--cream, #F0EBE0)', cursor: 'pointer',
            fontSize: 18,
          }}
        >☰</button>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
          letterSpacing: '-0.02em',
        }}>DesarrollosMX</div>
        <button
          onClick={onLogout}
          style={{
            padding: '6px 12px', borderRadius: 9999,
            background: 'transparent',
            border: '1px solid rgba(240,235,224,0.15)',
            color: 'rgba(240,235,224,0.7)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            cursor: 'pointer',
          }}
        >Salir</button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
            background: 'rgba(6,8,15,0.92)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <nav onClick={e => e.stopPropagation()} style={{
            width: '78%', maxWidth: 280, height: '100vh',
            background: 'rgba(13,16,23,0.98)',
            border: '1px solid rgba(240,235,224,0.10)',
            padding: '24px 16px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {NAV.map(({ to, label, icon: Icon, end, badgeCount, badgeLabel }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10,
                  background: isActive ? 'rgba(var(--theme-rgb),0.14)' : 'transparent',
                  border: isActive ? '1px solid rgba(var(--theme-rgb),0.30)' : '1px solid transparent',
                  color: isActive ? 'rgba(165,180,252,1)' : 'rgba(240,235,224,0.7)',
                  fontFamily: 'DM Sans', fontSize: 14, fontWeight: isActive ? 700 : 600,
                  textDecoration: 'none',
                })}
              >
                <Icon size={16} />
                <span style={{ flex: 1 }}>{label}</span>
                {badgeCount > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 9999,
                    background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'DM Sans', fontWeight: 800, fontSize: 9, color: '#fff',
                    padding: '0 4px',
                  }}>
                    {badgeCount}
                  </span>
                )}
                {!badgeCount && badgeLabel && (
                  <span style={{
                    padding: '1px 6px', borderRadius: 9999,
                    background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                    fontFamily: 'DM Sans', fontWeight: 800, fontSize: 8, color: '#fff',
                    letterSpacing: '0.05em',
                  }}>
                    {badgeLabel}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="cmp-main" style={{
        flex: 1, padding: '32px 32px 64px',
        overflowX: 'hidden',
        maxWidth: '100%',
      }}>
        {children}
      </main>

      <style>{`
        @media (max-width: 900px) {
          .cmp-sidebar { display: none !important; }
          .cmp-topbar-mobile { display: flex !important; }
          .cmp-main { padding: 78px 18px 48px !important; }
        }
      `}</style>
    </div>
  );
}
