/**
 * EngagementTab — Phase 4 Batch 6 · 4.20
 * Reads /api/dev/projects/:id/engagement-units and renders a sortable table,
 * Claude-powered AI recommendations and a per-unit timeline drill-down drawer.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, fmt0 } from '../advisor/primitives';
import { Sparkle, Activity, TrendUp, ArrowRight, X } from '../icons';
import * as api from '../../api/developer';

const STATUS_TONE = {
  disponible: 'ok', vendido: 'neutral', reservado: 'brand', apartado: 'brand',
};

function ScoreBar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v > 70 ? 'linear-gradient(90deg, #6366F1, #EC4899)'
              : v > 40 ? 'linear-gradient(90deg, #6366F1, #8b5cf6)'
              : 'rgba(240,235,224,0.32)';
  return (
    <div style={{ position: 'relative', width: '100%', height: 6, background: 'rgba(240,235,224,0.08)', borderRadius: 9999 }}>
      <div style={{ position: 'absolute', inset: 0, width: `${v}%`, background: color, borderRadius: 9999 }} />
    </div>
  );
}

function TimelineDrawer({ projectId, unit, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!unit) return;
    setLoading(true);
    api.getEngagementUnitTimeline(projectId, unit.unit_id).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [unit, projectId]);
  if (!unit) return null;
  return (
    <div data-testid="engagement-timeline-drawer" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)',
      background: '#0b0e18', borderLeft: '1px solid var(--border)', zIndex: 1200,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '-12px 0 32px rgba(0,0,0,0.42)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--cream-3)' }}>UNIDAD</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{unit.unit_number}</div>
        </div>
        <button data-testid="engagement-timeline-close" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--cream-2)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {loading ? <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando timeline…</div>
          : !data || (data.events || []).length === 0 ? (
            <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin actividad registrada en este periodo.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.events.map((e, idx) => (
                <li key={idx} data-testid={`engagement-event-${e.type}`} style={{
                  padding: 12, border: '1px solid var(--border)', borderRadius: 12,
                  background: 'rgba(240,235,224,0.03)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'var(--cream)', textTransform: 'capitalize' }}>
                      {e.type.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                      {(e.timestamp || '').slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  {e.contact_name && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>Contacto: {e.contact_name}</div>
                  )}
                  {e.actor && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>Actor: {e.actor}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

export default function EngagementTab({ devId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('engagement_score');
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getEngagementUnits(devId, { sort })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [devId, sort]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <Card style={{ padding: 28, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando engagement…</Card>;
  }
  if (!data || data._no_units) {
    return <Card style={{ padding: 28, textAlign: 'center', color: 'var(--cream-3)' }}>No hay unidades cargadas en este proyecto.</Card>;
  }

  const items = data.items || [];
  const totals = data.totals || {};

  return (
    <div data-testid="engagement-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 4 }}>UNIDADES</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)' }}>{fmt0(totals.units || 0)}</div>
        </Card>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 4 }}>ENGAGEMENT PROMEDIO</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)' }}>{(totals.avg_engagement || 0).toFixed(1)}</div>
        </Card>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 4 }}>TOP UNIDAD</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{totals.top_performer || '—'}</div>
        </Card>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 4 }}>UNIDAD MÁS LENTA</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{totals.slowest || '—'}</div>
        </Card>
      </div>

      {/* AI Recommendations */}
      {(data.recommendations || []).length > 0 && (
        <Card data-testid="engagement-recommendations" style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04) 60%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkle size={14} color="#f9a8d4" />
            <div className="eyebrow" style={{ color: '#f9a8d4' }}>RECOMENDACIONES IA · CLAUDE HAIKU</div>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recommendations.map((r, i) => (
              <li key={i} data-testid={`engagement-reco-${i}`} style={{
                fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55, color: 'var(--cream)',
                padding: '10px 12px', background: 'rgba(240,235,224,0.04)',
                border: '1px solid var(--border)', borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ flexShrink: 0, marginTop: 2 }}><TrendUp size={12} color="#a5b4fc" /></span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Sort + table */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div className="eyebrow"><Activity size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />UNIDADES POR ENGAGEMENT</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { k: 'engagement_score', label: 'Score' },
              { k: 'views', label: 'Vistas' },
              { k: 'leads', label: 'Leads' },
              { k: 'cierres', label: 'Cierres' },
            ].map(o => (
              <button key={o.k} data-testid={`engagement-sort-${o.k}`} onClick={() => setSort(o.k)} style={{
                padding: '6px 12px', borderRadius: 9999,
                background: sort === o.k ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
                border: '1px solid var(--border)',
                color: sort === o.k ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}>{o.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="engagement-units-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Unidad', 'Prototipo', 'Status', 'Score', 'Vistas', 'Leads', 'Citas', 'Cierres', ''].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 200).map((u) => (
                <tr key={u.unit_id} data-testid={`engagement-row-${u.unit_id}`} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--cream)', fontWeight: 600 }}>{u.unit_number}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--cream-2)' }}>{u.prototype || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <Badge tone={STATUS_TONE[u.status] || 'neutral'}>{u.status || '—'}</Badge>
                  </td>
                  <td style={{ padding: '10px 8px', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 36, color: 'var(--cream)', fontWeight: 700, fontFamily: 'Outfit' }}>{u.engagement_score}</span>
                      <div style={{ flex: 1 }}><ScoreBar value={u.engagement_score} /></div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--cream-2)' }}>{u.views}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--cream-2)' }}>{u.leads}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--cream-2)' }}>{u.appointments}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--cream-2)' }}>{u.cierres}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <button data-testid={`engagement-drill-${u.unit_id}`} onClick={() => setSelected(u)} style={{
                      padding: '6px 10px', borderRadius: 9999, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--cream-2)', fontSize: 11.5,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans',
                    }}>Timeline <ArrowRight size={10} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <TimelineDrawer projectId={devId} unit={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
