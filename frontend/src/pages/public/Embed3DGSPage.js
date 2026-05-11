// W4.9.6 — Embed3DGSPage
// Iframe-friendly fullscreen viewer · /embed/3dgs/:unit_id (no auth).
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Tour3DViewer from '../../components/tour3d/Tour3DViewer';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Embed3DGSPage() {
  const { unit_id } = useParams();
  const [search] = useSearchParams();
  const theme = search.get('theme') || 'cream';
  const ui = search.get('ui') || 'minimal';
  const branding = search.get('branding') !== '0';
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  const [embedBranding, setEmbedBranding] = useState(true);

  // Fetch latest ready scan for unit
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/tour-3dgs/scans?unit_id=${encodeURIComponent(unit_id)}&status=ready&limit=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d?.ok || !d.items?.length) {
          setError('Tour 3D no disponible');
          return;
        }
        setScan(d.items[0]);
        // Fetch settings for dev_id
        if (d.items[0].dev_id) {
          fetch(`${API}/api/tour-3dgs/settings/${encodeURIComponent(d.items[0].dev_id)}`)
            .then((r) => r.json())
            .then((s) => {
              if (alive && s?.ok) setEmbedBranding(s.settings.embed_branding !== false);
            })
            .catch(() => {});
        }
      })
      .catch(() => alive && setError('Tour 3D no disponible'));
    return () => { alive = false; };
  }, [unit_id]);

  // PostHog + LFPDPPP log on mount
  useEffect(() => {
    if (!scan) return;
    try {
      // PostHog (silent if not available)
      const ph = window.posthog;
      ph?.capture?.('embed_3dgs_loaded', {
        unit_id,
        scan_id: scan.scan_id,
        referrer: document.referrer || '',
      });
    } catch (_) { /* noop */ }
    // Backend log
    fetch(`${API}/api/tour-3dgs/embed/loaded`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit_id,
        scan_id: scan.scan_id,
        referrer: document.referrer || '',
      }),
    }).catch(() => {});
  }, [scan, unit_id]);

  const showBranding = useMemo(() => branding && embedBranding, [branding, embedBranding]);

  return (
    <div
      data-testid="embed-3dgs-page"
      style={{
        position: 'fixed', inset: 0,
        background: theme === 'dark' ? '#06080F' : '#F0EBE0',
        overflow: 'hidden',
      }}
    >
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme === 'dark' ? '#F0EBE0' : '#06080F',
          fontFamily: 'DM Sans', fontSize: 14, textAlign: 'center', padding: 24,
        }}>
          {error}
        </div>
      )}

      {scan && (
        <div data-testid="embed-3dgs-viewer" style={{ position: 'absolute', inset: 0 }}>
          <Tour3DViewer
            scanId={scan.scan_id}
            viewerConfig={scan.viewer_config}
            theme={theme}
            uiMode={ui}
          />
        </div>
      )}

      {/* DMX branding overlay */}
      {showBranding && scan && (
        <a
          href="https://desarrollosmx.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'absolute', bottom: 12, right: 12,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(13,16,23,0.78)',
            backdropFilter: 'blur(12px)',
            color: '#F0EBE0',
            border: '1px solid rgba(240,235,224,0.18)',
            borderRadius: 9999,
            padding: '6px 14px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
            textDecoration: 'none',
            zIndex: 10,
          }}
        >
          DESARROLLOS MX
        </a>
      )}
    </div>
  );
}
