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


// ─── LeadCaptureMiniForm (W4.4E.5.1) ─────────────────────────────────────
function LeadCaptureMiniForm({ asistenteToken, onSuccess, onClose }) {
  const [nombre, setNombre] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const validNombre = nombre.trim().length >= 2;
  // Acepta 10 dígitos mexicanos (con o sin prefix +52, espacios, guiones)
  const wsClean = whatsapp.replace(/[^0-9]/g, '');
  const validWs = /^(?:52)?\d{10}$/.test(wsClean);
  const valid = validNombre && validWs && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      const { captureLeadFromCaya } = await import('../../api/cayaApi');
      await captureLeadFromCaya(asistenteToken, {
        nombre: nombre.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim() || null,
      });
      setSuccess(true);
      try { localStorage.setItem(`dmx.caya.lead_captured.${asistenteToken}`, 'true'); } catch (_) {/*ignore*/}
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'No pudimos guardar tus datos.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div data-testid="caya-lead-success" style={{
        padding: 12, borderRadius: 12, marginTop: 8,
        background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.32)',
        backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#86efac', flex: 1, lineHeight: 1.5 }}>
          Te contactaremos pronto · Usaremos WhatsApp.
        </div>
        <button onClick={onClose} style={{
          padding: '4px 10px', borderRadius: 9999, background: 'transparent',
          border: '1px solid rgba(74,222,128,0.32)', color: '#86efac',
          fontFamily: 'DM Sans', fontSize: 10, cursor: 'pointer',
        }}>OK</button>
      </div>
    );
  }

  return (
    <form data-testid="caya-lead-form" onSubmit={handleSubmit} style={{
      padding: 12, borderRadius: 12, marginTop: 8,
      background: 'rgba(13,16,23,0.85)',
      border: '1px solid rgba(99,102,241,0.32)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)',
        letterSpacing: '-0.01em',
      }}>
        ¿Te conectamos con un asesor?
      </div>
      <input
        data-testid="caya-lead-nombre"
        value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre"
        style={miniInput()}
      />
      <input
        data-testid="caya-lead-whatsapp"
        value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
        placeholder="WhatsApp (+52 ...)"
        style={miniInput()}
      />
      <input
        data-testid="caya-lead-email"
        value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email (opcional)"
        style={miniInput()}
      />
      {error && (
        <div data-testid="caya-lead-error" style={{
          fontFamily: 'DM Sans', fontSize: 10, color: '#fca5a5',
          padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.30)',
        }}>{error}</div>
      )}
      <button
        type="submit"
        data-testid="caya-lead-submit"
        disabled={!valid}
        style={{
          marginTop: 2, padding: '7px 12px', borderRadius: 9999,
          background: valid ? 'var(--grad)' : 'rgba(255,255,255,0.08)',
          color: '#fff', border: 'none', cursor: valid ? 'pointer' : 'not-allowed',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
          opacity: valid ? 1 : 0.6,
        }}
      >
        {submitting ? 'Enviando…' : 'Conectarme'}
      </button>
    </form>
  );
}

function miniInput() {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11.5,
    outline: 'none',
  };
}


function MemoryHitsBlock({ hits }) {  const [open, setOpen] = useState(false);
  if (!hits || hits.length === 0) return null;
  return (
    <div data-testid="caya-memory-hits" style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '3px 8px', borderRadius: 9999,
        background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)',
        color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
        cursor: 'pointer',
      }}>
        {open ? '▼' : '▶'} Memorias usadas ({hits.length})
      </button>
      {open && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {hits.map((h, i) => (
            <div key={i} style={{
              padding: '4px 8px', borderRadius: 8,
              background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.06)',
              fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)',
            }}>
              <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{h.source_type}</span>
              {' · '}
              <span>{(h.summary || h.content_summary || '').slice(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function CitationPill({ cite, onNav }) {  const handle = () => {
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
  const [sessionId, setSessionId] = useState(() => getSession());
  const [asistenteToken, setAsistenteToken] = useState(() => {
    try { return localStorage.getItem('dmx.caya.asistente_token') || null; } catch { return null; }
  });
  const [tier, setTier] = useState(null);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const scrollRef = useRef(null);

  // Check localStorage flag once asistenteToken is known
  useEffect(() => {
    if (!asistenteToken) return;
    try {
      if (localStorage.getItem(`dmx.caya.lead_captured.${asistenteToken}`) === 'true') {
        setLeadCaptured(true);
      }
    } catch (_) { /* ignore */ }
  }, [asistenteToken]);

  // Auto-show lead form when latest assistant msg recommends hand_off or capture
  useEffect(() => {
    if (leadCaptured || !asistenteToken) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && (lastAssistant.hand_off || lastAssistant.suggested_capture)) {
      setShowLeadForm(true);
    }
  }, [messages, leadCaptured, asistenteToken]);

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
        body: JSON.stringify({ query: q, session_id: sessionId, channel: 'web_bubble' }),
      });
      const d = await r.json();
      // Persist asistente_session_token for /asistente expand link
      if (d.asistente_session_token) {
        setAsistenteToken(d.asistente_session_token);
        try { localStorage.setItem('dmx.caya.asistente_token', d.asistente_session_token); } catch (_) { /* ignore */ }
      }
      // Sync session_id with backend (may have generated new dmx_caya_* if we sent null)
      if (d.session_id && d.session_id !== sessionId) {
        setSessionId(d.session_id);
        try { localStorage.setItem(SS_KEY, d.session_id); } catch (_) { /* ignore */ }
      }
      if (d.tier) setTier(d.tier);
      const assistantMsg = {
        role: 'assistant',
        content: d.answer || 'Sin respuesta.',
        citations: d.citations || [],
        top_results: d.top_results || [],
        hand_off: d.hand_off_recommended,
        hand_off_reason: d.hand_off_reason,
        memory_hits: d.memory_hits || [],
        tool_calls: d.tool_calls || [],
        suggested_capture: d.intent_detected === 'cita' || d.intent_detected === 'presupuesto',
        simulated: d.simulated,
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
              {tier && (
                <span data-testid="caya-tier-badge" style={{
                  marginLeft: 4, padding: '2px 8px', borderRadius: 9999,
                  fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                  background: 'var(--grad)', color: '#fff',
                }}>{tier}</span>
              )}
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
                {m.role === 'assistant' && (m.memory_hits || []).length > 0 && (
                  <MemoryHitsBlock hits={m.memory_hits} />
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

            {/* Lead capture mini-form (W4.4E.5.1) */}
            {showLeadForm && asistenteToken && !leadCaptured && (
              <LeadCaptureMiniForm
                asistenteToken={asistenteToken}
                onSuccess={() => setLeadCaptured(true)}
                onClose={() => setShowLeadForm(false)}
              />
            )}
          </div>

          {/* Expand to /asistente CTA */}
          {asistenteToken && (messages.length >= 5 || messages.some(m => m.role === 'assistant' && (m.hand_off || m.suggested_capture))) && (
            <div style={{ padding: '0 14px 8px' }}>
              <button
                data-testid="caya-expand-btn"
                onClick={() => { window.location.href = `/asistente?session_token=${asistenteToken}`; }}
                style={{
                  width: '100%', padding: '8px 14px', borderRadius: 9999,
                  background: 'var(--grad)', color: '#fff', border: 'none',
                  fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  letterSpacing: '0.02em',
                }}
              >
                Expandir conversación <ArrowRight size={11} />
              </button>
            </div>
          )}

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
