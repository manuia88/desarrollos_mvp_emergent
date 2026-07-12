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
    idle:    '#E6E8EE',
    loading: 'rgba(var(--theme-rgb),0.4)',
    valid:   'rgba(31,160,106,0.6)',
    invalid: 'rgba(229,72,77,0.6)',
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
      <div style={{ fontSize: 11, color: '#9AA0AE', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans' }}>
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
            background: '#FFFFFF',
            border: `1px solid ${borderColor}`,
            color: '#1E2230', fontFamily: 'DM Mono, monospace', fontSize: 14, letterSpacing: '0.05em',
            textTransform: 'uppercase', outline: 'none', transition: 'border-color 220ms ease',
          }}
        />
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, fontWeight: 700,
        }}>
          {status === 'loading' && <span style={{ color: 'var(--theme)' }}>·</span>}
          {status === 'valid'   && <span style={{ color: '#1FA06A' }}>✓</span>}
          {status === 'invalid' && <span style={{ color: '#E5484D' }}>✗</span>}
        </div>
      </div>
      {status === 'valid' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#1FA06A', fontFamily: 'DM Sans' }}>
          Código válido
        </div>
      )}
      {status === 'invalid' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#E5484D', fontFamily: 'DM Sans' }}>
          {messages[reason] || 'Código inválido'}
        </div>
      )}
    </div>
  );
}
