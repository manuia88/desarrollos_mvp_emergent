// ExplainModal — "cómo lo sabemos" breakdown de un score (fórmula + inputs + versión).
import React, { useEffect, useState } from 'react';
import * as api from '../../api/ie_scores';
import { X, Sparkle } from '../icons';

export default function ScoreExplainModal({ zoneId, code, open, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open || !zoneId || !code) return;
    setData(null); setErr(null);
    api.explainScore(zoneId, code)
      .then(setData)
      .catch(e => setErr(e.message));
  }, [zoneId, code, open]);

  if (!open) return null;

  return (
    <div data-testid="explain-modal" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 520,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)',
        borderRadius: 22, padding: 32,
        boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>CÓMO LO SABEMOS</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>
              {code}
            </h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
              Zona: <strong style={{ color: 'var(--cream-2)' }}>{zoneId}</strong>
            </div>
          </div>
          <button data-testid="explain-close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {err && (
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5' }}>
            Error: {err}
          </div>
        )}

        {!data && !err && (
          <div style={{ padding: 30, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', textAlign: 'center' }}>
            Cargando…
          </div>
        )}

        {data && (
          <>
            {/* Value + tier */}
            <div data-testid="explain-header" style={{
              padding: 16, marginBottom: 14,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.22)',
              borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                  {data.description}
                </div>
                <div style={{ marginTop: 6, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                  Fórmula v{data.formula_version} · {data.tier_logic} · confidence {data.confidence}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, color: 'var(--cream)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {data.value != null ? data.value.toFixed(1) : '—'}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                  tier {data.tier}{data.is_stub ? ' · est.' : ''}
                </div>
              </div>
            </div>

            {/* Dependencies */}
            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>FUENTES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.dependencies.map(dep => (
                  <span key={dep} data-testid={`explain-dep-${dep}`} style={{
                    padding: '3px 10px', borderRadius: 9999,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)',
                  }}>
                    {dep} · {data.inputs_used[dep] ?? 0} obs
                  </span>
                ))}
              </div>
            </div>

            {/* Operations */}
            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>OPERACIONES APLICADAS</div>
              <ol data-testid="explain-operations" style={{ margin: 0, paddingLeft: 20, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.7 }}>
                {data.operations.map((op, i) => <li key={i}>{op}</li>)}
              </ol>
            </div>

            {/* Sample IDs */}
            {data.observation_sample_ids?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>MUESTRA DE OBSERVACIONES</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
                  {data.observation_sample_ids.slice(0, 8).join(' · ')}
                </div>
              </div>
            )}

            <div style={{
              padding: 10, borderRadius: 10,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.18)',
              fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkle size={11} color="var(--indigo-3)" />
              <span>DesarrollosMX no opina. Mide. Cada score se reproduce con la misma fórmula y las mismas observaciones en tiempo real.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
