/**
 * W4.18 — SuperadminDataSources
 * Panel debug 6 fuentes gov MX · stats + lookup manual + sync now.
 *
 * Strict design: rounded-full · gradient var(--theme)→var(--theme) · sin emojis ·
 * sin shadow-2xl · backdrop-blur(24px) · Outfit + DM Sans.
 */
import React, { useCallback, useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  Database, Map, AlertTriangle, FileText, Bus, MapPin,
  RefreshCw, Search, Loader2, AlertCircle, X,
} from 'lucide-react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

const SOURCES = [
  {
    key: 'banxico', label: 'Banxico SIE', Icon: Database,
    color: 'var(--theme)', cron: 'Diario 06:00',
    lookupParam: 'series_id',
    lookupLabel: 'Series ID (ej. SF43718)',
    lookupPath: '/api/superadmin/data-sources-gov-mx/banxico/lookup?series_id=',
    placeholder: 'SF43718',
  },
  {
    key: 'sigcdmx', label: 'SIGCDMX Uso de Suelo', Icon: Map,
    color: 'var(--theme)', cron: 'Mensual día 1 04:00',
    lookupParam: 'cuenta_catastral',
    lookupLabel: 'Cuenta catastral',
    lookupPath: '/api/superadmin/data-sources-gov-mx/sigcdmx/lookup?cuenta_catastral=',
    placeholder: '040-001-12-345',
  },
  {
    key: 'atlas_riesgos', label: 'Atlas Riesgos CDMX', Icon: AlertTriangle,
    color: '#F59E0B', cron: 'Anual 1 enero 05:00',
    lookupParam: 'ageb_id',
    lookupLabel: 'AGEB ID',
    lookupPath: '/api/superadmin/data-sources-gov-mx/atlas-riesgos/lookup?ageb_id=',
    placeholder: '0902100010001',
  },
  {
    key: 'catastro', label: 'Catastro CDMX', Icon: FileText,
    color: '#34D399', cron: 'Trimestral día 1 04:30',
    lookupParam: 'cuenta_catastral',
    lookupLabel: 'Cuenta catastral',
    lookupPath: '/api/superadmin/data-sources-gov-mx/catastro/lookup?cuenta_catastral=',
    placeholder: '040-001-12-345',
  },
  {
    key: 'gtfs', label: 'GTFS CDMX', Icon: Bus,
    color: '#38BDF8', cron: 'Mensual + diario afluencia',
    lookupParam: 'lat,lng',
    lookupLabel: 'lat,lng (ej. 19.4326,-99.1332)',
    lookupPath: '/api/superadmin/data-sources-gov-mx/gtfs/transit-accessibility?radius_m=500&',
    placeholder: '19.4326,-99.1332',
    coordsLookup: true,
  },
  {
    key: 'osm', label: 'OSM Geofabrik MX', Icon: MapPin,
    color: '#A78BFA', cron: 'Semanal lunes 02:30',
    lookupParam: 'lat,lng',
    lookupLabel: 'lat,lng (ej. 19.4326,-99.1332)',
    lookupPath: '/api/superadmin/data-sources-gov-mx/osm/amenities-radius?radius_m=500&',
    placeholder: '19.4326,-99.1332',
    coordsLookup: true,
  },
];

function fmtTs(t) {
  if (!t) return '—';
  const d = typeof t === 'string' ? t : (t.$date || t);
  if (!d) return '—';
  return String(d).slice(0, 19).replace('T', ' ');
}

function StatusPill({ ok, label }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
      background: ok ? 'rgba(52,211,153,0.10)' : 'rgba(245,158,11,0.10)',
      border: `1px solid ${ok ? 'rgba(52,211,153,0.35)' : 'rgba(245,158,11,0.35)'}`,
      color: ok ? '#4ADE80' : '#FBBF24',
      fontFamily: 'DM Sans', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{label}</span>
  );
}

function SourceCard({ source, stats, onLookup, onSync, syncing }) {
  const Icon = source.Icon;
  const totalRows = stats?.total_rows || stats?.total_stops || stats?.total_pois || 0;
  const lastSync = stats?.last_sync || {};
  const ok = lastSync.ok !== false;
  return (
    <div data-testid={`ds-card-${source.key}`} style={{
      padding: '16px 18px', borderRadius: 16,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 12,
          background: `${source.color}1A`,
          border: `1px solid ${source.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={source.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
            color: 'var(--cream)', letterSpacing: '-0.01em',
          }}>{source.label}</div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10.5,
            color: 'rgba(240, 235, 224, 0.70)', marginTop: 2,
          }}>Cron · {source.cron}</div>
        </div>
        <StatusPill ok={ok} label={ok ? 'OK' : 'Warn'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.4)', fontWeight: 700 }}>Cache</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
            {totalRows.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.4)', fontWeight: 700 }}>Last sync</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.7)' }}>
            {fmtTs(lastSync.started_at)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button
          data-testid={`ds-lookup-btn-${source.key}`}
          onClick={() => onLookup(source)}
          style={{
            flex: 1, padding: '8px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', cursor: 'pointer',
            fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        ><Search size={11} /> Lookup</button>
        <button
          data-testid={`ds-sync-btn-${source.key}`}
          onClick={() => onSync(source)}
          disabled={syncing}
          style={{
            flex: 1, padding: '8px 14px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            border: 'none', color: '#fff',
            cursor: syncing ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: syncing ? 0.5 : 1,
          }}
        >
          {syncing
            ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            : <RefreshCw size={11} />} Sync
        </button>
      </div>
    </div>
  );
}

function LookupModal({ source, onClose }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      let url;
      if (source.coordsLookup) {
        const [lat, lng] = query.split(',').map((s) => s.trim());
        if (!lat || !lng) {
          throw new Error('Formato: lat,lng');
        }
        url = `${source.lookupPath}lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
      } else {
        url = `${source.lookupPath}${encodeURIComponent(query.trim())}`;
      }
      const data = await apiFetch(url);
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div data-testid="ds-lookup-modal" style={{
      position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
      background: 'rgba(6,8,15,0.78)',
      backdropFilter: 'blur(24px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto',
        padding: '20px 22px', borderRadius: 18,
        background: 'rgba(15,18,30,0.95)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.4)', fontWeight: 700 }}>
              Lookup manual
            </div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', marginTop: 2 }}>
              {source.label}
            </div>
          </div>
          <button onClick={onClose} data-testid="ds-modal-close" style={{
            padding: 8, borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        <label style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.6)', fontWeight: 600 }}>
          {source.lookupLabel}
        </label>
        <input
          data-testid="ds-lookup-input"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={source.placeholder}
          style={{
            width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={submit} disabled={loading}
          data-testid="ds-lookup-submit"
          style={{
            marginTop: 10, padding: '10px 20px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            color: '#fff', border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={12} />}
          Consultar
        </button>

        {error && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 12,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {result && (
          <div data-testid="ds-lookup-result" style={{
            marginTop: 12, padding: 14, borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.4)', fontWeight: 700, marginBottom: 8 }}>
              Resultado
            </div>
            <pre style={{
              margin: 0, padding: 10, borderRadius: 8,
              background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11.5, color: 'rgba(240,235,224,0.85)',
              maxHeight: 300, overflow: 'auto',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SuperadminDataSources({ user, onLogout }) {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [error, setError] = useState('');
  const [lookupSource, setLookupSource] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await apiFetch('/api/superadmin/data-sources-gov-mx/stats');
      setStats(data.sources || {});
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async (source) => {
    setSyncing((s) => ({ ...s, [source.key]: true }));
    setToast('');
    try {
      await apiFetch(`/api/superadmin/data-sources-gov-mx/${source.key}/sync-now`, { method: 'POST' });
      setToast(`${source.label} sincronizada correctamente`);
      await load();
    } catch (e) {
      setToast(`Sync ${source.label}: ${e.message}`);
    } finally {
      setSyncing((s) => ({ ...s, [source.key]: false }));
      setTimeout(() => setToast(''), 4000);
    }
  };

  const totalRows = Object.values(stats).reduce(
    (acc, s) => acc + (s.total_rows || s.total_stops || s.total_pois || 0), 0,
  );
  const activeSources = Object.values(stats).filter(
    (s) => (s.total_rows || s.total_stops || s.total_pois || 0) > 0,
  ).length;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-data-sources" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240, 235, 224, 0.70)', fontWeight: 700, marginBottom: 6 }}>
            Data Sources gov MX
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '4px 0 6px' }}>
            6 fuentes oficiales · cache local resiliente
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.55)', maxWidth: 700 }}>
            Banxico SIE · SIGCDMX · Atlas Riesgos · Catastro · GTFS · OSM Geofabrik. Crons resilientes con fallback graceful y herencia automática a Atlax.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <KpiCard label="Fuentes activas" value={`${activeSources}/6`} />
          <KpiCard label="Filas en cache" value={totalRows.toLocaleString()} />
          <KpiCard label="Costo estimado" value="$0 USD" sub="Todas son gratis" />
          <KpiCard label="Crons activos" value="6+1" sub="Schedules MX-CDMX" />
        </div>

        {error && (
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 12, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>
            <AlertCircle size={13} style={{ marginRight: 6 }} />{error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(240, 235, 224, 0.70)', fontFamily: 'DM Sans' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando estadísticas…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {SOURCES.map((s) => (
              <SourceCard
                key={s.key} source={s}
                stats={stats[s.key] || {}}
                onLookup={(src) => setLookupSource(src)}
                onSync={triggerSync}
                syncing={!!syncing[s.key]}
              />
            ))}
          </div>
        )}

        {toast && (
          <div data-testid="ds-toast" style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: Z.DROPDOWN,
            padding: '12px 18px', borderRadius: 14,
            background: 'rgba(15,18,30,0.95)',
            border: '1px solid rgba(var(--theme-rgb),0.40)',
            backdropFilter: 'blur(24px)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
            maxWidth: 380,
          }}>{toast}</div>
        )}

        {lookupSource && (
          <LookupModal source={lookupSource} onClose={() => setLookupSource(null)} />
        )}

        <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      </div>
    </SuperadminLayout>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(240, 235, 224, 0.70)', marginBottom: 6, fontWeight: 700,
      }}>{label}</div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
