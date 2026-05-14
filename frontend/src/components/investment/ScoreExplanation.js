// F0.1 — ScoreExplanation · expandable breakdown card + methodology modal.
import React, { useState } from 'react';

const FACTOR_META = {
  tir: { label: 'TIR normalizada', desc: 'Tasa interna de retorno anualizada del escenario base (simulator W4.14).', accent: 'var(--theme)' },
  zone: { label: 'Zone Score', desc: 'Índice DMX de plusvalía y atributos urbanos (W3 zone_score_engine).', accent: '#8B5CF6' },
  demand: { label: 'Demand-Supply gap', desc: 'Diferencia demanda real vs oferta activa (maps_cross_engine).', accent: 'var(--theme-3)' },
  stress: { label: 'Resiliencia stress', desc: 'Porcentaje de escenarios ROI ≥ 0% bajo recesión + alza tasas + supply shock.', accent: '#F97316' },
};

export default function ScoreExplanation({ score, tier, label, factors, recommendation }) {
  const [openModal, setOpenModal] = useState(false);

  return (
    <div
      data-testid="score-explanation"
      style={{
        background: 'rgba(13,16,23,0.92)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 20,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12, marginBottom: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
            Cómo está formado tu Score
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 4, lineHeight: 1.5 }}>
            {label} · {recommendation}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          style={{
            background: 'transparent',
            color: 'var(--cream)',
            border: '1px solid rgba(240,235,224,0.25)',
            borderRadius: 9999,
            padding: '6px 14px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          CÓMO SE CALCULA
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {Object.entries(factors || {}).map(([k, v]) => {
          const meta = FACTOR_META[k] || { label: k, desc: '', accent: 'var(--theme)' };
          const pct = Math.max(0, Math.min(Number(v?.value ?? 0), 100));
          return (
            <div
              key={k}
              data-testid={`score-explain-factor-${k}`}
              style={{
                background: 'rgba(15,18,28,0.7)',
                border: '1px solid rgba(240,235,224,0.08)',
                borderRadius: 10, padding: '10px 14px',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 12, marginBottom: 6,
              }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>
                  {meta.label}
                </span>
                <span style={{
                  fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #a0a4b0)',
                }}>
                  {v.weight_pct}% · {v.contribution} pts
                </span>
              </div>
              <div style={{
                height: 5, background: 'rgba(240,235,224,0.08)',
                borderRadius: 9999, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: meta.accent,
                  transition: 'width 320ms ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {openModal && (
        <div
          onClick={() => setOpenModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(6,8,15,0.78)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 620,
              background: '#0E1220',
              border: '1px solid rgba(240,235,224,0.12)',
              borderRadius: 18,
              padding: 24,
            }}
          >
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', marginBottom: 14 }}>
              Metodología · DMX Score
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.6, margin: '0 0 14px' }}>
              El DMX Score se calcula como una combinación ponderada de cuatro factores
              cuantitativos, todos normalizados a una escala 0-100:
            </p>
            <ul style={{ paddingLeft: 18, margin: '0 0 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.7 }}>
              {Object.entries(FACTOR_META).map(([k, m]) => (
                <li key={k}>
                  <strong style={{ color: 'var(--cream)' }}>{m.label}</strong> ({factors?.[k]?.weight_pct ?? '—'}%) · {m.desc}
                </li>
              ))}
            </ul>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.6, margin: '0 0 14px' }}>
              Cada factor se traduce a puntos (valor × peso) y la suma forma el score 0-100.
              Etiquetas: AAA (90-100), AA (80-89), A (70-79), BBB (60-69), BB (50-59), B (&lt;50).
            </p>
            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                style={{
                  background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  color: '#fff', border: 'none', borderRadius: 9999,
                  padding: '10px 24px',
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
