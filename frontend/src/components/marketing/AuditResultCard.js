// W4.16 — AuditResultCard · post-submission preview + download/email actions.
import React, { useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function AuditResultCard({ auditId, projectName, colonia, email }) {
  const pdfUrl = `${API}/api/free-audit/${auditId}/download`;
  const [resending, setResending] = useState(false);
  const [toast, setToast] = useState('');

  const handleEmail = async () => {
    setResending(true);
    setToast('');
    try {
      const r = await fetch(`${API}/api/free-audit/${auditId}/resend-email`, {
        method: 'POST',
      });
      const d = await r.json();
      setToast(d?.sent ? 'Email enviado correctamente.' : 'Email registrado · revisa tu bandeja.');
    } catch (_) {
      setToast('No se pudo enviar el email.');
    } finally {
      setResending(false);
      setTimeout(() => setToast(''), 3500);
    }
  };

  return (
    <div
      data-testid="audit-result-card"
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 18,
        padding: 28,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span style={{
          padding: '4px 12px', borderRadius: 9999,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          color: '#fff',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em',
        }}>LISTO</span>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
          Tu DMX Audit Report
        </div>
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)',
        marginBottom: 18, lineHeight: 1.6,
      }}>
        Generado para <strong style={{ color: 'var(--cream)' }}>{projectName}</strong>
        {' '}en{' '}
        <strong style={{ color: 'var(--cream)' }}>
          {(colonia || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </strong>. Te lo enviamos a <strong style={{ color: 'var(--cream)' }}>{email}</strong>.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="audit-download-btn"
          style={{
            background: 'linear-gradient(90deg, #6366F1, #EC4899)',
            color: '#fff', border: 'none', borderRadius: 9999,
            padding: '12px 28px',
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 12,
            letterSpacing: '0.1em',
            textDecoration: 'none',
          }}
        >
          DESCARGAR PDF
        </a>
        <button
          type="button"
          data-testid="audit-email-btn"
          onClick={handleEmail}
          disabled={resending}
          style={{
            background: 'transparent', color: 'var(--cream)',
            border: '1px solid #D5D8E2', borderRadius: 9999,
            padding: '12px 24px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 12,
            letterSpacing: '0.08em',
            cursor: resending ? 'wait' : 'pointer',
            opacity: resending ? 0.55 : 1,
          }}
        >
          {resending ? 'ENVIANDO…' : 'REENVIAR POR EMAIL'}
        </button>
      </div>

      {toast && (
        <div style={{
          marginTop: 16,
          padding: '8px 14px',
          background: 'rgba(34,197,94,0.10)',
          border: '1px solid rgba(34,197,94,0.30)',
          borderRadius: 10,
          color: '#86efac',
          fontFamily: 'DM Sans', fontSize: 12,
        }}>
          {toast}
        </div>
      )}

      <div style={{
        marginTop: 22, paddingTop: 18,
        borderTop: '1px solid #ECECEC',
        fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
      }}>
        ¿Quieres profundizar? Un asesor DMX puede ayudarte a estructurar la comercialización.
        <a
          href="/asesores"
          style={{ marginLeft: 6, color: '#a5b4fc', textDecoration: 'none', fontWeight: 600 }}
        >
          Hablar con asesor →
        </a>
      </div>
    </div>
  );
}
