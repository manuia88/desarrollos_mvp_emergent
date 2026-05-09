// W3.8 — /superadmin/cross-sell-analytics — Funnel + Revenue dashboard
import React, { useEffect, useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { getCrossSellAnalytics, createRevenueEvent } from '../../api/superadminPartners';

const FUNNEL_STAGES = [
  { id: 'presented',               label: 'Presentadas' },
  { id: 'clicked',                 label: 'Clics' },
  { id: 'lead_captured',           label: 'Lead capturado' },
  { id: 'sent_to_partner',         label: 'Enviado partner' },
  { id: 'partner_contacted_buyer', label: 'Partner contactó' },
  { id: 'closed',                  label: 'Cerradas' },
];

const COLORS = ['#6366F1', '#818CF8', '#A78BFA', '#C084FC', '#E879F9', '#EC4899'];

const kpiCard = (label, value, sub) => (
  <div key={label} style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '14px 18px',
  }}>
    <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
    <p style={{ fontFamily: 'Outfit', fontWeight: 900, fontSize: 24, color: 'var(--cream)', margin: 0 }}>{value ?? '—'}</p>
    {sub && <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '4px 0 0' }}>{sub}</p>}
  </div>
);

export default function SuperadminCrossSellAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [revenueForm, setRevenueForm] = useState({ partner_offer_id: '', revenue_mxn: '', notes: '' });
  const [submittingRev, setSubmittingRev] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getCrossSellAnalytics(days);
      setData(r);
    } catch (e) {
      console.error('[analytics]', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const handleRevenueSubmit = async (e) => {
    e.preventDefault();
    if (!revenueForm.partner_offer_id || !revenueForm.revenue_mxn) return;
    setSubmittingRev(true);
    try {
      await createRevenueEvent({
        partner_offer_id: revenueForm.partner_offer_id,
        revenue_mxn: Number(revenueForm.revenue_mxn),
        notes: revenueForm.notes || undefined,
      });
      setRevenueForm({ partner_offer_id: '', revenue_mxn: '', notes: '' });
      await load();
      alert('Evento de ingreso registrado correctamente.');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingRev(false);
    }
  };

  const exportCsv = () => {
    if (!data?.revenue_by_partner?.length) return;
    const header = 'partner_id,partner_name,partner_type,revenue_events,revenue_dmx_mxn';
    const rows = data.revenue_by_partner.map(r =>
      [r.partner_id, r.partner_name, r.partner_type, r.revenue_events, r.revenue_dmx_mxn].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `cross_sell_analytics_${days}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const funnel = data?.funnel || {};
  const rates = data?.conversion_rates || {};
  const maxFunnel = Math.max(...Object.values(funnel), 1);

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.8 · Cross-sell Intelligence"
        title="Analytics"
        sub="Funnel de conversión · Revenue por partner · Top propiedades"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, padding: '7px 10px' }}>
              {[7,30,90,365].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
            <button onClick={load} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 9999, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Actualizar
            </button>
            <button onClick={exportCsv}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 9999, cursor: 'pointer' }}>
              <Download size={13} /> CSV
            </button>
          </div>
        }
      />

      {/* KPI summary */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 24 }}>
        {kpiCard('Presentadas', funnel.presented, `últimos ${days}d`)}
        {kpiCard('Lead capturado', funnel.lead_captured)}
        {kpiCard('Enviados partner', funnel.sent_to_partner)}
        {kpiCard('Cerradas', funnel.closed)}
        {kpiCard('Conv. total', funnel.presented > 0 ? `${rates.closed}%` : '0%', 'Presentadas → Cerradas')}
      </div>

      {/* Funnel chart (bar-based) */}
      <div data-testid="funnel-chart" style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '20px 24px',
        marginBottom: 24,
      }}>
        <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 18px' }}>
          Funnel de conversión
        </p>
        {loading ? (
          <p style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FUNNEL_STAGES.map((stage, i) => {
              const count = funnel[stage.id] || 0;
              const rate = rates[stage.id] || 0;
              const barW = maxFunnel > 0 ? (count / maxFunnel) * 100 : 0;
              return (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 140, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', flexShrink: 0 }}>
                    {stage.label}
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 24, overflow: 'hidden' }}>
                    <div style={{
                      width: `${barW}%`, height: '100%',
                      background: COLORS[i],
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                      display: 'flex', alignItems: 'center', paddingLeft: 8,
                    }}>
                      {count > 0 && <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: '#fff', whiteSpace: 'nowrap' }}>{count}</span>}
                    </div>
                  </div>
                  <div style={{ width: 52, textAlign: 'right', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: COLORS[i] }}>
                    {rate}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revenue per partner */}
      {data?.revenue_by_partner?.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '20px 24px',
          marginBottom: 24,
        }}>
          <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>Revenue por partner</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Partner', 'Tipo', 'Eventos', 'Revenue (MXN)'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.revenue_by_partner.map(r => (
                <tr key={r.partner_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 8px', color: 'var(--cream)' }}>{r.partner_name}</td>
                  <td style={{ padding: '8px 8px', color: 'var(--cream-3)' }}>{r.partner_type}</td>
                  <td style={{ padding: '8px 8px', color: 'var(--cream-2)', textAlign: 'right' }}>{r.revenue_events}</td>
                  <td style={{ padding: '8px 8px', color: '#6ee7b7', textAlign: 'right', fontWeight: 700 }}>
                    {r.revenue_dmx_mxn ? `$${r.revenue_dmx_mxn.toLocaleString('es-MX')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top properties */}
      {data?.top_properties?.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '20px 24px',
          marginBottom: 24,
        }}>
          <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>Top propiedades (leads generados)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.top_properties.map((p, i) => (
              <div key={p.property_id_hash} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                  #{i + 1} · <code style={{ fontSize: 11 }}>{p.property_id_hash}</code>
                </span>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#a5b4fc' }}>{p.leads} leads</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual revenue event */}
      <div style={{
        background: 'rgba(16,185,129,0.04)',
        border: '1px solid rgba(16,185,129,0.15)',
        borderRadius: 12, padding: '20px 24px',
      }}>
        <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 14px' }}>
          Registrar ingreso manual
        </p>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '0 0 14px' }}>
          Cuando un partner reporta un cierre off-platform (email/llamada), registra el ingreso aquí.
        </p>
        <form onSubmit={handleRevenueSubmit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>ID Oferta (offer_id)</label>
            <input
              data-testid="revenue-offer-id-input"
              required value={revenueForm.partner_offer_id}
              onChange={e => setRevenueForm(r => ({ ...r, partner_offer_id: e.target.value }))}
              placeholder="off_XXXXXXXX"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>Revenue DMX (MXN)</label>
            <input
              data-testid="revenue-amount-input"
              required type="number" min="0" step="0.01"
              value={revenueForm.revenue_mxn}
              onChange={e => setRevenueForm(r => ({ ...r, revenue_mxn: e.target.value }))}
              placeholder="Ej: 1500"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              data-testid="revenue-submit-btn"
              type="submit" disabled={submittingRev}
              style={{ background: submittingRev ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '9px 22px', borderRadius: 9999, cursor: 'pointer' }}
            >
              {submittingRev ? 'Registrando…' : 'Registrar ingreso'}
            </button>
          </div>
        </form>
      </div>
    </SuperadminLayout>
  );
}
