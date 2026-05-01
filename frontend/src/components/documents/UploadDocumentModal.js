// UploadDocumentModal — Phase 7.1 · Document Intelligence
// Multipart upload (file + doc_type + notes + period range) → encrypted on backend, async OCR.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, FileText, AlertTriangle } from '../icons';
import * as docsApi from '../../api/documents';

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.tif,.tiff';

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export default function UploadDocumentModal({ open, devId, devName, scope = 'superadmin', onClose, onUploaded }) {
  const [docTypes, setDocTypes] = useState({});
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState('');
  const [notes, setNotes] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    docsApi.listDocTypes().then(r => setDocTypes(r.doc_types || {})).catch(() => {});
  }, [open]);

  const reset = useCallback(() => {
    setFile(null); setDocType(''); setNotes('');
    setPeriodStart(''); setPeriodEnd('');
    setErr(null); setBusy(false); setDragOver(false);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  if (!open || !devId) return null;

  const onPick = (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setErr(`El archivo excede ${MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff'].includes(ext)) {
      setErr(`Extensión no permitida (${ext || 'desconocida'}). Acepta: PDF, JPG, PNG, TIFF.`);
      return;
    }
    setErr(null);
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    onPick(e.dataTransfer.files?.[0]);
  };

  const submit = async () => {
    if (!file) return setErr('Selecciona un archivo primero.');
    if (!docType) return setErr('Selecciona el tipo de documento.');
    setErr(null); setBusy(true);
    try {
      const r = await docsApi.uploadDocument(devId, {
        file, doc_type: docType, upload_notes: notes,
        period_start: periodStart ? `${periodStart}T00:00:00Z` : null,
        period_end: periodEnd ? `${periodEnd}T23:59:59Z` : null,
      }, scope);
      onUploaded?.(r.document);
      handleClose();
    } catch (e) {
      setErr(typeof e.body?.detail === 'string' ? e.body.detail : (e.message || 'Error al subir'));
      setBusy(false);
    }
  };

  return (
    <div data-testid="upload-doc-modal" onClick={handleClose} style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(6,8,15,0.84)', backdropFilter: 'blur(18px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)', borderRadius: 18, padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <div className="eyebrow">Document Intelligence · Subir documento</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.02em' }}>
              {devName || devId}
            </h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Cifrado Fernet en disco · OCR asíncrono · acepta PDF / JPG / PNG / TIFF · máx 50 MB
            </div>
          </div>
          <button onClick={handleClose} data-testid="upload-doc-close" aria-label="Cerrar" style={{
            background: 'transparent', border: '1px solid var(--border)', padding: 8, borderRadius: 9999,
            color: 'var(--cream-3)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        {/* Dropzone */}
        <div
          data-testid="upload-doc-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            padding: 26, marginBottom: 14, borderRadius: 14, cursor: 'pointer',
            border: `1.5px dashed ${dragOver ? 'rgba(99,102,241,0.55)' : 'var(--border)'}`,
            background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
            textAlign: 'center', transition: 'all 0.15s',
          }}>
          <input ref={fileInputRef} type="file" accept={ACCEPTED} hidden
            onChange={e => onPick(e.target.files?.[0])} data-testid="upload-doc-input" />
          {file ? (
            <div>
              <FileText size={26} color="var(--indigo-3)" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginTop: 8 }}>
                {file.name}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
                {fmtBytes(file.size)} · {(file.type || 'detectado por servidor')}
              </div>
            </div>
          ) : (
            <div>
              <Upload size={26} color="var(--cream-3)" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream)', marginTop: 8 }}>
                Arrastra un archivo o haz clic para seleccionar
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>
                PDF · JPG · PNG · TIFF · máx 50 MB
              </div>
            </div>
          )}
        </div>

        {/* Doc type */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Tipo de documento *
          </label>
          <select data-testid="upload-doc-type" value={docType} onChange={e => setDocType(e.target.value)} style={{
            width: '100%', padding: '10px 12px', background: '#0D1118', border: '1px solid var(--border)',
            color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 13,
          }}>
            <option value="">— Seleccionar —</option>
            {Object.entries(docTypes).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Notas (opcional)
          </label>
          <textarea data-testid="upload-doc-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Ej. Escritura del lote 12 manzana 5, vigente"
            style={{
              width: '100%', padding: '10px 12px', background: '#0D1118', border: '1px solid var(--border)',
              color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 13, resize: 'vertical',
            }} />
        </div>

        {/* Period range */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Vigencia desde
            </label>
            <input data-testid="upload-doc-period-start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={{
              width: '100%', padding: '9px 10px', background: '#0D1118', border: '1px solid var(--border)',
              color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5,
            }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Vigencia hasta
            </label>
            <input data-testid="upload-doc-period-end" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={{
              width: '100%', padding: '9px 10px', background: '#0D1118', border: '1px solid var(--border)',
              color: 'var(--cream)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5,
            }} />
          </div>
        </div>

        {err && (
          <div data-testid="upload-doc-err" style={{
            padding: 12, marginBottom: 12, borderRadius: 12,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.32)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
            color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5,
          }}>
            <AlertTriangle size={14} />
            <span>{err}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button data-testid="upload-doc-cancel" onClick={handleClose} disabled={busy} style={{
            padding: '10px 18px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--cream-3)', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>Cancelar</button>
          <button data-testid="upload-doc-submit" onClick={submit} disabled={busy || !file || !docType} style={{
            padding: '10px 22px', borderRadius: 9999,
            background: (busy || !file || !docType) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            cursor: (busy || !file || !docType) ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <Upload size={13} />
            {busy ? 'Subiendo y cifrando…' : 'Subir documento'}
          </button>
        </div>
      </div>
    </div>
  );
}
