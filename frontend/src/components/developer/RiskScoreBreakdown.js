// W3.4A — RiskScoreBreakdown (drawer with 4 component cards)
import React, { useEffect, useState } from 'react';
import { fetchRiskScore } from '../../api/riskScore';

const CAT_LABELS = {
  robo_casa_habitacion: 'Robo a casa habitación',
  robo_a_transeunte: 'Robo a transeúnte',
  homicidio_doloso: 'Homicidio doloso',
  secuestro: 'Secuestro',
  extorsion: 'Extorsión',
  violencia_familiar: 'Violencia familiar',
};

function ComponentCard({ title, status, value, sub, children }) {
  const isActive = status === 'active';
  return (
    <div data-testid={`risk-component-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        background: isActive ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? 'rgba(99,102,241,0.32)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, padding: 16,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
          textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
        }}>{title}</span>
        <span style={{
          padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans',
          background: isActive ? 'rgba(16,185,129,0.16)' : 'rgba(245,158,11,0.16)',
          color: isActive ? '#86efac' : '#fcd34d',
        }}>{isActive ? 'Activo V1' : 'V2 pendiente'}</span>
      </div>
      <div style={{
        fontFamily: 'Outfit', color: 'var(--cream)',
        fontSize: 28, fontWeight: 800, marginTop: 8,
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>{sub}</div>
      )}
      {children}
    </div>
  );
}

export default function RiskScoreBreakdown({ zoneId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!zoneId) return;
    fetchRiskScore(zoneId).then(setData).catch(() => setData({ available: false }));
  }, [zoneId]);

  if (!data) return <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>;

  if (!data.available) {
    return (
      <div data-testid="risk-breakdown-unavailable" style={{
        padding: 16, borderRadius: 12,
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
        color: '#fcd34d', fontFamily: 'DM Sans', fontSize: 13,
      }}>
        Risk Score no disponible: {data.reason || 'sin datos'}.
        SESNSP publica con ~30-60d de retraso.
      </div>
    );
  }

  const components = data.components || {};
  const byCat = components.crime_by_category;

  return (
    <div data-testid={`risk-breakdown-${zoneId}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
          color: 'var(--cream)',
        }}>{data.score_letter}</span>
        {data.score_numeric != null && (
          <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-2)', fontSize: 14 }}>
            {data.score_numeric.toFixed(1)} / 100
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <ComponentCard
          title="Crime score"
          status={components.crime_score != null ? 'active' : 'placeholder'}
          value={components.crime_score != null ? components.crime_score.toFixed(1) : '—'}
          sub={components.crime_normalized_per_100k != null
            ? `${components.crime_normalized_per_100k.toLocaleString('es-MX')} incidentes / 100k hab · 6m`
            : 'SESNSP V1'}
        />
        <ComponentCard
          title="Riesgo natural"
          status={components.natural_score != null ? 'active' : 'placeholder'}
          value={components.natural_score != null ? components.natural_score.toFixed(1) : '—'}
          sub={components.natural_detail
            ? `Sísmica ${components.natural_detail.sismic_zone || '—'} · Inund ${components.natural_detail.flood_pct ?? '—'}% · Hund ${components.natural_detail.subsidence_mm_year ?? '—'}mm/año`
            : 'Atlas CDMX + CENAPRED (W3.4B)'}
        />
        <ComponentCard
          title="Riesgo título"
          status={components.title_risk_score != null ? 'active' : 'placeholder'}
          value={components.title_risk_score != null ? components.title_risk_score.toFixed(1) : '—'}
          sub={components.title_detail
            ? `${components.title_detail.flips_24m ?? 0} flips / ${components.title_detail.transactions_24m ?? 0} tx · 24m · v3 con RPP Y2`
            : 'Heurística W3.4B · v3 con RPP Y2'}
        />
        <ComponentCard
          title="Percepción"
          status={components.percepcion_score != null ? 'active' : 'placeholder'}
          value={components.percepcion_score != null ? components.percepcion_score.toFixed(1) : '—'}
          sub={components.percepcion_detail
            ? `ENVIPE ${components.percepcion_detail.year || ''} · ${components.percepcion_detail.perception_pct ?? '—'}% inseguridad`
            : 'ENVIPE INEGI anual (W3.4B)'}
        />
      </div>

      {byCat && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
            Categorías SESNSP · últimos 6 meses
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {Object.entries(byCat).map(([cat, n]) => (
              <div key={cat} data-testid={`risk-cat-${cat}`} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12, padding: 10,
              }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>{CAT_LABELS[cat] || cat}</div>
                <div style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                  {Number(n).toLocaleString('es-MX')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
        Fuentes activas: {(data.sources_active || []).join(', ') || '—'} · v{data.formula_version}
      </div>
    </div>
  );
}
