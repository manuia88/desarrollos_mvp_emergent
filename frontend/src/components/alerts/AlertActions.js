// W5.x F8 · AlertActions · acciones inline (Contactar · Snooze · Descartar · WhatsApp)
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  contactarAlerta,
  snoozeAlerta,
  descartarAlerta,
} from '../../api/predictive_alerts';

const CREAM = '#F0EBE0';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const baseBtn = {
  padding: '9px 16px',
  borderRadius: 9999,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: `transform 280ms ${EASE}, background 280ms ${EASE}, border-color 280ms ${EASE}`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  whiteSpace: 'nowrap',
};

const primary = {
  ...baseBtn,
  background: GRAD,
  color: '#fff',
};

const secondary = {
  ...baseBtn,
  background: 'rgba(99,102,241,0.10)',
  color: '#C7D2FE',
  border: '1px solid rgba(99,102,241,0.32)',
};

const ghost = {
  ...baseBtn,
  background: 'rgba(240,235,224,0.04)',
  color: 'rgba(240,235,224,0.7)',
  border: '1px solid rgba(240,235,224,0.10)',
};

function buildWhatsAppHref(phone, message) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `52${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${withCountry}${text}`;
}

export default function AlertActions({ alert, onActionDone }) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(null); // 'contactar' | 'snooze' | 'descartar' | null

  const alertId = alert?.alert_id || alert?.id;
  const phone = alert?.lead_phone || alert?.lead?.phone || alert?.lead?.whatsapp;
  const wppMsg = alert?.suggested_message || alert?.whatsapp_template || '';
  const wppHref = buildWhatsAppHref(phone, wppMsg);

  const handle = async (kind, fn) => {
    if (!alertId || busy) return;
    setBusy(kind);
    try {
      const res = await fn();
      if (typeof onActionDone === 'function') {
        onActionDone({ alertId, action: kind, response: res });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-testid="alert-actions"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 2 }}
    >
      <button
        type="button"
        data-testid="alert-action-contactar"
        disabled={busy !== null}
        onClick={() => handle('contactar', () => contactarAlerta(alertId, 'whatsapp'))}
        style={{ ...primary, opacity: busy && busy !== 'contactar' ? 0.55 : 1 }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {busy === 'contactar' ? t('alerts.btn_contactar_loading', 'Marcando...') : t('alerts.btn_contactar', 'Contactar')}
      </button>

      {wppHref && (
        <a
          data-testid="alert-action-whatsapp"
          href={wppHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handle('whatsapp_open', () => contactarAlerta(alertId, 'whatsapp'))}
          style={{ ...secondary, textDecoration: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          {t('alerts.btn_whatsapp', 'WhatsApp')}
        </a>
      )}

      <button
        type="button"
        data-testid="alert-action-snooze"
        disabled={busy !== null}
        onClick={() => handle('snooze', () => snoozeAlerta(alertId, 24))}
        style={{ ...secondary, opacity: busy && busy !== 'snooze' ? 0.55 : 1 }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {busy === 'snooze' ? t('alerts.btn_snooze_loading', 'Pausando...') : t('alerts.btn_snooze', 'Snooze 24h')}
      </button>

      <button
        type="button"
        data-testid="alert-action-descartar"
        disabled={busy !== null}
        onClick={() => handle('descartar', () => descartarAlerta(alertId, ''))}
        style={{ ...ghost, opacity: busy && busy !== 'descartar' ? 0.55 : 1 }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {busy === 'descartar' ? t('alerts.btn_descartar_loading', 'Descartando...') : t('alerts.btn_descartar', 'Descartar')}
      </button>
    </div>
  );
}

export { CREAM };
