// W3.2 TransactionFeed — anonymized transaction list with filter chips
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listTransactions } from '../../api/superadminTransactionNetwork';

const FILTER_TYPES = ['depto', 'casa', 'loft', 'town', 'PH'];
const FILTER_SOURCES = ['dmx_native', 'dev_self_report', 'notary_partner', 'bulk_ingest'];
const SOURCE_LABEL = {
  dmx_native: 'DMX', dev_self_report: 'Desarrollador',
  notary_partner: 'Notaría', bulk_ingest: 'Importación',
};
const SOURCE_COLOR = {
  dmx_native: 'var(--theme)', dev_self_report: 'var(--theme)',
  notary_partner: '#22C55E', bulk_ingest: '#F59E0B',
};

function fmtMXN(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

function relative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}min`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d`;
  return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
}

function DiscountBadge({ pct }) {
  if (pct == null) return null;
  const isDown = pct < -10;
  const isUp = pct > 5;
  if (!isDown && !isUp) return null;
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 9999,
      background: isDown ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
      color: isDown ? '#fca5a5' : '#86efac',
      fontFamily: 'DM Mono, monospace', fontSize: 10,
      border: `1px solid ${isDown ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
    }}>
      {pct > 0 ? '+' : ''}{pct?.toFixed(1)}%
    </span>
  );
}

function SourcePill({ source }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999,
      background: `${SOURCE_COLOR[source]}20` || 'rgba(var(--theme-rgb),0.12)',
      color: SOURCE_COLOR[source] || 'var(--theme)',
      fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
      border: `1px solid ${SOURCE_COLOR[source]}40`,
    }}>
      {SOURCE_LABEL[source] || source}
    </span>
  );
}

function TypePill({ type }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999,
      background: 'rgba(var(--theme-rgb),0.10)',
      border: '1px solid rgba(var(--theme-rgb),0.22)',
      color: 'var(--theme)',
      fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
    }}>
      {type}
    </span>
  );
}

function ChipFilter({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 9999, cursor: 'pointer',
        background: active ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? 'var(--theme)' : 'var(--cream-3)',
        fontFamily: 'DM Sans', fontSize: 11, transition: 'all 180ms',
      }}
    >
      {label}
    </button>
  );
}

export default function TransactionFeed({ zone_id }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gated, setGated] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setGated(null);
    try {
      const res = await listTransactions({
        zone_id: zone_id || undefined,
        type: filterType || undefined,
        limit: 50,
      });
      if (res.available === false) {
        setGated(res);
        setItems([]);
      } else {
        setItems(res.items || []);
        setTotal(res.count_total || 0);
      }
    } catch {}
    finally { setLoading(false); }
  }, [zone_id, filterType, filterSource]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(it => !filterSource || it.source === filterSource);

  return (
    <div data-testid="transaction-feed" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <ChipFilter label="Todos" active={!filterType} onClick={() => setFilterType('')} />
        {FILTER_TYPES.map(t => (
          <ChipFilter key={t} label={t} active={filterType === t} onClick={() => setFilterType(t === filterType ? '' : t)} />
        ))}
        <span style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        {FILTER_SOURCES.map(s => (
          <ChipFilter key={s} label={SOURCE_LABEL[s]} active={filterSource === s} onClick={() => setFilterSource(s === filterSource ? '' : s)} />
        ))}
      </div>

      {/* k-anonymity gate */}
      {gated && (
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: '#fcd34d', marginBottom: 4 }}>
            Datos no disponibles — {gated.reason}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            Esta zona tiene {gated.current_count}/{gated.required_min} transacciones mínimas para publicar datos.
            Política LFPDPPP — k-anonimato.
          </div>
          <Link
            to={`/superadmin/transactions`}
            style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--theme)', marginTop: 6, display: 'block' }}
          >
            Ver todas las zonas
          </Link>
        </div>
      )}

      {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 12 }}>Cargando…</div>}

      {!loading && !gated && filtered.length === 0 && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 20, textAlign: 'center' }}>
          Sin transacciones verificadas. Importa datos con "Manual ingest CSV".
        </div>
      )}

      {/* Mobile: timeline — Desktop: table */}
      {!gated && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div style={{ overflowX: 'auto', display: 'none' }}
            className="txn-table-desktop">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {['Cierre', 'Zona', 'Tipo', 'm²', 'Lista → Cierre', 'DOM', 'Fuente', 'Conf.'].map(h => (
                    <th key={h} style={{
                      padding: '7px 10px', textAlign: 'left',
                      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
                      color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase',
                      letterSpacing: '0.07em', borderBottom: '1px solid rgba(255,255,255,0.07)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, i) => (
                  <tr key={tx.anonymized_id || i}
                    data-testid={`txn-row-${i}`}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 160ms' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
                      {relative(tx.closed_at)}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>
                      {tx.zone_id}
                    </td>
                    <td style={{ padding: '7px 10px' }}><TypePill type={tx.property_type} /></td>
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)', textAlign: 'right' }}>
                      {tx.m2 ? `${tx.m2}m²` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                        {fmtMXN(tx.listed_price_mxn)}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>→</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)' }}>
                        {fmtMXN(tx.closing_price_mxn)}
                      </span>
                      {' '}
                      <DiscountBadge pct={tx.discount_pct} />
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3)', textAlign: 'right' }}>
                      {tx.days_on_market != null ? `${tx.days_on_market}d` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px' }}><SourcePill source={tx.source} /></td>
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textAlign: 'right' }}>
                      {tx.confidence_score}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile timeline (always visible, table hidden on mobile via max-width CSS) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((tx, i) => (
              <div
                key={tx.anonymized_id || i}
                data-testid={`txn-card-${i}`}
                style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
                  transition: 'transform 180ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TypePill type={tx.property_type} />
                    <SourcePill source={tx.source} />
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                      {relative(tx.closed_at)}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                    {tx.zone_id}
                    {tx.m2 ? ` · ${tx.m2}m²` : ''}
                    {tx.recamaras ? ` · ${tx.recamaras} rec` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                    {fmtMXN(tx.closing_price_mxn)}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {tx.listed_price_mxn && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'rgba(240,235,224,0.4)', textDecoration: 'line-through' }}>
                        {fmtMXN(tx.listed_price_mxn)}
                      </span>
                    )}
                    <DiscountBadge pct={tx.discount_pct} />
                  </div>
                  {tx.days_on_market != null && (
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                      DOM {tx.days_on_market}d
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.35)', marginTop: 4 }}>
            Mostrando {filtered.length} de {total} transacciones verificadas · Datos anonimizados (LFPDPPP)
          </div>
        </>
      )}
    </div>
  );
}
