/**
 * Batch 21 Sub-A — TourCompletionAnalytics
 * 4 role cards + KPI strip + filter chips + empty state
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getTourCompletion } from '../../api/metrics';
import { SmartEmptyState } from '../shared/SmartEmptyState';
import { Building2, User, Briefcase, Heart, TrendingUp, TrendingDown } from 'lucide-react';

const PERIODS = [
  { key: '7d',  label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'all', label: 'Todo' },
];

const ROLE_META = {
  developer_admin:   { label: 'Desarrollador',  Icon: Building2,   color: '#818cf8' },
  advisor:           { label: 'Asesor',          Icon: User,        color: '#34d399' },
  inmobiliaria_admin:{ label: 'Inmobiliaria',    Icon: Briefcase,   color: '#fbbf24' },
  buyer:             { label: 'Comprador',       Icon: Heart,       color: '#f472b6' },
};

const TOUR_LABELS = {
  dev_first_login:          'Primer login dev',
  asesor_first_login:       'Primer login asesor',
  inmobiliaria_first_login: 'Primer login inmo',
  comprador_first_login:    'Primer login comprador',
  dev_post_first_project:   'Post primer proyecto',
};

function FunnelBar({ started, completed, color }) {
  const pct = started > 0 ? Math.round(completed / started * 100) : 0;
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 9999, background: 'rgba(240,235,224,0.08)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${pct}%`, borderRadius: 9999,
        background: color, transition: 'width 0.5s ease',
        minWidth: pct > 0 ? 4 : 0,
      }} />
    </div>
  );
}

function RoleCard({ role, data }) {
  const meta = ROLE_META[role] || { label: role, Icon: User, color: '#6366F1' };
  const { Icon, color, label } = meta;
  const tours = data?.by_tour || {};
  const rate = data?.completion_rate_pct ?? 0;
  const started = data?.tours_started ?? 0;
  const completed = data?.tours_completed ?? 0;
  const dismissed = data?.tours_dismissed ?? 0;

  return (
    <div
      data-testid={`tour-card-${role}`}
      style={{
        background: 'rgba(240,235,224,0.03)',
        border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 14, padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9999,
            background: `${color}18`, border: `1px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={15} color={color} />
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            {label}
          </div>
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textAlign: 'right' }}>
          {data?.users_total ?? 0} usuario{data?.users_total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Big number */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, color: color, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {rate}
        </div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream-2)' }}>%</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 4 }}>
          completion
        </div>
      </div>

      {/* Mini funnel */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', marginBottom: 5 }}>
          <span data-testid={`funnel-started-${role}`}>{started} iniciados</span>
          <span data-testid={`funnel-completed-${role}`}>{completed} completados · {dismissed} skip</span>
        </div>
        <FunnelBar started={started} completed={completed} color={color} />
      </div>

      {/* Per-tour breakdown */}
      {Object.entries(tours).some(([, v]) => v.started > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', marginBottom: 2 }}>
            Por tour
          </div>
          {Object.entries(tours).filter(([, v]) => v.started > 0).map(([tourId, v]) => (
            <div key={tourId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {TOUR_LABELS[tourId] || tourId}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', flexShrink: 0, width: 60, textAlign: 'right' }}>
                {v.completed}/{v.started}
              </div>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 10,
                color: v.rate_pct >= 70 ? '#86efac' : v.rate_pct >= 40 ? '#fcd34d' : '#f87171',
                flexShrink: 0, width: 44, textAlign: 'right', fontWeight: 700,
              }}>
                {v.rate_pct}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TourCompletionAnalytics() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback((p) => {
    setLoading(true);
    setError(null);
    getTourCompletion(p)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message || 'Error cargando métricas'); setLoading(false); });
  }, []);

  useEffect(() => { fetchData(period); }, [period, fetchData]);

  // KPI calculations
  const byRole = data?.by_role || {};
  const roles = Object.keys(ROLE_META);
  const allRates = roles.map(r => byRole[r]?.completion_rate_pct ?? 0).filter(r => r > 0);
  const globalRate = allRates.length > 0
    ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length * 10) / 10
    : 0;
  const worstRoles = [...roles]
    .filter(r => (byRole[r]?.users_total ?? 0) > 0)
    .sort((a, b) => (byRole[a]?.completion_rate_pct ?? 0) - (byRole[b]?.completion_rate_pct ?? 0))
    .slice(0, 2);
  const mostDismissed = [...roles]
    .filter(r => (byRole[r]?.tours_started ?? 0) > 0)
    .sort((a, b) => (byRole[b]?.dismiss_rate_pct ?? 0) - (byRole[a]?.dismiss_rate_pct ?? 0))
    .slice(0, 2);

  const hasAnyData = roles.some(r => (byRole[r]?.users_total ?? 0) > 0);

  return (
    <div data-testid="tour-completion-analytics">

      {/* Filter chips (B17 pattern) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            data-testid={`period-chip-${p.key}`}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: '5px 14px', borderRadius: 9999,
              background: period === p.key ? 'rgba(99,102,241,0.18)' : 'rgba(240,235,224,0.05)',
              border: `1px solid ${period === p.key ? 'rgba(99,102,241,0.45)' : 'rgba(240,235,224,0.12)'}`,
              color: period === p.key ? 'var(--cream)' : 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando métricas…
        </div>
      )}

      {error && (
        <div style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && !hasAnyData && (
        <SmartEmptyState contextKey="tour_analytics_empty" compact />
      )}

      {!loading && !error && hasAnyData && (
        <>
          {/* KPIs strip */}
          <div
            data-testid="tour-kpis-strip"
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12, marginBottom: 24,
            }}
          >
            <div data-testid="kpi-global-rate" style={{
              padding: '14px 16px',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Completion global
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {globalRate}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans', marginTop: 3 }}>
                promedio entre roles activos
              </div>
            </div>

            <div data-testid="kpi-worst-roles" style={{
              padding: '14px 16px',
              background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Menor adopción
              </div>
              {worstRoles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Sin datos</div>
              ) : worstRoles.map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <TrendingDown size={12} color="#f87171" />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                    {ROLE_META[r]?.label || r}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#f87171', fontWeight: 700, marginLeft: 'auto' }}>
                    {byRole[r]?.completion_rate_pct ?? 0}%
                  </span>
                </div>
              ))}
            </div>

            <div data-testid="kpi-most-dismissed" style={{
              padding: '14px 16px',
              background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Más dismiss
              </div>
              {mostDismissed.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Sin datos</div>
              ) : mostDismissed.map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <TrendingUp size={12} color="#fbbf24" />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                    {ROLE_META[r]?.label || r}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#fbbf24', fontWeight: 700, marginLeft: 'auto' }}>
                    {byRole[r]?.dismiss_rate_pct ?? 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4 role cards — 2×2 grid desktop, stacked mobile */}
          <div
            data-testid="tour-role-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {roles.map(role => (
              <RoleCard key={role} role={role} data={byRole[role]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
