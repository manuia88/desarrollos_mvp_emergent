// Calculadora de inversión COMPLETA — contado vs apalancado, TIR, impuestos, neto al
// vender, ¿la renta cubre la hipoteca?, cuándo vender (año por año), renta mínima, costo
// de oportunidad vs CETES, veredicto en lenguaje humano + captura de lead y compartir.
// Reusa CashFlowChart y los endpoints /analyze /autofill /min-rent /capture-lead /save.
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CashFlowChart from './CashFlowChart';

const API = process.env.REACT_APP_BACKEND_URL;

const COLONIAS = [
  'polanco', 'condesa', 'roma', 'roma-norte', 'narvarte', 'del-valle',
  'santa-fe', 'coyoacan', 'doctores', 'tepito', 'xochimilco', 'pedregal',
  'tlalpan', 'lindavista', 'satélite', 'echegaray',
];

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const neg = n < 0;
  const s = `$${Math.round(Math.abs(n)).toLocaleString('es-MX')}`;   // formato completo $1,000,000 (pedido founder)
  return neg ? `−${s}` : s;
}
function pct(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : `${n.toFixed(1)}%`; }
function title(s) { return (s || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }

export default function InvestmentSimulator({ prefilled = {}, compact = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    precio: prefilled.precio || 5_000_000,
    _priceTouched: !!prefilled.lockPrice,   // precio del depto elegido → bloqueado · el autofill NO lo sobrescribe
    m2: prefilled.m2 || 80,
    colonia_slug: prefilled.colonia || 'del-valle',
    anios_tenencia: 10,
    financiamiento_pct: 0.80,
    plazo_credito_anios: 20,
    tasa_credito_pct: '',          // vacío → tasa oficial DMX
    apreciacion_anual_pct: '',
    renta_mensual: '',
    vacancia_pct: '',
    isr_renta_pct: '',
  });
  const [origen, setOrigen] = useState({});        // campo → 'dmx_real' | 'supuesto'
  const [pulso, setPulso] = useState(null);
  const [result, setResult] = useState(null);       // { apalancado, contado, veredicto }
  const [minRent, setMinRent] = useState(null);
  const [stressResult, setStressResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showStress, setShowStress] = useState(false);
  const [showYears, setShowYears] = useState(false);
  const [error, setError] = useState('');
  // Lead capture
  const [lead, setLead] = useState({ name: '', email: '', phone: '', consent: false });
  const [leadSent, setLeadSent] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // ── Auto-relleno con datos reales DMX cuando cambia la colonia ──
  const autofill = useCallback(async (slug, precio, m2) => {
    try {
      const qs = precio ? `?precio=${precio}&m2=${m2 || 80}` : `?m2=${m2 || 80}`;
      const r = await fetch(`${API}/api/investment-simulator/colonia/${slug}/autofill${qs}`);
      const d = r.ok ? await r.json() : null;
      if (!d?.ok) return;
      setOrigen(d.origen || {});
      setPulso(d.pulso_demanda || null);
      setForm(f => ({
        ...f,
        precio: f._priceTouched ? f.precio : (d.precio_sugerido || f.precio),
        apreciacion_anual_pct: d.apreciacion_anual_pct != null ? String(d.apreciacion_anual_pct) : f.apreciacion_anual_pct,
        renta_mensual: d.renta_mensual != null ? String(d.renta_mensual) : f.renta_mensual,
        tasa_credito_pct: d.tasa_credito_pct != null ? f.tasa_credito_pct : f.tasa_credito_pct,
      }));
    } catch {}
  }, []);

  useEffect(() => { autofill(form.colonia_slug, null, form.m2); /* eslint-disable-next-line */ }, [form.colonia_slug]);

  const payload = useCallback(() => {
    const p = {
      precio: parseFloat(form.precio),
      colonia_slug: form.colonia_slug,
      anios_tenencia: parseInt(form.anios_tenencia),
      financiamiento_pct: parseFloat(form.financiamiento_pct),
      plazo_credito_anios: parseFloat(form.plazo_credito_anios),
    };
    if (form.tasa_credito_pct !== '') p.tasa_credito = parseFloat(form.tasa_credito_pct) / 100;
    if (form.apreciacion_anual_pct !== '') p.apreciacion_anual = parseFloat(form.apreciacion_anual_pct) / 100;
    if (form.renta_mensual !== '') p.renta_mensual = parseFloat(form.renta_mensual);
    if (form.vacancia_pct !== '') p.vacancia_pct = parseFloat(form.vacancia_pct) / 100;
    if (form.isr_renta_pct !== '') p.isr_renta_pct = parseFloat(form.isr_renta_pct) / 100;
    return p;
  }, [form]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setLoading(true); setError(''); setResult(null); setStressResult(null); setMinRent(null); setLeadSent(false); setShareUrl('');
    try {
      const r = await fetch(`${API}/api/investment-simulator/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
      });
      const d = await r.json();
      if (d.ok) {
        setResult(d);
        try { window.posthog?.capture('investment_analyze', { colonia: form.colonia_slug, precio: form.precio }); } catch {}
      } else { setError('No se pudo calcular. Revisa los valores.'); }
    } catch { setError('No se pudo conectar al servidor.'); }
    setLoading(false);
  };

  const loadMinRent = async () => {
    try {
      const r = await fetch(`${API}/api/investment-simulator/min-rent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
      });
      const d = await r.json(); if (d.ok) setMinRent(d.renta_minima_mensual);
    } catch {}
  };

  const loadStress = async () => {
    setShowStress(s => !s);
    if (stressResult || !result) return;
    try {
      const tier = result.apalancado?.supuestos ? undefined : undefined;
      const r = await fetch(`${API}/api/investment-simulator/stress-test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_entrada: parseFloat(form.precio),
          plazo_meses: parseInt(form.anios_tenencia) * 12,
          m2: parseFloat(form.m2),
          financiamiento_pct: parseFloat(form.financiamiento_pct),
          tier_zona: pulso ? undefined : undefined,
        }),
      });
      const d = await r.json(); if (d.ok) setStressResult(d);
    } catch {}
  };

  const captureLead = async () => {
    if (!lead.consent || !(lead.email || lead.phone)) { setError('Marca el consentimiento y deja un correo o teléfono.'); return; }
    try {
      const r = await fetch(`${API}/api/investment-simulator/capture-lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, params: payload(), resultado: result?.apalancado || {} }),
      });
      const d = await r.json();
      if (d.ok) { setLeadSent(true); try { window.posthog?.capture('investment_lead_captured', { colonia: form.colonia_slug }); } catch {} }
      else setError('No se pudo registrar. Intenta de nuevo.');
    } catch { setError('No se pudo registrar.'); }
  };

  const share = async () => {
    try {
      const r = await fetch(`${API}/api/investment-simulator/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: payload(), resultado: result?.apalancado || {} }),
      });
      const d = await r.json();
      if (d.ok) { const url = `${window.location.origin}${d.url}`; setShareUrl(url); try { await navigator.clipboard.writeText(url); } catch {} }
    } catch {}
  };

  // ── estilos ──
  const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', width: '100%', outline: 'none' };
  const labelStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const cardStyle = { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, background: 'rgba(13,16,23,0.85)', padding: '16px 18px' };

  const Badge = ({ field }) => {
    const o = origen[field];
    if (!o) return null;
    const real = o === 'dmx_real';
    return <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: real ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.13)', color: real ? '#4ADE80' : '#FCD34D' }}>{real ? 'según DMX' : 'supuesto'}</span>;
  };

  const ap = result?.apalancado, co = result?.contado, ver = result?.veredicto;
  const verColor = ver?.nivel === 'buena' ? '#4ADE80' : ver?.nivel === 'regular' ? '#FCD34D' : '#FCA5A5';

  return (
    <div style={{ width: '100%' }}>
      <form onSubmit={handleSubmit} data-testid="simulador-form" noValidate>
        {/* Básico */}
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Precio (MXN){prefilled.lockPrice ? ' · del depto' : ''}</label>
            {prefilled.lockPrice ? (
              <input type="text" data-testid="simulador-input-precio" value={`$${Number(form.precio || 0).toLocaleString('es-MX')}`} readOnly title="Precio del depto seleccionado (fijo)" style={{ ...inputStyle, opacity: 0.9, cursor: 'not-allowed' }} />
            ) : (
              <input type="number" data-testid="simulador-input-precio" value={form.precio} min="100000" step="50000" required style={inputStyle}
                onChange={e => setForm(f => ({ ...f, precio: e.target.value, _priceTouched: true }))} />
            )}
          </div>
          <div>
            <label style={labelStyle}>Colonia</label>
            <select data-testid="simulador-input-colonia" value={form.colonia_slug} style={inputStyle}
              onChange={e => setForm(f => ({ ...f, colonia_slug: e.target.value, _priceTouched: false }))}>
              {COLONIAS.map(c => <option key={c} value={c} style={{ background: '#06080F' }}>{title(c)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Años que lo conservas</label>
            <select value={form.anios_tenencia} style={inputStyle} onChange={e => setForm(f => ({ ...f, anios_tenencia: e.target.value }))}>
              {[3, 5, 7, 10, 15, 20].map(y => <option key={y} value={y} style={{ background: '#06080F' }}>{y} años</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Enganche</label>
            <select value={form.financiamiento_pct} style={inputStyle} onChange={e => setForm(f => ({ ...f, financiamiento_pct: e.target.value }))}>
              {[[1, 'Al contado (100%)'], [0.9, '10% enganche'], [0.8, '20% enganche'], [0.7, '30% enganche'], [0.5, '50% enganche']].map(([v, l]) => (
                <option key={v} value={v} style={{ background: '#06080F' }}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Apreciación anual (%) <Badge field="apreciacion_anual_pct" /></label>
            <input type="number" value={form.apreciacion_anual_pct} placeholder="5.0" min="-5" max="30" step="0.5" style={inputStyle}
              onChange={e => setForm(f => ({ ...f, apreciacion_anual_pct: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Renta mensual (MXN) <Badge field="renta_mensual" /></label>
            <input type="text" inputMode="numeric" value={form.renta_mensual ? `$${Number(String(form.renta_mensual).replace(/\D/g, '') || 0).toLocaleString('es-MX')}` : ''} placeholder="auto" style={inputStyle}
              onChange={e => setForm(f => ({ ...f, renta_mensual: String(e.target.value).replace(/\D/g, '') }))} />
          </div>
        </div>

        {/* Avanzado */}
        <button type="button" onClick={() => setShowAdvanced(s => !s)} style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 9999, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--cream-3)', marginBottom: 12 }}>
          {showAdvanced ? '− Ocultar supuestos avanzados' : '+ Supuestos avanzados (crédito, impuestos)'}
        </button>
        {showAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 14, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 10 }}>
            <div><label style={labelStyle}>Plazo del crédito (años)</label>
              <select value={form.plazo_credito_anios} style={inputStyle} onChange={e => setForm(f => ({ ...f, plazo_credito_anios: e.target.value }))}>
                {[10, 15, 20, 25].map(y => <option key={y} value={y} style={{ background: '#06080F' }}>{y} años</option>)}
              </select></div>
            <div><label style={labelStyle}>Tasa hipotecaria (%) <Badge field="tasa_credito_pct" /></label>
              <input type="number" value={form.tasa_credito_pct} placeholder="oficial DMX" step="0.1" style={inputStyle}
                onChange={e => setForm(f => ({ ...f, tasa_credito_pct: e.target.value }))} /></div>
            <div><label style={labelStyle}>Vacancia (%)</label>
              <input type="number" value={form.vacancia_pct} placeholder="8" step="1" style={inputStyle}
                onChange={e => setForm(f => ({ ...f, vacancia_pct: e.target.value }))} /></div>
            <div><label style={labelStyle}>ISR sobre renta (%)</label>
              <input type="number" value={form.isr_renta_pct} placeholder="25" step="1" style={inputStyle}
                onChange={e => setForm(f => ({ ...f, isr_renta_pct: e.target.value }))} /></div>
            <div><label style={labelStyle}>m²</label>
              <input type="number" value={form.m2} step="5" style={inputStyle} onChange={e => setForm(f => ({ ...f, m2: e.target.value }))} /></div>
          </div>
        )}

        <button type="submit" disabled={loading} style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, padding: '10px 24px', borderRadius: 9999, background: loading ? 'rgba(var(--theme-rgb),0.5)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Calculando...' : 'Calcular análisis completo'}
        </button>
        {pulso && <span style={{ marginLeft: 12, fontSize: 11, fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>Demanda viva de la zona: <strong style={{ color: 'var(--cream)' }}>{pulso.bucket}</strong> ({pulso.score})</span>}
        {error && <div style={{ color: '#EF4444', fontSize: 12, fontFamily: 'DM Sans', marginTop: 8 }}>{error}</div>}
      </form>

      {result && (
        <div style={{ marginTop: 26 }}>
          {/* Veredicto */}
          {ver && (
            <div style={{ ...cardStyle, borderColor: verColor, marginBottom: 18 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: verColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Veredicto · inversión {ver.nivel}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', lineHeight: 1.6 }}>{ver.veredicto}</div>
              {ver.acciones?.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--cream-3)', fontSize: 12, fontFamily: 'DM Sans', lineHeight: 1.6 }}>
                  {ver.acciones.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Dos perfiles: contado vs apalancado */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 18 }}>
            {[['Al contado (sin hipoteca)', co, '#4ADE80'], ['Con hipoteca', ap, '#60A5FA']].map(([label, s, accent]) => s && (
              <div key={label} style={{ ...cardStyle, borderColor: `${accent}55` }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: accent, marginBottom: 12 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                  {[
                    ['Rendimiento anual (TIR)', pct(s.tir_anual_pct)],
                    ['ROI total', pct(s.roi_total_pct)],
                    ['Flujo mensual (año 1)', fmt(s.flujo_mensual_anio1)],
                    ['Capital que pones', fmt(s.capital_real_invertido)],
                    ['Neto al vender', fmt(s.neto_al_vender)],
                    ['Patrimonio que construyes', fmt(s.patrimonio_construido)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', fontFamily: 'DM Sans', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {s.modo === 'apalancado' && s.cobertura_renta_vs_hipoteca_pct != null && (
                  <div style={{ marginTop: 12, fontSize: 12, fontFamily: 'DM Sans', color: s.cubre_hipoteca ? '#4ADE80' : '#FCA5A5' }}>
                    {s.cubre_hipoteca ? '✓ La renta cubre la hipoteca' : `⚠ La renta cubre solo el ${s.cobertura_renta_vs_hipoteca_pct}% de la hipoteca`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Costo de oportunidad + cuándo vender + break-even */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            <span>Mejor año para vender: <strong style={{ color: 'var(--cream)' }}>{ap?.mejor_anio_para_vender || '—'}</strong></span>
            <span>Recuperas tu inversión: <strong style={{ color: 'var(--cream)' }}>{ap?.break_even_anio ? `año ${ap.break_even_anio}` : 'no en este plazo'}</strong></span>
            <span>vs CETES ({ap?.cetes_anual_pct}%): <strong style={{ color: (ap?.vence_a_cetes ? '#4ADE80' : '#FCA5A5') }}>{ap?.vence_a_cetes ? 'le gana' : 'no le gana'}</strong></span>
            <button type="button" onClick={loadMinRent} style={{ fontSize: 11, color: 'var(--theme)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {minRent ? `Renta mínima para no perder: ${fmt(minRent)}/mes` : '¿Cuál es la renta mínima para no perder?'}
            </button>
          </div>

          {/* Cuándo vender — tabla año por año */}
          <button type="button" onClick={() => setShowYears(s => !s)} style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 9999, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: showYears ? 'rgba(var(--theme-rgb),0.12)' : 'transparent', color: showYears ? 'var(--theme)' : 'var(--cream-3)', marginBottom: 12 }}>
            {showYears ? 'Ocultar año por año' : '¿Cuándo conviene vender? (año por año)'}
          </button>
          {showYears && ap?.por_anio && (
            <div style={{ overflowX: 'auto', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>
                <thead>
                  <tr style={{ color: 'var(--cream-3)', textAlign: 'right' }}>
                    {['Año', 'Valor venta', 'Neto al vender', 'Ganancia', 'ROI', 'TIR'].map((h, i) => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ap.por_anio.map(row => (
                    <tr key={row.anio} style={{ background: row.anio === ap.mejor_anio_para_vender ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
                      <td style={{ padding: '6px 10px' }}>{row.anio}{row.anio === ap.mejor_anio_para_vender ? ' ★' : ''}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(row.valor_venta)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(row.neto_al_vender)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: row.ganancia_total >= 0 ? '#4ADE80' : '#FCA5A5' }}>{fmt(row.ganancia_total)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{pct(row.roi_pct)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{row.tir_anual_pct != null ? pct(row.tir_anual_pct) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Proyección de valor */}
          {ap?.cash_flow_monthly?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Valor de la propiedad · proyección</div>
              <CashFlowChart base={ap.cash_flow_monthly} metric="valor_propiedad" />
            </div>
          )}

          {/* Stress test */}
          <div style={{ marginBottom: 18 }}>
            <button type="button" onClick={loadStress} style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 9999, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: showStress ? 'rgba(var(--theme-rgb),0.12)' : 'transparent', color: showStress ? 'var(--theme)' : 'var(--cream-3)' }}>
              {showStress ? 'Ocultar escenarios de estrés' : 'Escenarios de estrés (recesión, alza de tasas, sobreoferta)'}
            </button>
            {showStress && stressResult && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {[['recesion', 'Recesión', stressResult.recesion], ['alza_tasas', 'Alza de tasas', stressResult.alza_tasas], ['supply_shock', 'Sobreoferta', stressResult.supply_shock]].map(([key, label, s]) => (
                  <div key={key} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#FCA5A5', marginBottom: 8 }}>{label}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                      ROI: <strong style={{ color: 'var(--cream)' }}>{s?.roi_pct != null ? `${s.roi_pct.toFixed(1)}%` : '—'}</strong><br />
                      TIR: <strong style={{ color: 'var(--cream)' }}>{s?.tir_anual_pct != null ? `${s.tir_anual_pct.toFixed(1)}%` : '—'}</strong><br />
                      <span style={{ opacity: 0.7 }}>{s?.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lead + compartir */}
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 10 }}>¿Hablamos de esta inversión?</div>
            {leadSent ? (
              <div style={{ color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 13 }}>✓ Listo, un asesor te contactará con este análisis.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                  <input placeholder="Nombre" value={lead.name} style={inputStyle} onChange={e => setLead(l => ({ ...l, name: e.target.value }))} />
                  <input placeholder="Correo" value={lead.email} style={inputStyle} onChange={e => setLead(l => ({ ...l, email: e.target.value }))} />
                  <input placeholder="WhatsApp" value={lead.phone} style={inputStyle} onChange={e => setLead(l => ({ ...l, phone: e.target.value }))} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={lead.consent} onChange={e => setLead(l => ({ ...l, consent: e.target.checked }))} />
                  Acepto que un asesor me contacte sobre esta inversión (aviso de privacidad).
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={captureLead} style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', border: 'none', cursor: 'pointer' }}>Que me contacte un asesor</button>
                  <button type="button" onClick={share} style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, padding: '9px 20px', borderRadius: 9999, background: 'transparent', color: 'var(--cream-3)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>{shareUrl ? '✓ Link copiado' : 'Guardar y compartir'}</button>
                </div>
              </>
            )}
          </div>

          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', opacity: 0.7, lineHeight: 1.5 }}>
            {result.apalancado?.supuestos?.gastos_nota || 'Cálculo con supuestos editables; no es asesoría fiscal.'}
          </div>
        </div>
      )}
    </div>
  );
}
