// W2.3 SA4 — CostBreakdownTable (sortable, density-aware-ish)
import React, { useState } from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function CapBar({ pct, threshold = 80, hardBlock }) {
  if (pct == null) return <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.30)' }}>Sin tope</span>;
  const clamped = Math.min(100, pct);
  const color = clamped >= 90 ? '#F87171' : clamped >= threshold ? '#FACC15' : '#4ADE80';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: color, transition: 'width 200ms' }} />
      </div>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color, minWidth: 36, textAlign: 'right' }}>
        {clamped.toFixed(0)}%
      </span>
      {hardBlock && (
        <span title="Hard block activado" style={{ padding: '0 5px', borderRadius: 9999, fontSize: 8.5, fontFamily: 'DM Mono, monospace', background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.30)', fontWeight: 700 }}>
          BLOCK
        </span>
      )}
    </div>
  );
}

function MiniMix({ mix }) {
  const total = (mix?.haiku || 0) + (mix?.sonnet || 0) + (mix?.other || 0) || 1;
  const segs = [
    { key: 'haiku', val: mix?.haiku || 0, color: '#4ADE80' },
    { key: 'sonnet', val: mix?.sonnet || 0, color: 'var(--theme)' },
    { key: 'other', val: mix?.other || 0, color: 'rgba(240,235,224,0.30)' },
  ];
  return (
    <div title={`H:${(mix?.haiku || 0).toFixed(2)} S:${(mix?.sonnet || 0).toFixed(2)}`} style={{ display: 'flex', height: 6, borderRadius: 9999, overflow: 'hidden', minWidth: 80 }}>
      {segs.map(s => (
        <div key={s.key} style={{ width: `${(s.val / total) * 100}%`, background: s.color, transition: 'width 200ms' }} />
      ))}
    </div>
  );
}

/**
 * Reusable breakdown table.
 * Props:
 *  - title
 *  - kind: 'tenant' | 'feature'
 *  - rows: array of items
 *  - onRowClick(row)
 *  - onConfigCap(row) (only for tenant)
 *  - testIdPrefix
 */
export default function CostBreakdownTable({ title, kind = 'tenant', rows = [], onRowClick, onConfigCap, testIdPrefix }) {
  const [sort, setSort] = useState({ key: 'mxn', dir: 'desc' });

  const sorted = [...rows].sort((a, b) => {
    const va = a[sort.key]; const vb = b[sort.key];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sort.dir === 'asc' ? va - vb : vb - va;
  });

  const totalMxn = rows.reduce((acc, r) => acc + (r.mxn || 0), 0);

  const SortHeader = ({ k, label, align = 'left' }) => {
    const active = sort.key === k;
    return (
      <button data-testid={`${testIdPrefix}-sort-${k}`}
        onClick={() => setSort(s => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }))}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600,
          color: active ? 'var(--theme)' : 'rgba(240, 235, 224, 0.72)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
          textAlign: align, justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}>
        {label}
        {active ? (sort.dir === 'desc' ? <ChevronDown size={9} /> : <ChevronUp size={9} />) : <ArrowUpDown size={9} opacity={0.5} />}
      </button>
    );
  };

  if (kind === 'tenant') {
    return (
      <div data-testid={testIdPrefix} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: 0 }}>{title}</h3>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.72)' }}>
            Total: {fmtMxn(totalMxn)}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 60px 110px 90px', gap: 8, padding: '0 8px' }}>
          <SortHeader k="name" label="Tenant" />
          <SortHeader k="mxn" label="Gasto" align="right" />
          <SortHeader k="pct_total" label="%" align="right" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tope</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>Acción</span>
        </div>
        {sorted.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
            Sin datos en este período.
          </div>
        )}
        {sorted.map(r => (
          <div key={r.tenant_id} data-testid={`${testIdPrefix}-row-${r.tenant_id}`}
            onClick={() => onRowClick && onRowClick(r)}
            style={{
              display: 'grid', gridTemplateColumns: '1.4fr 80px 60px 110px 90px',
              gap: 8, padding: '7px 8px', borderRadius: 8,
              background: r.alert_flag ? 'rgba(250,204,21,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${r.alert_flag ? 'rgba(250,204,21,0.20)' : 'rgba(255,255,255,0.04)'}`,
              cursor: onRowClick ? 'pointer' : 'default',
              alignItems: 'center', transition: 'background 180ms, transform 180ms',
            }}
            onMouseEnter={e => { if (onRowClick) { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={e => { if (onRowClick) { e.currentTarget.style.background = r.alert_flag ? 'rgba(250,204,21,0.06)' : 'rgba(255,255,255,0.02)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.68)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tenant_id}</div>
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)', textAlign: 'right' }}>{fmtMxn(r.mxn)}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textAlign: 'right' }}>{r.pct_total}%</span>
            <CapBar pct={r.pct_used_of_cap} threshold={r.alert_threshold_pct} hardBlock={r.hard_block} />
            <button data-testid={`${testIdPrefix}-cap-${r.tenant_id}`}
              onClick={e => { e.stopPropagation(); onConfigCap && onConfigCap(r); }}
              style={{ padding: '4px 10px', borderRadius: 9999, background: r.cap_mxn ? 'rgba(var(--theme-rgb),0.10)' : 'rgba(74,222,128,0.10)', border: `1px solid ${r.cap_mxn ? 'rgba(var(--theme-rgb),0.28)' : 'rgba(74,222,128,0.28)'}`, color: r.cap_mxn ? 'var(--theme)' : '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5, cursor: 'pointer', justifySelf: 'end' }}>
              {r.cap_mxn ? 'Editar' : 'Tope'}
            </button>
          </div>
        ))}
      </div>
    );
  }

  // kind === 'feature'
  return (
    <div data-testid={testIdPrefix} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: 0 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 80px 50px 90px 1fr', gap: 8, padding: '0 8px' }}>
        <SortHeader k="feature_key" label="Feature" />
        <SortHeader k="mxn" label="Gasto" align="right" />
        <SortHeader k="pct" label="%" align="right" />
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Mix</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Top tenant</span>
      </div>
      {sorted.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
          Sin datos en este período.
        </div>
      )}
      {sorted.map(r => (
        <div key={r.feature_key} data-testid={`${testIdPrefix}-row-${r.feature_key}`}
          style={{ display: 'grid', gridTemplateColumns: '1.6fr 80px 50px 90px 1fr', gap: 8, padding: '7px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)' }}>{r.feature_key}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)', textAlign: 'right' }}>{fmtMxn(r.mxn)}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', textAlign: 'right' }}>{r.pct}%</span>
          <MiniMix mix={r.model_mix} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.top_tenant_name || r.top_tenant_id || '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
