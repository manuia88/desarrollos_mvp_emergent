// W2.9 Phase Z.2 — Superadmin Intelligence Hub page (executive bird's-eye)
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, FileDown, Sparkles, Layers as LayersIcon,
  TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import MultiLayerHeatmap, { SCHEMES } from '../../components/superadmin/MultiLayerHeatmap';
import ComparablesMatrix from '../../components/superadmin/ComparablesMatrix';
import MarketInsightsPanel from '../../components/superadmin/MarketInsightsPanel';
import {
  getOverview, getInsights, generateInsights,
  getHeatmapMulti, getComparablesMatrix, downloadPdf,
} from '../../api/superadminIntelligenceHub';
import { Z } from '../../styles/zIndex';

const PERIODS = [
  { value: 'current', label: 'Actual' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const ALL_LAYERS = ['price', 'demand', 'risk', 'supply'];

const STATE_LABEL = {
  bull: 'Mercado alcista',
  stable: 'Mercado estable',
  bear: 'Mercado bajista',
};

function fmtMXN(v) {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(v);
  } catch { return `$${v}`; }
}

function StatCard({ label, value, sub, accent, testid }) {
  return (
    <div data-testid={testid} style={{
      flex: '1 1 200px', minWidth: 180, padding: '14px 16px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{
        fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.55)',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
      }}>{label}</span>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: 10.5,
          color: 'rgba(240, 235, 224, 0.70)',
        }}>{sub}</span>
      )}
    </div>
  );
}

function TopMoversCard({ label, items, direction, testid }) {
  const Icon = direction === 'up' ? TrendingUp : TrendingDown;
  const color = direction === 'up' ? '#4ADE80' : '#F87171';
  return (
    <div data-testid={testid} style={{
      flex: '1 1 220px', minWidth: 200, padding: '14px 16px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 9 }}>
        <Icon size={12} color={color} />
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: 'rgba(240,235,224,0.55)',
        }}>{label}</span>
      </div>
      {(items || []).length === 0 && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5,
          color: 'rgba(240,235,224,0.4)' }}>Sin datos suficientes</div>
      )}
      {(items || []).map((it) => (
        <div key={it.zone_id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 0', fontFamily: 'DM Sans', fontSize: 12,
        }}>
          <span style={{ color: 'var(--cream)' }}>{it.name}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', color }}>
            {it.growth_pct_30d > 0 ? '+' : ''}{it.growth_pct_30d}%
          </span>
        </div>
      ))}
    </div>
  );
}

function LayerChip({ layer, active, available, onToggle }) {
  const scheme = SCHEMES[layer];
  const labelMap = {
    price: 'Precio', demand: 'Demanda',
    risk: 'Riesgo', supply: 'Oferta',
  };
  return (
    <button data-testid={`intel-layer-chip-${layer}`}
      onClick={() => onToggle(layer)} disabled={!available}
      style={{
        padding: '7px 14px', borderRadius: 9999,
        background: active && available
          ? `linear-gradient(90deg, rgb(${scheme.from.join(',')}), rgb(${scheme.to.join(',')}))`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active && available ? 'transparent' : 'rgba(255,255,255,0.10)'}`,
        color: active && available ? '#fff' : (available ? 'rgba(240,235,224,0.65)' : 'rgba(240,235,224,0.30)'),
        fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
        cursor: available ? 'pointer' : 'not-allowed',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        transition: 'all 200ms',
      }}>
      <span style={{
        width: 8, height: 8, borderRadius: 9999,
        background: `rgb(${scheme.from.join(',')})`,
        border: '1px solid rgba(255,255,255,0.4)',
      }} />
      {labelMap[layer]}
      {!available && <span style={{ fontSize: 9.5, opacity: 0.7 }}> (W3 ZZ.4)</span>}
    </button>
  );
}

export default function SuperadminIntelligenceHub({ user, onLogout }) {
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('current');
  const [activeLayers, setActiveLayers] = useState(['price', 'demand', 'supply']);
  const [heatmapData, setHeatmapData] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [matrix, setMatrix] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const loadOverviewAndHeatmap = useCallback(async () => {
    try {
      const [ov, hm] = await Promise.all([
        getOverview(),
        getHeatmapMulti({ layers: ALL_LAYERS, tier: 'alcaldia' }),
      ]);
      setOverview(ov);
      setHeatmapData(hm);
      // Auto-select first growth zone if none selected
      if (!selectedZone && ov && (ov.top_3_growth_zones || []).length > 0) {
        const first = ov.top_3_growth_zones[0];
        setSelectedZone({ zone_id: first.zone_id, name: first.name, tier: 'alcaldia' });
      }
    } catch (e) {
      setToast(e.message || 'Error cargando overview');
    }
  }, [selectedZone]);

  useEffect(() => { loadOverviewAndHeatmap(); }, [loadOverviewAndHeatmap]);

  // Load brief + comparables when zone changes
  useEffect(() => {
    if (!selectedZone) return;
    let cancelled = false;
    (async () => {
      setBriefLoading(true);
      setMatrixLoading(true);
      try {
        const b = await getInsights({
          zone_id: selectedZone.zone_id,
          tier: selectedZone.tier || 'alcaldia',
          period,
        });
        if (!cancelled) setBrief(b);
      } catch (e) {
        if (!cancelled) setBrief(null);
      } finally {
        if (!cancelled) setBriefLoading(false);
      }
      try {
        const mx = await getComparablesMatrix({
          zone_id: selectedZone.zone_id, radius_km: 5, limit: 8,
        });
        if (!cancelled) setMatrix(mx);
      } catch (e) {
        if (!cancelled) setMatrix(null);
      } finally {
        if (!cancelled) setMatrixLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedZone, period]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const onRegenerate = async () => {
    if (!selectedZone) return;
    setBusy(true);
    try {
      const b = await generateInsights({
        zone_id: selectedZone.zone_id,
        tier: selectedZone.tier || 'alcaldia',
        period, force: true,
      });
      setBrief(b);
      setToast(b.stub_reason
        ? `Brief generado en modo heurístico (${b.stub_reason})`
        : `Brief regenerado · costo $${b.ai_cost_mxn} MXN`);
    } catch (e) {
      setToast(e.message || 'Error regenerando');
    } finally {
      setBusy(false);
    }
  };

  const onExportPdf = async () => {
    if (!selectedZone) {
      setToast('Selecciona una zona primero');
      return;
    }
    setBusy(true);
    try {
      const r = await downloadPdf({
        zone_id: selectedZone.zone_id,
        tier: selectedZone.tier || 'alcaldia',
        period,
      });
      setToast(`PDF descargado · ${(r.size / 1024).toFixed(1)} KB`);
    } catch (e) {
      setToast(e.message || 'Error exportando PDF');
    } finally {
      setBusy(false);
    }
  };

  const toggleLayer = (layer) => {
    setActiveLayers((prev) => prev.includes(layer)
      ? prev.filter((l) => l !== layer)
      : [...prev, layer]);
  };

  const onZoneClick = (pt) => {
    setSelectedZone({
      zone_id: pt.zone_id, name: pt.name, tier: 'alcaldia',
    });
  };

  const onDrillToCube = () => {
    if (!selectedZone) return;
    navigate(`/superadmin/metrics-cube?zone=${encodeURIComponent(selectedZone.zone_id)}`);
  };

  const riskAvailable = !!(heatmapData && heatmapData.layers
    && heatmapData.layers.risk && heatmapData.layers.risk.available);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-intelligence-hub">
        {toast && (
          <div data-testid="intel-toast" style={{
            position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(var(--theme-rgb),0.18)',
            border: '1px solid rgba(var(--theme-rgb),0.35)',
            color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        {/* Header */}
        <div style={{
          marginBottom: 18, display: 'flex', alignItems: 'flex-start',
          gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 4 }}>
              <Eye size={20} color="var(--theme)" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
                color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
              }}>Inteligencia ejecutiva</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240, 235, 224, 0.72)', margin: 0,
            }}>
              Vista bird&apos;s-eye del cubo Z · Mapbox multi-capa · brief Claude Sonnet ·
              comparables N×N · cron lunes 05:00 MX.
            </p>
          </div>

          {/* Period switcher */}
          <div style={{ display: 'flex', gap: 4,
            background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9999,
            border: '1px solid rgba(255,255,255,0.10)' }}>
            {PERIODS.map((p) => (
              <button key={p.value} data-testid={`intel-period-${p.value}`}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 13px', borderRadius: 9999,
                  background: period === p.value
                    ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))'
                    : 'transparent',
                  border: 'none',
                  color: period === p.value ? '#fff' : 'rgba(240,235,224,0.6)',
                  fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer',
                }}>{p.label}</button>
            ))}
          </div>

          <button data-testid="intel-export-pdf" onClick={onExportPdf}
            disabled={busy || !selectedZone}
            style={{
              padding: '8px 16px', borderRadius: 9999,
              background: 'rgba(var(--theme-rgb), 0.10)',
              border: '1px solid rgba(var(--theme-rgb), 0.40)',
              color: 'var(--theme)', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: busy || !selectedZone ? 0.55 : 1,
              transition: 'all 0.18s ease',
            }}>
            <FileDown size={11} /> Exportar PDF
          </button>

          <button data-testid="intel-refresh-insights" onClick={onRegenerate}
            disabled={busy || !selectedZone}
            style={{
              padding: '8px 16px', borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
              cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: busy || !selectedZone ? 0.55 : 1,
              transition: 'all 0.18s ease',
            }}>
            <Sparkles size={11} /> Refrescar insights
          </button>

          <button data-testid="intel-reload" onClick={loadOverviewAndHeatmap}
            style={{
              padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', cursor: 'pointer',
            }}>
            <RefreshCw size={11} />
          </button>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10,
          marginBottom: 18 }}>
          <StatCard testid="intel-kpi-units"
            label="Unidades mercado"
            value={overview?.total_units_market != null
              ? overview.total_units_market.toLocaleString('es-MX') : '—'}
            sub={STATE_LABEL[overview?.market_state_overall] || 'Mercado estable'}
            accent="rgba(129,140,248,0.30)" />
          <StatCard testid="intel-kpi-price"
            label="Precio promedio CDMX (m²)"
            value={fmtMXN(overview?.avg_price_per_m2_cdmx)}
            sub={`${overview?.total_briefs_count || 0} briefs generados`} />
          <TopMoversCard testid="intel-top-growth"
            label="Top 3 crecimiento (30d)"
            items={overview?.top_3_growth_zones || []} direction="up" />
          <TopMoversCard testid="intel-top-decline"
            label="Top 3 declive (30d)"
            items={overview?.top_3_decline_zones || []} direction="down" />
        </div>

        {/* 2-col layout */}
        <div className="intel-grid" style={{
          display: 'grid', gridTemplateColumns: '60% 40%', gap: 14,
        }}>
          {/* LEFT — heatmap */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              flexWrap: 'wrap', marginBottom: 9 }}>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'rgba(240,235,224,0.55)',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <LayersIcon size={10} /> Capas activas
              </span>
              {ALL_LAYERS.map((l) => (
                <LayerChip key={l} layer={l}
                  active={activeLayers.includes(l)}
                  available={l !== 'risk' || riskAvailable}
                  onToggle={toggleLayer} />
              ))}
              {selectedZone && (
                <button data-testid="intel-drill-cube" onClick={onDrillToCube}
                  style={{
                    marginLeft: 'auto',
                    padding: '6px 12px', borderRadius: 9999,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(240,235,224,0.7)',
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                  Drilldown Cubo →
                </button>
              )}
            </div>
            <MultiLayerHeatmap
              data={heatmapData}
              activeLayers={activeLayers}
              onZoneClick={onZoneClick} />
            {selectedZone && (
              <div data-testid="intel-selected-zone" style={{
                marginTop: 9, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(var(--theme-rgb),0.10)',
                border: '1px solid rgba(var(--theme-rgb),0.30)',
                fontFamily: 'DM Sans', fontSize: 12,
                color: 'var(--theme)', display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Zona seleccionada: <b>{selectedZone.name}</b></span>
                <span style={{ fontFamily: 'DM Mono, monospace', opacity: 0.7 }}>
                  {selectedZone.zone_id}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT — insights */}
          <MarketInsightsPanel
            brief={brief} loading={briefLoading} busy={busy}
            onRegenerate={onRegenerate} selectedZone={selectedZone} />
        </div>

        {/* Comparables matrix */}
        <ComparablesMatrix data={matrix} loading={matrixLoading} />
      </div>

      <style>{`
        @media (max-width: 980px) {
          .intel-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperadminLayout>
  );
}
