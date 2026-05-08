// W3.7 — DsrRequestCard component for SuperadminCompliance
import React from 'react';
import { Shield, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const TYPE_LABELS = {
  access:         'Acceso',
  deletion:       'Eliminación',
  portability:    'Portabilidad',
  rectification:  'Rectificación',
};

const STATUS_CONFIG = {
  pending:    { label: 'Pendiente',   color: '#F59E0B', Icon: Clock      },
  verified:   { label: 'Verificado',  color: '#6366F1', Icon: Shield     },
  completed:  { label: 'Completado',  color: '#10B981', Icon: CheckCircle},
  rejected:   { label: 'Rechazado',   color: '#EF4444', Icon: XCircle   },
};

export function DsrRequestCard({ item, onProcess, processing }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.Icon;
  const typeLabel = TYPE_LABELS[item.request_type] || item.request_type;

  return (
    <div data-testid={`dsr-card-${item.id}`} style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
    }}>
      {/* Status dot */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `${cfg.color}18`,
        border: `1px solid ${cfg.color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <StatusIcon size={16} color={cfg.color} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'Outfit', fontWeight: 700,
            fontSize: 13, color: 'var(--cream)',
          }}>
            {item.subject_email}
          </span>
          <span style={{
            background: `${cfg.color}20`, color: cfg.color,
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 9999, fontFamily: 'DM Sans',
          }}>
            {cfg.label}
          </span>
          <span style={{
            background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
            fontSize: 11, padding: '2px 8px', borderRadius: 9999,
            fontFamily: 'DM Sans',
          }}>
            {typeLabel}
          </span>
        </div>

        <div style={{
          display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap',
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
        }}>
          <span>ID: <code style={{ color: 'var(--cream-2)' }}>{item.id}</code></span>
          {item.subject_phone && <span>Tel: {item.subject_phone}</span>}
          <span>Creado: {new Date(item.created_at).toLocaleDateString('es-MX')}</span>
          {item.verified_at && (
            <span>Verificado: {new Date(item.verified_at).toLocaleDateString('es-MX')}</span>
          )}
          {item.completed_at && (
            <span>Completado: {new Date(item.completed_at).toLocaleDateString('es-MX')}</span>
          )}
        </div>

        {item.justification && (
          <p style={{
            margin: '6px 0 0', fontFamily: 'DM Sans', fontSize: 12,
            color: 'var(--cream-3)', fontStyle: 'italic',
          }}>
            "{item.justification}"
          </p>
        )}

        {/* Evidence summary if completed */}
        {item.status === 'completed' && item.audit_evidence && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
              background: 'rgba(16,185,129,0.08)', borderRadius: 6,
              padding: '6px 10px', display: 'inline-block',
            }}>
              {Object.entries(item.audit_evidence).map(([col, ev]) => (
                <span key={col} style={{ marginRight: 10 }}>
                  {col}: {ev.action} ({ev.count ?? '-'})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      {item.status === 'verified' && onProcess && (
        <button
          data-testid={`dsr-process-btn-${item.id}`}
          onClick={() => onProcess(item.id)}
          disabled={processing === item.id}
          style={{
            background: processing === item.id
              ? 'rgba(239,68,68,0.3)'
              : 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: processing === item.id ? '#fca5a5' : '#ef4444',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
            padding: '7px 14px', borderRadius: 9999, cursor: 'pointer',
            flexShrink: 0, transition: 'all 0.2s',
          }}
        >
          {processing === item.id ? 'Procesando…' : 'Ejecutar borrado'}
        </button>
      )}

      {/* Warning for pending > 30 days */}
      {item.status === 'pending' && (() => {
        const days = Math.floor((Date.now() - new Date(item.created_at)) / 86400000);
        return days >= 30 ? (
          <span title="Pendiente más de 30 días" style={{ flexShrink: 0 }}>
            <AlertTriangle size={16} color="#F59E0B" />
          </span>
        ) : null;
      })()}
    </div>
  );
}
