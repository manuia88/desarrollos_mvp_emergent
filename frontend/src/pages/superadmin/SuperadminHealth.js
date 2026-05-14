// W1.3 SA1.2 — Superadmin System Health Dashboard
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import CronCard from '../../components/superadmin/CronCard';
import AlertItem from '../../components/superadmin/AlertItem';
import {
  Activity, RefreshCw, Bell, ExternalLink, Server, Database, Clock as ClockIcon,
  Zap, Cpu, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  getHealthOverview, getCrons, getAlerts, resolveAlert, triggerTestAlert,
} from '../../api/superadminHealth';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function colorByPct(pct) {
  if (pct == null) return 'rgba(240,235,224,0.55)';
  if (pct >= 95) return '#4ADE80';
  if (pct >= 70) return '#FACC15';
  return '#F87171';
}

function KpiCard({ Icon, label, value, suffix, accent }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <Icon size={11} color={accent} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: accent || 'var(--cream)' }}>
        {value}{suffix && <span style={{ fontSize: 13, marginLeft: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}

const SERVICE_ICONS = {
  backend_api: Server,
  mongodb: Database,
  apscheduler: ClockIcon,
  resend: Zap,
  claude_haiku: Cpu,
  claude_sonnet: Cpu,
};

const SERVICE_LABELS = {
  backend_api: 'Backend API',
  mongodb: 'MongoDB',
  apscheduler: 'APScheduler',
  resend: 'Resend',
  claude_haiku: 'Claude Haiku',
  claude_sonnet: 'Claude Sonnet',
};

const SERVICE_STATUS_CFG = {
  ok:    { color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.28)', label: 'OK' },
  fail:  { color: '#F87171', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.28)', label: 'Fail' },
  stale: { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.28)', label: 'Stale' },
};

function ServiceCard({ svc }) {
  const Ic = SERVICE_ICONS[svc.name] || Server;
  const cfg = SERVICE_STATUS_CFG[svc.status] || SERVICE_STATUS_CFG.stale;
  return (
    <div data-testid={`service-${svc.name}`}
      style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${cfg.bd}`, display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${cfg.bd}` }}>
        <Ic size={15} color={cfg.color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>
          {SERVICE_LABELS[svc.name] || svc.name}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)' }}>
          {fmtRel(svc.last_check_at)}
        </div>
      </div>
      <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}` }}>
        {cfg.label}
      </span>
    </div>
  );
}

export default function SuperadminHealth({ user, onLogout }) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [crons, setCrons] = useState([]);
  const [alerts, setAlerts] = useState({ items: [], total: 0 });
  const [loadingOv, setLoadingOv] = useState(true);
  const [alertSkip, setAlertSkip] = useState(0);
  const [alertStatus, setAlertStatus] = useState('open');
  const [toast, setToast] = useState('');
  const [busyTest, setBusyTest] = useState(false);
  const tabVisibleRef = useRef(true);

  const loadOverview = useCallback(async () => {
    setLoadingOv(true);
    try { setOverview(await getHealthOverview()); }
    catch (e) { setToast(e.message || 'Error al cargar overview'); }
    finally { setLoadingOv(false); }
  }, []);

  const loadCrons = useCallback(async () => {
    try { const r = await getCrons(); setCrons(r.items || []); }
    catch { setCrons([]); }
  }, []);

  const loadAlerts = useCallback(async (status, skip) => {
    try {
      const r = await getAlerts({ status, limit: 20, skip });
      if (skip === 0) setAlerts(r);
      else setAlerts(prev => ({ ...r, items: [...prev.items, ...(r.items || [])] }));
    } catch { /* keep prev */ }
  }, []);

  // Initial load
  useEffect(() => { loadOverview(); loadCrons(); }, [loadOverview, loadCrons]);
  useEffect(() => { setAlertSkip(0); loadAlerts(alertStatus, 0); }, [alertStatus, loadAlerts]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } }, [toast]);

  // Auto-refresh every 30s while tab visible
  useEffect(() => {
    const onVisibility = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);
    const t = setInterval(() => {
      if (tabVisibleRef.current) { loadOverview(); loadCrons(); loadAlerts(alertStatus, 0); }
    }, 30000);
    return () => { document.removeEventListener('visibilitychange', onVisibility); clearInterval(t); };
  }, [loadOverview, loadCrons, loadAlerts, alertStatus]);

  const handleTestAlert = async () => {
    setBusyTest(true);
    try {
      await triggerTestAlert();
      setToast('Alert insertado');
      setAlertSkip(0); loadAlerts(alertStatus, 0); loadOverview();
    } catch (e) { setToast(e.message || 'Error al insertar alert'); }
    finally { setBusyTest(false); }
  };

  const handleResolve = async (id) => {
    try { await resolveAlert(id); setToast('Alerta resuelta'); loadAlerts(alertStatus, 0); loadOverview(); }
    catch (e) { setToast(e.message || 'Error al resolver'); }
  };

  const cronsOkRatio = overview && overview.crons_total > 0
    ? Math.round(((overview.crons_total - overview.crons_failing) / overview.crons_total) * 100)
    : null;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-health">
        {toast && (
          <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 2000, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Activity size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Salud del sistema
              </h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Probes, crons, ETL y alertas críticas en una sola vista. Auto-refresh 30s.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="health-test-alert" onClick={handleTestAlert} disabled={busyTest}
              style={{ padding: '8px 16px', borderRadius: 9999, background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.32)', color: '#FACC15', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: busyTest ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: busyTest ? 0.7 : 1 }}>
              <Bell size={12} /> Test alert
            </button>
            <button data-testid="health-refresh" onClick={() => { loadOverview(); loadCrons(); loadAlerts(alertStatus, 0); }}
              style={{ padding: '8px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={12} /> Refrescar
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {loadingOv && !overview ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>
        ) : overview && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <KpiCard Icon={Activity} label="Uptime 24h" value={overview.uptime_24h_pct} suffix="%" accent={colorByPct(overview.uptime_24h_pct)} />
              <KpiCard Icon={CheckCircle2} label="Probes 7d" value={overview.probe_pass_rate_7d} suffix="%" accent={colorByPct(overview.probe_pass_rate_7d)} />
              <KpiCard Icon={ClockIcon} label="Crons OK" value={cronsOkRatio == null ? '—' : cronsOkRatio} suffix={cronsOkRatio == null ? '' : '%'} accent={colorByPct(cronsOkRatio)} />
              <KpiCard Icon={AlertTriangle} label="Alertas abiertas" value={overview.alerts_open_critical + overview.alerts_open_warning} accent={overview.alerts_open_critical > 0 ? '#F87171' : overview.alerts_open_warning > 0 ? '#FACC15' : '#4ADE80'} />
            </div>

            {/* Services */}
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 12px', letterSpacing: '-0.018em' }}>
              Servicios
            </h2>
            <div data-testid="services-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 24 }}>
              {(overview.services || []).map(s => <ServiceCard key={s.name} svc={s} />)}
            </div>
          </>
        )}

        {/* Crons */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 12px', letterSpacing: '-0.018em' }}>
            Crons ({crons.length})
          </h2>
          {crons.length === 0 ? (
            <div data-testid="crons-empty" style={{ padding: 40, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>
              Sin datos de crons aún.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {crons.map(c => <CronCard key={c.job_id} cron={c} />)}
            </div>
          )}
        </div>

        {/* Probes link */}
        {overview && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 12px', letterSpacing: '-0.018em' }}>
              Probes
            </h2>
            <div onClick={() => navigate('/superadmin/system-map')} data-testid="probes-link"
              style={{
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.22)',
                display: 'flex', alignItems: 'center', gap: 12, transition: 'transform 180ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Activity size={20} color="var(--theme)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 2 }}>
                  Pass rate 7d: <span style={{ color: colorByPct(overview.probe_pass_rate_7d) }}>{overview.probe_pass_rate_7d}%</span>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.72)' }}>
                  Ver mapa completo de probes
                </div>
              </div>
              <ExternalLink size={13} color="rgba(240, 235, 224, 0.72)" />
            </div>
          </div>
        )}

        {/* Alerts */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0, letterSpacing: '-0.018em' }}>
              Alertas ({alerts.total})
            </h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['open', 'Abiertas'], ['resolved', 'Resueltas'], ['all', 'Todas']].map(([k, l]) => (
                <button key={k} data-testid={`alerts-tab-${k}`} onClick={() => setAlertStatus(k)}
                  style={{
                    padding: '6px 12px', borderRadius: 9999, fontSize: 11.5,
                    fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                    border: alertStatus === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
                    background: alertStatus === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                    color: alertStatus === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                  }}>{l}</button>
              ))}
            </div>
          </div>

          {alerts.items.length === 0 ? (
            <div data-testid="alerts-empty" style={{ padding: 40, textAlign: 'center', color: 'rgba(240, 235, 224, 0.72)', fontFamily: 'DM Sans' }}>
              <CheckCircle2 size={32} color="rgba(74,222,128,0.40)" style={{ marginBottom: 10 }} />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
                Todos los sistemas operativos
              </div>
              <div style={{ fontSize: 12 }}>Última verificación: {fmtRel(overview?.ts)}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.items.map(a => <AlertItem key={a.id} alert={a} onResolve={handleResolve} />)}
              </div>
              {alerts.items.length < alerts.total && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <button data-testid="alerts-load-more" onClick={() => { const ns = alertSkip + 20; setAlertSkip(ns); loadAlerts(alertStatus, ns); }}
                    style={{ padding: '8px 20px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Cargar más
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SuperadminLayout>
  );
}
