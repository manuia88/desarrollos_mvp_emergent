// W4.14 — InvestmentSimulator · simulador embed y página pública completa
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ScenarioCard from './ScenarioCard';
import CashFlowChart from './CashFlowChart';

const API = process.env.REACT_APP_BACKEND_URL;

const COLONIAS = [
  'polanco', 'condesa', 'roma', 'roma-norte', 'narvarte', 'del-valle',
  'santa-fe', 'coyoacan', 'doctores', 'tepito', 'xochimilco', 'pedregal',
  'tlalpan', 'lindavista', 'satélite', 'echegaray',
];

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export default function InvestmentSimulator({ prefilled = {}, compact = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    precio_entrada: prefilled.precio || 3_000_000,
    plazo_meses: prefilled.plazo || 120,
    m2: prefilled.m2 || 80,
    colonia_slug: prefilled.colonia || 'del-valle',
    apreciacion_anual_user_pct: '',
    financiamiento_pct: 0.80,
  });
  const [result, setResult] = useState(null);
  const [stressResult, setStressResult] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showStress, setShowStress] = useState(false);
  const [showComparables, setShowComparables] = useState(false);
  const [error, setError] = useState('');
  const [baseline, setBaseline] = useState(null);

  // Load baseline for current colonia
  useEffect(() => {
    fetch(`${API}/api/investment-simulator/colonia/${form.colonia_slug}/baseline`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.ok && setBaseline(d))
      .catch(() => {});
  }, [form.colonia_slug]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setStressResult(null);
    try {
      const payload = {
        precio_entrada: parseFloat(form.precio_entrada),
        plazo_meses: parseInt(form.plazo_meses),
        m2: parseFloat(form.m2),
        colonia_slug: form.colonia_slug,
        financiamiento_pct: parseFloat(form.financiamiento_pct),
      };
      if (form.apreciacion_anual_user_pct !== '') {
        payload.apreciacion_anual_user_pct = parseFloat(form.apreciacion_anual_user_pct);
      }
      const r = await fetch(`${API}/api/investment-simulator/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) {
        setResult(d);
        // PostHog
        try { window.posthog?.capture('investment_simulator_used', { colonia: form.colonia_slug, precio: form.precio_entrada }); } catch {}
        // Load comparables
        fetch(`${API}/api/investment-simulator/colonia/${form.colonia_slug}/comparables?precio=${form.precio_entrada}`)
          .then(r2 => r2.ok ? r2.json() : null)
          .then(d2 => d2?.alternatives && setComparables(d2.alternatives))
          .catch(() => {});
      } else {
        setError('Error al calcular. Intenta con valores diferentes.');
      }
    } catch {
      setError('No se pudo conectar al servidor. Intenta nuevamente.');
    }
    setLoading(false);
  };

  const handleStressTest = async () => {
    if (!result) return;
    setShowStress(s => !s);
    if (!stressResult && result) {
      try {
        const r = await fetch(`${API}/api/investment-simulator/stress-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        });
        const d = await r.json();
        if (d.ok) setStressResult(d);
      } catch {}
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: 'var(--cream)',
    fontFamily: 'DM Sans',
    fontSize: 13,
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
  };

  const labelStyle = {
    fontFamily: 'DM Sans',
    fontSize: 11,
    color: 'var(--cream-3)',
    marginBottom: 4,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Form */}
      <form onSubmit={handleSubmit} data-testid="simulador-form">
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Precio de entrada (MXN)</label>
            <input
              type="number"
              data-testid="simulador-input-precio"
              value={form.precio_entrada}
              onChange={e => setForm(f => ({ ...f, precio_entrada: e.target.value }))}
              min="100000"
              max="1000000000"
              step="50000"
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Plazo (meses)</label>
            <select
              data-testid="simulador-input-plazo"
              value={form.plazo_meses}
              onChange={e => setForm(f => ({ ...f, plazo_meses: e.target.value }))}
              style={inputStyle}
            >
              {[60, 84, 120, 180, 240, 300, 360].map(p => (
                <option key={p} value={p} style={{ background: '#06080F' }}>{p} meses ({Math.round(p/12)}a)</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Superficie (m²)</label>
            <input
              type="number"
              data-testid="simulador-input-m2"
              value={form.m2}
              onChange={e => setForm(f => ({ ...f, m2: e.target.value }))}
              min="10"
              max="1000"
              step="5"
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Colonia</label>
            <select
              data-testid="simulador-input-colonia"
              value={form.colonia_slug}
              onChange={e => setForm(f => ({ ...f, colonia_slug: e.target.value }))}
              style={inputStyle}
            >
              {COLONIAS.map(c => (
                <option key={c} value={c} style={{ background: '#06080F' }}>
                  {c.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Apreciación anual estimada (%)
              {baseline && <span style={{ color: '#6366F1', marginLeft: 6 }}>(base: {baseline.base_aprec_anual_pct}%)</span>}
            </label>
            <input
              type="number"
              data-testid="simulador-input-apreciacion"
              value={form.apreciacion_anual_user_pct}
              onChange={e => setForm(f => ({ ...f, apreciacion_anual_user_pct: e.target.value }))}
              placeholder={baseline ? `${baseline.base_aprec_anual_pct}` : '5.0'}
              min="0"
              max="30"
              step="0.5"
              style={inputStyle}
            />
          </div>
        </div>

        {baseline && (
          <div style={{ fontSize: 11, fontFamily: 'DM Sans', color: 'var(--cream-3)', marginBottom: 12 }}>
            Zona: <strong style={{ color: 'var(--cream)' }}>{baseline.tier_zona}</strong>
            {baseline.avg_price_per_m2 && <> · Precio m² promedio: <strong style={{ color: 'var(--cream)' }}>{fmt(baseline.avg_price_per_m2)}</strong></>}
            {baseline.mortgage_rate_annual_pct && <> · Tasa hipotecaria ref.: <strong style={{ color: 'var(--cream)' }}>{baseline.mortgage_rate_annual_pct}%</strong></>}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            padding: '10px 24px', borderRadius: 9999,
            background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(90deg, #6366F1, #EC4899)',
            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          {loading ? 'Calculando...' : 'Simular inversión'}
        </button>

        {error && (
          <div style={{ color: '#EF4444', fontSize: 12, fontFamily: 'DM Sans', marginTop: 8 }}>{error}</div>
        )}
      </form>

      {/* Results */}
      {result && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 16 }}>
            Resultados de simulación · {result.colonia_slug?.replace(/-/g, ' ')}
          </div>

          {/* 3 Scenario Cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {['conservador', 'base', 'optimista'].map(tier => (
              <ScenarioCard
                key={tier}
                tier={tier}
                scenario={result[tier]}
                onExpand={() => {
                  try { window.posthog?.capture('investment_scenario_viewed', { tier, colonia: result.colonia_slug }); } catch {}
                }}
              />
            ))}
          </div>

          {/* CashFlow Chart */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Valor de la propiedad · proyección mensual
            </div>
            <CashFlowChart
              conservador={result.conservador?.cash_flow_monthly}
              base={result.base?.cash_flow_monthly}
              optimista={result.optimista?.cash_flow_monthly}
              metric="valor_propiedad"
            />
          </div>

          {/* Stress test */}
          <div style={{ marginBottom: 20 }}>
            <button
              data-testid="stress-test-toggle"
              onClick={handleStressTest}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                padding: '7px 16px', borderRadius: 9999, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.12)',
                background: showStress ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: showStress ? '#a5b4fc' : 'var(--cream-3)',
                transition: 'all 0.15s',
              }}
            >
              {showStress ? 'Ocultar análisis de sensibilidad' : 'Análisis de sensibilidad (stress test)'}
            </button>

            {showStress && stressResult && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {[
                  ['recesion', 'Recesion', stressResult.recesion],
                  ['alza_tasas', 'Alza de tasas', stressResult.alza_tasas],
                  ['supply_shock', 'Supply shock', stressResult.supply_shock],
                ].map(([key, label, s]) => (
                  <div key={key} style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#FCA5A5', marginBottom: 8 }}>{label}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                      ROI: <strong style={{ color: 'var(--cream)' }}>{s?.roi_pct != null ? `${s.roi_pct.toFixed(1)}%` : '—'}</strong><br />
                      TIR: <strong style={{ color: 'var(--cream)' }}>{s?.tir_anual_pct != null ? `${s.tir_anual_pct.toFixed(1)}%` : '—'}</strong><br />
                      <span style={{ opacity: 0.7 }}>{s?.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comparables */}
          {comparables.length > 0 && (
            <div data-testid="comparables-section">
              <button
                onClick={() => setShowComparables(s => !s)}
                style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                  padding: '7px 16px', borderRadius: 9999, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: 'var(--cream-3)',
                  marginBottom: 12, transition: 'all 0.15s',
                }}
              >
                {showComparables ? 'Ocultar comparables' : `Ver proyectos similares (${comparables.length})`}
              </button>

              {showComparables && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {comparables.map((c, i) => (
                    <div key={i} style={{
                      background: 'rgba(13,16,23,0.85)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10, padding: '12px 14px', minWidth: 160,
                    }}>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream)', marginBottom: 4 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{c.zone_id} · {fmt(c.price_from)}</div>
                      <a href={c.simulador_url} style={{ fontSize: 11, color: '#6366F1', marginTop: 4, display: 'block' }}>Simular</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CTA asesor */}
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => {
                try { window.posthog?.capture('investment_lead_captured', { colonia: result.colonia_slug }); } catch {}
                navigate('/marketplace');
              }}
              style={{
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                padding: '10px 22px', borderRadius: 9999,
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              Hablar con asesor sobre esta inversión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
