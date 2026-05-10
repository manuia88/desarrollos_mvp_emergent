// W4.17 — NotificationBellIcon · ícono campana con badge de no leídas
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from '../icons';
import NotificationCenter from './NotificationCenter';

const API = process.env.REACT_APP_BACKEND_URL;

async function fetchCount() {
  const r = await fetch(`${API}/api/notifications/unread-count`, { credentials: 'include' });
  if (!r.ok) return 0;
  const d = await r.json();
  return d.count || 0;
}

export default function NotificationBellIcon() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try { setCount(await fetchCount()); } catch {}
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(() => {
      if (!document.hidden) refreshCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  const badgeLabel = count >= 10 ? '9+' : String(count);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        data-testid="notification-bell"
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        style={{
          position: 'relative',
          background: open ? 'rgba(99,102,241,0.12)' : 'transparent',
          border: '1px solid',
          borderColor: open ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
          borderRadius: 9999,
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
          color: 'var(--cream)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          }
        }}
      >
        <Bell size={15} />
        {count > 0 && (
          <span
            data-testid="notification-badge"
            style={{
              position: 'absolute',
              top: -4, right: -4,
              background: '#EF4444',
              color: '#fff',
              borderRadius: 9999,
              fontSize: 9,
              fontFamily: 'DM Sans',
              fontWeight: 700,
              minWidth: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
              border: '1.5px solid #06080F',
            }}
          >
            {badgeLabel}
          </span>
        )}
      </button>

      <NotificationCenter
        open={open}
        onClose={() => setOpen(false)}
        onCountChange={setCount}
      />
    </div>
  );
}
