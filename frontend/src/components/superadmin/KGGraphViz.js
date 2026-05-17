/**
 * W5.12 Parte 2 — Tab Grafo: Cytoscape visualizacion del subgrafo.
 *
 * Seed (node_type + node_id) + depth (1-3) → GET /subgraph → render con layout cose.
 * Click nodo → panel lateral con props expandidas + links contextuales.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, Network, RefreshCw, RotateCcw, X } from 'lucide-react';
import { getKgSubgraph } from '../../api/knowledge_graph';

const cardStyle = {
  background: 'rgba(13,16,23,0.92)',
  backdropFilter: 'blur(24px)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  padding: '20px 22px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border, rgba(255,255,255,0.12))',
  color: 'var(--cream, #F0EBE0)',
  fontFamily: 'DM Sans',
  fontSize: 13,
  outline: 'none',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'DM Mono, monospace',
  fontSize: 10,
  color: 'var(--cream-3, rgba(240,235,224,0.55))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const NODE_TYPES = ['Project', 'Lead', 'DevOrg', 'Zone', 'Unit', 'Comparable', 'BehavioralSession', 'IEScore'];

const NODE_COLORS = {
  Project: '#7c2fff',
  Lead: '#22d3ee',
  DevOrg: '#c026d3',
  Zone: '#f59e0b',
  Unit: '#10b981',
  Comparable: '#94a3b8',
  BehavioralSession: '#ec4899',
  IEScore: '#a3e635',
  Unknown: '#9ca3af',
};

function PillBtn({ children, onClick, kind = 'ghost', disabled, testid }) {
  const palettes = {
    primary: { background: 'linear-gradient(90deg, var(--theme, #7c2fff), var(--theme-2, #c026d3))', color: '#fff', border: '1px solid transparent' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: 'var(--cream-2, #d6d2c4)', border: '1px solid var(--border, rgba(255,255,255,0.10))' },
  };
  const p = palettes[kind] || palettes.ghost;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...p,
      }}>
      {children}
    </button>
  );
}

function NodeDetailPanel({ node, onClose }) {
  if (!node) return null;
  const links = [];
  if (node.type === 'Lead') links.push({ label: 'Ver en CRM', href: `/desarrollador/crm?lead_id=${encodeURIComponent(node.id)}` });
  if (node.type === 'Project') links.push({ label: 'Ver desarrollo', href: `/desarrollos/${encodeURIComponent(node.id)}` });
  if (node.type === 'Zone') links.push({ label: 'Ver barrio', href: `/barrios/${encodeURIComponent(node.id)}` });
  return (
    <div data-testid="kg-node-panel" style={{
      position: 'absolute', top: 12, right: 12, width: 320, maxHeight: 'calc(100% - 24px)',
      overflowY: 'auto', zIndex: 5,
      background: 'rgba(13,16,23,0.97)', backdropFilter: 'blur(24px)',
      border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: 16,
      padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 9999, background: NODE_COLORS[node.type] || NODE_COLORS.Unknown }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2, #d6d2c4)', textTransform: 'uppercase' }}>{node.type}</span>
        </span>
        <button onClick={onClose} data-testid="node-panel-close" style={{ background: 'none', border: 'none', color: 'var(--cream-2)', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream, #F0EBE0)', marginBottom: 6 }}>
        {node.label}
      </div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#a5b4fc', marginBottom: 14 }}>
        {node.id}
      </div>
      {node.props && Object.keys(node.props).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Props</div>
          <table style={{ width: '100%', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
            <tbody>
              {Object.entries(node.props).slice(0, 30).map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '5px 0', color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>{k}</td>
                  <td style={{ padding: '5px 0', color: 'var(--cream-2, rgba(240,235,224,0.85))', textAlign: 'right', wordBreak: 'break-all' }}>
                    {v === null || v === undefined ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(l => (
            <a key={l.href} href={l.href} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9999,
              background: 'rgba(124,47,255,0.10)', border: '1px solid rgba(124,47,255,0.35)',
              color: '#c4b5fd', textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            }}>
              <ExternalLink size={11} /> {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KGGraphViz() {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [seedType, setSeedType] = useState('Project');
  const [seedId, setSeedId] = useState('');
  const [depth, setDepth] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  const handleVisualize = async () => {
    if (!seedId.trim()) {
      setError(t('knowledge_graph.errors.seed_required', 'Ingresa un ID de nodo seed'));
      return;
    }
    setError(null);
    setBusy(true);
    setNodes([]); setEdges([]); setTruncated(false);
    const r = await getKgSubgraph(seedId.trim(), depth, seedType);
    setBusy(false);
    if (r.status === 503) {
      setServiceUnavailable(true);
      setError(t('knowledge_graph.fallback_message', 'Knowledge Graph no disponible. Usando fallback relacional.'));
      return;
    }
    if (!r.ok) {
      setError(r.body?.detail || `Error ${r.status}`);
      return;
    }
    setServiceUnavailable(false);
    setNodes(r.body.nodes || []);
    setEdges(r.body.edges || []);
    setTruncated(!!r.body.truncated);
  };

  // Mount/update Cytoscape
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return undefined;
    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      if (cancelled) return;
      if (cyRef.current) { try { cyRef.current.destroy(); } catch (_) { /* noop */ } }
      const elements = [
        ...nodes.map(n => ({ data: { id: n.id, label: n.label || n.id, type: n.type, props: n.props || {} } })),
        ...edges.map(e => ({ data: { id: `${e.from}_${e.type}_${e.to}`, source: e.from, target: e.to, label: e.type } })),
      ];
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (ele) => NODE_COLORS[ele.data('type')] || NODE_COLORS.Unknown,
              'label': 'data(label)',
              'color': '#F0EBE0',
              'font-family': 'DM Sans',
              'font-size': 9,
              'text-margin-y': -6,
              'text-outline-width': 2,
              'text-outline-color': '#06080F',
              'width': 26, 'height': 26,
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color': 'rgba(240,235,224,0.30)',
              'target-arrow-color': 'rgba(240,235,224,0.50)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'label': 'data(label)',
              'font-family': 'DM Mono, monospace',
              'font-size': 7,
              'color': 'rgba(240,235,224,0.55)',
              'text-rotation': 'autorotate',
              'text-margin-y': -6,
              'width': 1,
            },
          },
          {
            selector: 'node:selected',
            style: { 'border-color': '#fff', 'border-width': 2 },
          },
        ],
        layout: { name: 'cose', animate: false, padding: 20, idealEdgeLength: 80 },
        wheelSensitivity: 0.2,
      });
      cyRef.current.on('tap', 'node', (evt) => {
        const data = evt.target.data();
        setSelectedNode({ id: data.id, label: data.label, type: data.type, props: data.props });
      });
      cyRef.current.on('tap', (evt) => {
        if (evt.target === cyRef.current) setSelectedNode(null);
      });
    })();
    return () => {
      cancelled = true;
      if (cyRef.current) { try { cyRef.current.destroy(); } catch (_) { /* noop */ } cyRef.current = null; }
    };
  }, [nodes, edges]);

  const handleResetView = () => {
    if (cyRef.current) {
      cyRef.current.fit();
      cyRef.current.center();
    }
  };

  return (
    <div data-testid="kg-tab-grafo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>{t('knowledge_graph.seed_type', 'Tipo de nodo seed')}</label>
            <select value={seedType} onChange={(e) => setSeedType(e.target.value)} style={inputStyle} data-testid="seed-type-select">
              {NODE_TYPES.map(nt => <option key={nt} value={nt}>{nt}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>{t('knowledge_graph.seed_id', 'ID del nodo seed')}</label>
            <input type="text" value={seedId} onChange={(e) => setSeedId(e.target.value)} placeholder="lead_xxx · project_xxx · ..." style={inputStyle} data-testid="seed-id-input" />
          </div>
          <div>
            <label style={labelStyle}>{t('knowledge_graph.depth', 'Profundidad')}: {depth}</label>
            <input type="range" min={1} max={3} value={depth} onChange={(e) => setDepth(parseInt(e.target.value, 10))} data-testid="depth-slider" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <PillBtn kind="primary" onClick={handleVisualize} disabled={busy} testid="visualize-btn">
            <Network size={11} /> {busy ? t('knowledge_graph.loading', 'Cargando...') : t('knowledge_graph.actions.visualizar', 'Visualizar')}
          </PillBtn>
          {nodes.length > 0 && (
            <PillBtn onClick={handleResetView} testid="reset-view-btn">
              <RotateCcw size={11} /> {t('knowledge_graph.actions.reset_view', 'Reset view')}
            </PillBtn>
          )}
          {nodes.length > 0 && (
            <span style={{ alignSelf: 'center', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
              {nodes.length} nodos · {edges.length} edges
            </span>
          )}
        </div>
      </div>

      {error && (
        <div data-testid="kg-graph-error" style={{
          ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)',
        }}>
          <AlertTriangle size={14} color="#fda4af" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, color: '#fecaca', lineHeight: 1.5 }}>{typeof error === 'string' ? error : JSON.stringify(error)}</div>
          {serviceUnavailable && (
            <PillBtn onClick={handleVisualize} testid="kg-graph-retry-btn">
              <RefreshCw size={11} /> Reintentar
            </PillBtn>
          )}
        </div>
      )}

      {truncated && (
        <div data-testid="kg-truncated-warning" style={{
          ...cardStyle, display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.30)',
        }}>
          <AlertTriangle size={14} color="#fcd34d" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fcd34d' }}>
            {t('knowledge_graph.truncated_warning', 'Resultado limitado a 200 nodos. Reduce la profundidad para ver el subgrafo completo.')}
          </span>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 0, position: 'relative', height: 580, overflow: 'hidden' }}>
        <div ref={containerRef} data-testid="kg-cytoscape-container" style={{ width: '100%', height: '100%' }} />
        {nodes.length === 0 && !busy && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
            <Network size={32} color="var(--cream-3, rgba(240,235,224,0.40))" />
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, rgba(240,235,224,0.55))', maxWidth: 360 }}>
              {t('knowledge_graph.empty_states.graph_initial', 'Selecciona un nodo seed y presiona Visualizar para ver el subgrafo.')}
            </div>
          </div>
        )}
        <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>
    </div>
  );
}
