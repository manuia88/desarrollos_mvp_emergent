// W3.6 — Insurance Risk widget standalone embebible.
import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { trackWidgetEmbed } from '../../../utils/widgetTracking';
import {
  WidgetShell, WidgetCard, WidgetField, ResultRow,
  widgetInputStyle, widgetBtnPrimary,
  ApiKeyMissing, useApiKeyFromUrl, fmtPct,
} from './_widgetChrome';
import { callInsuranceRisk } from '../../../api/verticalProducts';

const PERIL_LABEL = {
  seismic: 'Sísmico', flood: 'Inundación',
  theft: 'Robo', fire: 'Incendio',
};
const RISK_COLOR = (v) => v >= 70 ? '#fca5a5' : v >= 45 ? '#fcd34d' : '#86efac';

export default function InsuranceRiskWidget() {
  const apiKey = useApiKeyFromUrl();
  const [form, setForm] = useState({
    zone_id: '', m2: '', year_built: '', floor: '',
    coverage_type: 'property',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // W5.25 · embed analytics tracking (fail-soft) · API-keyed widget
  useEffect(() => {
    if (apiKey) trackWidgetEmbed('insurance_risk', { apiKey });
  }, [apiKey]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const body = { coverage_type: form.coverage_type };
      ['zone_id'].forEach(k => { if (form[k]) body[k] = form[k]; });
      ['m2'].forEach(k => { if (form[k]) body[k] = Number(form[k]); });
      ['year_built', 'floor'].forEach(k => { if (form[k]) body[k] = parseInt(form[k]); });
      const r = await callInsuranceRisk(body, apiKey);
      setResult(r);
    } catch (err) {
      setError(err?.detail?.error || err?.detail || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WidgetShell eyebrow="Insurance Risk · W3.6" title="Underwriting · Riesgo de cobertura">
      {!apiKey ? <ApiKeyMissing /> : (
        <>
          <WidgetCard>
            <form onSubmit={onSubmit} data-testid="insurance-risk-form">
              <WidgetField label="Zona / Colonia" required>
                <input data-testid="insurance-risk-zone-input"
                  required value={form.zone_id}
                  onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                  placeholder="condesa" style={widgetInputStyle} />
              </WidgetField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <WidgetField label="Superficie m²">
                  <input data-testid="insurance-risk-m2-input"
                    type="number" value={form.m2}
                    onChange={(e) => setForm({ ...form, m2: e.target.value })}
                    placeholder="120" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Año">
                  <input data-testid="insurance-risk-year-input"
                    type="number" min="1900" max="2030" value={form.year_built}
                    onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                    placeholder="2010" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Piso">
                  <input data-testid="insurance-risk-floor-input"
                    type="number" min="0" max="60" value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    placeholder="7" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Tipo cobertura">
                  <select data-testid="insurance-risk-coverage-select"
                    value={form.coverage_type}
                    onChange={(e) => setForm({ ...form, coverage_type: e.target.value })}
                    style={widgetInputStyle}>
                    <option value="property">Propiedad</option>
                    <option value="liability">Responsabilidad</option>
                    <option value="catastrophic">Catastrófico</option>
                  </select>
                </WidgetField>
              </div>
              <button data-testid="insurance-risk-submit-btn" type="submit"
                disabled={loading}
                style={{ ...widgetBtnPrimary, marginTop: 18, opacity: loading ? 0.6 : 1 }}>
                <ShieldAlert size={14} />
                {loading ? 'Calculando…' : 'Calcular riesgo'}
              </button>
            </form>
          </WidgetCard>

          {error && (
            <WidgetCard style={{ marginTop: 14, borderColor: 'rgba(239,68,68,0.40)' }}>
              <p data-testid="insurance-risk-error" style={{ color: '#fca5a5', margin: 0, fontSize: 13 }}>
                {error}
              </p>
            </WidgetCard>
          )}

          {result && (
            <WidgetCard style={{ marginTop: 14 }} data-testid="insurance-risk-result">
              {!result.available ? (
                <p style={{ color: '#fcd34d', margin: 0, fontSize: 13 }}>
                  Cálculo no disponible: <code>{result.reason}</code>
                </p>
              ) : (
                <>
                  <div style={{
                    textAlign: 'center', padding: '8px 0 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 6,
                  }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: 'rgba(240,235,224,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.10em',
                    }}>Risk Score (0-100)</div>
                    <div data-testid="insurance-risk-score" style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, marginTop: 4,
                      color: RISK_COLOR(result.risk_score_0_100 || 0),
                    }}>{(result.risk_score_0_100 ?? 0).toFixed(1)}</div>
                  </div>
                  <ResultRow label="Prima recomendada"
                    value={fmtPct(result.premium_recommendation_pct, 3)}
                    accent="#a5b4fc" />
                  <div data-testid="insurance-risk-perils" style={{ marginTop: 14 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: 'rgba(240,235,224,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.10em',
                      marginBottom: 8,
                    }}>Desglose por peligro</div>
                    {Object.entries(result.peril_breakdown || {})
                      .filter(([k]) => k !== 'weights')
                      .map(([peril, value]) => (
                        <div key={peril} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 0',
                        }}>
                          <span style={{ minWidth: 90, fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>
                            {PERIL_LABEL[peril] || peril}
                          </span>
                          <div style={{
                            flex: 1, height: 8, borderRadius: 9999,
                            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, value)}%`, height: '100%',
                              background: RISK_COLOR(value),
                            }} />
                          </div>
                          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, minWidth: 42, textAlign: 'right', color: RISK_COLOR(value) }}>
                            {value.toFixed(0)}
                          </span>
                        </div>
                      ))}
                  </div>
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
