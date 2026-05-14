// W4.9 — CustomBrochureUploader
// Permite a un developer/asesor subir su propio PDF.
import React, { useRef, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const MAX_MB = 25;

export default function CustomBrochureUploader({ projectId, onUploaded }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file) => {
    setError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Sólo se aceptan archivos PDF.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    setProgress(15);
    try {
      const form = new FormData();
      form.append('project_id', projectId);
      form.append('file', file);
      setProgress(45);
      const res = await fetch(`${API}/api/brochures/upload-custom`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      setProgress(85);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.detail || 'upload_failed');
      }
      setProgress(100);
      onUploaded?.(data.brochure);
    } catch (e) {
      setError(e.message || 'Falló la carga del PDF.');
    } finally {
      setTimeout(() => { setUploading(false); setProgress(0); }, 600);
    }
  };

  return (
    <div data-testid="custom-brochure-uploader" style={{
      border: '1.5px dashed rgba(240,235,224,0.25)',
      borderRadius: 14,
      padding: 18,
      background: 'rgba(15,18,28,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
            ¿Tienes tu propio brochure?
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.5 }}>
            Sube tu PDF (máx {MAX_MB} MB). Lo asociamos al proyecto y lo entregamos en cada lead.
          </div>
        </div>
        <button
          type="button"
          data-testid="custom-brochure-upload-btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            background: 'transparent',
            color: 'var(--cream)',
            border: '1px solid rgba(240,235,224,0.3)',
            borderRadius: 9999,
            padding: '8px 18px',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 12,
            letterSpacing: '0.08em',
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'CARGANDO…' : 'SELECCIONAR PDF'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
          data-testid="custom-brochure-file-input"
        />
      </div>
      {uploading && (
        <div style={{ marginTop: 12, height: 4, background: 'rgba(240,235,224,0.1)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            transition: 'width 0.2s ease',
          }} />
        </div>
      )}
      {error && (
        <div data-testid="custom-brochure-error" style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 8,
          color: '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
