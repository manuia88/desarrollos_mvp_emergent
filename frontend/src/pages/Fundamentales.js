/*
 *  FUNDAMENTALES DE ZONA — la hoja de datos dura de una colonia (CMA del comprador, founder).
 *  Precio + plusvalía (serie) + gentrificación (con fuentes citadas) + fundamentos + señal transaccional.
 *  Compone datos que ya existen. Consume /api/zona/:slug/fundamentales.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL || '';
const C = { bg: '#FBFAFC', ink: '#15121C', ink2: '#5B5568', faint: '#9A93A6', line: '#EFEBF4', card: '#FFF', accent: '#6D4AFF', green: '#1E9E63', amber: '#D98A00' };
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');

function Barra({ label, valor, hint }) {
  if (valor == null) return null;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontSize: 13, color: C.ink2 }}>
        <span style={{ fontWeight: 600 }}>{label}</span><span style={{ fontWeight: 700, color: C.ink }}>{Math.round(valor)}</span>
      </div>
      <div style={{ height: 7, background: '#F0EDF7', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: GRAD, borderRadius: 999 }} />
      </div>
      {hint && <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function Fundamentales() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${API}/api/zona/${encodeURIComponent(slug)}/fundamentales`).then((r) => r.json())
      .then((x) => { if (alive) { setD(x); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);

  const f = (d && d.fundamentos) || {};
  const g = (d && d.gentrificacion) || {};
  const tx = (d && d.transaccional) || {};

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <div style={{ background: GRAD, color: '#fff', padding: '40px 20px 32px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Link to="/screener" style={{ fontFamily: FONT, fontSize: 13, color: '#fff', opacity: 0.85, textDecoration: 'none' }}>← Screener</Link>
          <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, opacity: 0.85, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 10 }}>Fundamentales de zona</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, lineHeight: 1.05, margin: '4px 0 4px', letterSpacing: '-0.02em' }}>
            {d ? d.name : slug}{d && d.alcaldia ? <span style={{ fontWeight: 600, opacity: 0.8, fontSize: 20 }}> · {d.alcaldia}</span> : null}
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 15, opacity: 0.9, maxWidth: 560 }}>La hoja de datos dura de la colonia — con la fuente de cada número.</p>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 20px 60px' }}>
        {loading ? (
          <div style={{ padding: 40, color: C.faint }}>Cargando fundamentales…</div>
        ) : !d || (d.precio_m2 == null && d.calificacion == null && !(d.gentrificacion && d.gentrificacion.componentes && d.gentrificacion.componentes.length) && !(f && (f.liquidez != null || f.demanda != null))) ? (
          <div style={{ padding: 40, color: C.faint }}>Aún no tenemos fundamentales de esta colonia.</div>
        ) : (
          <>
            {/* Las 3 ideas que importan — síntesis de la zona */}
            {(() => {
              const yoy = d.plusvalia_yoy;
              const serie = d.plusvalia_serie || [];
              const acelera = serie.length >= 2 ? (serie[serie.length - 1].yoy || 0) - (serie[serie.length - 2].yoy || 0) : 0;
              const ideas = [
                { icon: '🏷️', t: 'Precio', d: `${money(d.precio_m2)}/m²${d.precio_muestra_n ? ` (muestra de ${d.precio_muestra_n})` : ''}. ${d.calificacion ? `Calificación de zona ${d.calificacion}.` : ''}` },
                { icon: '📈', t: 'Plusvalía', d: yoy != null ? `Aprecia ${yoy > 0 ? '+' : ''}${yoy}% al año. ${acelera > 0.3 ? 'Acelerando.' : acelera < -0.3 ? 'Desacelerando.' : 'Estable.'}` : 'Sin dato de plusvalía.' },
                { icon: '🛡️', t: 'Riesgo', d: `Riesgo ${(f.riesgo || 'sin dato').toLowerCase()}${f.liquidez != null ? `, liquidez ${f.liquidez >= 60 ? 'alta' : f.liquidez <= 35 ? 'baja' : 'media'}` : ''}. ${g.nivel ? `Gentrificación ${g.nivel}.` : ''}` },
              ];
              return (
                <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20, marginTop: 20 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 12 }}>Las 3 ideas que importan</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    {ideas.map((x, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>{x.icon}</span>
                        <div><div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: C.ink }}>{x.t}</div><div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, lineHeight: 1.45 }}>{x.d}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 20 }}>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, fontWeight: 600 }}>Precio mediano</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: C.ink }}>{money(d.precio_m2)}<span style={{ fontSize: 13, color: C.faint }}>/m²</span></div>
                {d.precio_muestra_n && <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint }}>muestra de {d.precio_muestra_n}</div>}
              </div>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, fontWeight: 600 }}>Plusvalía (último año)</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: d.plusvalia_yoy >= 0 ? C.green : '#B03A3A' }}>{d.plusvalia_yoy != null ? `${d.plusvalia_yoy > 0 ? '+' : ''}${d.plusvalia_yoy}%` : '—'}</div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 24, marginTop: 4 }}>
                  {(d.plusvalia_serie || []).map((s, i) => (
                    <div key={i} title={`${s.anio}: ${s.yoy}%`} style={{ flex: 1, height: `${Math.max(8, Math.min(100, Math.abs(s.yoy || 0) * 8))}%`, background: (s.yoy || 0) < 0 ? '#B03A3A' : C.accent, opacity: 0.35 + 0.65 * (i / Math.max(1, (d.plusvalia_serie.length - 1))), borderRadius: 2 }} />
                  ))}
                </div>
              </div>
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, fontWeight: 600 }}>Calificación de zona</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: C.accent }}>{d.calificacion || '—'}</div>
                <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint }}>índice DMX</div>
              </div>
            </div>

            {/* Fundamentos (subscores) */}
            <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 18 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink, marginBottom: 12 }}>Fundamentos de la zona</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 32px' }}>
                <div>
                  <Barra label="Liquidez (qué tan rápido se vende)" valor={f.liquidez} />
                  <Barra label="Demanda de compradores" valor={f.demanda} />
                  <Barra label="Oferta disponible" valor={f.oferta} />
                </div>
                <div>
                  <Barra label="Potencial de renta" valor={f.yield_score} />
                  <Barra label="Servicios cercanos" valor={f.servicios_cercanos} />
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, fontWeight: 600 }}>Riesgo de zona: <b style={{ color: f.riesgo === 'Bajo' ? C.green : f.riesgo === 'Alto' ? '#B03A3A' : C.amber }}>{f.riesgo || '—'}</b></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Gentrificación con fuentes */}
            {g.componentes && g.componentes.length > 0 && (
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>Gentrificación: {g.score != null ? Math.round(g.score) : '—'} <span style={{ fontSize: 13, color: C.faint, fontWeight: 600 }}>({g.nivel})</span></div>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.ink2, marginTop: 4 }}>Cada componente con su fuente oficial:</div>
                <div style={{ marginTop: 10 }}>
                  {g.componentes.map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < g.componentes.length - 1 ? `1px solid ${C.line}` : 'none' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.ink }}>{({ plusvalia_shf: 'Plusvalía', crimen_trayectoria: 'Seguridad', demanda_reciente: 'Demanda reciente', edad_parque: 'Renovación del parque' })[c.nombre] || c.nombre}</div>
                        <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint }}>{c.fuente}</div>
                      </div>
                      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{c.valor != null ? Math.round(c.valor) : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tx && tx.n > 0 && (
              <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginTop: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink, marginBottom: 8 }}>Señal transaccional (cierres reales)</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>{tx.n}</div><div style={{ fontSize: 12, color: C.faint }}>cierres</div></div>
                  {tx.precio_m2_cierres && <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>{money(tx.precio_m2_cierres)}</div><div style={{ fontSize: 12, color: C.faint }}>$/m² de cierre</div></div>}
                  {tx.dom_prom != null && <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>{tx.dom_prom} días</div><div style={{ fontSize: 12, color: C.faint }}>en vender</div></div>}
                  {tx.descuento_prom != null && <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>{tx.descuento_prom}%</div><div style={{ fontSize: 12, color: C.faint }}>descuento vs lista</div></div>}
                </div>
              </div>
            )}

            <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 18, textAlign: 'center' }}>
              Datos de mercado (SHF · FGJ · Catastro CDMX · señales DMX). Análisis, no asesoría de inversión.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
