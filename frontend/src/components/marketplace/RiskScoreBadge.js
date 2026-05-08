// W3.4A — RiskScoreBadge (marketplace card)
// Compact circular A-F badge mounted top-LEFT (Zone Score occupies top-RIGHT).
import React, { useEffect, useState } from 'react';
import { fetchRiskScore } from '../../api/riskScore';

const COLORS = {
  A: { bg: '#10B981', fg: '#0c2a1f', label: 'Bajo riesgo' },
  B: { bg: '#34D399', fg: '#0c2a1f', label: 'Riesgo bajo-medio' },
  C: { bg: '#FBBF24', fg: '#3a2a04', label: 'Riesgo medio' },
  D: { bg: '#F97316', fg: '#3a1d04', label: 'Riesgo medio-alto' },
  E: { bg: '#EF4444', fg: '#fff',    label: 'Riesgo alto' },
  F: { bg: '#B91C1C', fg: '#fff',    label: 'Riesgo crítico' },
};

export default function RiskScoreBadge({ zoneId, size = 'sm', onClick }) {
  const [data, setData] = useState(null);

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
      <div data-testid={`risk-badge-${zoneId}-na`}
        title="Risk Score no disponible"
        style={badgeStyle(size, '#3f3f46', '#cbd5e1')}>
        ?
      </div>
    );
  }

  const letter = data.score_letter || '?';
  const c = COLORS[letter] || { bg: '#3f3f46', fg: '#fff', label: 'N/D' };

  return (
    <button
      type="button"
      data-testid={`risk-badge-${zoneId}`}
      onClick={onClick}
      title={`Risk Score · ${c.label}`}
      style={{
        ...badgeStyle(size, c.bg, c.fg),
        cursor: onClick ? 'pointer' : 'default',
        border: 'none',
      }}
    >
      <span style={{ fontFamily: 'Outfit', fontWeight: 800 }}>{letter}</span>
    </button>
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
