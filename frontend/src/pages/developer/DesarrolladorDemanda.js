// /desarrollador/demanda — D6 Demand Heatmap + Phase 4 Batch 6 (4.17 Mapbox choropleth)
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0 } from '../../components/advisor/primitives';
import DemandHeatmapMap from '../../components/developer/DemandHeatmapMap';
import * as api from '../../api/developer';

export default function DesarrolladorDemanda({ user, onLogout }) {
  const [legacy, setLegacy] = useState(null);
  const [heat, setHeat] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [selectedColonia, setSelectedColonia] = useState(null);

  useEffect(() => { api.getDemand().then(setLegacy).catch(() => setLegacy({ _err: true })); }, []);

  useEffect(() => {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    api.getDemandHeatmap({ from: fromDate }).then(setHeat).catch(() => setHeat({ _err: true }));
  }, [period]);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D6 · DEMAND HEATMAP"
        title="Demanda de mercado"
        sub="Búsquedas reales en DesarrollosMX, demanda no atendida y forecast 30/60/90 días con Claude Sonnet."
      />

      {/* ─── Mapbox choropleth (Batch 6 · 4.17) ─── */}
      <Card data-testid="demand-heatmap-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>HEATMAP GEOGRÁFICO · LEADS + CITAS + BÚSQUEDAS</div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>
              Score normalizado 0–100 por colonia. Click en polígono para foco.
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
            <div style={{ height: 460, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {heat?._err ? 'No se pudo cargar el heatmap.' : 'Cargando heatmap…'}
            </div>
          ) : (
            <DemandHeatmapMap geojson={heat} height={460} onSelectColonia={(id, props) => setSelectedColonia(props)} />
          )}

          <div data-testid="demand-top10-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 460 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>TOP 10 COLONIAS · DEMANDA</div>
            {(heat?.top_10 || []).map((c, idx) => (
              <button key={c.colonia_id} data-testid={`demand-top-${c.colonia_id}`} onClick={() => setSelectedColonia({ ...c, alcaldia: null })} style={{
                textAlign: 'left', padding: '10px 12px', background: selectedColonia?.colonia_id === c.colonia_id ? 'rgba(236,72,153,0.10)' : 'rgba(240,235,224,0.03)',
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

      {!legacy ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : legacy._err ? null
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 30D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d30)}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>búsquedas estimadas</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 60D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d60)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 90D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(legacy.forecast.d90)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>DEMANDA NO ATENDIDA</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#fcd34d' }}>{legacy.unmet_demand.length}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>colonias sin oferta tuya</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }} className="dem-grid">
              <Card>
                <div className="eyebrow" style={{ marginBottom: 12 }}>HEATMAP POR COLONIA</div>
                {legacy.by_colonia.slice(0, 12).map(c => (
                  <div key={c.colonia_id} data-testid={`heat-${c.colonia_id}`} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 80px 60px',
                    alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, color: 'var(--cream)' }}>{c.colonia}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{c.alcaldia}</div>
                    </div>
                    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 9999 }}>
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
                <div className="eyebrow" style={{ marginBottom: 12 }}>TOP QUERIES IA · 30D</div>
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
                <div className="eyebrow" style={{ marginBottom: 10, color: '#fcd34d' }}>OPORTUNIDAD · DEMANDA SIN OFERTA</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {legacy.unmet_demand.map(u => (
                    <div key={u.colonia_id} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{u.colonia}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmt0(u.searches_30d)} búsquedas · 0 supply tuyo</div>
                    </div>
                  ))}
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
