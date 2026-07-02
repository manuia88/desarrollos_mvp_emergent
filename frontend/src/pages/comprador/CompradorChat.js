/**
 * CompradorChat — Phase 4 Batch 29
 * Página /comprador/chat — Chat Asesor In-App.
 * Layout split: lista threads (320px) + ChatThread derecha.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import ChatThread from '../../components/comprador/ChatThread';
import { fetchThreads, markThreadRead } from '../../api/chat';
import { MessageSquare } from '../../components/icons';
import { useAuth } from '../../App';

function fmtRelative(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  } catch {
    return '';
  }
}

export default function CompradorChat() {
  const { user } = useAuth();
  const location = useLocation();
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadThreads = useCallback(async () => {
    try {
      const list = await fetchThreads();
      setError(null);
      setThreads(list);
      // Auto-select first thread or thread from navigation state
      if (location.state?.threadId) {
        const t = list.find(th => th.thread_id === location.state.threadId);
        if (t) setSelectedThread(t);
      } else if (list.length > 0) {
        // functional update → no depende de `selectedThread` (evita closure obsoleto en el poll)
        setSelectedThread(prev => prev || list[0]);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [location.state?.threadId]);

  useEffect(() => {
    setLoading(true);
    loadThreads().finally(() => setLoading(false));

    // Poll for new threads every 30s
    const interval = setInterval(loadThreads, 30000);
    return () => clearInterval(interval);
  }, [loadThreads]);

  const handleSelectThread = (thread) => {
    setSelectedThread(thread);
    // Optimistically clear unread in UI
    setThreads(prev => prev.map(t =>
      t.thread_id === thread.thread_id ? { ...t, unread_count: 0 } : t
    ));
    markThreadRead(thread.thread_id).catch(() => {});
  };

  return (
    <CompradorLayout>
      <div className="comprador-chat-split" style={{ display: 'flex', gap: 16, height: 'calc(100vh - 96px)', minHeight: 500 }}>

        {/* Thread list — 320px */}
        <div className="comprador-chat-threadlist" style={{
          width: 320, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(13,16,23,0.85)',
          border: '1px solid rgba(240,235,224,0.08)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(240,235,224,0.08)',
          }}>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 15,
              color: 'var(--cream, #F0EBE0)',
            }}>
              Conversaciones
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans', fontSize: 13 }}>
                Cargando…
              </div>
            ) : error ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'rgba(240,235,224,0.6)', marginBottom: 10 }}>
                  No pudimos cargar tus conversaciones
                </div>
                <button
                  onClick={() => { setLoading(true); loadThreads().finally(() => setLoading(false)); }}
                  style={{
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: '#6366F1',
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                  }}
                >
                  Reintentar
                </button>
              </div>
            ) : threads.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 9999, margin: '0 auto 14px',
                  background: 'rgba(99,102,241,0.10)',
                  border: '1px solid rgba(99,102,241,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageSquare size={20} color="rgba(99,102,241,0.6)" />
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  color: 'rgba(240,235,224,0.6)', marginBottom: 6,
                }}>
                  Sin conversaciones
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12,
                  color: 'rgba(240,235,224,0.35)',
                }}>
                  Inicia conversación con un asesor desde una ficha de proyecto
                </div>
              </div>
            ) : (
              threads.map(thread => {
                const isSelected = selectedThread?.thread_id === thread.thread_id;
                return (
                  <button
                    key={thread.thread_id}
                    data-testid={`thread-item-${thread.thread_id}`}
                    onClick={() => handleSelectThread(thread)}
                    style={{
                      width: '100%', padding: '13px 16px',
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(240,235,224,0.06)',
                      borderLeft: isSelected ? '3px solid #6366F1' : '3px solid transparent',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 9999, flexShrink: 0,
                      background: 'linear-gradient(135deg,#6366F1,#EC4899)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#fff',
                    }}>
                      {(thread.counterpart?.name || 'A')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 3,
                      }}>
                        <div style={{
                          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                          color: 'var(--cream, #F0EBE0)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: 140,
                        }}>
                          {thread.counterpart?.name || 'Asesor DMX'}
                        </div>
                        <div style={{
                          fontFamily: 'DM Sans', fontSize: 10,
                          color: 'rgba(240,235,224,0.35)', flexShrink: 0,
                        }}>
                          {fmtRelative(thread.last_message_sent_at || thread.last_message_at)}
                        </div>
                      </div>
                      {thread.project_name && (
                        <div style={{
                          fontFamily: 'DM Sans', fontSize: 10,
                          color: 'rgba(99,102,241,0.7)', marginBottom: 3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {thread.project_name}
                        </div>
                      )}
                      <div style={{
                        fontFamily: 'DM Sans', fontSize: 12,
                        color: 'rgba(240,235,224,0.4)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {thread.last_message_preview || 'Sin mensajes aún'}
                      </div>
                    </div>
                    {/* Unread badge */}
                    {thread.unread_count > 0 && (
                      <div style={{
                        minWidth: 18, height: 18, borderRadius: 9999, flexShrink: 0,
                        background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10, color: '#fff',
                        padding: '0 5px',
                      }}
                        data-testid={`thread-unread-${thread.thread_id}`}
                      >
                        {thread.unread_count}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat thread area */}
        <ChatThread
          thread={selectedThread}
          userRole="buyer"
          userId={user?.user_id}
          onClose={null}
        />
      </div>
    </CompradorLayout>
  );
}
