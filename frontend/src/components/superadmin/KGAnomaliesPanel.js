/**
 * W5.12 Parte 2 — Tab Anomalías: filtros chip-bar + cards + expand accordion + trigger manual.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, ChevronUp, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { getKgAnomalies, triggerKgAnomaly } from '../../api/knowledge_graph';

const cardStyle = {
  background: 'rgba(13,16,23,0.92)',
  backdropFilter: 'blur(24px)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  padding: '18px 22px',
};

const SEVERITY_PALETTE = {
  high:   { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.35)',  fg: '#fda4af' },
  medium: { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.35)', fg: '#fcd34d' },
  low:    { bg: 'rgba(59,130,246,0.10)', bd: 'rgba(59,130,246,0.30)', fg: '#93c5fd' },
};

const ANOMALY_TYPES = ['fraud_rings', 'devs_ghost', 'leads_zombies', 'asesores_fantasma', 'zone_collapse'];

function ChipBtn({ children, active, onClick, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 9999,
        fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'rgba(124,47,255,0.22)' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid rgba(124,47,255,0.45)' : '1px solid var(--border, rgba(255,255,255,0.10))',
        color: active ? '#c4b5fd' : 'var(--cream-2, #d6d2c4)',
        transition: 'all 0.15s',
      }}>
      {children}
    </button>
  );
}

function SeverityBadge({ severity }) {
  const p = SEVERITY_PALETTE[severity] || SEVERITY_PALETTE.low;
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 9999,
      fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 700,
      background: p.bg, border: `1px solid ${p.bd}`, color: p.fg,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{severity || 'low'}</span>
  );
}

function _ago(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace segundos';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d}d`;
}

function AnomalyCard({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`anomaly-card-${row.id}`} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        {open ? <ChevronUp size={14} color="var(--cream-3, rgba(240,235,224,0.55))" /> : <ChevronDown size={14} color="var(--cream-3, rgba(240,235,224,0.55))" />}
        <SeverityBadge severity={row.severity} />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#a5b4fc' }}>{row.type}</span>
        <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2, rgba(240,235,224,0.85))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>{row.entity_type}</span>
          {' '}<span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{row.entity_id}</span>
        </div>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>{_ago(row.detected_at)}</span>
      </div>
      {open && (
        <div style={{ padding: '4px 18px 18px 50px' }}>
          <pre style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.06))',
            borderRadius: 10, padding: 14, margin: 0, overflowX: 'auto',
            fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2, rgba(240,235,224,0.85))',
          }}>{JSON.stringify(row.details || {}, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function PillBtn({ children, onClick, kind = 'ghost', disabled, testid }) {
  const palettes = {
    primary: { background: 'linear-gradient(90deg, var(--theme, #7c2fff), var(--theme-2, #c026d3))', color: '#fff', border: '1px solid transparent' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: 'var(--cream-2, #d6d2c4)', border: '1px solid var(--border, rgba(255,255,255,0.10))' },
  };
  const p = palettes[kind] || palettes.ghost;
  return (
    <button
      data-testid={testid} onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...p,
      }}>{children}</button>
  );
}

export default function KGAnomaliesPanel({ kgAvailable }) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = async () => {
    setLoading(true);
    const r = await getKgAnomalies({ severity: severity || undefined, type: type || undefined, limit: 100, skip: 0 });
    if (r.ok) {
      setRows(r.body.anomalies || []);
      setTotal(r.body.total || 0);
    } else {
      setRows([]); setTotal(0);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [severity, type]);

  const handleRerun = async () => {
    setBusy(true);
    const r = await triggerKgAnomaly();
    setBusy(false);
    if (r.ok) {
      const det = r.body?.summary?.detected ?? 0;
      const skipped = r.body?.summary?.skipped;
      setToast(skipped
        ? t('knowledge_graph.anomaly.skipped', 'Deteccion pausada · Neo4j no disponible')
        : t('knowledge_graph.anomaly.detected_n', { n: det, defaultValue: `${det} anomalias detectadas` }));
      load();
    } else {
      setToast(t('knowledge_graph.anomaly.rerun_error', 'Error al ejecutar deteccion'));
    }
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div data-testid="kg-tab-anomalias" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!kgAvailable && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={14} color="#fcd34d" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#fcd34d' }}>
            {t('knowledge_graph.anomaly.paused_kg_down', 'Deteccion pausada · Neo4j no disponible')}
          </span>
        </div>
      )}

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3, rgba(240,235,224,0.55))', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('knowledge_graph.anomaly.filter_severity', 'Severidad')}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipBtn active={severity === ''} onClick={() => setSeverity('')} testid="filter-sev-all">{t('knowledge_graph.anomaly.all', 'Todas')}</ChipBtn>
            {['high', 'medium', 'low'].map(s => (
              <ChipBtn key={s} active={severity === s} onClick={() => setSeverity(s)} testid={`filter-sev-${s}`}>
                {t(`knowledge_graph.anomaly.severity.${s}`, s)}
              </ChipBtn>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3, rgba(240,235,224,0.55))', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('knowledge_graph.anomaly.filter_type', 'Tipo')}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipBtn active={type === ''} onClick={() => setType('')} testid="filter-type-all">{t('knowledge_graph.anomaly.all', 'Todas')}</ChipBtn>
            {ANOMALY_TYPES.map(at => (
              <ChipBtn key={at} active={type === at} onClick={() => setType(at)} testid={`filter-type-${at}`}>
                {t(`knowledge_graph.anomaly.types.${at}`, at)}
              </ChipBtn>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <PillBtn kind="primary" onClick={handleRerun} disabled={busy} testid="rerun-detection-btn">
            <Play size={11} /> {busy ? t('knowledge_graph.loading', 'Cargando...') : t('knowledge_graph.actions.rerun_detection', 'Re-correr detección ahora')}
          </PillBtn>
          <PillBtn onClick={load} disabled={loading} testid="reload-anomalies-btn">
            <RefreshCw size={11} /> {t('knowledge_graph.actions.refresh', 'Recargar')}
          </PillBtn>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
            {rows.length} de {total}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
          {t('knowledge_graph.loading', 'Cargando...')}
        </div>
      ) : rows.length === 0 ? (
        <div data-testid="anomalies-empty" style={{ ...cardStyle, textAlign: 'center', padding: '40px 22px' }}>
          <ShieldAlert size={26} color="var(--cream-3, rgba(240,235,224,0.45))" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream, #F0EBE0)', marginTop: 12 }}>
            {t('knowledge_graph.empty_states.no_anomalies', 'Sin anomalias detectadas')}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, rgba(240,235,224,0.55))', marginTop: 6 }}>
            {t('knowledge_graph.empty_states.no_anomalies_sub', 'El grafo no muestra patrones sospechosos en el ultimo barrido nocturno.')}
          </div>
        </div>
      ) : (
        <div data-testid="anomalies-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => <AnomalyCard key={row.id} row={row} />)}
        </div>
      )}

      {toast && (
        <div data-testid="kg-anomaly-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          padding: '12px 18px', borderRadius: 9999,
          background: 'rgba(124,47,255,0.18)', border: '1px solid rgba(124,47,255,0.42)',
          color: '#e0e7ff', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
          backdropFilter: 'blur(24px)',
        }}>{toast}</div>
      )}
    </div>
  );
}
