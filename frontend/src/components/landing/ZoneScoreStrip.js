// ZoneScoreStrip — muestra los scores reales para una zona con fallback "estimado"
// cuando real_count < 5. Alimenta /barrios, ficha desarrollo, /inteligencia.
import React, { useEffect, useState } from 'react';
import * as api from '../../api/ie_scores';
import { Sparkle, Database } from '../icons';

const TIER_TONES = {
  green:   { bg: 'rgba(34,197,94,0.14)',  fg: '#86efac', border: 'rgba(34,197,94,0.28)', label: 'Óptimo' },
  amber:   { bg: 'rgba(245,158,11,0.14)', fg: '#fcd34d', border: 'rgba(245,158,11,0.28)', label: 'Medio' },
  red:     { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', border: 'rgba(239,68,68,0.28)', label: 'Atención' },
  unknown: { bg: 'rgba(148,163,184,0.12)', fg: 'var(--cream-3)', border: 'rgba(148,163,184,0.22)', label: '—' },
};

const CODE_LABELS = {
  IE_COL_AIRE: 'Aire',
  IE_COL_CLIMA_INUNDACION: 'Riesgo inundación',
  IE_COL_CLIMA_SISMO: 'Riesgo sísmico',
  IE_COL_CLIMA_ISLA_CALOR: 'Isla de calor',
  IE_COL_SEGURIDAD: 'Seguridad',
  IE_COL_LOCATEL: 'Reportes Locatel',
  IE_COL_CONECTIVIDAD_TRANSPORTE: 'Transporte',
  IE_COL_CONECTIVIDAD_FIBRA: 'Fibra óptica',
  IE_COL_CONECTIVIDAD_VIALIDAD: 'Vialidad',
  IE_COL_EDUCACION: 'Educación',
  IE_COL_EDUCACION_CALIDAD: 'Calidad escolar',
  IE_COL_SALUD: 'Salud',
  IE_COL_AGUA_CONFIABILIDAD: 'Agua',
  IE_COL_CULTURAL_PARQUES: 'Parques',
  IE_COL_CULTURAL_VIDA_NOCTURNA: 'Vida nocturna',
  IE_COL_CULTURAL_MUSEOS: 'Museos',
  IE_COL_DEMOGRAFIA_FAMILIA: 'Familias',
  IE_COL_DEMOGRAFIA_JOVEN: 'Jóvenes',
  IE_COL_DEMOGRAFIA_INGRESO: 'Ingreso',
  IE_COL_DEMOGRAFIA_EDUCACION: 'Escolaridad',
  IE_COL_DEMOGRAFIA_ESTABILIDAD: 'Estabilidad',
  IE_COL_ROI_RENTA_TRADICIONAL: 'ROI renta',
  IE_COL_ROI_AIRBNB: 'ROI Airbnb',
  IE_COL_ROI_AIRBNB_OCUPACION: 'Ocupación',
  IE_COL_DESARROLLOS_ACTIVOS: 'Desarrollos',
  IE_COL_USO_SUELO_HABITACIONAL: 'Uso habitacional',
  IE_COL_USO_SUELO_MIXTO: 'Uso mixto',
  IE_COL_GHOST_ZONE: 'Ghost zone',
  IE_COL_PMF_GAP: 'PMF gap',
  IE_COL_TRUST_VECINDARIO: 'Trust vecindario',
  IE_COL_PRECIO: 'Precio m²',
  IE_COL_PLUSVALIA_HIST: 'Plusvalía',
  IE_COL_LIQUIDEZ: 'Liquidez',
  IE_COL_DEMANDA_NETA: 'Demanda neta',
  // ─── Proyecto (12 · Phase B3) ────────────────────────────────────────
  IE_PROY_SCORE_VS_COLONIA: 'Score vs colonia',
  IE_PROY_SCORE_VS_CIUDAD: 'Score vs ciudad',
  IE_PROY_PRECIO_VS_MERCADO: 'Precio vs mercado',
  IE_PROY_AMENIDADES: 'Amenidades',
  IE_PROY_LISTING_HEALTH: 'Listing health',
  IE_PROY_BADGE_TOP: 'Top colonia',
  IE_PROY_ABSORCION_VELOCIDAD: 'Absorción',
  IE_PROY_PRESALES_RATIO: 'Preventa',
  IE_PROY_MARCA_TRUST: 'Marca trust',
  IE_PROY_DEVELOPER_TRUST: 'Dev trust',
  IE_PROY_DEVELOPER_DELIVERY_HIST: 'Delivery histórico',
  IE_PROY_COMPETITION_PRESSURE: 'Presión competencia',
};

const ScorePill = ({ score, onClick }) => {
  const tone = TIER_TONES[score.tier] || TIER_TONES.unknown;
  return (
    <button
      data-testid={`score-pill-${score.code}`}
      onClick={() => onClick?.(score)}
      style={{
        padding: '10px 14px',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 4,
        minWidth: 120, cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, background 0.15s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {CODE_LABELS[score.code] || score.code}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: tone.fg, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {score.value != null ? score.value.toFixed(0) : '—'}
        </span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {tone.label}
        </span>
      </div>
    </button>
  );
};

export default function ZoneScoreStrip({ zoneId, scope = 'colonia', limit = 8, onScoreClick, title = null }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!zoneId) return;
    const loader = scope === 'proyecto'
      ? api.getDevelopmentScores(zoneId)
      : api.getZoneCoverage(zoneId);
    loader.then(setData).catch(e => setErr(e.message));
  }, [zoneId, scope]);

  if (err) {
    return (
      <div data-testid="score-strip-error" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: 16 }}>
        Scores no disponibles: {err}
      </div>
    );
  }
  if (!data) {
    return <div data-testid="score-strip-loading" style={{ padding: 16, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando scores…</div>;
  }

  const showSeed = data.ui_mode === 'seed';

  return (
    <div data-testid="zone-score-strip" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          {title || 'IE Scores · Datos en vivo'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {showSeed ? (
            <span data-testid="score-badge-seed" style={{
              padding: '3px 10px',
              background: 'rgba(245,158,11,0.14)',
              border: '1px solid rgba(245,158,11,0.28)',
              borderRadius: 9999,
              color: '#fcd34d',
              fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Estimado · {data.real_count}/{data.total_recipes}
            </span>
          ) : (
            <span data-testid="score-badge-real" style={{
              padding: '3px 10px',
              background: 'rgba(34,197,94,0.14)',
              border: '1px solid rgba(34,197,94,0.28)',
              borderRadius: 9999,
              color: '#86efac',
              fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkle size={9} /> Datos reales · {data.real_count} scores
            </span>
          )}
        </div>
      </div>

      {data.scores.length === 0 ? (
        <div style={{
          padding: 18, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)',
        }}>
          Aún no calculamos scores reales para <strong>{zoneId}</strong>. Mostramos el mapa educativo con lectura estimada.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.scores.slice(0, limit).map(s => (
            <ScorePill key={s.code} score={s} onClick={onScoreClick} />
          ))}
          {data.scores.length > limit && (
            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: 'rgba(99,102,241,0.06)',
              border: '1px dashed rgba(99,102,241,0.28)',
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)',
            }}>
              <Database size={11} color="var(--indigo-3)" />
              +{data.scores.length - limit} scores más
            </div>
          )}
        </div>
      )}
    </div>
  );
}
