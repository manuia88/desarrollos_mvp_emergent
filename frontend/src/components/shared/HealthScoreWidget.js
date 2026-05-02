/**
 * Phase 4 Batch 14 — HealthScoreWidget
 * Fetches health score from API + renders ring, breakdown, sparkline, alerts.
 * Extends the static <HealthScore> primitive with live API data.
 *
 * Props:
 *   entity_type  — 'project' | 'asesor' | 'client'
 *   entity_id    — slug or user_id
 *   size         — 'sm' | 'md' | 'lg'
 *   initialScore — optional static score (used while loading)
 *   className
 */
import React, { useState, useEffect, useCallback } from 'react';
import HealthScore from './HealthScore';
import { TrendUp, AlertCircle } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

function TrendArrow({ value }) {
  if (!value || value === 0) return null;
  const up = value > 0;
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700,
        color: up ? '#4ade80' : '#f87171',
        display: 'inline-flex', alignItems: 'center', gap: 1,
      }}
    >
      {up ? '+' : ''}{value}
    </span>
  );
}

function AlertChip({ alert }) {
  const isWarn = alert.type === 'warning' || alert.type === 'error';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 4,
      padding: '3px 0',
    }}>
      {isWarn
        ? <AlertCircle size={10} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertCircle size={10} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }} />
      }
      <span style={{ fontSize: 10, color: 'rgba(240,235,224,0.6)', lineHeight: 1.4 }}>
        {alert.message}
      </span>
    </div>
  );
}

export function HealthScoreWidget({
  entity_type,
  entity_id,
  size = 'md',
  initialScore = null,
  showAlerts = true,
  showTrend = true,
  className = '',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!initialScore);

  const fetch = useCallback(async () => {
    if (!entity_type || !entity_id) return;
    try {
      const res = await window.fetch(
        `${API}/api/health-score/${entity_type}/${entity_id}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (_) {}
    setLoading(false);
  }, [entity_type, entity_id]);

  useEffect(() => { fetch(); }, [fetch]);

  const score = data?.score ?? initialScore ?? 0;
  const breakdown = data?.components
    ? Object.values(data.components).map(c => ({
        label: c.label,
        weight: c.weight,
        score: c.score,
        status: c.status,
      }))
    : [];
  const alerts = data?.alerts || [];
  const trend = data?.trend_7d || 0;

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {loading && initialScore === null ? (
        <div style={{
          width: size === 'sm' ? 48 : size === 'lg' ? 88 : 64,
          height: size === 'sm' ? 48 : size === 'lg' ? 88 : 64,
          borderRadius: '50%',
          background: 'rgba(240,235,224,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ) : (
        <>
          <HealthScore
            score={score}
            size={size}
            breakdown={breakdown}
            variant={entity_type}
          />
          {showTrend && trend !== 0 && (
            <TrendArrow value={trend} />
          )}
        </>
      )}

      {showAlerts && alerts.length > 0 && size !== 'sm' && (
        <div style={{ maxWidth: 200, marginTop: 4 }}>
          {alerts.slice(0, 2).map((a, i) => (
            <AlertChip key={i} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HealthScoreWidget;
