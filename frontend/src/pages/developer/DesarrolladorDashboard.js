// /desarrollador → executive overview
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Stat, Badge, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import * as docsApi from '../../api/documents';
import { ArrowRight, Sparkle } from '../../components/icons';

export default function DesarrolladorDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [syncPending, setSyncPending] = useState({ count: 0, items: [] });
  useEffect(() => {
    api.getDashboard().then(setData).catch(() => setData(null));
    docsApi.getSyncPending('developer').then(setSyncPending).catch(() => {});
  }, []);

  const totalPendingFields = syncPending.items?.reduce((acc, x) => acc + (x.synced_field_count || 0), 0) || 0;
  const pausedDevs = (syncPending.items || []).filter(x => x.auto_sync_paused_reason).length;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="PORTAL DESARROLLADOR"
        title={`Buenos días, ${(user?.name || '').split(' ')[0]}`}
        sub="Panorama operativo del portafolio en tiempo real."
      />

      {!data ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Stat label="Desarrollos" value={data.developments_count} />
              <Stat label="Unidades totales" value={data.units_total} />
              <Stat label="Disponibles" value={data.units_available} />
              <Stat label="Reservadas" value={data.units_reserved} accent="#fcd34d" />
              <Stat label="Vendidas" value={data.units_sold} accent="#86efac" />
              <Stat label="Absorción" value={`${data.absorption_pct}%`} />
              <Stat label="Ingresos cerrados" value={fmtMXN(data.revenue_booked)} accent="#86efac" />
              <Stat label="Pipeline reservado" value={fmtMXN(data.revenue_pipeline)} accent="#fcd34d" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }} className="ddash-grid">
              <Card style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.1), transparent)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>SUGERENCIAS DE PRECIO</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, color: 'var(--cream)', letterSpacing: '-0.022em' }}>
                    {data.pricing_alerts}
                  </div>
                  <Link to="/desarrollador/pricing" className="btn btn-glass btn-sm">Revisar <ArrowRight size={10} /></Link>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>pendientes de aprobación del director comercial</div>
              </Card>
              <Card style={{ background: 'linear-gradient(140deg, rgba(236,72,153,0.1), transparent)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>ALERTAS DE COMPETIDORES</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, color: 'var(--cream)', letterSpacing: '-0.022em' }}>
                    {data.competitor_alerts || 0}
                  </div>
                  <Link to="/desarrollador/competidores" className="btn btn-glass btn-sm">Radar <ArrowRight size={10} /></Link>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>movimientos relevantes en tu zona</div>
              </Card>
            </div>

            {/* Phase 7.5 — Auto-Sync widget */}
            {syncPending.count > 0 && (
              <Card data-testid="dash-sync-card" style={{ marginBottom: 22, background: 'linear-gradient(140deg, rgba(99,102,241,0.1), transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>AUTO-SYNC · DOCUMENT INTELLIGENCE</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.018em', marginBottom: 4 }}>
                      <Sparkle size={13} color="var(--indigo-3)" /> {totalPendingFields} campo{totalPendingFields === 1 ? '' : 's'} sincronizado{totalPendingFields === 1 ? '' : 's'} en {syncPending.count} desarrollo{syncPending.count === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                      Tus documentos legales y comerciales están alimentando automáticamente la ficha pública del marketplace.
                      {pausedDevs > 0 && <span style={{ color: '#fcd34d' }}> · {pausedDevs} pausado{pausedDevs === 1 ? '' : 's'} por críticos cross-check.</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {syncPending.items.slice(0, 4).map(s => (
                        <Link key={s.development_id} to={`/desarrollador/inventario?dev=${s.development_id}`} style={{
                          padding: '4px 12px', borderRadius: 9999, textDecoration: 'none',
                          background: s.auto_sync_paused_reason ? 'rgba(245,158,11,0.10)' : 'rgba(99,102,241,0.10)',
                          border: `1px solid ${s.auto_sync_paused_reason ? 'rgba(245,158,11,0.32)' : 'rgba(99,102,241,0.28)'}`,
                          color: s.auto_sync_paused_reason ? '#fcd34d' : '#c7d2fe',
                          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                        }}>{s.development_id} · {s.synced_field_count} campos</Link>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <div className="eyebrow" style={{ marginBottom: 12 }}>DESARROLLOS ACTIVOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {data.developments.map(d => (
                  <Link key={d.id} to={`/desarrollador/inventario?dev=${d.id}`} data-testid={`ddev-${d.id}`} style={{
                    padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, textDecoration: 'none',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.01em' }}>{d.name}</div>
                      <Badge tone={d.stage === 'preventa' ? 'pink' : d.stage === 'en_construccion' ? 'warn' : 'ok'}>{d.stage.replace('_', ' ')}</Badge>
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 8 }}>
                      {d.colonia} · entrega {d.delivery_estimate}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{d.units_available}/{d.units_total}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>desde {fmtMXN(d.price_from)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </>
        )}

      <style>{`@media (max-width: 880px) { .ddash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}
