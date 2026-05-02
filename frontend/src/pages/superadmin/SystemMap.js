/**
 * Phase 4 Batch 0.5 Sub-chunk C — SystemMap page
 * /superadmin/system-map — visual graph of modules health + recurrence + per-org.
 */
import React, { useState, useEffect } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getSystemMap, getProbeRecurrence, getPerOrgDashboard } from '../../api/diagnostic';
import { KPIStrip } from '../../components/shared/KPIStrip';
import { Activity } from '../../components/icons';

const HEALTH_COLOR = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

// Simple radial layout — modules as circles around the center.
function SystemGraph({ nodes, edges, onNodeClick }) {
  const W = 720, H = 440, CX = W / 2, CY = H / 2;
  const R = 170;
  const positions = {};
  nodes.forEach((n, i) => {
    const theta = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    positions[n.id] = {
      x: CX + R * Math.cos(theta),
      y: CY + R * Math.sin(theta),
      node: n,
    };
  });
  const radiusFor = (node) => 18 + Math.min(14, (node.probe_count || 1) * 1.4);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Center */}
      <circle cx={CX} cy={CY} r={10} fill="rgba(240,235,224,0.2)" />
      <text x={CX} y={CY + 3} textAnchor="middle" fontSize="9" fill="var(--cream-3)">core</text>

      {/* Edges */}
      {edges.map((e, i) => {
        const a = positions[e.from], b = positions[e.to];
        if (!a || !b) return null;
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="rgba(240,235,224,0.12)" strokeWidth="1" strokeDasharray="3 3" />
        );
      })}

      {/* Nodes */}
      {Object.values(positions).map(({ x, y, node }) => {
        const r = radiusFor(node);
        const color = HEALTH_COLOR[node.health] || HEALTH_COLOR.green;
        return (
          <g key={node.id} style={{ cursor: 'pointer' }}
            onClick={() => onNodeClick?.(node)}
            data-testid={`syscog-node-${node.id}`}
          >
            <circle cx={x} cy={y} r={r}
              fill={`${color}22`} stroke={color} strokeWidth="2" />
            <text x={x} y={y - 3} textAnchor="middle" fontSize="10"
              fill="var(--cream)" fontWeight="600">
              {node.label.length > 14 ? node.label.slice(0, 12) + '…' : node.label}
            </text>
            <text x={x} y={y + 10} textAnchor="middle" fontSize="9"
              fill={color} fontWeight="700">
              {node.pass_pct_7d}%
            </text>
            <text x={x} y={y + r + 14} textAnchor="middle" fontSize="9"
              fill="var(--cream-3)">
              {node.probe_count} probes
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RecurrenceTable({ onModuleFilter, activeModule }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProbeRecurrence({ module: activeModule })
      .then(d => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [activeModule]);

  if (loading) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>;
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin recurrencias registradas.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.1)' }}>
            {['Probe', 'Módulo', 'Tipo error', 'Severidad', '#', 'Proyectos afectados', 'Último'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--cream-3)', fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 30).map((it, i) => (
            <tr key={i} data-testid={`recurrence-row-${it.probe_id}`}
              style={{ borderBottom: '1px solid rgba(240,235,224,0.04)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--cream)', fontFamily: 'monospace' }}>
                {it.probe_id}
              </td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>{it.module}</td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>{it.error_type || '—'}</td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>{it.severity}</td>
              <td style={{ padding: '6px 10px', color: 'var(--cream)', fontWeight: 700 }}>
                {it.recurrence_count}
              </td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>
                {it.affected_projects || 1}
              </td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-3)' }}>
                {it.last_detected ? new Date(it.last_detected).toLocaleDateString('es-MX') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerOrgTable() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    getPerOrgDashboard().then(d => setRows(d.items || [])).catch(() => {});
  }, []);
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin ejecuciones recientes por organización.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.1)' }}>
            {['Organización', 'Ejecuciones 7d', 'Proyectos', 'Pass rate 7d', 'Críticos abiertos'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--cream-3)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-testid={`org-row-${r.dev_org_id}`}
              style={{ borderBottom: '1px solid rgba(240,235,224,0.04)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--cream)', fontFamily: 'monospace' }}>{r.dev_org_id}</td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>{r.runs_7d}</td>
              <td style={{ padding: '6px 10px', color: 'var(--cream-2)' }}>{r.projects_count}</td>
              <td style={{
                padding: '6px 10px', fontWeight: 700,
                color: r.pass_rate_7d >= 90 ? '#22c55e' : r.pass_rate_7d >= 70 ? '#f59e0b' : '#ef4444',
              }}>{r.pass_rate_7d}%</td>
              <td style={{
                padding: '6px 10px',
                color: r.criticals_open > 0 ? '#ef4444' : 'var(--cream-2)',
                fontWeight: r.criticals_open > 0 ? 700 : 400,
              }}>{r.criticals_open}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SystemMapPage({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [activeModule, setActiveModule] = useState(null);

  useEffect(() => {
    getSystemMap().then(setData).catch(e => console.error(e));
  }, []);

  if (!data) return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: 40, color: 'var(--cream-3)', fontSize: 13 }}>
        Cargando system map…
      </div>
    </SuperadminLayout>
  );

  const stats = data.stats || {};

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Activity size={20} color="var(--cream)" />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          System Map
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--cream-3)' }}>
        Salud global del sistema DMX · últimos 7 días
      </p>

      <div style={{ marginBottom: 24 }}>
        <KPIStrip items={[
          { label: 'Probes ejecutados 7d', value: stats.total_probes_ran_7d || 0 },
          { label: 'Pass rate', value: `${stats.pass_rate_7d || 0}%` },
          { label: 'Críticos abiertos', value: stats.criticals_open || 0 },
          { label: 'Top problemático', value: stats.top_problematic_module || '—' },
        ]} />
      </div>

      <div style={{
        background: 'rgba(240,235,224,0.03)',
        border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 14, padding: 20, marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Mapa de módulos
        </h3>
        <SystemGraph nodes={data.nodes || []} edges={data.edges || []}
          onNodeClick={(n) => setActiveModule(activeModule === n.id ? null : n.id)} />
        {activeModule && (
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 8, textAlign: 'center' }}>
            Filtrando recurrencias por módulo: <strong style={{ color: 'var(--cream)' }}>{activeModule}</strong>
            &nbsp;· <button onClick={() => setActiveModule(null)}
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
              limpiar
            </button>
          </div>
        )}
      </div>

      <div style={{
        background: 'rgba(240,235,224,0.03)',
        border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 14, padding: 20, marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Errores recurrentes cross-projects
        </h3>
        <RecurrenceTable activeModule={activeModule} />
      </div>

      <div style={{
        background: 'rgba(240,235,224,0.03)',
        border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 14, padding: 20,
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Por organización
        </h3>
        <PerOrgTable />
      </div>
    </div>
    </SuperadminLayout>
  );
}
