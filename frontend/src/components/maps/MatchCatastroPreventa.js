/**
 * W4.18.2B Sub-A — MatchCatastroPreventa
 * Modal que lista recomendaciones de preventa basadas en catastro_cuenta del user.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n}`;
}

export default function MatchCatastroPreventa({ open, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback((force = false) => {
    setLoading(true);
    const url = force
      ? `${API}/api/maps-cross/match-catastro/refresh`
      : `${API}/api/maps-cross/match-catastro/me`;
    const opts = force
      ? { method: 'POST', credentials: 'include' }
      : { credentials: 'include' };
    fetch(url, opts)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(false); }, [open, load]);

  if (!open) return null;

  const recs = data?.recommendations || [];
  const meta = data?.user_property_meta;

  return (
    <div
      data-testid="match-catastro-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto',
          background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
          padding: '24px 26px', fontFamily: 'DM Sans', color: '#F0EBE0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a5b4fc', marginBottom: 4 }}>
              Match Catastro · Preventa
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, margin: 0, color: '#F0EBE0' }}>
              Preventa que mejora tu vivienda
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(240,235,224,0.6)', cursor: 'pointer', fontSize: 16,
            }}
          >×</button>
        </div>

        {meta && (
          <div style={{
            padding: '10px 12px', borderRadius: 12,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.22)',
            marginBottom: 16, fontSize: 12, color: 'rgba(240,235,224,0.7)',
          }}>
            Tu vivienda: {meta.m2_construccion}m² construcción · {meta.recamaras} rec · {meta.banos} baños
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: 'rgba(240,235,224,0.5)', fontSize: 13 }}>
            Buscando matches…
          </div>
        )}

        {!loading && recs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'rgba(240,235,224,0.5)', fontSize: 13 }}>
            {data?.reason === 'no_catastro_cuenta'
              ? 'Aún no tenemos tu folio catastral. Configúralo desde tu perfil para recibir matches.'
              : 'No encontramos matches en este momento.'}
          </div>
        )}

        {!loading && recs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recs.map(r => (
              <div
                key={r.dev_id}
                data-testid={`match-catastro-rec-${r.dev_id}`}
                style={{
                  padding: '14px 16px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6 }}>
                      {r.colonia} · {r.m2_range?.[0]}-{r.m2_range?.[1]} m² · desde {fmtMXN(r.price_from)}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)', lineHeight: 1.45 }}>
                      {r.reason}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: '#22c55e' }}>
                      +{r.delta_roi_pct}%
                    </div>
                    <div style={{ fontSize: 9.5, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      ROI 5y
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { onClose(); navigate(`/desarrollo/${r.slug || r.dev_id}`); }}
                  style={{
                    marginTop: 10, padding: '7px 14px', borderRadius: 9999, border: 'none',
                    background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Ver detalle
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => load(true)}
            disabled={loading}
            style={{
              padding: '7px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >Refrescar</button>
        </div>
      </div>
    </div>
  );
}
