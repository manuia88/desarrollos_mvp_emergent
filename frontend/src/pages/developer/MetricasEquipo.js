/**
 * Phase 4 Batch 21 — Métricas del equipo
 *
 * Page: /desarrollador/metricas-equipo
 * 3 secciones: Tour analytics (Sub-A) · Productividad (Sub-B) · Tabla equipo (Sub-C).
 * Filter chip "Período" en topbar controla las 3 secciones simultáneamente.
 */
import React, { useState, useCallback, useEffect } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import TourCompletionAnalytics from '../../components/developer/TourCompletionAnalytics';
import ProductivityWidget from '../../components/developer/ProductivityWidget';
import TeamAggregatedTable from '../../components/developer/TeamAggregatedTable';
import { Flame, Clock, AlertTriangle, Calendar, TrendingUp, X } from 'lucide-react';
import { getSmartListsRollup } from '../../api/smart_lists';

const PERIOD_LABELS = { '7d': '7 días', '30d': '30 días', '90d': '90 días' };

const PERIOD_FILTER_CONFIG = [{
  key: 'period',
  label: 'Período',
  options: [
    { value: '7d',  label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ],
}];

export default function MetricasEquipo({ user, onLogout, embedded }) {
  const [period, setPeriod] = useState('30d');
  const handleFilterChange = useCallback((key, value) => {
    if (key === 'period') {
      setPeriod(value || '30d');
    }
  }, []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <div
        data-testid="metricas-equipo-page"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px', fontFamily: 'DM Sans' }}
      >
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>CRM · Analytics</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
            color: 'var(--cream)', margin: 0, marginBottom: 8,
          }}>
            Métricas del equipo
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Tour completion · productividad · tabla agregada por asesor.
          </p>
        </div>

        {/* Period filter chips topbar — controla las 3 secciones */}
        <div data-testid="metricas-period-bar" style={{ marginBottom: 18 }}>
          <FilterChipsBar
            filters_config={PERIOD_FILTER_CONFIG}
            current_state={{ period }}
            on_change={handleFilterChange}
            sync_url={true}
          />
        </div>

        {/* Section 1 — Tour completion (Sub-A) */}
        <Section title={`Onboarding tour completion · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-tour">
          <TourCompletionAnalytics period={period} />
        </Section>

        {/* Section 2 — Productividad (Sub-B) */}
        <Section title={`Productividad del equipo · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-productividad">
          <ProductivityWidget period={period} />
        </Section>

        {/* Section 3 — Tabla equipo (Sub-C) */}
        <Section title={`Tabla equipo · Últimos ${PERIOD_LABELS[period]}`}
                  testId="metricas-section-tabla">
          <TeamAggregatedTable period={period} />
        </Section>

        {/* W5.ASR.3 Parte 2 — Smart Lists rollup cross-asesor */}
        <Section title="Smart Lists del equipo" testId="metricas-section-smart-lists">
          <SmartListsRollupPanel />
        </Section>
      </div>
    </DeveloperLayout>
  );
}

function Section({ title, testId, children }) {
  return (
    <section data-testid={testId} style={{ marginTop: 28, marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        paddingBottom: 12, borderBottom: '1px solid rgba(var(--cream-rgb),0.08)',
      }}>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 18,
          color: 'var(--cream)', margin: 0,
        }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ─── W5.ASR.3 Parte 2 · Smart Lists Rollup Panel ─────────────────────────────
const ICONS = { Flame, Clock, AlertTriangle, Calendar, TrendingUp };
const PRESET_PALETTE = {
  rose:   { bg: 'rgba(236,72,153,0.10)', bd: 'rgba(236,72,153,0.32)', fg: '#C63FAE', bar: '#EC4899' },
  amber:  { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.32)', fg: '#C77F12', bar: '#F59E0B' },
  indigo: { bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.32)', fg: '#4F46E5', bar: '#6366F1' },
  green:  { bg: 'rgba(34,197,94,0.10)',  bd: 'rgba(34,197,94,0.32)',  fg: '#1FA06A', bar: '#22C55E' },
};

function SmartListsRollupPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drillDown, setDrillDown] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await getSmartListsRollup();
        if (mounted) setData(r);
      } catch (e) {
        if (mounted) setError(e.body?.detail || e.message || 'Error al cargar rollup');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div data-testid="smart-lists-rollup-loading"
        style={{ padding: 24, color: 'var(--cream-3)', fontSize: 12.5 }}>
        Cargando rollup…
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="smart-lists-rollup-error"
        style={{ padding: 24, color: 'var(--red)', fontSize: 12.5 }}>
        {error}
      </div>
    );
  }
  if (!data) return null;

  const rollup = data.rollup || {};

  return (
    <>
      <div
        data-testid="smart-lists-rollup-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}>
        {Object.entries(rollup).map(([key, info]) => {
          const Icon = ICONS[info.icon] || Flame;
          const palette = PRESET_PALETTE[info.color] || PRESET_PALETTE.indigo;
          const top3 = info.top_3 || [];
          const maxCount = Math.max(1, ...top3.map(r => r.count || 0));
          return (
            <button
              key={key}
              data-testid={`rollup-card-${key}`}
              onClick={() => setDrillDown({ key, info })}
              style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                padding: 14, borderRadius: 14,
                background: palette.bg, border: `1px solid ${palette.bd}`,
                color: 'var(--cream)', textAlign: 'left',
                cursor: 'pointer', transition: 'transform 0.15s',
                fontFamily: 'DM Sans',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={16} color={palette.fg} />
                <div style={{
                  fontSize: 11, color: 'var(--cream-3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  flex: 1,
                }}>
                  {info.label}
                </div>
              </div>
              <div data-testid={`rollup-total-${key}`} style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
                color: palette.fg, letterSpacing: '-0.02em',
              }}>
                {info.total}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {top3.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>
                    Sin asesores activos
                  </div>
                ) : top3.map((row, idx) => (
                  <div key={row.asesor_id || idx}
                    data-testid={`rollup-top-${key}-${idx}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 11, color: 'var(--cream-2)',
                    }}>
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: 140,
                      }}>{row.asesor_name}</span>
                      <span style={{
                        fontFamily: 'DM Mono, monospace',
                        color: palette.fg, fontWeight: 600,
                      }}>{row.count}</span>
                    </div>
                    <div style={{
                      height: 3, borderRadius: 2,
                      background: 'rgba(var(--cream-rgb),0.06)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round((row.count / maxCount) * 100)}%`,
                        background: palette.bar,
                        transition: 'width 0.3s',
                      }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 4 }}>
                {data.asesores_count} asesores · click para drill-down
              </div>
            </button>
          );
        })}
      </div>

      {/* Drill-down modal */}
      {drillDown && (
        <DrillDownModal
          presetKey={drillDown.key}
          info={drillDown.info}
          total={drillDown.info.total}
          onClose={() => setDrillDown(null)}
        />
      )}
    </>
  );
}

function DrillDownModal({ presetKey, info, total, onClose }) {
  const palette = PRESET_PALETTE[info.color] || PRESET_PALETTE.indigo;
  const rows = info.per_asesor || [];
  return (
    <div
      data-testid="rollup-drilldown-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(var(--bg-rgb),0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
      <div
        data-testid={`rollup-drilldown-${presetKey}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface,#15171F)', border: `1px solid ${palette.bd}`,
          borderRadius: 16, padding: 22, maxWidth: 520, width: '100%',
          maxHeight: '80vh', overflow: 'auto',
          fontFamily: 'DM Sans',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div>
            <div style={{
              fontSize: 11, color: 'var(--cream-3)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Smart list · breakdown
            </div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: palette.fg, marginTop: 4,
            }}>
              {info.label} · {total}
            </div>
          </div>
          <button
            data-testid="rollup-drilldown-close"
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--cream-2)', padding: 6, borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}>
            <X size={14} />
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px',
                fontSize: 10.5, color: 'var(--cream-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Asesor
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px',
                fontSize: 10.5, color: 'var(--cream-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Count
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px',
                fontSize: 10.5, color: 'var(--cream-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                % del total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} style={{
                padding: 18, textAlign: 'center',
                fontSize: 12, color: 'var(--cream-3)',
              }}>Sin datos</td></tr>
            ) : rows.map((r, idx) => {
              const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
              return (
                <tr key={r.asesor_id || idx}
                  data-testid={`rollup-row-${idx}`}
                  style={{ borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--cream)' }}>
                    {r.asesor_name}
                  </td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 12.5,
                    color: palette.fg, fontWeight: 600,
                  }}>
                    {r.count}
                  </td>
                  <td style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'DM Mono, monospace', fontSize: 11.5,
                    color: 'var(--cream-3)',
                  }}>
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
