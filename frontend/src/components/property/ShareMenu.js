// ShareMenu — copy link, WhatsApp, email
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, MessageSquare } from '../icons';

export default function ShareMenu({ property }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/propiedad/${property.id}`
    : `https://dmx.mx/propiedad/${property.id}`;
  const msg = `${property.titulo} — ${property.price_display} · ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(property.titulo)}&body=${encodeURIComponent(msg)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        data-testid="share-toggle"
        onClick={() => setOpen(!open)}
        className="btn btn-glass btn-sm"
        style={{ gap: 6 }}
      >
        <Share size={13} />
        {t('detail.share_h')}
      </button>
      {open && (
        <div
          data-testid="share-menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            minWidth: 200,
            background: '#0D1118',
            border: '1px solid var(--border-2)',
            borderRadius: 14, padding: 6,
            boxShadow: 'var(--sh-elev)',
            zIndex: 20,
          }}
        >
          <button onClick={copy} data-testid="share-copy" style={menuItem()}>
            {copied ? t('detail.share_copied') : t('detail.share_copy')}
          </button>
          <a href={waUrl} target="_blank" rel="noreferrer" data-testid="share-wa" style={menuItem()}>
            <MessageSquare size={12} /> WhatsApp
          </a>
          <a href={mailUrl} data-testid="share-email" style={menuItem()}>
            {t('detail.share_email')}
          </a>
        </div>
      )}
    </div>
  );
}

function menuItem() {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', borderRadius: 10,
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
    background: 'transparent', border: 'none',
    cursor: 'pointer', textDecoration: 'none', width: '100%',
    textAlign: 'left',
  };
}
