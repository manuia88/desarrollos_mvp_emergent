// W2.9 Phase Z.2 — Sticky AI insights panel (Claude Sonnet brief)
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';

const STATE_META = {
  bull:   { label: 'Alcista',  color: '#4ADE80', bg: 'rgba(74,222,128,0.15)' },
  stable: { label: 'Estable',  color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  bear:   { label: 'Bajista',  color: '#F87171', bg: 'rgba(248,113,113,0.15)' },
};

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function Section({ title, Icon, color, items, testid }) {
  if (!items || items.length === 0) return null;
  return (
    <div data-testid={testid} style={{ marginTop: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.07em', color,
      }}>
        <Icon size={11} /> {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16,
        fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.55,
        color: 'rgba(240,235,224,0.85)' }}>
        {items.map((it, i) => (
          <li key={i} style={{ marginBottom: 5 }}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketInsightsPanel({
  brief, loading, busy, onRegenerate, selectedZone,
}) {
  if (loading) {
    return (
      <div data-testid="intel-insights-loading" style={{
        padding: 22, fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(240,235,224,0.55)',
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)',
      }}>Cargando brief…</div>
    );
  }

  if (!brief) {
    return (
      <div data-testid="intel-insights-empty" style={{
        padding: 24, borderRadius: 14, textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)',
      }}>
        <Sparkles size={22} color="var(--theme)" style={{ marginBottom: 8 }} />
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream)', margin: '4px 0 6px' }}>
          Sin brief para esta zona
        </h3>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5,
          color: 'rgba(240,235,224,0.55)', margin: '0 0 14px',
          lineHeight: 1.5 }}>
          Genera un análisis ejecutivo Claude Sonnet con hallazgos, riesgos y oportunidades.
        </p>
        <button data-testid="intel-insights-generate-btn" onClick={onRegenerate}
          disabled={busy || !selectedZone}
          style={{
            padding: '10px 22px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
            cursor: busy || !selectedZone ? 'not-allowed' : 'pointer',
            opacity: busy || !selectedZone ? 0.55 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <Sparkles size={12} />
          {busy ? 'Generando…' : 'Generar insights'}
        </button>
      </div>
    );
  }

  const stateMeta = STATE_META[brief.market_state] || STATE_META.stable;
  const isStub = !!brief.stub_reason;
  const isBudgetBlocked = !!brief.budget_blocked;

  return (
    <div data-testid="intel-insights-panel" style={{
      borderRadius: 14, padding: 18,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)',
      position: 'sticky', top: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'rgba(240,235,224,0.5)', marginBottom: 4 }}>
            Brief ejecutivo
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
            color: 'var(--cream)', lineHeight: 1.25 }}>
            {brief.zone_name || brief.zone_id}
          </div>
        </div>
        <button data-testid="intel-insights-regenerate-btn" onClick={onRegenerate}
          disabled={busy} title="Regenerar (force=true)"
          style={{
            padding: '6px 11px', borderRadius: 9999,
            background: 'rgba(var(--theme-rgb),0.10)',
            border: '1px solid rgba(var(--theme-rgb),0.30)',
            color: 'var(--theme)', fontFamily: 'DM Sans',
            fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            opacity: busy ? 0.6 : 1,
          }}>
          <RefreshCw size={11} /> Regenerar
        </button>
      </div>

      {/* State pill + confidence */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center',
        flexWrap: 'wrap', marginBottom: 4 }}>
        <span data-testid="intel-state-pill" style={{
          padding: '4px 11px', borderRadius: 9999,
          background: stateMeta.bg,
          border: `1px solid ${stateMeta.color}55`,
          color: stateMeta.color,
          fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
        }}>
          {stateMeta.label}
        </span>
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: 11,
          color: 'rgba(240,235,224,0.6)',
        }}>
          Confianza {brief.confidence_pct}%
        </span>
        {brief.cache && (
          <span style={{
            padding: '2px 8px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            fontFamily: 'DM Mono, monospace', fontSize: 10,
            color: 'rgba(240, 235, 224, 0.70)',
          }}>{brief.cache}</span>
        )}
      </div>

      {/* Stub / budget banner */}
      {(isStub || isBudgetBlocked) && (
        <div data-testid="intel-stub-banner" style={{
          marginTop: 10, padding: '8px 11px', borderRadius: 8,
          background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.30)',
          fontFamily: 'DM Sans', fontSize: 11.5, lineHeight: 1.45,
          color: '#FBBF24',
        }}>
          {isBudgetBlocked
            ? 'Presupuesto IA agotado este mes. Mostrando brief en caché o heurístico.'
            : `Brief en modo heurístico — ${brief.stub_reason}`}
        </div>
      )}

      {/* Findings / risks / opportunities */}
      <Section title="Hallazgos clave" Icon={Sparkles} color="var(--theme)"
        items={brief.key_findings} testid="intel-findings" />
      <Section title="Riesgos principales" Icon={AlertTriangle} color="#F87171"
        items={brief.top_risks} testid="intel-risks" />
      <Section title="Oportunidades" Icon={Lightbulb} color="#4ADE80"
        items={brief.opportunities} testid="intel-opportunities" />

      {/* Reasoning markdown */}
      {brief.reasoning && (
        <div data-testid="intel-reasoning" style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'rgba(240,235,224,0.5)', marginBottom: 6,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <TrendingUp size={11} /> Razonamiento
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.55,
            color: 'rgba(240,235,224,0.78)',
          }}>
            <ReactMarkdown>{brief.reasoning}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Footer ts + cost */}
      <div style={{
        marginTop: 16, paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
        fontFamily: 'DM Mono, monospace', fontSize: 10.5,
        color: 'rgba(240,235,224,0.4)',
      }}>
        <span data-testid="intel-generated-at">Generado {fmtRel(brief.generated_at)}</span>
        <span data-testid="intel-cost-mxn">
          Costo IA: ${(brief.ai_cost_mxn || 0).toFixed(2)} MXN
        </span>
      </div>
    </div>
  );
}
