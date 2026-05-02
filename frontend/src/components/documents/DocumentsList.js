// DocumentsList — reusable widget. Renders document table for a single development.
// Used by both Superadmin DocumentsPage (per-dev tab) and Developer Portal widget.
import React, { useEffect, useState } from 'react';
import * as docsApi from '../../api/documents';
import { FileText, Upload, Download, Trash, RotateCcw, Check, AlertTriangle, Clock, X, Sparkle } from '../icons';
import UploadDocumentModal from './UploadDocumentModal';
import ExtractionView from './ExtractionView';
import CrossCheckView from './CrossCheckView';
import SyncPreview from './SyncPreview';
import { reorderDocuments } from '../../api/batch17';
import { useServerUndo } from '../shared/UndoSnackbar';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_TONE = {
  pending:             { bg: 'rgba(99,102,241,0.12)', fg: '#c7d2fe', label: 'En cola',           Icon: Clock },
  ocr_running:         { bg: 'rgba(99,102,241,0.18)', fg: '#a5b4fc', label: 'Procesando',        Icon: Clock },
  ocr_done:            { bg: 'rgba(34,197,94,0.12)',  fg: '#86efac', label: 'OCR listo',         Icon: Check },
  ocr_failed:          { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', label: 'OCR falló',         Icon: AlertTriangle },
  extraction_pending:  { bg: 'rgba(236,72,153,0.14)', fg: '#fbcfe8', label: 'Extrayendo…',       Icon: Sparkle },
  extracted:           { bg: 'rgba(34,197,94,0.18)',  fg: '#86efac', label: 'Datos extraídos',   Icon: Sparkle },
  extraction_failed:   { bg: 'rgba(245,158,11,0.14)', fg: '#fcd34d', label: 'Extracción falló',  Icon: AlertTriangle },
};

const fmtDate = (s) => s ? new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtBytes = (n) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

function StatusPill({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.pending;
  const { Icon } = t;
  return (
    <span data-testid={`doc-status-${status}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 9999,
      background: t.bg, color: t.fg,
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      <Icon size={10} /> {t.label}
    </span>
  );
}

function PreviewDrawer({ doc, scope, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('ocr');
  useEffect(() => {
    if (!doc) return;
    setData(null); setErr(null); setTab('ocr');
    docsApi.getDocument(doc.id, scope).then(r => setData(r.document)).catch(e => setErr(e.message));
  }, [doc, scope]);
  if (!doc) return null;
  return (
    <div data-testid="doc-preview-drawer" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 590,
      background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxWidth: '100%', height: '100vh',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        borderLeft: '1px solid var(--border)', padding: 26, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <div className="eyebrow">Documento · {doc.doc_type_label_es}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
              {doc.filename}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              {doc.id} · {fmtBytes(doc.file_size_bytes)} · {doc.mime_type}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" data-testid="doc-preview-close" style={{
            background: 'transparent', border: '1px solid var(--border)', padding: 8, borderRadius: 9999,
            color: 'var(--cream-3)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        {err && <div style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5 }}>Error: {err}</div>}
        {!data && !err && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Cargando…</div>}

        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <StatusPill status={data.status} />
              {data.ocr_engine && (
                <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)', color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600 }}>
                  {data.ocr_engine}
                </span>
              )}
              {data.ocr_confidence != null && (
                <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5 }}>
                  Confianza {Math.round(data.ocr_confidence * 100)}%
                </span>
              )}
              {data.ocr_pages_count > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5 }}>
                  {data.ocr_pages_count} páginas
                </span>
              )}
              {data.ocr_text_chars > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5 }}>
                  {data.ocr_text_chars} chars
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <Meta label="Subido por">{data.uploader_name} ({data.uploader_role})</Meta>
              <Meta label="Subido">{fmtDate(data.created_at)}</Meta>
              <Meta label="Procesado">{fmtDate(data.processed_at)}</Meta>
              <Meta label="SHA-256">{(data.file_hash || '').slice(0, 16)}…</Meta>
              {data.period_relevant_start && <Meta label="Vigente desde">{fmtDate(data.period_relevant_start)}</Meta>}
              {data.period_relevant_end && <Meta label="Vigente hasta">{fmtDate(data.period_relevant_end)}</Meta>}
            </div>

            {data.upload_notes && (
              <div style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Notas</div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.5 }}>
                  {data.upload_notes}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div data-testid="doc-tabs" style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              {[
                { k: 'ocr', label: 'Texto OCR' },
                { k: 'extraction', label: 'Datos extraídos' },
                { k: 'crosscheck', label: 'Cross-check' },
                { k: 'sync', label: 'Sync Marketplace' },
              ].map(t => (
                <button key={t.k} data-testid={`doc-tab-${t.k}`} onClick={() => setTab(t.k)} style={{
                  padding: '9px 14px', background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tab === t.k ? '#6366F1' : 'transparent'}`,
                  color: tab === t.k ? 'var(--cream)' : 'var(--cream-3)',
                  fontFamily: 'DM Sans', fontWeight: tab === t.k ? 600 : 500, fontSize: 12.5,
                  cursor: 'pointer', marginBottom: -1,
                }}>{t.label}</button>
              ))}
            </div>

            {tab === 'ocr' && (
              <>
                {data.ocr_error && (
                  <div style={{ padding: 12, marginBottom: 14, borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)', color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>
                    <strong>Error OCR:</strong> {data.ocr_error}
                  </div>
                )}
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Texto OCR (vista previa{data.ocr_preview_truncated ? ' · truncado a 1500 chars' : ''})
                </div>
                <pre data-testid="doc-preview-ocr" style={{
                  padding: 14, background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 11.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflowY: 'auto',
                  lineHeight: 1.55,
                }}>
                  {data.ocr_preview || '— Sin texto OCR aún —'}
                </pre>
              </>
            )}

            {tab === 'extraction' && (
              <ExtractionView docId={doc.id} docType={data.doc_type} scope={scope}
                onTriggered={() => docsApi.getDocument(doc.id, scope).then(r => setData(r.document))} />
            )}

            {tab === 'crosscheck' && (
              <CrossCheckView devId={doc.development_id} scope={scope} />
            )}

            {tab === 'sync' && (
              <SyncPreview devId={doc.development_id} scope={scope} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Meta({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', marginTop: 2 }}>
        {children}
      </div>
    </div>
  );
}

export default function DocumentsList({ devId, devName, scope = 'superadmin', compact = false }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);
  const { showServerUndo } = useServerUndo();

  const load = async () => {
    if (!devId) return;
    setLoading(true);
    try {
      const r = await docsApi.listDevDocuments(devId, {}, scope);
      setDocs(r.documents || []);
    } catch (e) {
      setToast({ type: 'err', msg: `Error: ${e.message}` });
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [devId, scope]);

  // Auto-refresh while any doc is processing
  useEffect(() => {
    const anyProcessing = docs.some(d => d.status === 'pending' || d.status === 'ocr_running');
    if (!anyProcessing) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [docs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleReprocess = async (id) => {
    try {
      await docsApi.reprocessOcr(id, scope);
      setToast({ type: 'ok', msg: 'Reprocesando OCR…' });
      load();
    } catch (e) { setToast({ type: 'err', msg: `Error: ${e.message}` }); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este documento permanentemente?')) return;
    try {
      await docsApi.deleteDocument(id, scope);
      setToast({ type: 'ok', msg: 'Documento eliminado.' });
      load();
    } catch (e) { setToast({ type: 'err', msg: `Error: ${e.message}` }); }
  };

  // Phase 4 Batch 17 — drag-drop reorder via HTML5 drag (simpler within table rows)
  const handleDocDrop = async (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const srcIdx = docs.findIndex(d => d.id === dragId);
    const tgtIdx = docs.findIndex(d => d.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) { setDragId(null); return; }
    const next = docs.slice();
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    setDocs(next);
    setDragId(null);
    try {
      await reorderDocuments(devId, next.map(d => d.id));
      try {
        const res = await fetch(`${API}/api/undo/recent?limit=1`, { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          const last = j.items?.[0];
          if (last && last.action === 'reorder' && last.entity_type === 'document') {
            showServerUndo({ message: 'Orden de documentos actualizado',
                              undoId: last.id, onRestored: load });
          }
        }
      } catch {}
    } catch {
      setToast({ type: 'err', msg: 'Error al reordenar' });
      load();
    }
  };

  return (
    <div data-testid="documents-list">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          {!compact && <div className="eyebrow">Document Intelligence · Moat #2</div>}
          <h3 data-testid="documents-title" style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: compact ? 16 : 19,
            color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.018em',
          }}>
            Documentos del desarrollo
          </h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>
            {docs.length} archivo{docs.length === 1 ? '' : 's'} · cifrado Fernet · OCR es-MX
          </div>
        </div>
        <button data-testid="documents-upload-btn" onClick={() => setShowUpload(true)} style={{
          padding: '9px 18px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
          display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        }}>
          <Upload size={12} /> Subir documento
        </button>
      </div>

      <div style={{ background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 32, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Cargando…</div>}
        {!loading && docs.length === 0 && (
          <div data-testid="documents-empty" style={{ padding: 36, textAlign: 'center' }}>
            <FileText size={28} color="var(--cream-3)" />
            <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream-2)', marginTop: 10 }}>
              Aún no hay documentos en este desarrollo.
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
              Sube escrituras, permisos SEDUVI, listas de precios, planos…
            </div>
          </div>
        )}
        {!loading && docs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                  {['Archivo', 'Tipo', 'Status', 'Tamaño', 'Subido', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} data-testid="doc-row"
                      draggable
                      onDragStart={() => setDragId(d.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDocDrop(d.id)}
                      style={{
                        borderBottom: '1px solid rgba(148,163,184,0.08)',
                        cursor: dragId ? 'grabbing' : 'grab',
                        opacity: dragId === d.id ? 0.5 : 1,
                      }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.filename}>
                      <button onClick={() => setPreview(d)} data-testid="doc-name-link" style={{ background: 'transparent', border: 'none', color: 'var(--cream)', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(99,102,241,0.4)', textUnderlineOffset: 3 }}>
                        {d.filename}
                      </button>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
                      {d.doc_type_label_es}
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusPill status={d.status} /></td>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                      {fmtBytes(d.file_size_bytes)}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>
                      {fmtDate(d.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 5 }}>
                      <a data-testid="doc-download" href={docsApi.downloadDocumentUrl(d.id, scope)} target="_blank" rel="noreferrer" style={{
                        padding: '5px 10px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <Download size={11} /> Descargar
                      </a>
                      <button data-testid="doc-reprocess" onClick={() => handleReprocess(d.id)} title="Reprocesar OCR" style={{
                        padding: '5px 9px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                        color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <RotateCcw size={11} />
                      </button>
                      <button data-testid="doc-delete" onClick={() => handleDelete(d.id)} title="Eliminar" style={{
                        padding: '5px 9px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 10.5, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <Trash size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UploadDocumentModal
        open={showUpload}
        devId={devId}
        devName={devName}
        scope={scope}
        onClose={() => setShowUpload(false)}
        onUploaded={() => { setToast({ type: 'ok', msg: 'Documento subido. OCR en curso…' }); load(); }}
      />

      <PreviewDrawer doc={preview} scope={scope} onClose={() => setPreview(null)} />

      {toast && (
        <div data-testid="documents-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'err' ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.14)',
          border: `1px solid ${toast.type === 'err' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.35)'}`,
          color: toast.type === 'err' ? '#fca5a5' : '#86efac',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
