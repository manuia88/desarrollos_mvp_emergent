/**
 * W4.18.2A — MapFilters
 * Filtros: precio range + m2 + IE score + tipo (preventa|usada|both)
 * Aplica al llamar onApply({ min_price, max_price, min_m2, max_m2, min_score, type })
 */
import React, { useState } from 'react';

const INPUT_STYLE = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
  boxSizing: 'border-box',
};

const LABEL_STYLE = {
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
  color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 4, display: 'block',
};

export default function MapFilters({ onApply }) {
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minScore, setMinScore] = useState('');
  const [type, setType]         = useState('both');

  const handleApply = () => {
    onApply({
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      min_score: minScore || undefined,
      type: type !== 'both' ? type : undefined,
    });
  };

  const handleReset = () => {
    setMinPrice(''); setMaxPrice(''); setMinScore(''); setType('both');
    onApply({});
  };

  return (
    <div data-testid="map-filters" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Filtros
      </div>

      {/* Precio */}
      <div>
        <label style={LABEL_STYLE}>Precio (MXN)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input
            data-testid="filter-min-price"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            placeholder="Min 3,000,000"
            type="number"
            style={INPUT_STYLE}
          />
          <input
            data-testid="filter-max-price"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            placeholder="Max 10,000,000"
            type="number"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* IE Score */}
      <div>
        <label style={LABEL_STYLE}>IE Score mínimo</label>
        <input
          data-testid="filter-min-score"
          value={minScore}
          onChange={e => setMinScore(e.target.value)}
          placeholder="ej. 70"
          type="number"
          min="0" max="100"
          style={INPUT_STYLE}
        />
      </div>

      {/* Tipo */}
      <div>
        <label style={LABEL_STYLE}>Tipo de propiedad</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { val: 'both', label: 'Todos' },
            { val: 'preventa', label: 'Preventa' },
            { val: 'usada', label: 'Usada' },
          ].map(opt => (
            <button
              key={opt.val}
              data-testid={`filter-type-${opt.val}`}
              onClick={() => setType(opt.val)}
              style={{
                padding: '7px 0', borderRadius: '9999px', border: 'none',
                background: type === opt.val ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(255,255,255,0.05)',
                color: type === opt.val ? '#fff' : 'rgba(240,235,224,0.5)',
                fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: type === opt.val ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid="filter-apply-btn"
          onClick={handleApply}
          style={{
            flex: 1, padding: '9px', borderRadius: '9999px',
            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Aplicar filtros
        </button>
        <button
          data-testid="filter-reset-btn"
          onClick={handleReset}
          style={{
            padding: '9px 14px', borderRadius: '9999px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
          }}
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
