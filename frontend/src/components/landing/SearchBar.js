// SearchBar — overlaps hero bottom with -32px margin-top
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from '../icons';

export default function SearchBar() {
  const { t } = useTranslation();
  const TABS = [
    { key: 'buy', label: t('search.tab_buy') },
    { key: 'rent', label: t('search.tab_rent') },
    { key: 'invest', label: t('search.tab_invest') },
    { key: 'dev', label: t('search.tab_dev') },
  ];
  const TIPOS = ['dept', 'casa', 'ph', 'loft', 'local', 'oficina', 'terreno'];
  const PRECIOS = ['any', 'u3', '3_6', '6_12', '12_25', 'p25'];
  const CHIP_KEYS = ['preventa', 'inmediata', 'estacionamiento', 'pet', 'roof', 'gym', 'seguridad', 'alberca'];
  const DEFAULT_ACTIVE = { preventa: true, inmediata: true, estacionamiento: true };

  const [activeTab, setActiveTab] = useState('buy');
  const [activeChips, setActiveChips] = useState(DEFAULT_ACTIVE);

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
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            data-testid={`search-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 16px',
              borderRadius: 9999,
              border: 'none',
              background: activeTab === tab.key ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: activeTab === tab.key ? 'var(--indigo-3)' : 'var(--cream-3)',
              fontFamily: 'DM Sans',
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'center' }} className="search-row">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Search size={16} color="var(--cream-3)" />
          </div>
          <input
            data-testid="search-input"
            type="text"
            placeholder={t('search.placeholder')}
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

        <select
          data-testid="search-tipo"
          style={{
            height: 48, background: 'var(--bg-3)',
            border: '1px solid var(--border)', borderRadius: 9999,
            padding: '0 16px', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--cream-2)', outline: 'none', cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none',
          }}
        >
          <option value="">{t('search.type_label')}</option>
          {TIPOS.map(k => <option key={k} value={k}>{t(`search.type_options.${k}`)}</option>)}
        </select>

        <select
          data-testid="search-precio"
          style={{
            height: 48, background: 'var(--bg-3)',
            border: '1px solid var(--border)', borderRadius: 9999,
            padding: '0 16px', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--cream-2)', outline: 'none', cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none',
          }}
        >
          {PRECIOS.map(k => <option key={k} value={k}>{t(`search.price_options.${k}`)}</option>)}
        </select>

        <button className="btn btn-primary" data-testid="search-submit-btn" style={{ height: 48, padding: '0 20px', fontSize: 14 }}>
          <Search size={14} />
          {t('search.submit')}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {CHIP_KEYS.map(k => (
          <button
            key={k}
            data-testid={`filter-chip-${k}`}
            onClick={() => setActiveChips(c => ({ ...c, [k]: !c[k] }))}
            className={`filter-chip${activeChips[k] ? ' active' : ''}`}
          >
            {t(`search.chips.${k}`)}
          </button>
        ))}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .search-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
