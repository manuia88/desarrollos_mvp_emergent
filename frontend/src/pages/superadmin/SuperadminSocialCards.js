// W5.16 · SuperadminSocialCards — Preview tool + cache stats.
// Ruta: /superadmin/social-cards · superadmin only · sección CRECIMIENTO (teal).
// Cero hex hardcoded · usa var(--theme*) / var(--cream*) / var(--border).
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Toast } from '../../components/advisor/primitives';
import { RefreshCw, ImageIcon, Eye } from 'lucide-react';
import { getSocialCardsStats, cardImageUrl } from '../../api/social_cards';

const ENTITY_TYPES = [
  { key: 'zone', labelKey: 'entity_zone' },
  { key: 'development', labelKey: 'entity_development' },
  { key: 'property', labelKey: 'entity_property' },
  { key: 'asesor', labelKey: 'entity_asesor' },
];

const LAYOUTS = [
  { key: 'og', labelKey: 'layout_og', size: '1200×630' },
  { key: 'feed', labelKey: 'layout_feed', size: '1080×1080' },
  { key: 'story', labelKey: 'layout_story', size: '1080×1920' },
];

function pillStyle(active) {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'DM Sans',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(var(--theme-rgb), 0.22)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(var(--theme-rgb), 0.45)' : '1px solid var(--border)',
    color: active ? 'var(--theme-2)' : 'var(--cream-2)',
    transition: 'all 0.15s',
  };
}

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--cream)',
  fontFamily: 'DM Sans',
  fontSize: 12,
  outline: 'none',
  width: 220,
};

const thStyle = {
  padding: '8px 12px',
  fontSize: 10,
  color: 'var(--cream-3)',
  textTransform: 'uppercase',
  fontWeight: 700,
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  fontFamily: 'DM Sans',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--cream)',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'DM Sans',
};

export default function SuperadminSocialCards() {
  const { t } = useTranslation();
  const tt = (k, opts) => t(`social_cards.${k}`, opts);

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [entityType, setEntityType] = useState('zone');
  const [slug, setSlug] = useState('polanco');
  const [layout, setLayout] = useState('og');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [toast, setToast] = useState(null);

  // Fetch stats
  useEffect(() => {
    let cancelled = false;
    setLoadingStats(true);
    getSocialCardsStats()
      .then(d => {
        if (cancelled) return;
        setStats(d);
        setLoadingStats(false);
      })
      .catch(e => {
        if (cancelled) return;
        setToast({ kind: 'error', text: e.message || tt('toast.error_stats') });
        setLoadingStats(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePreview() {
    if (!slug.trim()) {
      setToast({ kind: 'warning', text: tt('toast.empty_slug') });
      return;
    }
    setImgError(false);
    // Add cache-buster to force re-fetch on each preview click
    setPreviewUrl(`${cardImageUrl(layout, entityType, slug.trim())}?_=${Date.now()}`);
  }

  const memoryEntries = stats?.memory_cache?.entries ?? 0;
  const diskFiles = stats?.disk_cache?.files_count ?? 0;
  const total24h = stats?.renders_24h?.total ?? 0;
  const byLayout = stats?.renders_24h?.by_layout || {};
  const byEntity = stats?.renders_24h?.by_entity_type || {};

  const previewMaxWidth = useMemo(() => {
    if (layout === 'story') return 360;
    if (layout === 'feed') return 480;
    return 720;
  }, [layout]);

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow={tt('eyebrow')}
        title={tt('title')}
        sub={tt('sub')}
      />

      {/* KPI strip */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 32, padding: '12px 16px', fontFamily: 'DM Sans', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.memory_entries')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{memoryEntries}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.disk_files')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{diskFiles}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.renders_24h')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--theme-2)' }}>{total24h}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              data-testid="refresh-stats-btn"
              onClick={() => setRefreshKey(k => k + 1)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--cream-2)',
                fontFamily: 'DM Sans',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <RefreshCw size={13} />
              {tt('toolbar.refresh')}
            </button>
          </div>
        </div>
      </Card>

      {/* Toolbar de preview */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          {/* Entity type pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
              {tt('toolbar.entity_type')}:
            </span>
            {ENTITY_TYPES.map(et => (
              <button
                key={et.key}
                data-testid={`entity-${et.key}`}
                onClick={() => setEntityType(et.key)}
                style={pillStyle(entityType === et.key)}
              >
                {tt(`toolbar.${et.labelKey}`)}
              </button>
            ))}
          </div>

          {/* Slug input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
              {tt('toolbar.slug')}:
            </span>
            <input
              data-testid="slug-input"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder={tt('toolbar.slug_placeholder')}
              style={inputStyle}
            />
          </div>

          {/* Layout pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
              {tt('toolbar.layout')}:
            </span>
            {LAYOUTS.map(l => (
              <button
                key={l.key}
                data-testid={`layout-${l.key}`}
                onClick={() => setLayout(l.key)}
                style={pillStyle(layout === l.key)}
                title={l.size}
              >
                {tt(`toolbar.${l.labelKey}`)} · {l.size}
              </button>
            ))}
          </div>

          <button
            data-testid="preview-btn"
            onClick={handlePreview}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(var(--theme-rgb), 0.18)',
              border: '1px solid rgba(var(--theme-rgb), 0.45)',
              color: 'var(--theme-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: 'auto',
            }}
          >
            <Eye size={13} />
            {tt('toolbar.preview')}
          </button>
        </div>
      </Card>

      {/* Preview canvas */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320, background: 'rgba(0,0,0,0.18)' }}>
          {!previewUrl ? (
            <div data-testid="preview-empty" style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, textAlign: 'center' }}>
              <ImageIcon size={36} style={{ marginBottom: 10, opacity: 0.5 }} />
              <div>{tt('preview.empty')}</div>
            </div>
          ) : imgError ? (
            <div data-testid="preview-error" style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, textAlign: 'center' }}>
              {tt('preview.error')}
            </div>
          ) : (
            <img
              data-testid="preview-img"
              src={previewUrl}
              alt={`Social card preview ${layout} ${entityType} ${slug}`}
              onError={() => setImgError(true)}
              style={{
                maxWidth: previewMaxWidth,
                width: '100%',
                height: 'auto',
                borderRadius: 10,
                border: '1px solid var(--border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
            />
          )}
        </div>
      </Card>

      {/* Stats tables */}
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--cream-3)', textTransform: 'uppercase',
            fontFamily: 'DM Sans', marginBottom: 10,
          }}>
            {tt('stats.title_24h')}
          </div>
          {loadingStats ? (
            <div style={{ padding: 14, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {tt('stats.loading')}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{tt('stats.col_layout')}</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>{tt('stats.col_renders')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byLayout).map(([k, v]) => (
                      <tr key={k}>
                        <td style={tdStyle}>{k}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--theme-2)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{tt('stats.col_entity')}</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>{tt('stats.col_renders')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byEntity).map(([k, v]) => (
                      <tr key={k}>
                        <td style={tdStyle}>{k}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--theme-2)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      {toast && (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onClose={() => setToast(null)}
        />
      )}
    </SuperadminLayout>
  );
}
