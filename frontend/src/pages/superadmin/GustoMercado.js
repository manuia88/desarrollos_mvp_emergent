/**
 * GustoMercado (Dev-Master · Fase 3 #11) — Gusto visual del mercado (modelo de gusto agregado).
 * Rescata el modelo de gusto (B5.4) a nivel mercado: qué cuartos/estilos enganchan, qué amenidades
 * mueven la demanda (lift), qué fotos conviene subir. Integra asesor (swipes) + dev (oferta/fotos) +
 * marketplace (demanda). Consume /devmaster/gusto-mercado. Se autoafina con swipes reales.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, Eye, Camera, MapPin, Heart, Lightbulb } from 'lucide-react';
import { fetchGustoMercado, fetchBuyerCycleIntel } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const GREEN = '#34D399';

function Panel({ icon: Icon, title, sub, children, accent }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(var(--theme-rgb),0.4)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sub ? 2 : 12 }}>
        {Icon && <Icon size={15} style={{ color: 'var(--theme)' }} />}
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
      </div>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function GustoMercado({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [cube, setCube] = useState(null);   // Copiloto · cubo del ciclo del comprador

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchGustoMercado(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    fetchBuyerCycleIntel(90).then(r => { if (alive) setCube(r); }).catch(() => {});
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar el gusto del mercado.</div>;
  if (!d) return <div style={mute}>Leyendo el gusto del mercado…</div>;

  const maxVisual = Math.max(...(d.gusto_visual || []).map(g => g.indice_interes), 1);
  const fuenteTxt = d.fuente?.gusto === 'swipes-reales'
    ? `Basado en ${d.fuente.swipes} swipes de compradores en el link tipo Tinder que les manda el asesor.`
    : `Estimado del catálogo (${d.fuente?.leads || 0} leads) — se afina solo cuando los compradores swipeen en el link que les manda el asesor.`;

  return (
    <div data-testid="gusto-mercado" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Copiloto · EL CUBO DEL CICLO DEL COMPRADOR (Bloomberg CDMX) */}
      {cube && cube.embudo && (
        <div data-testid="cubo-comprador" style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>🔬 Ciclo del comprador</h3>
            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)' }}>BLOOMBERG CDMX</span>
          </div>
          {/* Embudo */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {[['Búsquedas', cube.embudo.busquedas], ['Likes', cube.embudo.likes], ['Guardadas', cube.embudo.guardadas_con_alerta], ['Registros', cube.embudo.registros], ['Visitas', cube.embudo.visitas]].map(([l, n], i) => (
              <div key={l} style={{ flex: 1, minWidth: 84, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--sa-border)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: i === 4 ? GREEN : 'var(--sa-text)' }}>{n}</div>
                <div style={{ fontSize: 10, ...mute }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Huecos de mercado */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>🕳️ Huecos de mercado <span style={{ ...mute, fontWeight: 400 }}>(demanda sin oferta)</span></div>
              {(cube.huecos_mercado || []).slice(0, 4).map((g, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '4px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                  <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{g.colonia}</b> · {g.busquedas_sin_oferta} sin oferta{g.presupuesto_prom ? ` · ~$${(g.presupuesto_prom / 1e6).toFixed(1)}M` : ''}
                </div>
              ))}
              {(cube.huecos_mercado || []).length === 0 && <div style={{ fontSize: 11.5, ...mute }}>Sin huecos detectados aún.</div>}
            </div>
            {/* Top demanda */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>🔥 Top demanda</div>
              {(cube.top_demanda || []).slice(0, 4).map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '4px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                  <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{t.colonia}</b> · {t.busquedas} búsq.{t.presupuesto_prom ? ` · ~$${(t.presupuesto_prom / 1e6).toFixed(1)}M` : ''}
                </div>
              ))}
            </div>
          </div>
          {cube.sustitucion && (cube.sustitucion.flujos || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>🧭 Sustitución de demanda <span style={{ ...mute, fontWeight: 400 }}>(a dónde se va la demanda que la zona pedida no cumplió · selección de terreno)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8 }}>
                {(cube.sustitucion.flujos || []).slice(0, 12).map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{f.pedida}</b>
                    <span style={{ color: '#8B7CF6' }}>→</span>
                    <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{f.sustituta}</b>
                    <span style={{ ...mute }}>· {f.veces}×</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, ...mute, marginTop: 8 }}>{cube.sustitucion.lectura}</div>
            </div>
          )}
          {/* ESQUEMA DE PAGO pedido (preventa vs crédito) — cómo estructurar precio/plan para el dev */}
          {cube.esquema_demanda && (cube.esquema_demanda.reparto || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>💳 Esquema de pago que pide la gente <span style={{ ...mute, fontWeight: 400 }}>(crédito vs preventa · cómo estructurar precio y plan)</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(cube.esquema_demanda.reparto || []).map((e, i) => {
                  const total = (cube.esquema_demanda.reparto || []).reduce((s, x) => s + (x.veces || 0), 0) || 1;
                  const pct = Math.round((e.veces / total) * 100);
                  const lbl = e.esquema === 'preventa' ? '🏗️ preventa' : e.esquema === 'credito' ? '💳 crédito' : '🔀 ambos';
                  return (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '5px 10px', borderRadius: 8, background: 'var(--sa-bg-soft, rgba(255,255,255,0.03))', border: '1px solid var(--sa-border)' }}>
                      <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{lbl}</b> <span style={{ ...mute }}>· {e.veces}× ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, ...mute, marginTop: 8 }}>{cube.esquema_demanda.lectura}</div>
            </div>
          )}
          {/* BRECHA DE PAGO — zonas donde la mensualidad pedida no alcanza ni lo más barato (oportunidad de producto accesible) */}
          {cube.brecha_pago && (cube.brecha_pago.zonas || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>📊 Brecha de presupuesto <span style={{ ...mute, fontWeight: 400 }}>({cube.brecha_pago.total} búsquedas · piden comprar pero su mensualidad no llega ni a lo más barato)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
                {(cube.brecha_pago.zonas || []).slice(0, 12).map((b, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)' }}>
                    <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{b.colonia}</b> <span style={{ ...mute }}>· {b.veces}×</span>
                    {b.gap_prom != null && <div style={{ fontSize: 11, ...mute }}>piden ~${Number(b.mens_pedida_prom || 0).toLocaleString('es-MX')}/mes · faltan ~<b style={{ color: '#EC4899' }}>${Number(b.gap_prom).toLocaleString('es-MX')}/mes</b></div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, ...mute, marginTop: 8 }}>{cube.brecha_pago.lectura}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11.5, ...mute, flexWrap: 'wrap' }}>
            <span>📈 Velocidad: <b style={{ color: cube.velocidad?.tendencia === 'subiendo' ? GREEN : 'var(--sa-text)' }}>{cube.velocidad?.tendencia}</b> ({cube.velocidad?.ultimos_7d} vs {cube.velocidad?.previos_7d})</span>
            <span>👻 Shadow demand: <b style={{ color: 'var(--sa-text)' }}>{cube.shadow_demand?.ratio_anon_vs_reg}:1</b> anónimas/registradas (el top-of-funnel real)</span>
          </div>
          {/* E7 · cierres: la inteligencia de conversión/compromiso (el moat) */}
          {cube.cierres && cube.cierres.n > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>🏆 De los que SÍ cerraron <span style={{ ...mute, fontWeight: 400 }}>({cube.cierres.n} cierres · el moat que se mejora solo)</span></div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--sa-text-dim)' }}>
                <span><b style={{ color: 'var(--sa-text)' }}>{cube.cierres.pct_subio_presupuesto}%</b> subió presupuesto</span>
                <span><b style={{ color: 'var(--sa-text)' }}>{cube.cierres.pct_cambio_zona}%</b> cambió de zona</span>
                <span><b style={{ color: GREEN }}>{cube.cierres.pct_like_antes_de_comprar}%</b> dio like antes de comprar</span>
                {cube.cierres.ciclo_dias_prom != null && <span>ciclo ~<b style={{ color: 'var(--sa-text)' }}>{cube.cierres.ciclo_dias_prom}</b> días</span>}
              </div>
            </div>
          )}
          {/* B · Demanda granular: qué pide el mercado por dimensión + el hueco (pedido vs ofertado) */}
          {cube.demanda_granular && ((cube.demanda_granular.amenidades_pedidas || []).length > 0 || (cube.demanda_granular.zonas_fuera_de_cobertura || []).length > 0) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>📊 Demanda fina <span style={{ ...mute, fontWeight: 400 }}>(qué pide el mercado · pedido vs ofertado)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>Amenidades pedidas</div>
                  {(cube.demanda_granular.amenidades_pedidas || []).slice(0, 5).map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '3px 0' }}>
                      <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{String(a.amenidad).replace(/_/g, ' ')}</b> · {a.pedidos} ped · <span style={{ color: a.desarrollos_que_la_ofrecen === 0 ? '#E0A33E' : 'var(--sa-text-dim)' }}>{a.desarrollos_que_la_ofrecen} ofrecen{a.desarrollos_que_la_ofrecen === 0 ? ' ⚠' : ''}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>Zonas fuera de cobertura (dónde expandir)</div>
                  {(cube.demanda_granular.zonas_fuera_de_cobertura || []).slice(0, 5).map((z, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '3px 0' }}>
                      <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{z.zona}</b> · {z.pedidos} pedidos
                    </div>
                  ))}
                  {(cube.demanda_granular.zonas_fuera_de_cobertura || []).length === 0 && <div style={{ fontSize: 11.5, ...mute }}>Todo lo pedido está en cobertura.</div>}
                </div>
              </div>

              {/* Disposición a pagar (busca vs oferta) + en qué ceden (elasticidad) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
                <div>
                  <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>Disposición a pagar (busca vs tu entrada)</div>
                  {(cube.demanda_granular.disposicion_pago || []).slice(0, 5).map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '3px 0' }}>
                      <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{w.zona}</b> · busca ~${w.presupuesto_buscado_prom ? (w.presupuesto_buscado_prom / 1e6).toFixed(1) : '—'}M{w.oferta_desde ? ` · ofreces desde $${(w.oferta_desde / 1e6).toFixed(1)}M` : ''}
                    </div>
                  ))}
                  {(cube.demanda_granular.disposicion_pago || []).length === 0 && <div style={{ fontSize: 11.5, ...mute }}>Sin datos aún.</div>}
                </div>
                <div>
                  <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>En qué cede la gente (elasticidad)</div>
                  {(cube.demanda_granular.elasticidad_en_que_ceden || []).slice(0, 5).map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '3px 0' }}>
                      <b style={{ color: 'var(--sa-text)' }}>{String(c.cedio).replace('amenity:', '').replace('unit_feature:', '').replace(/_/g, ' ')}</b> · cedió {c.veces}×
                    </div>
                  ))}
                  {(cube.demanda_granular.elasticidad_en_que_ceden || []).length === 0 && <div style={{ fontSize: 11.5, ...mute }}>Aún nadie ha relajado filtros.</div>}
                </div>
              </div>

              {/* Huecos de producto EXACTO (demanda insatisfecha) — cierra ciclo comprador → dev */}
              {(cube.demanda_granular.demanda_insatisfecha || []).length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
                  <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>🧩 Huecos de producto exacto <span style={{ fontWeight: 400 }}>(buscaron esto en zona que SÍ cubrimos y no hay nada → qué construir/precio)</span></div>
                  {(cube.demanda_granular.demanda_insatisfecha || []).slice(0, 6).map((h, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '3px 0' }}>
                      <b style={{ color: 'var(--sa-text)', textTransform: 'capitalize' }}>{String(h.zona || '').replace(/-/g, ' ')}</b>
                      {h.recamaras ? ` · ${h.recamaras} rec` : ''}{h.presupuesto_max ? ` · ≤$${Math.round(h.presupuesto_max / 1e6)}M` : ''}{h.m2_min ? ` · ≥${h.m2_min}m²` : ''}
                      {' · '}<b style={{ color: GREEN }}>{h.personas}</b> {h.personas === 1 ? 'persona' : 'personas'}
                      {(h.lo_que_mas_falta || []).length > 0 && <span style={mute}> · lo que más falta: {(h.lo_que_mas_falta || []).join(', ')}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Intención + frases crudas (cómo habla la gente) */}
              {cube.demanda_granular.intencion && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--sa-text-dim)', marginBottom: 6 }}>
                    🎯 Intención: <b style={{ color: GREEN }}>{cube.demanda_granular.intencion.completas}</b> completas · <b style={{ color: 'var(--sa-text)' }}>{cube.demanda_granular.intencion.exploratorias}</b> exploratorias (querían algo, no concretaron)
                  </div>
                  {(cube.demanda_granular.frases_recientes || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {(cube.demanda_granular.frases_recientes || []).slice(0, 8).map((f, i) => (
                        <span key={i} style={{ fontSize: 11, color: 'var(--sa-text-dim)', background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid var(--sa-border)', borderRadius: 9999, padding: '3px 9px' }}>"{f}"</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Salud del buscador — bucle de fallas de lectura (lo que la gente escribió y el parser NO leyó) */}
      {cube && cube.salud_buscador && (cube.salud_buscador.conceptos_no_leidos || []).length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>🔎 Salud del buscador <span style={{ ...mute, fontWeight: 400 }}>(lo que escribieron y el buscador NO entendió · data real, no adivinanza)</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(cube.salud_buscador.conceptos_no_leidos || []).map((c, i) => (
              <span key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 9999, padding: '3px 10px' }}>
                {String(c.concepto).replace(/_/g, ' ')} · <b style={{ color: 'var(--sa-text)' }}>{c.veces}</b>
              </span>
            ))}
          </div>
          {(cube.salud_buscador.frases_recientes || []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, ...mute, marginBottom: 4 }}>Frases recientes que no leyó:</div>
              {(cube.salud_buscador.frases_recientes || []).slice(0, 8).map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-dim)', padding: '2px 0' }}>
                  "{f.texto}" <span style={mute}>→ {(f.no_leyo || []).join(', ')}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, ...mute, marginTop: 8 }}>{cube.salud_buscador.lectura}</div>
        </div>
      )}

      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Gusto del mercado</h3>
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)', letterSpacing: '.04em' }}>MODELO DE GUSTO</span>
        </div>
        <p data-testid="gm-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{fuenteTxt} Cruzamos lo que la gente mira y pide contra lo que ofrece cada proyecto.</div>
      </div>

      {/* Acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué hacer con esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <div key={i} data-testid="gm-accion" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Amenidades que mueven la aguja (la joya) */}
      <Panel icon={Heart} title="Amenidades que mueven la aguja" sub="Cuánto más interés captan los proyectos que SÍ tienen cada amenidad.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(d.amenidades_aguja || []).map((a, i) => {
            const pos = a.lift >= 1.15, neu = a.lift > 0.85 && a.lift < 1.15;
            const col = pos ? GREEN : (neu ? 'var(--sa-text-mute)' : '#F2635B');
            return (
              <div key={i} data-testid="gm-amenidad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 150 }}>
                  <span style={{ fontSize: 13, color: 'var(--sa-text)', fontWeight: 600 }}>{a.label}</span>
                  {a.confianza === 'temprana' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: 'rgba(245,196,81,0.14)', color: '#F5C451' }}>señal temprana</span>}
                </div>
                <div style={{ flex: 1, maxWidth: 180, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(Math.round(a.lift / 9 * 100), 100)}%`, background: col, borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 130, textAlign: 'right' }}>{a.lift_label}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Grid: gusto visual + fotos + perfil + por zona */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {/* Gusto visual */}
        <Panel icon={Eye} title="Qué engancha la mirada" sub="Índice >1 = atrae más de lo que se muestra.">
          {(d.gusto_visual || []).slice(0, 8).map((g, i) => {
            const pos = g.indice_interes >= 1;
            return (
              <div key={i} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--sa-text)' }}>{g.tag} <span style={{ ...mute, fontSize: 10.5 }}>· {g.tipo}</span></span>
                  <span style={{ color: pos ? GREEN : 'var(--sa-text-mute)', fontWeight: 700 }}>{g.indice_interes}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(g.indice_interes / maxVisual * 100)}%`, background: pos ? GREEN : 'var(--sa-text-mute)', borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </Panel>

        {/* Qué fotos subir */}
        <Panel icon={Camera} title="Qué fotos subir" sub="Cuartos que enganchan pero casi no se muestran.">
          {(d.fotos_recomendadas || []).length === 0 && <div style={{ fontSize: 12, ...mute }}>La galería del catálogo está bien balanceada.</div>}
          {(d.fotos_recomendadas || []).map((f, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>{f.cuarto}</div>
              <div style={{ fontSize: 11.5, ...dim, marginTop: 2 }}>{f.motivo}</div>
            </div>
          ))}
        </Panel>

        {/* Perfil del mercado */}
        <Panel icon={Sparkles} title="Perfil del comprador típico">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Zona más buscada</span><span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{d.perfil_mercado?.zona_top || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Presupuesto típico</span><span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{d.perfil_mercado?.precio_tipico ? `$${(d.perfil_mercado.precio_tipico / 1e6).toFixed(1)}M` : '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span style={mute}>Le importa</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                {(d.perfil_mercado?.caracteristicas || []).map((c, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)' }}>{c}</span>
                ))}
                {(d.perfil_mercado?.caracteristicas || []).length === 0 && <span style={mute}>—</span>}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 10.5, ...mute, marginTop: 10, fontStyle: 'italic' }}>
            {d.perfil_mercado?.fuente === 'swipes-reales' ? 'Basado en swipes de compradores.' : 'Estimado de leads — se afina con los swipes de los compradores.'}
          </div>
        </Panel>

        {/* Por zona */}
        <Panel icon={MapPin} title="Gusto por zona">
          {(d.por_zona || []).slice(0, 8).map((z, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <span style={{ color: 'var(--sa-text)' }}>{z.zona}</span>
              <span style={dim}>{z.top_cuarto || '—'}{z.top_amenidad ? ` · ${z.top_amenidad}` : ''}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
