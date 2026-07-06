/**
 * SuperadminHubMercado — el HUB DE MERCADO (rebuild del cubo unificado · auditoría 6 niveles).
 *
 * Una sola casa para la inteligencia de mercado, reemplazando 7 pantallas fragmentadas. Renderiza DESDE el
 * contrato único (cube_catalog): Catálogo (todo lo que el cubo sabe, hipergranular con lineaje), Corte cruzado
 * (matriz OLAP), Actuar (demanda insatisfecha → brief al dev), y el drill a fondo (ciudad→unidad). El tema
 * oscuro del cubo, lenguaje humano, estados honestos. Ver [[CUBO_UNIFICADO_PLAN]].
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import CubeCatalogView from '../../components/superadmin/CubeCatalogView';
import CubeCrossCutView from '../../components/superadmin/CubeCrossCutView';
import CubeActuarView from '../../components/superadmin/CubeActuarView';
import CubeAtomView from '../../components/superadmin/CubeAtomView';
import CubeLicensableView from '../../components/superadmin/CubeLicensableView';
import CubeHistoriaView from '../../components/superadmin/CubeHistoriaView';
import CubeExploradorView from '../../components/superadmin/CubeExploradorView';
import { Database, LayoutGrid, Send, Layers, TrendingUp, Box, ShieldCheck, History, SlidersHorizontal } from 'lucide-react';
import { Z } from '../../styles/zIndex';

const PERIODS = [['current', 'Actual'], ['7d', '7d'], ['30d', '30d'], ['90d', '90d']];

const TABS = [
  ['explorador', 'Explorador', SlidersHorizontal],
  ['catalogo', 'Catálogo', Database],
  ['crosscut', 'Corte cruzado', LayoutGrid],
  ['historia', 'Historia', History],
  ['atomo', 'Átomo', Box],
  ['actuar', 'Actuar', Send],
  ['licenciable', 'Licenciable', ShieldCheck],
];

export default function SuperadminHubMercado({ user, onLogout }) {
  const [tab, setTab] = useState('explorador');
  const [drillUnit, setDrillUnit] = useState('');
  const [period, setPeriod] = useState('current');
  const [toast, setToast] = useState('');
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const tabBtn = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 11,
    background: active ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
    color: active ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  });

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-hub-mercado">
        {toast && (
          <div style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>{toast}</div>
        )}

        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <TrendingUp size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Hub de Mercado</h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.72)', margin: 0 }}>
              Todo el mercado en un lugar: qué hay, quién lo busca, cuánto rinde y qué hacer — desde la ciudad hasta cada unidad.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} style={{
                padding: '7px 14px', borderRadius: 9999,
                background: period === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${period === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                color: period === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Tabs + acceso al drill a fondo */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(([k, label, Icon]) => (
            <button key={k} data-testid={`hub-tab-${k}`} onClick={() => setTab(k)} style={tabBtn(tab === k)}>
              <Icon size={14} /> {label}
            </button>
          ))}
          <Link to="/superadmin/metrics-cube" data-testid="hub-drill-link"
            style={{ ...tabBtn(false), textDecoration: 'none', marginLeft: 'auto' }}>
            <Layers size={14} /> Explorar a fondo (ciudad → unidad) →
          </Link>
        </div>

        {tab === 'catalogo' && <CubeCatalogView />}
        {tab === 'crosscut' && <CubeCrossCutView period={period} />}
        {tab === 'explorador' && <CubeExploradorView onDrillUnit={(uid) => { setDrillUnit(uid); setTab('atomo'); }} />}
        {tab === 'historia' && <CubeHistoriaView />}
        {tab === 'atomo' && <CubeAtomView initialUnitId={drillUnit} />}
        {tab === 'actuar' && <CubeActuarView onToast={setToast} />}
        {tab === 'licenciable' && <CubeLicensableView period={period} />}
      </div>
    </SuperadminLayout>
  );
}
