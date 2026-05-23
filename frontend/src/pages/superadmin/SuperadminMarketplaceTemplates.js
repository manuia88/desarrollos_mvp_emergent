/**
 * W6.4 · SuperadminMarketplaceTemplates · /superadmin/marketplace-templates
 * KPIs strip + moderación (approve/reject/delete) + top sellers + revenue 30d.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminListTemplates,
  approveTemplate,
  deleteTemplate,
  getAdminStats,
  rejectTemplate,
} from '../../api/marketplaceTemplates';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function KpiCard({ label, value, hint }) {
  return (
    <div style={{
      padding: 18, borderRadius: 16, background: CARD_BG, border: BORDER,
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, opacity: 0.55, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: MUTED_2 }}>{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation('common');
  const COLOR = {
    approved: { bg: 'rgba(134,239,172,0.18)', fg: '#86EFAC' },
    pending_review: { bg: 'rgba(251,191,36,0.18)', fg: '#FCD34D' },
    rejected: { bg: 'rgba(248,113,113,0.18)', fg: '#FCA5A5' },
    draft: { bg: 'rgba(240,235,224,0.08)', fg: MUTED },
  };
  const c = COLOR[status] || COLOR.draft;
  return (
    <span style={{
      fontSize: 10, padding: '4px 10px', borderRadius: 9999,
      background: c.bg, color: c.fg, letterSpacing: 0.6, textTransform: 'uppercase',
    }}>
      {t(`marketplaceTemplates.status.${status}`, status)}
    </span>
  );
}

export default function SuperadminMarketplaceTemplates() {
  const { t } = useTranslation('common');
  const [statsData, setStatsData] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending_review');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, lst] = await Promise.all([
        getAdminStats(),
        adminListTemplates({ status: filter, limit: 200 }),
      ]);
      setStatsData(s);
      setItems(lst.items || []);
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = useCallback(async (id) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await approveTemplate(id);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[id]; return c; });
    }
  }, [load, t]);

  const handleReject = useCallback(async (id) => {
    // eslint-disable-next-line no-alert
    const reason = window.prompt(t('marketplaceTemplates.admin.rejectReasonPrompt', 'Motivo de rechazo:')) || '';
    if (!reason) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await rejectTemplate(id, reason);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[id]; return c; });
    }
  }, [load, t]);

  const handleDelete = useCallback(async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('marketplaceTemplates.admin.deleteConfirm', '¿Eliminar plantilla?'))) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await deleteTemplate(id);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[id]; return c; });
    }
  }, [load, t]);

  const stats = statsData?.stats || {};
  const revenue = statsData?.revenue || {};
  const topSellers = revenue?.top_sellers || [];

  return (
    <div style={{ minHeight: '100vh', background: BG, color: CREAM, padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 30, fontWeight: 800 }}>
          {t('marketplaceTemplates.admin.title', 'Marketplace Templates · Moderación')}
        </h1>
        <p style={{ margin: '8px 0 28px', color: MUTED, maxWidth: 720, lineHeight: 1.55 }}>
          {t('marketplaceTemplates.admin.subtitle',
             'Aprobar/rechazar plantillas · revenue split 70/30 · auditoría inmutable')}
        </p>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
          <KpiCard label={t('marketplaceTemplates.admin.kpi.total', 'Templates totales')}
                    value={stats.templates_total ?? '—'} />
          <KpiCard label={t('marketplaceTemplates.admin.kpi.pending', 'Pendientes review')}
                    value={stats.templates_pending ?? '—'}
                    hint={t('marketplaceTemplates.admin.kpi.pendingHint', 'Requieren acción')} />
          <KpiCard label={t('marketplaceTemplates.admin.kpi.approved', 'Aprobadas')}
                    value={stats.templates_approved ?? '—'} />
          <KpiCard label={t('marketplaceTemplates.admin.kpi.revenue30d', 'Revenue 30d')}
                    value={`$${Number(stats.revenue_30d_mxn || 0).toLocaleString('es-MX')}`}
                    hint={`${stats.clones_30d ?? 0} clones`} />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {['pending_review', 'approved', 'rejected', 'all'].map((f) => (
            <button
              key={f} type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 9999, cursor: 'pointer',
                border: BORDER, fontSize: 12,
                background: filter === f ? GRAD : 'transparent',
                color: filter === f ? '#fff' : CREAM,
              }}
            >
              {t(`marketplaceTemplates.admin.filter.${f}`, f)}
            </button>
          ))}
        </div>

        {/* Tabla templates */}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
            {t('common.loading', 'Cargando…')}
          </div>
        )}
        {error && (
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(248,113,113,0.12)',
                         border: '1px solid rgba(248,113,113,0.3)', color: '#FCA5A5', marginBottom: 18 }}>
            {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ padding: 28, borderRadius: 16, background: CARD_BG, border: BORDER,
                         textAlign: 'center', color: MUTED }}>
            {t('marketplaceTemplates.admin.emptyFilter',
               'No hay plantillas con este filtro.')}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ borderRadius: 16, background: CARD_BG, border: BORDER, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(240,235,224,0.04)', textAlign: 'left' }}>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.title', 'Título')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.author', 'Autor')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.category', 'Categoría')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.price', 'Precio')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.status', 'Estado')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                    {t('marketplaceTemplates.admin.col.downloads', 'Downloads')}
                  </th>
                  <th style={{ padding: 12, color: MUTED, fontWeight: 600, textAlign: 'right' }}>
                    {t('marketplaceTemplates.admin.col.actions', 'Acciones')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    data-testid={`mt-admin-row-${it.id}`}
                    style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}
                  >
                    <td style={{ padding: 12, fontWeight: 600 }}>{it.title}</td>
                    <td style={{ padding: 12, color: MUTED }}>{it.author_email || it.author_user_id}</td>
                    <td style={{ padding: 12 }}>
                      {t(`marketplaceTemplates.category.${it.category}`, it.category)}
                    </td>
                    <td style={{ padding: 12 }}>
                      {it.price_tier === 'free'
                        ? t('marketplaceTemplates.price.free', 'Gratis')
                        : `$${Number(it.price_mxn).toLocaleString('es-MX')}`}
                    </td>
                    <td style={{ padding: 12 }}><StatusBadge status={it.status} /></td>
                    <td style={{ padding: 12 }}>{it.downloads || 0}</td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {it.status !== 'approved' && (
                          <button
                            type="button"
                            data-testid={`mt-admin-approve-${it.id}`}
                            disabled={!!busy[it.id]}
                            onClick={() => handleApprove(it.id)}
                            style={{
                              padding: '5px 12px', borderRadius: 9999, border: 'none',
                              background: 'rgba(134,239,172,0.18)', color: '#86EFAC',
                              cursor: 'pointer', fontSize: 12,
                            }}
                          >
                            {t('marketplaceTemplates.admin.action.approve', 'Aprobar')}
                          </button>
                        )}
                        {it.status === 'pending_review' && (
                          <button
                            type="button"
                            data-testid={`mt-admin-reject-${it.id}`}
                            disabled={!!busy[it.id]}
                            onClick={() => handleReject(it.id)}
                            style={{
                              padding: '5px 12px', borderRadius: 9999, border: 'none',
                              background: 'rgba(251,191,36,0.18)', color: '#FCD34D',
                              cursor: 'pointer', fontSize: 12,
                            }}
                          >
                            {t('marketplaceTemplates.admin.action.reject', 'Rechazar')}
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`mt-admin-delete-${it.id}`}
                          disabled={!!busy[it.id]}
                          onClick={() => handleDelete(it.id)}
                          style={{
                            padding: '5px 12px', borderRadius: 9999, border: 'none',
                            background: 'rgba(248,113,113,0.18)', color: '#FCA5A5',
                            cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          {t('marketplaceTemplates.admin.action.delete', 'Eliminar')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top sellers */}
        {topSellers.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <h2 style={{ margin: '0 0 14px', fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 700 }}>
              {t('marketplaceTemplates.admin.topSellersTitle', 'Top sellers (revenue acumulado)')}
            </h2>
            <div style={{ borderRadius: 16, background: CARD_BG, border: BORDER, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(240,235,224,0.04)', textAlign: 'left' }}>
                    <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>#</th>
                    <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                      {t('marketplaceTemplates.admin.col.author', 'Autor')}
                    </th>
                    <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                      {t('marketplaceTemplates.admin.col.clones', 'Clones')}
                    </th>
                    <th style={{ padding: 12, color: MUTED, fontWeight: 600 }}>
                      {t('marketplaceTemplates.admin.col.authorRevenue', 'Revenue autor')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topSellers.map((s, idx) => (
                    <tr key={s.author_user_id} style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}>
                      <td style={{ padding: 12, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: 12, color: MUTED }}>{s.author_user_id}</td>
                      <td style={{ padding: 12 }}>{s.clones}</td>
                      <td style={{ padding: 12, color: '#86EFAC' }}>
                        ${Number(s.revenue_mxn || 0).toLocaleString('es-MX')} MXN
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
