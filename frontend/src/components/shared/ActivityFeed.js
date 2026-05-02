/**
 * Phase 4 Batch 14 — ActivityFeed
 * Timeline of activity events grouped by Hoy / Ayer / Esta semana.
 *
 * Props:
 *   actorId       — filter to specific user (optional)
 *   inmobiliariaId — filter to org (optional)
 *   limit         — max items
 *   className
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Users, Building, TrendUp, Calendar, FileText, Bell, Activity } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const ACTION_ICONS = {
  lead_created:       Users,
  lead_assigned:      Users,
  status_changed:     Activity,
  project_published:  Building,
  appointment_made:   Calendar,
  commission_updated: TrendUp,
  document_uploaded:  FileText,
  diagnostic_run:     Activity,
  default:            Bell,
};

const ACTION_LABELS = {
  lead_created:       'Lead nuevo',
  lead_assigned:      'Lead asignado',
  status_changed:     'Cambio de estado',
  project_published:  'Proyecto publicado',
  appointment_made:   'Cita agendada',
  commission_updated: 'Comisión actualizada',
  document_uploaded:  'Documento subido',
  diagnostic_run:     'Diagnóstico ejecutado',
};

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function groupEvents(items) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
  const weekStart = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 6);

  const groups = { hoy: [], ayer: [], semana: [] };
  for (const item of items) {
    const d = new Date(item.timestamp || 0);
    if (d >= todayStart) groups.hoy.push(item);
    else if (d >= yesterdayStart) groups.ayer.push(item);
    else if (d >= weekStart) groups.semana.push(item);
  }
  return groups;
}

function ActivityItem({ item }) {
  const Icon = ACTION_ICONS[item.action] || ACTION_ICONS.default;
  const label = ACTION_LABELS[item.action] || item.action;
  const meta = item.metadata || {};

  return (
    <div
      data-testid={`activity-item-${item.id}`}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid rgba(240,235,224,0.06)',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(240,235,224,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>
        <Icon size={12} color="rgba(240,235,224,0.55)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 500, lineHeight: 1.4 }}>
          {label}
          {meta.entity_name && (
            <span style={{ color: 'rgba(240,235,224,0.5)', fontWeight: 400 }}> · {meta.entity_name}</span>
          )}
        </div>
        {meta.detail && (
          <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)', marginTop: 1 }}>{meta.detail}</div>
        )}
      </div>
      <span style={{ fontSize: 10, color: 'rgba(240,235,224,0.3)', flexShrink: 0 }}>
        {timeAgo(item.timestamp)}
      </span>
    </div>
  );
}

export function ActivityFeed({ actorId, inmobiliariaId, limit = 30, className = '' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (actorId) params.append('actor_id', actorId);
      if (inmobiliariaId) params.append('inmobiliaria_id', inmobiliariaId);
      const res = await window.fetch(`${API}/api/activity/feed?${params}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const d = await res.json();
        setItems(d.items || []);
      }
    } catch (_) {}
    setLoading(false);
  }, [actorId, inmobiliariaId, limit]);

  useEffect(() => { load(); }, [load]);

  const groups = groupEvents(items);
  const GROUP_LABELS = { hoy: 'Hoy', ayer: 'Ayer', semana: 'Esta semana' };

  if (loading) {
    return (
      <div className={className}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{
            height: 40, borderRadius: 6, background: 'rgba(240,235,224,0.05)',
            marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={className} style={{ padding: '24px 0', textAlign: 'center' }}>
        <Activity size={28} color="rgba(240,235,224,0.15)" style={{ marginBottom: 8 }} />
        <p style={{ fontSize: 12, color: 'rgba(240,235,224,0.3)', margin: 0 }}>
          Sin actividad reciente
        </p>
      </div>
    );
  }

  return (
    <div className={className} data-testid="activity-feed">
      {Object.entries(groups).map(([gk, gItems]) => {
        if (!gItems.length) return null;
        return (
          <div key={gk}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'rgba(240,235,224,0.3)', padding: '8px 0 4px',
            }}>
              {GROUP_LABELS[gk]}
            </div>
            {gItems.map(item => <ActivityItem key={item.id} item={item} />)}
          </div>
        );
      })}
    </div>
  );
}

export default ActivityFeed;
