/**
 * ExpansionSimulatorModal — Phase 4 Batch 7.1 · 4.22.2
 * Modal that runs an expansion simulation for a candidate zone (3 scenarios).
 */
import React, { useState } from 'react';
import { Card, Badge, fmt0 } from '../advisor/primitives';
import { X, Sparkle, Download, AlertTriangle, TrendUp, TrendDown } from '../icons';
import * as api from '../../api/developer';

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 10,
  background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
};

const SCENARIO_TONE = {
  conservador: 'rgba(240,235,224,0.06)',
  base: 'rgba(99,102,241,0.10)',
  agresivo: 'rgba(236,72,153,0.10)',
};
const SCENARIO_BORDER = {
  conservador: 'var(--border)',
  base: 'rgba(99,102,241,0.34)',
  agresivo: 'rgba(236,72,153,0.40)',
};

function AbsorptionLine({ scenario }) {
  const series = scenario.monthly_absorption || [];
  if (series.length === 0) return null;
  const maxPct = 100;
  const W = 280;
  const H = 80;
  const stepX = W / Math.max(series.length - 1, 1);
  const path = series.map((p, i) => {
    const x = i * stepX;
    const y = H - (Math.min(p.cumulative_pct, maxPct) / maxPct) * (H - 6) - 3;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80 }}>
      <line x1={0} y1={H - 3} x2={W} y2={H - 3} stroke="rgba(240,235,224,0.10)" strokeWidth="1" />
      <path d={path} fill="none" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {series.length > 1 && (
        <text x={W - 4} y={12} textAnchor="end" fontFamily="DM Sans" fontSize="9" fill="rgba(240,235,224,0.58)">
          {series.at(-1).cumulative_pct.toFixed(0)}%
        </text>
      )}
    </svg>
  );
}

function ScenarioCard({ scn }) {
  const beHorizon = (scn.breakeven_month || -1) > 0;
  return (
    <Card data-testid={`scn-${scn.label}`} style={{
      background: SCENARIO_TONE[scn.label] || 'rgba(240,235,224,0.04)',
      border: `1px solid ${SCENARIO_BORDER[scn.label] || 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 3 }}>ESCENARIO</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', textTransform: 'capitalize' }}>{scn.label}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>${(scn.effective_price_per_m2 || 0).toLocaleString()}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>/m² · desc {scn.discount_pct}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>REVENUE</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>${fmt0((scn.revenue_projection || 0) / 1_000_000)}M</div>
        </div>
        <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>BREAKEVEN</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: beHorizon ? 'var(--cream)' : '#fcd34d' }}>
            {beHorizon ? `Mes ${scn.breakeven_month}` : 'Fuera'}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>ABSORCIÓN ACUMULADA</div>
        <AbsorptionLine scenario={scn} />
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
          {scn.total_units_sold}/{scn.total_units_target} unidades en {scn.monthly_absorption?.length || 0} meses
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <Badge tone={(scn.sensitivity?.price_drop_5pct_impact_units || 0) >= 0 ? 'ok' : 'bad'}>
          −5% precio: {scn.sensitivity?.price_drop_5pct_impact_units >= 0 ? '+' : ''}{scn.sensitivity?.price_drop_5pct_impact_units || 0} u
        </Badge>
        <Badge tone={(scn.sensitivity?.demand_score_plus_10_impact_units || 0) >= 0 ? 'ok' : 'neutral'}>
          +10 demand: {scn.sensitivity?.demand_score_plus_10_impact_units >= 0 ? '+' : ''}{scn.sensitivity?.demand_score_plus_10_impact_units || 0} u
        </Badge>
        <Badge tone="neutral">
          −10 demand: {scn.sensitivity?.demand_score_minus_10_impact_units || 0} u
        </Badge>
      </div>

      {scn.narrative && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45,
                    margin: 0, fontStyle: 'italic', borderLeft: '2px solid rgba(236,72,153,0.4)',
                    paddingLeft: 10 }}>
          {scn.narrative}
        </p>
      )}
    </Card>
  );
}

export default function ExpansionSimulatorModal({ studyId, zoneColonia, defaultPrice = 80000, onClose }) {
  const [absorptionPct, setAbsorptionPct] = useState(80);
  const [months, setMonths] = useState(18);
  const [basePrice, setBasePrice] = useState(defaultPrice);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const [sim, setSim] = useState(null);

  const submit = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await api.simulateExpansion(studyId, {
        zone_colonia: zoneColonia, target_absorption_pct: absorptionPct,
        target_months: months, base_price_per_m2: basePrice,
      });
      setSim(r);
    } catch (e) {
      setErr(e.message || 'Error al simular');
    } finally { setRunning(false); }
  };

  const exportPdf = async () => {
    if (!sim) return;
    try {
      const r = await api.exportSimulationPdf(sim.id);
      window.open(api.siteStudyDownloadUrl(r.file_id), '_blank');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('No se pudo exportar PDF');
    }
  };

  return (
    <div data-testid="expansion-modal" style={{
      position: 'fixed', inset: 0, zIndex: 1400,
      background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <Card style={{
        width: 'min(960px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
        padding: 0, background: '#0b0e18', border: '1px solid var(--border)', marginTop: 20,
      }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="eyebrow">EXPANSION SIMULATOR · 4.22.2</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
              Simular expansión · {zoneColonia}
            </div>
          </div>
          <button data-testid="expansion-modal-close" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--cream-2)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* DISCLAIMER */}
          <div data-testid="expansion-disclaimer" style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.42)', borderRadius: 10, marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="#fcd34d" />
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              <b style={{ color: '#fcd34d' }}>Estimaciones honestas:</b> basadas en benchmarks de mercado MX por NSE + demand_score (B6) + feasibility (B7). Refinará con tu data histórica de cierres reales.
            </div>
          </div>

          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 5 }}>ABSORCIÓN OBJETIVO · {absorptionPct}%</div>
              <input data-testid="exp-absorption" type="range" min={50} max={100} value={absorptionPct}
                     onChange={e => setAbsorptionPct(+e.target.value)}
                     style={{ width: '100%', accentColor: '#EC4899' }} />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 5 }}>HORIZONTE · {months} meses</div>
              <input data-testid="exp-months" type="range" min={6} max={36} value={months}
                     onChange={e => setMonths(+e.target.value)}
                     style={{ width: '100%', accentColor: '#EC4899' }} />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 5 }}>PRECIO BASE/m² (MXN)</div>
              <input data-testid="exp-base-price" type="number" min={10000} max={2000000} step={1000}
                     value={basePrice} onChange={e => setBasePrice(+e.target.value)}
                     style={inputStyle} />
            </div>
          </div>

          <button data-testid="exp-run-btn" onClick={submit} disabled={running} style={{
            padding: '10px 20px', borderRadius: 9999,
            background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
            border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
          }}><Sparkle size={13} /> {running ? 'Calculando…' : 'Ejecutar simulación'}</button>

          {err && (
            <div style={{ padding: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)', borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 14 }}>{err}</div>
          )}

          {sim && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }} data-testid="expansion-scenarios">
                {(sim.scenarios || []).map(scn => <ScenarioCard key={scn.label} scn={scn} />)}
              </div>
              <button data-testid="exp-export-btn" onClick={exportPdf} style={{
                padding: '8px 16px', borderRadius: 9999, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}><Download size={11} /> Exportar simulación PDF</button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
