// LfpdpppBadge — compliance badge for footer (W3.9a)
// LFPDPPP México · k-anonymity ≥5 · Audited Trail
import React from 'react';

export default function LfpdpppBadge() {
  return (
    <div
      data-testid="lfpdppp-badge"
      itemScope
      itemType="https://schema.org/CertificationStatement"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '14px 32px 0',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          borderRadius: 9999,
          background: 'rgba(13, 16, 23, 0.92)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          flexWrap: 'wrap',
          maxWidth: '100%',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(240,235,224,0.6)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>

        <meta itemProp="complianceStandard" content="LFPDPPP México" />

        <span
          style={{
            fontFamily: 'DM Sans',
            fontWeight: 500,
            fontSize: 11,
            color: 'rgba(240,235,224,0.8)',
            letterSpacing: '0.01em',
          }}
        >
          LFPDPPP Compliant · k-anonymity ≥5 · Audited Trail
        </span>

        <span style={{ color: 'rgba(240,235,224,0.3)', fontSize: 11 }}>·</span>

        <a
          href="/methodology"
          data-testid="lfpdppp-methodology-link"
          style={{
            fontFamily: 'DM Sans',
            fontSize: 11,
            color: 'rgba(240,235,224,0.6)',
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--cream)'}
          onMouseLeave={e => e.target.style.color = 'rgba(240,235,224,0.6)'}
        >
          Methodology
        </a>

        <a
          href="/privacy/dsr"
          data-testid="lfpdppp-privacy-link"
          style={{
            fontFamily: 'DM Sans',
            fontSize: 11,
            color: 'rgba(240,235,224,0.6)',
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--cream)'}
          onMouseLeave={e => e.target.style.color = 'rgba(240,235,224,0.6)'}
        >
          Privacy
        </a>
      </div>
    </div>
  );
}
