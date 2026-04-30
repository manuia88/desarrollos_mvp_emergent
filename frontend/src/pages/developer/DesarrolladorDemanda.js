// /desarrollador/demanda — D6 Demand Heatmap
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0 } from '../../components/advisor/primitives';
import * as api from '../../api/developer';

export default function DesarrolladorDemanda({ user, onLogout }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.getDemand().then(setData); }, []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D6 · DEMAND HEATMAP"
        title="Demanda de mercado"
        sub="Búsquedas reales en DesarrollosMX, demanda no atendida y forecast 30/60/90 días con Claude Sonnet."
      />

      {!data ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 30D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(data.forecast.d30)}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>búsquedas estimadas</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 60D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(data.forecast.d60)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>FORECAST 90D</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)' }}>{fmt0(data.forecast.d90)}</div>
              </Card>
              <Card>
                <div className="eyebrow" style={{ marginBottom: 4 }}>DEMANDA NO ATENDIDA</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#fcd34d' }}>{data.unmet_demand.length}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>colonias sin oferta tuya</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }} className="dem-grid">
              <Card>
                <div className="eyebrow" style={{ marginBottom: 12 }}>HEATMAP POR COLONIA</div>
                {data.by_colonia.slice(0, 12).map(c => (
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
                {data.top_queries.map((q, i) => (
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
                  { k: 'Impresiones', v: data.funnel.impressions, h: 100, c: '#6366F1' },
                  { k: 'Clicks', v: data.funnel.clicks, h: 70, c: '#8B5CF6' },
                  { k: 'Fichas', v: data.funnel.fichas, h: 42, c: '#EC4899' },
                  { k: 'Contactos', v: data.funnel.contacts, h: 14, c: '#F472B6' },
                ].map(b => (
                  <div key={b.k} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: `${b.h}%`, background: b.c, borderRadius: '8px 8px 0 0', opacity: 0.85 }} />
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.k}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmt0(b.v)}</div>
                  </div>
                ))}
              </div>
            </Card>

            {data.unmet_demand.length > 0 && (
              <Card style={{ marginTop: 14, background: 'linear-gradient(140deg, rgba(245,158,11,0.08), transparent)' }}>
                <div className="eyebrow" style={{ marginBottom: 10, color: '#fcd34d' }}>OPORTUNIDAD · DEMANDA SIN OFERTA</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {data.unmet_demand.map(u => (
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
      <style>{`@media (max-width: 940px) { .dem-grid { grid-template-columns: 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}
