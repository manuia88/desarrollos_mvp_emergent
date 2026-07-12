/*
 *  Screener inmobiliario — filtra colonias por MÉTRICAS DE INVERSIÓN (founder 07-09, inédito en el mercado).
 *  Nadie más filtra bienes raíces por plusvalía/yield/riesgo/precio. Consume /api/screener. Descubrimiento → lead.
 */
import React, { useEffect, useState, useCallback } from 'react';
import ToolNav from '../components/ui/ToolNav';

const API = process.env.REACT_APP_BACKEND_URL || '';
const C = { bg: '#FBFAFC', ink: '#15121C', ink2: '#5B5568', faint: '#9A93A6', line: '#EFEBF4', card: '#FFFFFF', accent: '#6D4AFF', green: '#1E9E63', amber: '#D98A00' };
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";

const ORDENES = [
  ['plusvalia', '📈 Plusvalía'], ['yield', '💸 Yield'], ['emergentes', '🌱 Emergente'],
  ['riesgo', '🛡️ Menor riesgo'], ['precio', '💰 Menor precio'], ['calidad', '⭐ Calidad de zona'],
];
const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');

function Slider({ label, hint, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontSize: 12.5, color: C.ink2, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: C.accent, fontWeight: 700 }}>{value === '' ? 'todos' : (fmt ? fmt(value) : value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value === '' ? min : value}
        onChange={(e) => onChange(Number(e.target.value) === min ? '' : Number(e.target.value))}
        style={{ width: '100%', accentColor: C.accent }} />
      {hint && <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint }}>{hint}</div>}
    </div>
  );
}

export default function Screener({ user, onLogin }) {
  const [orden, setOrden] = useState('plusvalia');
  const [plusvaliaMin, setPlusvaliaMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [gentrifMin, setGentrifMin] = useState('');
  const [riskMax, setRiskMax] = useState('');
  const [rows, setRows] = useState([]);
  const [bench, setBench] = useState(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ orden, limit: '30' });
    if (plusvaliaMin !== '') q.set('plusvalia_min', plusvaliaMin);
    if (precioMax !== '') q.set('precio_max', precioMax);
    if (gentrifMin !== '') q.set('gentrif_min', gentrifMin);
    if (riskMax !== '') q.set('risk_max', riskMax);
    try {
      const r = await fetch(`${API}/api/screener?${q.toString()}`).then((r) => r.json());
      setRows(r.resultados || []);
      setBench(r.benchmark_cdmx || null);
    } catch (e) { setRows([]); }
    setLoading(false);
  }, [orden, plusvaliaMin, precioMax, gentrifMin, riskMax]);

  useEffect(() => { run(); }, [run]);

  // Trabajo guardado: guardar los filtros actuales del screener (requiere login de comprador)
  const [savedMsg, setSavedMsg] = useState('');
  const guardarFiltros = async () => {
    const payload = { orden, plusvalia_min: plusvaliaMin, precio_max: precioMax, gentrif_min: gentrifMin, risk_max: riskMax };
    const label = `Screener · ${orden}${plusvaliaMin ? ` · plusvalía ${plusvaliaMin}%+` : ''}`;
    try {
      const r = await fetch(`${API}/api/comprador/analyses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ kind: 'screener', label, payload }),
      });
      setSavedMsg(r.ok ? '✓ Filtros guardados en tu portal' : 'Inicia sesión para guardar');
    } catch (e) { setSavedMsg('No se pudo guardar'); }
    setTimeout(() => setSavedMsg(''), 3500);
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <ToolNav />
      <div style={{ background: GRAD, color: '#fff', padding: '48px 20px 36px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: 0.85, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Screener inmobiliario</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 38, lineHeight: 1.06, margin: '8px 0 8px', letterSpacing: '-0.02em', maxWidth: 760 }}>
            Filtra CDMX como un inversionista, no como un buscador de casas
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 16, opacity: 0.92, maxWidth: 640 }}>
            Ordena las colonias por plusvalía, yield, riesgo o precio. Nadie más te deja hacer esto.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Barra de filtros */}
        <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginTop: 20, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>Ordenar por</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ORDENES.map(([k, l]) => (
                <button key={k} onClick={() => setOrden(k)} style={{ padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, border: `1.5px solid ${orden === k ? C.accent : C.line}`, background: orden === k ? '#F3F0FF' : '#fff', color: orden === k ? C.accent : C.ink2 }}>{l}</button>
              ))}
            </div>
          </div>
          <Slider label="Plusvalía mínima" value={plusvaliaMin} min={0} max={10} step={0.5} onChange={setPlusvaliaMin} fmt={(v) => `${v}%+`} />
          <Slider label="Precio máx /m²" value={precioMax} min={20000} max={200000} step={5000} onChange={setPrecioMax} fmt={money} />
          <Slider label="Gentrificación mín" value={gentrifMin} min={0} max={90} step={5} onChange={setGentrifMin} fmt={(v) => `${v}+`} />
          <Slider label="Riesgo máx" value={riskMax} min={0} max={100} step={5} onChange={setRiskMax} fmt={(v) => `≤${v}`} />
        </div>

        {/* Resultados */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: C.ink }}>{loading ? 'Filtrando…' : `${rows.length} colonias`}</div>
            <button onClick={guardarFiltros} style={{ padding: '6px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 12.5, border: `1.5px solid ${C.line}`, background: '#fff', color: C.accent }}>💾 Guardar filtros</button>
            {savedMsg && <span style={{ fontFamily: FONT, fontSize: 12.5, color: savedMsg[0] === '✓' ? C.green : C.amber }}>{savedMsg}</span>}
          </div>
          {bench && bench.precio_m2_mediana && (
            <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2 }}>
              Mercado CDMX: <b style={{ color: C.ink }}>{money(bench.precio_m2_mediana)}/m²</b> mediana · plusvalía {bench.plusvalia_mediana}% ({bench.n_colonias} colonias)
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 14, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.faint, fontSize: 12.5 }}>
                {['#', 'Colonia', 'Alcaldía', 'Plusvalía', 'Precio/m²', 'vs CDMX', 'Riesgo', 'Gentrif.', 'Calidad'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.colonia_id || i} className="dmx-card" style={{ background: i % 2 ? '#FCFBFE' : '#fff' }}>
                  <td style={{ padding: '10px', color: C.faint, fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '10px', fontFamily: HEAD, fontWeight: 700 }}>{r.colonia_id ? <a href={`/fundamentales/${r.colonia_id}`} style={{ color: C.accent, textDecoration: 'none' }}>{r.name}</a> : <span style={{ color: C.ink }}>{r.name}</span>}</td>
                  <td style={{ padding: '10px', color: C.ink2 }}>{r.alcaldia || '—'}</td>
                  <td style={{ padding: '10px', fontWeight: 700, color: r.yoy > 0 ? C.green : C.ink2 }}>{r.yoy != null ? `${r.yoy > 0 ? '+' : ''}${r.yoy}%` : '—'}</td>
                  <td style={{ padding: '10px', fontVariantNumeric: 'tabular-nums' }}>{money(r.precio_m2)}</td>
                  <td style={{ padding: '10px', fontWeight: 700, color: r.vs_cdmx_precio_pct < 0 ? C.green : r.vs_cdmx_precio_pct > 0 ? C.amber : C.ink2 }}>{r.vs_cdmx_precio_pct != null ? `${r.vs_cdmx_precio_pct > 0 ? '+' : ''}${r.vs_cdmx_precio_pct}%` : '—'}</td>
                  <td style={{ padding: '10px', fontWeight: 700, color: r.risk == null ? C.faint : r.risk <= 40 ? C.green : r.risk >= 60 ? '#B03A3A' : C.amber }}>{r.risk != null ? (r.risk <= 40 ? 'Bajo' : r.risk >= 60 ? 'Alto' : 'Medio') : '—'}</td>
                  <td style={{ padding: '10px' }}>{r.gentrif != null ? Math.round(r.gentrif) : '—'}</td>
                  <td style={{ padding: '10px' }}>{r.zletter ? <span style={{ fontWeight: 700, color: C.accent }}>{r.zletter}</span> : '—'}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, color: C.faint }}>Ninguna colonia con esos filtros. Aflójalos un poco.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!user && (
          <div style={{ background: GRAD, color: '#fff', borderRadius: 18, padding: '24px', marginTop: 26, textAlign: 'center' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21 }}>Guarda tu screener y recibe alertas</div>
            <div style={{ fontFamily: FONT, fontSize: 15, opacity: 0.92, marginTop: 6 }}>Regístrate para guardar filtros y que te avisemos cuando una colonia entre a tus criterios.</div>
            <button onClick={onLogin} style={{ marginTop: 14, background: '#fff', color: C.accent, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Crear cuenta gratis</button>
          </div>
        )}
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 18, textAlign: 'center' }}>
          Métricas basadas en datos (SHF, mercado, índices DMX). Análisis, no asesoría de inversión.
        </div>
      </div>
    </div>
  );
}
