/**
 * ChatThread — Phase 4 Batch 29
 * Hilo de mensajes entre comprador y asesor.
 * Props: thread, userRole ('buyer'|'asesor'), userId, onClose
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchMessages, sendMessage, markThreadRead } from '../../api/chat';
import ChatComposer from './ChatComposer';
import { X } from '../icons';

function fmtTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export default function ChatThread({ thread, userRole = 'buyer', userId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const containerRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!thread?.thread_id) return;
    try {
      const msgs = await fetchMessages(thread.thread_id);
      setMessages(msgs);
    } catch {
      // silent on poll failures
    }
  }, [thread?.thread_id]);

  useEffect(() => {
    if (!thread?.thread_id) return;
    setLoading(true);
    setError(null);
    loadMessages().finally(() => setLoading(false));

    // Mark read on mount
    markThreadRead(thread.thread_id).catch(() => {});

    // Poll every 30s
    pollRef.current = setInterval(() => {
      loadMessages();
    }, 30000);

    // Mark read when tab gets focus
    const onFocus = () => markThreadRead(thread.thread_id).catch(() => {});
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(pollRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [thread?.thread_id, loadMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (text) => {
    if (!thread?.thread_id) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(thread.thread_id, text);
      setMessages(prev => [...prev, msg]);
      await markThreadRead(thread.thread_id).catch(() => {});
    } catch (err) {
      setError(err.message || 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  if (!thread) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(240,235,224,0.3)', fontFamily: 'DM Sans', fontSize: 14,
      }}>
        Selecciona una conversación
      </div>
    );
  }

  const counterpart = thread.counterpart || {};
  const projectName = thread.project_name || thread.project_id;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0,
      background: 'rgba(6,8,15,0.6)',
      border: '1px solid rgba(240,235,224,0.08)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: 'rgba(13,16,23,0.92)',
        borderBottom: '1px solid rgba(240,235,224,0.08)',
        display: 'flex', alignItems: 'center', gap: 12,
        backdropFilter: 'blur(24px)',
      }}>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 9999,
          background: 'linear-gradient(135deg, var(--theme), var(--theme-3))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#fff',
          flexShrink: 0,
        }}>
          {(counterpart.name || 'A')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
            color: 'var(--cream, #F0EBE0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {counterpart.name || counterpart.email || 'Asesor DMX'}
          </div>
          {projectName && (
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(var(--theme-rgb),0.85)', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {projectName}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            data-testid="chat-thread-close"
            style={{
              width: 30, height: 30, borderRadius: 9999, flexShrink: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(240,235,224,0.12)',
              color: 'rgba(240,235,224,0.55)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        data-testid="chat-messages-list"
        style={{
          flex: 1, overflowY: 'auto', padding: '18px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
          minHeight: 0,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(240,235,224,0.3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando mensajes…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(240,235,224,0.3)', fontFamily: 'DM Sans', fontSize: 13, marginTop: 24 }}>
            Aún no hay mensajes. Escribe el primero.
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const isMine = msg.sender_id === userId;
              const showDate = i === 0 || fmtDate(messages[i - 1]?.sent_at) !== fmtDate(msg.sent_at);
              return (
                <React.Fragment key={msg.message_id}>
                  {showDate && (
                    <div style={{
                      textAlign: 'center', fontFamily: 'DM Sans', fontSize: 10,
                      color: 'rgba(240,235,224,0.3)', margin: '6px 0',
                    }}>
                      {fmtDate(msg.sent_at)}
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                  }}>
                    <div
                      data-testid={`chat-msg-${msg.message_id}`}
                      style={{
                        maxWidth: '72%',
                        padding: '10px 14px',
                        borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMine
                          ? 'rgba(240,235,224,0.10)'
                          : 'rgba(13,16,23,0.6)',
                        border: isMine
                          ? '1px solid rgba(240,235,224,0.15)'
                          : '1px solid rgba(var(--theme-rgb),0.22)',
                        backdropFilter: 'blur(12px)',
                      }}
                    >
                      <div style={{
                        fontFamily: 'DM Sans', fontSize: 13,
                        color: isMine ? 'var(--cream, #F0EBE0)' : 'rgba(240,235,224,0.9)',
                        lineHeight: '1.5', whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                      <div style={{
                        marginTop: 4, fontFamily: 'DM Sans', fontSize: 10,
                        color: 'rgba(240,235,224,0.3)',
                        textAlign: 'right',
                      }}>
                        {fmtTime(msg.sent_at)}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 16px', background: 'rgba(239,68,68,0.08)',
          borderTop: '1px solid rgba(239,68,68,0.18)',
          fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
        }}>
          {error}
        </div>
      )}

      <ChatComposer onSend={handleSend} loading={sending} />
    </div>
  );
}
