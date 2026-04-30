// /asesor/comisiones — summary dashboard
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Stat, Badge, Empty, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';

const STATUS_TONE = {
  propuesta: 'brand', oferta_aceptada: 'warn', escritura: 'pink', cerrada: 'ok',
  pagando: 'warn', cobrada: 'ok', cancelada: 'bad',
};

export default function AsesorComisiones({ user, onLogout }) {
  const [sum, setSum] = useState(null);
  const [ops, setOps] = useState([]);

  useEffect(() => {
    Promise.all([api.getComisiones(), api.listOperaciones()]).then(([s, o]) => { setSum(s); setOps(o); });
  }, []);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · COMISIONES"
        title="Comisiones"
        sub="Cálculo automático por operación. Forecast 6 meses basado en operaciones con fecha_cierre estimada."
      />

      {!sum ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Stat label="Cobradas YTD" value={fmtMXN(sum.total_cobradas)} accent="#86efac" />
              <Stat label="Por cobrar" value={fmtMXN(sum.total_por_cobrar)} accent="#fcd34d" />
              <Stat label="Forecast 6m" value={fmtMXN(sum.forecast_6m)} />
              <Stat label="Operaciones totales" value={sum.ops_count} />
            </div>

            <Card>
              <div className="eyebrow" style={{ marginBottom: 12 }}>DESGLOSE POR ESTADO (split asesor 80%)</div>
              {Object.keys(sum.by_status).length === 0 ? <Empty title="Sin operaciones" sub="Crea una operación para ver el desglose." />
                : Object.entries(sum.by_status).map(([s, v]) => (
                  <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <Badge tone={STATUS_TONE[s]}>{s.replace('_', ' ')}</Badge>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{fmtMXN(v)}</div>
                  </div>
                ))
              }
            </Card>

            <Card style={{ marginTop: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>OPERACIONES RECIENTES</div>
              {ops.slice(0, 8).map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5, color: 'var(--cream)' }}>{o.code}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmtMXN(o.valor_cierre)} {o.currency} · {o.comision_pct}%</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: '#86efac' }}>{fmtMXN(o.asesor_split)}</div>
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}
    </AdvisorLayout>
  );
}
