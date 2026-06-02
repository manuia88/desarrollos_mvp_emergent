/**
 * MisProyectosV2 — Rediseño Paso C · CENTRO DE MANDO del dev (doctrina + eje "ojos del dev").
 * Tema CLARO aurora (.portal-asesor) · backend intacto (listProjectsWithStats + getDashboard).
 * Una pantalla = una pregunta: "¿cómo va mi negocio y qué mueve la aguja hoy?".
 * Muestra lo que un dev necesita para DECIDIR: dinero (cobrado vs por cobrar), ritmo de venta
 * (sparkline weekly_sales), meses para agotar, conversión, alertas + el proyecto que necesita acción.
 * Detrás de REACT_APP_DEV_V2 (V1 sigue para usuarios reales hasta el gate).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PremiumCard } from '../../components/asesor/design';
import { listProjectsWithStats } from '../../api/developer';
import { Plus, Building, Search, Sparkles, ArrowRight, MapPin, TrendingUp, AlertTriangle, Users, Zap, Clock } from 'lucide-react';

const STAGE = {
  preventa:          { label: 'Preventa',   rgb: '226,152,46' },
  en_construccion:   { label: 'En obra',     rgb: '59,130,246' },
  entrega_inmediata: { label: 'Entrega ya',  rgb: '31,160,106' },
  exclusiva:         { label: 'Exclusiva',   rgb: '109,74,255' },
  entregado:         { label: 'Entregado',   rgb: '31,160,106' },
};
const stageMeta = (s) => STAGE[s] || STAGE.preventa;
const healthTone = (h) => h >= 80 ? '31,160,106' : h >= 60 ? '226,152,46' : '242,99,91';
const fmtM = (v) => {
  if (!v) return '$0';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
};

// métricas derivadas que mueven la aguja
function metrics(p) {
  const by = p.units_by_status || {};
  const total = Math.max(1, p.units_total || 1);
  const sold = (by.vendido || 0) + (by.reservado || 0);
  const disp = by.disponible || 0;
  const ws = p.weekly_sales || [];
  const recent = ws.slice(-4);
  const wkRate = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const months = wkRate > 0 ? Math.round(disp / (wkRate * 4.33)) : null;
  return {
    total: p.units_total || 0, sold, disp,
    pct: Math.round((sold / total) * 100),
    ws, wkRate,
    months,                                   // meses para agotar (null = sin ritmo)
    porCobrar: disp * (p.price_from || 0),     // valor del inventario restante
    leads: p.leads_active || 0,
    conv: p.conversion_pct || 0,
    health: p.health_score || 0,
  };
}

// ── Sparkline (ritmo de venta) ────────────────────────────────────────────────
function Spark({ data = [], w = 70, h = 24, rgb = '109,74,255' }) {
  if (!data.length) return <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>sin datos</span>;
  const max = Math.max(...data, 1);
  const n = data.length;
  const pts = data.map((v, i) => `${(i / (n - 1 || 1)) * w},${h - (v / max) * (h - 3) - 1.5}`);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={`rgb(${rgb})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2.6" fill={`rgb(${rgb})`} />
    </svg>
  );
}

// ── Tarjeta de proyecto (rica) ────────────────────────────────────────────────
function ProjectCard({ p, onOpen }) {
  const st = stageMeta(p.stage);
  const m = metrics(p);
  const ht = healthTone(m.health);
  return (
    <PremiumCard hover onClick={onOpen} data-testid={`pcard-${p.id}`}
      style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 118, position: 'relative', background: 'var(--surface-2)', flexShrink: 0 }}>
        {p.cover_photo
          ? <img src={p.cover_photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#EEF0F6,#F7F4FF)' }}><Building size={30} color="rgba(109,74,255,0.30)" /></div>}
        <span style={{ position: 'absolute', top: 10, left: 10, background: `rgba(${st.rgb},0.16)`, color: `rgb(${st.rgb})`, fontSize: 10, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 7, textTransform: 'uppercase', border: `1px solid rgba(${st.rgb},0.30)`, backdropFilter: 'blur(6px)' }}>{st.label}</span>
        {m.health > 0 && (
          <span title="Salud del proyecto" style={{ position: 'absolute', top: 8, right: 8, background: '#fff', color: `rgb(${ht})`, fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 999, border: `1px solid rgba(${ht},0.4)`, boxShadow: 'var(--asr-shadow)' }}>♥ {m.health}</span>
        )}
      </div>
      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.2 }}>{p.name}</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {p.colonia || '—'}</p>
        </div>
        {/* vendido + por cobrar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{m.sold}/{m.total} colocadas · <strong style={{ color: 'var(--cream-2)' }}>{m.pct}%</strong></span>
            <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontWeight: 700 }}>{fmtM(m.porCobrar)} por cobrar</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${m.pct}%`, background: 'var(--grad)', transition: 'width .5s' }} />
          </div>
        </div>
        {/* ritmo (sparkline) + meses para agotar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--surface-2)', borderRadius: 10, padding: '8px 11px' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Ritmo de venta</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginTop: 1 }}>{m.wkRate ? `${m.wkRate.toFixed(1)}/sem` : '—'}</div>
          </div>
          <Spark data={m.ws} rgb={m.wkRate ? '109,74,255' : '150,156,171'} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Se agota en</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: m.months && m.months <= 24 ? 'var(--cream)' : 'var(--cream-3)', marginTop: 1 }}>{m.months ? `${m.months} m` : '—'}</div>
          </div>
        </div>
        {/* leads + conversión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', fontSize: 12, color: 'var(--cream-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={13} color="var(--cream-3)" /> {m.leads} leads</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Zap size={13} color="var(--cream-3)" /> {m.conv}% conversión</span>
        </div>
      </div>
    </PremiumCard>
  );
}

// ── KPI tile del centro de mando ──────────────────────────────────────────────
const Kpi = ({ icon, label, value, sub, tone }) => (
  <PremiumCard style={{ padding: '14px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{icon} {label}</div>
    <div style={{ fontSize: 25, fontWeight: 800, color: tone ? `rgb(${tone})` : 'var(--cream)', fontFamily: 'Outfit,sans-serif', marginTop: 5 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{sub}</div>}
  </PremiumCard>
);

// ── Página ────────────────────────────────────────────────────────────────────
export default function MisProyectosV2({ user, onLogout }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('todos');
  const [sort, setSort] = useState('ritmo');

  useEffect(() => {
    (async () => {
      try { setProjects(await listProjectsWithStats() || []); }
      catch { setProjects([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const SORTS = { ritmo: 'Ritmo de venta', vendido: '% colocado', salud: 'Salud', atencion: 'Necesita atención' };
  const filtered = useMemo(() => {
    const cmp = (a, b) => {
      const ma = metrics(a), mb = metrics(b);
      if (sort === 'vendido') return mb.pct - ma.pct;
      if (sort === 'salud') return mb.health - ma.health;
      if (sort === 'atencion') return ma.health - mb.health;
      return mb.wkRate - ma.wkRate; // ritmo
    };
    return projects
      .filter(p => (stage === 'todos' || (p.stage || 'preventa') === stage) && (!q || (p.name + ' ' + (p.colonia || '')).toLowerCase().includes(q.toLowerCase())))
      .sort(cmp);
  }, [projects, q, stage, sort]);

  // centro de mando (portafolio) — calculado de los MISMOS proyectos que se ven (coherente)
  const cm = useMemo(() => {
    if (!projects.length) return null;
    const sum = (f) => projects.reduce((a, p) => a + f(p), 0);
    const total = sum(p => p.units_total || 0);
    const sold = sum(p => { const by = p.units_by_status || {}; return (by.vendido || 0) + (by.reservado || 0); });
    const booked = sum(p => { const by = p.units_by_status || {}; return ((by.vendido || 0) + (by.reservado || 0)) * (p.price_from || 0); });
    const pipeline = sum(p => ((p.units_by_status || {}).disponible || 0) * (p.price_from || 0));
    const convs = projects.filter(p => p.conversion_pct).map(p => p.conversion_pct);
    const avgConv = convs.length ? Math.round(convs.reduce((a, b) => a + b, 0) / convs.length) : 0;
    const wkRate = sum(p => metrics(p).wkRate);
    const lowHealth = projects.filter(p => (p.health_score || 0) > 0 && (p.health_score || 0) < 70).length;
    return {
      n: projects.length,
      colocadoPct: total ? Math.round((sold / total) * 100) : 0,
      sold, total, booked, pipeline,
      leads: sum(p => p.leads_active || 0), avgConv,
      wkRate: Math.round(wkRate * 10) / 10, lowHealth,
    };
  }, [projects]);

  const needsAttention = useMemo(() => {
    const c = projects.filter(p => (p.health_score || 0) > 0 && (p.health_score || 0) < 70);
    return c.length ? c.sort((a, b) => (a.health_score || 0) - (b.health_score || 0))[0] : null;
  }, [projects]);

  const STAGES = ['todos', 'preventa', 'en_construccion', 'entrega_inmediata', 'exclusiva', 'entregado'];

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div className="portal-asesor" style={{ minHeight: '100%', padding: '24px clamp(16px,3vw,36px)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>

          {/* header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>MIS PROYECTOS</div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.1 }}>Tus proyectos</h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--cream-2)' }}>Cómo va tu negocio y qué mueve la aguja hoy. Abre un proyecto para ver y mover sus ventas.</p>
            </div>
            <button onClick={() => navigate('/desarrollador/proyectos/nuevo')} data-testid="nuevo-proyecto-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 11, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(109,74,255,.5)' }}>
              <Plus size={16} /> Nuevo proyecto
            </button>
          </div>

          {/* CENTRO DE MANDO */}
          {cm && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.5fr) repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
              {/* dinero (hero) */}
              <PremiumCard style={{ padding: '16px 18px', background: 'linear-gradient(120deg, rgba(109,74,255,0.10), rgba(198,63,174,0.07))', border: '1px solid rgba(109,74,255,0.22)' }}>
                <div style={{ fontSize: 11, color: 'var(--theme)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Dinero del portafolio</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>{fmtM(cm.pipeline)}</span>
                  <span style={{ fontSize: 13, color: 'var(--cream-2)' }}>por cobrar</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', margin: '10px 0 6px' }}>
                  <div style={{ height: '100%', width: `${cm.booked + cm.pipeline ? Math.round(cm.booked / (cm.booked + cm.pipeline) * 100) : 0}%`, background: 'var(--grad)' }} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--cream-2)' }}>Ya cobraste <strong style={{ color: 'var(--cream)' }}>{fmtM(cm.booked)}</strong> · {cm.n} proyectos</div>
              </PremiumCard>
              <Kpi icon={<TrendingUp size={13} />} label="Colocado" value={`${cm.colocadoPct}%`} sub={`${cm.sold} de ${cm.total} unidades`} />
              <Kpi icon={<Zap size={13} />} label="Ritmo total" value={`${cm.wkRate}/sem`} sub={`conversión ${cm.avgConv}%`} />
              <Kpi icon={<Users size={13} />} label="Leads activos" value={cm.leads} sub="en todo el portafolio" />
              <Kpi icon={<AlertTriangle size={13} />} label="Necesitan acción" value={cm.lowHealth} sub={cm.lowHealth ? 'salud baja — revísalos' : 'todo en orden'} tone={cm.lowHealth ? '242,99,91' : null} />
            </div>
          )}

          {/* TU ASISTENTE SUGIERE (acción de mayor palanca) */}
          {needsAttention && (
            <div data-testid="asistente-sugiere" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 14, marginBottom: 20, background: '#fff', border: '1px solid rgba(109,74,255,0.22)', boxShadow: 'var(--asr-shadow)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={19} color="#fff" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--theme)', letterSpacing: '.03em', textTransform: 'uppercase' }}>Tu asistente sugiere</div>
                <div style={{ fontSize: 14.5, color: 'var(--cream)', marginTop: 2 }}><strong>{needsAttention.name}</strong> es el que más frena tu portafolio (salud {needsAttention.health_score}). Revisa precio, fotos o seguimiento — ahí está tu próxima venta.</div>
              </div>
              <button onClick={() => navigate(`/desarrollador/proyectos/${needsAttention.id}`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Ver qué hacer <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* toolbar: buscar + orden + etapa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--cream-3)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Busca un proyecto…"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px 10px 34px', color: 'var(--cream)', fontSize: 13.5, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> Ordenar:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 10px', color: 'var(--cream)', fontSize: 12.5, cursor: 'pointer' }}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STAGES.map(s => {
                const on = stage === s;
                return (
                  <button key={s} onClick={() => setStage(s)}
                    style={{ background: on ? 'var(--grad)' : 'var(--surface)', color: on ? '#fff' : 'var(--cream-2)', border: on ? 'none' : '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: 'pointer' }}>{s === 'todos' ? 'Todos' : stageMeta(s).label}</button>
                );
              })}
            </div>
          </div>

          {/* grid */}
          {loading ? (
            <div style={{ color: 'var(--cream-3)', padding: 40, textAlign: 'center' }}>Cargando tu negocio…</div>
          ) : filtered.length === 0 ? (
            <PremiumCard style={{ textAlign: 'center', padding: 44 }}>
              <Building size={34} color="var(--cream-3)" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)' }}>{projects.length ? 'Ningún proyecto coincide' : 'Aún no tienes proyectos'}</div>
              <p style={{ fontSize: 13.5, color: 'var(--cream-3)', margin: '6px 0 16px' }}>{projects.length ? 'Cambia el filtro o la búsqueda.' : 'Crea tu primer proyecto para empezar a vender.'}</p>
              {!projects.length && <button onClick={() => navigate('/desarrollador/proyectos/nuevo')} style={{ background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 11, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>+ Nuevo proyecto</button>}
            </PremiumCard>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
              {filtered.map(p => <ProjectCard key={p.id} p={p} onOpen={() => navigate(`/desarrollador/proyectos/${p.id}`)} />)}
            </div>
          )}
        </div>
      </div>
    </DeveloperLayout>
  );
}
