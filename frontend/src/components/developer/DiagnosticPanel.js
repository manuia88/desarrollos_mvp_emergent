// W4.1B — DiagnosticPanel
// Renders analyze_dev findings (R1-R6) + summary score circle
import React, { useEffect, useState, useCallback } from 'react';
import { fetchDevDiagnostic } from '../../api/diagnostic';

const SEV_COLORS = {
  high:   { fg: '#fca5a5', bg: 'rgba(252,165,165,0.10)', bd: 'rgba(252,165,165,0.28)' },
  medium: { fg: '#fcd34d', bg: 'rgba(252,211,77,0.10)',  bd: 'rgba(252,211,77,0.28)'  },
  low:    { fg: '#a3e635', bg: 'rgba(163,230,53,0.10)',  bd: 'rgba(163,230,53,0.28)'  },
};

const SEV_LABEL = { high: 'ALTO', medium: 'MEDIO', low: 'BAJO' };

function scoreCircleStyle(score) {
  if (score >= 80) return { background: 'linear-gradient(135deg, #6366F1, #EC4899)' };
  if (score >= 60) return { background: '#6366F1' };
  if (score >= 40) return { background: '#f59e0b' };
  return { background: '#fca5a5' };
}

export default function DiagnosticPanel({ devId, devName }) {
  const [state, setState] = useState('loading'); // loading | error | ok | empty
  const [data, setData] = useState(null);
  const [errDetail, setErrDetail] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setReanalyzing(true);
    else setState('loading');
    try {
      const d = await fetchDevDiagnostic(devId, force);
      setData(d);
      setState((d.findings || []).length === 0 ? 'empty' : 'ok');
    } catch (e) {
      setErrDetail(e.status ? `HTTP ${e.status}` : String(e));
      setState('error');
    } finally {
      setReanalyzing(false);
    }
  }, [devId]);

  useEffect(() => { load(false); }, [load]);

  const summary = data?.summary_score ?? 0;
  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  return (
    <div
      data-testid="diagnostic-panel"
      style={{
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(24px)',
        background: 'rgba(13,16,23,0.92)',
        padding: 24,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>W4.1A · DIAGNÓSTICO INTELIGENTE</div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: 0, letterSpacing: '-0.018em' }}>
            Acciones recomendadas · {devName}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Summary score circle */}
          {data && state === 'ok' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                ...scoreCircleStyle(summary),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: '#fff' }}>
                  {summary}
                </span>
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Score
              </span>
            </div>
          )}

          {/* Re-analizar button */}
          <button
            data-testid="diagnostic-reanalyze-btn"
            onClick={() => load(true)}
            disabled={reanalyzing || state === 'loading'}
            style={{
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              padding: '8px 18px', borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.15)',
              background: reanalyzing ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.05)',
              color: 'var(--cream-2)', cursor: reanalyzing ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!reanalyzing) e.currentTarget.style.background = 'rgba(99,102,241,0.18)'; }}
            onMouseLeave={e => { if (!reanalyzing) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          >
            {reanalyzing ? 'Analizando…' : 'Re-analizar'}
          </button>
        </div>
      </div>

      {/* States */}
      {(state === 'loading' || (state === 'ok' && !data)) && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando diagnóstico…
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '24px 0', color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13 }}>
          No se pudo cargar el diagnóstico. Detalle: {errDetail}
        </div>
      )}

      {state === 'empty' && (
        <div style={{ padding: '24px 0', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          No hay diagnóstico disponible. Click Re-analizar para generar.
        </div>
      )}

      {state === 'ok' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(data.findings || []).map((f) => {
            const sev = SEV_COLORS[f.severity] || SEV_COLORS.low;
            return (
              <div
                key={f.rule_id}
                data-testid={`diagnostic-finding-${f.rule_id}`}
                style={{
                  padding: 16, borderRadius: 14,
                  background: sev.bg,
                  border: `1px solid ${sev.bd}`,
                }}
              >
                {/* Top row: badge + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5,
                    padding: '2px 10px', borderRadius: 9999,
                    background: sev.bg, border: `1px solid ${sev.bd}`, color: sev.fg,
                    letterSpacing: '0.05em',
                  }}>
                    {SEV_LABEL[f.severity] || f.severity.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', flex: 1 }}>
                    {f.title}
                  </span>
                  {f.confidence === 'low' && (
                    <span style={{
                      fontFamily: 'DM Sans', fontSize: 10, padding: '2px 8px', borderRadius: 9999,
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'var(--cream-3)',
                    }}>
                      Data parcial
                    </span>
                  )}
                </div>

                {/* Explanation */}
                <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 10px' }}>
                  {f.explanation}
                </p>

                {/* Recommended action block */}
                <div style={{
                  background: 'rgba(99,102,241,0.08)', borderRadius: 12, padding: '10px 14px',
                  marginBottom: 10,
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, color: '#a5b4fc', letterSpacing: '0.07em', marginBottom: 5, textTransform: 'uppercase' }}>
                    Accion recomendada
                  </div>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', margin: 0, lineHeight: 1.55 }}>
                    {f.recommended_action}
                  </p>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                    Costo estimado: <strong style={{ color: 'var(--cream-2)' }}>{f.estimated_cost_mxn}</strong>
                  </span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                    Impacto estimado:{' '}
                    <strong style={{
                      fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                      background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                      +{f.estimated_impact_pct}%
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer timestamp */}
      {generatedAt && (
        <div style={{ marginTop: 14, textAlign: 'right', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
          {data?.cached ? 'Cache · ' : ''}{generatedAt}
        </div>
      )}
    </div>
  );
}
