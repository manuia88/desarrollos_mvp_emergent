// /desarrollador → executive overview
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Stat, Badge, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { ArrowRight } from '../../components/icons';

export default function DesarrolladorDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.getDashboard().then(setData).catch(() => setData(null)); }, []);

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
