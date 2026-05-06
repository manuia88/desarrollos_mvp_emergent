/**
 * CompradorDashboard — Phase 4 Batch 28 + Batch 30
 * Hero greeting + perfil completion + 5 widget cards.
 * Batch 30: SmartMatchWidget agregado como 5to widget.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboard } from '../../api/comprador';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import SmartMatchWidget from '../../components/comprador/SmartMatchWidget';
import { Search, Heart, Clock, Bell, ArrowRight } from '../../components/icons';

function fmtMxn(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}k`;
}

function WidgetCard({ icon: Icon, title, count, subtitle, to, children, testId }) {
  return (
    <Link to={to} data-testid={testId} style={{
      display: 'block',
      padding: '20px 22px',
      borderRadius: 16,
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.10)',
      backdropFilter: 'blur(24px)',
      textDecoration: 'none', color: 'inherit',
      transition: 'transform 0.18s, border-color 0.18s',
    }} onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.32)';
    }} onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.borderColor = 'rgba(240,235,224,0.10)';
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9999,
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(99,102,241,0.95)',
        }}>
          <Icon size={16} />
        </div>
        <ArrowRight size={14} style={{ color: 'rgba(240,235,224,0.4)' }} />
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
        color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.03em', lineHeight: 1,
      }}>
        {count}
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        color: 'rgba(240,235,224,0.55)', marginTop: 6,
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11,
          color: 'rgba(240,235,224,0.4)', marginTop: 4,
        }}>{subtitle}</div>
      )}
      {children}
    </Link>
  );
}

export default function CompradorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        if (e.status === 401) navigate('/login-comprador', { replace: true });
        setLoading(false);
      });
  }, [navigate]);

  if (loading) {
    return <CompradorLayout>
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)' }}>
        Cargando dashboard…
      </div>
    </CompradorLayout>;
  }

  if (!data) {
    return <CompradorLayout>
      <div>No se pudo cargar el dashboard.</div>
    </CompradorLayout>;
  }

  const k = data.kpis;
  const completion = data.profile_completion_pct ?? 0;
  const hasNothing = (k.saved_searches.total + k.favorites.total + (k.history.recent?.length || 0)) === 0;

  return (
    <CompradorLayout>
      <div data-testid="comprador-dashboard">
        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 38px)',
            color: 'var(--cream, #F0EBE0)',
            letterSpacing: '-0.025em', margin: 0,
          }}>
            Hola, {data.name}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 14, marginTop: 8,
            color: 'rgba(240,235,224,0.55)',
          }}>
            Esto es lo que pasa con tu búsqueda inmobiliaria hoy.
          </p>
        </div>

        {/* Profile completion */}
        <div data-testid="profile-completion" style={{
          padding: '14px 18px', marginBottom: 26,
          borderRadius: 14,
          background: completion < 80 ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)',
          border: `1px solid ${completion < 80 ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.30)'}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
              color: completion < 80 ? '#F59E0B' : '#22C55E',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              Perfil {completion}% completo
            </div>
            {completion < 80 && (
              <Link to="/comprador/privacidad" style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                padding: '6px 14px', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                color: '#fff', textDecoration: 'none',
              }}>Completa tu perfil</Link>
            )}
          </div>
          <div style={{
            height: 4, borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${completion}%`,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>

        {/* 4 widgets */}
        <div className="cmp-widgets" style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28,
        }}>
          <WidgetCard
            testId="widget-saved-searches"
            icon={Search}
            title="Búsquedas guardadas"
            count={k.saved_searches.total}
            subtitle={k.saved_searches.recent[0] ? 'Última: ' + (k.saved_searches.recent[0].alert_frequency || 'weekly') : 'Aún no guardas búsquedas'}
            to="/comprador/saved-searches"
          />
          <WidgetCard
            testId="widget-alerts"
            icon={Bell}
            title="Alertas recientes"
            count={k.alerts.pending}
            subtitle={k.alerts.pending > 0 ? 'En los últimos 7 días' : 'Sin alertas nuevas'}
            to="/comprador/saved-searches"
          />
          <WidgetCard
            testId="widget-favorites"
            icon={Heart}
            title="Favoritos"
            count={k.favorites.total}
            subtitle={k.favorites.total > 0 ? `${k.favorites.recent.length} recientes` : 'Marca tus desarrollos preferidos'}
            to="/comprador/favoritos"
          >
            {k.favorites.recent?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {k.favorites.recent.slice(0, 3).map((f, i) => (
                  <div key={i} style={{
                    width: 38, height: 38, borderRadius: 9,
                    background: f.thumb?.cover_photo
                      ? `url(${f.thumb.cover_photo}) center/cover`
                      : 'rgba(99,102,241,0.18)',
                    border: '1px solid rgba(240,235,224,0.10)',
                  }} />
                ))}
              </div>
            )}
          </WidgetCard>
          <WidgetCard
            testId="widget-recent"
            icon={Clock}
            title="Vistos recientemente"
            count={k.history.recent?.length || 0}
            subtitle={k.history.recent?.length > 0 ? 'Últimas 5 vistas' : 'Aún no exploras desarrollos'}
            to="/comprador/historial"
          >
            {k.history.recent?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {k.history.recent.slice(0, 5).map((v, i) => (
                  <div key={i} style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: v.thumb?.cover_photo
                      ? `url(${v.thumb.cover_photo}) center/cover`
                      : 'rgba(99,102,241,0.18)',
                    border: '1px solid rgba(240,235,224,0.10)',
                  }} />
                ))}
              </div>
            )}
          </WidgetCard>
        </div>

        {/* 5th widget: Smart Match */}
        <div style={{ marginTop: 18 }}>
          <SmartMatchWidget />
        </div>

        {hasNothing && (
          <div data-testid="empty-state" style={{
            padding: '32px 24px', borderRadius: 14,
            background: 'rgba(99,102,241,0.06)',
            border: '1px dashed rgba(99,102,241,0.30)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
              color: 'var(--cream, #F0EBE0)', marginBottom: 6, letterSpacing: '-0.02em',
            }}>
              Tu primer paso es guardar una búsqueda
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240,235,224,0.55)', marginBottom: 16,
            }}>
              Aplica filtros que te interesen y recibe alertas cuando aparezcan nuevos desarrollos.
            </div>
            <Link to="/marketplace" style={{
              display: 'inline-block',
              padding: '10px 22px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              textDecoration: 'none',
            }}>
              Ir al marketplace
            </Link>
          </div>
        )}

        <style>{`
          @media (max-width: 720px) {
            .cmp-widgets { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </CompradorLayout>
  );
}
