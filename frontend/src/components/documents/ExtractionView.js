// ExtractionView — Phase 7.2 · Renders structured extracted_data per doc_type.
import React, { useEffect, useState } from 'react';
import * as docsApi from '../../api/documents';
import { Sparkle, AlertTriangle, RotateCcw, FileText } from '../icons';

const fmtMXN = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n));
};
const fmtDate = (s) => s ? new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Renderers per doc_type ────────────────────────────────────────────────────
function KV({ label, children, mono = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans',
        fontSize: 12.5, color: children == null || children === '—' ? 'var(--cream-3)' : 'var(--cream)',
      }}>
        {children == null || children === '' ? '—' : children}
      </span>
    </div>
  );
}

function Pills({ items, accent = false }) {
  if (!items?.length) return <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((it, i) => (
        <span key={i} style={{
          padding: '3px 10px', borderRadius: 9999,
          background: accent ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${accent ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
          color: accent ? '#c7d2fe' : 'var(--cream-2)',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
        }}>{String(it)}</span>
      ))}
    </div>
  );
}

function LpRenderer({ d }) {
  const u = d.unidades || [];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <KV label="Vigencia">{fmtDate(d.vigencia)}</KV>
        <KV label="Fecha de emisión">{fmtDate(d.fecha)}</KV>
      </div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Esquemas de pago</div>
      <div style={{ marginBottom: 16 }}><Pills items={d.esquemas_pago} accent /></div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Unidades ({u.length})</div>
      {u.length === 0 && <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>—</span>}
      {u.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                {['Tipo', 'Recámaras', 'Baños', 'm²', 'Planta', 'Status', 'Precio'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {u.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)' }}>{row.tipo ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{row.recamaras ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{row.banos ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{row.m2 ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{row.planta ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{row.status ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{fmtMXN(row.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function GenericRenderer({ d }) {
  // 2-column key-value grid with arrays expanded inline.
  const entries = Object.entries(d || {});
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {entries.map(([k, v]) => {
        const label = k.replace(/_/g, ' ');
        if (Array.isArray(v)) {
          return (
            <div key={k} style={{ gridColumn: 'span 2' }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
              {v.length === 0 ? <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>—</span> : <Pills items={v.map(x => typeof x === 'object' ? JSON.stringify(x) : x)} />}
            </div>
          );
        }
        if (typeof v === 'number') {
          // detect monetary
          const looksMoney = /precio|monto|anticipo|carga|construccion/i.test(k);
          return <KV key={k} label={label}>{looksMoney ? fmtMXN(v) : v}</KV>;
        }
        return <KV key={k} label={label} mono={/no_|rfc|cuenta|escritura/i.test(k)}>{v == null || v === '' ? '—' : String(v)}</KV>;
      })}
    </div>
  );
}

const DOC_RENDERERS = {
  lp: LpRenderer,
  // brochure / escritura / permiso_seduvi / etc. → use GenericRenderer (key-value layout).
};


export default function ExtractionView({ docId, docType, scope = 'superadmin', onTriggered }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await docsApi.getExtraction(docId, scope);
      setData(r);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (docId) load(); /* eslint-disable-next-line */ }, [docId, scope]);

  const trigger = async () => {
    setBusy(true); setErr(null);
    try {
      await docsApi.triggerExtraction(docId, scope);
      await load();
      onTriggered?.();
    } catch (e) {
      setErr(typeof e.body?.detail === 'string' ? e.body.detail : e.message);
    }
    setBusy(false);
  };

  if (loading) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando extracción…</div>;

  const status = data?.status;
  const extr = data?.extraction;
  const isExtracted = status === 'extracted' && extr?.ok;
  const isFailed = status === 'extraction_failed' || extr?.ok === false;
  const isPending = status === 'extraction_pending';
  const canTrigger = ['ocr_done', 'extracted', 'extraction_failed'].includes(status);

  const Renderer = DOC_RENDERERS[docType] || GenericRenderer;

  return (
    <div data-testid="extraction-view">
      {!isExtracted && (
        <div style={{
          padding: 14, marginBottom: 14, borderRadius: 12,
          background: isFailed ? 'rgba(239,68,68,0.08)' : (isPending ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)'),
          border: `1px solid ${isFailed ? 'rgba(239,68,68,0.32)' : (isPending ? 'rgba(99,102,241,0.32)' : 'var(--border)')}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {isFailed ? <AlertTriangle size={13} color="#fca5a5" /> : <Sparkle size={13} color="var(--indigo-3)" />}
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
              {isPending ? 'Extracción en curso…' : (isFailed ? 'Extracción falló' : 'Sin extracción aún')}
            </span>
          </div>
          {isFailed && data?.extraction_error && (
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#fca5a5', marginBottom: 8 }}>
              {data.extraction_error}
            </div>
          )}
          {!isPending && (
            <button data-testid="extract-trigger-btn" onClick={trigger} disabled={busy || !canTrigger} style={{
              padding: '8px 18px', borderRadius: 9999,
              background: busy ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
              cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkle size={12} />
              {busy ? 'Procesando con Claude…' : (isFailed ? 'Reintentar extracción' : 'Ejecutar extracción ahora')}
            </button>
          )}
        </div>
      )}

      {err && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.32)', color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>
          {err}
        </div>
      )}

      {isExtracted && extr?.extracted_data && (
        <>
          <div data-testid="extraction-data" style={{ marginBottom: 16 }}>
            <Renderer d={extr.extracted_data} />
          </div>

          <div className="eyebrow" style={{ marginBottom: 6 }}>JSON crudo</div>
          <pre data-testid="extraction-json" style={{
            padding: 12, background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 11,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto',
            lineHeight: 1.55,
          }}>
            {JSON.stringify(extr.extracted_data, null, 2)}
          </pre>

          {/* Footer */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14,
            padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10,
            fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
          }}>
            <span><strong style={{ color: 'var(--cream-2)' }}>Modelo:</strong> {extr.model}</span>
            <span><strong style={{ color: 'var(--cream-2)' }}>Schema:</strong> v{extr.schema_version}</span>
            <span><strong style={{ color: 'var(--cream-2)' }}>Generado:</strong> {fmtDate(extr.generated_at)}</span>
            <span><strong style={{ color: 'var(--cream-2)' }}>Tokens:</strong> {extr.input_tokens || 0}↓ / {extr.output_tokens || 0}↑</span>
            <span><strong style={{ color: 'var(--cream-2)' }}>Costo:</strong> ${(extr.cost_usd || 0).toFixed(4)}</span>
            <button onClick={trigger} disabled={busy} style={{
              marginLeft: 'auto',
              padding: '4px 12px', borderRadius: 9999, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--cream-3)',
              fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <RotateCcw size={10} /> Re-extraer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
