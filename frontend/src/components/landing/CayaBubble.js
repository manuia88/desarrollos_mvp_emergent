// CayaBubble — Public marketplace chat bubble powered by /api/caya/query (RAG).
// Anonymous session_id persisted in localStorage. No auth required.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle, X, ArrowRight, MessageSquare, AlertTriangle } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;
const SS_KEY = 'dmx.caya.session_id';
const SS_HISTORY = 'dmx.caya.history.v1';

function getSession() {
  try {
    let sid = localStorage.getItem(SS_KEY);
    if (!sid) {
      sid = `caya_anon_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      localStorage.setItem(SS_KEY, sid);
    }
    return sid;
  } catch { return null; }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(SS_HISTORY) || '[]'); }
  catch { return []; }
}

function saveHistory(h) {
  try { localStorage.setItem(SS_HISTORY, JSON.stringify(h.slice(-30))); }
  catch { /* quota */ }
}


function CitationPill({ cite, onNav }) {
  const handle = () => {
    if (!cite?.chunk_id) return;
    // dev::altavista-polanco::card → /desarrollo/altavista-polanco
    // col::roma-norte::card → /barrios/roma-norte (or /inteligencia)
    if (cite.chunk_id.startsWith('dev::')) {
      const slug = cite.chunk_id.split('::')[1];
      onNav(`/desarrollo/${slug}`);
    } else if (cite.chunk_id.startsWith('col::')) {
      onNav(`/barrios`);
    }
  };
  return (
    <button onClick={handle} data-testid={`caya-cite-${cite.chunk_id || 'na'}`} style={{
      padding: '3px 9px', borderRadius: 9999,
      background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)',
      color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      cursor: cite?.chunk_id ? 'pointer' : 'default', margin: '2px 4px 2px 0',
    }}>
      {cite.label || cite.chunk_id} <span style={{ opacity: 0.6, fontFamily: 'DM Mono' }}>· {cite.source_type}</span>
    </button>
  );
}


export default function CayaBubble() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('caya') === 'open'; }
    catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => loadHistory());
  const [sessionId] = useState(() => getSession());
  const scrollRef = useRef(null);

  useEffect(() => { saveHistory(messages); }, [messages]);
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  const send = async (e) => {
    e?.preventDefault?.();
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    const userMsg = { role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const r = await fetch(`${API}/api/caya/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, session_id: sessionId, channel: 'web' }),
      });
      const d = await r.json();
      const assistantMsg = {
        role: 'assistant',
        content: d.answer || 'Sin respuesta.',
        citations: d.citations || [],
        top_results: d.top_results || [],
        hand_off: d.hand_off_recommended,
        hand_off_reason: d.hand_off_reason,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No pude conectarme. Intenta de nuevo.',
        error: true,
        ts: Date.now(),
      }]);
    }
    setBusy(false);
  };

  const clearHistory = () => {
    setMessages([]);
    saveHistory([]);
  };

  return (
    <>
      {/* Bubble trigger */}
      {!open && (
        <button
          data-testid="caya-bubble"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
            width: 60, height: 60, borderRadius: 9999,
            background: 'var(--grad)', border: 'none', cursor: 'pointer',
            boxShadow: '0 12px 32px rgba(99,102,241,0.34)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          aria-label="Abrir chat Caya"
        >
          <Sparkle size={22} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div data-testid="caya-panel" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 'min(380px, calc(100vw - 24px))',
          height: 'min(540px, calc(100vh - 48px))',
          background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
          border: '1px solid var(--border)', borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'caya-pop 0.22s ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            background: 'linear-gradient(92deg, rgba(99,102,241,0.10), rgba(168,85,247,0.10))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9999, background: 'var(--grad)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
              }}>
                <Sparkle size={15} />
              </div>
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
                  Caya
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Asistente DMX · Beta
                </div>
              </div>
            </div>
            <button data-testid="caya-close" onClick={() => setOpen(false)} style={{
              padding: 6, background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
            }}><X size={12} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} data-testid="caya-messages" style={{
            flex: 1, overflowY: 'auto', padding: '14px 14px 8px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{
                padding: 20, textAlign: 'center', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.55,
              }}>
                <Sparkle size={20} color="var(--indigo-3)" />
                <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream-2)', margin: '8px 0 4px' }}>
                  ¿En qué te ayudo?
                </div>
                Pregúntame por desarrollos, colonias, precios o documentos verificados.
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    'Casa familiar en Polanco bajo 15M',
                    'Mejor calidad de aire en CDMX',
                    'Desarrollos en preventa con amenidades',
                  ].map((s, i) => (
                    <button key={i} data-testid={`caya-suggest-${i}`} onClick={() => setInput(s)} style={{
                      padding: '8px 12px', borderRadius: 9999, fontSize: 11.5,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                      color: 'var(--cream-2)', fontFamily: 'DM Sans', cursor: 'pointer',
                      textAlign: 'left',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} data-testid={`caya-msg-${m.role}`} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
              }}>
                <div style={{
                  padding: '10px 13px', borderRadius: 14,
                  background: m.role === 'user'
                    ? 'rgba(99,102,241,0.20)'
                    : (m.error ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.04)'),
                  border: `1px solid ${m.role === 'user' ? 'rgba(99,102,241,0.32)' : (m.error ? 'rgba(239,68,68,0.32)' : 'var(--border)')}`,
                  color: m.error ? '#fca5a5' : 'var(--cream)',
                  fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>

                {m.role === 'assistant' && (m.citations || []).length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap' }}>
                    {m.citations.map((c, j) => (
                      <CitationPill key={j} cite={c} onNav={(p) => navigate(p)} />
                    ))}
                  </div>
                )}

                {m.role === 'assistant' && m.hand_off && (
                  <div data-testid="caya-handoff" style={{
                    marginTop: 8, padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                  }}>
                    <AlertTriangle size={13} color="#fcd34d" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 12, color: '#fcd34d', marginBottom: 2 }}>
                        Conecta con un asesor verificado
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.45 }}>
                        {m.hand_off_reason || 'Para esta consulta, un asesor humano te ayudará mejor.'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <a href="https://wa.me/?text=Hola%2C%20vengo%20de%20DesarrollosMX%20y%20me%20gustar%C3%ADa%20agendar%20una%20llamada"
                           target="_blank" rel="noreferrer"
                           data-testid="caya-handoff-wa"
                           style={{
                             padding: '5px 10px', borderRadius: 9999,
                             background: 'rgba(34,197,94,0.16)', border: '1px solid rgba(34,197,94,0.32)',
                             color: '#86efac', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
                             textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                           }}>
                          <MessageSquare size={9} /> WhatsApp
                        </a>
                        <button onClick={() => navigate('/asesores')} data-testid="caya-handoff-asesor" style={{
                          padding: '5px 10px', borderRadius: 9999,
                          background: 'var(--grad)', border: 'none', color: '#fff',
                          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          Ver asesores <ArrowRight size={9} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div data-testid="caya-typing" style={{
                alignSelf: 'flex-start', padding: '10px 13px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, fontStyle: 'italic',
              }}>
                Caya está pensando<span className="caya-dots">…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={send} style={{
            padding: 12, borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, alignItems: 'center',
            background: '#0A0D16',
          }}>
            <input
              data-testid="caya-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pregúntame…"
              disabled={busy}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              data-testid="caya-send"
              disabled={busy || !input.trim()}
              style={{
                padding: '9px 14px', borderRadius: 9999,
                background: input.trim() && !busy ? 'var(--grad)' : 'rgba(255,255,255,0.08)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                cursor: input.trim() && !busy ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <ArrowRight size={11} />
            </button>
          </form>

          {/* Footer */}
          <div style={{
            padding: '6px 12px 8px', borderTop: '1px solid rgba(240,235,224,0.05)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            background: '#0A0D16',
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', letterSpacing: '0.05em' }}>
              Beta · Powered by DMX RAG
            </div>
            {messages.length > 0 && (
              <button onClick={clearHistory} data-testid="caya-clear" style={{
                background: 'transparent', border: 'none', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline',
              }}>Limpiar</button>
            )}
          </div>
        </div>
      )}

      {/* Animations + responsive */}
      <style>{`
        @keyframes caya-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .caya-dots { display: inline-block; animation: caya-blink 1.2s infinite; }
        @keyframes caya-blink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        @media (max-width: 480px) {
          [data-testid="caya-panel"] { right: 8px !important; bottom: 8px !important; left: 8px !important; width: auto !important; }
          [data-testid="caya-bubble"] { right: 12px !important; bottom: 12px !important; }
        }
      `}</style>
    </>
  );
}
