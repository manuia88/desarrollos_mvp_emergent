// W4.17 — NotificationItem · sub-componente individual de notificación
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const SEVERITY_DOT = {
  critical: '#EF4444',
  high:     '#F97316',
  normal:   'var(--theme)',
  low:      '#6B7280',
};

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export default function NotificationItem({ notif, onMarkRead }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleClick = () => {
    onMarkRead && onMarkRead(notif.notif_id);
    if (notif.action_url) navigate(notif.action_url);
  };

  return (
    <div
      data-testid={`notification-item-${notif.notif_id}`}
      onClick={handleClick}
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 8,
        cursor: notif.action_url ? 'pointer' : 'default',
        background: notif.read ? 'transparent' : 'rgba(var(--theme-rgb),0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        transition: 'background 0.15s',
        alignItems: 'flex-start',
      }}
      onMouseEnter={e => { if (notif.action_url) e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = notif.read ? 'transparent' : 'rgba(var(--theme-rgb),0.06)'; }}
    >
      {/* Severity dot */}
      <div style={{
        width: 8, height: 8,
        borderRadius: '50%',
        background: SEVERITY_DOT[notif.severity] || SEVERITY_DOT.normal,
        flexShrink: 0,
        marginTop: 5,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'DM Sans', fontWeight: notif.read ? 500 : 600,
          fontSize: 13, color: 'var(--cream)',
          marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notif.title}
        </div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {notif.body}
        </div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
          marginTop: 4, opacity: 0.7,
        }}>
          {timeAgo(notif.created_at)}
        </div>
      </div>

      {!notif.read && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--indigo)',
          flexShrink: 0, marginTop: 7,
        }} />
      )}
    </div>
  );
}
