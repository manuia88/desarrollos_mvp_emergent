// W3.2 SuperadminTransactionNetwork — Main page
// Route: /superadmin/transactions
// Layout: KPI strip + 2-col (60% Feed | 40% Price Index) + bottom Heatmap
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Upload, Network } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import TransactionFeed from '../../components/superadmin/TransactionFeed';
import PriceIndexChart from '../../components/superadmin/PriceIndexChart';
import CubeHeatmap from '../../components/superadmin/CubeHeatmap';
import {
  getStats, manualIngestCSV, getPriceIndexHeatmap, detectAnomaly,
} from '../../api/superadminTransactionNetwork';

function fmtNum(v, decimals = 0) {
  if (v == null) return '—';
  return typeof v === 'number'
    ? v.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v;
}

// ─── CSV Upload Modal ──────────────────────────────────────────────────────────
function IngestModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState('bulk_ingest');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const go = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await manualIngestCSV(file, source);
      setResult(res);
      if (res.inserted > 0) onDone();
    } catch (e) {
      setResult({ error: e.message });
    } finally { setLoading(false); }
  };

  return (
    <div
      data-testid="ingest-modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(6,8,15,0.80)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        data-testid="ingest-modal"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, padding: 28, borderRadius: 18, background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
          Importar transacciones CSV
        </div>

        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.6 }}>
          CSV con columnas: <code style={{ color: 'var(--theme)' }}>zone_id, closing_price_mxn, closed_at</code> (obligatorias)
          + <code style={{ color: 'rgba(240,235,224,0.5)' }}>m2, recamaras, listed_price_mxn, property_type, lat, lng</code> (opcionales)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            data-testid="ingest-file-input"
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            style={{ padding: '10px 18px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.12)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            <Upload size={13} />
            {file ? file.name : 'Seleccionar archivo .csv'}
          </button>

          <select
            data-testid="ingest-source-select"
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12 }}
          >
            <option value="bulk_ingest">Importación masiva</option>
            <option value="notary_partner">Notaría partner</option>
            <option value="dev_self_report">Desarrollador self-report</option>
          </select>
        </div>

        {result && !result.error && (
          <div data-testid="ingest-result" style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: '#86efac' }}>
              Importación completada
            </div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>
              Insertados: {result.inserted} · Omitidos: {result.skipped_duplicates} · Errores: {result.errors?.length || 0}
            </div>
            {result.errors?.length > 0 && (
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#fca5a5', marginTop: 4 }}>
                {result.errors.slice(0, 3).join(' | ')}
              </div>
            )}
          </div>
        )}
        {result?.error && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {result.error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9999, background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            data-testid="ingest-submit-btn"
            onClick={go}
            disabled={!file || loading}
            style={{ padding: '8px 20px', borderRadius: 9999, background: loading ? 'rgba(var(--theme-rgb),0.15)' : 'rgba(var(--theme-rgb),0.25)', border: '1px solid rgba(var(--theme-rgb),0.5)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
          >
            {loading ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Chip ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }) {
  return (
    <div style={{ flex: '1 1 140px', padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Zone selector ─────────────────────────────────────────────────────────────
const ZONE_SAMPLES = ['polanco', 'condesa', 'roma', 'santa_fe', 'napoles', 'iztapalapa'];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperadminTransactionNetwork({ user, onLogout }) {
  const [stats, setStats]           = useState(null);
  const [showIngest, setShowIngest] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [selectedZone, setSelectedZone] = useState('');
  const [refresh, setRefresh]       = useState(0);

  const loadStats = useCallback(async () => {
    try { setStats(await getStats()); } catch {}
  }, []);

  const loadHeatmap = useCallback(async () => {
    try {
      const fc = await getPriceIndexHeatmap({ metric: 'median_price_per_m2' });
      // Transform to CubeHeatmap format: { lat, lng, value, name }
      setHeatmapData(
        (fc.features || []).map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          value: f.properties.value || 0,
          name: f.properties.name,
          units_total: f.properties.transactions_count || 0,
        }))
      );
    } catch {}
  }, []);

  useEffect(() => { loadStats(); loadHeatmap(); }, [loadStats, loadHeatmap, refresh]); // eslint-disable-line

  const topZone = stats?.top_zones_velocity?.[0];

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="transaction-network-page" style={{ padding: '24px 0', maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <PageHeader
            eyebrow="W3.2 · ZZ.2 Transaction Network"
            title="Transaction Network"
            sub="Closings anonimizados verificados · Fundamento para DRPI (W3.3) y Fraud Detection (W3.4)"
          />
          <button
            data-testid="open-ingest-modal-btn"
            onClick={() => setShowIngest(true)}
            style={{ padding: '10px 20px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={12} />
            Manual ingest CSV
          </button>
        </div>

        {/* KPI Strip */}
        <div data-testid="txn-kpi-strip" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Total verificadas" value={fmtNum(stats?.total_verified)} sub="transacciones anonimizadas" />
          <KpiCard label="DOM promedio" value={stats?.avg_dom != null ? `${stats.avg_dom}d` : '—'} sub="días en mercado" />
          <KpiCard label="Descuento promedio" value={stats?.avg_discount_pct != null ? `${stats.avg_discount_pct > 0 ? '+' : ''}${fmtNum(stats.avg_discount_pct, 1)}%` : '—'} sub="lista vs cierre" />
          <KpiCard
            label="Top zona velocidad"
            value={topZone?.zone_id || '—'}
            sub={topZone ? `${topZone.count} closings (30d)` : 'sin datos'}
          />
        </div>

        {/* Zone filter bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Zona:</span>
          <button
            onClick={() => setSelectedZone('')}
            style={{ padding: '4px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer', background: !selectedZone ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${!selectedZone ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.08)'}`, color: !selectedZone ? 'var(--theme)' : 'var(--cream-3)' }}
          >
            Todas
          </button>
          {ZONE_SAMPLES.map(z => (
            <button
              key={z}
              data-testid={`zone-filter-${z}`}
              onClick={() => setSelectedZone(selectedZone === z ? '' : z)}
              style={{ padding: '4px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer', background: selectedZone === z ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedZone === z ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.08)'}`, color: selectedZone === z ? 'var(--theme)' : 'var(--cream-3)' }}
            >
              {z}
            </button>
          ))}
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          {/* Left 60%: Feed */}
          <Card style={{ flex: '1 1 360px' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 14 }}>
              Últimas transacciones
              {selectedZone && <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 6 }}>· {selectedZone}</span>}
            </div>
            <TransactionFeed zone_id={selectedZone} key={refresh} />
          </Card>

          {/* Right 40%: Price Index Chart */}
          <Card style={{ flex: '1 1 260px' }}>
            <PriceIndexChart zone_id={selectedZone || 'polanco'} />
          </Card>
        </div>

        {/* Bottom row: Heatmap mini */}
        {heatmapData && heatmapData.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 12 }}>
              Heatmap precio mediano / m² por zona
            </div>
            <CubeHeatmap
              points={heatmapData}
              metric="Precio/m²"
              colorGradient={['#22C55E', '#F59E0B', '#EF4444']}
            />
          </Card>
        )}

        {/* Anomaly checker (collapsible panel) */}
        <AnomalyChecker />
      </div>

      {showIngest && (
        <IngestModal
          onClose={() => setShowIngest(false)}
          onDone={() => { setShowIngest(false); setRefresh(r => r + 1); loadStats(); }}
        />
      )}
    </SuperadminLayout>
  );
}

// ─── Anomaly Checker (inline tool) ────────────────────────────────────────────
function AnomalyChecker() {
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState({ zone_id: 'polanco', property_type: 'depto', m2: '100', listing_price_mxn: '3000000' });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const body = {
        zone_id: form.zone_id,
        property_type: form.property_type,
        m2: parseFloat(form.m2) || 80,
        listing_price_mxn: parseFloat(form.listing_price_mxn) || 0,
      };
      setResult(await detectAnomaly(body));
    } catch (e) {
      setResult({ error: e.message });
    } finally { setLoading(false); }
  };

  const SEVERITY_COLOR = { ok: '#22C55E', amber: '#F59E0B', red: '#EF4444' };

  return (
    <Card>
      <button
        data-testid="anomaly-checker-toggle"
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
          Detector de anomalía de precio (W3.4 foundation)
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { key: 'zone_id', label: 'Zona', placeholder: 'polanco' },
              { key: 'm2', label: 'm²', placeholder: '100' },
              { key: 'listing_price_mxn', label: 'Precio lista (MXN)', placeholder: '3000000' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ flex: '1 1 120px' }}>
                <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>{label}</label>
                <input
                  data-testid={`anomaly-${key}`}
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                data-testid="anomaly-check-btn"
                onClick={check}
                disabled={loading}
                style={{ padding: '6px 18px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}
              >
                {loading ? 'Analizando…' : 'Verificar'}
              </button>
            </div>
          </div>

          {result && !result.error && (
            <div
              data-testid="anomaly-result"
              style={{ padding: '12px 16px', borderRadius: 12, background: `${SEVERITY_COLOR[result.severity] || 'var(--theme)'}15`, border: `1px solid ${SEVERITY_COLOR[result.severity] || 'var(--theme)'}35` }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: SEVERITY_COLOR[result.severity], textTransform: 'uppercase' }}>
                  {result.severity}
                </span>
                {result.deviation_pct != null && (
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream-2)' }}>
                    {result.deviation_pct > 0 ? '+' : ''}{result.deviation_pct}% vs mediana
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                {result.reasoning}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.35)', marginTop: 6 }}>
                Comparables: {result.comparables_count} · Mediana: ${result.median_comparable_per_m2?.toLocaleString('es-MX')}/m²
              </div>
            </div>
          )}
          {result?.error && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {result.error}</div>
          )}
        </div>
      )}
    </Card>
  );
}
