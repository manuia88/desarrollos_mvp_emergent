// W3.6 — Notaría Title Check widget standalone embebible.
import React, { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { trackWidgetEmbed } from '../../../utils/widgetTracking';
import {
  WidgetShell, WidgetCard, WidgetField, ResultRow,
  widgetInputStyle, widgetBtnPrimary,
  ApiKeyMissing, useApiKeyFromUrl,
} from './_widgetChrome';
import { callNotariaTitle } from '../../../api/verticalProducts';

const SEV_TONES = {
  info:     { fg: '#a5b4fc', bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.36)' },
  warning:  { fg: '#fcd34d', bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.36)' },
  critical: { fg: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.36)'  },
};

export default function NotariaTitleWidget() {
  const apiKey = useApiKeyFromUrl();
  const [form, setForm] = useState({ property_id: '', claimed_owner: '' });
  const [historyText, setHistoryText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // W5.25 · embed analytics tracking (fail-soft) · API-keyed widget
  useEffect(() => {
    if (apiKey) trackWidgetEmbed('notaria_title', { apiKey });
  }, [apiKey]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const transaction_history = historyText.trim()
        ? historyText.split('\n').filter(Boolean).map((row) => {
            const [year, buyer] = row.split(',').map(s => s.trim());
            return { year: parseInt(year), buyer };
          }).filter(o => o.year)
        : [];
      const r = await callNotariaTitle({
        property_id: form.property_id,
        claimed_owner: form.claimed_owner || undefined,
        transaction_history,
      }, apiKey);
      setResult(r);
    } catch (err) {
      setError(err?.detail?.error || err?.detail || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WidgetShell eyebrow="Notaría Title Check · W3.6" title="Due diligence pre-escritura">
      {!apiKey ? <ApiKeyMissing /> : (
        <>
          <WidgetCard>
            <form onSubmit={onSubmit} data-testid="notaria-title-form">
              <WidgetField label="Property ID / Hash" required>
                <input data-testid="notaria-title-property-input"
                  required value={form.property_id}
                  onChange={(e) => setForm({ ...form, property_id: e.target.value })}
                  placeholder="prop_test_123" style={widgetInputStyle} />
              </WidgetField>
              <WidgetField label="Propietario actual (claimed)">
                <input data-testid="notaria-title-owner-input"
                  value={form.claimed_owner}
                  onChange={(e) => setForm({ ...form, claimed_owner: e.target.value })}
                  placeholder="Juan Pérez" style={widgetInputStyle} />
              </WidgetField>
              <WidgetField label="Historial (opcional · YYYY,nombre por línea)">
                <textarea data-testid="notaria-title-history-input"
                  rows={4}
                  value={historyText}
                  onChange={(e) => setHistoryText(e.target.value)}
                  placeholder="2018,Mario&#10;2020,Lucía&#10;2023,Juan"
                  style={{ ...widgetInputStyle, fontFamily: 'monospace' }} />
              </WidgetField>
              <button data-testid="notaria-title-submit-btn" type="submit"
                disabled={loading}
                style={{ ...widgetBtnPrimary, marginTop: 18, opacity: loading ? 0.6 : 1 }}>
                <FileSearch size={14} />
                {loading ? 'Verificando…' : 'Verificar título'}
              </button>
            </form>
          </WidgetCard>

          {error && (
            <WidgetCard style={{ marginTop: 14, borderColor: 'rgba(239,68,68,0.40)' }}>
              <p data-testid="notaria-title-error" style={{ color: '#fca5a5', margin: 0, fontSize: 13 }}>
                {error.includes('tier_insufficient')
                  ? 'Esta función requiere plan Enterprise. Visita /docs/api'
                  : (typeof error === 'string' ? error : JSON.stringify(error))}
              </p>
            </WidgetCard>
          )}

          {result && (
            <WidgetCard style={{ marginTop: 14 }} data-testid="notaria-title-result">
              {!result.available ? (
                <p style={{ color: '#fcd34d', margin: 0, fontSize: 13 }}>
                  No se pudo verificar: <code>{result.reason}</code>
                </p>
              ) : (
                <>
                  <div style={{
                    textAlign: 'center', padding: '8px 0 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8,
                  }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: 'rgba(240,235,224,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.10em',
                    }}>Estado del título</div>
                    <div data-testid="notaria-title-status" style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
                      marginTop: 4,
                      color: result.title_clear ? '#86efac' : '#fca5a5',
                    }}>{result.title_clear ? 'LIBRE' : 'CON ALERTAS'}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>
                      Confianza {result.confidence_pct}%
                    </div>
                  </div>
                  <ResultRow label="Flips detectados (Transaction Network)"
                    value={result.flips_detected ?? 0} />
                  <ResultRow label="Owner chain (DMX)"
                    value={(result.owner_chain || []).length} />
                  <ResultRow label="Historial proporcionado"
                    value={result.owner_history_provided_count ?? 0} />
                  {(result.flags || []).length > 0 && (
                    <div data-testid="notaria-title-flags" style={{ marginTop: 14 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: 'rgba(240,235,224,0.6)',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                        marginBottom: 6,
                      }}>Flags</div>
                      {result.flags.map((f, i) => {
                        const t = SEV_TONES[f.severity] || SEV_TONES.info;
                        return (
                          <div key={i} style={{
                            background: t.bg, border: `1px solid ${t.bd}`,
                            color: t.fg, borderRadius: 12,
                            padding: '8px 12px', marginBottom: 6, fontSize: 12,
                          }}>
                            <strong style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>
                              {f.severity}
                            </strong>
                            <div style={{ marginTop: 2 }}>{f.description}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(result.recommendations || []).length > 0 && (
                    <div data-testid="notaria-title-recommendations" style={{ marginTop: 12 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: 'rgba(240,235,224,0.6)',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                      }}>Recomendaciones</div>
                      <ul style={{
                        margin: '6px 0 0 0', padding: '0 0 0 18px',
                        fontSize: 12, color: 'rgba(240,235,224,0.75)', lineHeight: 1.6,
                      }}>
                        {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
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
