/**
 * F2.12 — SuperadminTerminalMercado (page).
 * Ruta: /superadmin/terminal-mercado · Layout: SuperadminLayout (sección INTELIGENCIA).
 * "La Terminal de Mercado CDMX": la cara tipo Bloomberg, k-anónima, que fusiona la OFERTA
 * (cubo de todos los devs) + 3 ÍNDICES VENDIBLES (Obra · Absorción · Gestión) + la DEMANDA
 * real (Grafo del Comprador) + el APRENDIZAJE (Cerebro del Mercado). Es el consumidor de todo
 * F2 y la cara del producto de datos (data licensing). Lee /api/superadmin/terminal-mercado. Cero deuda.
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getTerminalMercado, getBancabilidadRanking, getIndicesHistorial, snapshotIndices } from '../../api/superadmin';

const LETRA_COLOR = { 'A+': '#22C55E', 'A': '#22C55E', 'B+': '#84CC16', 'B': '#84CC16', 'C+': '#E2982E', 'C': '#E2982E', 'D': '#ef4444' };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`);

export default function SuperadminTerminalMercado({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [banca, setBanca] = useState(null);
  const [hist, setHist] = useState(null);
  const [snapBusy, setSnapBusy] = useState(false);

  const loadHist = () => getIndicesHistorial(90).then(setHist).catch(() => setHist(null));
  useEffect(() => {
    getTerminalMercado(8).then(setData).catch(() => setErr(true));
    getBancabilidadRanking(10).then(setBanca).catch(() => setBanca(null));
    loadHist();
  }, []);

  const guardarFoto = async () => {
    setSnapBusy(true);
    try { await snapshotIndices(); await loadHist(); } catch { /* noop */ } finally { setSnapBusy(false); }
  };

  const note = (t) => (
    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', padding: '24px 0', textAlign: 'center' }}>{t}</div>
  );
  const cardStyle = { marginBottom: 14, padding: 16, borderRadius: 14, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)' };
  const h = { fontFamily: 'DM Sans, sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 10 };

  const of = data?.oferta || {};
  const apr = data?.aprendizaje || {};

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: '8px 0 12px' }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Inteligencia · Producto de datos</div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '4px 0 2px' }}>Terminal de Mercado CDMX</h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', margin: 0, maxWidth: 820 }}>
          La cara vendible del Modelo del Mundo: junta la oferta de todos los desarrollos (sin revelar quién es quién), los 3 índices que se pueden licenciar, la demanda real por colonia y cómo aprende el mercado. Todo agregado y anónimo.
        </p>
      </div>

      {err && note('No se pudo cargar.')}
      {!err && !data && note('Cargando…')}

      {data && (
        <>
          {/* ── Índice maestro + estado publicable ── */}
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', background: 'linear-gradient(140deg, rgba(99,102,241,0.10), transparent)' }}>
            <div>
              <div style={h}>Índice de Mercado DMX (maestro)</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, color: 'var(--cream)' }}>{data.indice_maestro?.valor ?? '—'}</span>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: LETRA_COLOR[data.indice_maestro?.letra] || 'var(--cream-2)' }}>{data.indice_maestro?.letra || ''}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: data.publicable ? '#22C55E' : '#E2982E', fontWeight: 600 }}>
                {data.publicable ? '● Publicable / vendible' : '○ Aún no publicable'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>
                {fmt(data.n_proyectos)} proyectos · k-anónimo ≥ {data.k_anonimato}
              </div>
            </div>
          </div>

          {/* ── 3 índices vendibles ── */}
          <div style={cardStyle}>
            <div style={h}>Los 3 índices que se venden</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {(data.indices_vendibles || []).map((i) => (
                <div key={i.key} style={{ padding: 12, borderRadius: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{i.nombre}</span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: LETRA_COLOR[i.letra] || 'var(--cream-2)' }}>{i.valor} · {i.letra}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>{i.que_mide}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6 }}>→ {i.lectura}</div>
                  {i.es_estimado && <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(245,158,11,0.8)', marginTop: 4 }}>◐ Estimado · pocos proyectos</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── Curva histórica de los índices (F5.3) ── */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={h}>Índices vivos · curva en el tiempo</div>
              <button onClick={guardarFoto} disabled={snapBusy}
                style={{ padding: '5px 10px', borderRadius: 8, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'rgba(var(--cream-rgb),0.04)', color: 'var(--cream)', opacity: snapBusy ? 0.6 : 1 }}>
                {snapBusy ? 'Guardando…' : '📸 Guardar Foto de Hoy'}
              </button>
            </div>
            {(() => {
              const serie = hist?.serie || [];
              if (serie.length < 2) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 6 }}>◐ {serie.length === 1 ? 'Primer punto guardado — la curva crece con cada foto diaria (cron 03:00).' : (hist?.lectura || 'Aún sin historial.')}</div>;
              const vals = serie.map(s => s.indice_maestro || 0);
              const min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 1;
              const W = 320, H = 44;
              const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / rng) * H}`).join(' ');
              const first = vals[0], last = vals[vals.length - 1], d = Math.round((last - first) * 10) / 10;
              return (
                <div style={{ marginTop: 8 }}>
                  <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
                    <polyline points={pts} fill="none" stroke="#6366F1" strokeWidth="2" />
                  </svg>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
                    Maestro: {first} → <b style={{ color: d >= 0 ? '#22C55E' : '#ef4444' }}>{last} ({d >= 0 ? '+' : ''}{d})</b> · {serie.length} fotos
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Oferta (cubo) ── */}
          <div style={cardStyle}>
            <div style={h}>Oferta del mercado (todos los desarrollos · agregado)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {[
                ['Proyectos', fmt(of.projects_count)],
                ['Unidades totales', fmt(of.units_total)],
                ['Disponibles', fmt(of.units_available)],
                ['Vendidas', fmt(of.units_sold)],
                ['Precio prom. m²', money(of.avg_price_per_m2)],
                ['Días en mercado', of.days_on_market_avg != null ? `${of.days_on_market_avg}` : '—'],
                ['Conversión', of.conversion_rate != null ? `${of.conversion_rate}%` : '—'],
                ['Leads', fmt(of.leads_count)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{k}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Demanda real (Grafo) ── */}
          <div style={cardStyle}>
            <div style={h}>Demanda real por colonia (Grafo del Comprador · anónimo)</div>
            {(data.demanda?.colonias || []).length === 0 && note('Aún sin demanda representativa — se llena con más búsquedas reales.')}
            {(data.demanda?.colonias || []).map((c, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{c.colonia}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                  {fmt(c.demanda_total)} búsquedas{c.segmento_dominante ? ` · ${c.segmento_dominante}` : ''}
                </span>
              </div>
            ))}
          </div>

          {/* ── Aprendizaje (Cerebro del Mercado) ── */}
          {apr && (
            <div style={cardStyle}>
              <div style={h}>Cómo aprende el mercado (Cerebro)</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                {apr.predicciones?.resueltas || 0} predicciones calificadas · {apr.predicciones?.abiertas || 0} esperando resultado.
              </div>
              {(apr.lecciones || []).slice(0, 3).map((l, i) => (
                <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: '4px 0' }}>· {l.text || l}</div>
              ))}
            </div>
          )}

          {/* ── Score de Bancabilidad (ranking · F5.1) ── */}
          {banca && (banca.ranking || []).length > 0 && (
            <div style={cardStyle}>
              <div style={h}>Score de Bancabilidad · qué tan financiable es cada proyecto (A–F)</div>
              {(banca.ranking || []).slice(0, 10).map((b, i) => (
                <div key={b.dev_id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{b.nombre || b.dev_id}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                    abs {b.componentes?.absorcion_pct ?? '—'}% · venta esp {b.componentes?.prob_venta_esperada_pct ?? '—'}%
                    <b style={{ color: LETRA_COLOR[b.letra] || 'var(--cream)', marginLeft: 8 }}>{b.bancabilidad} · {b.letra}</b>
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 8 }}>◐ Calificación A–F por proyecto (absorción + zona + venta esperada). Producto de datos para bancos/fondos.</div>
            </div>
          )}

          {/* ── Qué es vendible (data licensing) ── */}
          <div style={cardStyle}>
            <div style={h}>Productos de datos vendibles</div>
            {(data.vendible || []).map((v, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{v.producto}</div>
                  {v.endpoint && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a5b4fc', marginTop: 2 }}>{v.endpoint}{v.tier ? ` · ${v.tier}` : ''}</div>}
                </div>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>bundle: {v.bundle}</span>
              </div>
            ))}
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 8 }}>◐ Se entregan por la API v1 (api-key + k-anónimo + registro de uso), según el plan del cliente.</div>
          </div>

          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>◐ {data.lectura} · {data.fuente}</div>
        </>
      )}
    </SuperadminLayout>
  );
}
