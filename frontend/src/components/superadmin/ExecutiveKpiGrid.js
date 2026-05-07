// W2.6 SA8 — Executive KPI grid (8 cards, click drill to area)
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Users, Briefcase, AlertCircle, DollarSign, FolderUp, Sparkles, Target,
} from 'lucide-react';

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

function Card({ Icon, label, value, sub, accent, route, testid }) {
  const navigate = useNavigate();
  return (
    <button
      data-testid={testid}
      onClick={() => route && navigate(route)}
      style={{
        flex: '1 1 200px', minWidth: 180, padding: '14px 16px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
        backdropFilter: 'blur(12px)',
        cursor: route ? 'pointer' : 'default',
        textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 7,
        transition: 'background 180ms, transform 180ms, border-color 180ms',
      }}
      onMouseEnter={(e) => {
        if (route) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.background = 'rgba(99,102,241,0.07)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={11} style={{ color: 'rgba(240,235,224,0.55)' }} />
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.55)',
          textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
        color: 'var(--cream)', letterSpacing: '-0.025em', lineHeight: 1.05,
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: 'DM Mono, monospace', fontSize: 10.5,
          color: 'rgba(240,235,224,0.45)',
        }}>{sub}</div>
      )}
    </button>
  );
}

export default function ExecutiveKpiGrid({ data }) {
  if (!data) return null;
  const aiSpike = data.ai_cost_mtd_mxn > 0 && data.ai_cost_forecast_mxn > data.ai_cost_mtd_mxn * 1.5;
  const churnAccent = data.churn_risk_count > 5
    ? 'rgba(239,68,68,0.30)' : data.churn_risk_count > 0
      ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)';
  const alertsAccent = data.alerts_open_critical > 0 ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.07)';

  return (
    <div data-testid="exec-kpi-grid" style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22,
    }}>
      <Card Icon={TrendingUp} label="MRR" testid="exec-kpi-mrr"
        value={fmtMxn(data.mrr_estimated_mxn)}
        sub={`ARR ${fmtMxn(data.arr_estimated_mxn)}`}
        route="/superadmin/commercial" />
      <Card Icon={Users} label="Tenants activos" testid="exec-kpi-tenants"
        value={data.active_tenants_count}
        sub={`${data.trial_tenants_count} en trial`}
        route="/superadmin/tenants" />
      <Card Icon={Target} label="Riesgo de churn" testid="exec-kpi-churn"
        value={data.churn_risk_count}
        sub="pro/enterprise sin login >7d"
        accent={churnAccent}
        route="/superadmin/tenants?filter=churn_risk" />
      <Card Icon={DollarSign} label="Costo IA · MTD" testid="exec-kpi-ai-cost"
        value={fmtMxn(data.ai_cost_mtd_mxn)}
        sub={`forecast ${fmtMxn(data.ai_cost_forecast_mxn)}`}
        accent={aiSpike ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'}
        route="/superadmin/ai-cost" />
      <Card Icon={AlertCircle} label="Alertas críticas" testid="exec-kpi-alerts"
        value={data.alerts_open_critical}
        sub="abiertas"
        accent={alertsAccent}
        route="/superadmin/health" />
      <Card Icon={Sparkles} label="Anomalías abiertas" testid="exec-kpi-anomalies"
        value={data.anomalies_open_count}
        sub="auto-detectadas"
        accent={data.anomalies_open_count > 3 ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'} />
      <Card Icon={FolderUp} label="Ingestas pendientes" testid="exec-kpi-ingestion"
        value={data.ingestion_jobs_pending}
        sub={`${data.total_developments} desarrollos · ${data.total_units.toLocaleString('es-MX')} unidades`}
        route="/superadmin/bulk-ingest" />
      <Card Icon={Briefcase} label="Conversión 30d" testid="exec-kpi-conversion"
        value={data.conversion_rate_30d != null ? `${data.conversion_rate_30d}%` : '—'}
        sub={`${data.total_leads_30d} leads`}
        route="/superadmin/metrics-cube" />
    </div>
  );
}
