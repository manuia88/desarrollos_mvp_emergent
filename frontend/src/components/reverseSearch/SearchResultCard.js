// W5.x F5 · SearchResultCard · photo + match score + explanation + sources
import React from 'react';
import { useNavigate } from 'react-router-dom';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function scoreBadgeStyle(score) {
  if (score >= 80) {
    return { background: GRADIENT, color: '#FFF', border: 'none' };
  }
  if (score >= 60) {
    return { background: INDIGO, color: '#FFF', border: 'none' };
  }
  return { background: 'transparent', color: CREAM, border: `1px solid ${CREAM}88` };
}

export default function SearchResultCard({ result }) {
  const navigate = useNavigate();
  if (!result) return null;
  const { entity_id, scope, title, photo_url, match_score = 0, explanation, sources = [] } = result;
  // W5.x F5 fix · ruta real del repo es /desarrollo/:id (no /developments/:id) · units fallback al mismo dev
  const target = `/desarrollo/${entity_id}`;
  const score = Math.max(0, Math.min(100, Math.round(Number(match_score) || 0)));

  return (
    <article
      data-testid={`search-result-${entity_id}`}
      style={{
        background: CARD_BG, border: BORDER, borderRadius: 24,
        backdropFilter: 'blur(24px)', overflow: 'hidden', position: 'relative',
        transition: `transform 320ms ${EASE}, border-color 320ms ${EASE}`,
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: photo_url ? `center/cover url(${photo_url})` : `linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))` }}>
        <span
          data-testid={`score-badge-${entity_id}`}
          title="Match score"
          style={{
            position: 'absolute', top: 12, right: 12,
            padding: '6px 14px', borderRadius: 9999,
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13,
            letterSpacing: '0.06em', backdropFilter: 'blur(8px)',
            ...scoreBadgeStyle(score),
          }}
        >{score}%</span>
      </div>
      <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: CREAM }}>{title || entity_id}</h3>
        {explanation && (
          <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 13, lineHeight: 1.5, fontFamily: 'DM Sans, sans-serif' }}>{explanation}</p>
        )}
        {sources.length > 0 && (
          <div data-testid={`sources-${entity_id}`} style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sources.map((s, i) => (
              <span key={i} style={{
                padding: '3px 10px', borderRadius: 9999,
                border: `1px solid ${MUTED}`, color: MUTED,
                fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontFamily: 'DM Sans, sans-serif',
              }}>{s}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 18 }}>
          <button
            type="button"
            data-testid={`btn-view-${entity_id}`}
            onClick={() => navigate(target)}
            style={{
              padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text',
              color: 'transparent',
            }}
          >Ver detalle →</button>
        </div>
      </div>
    </article>
  );
}
