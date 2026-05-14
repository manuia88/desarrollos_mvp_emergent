/**
 * W4.6 Y.3A — SmartRoutingPanel
 * Panel Smart Routing — listas, accept/reject/reassign, métricas accuracy.
 * 4to sub-tab en SubAgentsTabs (TenantDrawer · /superadmin/tenants).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Send, CheckCircle, XCircle, Shuffle, Zap, Database, Cpu, Users, AlertTriangle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── API helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

async function listRoutings(orgId, status) {
  const params = new URLSearchParams({ limit: 50 });
  if (orgId) params.append('org_id', orgId);
  if (status && status !== 'all') params.append('status', status);
  return apiFetch(`/api/agentic-crm/routings?${params}`);
}

async function fetchMetrics(orgId, days = 30) {
  return apiFetch(`/api/superadmin/agentic-crm/routings/metrics?org_id=${orgId}&days=${days}`);
}

async function createRouting(leadId, orgId) {
  return apiFetch('/api/agentic-crm/routings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, org_id: orgId }),
  });
}

async function acceptRouting(routingId) {
  return apiFetch(`/api/agentic-crm/routings/${routingId}/accept`, { method: 'POST' });
}

async function rejectRouting(routingId, reason) {
  return apiFetch(`/api/agentic-crm/routings/${routingId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || 'Rechazada manualmente' }),
  });
}

async function reassignRouting(routingId, newAsesorId, reason) {
  return apiFetch(`/api/agentic-crm/routings/${routingId}/reassign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_asesor_id: newAsesorId, reason: reason || 'Reasignación superadmin' }),
  });
}

// ─── Layer / status metadata ─────────────────────────────────────────────────
const LAYER_META = {
  llm:       { label: 'LLM',       color: 'var(--theme)', Icon: Cpu },
  cache:     { label: 'Cached',    color: '#F59E0B', Icon: Database },
  cached:    { label: 'Cached',    color: '#F59E0B', Icon: Database },
  heuristic: { label: 'Heurística', color: '#94A3B8', Icon: Zap },
};

const STATUS_META = {
  pending:    { label: 'Pendiente',   color: '#F59E0B' },
  accepted:   { label: 'Aceptado',    color: '#4ADE80' },
  rejected:   { label: 'Rechazado',   color: '#F87171' },
  reassigned: { label: 'Reasignado',  color: 'var(--theme)' },
  expired:    { label: 'Expirado',    color: '#94A3B8' },
};

const fitColor = (score) => {
  if (score >= 75) return '#4ADE80';
  if (score >= 50) return '#F59E0B';
  return '#F87171';
};

// ─── Small UI atoms ───────────────────────────────────────────────────────────
function Badge({ label, color, Icon }) {
  return (
    <span style={{
      padding: '1px 8px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700,
      background: `${color}22`, border: `1px solid ${color}44`, color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {Icon ? <Icon size={10} /> : null}
      {label}
    </span>
  );
}

function FitChip({ score }) {
  const c = fitColor(score);
  return (
    <span data-testid={`fit-chip-${score}`} style={{
      padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Mono, monospace',
      fontWeight: 700, background: `${c}1a`, border: `1px solid ${c}55`, color: c,
    }}>
      {score}/100
    </span>
  );
}

function StatTile({ label, value, sub, testid }) {
  return (
    <div data-testid={testid} style={{
      flex: 1, minWidth: 130, padding: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.10)',
      backdropFilter: 'blur(14px)',
      borderRadius: 14,
    }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.55)',
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginTop: 4 }}>
        {value ?? '—'}
      </div>
      {sub ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function PillButton({ children, onClick, variant = 'primary', disabled, testid, Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
    success: { background: 'transparent', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' },
    danger:  { background: 'transparent', color: '#FCA5A5', border: '1px solid rgba(252,165,165,0.3)' },
    indigo:  { background: 'transparent', color: '#A5B4FC', border: '1px solid rgba(var(--theme-rgb),0.30)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '5px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      {Icon ? <Icon size={11} /> : null}
      {children}
    </button>
  );
}

// ─── Row expand: fit_breakdown ───────────────────────────────────────────────
function FitBreakdown({ breakdown }) {
  const dims = [
    { k: 'zone', label: 'Zona' },
    { k: 'segment', label: 'Segmento' },
    { k: 'capacity', label: 'Capacidad' },
    { k: 'conversion', label: 'Conversión' },
    { k: 'schedule', label: 'Horario' },
  ];
  return (
    <div data-testid="fit-breakdown" style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
      padding: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 10, marginTop: 8,
    }}>
      {dims.map(({ k, label }) => {
        const v = breakdown?.[k] ?? 0;
        return (
          <div key={k} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'rgba(240,235,224,0.55)',
                          textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: fitColor(v * 4) }}>{v}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function SmartRoutingPanel({ orgId }) {
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [reassignFor, setReassignFor] = useState(null);
  const [newAsesorId, setNewAsesorId] = useState('');
  const [leadInput, setLeadInput] = useState('');

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const [list, met] = await Promise.all([
        listRoutings(orgId, statusFilter),
        fetchMetrics(orgId, 30).catch(() => null),
      ]);
      setRows(list.routings || []);
      setMetrics(met);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => { reload(); }, [reload]);

  const handleCreate = async () => {
    if (!leadInput.trim()) return;
    setBusyId('__create__'); setError(null);
    try {
      await createRouting(leadInput.trim(), orgId);
      setLeadInput('');
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = async (id) => {
    setBusyId(id); setError(null);
    try { await acceptRouting(id); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const handleReject = async (id) => {
    setBusyId(id); setError(null);
    try { await rejectRouting(id, 'Rechazado por superadmin'); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const handleReassignSubmit = async () => {
    if (!reassignFor || !newAsesorId.trim()) return;
    setBusyId(reassignFor); setError(null);
    try {
      await reassignRouting(reassignFor, newAsesorId.trim(), 'Reasignación manual superadmin');
      setReassignFor(null); setNewAsesorId('');
      await reload();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  // ─── Computed top stats ─────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  const routingsToday = rows.filter((r) => (r.routed_at || '').slice(0, 10) === todayISO).length;
  const accepted30d = rows.filter((r) => r.status === 'accepted').length;
  const totalRows = rows.length;
  const acceptRate = totalRows > 0 ? Math.round((accepted30d / totalRows) * 100) : 0;
  const avgFit = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (Number(r.fit_score) || 0), 0) / rows.length)
    : 0;

  // ─── Top asesor by acceptance ───────────────────────────────────────────────
  const acceptanceByAsesor = {};
  rows.forEach((r) => {
    const aid = r.suggested_asesor_id;
    if (!aid) return;
    acceptanceByAsesor[aid] = acceptanceByAsesor[aid] || { name: r.suggested_asesor_name || aid, total: 0, acc: 0 };
    acceptanceByAsesor[aid].total += 1;
    if (r.status === 'accepted') acceptanceByAsesor[aid].acc += 1;
  });
  const topAsesor = Object.entries(acceptanceByAsesor)
    .map(([aid, m]) => ({ aid, ...m, rate: m.total > 0 ? Math.round((m.acc / m.total) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)[0];

  return (
    <div data-testid="smart-routing-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.55)',
                      letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
          W4.6 Y.3A · Smart Routing Lead
        </div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>
          Smart Routing
        </h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.65)', margin: '4px 0 0' }}>
          Asignación automática &lt;60 seg basada en zone-expertise + segmento + capacidad + conversión.
          3-layer fallback (LLM → cache → heurística).
        </p>
      </div>

      {/* Top stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTile testid="sr-stat-today"       label="Routings hoy"   value={routingsToday} />
        <StatTile testid="sr-stat-accept-rate" label="Accept rate 30d" value={`${acceptRate}%`}
                  sub={`${accepted30d}/${totalRows}`} />
        <StatTile testid="sr-stat-avg-fit"     label="Fit promedio"   value={avgFit} />
        <StatTile testid="sr-stat-top-asesor"  label="Top asesor"
                  value={topAsesor?.name?.slice(0, 18) || '—'}
                  sub={topAsesor ? `${topAsesor.rate}% accept · ${topAsesor.total} routings` : '—'} />
      </div>

      {/* Manual create + filters row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                    padding: 12, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(240,235,224,0.08)', borderRadius: 12 }}>
        <input
          data-testid="sr-input-lead-id"
          value={leadInput}
          onChange={(e) => setLeadInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="lead_id (test routing manual)"
          style={{
            flex: 1, minWidth: 220, padding: '7px 14px',
            background: 'rgba(0,0,0,0.30)',
            border: '1px solid rgba(240,235,224,0.18)',
            borderRadius: 9999, color: 'var(--cream)',
            fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
          }}
        />
        <PillButton testid="sr-btn-create" onClick={handleCreate} disabled={busyId === '__create__'} Icon={Send}>
          {busyId === '__create__' ? 'Ruteando…' : 'Rutear lead'}
        </PillButton>
        <div style={{ display: 'flex', gap: 5 }}>
          {['all', 'pending', 'accepted', 'rejected', 'reassigned'].map((s) => (
            <button
              key={s}
              data-testid={`sr-filter-${s}`}
              onClick={() => setStatusFilter(s)}
              className="rounded-full"
              style={{
                padding: '4px 11px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700,
                cursor: 'pointer',
                background: statusFilter === s
                  ? 'linear-gradient(90deg, rgba(var(--theme-rgb),0.22), rgba(var(--theme-rgb),0.18))'
                  : 'transparent',
                border: statusFilter === s
                  ? '1px solid rgba(var(--theme-rgb),0.45)'
                  : '1px solid rgba(255,255,255,0.08)',
                color: statusFilter === s ? 'var(--cream)' : 'rgba(240,235,224,0.55)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error ? (
        <div style={{ padding: 10, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)',
                      borderRadius: 10, color: '#FCA5A5', fontFamily: 'DM Sans', fontSize: 12,
                      display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      ) : null}

      {/* Layer breakdown */}
      {metrics?.summary?.by_layer ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'DM Sans', fontSize: 11,
                      color: 'rgba(240,235,224,0.65)' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em',
                         fontSize: 10, color: 'rgba(240,235,224,0.45)' }}>Capa usada:</span>
          {Object.entries(metrics.summary.by_layer).map(([k, v]) => (
            <Badge key={k}
                   label={`${LAYER_META[k]?.label || k}: ${v}`}
                   color={LAYER_META[k]?.color || '#94A3B8'}
                   Icon={LAYER_META[k]?.Icon} />
          ))}
        </div>
      ) : null}

      {/* Routings list */}
      <div data-testid="sr-routings-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12,
                        color: 'rgba(240,235,224,0.50)' }}>Cargando routings…</div>
        ) : rows.length === 0 ? (
          <div data-testid="sr-no-routings" style={{
            padding: 32, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13,
            color: 'rgba(240,235,224,0.45)',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(240,235,224,0.10)',
            borderRadius: 12,
          }}>
            <Users size={28} style={{ opacity: 0.4, marginBottom: 6 }} /><br />
            Aún no hay routings. Ingresa un lead_id arriba para probar.
          </div>
        ) : (
          rows.map((r) => {
            const layer = LAYER_META[r.routing_layer] || LAYER_META.heuristic;
            const status = STATUS_META[r.status] || STATUS_META.pending;
            const isExp = expanded === r.routing_id;
            const isBusy = busyId === r.routing_id;
            return (
              <div key={r.routing_id} data-testid={`sr-row-${r.routing_id}`} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(240,235,224,0.08)',
                backdropFilter: 'blur(14px)',
                borderRadius: 12, padding: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>
                        {r.lead_id || '—'}
                      </span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.45)' }}>→</span>
                      <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'rgba(240,235,224,0.85)' }}>
                        {r.suggested_asesor_name || r.suggested_asesor_id || '— (sin asesor)'}
                      </span>
                      <FitChip score={r.fit_score} />
                      <Badge label={status.label} color={status.color} />
                      <Badge label={layer.label} color={layer.color} Icon={layer.Icon} />
                      {r.data_quality === 'simulated' ? (
                        <Badge label="simulado" color="#F59E0B" />
                      ) : null}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.65)', lineHeight: 1.4 }}>
                      {r.rationale_text || '—'}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.45)', marginTop: 3 }}>
                      zona={r.lead_zone || '—'} · seg={r.lead_segment || '—'} · {r.routed_at?.slice(0, 16) || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <PillButton
                      testid={`sr-btn-expand-${r.routing_id}`}
                      onClick={() => setExpanded(isExp ? null : r.routing_id)}
                      variant="ghost"
                    >
                      {isExp ? 'Cerrar' : 'Detalles'}
                    </PillButton>
                    {r.status === 'pending' ? (
                      <>
                        <PillButton
                          testid={`sr-btn-accept-${r.routing_id}`}
                          onClick={() => handleAccept(r.routing_id)}
                          disabled={isBusy || !r.suggested_asesor_id}
                          variant="success"
                          Icon={CheckCircle}
                        >
                          Aceptar
                        </PillButton>
                        <PillButton
                          testid={`sr-btn-reject-${r.routing_id}`}
                          onClick={() => handleReject(r.routing_id)}
                          disabled={isBusy}
                          variant="danger"
                          Icon={XCircle}
                        >
                          Rechazar
                        </PillButton>
                        <PillButton
                          testid={`sr-btn-reassign-${r.routing_id}`}
                          onClick={() => { setReassignFor(r.routing_id); setNewAsesorId(''); }}
                          disabled={isBusy}
                          variant="indigo"
                          Icon={Shuffle}
                        >
                          Reasignar
                        </PillButton>
                      </>
                    ) : null}
                  </div>
                </div>

                {isExp ? <FitBreakdown breakdown={r.fit_breakdown} /> : null}

                {reassignFor === r.routing_id ? (
                  <div data-testid={`sr-reassign-form-${r.routing_id}`} style={{
                    display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <input
                      data-testid={`sr-reassign-input-${r.routing_id}`}
                      value={newAsesorId}
                      onChange={(e) => setNewAsesorId(e.target.value)}
                      placeholder="new_asesor_id (user_xxx)"
                      style={{
                        flex: 1, minWidth: 180, padding: '5px 11px',
                        background: 'rgba(0,0,0,0.30)',
                        border: '1px solid rgba(240,235,224,0.18)',
                        borderRadius: 9999, color: 'var(--cream)',
                        fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
                      }}
                    />
                    <PillButton
                      testid={`sr-reassign-submit-${r.routing_id}`}
                      onClick={handleReassignSubmit}
                      disabled={!newAsesorId.trim() || isBusy}
                      Icon={Shuffle}
                    >
                      Confirmar
                    </PillButton>
                    <PillButton
                      testid={`sr-reassign-cancel-${r.routing_id}`}
                      onClick={() => { setReassignFor(null); setNewAsesorId(''); }}
                      variant="ghost"
                    >
                      Cancelar
                    </PillButton>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
