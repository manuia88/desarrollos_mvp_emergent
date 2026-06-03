/**
 * Phase 4 Batch 20 · /desarrollador/crm/funnel — Funnel + Sankey con AI suggestion.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import SmartEmptyState from '../../components/shared/SmartEmptyState';
import { ResponsiveSankey } from '@nivo/sankey';
import { getFunnel, getFunnelBreakdown, getSankey, getFunnelSuggestion } from '../../api/metrics';
import { Sparkle, X } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const STAGE_LABELS = {
  view_ficha: 'Ver ficha',
  click_reservar: 'Click reservar',
  slot_picked: 'Slot elegido',
  form_filled: 'Formulario',
  booking_confirmed: 'Booking',
  visit_completed: 'Visita completa',
};

const PILL_BTN = (active) => ({
  padding: '7px 16px', borderRadius: 9999,
  background: active ? 'var(--bg, #06080F)' : 'transparent',
  color: active ? 'var(--cream)' : 'var(--cream-3)',
  border: `1px solid ${active ? 'rgba(var(--cream-rgb),0.3)' : 'rgba(var(--cream-rgb),0.12)'}`,
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'DM Sans',
});

export default function CrmFunnel({ user, onLogout }) {
  const [tab, setTab] = useState('funnel'); // 'funnel' | 'sankey'
  const [filters, setFilters] = useState({
    period: '30d', utm_source: null, project_id: 'altavista-polanco', asesor: null,
  });
  const [funnel, setFunnel] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [sankey, setSankey] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleChange = useCallback((k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
  }, []);

  const load = useCallback(async () => {
    if (!filters.project_id) return;
    setLoading(true);
    try {
      const params = { period: filters.period };
      if (filters.utm_source) params.utm_source = filters.utm_source;
      if (filters.asesor) params.asesor = filters.asesor;
      const [f, b, sg] = await Promise.all([
        getFunnel(filters.project_id, params),
        getFunnelBreakdown(filters.project_id,
          { period: filters.period, dimension: 'utm_source' }),
        getFunnelSuggestion(filters.project_id, filters.period).catch(() => null),
      ]);
      setFunnel(f); setBreakdown(b); setSuggestion(sg?.suggestion || null);
    } finally { setLoading(false); }
  }, [filters]);

  const loadSankey = useCallback(async () => {
    if (!filters.project_id) return;
    try {
      const sk = await getSankey(filters.project_id, filters.period);
      setSankey(sk);
    } catch { setSankey({ nodes: [], links: [] }); }
  }, [filters.project_id, filters.period]);

  useEffect(() => { if (tab === 'funnel') load(); }, [load, tab]);
  useEffect(() => { if (tab === 'sankey') loadSankey(); }, [loadSankey, tab]);

  const filterCfg = useMemo(() => [
    { key: 'period', label: 'Periodo', options: [
      { value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' },
    ] },
    { key: 'utm_source', label: 'Fuente', options: [
      { value: 'facebook', label: 'Facebook' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'email', label: 'Email' },
      { value: 'qr', label: 'QR' },
    ] },
  ], []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · ANALÍTICA"
        title="Embudo de conversión"
        sub="Drop-off por etapa · atribución multi-toque · sugerencias IA"
      />

      {/* Tabs pill */}
      <div data-testid="funnel-tabs" style={{
        display: 'flex', gap: 6, marginBottom: 14,
      }}>
        <button data-testid="tab-funnel" onClick={() => setTab('funnel')} style={PILL_BTN(tab === 'funnel')}>
          Funnel
        </button>
        <button data-testid="tab-sankey" onClick={() => setTab('sankey')} style={PILL_BTN(tab === 'sankey')}>
          Sankey
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <FilterChipsBar
          filters_config={filterCfg}
          current_state={filters}
          on_change={handleChange}
          sync_url={true}
        />
      </div>

      {/* Project ID input */}
      <div style={{ marginBottom: 14 }}>
        <input data-testid="funnel-project-input" value={filters.project_id || ''}
                onChange={(e) => handleChange('project_id', e.target.value)}
                placeholder="ID del proyecto (slug)"
                style={{
                  padding: '8px 14px', borderRadius: 9999,
                  background: 'rgba(var(--cream-rgb),0.06)',
                  border: '1px solid rgba(var(--cream-rgb),0.16)',
                  color: 'var(--cream)', fontSize: 13, fontFamily: 'DM Sans',
                  width: 320, outline: 'none',
                }} />
      </div>

      {tab === 'funnel' && (
        loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
            Cargando funnel…
          </div>
        ) : !funnel || funnel.total_events === 0 ? (
          <SmartEmptyState
            contextKey="activity.none"
            testId="funnel-empty"
            overrides={{
              title: 'Sin eventos en el funnel',
              body: 'Cuando los visitantes interactúen con la ficha pública del proyecto, verás cada etapa aquí.',
              ctas: [],
            }}
          />
        ) : (
          <FunnelChart funnel={funnel} breakdown={breakdown}
                        suggestion={suggestion}
                        suggestDismissed={suggestDismissed}
                        onDismissSuggestion={() => setSuggestDismissed(true)} />
        )
      )}

      {tab === 'sankey' && (
        <SankeyView sankey={sankey} onNodeClick={(node) => {
          if (node.id?.startsWith('src:')) {
            handleChange('utm_source', node.id.split(':', 2)[1]);
            setTab('funnel');
          }
          if (node.id?.startsWith('ase:')) {
            handleChange('asesor', node.id.split(':', 2)[1]);
            setTab('funnel');
          }
        }} />
      )}
    </DeveloperLayout>
  );
}

/* ── Funnel custom SVG horizontal bars ───────────────────────────── */
export function FunnelChart({ funnel, breakdown, suggestion, suggestDismissed, onDismissSuggestion }) {
  const stages = funnel.stages || [];
  const max = Math.max(...stages.map(s => s.count)) || 1;
  return (
    <div style={{ position: 'relative' }}>
      <div data-testid="funnel-chart" style={{
        padding: 16, borderRadius: 14,
        background: 'rgba(var(--cream-rgb),0.04)',
        border: '1px solid rgba(var(--cream-rgb),0.1)',
        fontFamily: 'DM Sans',
      }}>
        <div style={{
          fontSize: 11, color: 'var(--cream-3)', marginBottom: 12,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {funnel.total_events} eventos · {funnel.overall_conversion_pct}% conversión global
        </div>
        {stages.map((s, i) => {
          const w = (s.count / max) * 100;
          return (
            <div key={s.stage} data-testid={`funnel-stage-${s.stage}`}
                  style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 12, color: 'var(--cream-2)', marginBottom: 4,
              }}>
                <span>{STAGE_LABELS[s.stage] || s.stage}</span>
                <span>
                  {s.count}
                  {i > 0 && (
                    <span style={{
                      marginLeft: 8,
                      color: s.drop_off_pct > 40 ? '#ef4444' : 'var(--cream-3)',
                    }}>
                      ↓ {s.drop_off_pct}% drop
                    </span>
                  )}
                </span>
              </div>
              <div style={{
                height: 22, borderRadius: 9999,
                background: 'rgba(var(--cream-rgb),0.06)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${w}%`, height: '100%',
                  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                  transition: 'width 600ms ease-out',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Breakdown */}
      {breakdown?.rows?.length > 0 && (
        <div data-testid="funnel-breakdown" style={{
          marginTop: 16, padding: 14, borderRadius: 14,
          background: 'rgba(var(--cream-rgb),0.03)',
          border: '1px solid rgba(var(--cream-rgb),0.08)',
          fontFamily: 'DM Sans',
        }}>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 8,
                         letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Breakdown por fuente UTM
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--cream-3)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px' }}>Fuente</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>Eventos</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>Conv %</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.slice(0, 8).map(r => (
                <tr key={r.dimension_value || 'none'}>
                  <td style={{ padding: '6px 4px', color: 'var(--cream-2)' }}>
                    {r.dimension_value || '(sin fuente)'}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--cream-2)' }}>
                    {r.total}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right',
                                 color: r.conversion_pct > 5 ? '#22c55e' : 'var(--cream-3)' }}>
                    {r.conversion_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI suggestion sticky */}
      {suggestion && !suggestDismissed && (
        <div data-testid="funnel-ai-suggestion" style={{
          position: 'fixed', bottom: 18, right: 18, zIndex: Z.DROPDOWN,
          maxWidth: 360, padding: 14, borderRadius: 14,
          background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(var(--cream-rgb),0.18)',
          fontFamily: 'DM Sans',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--blue)', marginBottom: 6 }}>
            <Sparkle size={11} /> Sugerencia IA
            <button onClick={onDismissSuggestion}
                     data-testid="funnel-ai-dismiss"
                     style={{ marginLeft: 'auto', background: 'transparent',
                                border: 0, cursor: 'pointer', color: 'var(--cream-3)' }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
            {suggestion.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.4 }}>
            {suggestion.body}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sankey nivo ─────────────────────────────────────────────────── */
function SankeyView({ sankey, onNodeClick }) {
  if (!sankey) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
      Cargando flujo…
    </div>;
  }
  if (!sankey.nodes?.length || !sankey.links?.length) {
    return (
      <SmartEmptyState
        contextKey="activity.none"
        testId="sankey-empty"
        overrides={{
          title: 'Sin flujo de atribución para mostrar',
          body: 'Necesitas leads con atribución multi-toque para que el Sankey tenga sentido.',
          ctas: [],
        }}
      />
    );
  }

  return (
    <div data-testid="sankey-wrap" style={{
      width: '100%', overflowX: 'auto',
      borderRadius: 14,
      border: '1px solid rgba(var(--cream-rgb),0.1)',
      background: 'rgba(var(--cream-rgb),0.04)',
    }}>
      <div style={{ minWidth: 800, height: 600 }}>
        <ResponsiveSankey
          data={{
            nodes: sankey.nodes.map(n => ({ id: n.id, label: n.label })),
            links: sankey.links,
          }}
          margin={{ top: 24, right: 140, bottom: 24, left: 80 }}
          colors={({ id }) => {
            if (id?.startsWith('src:')) return '#6366F1';
            if (id?.startsWith('ase:')) return '#a5b4fc';
            if (id?.startsWith('stg:')) return '#EC4899';
            if (id?.startsWith('out:')) {
              const v = id.split(':', 2)[1];
              if (v === 'won') return '#22c55e';
              if (v === 'lost') return '#ef4444';
            }
            return '#9ca3af';
          }}
          nodeOpacity={1} nodeThickness={14} nodeBorderWidth={0}
          nodeBorderRadius={4} nodeHoverOthersOpacity={0.35}
          linkOpacity={0.45} linkHoverOthersOpacity={0.12}
          labelPosition="outside" labelOrientation="horizontal"
          labelTextColor="#F0EBE0" theme={{
            tooltip: { container: { background: '#06080F', color: 'var(--cream)',
                                       fontSize: 12, fontFamily: 'DM Sans' } },
          }}
          onClick={(node) => onNodeClick?.(node)}
          label={(node) => sankey.nodes.find(n => n.id === node.id)?.label || node.id}
        />
      </div>
    </div>
  );
}
