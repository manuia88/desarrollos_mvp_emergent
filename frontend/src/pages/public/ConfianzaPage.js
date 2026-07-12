/**
 * W5.15 Parte 2 Sub-A — Pagina publica /confianza (Fitch-style).
 *
 * Diseno DMX estandar (NO aurora). Pulls /api/accuracy/meta-dashboard +
 * /api/accuracy/per-zone (silent fail si 401). Renderiza KPIs, reliability
 * diagram, tabla colonias, ticker top 3, CTA descarga PDF.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getMetaDashboard, exportPdfUrl } from '../../api/accuracy';
import AccuracyTopZonesTicker from '../../components/shared/AccuracyTopZonesTicker';
import Navbar from '../../components/landing/Navbar';

const API = process.env.REACT_APP_BACKEND_URL;

const CONF_STYLE = {
  ALTA:  { bg: 'rgba(34,197,94,0.14)',  fg: '#86efac', border: 'rgba(34,197,94,0.45)' },
  MEDIA: { bg: 'rgba(234,179,8,0.14)',  fg: '#fde68a', border: 'rgba(234,179,8,0.45)' },
  BAJA:  { bg: 'rgba(239,68,68,0.14)',  fg: '#fecaca', border: 'rgba(239,68,68,0.45)' },
};

export default function ConfianzaPage() {
  const { t } = useTranslation('common');
  const [meta, setMeta] = useState(null);
  const [perZone, setPerZone] = useState([]);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    let cancel = false;
    (async () => {
      const m = await getMetaDashboard();
      if (cancel) return;
      setMeta(m.body || null);
      try {
        const r = await fetch(`${API}/api/accuracy/per-zone`, { credentials: 'include' });
        if (r.ok) {
          const body = await r.json();
          setPerZone((body.zones || [])
            .filter((z) => z.mape_30d != null)
            .sort((a, b) => (a.mape_30d || 0) - (b.mape_30d || 0))
            .slice(0, 10));
        }
      } catch (_) { /* silent */ }
    })();
    return () => { cancel = true; };
  }, []);

  const insufficient = meta?.state === 'insufficient_data';
  const conf = meta?.confidence_label || 'BAJA';
  const cs = CONF_STYLE[conf] || CONF_STYLE.BAJA;

  return (
    <div data-testid="confianza-page" style={{
      background: '#06080F', minHeight: '100vh', color: '#F0EBE0',
      padding: '48px 24px 80px', fontFamily: 'DM Sans',
    }}>
      <Navbar />
      <div style={{ height: 60 }} />
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Hero */}
        <header data-testid="confianza-hero">
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>
            {t('confianza.eyebrow')}
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 48, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.05 }}>
            {t('confianza.title')}
          </h1>
          <p style={{ fontSize: 15.5, color: 'rgba(240,235,224,0.70)', marginTop: 12, maxWidth: 680, lineHeight: 1.55 }}>
            {t('confianza.subtitle')}
          </p>
        </header>

        {/* Ticker */}
        <AccuracyTopZonesTicker />

        {/* Fallback insufficient */}
        {insufficient ? (
          <section data-testid="confianza-insufficient" style={{
            padding: 28, borderRadius: 18,
            background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'rgba(165,180,252,0.85)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
              {t('confianza.fallback.sample_label')}: {meta?.sample_size ?? 0} / {meta?.min_required ?? 20}
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 24, margin: '12px 0 0' }}>
              {t('confianza.fallback.insufficient', { n: meta?.eta_days ?? '—' })}
            </h2>
          </section>
        ) : (
          <>
            {/* KPI strip */}
            <section data-testid="confianza-kpis" style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12,
            }}>
              <Kpi label={t('confianza.kpis.mape_30d')} value={fmtPct(meta?.global_mape_30d)} />
              <Kpi label={t('confianza.kpis.hit_rate')} value={meta?.hit_rate != null ? `${(meta.hit_rate * 100).toFixed(1)}%` : '—'} />
              <Kpi label={t('confianza.kpis.sample_size')} value={meta?.sample_size ?? '—'} />
              <Kpi label={t('confianza.kpis.confidence_label')}
                value={<span style={{
                  display: 'inline-flex', padding: '3px 10px', borderRadius: 9999, fontSize: 14,
                  background: cs.bg, color: cs.fg, border: `1px solid ${cs.border}`,
                }}>{t(`confianza.confidence.${conf}`, conf)}</span>} />
            </section>

            {/* Reliability diagram */}
            <section data-testid="confianza-reliability" style={{
              padding: 22, borderRadius: 16,
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 19, margin: 0 }}>{t('confianza.sections.reliability')}</h2>
                  <p style={{ fontSize: 12, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>{t('confianza.sections.reliability_sub')}</p>
                </div>
                {meta?.calibration_error != null && (
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11.5, color: '#a5b4fc' }}>
                    {t('confianza.sections.calibration_error')}: {Number(meta.calibration_error).toFixed(3)}
                  </span>
                )}
              </div>
              {(meta?.calibration_curve_data || []).length === 0 ? (
                <EmptyState text={t('confianza.fallback.no_data')} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <XAxis type="number" dataKey="predicted_confidence" domain={[0, 1]} tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" name="predicted" />
                    <YAxis type="number" dataKey="actual_accuracy" domain={[0, 1]} tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" name="actual" />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="rgba(255,255,255,0.30)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                    <Tooltip contentStyle={{ background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(99,102,241,0.45)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11 }} />
                    <Scatter
                      data={(meta?.calibration_curve_data || []).filter((b) => b.actual_accuracy != null)}
                      fill="#6366F1"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </section>

            {/* Per-zone table */}
            <section data-testid="confianza-per-zone" style={{
              padding: 22, borderRadius: 16,
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 19, margin: '0 0 14px' }}>
                {t('confianza.sections.per_zone')}
              </h2>
              {perZone.length === 0 ? (
                <EmptyState text={t('confianza.fallback.no_data')} />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'rgba(99,102,241,0.10)' }}>
                      <Th>{t('confianza.fields.zone')}</Th>
                      <Th>{t('confianza.fields.mape')}</Th>
                      <Th>{t('confianza.fields.hit_rate')}</Th>
                      <Th>{t('confianza.fields.sample')}</Th>
                      <Th>{t('confianza.fields.confidence')}</Th>
                      <Th>{t('confianza.fields.weights_version')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {perZone.map((z) => (
                      <tr key={z.zone_slug} data-testid={`confianza-zone-${z.zone_slug}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Td><span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{z.zone_slug}</span></Td>
                        <Td>{fmtPct(z.mape_30d)}</Td>
                        <Td>{z.hit_rate != null ? `${(z.hit_rate * 100).toFixed(1)}%` : '—'}</Td>
                        <Td>{z.sample_size}</Td>
                        <Td>
                          <span style={{
                            display: 'inline-flex', padding: '3px 10px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700,
                            background: (CONF_STYLE[z.confidence_label] || CONF_STYLE.BAJA).bg,
                            color: (CONF_STYLE[z.confidence_label] || CONF_STYLE.BAJA).fg,
                            border: `1px solid ${(CONF_STYLE[z.confidence_label] || CONF_STYLE.BAJA).border}`,
                            letterSpacing: '0.06em',
                          }}>{t(`confianza.confidence.${z.confidence_label}`, z.confidence_label || 'BAJA')}</span>
                        </Td>
                        <Td>{z.weights_version || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* MAPE sparkline horizons (mocked sparklines if no series · solo informativo) */}
            <section data-testid="confianza-horizon" style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
            }}>
              <HorizonCard label={t('confianza.kpis.mape_30d')} value={meta?.global_mape_30d} />
              <HorizonCard label={t('confianza.kpis.mape_90d')} value={null} />
              <HorizonCard label={t('confianza.kpis.mape_365d')} value={null} />
            </section>
          </>
        )}

        {/* CTA download */}
        <section data-testid="confianza-cta" style={{
          padding: 22, borderRadius: 18,
          background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(99,102,241,0.18)',
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, margin: 0 }}>
              {t('confianza.cta.download_pdf')}
            </h3>
            <p style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.65)', marginTop: 4 }}>
              {t('confianza.footer.audit_trail')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>{t('confianza.cta.select_period')}</label>
            <select
              data-testid="confianza-period-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12,
                background: 'rgba(255,255,255,0.05)', color: '#F0EBE0',
                border: '1px solid rgba(99,102,241,0.30)',
              }}>
              <option value="30d">{t('confianza.periods.30d')}</option>
              <option value="90d">{t('confianza.periods.90d')}</option>
              <option value="365d">{t('confianza.periods.365d')}</option>
            </select>
            <a
              data-testid="confianza-download-pdf"
              href={exportPdfUrl(period)}
              target="_blank" rel="noreferrer"
              style={{
                padding: '10px 22px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
                textDecoration: 'none', color: '#fff',
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                border: '1px solid rgba(99,102,241,0.55)',
              }}>{t('confianza.cta.download_pdf')}</a>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ fontSize: 11, color: 'rgba(240,235,224,0.45)', textAlign: 'center', marginTop: 8 }}>
          {t('confianza.footer.audit_trail')} · {t('confianza.footer.last_updated')}: {(meta?.last_updated || '').slice(0, 16).replace('T', ' ')}
        </footer>
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div data-testid={`confianza-kpi-${(label || '').toLowerCase().replace(/\s+/g, '-')}`} style={{
      padding: 16, borderRadius: 14,
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(165,180,252,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, marginTop: 4 }}>{value || '—'}</div>
    </div>
  );
}

function HorizonCard({ label, value }) {
  // Sin endpoint de serie temporal: mostramos solo el valor puntual real,
  // nunca una sparkline sintética con jitter.
  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(99,102,241,0.18)',
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(165,180,252,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, marginTop: 4 }}>{fmtPct(value)}</div>
      {value == null && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 6 }}>
          Sin datos suficientes.
        </div>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 10.5, color: 'rgba(240,235,224,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</th>;
}
function Td({ children }) {
  return <td style={{ padding: '10px 14px', color: '#F0EBE0' }}>{children}</td>;
}
function EmptyState({ text }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.55)' }}>
      {text}
    </div>
  );
}

function fmtPct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(2)}%`;
}
