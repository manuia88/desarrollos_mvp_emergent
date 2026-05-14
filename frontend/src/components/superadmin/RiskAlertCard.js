// W3.4B — RiskAlertCard
import React, { useState } from 'react';
import { TrendingDown, TrendingUp, Eye, Check } from 'lucide-react';
import { acknowledgeAlert, fetchTimeline } from '../../api/riskAlerts';

const SEVERITY = {
  critical: { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.40)',  fg: '#fca5a5', label: 'Crítica' },
  warning:  { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.40)', fg: '#fcd34d', label: 'Bajada' },
  info:     { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.40)', fg: '#86efac', label: 'Mejora' },
};

const LETTER_COLORS = {
  A: '#10B981', B: '#34D399', C: '#FBBF24',
  D: '#F97316', E: '#EF4444', F: '#B91C1C',
};

export default function RiskAlertCard({ alert, onChanged }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.info;
  const isDrop = alert.delta_letters > 0;
  const Icon = isDrop ? TrendingDown : TrendingUp;
  const [busy, setBusy] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timeline, setTimeline] = useState([]);

  const onAck = async () => {
    if (busy) return; setBusy(true);
    try { await acknowledgeAlert(alert.id); onChanged?.(); }
    finally { setBusy(false); }
  };
  const onTimeline = async () => {
    if (timeline.length === 0) {
      try { const r = await fetchTimeline(alert.zone_id); setTimeline(r.items || []); }
      catch { setTimeline([]); }
    }
    setShowTimeline(true);
  };

  return (
    <div data-testid={`risk-alert-${alert.id}`}
      style={{
        background: sev.bg, border: `1px solid ${sev.bd}`,
        borderRadius: 16, padding: 16, marginBottom: 12,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={18} style={{ color: sev.fg }} />
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700,
            background: sev.bg, border: `1px solid ${sev.bd}`, color: sev.fg, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{sev.label}</span>
          <span style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontWeight: 800, fontSize: 16 }}>
            {alert.zone_id}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LetterPill letter={alert.prev_letter} />
          <span style={{ color: 'var(--cream-3)', fontSize: 14 }}>→</span>
          <LetterPill letter={alert.new_letter} />
        </div>
      </div>

      <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
        Score: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{alert.prev_score}</span>
        {' → '}
        <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{alert.new_score}</span>
        {' · Δ '}
        <span style={{ color: sev.fg, fontWeight: 700 }}>
          {isDrop ? `-${alert.delta_letters}` : `+${Math.abs(alert.delta_letters)}`} letras
        </span>
        <span style={{ color: 'var(--cream-3)', marginLeft: 12 }}>
          {(alert.changed_at || '').slice(0, 19).replace('T', ' ')}
        </span>
        {alert.acknowledged_at && (
          <span style={{ marginLeft: 12, color: '#86efac' }}>
            <Check size={11} /> ack
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button data-testid={`risk-alert-${alert.id}-timeline-btn`}
          onClick={onTimeline} style={btnSecondary}>
          <Eye size={11} style={{ marginRight: 4 }} />
          Ver historia zona
        </button>
        {!alert.acknowledged_at && (
          <button data-testid={`risk-alert-${alert.id}-ack-btn`}
            onClick={onAck} disabled={busy} style={btnPrimary(busy)}>
            {busy ? '…' : 'Marcar visto'}
          </button>
        )}
      </div>

      {showTimeline && (
        <div data-testid={`risk-alert-timeline-overlay`} onClick={() => setShowTimeline(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(560px, 92vw)', maxHeight: '80vh', overflowY: 'auto',
            background: 'rgba(13,16,23,0.98)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 16, padding: 22,
          }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontWeight: 800 }}>
              Historia · {alert.zone_id}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11, marginTop: 4, marginBottom: 18 }}>
              {timeline.length} cambios registrados
            </p>
            {timeline.length === 0
              ? <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin historia</div>
              : timeline.map((t, i) => (
                <div key={`${t.id || i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <LetterPill letter={t.prev_letter} />
                  <span style={{ color: 'var(--cream-3)' }}>→</span>
                  <LetterPill letter={t.new_letter} />
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                    {(t.changed_at || '').slice(0, 10)}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

function LetterPill({ letter }) {
  return (
    <span data-testid={`risk-letter-pill-${letter || 'na'}`} style={{
      width: 30, height: 30, borderRadius: 9999,
      background: LETTER_COLORS[letter] || '#3f3f46',
      color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
    }}>{letter || '?'}</span>
  );
}

const btnPrimary = (busy) => ({
  padding: '5px 14px', borderRadius: 9999,
  background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5,
});
const btnSecondary = {
  display: 'inline-flex', alignItems: 'center',
  padding: '5px 14px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5,
};
