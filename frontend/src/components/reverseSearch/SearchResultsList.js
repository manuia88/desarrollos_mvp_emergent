// W5.x F5 · SearchResultsList · grid responsive + skeleton + error + empty
import React from 'react';
import { useTranslation } from 'react-i18next';
import SearchResultCard from './SearchResultCard';

const CREAM = '#F0EBE0';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 20,
};

function Skeleton() {
  return (
    <div style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, overflow: 'hidden', backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        width: '100%', aspectRatio: '16/9',
        background: 'linear-gradient(90deg, rgba(240,235,224,0.04), rgba(240,235,224,0.10), rgba(240,235,224,0.04))',
        backgroundSize: '200% 100%',
        animation: 'rs-skeleton 1.2s ease-in-out infinite',
      }} />
      <div style={{ padding: 20, display: 'grid', gap: 10 }}>
        {[88, 70, 52].map((w, i) => (
          <div key={i} style={{
            height: 12, width: `${w}%`, borderRadius: 9999,
            background: 'rgba(240,235,224,0.06)',
          }} />
        ))}
      </div>
    </div>
  );
}

export default function SearchResultsList({ results, loading, error }) {
  const { t } = useTranslation('common');

  // Inline keyframes para skeleton (sin tocar CSS global)
  React.useEffect(() => {
    const id = 'rs-skeleton-kf';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = '@keyframes rs-skeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(style);
  }, []);

  if (loading) {
    return (
      <div data-testid="results-loading" style={gridStyle}>
        {[0, 1, 2].map((i) => <Skeleton key={i} />)}
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="results-error" style={{
        padding: '14px 18px', borderRadius: 18,
        background: 'rgba(236,72,153,0.12)', border: `1px solid ${ROSE}55`,
        color: CREAM, fontFamily: 'DM Sans, sans-serif',
      }}>{error}</div>
    );
  }
  if (!results || results.length === 0) {
    return (
      <div data-testid="results-empty" style={{
        padding: '32px 28px', borderRadius: 24,
        background: CARD_BG, border: BORDER, backdropFilter: 'blur(24px)',
        textAlign: 'center', color: MUTED, fontFamily: 'DM Sans, sans-serif',
      }}>{t('reverseSearch.empty_results')}</div>
    );
  }
  return (
    <div data-testid="results-list" style={gridStyle}>
      {results.map((r) => <SearchResultCard key={r.entity_id} result={r} />)}
    </div>
  );
}
