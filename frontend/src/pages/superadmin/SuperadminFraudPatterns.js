/**
 * W5.11 Parte 2 — SuperadminFraudPatterns
 * Ruta: /superadmin/fraud-patterns
 *
 * Lista patrones detectados en `broker_fraud_patterns` (asesores que han
 * intentado registrar múltiples leads duplicados en una ventana de 30 días).
 * Muestra `pattern_count_30d` + sample_attempts y permite expandir para ver
 * detalles de cada intento (timestamp, lead_id, score, decision).
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from "../../components/superadmin/SuperadminLayout";
import { PageHeader, Card, Empty, Badge } from '../../components/advisor/primitives';
import { listFraudPatterns } from '../../api/entity_resolution';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Shield, User } from 'lucide-react';

function severityTone(count) {
  if (count >= 10) return 'danger';
  if (count >= 5)  return 'warning';
  if (count >= 3)  return 'info';
  return 'neutral';
}

function severityLabel(count) {
  if (count >= 10) return 'CRITICO';
  if (count >= 5)  return 'ALTO';
  if (count >= 3)  return 'MEDIO';
  return 'BAJO';
}

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

function PatternRow({ row }) {
  const [open, setOpen] = useState(false);
  const samples = row.sample_attempts || [];

  return (
    <Card style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      <div
        data-testid={`fraud-row-${row.asesor_id}`}
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
        }}>
        <div style={{ flex: '0 0 auto' }}>
          {open ? <ChevronUp size={14} color="var(--cream-3)" /> : <ChevronDown size={14} color="var(--cream-3)" />}
        </div>
        <div style={{ flex: '0 0 90px' }}>
          <Badge tone={severityTone(row.pattern_count_30d || 0)}>
            {severityLabel(row.pattern_count_30d || 0)}
          </Badge>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={12} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)' }}>
            {row.asesor_id}
          </span>
          {row.asesor_name && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              · {row.asesor_name}
            </span>
          )}
        </div>
        <div style={{ flex: '0 0 130px', textAlign: 'right' }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: '#fda4af' }}>
            {row.pattern_count_30d || 0}
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginLeft: 4 }}>
            intentos 30d
          </span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '4px 16px 18px 50px' }}>
          {samples.length === 0 ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: '10px 0' }}>
              Sin muestras de intentos disponibles.
            </div>
          ) : (
            <table data-testid={`fraud-samples-${row.asesor_id}`} style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 11, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Lead ID</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Coincide con</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream-3)', fontWeight: 600 }}>Score</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Decisión</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                      {(s.attempted_at || s.timestamp || '').slice(0, 19).replace('T', ' ')}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--theme-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{s.lead_id || s.entity_id || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#93c5fd', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{s.matched_with || s.canonical_id || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream)', fontWeight: 700 }}>
                      {s.score != null ? Number(s.score).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: s.decision === 'blocked' ? '#fca5a5' : s.decision === 'flagged' ? '#fcd34d' : 'var(--cream-3)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                      {s.decision || 'pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {row.first_detected_at && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 10 }}>
              Primer detectado: {row.first_detected_at.slice(0, 19).replace('T', ' ')} · Última actualización: {(row.last_updated_at || row.updated_at || '').slice(0, 19).replace('T', ' ') || '—'}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function SuperadminFraudPatterns({ user, onLogout, embedded }) {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [limit, setLimit]       = useState(20);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listFraudPatterns(limit);
      if (r.detail) setError(r.detail);
      else setPatterns(r.fraud_patterns || []);
    } catch { setError('Error de red al cargar patrones'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [limit]);

  const critical = patterns.filter(p => (p.pattern_count_30d || 0) >= 10).length;
  const high     = patterns.filter(p => (p.pattern_count_30d || 0) >= 5 && (p.pattern_count_30d || 0) < 10).length;

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader
        eyebrow="SUPERADMIN · FRAUD PATTERNS"
        title="Patrones de fraude broker"
        sub="Asesores con intentos repetidos de registrar leads duplicados (ventana 30 dias)."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {[20, 50, 100].map(n => (
              <button
                key={n}
                data-testid={`fraud-limit-${n}`}
                onClick={() => setLimit(n)}
                style={pillStyle(limit === n)}>
                Top {n}
              </button>
            ))}
            <button
              data-testid="fraud-reload-btn"
              onClick={load}
              disabled={loading}
              style={pillStyle(false)}>
              <RefreshCw size={11} style={{ marginRight: 4 }} /> Recargar
            </button>
          </div>
        }
      />

      {/* KPI strip */}
      <div data-testid="fraud-kpi-strip" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Card style={{ flex: '1 1 160px', minWidth: 140 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Shield size={13} color="#fca5a5" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Críticos</span>
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#fca5a5' }}>{critical}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{'>=10'} intentos</div>
        </Card>
        <Card style={{ flex: '1 1 160px', minWidth: 140 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={13} color="#fcd34d" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Altos</span>
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#fcd34d' }}>{high}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>5-9 intentos</div>
        </Card>
        <Card style={{ flex: '1 1 160px', minWidth: 140 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <User size={13} color="var(--theme-2)" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total brokers</span>
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--theme-2)' }}>{patterns.length}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>con patrón activo</div>
        </Card>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13, marginBottom: 16,
        }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando patrones…
        </div>
      ) : patterns.length === 0 ? (
        <Empty title="Sin patrones detectados" sub="Ningun asesor presenta intentos duplicados en los ultimos 30 dias." />
      ) : (
        <div data-testid="fraud-patterns-list">
          {patterns.map(p => <PatternRow key={p.asesor_id} row={p} />)}
        </div>
      )}
    </SuperadminLayout>
  );
}
