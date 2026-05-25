/**
 * W7.AS.1 · Lead Enrichment Panel · embeddable component.
 *
 * Pega este componente dentro de la pagina de detalle del lead (asesor view).
 * Lazy fetch on mount: revisa cache, si vacío muestra empty state con CTA.
 * Re-enrich permite forzar refresh (cache >30d).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  enrichLead,
  getEnrichmentCache,
} from '../../api/leadEnrichment';

const PANEL_BG = 'rgba(13,16,23,0.85)';
const BORDER = '1px solid rgba(255,255,255,0.08)';
const ACCENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const FIELD_KEYS = [
  ['linkedin_url', 'linkedinUrl'],
  ['headline', 'headline'],
  ['job_title', 'jobTitle'],
  ['job_company_name', 'jobCompany'],
  ['job_company_industry', 'industry'],
  ['company_name', 'jobCompany'],
  ['company_industry', 'industry'],
  ['company_size', 'companySize'],
];

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function Badge({ children, tone = 'default' }) {
  const colors = {
    default: { bg: 'rgba(255,255,255,0.06)', fg: '#E5E7EB' },
    success: { bg: 'rgba(16,185,129,0.12)', fg: '#34D399' },
    warn:    { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
    info:    { bg: 'rgba(99,102,241,0.12)', fg: '#A5B4FC' },
  };
  const c = colors[tone] || colors.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 9999,
      background: c.bg, color: c.fg, fontSize: 12, fontWeight: 500,
    }}>{children}</span>
  );
}

function FieldRow({ label, value, isLink }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBlock: 6 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer noopener"
           style={{ color: '#A5B4FC', textDecoration: 'none', fontSize: 14, wordBreak: 'break-all' }}>
          {value}
        </a>
      ) : (
        <span style={{ color: '#E5E7EB', fontSize: 14 }}>{String(value)}</span>
      )}
    </div>
  );
}

export default function LeadEnrichmentPanel({ leadId, initialData = null, onEnriched }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadCache = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const { ok, status, body } = await getEnrichmentCache(leadId);
      if (!ok) {
        if (status === 403) setError(t('leadEnrichment.errors.forbidden'));
        else if (status === 404) setError(t('leadEnrichment.errors.notFound'));
        else setError(t('leadEnrichment.errors.generic'));
        return;
      }
      if (body && body.status === 'ok') {
        setData(body);
      } else {
        setData(null);
      }
    } catch (e) {
      setError(t('leadEnrichment.errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [leadId, t]);

  useEffect(() => { if (!initialData) loadCache(); }, [loadCache, initialData]);

  const handleEnrich = async (force = false) => {
    if (busy || !leadId) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, status, body } = await enrichLead(leadId, force);
      if (!ok) {
        if (status === 429) setError(t('leadEnrichment.errors.rateLimited'));
        else if (status === 403) setError(t('leadEnrichment.errors.forbidden'));
        else if (status === 404) setError(t('leadEnrichment.errors.notFound'));
        else setError(t('leadEnrichment.errors.generic'));
        return;
      }
      setData(body);
      if (typeof onEnriched === 'function') onEnriched(body);
    } catch (e) {
      setError(t('leadEnrichment.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const enrichedFields = data?.enriched_fields || {};
  const sourcesUsed = data?.sources_used || [];
  const summary = enrichedFields.summary;

  const cachedDays = useMemo(() => daysSince(data?.cached_at), [data?.cached_at]);
  const showReEnrich = data && cachedDays !== null && cachedDays >= 25;

  const isEmpty = !data || (Object.keys(enrichedFields).length === 0);

  return (
    <section style={{
      background: PANEL_BG, backdropFilter: 'blur(24px)',
      border: BORDER, borderRadius: 16, padding: 18, color: '#E5E7EB',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between',
                       alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0,
                       backgroundImage: ACCENT, WebkitBackgroundClip: 'text',
                       WebkitTextFillColor: 'transparent' }}>
            {t('leadEnrichment.panel.title')}
          </h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '4px 0 0' }}>
            {t('leadEnrichment.panel.subtitle')}
          </p>
        </div>
        {data?.confidence ? (
          <Badge tone="info">
            {t('leadEnrichment.panel.confidence')}: {Math.round((data.confidence || 0) * 100)}%
          </Badge>
        ) : null}
      </header>

      {error ? (
        <div role="alert" style={{
          padding: 10, marginBottom: 12, borderRadius: 10,
          background: 'rgba(239,68,68,0.10)', color: '#FCA5A5', fontSize: 13,
        }}>{error}</div>
      ) : null}

      {loading ? (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          {t('leadEnrichment.panel.loading')}
        </p>
      ) : isEmpty ? (
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>
            {t('leadEnrichment.empty.title')}
          </h4>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 14px' }}>
            {t('leadEnrichment.empty.body')}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleEnrich(false)}
            style={{
              padding: '10px 22px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              backgroundImage: ACCENT, opacity: busy ? 0.6 : 1,
            }}>
            {busy ? t('leadEnrichment.panel.loading') : t('leadEnrichment.action.enrichNow')}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {FIELD_KEYS.map(([k, lk]) => (
              enrichedFields[k] ? (
                <FieldRow
                  key={k}
                  label={t(`leadEnrichment.field.${lk}`)}
                  value={enrichedFields[k]}
                  isLink={k === 'linkedin_url'}
                />
              ) : null
            ))}
          </div>

          {summary ? (
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 12,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <span style={{ fontSize: 11, color: '#A5B4FC',
                             textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('leadEnrichment.field.summary')}
              </span>
              <p style={{ fontSize: 13, lineHeight: 1.55, margin: '4px 0 0', color: '#E5E7EB' }}>
                {summary}
              </p>
            </div>
          ) : null}

          <footer style={{
            marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8,
            alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, color: 'rgba(255,255,255,0.55)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sourcesUsed.map((s) => (
                <Badge key={s} tone="default">
                  {t(`leadEnrichment.sourceLabel.${s}`, { defaultValue: s })}
                </Badge>
              ))}
              {data?.cached ? <Badge tone="success">{t('leadEnrichment.panel.cached')}</Badge> : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {data?.cost_usd !== undefined ? (
                <span>{t('leadEnrichment.panel.cost')}: ${Number(data.cost_usd).toFixed(3)}</span>
              ) : null}
              {cachedDays !== null ? (
                <span>{t('leadEnrichment.panel.freshness', { days: cachedDays })}</span>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => handleEnrich(true)}
                style={{
                  padding: '6px 14px', borderRadius: 9999, border: BORDER,
                  background: 'transparent', color: '#E5E7EB', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, opacity: busy ? 0.6 : 1,
                }}>
                {showReEnrich
                  ? t('leadEnrichment.action.reEnrich')
                  : t('leadEnrichment.action.refresh')}
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
