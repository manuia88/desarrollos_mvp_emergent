/**
 * W4.18.2A — PropertyPopup
 * Modal floating con detalle de feature clickeado.
 * 3 tipos: dev_preventa · broker_usada · catastro_aggregate
 *
 * W4.18.2B Sub-A: muestra FunnelInversoCard cuando type=broker_usada.
 * W4.18.2B Sub-C: muestra trigger Battle Card cuando user es tenant_owner del dev.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FunnelInversoCard from './FunnelInversoCard';

const API = process.env.REACT_APP_BACKEND_URL;

const SCORE_COLORS = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', E: '#ef4444', F: '#dc2626' };

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function ScoreBadge({ letter }) {
  const color = SCORE_COLORS[letter] || '#666';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: '50%',
      background: `${color}22`, border: `2px solid ${color}`,
      fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color,
    }}>
      {letter}
    </span>
  );
}

export default function PropertyPopup({ feature, onClose, onAskAtlax, user, onShowBattleCard }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const { id, type, name } = feature?.properties || {};

  useEffect(() => {
    if (!id || !type) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}/api/maps/property/${type}/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, type]);

  const props = feature?.properties || {};
  const data = detail?.data || {};
  const kpis = data.kpis || {};

  const handleAskAtlax = useCallback(() => {
    if (onAskAtlax) onAskAtlax({ feature, detail, contextLabel: name });
  }, [onAskAtlax, feature, detail, name]);

  const POPUP_STYLE = {
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    width: 320, maxWidth: 'calc(100vw - 32px)',
    background: 'rgba(6,8,15,0.95)', backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18,
    padding: '20px 22px', zIndex: 100,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    fontFamily: 'DM Sans', color: '#F0EBE0',
  };

  const BTN = (style = {}) => ({
    padding: '8px 14px', borderRadius: '9999px', border: 'none',
    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    transition: 'all 0.2s',
    ...style,
  });

  if (!feature) return null;

  return (
    <div data-testid="property-popup" style={POPUP_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: type === 'dev_preventa' ? 'var(--theme)' : type === 'broker_usada' ? 'var(--theme-3)' : '#f59e0b',
            marginBottom: 4,
          }}>
            {type === 'dev_preventa' ? 'Proyecto Preventa' : type === 'broker_usada' ? 'Propiedad Usada' : 'Colonia'}
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, lineHeight: 1.25, color: '#F0EBE0' }}>
            {props.name || '—'}
          </div>
        </div>
        <button
          data-testid="popup-close-btn"
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)', color: 'rgba(240,235,224,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14, flexShrink: 0, marginLeft: 8,
          }}
        >
          ×
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(240,235,224,0.35)', padding: '12px 0', fontSize: 12 }}>
          Cargando...
        </div>
      ) : (
        <>
          {/* ── Dev Preventa ─── */}
          {type === 'dev_preventa' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Precio desde</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: '#F0EBE0' }}>
                    {fmtMXN(props.price_from || kpis.avg_price_mxn)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>IE Score</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--theme)' }}>
                      {Math.round(props.ie_score || kpis.ie_score_promedio || 0)}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>/100</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Precio/m²</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMXN(props.price_m2 || kpis.avg_price_per_m2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Unidades</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{props.units_available ?? kpis.units_available ?? '—'} disp.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  data-testid="popup-ver-detalle-btn"
                  onClick={() => navigate(`/desarrollo/${props.slug || props.id}`)}
                  style={BTN({ background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', flex: 1 })}
                >
                  Ver detalle
                </button>
                <button
                  data-testid="popup-what-if-btn"
                  onClick={() => navigate(`/desarrollador?what_if=${props.id}`)}
                  style={BTN({ background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', flex: 1 })}
                >
                  What-if
                </button>
                <button
                  data-testid="popup-atlax-zona-btn"
                  onClick={handleAskAtlax}
                  style={BTN({ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.7)', width: '100%' })}
                >
                  Preguntale a Atlax sobre esta zona
                </button>
              </div>
              {/* W4.18.2B Sub-C — Battle Card trigger (solo tenant_owner del dev) */}
              {user && (user.tenant_id === data.tenant_id || user.role === 'developer_admin' || user.role === 'superadmin') && (
                <button
                  data-testid="battle-card-trigger"
                  onClick={() => onShowBattleCard?.(props.id)}
                  style={BTN({
                    marginTop: 8, width: '100%', padding: '10px',
                    background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff',
                  })}
                >
                  Ver Battle Card competitiva
                </button>
              )}
            </div>
          )}

          {/* ── Broker Usada ─── */}
          {type === 'broker_usada' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Precio</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18 }}>{fmtMXN(props.price || data.price)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Superficie</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{props.m2 || data.m2 || '—'} m²</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Precio/m²</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMXN(props.price_m2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Tipo</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{props.listing_type || 'venta_usada'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  data-testid="popup-ver-detalle-btn"
                  onClick={() => navigate(`/listing/${props.id}`)}
                  style={BTN({ background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: '#f9a8d4', flex: 1 })}
                >
                  Ver detalle
                </button>
                <button
                  data-testid="popup-smart-routing-btn"
                  onClick={() => navigate(`/asesor?smart_routing=${props.id}`)}
                  style={BTN({ background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', flex: 1 })}
                >
                  Smart Routing
                </button>
                <button
                  data-testid="popup-contactar-btn"
                  onClick={handleAskAtlax}
                  style={BTN({ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.7)', width: '100%' })}
                >
                  Preguntale a Atlax sobre esta zona
                </button>
              </div>
              {/* W4.18.2B Sub-A — Funnel inverso usada → preventa */}
              <FunnelInversoCard listingId={props.id} />
            </div>
          )}

          {/* ── Catastro Aggregate ─── */}
          {type === 'catastro_aggregate' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Precio/m² prom.</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16 }}>{fmtMXN(props.avg_price_m2 || kpis.avg_price_per_m2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Zone Score</div>
                  {data.zone_score ? (
                    <ScoreBadge letter={data.zone_score.score_letter} />
                  ) : (
                    <span style={{ fontSize: 13, color: 'rgba(240,235,224,0.4)' }}>N/D</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Proyectos</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{props.projects_count || kpis.projects_count || 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Unidades tot.</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{props.units_total || kpis.units_total || 0}</div>
                </div>
              </div>
              <button
                data-testid="popup-atlax-zona-btn"
                onClick={handleAskAtlax}
                style={BTN({ background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', width: '100%', padding: '10px' })}
              >
                Preguntale a Atlax sobre esta colonia
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
