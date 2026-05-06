/**
 * SmartMatchWidget — Phase 4 Batch 30
 * Widget en el Dashboard que muestra match score del buyer
 * contra sus favoritos y respuestas del quiz.
 *
 * Props: (ninguno — carga datos propios)
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSmartMatch } from '../../api/wrapped';
import { Star, ChevronRight } from '../icons';

function MatchRing({ pct, size = 52 }) {
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(240,235,224,0.08)" strokeWidth="6"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="url(#matchGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <defs>
        <linearGradient id="matchGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MatchItem({ item, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.07)',
      marginBottom: 8,
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Match ring */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <MatchRing pct={item.match_pct} size={44} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 11,
            color: 'var(--cream, #F0EBE0)',
          }}>
            {item.match_pct}%
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            color: 'var(--cream, #F0EBE0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.name || item.item_id}
          </div>
          {!expanded && item.top_2_reasons?.[0] && (
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.45)', marginTop: 2,
            }}>
              {item.top_2_reasons[0]}
            </div>
          )}
        </div>
        <ChevronRight
          size={13}
          color="rgba(240,235,224,0.4)"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </div>

      {/* Reasons collapsible */}
      {expanded && item.top_2_reasons?.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 54 }}>
          {item.top_2_reasons.map((r, i) => (
            <div key={i} style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(165,180,252,0.85)', marginBottom: 3,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: 9999, flexShrink: 0,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                display: 'inline-block',
              }} />
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SmartMatchWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSmartMatch()
      .then(setData)
      .catch(() => setData({ has_quiz: false, top_matches: [], avg_match: 0 }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      data-testid="smart-match-widget"
      style={{
        borderRadius: 14,
        background: 'rgba(13,16,23,0.85)',
        border: '1px solid rgba(240,235,224,0.08)',
        backdropFilter: 'blur(24px)',
        padding: '20px 20px 16px',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 9999, marginBottom: 12, alignSelf: 'flex-start',
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.28)',
        fontFamily: 'DM Sans', fontSize: 9, fontWeight: 800,
        color: 'rgba(99,102,241,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <Star size={10} />Match score
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
        color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.01em', marginBottom: 14,
      }}>
        Tu match de propiedades
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans' }}>
          Calculando…
        </div>
      ) : !data?.has_quiz ? (
        /* Empty state — no quiz */
        <div style={{ textAlign: 'center', paddingBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 9999, margin: '0 auto 12px',
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Star size={20} color="rgba(99,102,241,0.6)" />
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            color: 'rgba(240,235,224,0.7)', marginBottom: 6,
          }}>
            Conoce tu match ideal
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12,
            color: 'rgba(240,235,224,0.4)', marginBottom: 14,
          }}>
            Toma el quiz para descubrir qué propiedades tienen mayor compatibilidad contigo.
          </div>
          <button
            data-testid="smart-match-quiz-cta"
            onClick={() => navigate('/marketplace')}
            style={{
              padding: '9px 18px', borderRadius: 9999, border: 'none',
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Tomar el quiz
          </button>
        </div>
      ) : (
        <>
          {/* Avg match score */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.18)',
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <MatchRing pct={data.avg_match} size={56} />
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
                color: 'var(--cream, #F0EBE0)',
              }}>
                {data.avg_match}%
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                color: 'var(--cream, #F0EBE0)', marginBottom: 2,
              }}>
                Match promedio
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 11,
                color: 'rgba(240,235,224,0.45)',
              }}>
                Basado en tus {data.top_matches?.length || 0} favoritos analizados
              </div>
            </div>
          </div>

          {/* Top matches */}
          {(data.top_matches || []).map(item => (
            <MatchItem key={item.item_id} item={item} onNavigate={navigate} />
          ))}

          <button
            onClick={() => navigate('/comprador/favoritos')}
            data-testid="smart-match-ver-favoritos"
            style={{
              marginTop: 4, padding: '8px 0', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(240,235,224,0.12)',
              color: 'rgba(240,235,224,0.55)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
              cursor: 'pointer', width: '100%',
            }}
          >
            Ver todos mis favoritos
          </button>
        </>
      )}
    </div>
  );
}
