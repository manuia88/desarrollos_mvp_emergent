// F2.6 · Estudio de Mercado Vivo — entregable auto-generado por colonia O por punto + radio.
// Fusiona los motores F2 (Grafo + EPRAV + Generador + oferta + zona). Modo radio: compone las
// colonias del círculo (geocodifica dirección con Mapbox o clic) y solo muestra si es representativo.
// Exportable a PDF (impresión). Reusa el buscador de colonias de Valor de Terreno. Cero deuda.
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { Search } from '../../components/icons';
import * as api from '../../api/developer';
import { buscarColonias } from '../../api/valorResidual';

const money = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : '—');
const num = (n) => (n != null ? Number(n).toLocaleString('es-MX') : '—');
const CATS = [{ id: 'economica', label: 'Económica' }, { id: 'media', label: 'Media' }, { id: 'premium', label: 'Premium' }];
const RADIOS = [{ m: 500, label: '500 m' }, { m: 1000, label: '1 km' }, { m: 1500, label: '1.5 km' }];

// F4.1/F4.2 · "Qué Pasaría Si" — aplica las palancas que el Cerebro aprendió (6 factores).
function SimuladorPalancas() {
  const [factores, setFactores] = useState([]);
  const [factor, setFactor] = useState('recamaras');
  const [de, setDe] = useState(null);
  const [a, setA] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  // catálogo de factores + opciones aprendidas
  useEffect(() => {
    let alive = true;
    api.getSimuladorFactores().then(r => { if (alive) setFactores(r.factores || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const curr = factores.find(f => f.key === factor);
  const opciones = curr?.opciones || [];

  // al cambiar de factor, fija de/a por defecto (2 primeras opciones)
  useEffect(() => {
    if (opciones.length >= 2) { setDe(opciones[1]); setA(opciones[0]); }
    else if (opciones.length === 1) { setDe(opciones[0]); setA(opciones[0]); }
    else { setDe(null); setA(null); }
  }, [factor, factores]); // eslint-disable-line

  useEffect(() => {
    if (!a) { setRes(null); return; }
    let alive = true;
    setBusy(true);
    api.getSimuladorPalancas({ factor, de, a })
      .then(r => { if (alive) setRes(r); })
      .catch(() => { if (alive) setRes(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [factor, de, a]);

  const pill = (v, sel, on) => (
    <button key={v} onClick={on} style={{ padding: '5px 10px', borderRadius: 8, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
      border: `1px solid ${sel ? 'rgba(99,102,241,0.6)' : 'var(--border)'}`, background: sel ? 'rgba(99,102,241,0.14)' : 'transparent', color: sel ? 'var(--cream)' : 'var(--cream-3)' }}>{v}</button>
  );
  const delta = res?.delta_pp;
  const dColor = delta > 0 ? '#22C55E' : (delta < 0 ? '#ef4444' : 'var(--cream-2)');
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(var(--cream-rgb),0.03)', padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>🧠 Qué Pasaría Si (palancas aprendidas)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {factores.map(f => pill(f.nombre, f.key === factor, () => setFactor(f.key)))}
      </div>
      {opciones.length >= 2 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
          <span>De</span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{opciones.map(v => pill(v, v === de, () => setDe(v)))}</span>
          <span>a</span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{opciones.map(v => pill(v, v === a, () => setA(v)))}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.85)' }}>◐ Aún sin suficiente venta real para simular este factor — se prende solo con datos.</div>
      )}
      <div style={{ marginTop: 10 }}>
        {busy && <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>Calculando…</span>}
        {!busy && res && res.disponible && (
          <div>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: dColor }}>
              {delta > 0 ? '+' : ''}{delta} pts
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--cream-2)', marginLeft: 8 }}>
              ({res.vendido_de_pct}% → {res.vendido_a_pct}% de venta esperada)
            </span>
            <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>◐ {res.lectura}</div>
            {res.mejor_opcion && <div style={{ fontSize: 11.5, color: '#a5b4fc', marginTop: 2 }}>Lo que más se vende hoy: {res.mejor_opcion}.</div>}
          </div>
        )}
        {!busy && res && !res.disponible && opciones.length >= 2 && (
          <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.85)' }}>◐ {res.lectura}</div>
        )}
      </div>
    </div>
  );
}

// F2.9 · Calculadora de cuota de mantenimiento (antes invisible: el motor existía sin UI). El dev juega con m² + amenidades
// y ve la cuota sugerida + si está en rango de mercado CDMX. Reusa /api/dev/cuota-recomendada (amenidades_engine).
const CUOTA_AMEN = [['alberca', 'Alberca'], ['gimnasio', 'Gimnasio'], ['spa', 'Spa'], ['roof', 'Roof garden'], ['sky', 'Sky lounge'], ['concierge', 'Concierge'], ['cine', 'Cine'], ['coworking', 'Coworking'], ['salon', 'Salón'], ['asador', 'Asador']];
const CUOTA_BANDA = { baja: '#34D399', tipica: '#60A5FA', alta: '#FBBF24', premium: '#F87171', sin_dato: 'var(--cream-3)' };

function CuotaCalculator({ coloniaId }) {
  const [m2, setM2] = useState(100);
  const [amen, setAmen] = useState(() => new Set(['alberca', 'gimnasio']));
  const [res, setRes] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getCuotaRecomendada(m2 || 1, [...amen].join(','), coloniaId).then((r) => { if (alive) setRes(r); }).catch(() => { if (alive) setRes(null); });
    return () => { alive = false; };
  }, [m2, amen, coloniaId]);
  const toggle = (t) => setAmen((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const col = CUOTA_BANDA[res?.banda] || 'var(--cream-2)';
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>🧾 ¿Cuánto cobrar de mantenimiento?</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12 }}>Cuota sugerida por el paquete de amenidades + la zona — juega con los números.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-2)' }}>m² del depa</span>
        <input type="number" min="20" max="600" value={m2} onChange={(e) => setM2(Number(e.target.value))} style={{ width: 90, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-card, rgba(255,255,255,0.04))', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {CUOTA_AMEN.map(([t, l]) => {
          const on = amen.has(t);
          return (
            <button key={t} type="button" onClick={() => toggle(t)} style={{ padding: '6px 12px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12, border: on ? '1.5px solid var(--theme)' : '1px solid var(--border)', background: on ? 'rgba(109,74,255,0.12)' : 'transparent', color: on ? 'var(--theme)' : 'var(--cream-3)' }}>{l}</button>
          );
        })}
      </div>
      {res && res.cuota_estimada_mxn != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.02em' }}>${res.cuota_estimada_mxn.toLocaleString('es-MX')}<span style={{ fontSize: 14, color: 'var(--cream-3)', fontWeight: 600 }}>/mes</span></div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>${res.tarifa_m2}/m² · {res.amenidades_premium} amenidades premium</div>
          </div>
          {res.veredicto && <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12.5, padding: '5px 12px', borderRadius: 9999, color: col, background: `${col}1f`, border: `1px solid ${col}55` }}>{res.veredicto}</span>}
        </div>
      )}
      {res && res.referencia_segmento && <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 10 }}>{res.referencia_segmento}</div>}
    </Card>
  );
}

// Radar de Oportunidad ("¿dónde construyo?") + Precio de Equilibrio ("¿a qué precio vendo?").
// Dato REAL de estudios de demanda 4S (equilibrium_engine). Cero jerga: hueco, se agota en, precio justo.
function RadarOportunidad() {
  const [radar, setRadar] = useState(null);
  const [sel, setSel] = useState(null);        // fila seleccionada → precio de equilibrio de su estudio
  const [mi, setMi] = useState(null);          // market-intelligence del estudio seleccionado
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    api.getGapRadar().then(r => { if (alive) setRadar(r); }).catch(() => setRadar(null)).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!sel) { setMi(null); return; }
    let alive = true;
    api.getMarketIntelligence(sel.estudio, 12).then(r => { if (alive) setMi(r); }).catch(() => setMi(null));
    return () => { alive = false; };
  }, [sel]);

  if (busy) return <Card style={{ marginBottom: 16 }}><div className="eyebrow">Radar de Oportunidad</div><div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, marginTop: 8 }}>Cargando…</div></Card>;
  if (!radar || !radar.top || !radar.top.length) return null;   // sin dato 4S → no se muestra (no inventa)

  const conf = radar.fuente === 'real'
    ? { t: 'Dato real · estudios 4S', c: '#3fb950' }
    : { t: 'Estimado', c: '#d29922' };
  const zonaTxt = (f) => Array.isArray(f.zona) ? f.zona.slice(0, 3).join(', ') : (f.zona || f.estudio || '—');
  const barColor = (s) => s >= 80 ? '#3fb950' : s >= 50 ? '#58a6ff' : '#8b949e';
  const eq = mi && mi.precio_equilibrio;

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div className="eyebrow" style={{ flex: 1 }}>Radar de Oportunidad · ¿Dónde construir?</div>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 9999, color: conf.c, background: `${conf.c}1f`, border: `1px solid ${conf.c}55` }}>{conf.t}</span>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans' }}>{open ? 'Ocultar' : 'Ver'}</button>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 12 }}>
        Zonas y segmentos con más demanda sin oferta (hueco de mercado a 3 años). El #1 es dónde falta más producto.
      </div>

      {open && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--cream-3)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>#</th>
                  <th style={{ padding: '6px 8px' }}>Segmento</th>
                  <th style={{ padding: '6px 8px' }}>Zona</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Faltan (3 años)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Se agota en</th>
                  <th style={{ padding: '6px 8px', minWidth: 110 }}>Oportunidad</th>
                </tr>
              </thead>
              <tbody>
                {radar.top.map((f) => {
                  const active = sel && sel.estudio === f.estudio && sel.segmento === f.segmento;
                  return (
                    <tr key={`${f.estudio}-${f.segmento}-${f.rank}`} onClick={() => setSel(active ? null : f)}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: active ? 'var(--surface-2, rgba(255,255,255,0.03))' : 'transparent' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--cream-3)' }}>{f.rank}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--cream)', fontWeight: 600 }}>{f.segmento}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--cream-2)' }}>{zonaTxt(f)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{num(f.gap_vertical_3anos)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--cream-3)', fontVariantNumeric: 'tabular-nums' }}>{f.meses_para_agotar_hueco != null ? `${f.meses_para_agotar_hueco} m` : '—'}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--border)' }}>
                            <div style={{ width: `${f.indice_oportunidad}%`, height: '100%', borderRadius: 4, background: barColor(f.indice_oportunidad) }} />
                          </div>
                          <b style={{ color: barColor(f.indice_oportunidad), fontVariantNumeric: 'tabular-nums', minWidth: 22, textAlign: 'right' }}>{f.indice_oportunidad}</b>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Precio de equilibrio del estudio seleccionado */}
          {sel && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Precio de equilibrio · {sel.segmento} · {zonaTxt(sel)}</div>
              {!mi && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5 }}>Calculando…</div>}
              {eq && eq.precio_equilibrio_m2 != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                      ${num(eq.precio_equilibrio_m2)}<span style={{ fontSize: 14, color: 'var(--cream-3)', fontWeight: 600 }}>/m²</span>
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                      Precio al que vendes el inventario en ~12 meses · {eq.n_comparables} proyectos comparables reales
                    </div>
                  </div>
                  {eq.precio_m2_rango && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                      Mercado hoy: ${num(eq.precio_m2_rango[0])}–${num(eq.precio_m2_rango[1])}/m²
                    </div>
                  )}
                </div>
              )}
              {eq && eq.interpretacion && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 8 }}>{eq.interpretacion}</div>
              )}
              {eq && eq.precio_equilibrio_m2 == null && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                  Aún no hay suficientes proyectos comparables en este segmento para calcular el precio de equilibrio real.
                </div>
              )}
            </div>
          )}
          {!sel && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 10 }}>
              Toca una fila para ver el precio de equilibrio (a qué precio se vende ese segmento en la zona).
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function DesarrolladorEstudioMercado({ user, onLogout, embedded }) {
  const [mode, setMode] = useState('colonia');
  const [categoria, setCategoria] = useState('media');
  // modo colonia
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const [colonia, setColonia] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // modo radio
  const [addr, setAddr] = useState('');
  const [geo, setGeo] = useState([]);
  const [point, setPoint] = useState(null);   // {lat, lng, label}
  const [radioM, setRadioM] = useState(1000);
  const [radioData, setRadioData] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [saveMsg, setSaveMsg] = useState('');

  const [propuesta, setPropuesta] = useState(null);  // F3.4 · jugada del Cerebro para esta colonia
  const [regenBusy, setRegenBusy] = useState(false);
  const [memo, setMemo] = useState(null);  // F2.10 · memo de inversionista (comercio PB + a quién rentar) — antes invisible

  // F3.2/F3.4 · carga historial + jugada del Cerebro (si el dato cambió) de esta colonia
  useEffect(() => {
    if (!colonia) { setHistorial([]); setPropuesta(null); setMemo(null); return; }
    api.getEstudioHistorial(colonia.id).then(r => setHistorial(r.items || [])).catch(() => setHistorial([]));
    api.getEstudioPropuestas()
      .then(r => setPropuesta((r.propuestas || []).find(p => String(p.colonia_id) === String(colonia.id)) || null))
      .catch(() => setPropuesta(null));
    api.getMemoInversionista(colonia.id).then(setMemo).catch(() => setMemo(null));
  }, [colonia]);

  // F3.4 · aprobar la jugada del Cerebro: regenera (resuelve predicción vs realidad) + recarga
  const aprobarRegenerar = async () => {
    if (!colonia) return;
    setRegenBusy(true);
    try {
      await api.regenerarEstudio(colonia.id, categoria);
      setPropuesta(null);
      const [est, hist] = await Promise.all([
        api.getEstudioMercado(colonia.id, categoria),
        api.getEstudioHistorial(colonia.id),
      ]);
      setData(est); setHistorial(hist.items || []);
    } catch {
      setSaveMsg('No se pudo regenerar');
    } finally {
      setRegenBusy(false);
    }
  };

  // F3.2 · guarda una foto fechada del estudio actual (versión)
  const saveEstudio = async () => {
    if (!colonia) return;
    setSaveBusy(true); setSaveMsg('');
    try {
      const doc = await api.guardarEstudio(colonia.id, categoria);
      setSaveMsg(`Guardado v${doc.version}`);
      const r = await api.getEstudioHistorial(colonia.id);
      setHistorial(r.items || []);
    } catch {
      setSaveMsg('No se pudo guardar');
    } finally {
      setSaveBusy(false);
    }
  };

  // F3.1 · Descarga el Estudio + Memo como PDF con marca (modo colonia). Radio → impresión.
  const downloadPdf = async () => {
    if (mode !== 'colonia' || !colonia) { window.print(); return; }
    setPdfBusy(true);
    try {
      const base = process.env.REACT_APP_BACKEND_URL || '';
      const url = `${base}/api/dev/estudio-mercado/pdf?colonia_id=${encodeURIComponent(colonia.id)}&categoria=${encodeURIComponent(categoria)}`;
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error('pdf');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Estudio_${(colonia.name || 'colonia').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      window.print();   // fallback honesto si el endpoint falla
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setOpts([]); return; }
    const t = setTimeout(() => buscarColonias(q).then(d => setOpts(d.items || [])).catch(() => setOpts([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!colonia) return;
    setLoading(true);
    api.getEstudioMercado(colonia.id, categoria).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [colonia, categoria]);

  // Geocodificar dirección con Mapbox (la llave la pone el founder).
  useEffect(() => {
    const q = addr.trim();
    if (mode !== 'radio' || q.length < 3) { setGeo([]); return; }
    const tok = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!tok) return;
    const t = setTimeout(() => {
      fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${tok}&country=mx&limit=5&proximity=-99.13,19.43`)
        .then(r => r.json()).then(d => setGeo(d.features || [])).catch(() => setGeo([]));
    }, 300);
    return () => clearTimeout(t);
  }, [addr, mode]);

  useEffect(() => {
    if (!point) return;
    setRadioLoading(true);
    api.getEstudioMercadoRadio({ lat: point.lat, lng: point.lng, radio_m: radioM, categoria })
      .then(setRadioData).catch(() => setRadioData(null)).finally(() => setRadioLoading(false));
  }, [point, radioM, categoria]);

  const Sec = ({ title, children }) => (
    <Card style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </Card>
  );
  const KV = ({ k, v, tone }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 13 }}>
      <span style={{ color: 'var(--cream-3)' }}>{k}</span><b style={{ color: tone || 'var(--cream)' }}>{v}</b>
    </div>
  );
  const tabBtn = (active) => ({
    padding: '8px 14px', borderRadius: 9999, border: '1px solid var(--border)',
    background: active ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
    color: active ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  });

  const hasResult = (mode === 'colonia' && data) || (mode === 'radio' && radioData);

  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader eyebrow="ENTREGABLE" title="Estudio de Mercado Vivo"
        sub="El estudio completo, auto-generado en minutos: por colonia o por un punto y radio (microzona a la medida). Exportable a PDF." />

      <RadarOportunidad />

      <Card style={{ marginBottom: 16 }} className="no-print">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setMode('colonia')} style={tabBtn(mode === 'colonia')}>Por Colonia</button>
          <button onClick={() => setMode('radio')} style={tabBtn(mode === 'radio')}>Por Punto + Radio</button>
          <span style={{ flex: 1 }} />
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCategoria(c.id)} style={{ ...tabBtn(categoria === c.id), padding: '8px 12px', fontSize: 12 }}>{c.label}</button>
          ))}
          {mode === 'colonia' && data && (
            <button onClick={saveEstudio} disabled={saveBusy} data-testid="estudio-guardar"
              style={{ ...tabBtn(false), color: 'var(--cream)', opacity: saveBusy ? 0.6 : 1 }}>
              {saveBusy ? 'Guardando…' : (saveMsg || 'Guardar Versión')}
            </button>
          )}
          {hasResult && (
            <button onClick={downloadPdf} disabled={pdfBusy} data-testid="estudio-pdf"
              style={{ ...tabBtn(false), color: 'var(--cream)', opacity: pdfBusy ? 0.6 : 1 }}>
              {pdfBusy ? 'Generando PDF…' : (mode === 'colonia' ? 'Descargar PDF' : 'Exportar a PDF')}
            </button>
          )}
        </div>

        {mode === 'colonia' ? (
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--cream-3)' }} />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} placeholder="Busca una colonia…"
              data-testid="estudio-colonia-input"
              style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13 }} />
            {open && opts.length > 0 && (
              <div style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 20, background: 'var(--bg-card, #16181d)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                {opts.map(o => (
                  <button key={o.id} onClick={() => { setColonia(o); setQuery(o.name); setOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
                    {o.name} <span style={{ color: 'var(--cream-3)' }}>· {o.alcaldia}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--cream-3)' }} />
              <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Dirección o calle (ej. Av. Revolución 1200)…"
                data-testid="estudio-addr-input"
                style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13 }} />
              {geo.length > 0 && (
                <div style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 20, background: 'var(--bg-card, #16181d)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                  {geo.map(f => (
                    <button key={f.id} onClick={() => { setPoint({ lat: f.center[1], lng: f.center[0], label: f.place_name }); setAddr(f.place_name); setGeo([]); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer' }}>
                      {f.place_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {RADIOS.map(rr => (
                <button key={rr.m} onClick={() => setRadioM(rr.m)} style={{ ...tabBtn(radioM === rr.m), padding: '8px 12px', fontSize: 12 }}>{rr.label}</button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ─── Modo Colonia ─── */}
      {mode === 'colonia' && !colonia && <div style={{ padding: 50, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Busca una colonia para generar su estudio.</div>}
      {mode === 'colonia' && loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Generando estudio…</div>}
      {mode === 'colonia' && data && !loading && (() => {
        const s = data.secciones || {}; const dr = s.demanda_real || {}; const dp = s.demanda_potencial || {};
        const pr = s.producto_recomendado || {}; const of = s.oferta || {}; const zo = s.zona || {};
        return (
          <>
            <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>{data.colonia}</h2>
                <Badge tone={data.es_estimado ? 'neutral' : 'ok'}>{data.es_estimado ? 'Preliminar' : 'Vivo'}</Badge>
                {zo.tier && <Badge tone="brand">{zo.tier}</Badge>}
              </div>
              {(data.veredicto || []).map((v, i) => <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', padding: '3px 0' }}>· {v}</div>)}
            </Card>
            {/* F2.10 · Memo de inversión: ¿comercio en planta baja? + a quién rentar (antes invisible — motor existía sin UI) */}
            {memo && (memo.comercio_pb || (memo.perfil_inquilino && memo.perfil_inquilino.perfil)) && (
              <Card style={{ marginBottom: 12, border: '1px solid rgba(99,102,241,0.3)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 10 }}>💡 Qué conviene construir aquí</div>
                {memo.comercio_pb && memo.comercio_pb.recomendacion && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>🏪</span>
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>Comercio en planta baja: {memo.comercio_pb.recomendacion}</div>
                      {memo.comercio_pb.razon && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 2 }}>{memo.comercio_pb.razon}</div>}
                    </div>
                  </div>
                )}
                {memo.perfil_inquilino && memo.perfil_inquilino.perfil && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 18 }}>🔑</span>
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>A quién rentar: {memo.perfil_inquilino.perfil}</div>
                      {memo.perfil_inquilino.nse && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 2 }}>Perfil objetivo del inquilino · NSE {memo.perfil_inquilino.nse}</div>}
                    </div>
                  </div>
                )}
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 8 }}>Memo de inversión · reúsa el motor de rendimiento + perfil de zona (qué le falta).</div>
              </Card>
            )}
            {/* F2.9 · Calculadora de cuota de mantenimiento (motor existía sin UI) */}
            <CuotaCalculator coloniaId={colonia?.id} />
            {propuesta && (
              <Card style={{ marginBottom: 12, border: '1px solid rgba(226,152,46,0.45)', background: 'linear-gradient(140deg, rgba(226,152,46,0.10), transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>
                      🧠 El Cerebro detectó cambios en esta zona
                    </div>
                    {(propuesta.motivos || []).map((m, i) => (
                      <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 3 }}>· {m}</div>
                    ))}
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6 }}>
                      Al regenerar, el Cerebro compara lo que predijo vs lo real y aprende.
                    </div>
                  </div>
                  <button onClick={aprobarRegenerar} disabled={regenBusy} data-testid="estudio-regenerar"
                    style={{ ...tabBtn(true), color: 'var(--cream)', whiteSpace: 'nowrap', opacity: regenBusy ? 0.6 : 1 }}>
                    {regenBusy ? 'Regenerando…' : 'Regenerar (Aprobar)'}
                  </button>
                </div>
              </Card>
            )}
            {historial.length > 0 && (
              <Sec title={`HISTORIAL DE ESTUDIOS (${historial.length})`}>
                {historial.slice(0, 8).map(h => (
                  <KV key={h.id}
                    k={`v${h.version} · ${(h.generated_at || '').slice(0, 10)} · ${(h.categoria || '').toString().charAt(0).toUpperCase()}${(h.categoria || '').toString().slice(1)}`}
                    v={`${num((h.snapshot || {}).demanda_total)} búsq · hueco ${num((h.snapshot || {}).gap_vertical)}`}
                    tone="#a5b4fc" />
                ))}
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6 }}>◐ Cada versión es una foto fechada — se compara con lo que pasa de verdad para que el Cerebro aprenda.</div>
              </Sec>
            )}
            <Sec title="DEMANDA REAL (BÚSQUEDAS)">
              <KV k="Búsquedas activas" v={dr.demanda_total ?? 0} /><KV k="Nivel de demanda" v={dr.etiqueta || '—'} /><KV k="Segmento dominante" v={dr.segmento_dominante_label || '—'} />
            </Sec>
            <Sec title="DEMANDA POTENCIAL (DEMOGRAFÍA · EPRAV)">
              <KV k="Familias/año (NSE objetivo)" v={num(dp.demanda_anual_total)} /><KV k="Buscarían vertical" v={num(dp.demanda_vertical)} /><KV k="Hueco de mercado (GAP)" v={num(dp.gap_vertical)} tone={dp.gap_vertical > 0 ? '#22C55E' : 'var(--cream)'} /><KV k="Captura objetivo" v={num(dp.captura_objetivo)} tone="#a5b4fc" />
            </Sec>
            <Sec title="PRODUCTO RECOMENDADO">
              {(pr.mezcla || []).map(m => <KV key={m.recamaras} k={m.tipologia} v={`${m.pct}% · ${m.m2_promedio} m²`} />)}
              {(!pr.mezcla || pr.mezcla.length === 0) && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin dato suficiente.</div>}
            </Sec>
            <SimuladorPalancas />
            <Sec title="OFERTA / COMPETENCIA">
              <KV k="Proyectos en la colonia" v={of.proyectos ?? 0} /><KV k="Unidades disponibles" v={of.unidades_disponibles ?? 0} /><KV k="Rango de precios" v={of.precio_desde ? `${money(of.precio_desde)} – ${money(of.precio_hasta)}` : '—'} />
            </Sec>
            {s.absorcion && (
              <Sec title="ABSORCIÓN POR COHORTE">
                {(s.absorcion.curva || []).map(c => (
                  <KV key={c.cohorte} k={`${c.cohorte} · ${c.proyectos} proy`} v={`${c.absorcion_pct}% vendido${c.meses_para_agotar ? ` · agota en ${c.meses_para_agotar} meses` : ''}`} tone={c.absorcion_pct >= 50 ? '#22C55E' : 'var(--cream)'} />
                ))}
                {(s.absorcion.curva || []).length === 0 && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin comparables aún en la zona.</div>}
                {(s.absorcion.comparables || []).length > 0 && (
                  <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                    Comparables: {s.absorcion.comparables.slice(0, 4).map(c => `${c.nombre} (${c.absorcion_pct}%)`).join(' · ')}
                  </div>
                )}
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>◐ {s.absorcion.lectura}</div>
              </Sec>
            )}
            {s.amenidades && (
              <Sec title="AMENIDADES QUE PAGAN (DESEO + PRECIO)">
                {(s.amenidades.vale_la_pena || []).slice(0, 6).map(a => (
                  <KV key={a.amenidad} k={a.amenidad}
                    v={`${a.deseo_pct}% la pide${a.impacto_precio_pct != null ? ` · ${a.impacto_precio_pct > 0 ? '+' : ''}${a.impacto_precio_pct}% precio` : ''} · ${a.veredicto}`}
                    tone={(a.veredicto || '').startsWith('Constrúyela') ? '#22C55E' : 'var(--cream)'} />
                ))}
                {(s.amenidades.vale_la_pena || []).length === 0 && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>◐ {s.amenidades.lectura}</div>}
              </Sec>
            )}
            <Sec title="ZONA Y QUÉ LE FALTA">
              <KV k="Tier" v={zo.tier || '—'} />
              <KV k="Densidad de servicios" v={zo.servicios?.densidad_km2 ? `${Math.round(zo.servicios.densidad_km2)} negocios/km²` : '—'} />
              {(zo.que_le_falta?.faltan || []).length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--cream-3)', marginBottom: 4 }}>Giros sub-atendidos (oportunidad de comercio):</div>
                  {zo.que_le_falta.faltan.map(f => <KV key={f.giro} k={f.giro} v={`tienes ${f.tienes} · ${f.nivel}`} tone="#E2982E" />)}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>◐ {zo.que_le_falta?.lectura || 'Sin giros sub-atendidos detectados.'}</div>
              )}
            </Sec>
            {s.inversionista && (
              <Sec title="PARA INVERSIONISTA + COMERCIO PB">
                {s.inversionista.rendimiento && (
                  <>
                    <KV k="Cap rate" v={`${s.inversionista.rendimiento.cap_rate_pct}%`} />
                    <KV k="IRR (5 años)" v={`${s.inversionista.rendimiento.irr_pct}%`} tone="#22C55E" />
                    {s.inversionista.rendimiento.renta_mensual_estimada ? <KV k="Renta estimada/mes" v={`$${Number(s.inversionista.rendimiento.renta_mensual_estimada).toLocaleString('es-MX')}`} /> : null}
                  </>
                )}
                <KV k="Plusvalía base/año" v={s.inversionista.plusvalia_anual_pct != null ? `${s.inversionista.plusvalia_anual_pct}%` : '—'} />
                <KV k="Rentar a" v={s.inversionista.perfil_inquilino?.perfil || '—'} />
                <KV k="Comercio en PB" v={s.inversionista.comercio_pb?.recomendacion || '—'} tone={(s.inversionista.comercio_pb?.recomendacion || '').startsWith('Sí') ? '#22C55E' : 'var(--cream)'} />
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>◐ {s.inversionista.comercio_pb?.razon}</div>
              </Sec>
            )}
            {s.tono_marketing && (
              <Sec title="TONO DE MARKETING (A QUIÉN LE HABLAS)">
                <KV k="Comprador dominante" v={s.tono_marketing.dominante?.nombre || '—'} tone="#a5b4fc" />
                <KV k="Tono sugerido" v={s.tono_marketing.tono_marketing || '—'} />
                {s.tono_marketing.dominante?.enfoque && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>Enfoque: {s.tono_marketing.dominante.enfoque}</div>}
                <KV k="Comprador alterno" v={s.tono_marketing.alterna?.nombre || '—'} />
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 6 }}>→ {s.tono_marketing.recomendacion}</div>
              </Sec>
            )}
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{data.fuente}</div>
          </>
        );
      })()}

      {/* ─── Modo Punto + Radio ─── */}
      {mode === 'radio' && !point && <div style={{ padding: 50, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Escribe una dirección para generar el estudio de la microzona.</div>}
      {mode === 'radio' && radioLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Generando microzona…</div>}
      {mode === 'radio' && radioData && !radioLoading && (() => {
        const r = radioData;
        if (r.oculto) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>◐ {r.lectura}</div>;
        const dr = r.demanda_real || {}; const dp = r.demanda_potencial || {}; const of = r.oferta || {};
        return (
          <>
            <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0 }}>Microzona · {radioM} m</h2>
                <Badge tone="brand">{r.n_colonias} colonias</Badge>
                <Badge tone={dr.representativa ? 'ok' : 'neutral'}>{dr.representativa ? 'Demanda representativa' : 'Demanda preliminar'}</Badge>
              </div>
              {point?.label && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 6 }}>{point.label}</div>}
              {(r.veredicto || []).map((v, i) => <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', padding: '3px 0' }}>· {v}</div>)}
            </Card>
            <Sec title="DEMANDA REAL AGREGADA (BÚSQUEDAS)">
              <KV k="Búsquedas en el radio" v={num(dr.demanda_total)} tone={dr.representativa ? '#22C55E' : 'var(--cream-3)'} />
              {(dr.segmentos || []).slice(0, 5).map(seg => <KV key={seg.segmento} k={seg.label} v={seg.demanda} />)}
              {(dr.segmentos || []).length === 0 && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Aún sin búsquedas representativas — se usa el potencial demográfico.</div>}
            </Sec>
            <Sec title="DEMANDA POTENCIAL AGREGADA (EPRAV)">
              <KV k="Población" v={num(dp.poblacion)} /><KV k="Familias/año" v={num(dp.demanda_anual_total)} /><KV k="Buscarían vertical" v={num(dp.demanda_vertical)} /><KV k="Hueco (GAP)" v={num(dp.gap_vertical)} tone={dp.gap_vertical > 0 ? '#22C55E' : 'var(--cream)'} /><KV k="Captura objetivo" v={num(dp.captura_objetivo)} tone="#a5b4fc" />
            </Sec>
            <Sec title="OFERTA / COMPETENCIA AGREGADA">
              <KV k="Proyectos en el radio" v={of.proyectos ?? 0} /><KV k="Unidades disponibles" v={of.unidades_disponibles ?? 0} /><KV k="Rango de precios" v={of.precio_desde ? `${money(of.precio_desde)} – ${money(of.precio_hasta)}` : '—'} />
            </Sec>
            <Sec title={`COLONIAS EN EL RADIO (${r.colonias.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.colonias.slice(0, 30).map(c => (
                  <span key={c.id} style={{ fontFamily: 'DM Sans', fontSize: 11, padding: '3px 9px', borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid var(--border)', color: 'var(--cream-2)' }}>{c.name} · {c.dist_m}m</span>
                ))}
              </div>
            </Sec>
            {r.absorcion && (r.absorcion.curva || []).length > 0 && (
              <Sec title="ABSORCIÓN POR COHORTE (AGREGADA)">
                {r.absorcion.curva.map(c => (
                  <KV key={c.cohorte} k={`${c.cohorte} · ${c.proyectos} proy`} v={`${c.absorcion_pct}% vendido${c.meses_para_agotar ? ` · agota en ${c.meses_para_agotar} meses` : ''}`} tone={c.absorcion_pct >= 50 ? '#22C55E' : 'var(--cream)'} />
                ))}
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>◐ {r.absorcion.lectura}</div>
              </Sec>
            )}
            {(r.que_le_falta || []).length > 0 && (
              <Sec title="QUÉ LE FALTA A LA MICROZONA">
                {r.que_le_falta.map(f => <KV key={f.giro} k={f.giro} v={`falta en ${f.colonias_sin} colonias`} tone="#E2982E" />)}
              </Sec>
            )}
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{r.fuente}</div>
          </>
        );
      })()}
      <style>{`@media print { .no-print, nav, aside, header { display: none !important; } }`}</style>
    </DeveloperLayout>
  );
}
