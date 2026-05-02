/**
 * DemographicsSection — Phase 4 Batch 7.2 · 4.22.4
 * Shows INEGI-backed demographics inside the zone drawer (Site Selection).
 * Honest scope label (badge tone changes by source confidence).
 */
import React from 'react';
import { Card, Badge } from '../advisor/primitives';
import { Users, AlertTriangle } from '../icons';

const NSE_LABEL = { AB: 'A/B', 'C+': 'C+', C: 'C', D: 'D', E: 'E' };
const NSE_COLORS = { AB: '#EC4899', 'C+': '#A78BFA', C: '#6366F1', D: '#94A3B8', E: '#64748B' };

const SCOPE_BADGE = {
  inegi_ageb: { tone: 'ok', label: 'INEGI AGEB · Censo 2020' },
  inegi_municipio: { tone: 'brand', label: 'INEGI Municipio · Censo 2020' },
  estimate: { tone: 'neutral', label: 'Estimación (proxy seed)' },
};

function NseBar({ nse }) {
  const order = ['AB', 'C+', 'C', 'D', 'E'];
  const total = order.reduce((s, k) => s + (nse[k] || 0), 0) || 100;
  return (
    <div data-testid="demographics-nse-bar" style={{ width: '100%' }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden',
                    border: '1px solid var(--border)' }}>
        {order.map(k => {
          const pct = (nse[k] || 0) / total * 100;
          if (pct <= 0) return null;
          return (
            <div key={k} title={`NSE ${NSE_LABEL[k]} · ${pct.toFixed(1)}%`} style={{
              width: `${pct}%`, background: NSE_COLORS[k], minWidth: pct >= 1 ? 4 : 0,
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {order.map(k => (
          <div key={k} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: NSE_COLORS[k] }} />
            {NSE_LABEL[k]}: <b style={{ color: 'var(--cream)' }}>{(nse[k] || 0).toFixed(1)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DemographicsSection({ zone }) {
  const dp = zone?.data_points || {};
  const nse = dp.nse_distribution || {};
  const scope = dp.demographic_source || 'estimate';
  const cfg = SCOPE_BADGE[scope] || SCOPE_BADGE.estimate;
  const matchPct = dp.demographic_match_pct;
  const popTotal = dp.population_total || 0;
  const isStale = scope === 'estimate' && popTotal === 0;

  return (
    <Card data-testid="demographics-section" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={13} color="var(--cream-2)" />
          <div className="eyebrow">DEMOGRAFÍA · INEGI</div>
        </div>
        <span title="Datos reales INEGI Censo 2020 + ENIGH 2022. Cache 30 días, refresh automático.">
          <Badge tone={cfg.tone} data-testid={`demographics-scope-${scope}`}>
            {cfg.label}
          </Badge>
        </span>
      </div>

      {isStale ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                      padding: 10, background: 'rgba(251,191,36,0.08)',
                      border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10 }}>
          <AlertTriangle size={12} color="#fcd34d" />
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>
            Sin mapeo INEGI para esta colonia. Usando proxy data_seed.
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 12 }}>
            <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
              <div className="eyebrow" style={{ fontSize: 9 }}>POBLACIÓN</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                {popTotal.toLocaleString()}
              </div>
            </div>
            <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
              <div className="eyebrow" style={{ fontSize: 9 }}>MATCH SEGMENTO</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                {matchPct != null ? `${matchPct}%` : '—'}
              </div>
            </div>
          </div>

          {/* NSE distribution bar */}
          <div style={{ marginBottom: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 5 }}>DISTRIBUCIÓN NSE</div>
            <NseBar nse={nse} />
          </div>
        </>
      )}

      {/* Disclaimer footer */}
      <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 10.5,
                    color: 'var(--cream-3)', lineHeight: 1.4 }}>
        {dp.demographic_year && <>Año fuente: {dp.demographic_year}. </>}
        {dp.demographic_cached ? 'Cache válida.' : 'Recién consultado.'}
        {' Source: BISE INEGI · DesarrollosMX.'}
      </div>
    </Card>
  );
}
