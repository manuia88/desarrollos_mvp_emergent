// W7.AS.3.A · ChatWidget — embebible en landings Z.8 (iframe-ready).
// 280px wide, bottom-right. Habla con /api/conversation (start + message públicos).
// Si corre dentro de un <iframe>, reenvía cada turno al host vía window.postMessage.
//
// D6 audit recheck · IMPORTANTE para embebido en Z.8:
//   Si el iframe usa Referrer-Policy: no-referrer (o "strict-origin-when-cross-origin"
//   con cross-origin), document.referrer estará vacío y NO podremos derivar el origin
//   del host. En ese caso el relay postMessage se vuelve silencioso (NO leak · pero
//   degrada la integración). Para evitarlo, en Z.8 landings PASA explícitamente
//   la prop hostOrigin con el origin del landing (ej: hostOrigin="https://desarrollosmx.io").
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const STORE_KEY = 'dmx_conv_widget_id';

const GRADIENT = 'linear-gradient(135deg, #6366F1, #EC4899)';

export default function ChatWidget({
  leadId = null,
  channel = 'web',
  initialContext = null,
  defaultOpen = false,
  hostOrigin = null,   // F7 fix · explicit origin del landing Z.8 que embebe
}) {
  const { t } = useTranslation('conversation_round1');
  const [open, setOpen] = useState(defaultOpen);
  const [convId, setConvId] = useState(() => {
    try { return sessionStorage.getItem(STORE_KEY) || null; } catch { return null; }
  });
  const [messages, setMessages] = useState([
    { role: 'assistant', content: t('widget.greeting') },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Relay each turn to the iframe host (Z.8 landing) if embedded.
  // F7 fix · NEVER usar '*' como targetOrigin (leak content a cualquier host).
  // Si hostOrigin no se provee, derivamos del document.referrer (mismo origen).
  const relayToHost = useCallback((payload) => {
    try {
      if (window.parent && window.parent !== window) {
        let target = hostOrigin;
        if (!target) {
          try {
            const ref = document.referrer || '';
            if (ref) target = new URL(ref).origin;
          } catch { /* invalid referrer */ }
        }
        if (target) {
          window.parent.postMessage(
            { type: 'dmx:conversation:message', ...payload }, target,
          );
        }
        // Si no podemos resolver origin seguro, NO enviamos (silencioso · F7).
      }
    } catch { /* no-op */ }
  }, [hostOrigin]);

  const ensureConversation = useCallback(async () => {
    if (convId) return convId;
    const res = await fetch(`${API}/api/conversation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, channel, initial_context: initialContext }),
    });
    if (!res.ok) throw new Error('start_failed');
    const data = await res.json();
    setConvId(data.conversation_id);
    try { sessionStorage.setItem(STORE_KEY, data.conversation_id); } catch { /* no-op */ }
    return data.conversation_id;
  }, [convId, leadId, channel, initialContext]);

  const send = useCallback(async () => {
    const text = (input || '').trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    try {
      const id = await ensureConversation();
      const res = await fetch(`${API}/api/conversation/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, message: text, channel }),
      });
      if (!res.ok) throw new Error('message_failed');
      const data = await res.json();
      const reply = data.assistant_message || '';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      relayToHost({ conversation_id: id, role: 'assistant', text: reply });
    } catch (e) {
      setError(t('widget.error'));
      setMessages((m) => [...m, { role: 'assistant', content: t('widget.error') }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, channel, ensureConversation, relayToHost, t]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {open ? (
        <div
          role="dialog"
          aria-label={t('widget.title')}
          style={{
            width: 280, height: 420, display: 'flex', flexDirection: 'column',
            background: '#0D1017', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          }}
        >
          {/* header */}
          <div style={{ background: GRADIENT, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t('widget.title')}</span>
            <button
              type="button" onClick={() => setOpen(false)} aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  background: m.role === 'user' ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.06)',
                  color: '#F0EBE0', borderRadius: 12, padding: '8px 10px', fontSize: 13, lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', color: 'rgba(240,235,224,0.5)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {t('playground.thinking')}
              </div>
            )}
          </div>

          {/* input */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 8, display: 'flex', gap: 6 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('widget.placeholder')}
              aria-label={t('widget.placeholder')}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 10, color: '#F0EBE0', padding: '8px 10px', fontSize: 13, outline: 'none',
              }}
            />
            <button
              type="button" onClick={send} disabled={busy || !input.trim()} aria-label={t('widget.send')}
              style={{
                background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff',
                padding: '0 12px', cursor: busy || !input.trim() ? 'default' : 'pointer',
                opacity: busy || !input.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center',
              }}
            >
              <Send size={16} />
            </button>
          </div>
          {error ? <div style={{ color: '#EF4444', fontSize: 11, padding: '0 10px 6px' }}>{error}</div> : null}
          <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(240,235,224,0.35)', padding: '0 0 6px' }}>
            {t('widget.powered')}
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => setOpen(true)} aria-label={t('widget.title')}
          style={{
            width: 56, height: 56, borderRadius: '50%', background: GRADIENT, border: 'none',
            color: '#fff', cursor: 'pointer', boxShadow: '0 12px 32px rgba(99,102,241,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  );
}
