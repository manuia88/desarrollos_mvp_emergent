// W3.6 — Investor Yield widget standalone embebible.
import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  WidgetShell, WidgetCard, WidgetField, ResultRow,
  widgetInputStyle, widgetBtnPrimary,
  ApiKeyMissing, useApiKeyFromUrl, fmtMxn, fmtPct,
} from './_widgetChrome';
import { callInvestorYield } from '../../../api/verticalProducts';

export default function InvestorYieldWidget() {
  const apiKey = useApiKeyFromUrl();
  const [form, setForm] = useState({
    zone_id: '', m2: '', purchase_price: '', hold_years: '5',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const body = { hold_years: parseInt(form.hold_years || '5') };
      if (form.zone_id) body.zone_id = form.zone_id;
      if (form.m2) body.m2 = Number(form.m2);
      if (form.purchase_price) body.purchase_price = Number(form.purchase_price);
      const r = await callInvestorYield(body, apiKey);
      setResult(r);
    } catch (err) {
      setError(err?.detail?.error || err?.detail || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WidgetShell eyebrow="Investor Yield · W3.6" title="Calculadora de retorno inmobiliario">
      {!apiKey ? <ApiKeyMissing /> : (
        <>
          <WidgetCard>
            <form onSubmit={onSubmit} data-testid="investor-yield-form">
              <WidgetField label="Zona / Colonia" required>
                <input data-testid="investor-yield-zone-input"
                  required value={form.zone_id}
                  onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                  placeholder="polanco" style={widgetInputStyle} />
              </WidgetField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <WidgetField label="Superficie m²" required>
                  <input data-testid="investor-yield-m2-input"
                    required type="number" min="20" max="2000"
                    value={form.m2}
                    onChange={(e) => setForm({ ...form, m2: e.target.value })}
                    placeholder="80" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Precio compra (MXN)">
                  <input data-testid="investor-yield-price-input"
                    type="number" min="100000"
                    value={form.purchase_price}
                    onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                    placeholder="7000000" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Hold (años)" required>
                  <input data-testid="investor-yield-hold-input"
                    required type="number" min="1" max="30"
                    value={form.hold_years}
                    onChange={(e) => setForm({ ...form, hold_years: e.target.value })}
                    placeholder="5" style={widgetInputStyle} />
                </WidgetField>
              </div>
              <button data-testid="investor-yield-submit-btn" type="submit"
                disabled={loading}
                style={{ ...widgetBtnPrimary, marginTop: 18, opacity: loading ? 0.6 : 1 }}>
                <TrendingUp size={14} />
                {loading ? 'Calculando…' : 'Calcular yield'}
              </button>
            </form>
          </WidgetCard>

          {error && (
            <WidgetCard style={{ marginTop: 14, borderColor: 'rgba(239,68,68,0.40)' }}>
              <p data-testid="investor-yield-error" style={{ color: '#fca5a5', margin: 0, fontSize: 13 }}>
                {error}
              </p>
            </WidgetCard>
          )}

          {result && (
            <WidgetCard style={{ marginTop: 14 }} data-testid="investor-yield-result">
              {!result.available ? (
                <p style={{ color: '#fcd34d', margin: 0, fontSize: 13 }}>
                  Cálculo no disponible: <code>{result.reason}</code>
                </p>
              ) : (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: result.irr_pct !== undefined ? '1fr 1fr' : '1fr',
                    gap: 12, marginBottom: 6,
                  }}>
                    <div style={{
                      textAlign: 'center', padding: '12px 8px',
                      background: 'rgba(99,102,241,0.10)',
                      border: '1px solid rgba(99,102,241,0.36)',
                      borderRadius: 12,
                    }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: 'rgba(240,235,224,0.6)',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                      }}>Cap rate</div>
                      <div data-testid="investor-yield-cap-rate" style={{
                        fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#a5b4fc',
                      }}>{fmtPct(result.cap_rate_pct)}</div>
                    </div>
                    {result.irr_pct !== undefined && (
                      <div style={{
                        textAlign: 'center', padding: '12px 8px',
                        background: 'rgba(236,72,153,0.10)',
                        border: '1px solid rgba(236,72,153,0.36)',
                        borderRadius: 12,
                      }}>
                        <div style={{
                          fontSize: 10.5, fontWeight: 600,
                          color: 'rgba(240,235,224,0.6)',
                          textTransform: 'uppercase', letterSpacing: '0.10em',
                        }}>IRR</div>
                        <div data-testid="investor-yield-irr" style={{
                          fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#fbcfe8',
                        }}>{fmtPct(result.irr_pct)}</div>
                      </div>
                    )}
                  </div>

                  {result.cash_on_cash_pct !== undefined && (
                    <ResultRow label="Cash-on-cash"
                      value={fmtPct(result.cash_on_cash_pct)} accent="#a5b4fc" />
                  )}
                  {result.monthly_rent_estimate_mxn !== undefined && (
                    <ResultRow label="Renta mensual estimada"
                      value={fmtMxn(result.monthly_rent_estimate_mxn)} />
                  )}
                  {result.appreciation_total_mxn !== undefined && (
                    <ResultRow label={`Apreciación ${result.hold_years}a`}
                      value={fmtMxn(result.appreciation_total_mxn)} />
                  )}
                  {result.breakeven_months !== undefined && (
                    <ResultRow label="Breakeven (meses)"
                      value={result.breakeven_months !== null ? result.breakeven_months.toFixed(0) : '—'} />
                  )}

                  {result.monte_carlo_scenarios && (
                    <div data-testid="investor-yield-monte-carlo" style={{ marginTop: 14 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: 'rgba(240,235,224,0.6)',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                        marginBottom: 8,
                      }}>Monte Carlo · valor final {result.hold_years}a</div>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                      }}>
                        {[
                          ['p10', result.monte_carlo_scenarios.p10, '#fca5a5'],
                          ['p50', result.monte_carlo_scenarios.p50, '#a5b4fc'],
                          ['p90', result.monte_carlo_scenarios.p90, '#86efac'],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 10, padding: '8px 6px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: c }}>
                              {fmtMxn(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.methodology_summary && (
                    <p style={{ marginTop: 14, fontSize: 11, color: 'rgba(240,235,224,0.55)', lineHeight: 1.55, fontStyle: 'italic' }}>
                      {result.methodology_summary}
                    </p>
                  )}
                </>
              )}
            </WidgetCard>
          )}
        </>
      )}
    </WidgetShell>
  );
}
