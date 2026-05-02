// InmobiliariaDashboard — Dashboard para portal inmobiliaria
import React, { useState, useEffect } from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import { getInmobiliariaDashboard } from '../../api/developer';
import { BarChart, Users, CheckCircle, Clock, TrendUp } from '../../components/icons';

function StatCard({ label, value, icon: Icon, testid }) {
  return (
    <div data-testid={testid} style={{
      padding: '18px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color="#818CF8" />
        </div>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{value ?? '—'}</div>
    </div>
  );
}

const PERIODS = [
  { k: '7d', label: '7 días' },
  { k: '30d', label: '30 días' },
  { k: '90d', label: '90 días' },
  { k: 'all_time', label: 'Todo' },
];

export default function InmobiliariaDashboard({ user, onLogout }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getInmobiliariaDashboard(period, 'dmx_root')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const stats = data?.stats || {};

  return (
    <InmobiliariaLayout user={user} onLogout={onLogout}>
      <div data-testid="inmobiliaria-dashboard" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Dashboard Inmobiliaria</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>DesarrollosMX · Portal Principal</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map(p => (
              <button key={p.k} onClick={() => setPeriod(p.k)} data-testid={`period-${p.k}`}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: `1px solid ${period === p.k ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                  background: period === p.k ? 'rgba(99,102,241,0.14)' : 'transparent',
                  color: period === p.k ? '#818CF8' : 'var(--cream-3)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando estadísticas...</div>
        ) : (
          <>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
              <StatCard label="Total Leads" value={stats.total_leads} icon={Users} testid="inm-stat-total-leads" />
              <StatCard label="Leads Activos" value={stats.active_leads} icon={TrendUp} testid="inm-stat-active-leads" />
              <StatCard label="Ganados" value={stats.won} icon={CheckCircle} testid="inm-stat-won" />
              <StatCard label="Win Rate" value={stats.win_rate_pct != null ? `${stats.win_rate_pct}%` : '—'} icon={BarChart} testid="inm-stat-win-rate" />
              <StatCard label="Días prom. cierre" value={stats.avg_time_to_close_days} icon={Clock} testid="inm-stat-avg-close" />
            </div>

            {/* Top asesores */}
            {data?.top_asesores?.length > 0 && (
              <div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '-0.01em' }}>Top Asesores</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.top_asesores.map((a, i) => (
                    <div key={a.id || a.email} data-testid={`top-asesor-${i}`}
                      style={{ padding: '13px 18px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: '#818CF8' }}>#{i + 1}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{a.name}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>{a.email}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 18, textAlign: 'right' }}>
                        <div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)' }}>{a.leads}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>leads</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: '#4ADE80' }}>{a.win_rate}%</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>win rate</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </InmobiliariaLayout>
  );
}
