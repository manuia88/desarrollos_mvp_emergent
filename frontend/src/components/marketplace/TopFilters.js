// Horizontal sticky filter bar — dropdowns: Ubicación, Tipo, Precio, Recámaras, Más filtros
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, Search, Sparkle } from '../icons';
import { Z } from '../../styles/zIndex';

function Popover({ label, testId, children, badge, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '9px 14px',
          background: badge > 0 ? 'rgba(var(--theme-rgb),0.14)' : 'var(--bg-3)',
          border: `1px solid ${badge > 0 ? 'rgba(var(--theme-rgb),0.4)' : 'var(--border)'}`,
          borderRadius: 9999,
          fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
          color: badge > 0 ? 'var(--indigo-3)' : 'var(--cream-2)',
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        {label}
        {badge > 0 && (
          <span style={{
            background: 'var(--grad)', color: '#fff',
            borderRadius: 9999, padding: '0 6px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, minWidth: 16, textAlign: 'center',
          }}>{badge}</span>
        )}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 280, zIndex: Z.DROPDOWN,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-2)',
          borderRadius: 14, padding: 16,
          boxShadow: 'var(--sh-elev)',
        }}>
          {children}
          {badge > 0 && onClear && (
            <button onClick={() => { onClear(); setOpen(false); }} data-testid={`clear-${testId}`}
              style={{
                marginTop: 10, background: 'none', border: 'none',
                color: 'var(--indigo-3)', fontFamily: 'DM Sans', fontSize: 12,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <X size={10} /> Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopFilters({ colonias, filters, setFilters, sort, setSort, onAIQuery, aiLoading, aiFilters, onAIClear }) {
  const { t, i18n } = useTranslation();
  const [aiText, setAiText] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [locQuery, setLocQuery] = useState('');   // Ubicación · buscador abierto (no lista fija)

  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const toggle = (k, v) => {
    const cur = filters[k] || [];
    set(k, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
  };

  // Tipo = Casa/Departamento · Etapa = Preventa/Entrega inmediata · si preventa → plazo de entrega.
  const TIPOS = [['departamento', 'Departamento'], ['casa', 'Casa']];
  const ETAPAS = [['preventa', 'Preventa'], ['entrega_inmediata', 'Entrega inmediata']];
  const PLAZOS = [['menos_3', 'En menos de 3 meses'], ['3_6', '3 a 6 meses'], ['6_12', '6 a 12 meses'], ['mas_12', 'Más de 12 meses']];
  const AMENITIES = ['balcon', 'terraza', 'roof_garden', 'gym', 'alberca', 'concierge', 'pet', 'seguridad', 'spa', 'cowork', 'bicicletas', 'salon_eventos'];
  const AMEN_LABEL = { balcon: 'Balcón', terraza: 'Terraza', roof_garden: 'Roof garden', gym: 'Gym', alberca: 'Alberca', concierge: 'Concierge', pet: 'Pet friendly', seguridad: 'Seguridad', spa: 'Spa', cowork: 'Coworking', bicicletas: 'Bicicletas', salon_eventos: 'Salón de eventos' };
  // Ubicación buscable sobre TODAS las colonias reales.
  const locSug = locQuery.trim().length >= 2
    ? (colonias || []).filter(c => (c.name || '').toLowerCase().includes(locQuery.toLowerCase()) && !(filters.colonia || []).includes(c.id)).slice(0, 6)
    : [];
  const locName = (id) => (colonias || []).find(c => c.id === id)?.name || id;
  const PRICES = [
    { k: 'u3', min: 0, max: 3000000, label: i18n.language === 'en' ? 'Under $3M' : 'Hasta $3M' },
    { k: 'u6', min: 3000000, max: 6000000, label: '$3M — $6M' },
    { k: 'u12', min: 6000000, max: 12000000, label: '$6M — $12M' },
    { k: 'u25', min: 12000000, max: 25000000, label: '$12M — $25M' },
    { k: 'p25', min: 25000000, max: null, label: i18n.language === 'en' ? 'Over $25M' : 'Más de $25M' },
  ];

  const onAISubmit = (e) => {
    e.preventDefault();
    if (!aiText.trim()) return;
    onAIQuery(aiText.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* AI search input */}
      <form onSubmit={onAISubmit} data-testid="ai-search-form" style={{ position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(140deg, rgba(var(--theme-rgb),0.12) 0%, rgba(var(--theme-rgb),0.06) 100%)',
          border: '1px solid rgba(var(--theme-rgb),0.30)',
          borderRadius: 14,
          padding: '6px 6px 6px 18px',
        }}>
          <Sparkle size={16} color="var(--indigo-3)" />
          <input
            data-testid="ai-search-input"
            type="text"
            placeholder={t('marketplace_v2.ai_placeholder')}
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            style={{
              flex: 1, height: 42,
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)',
            }}
          />
          <button type="submit" data-testid="ai-search-submit" className="btn btn-primary btn-sm"
            disabled={aiLoading || !aiText.trim()}
            style={{ opacity: aiLoading || !aiText.trim() ? 0.6 : 1 }}>
            {aiLoading ? '…' : <><Search size={12} />{t('marketplace_v2.ai_submit')}</>}
          </button>
        </div>

        {aiFilters && Object.keys(aiFilters).length > 0 && (
          <div data-testid="ai-filters-chip" style={{
            marginTop: 8, padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.24)',
            borderRadius: 10,
          }}>
            <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--green)' }}>
              {t('marketplace_v2.ai_understood')}
            </span>
            {Object.entries(aiFilters).map(([k, v]) => (
              <span key={k} style={{
                padding: '2px 10px', borderRadius: 9999,
                background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid var(--border)',
                fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
              }}>
                <span style={{ color: 'var(--cream-3)' }}>{k}:</span>{' '}
                {Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? v.toLocaleString() : String(v)}
              </span>
            ))}
            <button onClick={onAIClear} data-testid="ai-clear"
              style={{
                marginLeft: 'auto',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <X size={10} /> {t('marketplace_v2.ai_clear')}
            </button>
          </div>
        )}
      </form>

      {/* Horizontal filter pills */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Location */}
        <Popover
          label={t('marketplace_v2.filter_location')}
          testId="filter-location"
          badge={(filters.colonia || []).length}
          onClear={() => { set('colonia', []); setLocQuery(''); }}>
          <div style={{ width: 250 }}>
            {/* Buscador ABIERTO sobre las ~1,800 colonias reales (no lista fija que rompa la búsqueda). */}
            {(filters.colonia || []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {(filters.colonia || []).map(id => (
                  <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, background: 'var(--theme)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12 }}>
                    {locName(id)}<span onClick={() => toggle('colonia', id)} style={{ cursor: 'pointer', fontWeight: 800 }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <input data-testid="loc-search" value={locQuery} onChange={e => setLocQuery(e.target.value)}
              placeholder="Escribe una colonia o zona…"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-3)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', outline: 'none', boxSizing: 'border-box' }} />
            {locSug.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                {locSug.map(c => (
                  <button key={c.id} data-testid={`loc-${c.id}`} onClick={() => { toggle('colonia', c.id); setLocQuery(''); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', textAlign: 'left' }}>
                    <span>{c.name}</span><span style={{ fontSize: 10, color: 'var(--cream-3)' }}>{c.alcaldia}</span>
                  </button>
                ))}
              </div>
            )}
            {locQuery.trim().length >= 2 && locSug.length === 0 && <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Sin resultados. Prueba otro nombre.</div>}
          </div>
        </Popover>

        {/* Type · Casa/Departamento + Etapa + (si preventa) plazo de entrega */}
        <Popover
          label="Tipo"
          testId="filter-type"
          badge={(filters.tipo ? 1 : 0) + (filters.stage ? 1 : 0)}
          onClear={() => setFilters({ ...filters, tipo: undefined, stage: undefined, plazo: undefined })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 230 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Tipo de propiedad</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {TIPOS.map(([k, label]) => (
                <button key={k} data-testid={`type-${k}`} onClick={() => set('tipo', filters.tipo === k ? undefined : k)}
                  className={`filter-chip${filters.tipo === k ? ' active' : ''}`} style={{ flex: 1 }}>{label}</button>
              ))}
            </div>
            <div className="eyebrow" style={{ margin: '10px 0 2px' }}>Etapa</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {ETAPAS.map(([k, label]) => (
                <button key={k} data-testid={`stage-${k}`} onClick={() => set('stage', filters.stage === k ? undefined : k)}
                  className={`filter-chip${filters.stage === k ? ' active' : ''}`} style={{ flex: 1, fontSize: 12 }}>{label}</button>
              ))}
            </div>
            {filters.stage === 'preventa' && (
              <>
                <div className="eyebrow" style={{ margin: '10px 0 2px' }}>¿Cuándo la entregan?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {PLAZOS.map(([k, label]) => (
                    <button key={k} data-testid={`plazo-${k}`} onClick={() => set('plazo', filters.plazo === k ? undefined : k)}
                      className={`filter-chip${filters.plazo === k ? ' active' : ''}`} style={{ justifyContent: 'flex-start' }}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Popover>

        {/* Price · rango libre desde/hasta */}
        <Popover
          label={t('marketplace_v2.filter_price')}
          testId="filter-price"
          badge={filters.min_price || filters.max_price ? 1 : 0}
          onClear={() => setFilters({ ...filters, min_price: undefined, max_price: undefined })}>
          <div style={{ width: 240 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 8 }}>Elige tu rango (ej. $10M a $11M).</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Desde $" data-testid="price-min" value={filters.min_price || ''}
                onChange={e => set('min_price', e.target.value ? +e.target.value : undefined)} style={drawerInputStyle} />
              <input type="number" placeholder="Hasta $" data-testid="price-max" value={filters.max_price || ''}
                onChange={e => set('max_price', e.target.value ? +e.target.value : undefined)} style={drawerInputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {[['Hasta $5M', undefined, 5e6], ['$5–10M', 5e6, 1e7], ['$10–20M', 1e7, 2e7], ['+$20M', 2e7, undefined]].map(([lab, mn, mx]) => (
                <button key={lab} onClick={() => setFilters({ ...filters, min_price: mn, max_price: mx })} className="filter-chip" style={{ fontSize: 11.5 }}>{lab}</button>
              ))}
            </div>
          </div>
        </Popover>

        {/* Beds */}
        <Popover
          label={t('marketplace_v2.filter_beds')}
          testId="filter-beds"
          badge={filters.beds ? 1 : 0}
          onClear={() => set('beds', undefined)}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4].map(n => {
              const active = filters.beds === n;
              return (
                <button key={n}
                  data-testid={`beds-${n}`}
                  onClick={() => set('beds', active ? undefined : n)}
                  className={`filter-chip${active ? ' active' : ''}`}
                  style={{ minWidth: 36 }}>
                  {n}+
                </button>
              );
            })}
          </div>
        </Popover>

        {/* More filters drawer button */}
        <button
          data-testid="filter-more"
          onClick={() => setMoreOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 14px',
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 9999,
            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
            color: 'var(--cream-2)',
            cursor: 'pointer',
          }}>
          {t('marketplace_v2.filter_more')}
        </button>

        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('marketplace_v2.sort_label')}</span>
          <select
            data-testid="sort-select"
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 9999, padding: '7px 14px',
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
              outline: 'none', cursor: 'pointer',
            }}>
            <option value="recent">{t('marketplace_v2.sort_recent')}</option>
            <option value="price_asc">{t('marketplace_v2.sort_price_asc')}</option>
            <option value="price_desc">{t('marketplace_v2.sort_price_desc')}</option>
            <option value="sqm_desc">{t('marketplace_v2.sort_sqm_desc')}</option>
          </select>
        </div>
      </div>

      {/* More filters drawer */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
            background: 'rgba(var(--bg-rgb),0.78)',
            backdropFilter: 'blur(12px)',
            display: 'flex', justifyContent: 'flex-end',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            data-testid="more-filters-drawer"
            style={{
              width: 420, maxWidth: '100%', height: '100%',
              background: 'var(--surface-card)', borderLeft: '1px solid var(--border-2)',
              padding: 24, overflowY: 'auto',
              animation: 'slidein 0.25s ease-out',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
                {t('marketplace_v2.more_filters_h')}
              </div>
              <button onClick={() => setMoreOpen(false)} className="btn-icon-circle" data-testid="more-close">
                <X size={12} />
              </button>
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t('marketplace_v2.more_sqm')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
              <input type="number" placeholder="m² desde" data-testid="more-min-sqm"
                value={filters.min_sqm || ''}
                onChange={e => set('min_sqm', e.target.value ? +e.target.value : undefined)}
                style={drawerInputStyle} />
              <input type="number" placeholder="m² hasta" data-testid="more-max-sqm"
                value={filters.max_sqm || ''}
                onChange={e => set('max_sqm', e.target.value ? +e.target.value : undefined)}
                style={drawerInputStyle} />
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t('marketplace_v2.more_baths')}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[1, 2, 3].map(n => {
                const active = filters.baths === n;
                return (
                  <button key={n} data-testid={`more-baths-${n}`}
                    onClick={() => set('baths', active ? undefined : n)}
                    className={`filter-chip${active ? ' active' : ''}`}>
                    {n}+
                  </button>
                );
              })}
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t('marketplace_v2.more_parking')}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[1, 2, 3].map(n => {
                const active = filters.parking === n;
                return (
                  <button key={n} data-testid={`more-parking-${n}`}
                    onClick={() => set('parking', active ? undefined : n)}
                    className={`filter-chip${active ? ' active' : ''}`}>
                    {n}+
                  </button>
                );
              })}
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t('marketplace_v2.more_amenity')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {AMENITIES.map(a => {
                const active = (filters.amenity || []).includes(a);
                return (
                  <button key={a}
                    data-testid={`more-amenity-${a}`}
                    onClick={() => toggle('amenity', a)}
                    className={`filter-chip${active ? ' active' : ''}`}>
                    {AMEN_LABEL[a] || a}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setFilters({})} data-testid="more-reset" className="btn btn-glass" style={{ flex: 1 }}>
                {t('marketplace_v2.filter_reset')}
              </button>
              <button onClick={() => setMoreOpen(false)} data-testid="more-apply" className="btn btn-primary" style={{ flex: 1 }}>
                {t('marketplace_v2.filter_apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slidein { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

const drawerInputStyle = {
  height: 40, background: 'var(--bg-3)',
  border: '1px solid var(--border)', borderRadius: 10,
  padding: '0 12px', fontFamily: 'DM Sans', fontSize: 13,
  color: 'var(--cream)', outline: 'none',
};
