/**
 * Phase 4 Batch 0 — NotificationsBell
 * Bell icon + drawer with scoped notifications.
 * Polls every 60s. Mark-all-read. action_url navigation.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Clock, AlertCircle, Info, TrendingUp } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const KIND_ICON = {
  alert: AlertCircle,
  info: Info,
  success: TrendingUp,
  default: Bell,
};

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function groupByDay(notifs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const groups = { hoy: [], semana: [], anteriores: [] };
  for (const n of notifs) {
    const d = new Date(n.created_at || n.ts || 0);
    if (d >= today) groups.hoy.push(n);
    else if (d >= weekAgo) groups.semana.push(n);
    else groups.anteriores.push(n);
  }
  return groups;
}

export function NotificationsBell({ user }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const drawerRef = useRef(null);

  const fetchNotifs = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const res = await fetch(`${API}/api/dev/notifications?limit=50`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.items || [];
        setNotifs(list);
        setUnread(list.filter(n => !n.read).length);
      }
    } catch (_) {}
  }, [user?.user_id]);

  // Initial load + polling
  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await fetch(`${API}/api/dev/notifications/mark-all-read`, { method: 'POST', credentials: 'include' });
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch (_) {}
  };

  const handleClick = async (n) => {
    try {
      await fetch(`${API}/api/dev/notifications/${n.notification_id}/read`, {
        method: 'POST', credentials: 'include',
      });
      setNotifs(prev => prev.map(x => x.notification_id === n.notification_id ? { ...x, read: true } : x));
      setUnread(prev => Math.max(0, prev - (n.read ? 0 : 1)));
    } catch (_) {}
    if (n.action_url) {
      navigate(n.action_url);
      setOpen(false);
    }
  };

  const groups = groupByDay(notifs);
  const GROUP_LABELS = { hoy: 'Hoy', semana: 'Esta semana', anteriores: 'Anteriores' };

  return (
    <div className="relative" ref={drawerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-[rgba(240,235,224,0.6)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.08)] transition-colors"
        data-testid="notifications-bell-btn"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--cream)] text-[var(--navy)] text-[9px] font-bold flex items-center justify-center"
            data-testid="notifications-unread-count"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 max-h-[480px] rounded-2xl bg-[rgba(13,16,23,0.92)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] flex flex-col z-50 overflow-hidden"
          data-testid="notifications-drawer"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(240,235,224,0.08)]">
            <span className="text-[var(--cream)] font-semibold text-sm">Notificaciones</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[rgba(240,235,224,0.5)] hover:text-[var(--cream)] text-xs flex items-center gap-1 transition-colors"
                  data-testid="mark-all-read-btn"
                >
                  <CheckCheck size={12} />
                  Leer todo
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)]">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {notifs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-[rgba(240,235,224,0.3)]">
                <Bell size={28} className="mb-2 opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            )}

            {Object.entries(groups).map(([gk, items]) => {
              if (!items.length) return null;
              return (
                <div key={gk}>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[rgba(240,235,224,0.3)] bg-[rgba(240,235,224,0.03)] border-b border-[rgba(240,235,224,0.04)]">
                    {GROUP_LABELS[gk]}
                  </div>
                  {items.map(n => {
                    const Icon = KIND_ICON[n.kind] || KIND_ICON.default;
                    return (
                      <button
                        key={n.notification_id || n._id}
                        onClick={() => handleClick(n)}
                        className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-[rgba(240,235,224,0.05)] transition-colors text-left border-b border-[rgba(240,235,224,0.04)] last:border-0
                          ${!n.read ? 'bg-[rgba(240,235,224,0.04)]' : ''}`}
                        data-testid={`notification-${n.notification_id}`}
                      >
                        <Icon size={15} className={`shrink-0 mt-0.5 ${!n.read ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.35)]'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs leading-snug ${!n.read ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.55)]'}`}>
                            {n.message || n.text || 'Notificación'}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={9} className="text-[rgba(240,235,224,0.25)]" />
                            <span className="text-[10px] text-[rgba(240,235,224,0.25)]">{timeAgo(n.created_at || n.ts)}</span>
                          </div>
                        </div>
                        {!n.read && (
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--cream)] mt-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationsBell;
