// W4.4D — Phase Y.1D · What-if Simulator Panel
import React, { useEffect, useMemo, useState } from 'react';
import * as whatifApi from '../../api/whatifApi';
import { TrendUp, TrendDown, Activity, AlertCircle, Sparkle, Building } from '../icons';

const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const SCENARIO_DEFS = [
  {
    key: 'price_change',
    label: 'Cambio de precio',
    desc: 'Simula impacto de subir/bajar precio.',
  },
  {
    key: 'promo',
    label: 'Promo / Descuento',
    desc: 'Calcula lift de descuento, regalo o financiamiento.',
  },
  {
    key: 'delay',
    label: 'Retraso de entrega',
    desc: 'Mide IE_PROY · DRPI · holding cost.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMxn(n) {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(0)} K`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
}

// ─── Confidence band SVG ─────────────────────────────────────────────────────
function ConfidenceBand({ low, high, point, label = 'Forecast' }) {
  if (low === null || high === null || low === undefined || high === undefined) return null;
  const range = Math.max(Math.abs(low), Math.abs(high), Math.abs(point || 0)) * 1.2 || 1;
  const toX = v => 50 + (v / range) * 45; // map -range..+range → 5..95
  const lowX = toX(low);
  const highX = toX(high);
  const pointX = toX(point || (low + high) / 2);

  return (
    <svg viewBox="0 0 100 18" style={{ width: '100%', height: 30 }} role="img" aria-label={`${label} confidence band`}>
      {/* axis */}
      <line x1="5" y1="9" x2="95" y2="9" stroke="rgba(240,235,224,0.18)" strokeWidth="0.4" />
      <line x1={toX(0)} y1="3" x2={toX(0)} y2="15" stroke="rgba(240,235,224,0.30)" strokeWidth="0.5" strokeDasharray="1.5 1" />
      {/* band */}
      <rect
        x={Math.min(lowX, highX)} y="6" width={Math.abs(highX - lowX)} height="6"
        fill="url(#whatifGrad)" opacity="0.45" rx="1"
      />
      <defs>
        <linearGradient id="whatifGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      {/* point */}
      <circle cx={pointX} cy="9" r="1.6" fill="#fff" stroke="#EC4899" strokeWidth="0.6" />
    </svg>
  );
}

// ─── Forms ───────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{
        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: 'var(--cream-3)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
      }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 10,
    background: 'rgba(13,16,23,0.85)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
    outline: 'none',
  };
}

function PriceChangeForm({ projects, value, onChange }) {
  const dev = projects.find(p => p.id === value.project_id);
  const avgPrice = dev ? Math.round(((dev.price_from || 0) + (dev.price_to || 0)) / 2) : null;
  const m2Avg = dev?.m2_range?.length === 2 ? (dev.m2_range[0] + dev.m2_range[1]) / 2 : null;
  const ppm2 = avgPrice && m2Avg ? Math.round(avgPrice / m2Avg) : null;
  return (
    <>
      <Field label="Proyecto">
        <select data-testid="whatif-project-select" value={value.project_id || ''} onChange={e => onChange({ ...value, project_id: e.target.value })} style={inputStyle()}>
          <option value="">— Selecciona un proyecto —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Precio actual / m² (MXN)">
        <input type="text" readOnly value={ppm2 ? `$${ppm2.toLocaleString('es-MX')}` : '—'} style={{ ...inputStyle(), opacity: 0.7 }} />
      </Field>
      <Field label={`Cambio propuesto: ${value.proposed_delta_pct >= 0 ? '+' : ''}${value.proposed_delta_pct ?? 0}%`}>
        <input
          data-testid="whatif-delta-slider"
          type="range" min="-20" max="20" step="0.5"
          value={value.proposed_delta_pct ?? 0}
          onChange={e => onChange({ ...value, proposed_delta_pct: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: '#6366F1' }}
        />
      </Field>
      <Field label="Horizonte">
        <select data-testid="whatif-horizon-select" value={value.horizon_months || 6} onChange={e => onChange({ ...value, horizon_months: parseInt(e.target.value, 10) })} style={inputStyle()}>
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </Field>
    </>
  );
}

function PromoForm({ projects, value, onChange }) {
  return (
    <>
      <Field label="Proyecto">
        <select data-testid="whatif-project-select" value={value.project_id || ''} onChange={e => onChange({ ...value, project_id: e.target.value })} style={inputStyle()}>
          <option value="">— Selecciona un proyecto —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Tipo de promo">
        <select data-testid="whatif-promo-type" value={value.promo_type || 'discount'} onChange={e => onChange({ ...value, promo_type: e.target.value })} style={inputStyle()}>
          <option value="discount">Descuento %</option>
          <option value="gift">Regalo (mueble, escritura)</option>
          <option value="financing">Financiamiento sin enganche</option>
        </select>
      </Field>
      <Field label={value.promo_type === 'discount' ? 'Descuento (%)' : value.promo_type === 'gift' ? 'Valor del regalo (MXN)' : 'Plazo financiamiento (años)'}>
        <input
          data-testid="whatif-promo-value"
          type="number" step="0.1"
          value={value.promo_value ?? ''}
          onChange={e => onChange({ ...value, promo_value: parseFloat(e.target.value) })}
          style={inputStyle()}
        />
      </Field>
      <Field label={`Duración: ${value.duration_weeks ?? 4} semanas`}>
        <input
          data-testid="whatif-duration-slider"
          type="range" min="1" max="20" step="1"
          value={value.duration_weeks ?? 4}
          onChange={e => onChange({ ...value, duration_weeks: parseInt(e.target.value, 10) })}
          style={{ width: '100%', accentColor: '#EC4899' }}
        />
      </Field>
    </>
  );
}

function DelayForm({ projects, value, onChange }) {
  return (
    <>
      <Field label="Proyecto">
        <select data-testid="whatif-project-select" value={value.project_id || ''} onChange={e => onChange({ ...value, project_id: e.target.value })} style={inputStyle()}>
          <option value="">— Selecciona un proyecto —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={`Retraso: ${value.delay_months ?? 1} meses`}>
        <input
          data-testid="whatif-delay-slider"
          type="range" min="1" max="12" step="1"
          value={value.delay_months ?? 1}
          onChange={e => onChange({ ...value, delay_months: parseInt(e.target.value, 10) })}
          style={{ width: '100%', accentColor: '#EC4899' }}
        />
      </Field>
    </>
  );
}

// ─── Result card ─────────────────────────────────────────────────────────────
function ResultCard({ result }) {
  if (!result) return null;
  const o = result.outputs || {};
  const sim = result.simulation_mode || o.simulated;
  const point =
    o.projected_velocity_change_pct ??
    o.projected_lift_pct ??
    o.projected_ie_score_delta ??
    null;

  const metrics = [];
  if (o.projected_velocity_change_pct !== undefined && o.projected_velocity_change_pct !== null) {
    metrics.push({ label: 'Velocidad', value: fmtPct(o.projected_velocity_change_pct), trend: o.projected_velocity_change_pct < 0 ? 'down' : 'up' });
  }
  if (o.projected_lift_pct !== undefined && o.projected_lift_pct !== null) {
    metrics.push({ label: 'Lift conversión', value: fmtPct(o.projected_lift_pct), trend: 'up' });
  }
  if (o.projected_ie_score_delta !== undefined && o.projected_ie_score_delta !== null) {
    metrics.push({ label: 'IE_PROY Δ', value: o.projected_ie_score_delta.toFixed(2), trend: o.projected_ie_score_delta < 0 ? 'down' : 'up' });
  }
  if (o.projected_drpi_change !== undefined && o.projected_drpi_change !== null) {
    metrics.push({ label: 'DRPI Δ', value: o.projected_drpi_change.toFixed(2), trend: o.projected_drpi_change < 0 ? 'down' : 'up' });
  }
  if (o.projected_revenue_delta_mxn !== undefined && o.projected_revenue_delta_mxn !== null) {
    metrics.push({ label: 'Δ Ingreso', value: fmtMxn(o.projected_revenue_delta_mxn), trend: o.projected_revenue_delta_mxn < 0 ? 'down' : 'up' });
  }
  if (o.projected_holding_cost_mxn !== undefined && o.projected_holding_cost_mxn !== null) {
    metrics.push({ label: 'Holding cost', value: fmtMxn(o.projected_holding_cost_mxn), trend: 'down' });
  }

  return (
    <div data-testid="whatif-result-card" style={{
      padding: 18, borderRadius: 14,
      background: 'rgba(13,16,23,0.85)',
      border: '1px solid rgba(99,102,241,0.25)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Sparkle size={12} color="#a5b4fc" />
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Forecast · {result.scenario_type}
        </span>
        {sim && (
          <span data-testid="whatif-sim-badge" style={{
            padding: '2px 8px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            background: 'rgba(245,158,11,0.16)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.30)',
          }}>SIMULATED</span>
        )}
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          background: 'rgba(99,102,241,0.18)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.30)',
        }}>{(o.data_quality || 'medium').toUpperCase()}</span>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: 16 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.04em' }}>{m.label}</span>
              {m.trend === 'up' && <TrendUp size={11} color="#4ade80" />}
              {m.trend === 'down' && <TrendDown size={11} color="#f87171" />}
            </div>
            <div style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>
          Banda de confianza
        </div>
        <ConfidenceBand low={o.confidence_low} high={o.confidence_high} point={point} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
          <span>{o.confidence_low?.toFixed(2) ?? '—'}</span>
          <span>{o.confidence_high?.toFixed(2) ?? '—'}</span>
        </div>
      </div>

      {!!(o.comparables_used || []).length && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>
            Comparables usados ({o.comparables_used.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {o.comparables_used.map(c => (
              <span key={c} style={{
                padding: '3px 10px', borderRadius: 9999, fontFamily: 'monospace', fontSize: 11,
                background: 'rgba(99,102,241,0.10)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.25)',
              }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {o.recommendation_text && (
        <div data-testid="whatif-recommendation" style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.10))',
          border: '1px solid rgba(99,102,241,0.30)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Activity size={11} color="#a5b4fc" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>
              Recomendación
            </span>
          </div>
          <p style={{ margin: 0, fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55, color: 'var(--cream)' }}>
            {o.recommendation_text}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function ResultSkeleton() {
  return (
    <div style={{
      padding: 18, borderRadius: 14, minHeight: 280,
      background: 'rgba(13,16,23,0.85)', border: '1px solid rgba(255,255,255,0.06)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ height: 12, width: 120, background: 'rgba(240,235,224,0.08)', borderRadius: 4, marginBottom: 14 }} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 60, borderRadius: 10, background: 'rgba(240,235,224,0.04)' }} />
        ))}
      </div>
      <div style={{ height: 30, background: 'rgba(240,235,224,0.04)', borderRadius: 6 }} />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function WhatIfPanel({ user, projects = [] }) {
  const [scenarioType, setScenarioType] = useState('price_change');
  const [formValue, setFormValue] = useState({ project_id: '', proposed_delta_pct: 0, horizon_months: 6 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phaseYDisabled, setPhaseYDisabled] = useState(false);

  // Reset form on scenario change
  useEffect(() => {
    if (scenarioType === 'price_change') {
      setFormValue(v => ({ project_id: v.project_id, proposed_delta_pct: 0, horizon_months: 6 }));
    } else if (scenarioType === 'promo') {
      setFormValue(v => ({ project_id: v.project_id, promo_type: 'discount', promo_value: 5, duration_weeks: 4 }));
    } else if (scenarioType === 'delay') {
      setFormValue(v => ({ project_id: v.project_id, delay_months: 1 }));
    }
  }, [scenarioType]);

  // Load history when project changes
  useEffect(() => {
    if (!formValue.project_id) { setHistory([]); return; }
    whatifApi.listScenarios({ project_id: formValue.project_id, limit: 10 })
      .then(res => setHistory(res?.items || []))
      .catch(() => setHistory([]));
  }, [formValue.project_id, result]);

  const inputs = useMemo(() => {
    const { project_id: _pid, ...rest } = formValue;
    return rest;
  }, [formValue]);

  const onSubmit = async () => {
    setError(null);
    setResult(null);
    if (!formValue.project_id) {
      setError('Selecciona un proyecto.');
      return;
    }
    setLoading(true);
    try {
      const res = await whatifApi.simulate({
        project_id: formValue.project_id,
        scenario_type: scenarioType,
        inputs,
      });
      setResult(res);
      setPhaseYDisabled(false);
    } catch (e) {
      if (e.status === 403 && /phase y disabled/i.test(e.message)) {
        setPhaseYDisabled(true);
      } else {
        setError(e.message || 'Error al simular.');
      }
    } finally {
      setLoading(false);
    }
  };

  const replayHistory = async (sid) => {
    try {
      const detail = await whatifApi.getScenario(sid);
      setResult(detail);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el escenario.');
    }
  };

  // ── Phase Y disabled state ─────────────────────────────────────────────────
  if (phaseYDisabled) {
    return (
      <div data-testid="whatif-disabled" style={{
        padding: 24, borderRadius: 14,
        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertCircle size={16} color="#fcd34d" />
          <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 15, color: 'var(--cream)' }}>What-if desactivado</h3>
        </div>
        <p style={{ margin: 0, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
          El simulador What-if está desactivado por superadmin para tu organización. Contacta a tu administrador para activarlo.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="whatif-panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderRadius: 14,
        background: 'rgba(13,16,23,0.65)', border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <Building size={16} color="#a5b4fc" />
        <span style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>
          What-if Simulator
        </span>
        {result?.tier && (
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            background: GRAD, color: '#fff',
          }}>Tier {result.tier}</span>
        )}
      </div>

      {/* 3 selector cards */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {SCENARIO_DEFS.map(s => {
          const active = scenarioType === s.key;
          return (
            <button
              key={s.key}
              data-testid={`whatif-scenario-${s.key}`}
              onClick={() => setScenarioType(s.key)}
              style={{
                padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                background: active ? 'rgba(99,102,241,0.12)' : 'rgba(13,16,23,0.55)',
                border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.06)',
                color: 'var(--cream)', backdropFilter: 'blur(24px)',
                transition: 'background 0.18s, border 0.18s',
              }}
            >
              <div style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.5 }}>{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Body 2 columns */}
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr', alignItems: 'start' }} className="whatif-body-grid">
        <div data-testid="whatif-form" style={{
          padding: 18, borderRadius: 14,
          background: 'rgba(13,16,23,0.65)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {scenarioType === 'price_change' && <PriceChangeForm projects={projects} value={formValue} onChange={setFormValue} />}
          {scenarioType === 'promo' && <PromoForm projects={projects} value={formValue} onChange={setFormValue} />}
          {scenarioType === 'delay' && <DelayForm projects={projects} value={formValue} onChange={setFormValue} />}

          <button
            data-testid="whatif-simulate-btn"
            disabled={loading}
            onClick={onSubmit}
            style={{
              marginTop: 6, padding: '10px 22px', borderRadius: 9999,
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer',
              background: loading ? 'rgba(99,102,241,0.30)' : GRAD,
              color: '#fff', border: 'none', opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.18s',
            }}
          >
            {loading ? 'Simulando…' : 'Simular impacto'}
          </button>

          {error && (
            <div data-testid="whatif-error" style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)',
              fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5',
            }}>{error}</div>
          )}
        </div>

        <div>
          {loading && <ResultSkeleton />}
          {!loading && !result && (
            <div data-testid="whatif-empty" style={{
              padding: 24, borderRadius: 14, textAlign: 'center',
              background: 'rgba(13,16,23,0.55)', border: '1px dashed rgba(255,255,255,0.10)',
              color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13,
            }}>
              Selecciona un escenario y simula el impacto antes de ejecutar.
            </div>
          )}
          {!loading && result && <ResultCard result={result} />}
        </div>
      </div>

      {/* Historial collapsible */}
      {history.length > 0 && (
        <div style={{
          padding: 14, borderRadius: 14,
          background: 'rgba(13,16,23,0.55)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button
            data-testid="whatif-history-toggle"
            onClick={() => setHistoryOpen(o => !o)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: 'var(--cream-2)',
              letterSpacing: '0.04em',
            }}
          >
            {historyOpen ? '▼' : '▶'} Historial · {history.length} simulación{history.length === 1 ? '' : 'es'}
          </button>
          {historyOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(h => (
                <button
                  key={h.scenario_id}
                  data-testid={`whatif-history-${h.scenario_id}`}
                  onClick={() => replayHistory(h.scenario_id)}
                  style={{
                    padding: '8px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.06)',
                    color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{h.scenario_id}</span>
                  {' · '}
                  <span style={{ fontWeight: 700 }}>{h.scenario_type}</span>
                  {' · '}
                  <span style={{ color: 'var(--cream-3)' }}>{h.created_at?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (min-width: 760px) {
          .whatif-body-grid { grid-template-columns: 360px 1fr !important; }
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
