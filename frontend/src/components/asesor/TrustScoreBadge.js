/**
 * Phase 4 Batch 32 · Component — TrustScoreBadge
 *
 * Ring chart 0-100 con color por banda · click → modal breakdown 6 components.
 * Reusa patrón HealthScoreWidget B14 (SVG circle + dasharray animación).
 */
import React, { useState } from 'react';

const GRADIENT = 'linear-gradient(90deg, var(--theme), var(--theme-3))';

function _color(score) {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#F59E0B';
  return 'rgba(240,235,224,0.45)';
}

const COMPONENT_LABELS = {
  experience_score: { label: 'Experiencia', max: 25 },
  deals_score: { label: 'Ventas cerradas', max: 30 },
  endorsement_score: { label: 'Reseñas verificadas', max: 25 },
  response_time_score: { label: 'Tiempo de respuesta', max: 15 },
  certifications_score: { label: 'Certificaciones', max: 5 },
  disc_complete_bonus: { label: 'DISC completo', max: 5 },
};

function Ring({ score, size = 96, stroke = 8 }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ;
  const color = _color(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius}
              stroke="rgba(240,235,224,0.1)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius}
              stroke={color} strokeWidth={stroke} fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            fontFamily="Outfit" fontWeight="700" fontSize={size * 0.32} fill="var(--cream)">
        {score}
      </text>
    </svg>
  );
}

export default function TrustScoreBadge({
  score = 0,
  components = null,
  size = 96,
  showLabel = true,
  testId = 'trust-score-badge',
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-testid={testId}
        type="button"
        onClick={() => components && setOpen(true)}
        title={components ? 'Click para ver desglose' : ''}
        style={{
          background: 'transparent', border: 'none', padding: 0,
          cursor: components ? 'pointer' : 'default',
          display: 'inline-flex', flexDirection: 'column',
          alignItems: 'center', gap: 6,
        }}
      >
        <Ring score={score} size={size} />
        {showLabel && (
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--cream-3)', textAlign: 'center',
          }}>Trust Score</div>
        )}
      </button>

      {open && components && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(6,8,15,0.7)', backdropFilter: 'blur(4px)',
          }} />
          <div data-testid="trust-score-breakdown-modal"
               role="dialog" aria-label="Desglose Trust Score"
               style={{
                 position: 'fixed', top: '50%', left: '50%',
                 transform: 'translate(-50%,-50%)', zIndex: 81,
                 width: 'min(440px, 92vw)',
                 padding: 22, borderRadius: 18,
                 background: 'rgba(13,16,23,0.96)',
                 border: '1px solid rgba(240,235,224,0.14)',
                 backdropFilter: 'blur(24px)',
                 display: 'flex', flexDirection: 'column', gap: 12,
               }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{
                  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--cream-3)',
                }}>Trust Score · Desglose</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cream)',
                              marginTop: 4, fontFamily: 'Outfit',
                              background: GRADIENT,
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent' }}>
                  {score} / 100
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                      data-testid="trust-breakdown-close-btn"
                      type="button"
                      aria-label="Cerrar"
                      style={{
                        width: 32, height: 32, borderRadius: 9999,
                        border: '1px solid rgba(240,235,224,0.18)',
                        background: 'transparent', color: 'var(--cream)',
                        cursor: 'pointer', fontSize: 16, lineHeight: 1,
                      }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(COMPONENT_LABELS).map(([key, meta]) => {
                const val = Number(components?.[key] || 0);
                const pct = (val / meta.max) * 100;
                return (
                  <div key={key} data-testid={`trust-component-${key}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  fontSize: 12, color: 'var(--cream)', marginBottom: 4 }}>
                      <span>{meta.label}</span>
                      <span style={{ color: 'var(--cream-3)' }}>
                        {val.toFixed(1)} / {meta.max}
                      </span>
                    </div>
                    <div style={{
                      height: 6, borderRadius: 9999,
                      background: 'rgba(240,235,224,0.08)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                        background: GRADIENT,
                        transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              padding: 10, borderRadius: 10,
              background: 'rgba(var(--theme-rgb),0.06)',
              border: '1px solid rgba(var(--theme-rgb),0.18)',
              fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.6,
            }}>
              Combina experiencia, ventas, reseñas verificadas, tiempo de respuesta,
              certificaciones y test DISC. Se actualiza cada 4 horas.
            </div>
          </div>
        </>
      )}
    </>
  );
}
