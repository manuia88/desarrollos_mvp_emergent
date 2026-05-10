/**
 * W4.18.2B Sub-A — FunnelInversoCard
 * Renderiza top-3 devs preventa cercanos a un listing usada.
 * Embed dentro de PropertyPopup cuando type === 'broker_usada'.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export default function FunnelInversoCard({ listingId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [devs, setDevs] = useState([]);

  useEffect(() => {
    if (!listingId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}/api/maps-cross/funnel-inverso/${listingId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDevs(d.closest_devs || []); setLoading(false); })
      .catch(() => { setDevs([]); setLoading(false); });
  }, [listingId]);

  if (loading) {
    return (
      <div data-testid="funnel-inverso-loading" style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)', padding: '8px 0', fontFamily: 'DM Sans' }}>
        Buscando preventa cercana...
      </div>
    );
  }
  if (!devs.length) return null;

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: '#a5b4fc', marginBottom: 10,
      }}>
        También considera preventa cercana
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {devs.map(d => (
          <div
            key={d.dev_id}
            data-testid="funnel-inverso-card"
            style={{
              padding: '10px 12px', borderRadius: 14,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.22)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: '#F0EBE0', marginBottom: 2 }}>
                {d.name}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' }}>
                {d.colonia} · {d.distance_km} km · ROI ~{d.expected_roi_pct}%
              </div>
            </div>
            <button
              data-testid={`funnel-inverso-cta-${d.dev_id}`}
              onClick={() => navigate(`/desarrollo/${d.slug || d.dev_id}`)}
              style={{
                padding: '7px 12px', borderRadius: 9999, border: 'none',
                background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {fmtMXN(d.price_from)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
