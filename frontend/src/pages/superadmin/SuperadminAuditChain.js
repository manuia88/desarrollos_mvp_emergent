/**
 * W5.11 Parte 2 — SuperadminAuditChain
 * Ruta: /superadmin/audit-chain
 *
 * Permite verificar la integridad de la cadena `audit_immutable`
 * (SHA-256 chained / Merkle-like) y consultar entradas por filtros.
 * Si la verificación encuentra ruptura, muestra el primer eslabón roto
 * con detalle (expected vs actual checksum, prev_checksum, índice).
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from "../../components/superadmin/SuperadminLayout";
import { PageHeader, Card, Empty, Badge } from '../../components/advisor/primitives';
import { verifyAuditChain, queryAuditLog, exportAuditLog } from '../../api/entity_resolution';
import { getAiActivity } from '../../api/superadminAudit';   // D (B3): actividad de IA vs humano
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  Hash,
  Link2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';

function pillStyle(active) {
  return {
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'DM Sans',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(var(--theme-rgb),0.22)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid var(--border)',
    color: active ? 'var(--theme-2)' : 'var(--cream-2)',
    transition: 'all 0.15s',
  };
}

function inputStyle() {
  return {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    color: 'var(--cream)',
    fontFamily: 'DM Mono, monospace',
    fontSize: 11,
    width: '100%',
  };
}

function shortHash(h) {
  if (!h) return '—';
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

export default function SuperadminAuditChain({ user, onLogout }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  // Query
  const [filters, setFilters] = useState({
    entity_id: '', entity_type: '', actor_user_id: '', action: '',
    date_from: '', date_to: '',
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const r = await verifyAuditChain({});
      if (r.detail) setVerifyError(r.detail);
      else setVerifyResult(r);
    } catch { setVerifyError('Error de red en verify-chain'); }
    finally { setVerifying(false); }
  };

  const handleQuery = async () => {
    setLoadingRows(true);
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
      const r = await queryAuditLog({ ...clean, limit: 100, skip: 0 });
      if (r.detail) {
        setRows([]); setTotal(0);
      } else {
        setRows(r.audit_log || []);
        setTotal(r.count || 0);
      }
    } catch { setRows([]); setTotal(0); }
    finally { setLoadingRows(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await exportAuditLog();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_immutable_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  };

  // Auto-verificar al entrar
  const [aiAct, setAiAct] = useState(null);
  useEffect(() => { handleVerify(); getAiActivity(7).then(setAiAct).catch(() => setAiAct(false)); /* eslint-disable-next-line */ }, []);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="SUPERADMIN · AUDIT CHAIN"
        title="Verificacion de cadena inmutable"
        sub="Cadena SHA-256 sobre audit_immutable. Cada entrada referencia el checksum previo. Verificación detecta tampering."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="verify-chain-btn"
              onClick={handleVerify}
              disabled={verifying}
              style={pillStyle(true)}>
              <ShieldCheck size={11} style={{ marginRight: 4 }} />
              {verifying ? 'Verificando…' : 'Verificar cadena'}
            </button>
            <button
              data-testid="export-audit-btn"
              onClick={handleExport}
              disabled={exporting}
              style={pillStyle(false)}>
              <Download size={11} style={{ marginRight: 4 }} />
              {exporting ? 'Exportando…' : 'Exportar JSON'}
            </button>
          </div>
        }
      />

      {/* D (B3) · Actividad de IA — qué decide/muta la IA vs humanos (clave antes de prender la capa agéntica) */}
      {aiAct && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Actividad de IA</span>
            <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>últimos {aiAct.ventana_dias} días · agentes que deciden/mutan vs humanos</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono,monospace', fontSize: 13, fontWeight: 700, color: 'var(--theme,#6D4AFF)' }}>{aiAct.ia_pct}% IA</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
            <div><div style={{ fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Acciones IA</div><div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--cream)' }}>{aiAct.ia}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Acciones humanas</div><div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--cream)' }}>{aiAct.humano}</div></div>
          </div>
          {(aiAct.por_agente || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Por agente</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {aiAct.por_agente.map((a, i) => (
                  <span key={i} style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', background: 'rgba(var(--cream-rgb),0.06)', borderRadius: 9999, padding: '3px 10px' }}>{a.agente} · {a.acciones}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Verification panel */}
      <Card style={{ marginBottom: 20 }}>
        {verifying && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Verificando cadena…
          </div>
        )}

        {verifyError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8, padding: '12px 14px', color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13,
          }}>
            <AlertTriangle size={14} /> {verifyError}
          </div>
        )}

        {verifyResult && !verifying && (
          <div data-testid="verify-result">
            {verifyResult.valid ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.30)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 14,
              }}>
                <CheckCircle2 size={22} color="#86efac" />
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#86efac' }}>
                    Cadena válida
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    {verifyResult.rows_checked ?? 0} entradas verificadas · sin rupturas detectadas
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.35)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 14,
              }}>
                <X size={22} color="#fda4af" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#fda4af' }}>
                    Cadena ROTA · posible tampering
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6 }}>
                    {verifyResult.rows_checked ?? 0} entradas revisadas antes de la ruptura.
                  </div>
                  <div style={{ marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)' }}>
                    {verifyResult.broken_at && (
                      <div>Ruptura en ID: <span style={{ color: 'var(--theme-2)' }}>{verifyResult.broken_at}</span></div>
                    )}
                    {verifyResult.reason && (
                      <div>Razón: <span style={{ color: '#fcd34d' }}>{verifyResult.reason}</span></div>
                    )}
                    {verifyResult.error && (
                      <div>Error: <span style={{ color: '#fda4af' }}>{verifyResult.error}</span></div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stats strip */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px', minWidth: 120, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase' }}>Entradas verificadas</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{verifyResult.rows_checked ?? 0}</div>
              </div>
              <div style={{ flex: '1 1 140px', minWidth: 120, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase' }}>Estado</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: verifyResult.valid ? '#86efac' : '#fda4af' }}>
                  {verifyResult.valid ? 'INTEGRA' : 'COMPROMETIDA'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Audit log query */}
      <Card>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSearch size={14} /> Consultar audit log
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Entity ID</div>
            <input data-testid="filter-entity-id" style={inputStyle()} value={filters.entity_id} onChange={e => setFilters({ ...filters, entity_id: e.target.value })} placeholder="lead_xxx" />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Entity type</div>
            <input data-testid="filter-entity-type" style={inputStyle()} value={filters.entity_type} onChange={e => setFilters({ ...filters, entity_type: e.target.value })} placeholder="lead / contacto / asesor" />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Actor user_id</div>
            <input data-testid="filter-actor" style={inputStyle()} value={filters.actor_user_id} onChange={e => setFilters({ ...filters, actor_user_id: e.target.value })} />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Action</div>
            <input data-testid="filter-action" style={inputStyle()} value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })} placeholder="merge / reject / create…" />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Desde</div>
            <input type="date" data-testid="filter-date-from" style={inputStyle()} value={filters.date_from} onChange={e => setFilters({ ...filters, date_from: e.target.value })} />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 4 }}>Hasta</div>
            <input type="date" data-testid="filter-date-to" style={inputStyle()} value={filters.date_to} onChange={e => setFilters({ ...filters, date_to: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button data-testid="audit-search-btn" onClick={handleQuery} disabled={loadingRows} style={pillStyle(true)}>
            <FileSearch size={11} style={{ marginRight: 4 }} /> Buscar
          </button>
          <button data-testid="audit-clear-btn" onClick={() => setFilters({ entity_id:'', entity_type:'', actor_user_id:'', action:'', date_from:'', date_to:'' })} style={pillStyle(false)}>
            <RefreshCw size={11} style={{ marginRight: 4 }} /> Limpiar
          </button>
        </div>

        {loadingRows ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <Empty title="Sin resultados" sub="Ajusta los filtros o ejecuta una búsqueda." />
        ) : (
          <>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 6 }}>
              Mostrando {rows.length} de {total} entradas
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="audit-log-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Timestamp</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Actor</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Action</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Entity</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Checksum</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Prev</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                        {(r.timestamp || '').slice(0, 19).replace('T', ' ')}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--theme-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                        {r.actor_user_id || '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge tone="info">{r.action || '—'}</Badge>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                        <div>{r.entity_type || '—'}</div>
                        <div style={{ color: '#93c5fd' }}>{r.entity_id || '—'}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#86efac', fontFamily: 'DM Mono, monospace', fontSize: 10 }} title={r.checksum_sha256}>
                        <Hash size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {shortHash(r.checksum_sha256)}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--cream-3)', fontFamily: 'DM Mono, monospace', fontSize: 10 }} title={r.prev_checksum}>
                        <Link2 size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {shortHash(r.prev_checksum)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </SuperadminLayout>
  );
}
