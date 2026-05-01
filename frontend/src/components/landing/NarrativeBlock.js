// NarrativeBlock — muestra narrativa AI (N5) de una zona o desarrollo.
// Maneja loading, error (sin scores), y footer con versión del prompt.
import React, { useEffect, useState } from 'react';
import { Sparkle, Database } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

export default function NarrativeBlock({ scope = 'colonia', entityId, compact = false, showFooter = true }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    if (!entityId) return;
    const url = scope === 'colonia'
      ? `${API}/api/zones/${entityId}/narrative`
      : `${API}/api/developments/${entityId}/narrative`;
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message || 'Error'); });
    return () => { alive = false; };
  }, [scope, entityId]);

  if (err) {
    return compact ? null : (
      <div data-testid="narrative-error" style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', padding: 10 }}>
        Narrativa aún no disponible.
      </div>
    );
  }
  if (!data) {
    return (
      <div data-testid="narrative-loading" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkle size={10} /> Generando narrativa AI…
      </div>
    );
  }

  if (compact) {
    return <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.55 }}>{data.narrative_text}</span>;
  }

  return (
    <div data-testid={`narrative-${scope}-${entityId}`} style={{
      padding: '18px 22px',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(236,72,153,0.04))',
      border: '1px solid rgba(236,72,153,0.22)',
      borderRadius: 16,
    }}>
      <div className="eyebrow" style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Sparkle size={10} color="var(--indigo-3)" /> NARRATIVA AI · N5
      </div>
      <p data-testid="narrative-text" style={{
        fontFamily: 'DM Sans', fontSize: 14.5, lineHeight: 1.7,
        color: 'var(--cream)', margin: '0 0 12px', fontStyle: 'italic',
      }}>"{data.narrative_text}"</p>
      {showFooter && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          borderTop: '1px solid rgba(240,235,224,0.08)', paddingTop: 8,
        }}>
          <Database size={9} />
          <span>Claude {data.model?.replace('-20250929','').replace('claude-','').replace('-5','') || 'Sonnet 4.5'}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>prompt {data.prompt_version}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{new Date(data.generated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {data.cache_hit && (
            <span data-testid="narrative-cache-hit" style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 9999, background: 'rgba(34,197,94,0.12)', color: '#86efac', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9 }}>
              Cache
            </span>
          )}
        </div>
      )}
    </div>
  );
}
