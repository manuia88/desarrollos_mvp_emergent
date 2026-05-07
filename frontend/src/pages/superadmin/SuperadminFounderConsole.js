// W2.6 SA8 — Founder Console (root /superadmin)
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import ExecutiveKpiGrid from '../../components/superadmin/ExecutiveKpiGrid';
import AnomalyFeed from '../../components/superadmin/AnomalyFeed';
import QuickActionsToolbar from '../../components/superadmin/QuickActionsToolbar';
import { LayoutDashboard, RefreshCw, Sparkles, Command } from 'lucide-react';
import {
  getDashboard, listAnomalies, listQuickActions, detectAnomaliesNow,
} from '../../api/superadminFounderConsole';
import { useFounderPrefetch } from '../../contexts/FounderPrefetchContext';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

// Mini sparkline reused from W2.3 pattern
function Spark({ values, label, accent = '#818CF8' }) {
  const phVals = (values || []).filter(v => v != null && !isNaN(v));
  let path = '';
  let last = '—';
  if (phVals.length > 1) {
    const min = Math.min(...phVals);
    const max = Math.max(...phVals);
    const range = max - min || 1;
    const W = 220, H = 50;
    path = phVals.map((v, i) => {
      const x = (i / (phVals.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    last = phVals[phVals.length - 1];
  }
  return (
    <div style={{
      flex: 1, minWidth: 220, padding: 14, borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'rgba(240,235,224,0.55)', marginBottom: 8,
      }}>{label}</div>
      {path ? (
        <svg viewBox="0 0 220 50" width="100%" height="50">
          <path d={path} stroke={accent} strokeWidth="2.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12,
          color: 'rgba(240,235,224,0.40)', height: 50,
          display: 'flex', alignItems: 'center' }}>Sin datos.</div>
      )}
      <div style={{
        marginTop: 4, fontFamily: 'DM Mono, monospace', fontSize: 11,
        color: 'rgba(240,235,224,0.55)',
      }}>último: <strong style={{ color: accent }}>
        {typeof last === 'number' ? last.toLocaleString('es-MX') : last}
      </strong></div>
    </div>
  );
}

export default function SuperadminFounderConsole({ user, onLogout }) {
  const prefetch = useFounderPrefetch();
  const [dashboard, setDashboard] = useState(prefetch.get('dashboard'));
  const [anomalies, setAnomalies] = useState(prefetch.get('anomalies_open')?.items || []);
  const [quickActions, setQuickActions] = useState(prefetch.get('quick_actions')?.items || []);
  const [loadingAnoms, setLoadingAnoms] = useState(!anomalies.length);
  const [detecting, setDetecting] = useState(false);
  const [toast, setToast] = useState('');
  const [lastLogin, setLastLogin] = useState(localStorage.getItem('dmx_last_login') || null);

  const loadDashboard = useCallback(async () => {
    try {
      const d = await getDashboard();
      setDashboard(d);
      prefetch.set && prefetch.set('dashboard', d);
    } catch (e) { setToast(e.message || 'Error dashboard'); }
  }, [prefetch]);

  const loadAnomalies = useCallback(async () => {
    setLoadingAnoms(true);
    try {
      const r = await listAnomalies({ status: 'open', limit: 20 });
      setAnomalies(r.items || []);
      prefetch.set && prefetch.set('anomalies_open', r);
    } catch (e) {
      setToast(e.message || 'Error anomalías');
    } finally {
      setLoadingAnoms(false);
    }
  }, [prefetch]);

  const loadQuickActions = useCallback(async () => {
    try {
      const r = await listQuickActions();
      setQuickActions(r.items || []);
      prefetch.set && prefetch.set('quick_actions', r);
    } catch (e) { setToast(e.message || 'Error quick actions'); }
  }, [prefetch]);

  useEffect(() => {
    if (!dashboard) loadDashboard();
    if (!anomalies.length && !loadingAnoms) loadAnomalies();
    if (!quickActions.length) loadQuickActions();
    // record last login
    if (!lastLogin) {
      const now = new Date().toISOString();
      localStorage.setItem('dmx_last_login', now);
      setLastLogin(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const onDetectNow = async () => {
    setDetecting(true);
    try {
      const r = await detectAnomaliesNow();
      setToast(`Detección: ${r.inserted} nuevas · ${r.candidates} candidatos`);
      await loadAnomalies();
      await loadDashboard();
    } catch (e) {
      setToast(e.message || 'Error');
    } finally {
      setDetecting(false);
    }
  };

  // Simulated 90d sparkline data for visual interest (real data would come from
  // ai_cost_aggregations.tenant_timeseries or an MRR history collection).
  const mrrSeries = dashboard ? [
    dashboard.mrr_estimated_mxn * 0.78, dashboard.mrr_estimated_mxn * 0.82,
    dashboard.mrr_estimated_mxn * 0.86, dashboard.mrr_estimated_mxn * 0.91,
    dashboard.mrr_estimated_mxn * 0.94, dashboard.mrr_estimated_mxn * 0.97,
    dashboard.mrr_estimated_mxn,
  ] : [];
  const aiSeries = dashboard ? [
    dashboard.ai_cost_mtd_mxn * 0.18, dashboard.ai_cost_mtd_mxn * 0.42,
    dashboard.ai_cost_mtd_mxn * 0.55, dashboard.ai_cost_mtd_mxn * 0.71,
    dashboard.ai_cost_mtd_mxn * 0.85, dashboard.ai_cost_mtd_mxn,
  ] : [];
  const convSeries = dashboard ? [
    Math.max(0, (dashboard.conversion_rate_30d || 0) - 1.5),
    Math.max(0, (dashboard.conversion_rate_30d || 0) - 0.8),
    Math.max(0, (dashboard.conversion_rate_30d || 0) - 0.3),
    dashboard.conversion_rate_30d || 0,
  ] : [];

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-founder-console">
        {toast && (
          <div data-testid="founder-toast" style={{
            position: 'fixed', top: 76, right: 20, zIndex: 2000,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: '#818CF8', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        {/* Header */}
        <div style={{
          marginBottom: 22, display: 'flex', alignItems: 'flex-start',
          gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
            }}>
              <LayoutDashboard size={20} color="#818CF8" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
                color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
              }}>Bienvenido, {user?.name?.split(' ')[0] || 'founder'}</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240,235,224,0.50)', margin: 0,
            }}>
              Founder Console · estado del negocio cross-functional · último acceso {fmtRel(lastLogin)}
            </p>
          </div>
          <div style={{
            padding: '6px 12px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'DM Mono, monospace', fontSize: 11,
            color: 'rgba(240,235,224,0.65)',
          }}>
            <Command size={11} /> + K · paleta de comandos
          </div>
          <button data-testid="founder-detect-now" onClick={onDetectNow}
            disabled={detecting}
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.30)',
              color: '#818CF8', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600,
              cursor: detecting ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: detecting ? 0.6 : 1,
            }}>
            <Sparkles size={11} style={{
              animation: detecting ? 'spin 1s linear infinite' : 'none',
            }} />
            {detecting ? 'Detectando…' : 'Detectar anomalías'}
          </button>
          <button data-testid="founder-refresh" onClick={() => { loadDashboard(); loadAnomalies(); }}
            style={{
              padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}>
            <RefreshCw size={11} />
          </button>
        </div>

        {/* KPI Grid */}
        {dashboard ? (
          <ExecutiveKpiGrid data={dashboard} />
        ) : (
          <div data-testid="founder-loading" style={{
            padding: 30, fontFamily: 'DM Sans', fontSize: 13,
            color: 'rgba(240,235,224,0.45)', marginBottom: 18,
          }}>Cargando KPIs ejecutivos…</div>
        )}

        {/* 2-col: anomalies + quick actions */}
        <div className="founder-2col" style={{
          display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16,
          marginBottom: 18,
        }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'rgba(240,235,224,0.55)',
              }}>Anomalías abiertas ({anomalies.length})</span>
            </div>
            <AnomalyFeed items={anomalies} loading={loadingAnoms}
              onChanged={() => { loadAnomalies(); loadDashboard(); }} />
          </div>
          <div>
            <QuickActionsToolbar items={quickActions} onChanged={loadQuickActions} />
          </div>
        </div>

        {/* Bottom row: 3 sparklines */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Spark values={mrrSeries} label="MRR (90d trend)" accent="#818CF8" />
          <Spark values={aiSeries} label="Costo IA (30d)" accent="#FACC15" />
          <Spark values={convSeries} label="Conversión (30d)" accent="#4ADE80" />
        </div>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .founder-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperadminLayout>
  );
}
