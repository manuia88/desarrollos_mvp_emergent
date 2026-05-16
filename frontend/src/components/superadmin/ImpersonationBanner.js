// W1.2 SA1.1 — ImpersonationBanner
// Sticky yellow banner shown while a superadmin is impersonating another tenant.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut } from 'lucide-react';
import useImpersonation from '../../hooks/useImpersonation';
import { Z } from '../../styles/zIndex';

function fmtCountdown(expiresAt) {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ImpersonationBanner() {
  const { session, isImpersonating, end } = useImpersonation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  // Tick every second to refresh countdown
  React.useEffect(() => {
    if (!isImpersonating) return;
    const t = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isImpersonating]);

  if (!isImpersonating || !session) return null;

  const handleEnd = async () => {
    setBusy(true);
    try {
      await end();
      navigate('/superadmin/tenants', { replace: true });
      window.location.reload();
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="impersonation-banner"
      style={{
        position: 'sticky', top: 0, zIndex: Z.DROPDOWN,
        background: 'rgba(250,204,21,0.14)',
        borderBottom: '1px solid rgba(250,204,21,0.45)',
        backdropFilter: 'blur(24px)',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
      <AlertTriangle size={14} color="#FACC15" />
      <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, color: '#FACC15', flex: 1, minWidth: 200 }}>
        Sesión impersonada como{' '}
        <strong style={{ color: 'var(--cream)', fontWeight: 700 }}>
          {session.target_name || session.target_user_id}
        </strong>
        {session.target_tenant_id && (
          <span style={{ opacity: 0.85, marginLeft: 6 }}>· {session.target_tenant_id}</span>
        )}
      </span>
      <span data-testid="impersonation-countdown"
        style={{
          padding: '2px 9px', borderRadius: 9999, fontFamily: 'DM Mono, monospace',
          fontSize: 11.5, fontWeight: 700, background: 'rgba(250,204,21,0.18)',
          border: '1px solid rgba(250,204,21,0.40)', color: '#FACC15',
        }}>
        {fmtCountdown(session.expires_at)}
      </span>
      <button data-testid="impersonation-end-btn"
        onClick={handleEnd} disabled={busy}
        style={{
          padding: '6px 14px', borderRadius: 9999, background: 'rgba(13,16,23,0.92)',
          border: '1px solid rgba(250,204,21,0.45)', color: '#FACC15',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 5, opacity: busy ? 0.7 : 1,
        }}>
        <LogOut size={11} /> Salir
      </button>
    </div>
  );
}
