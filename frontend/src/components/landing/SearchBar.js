// SearchBar — overlaps hero bottom with -32px margin-top
// Tabs: Comprar / Rentar / Invertir / Desarrolladores
// Grid row: 2fr 1fr 1fr auto
import React, { useState } from 'react';
import { Search } from '../icons';

const TABS = ['Comprar', 'Rentar', 'Invertir', 'Desarrolladores'];
const TIPOS = ['Departamento', 'Casa', 'Penthouse', 'Local', 'Oficina', 'Terreno'];
const PRECIOS = ['Cualquier precio', 'Hasta $3M', '$3M – $6M', '$6M – $12M', 'Más de $12M'];
const FILTER_CHIPS = [
  { label: 'Preventa', active: true },
  { label: 'Entrega inmediata', active: true },
  { label: 'Con estacionamiento', active: true },
  { label: 'Pet friendly', active: false },
  { label: 'Roof garden', active: false },
  { label: 'Gimnasio', active: false },
  { label: 'Vigilancia 24h', active: false },
  { label: 'Alberca', active: false },
];

export default function SearchBar() {
  const [activeTab, setActiveTab] = useState('Comprar');
  const [chips, setChips] = useState(FILTER_CHIPS);

  const toggleChip = (i) =>
    setChips(c => c.map((x, idx) => idx === i ? { ...x, active: !x.active } : x));

  return (
    <section
      data-testid="search-bar"
      style={{
        maxWidth: 920,
        margin: '-32px auto 0',
        padding: '24px 28px',
        background: '#0D1118',
        border: '1px solid var(--border-2)',
        borderRadius: 20,
        boxShadow: 'var(--sh-elev)',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            data-testid={`search-tab-${tab.toLowerCase()}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 16px',
              borderRadius: 9999,
              border: 'none',
              background: activeTab === tab ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: activeTab === tab ? 'var(--indigo-3)' : 'var(--cream-3)',
              fontFamily: 'DM Sans',
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
        {/* Text input */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Search size={16} color="var(--cream-3)" />
          </div>
          <input
            data-testid="search-input"
            type="text"
            placeholder="Colonia, alcaldía o descripción..."
            style={{
              width: '100%',
              height: 48,
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 9999,
              padding: '0 18px 0 42px',
              fontFamily: 'DM Sans',
              fontSize: 14,
              color: 'var(--cream)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Tipología select */}
        <select
          data-testid="search-tipo"
          style={{
            height: 48,
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
            padding: '0 16px',
            fontFamily: 'DM Sans',
            fontSize: 13,
            color: 'var(--cream-2)',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          <option value="">Tipología</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Precio select */}
        <select
          data-testid="search-precio"
          style={{
            height: 48,
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
            padding: '0 16px',
            fontFamily: 'DM Sans',
            fontSize: 13,
            color: 'var(--cream-2)',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          {PRECIOS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Submit */}
        <button
          className="btn btn-primary"
          data-testid="search-submit-btn"
          style={{ height: 48, padding: '0 20px', fontSize: 14 }}
        >
          <Search size={14} />
          Buscar
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {chips.map((chip, i) => (
          <button
            key={chip.label}
            data-testid={`filter-chip-${i}`}
            onClick={() => toggleChip(i)}
            className={`filter-chip${chip.active ? ' active' : ''}`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <style>{`
        @media (max-width: 640px) {
          [data-testid="search-bar"] {
            margin: -16px 16px 0 !important;
            padding: 16px !important;
            grid-template-columns: 1fr !important;
          }
          [data-testid="search-bar"] > div:nth-child(2) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
