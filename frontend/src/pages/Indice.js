/*
 *  EL ÍNDICE DMX — el benchmark público del mercado inmobiliario CDMX (jugada de autoridad, founder).
 *  Nivel del Índice de Mercado DMX (obra+absorción+gestión, foto diaria) + el benchmark de precio CDMX
 *  (mediana $/m² · plusvalía). Serie real que ya se acumula. Consume /api/indice.
 */
import React, { useEffect, useMemo, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const C = { bg: '#FBFAFC', ink: '#15121C', ink2: '#5B5568', faint: '#9A93A6', line: '#EFEBF4', card: '#FFF', accent: '#6D4AFF', green: '#1E9E63', amber: '#D98A00' };
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const RANGOS = [['1A', 365], ['5A', 1825], ['max', 99999]];

function Curva({ pts }) {
  if (!pts || pts.length < 2) {
    return <div style={{ fontFamily: FONT, fontSize: 13, color: C.faint, padding: '40px 0', textAlign: 'center' }}>La curva se dibuja conforme se acumulan las fotos diarias del índice.</div>;
  }
  const W = 720, H = 220, pad = 28;
  const vals = pts.map((p) => p.valor);
  const min = Math.min(...vals), max = Math.max(...vals);
  const rng = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => H - pad - ((v - min) / rng) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const up = pts[pts.length - 1].valor >= pts[0].valor;
  const stroke = up ? C.green : '#B03A3A';
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, height: 'auto', display: 'block' }}>
        <defs><linearGradient id="ig" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity="0.18" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#ig)" />
        <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].valor)} r="4" fill={stroke} />
      </svg>
    </div>
  );
}

export default function Indice({ user, onLogin }) {
  const [data, setData] = useState(null);
  const [espejo, setEspejo] = useState(null);
  const [buscado, setBuscado] = useState([]);
  const [rango, setRango] = useState('max');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/indice`).then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    fetch(`${API}/api/modelo/espejo`).then((r) => r.json())
      .then((d) => { if (alive) setEspejo(d); }).catch(() => {});
    fetch(`${API}/api/lo-mas-buscado?limit=6`).then((r) => r.json())
      .then((d) => { if (alive) setBuscado((d && d.top) || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const serie = useMemo(() => {
    const s = (data && data.serie) || [];
    const dias = RANGOS.find((r) => r[0] === rango)[1];
    if (dias >= 99999 || s.length === 0) return s;
    const cutoff = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    return s.filter((p) => p.fecha >= cutoff);
  }, [data, rango]);

  const idm = (data && data.indice_maestro) || {};
  const bench = (data && data.benchmark_cdmx) || {};
  const delta = data && data.delta_periodo;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <div style={{ background: GRAD, color: '#fff', padding: '48px 20px 40px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: 0.85, letterSpacing: '0.04em', textTransform: 'uppercase' }}>El Índice DMX</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 38, lineHeight: 1.05, margin: '8px 0 8px', letterSpacing: '-0.02em', maxWidth: 720 }}>
            El termómetro del mercado inmobiliario de la CDMX
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 16, opacity: 0.92, maxWidth: 620 }}>
            Un solo número que resume salud de obra, absorción y gestión de la ciudad — con su curva en el tiempo. La referencia contra la que se mide todo en DMX.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px 60px' }}>
        {loading ? (
          <div style={{ padding: 40, color: C.faint }}>Cargando el índice…</div>
        ) : (
          <>
            {/* Headline: nivel del índice + benchmark de precio */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 22 }}>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, fontWeight: 600 }}>Índice de Mercado DMX</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, color: C.ink }}>{idm.valor != null ? idm.valor : '—'}</span>
                  {idm.letra && <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: '#fff', background: C.accent, borderRadius: 8, padding: '2px 10px' }}>{idm.letra}</span>}
                </div>
                {delta != null && <div style={{ fontFamily: FONT, fontSize: 13, color: delta >= 0 ? C.green : '#B03A3A', fontWeight: 700, marginTop: 4 }}>{delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} pts del índice (histórico registrado)</div>}
              </div>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, fontWeight: 600 }}>Precio mediano CDMX</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 32, color: C.ink, marginTop: 6 }}>{money(bench.precio_m2_mediana)}<span style={{ fontSize: 14, color: C.faint }}>/m²</span></div>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.ink2 }}>{bench.n_colonias} colonias</div>
              </div>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, fontWeight: 600 }}>Plusvalía anual mediana</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 32, color: bench.plusvalia_mediana >= 0 ? C.green : '#B03A3A', marginTop: 6 }}>{bench.plusvalia_mediana != null ? `${bench.plusvalia_mediana > 0 ? '+' : ''}${bench.plusvalia_mediana}%` : '—'}</div>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.ink2 }}>referencia del mercado</div>
              </div>
            </div>

            {/* Curva + selector de rango */}
            <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>Curva del índice</div>
                <div style={{ display: 'flex', border: `1.5px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  {RANGOS.map(([k]) => (
                    <button key={k} onClick={() => setRango(k)} style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 700, fontSize: 12.5, background: rango === k ? C.accent : '#fff', color: rango === k ? '#fff' : C.ink2 }}>{k === 'max' ? 'Máx' : k}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}><Curva pts={serie} /></div>
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint, marginTop: 8 }}>{data && data.nota}</div>
            </div>

            {/* Espejo del modelo — transparencia radical del margen de error (2 pruebas: golden + cierres reales) */}
            {espejo && (espejo.mape_pct != null || espejo.cierres_reales) && (() => {
              const cr = espejo.cierres_reales;
              const head = cr || { mape_pct: espejo.mape_pct, dentro_10_pct: espejo.dentro_10_pct, dentro_20_pct: espejo.dentro_20_pct };
              return (
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 20 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>El espejo del modelo — nuestro margen de error</div>
                <div style={{ fontFamily: FONT, fontSize: 13.5, color: C.ink2, marginTop: 4, maxWidth: 660, lineHeight: 1.5 }}>
                  Somos el único que publica qué tan seguido le atina su modelo. {cr ? `Probado contra ${cr.n} cierres de venta REALES:` : `Probado contra ${espejo.total_casos} casos de control:`}
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 14 }}>
                  <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: C.ink }}>±{head.mape_pct}%</div><div style={{ fontSize: 12, color: C.faint }}>error promedio (MAPE)</div></div>
                  {head.dentro_10_pct != null && <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: C.green }}>{head.dentro_10_pct}%</div><div style={{ fontSize: 12, color: C.faint }}>cae a ±10% del precio real</div></div>}
                  {head.dentro_20_pct != null && <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: C.green }}>{head.dentro_20_pct}%</div><div style={{ fontSize: 12, color: C.faint }}>cae a ±20%</div></div>}
                </div>
                {cr && cr.excluidos > 0 && cr.mape_sin_recorte_pct != null && (
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.ink2, marginTop: 8 }}>Sin descartar ningún cierre: <b>±{cr.mape_sin_recorte_pct}%</b> (excluimos {cr.excluidos} de {cr.n_total} por referencia de zona dudosa).</div>
                )}
                {cr && espejo.mape_pct != null && (
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.ink2, marginTop: 6 }}>Contra dataset de control (golden): <b>±{espejo.mape_pct}%</b> en {espejo.total_casos} casos.</div>
                )}
                <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint, marginTop: 10 }}>Sin IA, pura medición. El número afina conforme entran más cierres reales.</div>
              </div>
              );
            })()}

            {/* Lo más buscado en DMX — social proof con demanda real */}
            {buscado.length > 0 && (
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 20 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>Lo más buscado en DMX ahora</div>
                <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, marginTop: 3 }}>Las colonias con más demanda real de compradores en la plataforma.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
                  {buscado.map((b, i) => (
                    <div key={b.colonia_slug || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < buscado.length - 1 ? `1px solid ${C.line}` : 'none' }}>
                      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: C.faint, width: 22 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{b.name}</span>
                        {b.alcaldia && <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint }}> · {b.alcaldia}</span>}
                      </div>
                      {b.precio_m2 && <span style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, fontVariantNumeric: 'tabular-nums' }}>{money(b.precio_m2)}/m²</span>}
                      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: C.accent, background: '#F3F0FF', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>🔥 {b.senales}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ background: GRAD, color: '#fff', borderRadius: 18, padding: '24px', marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21 }}>¿Quieres el índice de tu zona?</div>
              <div style={{ fontFamily: FONT, fontSize: 15, opacity: 0.92, marginTop: 6 }}>Compara cualquier colonia contra el mercado CDMX con el Screener y los DMX Picks IA.</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <a href="/screener" style={{ background: '#fff', color: C.accent, borderRadius: 10, padding: '11px 20px', fontFamily: HEAD, fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>Abrir Screener</a>
                <a href="/picks" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 10, padding: '11px 20px', fontFamily: HEAD, fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>Ver DMX Picks</a>
              </div>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 16, textAlign: 'center' }}>
              El Índice DMX resume datos de mercado (obra, absorción, gestión) y precio (SHF/mercado). Análisis, no asesoría de inversión.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
