/**
 * Phase 4 Batch 22 — InsightsEngagement sub-tab.
 * Actor split (asesor vs cliente) + top units + 24h histogram + conversión.
 */
import React, { useEffect, useState } from 'react';
import { getInsightsEngagement } from '../../../api/insights';

const PERIODS = [
  { key: '7d',  label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
];

function ActorBar({ asesor = 0, cliente = 0 }) {
  const total = asesor + cliente;
  if (!total) {
    return (
      <div data-testid="actor-bar-empty" style={{
        padding: 16, color: 'var(--cream-3)', fontSize: 12, textAlign: 'center',
        background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.10)', borderRadius: 12,
      }}>
        Sin eventos de engagement en este periodo.
      </div>
    );
  }
  const aPct = (asesor / total) * 100;
  const cPct = 100 - aPct;
  return (
    <div data-testid="actor-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', height: 32, borderRadius: 9999, overflow: 'hidden',
        border: '1px solid rgba(240,235,224,0.10)',
      }}>
        <div data-testid="actor-bar-asesor" style={{
          width: `${aPct}%`, background: 'var(--theme)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          {aPct >= 12 && `Asesor ${Math.round(aPct)}%`}
        </div>
        <div data-testid="actor-bar-cliente" style={{
          width: `${cPct}%`, background: 'var(--theme-3)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          {cPct >= 12 && `Cliente ${Math.round(cPct)}%`}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cream-3)' }}>
        <span>Asesor: {asesor}</span>
        <span>Cliente: {cliente}</span>
        <span>Total: {total}</span>
      </div>
    </div>
  );
}

function TopUnitsList({ title, items, testid, color }) {
  return (
    <div data-testid={testid} style={{
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.10)',
      borderRadius: 12, padding: 14,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color, marginBottom: 10,
      }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--cream-3)', fontSize: 12 }}>Sin datos.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((u, i) => (
            <li key={u.unit_id || i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--cream-2)', fontFamily: 'DM Sans, sans-serif',
            }}>
              <span>{u.unit_id}</span>
              <span style={{ fontWeight: 700 }}>{u.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HourHistogram({ data = [] }) {
  if (!data.length) return (
    <div style={{ color: 'var(--cream-3)', fontSize: 12 }}>Sin distribución horaria.</div>
  );
  const map = new Map(data.map(d => [d.hour, d.count]));
  const bars = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) || 0 }));
  const max = Math.max(...bars.map(b => b.count), 1);
  return (
    <div data-testid="hour-histogram" style={{
      display: 'flex', alignItems: 'flex-end', gap: 2, height: 100,
      padding: '8px 0', borderBottom: '1px solid rgba(240,235,224,0.10)',
    }}>
      {bars.map(b => (
        <div key={b.hour} title={`${b.hour}h: ${b.count}`} style={{
          flex: 1, height: `${(b.count / max) * 100}%`, minHeight: 2,
          background: 'linear-gradient(180deg, var(--theme), var(--theme-3))',
          borderRadius: 2,
        }} />
      ))}
    </div>
  );
}

export default function InsightsEngagement({ projectId }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    getInsightsEngagement(projectId, period)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, period]);

  return (
    <div data-testid="engagement-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Period chips */}
      <div data-testid="engagement-period" style={{ display: 'flex', gap: 6 }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            data-testid={`engagement-period-${p.key}`}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              border: '1px solid rgba(240,235,224,0.14)',
              background: period === p.key
                ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
              color: period === p.key ? '#fff' : 'var(--cream-2)',
              fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer',
            }}>{p.label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 24, color: 'var(--cream-3)' }}>Cargando engagement…</div>}
      {err && <div style={{ padding: 16, color: '#fca5a5' }}>Error: {err}</div>}
      {data && !loading && (
        <>
          <ActorBar asesor={data.total_visits_asesor} cliente={data.total_visits_cliente} />

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <TopUnitsList
              testid="top-units-asesor" color="var(--theme)"
              title="Top unidades · Asesor"
              items={data.top_units_asesor || []} />
            <TopUnitsList
              testid="top-units-cliente" color="#f9a8d4"
              title="Top unidades · Cliente"
              items={data.top_units_cliente || []} />
          </div>

          <div style={{
            background: 'rgba(240,235,224,0.04)',
            border: '1px solid rgba(240,235,224,0.10)',
            borderRadius: 12, padding: 14,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              color: 'var(--cream-3)', marginBottom: 8,
            }}>Distribución horaria · 24h</div>
            <HourHistogram data={data.time_distribution || []} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cream-3)', marginTop: 4 }}>
              <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
            </div>
          </div>

          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
            <div data-testid="conv-asesor" style={{
              background: 'rgba(var(--theme-rgb),0.10)',
              border: '1px solid rgba(var(--theme-rgb),0.30)',
              borderRadius: 12, padding: 14,
            }}>
              <span style={{ fontSize: 10, color: 'var(--theme)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Conv. Asesor</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit' }}>
                {(data.conversion_rate_per_actor?.asesor ?? 0).toFixed(1)}%
              </div>
              <span style={{ fontSize: 10, color: 'var(--cream-3)' }}>visitas → cita</span>
            </div>
            <div data-testid="conv-cliente" style={{
              background: 'rgba(var(--theme-rgb),0.10)',
              border: '1px solid rgba(var(--theme-rgb),0.30)',
              borderRadius: 12, padding: 14,
            }}>
              <span style={{ fontSize: 10, color: '#f9a8d4', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Conv. Cliente</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit' }}>
                {(data.conversion_rate_per_actor?.cliente ?? 0).toFixed(1)}%
              </div>
              <span style={{ fontSize: 10, color: 'var(--cream-3)' }}>visitas → cita</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
