/**
 * W4.18.2B Sub-C — BattleCardOverlay (tier T3+)
 * Overlay con tabla comparativa: my_kpis vs top-5 competidores.
 * Muestra FeatureLockedOverlay cuando 403 tier_locked.
 */
import React, { useEffect, useState } from 'react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function deltaCell(value) {
  const v = Number(value || 0);
  const color = v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'rgba(240,235,224,0.5)';
  const sign = v > 0 ? '+' : '';
  return <span style={{ color, fontWeight: 700 }}>{sign}{v}%</span>;
}

export default function BattleCardOverlay({ open, devId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [tierLocked, setTierLocked] = useState(null);

  useEffect(() => {
    if (!open || !devId) return;
    setLoading(true); setData(null); setTierLocked(null);
    fetch(`${API}/api/maps-cross/battle-card/${devId}`, { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          const detail = d.detail || {};
          setTierLocked({ required: detail.required_tier || 'T3', current: detail.current_tier || 'free' });
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (d) setData(d); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, devId]);

  if (!open) return null;

  return (
    <div
      data-testid="battle-card-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: Z.STICKY,
        background: 'rgba(6,8,15,0.88)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 880, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto',
          background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
          padding: 26, fontFamily: 'DM Sans', color: '#F0EBE0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 4 }}>
              Battle Card · Tier T3
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: 0 }}>
              {data?.my_kpis?.name || 'Análisis competitivo'}
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

        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: 'rgba(240,235,224,0.5)' }}>Cargando…</div>
        )}

        {tierLocked && (
          <div data-testid="battle-card-tier-locked" style={{
            padding: 32, textAlign: 'center',
            background: 'rgba(var(--theme-rgb),0.06)',
            border: '1px solid rgba(var(--theme-rgb),0.2)',
            borderRadius: 14,
          }}>
            <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              Battle Card requiere Tier {tierLocked.required}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.7)', marginBottom: 16 }}>
              Tu plan actual: <strong>{tierLocked.current}</strong>. Esta vista comparativa está disponible en Enterprise.
            </div>
            <a
              href="/superadmin/tenants"
              style={{
                display: 'inline-block', padding: '10px 18px', borderRadius: 9999,
                background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}
            >Activar Tier T3</a>
          </div>
        )}

        {!loading && !tierLocked && data && (
          <div data-testid="battle-card-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Proyecto</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Precio/m²</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Absorción %</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Sellout (m)</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Δ Precio/m²</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Δ Absorción</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'rgba(var(--theme-rgb),0.10)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 8px' }}>{data.my_kpis.name} (yo)</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px' }}>{fmtMXN(data.my_kpis.price_per_m2)}</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px' }}>{data.my_kpis.absorption_rate_pct}%</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px' }}>{data.my_kpis.time_to_sellout_months}</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: 'rgba(240,235,224,0.4)' }}>—</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: 'rgba(240,235,224,0.4)' }}>—</td>
                </tr>
                {(data.competitors || []).map(c => (
                  <tr key={c.dev_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)' }}>{c.colonia} · {c.distance_km} km</div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 8px' }}>{fmtMXN(c.price_per_m2)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 8px' }}>{c.absorption_rate_pct}%</td>
                    <td style={{ textAlign: 'right', padding: '10px 8px' }}>{c.time_to_sellout_months}</td>
                    <td style={{ textAlign: 'right', padding: '10px 8px' }}>{deltaCell(c.vs_diff_pct?.price_per_m2)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 8px' }}>{deltaCell(c.vs_diff_pct?.absorption_rate_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!data.competitors || data.competitors.length === 0) && (
              <div style={{ textAlign: 'center', padding: 24, color: 'rgba(240,235,224,0.4)', fontSize: 12 }}>
                Sin competidores en bbox 2km mismo segmento.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
