// W5.x F5 · ReverseSearchPage · /portal/buscar · public T0
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SearchBar from '../../../components/reverseSearch/SearchBar';
import ParsedFilters from '../../../components/reverseSearch/ParsedFilters';
import SearchResultsList from '../../../components/reverseSearch/SearchResultsList';
import { postReverseSearch } from '../../../api/reverse_search';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function ReverseSearchPage() {
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const runSearch = async (text) => {
    setLoading(true);
    setError(null);
    try {
      const r = await postReverseSearch({ text, limit: 10 });
      setResult(r);
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('reverseSearch.error_generic', 'Error'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    const txt = (query || '').trim();
    if (!txt) return;
    runSearch(txt);
  };

  const runExample = (example) => {
    setQuery(example);
    runSearch(example);
  };

  const examples = [
    t('reverseSearch.example_1'),
    t('reverseSearch.example_2'),
    t('reverseSearch.example_3'),
  ];

  return (
    <div data-testid="reverse-search-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 24px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>DesarrollosMX · Tools</div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2.2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM,
        }}>{t('reverseSearch.title')}</h1>
        <p style={{ margin: '8px auto 0', color: MUTED, fontSize: 15, maxWidth: 600 }}>{t('reverseSearch.subtitle')}</p>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 28 }}>
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          loading={loading}
          placeholder={t('reverseSearch.placeholder')}
        />

        {!result && !loading && !error && (
          <section data-testid="empty-state" style={{
            padding: '36px 28px', borderRadius: 24, background: CARD_BG, border: BORDER, backdropFilter: 'blur(24px)',
          }}>
            <div style={{ letterSpacing: '0.24em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 16 }}>
              {t('reverseSearch.examples_title')}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {examples.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid={`example-${i + 1}`}
                  onClick={() => runExample(ex)}
                  style={{
                    textAlign: 'left', padding: '14px 18px', borderRadius: 18,
                    background: 'rgba(99,102,241,0.08)', border: `1px solid ${INDIGO}33`,
                    color: CREAM, cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 14, lineHeight: 1.45,
                    transition: `transform 320ms ${EASE}, background 320ms ${EASE}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                >{ex}</button>
              ))}
            </div>
          </section>
        )}

        {(result || loading || error) && (
          <>
            {result?.parsed && <ParsedFilters parsed={result.parsed} />}
            <SearchResultsList results={result?.results || []} loading={loading} error={error} />
            {result && !loading && !error && (
              <div data-testid="results-meta" style={{ color: MUTED, fontSize: 12, textAlign: 'right' }}>
                Buscado en {result.ms_elapsed || 0}ms · {(result.results || []).length} matches{result.cached ? ' · cached' : ''}
              </div>
            )}
          </>
        )}

        <aside data-testid="rs-disclaimer" style={{
          marginTop: 8, padding: '16px 20px',
          borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 14,
          color: MUTED, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
        }}>
          {t('reverseSearch.disclaimer_text')}
        </aside>
      </main>
    </div>
  );
}
