/**
 * CubeEquilibrioView — GOD-VIEW del dato real 4S en el Hub de Mercado (superadmin ve TODO exacto).
 * Tres capas: (1) Radar de Oportunidad (dónde falta producto), (2) Cobertura ganada — colonias cuyo
 * índice de absorción pasó de 'estimado' a 'real', (3) competidores por estudio con nombre + absorción
 * exacta (aquí SÍ, porque es la lente superadmin; fuera de aquí se agrega/anonimiza vía cube_lens).
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { getMarket4sOverview, loadMarket4s } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const int = (v) => (v == null ? '—' : nf.format(v));
const pct = (v) => (v == null ? '—' : `${v}%`);
const money = (v) => (v == null ? '—' : `$${nf.format(v)}`);

export default function CubeEquilibrioView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [estudioAbierto, setEstudioAbierto] = useState(null);

  const cargar = () => {
    setErr(null);
    return getMarket4sOverview().then(setData).catch((e) => setErr(e?.message || 'No se pudo cargar.'));
  };
  useEffect(() => { let alive = true; getMarket4sOverview().then((d) => alive && setData(d)).catch((e) => alive && setErr(e?.message || 'No se pudo cargar.')); return () => { alive = false; }; }, []);

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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <Kpi label="Colonias con absorción REAL" value={cob.n_colonias} icon={<CheckCircle2 size={14} color="#4ADE80" />} hint="antes 'estimado'" />
        <Kpi label="Oportunidades detectadas" value={radar.n_oportunidades} hint="zonas × segmento" />
        <Kpi label="Proyectos comparables" value={data.n_proyectos} hint="dato de mercado" />
      </div>

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
    </div>
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
