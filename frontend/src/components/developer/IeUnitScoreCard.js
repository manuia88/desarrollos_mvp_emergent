/**
 * IeUnitScoreCard — W3.1B-4
 * Tarjeta de scores IE para una unidad (5 recipes IE_UNIT_*).
 * Se monta como sección 8 en UnitDrawerContent.
 */
import React, { useEffect, useState } from 'react';
import { getUnitScores } from '../../api/ie_scores';
import { SmartEmptyState } from '../shared/SmartEmptyState';

const CODE_LABELS = {
  IE_UNIT_PRECIO_VS_PROTOTYPE: 'Precio vs Prototipo',
  IE_UNIT_NIVEL_PREMIUM: 'Nivel Premium',
  IE_UNIT_PARKING_FIT: 'Parking',
  IE_UNIT_ORIENTACION_PREMIUM: 'Orientación',
  IE_UNIT_M2_VALUE: 'Precio justo m²',
};

const TIER_COLOR = {
  A: '#6366F1',
  B: '#F0EBE0',
  C: '#FCD34D',
  D: '#FB7185',
  F: '#EF4444',
  green: '#6366F1',
  amber: '#FCD34D',
  red: '#FB7185',
  unknown: 'rgba(240,235,224,0.4)',
};

const tierGradient = 'linear-gradient(90deg, #6366F1, #EC4899)';

function ScoreRow({ score }) {
  const label = CODE_LABELS[score.code] || score.code;
  const value = typeof score.value === 'number' ? Math.round(score.value) : 0;
  const tier = score.tier || 'unknown';
  const isTopTier = tier === 'A' || tier === 'green';
  const barFill = isTopTier ? tierGradient : '#6366F1';
  const tierColor = TIER_COLOR[tier] || TIER_COLOR.unknown;

  return (
    <div
      data-testid={`ie-unit-score-row-${score.code}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid rgba(240,235,224,0.06)',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div style={{ flex: '0 0 36%', fontSize: 12, color: 'var(--cream-2)' }}>
        {label}
      </div>
      <div style={{
        flex: 1,
        height: 6,
        borderRadius: 9999,
        background: 'rgba(240,235,224,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          background: barFill,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{
        flex: '0 0 32px', textAlign: 'right',
        fontSize: 13, fontWeight: 700, color: 'var(--cream)',
        fontFamily: 'Outfit, sans-serif',
      }}>
        {value}
      </div>
      <span
        data-testid={`ie-unit-score-tier-${score.code}`}
        style={{
          flex: '0 0 auto',
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 9999,
          color: tierColor,
          background: 'rgba(240,235,224,0.06)',
          border: `1px solid ${tierColor}33`,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {tier}
      </span>
    </div>
  );
}

export default function IeUnitScoreCard({ unitId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setLoading(false); return undefined; }
    setLoading(true);
    setError(null);
    getUnitScores(unitId)
      .then((resp) => { if (!cancelled) setData(resp); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [unitId]);

  const containerStyle = {
    borderRadius: 16,
    border: '1px solid rgba(240,235,224,0.10)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    background: 'rgba(13,16,23,0.92)',
    padding: 20,
    marginBottom: 16,
  };

  return (
    <div data-testid="ie-unit-score-card" style={containerStyle}>
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--cream)',
        fontFamily: 'Outfit, sans-serif',
        letterSpacing: '0.02em',
        marginBottom: 14,
        textTransform: 'uppercase',
      }}>
        Scores IE
      </div>

      {loading && (
        <div data-testid="ie-unit-score-loading" style={{ fontSize: 12, color: 'var(--cream-3)', padding: '8px 0' }}>
          Calculando scores…
        </div>
      )}

      {!loading && error && (
        <div data-testid="ie-unit-score-error" style={{ fontSize: 12, color: '#FB7185', padding: '8px 0' }}>
          No se pudieron cargar los scores: {error}
        </div>
      )}

      {!loading && !error && data && (
        (data.ui_mode === 'seed' || (data.real_count ?? 0) === 0) ? (
          <SmartEmptyState
            contextKey="ie-unit-scores-empty"
            compact
            testId="ie-unit-score-empty"
            overrides={{
              title: 'Aún sin señal IE para esta unidad',
              body: 'Los scores se calculan al primer recompute. Ejecuta "Recalcular scores" desde Superadmin para verlos aquí.',
              ctas: [],
            }}
          />
        ) : (
          <div data-testid="ie-unit-score-list">
            {(data.scores || []).map((s) => (
              <ScoreRow key={s.code} score={s} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
