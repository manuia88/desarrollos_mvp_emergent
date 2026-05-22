// W5.x F4.2 Sub-D · ComparatorPage · entry point /portal/comparador
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ComparatorPicker from '../../../components/comparator/ComparatorPicker';
import ComparatorTable from '../../../components/comparator/ComparatorTable';
import { postCompare } from '../../../api/compare';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';

const BASKET_KEY = 'comparator_basket';

function readBasket() {
  try {
    const raw = localStorage.getItem(BASKET_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 3);
  } catch {
    return [];
  }
}

function writeBasket(items) {
  try {
    localStorage.setItem(BASKET_KEY, JSON.stringify(items.slice(0, 3)));
  } catch {
    /* ignore */
  }
}

export default function ComparatorPage() {
  const { t } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [audience, setAudience] = useState('neutral');
  const [scope] = useState('project');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Init from query string ?ids=A,B,C  or localStorage basket
  useEffect(() => {
    const ids = (searchParams.get('ids') || '').split(',').filter(Boolean);
    if (ids.length) {
      const built = ids.slice(0, 3).map((id) => ({ entity_id: id, title: id }));
      setItems(built);
      writeBasket(built);
      return;
    }
    const basket = readBasket();
    if (basket.length) setItems(basket);
    const aud = searchParams.get('audience');
    if (aud) setAudience(aud);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync basket to localStorage on items change
  useEffect(() => {
    writeBasket(items);
  }, [items]);

  const onAdd = (it) => {
    setItems((prev) => {
      if (prev.length >= 3) return prev;
      if (prev.some((p) => p.entity_id === it.entity_id)) return prev;
      return [...prev, it];
    });
  };
  const onRemove = (eid) => setItems((prev) => prev.filter((p) => p.entity_id !== eid));

  const onCompare = async () => {
    setErr('');
    setLoading(true);
    try {
      const r = await postCompare({
        scope,
        entity_ids: items.map((i) => i.entity_id),
        audience,
      });
      setResult(r);
      // sync URL
      const next = new URLSearchParams(searchParams);
      next.set('ids', items.map((i) => i.entity_id).join(','));
      next.set('audience', audience);
      setSearchParams(next, { replace: true });
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('comparator.error_generic'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const mergedItems = useMemo(() => {
    if (!result?.items) return [];
    // Mantener orden de items[] del picker · enriquecer con labels del backend
    return result.items.map((bi) => {
      const local = items.find((i) => i.entity_id === bi.entity_id);
      return { ...bi, title: bi.title || local?.title || bi.entity_id };
    });
  }, [result, items]);

  return (
    <div data-testid="comparator-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '56px 24px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>DesarrollosMX · Tools</div>
        <h1 style={{ margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 'clamp(2rem, 3.6vw, 2.6rem)', lineHeight: 1.08 }}>{t('comparator.title')}</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: 15, maxWidth: 720 }}>{t('comparator.subtitle')}</p>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 24 }}>
        <ComparatorPicker
          items={items}
          onAdd={onAdd}
          onRemove={onRemove}
          onCompare={onCompare}
          audience={audience}
          onAudienceChange={setAudience}
          loading={loading}
        />

        {err && (
          <div data-testid="comparator-error" style={{ padding: '14px 18px', borderRadius: 18, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.32)', color: CREAM }}>{err}</div>
        )}

        {items.length === 0 && !result && (
          <div data-testid="comparator-empty" style={{
            padding: '32px 28px', borderRadius: 24, background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(240,235,224,0.10)',
            backdropFilter: 'blur(24px)', textAlign: 'center', color: MUTED,
          }}>
            {t('comparator.empty_state')}{' '}
            <button type="button" data-testid="btn-go-marketplace" onClick={() => navigate('/inmuebles')} style={{
              marginLeft: 8, padding: '6px 14px', borderRadius: 9999, border: 'none',
              background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#FFF',
              fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>{t('comparator.add_property')}</button>
          </div>
        )}

        {(result || loading) && (
          <ComparatorTable
            items={mergedItems}
            audience={audience}
            verdict={result?.ai_verdict}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}
