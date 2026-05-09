// LfpdpppBadge — Wave 3 W3.9a · LFPDPPP compliance badge for landing footer
import React from 'react';

export default function LfpdpppBadge() {
  const linkBase = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 9999,
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: 500,
    fontSize: 11,
    color: 'rgba(240,235,224,0.6)',
    textDecoration: 'none',
    transition: 'color 0.2s, background 0.2s',
    border: '1px solid rgba(240,235,224,0.10)',
    background: 'rgba(240,235,224,0.04)',
  };
  return (
    <div
      data-testid="lfpdppp-badge"
      itemScope
      itemType="https://schema.org/Organization"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '14px 32px 6px',
        background: 'var(--bg)',
      }}
    >
      <meta itemProp="complianceStandard" content="LFPDPPP México" />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 16px',
          borderRadius: 9999,
          background: 'rgba(13,16,23,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(240,235,224,0.10)',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(240,235,224,0.6)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 500,
            fontSize: 11,
            color: 'rgba(240,235,224,0.8)',
            letterSpacing: '0.01em',
          }}
        >
          LFPDPPP Compliant · k-anonymity ≥5 · Audited Trail
        </span>
        <a
          href="/methodology"
          data-testid="lfpdppp-badge-methodology"
          style={linkBase}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--cream)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(240,235,224,0.6)'; }}
        >
          Methodology
        </a>
        <a
          href="/privacy/dsr"
          data-testid="lfpdppp-badge-privacy"
          style={linkBase}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--cream)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(240,235,224,0.6)'; }}
        >
          Privacy
        </a>
      </div>
    </div>
  );
}
