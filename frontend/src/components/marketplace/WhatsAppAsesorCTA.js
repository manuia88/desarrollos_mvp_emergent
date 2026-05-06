/**
 * WhatsAppAsesorCTA — Phase 4 Batch 27 (Sub-C) · extended B32
 * Floating button bottom-right que abre WhatsApp con asesor del proyecto.
 * Ahora también muestra link al perfil público del asesor (B32).
 *
 * Props:
 *   asesorPhone   — número del asesor (E.164 sin + ni espacios, ej "525555123456")
 *   asesorId      — user_id del asesor (para link a /asesor-publico/{id}) (B32)
 *   propiedadNombre — para el mensaje pre-poblado
 *   fallbackPhone — número DMX general si no hay asesor
 */
import React from 'react';

const DMX_FALLBACK_PHONE = '525555000000';

function buildHref(phone, mensaje) {
  const text = encodeURIComponent(mensaje);
  return `https://wa.me/${phone}?text=${text}`;
}

function WhatsAppGlyph({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20.52 3.48A11.78 11.78 0 0 0 12.04 0C5.46 0 .12 5.34.12 11.92c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.74 1.46h.01c6.58 0 11.92-5.34 11.92-11.92 0-3.18-1.24-6.18-3.45-8.41ZM12.05 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.84 9.84 0 0 1-1.5-5.25c0-5.45 4.43-9.88 9.88-9.88 2.64 0 5.13 1.03 7 2.9a9.83 9.83 0 0 1 2.89 7c0 5.46-4.43 9.86-9.89 9.86Zm5.42-7.39c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.5a9.13 9.13 0 0 1-1.68-2.09c-.18-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"
        fill="currentColor"/>
    </svg>
  );
}

export default function WhatsAppAsesorCTA({
  asesorPhone,
  asesorId,
  propiedadNombre,
  fallbackPhone = DMX_FALLBACK_PHONE,
}) {
  const phone = (asesorPhone || fallbackPhone || '').replace(/[^\d]/g, '');
  if (!phone) return null;

  const mensaje = `Hola, vi ${propiedadNombre || 'este desarrollo'} en DesarrollosMX y me interesa más info.`;
  const href = buildHref(phone, mensaje);
  const isFallback = !asesorPhone;

  return (
    <div style={{
      position: 'fixed',
      right: 24, bottom: 24,
      zIndex: 50,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
    }}>
      {asesorId && !isFallback && (
        <a data-testid="asesor-public-profile-link"
           href={`/asesor-publico/${encodeURIComponent(asesorId)}`}
           style={{
             padding: '6px 12px',
             borderRadius: 9999,
             background: 'rgba(13,16,23,0.92)',
             border: '1px solid rgba(240,235,224,0.18)',
             color: 'var(--cream)',
             fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11,
             textDecoration: 'none',
             backdropFilter: 'blur(24px)',
             letterSpacing: '0.02em',
           }}>Ver perfil del asesor</a>
      )}
      <a
        data-testid="whatsapp-asesor-cta"
        data-asesor={asesorPhone ? '1' : '0'}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          try {
            if (window.dataLayer) {
              window.dataLayer.push({
                event: 'wa_asesor_click',
                propiedad: propiedadNombre || '',
                fallback: isFallback,
              });
            }
          } catch {}
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center', gap: 10,
          padding: '12px 18px',
          borderRadius: 9999,
          background: 'rgba(13,16,23,0.92)',
          border: '1px solid rgba(34,197,94,0.45)',
          color: '#22C55E',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
          textDecoration: 'none',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 4px 18px rgba(34,197,94,0.18)',
          transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
          minHeight: 48,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <WhatsAppGlyph size={20} />
        <span>Habla con asesor</span>
      </a>
    </div>
  );
}
