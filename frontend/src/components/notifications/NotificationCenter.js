// W4.17 — NotificationCenter · dropdown panel de notificaciones
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationItem from './NotificationItem';

const API = process.env.REACT_APP_BACKEND_URL;

const FILTERS = [
  { key: 'all',      label: 'Todas' },
  { key: 'unread',   label: 'No leídas' },
  { key: 'critical', label: 'Críticas' },
];

async function fetchNotifications(unread = false, type = null) {
  const qs = new URLSearchParams();
  if (unread) qs.set('unread', 'true');
  qs.set('limit', '20');
  if (type) qs.set('type', type);
  const r = await fetch(`${API}/api/notifications?${qs}`, { credentials: 'include' });
  if (!r.ok) return [];
  const d = await r.json();
  return d.notifications || [];
}

async function markRead(notifId) {
  await fetch(`${API}/api/notifications/${notifId}/mark-read`, {
    method: 'POST', credentials: 'include',
  });
}

async function markAllRead() {
  await fetch(`${API}/api/notifications/mark-all-read`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export default function NotificationCenter({ onCountChange, open, onClose }) {
  const [filter, setFilter] = useState('all');
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const unread = filter === 'unread';
      const type = filter === 'critical' ? null : null; // future: type filter
      const data = await fetchNotifications(unread, type);
      // Si filtro crítico → filtrar en cliente
      const filtered = filter === 'critical'
        ? data.filter(n => n.severity === 'critical' || n.severity === 'high')
        : data;
      setNotifs(filtered);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose && onClose();
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose]);

  // Pause polling if tab not visible
  useEffect(() => {
    if (!open) return;
    let interval;
    function start() { interval = setInterval(load, 30000); }
    function stop() { clearInterval(interval); }
    start();
    document.addEventListener('visibilitychange', () => {
      document.hidden ? stop() : start();
    });
    return () => { stop(); document.removeEventListener('visibilitychange', () => {}); };
  }, [open, load]);

  const handleMarkRead = async (notifId) => {
    await markRead(notifId);
    setNotifs(prev => prev.map(n => n.notif_id === notifId ? { ...n, read: true } : n));
    onCountChange && onCountChange(c => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    onCountChange && onCountChange(0);
  };

  if (!open) return null;

  return (
    <div
      ref={ref}
      data-testid="notification-center"
      style={{
        position: 'absolute',
        right: 0,
        top: 48,
        width: 380,
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(13,16,23,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        zIndex: 9999,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          Notificaciones
        </span>
        <button
          data-testid="notif-mark-all-read"
          onClick={handleMarkAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'DM Sans', fontSize: 11, color: 'var(--theme)',
            fontWeight: 600, padding: '3px 8px',
          }}
        >
          Marcar todas leídas
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px 8px', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            data-testid={`notif-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
              padding: '4px 10px', borderRadius: 9999, cursor: 'pointer',
              border: `1px solid ${filter === f.key ? 'var(--theme)' : 'rgba(255,255,255,0.12)'}`,
              background: filter === f.key ? 'rgba(var(--theme-rgb),0.18)' : 'transparent',
              color: filter === f.key ? 'var(--theme)' : 'var(--cream-3)',
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontSize: 12 }}>
            Cargando...
          </div>
        )}
        {!loading && notifs.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center',
            color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.6,
          }}>
            Sin notificaciones nuevas<br />
            <span style={{ opacity: 0.6 }}>te avisaremos cuando algo importante suceda</span>
          </div>
        )}
        {!loading && notifs.map(n => (
          <NotificationItem key={n.notif_id} notif={n} onMarkRead={handleMarkRead} />
        ))}
      </div>

      {/* Footer "Ver todas" */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '10px 16px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => { navigate('/portal/notifications'); onClose && onClose(); }}
          style={{
            width: '100%', padding: '7px 0',
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            color: 'var(--theme)', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'center',
          }}
        >
          Ver todas las notificaciones
        </button>
      </div>
    </div>
  );
}
