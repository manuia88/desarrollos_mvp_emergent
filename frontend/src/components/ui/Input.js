import React from 'react';

/**
 * DMX UI · Input + Field — entrada de texto única con label/error opcionales. Sobre los tokens.
 * Reemplaza los <input> con estilo inline regados. Field envuelve label + input + error.
 */
export function Input({ invalid = false, style, ...rest }) {
  return (
    <input
      style={{
        width: '100%', fontFamily: "'DM Sans', sans-serif", fontSize: 14,
        color: 'var(--cream)', background: 'var(--bg-2)',
        border: `1px solid ${invalid ? 'var(--red, #F2635B)' : 'var(--border-2)'}`,
        borderRadius: 'var(--r-inner)', padding: '10px 13px', outline: 'none',
        transition: 'border-color .14s ease, box-shadow .14s ease', ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--theme)';
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--theme-rgb),0.15)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = invalid ? 'var(--red, #F2635B)' : 'var(--border-2)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      {...rest}
    />
  );
}

export function Field({ label, error, hint, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      {label && (
        <span style={{ display: 'block', fontFamily: "'Outfit', sans-serif", fontWeight: 600,
          fontSize: 12.5, color: 'var(--cream-2)', marginBottom: 6 }}>{label}</span>
      )}
      {children}
      {error
        ? <span style={{ display: 'block', fontSize: 11.5, color: 'var(--red, #F2635B)', marginTop: 5 }}>{error}</span>
        : hint
          ? <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 5 }}>{hint}</span>
          : null}
    </label>
  );
}

export default Input;
