// W3.1A Phase 5 — ZoneScoreBreakdown: drawer with 6 dimension cards
import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { getZoneScore } from '../../api/phase5Foundation';
import { Z } from '../../styles/zIndex';

const LETTER_COLOR = {
  A: '#22C55E', B: '#84CC16', C: '#F59E0B',
  D: '#F97316', E: '#EF4444', F: '#DC2626',
};

const DIMENSIONS = [
  { key: 'liquidez',      label: 'Liquidez',            tooltip: 'Velocidad de absorción y tiempo en mercado. Placeholder hasta W3.3 DRPI.' },
  { key: 'supply',        label: 'Presión de oferta',   tooltip: 'Relación unidades activas vs absorbidas del cubo W2.5.' },
  { key: 'demand',        label: 'Crecimiento demanda', tooltip: 'Variación de leads e interés de búsqueda en los últimos 30d.' },
  { key: 'risk',          label: 'Riesgo',              tooltip: 'Score multi-fuente. Placeholder hasta W3.4.' },
  { key: 'yield_score',   label: 'Yield estimado',      tooltip: 'Rendimiento esperado: renta anual / precio mediano × 100.' },
  { key: 'denue_density', label: 'Densidad DENUE',      tooltip: 'Negocios por km² en la zona según INEGI DENUE.' },
];

function DimBar({ value }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#84CC16' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ height: 6, background: 'rgba(var(--cream-rgb),0.08)', borderRadius: 9999, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: color, borderRadius: 9999,
        transition: 'width 600ms cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  );
}

function DimCard({ dim, value, placeholder }) {
  const [tip, setTip] = useState(false);
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(var(--cream-rgb),0.03)',
      border: '1px solid rgba(var(--cream-rgb),0.07)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream-2)' }}>
            {dim.label}
          </span>
          {placeholder && (
            <span style={{
              fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(var(--cream-rgb),0.4)',
              border: '1px solid rgba(var(--cream-rgb),0.1)', borderRadius: 9999,
              padding: '1px 5px',
            }}>estimado</span>
          )}
          <button
            onClick={() => setTip(!tip)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            title={dim.tooltip}
          >
            <Activity size={10} color="rgba(var(--cream-rgb),0.3)" />
          </button>
        </div>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream)', letterSpacing: '-0.02em',
        }}>
          {Math.round(value ?? 0)}
        </span>
      </div>
      <DimBar value={value} />
      {tip && (
        <p style={{
          fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
          marginTop: 6, lineHeight: 1.5,
        }}>
          {dim.tooltip}
        </p>
      )}
    </div>
  );
}

export default function ZoneScoreBreakdown({ zone_id, zone_name, score_letter, score_numeric, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!zone_id) return;
    getZoneScore(zone_id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [zone_id]);

  const comps = data?.components || {};
  const flags = data?.placeholder_flags || {};
  const letter = data?.score_letter || score_letter;
  const numeric = data?.score_numeric ?? score_numeric;
  const color = LETTER_COLOR[letter] || 'var(--theme)';

  return (
    <div
      data-testid="zone-score-breakdown-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL,
        background: 'rgba(var(--bg-rgb),0.72)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        data-testid="zone-score-breakdown-drawer"
        style={{
          width: '100%', maxWidth: 420,
          height: '100%', overflowY: 'auto',
          background: 'rgba(var(--bg-rgb),0.97)',
          border: '1px solid rgba(var(--cream-rgb),0.08)',
          padding: '24px 20px',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0,
          background: 'rgba(var(--bg-rgb),0.98)', padding: '0 0 12px',
          borderBottom: '1px solid rgba(var(--cream-rgb),0.07)', zIndex: Z.BASE,
        }}>
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Zone Score · {zone_name || zone_id}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
                color, letterSpacing: '-0.03em',
              }}>{letter}</span>
              <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream-2)' }}>
                {numeric}/100
              </span>
            </div>
          </div>
          <button
            data-testid="zone-score-breakdown-close"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 9999, padding: '6px 8px', cursor: 'pointer' }}
          >
            <X size={14} color="var(--cream-3)" />
          </button>
        </div>

        {loading ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 12 }}>
            Cargando dimensiones…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DIMENSIONS.map(dim => (
              <DimCard
                key={dim.key}
                dim={dim}
                value={comps[dim.key] ?? 50}
                placeholder={flags[dim.key]}
              />
            ))}
          </div>
        )}

        <p style={{
          fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(var(--cream-rgb),0.25)',
          lineHeight: 1.5, marginTop: 'auto',
        }}>
          Score compuesto de 6 dimensiones. Dimensiones marcadas "estimado" serán sustituidas
          por datos reales en W3.3 (DRPI) y W3.4 (Risk).
          Formula v{data?.formula_version || '1.0.0'} · via DMX
        </p>
      </div>
    </div>
  );
}
