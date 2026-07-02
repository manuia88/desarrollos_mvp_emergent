// W5.x F4.2 Sub-D · ComparatorPage · entry point /portal/comparador
// REDISEÑO CLARO Apple-tier · pasa deltas del backend a la tabla (fuente-de-verdad del ganador)
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import ComparatorPicker from '../../../components/comparator/ComparatorPicker';
import ComparatorTable from '../../../components/comparator/ComparatorTable';
import { postCompare } from '../../../api/compare';
import { tc } from '../../../lib/titleCase';
import ToolNav from '../../../components/ui/ToolNav';

// ── Sistema visual CLARO ──────────────────────────────────────────────────────
const BG = '#FAFAFB';
const INK = '#1E2230';
const INK_2 = '#5A5F6E';
const INK_3 = '#9AA0AE';
const BORDER = '#ECECEC';

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
    } else {
      const basket = readBasket();
      if (basket.length) setItems(basket);
    }
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
    <div data-testid="comparator-page" className="tool-surface" style={{ color: INK, fontFamily: 'DM Sans, sans-serif' }}>
      <ToolNav />
      <header style={{ padding: '40px 24px 20px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.16em', fontSize: 11, color: 'var(--theme)', textTransform: 'uppercase', fontWeight: 800 }}>{t('comparator.eyebrow_brand')}</div>
        <h1 style={{ margin: '10px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 'clamp(2rem, 3.6vw, 2.6rem)', lineHeight: 1.06, letterSpacing: '-0.02em', color: INK }}>{tc(t('comparator.title'))}</h1>
        <p style={{ margin: 0, color: INK_2, fontSize: 15, maxWidth: 720, lineHeight: 1.55 }}>{t('comparator.subtitle')}</p>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 22 }}>
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
          <div data-testid="comparator-error" className="dmx-card" style={{
            padding: '16px 18px', borderRadius: 14, background: '#fff', border: '1px solid rgba(239,68,68,0.35)',
            color: INK, display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Icons.AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: INK }}>{t('comparator.error_title')}</div>
              <div style={{ color: INK_2, fontSize: 13.5, marginTop: 2 }}>{err}</div>
            </div>
          </div>
        )}

        {items.length === 0 && !result && !loading && (
          <div data-testid="comparator-empty" className="dmx-card" style={{
            padding: '40px 28px', borderRadius: 18, background: '#fff', textAlign: 'center',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 14, background: 'rgba(var(--theme-rgb),0.08)', color: 'var(--theme)', marginBottom: 14 }}>
              <Icons.GitCompare size={26} />
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 19, color: INK, letterSpacing: '-0.01em' }}>{t('comparator.empty_title')}</div>
            <div style={{ color: INK_2, fontSize: 14, marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>{t('comparator.empty_sub')}</div>
            <button type="button" data-testid="btn-go-marketplace" onClick={() => navigate('/inmuebles')} style={{
              marginTop: 18, padding: '11px 22px', borderRadius: 9999, border: 'none',
              background: 'var(--grad)', color: '#fff', fontFamily: 'Outfit, sans-serif',
              fontWeight: 800, fontSize: 12.5, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(var(--theme-rgb),0.28)',
            }}>{t('comparator.add_property')}</button>
          </div>
        )}

        {(result || loading) && (
          <ComparatorTable
            items={mergedItems}
            audience={audience}
            verdict={result?.ai_verdict}
            deltas={result?.deltas}
            loading={loading}
          />
        )}

        {/* nota de honestidad global */}
        {result && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: INK_3, fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
            <Icons.Info size={13} />
            {t('comparator.honesty_note')}
          </div>
        )}
      </main>
    </div>
  );
}
