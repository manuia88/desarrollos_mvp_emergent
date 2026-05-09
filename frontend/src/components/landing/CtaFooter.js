// CtaFooter — CTA section + footer bar
import React from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import { MapPin } from '../icons';

export default function CtaFooter() {
  const { t } = useTranslation();

  const FOOTER_LINKS = [
    { key: 'privacy', label: t('footer.privacy') },
    { key: 'terms', label: t('footer.terms') },
    { key: 'advisors', label: t('footer.advisors') },
    { key: 'developers', label: t('footer.developers') },
  ];

  return (
    <>
      <section
        data-testid="cta-section"
        style={{
          padding: '80px 32px',
          background: '#0D1017',
          borderTop: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        <div style={{
          position: 'absolute', top: '-30%', left: '50%',
          transform: 'translateX(-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 780, margin: '0 auto' }}>
          <FadeUp>
            <div className="tag-pill" style={{ marginBottom: 20 }}>{t('cta.eyebrow')}</div>
          </FadeUp>

          <BlurText
            as="h2"
            gradientWords={['información.']}
            style={{
              fontFamily: 'Outfit', fontWeight: 800, fontStyle: 'italic',
              fontSize: 'clamp(38px, 5.5vw, 68px)',
              lineHeight: 1.0, letterSpacing: '-0.03em',
              marginBottom: 20,
              justifyContent: 'center',
            }}
          >
            {`${t('cta.h2_1')} ${t('cta.h2_2')}`}
          </BlurText>

          <FadeUp delay={0.3}>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 17, color: 'var(--cream-2)',
              lineHeight: 1.65, marginBottom: 36, textWrap: 'pretty',
            }}>
              {t('cta.sub')}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" data-testid="cta-explore-btn" style={{ padding: '13px 28px', fontSize: 15 }}>
                <MapPin size={15} />
                {t('cta.primary')}
              </button>
              <button className="btn btn-glass" data-testid="cta-prices-btn" style={{ padding: '13px 28px', fontSize: 15 }}>
                {t('cta.secondary')}
              </button>
            </div>
          </FadeUp>
        </div>
      </section>

      <footer data-testid="footer" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <div style={{ height: 1, background: 'var(--grad)', opacity: 0.5 }} />

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '20px 32px',
          gap: 24,
        }} className="footer-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22,
              background: 'var(--grad)', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={11} color="#fff" />
            </div>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>
              DMX
            </span>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {FOOTER_LINKS.map(link => (
              <a
                key={link.key}
                href="#"
                data-testid={`footer-link-${link.key}`}
                style={{
                  fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.target.style.color = 'var(--cream)'}
                onMouseLeave={e => e.target.style.color = 'var(--cream-3)'}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              {t('footer.copy')}
            </span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .footer-bar {
            grid-template-columns: 1fr !important;
            text-align: center !important;
          }
          .footer-bar > div:last-child { text-align: center !important; }
        }
      `}</style>
    </>
  );
}
