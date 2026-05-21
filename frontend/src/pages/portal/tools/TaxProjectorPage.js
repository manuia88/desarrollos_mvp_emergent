// W5.x F6 Sub-C · TaxProjectorPage · calculadora fiscal CDMX T0 publica
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getFullScenario } from '../../../api/tax_projector';

// Design tokens (NON-NEGOTIABLE · solo estos hex)
const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const MUTED = 'rgba(240,235,224,0.62)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 9999,
  background: 'rgba(240,235,224,0.04)',
  border: '1px solid rgba(240,235,224,0.14)',
  color: CREAM,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  outline: 'none',
  transition: `border-color 320ms ${EASE}`,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 8,
  fontFamily: 'DM Sans, sans-serif',
  fontWeight: 500,
};

const sectionTitleStyle = {
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  marginBottom: 18,
};

const fmtMXN = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};

function Header() {
  const { t } = useTranslation('common');
  return (
    <header data-testid="tax-projector-header" style={{ padding: '64px 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
        DesarrollosMX · Tools
      </div>
      <h1 style={{
        margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
        fontSize: 'clamp(2rem, 3.6vw, 2.75rem)', lineHeight: 1.08, color: CREAM,
      }}>{t('taxProjector.title')}</h1>
      <p style={{ margin: 0, color: MUTED, fontSize: 15, maxWidth: 720 }}>{t('taxProjector.subtitle')}</p>
    </header>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 24, padding: 28, backdropFilter: 'blur(24px)' }}>
      <div style={{ ...sectionTitleStyle, color: CREAM }}>{title}</div>
      {children}
    </div>
  );
}

function FormFields({ values, onChange, t }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
      <Section title={t('taxProjector.buyer_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_venta')}
          <input type="number" min="0" step="1" value={values.precio_venta} onChange={(e) => onChange('precio_venta', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-venta" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.valor_catastral')}
          <input type="number" min="0" step="1" value={values.valor_catastral} onChange={(e) => onChange('valor_catastral', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-valor-catastral" />
        </label>
      </Section>
      <Section title={t('taxProjector.seller_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_compra')}
          <input type="number" min="0" step="1" value={values.precio_compra} onChange={(e) => onChange('precio_compra', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-compra" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_compra')}
          <input type="date" value={values.fecha_compra} onChange={(e) => onChange('fecha_compra', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-compra" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_venta')}
          <input type="date" value={values.fecha_venta} onChange={(e) => onChange('fecha_venta', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-venta" />
        </label>
      </Section>
    </div>
  );
}

function ResultCard({ accent, eyebrow, headline, value, lines }) {
  return (
    <div style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26, backdropFilter: 'blur(24px)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.22, background: `radial-gradient(circle at top left, ${accent}, transparent 55%)` }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, fontFamily: 'DM Sans, sans-serif' }}>{eyebrow}</div>
        <div style={{ marginTop: 6, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, color: CREAM }}>{headline}</div>
        <div style={{ marginTop: 14, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 32, color: CREAM }}>{value}</div>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, display: 'grid', gap: 6 }}>
          {(lines || []).map((l, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED, fontFamily: 'DM Sans, sans-serif' }}>
              <span>{l.label}</span><strong style={{ color: CREAM, fontWeight: 600 }}>{l.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BreakdownTable({ isr, t }) {
  if (!isr?.ok || !isr.breakdown) return null;
  const b = isr.breakdown;
  const rows = [
    { label: t('taxProjector.row_anios'), value: `${b.anios_tenencia}` },
    { label: t('taxProjector.row_factor_inpc'), value: `${b.factor_inpc} (${b.inpc_compra} → ${b.inpc_venta})` },
    { label: t('taxProjector.row_split'), value: `${(b.terreno_pct * 100).toFixed(0)}% / ${(b.construccion_pct * 100).toFixed(0)}%` },
    { label: t('taxProjector.row_terreno_actualizado'), value: fmtMXN(b.terreno_actualizado) },
    { label: t('taxProjector.row_construccion_actualizada'), value: fmtMXN(b.construccion_actualizada) },
    { label: t('taxProjector.row_depreciacion'), value: `${b.depreciacion_total_pct}%` },
    { label: t('taxProjector.row_deducciones'), value: fmtMXN(isr.deducciones_actualizadas) },
    { label: t('taxProjector.row_ganancia_gravable'), value: fmtMXN(isr.ganancia_gravable) },
    { label: t('taxProjector.row_ganancia_acumulable'), value: fmtMXN(isr.ganancia_acumulable) },
    { label: t('taxProjector.row_marginal'), value: `${b.tarifa_marginal_pct}%` },
    { label: t('taxProjector.row_tasa_efectiva'), value: `${b.tasa_efectiva_pct}%` },
  ];
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26, backdropFilter: 'blur(24px)' }}>
      <div style={{ ...sectionTitleStyle, color: CREAM }}>{t('taxProjector.breakdown_title')}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(240,235,224,0.06)' }}>
              <td style={{ padding: '12px 0', color: MUTED, fontSize: 13 }}>{r.label}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredialChart({ predial, t }) {
  const data = useMemo(() => (predial?.items || []).map((it) => ({ year: it.year, predial: it.predial_estimado })), [predial]);
  if (!data.length) return null;
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26, backdropFilter: 'blur(24px)' }}>
      <div style={{ ...sectionTitleStyle, color: CREAM }}>{t('taxProjector.predial_chart_title')}</div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,235,224,0.08)" />
            <XAxis dataKey="year" stroke="rgba(240,235,224,0.6)" tick={{ fontSize: 12, fill: '#F0EBE0' }} />
            <YAxis stroke="rgba(240,235,224,0.6)" tick={{ fontSize: 12, fill: '#F0EBE0' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              cursor={{ fill: 'rgba(99,102,241,0.08)' }}
              contentStyle={{ background: BG, border: '1px solid rgba(240,235,224,0.18)', borderRadius: 12, color: CREAM }}
              formatter={(v) => fmtMXN(v)}
            />
            <Bar dataKey="predial" fill={INDIGO} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TaxProjectorPage() {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({
    precio_compra: '',
    fecha_compra: '',
    precio_venta: '',
    fecha_venta: '',
    valor_catastral: '',
  });
  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const onChange = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const canSubmit = useMemo(() => {
    const v = values;
    return (
      Number(v.precio_compra) > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(v.fecha_compra) &&
      Number(v.precio_venta) > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(v.fecha_venta) &&
      Number(v.valor_catastral) >= 0
    );
  }, [values]);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setErr('');
    try {
      const params = {
        precio_compra: Number(values.precio_compra),
        fecha_compra: values.fecha_compra,
        precio_venta: Number(values.precio_venta),
        fecha_venta: values.fecha_venta,
        valor_catastral: Number(values.valor_catastral || 0),
      };
      const r = await getFullScenario(params);
      setScenario(r);
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('taxProjector.error_generic'));
      setScenario(null);
    } finally {
      setLoading(false);
    }
  };

  const isr = scenario?.isr_vendedor;
  const isai = scenario?.isai_comprador;
  const predial = scenario?.predial_10y;
  const closing = scenario?.closing_total;

  return (
    <div data-testid="tax-projector-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px' }}>
        <FormFields values={values} onChange={onChange} t={t} />

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 28 }}>
          <button
            data-testid="btn-calcular"
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || loading}
            style={{
              padding: '14px 34px',
              borderRadius: 9999,
              border: 'none',
              background: GRADIENT,
              color: '#FFFFFF',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
              opacity: canSubmit && !loading ? 1 : 0.45,
              transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
            }}
          >
            {loading ? t('taxProjector.calculating') : t('taxProjector.cta_calcular')}
          </button>
        </div>

        {err && (
          <div data-testid="tax-error" style={{ marginTop: 22, padding: '14px 18px', borderRadius: 18, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.32)', color: CREAM }}>
            {err}
          </div>
        )}

        {!scenario && !loading && !err && (
          <div data-testid="empty-state" style={{
            marginTop: 36, padding: '32px 28px', borderRadius: 24, background: CARD_BG, border: BORDER, textAlign: 'center',
            color: MUTED, fontSize: 15, backdropFilter: 'blur(24px)',
          }}>
            {t('taxProjector.empty_state')}
          </div>
        )}

        {loading && (
          <div data-testid="loading-state" style={{
            marginTop: 36, padding: '32px 28px', borderRadius: 24, background: CARD_BG, border: BORDER, textAlign: 'center',
            color: MUTED, fontSize: 15, backdropFilter: 'blur(24px)',
          }}>
            {t('taxProjector.loading_state')}
          </div>
        )}

        {scenario && (
          <section data-testid="tax-results" style={{ marginTop: 36, display: 'grid', gap: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
              <ResultCard
                accent={ROSE}
                eyebrow={t('taxProjector.card_isr_eyebrow')}
                headline={t('taxProjector.card_isr_title')}
                value={isr?.ok ? fmtMXN(isr.isr_total) : '—'}
                lines={isr?.ok ? [
                  { label: t('taxProjector.row_isr_federacion'), value: fmtMXN(isr.isr_federacion) },
                  { label: t('taxProjector.row_isr_entidad'), value: fmtMXN(isr.isr_entidad) },
                  { label: t('taxProjector.row_factor_inpc_short'), value: isr.breakdown?.factor_inpc },
                  { label: t('taxProjector.row_ganancia_short'), value: fmtMXN(isr.ganancia_gravable) },
                ] : [{ label: t('taxProjector.error_short'), value: isr?.reason || '—' }]}
              />
              <ResultCard
                accent={INDIGO}
                eyebrow={t('taxProjector.card_isai_eyebrow')}
                headline={t('taxProjector.card_isai_title')}
                value={isai?.ok ? fmtMXN(isai.isai) : '—'}
                lines={isai?.ok ? [
                  { label: t('taxProjector.row_isai_base'), value: fmtMXN(isai.base) },
                  { label: t('taxProjector.row_isai_base_usada'), value: isai.breakdown?.base_usada || '—' },
                  { label: t('taxProjector.row_isai_marginal'), value: `${isai.breakdown?.marginal_pct || 0}%` },
                  { label: t('taxProjector.row_tasa_efectiva'), value: `${isai.breakdown?.tasa_efectiva_pct || 0}%` },
                ] : [{ label: t('taxProjector.error_short'), value: isai?.reason || '—' }]}
              />
              <ResultCard
                accent={CREAM}
                eyebrow={t('taxProjector.card_closing_eyebrow')}
                headline={t('taxProjector.card_closing_title')}
                value={closing?.ok ? fmtMXN(closing.total) : '—'}
                lines={closing?.ok ? [
                  { label: t('taxProjector.row_closing_isai'), value: fmtMXN(closing.isai) },
                  { label: t('taxProjector.row_closing_notario'), value: fmtMXN(closing.notario_fees) },
                  { label: t('taxProjector.row_closing_avaluo'), value: fmtMXN(closing.avaluo) },
                  { label: t('taxProjector.row_closing_iva'), value: fmtMXN(closing.iva) },
                ] : [{ label: t('taxProjector.error_short'), value: closing?.reason || '—' }]}
              />
            </div>
            <BreakdownTable isr={isr} t={t} />
            <PredialChart predial={predial} t={t} />
          </section>
        )}
      </main>
    </div>
  );
}
