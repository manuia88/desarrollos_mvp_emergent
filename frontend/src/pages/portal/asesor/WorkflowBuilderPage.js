// W6.AS.1 · Workflow Builder Visual · canvas page
// Implementación DOM/SVG (sin react-flow): paleta drag-drop · nodes posicionados
// absolutamente · edges SVG. Aurora design tokens.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createWorkflow, getWorkflow, updateWorkflow,
  toggleWorkflow, deleteWorkflow, testWorkflow, listWorkflows,
} from '../../../api/workflows';
import WorkflowNodeTrigger from '../../../components/workflow/WorkflowNodeTrigger';
import WorkflowNodeAction from '../../../components/workflow/WorkflowNodeAction';
import WorkflowNodeCondition from '../../../components/workflow/WorkflowNodeCondition';
import WorkflowTemplatesGallery from '../../../components/workflow/WorkflowTemplatesGallery';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const GRAY = '#6B7280';
const BORDER = '1px solid rgba(240,235,224,0.10)';

const NODE_W = { trigger: 220, action: 240, condition: 240, delay: 200 };
const NODE_H = 90;

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultNode(type, position) {
  if (type === 'trigger')
    return { id: uid('t'), type, position, config: { trigger_type: 'lead.new' } };
  if (type === 'action')
    return { id: uid('a'), type, position, config: { action_type: 'send_whatsapp', params: {} } };
  if (type === 'condition')
    return { id: uid('c'), type, position, config: { field: 'zone', op: 'eq', value: '' } };
  if (type === 'delay')
    return { id: uid('d'), type, position, config: { unit: 'hours', amount: 24 } };
  return null;
}

function DelayNode({ node, selected, onChange, onSelect }) {
  const { t } = useTranslation('common');
  const cfg = node.config || {};
  const update = (patch) => onChange && onChange({ ...node, config: { ...cfg, ...patch } });
  return (
    <div
      data-testid={`wf-node-delay-${node.id}`}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(node.id); }}
      style={{
        width: NODE_W.delay,
        background: 'rgba(107,114,128,0.10)',
        border: `1px solid ${selected ? GRAY : 'rgba(107,114,128,0.35)'}`,
        borderRadius: 9999,
        padding: '14px 18px', color: CREAM, fontFamily: 'DM Sans, sans-serif',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        color: GRAY, textTransform: 'uppercase', marginBottom: 4,
      }}>
        {t('workflows.palette_delay')}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="number"
          min={0}
          max={9999}
          value={cfg.amount ?? 24}
          onChange={(e) => update({ amount: Number(e.target.value) })}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 60, background: 'rgba(240,235,224,0.05)', border: '1px solid rgba(240,235,224,0.10)', borderRadius: 8, padding: '6px 8px', color: CREAM, fontSize: 12, outline: 'none' }}
        />
        <select
          value={cfg.unit || 'hours'}
          onChange={(e) => update({ unit: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, background: 'rgba(240,235,224,0.05)', border: '1px solid rgba(240,235,224,0.10)', borderRadius: 8, padding: '6px 8px', color: CREAM, fontSize: 12, outline: 'none', appearance: 'none', cursor: 'pointer' }}
        >
          <option value="minutes" style={{ background: '#0D1017' }}>{t('workflows.unit_minutes')}</option>
          <option value="hours"   style={{ background: '#0D1017' }}>{t('workflows.unit_hours')}</option>
          <option value="days"    style={{ background: '#0D1017' }}>{t('workflows.unit_days')}</option>
        </select>
      </div>
    </div>
  );
}

// ─── Canvas page ──────────────────────────────────────────────────────────────

function WorkflowBuilderPageBody() {
  const { t } = useTranslation('common');
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const isNew = !workflowId || workflowId === 'new';

  const [name, setName] = useState('Nuevo workflow');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [pendingEdgeSource, setPendingEdgeSource] = useState(null);
  const [pendingBranch, setPendingBranch] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentId, setCurrentId] = useState(isNew ? null : workflowId);
  const [capInfo, setCapInfo] = useState(null);
  const canvasRef = useRef(null);

  // Carga workflow existente
  useEffect(() => {
    let mounted = true;
    if (isNew) {
      // Auto open gallery si user nuevo
      listWorkflows().then((r) => {
        if (!mounted) return;
        setCapInfo({ count: r.count, cap: r.cap });
        if (r.count === 0) setGalleryOpen(true);
      }).catch(() => {});
      return () => { mounted = false; };
    }
    getWorkflow(workflowId).then((doc) => {
      if (!mounted) return;
      setName(doc.name || 'Workflow');
      setDescription(doc.description || '');
      setStatus(doc.status || 'draft');
      setNodes(doc.nodes || []);
      setEdges(doc.edges || []);
      setCurrentId(doc.id);
    }).catch((e) => {
      if (mounted) setError(t('workflows.error_load'));
    });
    return () => { mounted = false; };
  }, [workflowId, isNew, t]);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setFeedback(null); }
    else { setFeedback(msg); setError(null); }
    setTimeout(() => { setFeedback(null); setError(null); }, 3500);
  };

  // Paleta: agregar node nuevo en posición libre
  const addNode = useCallback((type) => {
    const offsetX = 80 + (nodes.length % 5) * 60;
    const offsetY = 80 + Math.floor(nodes.length / 5) * 60;
    const n = defaultNode(type, { x: offsetX, y: offsetY });
    if (!n) return;
    if (type === 'trigger' && nodes.some((nn) => nn.type === 'trigger')) {
      flash(t('workflows.validation_no_trigger'), true);
      return;
    }
    if (nodes.length >= 50) {
      flash(t('workflows.validation_max_nodes'), true);
      return;
    }
    setNodes((prev) => [...prev, n]);
    setSelectedNodeId(n.id);
  }, [nodes, t]);

  const updateNode = useCallback((updated) => {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const startConnect = (sourceId, branch = null) => {
    setPendingEdgeSource(sourceId);
    setPendingBranch(branch);
  };
  const finishConnect = (targetId) => {
    if (!pendingEdgeSource || pendingEdgeSource === targetId) {
      setPendingEdgeSource(null); setPendingBranch(null); return;
    }
    setEdges((prev) => ([
      ...prev.filter((e) => !(e.source === pendingEdgeSource && e.target === targetId && (e.branch || null) === (pendingBranch || null))),
      { source: pendingEdgeSource, target: targetId, branch: pendingBranch || undefined },
    ]));
    setPendingEdgeSource(null); setPendingBranch(null);
  };

  // Drag node positions
  const onPointerMove = useCallback((e) => {
    if (!draggingNodeId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;
    setNodes((prev) => prev.map((n) => n.id === draggingNodeId ? ({ ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } }) : n));
  }, [draggingNodeId, dragOffset]);
  const onPointerUp = useCallback(() => setDraggingNodeId(null), []);

  // Save / activate / test / delete
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { name, description, nodes, edges, status };
      if (!currentId) {
        const r = await createWorkflow(payload);
        setCurrentId(r.id);
        navigate(`/portal/asesor/workflows/${r.id}`, { replace: true });
        flash(t('workflows.save_success'));
      } else {
        await updateWorkflow(currentId, { name, description, nodes, edges });
        flash(t('workflows.save_success'));
      }
    } catch (e) {
      flash(`${t('workflows.save_error')}: ${e.message || e}`, true);
    } finally { setSaving(false); }
  };

  const handleToggle = async () => {
    if (!currentId) { flash(t('workflows.save_error'), true); return; }
    try {
      const r = await toggleWorkflow(currentId);
      setStatus(r.status);
      flash(`${t('workflows.status')}: ${r.status}`);
    } catch (e) { flash(`${t('workflows.error_invalid_workflow')}: ${e.message || e}`, true); }
  };

  const handleTest = async () => {
    if (!currentId) { await handleSave(); }
    if (!currentId) return;
    setTesting(true);
    try {
      const r = await testWorkflow(currentId, {});
      flash(`${t('workflows.test_success')} · ${r.steps?.length || 0} pasos`);
    } catch (e) {
      flash(`${t('workflows.test_error')}: ${e.message || e}`, true);
    } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    if (!currentId) { navigate('/portal/asesor/workflows'); return; }
    if (!window.confirm(t('workflows.delete_confirm'))) return;
    try {
      await deleteWorkflow(currentId);
      navigate('/portal/asesor/workflows');
    } catch (e) { flash(`${t('workflows.error_invalid_workflow')}: ${e.message || e}`, true); }
  };

  const loadTemplate = (tpl) => {
    setName(tpl.name);
    setDescription(tpl.description || '');
    setNodes(tpl.nodes);
    setEdges(tpl.edges);
    setStatus('draft');
    flash(`Plantilla cargada · ${tpl.nodes.length} nodos`);
  };

  // Edge anchor helpers
  const nodeAnchor = (n, side = 'out') => {
    const w = NODE_W[n.type] || 220;
    return {
      x: (n.position?.x || 0) + (side === 'out' ? w : 0),
      y: (n.position?.y || 0) + NODE_H / 2,
    };
  };

  const renderNode = (n) => {
    const selected = selectedNodeId === n.id;
    const pointerDown = (e) => {
      // Solo arrastrar si click directo en el wrapper (no en inputs)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const rect = canvasRef.current.getBoundingClientRect();
      setDraggingNodeId(n.id);
      setDragOffset({
        x: e.clientX - rect.left - (n.position?.x || 0),
        y: e.clientY - rect.top - (n.position?.y || 0),
      });
    };
    return (
      <div
        key={n.id}
        onPointerDown={pointerDown}
        style={{
          position: 'absolute', left: n.position?.x || 0, top: n.position?.y || 0,
          touchAction: 'none',
        }}
      >
        {n.type === 'trigger' && (
          <WorkflowNodeTrigger node={n} selected={selected} onChange={updateNode} onSelect={setSelectedNodeId} />
        )}
        {n.type === 'action' && (
          <WorkflowNodeAction node={n} selected={selected} onChange={updateNode} onSelect={setSelectedNodeId} />
        )}
        {n.type === 'condition' && (
          <WorkflowNodeCondition node={n} selected={selected} onChange={updateNode} onSelect={setSelectedNodeId} />
        )}
        {n.type === 'delay' && (
          <DelayNode node={n} selected={selected} onChange={updateNode} onSelect={setSelectedNodeId} />
        )}
        {/* Connect handles */}
        <div style={{ position: 'absolute', top: -8, right: -8, display: 'flex', gap: 4 }}>
          {n.type === 'condition' ? (
            <>
              <button type="button" title="if true" onClick={() => startConnect(n.id, 'true')} style={handleStyle('#10B981')}>✓</button>
              <button type="button" title="if false" onClick={() => startConnect(n.id, 'false')} style={handleStyle('#EF4444')}>✕</button>
            </>
          ) : (
            n.type !== 'action' || true ? (
              <button type="button" title="connect →" onClick={() => startConnect(n.id, null)} style={handleStyle(INDIGO)}>→</button>
            ) : null
          )}
        </div>
        {pendingEdgeSource && pendingEdgeSource !== n.id && (
          <button
            type="button"
            onClick={() => finishConnect(n.id)}
            style={{
              position: 'absolute', top: -8, left: -8,
              ...handleStyle('#F59E0B'),
            }}
          >●</button>
        )}
      </div>
    );
  };

  const renderEdges = () => (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {edges.map((e, idx) => {
        const src = nodes.find((n) => n.id === e.source);
        const tgt = nodes.find((n) => n.id === e.target);
        if (!src || !tgt) return null;
        const a = nodeAnchor(src, 'out');
        const b = nodeAnchor(tgt, 'in');
        const mx = (a.x + b.x) / 2;
        const color = e.branch === 'false' ? '#EF4444' : e.branch === 'true' ? '#10B981' : INDIGO;
        return (
          <g key={idx}>
            <path
              d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
              stroke={color}
              strokeWidth={2}
              fill="none"
              opacity={0.75}
            />
            <circle cx={b.x} cy={b.y} r={3} fill={color} />
          </g>
        );
      })}
    </svg>
  );

  return (
    <div
      style={{
        minHeight: '100vh', background: BG, color: CREAM,
        fontFamily: 'DM Sans, sans-serif',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Toolbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(6,8,15,0.94)', backdropFilter: 'blur(8px)',
        borderBottom: BORDER, padding: '14px 22px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workflows.name')}
          style={{
            flex: 1, background: 'transparent', color: CREAM,
            border: 'none', outline: 'none', fontSize: 18, fontWeight: 700,
          }}
        />
        <span style={pillStyle(status === 'active' ? '#10B981' : 'rgba(240,235,224,0.6)')}>
          {status === 'active'
            ? t('workflows.status_active')
            : status === 'paused'
              ? t('workflows.status_paused')
              : t('workflows.status_draft')}
        </span>
        <button data-testid="wf-toolbar-templates" type="button" onClick={() => setGalleryOpen(true)} style={btnStyle('ghost')}>
          {t('workflows.templates_button')}
        </button>
        <button data-testid="wf-toolbar-test" type="button" onClick={handleTest} disabled={testing} style={btnStyle('ghost')}>
          {testing ? t('workflows.testing') : t('workflows.test')}
        </button>
        <button data-testid="wf-toolbar-toggle" type="button" onClick={handleToggle} style={btnStyle('ghost')}>
          {status === 'active' ? t('workflows.deactivate') : t('workflows.activate')}
        </button>
        <button data-testid="wf-toolbar-save" type="button" onClick={handleSave} disabled={saving} style={btnStyle('primary')}>
          {saving ? t('workflows.saving') : t('workflows.save')}
        </button>
        {currentId && (
          <button data-testid="wf-toolbar-history" type="button" onClick={() => navigate(`/portal/asesor/workflows/${currentId}/history`)} style={btnStyle('ghost')}>
            {t('workflows.history')}
          </button>
        )}
        <button data-testid="wf-toolbar-delete" type="button" onClick={handleDelete} style={btnStyle('ghost')}>
          {t('workflows.delete')}
        </button>
      </div>

      {feedback && <div style={feedbackStyle('#10B981')}>{feedback}</div>}
      {error && <div style={feedbackStyle('#EF4444')}>{error}</div>}

      {/* Layout: palette + canvas */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 70px)' }}>
        {/* Palette */}
        <aside style={{
          width: 220, padding: 22, borderRight: BORDER,
          background: 'rgba(13,16,23,0.6)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.55)' }}>
            {t('workflows.palette_title')}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(240,235,224,0.45)', marginTop: 6 }}>
            {t('workflows.palette_drag_hint')}
          </p>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <button data-testid="wf-palette-trigger" type="button" onClick={() => addNode('trigger')} style={paletteBtn('#10B981')}>
              {t('workflows.palette_trigger')}
            </button>
            <button data-testid="wf-palette-action" type="button" onClick={() => addNode('action')} style={paletteBtn(INDIGO)}>
              {t('workflows.palette_action')}
            </button>
            <button data-testid="wf-palette-condition" type="button" onClick={() => addNode('condition')} style={paletteBtn('#F59E0B')}>
              {t('workflows.palette_condition')}
            </button>
            <button data-testid="wf-palette-delay" type="button" onClick={() => addNode('delay')} style={paletteBtn(GRAY)}>
              {t('workflows.palette_delay')}
            </button>
          </div>
          {selectedNodeId && (
            <button data-testid="wf-delete-node" type="button" onClick={deleteSelectedNode} style={{ ...paletteBtn('#EF4444'), marginTop: 22 }}>
              {t('workflows.delete')}
            </button>
          )}
          {capInfo && (
            <div style={{ marginTop: 22, fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>
              {capInfo.count}/{capInfo.cap}
            </div>
          )}
        </aside>

        {/* Canvas */}
        <main
          ref={canvasRef}
          data-testid="wf-canvas"
          onClick={() => { setSelectedNodeId(null); setPendingEdgeSource(null); }}
          style={{
            flex: 1, position: 'relative',
            background:
              'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.06), transparent 60%),' +
              'radial-gradient(circle at 80% 80%, rgba(245,158,11,0.05), transparent 60%)',
            overflow: 'auto', minHeight: 600,
          }}
        >
          {renderEdges()}
          {nodes.map(renderNode)}
          {nodes.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'rgba(240,235,224,0.45)', fontSize: 14, textAlign: 'center', padding: 20,
            }}>
              {t('workflows.empty')}
            </div>
          )}
        </main>
      </div>

      <WorkflowTemplatesGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={loadTemplate}
      />
    </div>
  );
}

function btnStyle(variant) {
  if (variant === 'primary') {
    return {
      background: INDIGO, color: '#fff', border: 'none',
      padding: '8px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 12,
      cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
    };
  }
  return {
    background: 'transparent', color: CREAM,
    border: '1px solid rgba(240,235,224,0.18)', borderRadius: 9999,
    padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };
}
function paletteBtn(color) {
  return {
    background: `${color}1a`,
    border: `1px solid ${color}55`,
    color: CREAM, padding: '10px 14px', borderRadius: 9999,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
  };
}
function pillStyle(color) {
  return {
    padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.06em', color, border: `1px solid ${color}55`,
    textTransform: 'uppercase',
  };
}
function handleStyle(color) {
  return {
    width: 22, height: 22, borderRadius: 9999, border: 'none',
    background: color, color: '#fff', fontSize: 11, fontWeight: 700,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', padding: 0,
  };
}
function feedbackStyle(color) {
  return {
    margin: '12px 22px 0', padding: '10px 14px',
    background: `${color}1a`, border: `1px solid ${color}55`,
    borderRadius: 12, color, fontSize: 13, fontWeight: 600,
  };
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function WorkflowBuilderPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <WorkflowBuilderPageBody {...props} />
    </PortalLayout>
  );
}
