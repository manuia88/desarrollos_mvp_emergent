// W5.x F2 Sub-F — Superadmin RAG inspector
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { RefreshCw, Search, Database, Zap } from 'lucide-react';
import { getRagStats, queryRag, triggerRagReindex } from '../../api/superadmin_rag';

const SCOPE_OPTIONS = [
  { v: '', l: 'Todos' },
  { v: 'development', l: 'Desarrollos' },
  { v: 'colonia', l: 'Colonias' },
  { v: 'doc', l: 'Documentos' },
  { v: 'extraction', l: 'Extracciones' },
  { v: 'lead', l: 'Leads' },
  { v: 'activity', l: 'Activities' },
  { v: 'property_intake', l: 'Intakes' },
  { v: 'resale', l: 'Reventas' },
  { v: 'conversation', l: 'Conversaciones' },
  { v: 'external_banxico', l: 'Banxico' },
  { v: 'external_inegi', l: 'INEGI' },
  { v: 'external_atlas', l: 'Atlas riesgos' },
  { v: 'external_osm', l: 'OSM' },
  { v: 'external_gtfs', l: 'GTFS' },
];

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
    return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return String(ts); }
}

export default function SuperadminRagInspector() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsErr, setStatsErr] = useState('');

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const [reindexLoading, setReindexLoading] = useState(false);
  const [reindexMsg, setReindexMsg] = useState('');

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsErr('');
    try {
      const s = await getRagStats();
      setStats(s);
    } catch (e) {
      setStatsErr(e.message || 'Error al cargar stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const onSearch = async () => {
    if (!query || query.trim().length < 2) return;
    setSearchLoading(true);
    setSearchErr('');
    try {
      const body = { query: query.trim(), top_k: topK };
      if (scope) body.scope = scope;
      const res = await queryRag(body);
      setResults(res);
    } catch (e) {
      setSearchErr(e.message || 'Error en query');
      setResults(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const onReindex = async () => {
    setReindexLoading(true);
    setReindexMsg('');
    try {
      const r = await triggerRagReindex();
      setReindexMsg(
        r.ok
          ? `Reindex OK · ${r.total_chunks || 0} chunks · ${r.updated || 0} updated · ${r.tokens || 0} tokens`
          : (r.message || 'Reindex en progreso'),
      );
      loadStats();
    } catch (e) {
      setReindexMsg(`Error: ${e.message || 'reindex falló'}`);
    } finally {
      setReindexLoading(false);
    }
  };

  return (
    <SuperadminLayout title="RAG Inspector">
      <div style={{ padding: 18, maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', margin: 0 }}>
              <Database size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--theme)' }} />
              RAG Inspector
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', margin: '4px 0 0' }}>
              Vector store + búsqueda semántica · debug e índice manual
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="rag-stats-refresh" onClick={loadStats} disabled={statsLoading}
              style={{ padding: '7px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontSize: 12, cursor: statsLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={11} className={statsLoading ? 'animate-spin' : ''} /> Refresh stats
            </button>
            <button data-testid="rag-reindex-btn" onClick={onReindex} disabled={reindexLoading}
              style={{ padding: '7px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: reindexLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Zap size={12} /> {reindexLoading ? 'Reindexando…' : 'Trigger reindex'}
            </button>
          </div>
        </div>

        {reindexMsg && (
          <div data-testid="rag-reindex-msg" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.30)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 12 }}>
            {reindexMsg}
          </div>
        )}
        {statsErr && (
          <div data-testid="rag-stats-err" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 12 }}>
            {statsErr}
          </div>
        )}

        {/* Stats panel */}
        <div data-testid="rag-stats-panel" style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: 0 }}>Corpus</h3>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>Total: <strong style={{ color: 'var(--cream)' }}>{stats?.total_chunks ?? '—'}</strong></span>
              <span>Último chunk: {fmtTs(stats?.last_chunk_at)}</span>
              <span>Último reindex: {fmtTs(stats?.last_reindex_at)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {Object.entries(stats?.scopes || {}).map(([k, v]) => (
              <div key={k} data-testid={`rag-scope-${k}`} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>{k}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{v}</div>
              </div>
            ))}
            {Object.keys(stats?.scopes || {}).length === 0 && !statsLoading && (
              <div style={{ gridColumn: '1 / -1', padding: 14, textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
                Corpus vacío · ejecuta un reindex
              </div>
            )}
          </div>
        </div>

        {/* Query panel */}
        <div data-testid="rag-query-panel" style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 10px' }}>
            <Search size={13} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--theme)' }} />
            Búsqueda semántica (debug)
          </h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              data-testid="rag-query-input"
              type="text"
              placeholder="Consulta libre, ej. 'Polanco luxury escritura'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}
            />
            <select
              data-testid="rag-query-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12 }}
            >
              {SCOPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <input
              data-testid="rag-query-topk"
              type="number"
              min={1}
              max={30}
              value={topK}
              onChange={(e) => setTopK(Math.max(1, Math.min(30, parseInt(e.target.value || '10'))))}
              style={{ width: 60, padding: '8px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12, textAlign: 'center' }}
            />
            <button
              data-testid="rag-query-btn"
              onClick={onSearch}
              disabled={searchLoading || query.trim().length < 2}
              style={{ padding: '8px 18px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: searchLoading ? 'wait' : 'pointer' }}>
              {searchLoading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          {searchErr && (
            <div data-testid="rag-query-err" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 10 }}>
              {searchErr}
            </div>
          )}

          {results && (
            <div data-testid="rag-results" style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>
                {(results.results || []).length} resultados · corpus: {results.corpus_size ?? '—'} · filtrado: {results.filtered_size ?? '—'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(results.results || []).map((r, i) => (
                  <div key={r.chunk_id || i} data-testid={`rag-result-${i}`} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>
                        [{r.scope}] {r.chunk_id}
                      </span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: r.score > 0.6 ? '#4ADE80' : r.score > 0.4 ? '#FACC15' : 'rgba(240,235,224,0.55)' }}>
                        {(r.score ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>
                      <strong>{r.title || ''}</strong>{r.title ? ' · ' : ''}{r.snippet || ''}
                    </div>
                  </div>
                ))}
                {(results.results || []).length === 0 && (
                  <div style={{ padding: 14, textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
                    Sin resultados para esta query
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SuperadminLayout>
  );
}
