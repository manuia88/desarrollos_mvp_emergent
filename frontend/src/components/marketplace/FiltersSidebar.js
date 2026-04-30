// FiltersSidebar — marketplace filters
import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '../icons';

const TIPOS = ['dept', 'casa', 'ph', 'loft'];
const TAGS = ['preventa', 'inmediata', 'remate', 'exclusiva', 'nuevo'];
const AMENITIES = ['gym', 'roof', 'alberca', 'concierge', 'pet', 'seguridad', 'estacionamiento'];

export default function FiltersSidebar({ colonias = [], filters, setFilters }) {
  const { t } = useTranslation();

  const toggle = (key, value) => {
    const cur = filters[key] || [];
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    setFilters({ ...filters, [key]: next });
  };

  const set = (key, value) => setFilters({ ...filters, [key]: value });
  const clearAll = () => setFilters({});

  const Section = ({ title, children }) => (
    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );

  const numInput = (key, placeholder) => (
    <input
      data-testid={`filter-${key}`}
      type="number"
      placeholder={placeholder}
      value={filters[key] || ''}
      onChange={e => set(key, e.target.value ? Number(e.target.value) : undefined)}
      style={{
        width: '100%', height: 36,
        background: 'var(--bg-3)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '0 12px',
        fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)',
        outline: 'none',
      }}
    />
  );

  return (
    <aside
      data-testid="filters-sidebar"
      style={{
        width: '100%',
        background: '#0D1118',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '18px 20px',
        position: 'sticky', top: 80,
        maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
          {t('marketplace.filters_title')}
        </div>
        <button onClick={clearAll} data-testid="clear-filters"
          style={{ background: 'none', border: 'none', color: 'var(--indigo-3)',
            fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <X size={11} /> {t('marketplace.clear_filters')}
        </button>
      </div>

      <Section title={t('marketplace.filter.colonia')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {colonias.map(c => {
            const active = (filters.colonia || []).includes(c.id);
            return (
              <button key={c.id}
                data-testid={`fc-colonia-${c.id}`}
                onClick={() => toggle('colonia', c.id)}
                className={`filter-chip${active ? ' active' : ''}`}
                style={{ fontSize: 11, padding: '4px 10px' }}>
                {c.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('marketplace.filter.price')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {numInput('min_price', t('marketplace.filter.price_min'))}
          {numInput('max_price', t('marketplace.filter.price_max'))}
        </div>
      </Section>

      <Section title={t('marketplace.filter.sqm')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {numInput('min_sqm', t('marketplace.filter.sqm_min'))}
          {numInput('max_sqm', t('marketplace.filter.sqm_max'))}
        </div>
      </Section>

      <Section title={t('marketplace.filter.beds')}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4].map(n => {
            const active = filters.beds === n;
            return (
              <button key={n}
                data-testid={`fc-beds-${n}`}
                onClick={() => set('beds', active ? undefined : n)}
                className={`filter-chip${active ? ' active' : ''}`}>
                {n}+
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('marketplace.filter.baths')}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(n => {
            const active = filters.baths === n;
            return (
              <button key={n}
                data-testid={`fc-baths-${n}`}
                onClick={() => set('baths', active ? undefined : n)}
                className={`filter-chip${active ? ' active' : ''}`}>
                {n}+
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('marketplace.filter.tipo')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TIPOS.map(tp => {
            const active = filters.tipo === tp;
            return (
              <button key={tp}
                data-testid={`fc-tipo-${tp}`}
                onClick={() => set('tipo', active ? undefined : tp)}
                className={`filter-chip${active ? ' active' : ''}`}>
                {t(`marketplace.tipo.${tp}`)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('marketplace.filter.tag')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAGS.map(tg => {
            const active = filters.tag === tg;
            return (
              <button key={tg}
                data-testid={`fc-tag-${tg}`}
                onClick={() => set('tag', active ? undefined : tg)}
                className={`filter-chip${active ? ' active' : ''}`}>
                {t(`listings.tag.${tg}`)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('marketplace.filter.amenities')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AMENITIES.map(a => {
            const active = (filters.amenity || []).includes(a);
            return (
              <button key={a}
                data-testid={`fc-amenity-${a}`}
                onClick={() => toggle('amenity', a)}
                className={`filter-chip${active ? ' active' : ''}`}>
                {t(`detail.amenity.${a}`)}
              </button>
            );
          })}
        </div>
      </Section>
    </aside>
  );
}
