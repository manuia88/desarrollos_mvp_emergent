/**
 * CompareTab — Phase 4 Batch 7.1 · 4.22.1
 * Side-by-side comparison of 2-3 site selection studies.
 */
import React, { useEffect, useState } from 'react';
import { Card, Badge, fmt0 } from '../advisor/primitives';
import { Sparkle, Check, ArrowRight } from '../icons';
import RadarChart from './RadarChart';
import * as api from '../../api/developer';

const SUB_LABEL = {
  market_demand: 'Demanda', price_match: 'Precio', competition: 'Competencia',
  infrastructure: 'Infra.', absorption_potential: 'Absorción', risk_factors: 'Riesgo',
  avg_feasibility: 'Feasibility', top_roi: 'ROI top',
};

function StudyColumn({ study, winners, idx }) {
  const colors = ['#6366F1', '#EC4899', '#22C55E'];
  const tint = colors[idx] || '#6366F1';
  return (
    <Card data-testid={`compare-col-${study.id}`} style={{
      background: `linear-gradient(140deg, ${tint}14, transparent 60%)`,
      border: `1px solid ${tint}48`,
    }}>
      <div style={{ marginBottom: 10 }}>
        <div className="eyebrow" style={{ marginBottom: 3 }}>ESTUDIO {idx + 1}</div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{study.name}</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 3 }}>
          {study.inputs?.project_type} · {study.inputs?.target_segment}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
        <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>FEASIBILITY AVG</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>{study.avg_feasibility}</div>
          {winners.avg_feasibility === study.id && (
            <Badge tone="brand" data-testid={`winner-${study.id}-avg_feasibility`}>WINNER</Badge>
          )}
        </div>
        <div style={{ padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>ZONAS EVAL.</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>{study.total_zones_evaluated}</div>
        </div>
      </div>

      {/* Top-3 zones */}
      <div className="eyebrow" style={{ marginBottom: 6 }}>TOP 3 ZONAS</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '5px 4px', textAlign: 'left', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Colonia</th>
            <th style={{ padding: '5px 4px', textAlign: 'right', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase' }}>Feas.</th>
            <th style={{ padding: '5px 4px', textAlign: 'right', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase' }}>ROI 5y</th>
          </tr>
        </thead>
        <tbody>
          {(study.top_3_zones || []).map((z) => (
            <tr key={z.colonia_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
              <td style={{ padding: '6px 4px', color: 'var(--cream)' }}>{z.colonia}</td>
              <td style={{ padding: '6px 4px', color: 'var(--cream)', textAlign: 'right', fontWeight: 600 }}>{z.feasibility_score}</td>
              <td style={{ padding: '6px 4px', color: 'var(--cream-2)', textAlign: 'right' }}>{z.estimated_roi_5y}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>RADAR · AVG SUB-SCORES</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RadarChart data={study.avg_sub_scores || {}} size={200} color={tint} />
        </div>
      </div>
    </Card>
  );
}

export default function CompareTab() {
  const [studies, setStudies] = useState([]);
  const [selected, setSelected] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.listSiteStudies('completed').then(d => setStudies(d.items || [])).catch(() => setStudies([]));
  }, []);

  const toggle = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    setErr(null);
  };

  const runCompare = async () => {
    if (selected.length < 2 || selected.length > 3) {
      setErr('Selecciona entre 2 y 3 estudios.');
      return;
    }
    setComparing(true); setErr(null);
    try {
      const r = await api.compareSiteStudies(selected);
      setResult(r);
    } catch (e) {
      setErr(e.message || 'Error al comparar');
    } finally { setComparing(false); }
  };

  const winners = result?.diff_matrix?.winner_per_metric || {};
  const cols = result?.studies?.length || 1;

  return (
    <div data-testid="compare-tab">
      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>SELECCIONA 2 A 3 ESTUDIOS COMPLETADOS</div>
        {studies.length === 0 ? (
          <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            No hay estudios completados todavía. Crea al menos 2 estudios para comparar.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {studies.map(s => {
              const active = selected.includes(s.id);
              return (
                <button key={s.id} data-testid={`compare-pick-${s.id}`} onClick={() => toggle(s.id)} style={{
                  padding: '9px 14px', borderRadius: 9999,
                  background: active ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
                  border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                  color: active ? '#fff' : 'var(--cream-2)',
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  {active && <Check size={11} />}
                  {s.name}
                  <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 10 }}>· {s.inputs?.target_segment}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button data-testid="compare-run" onClick={runCompare} disabled={selected.length < 2 || comparing} style={{
            padding: '9px 18px', borderRadius: 9999,
            background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
            border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
            cursor: selected.length >= 2 ? (comparing ? 'wait' : 'pointer') : 'default',
            opacity: selected.length >= 2 ? (comparing ? 0.6 : 1) : 0.4,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><Sparkle size={12} /> {comparing ? 'Comparando…' : 'Comparar'}</button>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            {selected.length}/3 seleccionados
          </span>
        </div>
        {err && (
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.32)', borderRadius: 8, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>{err}</div>
        )}
      </Card>

      {result && (
        <>
          {/* Side-by-side */}
          <div data-testid="compare-grid" style={{
            display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12, marginBottom: 14,
          }} className="compare-grid">
            {result.studies.map((s, idx) => (
              <StudyColumn key={s.id} study={s} winners={winners} idx={idx} />
            ))}
          </div>

          {/* Narrative */}
          <Card style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.10), rgba(236,72,153,0.06) 60%, transparent)', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkle size={13} color="#f9a8d4" />
              <div className="eyebrow" style={{ color: '#f9a8d4' }}>DIFERENCIA CLAVE · CLAUDE HAIKU</div>
            </div>
            <p data-testid="compare-narrative" style={{ fontFamily: 'DM Sans', fontSize: 13.2, color: 'var(--cream)', lineHeight: 1.55, margin: 0 }}>
              {result.diff_matrix.narrative_diff}
            </p>
          </Card>

          {/* Winners per metric */}
          <Card>
            <div className="eyebrow" style={{ marginBottom: 8 }}>WINNERS POR MÉTRICA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              {Object.entries(winners).map(([metric, winnerId]) => {
                const w = result.studies.find(s => s.id === winnerId);
                return (
                  <div key={metric} data-testid={`winner-${metric}`} style={{
                    padding: 10, borderRadius: 10,
                    background: 'rgba(240,235,224,0.04)',
                    border: '1px solid var(--border)',
                  }}>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{SUB_LABEL[metric] || metric}</div>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'var(--cream)' }}>
                      {w?.name || winnerId}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <style>{`@media (max-width: 880px) { .compare-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
