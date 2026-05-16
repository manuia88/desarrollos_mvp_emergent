// NarrativeBlock — muestra narrativa AI (N5) de una zona, desarrollo o escenario multi-horizonte.
// Props:
//   entityType: 'zone' | 'development' | 'scenario'  (nuevo, preferido)
//   scope: 'colonia' | 'development'                 (legacy, backward compat)
//   entityId: string                                  (zone/development slug)
//   paramsObject: {colonia, m2, rec, ban, age}        (solo para entityType="scenario")
//   mode: 'full' | 'compact'                          (compact = primera oración + expand)
//   compact: bool                                     (legacy → mapea a mode="compact")
//   showFooter: bool
import React, { useEffect, useState } from 'react';
import { Sparkle, Database, ChevronDown } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

function _resolveScope(entityType, scope) {
  if (entityType === 'zone') return 'colonia';
  if (entityType === 'development') return 'development';
  return scope || 'colonia';
}

function _resolveUrl(entityType, entityId, scope, paramsObject) {
  if (entityType === 'scenario' && paramsObject) {
    const { colonia, m2 = 80, rec = 2, ban = 2, age = 8 } = paramsObject;
    return `${API}/api/narrative/scenario?colonia=${encodeURIComponent(colonia)}&m2=${m2}&rec=${rec}&ban=${ban}&age=${age}`;
  }
  const resolvedScope = _resolveScope(entityType, scope);
  if (resolvedScope === 'colonia') return `${API}/api/zones/${entityId}/narrative`;
  return `${API}/api/developments/${entityId}/narrative`;
}

function _resolveMode(mode, compact) {
  if (mode === 'compact' || compact === true) return 'compact';
  return 'full';
}

function CompactView({ text, showFull, onToggle }) {
  const firstSentence = (() => {
    const parts = (text || '').split('. ');
    if (parts.length <= 1) return text || '';
    return parts[0].trim() + '.';
  })();

  return (
    <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.55 }}>
      {showFull ? text : firstSentence}
      {!showFull && text !== firstSentence && (
        <button
          onClick={onToggle}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11,
            marginLeft: 6, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
          }}
        >
          Leer mas <ChevronDown size={10} />
        </button>
      )}
      {showFull && text !== firstSentence && (
        <button
          onClick={onToggle}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11,
            marginLeft: 6, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
          }}
        >
          Ocultar <ChevronDown size={10} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}
    </span>
  );
}

export default function NarrativeBlock({
  entityType,
  scope = 'colonia',
  entityId,
  paramsObject,
  mode = 'full',
  compact = false,
  showFooter = true,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const resolvedMode = _resolveMode(mode, compact);
  const isScenario = entityType === 'scenario';
  const url = entityId || isScenario ? _resolveUrl(entityType, entityId, scope, paramsObject) : null;

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(null);
    setExpanded(false);
    if (!url) return;
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message || 'Error'); });
    return () => { alive = false; };
  }, [url]);

  // Error
  if (err) {
    if (resolvedMode === 'compact') return null;
    if (isScenario) return (
      <div data-testid="scenario-narrative-error" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: '10px 0' }}>
        Analisis multi-escenario no disponible en este momento.
      </div>
    );
    return (
      <div data-testid="narrative-error" style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', padding: 10 }}>
        Narrativa aun no disponible.
      </div>
    );
  }

  // Loading skeleton
  if (!data) {
    return (
      <div
        data-testid={isScenario ? 'scenario-narrative-loading' : 'narrative-loading'}
        style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: 10, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Sparkle size={10} />
        {isScenario ? 'Analizando escenario de compra…' : 'Generando narrativa AI…'}
      </div>
    );
  }

  const narrativeText = isScenario
    ? (data.scenario_narrative || '')
    : (data.narrative_text || '');
  const resolvedScope = _resolveScope(entityType, scope);

  // Compact mode
  if (resolvedMode === 'compact') {
    return (
      <CompactView
        text={narrativeText}
        showFull={expanded}
        onToggle={() => setExpanded(v => !v)}
      />
    );
  }

  // Scenario: display especial
  if (isScenario) {
    return (
      <div
        data-testid="scenario-narrative-block"
        style={{
          padding: '20px 22px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(6,8,15,0.05))',
          border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 16,
          marginTop: 16,
        }}
      >
        <div style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkle size={10} color="var(--indigo-3)" />
          <span className="eyebrow">COMPRA AHORA VS ESPERAR · IA</span>
          {data.partial && (
            <span style={{
              marginLeft: 8, padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(234,179,8,0.12)', color: '#fde68a',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 9,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Analisis parcial
            </span>
          )}
        </div>
        <p
          data-testid="scenario-narrative-text"
          style={{
            fontFamily: 'DM Sans', fontSize: 14, lineHeight: 1.75,
            color: 'var(--cream-2)', margin: '0 0 12px',
          }}
        >
          {narrativeText}
        </p>
        {showFooter && (
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            borderTop: '1px solid rgba(240,235,224,0.08)', paddingTop: 8,
          }}>
            <Database size={9} />
            <span>
              {data.model?.replace('-20250929', '').replace('-20251001', '').replace('claude-', '').replace('-5', '') || 'Sonnet 4.5'}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{new Date(data.generated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {data.cache_hit && (
              <span data-testid="scenario-cache-hit" style={{
                marginLeft: 'auto', padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(34,197,94,0.12)', color: '#86efac',
                fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9,
              }}>
                Cache
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full mode (zone / development)
  return (
    <div
      data-testid={`narrative-${resolvedScope}-${entityId}`}
      style={{
        padding: '18px 22px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(236,72,153,0.04))',
        border: '1px solid rgba(236,72,153,0.22)',
        borderRadius: 16,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Sparkle size={10} color="var(--indigo-3)" /> NARRATIVA AI · N5
      </div>
      <p
        data-testid="narrative-text"
        style={{
          fontFamily: 'DM Sans', fontSize: 14.5, lineHeight: 1.7,
          color: 'var(--cream)', margin: '0 0 12px', fontStyle: 'italic',
        }}
      >
        "{narrativeText}"
      </p>
      {showFooter && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          borderTop: '1px solid rgba(240,235,224,0.08)', paddingTop: 8,
        }}>
          <Database size={9} />
          <span>
            {data.model?.replace('-20250929', '').replace('-20251001', '').replace('claude-', '').replace('-5', '') || 'Sonnet 4.5'}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>prompt {data.prompt_version}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{new Date(data.generated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {data.cache_hit && (
            <span
              data-testid="narrative-cache-hit"
              style={{
                marginLeft: 'auto', padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(34,197,94,0.12)', color: '#86efac',
                fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9,
              }}
            >
              Cache
            </span>
          )}
        </div>
      )}
    </div>
  );
}
