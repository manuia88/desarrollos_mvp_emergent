// W5.17 · StagingUploader · drag-drop + sha256 hash + preview
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];

function UploadIcon({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

async function sha256_16(file) {
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hashBuf));
    return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join(''); // primeros 16 chars hex
  } catch {
    return `noh_${Date.now().toString(36)}`;
  }
}

export default function StagingUploader({ onImageSelected, maxSizeMB = 10 }) {
  const { t } = useTranslation('common');
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError(t('virtualStaging.upload_error_type', 'Solo se aceptan archivos JPG/PNG.'));
      return;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(t('virtualStaging.upload_error_size', 'La imagen excede el tamano maximo permitido.'));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const hash = await sha256_16(file);
      setPreviewUrl(dataUrl);
      if (typeof onImageSelected === 'function') {
        onImageSelected({ file, dataUrl, hash });
      }
    } catch {
      setError(t('virtualStaging.error_generic', 'No fue posible procesar la imagen.'));
    } finally {
      setBusy(false);
    }
  }, [maxSizeMB, onImageSelected, t]);

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div data-testid="staging-uploader">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          width: '100%',
          padding: previewUrl ? 18 : 48,
          background: CARD_BG,
          border: dragging ? `2px solid transparent` : `2px dashed rgba(240,235,224,0.30)`,
          borderRadius: 24,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          color: CREAM,
          fontFamily: 'DM Sans, sans-serif',
          cursor: 'pointer',
          textAlign: 'center',
          transition: `transform 280ms ${EASE}, border-color 280ms ${EASE}, background 280ms ${EASE}`,
          transform: dragging ? 'scale(1.02)' : 'scale(1)',
          backgroundImage: dragging ? `${CARD_BG}, ${GRAD}` : undefined,
        }}
      >
        {previewUrl ? (
          <div>
            <img
              data-testid="staging-preview-img"
              src={previewUrl}
              alt=""
              style={{
                width: '100%', maxHeight: 320, objectFit: 'cover',
                borderRadius: 16, display: 'block', aspectRatio: '16/9',
              }}
            />
            <div style={{ marginTop: 14, fontSize: 12, color: MUTED }}>
              {t('virtualStaging.upload_change_btn', 'Cambiar foto')}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ color: INDIGO, marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <UploadIcon size={56} />
            </div>
            <div style={{
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18,
              color: CREAM, marginBottom: 6, letterSpacing: '-0.01em',
            }}>{t('virtualStaging.upload_idle', 'Sube foto del cuarto vacio')}</div>
            <div style={{ color: MUTED_2, fontSize: 12 }}>
              {busy ? t('virtualStaging.upload_validating', 'Validando...') : `JPG/PNG · max ${maxSizeMB}MB`}
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          data-testid="staging-upload-input"
          type="file"
          accept="image/jpeg,image/png"
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
      </button>

      {error && (
        <p data-testid="staging-upload-error" style={{
          margin: '10px 0 0', padding: '8px 12px',
          background: 'rgba(236,72,153,0.10)',
          border: `1px solid ${ROSE}55`,
          borderRadius: 10,
          color: '#F9A8D4', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
        }}>{error}</p>
      )}
    </div>
  );
}
