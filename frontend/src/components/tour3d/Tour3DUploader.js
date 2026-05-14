// W4.9.6 — Tour3DUploader
// Drag-drop .ply/.spz/.splat (max 200MB) con progress bar streaming.
import React, { useRef, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const ALLOWED_EXT = ['ply', 'spz', 'splat'];
const MAX_MB = 200;

export default function Tour3DUploader({
  units = [],
  defaultUnitId = '',
  projectSlug = '',
  devId = '',
  onUploaded,
  onClose,
}) {
  const inputRef = useRef(null);
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const onFile = (f) => {
    setError('');
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setError(`Formato no soportado. Usa .ply, .spz o .splat.`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Archivo demasiado grande (máx ${MAX_MB} MB).`);
      return;
    }
    setFile(f);
  };

  const handleUpload = () => {
    if (!file) { setError('Selecciona un archivo primero.'); return; }
    if (!unitId) { setError('Selecciona una unidad.'); return; }
    setBusy(true);
    setProgress(0);
    setError('');

    const form = new FormData();
    form.append('unit_id', unitId);
    if (projectSlug) form.append('project_slug', projectSlug);
    if (devId) form.append('dev_id', devId);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/tour-3dgs/scans/upload`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 95));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
          setProgress(100);
          onUploaded?.(data.scan);
          setTimeout(() => { setBusy(false); setProgress(0); setFile(null); }, 600);
        } else {
          throw new Error(data?.detail || `HTTP ${xhr.status}`);
        }
      } catch (e) {
        setError(`Error al subir: ${e?.message || 'desconocido'}`);
        setBusy(false);
      }
    };
    xhr.onerror = () => { setError('Error de red durante la subida.'); setBusy(false); };
    xhr.send(form);
  };

  return (
    <div style={{
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 16, padding: 18,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
            Subir tour 3D
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
            Formatos: .ply, .spz, .splat · máx {MAX_MB} MB
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(240,235,224,0.25)',
              borderRadius: 9999,
              color: 'var(--cream)',
              padding: '5px 12px',
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            CERRAR
          </button>
        )}
      </div>

      {/* Unit selector */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: 'var(--cream-2, #d4d4d8)', marginBottom: 6 }}>
          UNIDAD
        </label>
        {units.length ? (
          <select
            data-testid="tour-uploader-unit-select"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(15,18,28,0.85)',
              border: '1px solid rgba(240,235,224,0.12)',
              borderRadius: 10,
              color: 'var(--cream)',
              padding: '10px 12px',
              fontFamily: 'DM Sans', fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">— Selecciona unidad —</option>
            {units.map((u) => (
              <option key={u.id || u.unit_id} value={u.id || u.unit_id}>
                {u.name || u.unit_number || u.id} {u.beds ? `· ${u.beds} rec` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            data-testid="tour-uploader-unit-select"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="ID de unidad"
            style={{
              width: '100%',
              background: 'rgba(15,18,28,0.85)',
              border: '1px solid rgba(240,235,224,0.12)',
              borderRadius: 10,
              color: 'var(--cream)',
              padding: '10px 12px',
              fontFamily: 'DM Sans', fontSize: 13,
              outline: 'none',
            }}
          />
        )}
      </div>

      {/* Dropzone */}
      <div
        data-testid="tour-uploader-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--theme-3)' : 'rgba(240,235,224,0.25)'}`,
          background: dragOver ? 'rgba(var(--theme-rgb),0.05)' : 'rgba(15,18,28,0.5)',
          borderRadius: 14,
          padding: 28, textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 220ms ease, background 220ms ease',
        }}
      >
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          {file ? file.name : 'Arrastra tu archivo aquí o haz clic'}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 4 }}>
          {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `.ply · .spz · .splat (máx ${MAX_MB} MB)`}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".ply,.spz,.splat"
          onChange={(e) => onFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </div>

      {/* Progress */}
      {busy && (
        <div data-testid="tour-uploader-progress" style={{
          marginTop: 12, height: 6, background: 'rgba(240,235,224,0.1)', borderRadius: 9999, overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            transition: 'width 240ms ease',
          }} />
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12, padding: '8px 12px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 8,
          color: '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          type="button"
          data-testid="tour-uploader-submit"
          onClick={handleUpload}
          disabled={busy || !file || !unitId}
          style={{
            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            color: '#fff', border: 'none', borderRadius: 9999,
            padding: '11px 24px',
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
            cursor: busy ? 'wait' : 'pointer',
            opacity: !file || !unitId ? 0.55 : 1,
          }}
        >
          {busy ? `SUBIENDO ${progress}%…` : 'SUBIR ARCHIVO'}
        </button>
      </div>
    </div>
  );
}
