// W3.1A Phase 5 — ZoneScoreBadge: circular A-F badge for marketplace cards
import React, { useState } from 'react';
import ZoneScoreBreakdown from '../developer/ZoneScoreBreakdown';

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

export default function ZoneScoreBadge({
  zone_id, score_letter, score_numeric, zone_name,
  size = 'sm', showBreakdown = true,
}) {
  const [open, setOpen] = useState(false);

  if (!score_letter) return null;

  const color  = LETTER_COLORS[score_letter] || 'var(--theme)';
  const bgFill = LETTER_BG[score_letter] || 'rgba(var(--theme-rgb),0.12)';
  const dim    = size === 'sm' ? 30 : 38;
  const fontSize = size === 'sm' ? 12 : 15;

  return (
    <>
      <button
        data-testid={`zone-score-badge-${zone_id}`}
        onClick={e => { if (showBreakdown) { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        title={`Zone Score ${score_letter} · ${score_numeric}/100`}
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
          {score_letter}
        </span>
      </button>

      {showBreakdown && open && (
        <ZoneScoreBreakdown
          zone_id={zone_id}
          zone_name={zone_name}
          score_letter={score_letter}
          score_numeric={score_numeric}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
