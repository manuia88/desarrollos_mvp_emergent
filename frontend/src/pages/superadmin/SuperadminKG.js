// Terminal de Relaciones (Knowledge Graph) — superadmin · surfacea el KG ya construido (Neo4j).
// Antes el KG estaba 100% poblado/consultable pero SIN UI. Aquí: stats + correr plantillas + resultados.
import React, { useEffect, useState, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dmx_token')}` });

async function jget(path) {
  const r = await fetch(`${API}${path}`, { headers: H(), credentials: 'include' });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; try { e.detail = (await r.json()).detail; } catch {} throw e; }
  return r.json();
}
async function jpost(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: H(), credentials: 'include', body: JSON.stringify(body || {}) });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; try { e.detail = (await r.json()).detail; } catch {} throw e; }
  return r.json();
}

const card = { background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 };
const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };

export default function SuperadminKG() {
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [params, setParams] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [s, t] = await Promise.all([jget('/api/superadmin/kg/stats'), jget('/api/superadmin/kg/templates')]);
      setStats(s); setTemplates(t.templates || []); setUnavailable(false);
    } catch (e) {
      if (e.status === 503) setUnavailable(true); else setErr(e.message);
    }
  }, []);
  useEffect(() => { document.title = 'Terminal de Relaciones · KG · DesarrollosMX'; load(); }, [load]);

  const runQuery = async () => {
    if (!sel) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const d = await jpost('/api/superadmin/kg/query', { template: sel.id || sel.name, params });
      setResult(d);
    } catch (e) { setErr(e.detail ? JSON.stringify(e.detail) : e.message); }
    setBusy(false);
  };

  const rebuild = async () => {
    setBusy(true); setErr(null);
    try { await jpost('/api/superadmin/kg/trigger-rebuild', {}); await load(); }
    catch (e) { setErr(e.detail ? JSON.stringify(e.detail) : e.message); }
    setBusy(false);
  };

  const nodes = stats?.nodes || {};
  const edges = stats?.edges || {};
  const totalNodes = Object.values(nodes).reduce((a, b) => a + (b || 0), 0);
  const totalEdges = Object.values(edges).reduce((a, b) => a + (b || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#06080F', color: '#F0EBE0', padding: '32px 28px', fontFamily: 'Inter, system-ui' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#a5b4fc', marginBottom: 6 }}>Superadmin · Knowledge Graph</div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Terminal de Relaciones</h1>
        <p style={{ color: 'rgba(240,235,224,0.55)', fontSize: 13.5, margin: '0 0 22px', maxWidth: 640 }}>
          El grafo conecta propiedades, compradores, asesores, zonas y proyectos. Pregunta relaciones que ningún
          dato suelto responde: proyectos similares, compradores que cruzan proyectos, desarrolladores que dominan una zona.
        </p>

        {unavailable && (
          <div style={{ ...card, borderColor: 'rgba(245,158,11,0.4)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Grafo no disponible</div>
            <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
              Neo4j no está conectado. Verifica que el servicio esté arriba y vuelve a cargar. (En local: contenedor <code style={mono}>dmx-neo4j</code>.)
            </div>
          </div>
        )}
        {err && <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)', marginBottom: 20, fontSize: 13 }}>{err}</div>}

        {!unavailable && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 22 }}>
              <div style={card}>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nodos (entidades)</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, marginTop: 4 }}>{totalNodes.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 6, ...mono }}>{Object.entries(nodes).map(([k, v]) => `${k}:${v}`).join('  ')}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Relaciones (edges)</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, marginTop: 4, color: totalEdges ? '#F0EBE0' : '#E2982E' }}>{totalEdges.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 6 }}>{totalEdges ? 'conexiones vivas' : 'aún sin relaciones — se llenan con uso/escala'}</div>
              </div>
              <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <button onClick={rebuild} disabled={busy} style={{ padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', border: 'none', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: 13 }}>
                  {busy ? 'Reconstruyendo…' : 'Reconstruir grafo'}
                </button>
                <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginTop: 8 }}>Re-extrae de la base operativa</div>
              </div>
            </div>

            {/* Query runner */}
            <div style={{ ...card, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Consultar relaciones</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {templates.map((t) => (
                  <button key={t.id || t.name} onClick={() => { setSel(t); setParams({}); setResult(null); }}
                    style={{
                      padding: '8px 12px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
                      background: (sel && (sel.id || sel.name) === (t.id || t.name)) ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0',
                    }}>
                    {t.name || t.id}
                  </button>
                ))}
                {!templates.length && <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>Sin plantillas registradas.</span>}
              </div>
              {sel && (
                <div>
                  <div style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.65)', marginBottom: 10 }}>{sel.description}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {(sel.required_params || sel.params || []).map((p) => {
                      const name = typeof p === 'string' ? p : (p.name || p.key);
                      return (
                        <input key={name} placeholder={name} value={params[name] || ''}
                          onChange={(e) => setParams((q) => ({ ...q, [name]: e.target.value }))}
                          style={{ padding: '8px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0EBE0', fontSize: 13, ...mono }} />
                      );
                    })}
                  </div>
                  <button onClick={runQuery} disabled={busy} style={{ padding: '9px 18px', borderRadius: 9, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: 13 }}>
                    {busy ? 'Consultando…' : 'Consultar'}
                  </button>
                </div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div style={card}>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 8 }}>
                  {(result.rows || result.results || []).length} resultado(s) · {result.from_cache ? 'cache' : 'fresco'}
                </div>
                <pre style={{ ...mono, fontSize: 12, color: '#a5b4fc', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 420, overflow: 'auto' }}>
                  {JSON.stringify(result.rows || result.results || result, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
