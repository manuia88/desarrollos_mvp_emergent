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

      <Card style={{ marginBottom: 16 }} className="no-print">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setMode('colonia')} style={tabBtn(mode === 'colonia')}>Por Colonia</button>
          <button onClick={() => setMode('radio')} style={tabBtn(mode === 'radio')}>Por Punto + Radio</button>
          <span style={{ flex: 1 }} />
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCategoria(c.id)} style={{ ...tabBtn(categoria === c.id), padding: '8px 12px', fontSize: 12 }}>{c.label}</button>
          ))}
          {hasResult && <button onClick={() => window.print()} data-testid="estudio-pdf" style={{ ...tabBtn(false), color: 'var(--cream)' }}>Exportar a PDF</button>}
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
