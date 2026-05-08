// W3.4A — FraudAlertCard (one alert in the superadmin list)
import React, { useState } from 'react';
import { Shield, AlertTriangle, Eye } from 'lucide-react';
import { resolveAlert, dismissAlert } from '../../api/fraudDetection';

const SEVERITY = {
  critical: { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.40)',  fg: '#fca5a5', label: 'Crítica' },
  amber:    { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.40)', fg: '#fcd34d', label: 'Amber' },
  info:     { bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.40)', fg: '#a5b4fc', label: 'Info' },
};
const SOURCE_LABEL = {
  price_anomaly: 'Anomalía precio (ML)',
  duplicate: 'Listing duplicado',
  title_chain: 'Cadena de título',
};

export default function FraudAlertCard({ alert, onChanged }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.info;
  const [busy, setBusy] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [note, setNote] = useState('');

  const isOpen = alert.status === 'open' || alert.status === 'investigating';

  const onResolve = async () => {
    if (busy) return; setBusy(true);
    try { await resolveAlert(alert.id, note); setShowResolve(false); setNote(''); onChanged?.(); }
    finally { setBusy(false); }
  };
  const onDismiss = async () => {
    if (busy) return; setBusy(true);
    try { await dismissAlert(alert.id, note); setShowDismiss(false); setNote(''); onChanged?.(); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={`fraud-alert-${alert.id}`}
      style={{
        background: sev.bg, border: `1px solid ${sev.bd}`,
        borderRadius: 16, padding: 16, marginBottom: 12,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {alert.severity === 'critical' ? <AlertTriangle size={16} style={{ color: sev.fg }} /> : <Shield size={16} style={{ color: sev.fg }} />}
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700,
            background: sev.bg, border: `1px solid ${sev.bd}`, color: sev.fg, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{sev.label}</span>
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)',
          }}>{SOURCE_LABEL[alert.source] || alert.source}</span>
          <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11 }}>
            zona <span style={{ color: 'var(--cream)' }}>{alert.zone_id || '—'}</span>
          </span>
        </div>
        <div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11 }}>
          {(alert.detected_at || '').slice(0, 19).replace('T', ' ')} · {alert.status}
        </div>
      </div>

      <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
        <span style={{ color: 'var(--cream-3)' }}>Listing hash:</span> <code style={{ color: 'var(--cream)' }}>{alert.listing_id_hash}</code>
        {alert.confidence_pct != null && (
          <span style={{ marginLeft: 12 }}>
            <span style={{ color: 'var(--cream-3)' }}>Confianza:</span> <span style={{ color: 'var(--cream)' }}>{alert.confidence_pct}%</span>
          </span>
        )}
        {alert.ml_score != null && (
          <span style={{ marginLeft: 12 }}>
            <span style={{ color: 'var(--cream-3)' }}>ML score:</span> <span style={{ color: 'var(--cream)' }}>{alert.ml_score}</span>
          </span>
        )}
      </div>

      {alert.evidence && Object.keys(alert.evidence).length > 0 && (
        <details style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--cream)' }}>
            <Eye size={11} style={{ marginRight: 4 }} /> Ver evidencia
          </summary>
          <pre style={{
            marginTop: 8, padding: 10, borderRadius: 10,
            background: 'rgba(0,0,0,0.32)', overflow: 'auto', maxHeight: 220,
            fontSize: 11, color: 'var(--cream-2)',
          }}>{JSON.stringify(alert.evidence, null, 2)}</pre>
        </details>
      )}

      {isOpen && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button data-testid={`fraud-alert-${alert.id}-resolve-btn`} onClick={() => setShowResolve(true)} style={btnPrimary}>Resolver</button>
          <button data-testid={`fraud-alert-${alert.id}-dismiss-btn`} onClick={() => setShowDismiss(true)} style={btnSecondary}>Descartar</button>
        </div>
      )}

      {alert.resolution_note && (
        <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
          <span style={{ color: 'var(--cream-3)' }}>Nota:</span> {alert.resolution_note}
        </div>
      )}

      {(showResolve || showDismiss) && (
        <div data-testid="fraud-alert-action-overlay"
             onClick={() => { setShowResolve(false); setShowDismiss(false); setNote(''); }}
             style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()}
               style={{
                 position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                 width: 'min(440px, 92vw)', background: 'rgba(13,16,23,0.98)',
                 border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 22,
               }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontSize: 18 }}>
              {showResolve ? 'Resolver alerta' : 'Descartar alerta'}
            </h3>
            <textarea data-testid="fraud-alert-action-note"
              value={note} onChange={e => setNote(e.target.value)}
              placeholder={showResolve ? 'Nota de resolución (opcional)' : 'Razón del descarte (opcional)'}
              style={{
                width: '100%', marginTop: 12, padding: 10, borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, minHeight: 86, resize: 'vertical',
              }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button data-testid="fraud-alert-action-cancel-btn"
                onClick={() => { setShowResolve(false); setShowDismiss(false); setNote(''); }}
                style={btnSecondary}>Cancelar</button>
              <button data-testid="fraud-alert-action-confirm-btn"
                onClick={showResolve ? onResolve : onDismiss}
                disabled={busy}
                style={btnPrimary}>{busy ? 'Procesando…' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: '7px 16px', borderRadius: 9999,
  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#fff', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
};
const btnSecondary = {
  padding: '7px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
};
