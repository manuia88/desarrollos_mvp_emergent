// W4.11a · AtlaxThreadsSidebar — historial de conversaciones por session_token.
// Renderiza dentro del panel de AtlaxBubble cuando el usuario abre el toggle "Historial".
import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, X, Plus, Clock } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

function _fmtRelative(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Hace ${hrs} h`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `Hace ${days} d`;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export default function AtlaxThreadsSidebar({
  asistenteToken,
  activeThreadId,
  onSelect,
  onNewThread,
  onClose,
}) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!asistenteToken) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/atlax/threads?session_token=${encodeURIComponent(asistenteToken)}&limit=30`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setThreads(d.threads || []);
    } catch (err) {
      setError(err.message || 'No pudimos cargar el historial.');
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [asistenteToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="atlax-threads-sidebar" style={{
      position: 'absolute', inset: 0, zIndex: 5,
      background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
      display: 'flex', flexDirection: 'column',
      animation: 'caya-pop 0.18s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={13} color="var(--cream-3)" />
          <div style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
            color: 'var(--cream)', letterSpacing: '-0.01em',
          }}>Historial</div>
        </div>
        <button
          data-testid="atlax-threads-close"
          onClick={onClose}
          aria-label="Cerrar historial"
          style={{
            padding: 6, background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
          }}
        ><X size={11} /></button>
      </div>

      {/* New thread CTA */}
      <div style={{ padding: '10px 12px 4px' }}>
        <button
          data-testid="atlax-thread-new"
          onClick={() => { onNewThread?.(); onClose?.(); }}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 9999,
            background: 'var(--grad)', border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            letterSpacing: '0.02em',
          }}
        >
          <Plus size={11} /> Nueva conversación
        </button>
      </div>

      {/* List */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 8px 12px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {loading && (
          <div style={{
            padding: 16, textAlign: 'center', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontSize: 11.5,
          }}>Cargando…</div>
        )}
        {!loading && error && (
          <div data-testid="atlax-threads-error" style={{
            padding: 12, borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
            color: '#fca5a5',
          }}>{error}</div>
        )}
        {!loading && !error && threads.length === 0 && (
          <div data-testid="atlax-threads-empty" style={{
            padding: '20px 12px', textAlign: 'center', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontSize: 11.5, lineHeight: 1.5,
          }}>
            <MessageSquare size={18} color="var(--cream-3)" />
            <div style={{ marginTop: 8 }}>Sin conversaciones todavía.</div>
          </div>
        )}
        {!loading && !error && threads.map((t) => {
          const isActive = t.thread_id === activeThreadId;
          return (
            <button
              key={t.thread_id}
              data-testid={`atlax-thread-${t.thread_id}`}
              onClick={() => { onSelect?.(t.thread_id); onClose?.(); }}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                background: isActive ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(var(--theme-rgb),0.40)' : 'var(--border)'}`,
                color: 'var(--cream)', fontFamily: 'DM Sans', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 4,
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <div style={{
                fontSize: 12, fontWeight: 600, color: isActive ? 'var(--theme)' : 'var(--cream)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.35,
              }}>
                {t.title || 'Conversación'}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                fontSize: 9.5, color: 'var(--cream-3)', letterSpacing: '0.02em',
              }}>
                <span>{t.message_count || 0} msj</span>
                <span>{_fmtRelative(t.last_message_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
