// Phase 15 · Batch 38 — AsesorMisAliados
// Cards grid de developers aprobados con comisión + KPI personal
import React, { useEffect, useState, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Award, TrendingUp, Calendar, Clock, Layers, ChevronRight, Search, Store,
} from 'lucide-react';
import { getAsesorMisAliados } from '../../api/directories';

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

function CardKpi({ Icon, label, value, color }) {
  return (
    <div style={{ flex: '1 1 0', padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon size={10} color={color || 'rgba(240,235,224,0.40)'} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240,235,224,0.40)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: color || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

function AliadoCard({ aliado, onOpen, onVerInventario }) {
  const k = aliado.kpi || {};
  const branding = aliado.branding || {};
  return (
    <div data-testid={`aliado-card-${aliado.dev_org_id}`}
      style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, overflow: 'hidden', transition: 'border-color 220ms, transform 220ms',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
      }}
      onClick={() => onOpen(aliado)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11, flexShrink: 0,
          background: branding.logo_url ? `url(${branding.logo_url}) center/cover no-repeat` : 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(236,72,153,0.12))',
          border: '1px solid rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!branding.logo_url && <Building2 size={20} color="#818CF8" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', letterSpacing: '-0.02em', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {branding.display_name || aliado.dev_org_id}
          </div>
          {branding.tagline && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.50)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {branding.tagline}
            </div>
          )}
        </div>
        {aliado.commission_pct != null && (
          <span data-testid={`aliado-comm-${aliado.dev_org_id}`}
            style={{ padding: '4px 11px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {aliado.commission_pct}%
          </span>
        )}
      </div>

      {/* Inventory + auto-approved */}
      <div style={{ padding: '8px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans' }}>
          <Layers size={9} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {aliado.inventario_count || 0} proyectos
        </span>
        {aliado.auto_approved && (
          <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600 }}>
            Auto-aprobado
          </span>
        )}
      </div>

      {/* KPIs grid */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
        <CardKpi Icon={Award} label="Deals 12m" value={k.deals_closed_12m ?? 0} color="#4ADE80" />
        <CardKpi Icon={TrendingUp} label="Leads 30d" value={k.leads_referred_30d ?? 0} color="#818CF8" />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6 }}>
        <CardKpi Icon={Clock} label="Resp. avg" value={k.response_time_avg_hours != null ? `${k.response_time_avg_hours}h` : '—'} />
        <CardKpi Icon={Calendar} label="Último deal" value={fmtRel(k.last_deal_at)} />
      </div>

      {/* CTA */}
      <button data-testid={`ver-inv-${aliado.dev_org_id}`}
        onClick={e => { e.stopPropagation(); onVerInventario(aliado.dev_org_id); }}
        style={{
          margin: '0 16px 16px', padding: '9px 0', borderRadius: 9999,
          background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)',
          color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        Ver inventario <ChevronRight size={13} />
      </button>
    </div>
  );
}

function Drawer({ aliado, onClose, onVerInventario }) {
  if (!aliado) return null;
  const k = aliado.kpi || {};
  const b = aliado.branding || {};
  return (
    <div data-testid="aliado-drawer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1300, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(13,17,28,0.96)', borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '28px 28px 80px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 50, height: 50, borderRadius: 12, background: b.logo_url ? `url(${b.logo_url}) center/cover no-repeat` : 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(236,72,153,0.12))', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {!b.logo_url && <Building2 size={22} color="#818CF8" />}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>{b.display_name || aliado.dev_org_id}</h2>
            {b.tagline && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.50)', marginTop: 2 }}>{b.tagline}</div>}
          </div>
          {aliado.commission_pct != null && (
            <span style={{ padding: '5px 13px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13 }}>
              {aliado.commission_pct}%
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 22 }}>
          {[
            ['Deals 12m', k.deals_closed_12m ?? 0, '#4ADE80', Award],
            ['Leads 30d', k.leads_referred_30d ?? 0, '#818CF8', TrendingUp],
            ['Conversión', `${k.conversion_pct ?? 0}%`, '#EC4899', TrendingUp],
            ['Resp. avg', k.response_time_avg_hours != null ? `${k.response_time_avg_hours}h` : '—', 'var(--cream)', Clock],
            ['Último deal', fmtRel(k.last_deal_at), 'var(--cream)', Calendar],
            ['Trust score', k.trust_score ?? 0, 'var(--cream)', Award],
          ].map(([l, v, c, Ic]) => (
            <div key={l} style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Ic size={10} color={c} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{l}</span>
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Inventario disponible</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
            {aliado.inventario_count || 0} proyectos · Aprobado {fmtRel(aliado.approved_at)}
          </div>
        </div>

        <button onClick={() => onVerInventario(aliado.dev_org_id)} data-testid="drawer-ver-inv"
          style={{ width: '100%', padding: '11px 0', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Ver inventario completo <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function AsesorMisAliados({ user, onLogout }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [commFilter, setCommFilter] = useState(''); // '', 'lt5', '5to8', 'gte8'
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getAsesorMisAliados(); setItems(r.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleVerInventario = (devId) => navigate(`/asesor/inventario?dev=${devId}`);

  const filtered = items.filter(a => {
    if (search) {
      const q = search.toLowerCase();
      const name = (a.branding?.display_name || a.dev_org_id || '').toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (commFilter) {
      const c = a.commission_pct ?? 0;
      if (commFilter === 'lt5' && c >= 5) return false;
      if (commFilter === '5to8' && (c < 5 || c >= 8)) return false;
      if (commFilter === 'gte8' && c < 8) return false;
    }
    return true;
  });

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-mis-aliados" style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Building2 size={20} color="#818CF8" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
              Mis aliados
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0 }}>
            Desarrolladores con tu acceso a inventario aprobado y tu comisión negociada.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}>
            <Search size={13} color="rgba(240,235,224,0.40)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input data-testid="aliados-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar desarrollador…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['', 'Todas'], ['lt5', '<5%'], ['5to8', '5-8%'], ['gte8', '≥8%']].map(([k, l]) => (
              <button key={k || 'all'} data-testid={`comm-filter-${k || 'all'}`}
                onClick={() => setCommFilter(k)}
                style={{
                  padding: '7px 13px', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                  border: commFilter === k ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(255,255,255,0.10)',
                  background: commFilter === k ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: commFilter === k ? '#818CF8' : 'rgba(240,235,224,0.50)',
                }}>{l}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando aliados…</div>
        ) : filtered.length === 0 ? (
          <div data-testid="aliados-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans' }}>
            <Building2 size={40} color="rgba(240,235,224,0.20)" style={{ marginBottom: 14 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>Sin desarrolladores aliados aún</div>
            <div style={{ marginBottom: 16 }}>Solicita acceso al inventario de un desarrollador desde Mini Market.</div>
            <button onClick={() => navigate('/asesor/mini-market')} data-testid="aliados-go-market"
              style={{ padding: '9px 22px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Store size={13} /> Ir al Mini Market
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map(a => (
              <AliadoCard key={a.dev_org_id} aliado={a} onOpen={setDrawer} onVerInventario={handleVerInventario} />
            ))}
          </div>
        )}
      </div>
      <Drawer aliado={drawer} onClose={() => setDrawer(null)} onVerInventario={handleVerInventario} />
    </AdvisorLayout>
  );
}
