/**
 * W5.10 · SocialAdsCampaignsPage · /portal/asesor/social-ads/campaigns
 * Selector cuenta · tabla campañas · sugerencia IA presupuesto · performance 30d (SVG).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getAccounts, getCampaigns, getBudgetSuggestion, getPerformance,
} from '../../../api/socialAds';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}
function mxn(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); }
  catch { return `$${n}`; }
}

function PerformanceChart({ series }) {
  if (!series || series.length === 0) return null;
  const W = 720;
  const H = 140;
  const pad = 6;
  const max = Math.max(...series.map((d) => d.clicks), 1);
  const bw = (W - pad * 2) / series.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="performance" preserveAspectRatio="none">
      <defs>
        <linearGradient id="saBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      {series.map((d, i) => {
        const h = Math.max(1, ((d.clicks || 0) / max) * (H - pad * 2));
        return (
          <rect
            key={d.date}
            x={pad + i * bw + bw * 0.15}
            y={H - pad - h}
            width={bw * 0.7}
            height={h}
            rx={2}
            fill="url(#saBar)"
            opacity={0.85}
          >
            <title>{`${d.date} · ${d.clicks} clics · ${d.impressions} impr.`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const StatusPill = ({ status, t }) => (
  <span style={{
    padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
    background: status === 'ACTIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
    color: status === 'ACTIVE' ? '#6EE7B7' : '#FCD34D',
  }}>
    {status === 'ACTIVE' ? t('socialAds.campActive', 'Activa') : t('socialAds.campPaused', 'Pausada')}
  </span>
);

function SocialAdsCampaignsPageBody() {
  const { t } = useTranslation('common');
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [totals, setTotals] = useState({});
  const [perf, setPerf] = useState([]);
  const [budget, setBudget] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load accounts once
  useEffect(() => {
    (async () => {
      try {
        const { ok, body } = await getAccounts();
        if (ok && (body.accounts || []).length) {
          setAccounts(body.accounts);
          setAccountId(body.accounts[0].account_id);
        } else {
          setLoading(false);
        }
      } catch {
        setError(t('socialAds.loadError', 'No se pudieron cargar las cuentas.'));
        setLoading(false);
      }
    })();
  }, [t]);

  const loadCampaigns = useCallback(async (acc, status) => {
    if (!acc) return;
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      const [cRes, pRes] = await Promise.all([
        getCampaigns(acc, status),
        getPerformance(acc, 30),
      ]);
      if (cRes.ok) {
        setCampaigns(cRes.body.campaigns || []);
        setTotals(cRes.body.totals || {});
      }
      if (pRes.ok) setPerf(pRes.body.series || []);
    } catch {
      setError(t('socialAds.loadError', 'No se pudieron cargar las campañas.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (accountId) loadCampaigns(accountId, statusFilter);
  }, [accountId, statusFilter, loadCampaigns]);

  const handleSuggest = useCallback(async () => {
    if (!accountId) return;
    setBudgetLoading(true);
    setBudget(null);
    setApplied(false);
    try {
      const { ok, body } = await getBudgetSuggestion(accountId);
      if (ok) setBudget(body);
    } catch {
      setError(t('socialAds.budgetError', 'No se pudo generar la sugerencia.'));
    } finally {
      setBudgetLoading(false);
    }
  }, [accountId, t]);

  const totalSpent = useMemo(() => totals.spent_mxn, [totals]);

  return (
    <div
      data-testid="social-ads-campaigns-page"
      style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif', padding: 24 }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
            DesarrollosMX · Social Ads
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('socialAds.campaigns.title', 'Campañas Meta Ads')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('socialAds.campaigns.subtitle', 'Rendimiento por campaña · sugerencia de presupuesto con IA.')}
            {' '}
            <Link to="/portal/asesor/social-ads" style={{ color: '#A5B4FC', textDecoration: 'none' }}>
              {t('socialAds.campaigns.manageConn', 'Gestionar conexiones')}
            </Link>
          </div>
        </header>

        {accounts.length === 0 && !loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: MUTED, background: CARD_BG, border: BORDER, borderRadius: 16 }}>
            {t('socialAds.campaigns.noAccounts', 'Conecta una cuenta de Meta para ver campañas.')}{' '}
            <Link to="/portal/asesor/social-ads" style={{ color: '#A5B4FC' }}>{t('socialAds.connect.connectBtn', 'Conectar')}</Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 18 }}>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: MUTED }}>
                {t('socialAds.campaigns.account', 'Cuenta')}
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="sa-account-select"
                  style={{ marginTop: 4, padding: '8px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: BORDER, color: CREAM, fontSize: 13, minWidth: 220 }}>
                  {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} · {a.account_id}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: MUTED }}>
                {t('socialAds.campaigns.status', 'Estado')}
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ marginTop: 4, padding: '8px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: BORDER, color: CREAM, fontSize: 13 }}>
                  <option value="">{t('socialAds.campaigns.allStatuses', 'Todas')}</option>
                  <option value="ACTIVE">{t('socialAds.campActive', 'Activa')}</option>
                  <option value="PAUSED">{t('socialAds.campPaused', 'Pausada')}</option>
                </select>
              </label>
              <button type="button" onClick={handleSuggest} disabled={budgetLoading} data-testid="budget-suggest-btn"
                style={{ padding: '9px 18px', borderRadius: 9999, border: 'none', background: GRAD, color: '#fff', fontSize: 13, fontWeight: 700, cursor: budgetLoading ? 'wait' : 'pointer' }}>
                {budgetLoading ? t('socialAds.budget.loading', 'Calculando…') : t('socialAds.budget.suggestBtn', 'Sugerencia IA de presupuesto')}
              </button>
            </div>

            {error && (
              <div role="alert" style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.30)', color: '#FBCFE8', fontSize: 13 }}>{error}</div>
            )}

            {/* Budget suggestion card */}
            {budget && (
              <section style={{ background: CARD_BG, border: '1px solid rgba(99,102,241,0.28)', borderRadius: 18, padding: 20, marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700, margin: 0 }}>
                    {t('socialAds.budget.title', 'Sugerencia IA de presupuesto')}
                  </h2>
                  <span style={{ fontSize: 11, opacity: 0.55 }}>
                    {budget.source === 'llm' ? t('socialAds.budget.sourceLlm', 'Generado con IA') : t('socialAds.budget.sourceHeuristic', 'Heurística')}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, margin: '0 0 12px' }}>{budget.rationale}</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(budget.allocation || []).map((al) => (
                    <div key={al.campaign_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ flex: 1, color: CREAM }}>{al.name}</span>
                      <span style={{ color: MUTED }}>{mxn(al.current_budget_mxn)} →</span>
                      <span style={{ fontWeight: 700, color: '#A5B4FC' }}>{mxn(al.suggested_budget_mxn)}</span>
                      <span style={{ width: 48, textAlign: 'right', color: MUTED }}>{al.share_pct}%</span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setApplied(true)} disabled={applied} data-testid="budget-apply-btn"
                  style={{ marginTop: 14, padding: '8px 16px', borderRadius: 9999, border: BORDER, background: applied ? 'rgba(16,185,129,0.12)' : 'transparent', color: applied ? '#6EE7B7' : CREAM, fontSize: 12, fontWeight: 600, cursor: applied ? 'default' : 'pointer' }}>
                  {applied ? t('socialAds.budget.applied', 'Aplicado (demo)') : t('socialAds.budget.apply', 'Aplicar')}
                </button>
              </section>
            )}

            {/* Totals + performance */}
            <section style={{ background: CARD_BG, border: BORDER, borderRadius: 18, padding: 20, marginBottom: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 14 }}>
                <div><div style={{ fontSize: 11, opacity: 0.55 }}>{t('socialAds.totals.spent', 'Gasto')}</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{mxn(totalSpent)}</div></div>
                <div><div style={{ fontSize: 11, opacity: 0.55 }}>{t('socialAds.totals.impressions', 'Impresiones')}</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{fmt(totals.impressions)}</div></div>
                <div><div style={{ fontSize: 11, opacity: 0.55 }}>{t('socialAds.totals.clicks', 'Clics')}</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{fmt(totals.clicks)}</div></div>
                <div><div style={{ fontSize: 11, opacity: 0.55 }}>{t('socialAds.totals.conversions', 'Conversiones')}</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{fmt(totals.conversions)}</div></div>
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>{t('socialAds.perf.title', 'Clics por día · últimos 30d')}</div>
              <PerformanceChart series={perf} />
            </section>

            {/* Campaigns table */}
            <section style={{ background: CARD_BG, border: BORDER, borderRadius: 18, padding: 20 }}>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
                {t('socialAds.campaigns.tableTitle', 'Campañas')} {!loading && `(${campaigns.length})`}
              </h2>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: MUTED }}>{t('common.loading', 'Cargando…')}</div>
              ) : campaigns.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: MUTED }}>{t('socialAds.campaigns.empty', 'Sin campañas para este filtro.')}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ color: 'rgba(240,235,224,0.5)', fontSize: 10.5, textTransform: 'uppercase' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 8 }}>{t('socialAds.col.name', 'Campaña')}</th>
                        <th style={{ textAlign: 'left', paddingBottom: 8 }}>{t('socialAds.col.status', 'Estado')}</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.col.budget', 'Presup.')}</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.col.spent', 'Gasto')}</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.col.impr', 'Impr.')}</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.col.clicks', 'Clics')}</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>CPC</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>CPM</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8 }}>{t('socialAds.col.conv', 'Conv.')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.campaign_id} style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}>
                          <td style={{ padding: '9px 0', color: CREAM }}>{c.name}</td>
                          <td style={{ padding: '9px 0' }}><StatusPill status={c.status} t={t} /></td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{mxn(c.daily_budget_mxn)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{mxn(c.spent_mxn)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{fmt(c.impressions)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{fmt(c.clicks)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{mxn(c.cpc_mxn)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}>{mxn(c.cpm_mxn)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right', color: '#A5B4FC', fontWeight: 600 }}>{fmt(c.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function SocialAdsCampaignsPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <SocialAdsCampaignsPageBody {...props} />
    </PortalLayout>
  );
}
