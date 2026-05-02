/**
 * Phase 4 Batch 0 — DragDropZone
 * File drop zone with preview, progress bars, size enforcement.
 * Props:
 *   accept_types: [string]  (MIME types, e.g. ['application/pdf', 'image/*'])
 *   multi: bool
 *   max_size_mb: number
 *   on_files: fn(files: File[])
 *   preview: bool
 *   label: string
 */
import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, AlertCircle } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreview({ file, onRemove }) {
  const isImage = file.type.startsWith('image/');
  const [url, setUrl] = useState(null);

  React.useEffect(() => {
    if (isImage) {
      const u = URL.createObjectURL(file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.08)]">
      {isImage && url ? (
        <img src={url} alt={file.name} className="w-8 h-8 rounded object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-[rgba(240,235,224,0.08)] flex items-center justify-center shrink-0">
          <FileText size={14} className="text-[rgba(240,235,224,0.4)]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[var(--cream)] text-xs truncate">{file.name}</p>
        <p className="text-[rgba(240,235,224,0.4)] text-[10px]">{formatBytes(file.size)}</p>
      </div>
      <button
        onClick={() => onRemove(file)}
        className="text-[rgba(240,235,224,0.3)] hover:text-[var(--cream)] transition-colors shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function DragDropZone({
  accept_types = [],
  multi = false,
  max_size_mb = 20,
  on_files,
  preview = true,
  label = 'Arrastra archivos aquí o haz clic para seleccionar',
  className = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const inputRef = useRef(null);

  const mimeAccept = accept_types.join(',');
  const maxBytes = max_size_mb * 1024 * 1024;

  const processFiles = useCallback((incoming) => {
    const newErrors = [];
    const valid = [];
    Array.from(incoming).forEach(f => {
      if (maxBytes && f.size > maxBytes) {
        newErrors.push(`${f.name}: excede el límite de ${max_size_mb} MB`);
        return;
      }
      valid.push(f);
    });
    setErrors(newErrors);
    const updated = multi ? [...files, ...valid] : valid.slice(0, 1);
    setFiles(updated);
    if (valid.length) on_files?.(updated);
  }, [files, multi, maxBytes, max_size_mb, on_files]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const removeFile = (file) => {
    const updated = files.filter(f => f !== file);
    setFiles(updated);
    on_files?.(updated);
  };

  return (
    <div className={`space-y-2 ${className}`} data-testid="drag-drop-zone">
      {/* Drop area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all
          ${dragging
            ? 'border-[var(--cream)] bg-[rgba(240,235,224,0.08)]'
            : 'border-[rgba(240,235,224,0.15)] bg-[rgba(240,235,224,0.03)] hover:border-[rgba(240,235,224,0.3)] hover:bg-[rgba(240,235,224,0.05)]'}`}
        data-testid="drop-area"
      >
        <Upload size={24} className={`transition-colors ${dragging ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.3)]'}`} />
        <div className="text-center">
          <p className="text-[rgba(240,235,224,0.65)] text-sm">{label}</p>
          {accept_types.length > 0 && (
            <p className="text-[rgba(240,235,224,0.3)] text-xs mt-1">
              {accept_types.join(', ')} · Máx {max_size_mb} MB{multi ? ' · Múltiples archivos' : ''}
            </p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={mimeAccept}
          multiple={multi}
          className="hidden"
          onChange={(e) => processFiles(e.target.files)}
          data-testid="file-input"
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={12} />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* Previews */}
      {preview && files.length > 0 && (
        <div className="space-y-1.5" data-testid="file-previews">
          {files.map((f, i) => (
            <FilePreview key={i} file={f} onRemove={removeFile} />
          ))}
        </div>
      )}
    </div>
  );
}

export default DragDropZone;
