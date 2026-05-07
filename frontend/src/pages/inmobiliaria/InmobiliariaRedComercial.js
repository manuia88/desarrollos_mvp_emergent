// Phase 15 · Batch 38 — InmobiliariaRedComercial
// 4 tabs: Devs partners | Asesores in-house | Asesores freelance | Cross-inmobiliaria
import React, { useEffect, useState, useCallback } from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import {
  Users, Building2, Briefcase, Award, TrendingUp, Calendar,
  Search, ChevronRight, HeartHandshake,
} from 'lucide-react';
import { getInmobiliariaRedComercial } from '../../api/directories';

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
    <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: bg, color, border: `1px solid ${color}33` }}>
      Trust {score}
    </span>
  );
}

function KpiCell({ label, value, accent }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.42)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: accent || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

function Avatar({ src, name, type }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const grad = type === 'dev' || type === 'cross_inmobiliaria'
    ? 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(99,102,241,0.10))'
    : type === 'asesor_freelance'
      ? 'linear-gradient(135deg,rgba(236,72,153,0.22),rgba(236,72,153,0.10))'
      : 'linear-gradient(135deg,rgba(74,222,128,0.22),rgba(74,222,128,0.10))';
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: src ? `url(${src}) center/cover no-repeat` : grad,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(255,255,255,0.10)',
    }}>
      {!src && <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#818CF8' }}>{initial}</span>}
    </div>
  );
}

function Row({ entity, onOpen }) {
  const k = entity.kpi || {};
  const isAsesor = entity.type === 'asesor_inhouse' || entity.type === 'asesor_freelance';
  const name = entity.name || entity.branding?.display_name || entity.id;
  const subtitle = entity.email || entity.branding?.tagline || entity.role || '';
  const tag = entity.type === 'dev' ? 'Desarrollador'
    : entity.type === 'cross_inmobiliaria' ? 'Cross-inmobiliaria'
    : entity.type === 'asesor_freelance' ? 'Freelance'
    : entity.type === 'asesor_inhouse' ? 'In-house' : '';
  return (
    <div data-testid={`inm-red-row-${entity.id}`} onClick={() => onOpen(entity)}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        cursor: 'pointer', transition: 'background 180ms, border-color 180ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.28)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
    >
      <Avatar src={entity.picture || entity.branding?.logo_url} name={name} type={entity.type} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>{name}</span>
          {tag && (
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans' }}>
              {tag}
            </span>
          )}
          {isAsesor && k.trust_score != null && <TrustMini score={k.trust_score} />}
          {entity.commission_pct != null && (
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700 }}>
              {entity.commission_pct}%
            </span>
          )}
          {entity.branding?.ampi_verified && (
            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600 }}>
              AMPI
            </span>
          )}
        </div>
        {subtitle && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <KpiCell label="Deals 12m" value={k.deals_closed_12m ?? 0} accent="#4ADE80" />
        <KpiCell label="Leads 30d" value={k.leads_referred_30d ?? 0} accent="#818CF8" />
        <KpiCell label="Conversión" value={`${k.conversion_pct ?? 0}%`} accent="#EC4899" />
        <KpiCell label="Última act." value={fmtRel(k.last_activity_at)} />
      </div>
      <ChevronRight size={14} color="rgba(240,235,224,0.30)" />
    </div>
  );
}

function Drawer({ entity, onClose }) {
  if (!entity) return null;
  const k = entity.kpi || {};
  const name = entity.name || entity.branding?.display_name || entity.id;
  return (
    <div data-testid="inm-red-drawer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1300, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(13,17,28,0.96)', borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '28px 28px 80px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Avatar src={entity.picture || entity.branding?.logo_url} name={name} type={entity.type} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--cream)', margin: 0 }}>{name}</h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)', marginTop: 2 }}>
              {entity.email || entity.branding?.tagline || entity.id}
            </div>
          </div>
          <button onClick={onClose} data-testid="inm-drawer-close"
            style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 22 }}>
          {[
            ['Deals 12m', k.deals_closed_12m ?? 0, '#4ADE80', Award],
            ['Leads 30d', k.leads_referred_30d ?? 0, '#818CF8', Users],
            ['Conversión', `${k.conversion_pct ?? 0}%`, '#EC4899', TrendingUp],
            ['Última act.', fmtRel(k.last_activity_at), 'var(--cream)', Calendar],
          ].map(([l, v, c, Ic]) => (
            <div key={l} style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ic size={11} color={c} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{l}</span>
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {entity.notes && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notas</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', lineHeight: 1.5 }}>{entity.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'devs', label: 'Devs partners', Icon: Building2 },
  { key: 'asesores_inhouse', label: 'Asesores in-house', Icon: Users },
  { key: 'asesores_freelance', label: 'Asesores freelance', Icon: Briefcase },
  { key: 'cross_inmobiliaria', label: 'Cross-inmobiliaria', Icon: HeartHandshake },
];

export default function InmobiliariaRedComercial({ user, onLogout }) {
  const [data, setData] = useState({ devs: [], asesores_inhouse: [], asesores_freelance: [], cross_inmobiliaria: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('devs');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getInmobiliariaRedComercial()); }
    catch { setData({ devs: [], asesores_inhouse: [], asesores_freelance: [], cross_inmobiliaria: [], totals: {} }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = data[tab] || [];
  const filtered = search
    ? items.filter(i => (i.name || i.branding?.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
                        (i.email || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <InmobiliariaLayout user={user} onLogout={onLogout}>
      <div data-testid="inm-red-comercial" style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Users size={20} color="#818CF8" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Red comercial</h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0 }}>
            Desarrolladores aliados, equipo y asesores asociados, y partnerships cross-inmobiliaria.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', overflowX: 'auto' }}>
          {TABS.map(({ key, label, Icon }) => {
            const count = data.totals?.[key] ?? (data[key] || []).length;
            return (
              <button key={key} data-testid={`inm-red-tab-${key}`} onClick={() => setTab(key)}
                style={{
                  padding: '8px 14px', borderRadius: 9999, fontSize: 12.5,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: tab === key ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(255,255,255,0.10)',
                  background: tab === key ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: tab === key ? '#818CF8' : 'rgba(240,235,224,0.55)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Icon size={12} /> {label}
                <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(0,0,0,0.20)', color: 'inherit', fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
          <Search size={13} color="rgba(240,235,224,0.40)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input data-testid="inm-red-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando red…</div>
        ) : filtered.length === 0 ? (
          <div data-testid="inm-red-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans' }}>
            <Users size={38} color="rgba(240,235,224,0.18)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 5 }}>Sin entradas en esta vista</div>
            <div>Aún no hay {TABS.find(t => t.key === tab)?.label.toLowerCase() || 'datos'}.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => <Row key={`${e.type}-${e.id}-${e.partnership_id || e.rel_id || ''}`} entity={e} onOpen={setDrawer} />)}
          </div>
        )}
      </div>
      <Drawer entity={drawer} onClose={() => setDrawer(null)} />
    </InmobiliariaLayout>
  );
}
