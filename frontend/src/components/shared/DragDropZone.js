/**
 * Phase 4 B0 Sub-chunk B — DragDropZone
 * Multi-file drag-and-drop with previews and inline validation.
 * Props:
 *   accept      — string (HTML accept attr, e.g. "image/*,.pdf")
 *   maxSizeMB   — number (per-file size cap)
 *   maxFiles    — number (total file cap)
 *   onUpload    — fn(files: File[])
 *   label       — string
 *   className   — string
 */
import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, X, FileText, AlertCircle } from 'lucide-react';

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function FileThumb({ file, onRemove }) {
  const isImg = file.type.startsWith('image/');
  const [preview, setPreview] = useState(null);

  React.useEffect(() => {
    if (!isImg) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImg]);

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.09)]"
      data-testid="file-thumb"
    >
      {isImg && preview ? (
        <img src={preview} alt={file.name} className="w-9 h-9 rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-md bg-[rgba(240,235,224,0.08)] flex items-center justify-center shrink-0">
          <FileText size={15} className="text-[rgba(240,235,224,0.4)]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[var(--cream)] text-xs font-medium truncate">{file.name}</p>
        <p className="text-[rgba(240,235,224,0.35)] text-[10px]">{fmtBytes(file.size)}</p>
      </div>
      <button
        onClick={() => onRemove(file)}
        className="shrink-0 text-[rgba(240,235,224,0.3)] hover:text-red-400 transition-colors"
        data-testid="file-thumb-remove"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function DragDropZone({
  accept = '',
  maxSizeMB = 20,
  maxFiles = 10,
  onUpload,
  label = 'Arrastra archivos aquí o haz clic para seleccionar',
  className = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const inputRef = useRef(null);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const processFiles = useCallback((incoming) => {
    const errs = [];
    const valid = [];
    Array.from(incoming).forEach(f => {
      if (maxBytes && f.size > maxBytes) {
        errs.push(`"${f.name}" excede el límite de ${maxSizeMB} MB`);
        return;
      }
      valid.push(f);
    });
    setErrors(errs);
    const merged = [...files, ...valid].slice(0, maxFiles);
    setFiles(merged);
    if (merged.length > files.length) onUpload?.(merged);
  }, [files, maxBytes, maxSizeMB, maxFiles, onUpload]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const removeFile = (f) => {
    const updated = files.filter(x => x !== f);
    setFiles(updated);
    onUpload?.(updated);
  };

  return (
    <div className={`space-y-2.5 ${className}`} data-testid="drag-drop-zone">
      {/* Drop area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer
          transition-all duration-200 select-none
          ${dragging
            ? 'border-[var(--cream)] bg-[rgba(240,235,224,0.09)] scale-[1.01]'
            : 'border-[rgba(240,235,224,0.16)] bg-[rgba(240,235,224,0.03)] hover:border-[rgba(240,235,224,0.32)] hover:bg-[rgba(240,235,224,0.05)]'}`}
        data-testid="drop-area"
      >
        <UploadCloud
          size={28}
          className={`transition-all duration-200 ${dragging ? 'text-[var(--cream)] scale-110' : 'text-[rgba(240,235,224,0.3)]'}`}
        />
        <div className="text-center pointer-events-none">
          <p className="text-[rgba(240,235,224,0.65)] text-sm">{label}</p>
          <p className="text-[rgba(240,235,224,0.3)] text-xs mt-1">
            {accept ? `${accept} · ` : ''}Máx {maxSizeMB} MB · Hasta {maxFiles} archivos
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => processFiles(e.target.files)}
          data-testid="file-input"
        />
      </div>

      {/* Inline errors */}
      {errors.length > 0 && (
        <div className="space-y-1" data-testid="file-errors">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-1.5 text-red-400 text-xs">
              <AlertCircle size={11} />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* Preview thumbnails */}
      {files.length > 0 && (
        <div className="space-y-1.5" data-testid="file-previews">
          {files.map((f, i) => <FileThumb key={i} file={f} onRemove={removeFile} />)}
        </div>
      )}
    </div>
  );
}

export default DragDropZone;
