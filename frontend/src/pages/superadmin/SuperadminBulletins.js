// W3.3 ZZ.3 — Superadmin Bulletins page
import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { listBulletins, generateBulletin, bulletinPdfUrl } from '../../api/bulletins';
import { Z } from '../../styles/zIndex';

const TOP_ZONES = [
  { id: 'polanco', name: 'Polanco' },
  { id: 'roma', name: 'Roma' },
  { id: 'lomas', name: 'Lomas' },
  { id: 'condesa', name: 'Condesa' },
  { id: 'del_valle', name: 'Del Valle' },
  { id: 'coyoacan', name: 'Coyoacán' },
];

export default function SuperadminBulletins() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [preview, setPreview] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listBulletins({ type: filterType || undefined, limit: 100 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filterType]);

  const generate = async (cfg) => {
    if (busy) return;
    setBusy(true);
    try {
      await generateBulletin(cfg);
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.3 · Boletines DMX"
        title="Boletines mensuales"
        sub="Boletín general nacional + sectorial por zona top 6. Distribución vía Resend."
        actions={
          <>
            <button data-testid="bulletins-gen-general-btn" onClick={() => generate({ type: 'general', distribute: false })}
                    disabled={busy} style={btnPrimary(busy)}>
              <FileText size={14} /> Generar general
            </button>
            <button data-testid="bulletins-gen-all-btn" onClick={() => generate({ type: 'all' })}
                    disabled={busy} style={btnSecondary}>
              {busy ? 'Generando…' : 'Generar todos (cron)'}
            </button>
          </>
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>Tipo:</span>
          {['', 'general', 'zone'].map(t => (
            <button key={t || 'all'} data-testid={`bulletins-filter-${t || 'all'}`}
              onClick={() => setFilterType(t)}
              style={{
                padding: '6px 14px', borderRadius: 9999,
                background: filterType === t ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filterType === t ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`,
                color: 'var(--cream)', cursor: 'pointer',
                fontFamily: 'DM Sans', fontSize: 12,
              }}
            >{t || 'todos'}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>
            Generar zona:
          </span>
          {TOP_ZONES.map(z => (
            <button
              key={z.id} data-testid={`bulletins-gen-zone-${z.id}-btn`}
              onClick={() => generate({ type: 'zone', zone_id: z.id })}
              disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--cream)', cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans', fontSize: 11,
              }}
            >{z.name}</button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin boletines aún" sub="Genera el primero arriba." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="bulletins-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Tipo</Th><Th>Zona</Th><Th>Período</Th><Th>Generado</Th><Th>Distribuido</Th><Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} data-testid={`bulletins-row-${b.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Td>{b.type === 'general' ? <Badge tone="brand">general</Badge> : <Badge tone="pink">zone</Badge>}</Td>
                    <Td>{b.zone_id || '—'}</Td>
                    <Td>{b.period}</Td>
                    <Td>{(b.generated_at || '').slice(0, 19).replace('T', ' ')}</Td>
                    <Td>{b.distribution_count || 0}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button data-testid={`bulletins-preview-${b.id}-btn`} onClick={() => setPreview(b)} style={pillBtn}>Previa</button>
                        <a data-testid={`bulletins-pdf-${b.id}-btn`} href={bulletinPdfUrl(b.slug || (b.type === 'general' ? 'general' : b.zone_id), b.period)} target="_blank" rel="noreferrer" style={pillBtn}>PDF</a>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {preview && (
        <div data-testid="bulletins-preview-overlay" onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.85)' }}>
          <div onClick={e => e.stopPropagation()} data-testid="bulletins-preview-modal"
            style={{
              position: 'absolute', inset: 'clamp(20px, 4vh, 60px) auto auto 50%',
              transform: 'translateX(-50%)',
              width: 'min(720px, 95vw)', maxHeight: '88vh', overflowY: 'auto',
              background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16, padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0 }}>
              {preview.type === 'general' ? 'Boletín general' : `Zona · ${preview.zone_id}`} · {preview.period}
            </h3>
            <article style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.7, marginTop: 14 }}
                     dangerouslySetInnerHTML={{ __html: preview.html_content }} />
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

const btnPrimary = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 9999,
  background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
});
const btnSecondary = {
  padding: '8px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
const pillBtn = {
  padding: '4px 12px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5,
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
};
function Th({ children }) {
  return (<th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children }) {
  return (<td style={{ padding: '8px 8px', fontSize: 13, color: 'var(--cream-2)' }}>{children}</td>);
}
