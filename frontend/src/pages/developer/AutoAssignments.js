/**
 * Phase 4 Batch 15 — /desarrollador/crm/auto-assignments
 * Metrics dashboard: KPIs + distribution chart + table of last 50 assignments.
 */
import React, { useState, useEffect, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Stat, Badge } from '../../components/advisor/primitives';
import { Calendar, Users, TrendUp, Activity, BarChart, Filter } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_BADGE = {
  confirmed:  { tone: 'ok',  label: 'Confirmada' },
  pending:    { tone: 'warn', label: 'Pendiente'  },
  cancelled:  { tone: 'pink', label: 'Cancelada'  },
  completed:  { tone: 'ok',  label: 'Completada'  },
};

const POLICY_LABELS = {
  round_robin: 'Round Robin',
  load_balance: 'Balance carga',
  pre_selected: 'Pre-sel.',
};

function KPIStrip({ kpis, loading }) {
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
      {[1,2,3,4].map(i => <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(240,235,224,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
      <Stat
        label="Citas auto-asignadas 30d"
        value={kpis.auto_assigned_30d ?? '—'}
        icon={<Calendar size={13} />}
      />
      <Stat
        label="% Cita → Visita"
        value={`${kpis.conversion_pct ?? 0}%`}
        icon={<TrendUp size={13} />}
      />
      <Stat
        label="Asesor top performer"
        value={kpis.top_asesor_id ? `${kpis.top_asesor_count} citas` : '—'}
        sub={kpis.top_asesor_id || ''}
        icon={<Users size={13} />}
      />
      <Stat
        label="Confirmadas 30d"
        value={kpis.confirmed_30d ?? '—'}
        icon={<Activity size={13} />}
      />
    </div>
  );
}

function DistributionChart({ data }) {
  if (!data?.length) return null;
  const COLORS = ['#6366f1', '#ec4899', '#22d3ee', '#4ade80', '#fbbf24', '#f87171'];
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <Card style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>DISTRIBUCIÓN POR ASESOR (30d)</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
        {data.map((d, i) => (
          <div key={d.asesor_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: COLORS[i % COLORS.length] }}>{d.count}</span>
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              background: COLORS[i % COLORS.length],
              height: `${Math.round((d.count / maxCount) * 90)}px`,
              opacity: 0.85, transition: 'height 0.3s ease',
            }} />
            <span style={{ fontSize: 9, color: 'rgba(240,235,224,0.4)', textAlign: 'center', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.asesor_id?.slice(0, 10)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AutoAssignments({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ policy_type: '', date_from: '', date_to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filters.policy_type) params.append('policy_type', filters.policy_type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      const res = await fetch(`${API}/api/appointments/metrics?${params}`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch (_) {}
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function formatSlot(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM"
        title="Auto-asignaciones de citas"
        sub="Monitoreo de citas asignadas automáticamente por el motor de disponibilidad."
      />

      <KPIStrip kpis={data?.kpis || {}} loading={loading && !data} />

      {/* Filter bar */}
      <div data-testid="assignment-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <Filter size={12} color="rgba(240,235,224,0.35)" />
        {['round_robin', 'load_balance', 'pre_selected'].map(pt => (
          <button
            key={pt}
            data-testid={`filter-policy-${pt}`}
            onClick={() => setFilters(f => ({ ...f, policy_type: f.policy_type === pt ? '' : pt }))}
            style={{
              padding: '4px 12px', borderRadius: 9999, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${filters.policy_type === pt ? 'rgba(99,102,241,0.5)' : 'rgba(240,235,224,0.12)'}`,
              background: filters.policy_type === pt ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: filters.policy_type === pt ? '#c7d2fe' : 'rgba(240,235,224,0.45)',
            }}
          >
            {POLICY_LABELS[pt]}
          </button>
        ))}
        <input
          type="date"
          value={filters.date_from}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
          style={{ background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream)', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
          style={{ background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream)', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}
        />
      </div>

      {data && <DistributionChart data={data.distribution} />}

      {/* Table */}
      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          ÚLTIMAS {data?.items?.length || 0} ASIGNACIONES
        </div>
        {loading && !data ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(240,235,224,0.3)', fontSize: 13 }}>Cargando…</div>
        ) : (data?.items?.length === 0 || !data?.items) ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(240,235,224,0.3)', fontSize: 13 }}>
            Sin asignaciones aún. Configura una política y activa el booking desde el marketplace.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Lead', 'Asesor', 'Slot', 'Política', 'Estado'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.35)', borderBottom: '1px solid rgba(240,235,224,0.08)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.items || []).map(item => {
                  const st = STATUS_BADGE[item.status] || { tone: 'ok', label: item.status || '—' };
                  return (
                    <tr key={item.id || item.appointment_id} data-testid={`assignment-row-${item.id}`} style={{ borderBottom: '1px solid rgba(240,235,224,0.05)' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif' }}>{item.lead_id?.slice(0, 12) || '—'}</td>
                      <td style={{ padding: '7px 8px', color: 'rgba(240,235,224,0.7)' }}>{item.asesor_id?.slice(0, 14) || '—'}</td>
                      <td style={{ padding: '7px 8px', color: 'rgba(240,235,224,0.7)', whiteSpace: 'nowrap' }}>{formatSlot(item.datetime)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ fontSize: 10, color: 'rgba(199,210,254,0.7)' }}>{POLICY_LABELS[item.policy_used] || item.policy_used || '—'}</span>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Badge tone={st.tone} style={{ fontSize: 9 }}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DeveloperLayout>
  );
}
