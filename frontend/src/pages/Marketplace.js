// Marketplace page — developments grid, 4-col, sticky horizontal filters + AI search
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/landing/Navbar';
import TopFilters from '../components/marketplace/TopFilters';
import DevelopmentCard from '../components/marketplace/DevelopmentCard';
import { fetchColonias, fetchDevelopments, aiSearchParse } from '../api/marketplace';

export default function Marketplace({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const [colonias, setColonias] = useState([]);
  const [filters, setFilters] = useState({});
  const [aiFilters, setAiFilters] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sort, setSort] = useState('recent');
  const [developments, setDevelopments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchColonias().then(setColonias); }, []);

  useEffect(() => {
    setLoading(true);
    // Merge manual filters + AI filters (AI takes precedence for non-empty values)
    const merged = { ...filters, ...(aiFilters || {}), sort };
    fetchDevelopments(merged).then(list => {
      setDevelopments(list);
      setLoading(false);
    }).catch(() => { setDevelopments([]); setLoading(false); });
  }, [filters, aiFilters, sort]);

  const onAIQuery = async (query) => {
    setAiLoading(true);
    try {
      const { filters: parsed } = await aiSearchParse(query);
      setAiFilters(parsed || {});
    } finally {
      setAiLoading(false);
    }
  };

  const resultsText = useMemo(
    () => t('marketplace_v2.results_count', { count: developments.length }),
    [t, developments.length]
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 60 }}>
        <section style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 12px' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>{t('marketplace_v2.hero_eyebrow')}</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 44px)',
            letterSpacing: '-0.028em', color: 'var(--cream)', lineHeight: 1.05,
            marginBottom: 12, maxWidth: 880, textWrap: 'balance',
          }}>
            {t('marketplace_v2.hero_h1')}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)',
            lineHeight: 1.55, marginBottom: 22, maxWidth: 760,
          }}>
            {t('marketplace_v2.hero_sub')}
          </p>
        </section>

        {/* Sticky filter bar */}
        <section
          data-testid="filter-bar"
          style={{
            position: 'sticky', top: 60, zIndex: 25,
            background: 'rgba(6,8,15,0.92)',
            backdropFilter: 'blur(18px)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}>
          <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 32px' }}>
            <TopFilters
              colonias={colonias}
              filters={filters}
              setFilters={setFilters}
              sort={sort}
              setSort={setSort}
              onAIQuery={onAIQuery}
              aiLoading={aiLoading}
              aiFilters={aiFilters}
              onAIClear={() => setAiFilters(null)}
            />
          </div>
        </section>

        <section style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 32px 64px' }}>
          <div data-testid="mkp-results-count" style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 18 }}>
            {resultsText}
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
          ) : developments.length === 0 ? (
            <div data-testid="mkp-empty" style={{
              padding: 60, textAlign: 'center',
              background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-2)',
              borderRadius: 16, fontFamily: 'DM Sans', color: 'var(--cream-2)',
            }}>
              {t('marketplace_v2.empty')}
            </div>
          ) : (
            <div className="dev-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 20,
            }}>
              {developments.map((d, i) => (
                <DevelopmentCard key={d.id} dev={d} index={i} />
              ))}
            </div>
          )}
        </section>
      </main>

      <style>{`
        @media (max-width: 1200px) { .dev-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 900px) { .dev-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .dev-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
