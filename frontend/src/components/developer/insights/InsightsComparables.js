/**
 * Phase 4 Batch 22 — InsightsComparables sub-tab.
 * Tabla de proyectos comparables + delta vs current.
 */
import React, { useEffect, useState } from 'react';
import { getInsightsComparables, downloadComparables } from '../../../api/insights';
import { TrendUp, TrendDown, Download } from '../../icons';
import { scoreWord } from '../../../lib/scoreWord';

const fmtM = (v) => {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

function DeltaPill({ pct, invert = false, testid }) {
  if (pct === 0 || pct == null) {
    return <span data-testid={testid} style={{ fontSize: 11, color: 'var(--cream-3)' }}>±0%</span>;
  }
  const positive = pct > 0;
  const isGood = invert ? !positive : positive;
  const color = isGood ? '#22c55e' : '#f87171';
  const bg = isGood ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)';
  const Icon = positive ? TrendUp : TrendDown;
  return (
    <span data-testid={testid} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 9999,
      background: bg, color, fontSize: 11, fontWeight: 700,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <Icon size={9} /> {positive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function InsightsComparables({ projectId }) {
  const [topN, setTopN] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const [exportErr, setExportErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    getInsightsComparables(projectId, topN)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, topN]);

  const handleExport = async (format) => {
    setExporting(format); setExportErr(null);
    try {
      await downloadComparables(projectId, format, topN);
    } catch (e) {
      setExportErr(e.message || 'Error al exportar');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return (
    <div data-testid="comp-loading" style={{ padding: 24, color: 'var(--cream-3)' }}>Buscando comparables…</div>
  );
  if (err) return (
    <div data-testid="comp-error" style={{ padding: 16, color: 'var(--red)' }}>Error: {err}</div>
  );
  if (!data) return null;

  const cur = data.current || {};
  const comps = data.comparables || [];

  return (
    <div data-testid="comparables-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--cream-2)', fontFamily: 'DM Sans' }}>
          {data.alcaldia
            ? <>Mostrando hasta <b>{topN}</b> proyectos similares en <b>{data.alcaldia}</b>.</>
            : <>Comparables similares.</>
          }
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div data-testid="comp-topn" style={{ display: 'flex', gap: 6 }}>
            {[3, 5, 10].map(n => (
              <button
                key={n}
                data-testid={`comp-topn-${n}`}
                onClick={() => setTopN(n)}
                style={{
                  padding: '4px 12px', borderRadius: 9999,
                  border: '1px solid rgba(var(--cream-rgb),0.14)',
                  background: topN === n ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
                  color: topN === n ? '#fff' : 'var(--cream-2)',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                }}>Top {n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              data-testid="comp-export-csv"
              onClick={() => handleExport('csv')}
              disabled={!!exporting || (data?.comparables?.length ?? 0) === 0}
              style={{
                padding: '4px 12px', borderRadius: 9999,
                border: '1px solid rgba(var(--cream-rgb),0.16)',
                background: 'transparent', color: 'var(--cream-2)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600,
                cursor: exporting ? 'wait' : 'pointer',
                opacity: exporting === 'csv' ? 0.6 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <Download size={10} /> {exporting === 'csv' ? 'CSV…' : 'CSV'}
            </button>
            <button
              data-testid="comp-export-pdf"
              onClick={() => handleExport('pdf')}
              disabled={!!exporting || (data?.comparables?.length ?? 0) === 0}
              style={{
                padding: '4px 12px', borderRadius: 9999,
                border: 'none',
                background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                color: '#fff',
                fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600,
                cursor: exporting ? 'wait' : 'pointer',
                opacity: exporting === 'pdf' ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <Download size={10} /> {exporting === 'pdf' ? 'PDF…' : 'PDF'}
            </button>
          </div>
        </div>
      </div>

      {exportErr && (
        <div data-testid="comp-export-error" style={{
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)',
          color: 'var(--red)', fontSize: 12, fontFamily: 'DM Sans',
        }}>{exportErr}</div>
      )}

      {/* Current row */}
      {cur.id && (
        <div data-testid="comp-current" style={{
          background: 'rgba(var(--theme-rgb),0.10)',
          border: '1px solid rgba(var(--theme-rgb),0.32)',
          borderRadius: 12, padding: 12,
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--theme)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Tu proyecto</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, color: 'var(--cream)' }}>{cur.name}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Precio/m²</div>
            <b>{fmtM(cur.price_per_m2)}</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Salud</div>
            <b>{scoreWord(cur.health_score)}</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Velocidad</div>
            <b>{cur.sale_velocity_per_month}/mes</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Días listado</div>
            <b>{cur.days_listed}</b>
          </div>
        </div>
      )}

      {/* Comparables table */}
      {comps.length === 0 ? (
        <div data-testid="comp-empty" style={{
          padding: 28, textAlign: 'center', color: 'var(--cream-3)', fontSize: 12,
          background: 'rgba(var(--cream-rgb),0.04)',
          border: '1px solid rgba(var(--cream-rgb),0.10)',
          borderRadius: 12,
        }}>
          No se encontraron proyectos comparables en la zona.
        </div>
      ) : (
        <div style={{
          background: 'rgba(var(--cream-rgb),0.04)',
          border: '1px solid rgba(var(--cream-rgb),0.10)',
          borderRadius: 12, overflow: 'auto',
        }}>
          <table data-testid="comp-table" style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 12,
            fontFamily: 'DM Sans, sans-serif',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.10)' }}>
                {['Proyecto', 'Similitud', 'Precio/m²', 'Δ', 'Health', 'Δ', 'Velocidad', 'Δ', 'Días', 'Δ'].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 12px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                    color: 'var(--cream-3)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id} data-testid={`comp-row-${c.id}`} style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.06)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--cream)' }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{c.colonia}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 9999,
                      background: 'rgba(var(--theme-rgb),0.14)', color: 'var(--theme)',
                      fontSize: 10, fontWeight: 700,
                    }}>{c.similarity_score}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>{fmtM(c.price_per_m2)}</td>
                  <td style={{ padding: '10px 12px' }}><DeltaPill pct={c.delta_vs_current?.price_per_m2_pct} invert /></td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>{c.health_score}</td>
                  <td style={{ padding: '10px 12px' }}><DeltaPill pct={c.delta_vs_current?.health_pct} /></td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>{c.sale_velocity_per_month}/mes</td>
                  <td style={{ padding: '10px 12px' }}><DeltaPill pct={c.delta_vs_current?.velocity_pct} /></td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>{c.days_listed}</td>
                  <td style={{ padding: '10px 12px' }}><DeltaPill pct={c.delta_vs_current?.days_listed_pct} invert /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
