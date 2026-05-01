// /desarrollador/pricing — D4 Dynamic Pricing AI
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import * as docsApi from '../../api/documents';
import { Sparkle, AlertTriangle } from '../../components/icons';

export default function DesarrolladorPricing({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [warnings, setWarnings] = useState({ blocked_count: 0, blocked: [] });

  const load = async () => {
    setLoading(true);
    try { setItems(await api.listPricing()); } finally { setLoading(false); }
    // GC-X4 — fetch cross-check warnings
    docsApi.getPricingCrossCheckWarnings()
      .then(setWarnings)
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const act = async (sid, status) => {
    try {
      await api.actPricing(sid, { status });
      setToast({ kind: 'success', text: `Sugerencia ${status}` });
      load();
    } catch (e) {
      // GC-X4 surfaces 409 from backend
      const msg = e?.body?.detail?.message || e?.body?.detail || 'Error';
      setToast({ kind: 'error', text: msg });
      load();
    }
  };

  const filtered = items.filter(x => filter === 'all' || x.status === filter);
  const stats = {
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    applied: items.filter(i => i.status === 'applied').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D4 · DYNAMIC PRICING AI"
        title="Sugerencias de precio"
        sub="Razonamiento explícito por unidad. Triggers automáticos por demanda y tiempo en mercado. Aprobación manual del director comercial antes de aplicar."
      />

      {warnings.blocked_count > 0 && (
        <div data-testid="pricing-cc-banner" style={{
          padding: 14, marginBottom: 14, borderRadius: 12,
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertTriangle size={16} color="#fca5a5" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
              Cross-check crítico activo · {warnings.blocked_count} desarrollo{warnings.blocked_count === 1 ? '' : 's'} bloqueado{warnings.blocked_count === 1 ? '' : 's'}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              Resuelve las inconsistencias críticas de los siguientes desarrollos antes de aplicar cambios de precio:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {warnings.blocked.map(b => (
                <span key={b.dev_id} data-testid={`pricing-cc-blocked-${b.dev_id}`} style={{
                  padding: '4px 12px', borderRadius: 9999,
                  background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.32)',
                  color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
                }}>{b.dev_name} · {b.count} regla{b.count === 1 ? '' : 's'}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { k: 'pending', l: `Pendientes (${stats.pending})` },
          { k: 'approved', l: `Aprobadas (${stats.approved})` },
          { k: 'applied', l: `Aplicadas (${stats.applied})` },
          { k: 'rejected', l: `Rechazadas (${stats.rejected})` },
          { k: 'all', l: 'Todas' },
        ].map(o => (
          <button key={o.k} onClick={() => setFilter(o.k)} data-testid={`pf-${o.k}`}
            className={`filter-chip${filter === o.k ? ' active' : ''}`}>
            {o.l}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : filtered.length === 0 ? <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Sin sugerencias en este filtro.</Card>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(s => (
              <Card key={s.id} data-testid={`sug-${s.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <Badge tone={s.direction === 'up' ? 'ok' : 'bad'}>
                        {s.direction === 'up' ? '↑' : '↓'} {Math.abs(s.delta_pct)}%
                      </Badge>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--cream-3)' }}>{s.unit_number} · {s.prototype}</span>
                      <Badge tone={s.status === 'pending' ? 'warn' : s.status === 'approved' ? 'brand' : s.status === 'applied' ? 'ok' : 'neutral'}>{s.status}</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', textDecoration: 'line-through' }}>
                        {fmtMXN(s.current_price)}
                      </div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.018em' }}>
                        → {fmtMXN(s.suggested_price)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {s.reasons.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                          <Sparkle size={10} color="var(--cream-3)" />
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                  {s.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => act(s.id, 'rejected')} data-testid={`rej-${s.id}`} className="btn btn-glass btn-sm">Rechazar</button>
                      <button onClick={() => act(s.id, 'approved')} data-testid={`app-${s.id}`} className="btn btn-glass btn-sm">Aprobar</button>
                      <button onClick={() => act(s.id, 'applied')} data-testid={`apl-${s.id}`} className="btn btn-primary btn-sm">Aplicar</button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}
