/**
 * W6.MOV.5 · Superadmin Construction Quality Index dashboard.
 *
 * Coverage + tiers distribution + per-development list con acciones (refresh + manual override).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  getQualityStats,
  listByQuality,
  refreshQuality,
  setManualOverride,
} from '../../api/constructionQuality';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}%`;
}

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};
const kpi = {
  padding: 16, borderRadius: 14,
  background: 'rgba(var(--theme-rgb, 99 102 241),0.06)',
  border: '1px solid rgba(var(--theme-rgb, 99 102 241),0.18)',
};

const TIER_KEYS = ['excelente', 'bueno', 'regular', 'deficiente'];

export default function SuperadminConstructionQuality({ embedded }) {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState({ min_score: '', tier: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overrideForm, setOverrideForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getQualityStats();
      setStats(s);
      const params = {};
      if (filter.min_score) params.min_score = Number(filter.min_score);
      if (filter.tier) params.tier = filter.tier;
      const list = await listByQuality({ ...params, limit: 100 });
      setItems(list.items || []);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async (devId) => {
    setBusy(true);
    try {
      await refreshQuality(devId);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!overrideForm) return;
    setBusy(true);
    try {
      await setManualOverride({
        development_id: overrideForm.development_id,
        score: overrideForm.score === '' ? null : Number(overrideForm.score),
        reason: overrideForm.reason || '',
      });
      setOverrideForm(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const tiersStats = stats?.tiers || {};

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-cq-page" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: CREAM }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · Inteligencia
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('constructionQuality.adminTitle', 'Construction Quality · Debug')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('constructionQuality.adminSubtitle', 'Índice 0-100 por desarrollo · 4 dimensiones · cron lunes 02:00 UTC')}
          </div>
        </header>

        {error && (
          <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 18, color: '#FBCFE8' }}>
            {error}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('constructionQuality.kpi.totalDevs', 'Desarrollos totales')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.total_developments)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('constructionQuality.kpi.withScore', 'Con score calculado')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.total_with_quality_score)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('constructionQuality.kpi.coverage', 'Cobertura')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtPct(stats?.coverage_pct)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('constructionQuality.kpi.cacheEntries', 'Cache entries')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.cache_entries)}
            </div>
          </div>
        </div>

        {/* Tier distribution */}
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('constructionQuality.tiersTitle', 'Distribución por tier')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {TIER_KEYS.map((tk) => (
              <div key={tk} style={{
                padding: 12, borderRadius: 12,
                background: 'rgba(240,235,224,0.04)',
                border: '1px solid rgba(240,235,224,0.08)',
              }}>
                <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {t(`constructionQuality.tier.${tk}`, tk)}
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                  {fmtNum(tiersStats[tk]?.count) || 0}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                  {t('constructionQuality.avgScore', 'Promedio')}: {fmtNum(tiersStats[tk]?.avg_score)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>{t('constructionQuality.filterMinScore', 'Min score')}</span>
            <input
              type="number" min="0" max="100"
              value={filter.min_score}
              onChange={(e) => setFilter((f) => ({ ...f, min_score: e.target.value }))}
              style={{
                width: 80, padding: '6px 10px', borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>{t('constructionQuality.filterTier', 'Tier')}</span>
            <select
              value={filter.tier}
              onChange={(e) => setFilter((f) => ({ ...f, tier: e.target.value }))}
              style={{
                padding: '6px 12px', borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontSize: 13,
              }}
            >
              <option value="">{t('constructionQuality.tierAll', 'Todos')}</option>
              {TIER_KEYS.map((tk) => (
                <option key={tk} value={tk}>{t(`constructionQuality.tier.${tk}`, tk)}</option>
              ))}
            </select>
          </label>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '8px 18px', borderRadius: 9999,
              background: GRAD, color: '#06080F',
              border: 'none', fontWeight: 700, fontSize: 12, letterSpacing: 0.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {loading ? t('common.loading', 'Cargando') : t('common.refresh', 'Refrescar')}
          </button>
        </div>

        {/* Table */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('constructionQuality.devsTitle', 'Desarrollos con score')} · {items.length}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
              {t('constructionQuality.noResults', 'Sin resultados con los filtros aplicados')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('constructionQuality.col.name', 'Desarrollo')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('constructionQuality.col.zone', 'Zona')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('constructionQuality.col.score', 'Score')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('constructionQuality.col.tier', 'Tier')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('constructionQuality.col.actions', 'Acciones')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`cq-row-${it.id}`}>
                      <td style={{ padding: '10px 8px' }}>{it.name || it.title || it.id}</td>
                      <td style={{ padding: '10px 8px', opacity: 0.7, fontSize: 12 }}>
                        {it.colonia || it.delegacion || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {it.construction_quality_score != null ? it.construction_quality_score : '—'}
                      </td>
                      <td style={{ padding: '10px 8px', opacity: 0.85 }}>
                        {t(`constructionQuality.tier.${it.construction_quality_tier || 'no_data'}`, it.construction_quality_tier || '—')}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRefresh(it.id)}
                          disabled={busy}
                          style={{
                            marginRight: 6,
                            padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                            background: 'rgba(99,102,241,0.18)', color: CREAM,
                            border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                          }}
                        >
                          {t('common.refresh', 'Refrescar')}
                        </button>
                        <button
                          onClick={() => setOverrideForm({ development_id: it.id, score: '', reason: '' })}
                          disabled={busy}
                          style={{
                            padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                            background: 'rgba(236,72,153,0.18)', color: CREAM,
                            border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer',
                          }}
                        >
                          {t('constructionQuality.override', 'Override')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Override modal */}
        {overrideForm && (
          <div
            onClick={() => setOverrideForm(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(240,235,224,0.10)', borderRadius: 24,
                padding: 24, color: CREAM, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {t('constructionQuality.overrideTitle', 'Override manual')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>
                {overrideForm.development_id}
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {t('constructionQuality.overrideScore', 'Score (0-100 · vacío = remover)')}
                </div>
                <input
                  type="number" min="0" max="100"
                  value={overrideForm.score}
                  onChange={(e) => setOverrideForm({ ...overrideForm, score: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                    color: CREAM, fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 18 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {t('constructionQuality.overrideReason', 'Razón')}
                </div>
                <textarea
                  rows="3"
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                    color: CREAM, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setOverrideForm(null)}
                  disabled={busy}
                  style={{
                    padding: '8px 18px', borderRadius: 9999, fontSize: 12,
                    background: 'transparent', color: CREAM,
                    border: '1px solid rgba(240,235,224,0.18)', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {t('common.cancel', 'Cancelar')}
                </button>
                <button
                  onClick={handleSaveOverride}
                  disabled={busy}
                  style={{
                    padding: '8px 18px', borderRadius: 9999, fontSize: 12,
                    background: GRAD, color: '#06080F',
                    border: 'none', cursor: 'pointer', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                  }}
                >
                  {busy ? t('common.loading', 'Cargando') : t('common.save', 'Guardar')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
