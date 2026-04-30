// Marketplace page — /marketplace
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/landing/Navbar';
import FiltersSidebar from '../components/marketplace/FiltersSidebar';
import PropertyCard from '../components/marketplace/PropertyCard';
import { fetchColonias, fetchProperties } from '../api/marketplace';

export default function Marketplace({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const [colonias, setColonias] = useState([]);
  const [coloniasById, setColoniasById] = useState({});
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('recent');
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchColonias().then(list => {
      setColonias(list);
      const m = {}; list.forEach(c => { m[c.id] = c; });
      setColoniasById(m);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProperties({ ...filters, sort }).then(list => {
      setProperties(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [filters, sort]);

  const resultsText = useMemo(() => t('marketplace.results_count', { count: properties.length }), [t, properties.length]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 80 }}>
        <section style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px 48px' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t('marketplace.breadcrumb')}</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 44px)',
            letterSpacing: '-0.028em', marginBottom: 12, color: 'var(--cream)',
          }}>
            {t('marketplace.h1')}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)',
            maxWidth: 720, lineHeight: 1.55, marginBottom: 28,
          }}>
            {t('marketplace.sub')}
          </p>

          <div className="mkp-grid" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
            <FiltersSidebar colonias={colonias} filters={filters} setFilters={setFilters} />

            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', marginBottom: 16,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                borderRadius: 12,
              }}>
                <div data-testid="mkp-results" style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
                  {resultsText}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    {t('marketplace.sort_label')}
                  </span>
                  <select
                    data-testid="mkp-sort"
                    value={sort}
                    onChange={e => setSort(e.target.value)}
                    style={{
                      background: 'var(--bg-3)', color: 'var(--cream-2)',
                      border: '1px solid var(--border)', borderRadius: 9999,
                      padding: '6px 14px', fontFamily: 'DM Sans', fontSize: 12,
                      outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="recent">{t('marketplace.sort_recent')}</option>
                    <option value="price_asc">{t('marketplace.sort_price_asc')}</option>
                    <option value="price_desc">{t('marketplace.sort_price_desc')}</option>
                    <option value="sqm_desc">{t('marketplace.sort_sqm_desc')}</option>
                  </select>
                </div>
              </div>

              {loading && (
                <div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>...</div>
              )}
              {!loading && properties.length === 0 && (
                <div data-testid="mkp-empty" style={{
                  padding: 48, textAlign: 'center',
                  background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-2)',
                  borderRadius: 16, fontFamily: 'DM Sans', color: 'var(--cream-2)',
                }}>
                  {t('marketplace.no_results')}
                </div>
              )}

              {!loading && properties.length > 0 && (
                <div className="mkp-cards" style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
                }}>
                  {properties.map((p, i) => (
                    <PropertyCard key={p.id} property={p} index={i} colonia={coloniasById[p.colonia_id]} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <style>{`
        @media (max-width: 900px) {
          .mkp-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 1100px) {
          .mkp-cards { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 680px) {
          .mkp-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
