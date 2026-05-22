// W5.x F7 · SuccessConfirmation · advisor info + 2 botones gradient + auto-close 30s
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';

const INDIGO = '#6366F1';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function SuccessConfirmation({ advisorName, advisorPhone, whatsappLink, pdfUrl, onClose }) {
  const { t } = useTranslation('common');

  useEffect(() => {
    const id = setTimeout(() => { if (typeof onClose === 'function') onClose(); }, 30000);
    return () => clearTimeout(id);
  }, [onClose]);

  const buttonStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '14px 22px', borderRadius: 9999, border: 'none', background: GRADIENT,
    color: '#FFF', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
    letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
    textDecoration: 'none', transition: `transform 320ms ${EASE}`, width: '100%',
  };

  return (
    <section data-testid="success-confirmation" style={{
      display: 'grid', gap: 18, textAlign: 'center',
      fontFamily: 'DM Sans, sans-serif', color: CREAM,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 9999, margin: '0 auto',
        display: 'grid', placeItems: 'center',
        background: 'rgba(99,102,241,0.18)', border: `1px solid ${INDIGO}`,
      }}>
        <Icons.Check size={28} color={CREAM} strokeWidth={2.4} />
      </div>
      <div>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: CREAM }}>
          {t('leadCapture.success_title', { advisor: advisorName || '' })}
        </h2>
        {advisorName && (
          <div data-testid="advisor-name" style={{ marginTop: 6, color: MUTED, fontSize: 13 }}>{advisorName}{advisorPhone ? ` · ${advisorPhone}` : ''}</div>
        )}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
        {whatsappLink && (
          <a data-testid="btn-whatsapp" href={whatsappLink} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
            <Icons.MessageCircle size={16} /> {t('leadCapture.btn_whatsapp')}
          </a>
        )}
        {pdfUrl && (
          <a data-testid="btn-pdf" href={pdfUrl} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
            <Icons.FileDown size={16} /> {t('leadCapture.btn_pdf')}
          </a>
        )}
      </div>
      <div style={{ color: MUTED, fontSize: 11, marginTop: 8 }}>{t('leadCapture.auto_close_hint')}</div>
    </section>
  );
}
