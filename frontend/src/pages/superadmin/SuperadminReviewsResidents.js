// W6.MOV.3 · SuperadminReviewsResidents
// Admin dashboard · KPIs · tabla top 50 entities · acciones Scrape/Delete · modal detail
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import { RefreshCw, Trash2, MessageSquare } from 'lucide-react';
import {
  getReviewsStats,
  forceScrapeReviews,
  deleteEntityReviews,
  getReviewsSummary,
} from '../../api/reviewsResidents';

const CREAM = '#F0EBE0';
const SUBTLE = 'rgba(240,235,224,0.65)';
const PANEL_BG = 'rgba(240,235,224,0.04)';
const PANEL_BORDER = 'rgba(240,235,224,0.10)';

export default function SuperadminReviewsResidents({ embedded }) {
  const { t } = useTranslation('common');
  const tt = (k, fb) => t(`reviewsResidents.admin.${k}`, fb);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({}); // {key:true while in-flight}
  const [modal, setModal] = useState(null); // {entity_type, entity_id, summary}
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    getReviewsStats()
      .then(setStats)
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!stats) return [];
    const z = (stats.top_zones || []).map(r => ({ ...r, entity_type: 'zone' }));
    const d = (stats.top_developments || []).map(r => ({ ...r, entity_type: 'development' }));
    return [...z, ...d].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0)).slice(0, 50);
  }, [stats]);

  const handleScrape = async (entity_type, entity_id) => {
    const key = `${entity_type}:${entity_id}`;
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await forceScrapeReviews(entity_type, entity_id);
      load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  };

  const handleDelete = async (entity_type, entity_id) => {
    const key = `${entity_type}:${entity_id}`;
    if (!window.confirm(tt('confirmDelete', '¿Eliminar todas las reseñas de esta entidad?'))) return;
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await deleteEntityReviews(entity_type, entity_id);
      load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  };

  const openDetail = async (entity_type, entity_id) => {
    setModal({ entity_type, entity_id, summary: null, loading: true });
    try {
      const summary = await getReviewsSummary(entity_type, entity_id);
      setModal({ entity_type, entity_id, summary, loading: false });
    } catch (e) {
      setModal({ entity_type, entity_id, summary: null, loading: false, error: e.message || String(e) });
    }
  };

  if (loading) {
    return (
      <SuperadminLayout bare={embedded}>
        <PageHeader eyebrow="W6.MOV.3" title={tt('title', 'Reviews Residentes')} sub={tt('sub', 'Sentiment agregado por zona y desarrollo')} />
        <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif' }}>
          {t('reviewsResidents.loading', 'Cargando…')}
        </div>
      </SuperadminLayout>
    );
  }

  const sent = stats?.sentiment_counts || { positive: 0, neutral: 0, negative: 0 };
  const cronHealth = stats?.cron_health || {};

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W6.MOV.3"
        title={tt('title', 'Reviews Residentes')}
        sub={tt('sub', 'Sentiment agregado por zona y desarrollo · Google · Foursquare · Atlas')}
      />

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#F87171' }}>
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label={tt('kpi.total', 'Reseñas totales')} value={stats?.total_reviews || 0} icon={<MessageSquare size={14} />} />
        <KpiCard label={tt('kpi.positive', 'Positivas')} value={sent.positive} color="#34D399" />
        <KpiCard label={tt('kpi.neutral', 'Neutrales')} value={sent.neutral} color="rgba(240,235,224,0.70)" />
        <KpiCard label={tt('kpi.negative', 'Negativas')} value={sent.negative} color="#F87171" />
      </div>

      {/* Cron health */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {tt('cronHealth', 'Salud del cron semanal · lun 03:00 UTC')}
            </div>
            <div style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, marginTop: 4 }}>
              {tt('lastRun', 'Última corrida')}: {cronHealth.last_run ? new Date(cronHealth.last_run).toLocaleString('es-MX') : '—'} · {tt('processed', 'procesadas')}: {cronHealth.last_processed || 0} · {tt('errors', 'errores')}: {cronHealth.last_errors || 0}
            </div>
          </div>
          <button onClick={load} style={btnSecondary} data-testid="reviews-refresh-stats">
            <RefreshCw size={12} /> {tt('refresh', 'Refrescar')}
          </button>
        </div>
      </Card>

      {/* Top entities table */}
      <Card>
        <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 14 }}>
          {tt('topEntities', 'Top 50 entidades por calidad de reseñas')}
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="reviews-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${PANEL_BORDER}` }}>
                <Th>{t('reviewsResidents.col.type', 'Tipo')}</Th>
                <Th>{t('reviewsResidents.col.id', 'ID')}</Th>
                <Th>{t('reviewsResidents.col.n', 'Reseñas')}</Th>
                <Th>{t('reviewsResidents.col.rating', 'Rating')}</Th>
                <Th>{t('reviewsResidents.col.posPct', '% Positivas')}</Th>
                <Th>{t('reviewsResidents.col.score', 'Score')}</Th>
                <Th>{t('reviewsResidents.col.actions', 'Acciones')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 16, color: SUBTLE, fontFamily: 'DM Sans, sans-serif' }}>
                  {tt('emptyTable', 'Sin entidades con reseñas. Corre el cron o force-scrape una entidad.')}
                </td></tr>
              )}
              {rows.map((r) => {
                const key = `${r.entity_type}:${r.entity_id}`;
                const isBusy = busy[key];
                return (
                  <tr key={key} style={{ borderBottom: `1px solid ${PANEL_BORDER}` }}>
                    <Td>{t(`reviewsResidents.entityType.${r.entity_type}`, r.entity_type)}</Td>
                    <Td>
                      <button onClick={() => openDetail(r.entity_type, r.entity_id)} style={linkBtn} data-testid={`reviews-detail-${key}`}>
                        {r.entity_id}
                      </button>
                    </Td>
                    <Td>{r.n_reviews}</Td>
                    <Td>{r.avg_rating != null ? r.avg_rating : '—'}</Td>
                    <Td>{r.positive_ratio_pct}%</Td>
                    <Td>{r.composite_score}</Td>
                    <Td>
                      <button
                        onClick={() => handleScrape(r.entity_type, r.entity_id)}
                        disabled={isBusy}
                        style={btnSecondary}
                        data-testid={`reviews-scrape-${key}`}
                      >
                        <RefreshCw size={12} /> {tt('scrape', 'Scrape')}
                      </button>
                      <button
                        onClick={() => handleDelete(r.entity_type, r.entity_id)}
                        disabled={isBusy}
                        style={{ ...btnSecondary, marginLeft: 6, color: '#F87171', borderColor: 'rgba(248,113,113,0.30)' }}
                        data-testid={`reviews-delete-${key}`}
                      >
                        <Trash2 size={12} /> {tt('delete', 'Eliminar')}
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <DetailModal modal={modal} onClose={() => setModal(null)} t={t} tt={tt} />
      )}
    </SuperadminLayout>
  );
}

const Th = ({ children }) => (
  <th style={{ padding: '10px 8px', textAlign: 'left', color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
    {children}
  </th>
);

const Td = ({ children }) => (
  <td style={{ padding: '10px 8px', color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
    {children}
  </td>
);

const btnSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 9999,
  background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`,
  color: CREAM,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12,
  cursor: 'pointer',
};

const linkBtn = {
  background: 'transparent',
  border: 'none',
  color: '#6366F1',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};

function KpiCard({ label, value, color, icon }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icon}{label}
      </div>
      <div style={{ color: color || CREAM, fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function DetailModal({ modal, onClose, t, tt }) {
  const { entity_type, entity_id, summary, loading, error } = modal;
  return (
    <div
      role="dialog"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.80)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        maxWidth: 720, width: '100%', maxHeight: '85vh', overflowY: 'auto',
        padding: 24, borderRadius: 24, background: '#0F1320', border: `1px solid ${PANEL_BORDER}`,
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: CREAM, fontFamily: 'Playfair Display, serif', fontSize: 22 }}>
            {entity_type} · {entity_id}
          </h3>
          <button onClick={onClose} style={btnSecondary}>{tt('close', 'Cerrar')}</button>
        </header>
        {loading && <div style={{ color: SUBTLE, fontFamily: 'DM Sans, sans-serif' }}>{t('reviewsResidents.loading', 'Cargando…')}</div>}
        {error && <div style={{ color: '#F87171' }}>{error}</div>}
        {summary && (
          <div>
            <div style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14, marginBottom: 12 }}>
              {summary.n_reviews} {t('reviewsResidents.kpi.nReviews', 'reseñas')} · {summary.avg_rating != null ? `${summary.avg_rating} / 5` : '—'}
            </div>
            <div style={{ marginBottom: 16, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
              {Object.entries(summary.sentiment_breakdown_pct || {}).map(([k, v]) => (
                <span key={k} style={{ marginRight: 12 }}>
                  {t(`reviewsResidents.sentiment.${k}`, k)}: {v}%
                </span>
              ))}
            </div>
            {(summary.top_quotes || []).map((q, i) => (
              <blockquote key={i} style={{ margin: '12px 0', padding: '12px 16px', borderLeft: '3px solid rgba(240,235,224,0.30)', background: PANEL_BG, borderRadius: 12 }}>
                <div style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>"{q.text}"</div>
                <footer style={{ marginTop: 6, color: SUBTLE, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                  — {q.author} · {q.sentiment}
                </footer>
              </blockquote>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
