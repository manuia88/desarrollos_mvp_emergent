// W3.6 — Bank AVM widget standalone embebible.
import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { trackWidgetEmbed } from '../../../utils/widgetTracking';
import {
  WidgetShell, WidgetCard, WidgetField, ResultRow,
  widgetInputStyle, widgetBtnPrimary,
  ApiKeyMissing, useApiKeyFromUrl,
  fmtMxn, fmtPct,
} from './_widgetChrome';
import { callBankAvm } from '../../../api/verticalProducts';

export default function BankAvmWidget() {
  const apiKey = useApiKeyFromUrl();
  const [form, setForm] = useState({
    zone_id: '', m2: '', recamaras: '', baños: '', year_built: '', floor: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // W5.25 · embed analytics tracking (fail-soft) · API-keyed widget
  useEffect(() => {
    if (apiKey) trackWidgetEmbed('bank_avm', { apiKey });
  }, [apiKey]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const body = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v === '' || v === null) return;
        body[k] = ['m2', 'lat', 'lng'].includes(k) ? Number(v) : (
          ['recamaras', 'baños', 'year_built', 'floor'].includes(k) ? parseInt(v) : v
        );
      });
      const r = await callBankAvm(body, apiKey);
      setResult(r);
    } catch (err) {
      setError(err?.detail?.error || err?.detail || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WidgetShell eyebrow="Bank AVM · W3.6" title="Valoración pre-hipotecaria">
      {!apiKey ? <ApiKeyMissing /> : (
        <>
          <WidgetCard>
            <form onSubmit={onSubmit} data-testid="bank-avm-form">
              <WidgetField label="Zona / Colonia" required>
                <input data-testid="bank-avm-zone-input"
                  required value={form.zone_id}
                  onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                  placeholder="polanco" style={widgetInputStyle} />
              </WidgetField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <WidgetField label="Superficie m²" required>
                  <input data-testid="bank-avm-m2-input"
                    required type="number" min="20" max="2000"
                    value={form.m2}
                    onChange={(e) => setForm({ ...form, m2: e.target.value })}
                    placeholder="80" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Recámaras">
                  <input data-testid="bank-avm-recamaras-input"
                    type="number" min="0" max="10"
                    value={form.recamaras}
                    onChange={(e) => setForm({ ...form, recamaras: e.target.value })}
                    placeholder="2" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Baños">
                  <input data-testid="bank-avm-banos-input"
                    type="number" min="0" max="10"
                    value={form.baños}
                    onChange={(e) => setForm({ ...form, baños: e.target.value })}
                    placeholder="2" style={widgetInputStyle} />
                </WidgetField>
                <WidgetField label="Año construcción">
                  <input data-testid="bank-avm-year-input"
                    type="number" min="1900" max="2030"
                    value={form.year_built}
                    onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                    placeholder="2018" style={widgetInputStyle} />
                </WidgetField>
              </div>
              <button data-testid="bank-avm-submit-btn" type="submit"
                disabled={loading}
                style={{ ...widgetBtnPrimary, marginTop: 18, opacity: loading ? 0.6 : 1 }}>
                <Building2 size={14} />
                {loading ? 'Calculando…' : 'Calcular AVM'}
              </button>
            </form>
          </WidgetCard>

          {error && (
            <WidgetCard style={{ marginTop: 14, borderColor: 'rgba(239,68,68,0.40)' }}>
              <p data-testid="bank-avm-error" style={{ color: '#fca5a5', margin: 0, fontSize: 13 }}>
                {error}
              </p>
            </WidgetCard>
          )}

          {result && (
            <WidgetCard style={{ marginTop: 14 }} data-testid="bank-avm-result">
              {!result.available ? (
                <p style={{ color: '#fcd34d', margin: 0, fontSize: 13 }}>
                  Estimación no disponible: <code>{result.reason}</code>
                </p>
              ) : (
                <>
                  <div style={{
                    textAlign: 'center', padding: '8px 0 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: 6,
                  }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: 'rgba(240,235,224,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.10em',
                    }}>Valor estimado</div>
                    <div data-testid="bank-avm-value-mxn" style={{
                      fontFamily: 'Outfit', fontWeight: 800,
                      fontSize: 34, marginTop: 4,
                      backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>{fmtMxn(result.value_mxn)}</div>
                  </div>
                  <ResultRow label="Confianza" value={fmtPct(result.confidence_pct, 0)} accent="#a5b4fc" />
                  <ResultRow label="CI95 inferior"
                    value={fmtMxn(result.confidence_interval_low_mxn)} />
                  <ResultRow label="CI95 superior"
                    value={fmtMxn(result.confidence_interval_high_mxn)} />
                  <ResultRow label="Riesgo zona"
                    value={result.risk_adjuster_letter || '—'} accent="#f9a8d4" />
                  <ResultRow label="Comparables usados"
                    value={(result.comparables_used || []).length} />
                  {result.methodology_summary && (
                    <p style={{
                      marginTop: 14, fontSize: 11,
                      color: 'rgba(240,235,224,0.55)',
                      lineHeight: 1.55, fontStyle: 'italic',
                    }}>{result.methodology_summary}</p>
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
