// Faq — 2-col accordion with 7 questions driven from i18n
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';
import { ChevronDown, MessageSquare } from '../icons';

function FaqItem({ q, a, isOpen, onClick, index }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        data-testid={`faq-item-${index}`}
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 0',
          background: 'none', border: 'none',
          cursor: 'pointer',
          color: isOpen ? 'var(--indigo-3)' : 'var(--cream)',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.color = 'var(--indigo-3)'; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = 'var(--cream)'; }}
      >
        <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, lineHeight: 1.4, paddingRight: 24 }}>
          {q}
        </span>
        <div style={{
          flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
          color: isOpen ? 'var(--indigo-3)' : 'var(--cream-3)',
        }}>
          <ChevronDown size={18} color="currentColor" />
        </div>
      </button>
      <div style={{
        maxHeight: isOpen ? 480 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 15,
          color: 'var(--cream-2)',
          lineHeight: 1.65,
          paddingBottom: 20,
          maxWidth: '58ch',
          textWrap: 'pretty',
        }}>
          {a}
        </p>
      </div>
    </div>
  );
}

export default function Faq() {
  const { t } = useTranslation();
  const [openIdx, setOpenIdx] = useState(0);
  const items = t('faq.items', { returnObjects: true });
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <section data-testid="faq-section" id="faq" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 72, alignItems: 'start' }} className="faq-grid">
          <FadeUp>
            <div style={{ position: 'sticky', top: 24 }}>
              <div className="tag-pill" style={{ marginBottom: 20 }}>{t('faq.eyebrow')}</div>
              <h2 style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 3.5vw, 48px)',
                lineHeight: 1.05, letterSpacing: '-0.028em',
                color: 'var(--cream)', marginBottom: 16,
              }}>
                {t('faq.h2')}
              </h2>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
                lineHeight: 1.65, marginBottom: 28,
              }}>
                {t('faq.sub')}
              </p>
              <button className="btn btn-glass" data-testid="faq-advisor-btn" style={{ gap: 8 }}>
                <MessageSquare size={14} />
                {t('faq.advisor_btn')}
              </button>
            </div>
          </FadeUp>

          <div>
            {safeItems.map((item, i) => (
              <FaqItem
                key={i}
                index={i}
                q={item.q}
                a={item.a}
                isOpen={openIdx === i}
                onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
              />
            ))}
            <div style={{ borderBottom: '1px solid var(--border)' }} />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .faq-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
