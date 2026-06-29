// /desarrollador/demanda — D6 Demand Heatmap + Phase 4 Batch 6 (4.17 Mapbox choropleth)
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0 } from '../../components/advisor/primitives';
import DemandHeatmapMap from '../../components/developer/DemandHeatmapMap';
import GrafoCompradorCard from '../../components/developer/GrafoCompradorCard';
import DemandaDemograficaCard from '../../components/developer/DemandaDemograficaCard';
import * as api from '../../api/developer';

export default function DesarrolladorDemanda({ user, onLogout, embedded }) {
  const [legacy, setLegacy] = useState(null);
  const [heat, setHeat] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [selectedColonia, setSelectedColonia] = useState(null);
  const [intel, setIntel] = useState(null);   // demanda insatisfecha en TUS zonas (el moat)
  const [feat, setFeat] = useState(null);     // demanda a nivel FEATURE en tus colonias (cierra loop demanda→dev)

  useEffect(() => { api.getDemand().then(setLegacy).catch(() => setLegacy({ _err: true })); }, []);
  useEffect(() => { api.getDemandIntel(60).then(setIntel).catch(() => setIntel({ _err: true })); }, []);
  useEffect(() => { api.getDemandFeatures(90).then(setFeat).catch(() => setFeat({ _err: true })); }, []);

  useEffect(() => {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    api.getDemandHeatmap({ from: fromDate }).then(setHeat).catch(() => setHeat({ _err: true }));
  }, [period]);

  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader
        eyebrow="MAPA DE DEMANDA"
        title="Demanda de mercado"
        sub="Búsquedas reales en DesarrollosMX, demanda no atendida y pronóstico a 30/60/90 días con IA."
      />

      {/* JUGADAS PROACTIVAS: qué construir YA (presión + tendencia). Lo proactivo — el dev lo ve sin escarbar. */}
      {feat && feat.alertas && (feat.alertas.jugadas || []).length > 0 && (
        <Card style={{ marginBottom: 20, border: '1px solid rgba(34,197,94,0.35)', background: 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))' }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: '#22c55e' }}>🔥 QUÉ CONSTRUIR YA — el mercado te lo está pidiendo</div>
          {(feat.alertas.jugadas || []).slice(0, 4).map((j) => (
            <div key={j.feature} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Badge tone={j.accion === 'construir' ? 'bad' : 'warn'}>{j.accion}</Badge>
              <span style={{ fontSize: 13 }}>{j.mensaje}</span>
            </div>
          ))}
          {feat.alertas.busquedas_no_satisfechas > 0 && (
            <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>+ {fmt0(feat.alertas.busquedas_no_satisfechas)} búsquedas sin buen match en tus zonas = demanda esperando oferta.</div>
          )}
        </Card>
      )}

      {/* Demanda a nivel FEATURE en tus colonias (cierra el loop demanda→dev: no solo recámaras/precio, sino qué FEATURES) */}
      {feat && !feat._err && !feat.vacio && (
        <Card style={{ marginBottom: 20, border: '1px solid rgba(99,102,241,0.28)' }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--theme)' }}>QUÉ FEATURES PIDE EL MERCADO EN TUS COLONIAS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, marginBottom: 6 }}>MÁS BUSCADOS</div>
              {(feat.por_feature?.top_features || []).slice(0, 7).map((f) => (
                <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span>{f.feature}</span><strong style={{ color: 'var(--theme)' }}>{f.demanda}</strong></div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, marginBottom: 6 }}>QUÉ CONSTRUIR (demanda vs oferta)</div>
              {(feat.que_construir?.oportunidades || []).slice(0, 7).map((o) => (
                <div key={o.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span>{o.feature}</span><Badge tone={o.presion >= 0.7 ? 'bad' : o.presion >= 0.4 ? 'warn' : 'neutral'}>×{o.presion}</Badge></div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, marginBottom: 6 }}>NO SATISFECHO</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26 }}>{fmt0(feat.no_satisfecha?.busquedas_insatisfechas || 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>búsquedas sin buen match en tus zonas</div>
              {(feat.tendencias?.tendencias || []).slice(0, 3).map((t) => (
                <div key={t.feature} style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>↑ {t.feature} {t.nuevo ? 'nuevo' : `${t.crecimiento_pct > 0 ? '+' : ''}${t.crecimiento_pct}%`}</div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* B.2 · Demanda Viva honesta: dice si el dato es real o aún por confirmar */}
      {legacy && legacy.lectura && (
        <div data-testid="demand-honesty" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 12,
          background: legacy.es_estimado ? 'rgba(226,152,46,0.08)' : 'rgba(31,160,106,0.07)',
          border: `1px solid ${legacy.es_estimado ? 'rgba(226,152,46,0.30)' : 'rgba(31,160,106,0.28)'}` }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, color: legacy.es_estimado ? 'var(--warm, #E2982E)' : 'var(--ok, #1FA06A)' }}>
            {legacy.es_estimado ? '◐ ' : '● '}{legacy.lectura}
          </span>
        </div>
      )}

      {/* ─── DEMANDA INSATISFECHA EN TUS ZONAS (el moat: qué busca la gente y no encuentra → dónde construir, a qué precio, qué plan) ─── */}
      {intel && !intel._err && !intel.vacio && (
        <Card data-testid="demand-intel-card" style={{ marginBottom: 20, border: '1px solid rgba(99,102,241,0.28)', background: 'linear-gradient(135deg, rgba(124,92,255,0.05), rgba(192,38,211,0.03))' }}>
          <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--theme)' }}>LO QUE LA GENTE BUSCA EN TUS ZONAS Y NO ENCUENTRA</div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '0 0 14px' }}>
            Señal real y anónima de las búsquedas en DesarrollosMX, solo de tus colonias ({(intel.colonias || []).join(', ')}). Últimos {intel.ventana_dias} días.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {/* Insatisfecha */}
            <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>🔎 Demanda sin atender</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', marginTop: 4 }}>{fmt0(intel.insatisfechas)}<span style={{ fontSize: 13, color: 'var(--cream-3)', fontWeight: 600 }}> / {fmt0(intel.total_busquedas)}</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--cream-2)', marginTop: 2 }}>búsquedas en tus zonas no hallaron match ({intel.insatisfechas_pct}%)</div>
            </div>
            {/* Brecha */}
            {intel.brecha && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>📊 No les alcanza</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', marginTop: 4 }}>{fmt0(intel.brecha.personas)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--cream-2)', marginTop: 2 }}>quieren tu zona pero les faltan ~${fmt0(intel.brecha.gap_prom)}/mes (piden ~${fmt0(intel.brecha.mens_pedida_prom)})</div>
              </div>
            )}
            {/* Perfil buscado */}
            <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>🎯 Qué buscan</div>
              <div style={{ fontSize: 13, color: 'var(--cream)', marginTop: 6, lineHeight: 1.7 }}>
                {intel.perfil_buscado.recamaras_prom ? <div>~{intel.perfil_buscado.recamaras_prom} recámaras</div> : null}
                {intel.perfil_buscado.precio_prom ? <div>~${fmt0(intel.perfil_buscado.precio_prom)} de precio</div> : null}
                {intel.perfil_buscado.mensualidad_prom ? <div>~${fmt0(intel.perfil_buscado.mensualidad_prom)}/mes</div> : null}
              </div>
            </div>
          </div>
          {/* Sustitución + Esquema + Amenidades */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
            {(intel.sustitucion || []).length > 0 && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>🧭 A dónde se va tu demanda</div>
                {intel.sustitucion.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ textTransform: 'capitalize' }}>{String(s.zona).replace(/-/g, ' ')}</span><span style={{ color: 'var(--cream-3)' }}>{s.veces}×</span>
                  </div>
                ))}
              </div>
            )}
            {(intel.esquema || []).length > 0 && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>💳 Esquema de pago que piden</div>
                {intel.esquema.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{e.esquema === 'preventa' ? '🏗️ preventa' : e.esquema === 'credito' ? '💳 crédito' : '🔀 ambos'}</span><span style={{ color: 'var(--cream-3)' }}>{e.veces}×</span>
                  </div>
                ))}
              </div>
            )}
            {(intel.amenidades_pedidas || []).length > 0 && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>✨ Amenidades que piden</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {intel.amenidades_pedidas.slice(0, 8).map((a, i) => (
                    <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--cream-2)' }}>{String(a.amenidad).replace(/_/g, ' ')} · {a.veces}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 12 }}>{intel.lectura}</div>
        </Card>
      )}

      {/* ─── Mapbox choropleth (Batch 6 · 4.17) ─── */}
      <Card data-testid="demand-heatmap-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>MAPA DE CALOR · LEADS + CITAS + BÚSQUEDAS</div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>
              Intensidad de demanda por colonia (búsquedas + leads + citas). Click en el polígono para foco.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['7d', '30d', '90d'].map(p => (
              <button key={p} data-testid={`demand-period-${p}`} onClick={() => setPeriod(p)} style={{
                padding: '6px 12px', borderRadius: 9999,
                background: period === p ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
                border: '1px solid var(--border)',
                color: period === p ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}>{p.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }} className="dem-heat-grid">
          {!heat || heat._err ? (
            <div style={{ height: 460, borderRadius: 12, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {heat?._err ? 'No se pudo cargar el heatmap.' : 'Cargando heatmap…'}
            </div>
          ) : (
            <DemandHeatmapMap geojson={heat} height={460} onSelectColonia={(id, props) => setSelectedColonia(props)} />
          )}

          <div data-testid="demand-top10-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 460 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>TOP 10 COLONIAS · DEMANDA</div>
            {(heat?.top_10 || []).map((c, idx) => (
              <button key={c.colonia_id} data-testid={`demand-top-${c.colonia_id}`} onClick={() => setSelectedColonia({ ...c, alcaldia: null })} style={{
                textAlign: 'left', padding: '10px 12px', background: selectedColonia?.colonia_id === c.colonia_id ? 'rgba(236,72,153,0.10)' : 'rgba(var(--cream-rgb),0.03)',
                border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
                    <span style={{ color: 'var(--cream-3)', marginRight: 6, fontSize: 11 }}>{String(idx + 1).padStart(2, '0')}</span>
                    {c.colonia}
                  </div>
                  <Badge tone={c.demand_score > 70 ? 'brand' : c.demand_score > 30 ? 'ok' : 'neutral'}>{c.demand_score}</Badge>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>
                  {c.leads_count} leads · {c.appointments_count} citas
                </div>
              </button>
            ))}
            {(!heat?.top_10 || heat.top_10.length === 0) && (
              <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin datos en el periodo seleccionado.</div>
            )}
          </div>
        </div>

        {heat && (
          <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <span>Total leads: <b style={{ color: 'var(--cream-2)' }}>{fmt0(heat.total_leads || 0)}</b></span>
            <span>Total citas: <b style={{ color: 'var(--cream-2)' }}>{fmt0(heat.total_appointments || 0)}</b></span>
            <span>Búsquedas en cálculo: <b style={{ color: 'var(--cream-2)' }}>{heat.has_searches ? 'incluidas' : 'no disponibles'}</b></span>
            <span>Granularidad: <b style={{ color: 'var(--cream-2)' }}>{heat.granularity}</b></span>
          </div>
        )}
      </Card>

      {/* F2.1.2 · Qué Quiere La Demanda Aquí — Grafo del Comprador (reacciona a la colonia seleccionada) */}
      <GrafoCompradorCard coloniaId={selectedColonia?.colonia_id} coloniaName={selectedColonia?.colonia} />

      {/* F2.4.3 · Demanda Potencial (Demografía · EPRAV) — complementa el Grafo cuando no hay búsquedas */}
      <DemandaDemograficaCard coloniaId={selectedColonia?.colonia_id} coloniaName={selectedColonia?.colonia} />

      {!legacy ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : legacy._err ? null
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>PRONÓSTICO 30 DÍAS</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d30)}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>búsquedas estimadas</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>PRONÓSTICO 60 DÍAS</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d60)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>PRONÓSTICO 90 DÍAS</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d90)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>DEMANDA NO ATENDIDA</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--amber)' }}>{legacy.unmet_demand.length}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>colonias sin oferta tuya</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }} className="dem-grid">
              <Card>
                <div className="eyebrow" style={{ marginBottom: 12 }}>MAPA DE CALOR POR COLONIA</div>
                {legacy.by_colonia.slice(0, 12).map(c => (
                  <div key={c.colonia_id} data-testid={`heat-${c.colonia_id}`} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 80px 60px',
                    alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, color: 'var(--cream)' }}>{c.colonia}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{c.alcaldia}</div>
                    </div>
                    <div style={{ position: 'relative', height: 8, background: 'rgba(var(--cream-rgb),0.05)', borderRadius: 9999 }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        width: `${c.heat}%`,
                        background: c.heat > 70 ? 'linear-gradient(90deg, #EC4899, #ef4444)' : c.heat > 40 ? 'linear-gradient(90deg, #6366F1, #EC4899)' : 'linear-gradient(90deg, #22C55E, #6366F1)',
                        borderRadius: 9999,
                      }} />
                    </div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', textAlign: 'right' }}>{fmt0(c.searches_30d)}</div>
                    <Badge tone={c.growth_mom_pct > 20 ? 'ok' : c.growth_mom_pct < 0 ? 'bad' : 'neutral'}>
                      {c.growth_mom_pct > 0 ? '+' : ''}{c.growth_mom_pct}%
                    </Badge>
                  </div>
                ))}
              </Card>

              <Card>
                <div className="eyebrow" style={{ marginBottom: 12 }}>BÚSQUEDAS MÁS FRECUENTES · 30 DÍAS</div>
                {legacy.top_queries.map((q, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>"{q.q}"</div>
                    <Badge tone="brand">{q.count}</Badge>
                  </div>
                ))}
              </Card>
            </div>

            <Card style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>FUNNEL DEL MARKETPLACE · 30D</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 130 }}>
                {[
                  { k: 'Impresiones', v: legacy.funnel.impressions, h: 100, c: '#6366F1' },
                  { k: 'Clicks', v: legacy.funnel.clicks, h: 70, c: '#8B5CF6' },
                  { k: 'Fichas', v: legacy.funnel.fichas, h: 42, c: '#EC4899' },
                  { k: 'Contactos', v: legacy.funnel.contacts, h: 14, c: '#F472B6' },
                ].map(b => (
                  <div key={b.k} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: `${b.h}%`, background: b.c, borderRadius: '8px 8px 0 0', opacity: 0.85 }} />
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.k}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmt0(b.v)}</div>
                  </div>
                ))}
              </div>
            </Card>

            {legacy.unmet_demand.length > 0 && (
              <Card style={{ marginTop: 14, background: 'linear-gradient(140deg, rgba(245,158,11,0.08), transparent)' }}>
                <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--amber)' }}>OPORTUNIDAD · DEMANDA SIN OFERTA</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {legacy.unmet_demand.map(u => (
                    <div key={u.colonia_id} style={{ padding: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{u.colonia}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmt0(u.searches_30d)} búsquedas · 0 supply tuyo</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {feat.avanzado && (
              <Card style={{ marginTop: 14 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>Señales avanzadas de tu zona</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12 }}>Balance oferta-demanda, sweet-spot de precio y dónde se fuga el interés. (Se trabaja a detalle en el rediseño del portal.)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Balance oferta-demanda</div>
                    {(feat.avanzado.balance_oferta_demanda?.colonias || []).slice(0, 4).map((c) => (
                      <div key={c.colonia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{c.colonia}</span><strong style={{ color: 'var(--cream)' }}>{c.balance}</strong></div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Sweet-spot de precio</div>
                    {Object.entries(feat.avanzado.elasticidad_precio?.curva || {}).map(([b, n]) => (
                      <div key={b} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{b}</span><strong style={{ color: 'var(--cream)' }}>{n}</strong></div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Willingness-to-pay</div>
                    {(feat.avanzado.willingness_to_pay?.features || []).slice(0, 4).map((f) => (
                      <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{f.feature}</span><strong style={{ color: 'var(--cream)' }}>${(f.precio_medio_visto / 1e6).toFixed(1)}M</strong></div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* EJE DE ATRIBUTOS — qué busca la demanda DENTRO del depa */}
            {feat.atributos && (
              <Card style={{ marginTop: 14 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>Qué busca la demanda dentro del depa</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12 }}>Balcón, vista, altura del edificio, orientación — los atributos finos que enganchan en tu zona.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Atributos (% engagement)</div>
                    {(feat.atributos.booleanos || []).slice(0, 6).map((b) => (
                      <div key={b.atributo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{b.atributo}</span><strong style={{ color: 'var(--cream)' }}>{b.pct}%</strong></div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Vista · altura</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Vista: {Object.entries(feat.atributos.vista || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>Edificio: {Object.entries(feat.atributos.altura_edificio || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* EJE FINANCIERO — el bolsillo del comprador en tus colonias */}
            {feat.financiero && (
              <Card style={{ marginTop: 14 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>El bolsillo del comprador</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12 }}>Presupuesto, intención (vivir/invertir) y rentabilidad de tus zonas.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Presupuesto buscado</div>
                    {Object.entries(feat.financiero.presupuesto || {}).map(([b, n]) => (
                      <div key={b} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{b}</span><strong style={{ color: 'var(--cream)' }}>{n}</strong></div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 6 }}>Intención + rentabilidad</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Invertir: <strong style={{ color: 'var(--cream)' }}>{feat.financiero.intent?.invertir || 0}</strong> · Vivir: <strong style={{ color: 'var(--cream)' }}>{feat.financiero.intent?.vivir || 0}</strong></div>
                    {(feat.financiero.rentabilidad_por_zona || []).slice(0, 4).map((r) => (
                      <div key={r.colonia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: 'var(--cream-3)' }}><span>{r.colonia}</span><strong style={{ color: 'var(--cream)' }}>{r.score} ({r.tier})</strong></div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* COMPUESTAS — underwriting/pricing/suelo por zona (métricas que cruzan demanda × mercado) */}
            {feat.compuestas?.por_zona?.length > 0 && (
              <Card style={{ marginTop: 14 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>Métricas de decisión (cruces demanda × mercado)</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12 }}>Margen, suelo, absorción y competencia de TUS zonas — cada una cruza el comportamiento del comprador con el mercado.</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--cream-3)', borderBottom: '1px solid var(--border)' }}>métrica</th>
                      {(feat.compuestas.por_zona || []).slice(0, 4).map((z) => <th key={z.zona} style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--cream-3)', borderBottom: '1px solid var(--border)' }}>{z.nombre || z.zona}</th>)}
                    </tr></thead>
                    <tbody>
                      {(feat.compuestas.catalogo || []).filter((c) => ['Underwriting', 'Suelo&Construcción', 'Pricing'].includes(c.pack)).slice(0, 12).map((c) => (
                        <tr key={c.n}>
                          <td style={{ padding: '3px 8px', color: 'var(--cream-2)', borderTop: '1px solid var(--border)' }} title={c.descubre}>{c.nombre}</td>
                          {(feat.compuestas.por_zona || []).slice(0, 4).map((z) => {
                            const v = z.valores?.[c.n];
                            return <td key={z.zona} style={{ padding: '3px 8px', textAlign: 'right', color: v == null || v === '—' ? 'var(--cream-3)' : 'var(--cream)', borderTop: '1px solid var(--border)' }}>{v == null ? '—' : String(v)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      <style>{`
        @media (max-width: 940px) {
          .dem-grid { grid-template-columns: 1fr !important; }
          .dem-heat-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DeveloperLayout>
  );
}
