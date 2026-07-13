/**
 * CubeEquilibrioView — GOD-VIEW del dato real 4S en el Hub de Mercado (superadmin ve TODO exacto).
 * Tres capas: (1) Radar de Oportunidad (dónde falta producto), (2) Cobertura ganada — colonias cuyo
 * índice de absorción pasó de 'estimado' a 'real', (3) competidores por estudio con nombre + absorción
 * exacta (aquí SÍ, porque es la lente superadmin; fuera de aquí se agrega/anonimiza vía cube_lens).
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, AlertCircle, CheckCircle2, Building2, Wallet, Leaf, Scale, Boxes } from 'lucide-react';
import { getMarket4sOverview, loadMarket4s, getMarket4sConsumidor, getCubo4sCatalogo, getCubo4sComparar, getCubo4sNano, getCubo4sDimensiones } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const int = (v) => (v == null ? '—' : nf.format(v));
const pct = (v) => (v == null ? '—' : `${v}%`);
const money = (v) => (v == null ? '—' : `$${nf.format(v)}`);

const SECCIONES = [
  ['mercado', 'Mercado', TrendingUp],
  ['consumidor', 'Consumidor', Wallet],
  ['plusvalia', 'Plusvalía', Scale],
  ['cubo', 'Cubo 4S', Boxes],
];

export default function CubeEquilibrioView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [estudioAbierto, setEstudioAbierto] = useState(null);
  const [seccion, setSeccion] = useState('mercado');
  const [consumidor, setConsumidor] = useState(null);   // WTP + producto + verde + plusvalía (lazy)

  const cargar = () => {
    setErr(null);
    return getMarket4sOverview().then(setData).catch((e) => setErr(e?.message || 'No se pudo cargar.'));
  };
  useEffect(() => { let alive = true; getMarket4sOverview().then((d) => alive && setData(d)).catch((e) => alive && setErr(e?.message || 'No se pudo cargar.')); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (seccion === 'mercado' || consumidor) return undefined;
    let alive = true;
    getMarket4sConsumidor().then((d) => alive && setConsumidor(d)).catch(() => alive && setConsumidor(null));
    return () => { alive = false; };
  }, [seccion, consumidor]);

  const recargar4s = async () => {
    setBusy(true);
    try { await loadMarket4s(); await cargar(); } catch (e) { setErr(e?.message || 'No se pudo recargar.'); } finally { setBusy(false); }
  };

  if (err) return <div style={box('#ef4444')}><AlertCircle size={15} /> {err}</div>;
  if (!data) return <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando inteligencia 4S…</div>;

  const radar = data.gap_radar || {};
  const top = radar.top || [];
  const cob = data.cobertura_iab_real || {};
  const barColor = (s) => (s >= 80 ? '#4ADE80' : s >= 50 ? '#58a6ff' : '#8b949e');
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.9)', padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const tdR = { ...td, textAlign: 'right' };

  return (
    <div data-testid="cube-equilibrio-view">
      {/* Encabezado + KPIs */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} color="var(--theme)" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Equilibrio & Demanda 4S</span>
            <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5, padding: '2px 9px', borderRadius: 9999, color: '#4ADE80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)' }}>DATO REAL</span>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.7)', margin: '6px 0 0' }}>
            {data.n_proyectos} proyectos competidores reales · {data.n_estudios} estudios · alimenta absorción, índices y precio de equilibrio.
          </p>
        </div>
        <button onClick={recargar4s} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <RefreshCw size={14} className={busy ? 'spin' : ''} /> {busy ? 'Recargando…' : 'Recargar 4S'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi label="Colonias con absorción REAL" value={cob.n_colonias} icon={<CheckCircle2 size={14} color="#4ADE80" />} hint="antes 'estimado'" />
        <Kpi label="Oportunidades detectadas" value={radar.n_oportunidades} hint="zonas × segmento" />
        <Kpi label="Proyectos comparables" value={data.n_proyectos} hint="dato de mercado" />
      </div>

      {/* Sub-secciones: Mercado (oferta/gap) · Consumidor (WTP/producto/verde) · Plusvalía */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {SECCIONES.map(([k, label, Icon]) => (
          <button key={k} data-testid={`eq4s-sec-${k}`} onClick={() => setSeccion(k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, background: seccion === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)', border: `1px solid ${seccion === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`, color: seccion === k ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {seccion === 'consumidor' && <SeccionConsumidor c={consumidor} />}
      {seccion === 'plusvalia' && <SeccionPlusvalia c={consumidor} />}
      {seccion === 'cubo' && <SeccionCubo4s />}

      {seccion === 'mercado' && <>
      {/* 1) Radar de Oportunidad */}
      <Sec title="Radar de Oportunidad · ¿dónde falta producto?">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Segmento</th><th style={th}>Zona</th>
              <th style={{ ...th, textAlign: 'right' }}>Hueco 3a</th>
              <th style={{ ...th, textAlign: 'right' }}>Se agota</th>
              <th style={{ ...th, minWidth: 120 }}>Oportunidad</th>
            </tr></thead>
            <tbody>
              {top.map((f) => (
                <tr key={`${f.estudio}-${f.segmento}-${f.rank}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ ...td, color: 'rgba(240,235,224,0.5)' }}>{f.rank}</td>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--cream)' }}>{f.segmento}</td>
                  <td style={td}>{Array.isArray(f.zona) ? f.zona.slice(0, 3).join(', ') : (f.zona || f.estudio)}</td>
                  <td style={tdR}>{int(f.gap_vertical_3anos)}</td>
                  <td style={{ ...tdR, color: 'rgba(240,235,224,0.6)' }}>{f.meses_para_agotar_hueco != null ? `${f.meses_para_agotar_hueco} m` : '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', minWidth: 60 }}>
                        <div style={{ width: `${f.indice_oportunidad}%`, height: '100%', borderRadius: 4, background: barColor(f.indice_oportunidad) }} />
                      </div>
                      <b style={{ color: barColor(f.indice_oportunidad), minWidth: 22, textAlign: 'right' }}>{f.indice_oportunidad}</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      {/* 2) Cobertura ganada (estimado→real) */}
      <Sec title={`Cobertura ganada · ${cob.n_colonias || 0} colonias pasaron de estimado → REAL`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(cob.detalle || []).map((c) => (
            <span key={c.colonia} title={`${c.n_proyectos} proyectos · estudio ${c.estudio}`} style={{ fontFamily: 'DM Sans', fontSize: 11.5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#bbf7d0' }}>
              {tc(c.colonia)} · {pct(Math.round(100 * (c.sold || 0) / (c.total || 1)))}
            </span>
          ))}
          {!(cob.detalle || []).length && <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.6)' }}>Aún sin colonias con ≥3 competidores 4S.</span>}
        </div>
      </Sec>

      {/* 3) Competidores por estudio (god-view: nombres + absorción exacta) */}
      <Sec title="Competidores por estudio (vista superadmin · exacta)">
        {(data.estudios || []).map((e) => {
          const abierto = estudioAbierto === e.estudio;
          return (
            <div key={e.estudio} style={{ marginBottom: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <button onClick={() => setEstudioAbierto(abierto ? null : e.estudio)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', color: 'var(--cream)', textAlign: 'left' }}>
                <Building2 size={15} color="var(--theme)" />
                <b style={{ fontFamily: 'DM Sans', fontSize: 13 }}>{tc(e.estudio)}</b>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{e.n_proyectos} proyectos · absorción {pct(e.absorcion_pct)}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>{abierto ? 'Ocultar' : 'Ver'}</span>
              </button>
              {abierto && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={th}>Proyecto</th><th style={th}>Clasificación</th>
                      <th style={{ ...th, textAlign: 'right' }}>Precio</th>
                      <th style={{ ...th, textAlign: 'right' }}>$/m²</th>
                      <th style={{ ...th, textAlign: 'right' }}>Vend./Total</th>
                      <th style={{ ...th, textAlign: 'right' }}>Absorción</th>
                      <th style={{ ...th, textAlign: 'right' }}>Vel/mes</th>
                    </tr></thead>
                    <tbody>
                      {e.comps.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ ...td, fontWeight: 600 }}>{c.proyecto}</td>
                          <td style={{ ...td, color: 'rgba(240,235,224,0.7)' }}>{c.clasificacion || '—'}</td>
                          <td style={tdR}>{money(c.precio_promedio)}</td>
                          <td style={tdR}>{money(c.precio_m2)}</td>
                          <td style={tdR}>{int(c.unidades_vendidas)}/{int(c.unidades_totales)}</td>
                          <td style={tdR}>{pct(c.absorcion_pct)}</td>
                          <td style={tdR}>{c.velocidad_mensual_real ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </Sec>
      </>}
    </div>
  );
}

// ── Consumidor: WTP (cuánto paga) + Producto ideal (qué quiere) + Score verde ──
function SeccionConsumidor({ c }) {
  if (!c) return <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando inteligencia del consumidor…</div>;
  const w = c.wtp || {};
  const p = c.producto_ideal || {};
  const v = c.score_verde || {};
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.9)', padding: '8px 12px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const rango = (r, pre = '$') => (r ? `${pre}${nf.format(r.min)}–${pre === '$' ? '' : ''}${nf.format(r.max)}` : '—');
  const chip = (label, val) => (
    <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, padding: '5px 11px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.85)' }}>
      {label}: <b style={{ color: 'var(--cream)' }}>{val}</b>
    </span>
  );
  const specLabel = (s) => (s && s.opcion != null ? `${String(s.opcion).replace(/_/g, ' ')} (${s.pct ? `${s.pct.min}–${s.pct.max}%` : ''})` : '—');
  return (
    <>
      <Sec title="Cuánto paga la gente (WTP · por zona)">
        {w.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: '0 0 10px' }}>{w.lectura}</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Zona</th>
              <th style={{ ...th, textAlign: 'right' }}>Tope mantenimiento</th>
              <th style={{ ...th, textAlign: 'right' }}>$/m² que tolera</th>
              <th style={{ ...th, textAlign: 'right' }}>vs benchmark DMX</th>
              <th style={{ ...th, textAlign: 'right' }}>Elevautos decide</th>
              <th style={{ ...th, textAlign: 'right' }}>Acepta +8% precio</th>
            </tr></thead>
            <tbody>
              {(w.zonas || []).map((z) => (
                <tr key={z.zona} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{tc(z.zona)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{rango(z.mantenimiento_tope_mxn)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{z.tarifa_tope_m2 != null ? `$${z.tarifa_tope_m2}` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: (z.vs_benchmark_dmx || 0) >= 0 ? '#4ADE80' : '#f87171' }}>{z.vs_benchmark_dmx != null ? `${z.vs_benchmark_dmx > 0 ? '+' : ''}${z.vs_benchmark_dmx}` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{pct(z.elevautos_decisivo_pct)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{pct(z.tolerancia_precio_mas_8pct_si_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {chip('Enganche típico', pct(w.enganche_mas_comun_pct))}
          {chip('Descuento que convierte', pct(w.descuento_mas_atractivo_pct))}
          {w.bodega_compra_mxn && chip('Bodega (compra)', rango(w.bodega_compra_mxn))}
          {w.cajon_extra_precio_alternativo_mxn && chip('Cajón extra', rango(w.cajon_extra_precio_alternativo_mxn))}
        </div>
      </Sec>

      <Sec title="Producto ideal (qué pide el mercado)">
        {p.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: '0 0 10px' }}>{p.lectura}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chip('Recámaras', specLabel((p.spec || {}).recamaras))}
          {chip('Baños', specLabel((p.spec || {}).banos))}
          {chip('Cocina', specLabel((p.spec || {}).cocina))}
          {chip('Maximizar', specLabel((p.spec || {}).area_a_maximizar))}
          {chip('Espacio extra', specLabel((p.spec || {}).espacio_adicional))}
          {p.intencion_habitar_pct && chip('Para habitar', `${p.intencion_habitar_pct.min}–${p.intencion_habitar_pct.max}%`)}
          {p.intencion_inversion_pct && chip('Inversión', `${p.intencion_inversion_pct.min}–${p.intencion_inversion_pct.max}%`)}
        </div>
      </Sec>

      <Sec title="Score verde (sustentabilidad que decide la compra)">
        {v.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: '0 0 10px' }}>{v.lectura}</p>}
        {(v.ranking || []).map((r) => (
          <div key={r.factor} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <Leaf size={12} color={r.pct_mid >= 60 ? '#4ADE80' : 'rgba(240,235,224,0.4)'} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', minWidth: 210 }}>{tc(r.factor)}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${Math.min(100, r.pct_mid)}%`, height: '100%', borderRadius: 4, background: r.pct_mid >= 60 ? '#4ADE80' : '#8b949e' }} />
            </div>
            <b style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: r.pct_mid >= 60 ? '#4ADE80' : 'rgba(240,235,224,0.7)', minWidth: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pct_mid}%</b>
          </div>
        ))}
      </Sec>
    </>
  );
}

// ── Plusvalía validada: avalúo vs reventa vs obra nueva ──
function SeccionPlusvalia({ c }) {
  if (!c) return <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando plusvalía validada…</div>;
  const pl = c.plusvalia || {};
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.9)', padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  return (
    <Sec title="Plusvalía validada · avalúo vs reventa vs obra nueva (dato real)">
      {pl.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: '0 0 10px' }}>{pl.lectura}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Estudio</th>
            <th style={th}>Avalúo $/m²</th>
            <th style={th}>Reventa $/m²</th>
            <th style={th}>Obra nueva $/m²</th>
            <th style={th}>Prima s/ avalúo</th>
            <th style={th}>Premium nuevo</th>
            <th style={{ ...th, textAlign: 'left' }}>Veredicto</th>
          </tr></thead>
          <tbody>
            {(pl.estudios || []).map((e) => (
              <tr key={e.estudio} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{tc(e.estudio)}</td>
                <td style={td}>{money(e.avaluo_m2)}</td>
                <td style={td}>{money(e.reventa_m2)}</td>
                <td style={td}>{money(e.obra_nueva_m2)}</td>
                <td style={{ ...td, fontWeight: 700, color: (e.prima_mercado_vs_avaluo_pct || 0) >= 20 ? '#4ADE80' : 'var(--cream)' }}>{pct(e.prima_mercado_vs_avaluo_pct)}</td>
                <td style={td}>{pct(e.premium_obra_nueva_pct)}</td>
                <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', maxWidth: 280, color: 'rgba(240,235,224,0.75)' }}>{e.veredicto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)', marginTop: 10 }}>
        Prima s/ avalúo = cuánto paga el mercado real por encima del avalúo bancario. Premium nuevo = cuánto más vale obra nueva vs reventa. Muestra: n reventas/avalúos por estudio 4S.
      </p>
    </Sec>
  );
}

// ── Cubo 4S: explorador de átomos macro→nano (2,200+ hechos de los 4 estudios) ──
function SeccionCubo4s() {
  const [cat, setCat] = useState(null);
  const [dims, setDims] = useState(null);
  const [sel, setSel] = useState('producto.cocina_pct');   // pregunta seleccionada (macro)
  const [cmp, setCmp] = useState(null);
  const [nanoEstudio, setNanoEstudio] = useState('puente_alvarado');
  const [nanoEtapa, setNanoEtapa] = useState('pareja_joven_hijos_0_10');
  const [nanoData, setNanoData] = useState(null);

  useEffect(() => {
    let alive = true;
    getCubo4sCatalogo().then((d) => alive && setCat(d)).catch(() => setCat(null));
    getCubo4sDimensiones().then((d) => alive && setDims(d)).catch(() => setDims(null));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!sel) return undefined;
    let alive = true;
    const [tema, ...rest] = sel.split('.');
    getCubo4sComparar(tema, rest.join('.')).then((d) => alive && setCmp(d)).catch(() => setCmp(null));
    return () => { alive = false; };
  }, [sel]);
  useEffect(() => {
    if (!nanoEstudio || !nanoEtapa) return undefined;
    let alive = true;
    getCubo4sNano(nanoEstudio, nanoEtapa).then((d) => alive && setNanoData(d)).catch(() => setNanoData(null));
    return () => { alive = false; };
  }, [nanoEstudio, nanoEtapa]);

  if (!cat) return <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando átomos 4S…</div>;
  if (!cat.n_atomos) return <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Aún sin átomos cargados — usa "Recargar 4S" o reinicia el backend (se cargan solos al arranque).</div>;

  // menú de preguntas (tema.pregunta únicos entre estudios)
  const preguntas = [...new Set((cat.estudios || []).flatMap((e) => e.temas.flatMap((t) => t.preguntas.map((p) => `${t.tema}.${p.pregunta}`))))].sort();
  const estudios = (cat.estudios || []).map((e) => e.estudio);
  const etapas = (dims && dims.etapa_vida) || [];
  const selStyle = { padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, maxWidth: 320 };
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.9)', padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const fmtV = (v) => (v == null ? '—' : (Array.isArray(v) ? `${nf.format(v[0])}–${nf.format(v[1])}` : nf.format(v)));

  return (
    <>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.7)', margin: '0 0 14px' }}>
        <b style={{ color: 'var(--cream)' }}>{nf.format(cat.n_atomos)} átomos</b> de los 4 estudios — cada número con zona, tema, pregunta, opción, corte y página fuente. Macro: compara zonas. Nano: baja hasta una etapa de vida.
      </p>

      <Sec title="Lente MACRO · la misma pregunta en las 4 zonas">
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={selStyle} data-testid="cubo4s-pregunta">
          {preguntas.map((p) => <option key={p} value={p}>{tc(p.replace('.', ' · ').replace(/_pct$/, ''))}</option>)}
        </select>
        {cmp && cmp.filas && (
          <>
            {cmp.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: cmp.zonas_difieren ? '#fbbf24' : 'rgba(240,235,224,0.7)', margin: '10px 0' }}>{cmp.lectura}</p>}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>Opción</th>
                  {cmp.estudios.map((e) => <th key={e} style={th}>{tc(e)}</th>)}
                </tr></thead>
                <tbody>
                  {cmp.filas.map((f) => (
                    <tr key={f.opcion} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{tc(f.opcion)}</td>
                      {cmp.estudios.map((e) => {
                        const esTop = cmp.top_por_estudio[e] && cmp.top_por_estudio[e].opcion === f.opcion;
                        return <td key={e} style={{ ...td, color: esTop ? '#4ADE80' : td.color, fontWeight: esTop ? 700 : 400 }}>{fmtV(f[e])}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Sec>

      <Sec title="Lente NANO · todo lo que el estudio sabe de una etapa de vida">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={nanoEstudio} onChange={(e) => setNanoEstudio(e.target.value)} style={selStyle} data-testid="cubo4s-nano-estudio">
            {estudios.map((e) => <option key={e} value={e}>{tc(e)}</option>)}
          </select>
          <select value={nanoEtapa} onChange={(e) => setNanoEtapa(e.target.value)} style={selStyle} data-testid="cubo4s-nano-etapa">
            {etapas.map((e) => <option key={e} value={e}>{tc(e)}</option>)}
          </select>
        </div>
        {nanoData && (
          <>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.75)', margin: '0 0 10px' }}>
              {nanoData.n_atomos} átomos · {nanoData.lectura}
            </p>
            {Object.entries(nanoData.por_pregunta || {}).map(([preg, items]) => (
              <div key={preg} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', marginBottom: 4 }}>{tc(preg.replace('.', ' · '))}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map((it, i) => (
                    <span key={i} title={`pág. ${it.pagina || '—'}`} style={{ fontFamily: 'DM Sans', fontSize: 11.5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.85)' }}>
                      {tc(it.opcion)}: <b style={{ color: 'var(--cream)' }}>{fmtV(it.valor ?? it.rango)}{it.unidad === 'pct' ? '%' : ''}</b>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Sec>
    </>
  );
}

function Kpi({ label, value, hint, icon }) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: 150, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.55)' }}>{icon}{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', marginTop: 4 }}>{value == null ? '—' : nf.format(value)}</div>
      {hint && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)' }}>{hint}</div>}
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

const box = (c) => ({ padding: '14px 16px', borderRadius: 12, background: `${c}14`, border: `1px solid ${c}40`, color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 });
