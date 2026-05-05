/**
 * Phase 4 Batch 22 — InsightsIA sub-tab.
 * Predicciones (Sonnet) + Recomendaciones + Narrativa larga.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  getInsightsPredictions,
  getInsightsRecommendations,
  getInsightsNarrative,
} from '../../../api/insights';
import { Sparkle } from '../../icons';

const PRIORITY_TONE = {
  high: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.32)', label: 'Alta',  color: '#fca5a5' },
  med:  { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.32)', label: 'Media', color: '#fbbf24' },
  low:  { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.32)', label: 'Baja',  color: '#a5b4fc' },
};

function ConfidenceBar({ pct = 0, testid }) {
  return (
    <div data-testid={testid} style={{
      width: '100%', height: 6, borderRadius: 9999,
      background: 'rgba(240,235,224,0.08)', overflow: 'hidden', marginTop: 6,
    }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%',
        background: 'linear-gradient(90deg, #6366F1, #EC4899)',
      }} />
    </div>
  );
}

function PredictionCard({ p, idx }) {
  return (
    <div data-testid={`prediction-${idx}`} style={{
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.10)',
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: '#a5b4fc',
        }}>{p.type}</span>
        <span style={{ fontSize: 10, color: 'var(--cream-3)' }}>{p.confidence_pct}% conf.</span>
      </div>
      <div style={{
        fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)',
      }}>{p.value}</div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5, fontFamily: 'DM Sans' }}>
        {p.reasoning}
      </p>
      <ConfidenceBar pct={p.confidence_pct} testid={`prediction-${idx}-bar`} />
    </div>
  );
}

function RecommendationCard({ r, idx }) {
  const tone = PRIORITY_TONE[r.priority] || PRIORITY_TONE.med;
  return (
    <div data-testid={`recommendation-${idx}`} style={{
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 9999,
          background: 'rgba(0,0,0,0.30)',
          color: tone.color, fontSize: 10, fontWeight: 700,
        }}>{tone.label}</span>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {r.category}
        </span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>
        {r.title}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, fontFamily: 'DM Sans' }}>
        {r.body}
      </p>
      {r.expected_impact_pct != null && (
        <div style={{ marginTop: 8, fontSize: 11, color: tone.color, fontWeight: 700 }}>
          Impacto esperado: +{r.expected_impact_pct}%
        </div>
      )}
    </div>
  );
}

export default function InsightsIA({ projectId }) {
  const [preds, setPreds] = useState(null);
  const [recs, setRecs] = useState(null);
  const [narr, setNarr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true); setErr(null);
    try {
      const [p, r, n] = await Promise.all([
        getInsightsPredictions(projectId),
        getInsightsRecommendations(projectId),
        getInsightsNarrative(projectId, '30d', force),
      ]);
      setPreds(p); setRecs(r); setNarr(n);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(false); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (loading && !preds) return (
    <div data-testid="ia-loading" style={{ padding: 24, color: 'var(--cream-3)' }}>
      Generando insights con IA…
    </div>
  );
  if (err) return (
    <div data-testid="ia-error" style={{ padding: 16, color: '#fca5a5' }}>Error: {err}</div>
  );

  return (
    <div data-testid="ia-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkle size={12} color="#a5b4fc" /> Insights generados por Claude (cache 24h)
        </div>
        <button
          data-testid="ia-refresh"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            padding: '6px 14px', borderRadius: 9999,
            border: '1px solid rgba(240,235,224,0.16)',
            background: 'transparent', color: 'var(--cream-2)',
            fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 600,
            cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.6 : 1,
          }}>
          {refreshing ? 'Regenerando…' : 'Regenerar'}
        </button>
      </div>

      {/* Predictions */}
      <section>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--cream-3)', marginBottom: 10,
        }}>
          Predicciones {preds?.cached ? '· cache' : preds?.fallback ? '· determinístico' : ''}
        </div>
        <div data-testid="predictions-grid" style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {(preds?.items || []).map((p, i) => (
            <PredictionCard key={i} p={p} idx={i} />
          ))}
          {(preds?.items || []).length === 0 && (
            <div style={{ color: 'var(--cream-3)', fontSize: 12 }}>Sin predicciones disponibles.</div>
          )}
        </div>
      </section>

      {/* Recommendations */}
      <section>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--cream-3)', marginBottom: 10,
        }}>
          Recomendaciones {recs?.cached ? '· cache' : recs?.fallback ? '· determinístico' : ''}
        </div>
        <div data-testid="recommendations-grid" style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}>
          {(recs?.items || []).map((r, i) => (
            <RecommendationCard key={i} r={r} idx={i} />
          ))}
          {(recs?.items || []).length === 0 && (
            <div style={{ color: 'var(--cream-3)', fontSize: 12 }}>Sin recomendaciones disponibles.</div>
          )}
        </div>
      </section>

      {/* Narrative */}
      <section>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--cream-3)', marginBottom: 10,
        }}>
          Narrativa 30d {narr?.cached ? '· cache' : narr?.fallback ? '· determinístico' : ''}
        </div>
        <div data-testid="narrative-block" style={{
          background: 'rgba(236,72,153,0.06)',
          border: '1px solid rgba(236,72,153,0.20)',
          borderRadius: 14, padding: 16,
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.6,
          color: 'var(--cream-2)',
        }}>
          {narr?.text || 'Sin narrativa disponible.'}
        </div>
      </section>
    </div>
  );
}
