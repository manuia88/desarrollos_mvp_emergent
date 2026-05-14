// W2.2 SA3 — BeforeAfterDiff
// Renders side-by-side JSON diff with keys highlighted (add/remove/update).
import React, { useMemo, useState } from 'react';
import { Plus, Minus, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';

const KEY_STATUS = {
  added:    { color: '#4ADE80', bg: 'rgba(74,222,128,0.08)',  bd: 'rgba(74,222,128,0.28)' },
  removed:  { color: '#F87171', bg: 'rgba(239,68,68,0.08)',   bd: 'rgba(239,68,68,0.30)' },
  updated:  { color: '#FACC15', bg: 'rgba(250,204,21,0.08)',  bd: 'rgba(250,204,21,0.30)' },
  same:     { color: 'rgba(240,235,224,0.55)', bg: 'transparent', bd: 'rgba(255,255,255,0.06)' },
};

function fmtVal(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

function classifyKey(before, after, key) {
  const inB = before && Object.prototype.hasOwnProperty.call(before, key);
  const inA = after && Object.prototype.hasOwnProperty.call(after, key);
  if (inB && !inA) return 'removed';
  if (!inB && inA) return 'added';
  if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) return 'updated';
  return 'same';
}

function Row({ keyName, before, after, status }) {
  const cfg = KEY_STATUS[status];
  const Icon = status === 'added' ? Plus : status === 'removed' ? Minus : status === 'updated' ? ArrowRight : null;
  return (
    <div data-testid={`diff-row-${keyName}`} style={{
      display: 'grid', gridTemplateColumns: '120px 1fr 14px 1fr',
      gap: 8, alignItems: 'flex-start',
      padding: '6px 9px', borderRadius: 8,
      background: cfg.bg, border: `1px solid ${cfg.bd}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontSize: 11, color: cfg.color, fontWeight: 700, wordBreak: 'break-word' }}>
        {Icon && <Icon size={10} />}
        <span style={{ wordBreak: 'break-word' }}>{keyName}</span>
      </div>
      <pre style={{
        margin: 0, padding: '4px 7px', borderRadius: 6,
        background: 'rgba(0,0,0,0.18)', fontFamily: 'DM Mono, monospace', fontSize: 10.5,
        color: status === 'removed' ? '#F87171' : status === 'updated' ? 'var(--cream)' : 'rgba(240,235,224,0.65)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
      }}>{fmtVal(before?.[keyName])}</pre>
      <ArrowRight size={11} color="rgba(240,235,224,0.30)" style={{ justifySelf: 'center', marginTop: 6 }} />
      <pre style={{
        margin: 0, padding: '4px 7px', borderRadius: 6,
        background: 'rgba(0,0,0,0.18)', fontFamily: 'DM Mono, monospace', fontSize: 10.5,
        color: status === 'added' ? '#4ADE80' : status === 'updated' ? 'var(--cream)' : 'rgba(240,235,224,0.65)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
      }}>{fmtVal(after?.[keyName])}</pre>
    </div>
  );
}

export default function BeforeAfterDiff({ before, after, testId = 'before-after-diff' }) {
  const [showSame, setShowSame] = useState(false);

  const rows = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);
    return Array.from(allKeys).map(k => ({
      key: k,
      status: classifyKey(before, after, k),
    })).sort((a, b) => {
      const order = { updated: 0, added: 1, removed: 2, same: 3 };
      return (order[a.status] - order[b.status]) || a.key.localeCompare(b.key);
    });
  }, [before, after]);

  const sameCount = rows.filter(r => r.status === 'same').length;
  const visible = showSame ? rows : rows.filter(r => r.status !== 'same');

  if (rows.length === 0) {
    return (
      <div data-testid={`${testId}-empty`} style={{
        padding: 18, textAlign: 'center',
        fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)',
        borderRadius: 9, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        Sin payload before/after en este registro.
      </div>
    );
  }

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 14px 1fr', gap: 8, padding: '0 9px',
        fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240, 235, 224, 0.68)',
        textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        <span>Campo</span>
        <span>Antes</span>
        <span></span>
        <span>Después</span>
      </div>
      {visible.map(r => (
        <Row key={r.key} keyName={r.key}
          before={before} after={after} status={r.status} />
      ))}
      {sameCount > 0 && (
        <button data-testid={`${testId}-toggle-same`} onClick={() => setShowSame(s => !s)}
          style={{
            alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 9999,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          {showSame ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {showSame ? `Ocultar ${sameCount} sin cambios` : `+${sameCount} campos sin cambios`}
        </button>
      )}
    </div>
  );
}
