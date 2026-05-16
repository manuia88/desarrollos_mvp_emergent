/**
 * Phase 3 Batch 31 · Components — ArgumentarioDrawer.
 *
 * Drawer lateral (right slide-in) que el Asesor abre desde cualquier vista
 * (CRM, contacto, búsqueda) para preguntar inline. Devuelve respuesta Claude
 * + chips KB sources + filtro por categoría.
 *
 * Trigger externo: <button onClick={() => setOpen(true)} />.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { queryArgumentario, fetchArgumentarioRecent } from '../../api/asesor';
import { Z } from '../../styles/zIndex';

const GRADIENT = 'linear-gradient(90deg, var(--theme), var(--theme-3))';

const CATEGORIES = [
  { key: null, label: 'Todas' },
  { key: 'objeciones', label: 'Objeciones' },
  { key: 'cierres', label: 'Cierres' },
  { key: 'comparaciones', label: 'Comparaciones' },
  { key: 'producto', label: 'Producto' },
];

const SUGGESTED = [
  '¿Cómo respondo a "está muy caro"?',
  '¿Cómo cierro a un cliente que pide esperar?',
  'Diferencias entre preventa y entrega inmediata',
  '¿Cómo justifico amenidades premium?',
];

function MarkdownBlock({ md }) {
  // Mini parser: **bold** + saltos de línea
  if (!md) return null;
  const lines = md.split('\n');
  return (
    <div style={{
      fontSize: 13.5, lineHeight: 1.7, color: 'var(--cream)',
      whiteSpace: 'pre-wrap',
    }}>
      {lines.map((ln, i) => {
        const parts = ln.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ minHeight: ln === '' ? 6 : undefined }}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return (
                  <strong key={j} style={{
                    color: 'var(--cream)',
                    fontWeight: 700,
                    background: GRADIENT,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>{p.slice(2, -2)}</strong>
                );
              }
              return <span key={j}>{p}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function ArgumentarioDrawer({ open, onClose }) {
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  const [showRecent, setShowRecent] = useState(false);

  // Cargar recientes al abrir
  useEffect(() => {
    if (!open) return;
    fetchArgumentarioRecent(10).then((d) => setRecent(d.items || [])).catch(() => {});
  }, [open]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (question.trim().length < 4) {
      setError('La pregunta debe tener al menos 4 caracteres.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await queryArgumentario({ question, category, topK: 5 });
      setResult(r);
      // refrescar recientes
      fetchArgumentarioRecent(10).then((d) => setRecent(d.items || [])).catch(() => {});
    } catch (e) {
      setError(e.message || 'Error al consultar argumentario');
    } finally {
      setLoading(false);
    }
  }, [question, category]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="argumentario-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
          background: 'rgba(6,8,15,0.6)', backdropFilter: 'blur(4px)',
        }}
      />
      {/* Drawer */}
      <aside
        data-testid="argumentario-drawer"
        role="dialog"
        aria-label="Plan venta IA"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: Z.DROPDOWN,
          width: 'min(560px, 100vw)',
          background: 'rgba(6,8,15,0.96)',
          borderLeft: '1px solid rgba(240,235,224,0.12)',
          backdropFilter: 'blur(28px)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideInRight 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(40px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <header style={{
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(240,235,224,0.08)',
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>Coach inline</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cream)', marginTop: 2 }}>
              Plan venta IA
            </div>
          </div>
          <button
            data-testid="argumentario-close-btn"
            onClick={onClose}
            type="button"
            aria-label="Cerrar"
            style={{
              width: 36, height: 36,
              borderRadius: 9999,
              border: '1px solid rgba(240,235,224,0.18)',
              background: 'transparent',
              color: 'var(--cream)',
              cursor: 'pointer',
              fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        </header>

        {/* Body scroll */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Categoría chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key || 'all'}
                  data-testid={`argumentario-cat-${c.key || 'all'}`}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 9999,
                    border: active
                      ? '1px solid transparent'
                      : '1px solid rgba(240,235,224,0.18)',
                    background: active ? GRADIENT : 'transparent',
                    color: active ? '#fff' : 'var(--cream)',
                    fontSize: 11, fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >{c.label}</button>
              );
            })}
          </div>

          {/* Textarea */}
          <textarea
            data-testid="argumentario-question-input"
            placeholder="Pega la objeción del cliente o describe la situación de venta…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            style={{
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(240,235,224,0.18)',
              background: 'rgba(240,235,224,0.04)',
              color: 'var(--cream)',
              fontSize: 13.5,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              minHeight: 90,
            }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              data-testid="argumentario-submit-btn"
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: 9999,
                border: 'none',
                background: GRADIENT,
                color: '#fff',
                fontWeight: 600, fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >{loading ? 'Generando respuesta…' : 'Pedir guion'}</button>
            <button
              data-testid="argumentario-recent-toggle"
              type="button"
              onClick={() => setShowRecent((v) => !v)}
              style={{
                padding: '12px 18px',
                borderRadius: 9999,
                border: '1px solid rgba(240,235,224,0.18)',
                background: 'transparent',
                color: 'var(--cream)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >{showRecent ? 'Ocultar' : 'Recientes'}</button>
          </div>

          {error && (
            <div data-testid="argumentario-error" style={{
              padding: 10, borderRadius: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5', fontSize: 12,
            }}>{error}</div>
          )}

          {/* Sugerencias */}
          {!result && !showRecent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--cream-3)',
              }}>Preguntas frecuentes</div>
              {SUGGESTED.map((s, i) => (
                <button
                  key={i}
                  data-testid={`argumentario-suggested-${i}`}
                  type="button"
                  onClick={() => setQuestion(s)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(240,235,224,0.12)',
                    background: 'rgba(240,235,224,0.03)',
                    color: 'var(--cream)',
                    fontSize: 12.5, cursor: 'pointer',
                  }}
                >{s}</button>
              ))}
            </div>
          )}

          {/* Recientes */}
          {showRecent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--cream-3)',
              }}>Mis consultas recientes</div>
              {(recent || []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>
                  Aún no has hecho consultas.
                </div>
              )}
              {(recent || []).map((q) => (
                <button
                  key={q.query_id}
                  data-testid={`argumentario-recent-${q.query_id}`}
                  type="button"
                  onClick={() => {
                    setQuestion(q.question);
                    setCategory(q.category || null);
                    setResult({
                      query_id: q.query_id,
                      response_markdown: q.response_markdown,
                      kb_sources: q.kb_sources || [],
                    });
                    setShowRecent(false);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(240,235,224,0.1)',
                    background: 'transparent',
                    color: 'var(--cream)',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <div style={{ color: 'var(--cream)', fontWeight: 500 }}>
                    {q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question}
                  </div>
                  {q.category && (
                    <div style={{ color: 'var(--cream-3)', marginTop: 2, fontSize: 10 }}>
                      {q.category}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div data-testid="argumentario-result" style={{
              padding: 16,
              borderRadius: 14,
              background: 'rgba(var(--theme-rgb),0.06)',
              border: '1px solid rgba(var(--theme-rgb),0.18)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <MarkdownBlock md={result.response_markdown} />

              {(result.kb_sources || []).length > 0 && (
                <div style={{
                  borderTop: '1px solid rgba(240,235,224,0.08)',
                  paddingTop: 10,
                }}>
                  <div style={{
                    fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--cream-3)', marginBottom: 6,
                  }}>Fuentes consultadas</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.kb_sources.map((s) => (
                      <span
                        key={s.kb_id}
                        data-testid={`argumentario-source-${s.kb_id}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 9999,
                          background: 'rgba(240,235,224,0.06)',
                          border: '1px solid rgba(240,235,224,0.14)',
                          fontSize: 10,
                          color: 'var(--cream)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {s.title} · {s.similarity_pct}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
