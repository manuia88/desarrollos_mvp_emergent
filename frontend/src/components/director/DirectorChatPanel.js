/**
 * W4.4 — Phase Y.1A · DirectorChatPanel
 *
 * Chat completo con el Director AI:
 * - Header: tier badge + simulation chip + progress bar
 * - Scrollable history: user (cream) / assistant (dark glass) / tool chips
 * - Footer: textarea autoresize + send rounded-full gradient
 * - Empty / Loading / Error states
 *
 * Props: { user }
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startSession, sendMessage, getMessages, endSession } from '../../api/directorApi';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Token progress bar ───────────────────────────────────────────────────────
const TIER_CAPS_IN = { T1: 50000, T2: 100000, T3: 200000, T4: null, off: 0 };

function TokenBar({ used, cap, label }) {
  if (!cap) return null;
  const pct = Math.min((used / cap) * 100, 100);
  const color = pct > 85 ? '#f87171' : pct > 60 ? '#fbbf24' : 'var(--theme)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.10)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color: 'rgba(var(--cream-rgb),0.45)', whiteSpace: 'nowrap' }}>
        {label}: {(used / 1000).toFixed(1)}k / {(cap / 1000).toFixed(0)}k
      </span>
    </div>
  );
}

// ─── Memory hits collapsible ─────────────────────────────────────────────────
const SOURCE_TYPE_LABELS = {
  diagnostic:         'Diagnóstico',
  ie_score:           'Score IE',
  behavioral:         'Sesión',
  director_summary:   'Resumen',
};

function MemoryHitsBlock({ hits, tier }) {
  const [expanded, setExpanded] = React.useState(false);
  // Solo visible para tier ≥ T2
  if (!hits || hits.length === 0 || tier === 'T1' || tier === 'off') return null;

  return (
    <div data-testid="director-memory-hits" style={{ marginTop: 5, marginLeft: 0 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          display: 'flex', alignItems: 'center', gap: 5,
          color: 'rgba(var(--cream-rgb),0.45)', fontSize: 10.5, fontFamily: 'DM Sans',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        Memorias usadas ({hits.length})
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {expanded && (
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {hits.map((h, i) => (
            <div key={i} style={{
              padding: '4px 9px', borderRadius: 7,
              background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid rgba(var(--cream-rgb),0.07)',
              display: 'flex', alignItems: 'baseline', gap: 6,
            }}>
              <span style={{
                padding: '1px 6px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700,
                background: 'rgba(var(--theme-rgb),0.12)', border: '1px solid rgba(var(--theme-rgb),0.25)',
                color: 'var(--theme)', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {SOURCE_TYPE_LABELS[h.source_type] || h.source_type}
              </span>
              <span style={{ fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.45)', lineHeight: 1.4 }}>
                {(h.content_summary || '').slice(0, 80)}{(h.content_summary || '').length > 80 ? '…' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ToolChip({ toolName }) {
  const labels = {
    get_ie_score:    'IE Score',
    get_unit_score:  'Unit Score',
    get_comparables: 'Comparables',
    get_org_kpis:    'KPIs Org',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 600,
      background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.32)',
      color: 'var(--theme)', margin: '2px 2px 0',
    }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      {labels[toolName] || toolName}
    </span>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, tier }) {
  const isUser = msg.role === 'user';
  const toolCalls = msg.tool_calls || [];
  const memoryHits = msg.memory_hits || [];

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      <div style={{ maxWidth: '80%' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser
            ? 'rgba(var(--cream-rgb),0.90)'
            : 'rgba(var(--bg-rgb),0.92)',
          border: isUser
            ? 'none'
            : '1px solid rgba(var(--cream-rgb),0.09)',
          backdropFilter: isUser ? 'none' : 'blur(24px)',
          fontFamily: 'DM Sans',
          fontSize: 13.5,
          color: isUser ? '#06080F' : '#F0EBE0',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.content}
          {msg.simulated && (
            <span style={{ display: 'block', marginTop: 4, fontSize: 10.5, color: 'var(--amber)', fontWeight: 600 }}>
              [SIMULADO]
            </span>
          )}
          {toolCalls.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {toolCalls.map((t, i) => <ToolChip key={i} toolName={typeof t === 'string' ? t : t.tool_name} />)}
            </div>
          )}
        </div>
        {/* Memory hits — solo en assistant msgs */}
        {!isUser && (
          <MemoryHitsBlock hits={memoryHits} tier={tier} />
        )}
      </div>
    </div>
  );
}

// ─── Skeleton bubble ──────────────────────────────────────────────────────────
function SkeletonBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        padding: '12px 16px', borderRadius: '4px 18px 18px 18px',
        background: 'rgba(var(--bg-rgb),0.60)', border: '1px solid rgba(var(--cream-rgb),0.07)',
        backdropFilter: 'blur(24px)', width: 200,
      }}>
        <div style={{ height: 10, borderRadius: 5, background: 'rgba(var(--cream-rgb),0.12)', marginBottom: 6, animation: 'pulse 1.4s ease-in-out infinite' }} />
        <div style={{ height: 10, borderRadius: 5, background: 'rgba(var(--cream-rgb),0.08)', width: '65%', animation: 'pulse 1.4s ease-in-out infinite 0.1s' }} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  const suggestions = [
    '¿Cuál es el score IE de mi portafolio?',
    'Dame los KPIs de los últimos 30 días',
    '¿Cuáles son los comparables de la unidad U-001?',
    'Analiza el riesgo de mis proyectos activos',
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', marginBottom: 16,
        background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 6 }}>
        Pregúntame sobre tu portfolio
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(var(--cream-rgb),0.45)', maxWidth: 280, lineHeight: 1.5 }}>
        Comparables, leads, KPIs de tu org, o scores IE de desarrollos y unidades.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18, width: '100%', maxWidth: 320 }}>
        {suggestions.map((s, i) => (
          <div key={i} data-suggestion={s} style={{
            padding: '8px 12px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans',
            background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)',
            color: 'var(--theme)', cursor: 'pointer', textAlign: 'left',
            transition: 'border-color 0.15s',
          }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function DirectorChatPanel({ user }) {
  const [sessionId, setSessionId]     = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [starting, setStarting]       = useState(false);
  const [error, setError]             = useState(null);
  const [phaseYOff, setPhaseYOff]     = useState(false);

  const scrollRef   = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom
  const scrollDown = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollDown(); }, [messages, loading, scrollDown]);

  // Autoresize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Start session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStarting(true);
      try {
        const sess = await startSession();
        if (!cancelled) {
          setSessionId(sess.session_id);
          setSessionMeta(sess);
        }
      } catch (e) {
        if (!cancelled) {
          if (e.message?.includes('Phase Y') || e.message?.includes('desactivada') || e.message?.includes('403')) {
            setPhaseYOff(true);
          } else {
            setError(e.message);
          }
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Refresh session metadata
  const refreshMeta = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const meta = await fetch(`${API}/api/director/sessions/${sid}`, { credentials: 'include' });
      if (meta.ok) setSessionMeta(await meta.json());
    } catch (_) {}
  }, []);

  // Handle suggestion click
  const handleSuggestion = useCallback((e) => {
    const suggestion = e.target.closest('[data-suggestion]')?.dataset?.suggestion;
    if (suggestion) {
      setInput(suggestion);
      textareaRef.current?.focus();
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !sessionId) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text, created_at: new Date().toISOString() }]);
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessage(sessionId, text);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.assistant_message,
        tool_calls: res.tool_calls || [],
        memory_hits: res.memory_hits || [],
        simulated: res.simulated,
        created_at: new Date().toISOString(),
      }]);
      // Refresh session meta to update token counters
      await refreshMeta(sessionId);
    } catch (e) {
      if (e.message?.includes('410') || e.message?.includes('terminada')) {
        setError('Sesión expirada. Recarga para iniciar una nueva.');
        setSessionId(null);
      } else {
        setError(e.message || 'Error al enviar mensaje. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, refreshMeta]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Renders ─────────────────────────────────────────────────────────────────
  if (starting) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans' }}>
        Iniciando Director AI…
      </div>
    );
  }

  if (phaseYOff) {
    return (
      <div style={{
        padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12,
      }}>
        <div style={{
          padding: '18px 24px', borderRadius: 14, maxWidth: 380,
          background: 'rgba(var(--bg-rgb),0.92)', border: '1px solid rgba(var(--cream-rgb),0.09)',
          backdropFilter: 'blur(24px)',
        }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 6 }}>
            Director AI no disponible
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(var(--cream-rgb),0.55)', lineHeight: 1.5, marginBottom: 12 }}>
            Phase Y está desactivado para tu organización. Contacta a tu administrador para activarlo.
          </div>
          <a href="mailto:hola@desarrollosmx.io" style={{
            display: 'inline-block', padding: '7px 18px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff',
            textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
          }}>
            Contactar soporte
          </a>
        </div>
      </div>
    );
  }

  const tier = sessionMeta?.tier_at_start || 'T1';
  const tokensIn = sessionMeta?.total_tokens_in || 0;
  const capIn = TIER_CAPS_IN[tier];
  const isSimMode = sessionMeta?.simulation_mode;

  return (
    <div data-testid="director-chat-panel" style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 220px)', minHeight: 400, maxHeight: 780,
      borderRadius: 16, overflow: 'hidden',
      background: 'rgba(var(--bg-rgb),0.65)',
      border: '1px solid rgba(var(--cream-rgb),0.08)',
      backdropFilter: 'blur(24px)',
    }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid rgba(var(--cream-rgb),0.07)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          Director AI
        </div>

        {/* Tier badge */}
        <span data-testid="director-tier-badge" style={{
          padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700,
          background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.32)',
          color: 'var(--theme)',
        }}>
          {tier}
        </span>

        {/* Simulation chip */}
        {isSimMode && (
          <span data-testid="director-sim-chip" style={{
            padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.32)',
            color: 'var(--amber)',
          }}>
            SIMULACIÓN
          </span>
        )}

        {/* Token progress */}
        <div style={{ marginLeft: 'auto' }}>
          <TokenBar used={tokensIn} cap={capIn} label="tokens" />
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column' }}
        onClick={handleSuggestion}
      >
          {messages.length === 0 && !loading ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((m, i) => <MessageBubble key={i} msg={m} tier={tier} />)}
              {loading && <SkeletonBubble />}
            </>
          )}

        {/* Error banner */}
        {error && (
          <div data-testid="director-error-banner" style={{
            padding: '8px 12px', borderRadius: 9999, marginTop: 8,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)',
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid rgba(var(--cream-rgb),0.07)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={textareaRef}
          data-testid="director-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pregúntame sobre tu portfolio, comparables, leads o KPIs…"
          rows={1}
          disabled={loading || !sessionId}
          style={{
            flex: 1, resize: 'none', overflow: 'hidden',
            padding: '9px 14px', borderRadius: 22,
            background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.12)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.5,
            outline: 'none', transition: 'border-color 0.15s',
          }}
        />
        <button
          data-testid="director-send-btn"
          onClick={handleSend}
          disabled={loading || !input.trim() || !sessionId}
          style={{
            padding: '9px 18px', borderRadius: 9999, border: 'none',
            background: loading || !input.trim() || !sessionId
              ? 'rgba(var(--cream-rgb),0.06)'
              : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            color: loading || !input.trim() || !sessionId ? 'rgba(var(--cream-rgb),0.30)' : '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            cursor: loading || !input.trim() || !sessionId ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.2s', flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {loading ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

export default DirectorChatPanel;
