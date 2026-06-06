// Phase 15 · Batch 38 — DesarrolladorRedComercial
// 3 tabs: Inmobiliarias aliadas | Asesores in-house | Asesores freelance
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  Users, Building2, Briefcase, Award, TrendingUp, Calendar,
  Search, ChevronRight,
} from 'lucide-react';
import { getDevRedComercial } from '../../api/directories';
import { Z } from '../../styles/zIndex';
import DesarrolladorUsuarios from './DesarrolladorUsuarios';
import DevRedSalud from '../../components/developer/DevRedSalud';
import MetricasEquipo from './MetricasEquipo';
import AsesoresMetrics from './AsesoresMetrics';
import DesarrolladorSolicitudes from './DesarrolladorSolicitudes';
import DesarrolladorDisputas from './DesarrolladorDisputas';

const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';
const API = process.env.REACT_APP_BACKEND_URL;
// Áreas del centro "Tu red" (re-arquitectura · consolida las hojas sueltas).
const RED_AREAS = [
  ['red', 'Mi red'],
  ['equipo', 'Equipo'],
  ['met-equipo', 'Métricas equipo'],
  ['met-asesores', 'Métricas asesores'],
  ['solicitudes', 'Solicitudes'],
  ['disputas', 'Disputas'],
];

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 30) return `Hace ${days}d`;
    if (days < 365) return `Hace ${Math.floor(days / 30)}m`;
    return `Hace ${Math.floor(days / 365)}a`;
  } catch { return '—'; }
}

function TrustMini({ score }) {
  if (score == null) return null;
  const color = score >= 70 ? '#4ADE80' : score >= 40 ? '#FACC15' : '#F87171';
  const bg = score >= 70 ? 'rgba(74,222,128,0.10)' : score >= 40 ? 'rgba(250,204,21,0.10)' : 'rgba(239,68,68,0.08)';
  return (
    <span data-testid={`trust-${score}`} style={{
      padding: '2px 8px', borderRadius: 9999, fontSize: 10.5,
      fontFamily: 'DM Sans', fontWeight: 700, background: bg, color,
      border: `1px solid ${color}33`,
    }}>Trust {score}</span>
  );
}

function KpiCell({ label, value, accent }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.42)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: accent || 'var(--cream)' }}>
        {value}
      </div>
    </div>
  );
}

function Avatar({ src, name, type }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const grad = type === 'inmobiliaria'
    ? 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(99,102,241,0.10))'
    : type === 'asesor_freelance'
      ? 'linear-gradient(135deg,rgba(236,72,153,0.22),rgba(236,72,153,0.10))'
      : 'linear-gradient(135deg,rgba(74,222,128,0.22),rgba(74,222,128,0.10))';
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: src ? `url(${src}) center/cover no-repeat` : grad,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(var(--cream-rgb),0.10)',
    }}>
      {!src && (
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--blue)' }}>{initial}</span>
      )}
    </div>
  );
}

function Row({ entity, onOpen }) {
  const k = entity.kpi || {};
  const isAsesor = entity.type === 'asesor_inhouse' || entity.type === 'asesor_freelance';
  const name = entity.name || entity.branding?.display_name || entity.id;
  const subtitle = entity.email || entity.branding?.tagline || entity.role || '';
  const tag = entity.type === 'inmobiliaria' ? 'Inmobiliaria'
    : entity.type === 'asesor_freelance' ? 'Freelance'
    : entity.type === 'asesor_inhouse' ? 'In-house' : '';
  return (
    <div data-testid={`red-row-${entity.id}`}
      onClick={() => onOpen(entity)}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(var(--cream-rgb),0.03)',
        border: '1px solid rgba(var(--cream-rgb),0.07)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        cursor: 'pointer', transition: 'background 180ms, border-color 180ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.05)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.28)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.03)'; e.currentTarget.style.borderColor = 'rgba(var(--cream-rgb),0.07)'; }}
    >
      <Avatar src={entity.picture || entity.branding?.logo_url} name={name} type={entity.type} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>{name}</span>
          {tag && (
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'rgba(var(--cream-rgb),0.45)', fontFamily: 'DM Sans' }}>
              {tag}
            </span>
          )}
          {isAsesor && k.trust_score != null && <TrustMini score={k.trust_score} />}
          {entity.commission_pct != null && (
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700 }}>
              {entity.commission_pct}%
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.45)' }}>{subtitle}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <KpiCell label="Deals 12m" value={k.deals_closed_12m ?? 0} accent="#4ADE80" />
        <KpiCell label="Leads 30d" value={k.leads_referred_30d ?? 0} accent="#818CF8" />
        <KpiCell label="Conversión" value={`${k.conversion_pct ?? 0}%`} accent="#EC4899" />
        <KpiCell label="Última act." value={fmtRel(k.last_activity_at)} />
      </div>
      <ChevronRight size={14} color="rgba(var(--cream-rgb),0.30)" />
    </div>
  );
}

function Drawer({ entity, onClose }) {
  if (!entity) return null;
  const k = entity.kpi || {};
  const name = entity.name || entity.branding?.display_name || entity.id;
  return (
    <div data-testid="red-drawer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        width: '100%', maxWidth: 480, background: 'rgba(var(--bg-rgb),0.96)',
        borderLeft: '1px solid rgba(var(--cream-rgb),0.10)',
        padding: '28px 28px 80px', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Avatar src={entity.picture || entity.branding?.logo_url} name={name} type={entity.type} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>{name}</h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.50)', marginTop: 2 }}>
              {entity.email || entity.branding?.tagline || entity.id}
            </div>
          </div>
          <button onClick={onClose} data-testid="drawer-close"
            style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'rgba(var(--cream-rgb),0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 22 }}>
          {[
            ['Deals cerrados 12m', k.deals_closed_12m ?? 0, '#4ADE80', Award],
            ['Leads referidos 30d', k.leads_referred_30d ?? 0, '#818CF8', Users],
            ['Conversión', `${k.conversion_pct ?? 0}%`, '#EC4899', TrendingUp],
            ['Último deal', fmtRel(k.last_deal_at), 'var(--cream)', Calendar],
          ].map(([l, v, c, Ic]) => (
            <div key={l} style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid rgba(var(--cream-rgb),0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ic size={11} color={c} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{l}</span>
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {entity.notes && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notas</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(var(--cream-rgb),0.75)', lineHeight: 1.5 }}>{entity.notes}</div>
          </div>
        )}

        {(entity.assigned_projects || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Proyectos asignados</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {entity.assigned_projects.map(pid => (
                <span key={pid} style={{ padding: '3px 9px', borderRadius: 9999, fontSize: 11, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'rgba(var(--cream-rgb),0.65)', fontFamily: 'DM Sans' }}>{pid}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'inmobiliarias', label: 'Inmobiliarias aliadas', Icon: Building2 },
  { key: 'asesores_inhouse', label: 'Asesores in-house', Icon: Users },
  { key: 'asesores_freelance', label: 'Asesores freelance', Icon: Briefcase },
];

export default function DesarrolladorRedComercial({ user, onLogout }) {
  const [data, setData] = useState({ inmobiliarias: [], asesores_inhouse: [], asesores_freelance: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inmobiliarias');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [area, setArea] = useState('red');                 // V2: red | equipo | met-* | solicitudes | disputas
  const [ops, setOps] = useState({ solicitudes: 0, disputas: 0 });

  // IA-first · señales reales de operación de la red (acceso pendiente + disputas a arbitrar).
  useEffect(() => {
    if (!DEV_V2) return;
    Promise.allSettled([
      fetch(`${API}/api/dev/whitelist/pending`, { credentials: 'include' }).then(r => r.json()).then(d => d?.pending?.length ?? d?.count ?? 0).catch(() => 0),
      fetch(`${API}/api/dev/disputes/pending`, { credentials: 'include' }).then(r => r.json()).then(d => (typeof d?.count === 'number' ? d.count : (d?.pending?.length ?? 0))).catch(() => 0),
    ]).then(([s, d]) => setOps({ solicitudes: s.status === 'fulfilled' ? s.value : 0, disputas: d.status === 'fulfilled' ? d.value : 0 }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getDevRedComercial()); }
    catch { setData({ inmobiliarias: [], asesores_inhouse: [], asesores_freelance: [], totals: {} }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = data[tab] || [];
  const filtered = search
    ? items.filter(i => (i.name || i.branding?.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
                        (i.email || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      {/* IA-first · asistente de red: lo que requiere TU turno (acceso pendiente + arbitraje). */}
      {DEV_V2 && (ops.solicitudes > 0 || ops.disputas > 0) && (
        <div data-testid="red-assistant-strip" style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderLeft: '4px solid var(--warm, #E2982E)', borderRadius: 14, padding: '13px 16px', marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--theme)' }}>TU RED · TU TURNO</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ops.solicitudes > 0 && (
              <button onClick={() => setArea('solicitudes')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(226,152,46,0.25)', background: 'rgba(226,152,46,0.08)', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>
                🔓 {ops.solicitudes} solicitud{ops.solicitudes === 1 ? '' : 'es'} de acceso → revisar
              </button>
            )}
            {ops.disputas > 0 && (
              <button onClick={() => setArea('disputas')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(226,152,46,0.25)', background: 'rgba(226,152,46,0.08)', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>
                ⚖️ {ops.disputas} disputa{ops.disputas === 1 ? '' : 's'} por arbitrar → revisar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Salud de tu Red (IA-first · síntesis: concentración + quién cierra + acciones) */}
      {DEV_V2 && <DevRedSalud onVerAsesores={() => setArea('met-asesores')} />}

      {/* Switch de áreas (V2) — consolida las hojas de la red en un solo centro. */}
      {DEV_V2 && (
        <div data-testid="red-area-switcher" style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3, marginBottom: 20, flexWrap: 'wrap' }}>
          {RED_AREAS.map(([k, lbl]) => {
            const on = area === k;
            return (
              <button key={k} data-testid={`red-area-${k}`} onClick={() => setArea(k)}
                style={{ padding: '7px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: on ? 700 : 500 }}>
                {lbl}
              </button>
            );
          })}
          <span style={{ alignSelf: 'center', padding: '0 10px', fontSize: 11, color: 'var(--cream-3)' }}>Alianzas — en menú</span>
        </div>
      )}

      {/* Áreas embebidas (reusan las hojas sin doble layout · bare). */}
      {DEV_V2 && area === 'equipo' && <DesarrolladorUsuarios user={user} embedded />}
      {DEV_V2 && area === 'met-equipo' && <MetricasEquipo user={user} embedded />}
      {DEV_V2 && area === 'met-asesores' && <AsesoresMetrics user={user} embedded />}
      {DEV_V2 && area === 'solicitudes' && <DesarrolladorSolicitudes user={user} embedded />}
      {DEV_V2 && area === 'disputas' && <DesarrolladorDisputas user={user} embedded />}

      {/* ÁREA MI RED — el directorio (default · y único en V1) */}
      {(!DEV_V2 || area === 'red') && (
      <div data-testid="dev-red-comercial" style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Users size={20} color="#818CF8" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
              Red comercial
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(var(--cream-rgb),0.50)', margin: 0 }}>
            Inmobiliarias aliadas, equipo in-house y asesores freelance autorizados.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', overflowX: 'auto' }}>
          {TABS.map(({ key, label, Icon }) => {
            const count = data.totals?.[key] ?? (data[key] || []).length;
            return (
              <button key={key} data-testid={`red-tab-${key}`} onClick={() => setTab(key)}
                style={{
                  padding: '8px 14px', borderRadius: 9999, fontSize: 12.5,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: tab === key ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(var(--cream-rgb),0.10)',
                  background: tab === key ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: tab === key ? '#818CF8' : 'rgba(var(--cream-rgb),0.55)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Icon size={12} /> {label}
                <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(0,0,0,0.20)', color: 'inherit', fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
          <Search size={13} color="rgba(var(--cream-rgb),0.40)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input data-testid="red-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando red…</div>
        ) : filtered.length === 0 ? (
          <div data-testid="red-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans' }}>
            <Users size={38} color="rgba(var(--cream-rgb),0.18)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 5 }}>Sin entradas en esta vista</div>
            <div>Aún no hay {TABS.find(t => t.key === tab)?.label.toLowerCase() || 'datos'}.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => <Row key={`${e.type}-${e.id}-${e.partnership_id || e.auth_id || ''}`} entity={e} onOpen={setDrawer} />)}
          </div>
        )}
      </div>
      )}
      <Drawer entity={drawer} onClose={() => setDrawer(null)} />
    </DeveloperLayout>
  );
}
