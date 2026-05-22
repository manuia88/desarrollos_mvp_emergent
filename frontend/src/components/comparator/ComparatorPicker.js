// W5.x F4.2 Sub-D · ComparatorPicker · busqueda + chips + audience selector
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';
import { searchMarketplace } from '../../api/compare';

const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const CREAM = '#F0EBE0';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const MUTED = 'rgba(240,235,224,0.62)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const AUD_KEYS = ['investor', 'family', 'first_home', 'luxury', 'neutral'];

const inputStyle = {
  width: '100%', padding: '12px 18px', borderRadius: 9999,
  background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.14)',
  color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  transition: `border-color 320ms ${EASE}`,
};

export default function ComparatorPicker({ items, onAdd, onRemove, onCompare, audience, onAudienceChange, max = 3, loading = false }) {
  const { t } = useTranslation('common');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [debouncing, setDebouncing] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setDebouncing(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await searchMarketplace(q);
      setResults(Array.isArray(r) ? r.slice(0, 8) : []);
      setDebouncing(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const canCompare = items.length >= 2 && items.length <= max && !loading;

  return (
    <section data-testid="comparator-picker" style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26,
      backdropFilter: 'blur(24px)', color: CREAM,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: INDIGO }}>{t('comparator.title')}</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, marginTop: 4 }}>{items.length} / {max}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: MUTED, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{t('comparator.audience_label')}</label>
          <select data-testid="audience-select" value={audience} onChange={(e) => onAudienceChange(e.target.value)} style={{
            ...inputStyle, padding: '8px 18px', width: 'auto', minWidth: 180,
          }}>
            {AUD_KEYS.map((k) => <option key={k} value={k}>{t(`comparator.audience_${k}`)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          data-testid="comparator-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('comparator.search_placeholder')}
          style={inputStyle}
          disabled={items.length >= max}
        />
        {debouncing && <span style={{ position: 'absolute', right: 18, top: 12, fontSize: 11, color: MUTED }}>...</span>}
      </div>

      {results.length > 0 && (
        <div data-testid="comparator-results" style={{
          background: 'rgba(13,16,23,0.85)', borderRadius: 18, border: BORDER, padding: 8, marginBottom: 14,
        }}>
          {results.map((r) => {
            const eid = r.id || r._id;
            const inBasket = items.some((i) => i.entity_id === eid);
            return (
              <button
                key={eid}
                type="button"
                data-testid={`result-${eid}`}
                disabled={inBasket || items.length >= max}
                onClick={() => { onAdd({ entity_id: eid, title: r.name || r.title || eid }); setQ(''); setResults([]); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', width: '100%',
                  padding: '10px 14px', borderRadius: 12, border: 'none',
                  background: 'transparent', color: CREAM, cursor: inBasket ? 'not-allowed' : 'pointer',
                  opacity: inBasket ? 0.45 : 1, textAlign: 'left',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                  transition: `background 320ms ${EASE}`,
                }}
                onMouseEnter={(e) => { if (!inBasket) e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{r.name || r.title || eid}</span>
                <Icons.Plus size={14} color={INDIGO} />
              </button>
            );
          })}
        </div>
      )}

      <div data-testid="comparator-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {items.map((it) => (
          <span key={it.entity_id} data-testid={`chip-${it.entity_id}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            borderRadius: 9999, background: 'rgba(99,102,241,0.18)', border: `1px solid ${INDIGO}55`,
            color: CREAM, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          }}>
            {it.title || it.entity_id}
            <button type="button" data-testid={`chip-remove-${it.entity_id}`} onClick={() => onRemove(it.entity_id)} style={{
              background: 'transparent', border: 'none', color: CREAM, cursor: 'pointer', padding: 0, lineHeight: 0,
            }} aria-label={t('comparator.btn_remove')}>
              <Icons.X size={12} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span style={{ color: MUTED, fontSize: 12 }}>{t('comparator.empty_state')}</span>}
      </div>

      <button
        type="button"
        data-testid="btn-compare"
        onClick={onCompare}
        disabled={!canCompare}
        style={{
          padding: '14px 34px', borderRadius: 9999, border: 'none', background: GRADIENT,
          color: '#FFF', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          cursor: canCompare ? 'pointer' : 'not-allowed', opacity: canCompare ? 1 : 0.45,
          transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
        }}
      >
        {loading ? t('comparator.loading') : t('comparator.btn_compare')}
      </button>
      {items.length >= max && (
        <div data-testid="max-items-warning" style={{ marginTop: 12, fontSize: 12, color: ROSE }}>
          {t('comparator.max_items_warning')}
        </div>
      )}
    </section>
  );
}
