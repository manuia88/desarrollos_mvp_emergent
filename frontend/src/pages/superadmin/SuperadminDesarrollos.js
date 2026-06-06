/**
 * SuperadminDesarrollos (Dev-Master · Fase 0) — el superadmin ve TODOS los desarrollos de todos los
 * devs como un marketplace interno: catálogo con filtros + buscador → entra a la ficha completa.
 * Reusa /api/superadmin/devmaster/projects (filtros + facetas).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Search } from 'lucide-react';
import { fetchDevmasterProjects, ASSET_BASE } from '../../api/superadminDevmaster';
import DesarrollosPanorama from './DesarrollosPanorama';
import DondeConstruir from './DondeConstruir';
import GustoMercado from './GustoMercado';
import Comportamiento from './Comportamiento';
import StockSoldOut from './StockSoldOut';
import MacroCiudad from './MacroCiudad';
import CompetenciaRed from './CompetenciaRed';
import ObservabilidadIA from './ObservabilidadIA';

const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
const cap = (s) => s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : s;
const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const selStyle = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)', borderRadius: 10, padding: '8px 11px', fontSize: 12.5 };

function Card({ p, onClick }) {
  return (
    <button onClick={onClick} data-testid={`dm-card-${p.project_id}`} style={{
      textAlign: 'left', cursor: 'pointer', padding: 0, borderRadius: 14, overflow: 'hidden',
      background: 'var(--bg-card)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)',
    }}>
      <div style={{ height: 124, background: 'var(--bg-card-2)', position: 'relative' }}>
        {p.cover && <img src={p.cover.startsWith('/api') ? `${ASSET_BASE}${p.cover}` : p.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: p.readiness_pct >= 80 ? '#34D399' : (p.readiness_pct < 50 ? '#F2635B' : '#fff') }}>{p.readiness_pct}%</span>
        {p.publicado && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'rgba(52,211,153,0.85)', color: '#001a10' }}>PUBLICADO</span>}
      </div>
      <div style={{ padding: '11px 13px' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--sa-text)' }}>{p.nombre}</div>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 2 }}>{p.colonia || '—'}{p.stage ? ` · ${cap(p.stage)}` : ''} · desde {mxn(p.price_from)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
          <span style={{ ...dim }}>{p.dev_org || '—'}</span>
          <span style={{ ...mute }}>{p.leads_interes ? `${p.leads_interes} interesados` : ''}</span>
        </div>
      </div>
    </button>
  );
}

const vtab = (active) => ({
  padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  background: active ? 'var(--theme)' : 'var(--bg-card)', color: active ? 'var(--theme-text, #1a0009)' : 'var(--sa-text-dim)',
  border: '1px solid var(--sa-border)',
});

// Lente secundario (pill chico) dentro de "Inteligencia"
const ltab = (active) => ({
  padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  background: active ? 'rgba(var(--theme-rgb),0.16)' : 'transparent', color: active ? 'var(--theme)' : 'var(--sa-text-mute)',
  border: `1px solid ${active ? 'rgba(var(--theme-rgb),0.45)' : 'var(--sa-border)'}`,
});

// Las 7 lentes de inteligencia, agrupadas bajo "Inteligencia"
const LENSES = [
  { key: 'construir', label: 'Dónde Construir' },
  { key: 'gusto', label: 'Gusto del Mercado' },
  { key: 'comportamiento', label: 'Comportamiento' },
  { key: 'stock', label: 'Stock y Sold-Out' },
  { key: 'macro', label: 'Macro y Ciudad' },
  { key: 'competencia', label: 'Competencia y Red' },
  { key: 'ia', label: 'Cómo Aprende la IA' },
];

export default function SuperadminDesarrollos({ user, onLogout }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ zona: '', segmento: '', etapa: '', dev: '', publicado: '', q: '' });
  const [view, setView] = useState('panorama'); // panorama | inteligencia | catalogo
  const [lente, setLente] = useState('construir'); // lente activo dentro de Inteligencia
  const [facetas, setFacetas] = useState({});
  const verInteligencia = (k) => { setLente(k); setView('inteligencia'); };

  const load = useCallback(() => {
    setErr(null);
    fetchDevmasterProjects(f).then(r => { setD(r); setFacetas(r.facetas || {}); }).catch(e => setErr(e.message));
  }, [f]);
  useEffect(() => { if (view === 'catalogo') load(); }, [load, view]);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const fac = facetas;
  // Filtros del panorama (sin la búsqueda de texto, que es solo del catálogo).
  // useMemo: referencia estable salvo que un filtro cambie de verdad → evita loop de fetch en el hijo.
  const panoFilters = useMemo(
    () => ({ zona: f.zona, segmento: f.segmento, etapa: f.etapa, dev: f.dev }),
    [f.zona, f.segmento, f.etapa, f.dev]
  );

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--sa-text)', margin: 0, letterSpacing: '-0.02em' }}>Desarrollos</h1>
          <p style={{ fontSize: 13, ...dim, margin: '4px 0 0' }}>Todo el catálogo de todos los devs: el panorama del mercado y la ficha completa de cada uno.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('panorama')} style={vtab(view === 'panorama')} data-testid="view-panorama">Panorama</button>
          <button onClick={() => setView('inteligencia')} style={vtab(view === 'inteligencia')} data-testid="view-inteligencia">Inteligencia</button>
          <button onClick={() => setView('catalogo')} style={vtab(view === 'catalogo')} data-testid="view-catalogo">Catálogo</button>
        </div>
      </div>

      {/* Fila secundaria · lentes de Inteligencia */}
      {view === 'inteligencia' && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }} data-testid="lentes-row">
          {LENSES.map(l => (
            <button key={l.key} onClick={() => setLente(l.key)} style={ltab(lente === l.key)} data-testid={`lente-${l.key}`}>{l.label}</button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {view === 'catalogo' && (
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--sa-text-mute)' }} />
            <input value={f.q} onChange={e => set('q', e.target.value)} placeholder="Buscar proyecto, zona o dev…" data-testid="dm-search"
              style={{ ...selStyle, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} />
          </div>
        )}
        <select value={f.zona} onChange={e => set('zona', e.target.value)} style={selStyle} data-testid="dm-zona">
          <option value="">Zona: todas</option>
          {(fac.zonas || []).map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {(fac.segmentos || []).length > 0 && (
          <select value={f.segmento} onChange={e => set('segmento', e.target.value)} style={selStyle} data-testid="dm-seg">
            <option value="">Segmento: todos</option>
            {(fac.segmentos || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={f.etapa} onChange={e => set('etapa', e.target.value)} style={selStyle} data-testid="dm-etapa">
          <option value="">Etapa: todas</option>
          {(fac.etapas || []).map(s => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <select value={f.dev} onChange={e => set('dev', e.target.value)} style={selStyle} data-testid="dm-dev">
          <option value="">Dev: todos</option>
          {(fac.devs || []).map(dv => <option key={dv} value={dv}>{dv}</option>)}
        </select>
        <select value={f.publicado} onChange={e => set('publicado', e.target.value)} style={selStyle} data-testid="dm-pub">
          <option value="">Publicado: todos</option>
          <option value="true">Publicados</option>
          <option value="false">No publicados</option>
        </select>
      </div>

      {/* PANORAMA · home global */}
      {view === 'panorama' && <DesarrollosPanorama filters={panoFilters} onFacetas={setFacetas} onVerConstruir={() => verInteligencia('construir')} />}

      {/* INTELIGENCIA · 7 lentes agrupados (Fase 3) */}
      {view === 'inteligencia' && (
        <>
          {lente === 'construir' && <DondeConstruir filters={panoFilters} onPickZona={(z) => { set('zona', z); setView('catalogo'); }} />}
          {lente === 'gusto' && <GustoMercado filters={panoFilters} />}
          {lente === 'comportamiento' && <Comportamiento filters={panoFilters} />}
          {lente === 'stock' && <StockSoldOut filters={panoFilters} />}
          {lente === 'macro' && <MacroCiudad filters={panoFilters} />}
          {lente === 'competencia' && <CompetenciaRed filters={panoFilters} />}
          {lente === 'ia' && <ObservabilidadIA />}
        </>
      )}

      {/* CATÁLOGO · grid de proyectos */}
      {view === 'catalogo' && (
        <>
          {err && <div style={{ color: '#FCA5A5' }}>No se pudo cargar: {err}</div>}
          {!d && !err && <div style={mute}>Cargando desarrollos…</div>}
          {d && (
            <>
              <p style={{ fontSize: 12, ...mute, margin: '0 0 14px' }}>{d.total} de {d.total_catalogo} desarrollos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
                {(d.proyectos || []).map(p => <Card key={p.project_id} p={p} onClick={() => navigate(`/superadmin/desarrollos/${p.project_id}`)} />)}
              </div>
              {!d.proyectos.length && <div style={{ ...mute, padding: 30, textAlign: 'center' }}>Ningún desarrollo con esos filtros.</div>}
            </>
          )}
        </>
      )}
    </SuperadminLayout>
  );
}
