// W2.5 SA6 — Drill-down children table (sortable, density-aware, paginated)
import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

const COLS = [
  { key: 'name', label: 'Nombre', accessor: r => r.name, sortable: true },
  { key: 'units', label: 'Unidades', accessor: r => (r.kpis || {}).units_total || 0, sortable: true, mono: true },
  { key: 'available', label: 'Disponibles', accessor: r => (r.kpis || {}).units_available || 0, sortable: true, mono: true },
  { key: 'price', label: 'Precio prom.', accessor: r => (r.kpis || {}).avg_price_mxn,
    sortable: true, fmt: fmtMxn, mono: true },
  { key: 'conv', label: 'Conv. %', accessor: r => (r.kpis || {}).conversion_rate,
    sortable: true, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', mono: true },
  { key: 'leads', label: 'Leads', accessor: r => (r.kpis || {}).leads_count || 0, sortable: true, mono: true },
  { key: 'ie', label: 'IE', accessor: r => (r.kpis || {}).ie_score_promedio,
    sortable: true, fmt: v => v != null ? v.toFixed(1) : '—', mono: true },
];

const PAGE_SIZE = 50;

export default function CubeDrilldownTable({ items, onDrill, density = 'compact',
                                              breakdownKeys = null }) {
  const [sortKey, setSortKey] = useState('units');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  // Build full column list, optionally with dynamic breakdown columns
  const cols = useMemo(() => {
    if (!breakdownKeys || breakdownKeys.length === 0) return COLS;
    const dynCols = breakdownKeys.map(k => ({
      key: `bk-${k}`,
      label: k,
      accessor: r => ((r.olap?.breakdown || {})[k] || {}).units_total || 0,
      sortable: true,
      mono: true,
    }));
    // Replace conv/leads/ie cols (keep name + units total + breakdown + price)
    const base = COLS.filter(c => ['name', 'units', 'price'].includes(c.key));
    return [...base, ...dynCols];
  }, [breakdownKeys]);

  const sorted = useMemo(() => {
    const col = cols.find(c => c.key === sortKey) || cols[0];
    if (!col) return items;
    const arr = [...(items || [])];
    arr.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [items, sortKey, sortDir, cols]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const dense = density === 'dense';
  const rowPad = dense ? '6px 10px' : '9px 12px';

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (!items || items.length === 0) {
    return (
      <div data-testid="cube-drilldown-empty" style={{
        padding: 30, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12,
        color: 'rgba(240,235,224,0.40)',
      }}>Sin nodos para este nivel.</div>
    );
  }

  return (
    <div data-testid="cube-drilldown-table" style={{
      borderRadius: 14, background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {cols.map(c => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key}
                    onClick={() => c.sortable && toggleSort(c.key)}
                    style={{
                      padding: '8px 12px', textAlign: c.mono ? 'right' : 'left',
                      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                      color: active ? '#818CF8' : 'rgba(240,235,224,0.55)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      cursor: c.sortable ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {c.label}
                      {active && (sortDir === 'asc'
                        ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
                    </span>
                  </th>
                );
              })}
              <th style={{
                padding: '8px 12px', textAlign: 'right', width: 70,
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }} />
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.tier_id} data-testid={`cube-row-${r.tier_id}`}
                onClick={() => onDrill && onDrill(r)}
                style={{
                  cursor: onDrill ? 'pointer' : 'default',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 180ms, transform 180ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {cols.map(c => {
                  const v = c.accessor(r);
                  const display = c.fmt ? c.fmt(v) : (v != null ? v : '—');
                  return (
                    <td key={c.key} style={{
                      padding: rowPad, textAlign: c.mono ? 'right' : 'left',
                      fontFamily: c.mono ? 'DM Mono, monospace' : 'DM Sans',
                      fontSize: dense ? 11.5 : 12.5,
                      color: c.key === 'name' ? 'var(--cream)' : 'rgba(240,235,224,0.75)',
                      fontWeight: c.key === 'name' ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}>{display}</td>
                  );
                })}
                <td style={{ padding: rowPad, textAlign: 'right' }}>
                  <button
                    data-testid={`cube-drill-${r.tier_id}`}
                    onClick={(e) => { e.stopPropagation(); onDrill && onDrill(r); }}
                    style={{
                      padding: '4px 10px', borderRadius: 9999, border: 'none',
                      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700,
                      fontSize: 10.5, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                    Drill <ArrowRight size={10} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11,
            color: 'rgba(240,235,224,0.45)' }}>
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} de {total}
          </span>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            data-testid="cube-page-prev"
            style={{
              padding: '5px 11px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: page === 0 ? 'rgba(240,235,224,0.30)' : 'rgba(240,235,224,0.65)',
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
              cursor: page === 0 ? 'not-allowed' : 'pointer',
            }}>Anterior</button>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1} data-testid="cube-page-next"
            style={{
              padding: '5px 11px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: page >= pages - 1 ? 'rgba(240,235,224,0.30)' : 'rgba(240,235,224,0.65)',
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
              cursor: page >= pages - 1 ? 'not-allowed' : 'pointer',
            }}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
