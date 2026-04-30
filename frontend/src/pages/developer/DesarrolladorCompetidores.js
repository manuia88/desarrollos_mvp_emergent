// /desarrollador/competidores — D3 Competitor Radar
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, fmt0, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Radio } from '../../components/icons';

export default function DesarrolladorCompetidores({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [radius, setRadius] = useState(2);
  const [toast, setToast] = useState(null);

  useEffect(() => { api.getCompetitors(null, radius).then(setData); }, [radius]);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D3 · COMPETITOR RADAR"
        title="Radar de competidores"
        sub="Comparativa side-by-side mi proyecto vs top competidores en tu zona. Alertas de pricing y absorción."
        actions={
          <select value={radius} onChange={e => setRadius(+e.target.value)} className="asr-select" data-testid="comp-radius">
            <option value={1}>Radio 1km</option>
            <option value={2}>Radio 2km</option>
            <option value={3}>Radio 3km</option>
            <option value={5}>Radio 5km</option>
          </select>
        }
      />

      {!data || !data.my_project ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            {data.alerts.length > 0 && (
              <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(239,68,68,0.10), transparent)', border: '1px solid rgba(239,68,68,0.32)' }}>
                <div className="eyebrow" style={{ color: '#fca5a5', marginBottom: 10 }}>ALERTAS · ACCIÓN RECOMENDADA</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.alerts.map((a, i) => (
                    <div key={i} data-testid={`comp-alert-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
                      <Radio size={11} color="#fca5a5" />
                      {a.msg}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), transparent)' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>MI PROYECTO ANCLA</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{data.my_project.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {(data.my_project.amenities || []).slice(0, 5).map(a => <Badge key={a} tone="brand">{a}</Badge>)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <Stat label="Precio/m²" value={fmtMXN(data.my_project.price_sqm_mxn)} />
                  <Stat label="Absorción" value={`${data.my_project.absorption_pct}%`} />
                  <Stat label="Disponibles" value={`${data.my_project.units_available}/${data.my_project.units_total}`} />
                </div>
              </div>
            </Card>

            <div className="eyebrow" style={{ marginBottom: 8 }}>COMPETIDORES EN TU RADIO</div>
            {data.competitors.length === 0 ? <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Sin competidores detectados en este radio.</Card>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.competitors.map(c => (
                    <Card key={c.id} data-testid={`comp-${c.id}`}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', alignItems: 'center', gap: 14 }} className="comp-row">
                        <div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{c.name}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                            {c.colonia} · {c.distance_km}km · {c.stage.replace('_', ' ')}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {(c.amenities || []).slice(0, 3).map(a => <Badge key={a} tone="neutral">{a}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Precio/m²</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmtMXN(c.price_sqm_mxn)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vs mío</div>
                          <Badge tone={c.delta_vs_mine_pct > 0 ? 'ok' : 'bad'}>{c.delta_vs_mine_pct > 0 ? '+' : ''}{c.delta_vs_mine_pct}%</Badge>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Absorción</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{c.absorption_pct}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Disponibles</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmt0(c.units_available)}/{fmt0(c.units_total)}</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
          </>
        )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`@media (max-width: 940px) { .comp-row { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{value}</div>
    </div>
  );
}
