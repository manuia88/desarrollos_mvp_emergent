/**
 * Phase 4 Batch 21 · Sub-Chunk B — <ProductivityWidget>
 *
 * Shows team confidence ratio, KPIs and per-asesor sortable table.
 *
 * Props:
 *   period: '7d' | '30d' | '90d'
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getTeamProductivity } from '../../api/metrics';
import SmartEmptyState from '../shared/SmartEmptyState';
import { Sparkle } from '../icons';

const PERIOD_LABEL = { '7d': '7 días', '30d': '30 días', '90d': '90 días' };

function fmt(n) {
  if (typeof n !== 'number') return String(n ?? '0');
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);
}

function MomentumPill({ tone }) {
  const colors = tone === 'good'
    ? { bg: 'rgba(34,197,94,0.18)', border: 'rgba(34,197,94,0.45)', dot: '#22c55e' }
    : { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.45)', dot: '#ef4444' };
  return (
    <span data-testid={`momentum-pill-${tone}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999,
      background: colors.bg, border: `1px solid ${colors.border}`,
      fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--cream, #F0EBE0)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 9999, background: colors.dot }} />
      {tone === 'good' ? 'Top' : 'Bottom'}
    </span>
  );
}

const HEAD_COLS = [
  { key: 'rank',                 label: '#',          width: 40,  sortable: true },
  { key: 'name',                 label: 'Asesor',     width: '32%', sortable: true },
  { key: 'total_changes',        label: 'Cambios',    width: '15%', sortable: true, align: 'right' },
  { key: 'total_undones',        label: 'Deshechos',  width: '15%', sortable: true, align: 'right' },
  { key: 'confidence_ratio_pct', label: 'Confianza',  width: '20%', sortable: true, align: 'right' },
];

export default function ProductivityWidget({ period = '30d' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getTeamProductivity(period);
      setData(d);
      setError(null);
    } catch (e) {
      setError('No se pudo cargar la productividad');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' || key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!data?.by_asesor) return [];
    const rows = [...data.by_asesor];
    rows.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  if (loading) {
    return (
      <div data-testid="productivity-widget-loading"
           style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
        Cargando productividad…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="productivity-widget-error"
           style={{ padding: 24, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
        {error || 'Sin datos.'}
      </div>
    );
  }

  if (!data.team_total || data.team_total.total_changes < 10) {
    return (
      <SmartEmptyState
        contextKey="suggestions.none"
        testId="productivity-widget-empty"
        overrides={{
          title: 'Aún no hay actividad suficiente',
          body: `Necesitamos al menos 10 cambios del equipo en los últimos ${PERIOD_LABEL[period]} para calcular el ratio de confianza. Conforme tu equipo trabaje, este panel cobrará vida.`,
          ctas: [],
        }}
      />
    );
  }

  const tt = data.team_total;
  const ratio = tt.confidence_ratio_pct;
  const ratioColor = ratio >= 90 ? '#22c55e' : ratio >= 70 ? '#f59e0b' : '#ef4444';

  const total = sortedRows.length;
  const topIds = new Set(data.by_asesor.slice(0, 3).map(r => r.asesor_id));
  const bottomIds = new Set(
    data.by_asesor.slice(Math.max(0, total - 3)).map(r => r.asesor_id),
  );

  return (
    <div data-testid="productivity-widget"
         style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'DM Sans' }}>

      {/* Top Card — Confidence Ratio */}
      <div data-testid="productivity-confidence-card"
           style={{
             padding: 20, borderRadius: 16,
             background: 'rgba(240,235,224,0.04)',
             border: '1px solid rgba(240,235,224,0.12)',
             display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
           }}>
        <div style={{
          width: 88, height: 88, borderRadius: 9999,
          background: `conic-gradient(${ratioColor} ${ratio * 3.6}deg, rgba(240,235,224,0.08) 0)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', inset: 6, background: 'var(--bg, #06080F)',
            borderRadius: 9999, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column',
          }}>
            <span data-testid="confidence-ratio-value"
                  style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 800, color: ratioColor }}>
              {ratio.toFixed(1)}%
            </span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--cream-3)', marginBottom: 4,
          }}>
            <Sparkle size={11} style={{ display: 'inline', marginRight: 4 }} />
            Confianza del equipo · {PERIOD_LABEL[period]}
          </div>
          <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 22, fontWeight: 700, color: 'var(--cream)' }}>
            {ratio >= 90 ? 'Equipo confiable y consistente'
              : ratio >= 70 ? 'Equipo en buen ritmo'
              : 'Equipo necesita atención'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cream-2)' }}>
            {tt.total_changes} cambios · {tt.total_undones} deshechos en {PERIOD_LABEL[period]}.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div data-testid="productivity-kpi-strip"
           style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPI label="Total cambios" value={fmt(tt.total_changes)} testId="kpi-total-changes" />
        <KPI label="Total deshechos" value={fmt(tt.total_undones)} testId="kpi-total-undones" tone={tt.total_undones === 0 ? 'good' : null} />
        <KPI label="Cambios por día" value={fmt(tt.activity_per_day_avg)} testId="kpi-per-day-avg" />
      </div>

      {/* Per-asesor sortable table */}
      <div style={{
        borderRadius: 14, border: '1px solid var(--border, rgba(240,235,224,0.1))',
        overflow: 'hidden',
      }}>
        <table data-testid="productivity-table"
               style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ background: 'rgba(240,235,224,0.05)' }}>
              {HEAD_COLS.map(c => (
                <th key={c.key}
                    onClick={() => c.sortable && handleSort(c.key)}
                    data-testid={`prod-th-${c.key}`}
                    style={{
                      padding: '10px 14px', fontSize: 10.5, fontWeight: 600,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--cream-3)', textAlign: c.align || 'left',
                      cursor: c.sortable ? 'pointer' : 'default',
                      userSelect: 'none', width: c.width,
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
            {sortedRows.map(row => {
              const isTop = topIds.has(row.asesor_id) && total > 3;
              const isBottom = bottomIds.has(row.asesor_id) && total > 3 && !isTop;
              return (
                <tr key={row.asesor_id}
                    data-testid={`prod-row-${row.asesor_id}`}
                    style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream-2)' }}>
                    #{row.rank}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{row.name}</span>
                      {isTop && <MomentumPill tone="good" />}
                      {isBottom && <MomentumPill tone="bad" />}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream-2)', textAlign: 'right' }}>
                    {fmt(row.total_changes)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13,
                                color: row.total_undones > 0 ? '#fca5a5' : 'var(--cream-3)',
                                textAlign: 'right' }}>
                    {fmt(row.total_undones)}
                  </td>
                  <td style={{
                    padding: '10px 14px', fontSize: 13, fontWeight: 600,
                    color: row.confidence_ratio_pct >= 90 ? '#22c55e'
                            : row.confidence_ratio_pct >= 70 ? '#f59e0b' : '#ef4444',
                    textAlign: 'right',
                  }}>
                    {row.confidence_ratio_pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPI({ label, value, testId, tone }) {
  return (
    <div data-testid={testId}
         style={{
           padding: 14, borderRadius: 12,
           background: 'rgba(240,235,224,0.04)',
           border: '1px solid rgba(240,235,224,0.1)',
         }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: 'Outfit', fontSize: 22, fontWeight: 800,
        color: tone === 'good' ? '#22c55e' : 'var(--cream)',
      }}>{value}</div>
    </div>
  );
}
