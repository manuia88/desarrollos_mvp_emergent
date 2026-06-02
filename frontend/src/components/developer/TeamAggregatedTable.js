/**
 * Phase 4 Batch 21 · Sub-Chunk C — <TeamAggregatedTable>
 *
 * Per-asesor performance table with sortable columns + click-to-drawer for timeseries.
 *
 * Props:
 *   period: '7d' | '30d' | '90d'
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getTeamAggregated } from '../../api/metrics';
import HealthScoreWidget from '../shared/HealthScoreWidget';
import SmartEmptyState from '../shared/SmartEmptyState';
import { Z } from '../../styles/zIndex';

const fmtMXN = (v) => {
  if (typeof v !== 'number' || !v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};

const fmtNum = (v, dec = 0) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: dec }).format(v ?? 0);

const PERIOD_LABEL = { '7d': '7 días', '30d': '30 días', '90d': '90 días' };

const COLS = [
  { key: 'name',                 label: 'Asesor',          align: 'left' },
  { key: 'pipeline_value_mxn',   label: 'Pipeline',        align: 'right' },
  { key: 'leads_active',         label: 'Activos',         align: 'right' },
  { key: 'conversion_rate_pct',  label: 'Conv %',          align: 'right' },
  { key: 'response_time_hours',  label: 'Resp. (h)',       align: 'right' },
  { key: 'activity_score_7d',    label: 'Actividad',       align: 'right' },
  { key: 'health_score',         label: 'Salud',           align: 'center' },
  { key: 'citas_booked',         label: 'Citas',           align: 'right' },
  { key: 'vs_team_avg_pct',      label: 'Δ vs avg',        align: 'right' },
];

export default function TeamAggregatedTable({ period = '30d' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('pipeline_value_mxn');
  const [sortDir, setSortDir] = useState('desc');
  const [openAsesor, setOpenAsesor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getTeamAggregated(period);
      setData(d);
      setError(null);
    } catch {
      setError('No se pudo cargar la tabla del equipo');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const sortedAsesores = useMemo(() => {
    if (!data?.asesores) return [];
    const rows = [...data.asesores];
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av ?? 0) - (bv ?? 0) : (bv ?? 0) - (av ?? 0);
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return (
      <div data-testid="team-table-loading"
           style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
        Cargando tabla del equipo…
      </div>
    );
  }

  if (error) {
    return <div data-testid="team-table-error" style={{ padding: 16, color: 'var(--red)' }}>{error}</div>;
  }

  if (!data?.asesores?.length) {
    return (
      <SmartEmptyState
        contextKey="activity.none"
        testId="team-table-empty"
        overrides={{
          title: 'Aún no hay asesores en el equipo',
          body: 'Cuando agregues asesores, este panel mostrará pipeline, conversión, citas y mucho más.',
          ctas: [],
        }}
      />
    );
  }

  const ta = data.team_average;

  return (
    <div data-testid="team-aggregated-table"
         style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'DM Sans' }}>

      {/* Team avg KPI strip */}
      <div data-testid="team-avg-strip"
           style={{
             display: 'grid',
             gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
             gap: 10,
           }}>
        <KPI label="Pipeline avg" value={fmtMXN(ta.pipeline_value_mxn)} testId="ta-pipeline" />
        <KPI label="Conv. avg" value={`${fmtNum(ta.conversion_rate_pct, 1)}%`} testId="ta-conv" />
        <KPI label="Respuesta avg" value={`${fmtNum(ta.response_time_hours, 1)}h`} testId="ta-resp" />
        <KPI label="Actividad 7d" value={fmtNum(ta.activity_score_7d, 1)} testId="ta-act" />
        <KPI label="Salud avg" value={fmtNum(ta.health_score_avg, 0)} testId="ta-health" />
        <KPI label="Citas total" value={fmtNum(ta.citas_booked)} testId="ta-citas" />
      </div>

      {/* Sortable table */}
      <div style={{
        borderRadius: 14, border: '1px solid var(--border, rgba(var(--cream-rgb),0.1))',
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr style={{ background: 'rgba(var(--cream-rgb),0.05)' }}>
              {COLS.map(c => (
                <th key={c.key}
                    onClick={() => handleSort(c.key)}
                    data-testid={`ta-th-${c.key}`}
                    style={{
                      padding: '10px 12px', fontSize: 10.5, fontWeight: 600,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--cream-3)', textAlign: c.align,
                      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    }}>
                  {c.label}
                  {sortKey === c.key && (
                    <span style={{ marginLeft: 4, fontSize: 9 }}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAsesores.map(a => (
              <tr key={a.asesor_id}
                  data-testid={`ta-row-${a.asesor_id}`}
                  onClick={() => setOpenAsesor(a)}
                  style={{
                    borderTop: '1px solid rgba(148,163,184,0.08)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.03)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={a.name} url={a.avatar_url} />
                    <span>{a.name}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream)', textAlign: 'right', fontWeight: 600 }}>
                  {fmtMXN(a.pipeline_value_mxn)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                  {fmtNum(a.leads_active)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                  {fmtNum(a.conversion_rate_pct, 1)}%
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                  {fmtNum(a.response_time_hours, 1)}h
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                  {fmtNum(a.activity_score_7d, 0)}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <HealthScoreWidget
                    entity_type="asesor"
                    entity_id={a.asesor_id}
                    size="sm"
                    initialScore={a.health_score}
                  />
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                  {fmtNum(a.citas_booked)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600,
                              color: a.vs_team_avg_pct >= 0 ? '#22c55e' : '#ef4444',
                              textAlign: 'right' }}>
                  {a.vs_team_avg_pct >= 0 ? '+' : ''}{fmtNum(a.vs_team_avg_pct, 1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openAsesor && (
        <AsesorDrawer asesor={openAsesor} period={period}
                       onClose={() => setOpenAsesor(null)} />
      )}
    </div>
  );
}

function Avatar({ name, url }) {
  if (url) {
    return <img src={url} alt={name}
                 style={{ width: 28, height: 28, borderRadius: 9999, objectFit: 'cover' }} />;
  }
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
  return (
    <div aria-hidden style={{
      width: 28, height: 28, borderRadius: 9999,
      background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.45), rgba(var(--theme-rgb),0.45))',
      color: 'var(--cream)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, fontFamily: 'DM Sans',
    }}>
      {initials}
    </div>
  );
}

function KPI({ label, value, testId }) {
  return (
    <div data-testid={testId}
         style={{
           padding: 12, borderRadius: 12,
           background: 'rgba(var(--cream-rgb),0.04)',
           border: '1px solid rgba(var(--cream-rgb),0.1)',
         }}>
      <div style={{
        fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 3,
      }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--cream)' }}>
        {value}
      </div>
    </div>
  );
}

/* ── Drawer with mock 90d timeseries ──────────────────────────────────── */

function genMockTimeseries(days = 90) {
  const out = [];
  const today = new Date();
  let val = 40 + Math.random() * 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    val = Math.max(10, Math.min(95, val + (Math.random() - 0.48) * 8));
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(val) });
  }
  return out;
}

function Sparkline({ data, color = 'var(--cream)' }) {
  if (!data?.length) return null;
  const w = 420, h = 80;
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;
  const ys = data.map(d => h - ((d.value - min) / range) * h);
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

function AsesorDrawer({ asesor, period, onClose }) {
  const ts = useMemo(() => genMockTimeseries(90), [asesor.asesor_id]);
  return (
    <>
      <div data-testid="asesor-drawer-overlay"
           onClick={onClose}
           style={{
             position: 'fixed', inset: 0, zIndex: Z.STICKY,
             background: 'rgba(var(--bg-rgb),0.65)', backdropFilter: 'blur(4px)',
           }} />
      <aside data-testid={`asesor-drawer-${asesor.asesor_id}`}
             style={{
               position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
               background: 'var(--bg, #06080F)',
               borderLeft: '1px solid var(--border, rgba(var(--cream-rgb),0.12))',
               zIndex: Z.STICKY, padding: 24, overflow: 'auto', fontFamily: 'DM Sans',
               color: 'var(--cream)',
             }}>
        <button data-testid="asesor-drawer-close" onClick={onClose}
                style={{
                  position: 'absolute', top: 16, right: 16,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--cream-3)', fontSize: 18,
                }}>×</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Avatar name={asesor.name} url={asesor.avatar_url} />
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 20, fontWeight: 700 }}>
            {asesor.name}
          </h2>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--cream-3)' }}>
          Tendencia 90 días · período activo: {PERIOD_LABEL[period]}
        </p>
        <div data-testid="asesor-drawer-timeseries"
             style={{
               padding: 14, borderRadius: 12,
               background: 'rgba(var(--cream-rgb),0.04)',
               border: '1px solid rgba(var(--cream-rgb),0.12)',
               marginBottom: 16,
             }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--cream-3)', marginBottom: 6,
          }}>
            Pipeline value (90d, demo)
          </div>
          <Sparkline data={ts} color="var(--theme)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <KPI label="Pipeline" value={fmtMXN(asesor.pipeline_value_mxn)} />
          <KPI label="Leads activos" value={fmtNum(asesor.leads_active)} />
          <KPI label="Conv %" value={`${fmtNum(asesor.conversion_rate_pct, 1)}%`} />
          <KPI label="Respuesta" value={`${fmtNum(asesor.response_time_hours, 1)}h`} />
          <KPI label="Citas" value={fmtNum(asesor.citas_booked)} />
          <KPI label="Tours completos" value={fmtNum(asesor.tours_completed)} />
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--cream-3)' }}>
          La serie temporal mostrada es demostrativa hasta que el endpoint
          <code> /api/metrics/asesor/{asesor.asesor_id}/timeseries</code> esté disponible.
        </div>
      </aside>
    </>
  );
}
