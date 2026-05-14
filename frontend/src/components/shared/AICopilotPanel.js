/**
 * Phase 4 Batch 23 — AICopilotPanel
 * Slide-in drawer (right · 480px desktop / fullscreen mobile) + floating
 * trigger button. Toggles via Cmd+J (mod+J) shortcut or trigger button.
 *
 * Wired in PortalLayout.js. Uses useAICopilot for state + dispatch events
 * to coordinate with global keyboard hook.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import useAICopilot, { dispatchCopilotToggle } from '../../hooks/useAICopilot';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import { getQuickActionsForRole } from '../../config/copilotPrompts';
import {
  Sparkle, X, Plus, Trash, ArrowRight, MessageCircle, ChevronLeft,
} from '../icons';

function FloatingTrigger({ hidden, onClick }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="copilot-trigger-btn"
      aria-label="Abrir Copilot DMX (Cmd+J)"
      style={{
        position: 'fixed', right: 22, bottom: 84, zIndex: 901,
        width: 52, height: 52, borderRadius: 9999,
        background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
        border: 'none', color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(12px)',
        transition: 'transform 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <Sparkle size={22} color="#fff" />
    </button>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div
      data-testid={`copilot-msg-${msg.role}`}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        background: isUser ? 'rgba(240,235,224,0.10)' : 'rgba(13,16,23,0.92)',
        border: '1px solid ' + (isUser ? 'rgba(240,235,224,0.14)' : 'rgba(var(--theme-rgb),0.30)'),
        backdropFilter: 'blur(24px)',
        borderRadius: 14,
        padding: '10px 14px',
        color: 'var(--cream)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      {isUser ? (
        <span>{msg.content}</span>
      ) : (
        <div className="dmx-md">
          <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
          {msg.meta?.tokens_used != null && (
            <div style={{
              marginTop: 6, fontSize: 10, color: 'var(--cream-3)',
              opacity: 0.6, letterSpacing: 0.3,
            }}>
              {msg.meta.fallback ? 'fallback' : 'sonnet 4.5'} · {msg.meta.tokens_used} tokens
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationsSidebar({
  conversations, current, onPick, onNew, onDelete, onClose,
}) {
  return (
    <div
      data-testid="copilot-history-panel"
      style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '60%',
        maxWidth: 280,
        background: 'rgba(13,16,23,0.96)',
        borderRight: '1px solid rgba(240,235,224,0.10)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', zIndex: 2,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid rgba(240,235,224,0.08)',
      }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, color: 'var(--cream)', fontSize: 13 }}>
          Conversaciones
        </span>
        <button onClick={onClose} aria-label="Cerrar"
          style={{
            background: 'transparent', border: 'none', color: 'var(--cream-3)',
            cursor: 'pointer', padding: 4,
          }}>
          <ChevronLeft size={14} />
        </button>
      </div>
      <button
        data-testid="copilot-new-conv"
        onClick={onNew}
        style={{
          margin: 12, padding: '8px 12px', borderRadius: 9999,
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          border: 'none', color: '#fff',
          fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        <Plus size={11} /> Nueva conversación
      </button>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {conversations.length === 0 ? (
          <div style={{ padding: 12, fontSize: 11.5, color: 'var(--cream-3)' }}>
            Aún no hay conversaciones guardadas.
          </div>
        ) : conversations.map((c) => (
          <div
            key={c.id}
            data-testid={`copilot-conv-${c.id}`}
            onClick={() => onPick(c.id)}
            style={{
              padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
              marginBottom: 4,
              background: current === c.id ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
              border: '1px solid ' + (current === c.id ? 'rgba(var(--theme-rgb),0.32)' : 'transparent'),
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                color: 'var(--cream)', fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{c.last_topic}</div>
              <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>
                {c.message_count} mensajes
              </div>
            </div>
            <button
              data-testid={`copilot-conv-del-${c.id}`}
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              aria-label="Eliminar conversación"
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--cream-3)', cursor: 'pointer', padding: 2,
              }}>
              <Trash size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onPick, prompts }) {
  return (
    <div data-testid="copilot-empty" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14,
      textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 9999,
        background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.20), rgba(var(--theme-rgb),0.20))',
        border: '1px solid rgba(var(--theme-rgb),0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Sparkle size={26} color="var(--theme)" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'Outfit', fontSize: 17, fontWeight: 700, color: 'var(--cream)' }}>
          Pregúntame lo que necesites
        </span>
        <span style={{ fontSize: 12, color: 'var(--cream-3)', maxWidth: 340 }}>
          Tengo contexto de tus proyectos, leads y métricas. Empieza con una de
          estas preguntas o escribe la tuya.
        </span>
      </div>
      <div style={{
        display: 'grid', gap: 8, gridTemplateColumns: '1fr',
        width: '100%', maxWidth: 380,
      }}>
        {prompts.slice(0, 4).map((p) => (
          <button
            key={p.id}
            data-testid={`copilot-empty-suggest-${p.id}`}
            onClick={() => onPick(p)}
            style={{
              padding: '10px 14px', borderRadius: 12,
              border: '1px solid rgba(240,235,224,0.14)',
              background: 'rgba(13,16,23,0.92)',
              color: 'var(--cream-2)',
              fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              transition: 'transform 160ms ease, border-color 160ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.32)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(240,235,224,0.14)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}>
            <span>{p.label}</span>
            <ArrowRight size={11} color="var(--theme)" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AICopilotPanel({ user }) {
  const cp = useAICopilot();
  const role = (user?.role || 'advisor').toLowerCase();
  const prompts = useMemo(() => getQuickActionsForRole(role), [role]);

  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Cmd+J global shortcut
  useKeyboardShortcuts([
    {
      combo: 'mod+j',
      label: 'Abrir Copilot',
      handler: () => dispatchCopilotToggle('toggle'),
      allowInInput: true,
    },
    {
      combo: 'escape',
      label: 'Cerrar Copilot',
      handler: () => { if (cp.isOpen) cp.close(); },
      allowInInput: false,
    },
  ]);

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    if (cp.isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cp.messages, cp.isOpen]);

  // Focus textarea on open
  useEffect(() => {
    if (cp.isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [cp.isOpen]);

  const handleSend = (text) => {
    const t = (text ?? draft).trim();
    if (!t || cp.loading) return;
    cp.sendMessage(t);
    setDraft('');
  };

  const handleQuickAction = (action) => {
    if (cp.loading) return;
    cp.sendMessage(action.prompt);
  };

  const handlePickConv = (id) => {
    cp.loadConversation(id);
    setHistoryOpen(false);
  };

  const drawerWidth = isMobile ? '100vw' : 480;

  return (
    <>
      <FloatingTrigger
        hidden={cp.isOpen}
        onClick={() => dispatchCopilotToggle('open')}
      />

      {/* Backdrop */}
      <div
        data-testid="copilot-backdrop"
        onClick={cp.close}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(6,8,15,0.55)',
          backdropFilter: 'blur(2px)',
          opacity: cp.isOpen ? 1 : 0,
          pointerEvents: cp.isOpen ? 'auto' : 'none',
          transition: 'opacity 220ms ease',
          zIndex: 1500,
        }}
      />

      {/* Drawer */}
      <aside
        data-testid="copilot-panel"
        aria-hidden={!cp.isOpen}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: drawerWidth, maxWidth: '100vw',
          background: 'rgba(6,8,15,0.96)',
          borderLeft: isMobile ? 'none' : '1px solid rgba(240,235,224,0.10)',
          backdropFilter: 'blur(24px)',
          color: 'var(--cream)',
          transform: cp.isOpen ? 'translateX(0)' : 'translateX(105%)',
          transition: 'transform 320ms cubic-bezier(0.32,0.72,0,1)',
          display: 'flex', flexDirection: 'column',
          zIndex: 1501,
        }}
      >
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid rgba(240,235,224,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <button
                data-testid="copilot-back-mobile"
                onClick={cp.close}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--cream-2)', cursor: 'pointer', padding: 4,
                }} aria-label="Atrás">
                <ChevronLeft size={18} />
              </button>
            )}
            <div style={{
              width: 28, height: 28, borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkle size={14} color="#fff" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                Copilot DMX
              </span>
              <span style={{ fontSize: 10, color: 'var(--cream-3)' }}>
                Claude Sonnet · contexto privado
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              data-testid="copilot-history-toggle"
              onClick={() => setHistoryOpen(o => !o)}
              aria-label="Conversaciones"
              style={{
                background: 'transparent', border: '1px solid rgba(240,235,224,0.14)',
                borderRadius: 9999, padding: '5px 10px', cursor: 'pointer',
                color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontFamily: 'DM Sans',
              }}>
              <MessageCircle size={11} /> {cp.conversations.length}
            </button>
            <button
              data-testid="copilot-new-conv-top"
              onClick={cp.newConversation}
              aria-label="Nueva conversación"
              style={{
                background: 'transparent', border: '1px solid rgba(240,235,224,0.14)',
                borderRadius: 9999, padding: '5px 10px', cursor: 'pointer',
                color: 'var(--cream-2)', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontFamily: 'DM Sans',
              }}>
              <Plus size={11} /> Nueva
            </button>
            <button
              data-testid="copilot-close-btn"
              onClick={cp.close}
              aria-label="Cerrar"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--cream-2)', padding: 6, borderRadius: 9999,
              }}>
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Quick actions strip */}
        <div data-testid="copilot-quick-actions" style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(240,235,224,0.06)',
        }}>
          {prompts.map(p => (
            <button
              key={p.id}
              data-testid={`copilot-qa-${p.id}`}
              onClick={() => handleQuickAction(p)}
              disabled={cp.loading}
              style={{
                whiteSpace: 'nowrap',
                padding: '5px 12px', borderRadius: 9999,
                border: '1px solid rgba(var(--theme-rgb),0.30)',
                background: 'rgba(var(--theme-rgb),0.10)',
                color: 'var(--cream)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 500,
                cursor: cp.loading ? 'not-allowed' : 'pointer',
                opacity: cp.loading ? 0.5 : 1,
                transition: 'background 160ms ease',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Messages area */}
        <div data-testid="copilot-messages" style={{
          position: 'relative', flex: 1, overflowY: 'auto',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {historyOpen && (
            <ConversationsSidebar
              conversations={cp.conversations}
              current={cp.conversationId}
              onPick={handlePickConv}
              onNew={() => { cp.newConversation(); setHistoryOpen(false); }}
              onDelete={cp.removeConversation}
              onClose={() => setHistoryOpen(false)}
            />
          )}

          {cp.messages.length === 0 ? (
            <EmptyState onPick={handleQuickAction} prompts={prompts} />
          ) : (
            cp.messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))
          )}
          {cp.loading && (
            <div data-testid="copilot-loading" style={{
              alignSelf: 'flex-start',
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(13,16,23,0.92)',
              border: '1px solid rgba(var(--theme-rgb),0.30)',
              backdropFilter: 'blur(24px)',
              color: 'var(--cream-2)', fontSize: 12, fontFamily: 'DM Sans',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span className="dmx-dot" /> <span className="dmx-dot" /> <span className="dmx-dot" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div style={{
          borderTop: '1px solid rgba(240,235,224,0.08)',
          padding: '12px 16px',
          background: 'rgba(13,16,23,0.92)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'rgba(240,235,224,0.04)',
            border: '1px solid rgba(240,235,224,0.14)',
            borderRadius: 16, padding: '8px 10px',
          }}>
            <textarea
              ref={textareaRef}
              data-testid="copilot-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Pregunta lo que necesites… (Enter envía, Shift+Enter salto)"
              rows={1}
              style={{
                flex: 1, resize: 'none', maxHeight: 120, minHeight: 24,
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--cream)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5,
              }}
            />
            <button
              data-testid="copilot-send-btn"
              onClick={() => handleSend()}
              disabled={cp.loading || !draft.trim()}
              aria-label="Enviar"
              style={{
                width: 32, height: 32, borderRadius: 9999,
                background: (cp.loading || !draft.trim())
                  ? 'rgba(240,235,224,0.10)'
                  : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                border: 'none', color: '#fff',
                cursor: (cp.loading || !draft.trim()) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <ArrowRight size={14} />
            </button>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 10, color: 'var(--cream-3)', marginTop: 6,
          }}>
            <span>Cmd+J abre/cierra · Esc para cerrar</span>
            <span>{draft.length}/4000</span>
          </div>
          {cp.error && (
            <div data-testid="copilot-error" style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 10,
              background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)',
              color: '#fca5a5', fontSize: 11, fontFamily: 'DM Sans',
            }}>{cp.error}</div>
          )}
        </div>
      </aside>

      {/* Inline keyframes + markdown styles */}
      <style>{`
        @keyframes dmx-pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
        .dmx-dot { width:6px; height:6px; border-radius:9999px;
                   background: linear-gradient(90deg, var(--theme), var(--theme-3));
                   animation: dmx-pulse 850ms ease-in-out infinite; }
        .dmx-dot:nth-child(2){ animation-delay: 120ms; }
        .dmx-dot:nth-child(3){ animation-delay: 240ms; }
        .dmx-md p { margin: 0 0 6px 0; }
        .dmx-md ul, .dmx-md ol { margin: 4px 0 6px 18px; padding: 0; }
        .dmx-md li { margin-bottom: 3px; }
        .dmx-md h1, .dmx-md h2, .dmx-md h3 {
           font-family: Outfit, sans-serif; color: var(--cream);
           font-weight: 700; margin: 8px 0 4px;
        }
        .dmx-md h1 { font-size: 15px; }
        .dmx-md h2 { font-size: 14px; }
        .dmx-md h3 { font-size: 13px; }
        .dmx-md strong { color: var(--cream); }
        .dmx-md code {
           background: rgba(240,235,224,0.08); padding: 1px 5px;
           border-radius: 4px; font-size: 11.5px;
        }
        .dmx-md pre {
           background: rgba(240,235,224,0.06); padding: 8px;
           border-radius: 8px; overflow-x: auto; font-size: 11.5px;
        }
        .dmx-md table { border-collapse: collapse; margin: 6px 0; font-size: 11.5px; }
        .dmx-md th, .dmx-md td {
           border: 1px solid rgba(240,235,224,0.14);
           padding: 4px 8px; text-align: left;
        }
        .dmx-md a { color: var(--theme); text-decoration: underline; }
      `}</style>
    </>
  );
}
