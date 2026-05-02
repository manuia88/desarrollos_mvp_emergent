/**
 * Phase 4 Batch 13 — Asesor tracking links page.
 * /asesor/links-tracking — generates unique trackable links per project + QR code + stats.
 */
import React, { useState, useEffect } from 'react';
import PortalLayout from '../../components/shared/PortalLayout';
import { KPIStrip } from '../../components/shared/KPIStrip';
import { LinkIcon, Copy, Check, BarChart3, QrCode } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function getLinks() {
  const r = await fetch(`${API}/api/asesor/tracking-links`, { credentials: 'include' });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
async function getStats() {
  const r = await fetch(`${API}/api/asesor/tracking-links/stats`, { credentials: 'include' });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
async function getQR(url) {
  const r = await fetch(`${API}/api/asesor/tracking-links/qrcode`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

function LinkRow({ item }) {
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(item.link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch (e) { console.error(e); }
  };

  const showQr = async () => {
    if (qrUrl) { setQrUrl(null); return; }
    setQrLoading(true);
    try {
      const r = await getQR(item.link);
      setQrUrl(r.data_url);
    } finally { setQrLoading(false); }
  };

  const conversionRate = item.views > 0 ? ((item.conversions / item.views) * 100).toFixed(1) : '0.0';

  return (
    <div data-testid={`link-row-${item.project_id}`}
      style={{
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 12, padding: 16, marginBottom: 10,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            {item.project_name}
          </h4>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
            {item.colonia} · <span style={{ fontFamily: 'monospace' }}>{item.entity_source}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--cream)', fontWeight: 700, fontSize: 16 }}>{item.views}</div>
            <div style={{ color: 'var(--cream-3)' }}>Vistas</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>{item.conversions}</div>
            <div style={{ color: 'var(--cream-3)' }}>Conversiones</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 16 }}>{conversionRate}%</div>
            <div style={{ color: 'var(--cream-3)' }}>Tasa</div>
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 8,
        fontFamily: 'monospace', fontSize: 11, color: 'var(--cream-2)',
        wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <LinkIcon size={12} className="shrink-0" style={{ color: 'var(--cream-3)' }} />
        <span style={{ flex: 1 }}>{item.link}</span>
        <button onClick={copy}
          data-testid={`copy-${item.project_id}`}
          style={{
            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(240,235,224,0.08)',
            color: copied ? '#22c55e' : 'var(--cream-2)',
            border: 'none', borderRadius: 6, padding: '4px 8px',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer',
          }}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button onClick={showQr}
          data-testid={`qr-${item.project_id}`}
          style={{
            background: 'rgba(240,235,224,0.08)', color: 'var(--cream-2)',
            border: 'none', borderRadius: 6, padding: '4px 8px',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer',
          }}>
          <QrCode size={11} />
          {qrUrl ? 'Ocultar QR' : 'QR'}
        </button>
      </div>

      {qrLoading && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--cream-3)' }}>Generando QR…</div>}
      {qrUrl && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <img src={qrUrl} alt="QR" style={{ width: 160, height: 160, background: 'white', padding: 6, borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

export default function LinksTrackingPage({ user, onLogout }) {
  const [links, setLinks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLinks(), getStats()])
      .then(([l, s]) => { setLinks(l.items || []); setStats(s); })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={20} color="var(--cream)" />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Mis links de tracking
          </h1>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cream-3)' }}>
          Comparte links únicos con clientes potenciales. Cada visita y conversión se atribuye a tu cuenta.
        </p>

        {stats && (
          <div style={{ marginBottom: 20 }}>
            <KPIStrip items={[
              { label: 'Total vistas', value: stats.total_views },
              { label: 'Conversiones', value: stats.total_conversions },
              { label: 'Tasa de conversión', value: `${stats.conversion_rate_pct}%` },
              { label: 'Proyectos activos', value: links.length },
            ]} />
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>Cargando…</div>
        ) : links.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13,
            background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.08)', borderRadius: 12 }}>
            No tienes proyectos asignados todavía. Pide a un developer que te agregue como broker o pre-asignado.
          </div>
        ) : (
          <div>
            {links.map(item => <LinkRow key={item.project_id} item={item} />)}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
