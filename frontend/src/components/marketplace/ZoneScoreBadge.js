// W3.1A Phase 5 — ZoneScoreBadge: circular A-F badge for marketplace cards
// Censo 2026-07-05: el badge estaba MUERTO en marketplace (ningún endpoint de propiedades adjunta
// zone_score_letter). Ahora se AUTO-ALIMENTA del endpoint público /api/public/zone-score/{id}
// (cablea getPublicZoneScore, que estaba huérfano) con cache por zona — sin N requests repetidos.
import React, { useEffect, useState } from 'react';
import ZoneScoreBreakdown from '../developer/ZoneScoreBreakdown';
import { getPublicZoneScore } from '../../api/phase5Foundation';

const _zsCache = new Map();   // zone_id → {score_letter, score_numeric} | null (negativo cacheado)

const LETTER_COLORS = {
  A: '#22C55E',
  B: '#84CC16',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444',
  F: '#DC2626',
};

const LETTER_BG = {
  A: 'rgba(34,197,94,0.12)',
  B: 'rgba(132,204,22,0.12)',
  C: 'rgba(245,158,11,0.12)',
  D: 'rgba(249,115,22,0.12)',
  E: 'rgba(239,68,68,0.12)',
  F: 'rgba(220,38,38,0.12)',
};

// Calidad de zona en lenguaje normal (no "85/100"): la letra es el badge compacto, la palabra el tooltip.
const LETTER_WORD = { A: 'Muy Buena', B: 'Buena', C: 'Media', D: 'Regular', E: 'Baja', F: 'Muy Baja' };

export default function ZoneScoreBadge({
  zone_id, score_letter, score_numeric, zone_name,
  size = 'sm', showBreakdown = true,
}) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(() => (_zsCache.has(zone_id) ? _zsCache.get(zone_id) : undefined));

  useEffect(() => {
    if (score_letter || !zone_id) return undefined;          // con prop no hay fetch
    if (_zsCache.has(zone_id)) { setFetched(_zsCache.get(zone_id)); return undefined; }
    let alive = true;
    getPublicZoneScore(zone_id)
      .then((d) => { const v = d && d.score_letter ? d : null; _zsCache.set(zone_id, v); if (alive) setFetched(v); })
      .catch(() => { _zsCache.set(zone_id, null); if (alive) setFetched(null); });
    return () => { alive = false; };
  }, [zone_id, score_letter]);

  const letter = score_letter || (fetched && fetched.score_letter);
  const numeric = score_numeric != null ? score_numeric : (fetched && fetched.score_numeric);
  if (!letter) return null;

  const color  = LETTER_COLORS[letter] || 'var(--theme)';
  const bgFill = LETTER_BG[letter] || 'rgba(var(--theme-rgb),0.12)';
  const dim    = size === 'sm' ? 30 : 38;
  const fontSize = size === 'sm' ? 12 : 15;

  return (
    <>
      <button
        data-testid={`zone-score-badge-${zone_id}`}
        onClick={e => { if (showBreakdown) { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        title={`Calidad de Zona: ${LETTER_WORD[letter] || letter}${zone_name ? ` · ${zone_name}` : ''}`}
        style={{
          width: dim, height: dim,
          borderRadius: 9999,
          background: bgFill,
          border: `2px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: showBreakdown ? 'pointer' : 'default',
          transition: 'transform 220ms, box-shadow 220ms',
          padding: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize,
          color, lineHeight: 1, letterSpacing: '-0.02em',
        }}>
          {letter}
        </span>
      </button>

      {showBreakdown && open && (
        <ZoneScoreBreakdown
          zone_id={zone_id}
          zone_name={zone_name}
          score_letter={letter}
          score_numeric={numeric}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
