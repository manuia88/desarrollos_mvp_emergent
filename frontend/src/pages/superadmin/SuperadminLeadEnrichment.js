/**
 * W7.AS.1 · Superadmin Lead Enrichment monitoring dashboard.
 *
 * KPIs · distribución por source · uso por tenant (near-cap alert) · filtros.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getEnrichmentStats } from '../../api/leadEnrichment';

const CARD = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};
const KPI = {
  padding: 16, borderRadius: 14,
  background: 'rgba(99,102,241,0.06)',
  border: '1px solid rgba(99,102,241,0.18)',
};
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}
function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function SourceBar({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#E5E7EB' }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{fmtNum(count)} · {pct}%</span>
      </div>
      <div style={{
        height: 6, borderRadius: 9999, overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          backgroundImage: GRAD,
        }} />
      </div>
    </div>
  );
}

export default function SuperadminLeadEnrichment() {
  const { t } = useTranslation('common');
  const [days, setDays] = useState(30);
  const [tenantFilter, setTenantFilter] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, body } = await getEnrichmentStats(days, tenantFilter);
      if (!ok) {
        setError(t('leadEnrichment.superadmin.loadError'));
        setStats(null);
        return;
      }
      setStats(body);
    } catch (e) {
      setError(t('leadEnrichment.superadmin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [days, tenantFilter, t]);

  useEffect(() => { load(); }, [load]);

  const totals = stats?.totals || {};
  const bySource = stats?.by_source || {};
  const byTenant = stats?.by_tenant || {};
  const cap = stats?.cap_per_tenant_daily;

  const sourceLabels = useMemo(() => ({
    email_validation: t('leadEnrichment.sourceLabel.email_validation'),
    linkedin_pdl: t('leadEnrichment.sourceLabel.linkedin_pdl'),
    company_clearbit: t('leadEnrichment.sourceLabel.company_clearbit'),
    ai_research_summary: t('leadEnrichment.sourceLabel.ai_research_summary'),
  }), [t]);

  const totalSourceCounts = useMemo(
    () => Object.values(bySource).reduce((a, b) => a + (b || 0), 0),
    [bySource],
  );

  const tenantRows = useMemo(() => {
    const entries = Object.entries(byTenant);
    return entries.map(([tid, v]) => ({
      tenant_id: tid,
      count: v.count || 0,
      cost_usd: v.cost_usd || 0,
      near_cap: !!v.near_cap,
    })).sort((a, b) => b.count - a.count);
  }, [byTenant]);

  return (
    <SuperadminLayout>
      <div style={{ padding: 24, color: '#E5E7EB' }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{
            margin: 0, fontSize: 28, fontWeight: 700,
            backgroundImage: GRAD, WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {t('leadEnrichment.superadmin.title')}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
            {t('leadEnrichment.superadmin.subtitle')}
          </p>
        </header>

        <div style={{ ...CARD, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12,
                            color: 'rgba(255,255,255,0.6)' }}>
              {t('leadEnrichment.superadmin.filterDays')}
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{
                  marginTop: 4, padding: '8px 12px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E7EB', fontSize: 13,
                }}>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
                <option value={90}>90d</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12,
                            color: 'rgba(255,255,255,0.6)', minWidth: 220 }}>
              {t('leadEnrichment.superadmin.filterTenant')}
              <input
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value.trim())}
                placeholder="tenant_id…"
                style={{
                  marginTop: 4, padding: '8px 12px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E7EB', fontSize: 13,
                }} />
            </label>
            {cap !== undefined ? (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {t('leadEnrichment.superadmin.capLabel')}: <strong style={{ color: '#E5E7EB' }}>{fmtNum(cap)}</strong>
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div role="alert" style={{
            padding: 12, marginBottom: 16, borderRadius: 12,
            background: 'rgba(239,68,68,0.10)', color: '#FCA5A5', fontSize: 13,
          }}>{error}</div>
        ) : null}

        {loading && !stats ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>…</p>
        ) : (
          <>
            <div style={{
              display: 'grid', gap: 14, marginBottom: 22,
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            }}>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {t('leadEnrichment.superadmin.kpi.totalEnriched')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {fmtNum(totals.total_enriched)}
                </div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {t('leadEnrichment.superadmin.kpi.successRate')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {fmtPct(totals.success_rate)}
                </div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {t('leadEnrichment.superadmin.kpi.totalCost')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {fmtUsd(totals.total_cost_usd)}
                </div>
              </div>
              <div style={KPI}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {t('leadEnrichment.superadmin.kpi.avgCost')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {fmtUsd(totals.avg_cost_usd)}
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            }}>
              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>
                  {t('leadEnrichment.superadmin.bySource')}
                </h2>
                {Object.keys(bySource).length === 0 ? (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>—</p>
                ) : (
                  Object.entries(bySource)
                    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                    .map(([key, count]) => (
                      <SourceBar
                        key={key}
                        label={sourceLabels[key] || key}
                        count={count}
                        total={totalSourceCounts}
                      />
                    ))
                )}
              </div>

              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>
                  {t('leadEnrichment.superadmin.byTenant')}
                </h2>
                {tenantRows.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>—</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase' }}>
                          <th style={{ textAlign: 'left', paddingBottom: 8 }}>tenant_id</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>uso</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>USD</th>
                          <th style={{ textAlign: 'right', paddingBottom: 8 }}>flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantRows.map((r) => (
                          <tr key={r.tenant_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '8px 0', color: '#E5E7EB',
                                         fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                         maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                                         whiteSpace: 'nowrap' }}>
                              {r.tenant_id}
                            </td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtNum(r.count)}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtUsd(r.cost_usd)}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>
                              {r.near_cap ? (
                                <span style={{
                                  display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
                                  background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                                  fontSize: 11, fontWeight: 600,
                                }}>
                                  {t('leadEnrichment.superadmin.nearCap')}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SuperadminLayout>
  );
}
