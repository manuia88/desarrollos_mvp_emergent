// UploadModal — drag&drop dropzone + auto-screenshot (html-to-image) + CSV preview.
// Produces a multipart upload with file + screenshot blob + notes + optional period.
import React, { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { X, Sparkle, Bookmark, Shield, Database } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;
const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = '.csv,.tsv,.json,.geojson,.zip,.shp,.pdf,.xlsx,.xls,.txt';

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export default function UploadModal({ open, source, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null); setNotes(''); setPeriodStart(''); setPeriodEnd('');
    setErr(null); setResult(null); setBusy(false); setDragOver(false);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  if (!open || !source) return null;

  const onPick = (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setErr(`Archivo excede ${MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setErr(null);
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    onPick(f);
  };

  const submit = async () => {
    if (!file) return setErr('Selecciona un archivo primero.');
    setErr(null); setBusy(true);
    try {
      // Capture audit screenshot of the modal at submit-pressed state.
      let screenshotBlob = null;
      try {
        if (modalRef.current) {
          const dataUrl = await toPng(modalRef.current, {
            quality: 0.85,
            cacheBust: true,
            pixelRatio: 1.5,
            backgroundColor: '#0E1220',
          });
          const r = await fetch(dataUrl);
          screenshotBlob = await r.blob();
        }
      } catch { /* screenshot is best-effort, never blocks the upload */ }

      const fd = new FormData();
      fd.append('file', file);
      if (notes) fd.append('notes', notes);
      if (periodStart) fd.append('period_start', periodStart);
      if (periodEnd) fd.append('period_end', periodEnd);
      if (screenshotBlob) fd.append('screenshot', screenshotBlob, `${file.name}.audit.png`);

      const resp = await fetch(`${API}/api/superadmin/data-sources/${source.id}/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!resp.ok) {
        const b = await resp.json().catch(() => ({}));
        throw new Error(b.detail || `Error HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
      onUploaded?.(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '11px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 9999,
    color: 'var(--cream)',
    fontFamily: 'DM Sans', fontSize: 13.5,
    outline: 'none',
  };
  const lblStyle = {
    fontFamily: 'DM Sans', fontSize: 11,
    color: 'var(--cream-3)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 6,
  };

  return (
    <div data-testid="upload-modal" onClick={handleClose} style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      overflowY: 'auto',
    }}>
      <div ref={modalRef} onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)',
        borderRadius: 22, padding: 32,
        boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
        margin: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>UPLOAD MANUAL · IE ENGINE</div>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: 'var(--cream)', letterSpacing: '-0.02em',
              margin: 0, lineHeight: 1.2,
            }}>
              {source.name}
            </h2>
          </div>
          <button data-testid="upload-close" onClick={handleClose} style={{
            background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div data-testid="upload-result">
            <div style={{
              padding: 12, marginBottom: 14,
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.32)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'DM Sans', fontSize: 13, color: '#86efac',
            }}>
              <Sparkle size={13} />
              <div>
                Status: <strong>{result.upload.status}</strong> · {result.upload.records_extracted ?? 0} records ingestados.
              </div>
            </div>
            <PreviewBlock preview={result.preview} />
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={reset} className="btn btn-glass" style={{ flex: 1, justifyContent: 'center' }}>
                Subir otro
              </button>
              <button onClick={handleClose} data-testid="upload-done" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              data-testid="upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                padding: '28px 20px',
                marginBottom: 14,
                border: `2px dashed ${dragOver ? 'rgba(99,102,241,0.6)' : 'var(--border)'}`,
                borderRadius: 16,
                background: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.18s, background 0.18s',
              }}
            >
              <Database size={22} color="var(--indigo-3)" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginTop: 8, letterSpacing: '-0.015em' }}>
                {file ? file.name : 'Arrastra el archivo o haz click'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
                {file ? `${fmtBytes(file.size)} · ${file.type || 'sin mime'}`
                  : '.csv .tsv .json .geojson .zip .pdf .xlsx · máx. 200 MB'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                data-testid="upload-file-input"
                onChange={e => onPick(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
            </div>

            <label style={{ marginBottom: 12, display: 'block' }}>
              <div style={lblStyle}>Notas (qué subiste y de dónde)</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                data-testid="upload-notes"
                placeholder='Ej.: "CSV FGJ delitos enero 2026 descargado de datos.cdmx el 30 abril"'
                rows={2}
                style={{
                  ...inputStyle, borderRadius: 14, resize: 'vertical', minHeight: 50,
                  fontFamily: 'DM Sans', lineHeight: 1.4,
                }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <label>
                <div style={lblStyle}>Cubre desde</div>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  data-testid="upload-period-start" style={inputStyle} />
              </label>
              <label>
                <div style={lblStyle}>Cubre hasta</div>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  data-testid="upload-period-end" style={inputStyle} />
              </label>
            </div>

            <div style={{
              padding: 10, marginBottom: 14,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: 12,
              fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.55,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Bookmark size={11} color="var(--indigo-3)" />
              <span>
                Al guardar, capturamos un screenshot del modal como audit trail. El archivo se cifra
                vía sha256 para dedupe; archivos repetidos se rechazan con 409.
              </span>
            </div>

            {err && (
              <div data-testid="upload-error" style={{
                padding: 10, marginBottom: 12,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.32)',
                borderRadius: 10,
                fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5', lineHeight: 1.5,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Shield size={11} /> {err}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy || !file}
              data-testid="upload-submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', opacity: (busy || !file) ? 0.5 : 1 }}
            >
              {busy ? 'Subiendo…' : 'Subir y procesar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CSV / JSON preview block ────────────────────────────────────────────────
function PreviewBlock({ preview }) {
  if (!preview) return null;
  const { format, encoding, separator, headers, rows, error, kind, count, feature_count, entries, entry_count, size_kb, note, first_5, keys } = preview;

  const Pill = ({ children, tone = 'neutral' }) => (
    <span style={{
      padding: '2px 9px', borderRadius: 9999,
      background: tone === 'good' ? 'rgba(34,197,94,0.14)' : tone === 'warn' ? 'rgba(245,158,11,0.16)' : 'rgba(99,102,241,0.10)',
      border: `1px solid ${tone === 'good' ? 'rgba(34,197,94,0.28)' : tone === 'warn' ? 'rgba(245,158,11,0.32)' : 'rgba(99,102,241,0.22)'}`,
      color: tone === 'good' ? '#86efac' : tone === 'warn' ? '#fcd34d' : 'var(--indigo-3)',
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{children}</span>
  );

  if (error) {
    return (
      <div style={{
        padding: 12, borderRadius: 12,
        background: 'rgba(239,68,68,0.10)',
        border: '1px solid rgba(239,68,68,0.32)',
        fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5',
      }}>
        Vista previa: {error}
      </div>
    );
  }

  return (
    <div data-testid="upload-preview" style={{
      padding: 14, borderRadius: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border)',
    }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>VISTA PREVIA · {format?.toUpperCase()}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {encoding && <Pill tone={encoding === 'utf-8' ? 'good' : 'warn'}>encoding: {encoding}</Pill>}
        {separator && <Pill>sep: {separator === '\t' ? 'TAB' : separator}</Pill>}
        {kind && <Pill>{kind}</Pill>}
        {count != null && <Pill>{count} items</Pill>}
        {feature_count != null && <Pill>{feature_count} features</Pill>}
        {entry_count != null && <Pill>{entry_count} entries</Pill>}
        {size_kb != null && <Pill>{size_kb} KB</Pill>}
      </div>

      {format === 'csv' && headers && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {headers.map((h, i) => (
                  <th key={i} style={{
                    textAlign: 'left', padding: '8px 10px',
                    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5,
                    color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
                    background: 'rgba(99,102,241,0.06)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row, r) => (
                <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                  {row.map((cell, c) => (
                    <td key={c} style={{ padding: '8px 10px', color: 'var(--cream-2)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {String(cell ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(format === 'json' || format === 'geojson') && first_5 && (
        <pre style={{
          margin: 0, padding: 10, borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          fontFamily: 'monospace', fontSize: 11.5,
          color: 'var(--cream-2)', maxHeight: 240, overflow: 'auto',
        }}>
{JSON.stringify(first_5, null, 2)}
        </pre>
      )}

      {format === 'json' && keys && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
          Keys: {keys.join(', ')}
        </div>
      )}

      {entries && (
        <ul style={{ margin: 0, padding: '0 0 0 18px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.6 }}>
          {entries.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {note && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>
          {note}
        </div>
      )}
    </div>
  );
}
