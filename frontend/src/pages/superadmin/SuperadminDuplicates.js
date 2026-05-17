/**
 * W5.11 Parte 2 — SuperadminDuplicates
 * Ruta: /superadmin/duplicates
 *
 * Panel para revisar pares pendientes detectados por el motor de
 * entity resolution. Permite filtrar por tipo de entidad y tier de
 * confianza, ver el diff side-by-side (DuplicateDiffCard) y ejecutar
 * acciones (merge / reject / ignore + blacklist).
 *
 * Toda acción se loguea en audit_immutable y se refleja al recargar la
 * lista. Soporta paginación incremental (skip / limit).
 */
import React, { useEffect, useMemo, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Empty, Badge, Toast } from '../../components/advisor/primitives';
import DuplicateDiffCard from '../../components/superadmin/DuplicateDiffCard';
import {
  listPendingDuplicates,
  mergePending,
  rejectPending,
  ignorePending,
  triggerDedupRun,
} from '../../api/entity_resolution';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GitMerge,
  Layers,
  PlayCircle,
  RefreshCw,
  X,
} from 'lucide-react';

const ENTITY_TYPES = [
  { key: '',         label: 'Todos' },
  { key: 'lead',     label: 'Leads' },
  { key: 'contacto', label: 'Contactos' },
  { key: 'asesor',   label: 'Asesores' },
  { key: 'desarrollo', label: 'Desarrollos' },
];

const TIERS = [
  { key: '',         label: 'Todos los tiers', color: 'var(--cream-3)' },
  { key: 'critical', label: 'Critico (>=90)',  color: '#fca5a5' },
  { key: 'high',     label: 'Alto (75-89)',    color: '#fcd34d' },
  { key: 'medium',   label: 'Medio (60-74)',   color: '#93c5fd' },
];

function tierTone(tier) {
  if (tier === 'critical') return 'danger';
  if (tier === 'high')     return 'warning';
  if (tier === 'medium')   return 'info';
  return 'neutral';
}

function pillStyle(active) {
  return {
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'DM Sans',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid var(--border)',
    color: active ? '#a5b4fc' : 'var(--cream-2)',
    transition: 'all 0.15s',
  };
}

function ActionBtn({ children, onClick, kind = 'neutral', disabled, testid }) {
  const palette = {
    success: { bg: 'rgba(34,197,94,0.10)',  bd: 'rgba(34,197,94,0.35)',  fg: '#86efac' },
    danger:  { bg: 'rgba(244,63,94,0.10)',  bd: 'rgba(244,63,94,0.35)',  fg: '#fda4af' },
    warning: { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.35)', fg: '#fcd34d' },
    neutral: { bg: 'rgba(255,255,255,0.04)', bd: 'var(--border)',        fg: 'var(--cream-2)' },
  }[kind];
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 6,
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        color: palette.fg,
        fontSize: 11,
        fontFamily: 'DM Sans',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}>
      {children}
    </button>
  );
}

function PendingRow({ row, onMerge, onReject, onIgnore, busy }) {
  const [open, setOpen] = useState(false);
  const breakdown = row.breakdown || {};
  const tier = row.confidence_tier || 'medium';

  return (
    <Card style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      <div
        data-testid={`pending-row-${row.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
        }}
        onClick={() => setOpen(!open)}>
        <div style={{ flex: '0 0 auto' }}>
          {open ? <ChevronUp size={14} color="var(--cream-3)" /> : <ChevronDown size={14} color="var(--cream-3)" />}
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <Badge tone={tierTone(tier)}>{tier.toUpperCase()}</Badge>
        </div>
        <div style={{ flex: '0 0 90px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)' }}>
          {row.entity_type}
        </div>
        <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--cream-3)' }}>canon</span>{' '}
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{row.canonical_id}</span>
          <span style={{ color: 'var(--cream-3)', margin: '0 8px' }}>vs cand</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{row.candidate_id}</span>
        </div>
        <div style={{ flex: '0 0 70px', textAlign: 'right' }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: '#a5b4fc' }}>
            {Number(row.score_combined || 0).toFixed(1)}
          </span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '4px 16px 18px 16px' }}>
          <DuplicateDiffCard
            canonical={row.canonical_doc || {}}
            candidate={row.candidate_doc || {}}
            breakdown={breakdown}
            cross_asesor={!!row.cross_asesor}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <ActionBtn kind="success" disabled={busy} onClick={(e) => { e.stopPropagation(); onMerge(row); }} testid={`merge-btn-${row.id}`}>
              <GitMerge size={12} /> Fusionar
            </ActionBtn>
            <ActionBtn kind="warning" disabled={busy} onClick={(e) => { e.stopPropagation(); onReject(row); }} testid={`reject-btn-${row.id}`}>
              <X size={12} /> Rechazar
            </ActionBtn>
            <ActionBtn kind="danger" disabled={busy} onClick={(e) => { e.stopPropagation(); onIgnore(row); }} testid={`ignore-btn-${row.id}`}>
              <AlertTriangle size={12} /> No es duplicado (blacklist)
            </ActionBtn>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SuperadminDuplicates({ user, onLogout }) {
  const [pending, setPending] = useState([]);
  const [total, setTotal]     = useState(0);
  const [skip, setSkip]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [entityType, setEntityType] = useState('');
  const [tier, setTier]       = useState('');
  const [toast, setToast]     = useState(null);
  const LIMIT = 25;

  const load = async (resetSkip = false) => {
    setLoading(true);
    const useSkip = resetSkip ? 0 : skip;
    if (resetSkip) setSkip(0);
    try {
      const r = await listPendingDuplicates({
        entity_type: entityType || undefined,
        tier:        tier || undefined,
        limit: LIMIT,
        skip: useSkip,
      });
      if (r.detail) {
        showToast('error', r.detail);
        setPending([]);
        setTotal(0);
      } else {
        setPending(r.pending || []);
        setTotal(r.total || 0);
      }
    } catch {
      showToast('error', 'Error al cargar pendientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [entityType, tier]);
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [skip]);

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleMerge = async (row) => {
    if (!window.confirm(`Fusionar ${row.candidate_id} dentro de ${row.canonical_id}? Esta acción puede deshacerse durante 30 días.`)) return;
    setBusy(true);
    try {
      const r = await mergePending(row.id);
      if (r.ok) {
        showToast('success', `Merge OK · undo disponible (${r.merge_id})`);
        load(false);
      } else {
        showToast('error', r.detail || 'No se pudo fusionar');
      }
    } catch { showToast('error', 'Error de red en merge'); }
    finally { setBusy(false); }
  };

  const handleReject = async (row) => {
    setBusy(true);
    try {
      const r = await rejectPending(row.id);
      if (r.ok) { showToast('success', 'Pendiente rechazado'); load(false); }
      else { showToast('error', r.detail || 'Error rechazando'); }
    } catch { showToast('error', 'Error de red'); }
    finally { setBusy(false); }
  };

  const handleIgnore = async (row) => {
    if (!window.confirm('Marcar como NO duplicado y añadir a blacklist (nunca volverá a sugerirse)?')) return;
    setBusy(true);
    try {
      const r = await ignorePending(row.id);
      if (r.ok) { showToast('success', 'Par añadido a blacklist'); load(false); }
      else { showToast('error', r.detail || 'Error blacklisteando'); }
    } catch { showToast('error', 'Error de red'); }
    finally { setBusy(false); }
  };

  const handleTriggerRun = async () => {
    if (!window.confirm('Disparar deteccion de duplicados ahora? Puede tardar varios minutos.')) return;
    setBusy(true);
    try {
      const r = await triggerDedupRun();
      if (r.ok) showToast('success', 'Deteccion iniciada en background');
      else showToast('error', r.detail || 'Error al disparar');
    } catch { showToast('error', 'Error de red'); }
    finally { setBusy(false); }
  };

  const pageInfo = useMemo(() => {
    const from = Math.min(skip + 1, total);
    const to   = Math.min(skip + pending.length, total);
    return total > 0 ? `${from}–${to} de ${total}` : '0 de 0';
  }, [skip, pending.length, total]);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="SUPERADMIN · ENTITY RESOLUTION"
        title="Duplicados pendientes"
        sub="Revisar pares detectados por el motor de 8 capas. Acciones: fusionar, rechazar o blacklistear."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="reload-btn"
              onClick={() => load(false)}
              disabled={loading}
              style={pillStyle(false)}>
              <RefreshCw size={11} style={{ marginRight: 4 }} /> Recargar
            </button>
            <button
              data-testid="trigger-run-btn"
              onClick={handleTriggerRun}
              disabled={busy}
              style={pillStyle(true)}>
              <PlayCircle size={11} style={{ marginRight: 4 }} /> Disparar deteccion
            </button>
          </div>
        }
      />

      {/* Filtros */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Tipo de entidad
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ENTITY_TYPES.map(et => (
                <button
                  key={et.key || 'all'}
                  data-testid={`filter-entity-${et.key || 'all'}`}
                  onClick={() => setEntityType(et.key)}
                  style={pillStyle(entityType === et.key)}>
                  {et.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Tier de confianza
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TIERS.map(t => (
                <button
                  key={t.key || 'all'}
                  data-testid={`filter-tier-${t.key || 'all'}`}
                  onClick={() => setTier(t.key)}
                  style={pillStyle(tier === t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Total + paginación */}
      <div data-testid="duplicates-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
          <Layers size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {pageInfo}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            data-testid="page-prev-btn"
            disabled={skip <= 0 || loading}
            onClick={() => setSkip(Math.max(0, skip - LIMIT))}
            style={{ ...pillStyle(false), opacity: skip <= 0 ? 0.4 : 1 }}>
            Anterior
          </button>
          <button
            data-testid="page-next-btn"
            disabled={skip + LIMIT >= total || loading}
            onClick={() => setSkip(skip + LIMIT)}
            style={{ ...pillStyle(false), opacity: skip + LIMIT >= total ? 0.4 : 1 }}>
            Siguiente
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando pares pendientes…
        </div>
      ) : pending.length === 0 ? (
        <Empty title="Sin duplicados pendientes" sub="No hay pares pendientes con los filtros seleccionados." />
      ) : (
        <div data-testid="duplicates-list">
          {pending.map(row => (
            <PendingRow
              key={row.id}
              row={row}
              busy={busy}
              onMerge={handleMerge}
              onReject={handleReject}
              onIgnore={handleIgnore}
            />
          ))}
        </div>
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}
