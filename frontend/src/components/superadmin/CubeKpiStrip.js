// W2.5 SA6 — KPI strip: 6 stat cards (units, available%, avg $/m2, conversion, DOM, IE)
import React from 'react';
import { Building2, Package, DollarSign, TrendingUp, Clock, Sparkles } from 'lucide-react';

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

function fmtNum(v, suffix = '') {
  if (v == null) return '—';
  return `${typeof v === 'number' ? v.toLocaleString('es-MX', { maximumFractionDigits: 1 }) : v}${suffix}`;
}

function StatCard({ Icon, label, value, accent, testid }) {
  return (
    <div data-testid={testid} style={{
      flex: '1 1 140px', minWidth: 140,
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={11} style={{ color: 'rgba(240,235,224,0.55)' }} />
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.55)',
          textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
    </div>
  );
}

export default function CubeKpiStrip({ kpis }) {
  if (!kpis) return null;
  const total = kpis.units_total || 0;
  const avail = kpis.units_available || 0;
  const availPct = total > 0 ? ((avail / total) * 100) : null;
  const dom = kpis.days_on_market_avg;
  const conv = kpis.conversion_rate;

  // Color accents per spec: amber if conv<5%, red if dom>180
  const convAccent = conv != null && conv < 5 ? 'rgba(250,204,21,0.30)' : 'rgba(74,222,128,0.20)';
  const domAccent = dom != null && dom > 180 ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.07)';

  return (
    <div data-testid="cube-kpi-strip" style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18,
    }}>
      <StatCard
        Icon={Building2} label="Proyectos" testid="cube-kpi-projects"
        value={fmtNum(kpis.projects_count)}
      />
      <StatCard
        Icon={Package} label="Unidades · disponibles" testid="cube-kpi-units"
        value={`${fmtNum(total)} · ${availPct != null ? `${availPct.toFixed(0)}%` : '—'}`}
      />
      <StatCard
        Icon={DollarSign} label="$/m² promedio" testid="cube-kpi-pricem2"
        value={fmtMxn(kpis.avg_price_per_m2)}
      />
      <StatCard
        Icon={TrendingUp} label="Conversión" testid="cube-kpi-conversion"
        value={conv != null ? `${conv.toFixed(1)}%` : '—'}
        accent={convAccent}
      />
      <StatCard
        Icon={Clock} label="Días en mercado" testid="cube-kpi-dom"
        value={dom != null ? `${Math.round(dom)} d` : '—'}
        accent={domAccent}
      />
      <StatCard
        Icon={Sparkles} label="Score IE" testid="cube-kpi-ie"
        value={kpis.ie_score_promedio != null ? kpis.ie_score_promedio.toFixed(1) : '—'}
      />
    </div>
  );
}
