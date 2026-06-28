// AtlaxSurface — Capa 1 · el "LLM inmobiliario": superficie conversacional de pantalla completa (no una burbuja).
// Tu pregunta abre un LIENZO: la respuesta se ARMA con UI rica (tabla comparativa, tarjetas, …) sobre datos reales,
// con preguntas de seguimiento y cierre. Reusa /api/atlax/query + AtlaxBlocks (mismos bloques que la burbuja).
// La burbuja (AtlaxBubble) se queda para preguntas EN CONTEXTO (en una ficha); esta superficie es la búsqueda profunda.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { sendBuyerSignal } from '../../lib/buyerSignal';
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

// "Se escribe solo": revela el texto progresivamente (efecto typewriter). El texto completo ya llegó (el LLM no
// hace streaming token-a-token sin reescribir su core), pero esto da la sensación de que Atlax escribe en vivo.
function TypewriterText({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const full = String(text || '');
    setN(0);
    if (!full) return undefined;
    const id = setInterval(() => {
      setN((x) => {
        if (x >= full.length) { clearInterval(id); return x; }
        return Math.min(full.length, x + 3);  // 3 chars/tick
      });
    }, 16);
    return () => clearInterval(id);
  }, [text]);
  const shown = String(text || '').slice(0, n);
  return <>{renderRich(shown)}</>;
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
const cta = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cream)',
  borderRadius: 999, padding: '8px 14px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const ctaPrimary = { ...cta, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.40)', color: 'var(--theme)' };

export default function AtlaxSurface() {
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);
  const endRef = useRef(null);
  const askedRef = useRef(false);
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const lastUserQ = () => { const u = [...messages].reverse().find((m) => m.role === 'user'); return u ? u.content : ''; };
  // Cierre agéntico: cada conversación puede convertirse en señal de demanda / lead (cierra el ciclo del flywheel).
  const saveSearch = () => { try { sendBuyerSignal('atlax_search_saved', { query: lastUserQ() }); } catch (_) { /* noop */ } flash('Búsqueda guardada ✓'); };
  const wantAdvisor = () => { try { sendBuyerSignal('atlax_lead_intent', { query: lastUserQ() }); } catch (_) { /* noop */ } flash('Listo — un asesor revisará tu búsqueda ✓'); };

  const send = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    setBusy(true);
    const aid = `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [...prev,
      { role: 'user', content: q },
      { id: aid, role: 'assistant', content: '', blocks: [], pending: true },
    ]);
    const patchMsg = (patch) => setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, ...patch } : m)));

    // FASE 1 · blocks-first: la UI (tabla/tarjetas) aparece AL INSTANTE, sin esperar al LLM.
    fetch(`${API}/api/atlax/blocks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
    }).then((r) => r.json()).then((d) => {
      if (d && Array.isArray(d.blocks) && d.blocks.length) patchMsg({ blocks: d.blocks });
    }).catch(() => {});

    // FASE 2 · el texto del LLM (más lento) — cuando llega, reemplaza el "pensando".
    try {
      const r = await fetch(`${API}/api/atlax/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, session_id: sessionRef.current, channel: 'web_surface' }),
      });
      const d = await r.json();
      if (d && d.session_id) sessionRef.current = d.session_id;
      const patch = { content: (d && d.answer) || 'Sin respuesta.', citations: (d && d.citations) || [], pending: false };
      if (d && Array.isArray(d.blocks) && d.blocks.length) patch.blocks = d.blocks;
      patchMsg(patch);
    } catch (_) {
      patchMsg({ content: 'No pude procesar eso ahora. Intenta de nuevo.', error: true, pending: false });
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
      {toast && (
        <div style={{ position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', background: 'var(--theme)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, zIndex: 60, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}
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
                      {m.content
                        ? <div style={{ fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.62, color: m.error ? '#fca5a5' : 'var(--cream)', whiteSpace: 'pre-wrap' }}>{m.error ? renderRich(m.content) : <TypewriterText text={m.content} />}</div>
                        : (m.pending && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 14, fontStyle: 'italic' }}>Atlax está pensando…</div>)}
                      {(m.blocks || []).length > 0 && <AtlaxBlocks blocks={m.blocks} />}
                      {i === messages.length - 1 && !busy && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                          {FOLLOWUPS.map((f) => <button key={f} onClick={() => send(f)} style={chip}>{f}</button>)}
                        </div>
                      )}
                      {i === messages.length - 1 && !busy && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                          <button onClick={saveSearch} style={cta}>💾 Guardar búsqueda</button>
                          <button onClick={() => navigate('/marketplace')} style={cta}>🏠 Ver en el marketplace</button>
                          <button onClick={wantAdvisor} style={ctaPrimary}>👤 Que un asesor me contacte</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
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
