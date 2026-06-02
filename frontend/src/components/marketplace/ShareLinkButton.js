/**
 * ShareLinkButton — Phase 4 Batch 27 (Sub-C)
 * Botón que abre menú con opciones de compartir (Copy · WhatsApp · Email).
 * Genera URL con query params (?ids=a,b,c&type=colonia) + og:image automático
 * vía endpoint backend /api/share/comparar/og-image.
 *
 * Props:
 *   entityType  — 'colonia' | 'property'
 *   ids         — array de ids a compartir
 *   pathBase    — base path del share (default '/comparar')
 *   title       — título en el prompt del share (default "Compara en DMX")
 */
import React, { useEffect, useRef, useState } from 'react';
import { Share } from '../icons';
import { Z } from '../../styles/zIndex';

export default function ShareLinkButton({
  entityType = 'colonia',
  ids = [],
  pathBase = '/comparar',
  title = 'Compara en DesarrollosMX',
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [open]);

  if (!ids || ids.length === 0) return null;

  const params = new URLSearchParams({ ids: ids.join(','), type: entityType });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}${pathBase}?${params.toString()}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {}
    }
  };

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title} → ${fullUrl}`)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${fullUrl}`)}`;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        data-testid="share-link-trigger"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '12px 22px', borderRadius: 9999,
          background: 'rgba(var(--cream-rgb),0.05)',
          border: '1px solid rgba(var(--cream-rgb),0.18)',
          color: 'var(--cream, #F0EBE0)',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          backdropFilter: 'blur(24px)',
        }}
      >
        <Share size={13} /> {copied ? 'Copiado ✓' : 'Compartir'}
      </button>

      {open && (
        <div data-testid="share-link-menu" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: Z.DROPDOWN,
          padding: 10, borderRadius: 14, minWidth: 240,
          background: 'rgba(var(--bg-rgb),0.98)',
          border: '1px solid rgba(var(--cream-rgb),0.14)',
          backdropFilter: 'blur(24px)',
        }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
            color: 'rgba(var(--cream-rgb),0.45)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '4px 6px 8px',
          }}>
            Compartir esta comparación
          </div>

          <button
            data-testid="share-copy"
            onClick={copyLink}
            style={menuItem(copied)}
          >
            <span>{copied ? '✓ Link copiado' : 'Copiar link'}</span>
          </button>

          <a
            data-testid="share-whatsapp"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...menuItem(false), textDecoration: 'none' }}
          >
            WhatsApp
          </a>

          <a
            data-testid="share-email"
            href={mailHref}
            style={{ ...menuItem(false), textDecoration: 'none' }}
          >
            Email
          </a>

          <div style={{
            marginTop: 6, padding: '6px 10px',
            fontFamily: 'DM Sans', fontSize: 10,
            color: 'rgba(var(--cream-rgb),0.35)',
            borderTop: '1px solid rgba(var(--cream-rgb),0.08)', paddingTop: 8,
            wordBreak: 'break-all',
          }}>
            {fullUrl.length > 52 ? `${fullUrl.slice(0, 52)}…` : fullUrl}
          </div>
        </div>
      )}
    </div>
  );
}

function menuItem(active) {
  return {
    display: 'flex', alignItems: 'center',
    width: '100%', padding: '9px 10px', borderRadius: 9,
    background: active ? 'rgba(34,197,94,0.12)' : 'transparent',
    border: 'none',
    color: active ? '#86EFAC' : 'var(--cream, #F0EBE0)',
    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', textAlign: 'left',
  };
}
