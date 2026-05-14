// W3.1A Phase 5 — ConstructionCostPanel: cost/m², trend sparkline, 12-month forecast
import React, { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { Card } from '../advisor/primitives';
import { getConstructionCost, forecastConstructionCost } from '../../api/phase5Foundation';

const TIERS  = ['entry', 'mid', 'luxury'];
const TYPES  = ['vertical', 'horizontal'];
const TIER_LABEL  = { entry: 'Económico', mid: 'Medio', luxury: 'Lujo' };
const TYPE_LABEL  = { vertical: 'Vertical', horizontal: 'Horizontal' };

function fmtMXN(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const W = 220, H = 50;
  const vals = data.map(d => d.cost_per_m2_mxn || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * (H - 8) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} data-testid="cost-sparkline">
      <polyline points={pts} fill="none" stroke="var(--theme)" strokeWidth="2" />
      {data.map((d, i) => i % 3 === 0 && (
        <text key={i} x={(i / (vals.length - 1)) * W} y={H} fontSize="7" fill="rgba(240,235,224,0.4)" textAnchor="middle" fontFamily="DM Sans">
          M{d.month}
        </text>
      ))}
    </svg>
  );
}

export default function ConstructionCostPanel({ zone_id, zone_name }) {
  const [tier, setTier]   = useState('mid');
  const [btype, setBtype] = useState('vertical');
  const [m2, setM2]       = useState(2000);
  const [data, setData]   = useState(null);
  const [fcst, setFcst]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState(null);

  const load = async () => {
    if (!zone_id) return;
    setLoading(true);
    setErr(null);
    try {
      const [costData, fcstData] = await Promise.all([
        getConstructionCost(zone_id, btype, tier),
        forecastConstructionCost({ zone_id, m2: Number(m2), tier, building_type: btype }),
      ]);
      setData(costData);
      setFcst(fcstData);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [zone_id, tier, btype]); // eslint-disable-line

  return (
    <Card
      data-testid="construction-cost-panel"
      style={{ marginBottom: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={14} color="var(--theme)" />
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            Costo de construcción estimado
          </span>
          {zone_name && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>· {zone_name}</span>
          )}
        </div>
        <button
          onClick={load}
          data-testid="cost-panel-refresh"
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9999, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={11} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Actualizar</span>
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPES.map(t => (
            <button
              key={t}
              data-testid={`cost-type-${t}`}
              onClick={() => setBtype(t)}
              style={{
                padding: '4px 12px', borderRadius: 9999,
                background: btype === t ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${btype === t ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: btype === t ? 'var(--theme)' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer',
              }}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIERS.map(t => (
            <button
              key={t}
              data-testid={`cost-tier-${t}`}
              onClick={() => setTier(t)}
              style={{
                padding: '4px 12px', borderRadius: 9999,
                background: tier === t ? 'rgba(var(--theme-rgb),0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tier === t ? 'rgba(var(--theme-rgb),0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: tier === t ? '#f9a8d4' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer',
              }}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>
          Error: {err}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Calculando…</div>
      ) : data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Main KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px', padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Costo / m²</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {fmtMXN(data.cost_per_m2_mxn)}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>
                Confianza {data.confidence_pct}%
              </div>
            </div>
            {fcst && (
              <div style={{ flex: '1 1 140px', padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.2)' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total {m2} m²</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                  {fmtMXN(fcst.total_today_mxn)}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>
                  En 12 meses: {fmtMXN((fcst.monthly_evolution || [])[11]?.total_mxn)}
                </div>
              </div>
            )}
          </div>

          {/* Sparkline — 12 months forecast */}
          {fcst && fcst.monthly_evolution?.length > 0 && (
            <div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginBottom: 6 }}>
                Proyección 12 meses (+6% anual estimado)
              </div>
              <Sparkline data={fcst.monthly_evolution} />
            </div>
          )}

          {/* Stub warning */}
          {data.stub_reason && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#fcd34d', padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              Datos parciales: {data.stub_reason}
            </div>
          )}

          {/* Sources */}
          {data.sources && Object.keys(data.sources).length > 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.3)' }}>
              Fuentes: {Object.entries(data.sources).map(([k, v]) => `${k.toUpperCase()}=${v}`).join(' · ')}
            </div>
          )}
          {(!data.sources || Object.keys(data.sources).length === 0) && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.3)' }}>
              Fuentes: BANXICO INPP · INEGI INPC (pendiente token)
            </div>
          )}
        </div>
      )}

      {/* m2 input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
          m² del proyecto:
        </label>
        <input
          data-testid="cost-m2-input"
          type="number"
          min={100}
          max={500000}
          value={m2}
          onChange={e => setM2(e.target.value)}
          onBlur={load}
          style={{
            width: 90, padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
          }}
        />
      </div>
    </Card>
  );
}
