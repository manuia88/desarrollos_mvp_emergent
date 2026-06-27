// AtlaxHeroBar — Capa 1 F2 · barra-héroe query-first (primitivo de plataforma).
// El usuario ESCRIBE lo que busca (no navega) y Atlax responde. Reusa la IA ya viva (/api/atlax/query vía AtlaxBubble):
// al enviar, dispara el evento global `atlax:open` con detail.send=true → AtlaxBubble abre Y contesta.
// Modo dual: la barra es la vía IA; la página que la monta provee la vía manual (browse) al lado.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle } from '../icons';

const DEFAULT_EXAMPLES = [
  '¿Dónde compro un depa de 4M con buena plusvalía?',
  'Compara Condesa vs Roma Norte para vivir',
  'Algo cerca del metro, pet-friendly, menos de 6M',
  '¿Cuánto necesito de enganche para algo en Del Valle?',
  '¿Qué colonia me conviene si trabajo en Polanco?',
];

export default function AtlaxHeroBar({ examples = DEFAULT_EXAMPLES, autoFocus = false, compact = false, showChips = true } = {}) {
  const [q, setQ] = useState('');
  const [ph, setPh] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Rota el placeholder con preguntas reales (solo se ve cuando el input está vacío).
  useEffect(() => {
    if (!examples.length) return undefined;
    const id = setInterval(() => setPh((p) => (p + 1) % examples.length), 3200);
    return () => clearInterval(id);
  }, [examples.length]);

  const ask = (text) => {
    const query = (text || q).trim();
    if (!query) { inputRef.current?.focus(); return; }
    // Query-first: abre la SUPERFICIE Atlax (el lienzo de pantalla completa), no la burbuja.
    navigate(`/atlax?q=${encodeURIComponent(query)}`);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--card-border)',
        borderRadius: 999, boxShadow: '0 16px 44px rgba(var(--theme-rgb),0.16)', padding: '7px 7px 7px 18px',
      }}>
        <span style={{ display: 'flex', color: 'var(--theme)', flexShrink: 0 }}><Sparkle size={compact ? 18 : 21} /></span>
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder={examples[ph] || 'Pregúntale a Atlax lo que buscas…'}
          aria-label="Pregúntale a Atlax"
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: "'DM Sans',sans-serif", fontSize: compact ? 14.5 : 16, color: 'var(--cream)', padding: '11px 4px',
          }}
        />
        <button onClick={() => ask()} aria-label="Preguntar a Atlax" style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', borderRadius: 999,
          padding: compact ? '10px 16px' : '12px 22px', fontFamily: "'DM Sans',sans-serif", fontSize: 14.5, fontWeight: 700,
        }}>
          <Sparkle size={15} /> Preguntar
        </button>
      </div>

      {showChips && !compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {examples.slice(0, 3).map((ex, i) => (
            <button key={i} onClick={() => ask(ex)} style={{
              background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.18)',
              color: 'var(--theme)', borderRadius: 999, padding: '7px 13px', fontFamily: "'DM Sans',sans-serif",
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {ex.length > 40 ? `${ex.slice(0, 38)}…` : ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
