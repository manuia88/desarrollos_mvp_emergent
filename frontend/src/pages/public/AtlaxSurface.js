// AtlaxSurface — Capa 1 · el "LLM inmobiliario": superficie conversacional de pantalla completa (no una burbuja).
// Tu pregunta abre un LIENZO: la respuesta se ARMA con UI rica (tabla comparativa, tarjetas, …) sobre datos reales,
// con preguntas de seguimiento y cierre. Reusa /api/atlax/query + AtlaxBlocks (mismos bloques que la burbuja).
// La burbuja (AtlaxBubble) se queda para preguntas EN CONTEXTO (en una ficha); esta superficie es la búsqueda profunda.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AtlaxBlocks from '../../components/landing/AtlaxBlocks';
import { Sparkle, ArrowRight } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';

const EXAMPLES = [
  '¿Dónde compro un depa de 4M con buena plusvalía?',
  'Compara Condesa vs Roma Norte para vivir',
  'Algo cerca del metro, pet-friendly, menos de 6M',
  '¿Qué colonia me conviene si trabajo en Polanco?',
];
const FOLLOWUPS = ['¿Y la seguridad?', '¿Cuánto necesito de enganche?', '¿Cuál sube más de valor?', 'Muéstrame opciones'];

// markdown mínimo: **negrita** + saltos de línea (whiteSpace pre-wrap)
function renderRich(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, i) => (
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
  ));
}

const exBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left',
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream)',
  borderRadius: 12, padding: '13px 16px', fontFamily: 'DM Sans', fontSize: 14.5, cursor: 'pointer',
};
const chip = {
  background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.24)', color: 'var(--theme)',
  borderRadius: 999, padding: '8px 14px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default function AtlaxSurface() {
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);
  const endRef = useRef(null);
  const askedRef = useRef(false);

  const send = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    try {
      const r = await fetch(`${API}/api/atlax/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, session_id: sessionRef.current, channel: 'web_surface' }),
      });
      const d = await r.json();
      if (d && d.session_id) sessionRef.current = d.session_id;
      setMessages((prev) => [...prev, {
        role: 'assistant', content: (d && d.answer) || 'Sin respuesta.',
        blocks: (d && d.blocks) || [], citations: (d && d.citations) || [],
      }]);
    } catch (_) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'No pude procesar eso ahora. Intenta de nuevo.', error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // auto-pregunta del ?q= (viene de la barra-héroe del home)
  useEffect(() => {
    if (askedRef.current) return;  // React StrictMode dispara los effects 2× en dev → evita doble pregunta
    const q = params.get('q');
    if (q) { askedRef.current = true; send(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const submit = (e) => { if (e && e.preventDefault) e.preventDefault(); const q = input.trim(); if (q) { setInput(''); send(q); } };
  const empty = messages.length === 0 && !busy;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--cream)', fontFamily: 'Outfit', fontWeight: 800, fontSize: 16 }}>
          Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
        </Link>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13 }}>
          <Sparkle size={16} /> Atlax
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 0 150px' }}>
          {empty ? (
            <div style={{ textAlign: 'center', paddingTop: '11vh' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', background: GRAD, color: '#fff', marginBottom: 18 }}>
                <Sparkle size={28} />
              </span>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-0.03em', margin: 0 }}>Pregúntale a Atlax</h1>
              <p style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 15, marginTop: 10 }}>
                El buscador inmobiliario. Escribe lo que buscas — yo armo la respuesta con datos reales.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, margin: '26px auto 0' }}>
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => send(ex)} style={exBtn}>
                    <span>{ex}</span><span style={{ color: 'var(--theme)', display: 'flex' }}><ArrowRight size={15} /></span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {messages.map((m, i) => (
                <div key={i}>
                  {m.role === 'user' ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 16, padding: '11px 16px', fontFamily: 'DM Sans', fontSize: 15, fontWeight: 600, maxWidth: '85%' }}>{m.content}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13 }}><Sparkle size={16} /> Atlax</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.62, color: m.error ? '#fca5a5' : 'var(--cream)', whiteSpace: 'pre-wrap' }}>{renderRich(m.content)}</div>
                      {(m.blocks || []).length > 0 && <AtlaxBlocks blocks={m.blocks} />}
                      {i === messages.length - 1 && !busy && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                          {FOLLOWUPS.map((f) => <button key={f} onClick={() => send(f)} style={chip}>{f}</button>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--theme)', fontWeight: 700, fontSize: 13 }}><Sparkle size={16} /> Atlax</div>
                  <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 14, fontStyle: 'italic' }}>Atlax está pensando…</div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent, var(--bg) 32%)', padding: '14px 16px 22px' }}>
        <form onSubmit={submit} style={{ maxWidth: 780, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 7px 7px 18px' }}>
          <span style={{ display: 'flex', color: 'var(--theme)', flexShrink: 0 }}><Sparkle size={18} /></span>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pregúntale a Atlax lo que buscas…" autoFocus
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 15.5, padding: '11px 4px' }} />
          <button type="submit" disabled={busy || !input.trim()} style={{ flexShrink: 0, border: 'none', cursor: (busy || !input.trim()) ? 'default' : 'pointer', opacity: (busy || !input.trim()) ? 0.5 : 1, background: GRAD, color: '#fff', borderRadius: 999, padding: '11px 20px', fontFamily: 'DM Sans', fontSize: 14.5, fontWeight: 700 }}>Preguntar</button>
        </form>
      </div>
    </div>
  );
}
