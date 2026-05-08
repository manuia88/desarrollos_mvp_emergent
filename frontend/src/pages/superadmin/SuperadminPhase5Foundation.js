// W3.1A Phase 5 Foundation — Superadmin control panel
// Route: /superadmin/phase5-foundation
// 3 tabs: DENUE | Costos de Construcción | Zone Scores
import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Activity, Database, TrendingUp, Search } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import {
  getDenueDensity, syncDenueZone, lookupBusiness,
  getConstructionCost, listZoneScores, getZoneScore,
} from '../../api/phase5Foundation';

const TABS = [
  { key: 'denue',        label: 'DENUE',              Icon: Database },
  { key: 'costos',       label: 'Costos Construcción', Icon: TrendingUp },
  { key: 'zone-scores',  label: 'Zone Scores',         Icon: Activity },
];

const LETTER_COLOR = {
  A: '#22C55E', B: '#84CC16', C: '#F59E0B',
  D: '#F97316', E: '#EF4444', F: '#DC2626',
};

const COLONIAS_MUESTRA = ['polanco', 'condesa', 'roma', 'santa_fe', 'napoles', 'iztapalapa'];

function fmtMXN(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
}

// ─── Tab DENUE ────────────────────────────────────────────────────────────────
function TabDenue() {
  const [zoneId,   setZoneId]   = useState('polanco');
  const [density,  setDensity]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [empresa,  setEmpresa]  = useState('');
  const [lookup,   setLookup]   = useState(null);

  const loadDensity = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try { setDensity(await getDenueDensity(zoneId)); }
    catch (e) { setDensity({ error: e.message }); }
    finally { setLoading(false); }
  }, [zoneId]);

  useEffect(() => { loadDensity(); }, [loadDensity]);

  const doSync = async () => {
    setSyncing(true);
    try { setDensity(await syncDenueZone(zoneId)); }
    catch (e) { setDensity({ error: e.message }); }
    finally { setSyncing(false); }
  };

  const doLookup = async () => {
    if (!empresa || empresa.length < 2) return;
    try {
      const res = await lookupBusiness(empresa);
      setLookup(res);
    } catch {}
  };

  const by = density?.by_category || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Zone selector + sync */}
      <Card style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          data-testid="denue-zone-input"
          value={zoneId}
          onChange={e => setZoneId(e.target.value)}
          placeholder="zone_id, ej: polanco"
          style={{
            flex: 1, minWidth: 160, padding: '7px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
          }}
        />
        <button
          data-testid="denue-load-btn"
          onClick={loadDensity}
          style={{ padding: '7px 18px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}
        >
          Cargar
        </button>
        <button
          data-testid="denue-sync-btn"
          onClick={doSync}
          disabled={syncing}
          style={{ padding: '7px 18px', borderRadius: 9999, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.32)', color: '#86efac', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={11} />
          {syncing ? 'Sincronizando…' : 'Sincronizar DENUE'}
        </button>
      </Card>

      {density?.error && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {density.error}</div>
      )}

      {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Cargando…</div>}

      {density && !density.error && !loading && (
        <Card data-testid="denue-density-card">
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                {density.zone_id}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                {density.last_synced?.slice(0, 16)?.replace('T', ' ')} UTC
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {density.businesses_count_total}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                negocios · {density.businesses_per_km2} /km²
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {Object.entries(by).map(([cat, count]) => (
              <div key={cat} style={{
                padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{cat}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{count}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Business lookup */}
      <Card>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream-2)', marginBottom: 10 }}>
          Búsqueda de empresas (enrichment de leads)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            data-testid="denue-empresa-input"
            value={empresa}
            onChange={e => setEmpresa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doLookup()}
            placeholder="Nombre empresa, ej: Oxxo"
            style={{
              flex: 1, padding: '7px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
            }}
          />
          <button
            data-testid="denue-lookup-btn"
            onClick={doLookup}
            style={{ padding: '7px 18px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}
          >
            <Search size={12} />
          </button>
        </div>
        {lookup?.results?.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lookup.results.slice(0, 10).map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{b.name}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>{b.scian} · {b.zone_id}</span>
              </div>
            ))}
          </div>
        )}
        {lookup?.results?.length === 0 && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>Sin resultados para "{empresa}"</div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab Costos ───────────────────────────────────────────────────────────────
function TabCostos() {
  const [zoneId, setZoneId] = useState('polanco');
  const [btype,  setBtype]  = useState('vertical');
  const [tier,   setTier]   = useState('luxury');
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getConstructionCost(zoneId, btype, tier)); }
    catch (e) { setData({ error: e.message }); }
    finally { setLoading(false); }
  }, [zoneId, btype, tier]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          data-testid="cost-zone-input"
          value={zoneId}
          onChange={e => setZoneId(e.target.value)}
          placeholder="zone_id"
          style={{ flex: 1, minWidth: 140, padding: '7px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13 }}
        />
        {['vertical', 'horizontal'].map(t => (
          <button key={t} onClick={() => setBtype(t)} data-testid={`sa-cost-type-${t}`}
            style={{ padding: '6px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 11,
              background: btype === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${btype === t ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: btype === t ? '#a5b4fc' : 'var(--cream-3)',
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
        {['entry', 'mid', 'luxury'].map(t => (
          <button key={t} onClick={() => setTier(t)} data-testid={`sa-cost-tier-${t}`}
            style={{ padding: '6px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 11,
              background: tier === t ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${tier === t ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: tier === t ? '#f9a8d4' : 'var(--cream-3)',
            }}>{t}</button>
        ))}
        <button onClick={load} data-testid="cost-load-btn"
          style={{ padding: '7px 16px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
          Calcular
        </button>
      </Card>

      {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Calculando…</div>}

      {data && !data.error && !loading && (
        <Card data-testid="cost-result-card">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Costo por m²</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.03em' }}>
                {fmtMXN(data.cost_per_m2_mxn)}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                Confianza: {data.confidence_pct}% · {data.zone_id} · {data.building_type} · {data.tier}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fuentes</div>
              {data.sources && Object.entries(data.sources).map(([k, v]) => (
                <div key={k} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-2)' }}>
                  {k.toUpperCase()}: {v}
                </div>
              ))}
              {(!data.sources || !Object.keys(data.sources).length) && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.3)' }}>Sin datos externos (tokens pendientes)</div>
              )}
            </div>
          </div>
          {data.stub_reason && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#fcd34d', marginTop: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
              {data.stub_reason}
            </div>
          )}
          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.25)', marginTop: 10 }}>
            {data.cache === 'hit' ? 'Resultado en caché' : 'Calculado ahora'} · {data.computed_at?.slice(0, 16)?.replace('T', ' ')} UTC
          </div>
        </Card>
      )}
      {data?.error && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {data.error}</div>
      )}
    </div>
  );
}

// ─── Tab Zone Scores ──────────────────────────────────────────────────────────
function TabZoneScores() {
  const [zones, setZones]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail,   setDetail]   = useState(null);
  const [tierFilter, setTier]   = useState('');
  const [recomputing, setRC]    = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const res = await listZoneScores(tierFilter, 50); setZones(res.zones || []); }
    catch {}
    finally { setLoading(false); }
  }, [tierFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = async (zone_id) => {
    setSelected(zone_id);
    setDetail(null);
    try { setDetail(await getZoneScore(zone_id)); }
    catch {}
  };

  const recompute = async () => {
    if (!selected) return;
    setRC(true);
    try { setDetail(await getZoneScore(selected, true)); }
    catch {}
    finally { setRC(false); }
  };

  const TIERS_F = ['', 'colonia', 'alcaldia', 'development'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters */}
      <Card style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Filtrar tier:</span>
        {TIERS_F.map(t => (
          <button key={t || 'all'} onClick={() => setTier(t)} data-testid={`score-tier-${t || 'all'}`}
            style={{ padding: '5px 12px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 11,
              background: tierFilter === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${tierFilter === t ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: tierFilter === t ? '#a5b4fc' : 'var(--cream-3)',
            }}>{t || 'Todos'}</button>
        ))}
        <button onClick={loadList} data-testid="score-refresh-btn"
          style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={10} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>Refrescar</span>
        </button>
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* List */}
        <Card style={{ flex: '1 1 280px' }}>
          {loading ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Cargando…</div>
          ) : zones.length === 0 ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
              Sin datos de zona. Ejecuta el cron o espera el próximo ciclo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {zones.map(z => (
                <button
                  key={z.zone_id}
                  data-testid={`score-row-${z.zone_id}`}
                  onClick={() => loadDetail(z.zone_id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    background: selected === z.zone_id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selected === z.zone_id ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                      {z.zone_name || z.zone_id}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)' }}>
                      {z.zone_id} · {z.tier}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: LETTER_COLOR[z.score_letter] || '#fff' }}>
                      {z.score_letter}
                    </span>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                      {z.score_numeric}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Detail */}
        {selected && (
          <Card data-testid="score-detail-card" style={{ flex: '1 1 260px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 3 }}>
                  {selected}
                </div>
                {detail && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: LETTER_COLOR[detail.score_letter], letterSpacing: '-0.03em' }}>
                      {detail.score_letter}
                    </span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream-2)' }}>
                      {detail.score_numeric}/100
                    </span>
                  </div>
                )}
              </div>
              <button
                data-testid="score-recompute-btn"
                onClick={recompute}
                disabled={recomputing}
                style={{ padding: '6px 14px', borderRadius: 9999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <RefreshCw size={10} />
                {recomputing ? 'Calculando…' : 'Recomputar'}
              </button>
            </div>

            {!detail && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Cargando…</div>}

            {detail?.components && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(detail.components).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>
                        {k.replace(/_/g, ' ')}
                        {detail.placeholder_flags?.[k] && (
                          <span style={{ marginLeft: 5, fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9999, padding: '1px 5px' }}>estimado</span>
                        )}
                      </span>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{Math.round(v)}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, v))}%`, background: '#6366F1', borderRadius: 9999, transition: 'width 500ms ease' }} />
                    </div>
                  </div>
                ))}
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.25)', marginTop: 4 }}>
                  Formula v{detail.formula_version} · {detail.computed_at?.slice(0, 16)?.replace('T', ' ')} UTC
                  {detail.cache === 'hit' ? ' · caché' : ' · calculado ahora'}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SuperadminPhase5Foundation({ user, onLogout }) {
  const [tab, setTab] = useState('denue');

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="phase5-foundation-page" style={{ padding: '24px 0', maxWidth: 1200, margin: '0 auto' }}>
        <PageHeader
          eyebrow="W3.1A · Phase 5 Foundation"
          title="Foundation Phase 5"
          sub="DENUE · Costos de Construcción · Zone Score A-F — alimenta DRPI, Investment Explorer y Risk Score multi-fuente."
        />

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 0 }}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              data-testid={`phase5-tab-${key}`}
              onClick={() => setTab(key)}
              style={{
                padding: '9px 18px', cursor: 'pointer',
                background: 'none', border: 'none',
                borderBottom: tab === key ? '2px solid #6366F1' : '2px solid transparent',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                color: tab === key ? '#a5b4fc' : 'var(--cream-3)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 180ms',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'denue'       && <TabDenue />}
        {tab === 'costos'      && <TabCostos />}
        {tab === 'zone-scores' && <TabZoneScores />}
      </div>
    </SuperadminLayout>
  );
}
