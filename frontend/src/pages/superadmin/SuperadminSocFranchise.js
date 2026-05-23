/**
 * W6.MOV.1 · Superadmin SOC Franchise dashboard.
 *
 * KPIs strip + tier distribution 4 cards + table + Certify/Revoke modal + top movers.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import SocBadge from '../../components/franchise/SocBadge';
import {
  getSocStats,
  getLeaderboard,
  certifyUser,
  revokeUser,
} from '../../api/socFranchise';

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

const LEVELS = ['platinum', 'gold', 'silver', 'bronze'];

export default function SuperadminSocFranchise() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [filterLevel, setFilterLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [certifyForm, setCertifyForm] = useState(null);
  const [revokeForm, setRevokeForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSocStats();
      setStats(s);
      const list = await getLeaderboard({ level: filterLevel || undefined, limit: 100 });
      setItems(list.items || []);
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, [filterLevel]);

  useEffect(() => { load(); }, [load]);

  const handleCertify = async () => {
    if (!certifyForm) return;
    setBusy(true);
    try {
      await certifyUser({
        user_id: certifyForm.user_id,
        level: certifyForm.level,
        reason: certifyForm.reason || '',
      });
      setCertifyForm(null);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeForm) return;
    setBusy(true);
    try {
      await revokeUser({
        user_id: revokeForm.user_id,
        reason: revokeForm.reason || '',
      });
      setRevokeForm(null);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const levelsStats = stats?.levels || {};
  const topMovers = stats?.top_movers || [];

  return (
    <SuperadminLayout>
      <div data-testid="superadmin-soc-page" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: CREAM }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · Monetización
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('socFranchise.adminTitle', 'SOC Franchise · Admin')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('socFranchise.adminSubtitle', 'Score 0-100 por asesor · 4 niveles · 5 dimensiones · cache 7d')}
          </div>
        </header>

        {error && (
          <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 18, color: '#FBCFE8' }}>
            {String(error)}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('socFranchise.kpi.totalAdvisors', 'Asesores totales')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.total_advisors)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('socFranchise.kpi.totalFranchisees', 'Con score calculado')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.total_franchisees)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('socFranchise.kpi.coverage', 'Cobertura')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtPct(stats?.coverage_pct)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('socFranchise.kpi.topMover', 'Top mover 7d')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 800, marginTop: 4 }}>
              {topMovers[0]
                ? `${topMovers[0].name || topMovers[0].user_id} (+${topMovers[0].delta_week})`
                : '—'}
            </div>
          </div>
        </div>

        {/* Level distribution */}
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('socFranchise.levelsTitle', 'Distribución por nivel')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {LEVELS.map((lvl) => (
              <div key={lvl} style={{
                padding: 14, borderRadius: 12,
                background: 'rgba(240,235,224,0.04)',
                border: '1px solid rgba(240,235,224,0.08)',
              }}>
                <div style={{ marginBottom: 8 }}>
                  <SocBadge level={lvl} size="sm" />
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800 }}>
                  {fmtNum(levelsStats[lvl]?.count) || 0}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                  {t('socFranchise.avgScore', 'Promedio')}: {fmtNum(levelsStats[lvl]?.avg_score)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters + table */}
        <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>{t('socFranchise.filterLevel', 'Nivel')}</span>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontSize: 13,
              }}
            >
              <option value="">{t('socFranchise.levelAll', 'Todos')}</option>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{t(`socFranchise.level.${lvl}`, lvl)}</option>
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

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('socFranchise.tableTitle', 'Asesores')} · {items.length}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
              {t('socFranchise.noResults', 'Sin resultados con los filtros aplicados')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left',  opacity: 0.7, fontWeight: 600 }}>
                      {t('socFranchise.col.name', 'Asesor')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('socFranchise.col.score', 'Score')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'left',  opacity: 0.7, fontWeight: 600 }}>
                      {t('socFranchise.col.level', 'Nivel')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('socFranchise.col.delta', 'Δ 7d')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('socFranchise.col.actions', 'Acciones')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.user_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`soc-admin-row-${it.user_id}`}>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{it.name || it.email || it.user_id}</div>
                        {it.email && <div style={{ fontSize: 11, opacity: 0.5 }}>{it.email}</div>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {it.score != null ? Number(it.score).toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <SocBadge level={it.level} size="sm" />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12,
                                   color: it.delta_week == null ? 'rgba(240,235,224,0.45)'
                                          : it.delta_week >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                        {it.delta_week == null ? '—' : `${it.delta_week >= 0 ? '+' : ''}${it.delta_week}`}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => setCertifyForm({ user_id: it.user_id, level: it.level || 'silver', reason: '' })}
                          disabled={busy}
                          style={{
                            marginRight: 6,
                            padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                            background: 'rgba(99,102,241,0.18)', color: CREAM,
                            border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                          }}
                        >
                          {t('socFranchise.action.certify', 'Certify')}
                        </button>
                        {it.manual_override && (
                          <button
                            onClick={() => setRevokeForm({ user_id: it.user_id, reason: '' })}
                            disabled={busy}
                            style={{
                              padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                              background: 'rgba(236,72,153,0.18)', color: CREAM,
                              border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer',
                            }}
                          >
                            {t('socFranchise.action.revoke', 'Revoke')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Certify modal */}
        {certifyForm && (
          <div
            onClick={() => setCertifyForm(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 460,
                background: 'rgba(13,16,23,0.96)', border: '1px solid rgba(240,235,224,0.10)',
                borderRadius: 24, padding: 24, color: CREAM, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {t('socFranchise.certifyTitle', 'Certificar nivel')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>
                {certifyForm.user_id}
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {t('socFranchise.certifyLevel', 'Nivel')}
                </div>
                <select
                  value={certifyForm.level}
                  onChange={(e) => setCertifyForm({ ...certifyForm, level: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                    color: CREAM, fontSize: 14,
                  }}
                >
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>{t(`socFranchise.level.${lvl}`, lvl)}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 18 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {t('socFranchise.certifyReason', 'Razón (mín 10 caracteres)')}
                </div>
                <textarea
                  rows="3"
                  value={certifyForm.reason}
                  onChange={(e) => setCertifyForm({ ...certifyForm, reason: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                    color: CREAM, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setCertifyForm(null)}
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
                  onClick={handleCertify}
                  disabled={busy || (certifyForm.reason || '').trim().length < 10}
                  style={{
                    padding: '8px 18px', borderRadius: 9999, fontSize: 12,
                    background: GRAD, color: '#06080F',
                    border: 'none', cursor: 'pointer', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                    opacity: (certifyForm.reason || '').trim().length < 10 ? 0.5 : 1,
                  }}
                >
                  {busy ? t('common.loading', 'Cargando') : t('socFranchise.action.certify', 'Certify')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revoke modal */}
        {revokeForm && (
          <div
            onClick={() => setRevokeForm(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 460,
                background: 'rgba(13,16,23,0.96)', border: '1px solid rgba(240,235,224,0.10)',
                borderRadius: 24, padding: 24, color: CREAM, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {t('socFranchise.revokeTitle', 'Revocar certificación')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>
                {revokeForm.user_id}
              </div>
              <label style={{ display: 'block', marginBottom: 18 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {t('socFranchise.revokeReason', 'Razón (mín 10 caracteres)')}
                </div>
                <textarea
                  rows="3"
                  value={revokeForm.reason}
                  onChange={(e) => setRevokeForm({ ...revokeForm, reason: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
                    color: CREAM, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRevokeForm(null)}
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
                  onClick={handleRevoke}
                  disabled={busy || (revokeForm.reason || '').trim().length < 10}
                  style={{
                    padding: '8px 18px', borderRadius: 9999, fontSize: 12,
                    background: 'rgba(236,72,153,0.85)', color: '#06080F',
                    border: 'none', cursor: 'pointer', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                    opacity: (revokeForm.reason || '').trim().length < 10 ? 0.5 : 1,
                  }}
                >
                  {busy ? t('common.loading', 'Cargando') : t('socFranchise.action.revoke', 'Revoke')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
