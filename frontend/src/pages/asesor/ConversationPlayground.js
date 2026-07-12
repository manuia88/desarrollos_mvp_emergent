// W7.AS.3.A · ConversationPlayground — 3 columnas: config | chat | detalle del turno.
// Aurora design. El asesor afina el system prompt, conversa con el agente IA y observa
// el detalle de cada turno (modelo, latencia, sentimiento, stub, handoff sugerido).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Send, RotateCcw, Loader2, Wrench, PhoneForwarded } from 'lucide-react';
import PortalLayout from '../../components/shared/PortalLayout';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRADIENT = 'linear-gradient(135deg, #6366F1, #EC4899)';
const CHANNELS = ['inapp', 'web', 'email', 'whatsapp'];
const SENTIMENT_COLOR = { positive: '#22C55E', neutral: '#94A3B8', negative: '#EF4444' };

function authHeaders() {
  // Seguridad: la cookie httponly (access_token) autentica vía credentials:'include'.
  // Ya no se lee el token de localStorage (vector XSS).
  return {};
}

function ConversationPlaygroundBody() {
  const { t } = useTranslation('conversation_round1');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [context, setContext] = useState('');
  const [channel, setChannel] = useState('inapp');
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastTurn, setLastTurn] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const reset = useCallback(() => {
    setConvId(null);
    setMessages([]);
    setLastTurn(null);
    setInput('');
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/conversation/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          channel,
          system_prompt: systemPrompt || null,
          initial_context: context || null,
        }),
      });
      if (!res.ok) throw new Error('start_failed');
      const data = await res.json();
      setConvId(data.conversation_id);
      setMessages([]);
      setLastTurn(null);
    } catch (e) {
      setLastTurn({ error: true });
    } finally {
      setBusy(false);
    }
  }, [channel, systemPrompt, context]);

  const send = useCallback(async () => {
    const text = (input || '').trim();
    if (!text || busy || !convId) return;
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    try {
      const res = await fetch(`${API}/api/conversation/message`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ conversation_id: convId, message: text, channel }),
      });
      if (!res.ok) throw new Error('message_failed');
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.assistant_message || '' }]);
      setLastTurn(data);
    } catch (e) {
      setLastTurn({ error: true });
    } finally {
      setBusy(false);
    }
  }, [input, busy, convId, channel]);

  const requestHandoff = useCallback(async () => {
    if (!convId) return;
    try {
      await fetch(`${API}/api/conversation/handoff`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ conversation_id: convId, reason: 'playground' }),
      });
      setLastTurn((lt) => ({ ...(lt || {}), status: 'handoff' }));
    } catch (e) { /* no-op */ }
  }, [convId]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const col = {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0,
  };
  const label = { fontSize: 12, color: 'var(--cream-3, var(--cream-3))', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const fieldStyle = {
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
    color: 'var(--cream, var(--cream))', padding: '10px 12px', fontSize: 13, outline: 'none', width: '100%',
    fontFamily: 'DM Sans, system-ui, sans-serif', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 24, color: 'var(--cream, var(--cream))', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageCircle size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>{t('playground.title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cream-2)' }}>{t('playground.subtitle')}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 300px', gap: 16, height: 'calc(100vh - 160px)' }}>
        {/* COL 1 · config */}
        <div style={col}>
          <div style={label}>{t('playground.col_config')}</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...label, fontSize: 11 }}>{t('playground.channel_label')}</div>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} style={fieldStyle} disabled={!!convId}>
              {CHANNELS.map((c) => <option key={c} value={c}>{t(`channels.${c}`)}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ ...label, fontSize: 11 }}>{t('playground.system_prompt_label')}</div>
            <textarea
              value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('playground.system_prompt_placeholder')} disabled={!!convId}
              style={{ ...fieldStyle, flex: 1, resize: 'none', lineHeight: 1.5, minHeight: 120 }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...label, fontSize: 11 }}>{t('playground.context_label')}</div>
            <textarea
              value={context} onChange={(e) => setContext(e.target.value)}
              placeholder={t('playground.context_placeholder')} disabled={!!convId} rows={3}
              style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!convId ? (
              <button type="button" onClick={start} disabled={busy}
                style={{ flex: 1, background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff', padding: '10px 0', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {t('playground.start')}
              </button>
            ) : (
              <button type="button" onClick={reset}
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream, var(--cream))', padding: '10px 0', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RotateCcw size={15} /> {t('playground.reset')}
              </button>
            )}
          </div>
        </div>

        {/* COL 2 · chat */}
        <div style={col}>
          <div style={label}>{t('playground.col_chat')}</div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
            {!convId && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13, maxWidth: 280 }}>
                {t('playground.start_first')}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%',
                background: m.role === 'user' ? 'rgba(99,102,241,0.22)' : 'var(--surface-2)',
                borderRadius: 12, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            ))}
            {busy && convId && (
              <div style={{ alignSelf: 'flex-start', color: 'var(--cream-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {t('playground.thinking')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
              placeholder={t('playground.input_placeholder')} disabled={!convId || busy}
              style={fieldStyle} />
            <button type="button" onClick={send} disabled={!convId || busy || !input.trim()}
              style={{ background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff', padding: '0 16px', cursor: (!convId || busy || !input.trim()) ? 'default' : 'pointer', opacity: (!convId || busy || !input.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
              <Send size={17} />
            </button>
          </div>
        </div>

        {/* COL 3 · detalle del turno */}
        <div style={col}>
          <div style={label}><Wrench size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t('playground.col_tools')}</div>
          {!lastTurn || lastTurn.error ? (
            <div style={{ color: 'var(--cream-3)', fontSize: 13, marginTop: 8 }}>{t('playground.no_tools')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <Detail label={t('playground.model')} value={lastTurn.model || '—'} />
              <Detail label={t('playground.latency')} value={lastTurn.latency_ms != null ? `${lastTurn.latency_ms} ms` : '—'} />
              <Detail label={t('playground.sentiment')}
                value={<span style={{ color: SENTIMENT_COLOR[lastTurn.sentiment] || '#94A3B8' }}>{t(`sentiment.${lastTurn.sentiment || 'neutral'}`)}</span>} />
              {lastTurn.stub && (
                <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '6px 10px', color: '#F59E0B', fontSize: 12 }}>
                  {t('playground.stub_mode')}
                </div>
              )}
              {lastTurn.suggested_handoff && (
                <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '6px 10px', color: '#A5B4FC', fontSize: 12 }}>
                  {t('playground.handoff_suggested')}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <div style={{ ...label, fontSize: 11 }}>Tools</div>
                {(lastTurn.tools_used && lastTurn.tools_used.length)
                  ? lastTurn.tools_used.map((tn) => <span key={tn} style={{ display: 'inline-block', background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', fontSize: 12, marginRight: 6 }}>{tn}</span>)
                  : <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>{t('playground.no_tools')}</span>}
              </div>
            </div>
          )}
          {convId && (
            <button type="button" onClick={requestHandoff}
              style={{ marginTop: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream, var(--cream))', padding: '9px 0', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <PhoneForwarded size={15} /> {t('playground.request_handoff')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function ConversationPlayground(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <ConversationPlaygroundBody {...props} />
    </PortalLayout>
  );
}
