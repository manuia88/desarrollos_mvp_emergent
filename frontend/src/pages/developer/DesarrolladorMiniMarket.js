// Phase 14 · Batch 37 — DesarrolladorMiniMarket
// Vista de inventario propio + cross-org partnerships (si allow_external_inventory)
import React, { useEffect, useState, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  Store, Building2, MapPin, DollarSign, ToggleLeft, ToggleRight, Layers,
} from 'lucide-react';
import { getDevMiniMarket, setDevExternalInventory } from '../../api/internal_users';
import { Z } from '../../styles/zIndex';

function fmtPrice(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const SOURCE_CFG = {
  own_org: { label: 'Mi organización', color: '#818CF8', bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.28)' },
  cross_partnership: { label: 'Alianza cruzada', color: '#EC4899', bg: 'rgba(236,72,153,0.10)', bd: 'rgba(236,72,153,0.28)' },
};

function SourceBadge({ source }) {
  const cfg = SOURCE_CFG[source] || SOURCE_CFG.own_org;
  return (
    <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function ProjectCard({ project }) {
  const cover = project.cover_image || project.images?.[0] || null;
  const devId = project.developer_id || project.dev_org_id;
  return (
    <div data-testid={`mm-project-${project.id}`}
      style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, overflow: 'hidden', transition: 'border-color 220ms, transform 220ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{
        height: 140, position: 'relative',
        background: cover ? `url(${cover}) center/cover no-repeat` : 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(236,72,153,0.15))',
      }}>
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <SourceBadge source={project.source} />
        </div>
      </div>
      <div style={{ padding: '13px 16px 16px' }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', margin: '0 0 5px', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {project.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <MapPin size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)' }}>
            {project.colonia || project.neighborhood}{project.ciudad ? `, ${project.ciudad}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <DollarSign size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)' }}>
            {fmtPrice(project.price_min)} — {fmtPrice(project.price_max)}
          </span>
        </div>
        {project.partner_org_id && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)', marginTop: 4 }}>
            Aliado: {project.partner_org_id}
          </div>
        )}
        <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.35)' }}>
          {devId}
        </div>
      </div>
    </div>
  );
}

export default function DesarrolladorMiniMarket({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [busyToggle, setBusyToggle] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [toast, setToast] = useState('');

  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getDevMiniMarket();
      setItems(r.items || []);
      // Detect if cross_partnership entries already exist → external is enabled
      const hasExternal = (r.items || []).some(p => p.source === 'cross_partnership');
      setExternalEnabled(hasExternal);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  const toggleExternal = async () => {
    if (!isAdmin) return;
    setBusyToggle(true);
    try {
      const newVal = !externalEnabled;
      await setDevExternalInventory(newVal);
      setExternalEnabled(newVal);
      setToast(newVal ? 'Inventario externo habilitado' : 'Inventario externo deshabilitado');
      load();
    } catch (e) {
      setToast(e.message || 'Error al actualizar');
    } finally { setBusyToggle(false); }
  };

  const filtered = filterSource ? items.filter(p => p.source === filterSource) : items;
  const ownCount = items.filter(p => p.source === 'own_org').length;
  const crossCount = items.filter(p => p.source === 'cross_partnership').length;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="desarrollador-mini-market" style={{ maxWidth: 1200 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#818CF8', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Store size={20} color="#818CF8" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
              Mini Market
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0 }}>
            Inventario disponible para tu equipo: proyectos propios y de organizaciones aliadas.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Propios</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: '#818CF8' }}>{ownCount}</div>
          </div>
          <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.22)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Cross-org</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: '#EC4899' }}>{crossCount}</div>
          </div>
          <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Total visible</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{items.length}</div>
          </div>
        </div>

        {/* Toggle external + filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (
            <button
              data-testid="toggle-external-inventory-btn"
              onClick={toggleExternal}
              disabled={busyToggle}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 9999,
                background: externalEnabled ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${externalEnabled ? 'rgba(74,222,128,0.32)' : 'rgba(255,255,255,0.10)'}`,
                color: externalEnabled ? '#4ADE80' : 'rgba(240,235,224,0.55)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: busyToggle ? 'wait' : 'pointer',
                opacity: busyToggle ? 0.6 : 1,
              }}
            >
              {externalEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              Inventario externo: {externalEnabled ? 'Activo' : 'Inactivo'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['', 'Todos'], ['own_org', 'Propios'], ['cross_partnership', 'Aliados']].map(([k, l]) => (
              <button key={k || 'all'}
                data-testid={`filter-mm-${k || 'all'}`}
                onClick={() => setFilterSource(k)}
                style={{
                  padding: '7px 13px', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                  border: filterSource === k ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(255,255,255,0.10)',
                  background: filterSource === k ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: filterSource === k ? '#818CF8' : 'rgba(240,235,224,0.50)',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando inventario…
          </div>
        ) : filtered.length === 0 ? (
          <div data-testid="mm-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans' }}>
            <Layers size={38} color="rgba(240,235,224,0.20)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 5 }}>
              Sin proyectos disponibles
            </div>
            <div>{isAdmin ? 'Activa el inventario externo para acceder a alianzas cruzadas.' : 'No hay proyectos asignados aún.'}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map(p => <ProjectCard key={`${p.id}-${p.source || 'own'}`} project={p} />)}
          </div>
        )}
      </div>
    </DeveloperLayout>
  );
}
