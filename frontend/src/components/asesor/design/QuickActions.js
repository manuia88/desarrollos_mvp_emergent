// QuickActions — las 2 acciones universales de toda card (patrón EB #9): Llamar + WhatsApp.
// QUÉ ES: par de botones redondos siempre iguales, en cada card de lead y en la ficha.
// CUÁNDO: cards premium de Leads + barra de la Ficha360. Cero emoji (íconos lucide).
// Construye tel:/ wa.me desde el primer teléfono; si no hay teléfono, los deshabilita.
// Props: phone (string) · name (para prellenar el saludo de WhatsApp) · size · onAny (callback opcional).
import React from 'react';
import { Phone, MessageCircle } from 'lucide-react';

const circle = (sm) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: sm ? 30 : 36, height: sm ? 30 : 36,
  borderRadius: 9999,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid var(--border)',
  color: 'var(--cream-2)',
  cursor: 'pointer', textDecoration: 'none',
  transition: 'border-color 200ms, color 200ms, background 200ms',
});

export default function QuickActions({ phone, name, size = 'md', onAny, stopPropagation = true }) {
  const sm = size === 'sm';
  const digits = (phone || '').replace(/\D/g, '');
  const telUrl = digits ? `tel:${digits}` : null;
  const waUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola ' + (name || '') + ', ')}`
    : null;

  const guard = (e) => {
    if (stopPropagation) e.stopPropagation();
    if (onAny) onAny();
  };
  const hov = (e, on) => {
    e.currentTarget.style.borderColor = on ? 'rgba(var(--theme-rgb), 0.45)' : 'var(--border)';
    e.currentTarget.style.color = on ? 'var(--cream)' : 'var(--cream-2)';
  };
  const disabledStyle = { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' };

  return (
    <div style={{ display: 'inline-flex', gap: 6 }} data-testid="asr-quick-actions">
      <a
        href={telUrl || undefined} aria-label="Llamar" title="Llamar"
        data-testid="asr-qa-call"
        onClick={guard}
        onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}
        style={{ ...circle(sm), ...(telUrl ? {} : disabledStyle) }}
      >
        <Phone size={sm ? 13 : 15} />
      </a>
      <a
        href={waUrl || undefined} target="_blank" rel="noreferrer"
        aria-label="WhatsApp" title="WhatsApp"
        data-testid="asr-qa-wa"
        onClick={guard}
        onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}
        style={{ ...circle(sm), ...(waUrl ? {} : disabledStyle) }}
      >
        <MessageCircle size={sm ? 13 : 15} />
      </a>
    </div>
  );
}
