// W5.x F4.2 Sub-D · ComparatorPicker · REDISEÑO CLARO Apple-tier
// - busqueda + chips + selector de perfil (7 perfiles que acepta el backend: compare.py CompareBody)
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';
import { searchMarketplace } from '../../api/compare';

// ── Sistema visual CLARO (Mapa.js / InversionV4Calculator.js) ────────────────
const INK = '#1E2230';
const INK_2 = '#5A5F6E';
const INK_3 = '#9AA0AE';
const BORDER = '#ECECEC';
const PANEL = '#FAFAFB';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// 7 perfiles · espejo exacto de backend/routes/compare.py CompareBody.audience
const AUD_KEYS = ['investor', 'family', 'first_home', 'luxury', 'boutique', 'urgent', 'neutral'];

const inputStyle = {
  width: '100%', padding: '11px 16px', borderRadius: 10,
  background: '#fff', border: `1px solid ${BORDER}`,
  color: INK, fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  transition: `border-color .15s ${EASE}, box-shadow .15s ${EASE}`, boxSizing: 'border-box',
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
    <section data-testid="comparator-picker" className="dmx-card" style={{
      background: '#fff', borderRadius: 18, padding: 24, color: INK,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--theme)', fontWeight: 800 }}>{t('comparator.picker_eyebrow')}</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, marginTop: 4, color: INK, letterSpacing: '-0.02em' }}>
            {items.length} / {max} <span style={{ fontSize: 13, color: INK_3, fontWeight: 600 }}>{t('comparator.picker_selected')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="cmp-audience" style={{ fontSize: 10.5, color: INK_3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t('comparator.audience_label')}</label>
          <select id="cmp-audience" data-testid="audience-select" value={audience} onChange={(e) => onAudienceChange(e.target.value)} style={{
            ...inputStyle, padding: '9px 16px', width: 'auto', minWidth: 190, cursor: 'pointer', fontWeight: 600,
          }}>
            {AUD_KEYS.map((k) => <option key={k} value={k}>{t(`comparator.audience_${k}`)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Icons.Search size={16} color={INK_3} style={{ position: 'absolute', left: 14, top: 13, pointerEvents: 'none' }} />
        <input
          data-testid="comparator-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('comparator.search_placeholder')}
          style={{ ...inputStyle, paddingLeft: 38 }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--theme-rgb),0.12)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none'; }}
          disabled={items.length >= max}
        />
        {debouncing && <span style={{ position: 'absolute', right: 16, top: 13, fontSize: 11, color: INK_3 }}>…</span>}
      </div>

      {results.length > 0 && (
        <div data-testid="comparator-results" style={{
          background: PANEL, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 6, marginBottom: 14,
        }}>
          {results.map((r) => {
            const eid = r.id || r._id;
            const inBasket = items.some((i) => i.entity_id === eid);
            const disabled = inBasket || items.length >= max;
            return (
              <button
                key={eid}
                type="button"
                data-testid={`result-${eid}`}
                disabled={disabled}
                onClick={() => { onAdd({ entity_id: eid, title: r.name || r.title || eid }); setQ(''); setResults([]); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  padding: '10px 12px', borderRadius: 9, border: 'none', background: 'transparent',
                  color: inBasket ? INK_3 : INK, cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled && !inBasket ? 0.5 : 1, textAlign: 'left',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 600,
                  transition: `background .14s ${EASE}`,
                }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.07)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{r.name || r.title || eid}{inBasket && <span style={{ marginLeft: 8, fontSize: 11, color: INK_3 }}>{t('comparator.already_added')}</span>}</span>
                {inBasket ? <Icons.Check size={15} color={'var(--theme)'} /> : <Icons.Plus size={15} color={'var(--theme)'} />}
              </button>
            );
          })}
        </div>
      )}

      <div data-testid="comparator-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {items.map((it) => (
          <span key={it.entity_id} data-testid={`chip-${it.entity_id}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 14px',
            borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.22)',
            color: INK, fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
          }}>
            {it.title || it.entity_id}
            <button type="button" data-testid={`chip-remove-${it.entity_id}`} onClick={() => onRemove(it.entity_id)} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%',
              background: 'rgba(16,18,28,0.06)', border: 'none', color: INK_2, cursor: 'pointer', padding: 0,
            }} aria-label={t('comparator.btn_remove')}>
              <Icons.X size={11} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span style={{ color: INK_3, fontSize: 13 }}>{t('comparator.empty_state')}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="btn-compare"
          onClick={onCompare}
          disabled={!canCompare}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 30px', borderRadius: 9999, border: 'none', background: 'var(--grad)',
            color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: canCompare ? 'pointer' : 'not-allowed', opacity: canCompare ? 1 : 0.4,
            transition: `transform .15s ${EASE}, opacity .15s ${EASE}, box-shadow .15s ${EASE}`,
            boxShadow: canCompare ? '0 8px 24px rgba(var(--theme-rgb),0.28)' : 'none',
          }}
          onMouseEnter={(e) => { if (canCompare) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
        >
          {loading ? <Icons.Loader2 size={15} className="cmp-spin" /> : <Icons.GitCompare size={15} />}
          {loading ? t('comparator.loading') : t('comparator.btn_compare')}
        </button>
        {items.length < 2 && (
          <span style={{ fontSize: 12.5, color: INK_3, fontFamily: 'DM Sans, sans-serif' }}>{t('comparator.need_two')}</span>
        )}
        <style>{'@keyframes cmpSpin{to{transform:rotate(360deg)}}.cmp-spin{animation:cmpSpin .9s linear infinite}'}</style>
      </div>

      {items.length >= max && (
        <div data-testid="max-items-warning" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--amber)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icons.Info size={13} /> {t('comparator.max_items_warning')}
        </div>
      )}
    </section>
  );
}
