/**
 * W6.4 · MarketplaceTemplatesPage · /portal/asesor/marketplace-templates
 * Catálogo público de plantillas de workflow · filtros + cards + clone + publish.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  cloneTemplate,
  getMyRevenue,
  getTemplate,
  listTemplates,
  rateTemplate,
} from '../../../api/marketplaceTemplates';
import { SmartEmptyState } from '../../../components/shared/SmartEmptyState';
import PublishTemplateModal from './PublishTemplateModal';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const CATEGORIES = ['nurture', 'post-visita', 'win-back', 'custom'];
const TIERS = ['free', 'pro', 'enterprise'];
const SORTS = ['popular', 'recent', 'rating'];

function priceLabel(t, tier, price) {
  if (tier === 'free' || !price) return t('marketplaceTemplates.price.free', 'Gratis');
  return `$${Number(price).toLocaleString('es-MX')} MXN`;
}

function StarRating({ value = 0, count = 0 }) {
  const filled = Math.round(Number(value) || 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ color: '#FBBF24' }}>{'★'.repeat(filled)}{'☆'.repeat(Math.max(0, 5 - filled))}</span>
      <span style={{ opacity: 0.55 }}>({count})</span>
    </div>
  );
}

function Card({ item, onOpen }) {
  const { t } = useTranslation('common');
  return (
    <button
      type="button"
      data-testid={`mt-card-${item.id}`}
      onClick={() => onOpen(item)}
      style={{
        textAlign: 'left', cursor: 'pointer',
        padding: 18, borderRadius: 18,
        background: CARD_BG, border: BORDER, color: CREAM,
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
          padding: '4px 10px', borderRadius: 9999,
          background: 'rgba(99,102,241,0.18)', color: '#C7D2FE',
        }}>
          {t(`marketplaceTemplates.category.${item.category}`, item.category)}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: item.price_tier === 'free' ? '#86EFAC' : CREAM,
        }}>
          {priceLabel(t, item.price_tier, item.price_mxn)}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{item.title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45, minHeight: 36,
                     display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                     overflow: 'hidden' }}>
        {item.description || t('marketplaceTemplates.noDescription', 'Sin descripción')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                     marginTop: 4, paddingTop: 10, borderTop: '1px solid rgba(240,235,224,0.06)' }}>
        <StarRating value={item.avg_rating} count={item.ratings_count} />
        <span style={{ fontSize: 12, color: MUTED_2 }}>
          {item.downloads || 0} {t('marketplaceTemplates.downloads', 'descargas')}
        </span>
      </div>
    </button>
  );
}

function DetailModal({ open, item, onClose, onCloneOk }) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [detail, setDetail] = useState(item);
  const [ratingOk, setRatingOk] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (open && item?.id) {
      setDetail(item);
      setErr(null);
      setRatingOk(false);
      getTemplate(item.id).then((d) => { if (!cancel) setDetail(d); }).catch(() => {});
    }
    return () => { cancel = true; };
  }, [open, item]);

  const handleClone = useCallback(async () => {
    if (!item?.id) return;
    setBusy(true); setErr(null);
    try {
      const r = await cloneTemplate(item.id, item.price_mxn || 0);
      onCloneOk?.(r);
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy(false);
    }
  }, [item, onCloneOk, t]);

  const handleRate = useCallback(async () => {
    if (!item?.id) return;
    setBusy(true); setErr(null);
    try {
      await rateTemplate(item.id, stars, comment);
      setRatingOk(true);
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy(false);
    }
  }, [item, stars, comment, t]);

  if (!open || !item) return null;

  const nodesCount = (detail?.nodes || []).length;
  const edgesCount = (detail?.edges || []).length;

  return (
    <div
      data-testid="mt-detail-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(6,8,15,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          background: '#0B0F19', border: BORDER, borderRadius: 18, color: CREAM,
          padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 0.8, opacity: 0.55, textTransform: 'uppercase' }}>
              {t(`marketplaceTemplates.category.${item.category}`, item.category)}
            </div>
            <h2 style={{ margin: '6px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800 }}>
              {item.title}
            </h2>
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              background: 'transparent', border: BORDER, color: CREAM,
              padding: '4px 12px', borderRadius: 9999, cursor: 'pointer',
            }}
          >×</button>
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <span style={{ color: MUTED }}>
            {t('marketplaceTemplates.author', 'Autor')}: {item.author_email || item.author_user_id}
          </span>
          <span style={{ color: MUTED_2 }}>·</span>
          <span style={{ color: MUTED }}>{nodesCount} nodes</span>
          <span style={{ color: MUTED_2 }}>·</span>
          <span style={{ color: MUTED }}>{edgesCount} edges</span>
        </div>

        <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.55 }}>
          {detail?.description || t('marketplaceTemplates.noDescription', 'Sin descripción')}
        </div>

        <div style={{
          display: 'flex', gap: 16, alignItems: 'center', padding: 14,
          borderRadius: 12, background: 'rgba(240,235,224,0.04)',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {t('marketplaceTemplates.price.label', 'Precio')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 800 }}>
              {priceLabel(t, item.price_tier, item.price_mxn)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <StarRating value={item.avg_rating} count={item.ratings_count} />
            <div style={{ fontSize: 12, color: MUTED_2, marginTop: 4 }}>
              {item.downloads || 0} {t('marketplaceTemplates.downloads', 'descargas')}
            </div>
          </div>
          <button
            type="button"
            data-testid="mt-clone-btn"
            disabled={busy}
            onClick={handleClone}
            style={{
              padding: '10px 20px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: GRAD, color: '#fff', fontWeight: 700,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? '…' : t('marketplaceTemplates.useTemplate', 'Usar plantilla')}
          </button>
        </div>

        <div style={{ borderTop: '1px solid rgba(240,235,224,0.06)', paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {t('marketplaceTemplates.rateThis', 'Calificar (requiere clonar primero)')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={stars} onChange={(e) => setStars(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 9999, background: 'transparent',
                       border: BORDER, color: CREAM }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{'★'.repeat(n)}</option>
              ))}
            </select>
            <input
              value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t('marketplaceTemplates.commentPlaceholder', 'Comentario opcional')}
              style={{
                flex: 1, padding: '6px 12px', borderRadius: 9999,
                background: 'transparent', border: BORDER, color: CREAM,
              }}
            />
            <button
              type="button" onClick={handleRate} disabled={busy}
              style={{
                padding: '6px 16px', borderRadius: 9999, border: BORDER,
                background: 'transparent', color: CREAM, cursor: 'pointer',
              }}
            >
              {t('marketplaceTemplates.rateBtn', 'Calificar')}
            </button>
          </div>
          {ratingOk && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#86EFAC' }}>
              {t('marketplaceTemplates.rateOk', '¡Gracias por tu calificación!')}
            </div>
          )}
        </div>

        {err && (
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(248,113,113,0.12)',
                         border: '1px solid rgba(248,113,113,0.3)', color: '#FCA5A5', fontSize: 13 }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceTemplatesPage() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('');
  const [priceTier, setPriceTier] = useState('');
  const [sort, setSort] = useState('popular');
  const [openDetail, setOpenDetail] = useState(null);
  const [openPublish, setOpenPublish] = useState(false);
  const [myRevenue, setMyRevenue] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await listTemplates({
        category: category || undefined,
        priceTier: priceTier || undefined,
        sort,
      });
      setItems(r.items || []);
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setLoading(false);
    }
  }, [category, priceTier, sort, t]);

  const loadRevenue = useCallback(async () => {
    try {
      const r = await getMyRevenue();
      setMyRevenue(r);
    } catch (_e) {
      // ignore (puede ser 401 si no es advisor)
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  const filtersChips = useMemo(() => ({
    categories: ['', ...CATEGORIES],
    tiers: ['', ...TIERS],
    sorts: SORTS,
  }), []);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: CREAM, padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                       gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 800 }}>
              {t('marketplaceTemplates.title', 'Plantillas de Workflows · DMX Marketplace')}
            </h1>
            <p style={{ margin: '8px 0 0', color: MUTED, maxWidth: 640, lineHeight: 1.55 }}>
              {t('marketplaceTemplates.subtitle',
                 'Reutiliza workflows probados por otros asesores · publica los tuyos y gana ingresos.')}
            </p>
          </div>
          <button
            type="button"
            data-testid="mt-publish-open"
            onClick={() => setOpenPublish(true)}
            style={{
              padding: '12px 22px', borderRadius: 9999, border: 'none',
              background: GRAD, color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('marketplaceTemplates.publishCta', 'Publicar plantilla')}
          </button>
        </div>

        {/* Revenue strip (si advisor) */}
        {myRevenue && myRevenue.total_clones > 0 && (
          <div data-testid="mt-revenue-strip" style={{
            padding: 16, borderRadius: 16, background: CARD_BG, border: BORDER,
            display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22,
          }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase' }}>
                {t('marketplaceTemplates.revenue.clones', 'Clones')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{myRevenue.total_clones}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase' }}>
                {t('marketplaceTemplates.revenue.earned', 'Ganado')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#86EFAC' }}>
                ${Number(myRevenue.author_revenue_mxn || 0).toLocaleString('es-MX')} MXN
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase' }}>
                {t('marketplaceTemplates.revenue.published', 'Publicados')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {(myRevenue.my_templates || []).length}
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          {filtersChips.categories.map((c) => (
            <button
              key={`cat-${c || 'all'}`} type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 14px', borderRadius: 9999, cursor: 'pointer',
                border: BORDER, fontSize: 12,
                background: category === c ? GRAD : 'transparent',
                color: category === c ? '#fff' : CREAM,
              }}
            >
              {c
                ? t(`marketplaceTemplates.category.${c}`, c)
                : t('marketplaceTemplates.filter.allCategories', 'Todas')}
            </button>
          ))}
          <span style={{ width: 1, background: 'rgba(240,235,224,0.10)', alignSelf: 'stretch' }} />
          {filtersChips.tiers.map((p) => (
            <button
              key={`tier-${p || 'all'}`} type="button"
              onClick={() => setPriceTier(p)}
              style={{
                padding: '6px 14px', borderRadius: 9999, cursor: 'pointer',
                border: BORDER, fontSize: 12,
                background: priceTier === p ? GRAD : 'transparent',
                color: priceTier === p ? '#fff' : CREAM,
              }}
            >
              {p ? t(`marketplaceTemplates.tier.${p}`, p) : t('marketplaceTemplates.filter.anyPrice', 'Cualquier precio')}
            </button>
          ))}
          <span style={{ width: 1, background: 'rgba(240,235,224,0.10)', alignSelf: 'stretch' }} />
          {filtersChips.sorts.map((s) => (
            <button
              key={`sort-${s}`} type="button"
              onClick={() => setSort(s)}
              style={{
                padding: '6px 14px', borderRadius: 9999, cursor: 'pointer',
                border: BORDER, fontSize: 12,
                background: sort === s ? GRAD : 'transparent',
                color: sort === s ? '#fff' : CREAM,
              }}
            >
              {t(`marketplaceTemplates.sort.${s}`, s)}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
            {t('common.loading', 'Cargando…')}
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: 18, borderRadius: 12, background: 'rgba(248,113,113,0.12)',
                         border: '1px solid rgba(248,113,113,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <SmartEmptyState
            contextKey="marketplace_templates_empty"
            overrides={{
              title: t('marketplaceTemplates.empty.title', 'Catálogo en crecimiento'),
              body: t('marketplaceTemplates.empty.body',
                      'Aún no hay plantillas aprobadas. Sé el primero en publicar la tuya.'),
              ctas: [],
            }}
            testId="mt-empty"
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {items.map((it) => (
              <Card key={it.id} item={it} onOpen={setOpenDetail} />
            ))}
          </div>
        )}
      </div>

      <DetailModal
        open={!!openDetail}
        item={openDetail}
        onClose={() => setOpenDetail(null)}
        onCloneOk={() => { setOpenDetail(null); load(); loadRevenue(); }}
      />

      <PublishTemplateModal
        open={openPublish}
        onClose={() => setOpenPublish(false)}
        onPublished={() => { setOpenPublish(false); load(); }}
      />
    </div>
  );
}
