/**
 * W4.18.3 Sub-B — InviteCodeInput
 * Input texto uppercase auto-format · debounce 500ms → /api/auth/validate-code/{code}
 * Feedback inline ✓/✗.
 */
import React, { useEffect, useRef, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function InviteCodeInput({ value, onChange, onValidChange }) {
  const [status, setStatus] = useState('idle'); // idle|loading|valid|invalid
  const [reason, setReason] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 9) {
      setStatus('idle'); setReason('');
      onValidChange?.(false);
      return;
    }
    setStatus('loading');
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/auth/validate-code/${encodeURIComponent(value)}`);
        const d = await r.json();
        if (d?.valid) {
          setStatus('valid'); setReason('');
          onValidChange?.(true);
        } else {
          setStatus('invalid'); setReason(d?.reason || 'invalid');
          onValidChange?.(false);
        }
      } catch {
        setStatus('invalid'); setReason('error');
        onValidChange?.(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14);
    onChange?.(v);
  };

  const borderColor = {
    idle:    'rgba(255,255,255,0.12)',
    loading: 'rgba(99,102,241,0.4)',
    valid:   'rgba(34,197,94,0.6)',
    invalid: 'rgba(239,68,68,0.6)',
  }[status];

  const messages = {
    not_found: 'Código no encontrado',
    expired:   'Código expirado',
    used:      'Código ya utilizado',
    revoked:   'Código revocado',
    format_invalid: 'Formato inválido (DMX-BR-XXXXXX)',
    error:     'Error al validar',
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans' }}>
        Código de invitación broker
      </div>
      <div style={{ position: 'relative' }}>
        <input
          data-testid="broker-signup-code"
          type="text"
          value={value || ''}
          onChange={handleChange}
          placeholder="DMX-BR-XXXXXX"
          maxLength={14}
          style={{
            width: '100%', padding: '11px 44px 11px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${borderColor}`,
            color: '#F0EBE0', fontFamily: 'DM Mono, monospace', fontSize: 14, letterSpacing: '0.05em',
            textTransform: 'uppercase', outline: 'none', transition: 'border-color 220ms ease',
          }}
        />
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, fontWeight: 700,
        }}>
          {status === 'loading' && <span style={{ color: '#a5b4fc' }}>·</span>}
          {status === 'valid'   && <span style={{ color: '#22c55e' }}>✓</span>}
          {status === 'invalid' && <span style={{ color: '#ef4444' }}>✗</span>}
        </div>
      </div>
      {status === 'valid' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#22c55e', fontFamily: 'DM Sans' }}>
          Código válido
        </div>
      )}
      {status === 'invalid' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5', fontFamily: 'DM Sans' }}>
          {messages[reason] || 'Código inválido'}
        </div>
      )}
    </div>
  );
}
