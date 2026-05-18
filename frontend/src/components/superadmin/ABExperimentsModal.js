// W5.FF5 · ABExperimentsModal — A/B testing CRUD modal
// Aurora compliant: var(--theme*) / var(--cream*) / var(--border) tokens.
// Cero hex hardcoded · imita FeatureTemplateModal pattern (FF3).
import React, { useEffect, useState } from 'react';
import { X, Play, StopCircle, BarChart3 } from 'lucide-react';
import {
  createABExperiment,
  listABExperiments,
  getExperimentStats,
  stopExperiment,
} from '../../api/feature_visibility';

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalBox = {
  width: '100%',
  maxWidth: 720,
  maxHeight: '88vh',
  overflow: 'auto',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 24,
  fontFamily: 'DM Sans',
};

const sectionTitle = {
  fontFamily: 'Outfit',
  fontWeight: 800,
  fontSize: 14,
  color: 'var(--cream)',
  letterSpacing: '-0.01em',
  marginBottom: 10,
};

const label = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--cream-2)',
  marginBottom: 6,
};

const fieldBox = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontSize: 13,
  fontFamily: 'DM Sans',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary = (disabled) => ({
  padding: '9px 16px',
  borderRadius: 8,
  background: 'rgba(var(--theme-rgb), 0.22)',
  border: '1px solid rgba(var(--theme-rgb), 0.55)',
  color: 'var(--theme-2)',
  fontSize: 12,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: 'DM Sans',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
});

const btnGhost = {
  padding: '6px 12px',
  borderRadius: 6,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--cream-2)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const tableCell = {
  padding: '8px 10px',
  fontSize: 11,
  color: 'var(--cream)',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'DM Sans',
  whiteSpace: 'nowrap',
};

const tableHead = {
  ...tableCell,
  fontSize: 10,
  color: 'var(--cream-3)',
  textTransform: 'uppercase',
  fontWeight: 700,
  letterSpacing: '0.04em',
  background: 'rgba(255,255,255,0.02)',
};

export default function ABExperimentsModal({ open, onClose, catalog = [], onToast }) {
  const [experiments, setExperiments] = useState([]);
  const [statsById, setStatsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [fFeature, setFFeature] = useState('');
  const [fName, setFName] = useState('');
  const [fSplit, setFSplit] = useState(50);
  const [fHyp, setFHyp] = useState('');
  const [fExpires, setFExpires] = useState(30);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listABExperiments({ status: 'active' })
      .then(async d => {
        if (cancelled) return;
        const items = d.items || [];
        setExperiments(items);
        // Fetch stats per experiment in parallel (best-effort)
        const statsMap = {};
        await Promise.all(items.map(async (e) => {
          try {
            statsMap[e.id] = await getExperimentStats(e.id);
          } catch { /* silent · stats opcional */ }
        }));
        if (!cancelled) setStatsById(statsMap);
      })
      .catch((e) => {
        if (onToast) onToast({ kind: 'error', text: e.message || 'Error list experiments' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  async function refresh() {
    setLoading(true);
    try {
      const d = await listABExperiments({ status: 'active' });
      const items = d.items || [];
      setExperiments(items);
      const statsMap = {};
      await Promise.all(items.map(async (e) => {
        try { statsMap[e.id] = await getExperimentStats(e.id); }
        catch { /* silent */ }
      }));
      setStatsById(statsMap);
    } catch (e) {
      if (onToast) onToast({ kind: 'error', text: e.message || 'Error refresh' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!fFeature || !fName.trim()) {
      if (onToast) onToast({ kind: 'warning', text: 'feature + nombre requeridos' });
      return;
    }
    setBusy(true);
    try {
      await createABExperiment({
        feature_key: fFeature,
        name: fName.trim(),
        split_pct: Number(fSplit),
        hypothesis: fHyp,
        expires_in_days: fExpires ? Number(fExpires) : null,
      });
      if (onToast) onToast({ kind: 'success', text: `Experiment "${fName}" creado` });
      setFFeature('');
      setFName('');
      setFSplit(50);
      setFHyp('');
      setFExpires(30);
      await refresh();
    } catch (e) {
      if (onToast) onToast({ kind: 'error', text: e.message || 'Error crear experiment' });
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(experimentId) {
    if (!window.confirm('¿Detener este experiment? No se podrá reanudar.')) return;
    setBusy(true);
    try {
      await stopExperiment(experimentId);
      if (onToast) onToast({ kind: 'success', text: 'Experiment detenido' });
      await refresh();
    } catch (e) {
      if (onToast) onToast({ kind: 'error', text: e.message || 'Error stop' });
    } finally {
      setBusy(false);
    }
  }

  function fmtSig(stats) {
    if (!stats) return '—';
    const sig = stats.statistical_significance || {};
    if (sig.state === 'insufficient_data') return 'n/a';
    if (sig.significant) return `chi²=${sig.chi2} ✓`;
    return `chi²=${sig.chi2 ?? '—'}`;
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={modalBox}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{
            fontFamily: 'Outfit',
            fontWeight: 800,
            fontSize: 20,
            color: 'var(--cream)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            A/B Experiments
          </h2>
          <button
            data-testid="ab-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--cream-2)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* List */}
        <div style={sectionTitle}>Experimentos activos</div>
        {loading ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>
        ) : experiments.length === 0 ? (
          <div style={{
            padding: 16,
            fontSize: 12,
            color: 'var(--cream-3)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            marginBottom: 18,
          }}>
            Sin experimentos activos.
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 18,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHead}>Feature</th>
                  <th style={tableHead}>Nombre</th>
                  <th style={tableHead}>Split</th>
                  <th style={tableHead}>A · users / events</th>
                  <th style={tableHead}>B · users / events</th>
                  <th style={tableHead}>Sig.</th>
                  <th style={tableHead}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => {
                  const s = statsById[e.id];
                  const a = s?.variant_A || {};
                  const b = s?.variant_B || {};
                  return (
                    <tr key={e.id} data-testid={`ab-row-${e.id}`}>
                      <td style={tableCell}>{e.feature_key}</td>
                      <td style={tableCell}>{e.name}</td>
                      <td style={tableCell}>{e.split_pct}/{100 - e.split_pct}</td>
                      <td style={tableCell}>{a.users || 0} · {a.events || 0}</td>
                      <td style={tableCell}>{b.users || 0} · {b.events || 0}</td>
                      <td style={tableCell}>{fmtSig(s)}</td>
                      <td style={tableCell}>
                        <button
                          data-testid={`ab-stop-${e.id}`}
                          onClick={() => handleStop(e.id)}
                          disabled={busy}
                          style={btnGhost}
                        >
                          <StopCircle size={12} />
                          Stop
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Form */}
        <div style={sectionTitle}>Crear nuevo experiment</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div>
            <div style={label}>Feature</div>
            <select
              data-testid="ab-feature-select"
              value={fFeature}
              onChange={(e) => setFFeature(e.target.value)}
              style={fieldBox}
            >
              <option value="">— Selecciona —</option>
              {(catalog || []).map(f => (
                <option key={f.key} value={f.key}>
                  {f.name || f.key} · {f.plan_tier}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Nombre del experiment</div>
            <input
              data-testid="ab-name-input"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Ej. Test paywall · Q2"
              style={fieldBox}
            />
          </div>
          <div>
            <div style={label}>Split A · {fSplit}% / B · {100 - Number(fSplit)}%</div>
            <input
              data-testid="ab-split-input"
              type="range"
              min={0}
              max={100}
              value={fSplit}
              onChange={(e) => setFSplit(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={label}>Expira en (días)</div>
            <input
              data-testid="ab-expires-input"
              type="number"
              min={1}
              max={365}
              value={fExpires}
              onChange={(e) => setFExpires(e.target.value)}
              style={fieldBox}
            />
          </div>
          <div style={{ gridColumn: '1 / span 2' }}>
            <div style={label}>Hipótesis (opcional)</div>
            <textarea
              data-testid="ab-hyp-input"
              value={fHyp}
              onChange={(e) => setFHyp(e.target.value)}
              rows={2}
              placeholder="Esperamos que variant A incremente conversion 15%…"
              style={{ ...fieldBox, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 18,
        }}>
          <button onClick={onClose} disabled={busy} style={btnGhost}>
            Cerrar
          </button>
          <button
            data-testid="ab-create-btn"
            onClick={handleCreate}
            disabled={busy || !fFeature || !fName.trim()}
            style={btnPrimary(busy || !fFeature || !fName.trim())}
          >
            <Play size={12} />
            {busy ? 'Creando…' : 'Crear experiment'}
          </button>
        </div>

        {/* Footer info */}
        <div style={{
          marginTop: 16,
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--cream-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <BarChart3 size={13} style={{ color: 'var(--theme-2)' }} />
          Variant A = feature visible · Variant B = feature oculta (control).
          Chi-square significancia requiere ≥30 users por variant.
        </div>
      </div>
    </div>
  );
}
