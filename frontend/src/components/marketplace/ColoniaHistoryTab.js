/**
 * ColoniaHistoryTab — Phase 4 Batch 27 (Sub-B)
 * Renderiza historia (pasado 20 años) y proyección (futuro 10 años) generada
 * por Claude Sonnet 4.5 con cache 7 días.
 *
 * Props:
 *   coloniaId — id de la colonia
 *   coloniaNombre — nombre legible (fallback empty state)
 */
import React, { useEffect, useState } from 'react';
import { fetchColoniaHistory } from '../../api/marketplace';

function ConfidenceRing({ pct = 0, size = 44 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - v / 100);
  const color = v >= 70 ? '#22C55E' : v >= 45 ? '#F59E0B' : '#EF4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r}
        stroke="rgba(var(--cream-rgb),0.08)" strokeWidth="3" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth="3" fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="Outfit" fontWeight="800" fontSize={size * 0.34}
        fill={color}>
        {v}
      </text>
    </svg>
  );
}

function ImpactBadge({ pct }) {
  if (pct === undefined || pct === null) return null;
  const positive = pct >= 0;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999,
      background: positive ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
      border: `1px solid ${positive ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'}`,
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
      color: positive ? '#86EFAC' : '#FCA5A5',
    }}>
      {positive ? '+' : ''}{pct}%
    </span>
  );
}

export default function ColoniaHistoryTab({ coloniaId, coloniaNombre }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!coloniaId) return;
    setLoading(true); setError(null);
    fetchColoniaHistory(coloniaId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [coloniaId]);

  if (loading) {
    return (
      <div data-testid="colonia-history-loading" style={{
        padding: 30, textAlign: 'center',
        fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(var(--cream-rgb),0.45)',
      }}>
        Generando análisis con IA…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="colonia-history-empty" style={{
        padding: '24px 18px', borderRadius: 12,
        background: 'rgba(var(--cream-rgb),0.03)',
        border: '1px dashed rgba(var(--cream-rgb),0.12)',
        fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(var(--cream-rgb),0.55)', textAlign: 'center',
      }}>
        Historia disponible cuando completemos análisis · {coloniaNombre || coloniaId}
      </div>
    );
  }

  if (data.mock) {
    return (
      <div data-testid="colonia-history-mock" style={{
        padding: '24px 18px', borderRadius: 12,
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.25)',
        fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(245,158,11,0.9)',
      }}>
        {data.summary_text}
      </div>
    );
  }

  return (
    <div data-testid="colonia-history-tab">
      {/* Summary card */}
      {data.summary_text && (
        <div data-testid="colonia-history-summary" style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(var(--theme-rgb),0.06)',
          border: '1px solid rgba(var(--theme-rgb),0.20)',
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
            color: 'rgba(var(--theme-rgb),0.85)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
          }}>
            Análisis IA
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.55,
            color: 'rgba(var(--cream-rgb),0.78)',
          }}>
            {data.summary_text}
          </div>
        </div>
      )}

      {/* Pasado timeline */}
      {data.past_milestones?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>Pasado · 20 años</div>
          <div data-testid="colonia-history-past" style={{
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {data.past_milestones.map((m, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(var(--cream-rgb),0.03)',
                border: '1px solid rgba(var(--cream-rgb),0.08)',
                position: 'relative',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  marginBottom: 4, gap: 10,
                }}>
                  <span style={{
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
                    color: 'rgba(165,180,252,1)',
                  }}>
                    {m.year}
                  </span>
                  <ImpactBadge pct={m.impact_pct} />
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.5,
                  color: 'rgba(var(--cream-rgb),0.78)',
                }}>
                  {m.event}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Futuro projections */}
      {data.future_projections?.length > 0 && (
        <div>
          <div style={sectionTitle}>Futuro · 10 años</div>
          <div data-testid="colonia-history-future" style={{
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {data.future_projections.map((p, i) => (
              <ProjectionCard key={i} p={p} />
            ))}
          </div>
        </div>
      )}

      {data.from_cache && (
        <div style={{
          marginTop: 14,
          fontFamily: 'DM Sans', fontSize: 9, fontWeight: 600,
          color: 'rgba(var(--cream-rgb),0.30)',
          textAlign: 'right',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          Cache · análisis previo
        </div>
      )}
    </div>
  );
}

function ProjectionCard({ p }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(var(--bg-rgb),0.92)',
      border: '1px solid rgba(var(--theme-rgb),0.18)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{ flexShrink: 0 }}>
          <ConfidenceRing pct={p.confidence_pct ?? 0} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 4,
          }}>
            <span style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
              color: 'rgba(165,180,252,1)',
            }}>
              {p.year}
            </span>
            {p.precio_proyectado_m2 && (
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
                padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(34,197,94,0.10)',
                color: 'var(--green)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}>
                ${Math.round(p.precio_proyectado_m2 / 1000)}k/m²
              </span>
            )}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.5,
            color: 'rgba(var(--cream-rgb),0.82)',
            marginBottom: 8,
          }}>
            {p.prediction}
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
              color: 'rgba(var(--theme-rgb),0.85)',
              background: 'transparent', border: 'none',
              padding: 0, cursor: 'pointer',
            }}
          >
            {expanded ? 'Ocultar drivers' : 'Drivers · riesgos'}
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Array.isArray(p.drivers) && p.drivers.length > 0 && (
                <div>
                  <div style={tinyTag('rgba(var(--theme-rgb),0.18)', 'rgba(var(--theme-rgb),0.95)')}>Drivers</div>
                  <ul style={tinyList}>
                    {p.drivers.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(p.risks) && p.risks.length > 0 && (
                <div>
                  <div style={tinyTag('rgba(239,68,68,0.16)', '#FCA5A5')}>Riesgos</div>
                  <ul style={tinyList}>
                    {p.risks.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionTitle = {
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'rgba(var(--cream-rgb),0.5)',
  textTransform: 'uppercase', letterSpacing: '0.10em',
  marginBottom: 10,
};

const tinyList = {
  margin: '4px 0 0', paddingLeft: 16,
  fontFamily: 'DM Sans', fontSize: 11, lineHeight: 1.55,
  color: 'rgba(var(--cream-rgb),0.7)',
};

function tinyTag(bg, color) {
  return {
    display: 'inline-block',
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 9,
    padding: '2px 8px', borderRadius: 9999,
    background: bg, color,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  };
}
