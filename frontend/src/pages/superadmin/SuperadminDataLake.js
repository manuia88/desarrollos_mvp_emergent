// W2.7 Phase Z.0 — Data Lake page
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import EtlRunsTable from '../../components/superadmin/EtlRunsTable';
import ValidationMetricsTable from '../../components/superadmin/ValidationMetricsTable';
import {
  Database, RefreshCw, PlayCircle, ChevronDown, AlertCircle, Sparkles,
} from 'lucide-react';
import {
  listEtlRuns, triggerEtl, getCoverage, getValidationMetrics, runValidationsNow,
} from '../../api/superadminDataLake';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function StatCard({ label, value, sub, accent, testid }) {
  return (
    <div data-testid={testid} style={{
      flex: '1 1 180px', minWidth: 160, padding: '14px 16px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{
        fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.55)',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
      }}>{label}</span>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: 10.5,
          color: 'rgba(240,235,224,0.45)',
        }}>{sub}</span>
      )}
    </div>
  );
}

function CoveragePanel({ items }) {
  const [open, setOpen] = useState(false);
  const [missingModal, setMissingModal] = useState(null);

  if (!items || items.length === 0) return null;

  return (
    <div data-testid="coverage-panel" style={{
      marginTop: 18, borderRadius: 14, overflow: 'hidden',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <button
        data-testid="coverage-toggle"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '12px 14px', background: 'transparent',
          border: 'none', color: 'var(--cream)',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Database size={11} color="#818CF8" />
          Cobertura por tier (últimos 7 días)
        </span>
        <ChevronDown size={13} style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 180ms', opacity: 0.55,
        }} />
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px',
          display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(c => (
            <div key={c.tier} style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{
                padding: '3px 9px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.10)', color: '#818CF8',
                fontFamily: 'DM Mono, monospace', fontSize: 10,
                textTransform: 'uppercase', minWidth: 80, textAlign: 'center',
              }}>{c.tier}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--cream)',
                }}>{c.zones_with_data} / {c.total_zones}</div>
                <div style={{
                  marginTop: 4, height: 4, borderRadius: 9999,
                  background: 'rgba(255,255,255,0.07)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${c.coverage_pct || 0}%`, height: '100%',
                    background: c.coverage_pct >= 95 ? '#4ADE80'
                      : c.coverage_pct >= 70 ? '#FACC15' : '#F87171',
                    transition: 'width 240ms',
                  }} />
                </div>
              </div>
              <span style={{
                fontFamily: 'DM Mono, monospace', fontSize: 12,
                color: c.coverage_pct >= 95 ? '#4ADE80'
                  : c.coverage_pct >= 70 ? '#FACC15' : '#F87171',
                fontWeight: 700, minWidth: 50, textAlign: 'right',
              }}>{(c.coverage_pct || 0).toFixed(1)}%</span>
              {c.missing_zone_ids && c.missing_zone_ids.length > 0 && (
                <button onClick={() => setMissingModal(c)}
                  data-testid={`coverage-missing-${c.tier}`}
                  style={{
                    padding: '4px 10px', borderRadius: 9999,
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.28)',
                    color: '#F87171',
                    fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                  {c.missing_zone_ids.length} faltantes
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {missingModal && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setMissingModal(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
            backdropFilter: 'blur(8px)', zIndex: 1500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
          <div data-testid="coverage-missing-modal" style={{
            width: '100%', maxWidth: 520,
            background: 'rgba(13,17,28,0.97)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
              color: 'var(--cream)', margin: '0 0 12px',
            }}>Zonas faltantes · {missingModal.tier} ({missingModal.missing_zone_ids.length})</h3>
            <div style={{
              maxHeight: 320, overflowY: 'auto',
              padding: 10, borderRadius: 8,
              background: 'rgba(0,0,0,0.18)',
              fontFamily: 'DM Mono, monospace', fontSize: 11.5,
              color: 'rgba(240,235,224,0.65)',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {missingModal.missing_zone_ids.map(zid => (
                <div key={zid}>{zid}</div>
              ))}
            </div>
            <button onClick={() => setMissingModal(null)}
              style={{
                marginTop: 14, padding: '7px 16px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmTriggerModal({ onConfirm, onClose, busy }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
        backdropFilter: 'blur(8px)', zIndex: 1500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div data-testid="trigger-confirm-modal" style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(250,204,21,0.30)',
        borderRadius: 14, padding: 22,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <AlertCircle size={16} color="#FACC15" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
            color: 'var(--cream)', margin: 0 }}>Disparar ETL manual</h3>
        </div>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 12.5,
          color: 'rgba(240,235,224,0.65)', lineHeight: 1.5,
        }}>
          Recomputará agregados del cubo, escribirá snapshot a <code style={{
            fontFamily: 'DM Mono, monospace', background: 'rgba(0,0,0,0.3)',
            padding: '1px 5px', borderRadius: 4,
          }}>facts_daily_zone</code> y ejecutará validaciones de modelos.
          Toma ~1-2 segundos en este pod.
        </p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9999,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,224,0.55)',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
          <button data-testid="trigger-confirm" onClick={onConfirm} disabled={busy}
            style={{
              padding: '9px 20px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
            <PlayCircle size={11} />
            {busy ? 'Ejecutando…' : 'Disparar ETL'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperadminDataLake({ user, onLogout }) {
  const [runs, setRuns] = useState([]);
  const [runsTally, setRunsTally] = useState({ ok_7d: 0, total_7d: 0, last_run: null,
                                                total: 0 });
  const [coverage, setCoverage] = useState([]);
  const [validation, setValidation] = useState({ items: [], latest: [], avgR2: null });
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, v] = await Promise.all([
        listEtlRuns({ limit: 20 }),
        getCoverage({ days: 7 }),
        getValidationMetrics({ limit: 50 }),
      ]);
      setRuns(r.items || []);
      setRunsTally({
        ok_7d: r.ok_7d || 0, total_7d: r.total_7d || 0,
        last_run: r.last_run || null, total: r.total || 0,
      });
      setCoverage(c.items || []);
      setValidation({
        items: v.items || [],
        latest: v.latest_per_model || [],
        avgR2: v.avg_r_squared,
      });
    } catch (e) {
      setToast(e.message || 'Error cargando');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh every 60s while page visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll();
    }, 60000);
    return () => clearInterval(id);
  }, [loadAll]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const onTrigger = async () => {
    setBusy(true);
    try {
      const r = await triggerEtl({});
      setToast(`ETL ${r.status} · ${r.zones_processed} zonas en ${r.duration_seconds}s`);
      setConfirming(false);
      await loadAll();
    } catch (e) {
      setToast(e.message || 'Error ETL');
    } finally {
      setBusy(false);
    }
  };

  const onValidateNow = async () => {
    setBusy(true);
    try {
      const r = await runValidationsNow();
      setToast(`Validaciones: ${r.models_validated} modelos en ${r.elapsed_s}s`);
      await loadAll();
    } catch (e) {
      setToast(e.message || 'Error validación');
    } finally {
      setBusy(false);
    }
  };

  const okPct = runsTally.total_7d > 0
    ? Math.round((runsTally.ok_7d / runsTally.total_7d) * 100) : 100;
  const totalCoverage = coverage.length > 0
    ? Math.round(
        coverage.reduce((a, c) => a + (c.coverage_pct || 0), 0) / coverage.length,
      ) : 0;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-data-lake">
        {toast && (
          <div data-testid="data-lake-toast" style={{
            position: 'fixed', top: 76, right: 20, zIndex: 2000,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: '#818CF8', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        {/* Header */}
        <div style={{
          marginBottom: 20, display: 'flex', alignItems: 'flex-start',
          gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Database size={20} color="#818CF8" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
                color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
              }}>Data Lake</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240,235,224,0.50)', margin: 0,
            }}>
              Foundation Z.0 · time-series MongoDB · ETL diario 03:00 MX · validación R²/RMSE/MAPE.
            </p>
          </div>
          <button data-testid="data-lake-validate-now" onClick={onValidateNow} disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.30)',
              color: '#818CF8', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: busy ? 0.6 : 1,
            }}>
            <Sparkles size={11} /> Validar modelos
          </button>
          <button data-testid="data-lake-trigger" onClick={() => setConfirming(true)}
            disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
              cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: busy ? 0.6 : 1,
            }}>
            <PlayCircle size={11} /> Trigger ETL manual
          </button>
          <button data-testid="data-lake-refresh" onClick={loadAll}
            style={{
              padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}>
            <RefreshCw size={11} />
          </button>
        </div>

        {/* KPI strip */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22,
        }}>
          <StatCard testid="data-lake-kpi-runs"
            label="ETL runs 7d"
            value={`${runsTally.ok_7d} / ${runsTally.total_7d}`}
            sub={`${okPct}% éxito`}
            accent={okPct < 80 ? 'rgba(239,68,68,0.30)' : 'rgba(74,222,128,0.20)'} />
          <StatCard testid="data-lake-kpi-coverage"
            label="Cobertura promedio"
            value={`${totalCoverage}%`}
            sub={`${coverage.length} tiers`}
            accent={totalCoverage < 70 ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'} />
          <StatCard testid="data-lake-kpi-last"
            label="Último ETL"
            value={fmtRel(runsTally.last_run?.run_at)}
            sub={runsTally.last_run?.status || '—'} />
          <StatCard testid="data-lake-kpi-validation"
            label="Salud validación · R²"
            value={validation.avgR2 != null ? validation.avgR2.toFixed(3) : '—'}
            sub={`${validation.latest.length} modelos`}
            accent={validation.avgR2 != null && validation.avgR2 < 0.7
              ? 'rgba(250,204,21,0.30)' : 'rgba(74,222,128,0.20)'} />
        </div>

        {/* 2 sections */}
        <div className="data-lake-grid" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <div>
            <div style={{
              marginBottom: 8,
              fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'rgba(240,235,224,0.55)',
            }}>ETL Runs ({runsTally.total})</div>
            {loading ? (
              <div data-testid="data-lake-loading-runs" style={{
                padding: 20, fontFamily: 'DM Sans', fontSize: 12.5,
                color: 'rgba(240,235,224,0.45)',
              }}>Cargando runs…</div>
            ) : (
              <EtlRunsTable items={runs} density="compact" />
            )}
          </div>
          <div>
            <div style={{
              marginBottom: 8,
              fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'rgba(240,235,224,0.55)',
            }}>Validación de modelos</div>
            {loading ? (
              <div data-testid="data-lake-loading-val" style={{
                padding: 20, fontFamily: 'DM Sans', fontSize: 12.5,
                color: 'rgba(240,235,224,0.45)',
              }}>Cargando validaciones…</div>
            ) : (
              <ValidationMetricsTable items={validation.latest}
                avgR2={validation.avgR2} />
            )}
          </div>
        </div>

        <CoveragePanel items={coverage} />

        {confirming && (
          <ConfirmTriggerModal
            onConfirm={onTrigger}
            onClose={() => setConfirming(false)}
            busy={busy}
          />
        )}
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .data-lake-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperadminLayout>
  );
}
