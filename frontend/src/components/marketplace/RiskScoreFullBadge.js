// W3.4B — RiskScoreFullBadge: marketplace badge + 4-dim drill drawer
import React, { useEffect, useState } from 'react';
import { fetchRiskScore } from '../../api/riskScore';
import RiskScoreBreakdown from '../developer/RiskScoreBreakdown';
import { Z } from '../../styles/zIndex';

const COLORS = {
  A: { bg: '#10B981', fg: '#0c2a1f', label: 'Bajo riesgo' },
  B: { bg: '#34D399', fg: '#0c2a1f', label: 'Riesgo bajo-medio' },
  C: { bg: '#FBBF24', fg: '#3a2a04', label: 'Riesgo medio' },
  D: { bg: '#F97316', fg: '#3a1d04', label: 'Riesgo medio-alto' },
  E: { bg: '#EF4444', fg: '#fff',    label: 'Riesgo alto' },
  F: { bg: '#B91C1C', fg: '#fff',    label: 'Riesgo crítico' },
};
const DIM_LABELS = {
  crime_score: 'Crimen',
  natural_score: 'Natural',
  title_risk_score: 'Título',
  percepcion_score: 'Percepción',
};

function MiniBar({ label, score }) {
  if (score == null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', minWidth: 56 }}>{label}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>—</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, score));
  const tone = pct >= 70 ? '#86efac' : pct >= 50 ? '#fcd34d' : '#fca5a5';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', minWidth: 56 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(var(--cream-rgb),0.10)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
      </div>
      <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: tone, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

export default function RiskScoreFullBadge({ zoneId, size = 'sm' }) {
  const [data, setData] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!zoneId) return;
    let alive = true;
    fetchRiskScore(zoneId)
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ available: false }); });
    return () => { alive = false; };
  }, [zoneId]);

  if (!data) return null;
  if (!data.available) {
    return (
      <div data-testid={`risk-fullbadge-${zoneId}-na`} title="Risk Score no disponible"
        style={badgeStyle(size, '#3f3f46', '#cbd5e1')}>?</div>
    );
  }

  const letter = data.score_letter || '?';
  const c = COLORS[letter] || { bg: '#3f3f46', fg: '#fff' };
  const components = data.components || {};

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <button
        type="button" data-testid={`risk-fullbadge-${zoneId}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title={`Risk Score · ${COLORS[letter]?.label || letter}`}
        style={{ ...badgeStyle(size, c.bg, c.fg), cursor: 'pointer', border: 'none' }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800 }}>{letter}</span>
      </button>

      {hovered && (
        <div data-testid={`risk-fullbadge-tooltip-${zoneId}`}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0,
            zIndex: Z.DROPDOWN, width: 220,
            background: 'rgba(var(--bg-rgb),0.98)',
            border: '1px solid rgba(var(--cream-rgb),0.14)',
            borderRadius: 12, padding: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'grid', gap: 6,
            backdropFilter: 'blur(20px)',
          }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Risk Score · {data.score_numeric != null ? data.score_numeric.toFixed(1) : ''}
          </div>
          {Object.entries(DIM_LABELS).map(([k, lbl]) => (
            <MiniBar key={k} label={lbl} score={components[k]} />
          ))}
          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 4 }}>Click para detalle</div>
        </div>
      )}

      {open && (
        <div data-testid={`risk-fullbadge-drawer-${zoneId}`}
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(var(--bg-rgb),0.78)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: 'min(680px, 96vw)', overflowY: 'auto',
              background: 'rgba(var(--bg-rgb),0.98)',
              borderLeft: '1px solid rgba(var(--cream-rgb),0.10)', padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontWeight: 800 }}>
              Risk Score · {zoneId}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12, marginTop: 4, marginBottom: 18 }}>
              Breakdown 4 dimensiones · v{data.formula_version}
            </p>
            <RiskScoreBreakdown zoneId={zoneId} />
          </div>
        </div>
      )}
    </div>
  );
}

function badgeStyle(size, bg, fg) {
  const dim = size === 'lg' ? 38 : size === 'md' ? 32 : 26;
  return {
    width: dim, height: dim, borderRadius: 9999,
    background: bg, color: fg,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: dim < 30 ? 12 : 14, fontWeight: 800,
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  };
}
