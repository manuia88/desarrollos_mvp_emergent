// 30-second briefing card — shows Claude-generated text with WhatsApp share
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchBriefing } from '../../api/marketplace';
import { Sparkle, MessageSquare, ArrowRight } from '../icons';

export default function BriefingCard({ property }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchBriefing(property.id);
      setText(data.text || '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [property.id]);

  const waUrl = (() => {
    const phone = (property.advisor?.phone || '').replace(/\D/g, '');
    const msg = text ? `${text}\n\n— vía DMX https://dmx.mx/propiedad/${property.id}` : t('detail.wa_prefill', { colonia: property.colonia, title: property.titulo });
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div
      data-testid="briefing-card"
      style={{
        background: 'linear-gradient(140deg, rgba(99,102,241,0.10) 0%, rgba(236,72,153,0.05) 100%)',
        border: '1px solid rgba(99,102,241,0.30)',
        borderRadius: 20, padding: 22,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9999,
          background: 'var(--grad)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkle size={14} color="#fff" />
        </div>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
            {t('detail.briefing_h')}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            {t('detail.briefing_sub')}
          </div>
        </div>
      </div>

      {loading && (
        <div data-testid="briefing-loading" style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
          {t('detail.briefing_loading')}
        </div>
      )}

      {!loading && text && (
        <p data-testid="briefing-text" style={{
          fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream)',
          lineHeight: 1.6, marginBottom: 18,
        }}>
          {text}
        </p>
      )}

      {error && (
        <button onClick={load} data-testid="briefing-retry" className="btn btn-ghost btn-sm">
          {t('detail.briefing_retry')}
        </button>
      )}

      {!loading && text && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="wa-share-btn"
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <MessageSquare size={12} />
            {t('detail.share_whatsapp')}
            <ArrowRight size={11} />
          </a>
        </div>
      )}
    </div>
  );
}
