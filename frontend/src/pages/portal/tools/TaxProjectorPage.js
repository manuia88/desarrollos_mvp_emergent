// W5.x F6 Sub-C · TaxProjectorPage · calculadora fiscal CDMX T0 publica
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getIsrVendedor, getIsaiComprador, getPredialProjection, getClosingCost } from '../../../api/tax_projector';

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
    <header data-testid="tax-projector-header" style={{ padding: '40px 24px 24px', maxWidth: 1200, margin: '0 auto' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', background: CARD_BG, border: BORDER, borderRadius: 24, padding: 28, backdropFilter: 'blur(24px)' }}>
      <div style={{ ...sectionTitleStyle, color: CREAM }}>{title}</div>
      {children}
    </div>
  );
}

// CurrencyInput · acepta decimales · $X,XXX,XXX.XX
function CurrencyInput({ value, onChange, ...props }) {
  const [display, setDisplay] = useState('');
  const focusedRef = useRef(false);

  const fmtFull = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtEditing = (raw) => {
    if (!raw) return '';
    const parts = raw.split('.');
    const intPart = Number(parts[0] || 0).toLocaleString('en-US');
    if (parts.length > 1) return '$' + intPart + '.' + parts[1];
    return '$' + intPart;
  };

  useEffect(() => {
    if (focusedRef.current) return;
    if (value === '' || value == null) { setDisplay(''); return; }
    const n = Number(value);
    if (!isNaN(n) && n > 0) {
      setDisplay(fmtFull(n));
    } else {
      setDisplay('');
    }
  }, [value]);

  const handleChange = (e) => {
    let raw = e.target.value.replace(/[^\d.]/g, '');
    const dotIdx = raw.indexOf('.');
    if (dotIdx !== -1) {
      raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, '');
      raw = raw.slice(0, dotIdx + 3);
    }
    onChange(raw);
    setDisplay(fmtEditing(raw));
  };

  const handleFocus = () => {
    focusedRef.current = true;
    if (value) {
      setDisplay(fmtEditing(value));
    } else {
      setDisplay('');
    }
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const n = Number(value);
    if (!isNaN(n) && n > 0) {
      setDisplay(fmtFull(n));
    } else {
      setDisplay('');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      {...props}
    />
  );
}

function FormFields({ values, onChange, t, buyerButton, sellerButton }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
      <Section title={t('taxProjector.buyer_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_venta')}
          <CurrencyInput value={values.precio_venta} onChange={(v) => onChange('precio_venta', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-venta" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.valor_catastral')}
          <CurrencyInput value={values.valor_catastral} onChange={(v) => onChange('valor_catastral', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-valor-catastral" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.predial_anual_actual')}
          <CurrencyInput value={values.predial_anual_actual} onChange={(v) => onChange('predial_anual_actual', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-predial-actual" placeholder="$0.00 (opcional)" />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
            {t('taxProjector.predial_anual_actual_hint')}
          </div>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 18, cursor: 'pointer', color: CREAM, fontSize: 13, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={!!values.con_credito_hipotecario}
            onChange={(e) => onChange('con_credito_hipotecario', e.target.checked)}
            style={{ accentColor: INDIGO, cursor: 'pointer', marginTop: 2 }}
            data-testid="checkbox-hipoteca"
          />
          <span>{t('taxProjector.credito_hipotecario')}</span>
        </label>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
          {t('taxProjector.credito_hipotecario_hint')}
        </div>
        {values.con_credito_hipotecario && (
          <label style={{ ...labelStyle, marginTop: 14 }}>{t('taxProjector.monto_credito')}
            <CurrencyInput value={values.monto_credito} onChange={(v) => onChange('monto_credito', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-monto-credito" placeholder="$0.00 (opcional)" />
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
              {t('taxProjector.monto_credito_hint')}
            </div>
          </label>
        )}
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.descuentos_section')}
          <select
            value={values.mes_pago_anticipado || ''}
            onChange={(e) => onChange('mes_pago_anticipado', e.target.value)}
            data-testid="select-mes-pago"
            style={{
              ...inputStyle, marginTop: 8, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3e%3cpath fill='${encodeURIComponent('rgba(240,235,224,0.62)')}' d='M6 8L0 0h12z'/%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 18px center',
              paddingRight: 42,
              cursor: 'pointer',
            }}
          >
            <option value="" style={{ background: BG, color: CREAM }}>{t('taxProjector.mes_placeholder')}</option>
            <option value="enero" style={{ background: BG, color: CREAM }}>{t('taxProjector.mes_enero')}</option>
            <option value="febrero" style={{ background: BG, color: CREAM }}>{t('taxProjector.mes_febrero')}</option>
            <option value="marzo_o_despues" style={{ background: BG, color: CREAM }}>{t('taxProjector.mes_marzo_despues')}</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer', color: CREAM, fontSize: 13, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={!!values.grupo_vulnerable}
            onChange={(e) => onChange('grupo_vulnerable', e.target.checked)}
            style={{ accentColor: INDIGO, cursor: 'pointer', marginTop: 2 }}
            data-testid="checkbox-vulnerable"
          />
          <span>{t('taxProjector.grupo_vulnerable')}</span>
        </label>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
          {t('taxProjector.grupo_vulnerable_hint')}
        </div>
        {buyerButton && <div style={{ marginTop: 'auto', paddingTop: 20 }}>{buyerButton}</div>}
      </Section>
      <Section title={t('taxProjector.seller_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_compra')}
          <CurrencyInput value={values.precio_compra} onChange={(v) => onChange('precio_compra', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-compra" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.precio_venta_seller')}
          <CurrencyInput value={values.precio_venta} onChange={(v) => onChange('precio_venta', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-venta-seller" placeholder="$0.00" />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
            {t('taxProjector.precio_venta_seller_hint')}
          </div>
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_compra')}
          <input type="text" value={values.fecha_compra} onChange={(e) => onChange('fecha_compra', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-compra" placeholder="2018 o 15/03/2018" />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
            {t('taxProjector.fecha_hint')}
          </div>
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_venta')}
          <input type="text" value={values.fecha_venta} onChange={(e) => onChange('fecha_venta', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-venta" placeholder="2026 o 22/05/2026" />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
            {t('taxProjector.fecha_hint')}
          </div>
        </label>
        {sellerButton && <div style={{ marginTop: 'auto', paddingTop: 20 }}>{sellerButton}</div>}
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

function IsaiBreakdownTable({ isai, t }) {
  if (!isai?.ok || !isai.breakdown) return null;
  const b = isai.breakdown;
  const baseLabel = b.base_usada === 'precio_venta' ? t('taxProjector.row_isai_src_precio') : t('taxProjector.row_isai_src_catastral');
  const rangoVal = (b.limite_superior >= 1e17)
    ? `${fmtMXN(b.limite_inferior)} en adelante`
    : `${fmtMXN(b.limite_inferior)} — ${fmtMXN(b.limite_superior)}`;
  const rows = [
    { label: t('taxProjector.row_isai_precio_venta'), value: fmtMXN(b.precio_venta) },
    { label: t('taxProjector.row_isai_valor_catastral'), value: fmtMXN(b.valor_catastral) },
    { label: t('taxProjector.row_isai_base'), value: `${fmtMXN(isai.base)} (${baseLabel})` },
    { label: t('taxProjector.row_isai_rango'), value: rangoVal },
    { label: t('taxProjector.row_isai_cuota_fija'), value: fmtMXN(b.cuota_fija) },
    { label: t('taxProjector.row_isai_excedente'), value: fmtMXN(b.excedente) },
    { label: t('taxProjector.row_isai_marginal'), value: `${b.marginal_pct}%` },
    { label: t('taxProjector.row_isai_calculo'), value: `${fmtMXN(b.cuota_fija)} + (${fmtMXN(b.excedente)} × ${b.marginal_pct}%) = ${fmtMXN(isai.isai)}` },
    { label: t('taxProjector.row_tasa_efectiva'), value: `${b.tasa_efectiva_pct}%` },
  ];
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26, backdropFilter: 'blur(24px)' }}>
      <div style={{ ...sectionTitleStyle, color: CREAM }}>{t('taxProjector.breakdown_isai_title')}</div>
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
  const totalBruto = predial?.total_bruto_10y || 0;
  const totalNeto = predial?.total_10y || 0;
  const ahorro = predial?.ahorro_10y || 0;
  const showSavings = ahorro > 0;
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
      <div style={{ display: 'grid', gridTemplateColumns: showSavings ? 'repeat(3, 1fr)' : '1fr', gap: 14, marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(240,235,224,0.10)' }}>
        {showSavings && (
          <div>
            <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{t('taxProjector.predial_total_bruto')}</div>
            <div style={{ fontSize: 18, color: CREAM, fontFamily: 'Outfit, sans-serif', fontWeight: 700, marginTop: 4 }}>{fmtMXN(totalBruto)}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{t('taxProjector.predial_total_neto')}</div>
          <div style={{ fontSize: 18, color: CREAM, fontFamily: 'Outfit, sans-serif', fontWeight: 700, marginTop: 4 }}>{fmtMXN(totalNeto)}</div>
        </div>
        {showSavings && (
          <div>
            <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{t('taxProjector.predial_ahorro')}</div>
            <div style={{ fontSize: 18, color: ROSE, fontFamily: 'Outfit, sans-serif', fontWeight: 700, marginTop: 4 }}>−{fmtMXN(ahorro)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaxProjectorPage() {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({
    predial_anual_actual: '',
    mes_pago_anticipado: '',
    grupo_vulnerable: false,
    con_credito_hipotecario: false,
    monto_credito: '',
    precio_compra: '',
    fecha_compra: '',
    precio_venta: '',
    fecha_venta: '',
    valor_catastral: '',
  });
  const [mode, setMode] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const onChange = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const onReset = () => {
    setValues({
      predial_anual_actual: '',
      mes_pago_anticipado: '',
      grupo_vulnerable: false,
      con_credito_hipotecario: false,
      monto_credito: '',
      precio_compra: '',
      fecha_compra: '',
      precio_venta: '',
      fecha_venta: '',
      valor_catastral: '',
    });
    setScenario(null);
    setErr('');
    setMode(null);
  };

  const normDate = (d) => {
    if (!d) return '';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}$/.test(s)) return `${s}-01-01`;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
    return '';
  };

  const canBuyer = useMemo(() => Number(values.precio_venta) > 0, [values.precio_venta]);
  const canSeller = useMemo(() => {
    const v = values;
    return Number(v.precio_compra) > 0 && normDate(v.fecha_compra) && Number(v.precio_venta) > 0 && normDate(v.fecha_venta);
  }, [values]);

  const onCalcBuyer = async () => {
    if (!canBuyer) return;
    setLoading(true); setErr(''); setMode('buyer');
    try {
      const pv = Number(values.precio_venta);
      const vc = Number(values.valor_catastral || 0);
      const year = 2026;
      const predialOpts = { valor_catastral: vc, year_base: year, tipo: 'habitacional' };
      if (Number(values.predial_anual_actual) > 0) predialOpts.predial_anual_actual = Number(values.predial_anual_actual);
      if (values.mes_pago_anticipado) predialOpts.mes_pago_anticipado = values.mes_pago_anticipado;
      if (values.grupo_vulnerable) predialOpts.grupo_vulnerable = true;
      const closingParams = { precio_venta: pv, valor_catastral: vc, year };
      if (values.con_credito_hipotecario) {
        closingParams.con_credito_hipotecario = true;
        if (Number(values.monto_credito) > 0) closingParams.monto_credito = Number(values.monto_credito);
      }
      const [isai, predial, closing] = await Promise.all([
        getIsaiComprador({ precio_venta: pv, valor_catastral: vc, year }),
        getPredialProjection(predialOpts),
        getClosingCost(closingParams),
      ]);
      setScenario({ ok: true, isr_vendedor: null, isai_comprador: isai, predial_10y: predial, closing_total: closing });
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('taxProjector.error_generic'));
      setScenario(null);
    } finally { setLoading(false); }
  };

  const onCalcSeller = async () => {
    if (!canSeller) return;
    setLoading(true); setErr(''); setMode('seller');
    try {
      const r = await getIsrVendedor({
        precio_compra: Number(values.precio_compra),
        fecha_compra: normDate(values.fecha_compra),
        precio_venta: Number(values.precio_venta),
        fecha_venta: normDate(values.fecha_venta),
      });
      setScenario({ ok: true, isr_vendedor: r, isai_comprador: null, predial_10y: null, closing_total: null });
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('taxProjector.error_generic'));
      setScenario(null);
    } finally { setLoading(false); }
  };

  const isr = scenario?.isr_vendedor;
  const isai = scenario?.isai_comprador;
  const predial = scenario?.predial_10y;
  const closing = scenario?.closing_total;

  return (
    <div data-testid="tax-projector-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px' }}>
        <FormFields
          values={values}
          onChange={onChange}
          t={t}
          buyerButton={
            <button
              data-testid="btn-calcular-comprador"
              type="button"
              onClick={onCalcBuyer}
              disabled={!canBuyer || loading}
              style={{
                width: '100%',
                padding: '14px 24px', borderRadius: 9999, border: 'none', background: GRADIENT, color: '#FFFFFF',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: canBuyer && !loading ? 'pointer' : 'not-allowed',
                opacity: canBuyer && !loading ? 1 : 0.45,
                transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
              }}
            >
              {loading && mode === 'buyer' ? t('taxProjector.calculating') : t('taxProjector.cta_calcular_comprador')}
            </button>
          }
          sellerButton={
            <button
              data-testid="btn-calcular-vendedor"
              type="button"
              onClick={onCalcSeller}
              disabled={!canSeller || loading}
              style={{
                width: '100%',
                padding: '14px 24px', borderRadius: 9999, border: 'none', background: GRADIENT, color: '#FFFFFF',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: canSeller && !loading ? 'pointer' : 'not-allowed',
                opacity: canSeller && !loading ? 1 : 0.45,
                transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
              }}
            >
              {loading && mode === 'seller' ? t('taxProjector.calculating') : t('taxProjector.cta_calcular_vendedor')}
            </button>
          }
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button
            data-testid="btn-reset"
            type="button"
            onClick={onReset}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '12px 28px',
              borderRadius: 9999,
              border: `1.5px solid ${ROSE}`,
              background: 'rgba(236,72,153,0.10)',
              color: CREAM,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.4 : 1,
              transition: `background 320ms ${EASE}, transform 320ms ${EASE}`,
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'rgba(236,72,153,0.22)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(236,72,153,0.10)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <span style={{ fontSize: 16, lineHeight: 1, display: 'inline-block', transform: 'translateY(-1px)' }}>↻</span>
            {t('taxProjector.cta_reiniciar')}
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
              {isr && (
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
              )}
              {isai && (
              <ResultCard
                accent={INDIGO}
                eyebrow={t('taxProjector.card_isai_eyebrow')}
                headline={t('taxProjector.card_isai_title')}
                value={isai?.ok ? fmtMXN(isai.isai) : '—'}
                lines={isai?.ok ? [
                  { label: t('taxProjector.row_isai_base'), value: fmtMXN(isai.base) },
                  { label: t('taxProjector.row_isai_base_usada'), value: isai.breakdown?.base_usada === 'precio_venta' ? t('taxProjector.row_isai_src_precio') : t('taxProjector.row_isai_src_catastral') },
                  { label: t('taxProjector.row_isai_cuota_fija'), value: fmtMXN(isai.breakdown?.cuota_fija) },
                  { label: t('taxProjector.row_isai_excedente'), value: fmtMXN(isai.breakdown?.excedente) },
                  { label: t('taxProjector.row_isai_marginal'), value: `${isai.breakdown?.marginal_pct || 0}%` },
                  { label: t('taxProjector.row_tasa_efectiva'), value: `${isai.breakdown?.tasa_efectiva_pct || 0}%` },
                ] : [{ label: t('taxProjector.error_short'), value: isai?.reason || '—' }]}
              />
              )}
              {closing && (
              <ResultCard
                accent={CREAM}
                eyebrow={t('taxProjector.card_closing_eyebrow')}
                headline={t('taxProjector.card_closing_title')}
                value={closing?.ok ? fmtMXN(closing.total) : '—'}
                lines={closing?.ok ? [
                  { label: t('taxProjector.row_closing_isai'), value: fmtMXN(closing.isai) },
                  { label: t('taxProjector.row_closing_registro'), value: fmtMXN(closing.registro) },
                  { label: t('taxProjector.row_closing_gestorias'), value: fmtMXN(closing.gestorias) },
                  { label: t('taxProjector.row_closing_avaluo'), value: fmtMXN(closing.avaluo) },
                  { label: t('taxProjector.row_closing_notario'), value: fmtMXN(closing.notario_fees) },
                  { label: t('taxProjector.row_closing_iva'), value: fmtMXN(closing.iva) },
                  ...(closing.hipoteca?.aplica ? [{ label: t('taxProjector.row_closing_hipoteca_total'), value: fmtMXN(closing.hipoteca.total) }] : []),
                ] : [{ label: t('taxProjector.error_short'), value: closing?.reason || '—' }]}
              />
              )}
            </div>
            {closing?.hipoteca?.aplica && (
              <div style={{ background: CARD_BG, border: BORDER, borderRadius: 24, padding: 26, backdropFilter: 'blur(24px)' }}>
                <div style={{ ...sectionTitleStyle, color: CREAM }}>{t('taxProjector.hipoteca_title')}</div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6, textTransform: 'none', letterSpacing: 0 }}>
                  {t('taxProjector.hipoteca_hint')}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
                  <tbody>
                    <tr><td style={{ padding: '12px 0', color: MUTED, fontSize: 13 }}>{t('taxProjector.row_hipoteca_credito')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{fmtMXN(closing.hipoteca.monto_credito)} ({closing.hipoteca.ltv_pct}%)</td></tr>
                    <tr style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}><td style={{ padding: '12px 0', color: MUTED, fontSize: 13 }}>{t('taxProjector.row_hipoteca_notario')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{fmtMXN(closing.hipoteca.notario_fees)}</td></tr>
                    <tr style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}><td style={{ padding: '12px 0', color: MUTED, fontSize: 13 }}>{t('taxProjector.row_hipoteca_rpp')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{fmtMXN(closing.hipoteca.rpp_inscripcion)}</td></tr>
                    <tr style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}><td style={{ padding: '12px 0', color: MUTED, fontSize: 13 }}>{t('taxProjector.row_hipoteca_iva')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{fmtMXN(closing.hipoteca.iva)}</td></tr>
                    <tr style={{ borderTop: '1px solid rgba(240,235,224,0.18)' }}><td style={{ padding: '14px 0', color: CREAM, fontSize: 14, fontWeight: 700 }}>{t('taxProjector.row_hipoteca_total')}</td><td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 800, fontSize: 16, color: INDIGO }}>{fmtMXN(closing.hipoteca.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {isr && <BreakdownTable isr={isr} t={t} />}
            {isai && <IsaiBreakdownTable isai={isai} t={t} />}
            {predial && predial.modo === 'user_actual' && <PredialChart predial={predial} t={t} />}
          </section>
        )}

        <div style={{
          marginTop: 40, padding: '22px 26px', borderRadius: 16,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.35)',
          borderLeft: `4px solid ${INDIGO}`,
          fontSize: 13, color: CREAM, lineHeight: 1.7, fontFamily: 'DM Sans, sans-serif',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          <div style={{
            flexShrink: 0,
            width: 32, height: 32, borderRadius: 9999,
            background: 'rgba(99,102,241,0.25)', color: CREAM,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18,
          }}>
            i
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
                background: INDIGO, color: '#FFFFFF',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 10,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>{t('taxProjector.disclaimer_badge')}</span>
              <strong style={{ color: CREAM, fontWeight: 700, fontFamily: 'Outfit, sans-serif', fontSize: 15 }}>
                {t('taxProjector.disclaimer_title')}
              </strong>
            </div>
            <div style={{ marginTop: 8, color: 'rgba(240,235,224,0.85)' }}>{t('taxProjector.disclaimer_text')}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
