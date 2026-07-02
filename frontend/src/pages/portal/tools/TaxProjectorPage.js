// W5.x F6 Sub-C · TaxProjectorPage · rediseño CLARO (Apple-tier) + 3 tabs (Impuestos · Inversión · Comparar).
// Reskin de PRESENTACIÓN — la lógica fiscal y los wrappers de api/tax_projector.js NO se tocan.
// Motores fiscales del backend (tax_projector_engine transacción · inversion_v4_tax renta) intactos y conviven.
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getIsrVendedor, getIsaiComprador, getPredialProjection, getClosingCost } from '../../../api/tax_projector';
import InversionV4Calculator from '../../../components/investment/InversionV4Calculator';
import ToolNav from '../../../components/ui/ToolNav';

// ── Paleta CLARA (sistema de Mapa.js / InversionV4Calculator) ─────────────────
const INK = '#1E2230';        // texto principal
const INK_2 = '#5A5F6E';      // secundario
const INK_3 = '#9AA0AE';      // tenue
const SURFACE = '#FAFAFB';    // fondo de página
const CARD = '#FFFFFF';       // fondo de tarjeta
const LINE = '#ECECEC';       // borde de tarjeta
const THEME = 'var(--theme)';        // acento de marca (magenta/púrpura)
const THEME_RGB = 'var(--theme-rgb)';
const GRAD = 'var(--grad)';          // botones
const GREEN = '#059669';      // ganador / positivo
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const API = process.env.REACT_APP_BACKEND_URL;

// Tarjeta clara estándar (borde + sombra suave + hover eleva vía .dmx-card)
const cardStyle = {
  background: CARD,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  boxShadow: '0 6px 20px rgba(16,18,28,0.05)',
  padding: 24,
};

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 11,
  background: CARD,
  border: `1px solid ${LINE}`,
  color: INK,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: `border-color .15s ${EASE}, box-shadow .15s ${EASE}`,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: INK_2,
  marginBottom: 8,
  fontFamily: 'DM Sans, sans-serif',
  fontWeight: 700,
};

const sectionTitleStyle = {
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  marginBottom: 18,
  color: INK,
};

const fmtMXN = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};
const fmtPct = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${Number(n).toFixed(1)}%`);

// Chip de estado / honestidad (fuente · estimado). Sobrio, esquina inferior de la celda.
function Chip({ children, tone = 'muted', title }) {
  const tones = {
    muted: { bg: 'rgba(16,18,28,0.05)', fg: INK_3 },
    est: { bg: 'rgba(245,158,11,0.12)', fg: '#B45309' },
    theme: { bg: `rgba(${THEME_RGB},0.10)`, fg: THEME },
    green: { bg: 'rgba(5,150,105,0.10)', fg: GREEN },
  };
  const s = tones[tone] || tones.muted;
  return (
    <span title={title} style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 9999,
      background: s.bg, color: s.fg, fontFamily: 'DM Sans, sans-serif',
      fontWeight: 700, fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Skeleton({ h = 16, w = '100%', style }) {
  return <div style={{ height: h, width: w, borderRadius: 8, background: 'linear-gradient(90deg,#F2F3F5,#E9EAEE,#F2F3F5)', backgroundSize: '200% 100%', animation: 'dmxShimmer 1.3s ease-in-out infinite', ...style }} />;
}

function Header() {
  const { t } = useTranslation('common');
  return (
    <header data-testid="tax-projector-header" style={{ padding: '48px 24px 20px', maxWidth: 1160, margin: '0 auto' }}>
      <div style={{ letterSpacing: '0.24em', fontSize: 11, color: THEME, textTransform: 'uppercase', fontWeight: 700 }}>
        DesarrollosMX · Herramientas
      </div>
      <h1 style={{
        margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
        fontSize: 'clamp(2rem, 3.6vw, 2.75rem)', lineHeight: 1.06, color: INK, letterSpacing: '-0.02em',
      }}>{t('taxProjector.title')}</h1>
      <p style={{ margin: 0, color: INK_2, fontSize: 15.5, maxWidth: 720, lineHeight: 1.55 }}>{t('taxProjector.subtitle')}</p>
    </header>
  );
}

// ── Barra de tabs (segmented control claro) ──────────────────────────────────
function Tabs({ tab, setTab }) {
  const items = [
    ['impuestos', 'Impuestos'],
    ['inversion', 'Inversión'],
    ['comparar', 'Comparar'],
  ];
  return (
    <div style={{ maxWidth: 1160, margin: '20px auto 0', padding: '0 24px' }}>
      <div role="tablist" style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#F1F2F4', borderRadius: 9999 }}>
        {items.map(([k, label]) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              data-testid={`tab-${k}`}
              type="button"
              onClick={() => setTab(k)}
              style={{
                padding: '9px 20px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.02em',
                background: on ? CARD : 'transparent',
                color: on ? THEME : INK_2,
                boxShadow: on ? '0 2px 8px rgba(16,18,28,0.08)' : 'none',
                transition: `background .15s ${EASE}, color .15s ${EASE}`,
              }}
            >{label}</button>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="dmx-card" style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </div>
  );
}

// CurrencyInput · acepta decimales · $X,XXX,XXX.XX (lógica INTACTA)
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
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${THEME_RGB},0.4)`; }}
      onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = LINE; }}
      onFocusCapture={(e) => { e.currentTarget.style.borderColor = THEME; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${THEME_RGB},0.12)`; }}
      onBlurCapture={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.boxShadow = 'none'; }}
      {...props}
    />
  );
}

function FormFields({ values, onChange, t, buyerButton, sellerButton }) {
  const hintStyle = { fontSize: 11.5, color: INK_3, marginTop: 6, lineHeight: 1.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400 };
  const checkboxLabel = { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 18, cursor: 'pointer', color: INK, fontSize: 13.5, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 };
  const selectStyle = {
    ...inputStyle, marginTop: 8, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3e%3cpath fill='${encodeURIComponent('#9AA0AE')}' d='M6 8L0 0h12z'/%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 16px center',
    paddingRight: 40,
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
      <Section title={t('taxProjector.buyer_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_venta')}
          <CurrencyInput value={values.precio_venta} onChange={(v) => onChange('precio_venta', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-venta" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.valor_catastral')}
          <CurrencyInput value={values.valor_catastral} onChange={(v) => onChange('valor_catastral', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-valor-catastral" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.predial_anual_actual')}
          <CurrencyInput value={values.predial_anual_actual} onChange={(v) => onChange('predial_anual_actual', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-predial-actual" placeholder="$0.00 (opcional)" />
          <div style={hintStyle}>{t('taxProjector.predial_anual_actual_hint')}</div>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!values.con_credito_hipotecario}
            onChange={(e) => onChange('con_credito_hipotecario', e.target.checked)}
            style={{ accentColor: 'var(--theme)', cursor: 'pointer', marginTop: 2 }}
            data-testid="checkbox-hipoteca"
          />
          <span>{t('taxProjector.credito_hipotecario')}</span>
        </label>
        <div style={hintStyle}>{t('taxProjector.credito_hipotecario_hint')}</div>
        {values.con_credito_hipotecario && (
          <label style={{ ...labelStyle, marginTop: 14 }}>{t('taxProjector.monto_credito')}
            <CurrencyInput value={values.monto_credito} onChange={(v) => onChange('monto_credito', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-monto-credito" placeholder="$0.00 (opcional)" />
            <div style={hintStyle}>{t('taxProjector.monto_credito_hint')}</div>
          </label>
        )}
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.descuentos_section')}
          <select
            value={values.mes_pago_anticipado || ''}
            onChange={(e) => onChange('mes_pago_anticipado', e.target.value)}
            data-testid="select-mes-pago"
            style={selectStyle}
          >
            <option value="">{t('taxProjector.mes_placeholder')}</option>
            <option value="enero">{t('taxProjector.mes_enero')}</option>
            <option value="febrero">{t('taxProjector.mes_febrero')}</option>
            <option value="marzo_o_despues">{t('taxProjector.mes_marzo_despues')}</option>
          </select>
        </label>
        <label style={{ ...checkboxLabel, marginTop: 14 }}>
          <input
            type="checkbox"
            checked={!!values.grupo_vulnerable}
            onChange={(e) => onChange('grupo_vulnerable', e.target.checked)}
            style={{ accentColor: 'var(--theme)', cursor: 'pointer', marginTop: 2 }}
            data-testid="checkbox-vulnerable"
          />
          <span>{t('taxProjector.grupo_vulnerable')}</span>
        </label>
        <div style={hintStyle}>{t('taxProjector.grupo_vulnerable_hint')}</div>
        {buyerButton && <div style={{ marginTop: 'auto', paddingTop: 20 }}>{buyerButton}</div>}
      </Section>
      <Section title={t('taxProjector.seller_section')}>
        <label style={labelStyle}>{t('taxProjector.precio_compra')}
          <CurrencyInput value={values.precio_compra} onChange={(v) => onChange('precio_compra', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-compra" placeholder="$0.00" />
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.precio_venta_seller')}
          <CurrencyInput value={values.precio_venta} onChange={(v) => onChange('precio_venta', v)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-precio-venta-seller" placeholder="$0.00" />
          <div style={hintStyle}>{t('taxProjector.precio_venta_seller_hint')}</div>
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_compra')}
          <input type="text" value={values.fecha_compra} onChange={(e) => onChange('fecha_compra', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-compra" placeholder="2018 o 15/03/2018" />
          <div style={hintStyle}>{t('taxProjector.fecha_hint')}</div>
        </label>
        <label style={{ ...labelStyle, marginTop: 18 }}>{t('taxProjector.fecha_venta')}
          <input type="text" value={values.fecha_venta} onChange={(e) => onChange('fecha_venta', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} data-testid="input-fecha-venta" placeholder="2026 o 22/05/2026" />
          <div style={hintStyle}>{t('taxProjector.fecha_hint')}</div>
        </label>
        {sellerButton && <div style={{ marginTop: 'auto', paddingTop: 20 }}>{sellerButton}</div>}
      </Section>
    </div>
  );
}

function ResultCard({ accent, eyebrow, headline, value, lines }) {
  return (
    <div className="dmx-card" style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>{eyebrow}</div>
        <div style={{ marginTop: 6, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: INK_2 }}>{headline}</div>
        <div style={{ marginTop: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 34, color: INK, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 18, display: 'grid', gap: 8 }}>
          {(lines || []).map((l, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: INK_2, fontFamily: 'DM Sans, sans-serif' }}>
              <span>{l.label}</span><strong style={{ color: INK, fontWeight: 700, textAlign: 'right' }}>{l.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DataTable({ title, rows }) {
  return (
    <div className="dmx-card" style={cardStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: INK, fontFamily: 'DM Sans, sans-serif' }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }}>
              <td style={{ padding: '12px 0', color: INK_2, fontSize: 13 }}>{r.label}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, fontSize: 13.5 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  return <DataTable title={t('taxProjector.breakdown_title')} rows={rows} />;
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
  return <DataTable title={t('taxProjector.breakdown_isai_title')} rows={rows} />;
}

function PredialChart({ predial, t }) {
  const data = useMemo(() => (predial?.items || []).map((it) => ({ year: it.year, predial: it.predial_estimado })), [predial]);
  if (!data.length) return null;
  const totalBruto = predial?.total_bruto_10y || 0;
  const totalNeto = predial?.total_10y || 0;
  const ahorro = predial?.ahorro_10y || 0;
  const showSavings = ahorro > 0;
  return (
    <div className="dmx-card" style={cardStyle}>
      <div style={sectionTitleStyle}>{t('taxProjector.predial_chart_title')}</div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,18,28,0.07)" />
            <XAxis dataKey="year" stroke={INK_3} tick={{ fontSize: 12, fill: INK_2 }} />
            <YAxis stroke={INK_3} tick={{ fontSize: 12, fill: INK_2 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              cursor={{ fill: `rgba(${THEME_RGB},0.06)` }}
              contentStyle={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, color: INK, boxShadow: '0 12px 30px rgba(16,18,28,0.12)' }}
              formatter={(v) => fmtMXN(v)}
            />
            <Bar dataKey="predial" fill="var(--theme)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: showSavings ? 'repeat(3, 1fr)' : '1fr', gap: 14, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
        {showSavings && (
          <div>
            <div style={{ fontSize: 11, color: INK_3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t('taxProjector.predial_total_bruto')}</div>
            <div style={{ fontSize: 18, color: INK, fontFamily: 'Outfit, sans-serif', fontWeight: 800, marginTop: 4 }}>{fmtMXN(totalBruto)}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: INK_3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t('taxProjector.predial_total_neto')}</div>
          <div style={{ fontSize: 18, color: INK, fontFamily: 'Outfit, sans-serif', fontWeight: 800, marginTop: 4 }}>{fmtMXN(totalNeto)}</div>
        </div>
        {showSavings && (
          <div>
            <div style={{ fontSize: 11, color: INK_3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t('taxProjector.predial_ahorro')}</div>
            <div style={{ fontSize: 18, color: GREEN, fontFamily: 'Outfit, sans-serif', fontWeight: 800, marginTop: 4 }}>−{fmtMXN(ahorro)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB · IMPUESTOS (calculadora fiscal actual · lógica IDÉNTICA · solo reskin claro)
// ══════════════════════════════════════════════════════════════════════════════
function ImpuestosTab() {
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

  const primaryBtn = (enabled, isLoading, label, loadingLabel, testid, onClick) => (
    <button
      data-testid={testid}
      type="button"
      onClick={onClick}
      disabled={!enabled || loading}
      style={{
        width: '100%',
        padding: '14px 24px', borderRadius: 12, border: 'none', background: GRAD, color: '#FFFFFF',
        fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: enabled && !loading ? 'pointer' : 'not-allowed',
        opacity: enabled && !loading ? 1 : 0.45,
        boxShadow: enabled && !loading ? `0 8px 22px rgba(${THEME_RGB},0.28)` : 'none',
        transition: `transform .15s ${EASE}, opacity .15s ${EASE}, box-shadow .15s ${EASE}`,
      }}
      onMouseEnter={(e) => { if (enabled && !loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {isLoading ? loadingLabel : label}
    </button>
  );

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 96px' }}>
      <FormFields
        values={values}
        onChange={onChange}
        t={t}
        buyerButton={primaryBtn(canBuyer, loading && mode === 'buyer', t('taxProjector.cta_calcular_comprador'), t('taxProjector.calculating'), 'btn-calcular-comprador', onCalcBuyer)}
        sellerButton={primaryBtn(canSeller, loading && mode === 'seller', t('taxProjector.cta_calcular_vendedor'), t('taxProjector.calculating'), 'btn-calcular-vendedor', onCalcSeller)}
      />

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <button
          data-testid="btn-reset"
          type="button"
          onClick={onReset}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '11px 26px', borderRadius: 9999,
            border: `1.5px solid ${LINE}`, background: CARD, color: INK_2,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.4 : 1,
            transition: `border-color .15s ${EASE}, color .15s ${EASE}, transform .15s ${EASE}`,
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = `rgba(${THEME_RGB},0.5)`; e.currentTarget.style.color = THEME; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.color = INK_2; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, transform: 'translateY(-1px)' }}>↻</span>
          {t('taxProjector.cta_reiniciar')}
        </button>
      </div>

      {err && (
        <div data-testid="tax-error" style={{ marginTop: 22, padding: '14px 18px', borderRadius: 14, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.28)', color: '#991B1B', fontSize: 14 }}>
          {err}
        </div>
      )}

      {!scenario && !loading && !err && (
        <div className="dmx-card" data-testid="empty-state" style={{ ...cardStyle, marginTop: 30, padding: '34px 28px', textAlign: 'center', color: INK_2, fontSize: 15.5 }}>
          {t('taxProjector.empty_state')}
        </div>
      )}

      {loading && (
        <div className="dmx-card" data-testid="loading-state" style={{ ...cardStyle, marginTop: 30, display: 'grid', gap: 12 }}>
          <Skeleton h={22} w="40%" />
          <Skeleton h={54} w="60%" />
          <Skeleton h={14} />
          <Skeleton h={14} w="80%" />
        </div>
      )}

      {scenario && (
        <section data-testid="tax-results" style={{ marginTop: 32, display: 'grid', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
            {isr && (
              <ResultCard
                accent={THEME}
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
                accent={THEME}
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
                accent={INK}
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
            <div className="dmx-card" style={cardStyle}>
              <div style={sectionTitleStyle}>{t('taxProjector.hipoteca_title')}</div>
              <div style={{ fontSize: 12.5, color: INK_2, marginBottom: 16, lineHeight: 1.6, textTransform: 'none', letterSpacing: 0 }}>
                {t('taxProjector.hipoteca_hint')}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: INK, fontFamily: 'DM Sans, sans-serif' }}>
                <tbody>
                  <tr><td style={{ padding: '12px 0', color: INK_2, fontSize: 13 }}>{t('taxProjector.row_hipoteca_credito')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700 }}>{fmtMXN(closing.hipoteca.monto_credito)} ({closing.hipoteca.ltv_pct}%)</td></tr>
                  <tr style={{ borderTop: `1px solid ${LINE}` }}><td style={{ padding: '12px 0', color: INK_2, fontSize: 13 }}>{t('taxProjector.row_hipoteca_notario')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700 }}>{fmtMXN(closing.hipoteca.notario_fees)}</td></tr>
                  <tr style={{ borderTop: `1px solid ${LINE}` }}><td style={{ padding: '12px 0', color: INK_2, fontSize: 13 }}>{t('taxProjector.row_hipoteca_rpp')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700 }}>{fmtMXN(closing.hipoteca.rpp_inscripcion)}</td></tr>
                  <tr style={{ borderTop: `1px solid ${LINE}` }}><td style={{ padding: '12px 0', color: INK_2, fontSize: 13 }}>{t('taxProjector.row_hipoteca_iva')}</td><td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700 }}>{fmtMXN(closing.hipoteca.iva)}</td></tr>
                  <tr style={{ borderTop: `2px solid ${LINE}` }}><td style={{ padding: '14px 0', color: INK, fontSize: 14, fontWeight: 800 }}>{t('taxProjector.row_hipoteca_total')}</td><td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 800, fontSize: 16, color: THEME }}>{fmtMXN(closing.hipoteca.total)}</td></tr>
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
        marginTop: 40, padding: '20px 24px', borderRadius: 14,
        background: `rgba(${THEME_RGB},0.05)`,
        border: `1px solid rgba(${THEME_RGB},0.20)`,
        borderLeft: `4px solid ${THEME}`,
        fontSize: 13.5, color: INK, lineHeight: 1.7, fontFamily: 'DM Sans, sans-serif',
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 9999,
          background: `rgba(${THEME_RGB},0.14)`, color: THEME,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18,
        }}>i</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
              background: THEME, color: '#FFFFFF',
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 10,
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>{t('taxProjector.disclaimer_badge')}</span>
            <strong style={{ color: INK, fontWeight: 800, fontFamily: 'Outfit, sans-serif', fontSize: 15 }}>
              {t('taxProjector.disclaimer_title')}
            </strong>
          </div>
          <div style={{ marginTop: 8, color: INK_2 }}>{t('taxProjector.disclaimer_text')}</div>
        </div>
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB · INVERSIÓN (monta InversionV4Calculator · igual que el Simulador · NO se modifica)
// ══════════════════════════════════════════════════════════════════════════════
function InversionTab() {
  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 96px' }}>
      <div style={{ marginBottom: 18, color: INK_2, fontSize: 14.5, lineHeight: 1.55, maxWidth: 760 }}>
        Calculadora de inversión grado institucional: TIR, cap rate, flujo mensual y crédito — con impuestos de renta ya integrados por el motor.
      </div>
      <InversionV4Calculator />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB · COMPARAR (2-3 colonias lado a lado · /api/zona/{id}/inversion + capa fiscal cierre)
// ══════════════════════════════════════════════════════════════════════════════

// Métricas de inversión de la zona → cómo leerlas y si "más es mejor" (patrón ComparadorInversion)
const ZONA_METRICAS = [
  ['Rendimiento total al año', (d) => d?.roi_anual_pct, fmtPct, true, 'roi'],
  ['Renta al año (cap rate)', (d) => d?.cap_rate_anual_pct, fmtPct, true, 'cap'],
  ['Plusvalía al año', (d) => d?.plusvalia_anual_pct, fmtPct, true, 'plus'],
  ['Rendimiento (TIR)', (d) => d?.tir_anual_pct, fmtPct, true, 'tir'],
  ['Precio promedio', (d) => d?.precio_prom, fmtMXN, false, 'precio'],
  ['Precio por m²', (d) => d?.precio_m2, fmtMXN, false, 'm2'],
  ['Renta mensual estimada', (d) => d?.renta_prom, fmtMXN, true, 'renta'],
  ['Ganancia a 5 años', (d) => d?.ganancia_5y_pct, (n) => (n == null ? '—' : `${Math.round(n)}%`), true, 'g5'],
];

// capa fiscal por colonia: costos de cierre del comprador sobre el precio representativo (getClosingCost · wrapper existe).
// full-scenario exige fecha_compra/fecha_venta que NO tenemos por colonia → no lo usamos para no inventar datos.
const FISCAL_METRICAS = [
  ['Costos de cierre (compra)', (f) => f?.total, fmtMXN, false, 'cierre_total'],
  ['ISAI (adquisición)', (f) => f?.isai, fmtMXN, false, 'cierre_isai'],
];

function ColoniaPicker({ index, colonia, onPick, onClear }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    const tmr = setTimeout(() => {
      fetch(`${API}/api/colonias-search?q=${encodeURIComponent(q)}&limit=20`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => { if (alive) { setResults(Array.isArray(d) ? d : []); setLoading(false); } })
        .catch(() => { if (alive) { setResults([]); setLoading(false); } });
    }, 200);
    return () => { alive = false; clearTimeout(tmr); };
  }, [q, open]);

  if (colonia) {
    return (
      <div className="dmx-card" style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{colonia.name}</div>
          <div style={{ fontSize: 12, color: INK_3, marginTop: 2 }}>{colonia.alcaldia || 'CDMX'}{colonia.featured ? ' · curada' : ''}</div>
        </div>
        <button type="button" onClick={onClear} data-testid={`cmp-clear-${index}`} style={{ background: 'none', border: 'none', color: INK_3, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0 }}>cambiar ✕</button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        data-testid={`cmp-input-${index}`}
        placeholder={`Buscar colonia ${index + 1}…`}
        style={inputStyle}
      />
      {open && (
        <div className="dmx-card" style={{ ...cardStyle, position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, padding: 6, maxHeight: 320, overflowY: 'auto', boxShadow: '0 18px 44px rgba(16,18,28,0.14)' }}>
          {loading && <div style={{ padding: 12 }}><Skeleton h={14} w="70%" /></div>}
          {!loading && results.length === 0 && <div style={{ padding: '12px 14px', color: INK_3, fontSize: 13 }}>Sin resultados.</div>}
          {!loading && results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c); setOpen(false); setQ(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${THEME_RGB},0.06)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{c.name}</span>
              <span style={{ fontSize: 12, color: INK_3, marginLeft: 8 }}>{c.alcaldia || ''}{c.featured ? ' · curada' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompararTab() {
  // hasta 3 colonias. slots[i] = { colonia, inv, fiscal, loading, error }
  const [slots, setSlots] = useState([null, null, null]);

  const pick = useCallback(async (i, colonia) => {
    setSlots((prev) => { const n = [...prev]; n[i] = { colonia, inv: null, fiscal: null, loading: true, error: '' }; return n; });
    try {
      const inv = await fetch(`${API}/api/zona/${encodeURIComponent(colonia.id)}/inversion`, { credentials: 'include' }).then((r) => r.json()).catch(() => null);
      // capa fiscal: costos de cierre del comprador sobre el precio representativo real de la zona (wrapper existe)
      let fiscal = null;
      const rep = inv?.precio_representativo || inv?.precio_prom || null;
      if (rep) {
        try {
          // valor_catastral: sin dato oficial por zona → usamos el precio como base (el motor toma la mayor). Se etiqueta ESTIMADO.
          fiscal = await getClosingCost({ precio_venta: rep, valor_catastral: rep, year: 2026 });
        } catch { fiscal = null; }
      }
      setSlots((prev) => { const n = [...prev]; if (n[i]?.colonia?.id === colonia.id) n[i] = { colonia, inv, fiscal, loading: false, error: (inv && inv.ok) ? '' : 'sin datos' }; return n; });
    } catch {
      setSlots((prev) => { const n = [...prev]; n[i] = { colonia, inv: null, fiscal: null, loading: false, error: 'error' }; return n; });
    }
  }, []);

  const clear = (i) => setSlots((prev) => { const n = [...prev]; n[i] = null; return n; });

  const active = slots.filter(Boolean);
  const withData = active.filter((s) => s.inv && s.inv.ok);

  // ganador por métrica: entre las colonias con dato, la mejor según hiBetter
  const winnerFor = (get, hiBetter, src) => {
    const vals = withData.map((s) => ({ id: s.colonia.id, v: get(src === 'fiscal' ? s.fiscal : s.inv) })).filter((x) => x.v != null && !Number.isNaN(Number(x.v)));
    if (vals.length < 2) return null;
    return vals.reduce((best, x) => (best == null ? x : (hiBetter ? (x.v > best.v ? x : best) : (x.v < best.v ? x : best))), null)?.id || null;
  };

  const gridCols = `minmax(160px, 1.2fr) ${active.map(() => '1fr').join(' ')}`;

  const MetricRow = ({ label, get, fmt, hiBetter, src }) => {
    const win = winnerFor(get, hiBetter, src);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${LINE}` }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: INK_2, fontWeight: 700 }}>{label}</span>
        {active.map((s, i) => {
          const val = s.inv || s.fiscal ? get(src === 'fiscal' ? s.fiscal : s.inv) : null;
          const isWin = win && s.colonia.id === win;
          if (s.loading) return <Skeleton key={i} h={16} w="60%" />;
          return (
            <span key={i} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 15, color: isWin ? GREEN : INK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {val == null ? '—' : fmt(val)}{isWin ? ' ✓' : ''}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 96px' }}>
      <div style={{ marginBottom: 18, color: INK_2, fontSize: 14.5, lineHeight: 1.55, maxWidth: 760 }}>
        Compara <b style={{ color: INK }}>2 o 3 colonias</b> lado a lado. Cada una se hidrata con inteligencia de inversión real de la zona (precios, cap rate, plusvalía, TIR) y una capa fiscal de costos de cierre. El <span style={{ color: GREEN, fontWeight: 700 }}>✓ verde</span> marca la ganadora por métrica.
      </div>

      {/* Pickers de colonia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[0, 1, 2].map((i) => (
          <ColoniaPicker key={i} index={i} colonia={slots[i]?.colonia || null} onPick={(c) => pick(i, c)} onClear={() => clear(i)} />
        ))}
      </div>

      {active.length < 2 ? (
        <div className="dmx-card" data-testid="cmp-empty" style={{ ...cardStyle, padding: '34px 28px', textAlign: 'center', color: INK_2, fontSize: 15 }}>
          Elige al menos <b style={{ color: INK }}>2 colonias</b> para verlas lado a lado.
        </div>
      ) : (
        <div className="dmx-card" data-testid="cmp-table" style={cardStyle}>
          {/* Cabecera: nombres de colonia */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, alignItems: 'flex-end', paddingBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 0, fontSize: 12 }}>Métrica</div>
            {active.map((s, i) => (
              <div key={i} style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 15, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.colonia.name}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.loading && <Chip>cargando…</Chip>}
                  {!s.loading && s.inv && !s.inv.ok && <Chip tone="est">sin datos</Chip>}
                  {!s.loading && s.inv?.ok && s.inv?.veredicto_inversion && <Chip tone="green" title="Veredicto del motor de inversión">{s.inv.veredicto_inversion}</Chip>}
                  {!s.loading && s.inv?.ok && typeof s.inv?.n_desarrollos === 'number' && <Chip title="Desarrollos que sostienen el precio de la zona">{s.inv.n_desarrollos} dev</Chip>}
                </div>
              </div>
            ))}
          </div>

          {withData.length === 0 && !active.some((s) => s.loading) ? (
            <div style={{ padding: '20px 4px', color: INK_2, fontSize: 14, borderTop: `1px solid ${LINE}` }}>
              Ninguna de las colonias elegidas tiene mercado con precio real todavía — no fabricamos métricas. Prueba con colonias curadas (etiqueta "curada").
            </div>
          ) : (
            <>
              {/* Sección inversión */}
              <div style={{ margin: '8px 0 2px', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_3 }}>Inversión de la zona</div>
              {ZONA_METRICAS.map(([label, get, fmt, hiBetter, key]) => (
                <MetricRow key={key} label={label} get={get} fmt={fmt} hiBetter={hiBetter} src="inv" />
              ))}

              {/* Sección fiscal (capa por colonia) */}
              <div style={{ margin: '20px 0 2px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_3 }}>Capa fiscal · costos de cierre</span>
                <Chip tone="est" title="Estimado sobre el precio representativo de la zona; el valor catastral real varía por predio.">estimado</Chip>
              </div>
              {FISCAL_METRICAS.map(([label, get, fmt, hiBetter, key]) => (
                <MetricRow key={key} label={label} get={get} fmt={fmt} hiBetter={hiBetter} src="fiscal" />
              ))}

              {/* Veredicto resumido */}
              {withData.length >= 2 && (() => {
                const ranked = [...withData].map((s) => ({ name: s.colonia.name, roi: s.inv.roi_anual_pct ?? -1 }))
                  .filter((x) => x.roi > -1).sort((a, b) => b.roi - a.roi);
                if (ranked.length < 2) return null;
                return (
                  <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: `rgba(${THEME_RGB},0.05)`, border: `1px solid rgba(${THEME_RGB},0.18)`, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: INK, lineHeight: 1.55 }}>
                    💡 Por rendimiento total al año, la mejor es <b style={{ color: THEME }}>{ranked[0].name}</b> ({fmtPct(ranked[0].roi)}). Decide también por tu horizonte, riesgo y flujo mensual.
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: INK_3, lineHeight: 1.6, maxWidth: 760 }}>
        Fuente: motor de inversión de la zona (precios de desarrollos reales + simulación) y motor fiscal de cierre. Los números marcados <b>estimado</b> son transparentes: no reemplazan un avalúo ni asesoría fiscal.
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA · shell claro + tabs
// ══════════════════════════════════════════════════════════════════════════════
export default function TaxProjectorPage() {
  const [tab, setTab] = useState('impuestos');
  return (
    <div data-testid="tax-projector-page" className="tool-surface" style={{ color: INK, fontFamily: 'DM Sans, sans-serif' }}>
      <style>{`@keyframes dmxShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <ToolNav />
      <Header />
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'impuestos' && <ImpuestosTab />}
      {tab === 'inversion' && <InversionTab />}
      {tab === 'comparar' && <CompararTab />}
    </div>
  );
}
