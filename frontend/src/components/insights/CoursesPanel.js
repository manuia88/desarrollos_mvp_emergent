/**
 * W6.11 · CoursesPanel
 * Educational series alongside Insights · cards preview · detail modal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const API = process.env.REACT_APP_BACKEND_URL;

export default function CoursesPanel({ limit = 6 }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/api/insights/courses?limit=${limit}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  const openCourse = useCallback(async (slug) => {
    setSelectedSlug(slug);
    setDetailLoading(true);
    try {
      const r = await fetch(`${API}/api/insights/courses/${encodeURIComponent(slug)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setDetail(data);
    } catch (e) {
      setDetail({ error: e.message || 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
        {t('insightsExt.courses.loading', 'Cargando cursos…')}
      </div>
    );
  }

  if (error || items.length === 0) {
    return (
      <div style={{ padding: 20, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
        {error
          ? t('insightsExt.courses.error', 'No se pudo cargar los cursos.')
          : t('insightsExt.courses.empty', 'Aún no hay cursos publicados.')}
      </div>
    );
  }

  return (
    <section data-testid="courses-panel" style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)' }}>
          {t('insightsExt.courses.title', 'Cursos del Insights Lab')}
        </h3>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
          {items.length} {t('insightsExt.courses.count', 'serie(s)')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
        {items.map((c) => (
          <button
            key={c.id || c.slug}
            type="button"
            onClick={() => openCourse(c.slug)}
            data-testid={`course-card-${c.slug}`}
            style={{
              textAlign: 'left',
              background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 16, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{c.title}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
              {c.description || ''}
            </div>
            <div style={{ marginTop: 'auto', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)' }}>
              {(c.lessons_count || 0)} {t('insightsExt.courses.lessons', 'lecciones')}
            </div>
          </button>
        ))}
      </div>

      {selectedSlug && (
        <div
          onClick={() => { setSelectedSlug(null); setDetail(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 640, width: '100%', maxHeight: '85vh',
              background: '#0D1118', border: '1px solid var(--border)',
              borderRadius: 18, padding: 24, overflowY: 'auto',
            }}
          >
            {detailLoading && (
              <div style={{ color: 'var(--cream-3)' }}>{t('insightsExt.courses.loading', 'Cargando cursos…')}</div>
            )}
            {!detailLoading && detail && detail.error && (
              <div style={{ color: '#fca5a5' }}>{detail.error}</div>
            )}
            {!detailLoading && detail && !detail.error && (
              <>
                <h4 style={{ margin: '0 0 8px', fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{detail.title}</h4>
                <p style={{ margin: '0 0 14px', fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-3)' }}>{detail.description}</p>
                {Array.isArray(detail.lessons) && detail.lessons.length > 0 && (
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    {detail.lessons.map((l, i) => (
                      <li key={i} style={{ marginBottom: 10, color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13 }}>
                        <strong>{l?.title || l?.name || `Lección ${i + 1}`}</strong>
                        {l?.summary && <div style={{ color: 'var(--cream-3)', marginTop: 2 }}>{l.summary}</div>}
                      </li>
                    ))}
                  </ol>
                )}
                {Array.isArray(detail.source_urls) && detail.source_urls.length > 0 && (
                  <div style={{ marginTop: 16, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    <div style={{ marginBottom: 4 }}>{t('insightsExt.courses.sources', 'Fuentes')}:</div>
                    {detail.source_urls.map((u, i) => (
                      <div key={i} style={{ wordBreak: 'break-all' }}>· {u}</div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 18, textAlign: 'right' }}>
              <button
                onClick={() => { setSelectedSlug(null); setDetail(null); }}
                style={{
                  background: 'transparent', color: 'var(--cream-2)',
                  border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px',
                  fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer',
                }}
              >
                {t('insightsExt.courses.close', 'Cerrar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
