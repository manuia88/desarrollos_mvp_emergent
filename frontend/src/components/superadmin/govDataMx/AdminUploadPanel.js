/**
 * W6.MOV.2 · Track C · Admin Upload Panel.
 *
 * Drag-drop CSV/Excel/PDF (max 10MB) · dropdown source_label · validations
 * inline · tabla uploads previos con acción Delete.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteUpload, listUploads, uploadFile } from '../../../api/govDataMx';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['.csv', '.xlsx', '.xls', '.pdf'];

const SOURCE_LABELS = [
  'notarias_cnnym',
  'rpp_cdmx',
  'catastro_miguel_hidalgo',
  'catastro_cuauhtemoc',
  'shf_reportes',
  'bmv_fibras_local',
  'cfe_cobertura',
  'conagua',
  'otros',
];

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX'); } catch { return iso; }
}

function isAllowedExt(name) {
  const n = (name || '').toLowerCase();
  return ALLOWED_EXTS.some((e) => n.endsWith(e));
}

export default function AdminUploadPanel() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sourceLabel, setSourceLabel] = useState(SOURCE_LABELS[0]);
  const [schemaHint, setSchemaHint] = useState('');
  const [progress, setProgress] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUploads({ limit: 50, offset: 0 });
      setItems(data?.items || []);
      setTotal(data?.total || 0);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t('govDataMx.upload.tooLarge', 'Archivo excede 10MB'));
      return;
    }
    if (!isAllowedExt(file.name)) {
      setError(t('govDataMx.upload.badExt', 'Extensión no permitida · usa .csv, .xlsx, .xls o .pdf'));
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ name: file.name, size: file.size });
    try {
      await uploadFile({ file, source_label: sourceLabel, schema_hint: schemaHint || undefined });
      setSchemaHint('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleDelete = async (id) => {
    const reason = window.prompt(t('govDataMx.upload.deleteReason', 'Razón (opcional)')) || '';
    setBusy(true);
    try {
      await deleteUpload(id, reason);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div data-testid="gov-data-mx-upload-panel">
      {error && (
        <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 16, color: '#FBCFE8' }}>
          {error}
        </div>
      )}

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          {t('govDataMx.upload.title', 'Subir archivo manual')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('govDataMx.upload.source', 'Fuente')}
            </span>
            <select
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              disabled={busy}
              style={{
                padding: '8px 12px', borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)',
                border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontSize: 13,
              }}
            >
              {SOURCE_LABELS.map((s) => (
                <option key={s} value={s}>{t(`govDataMx.uploadSource.${s}`, s)}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('govDataMx.upload.schemaHint', 'Schema hint (opcional)')}
            </span>
            <input
              type="text" maxLength={500}
              value={schemaHint}
              onChange={(e) => setSchemaHint(e.target.value)}
              disabled={busy}
              placeholder={t('govDataMx.upload.schemaHintPh', 'p.ej. cuenta_catastral,valor,fecha')}
              style={{
                padding: '8px 12px', borderRadius: 9999,
                background: 'rgba(240,235,224,0.06)',
                border: '1px solid rgba(240,235,224,0.12)',
                color: CREAM, fontSize: 13,
              }}
            />
          </label>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            padding: 24, borderRadius: 14,
            border: `2px dashed ${dragOver ? 'rgba(99,102,241,0.6)' : 'rgba(240,235,224,0.18)'}`,
            background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(240,235,224,0.03)',
            textAlign: 'center', cursor: busy ? 'wait' : 'pointer',
            transition: 'background 120ms, border-color 120ms',
          }}
          onClick={() => !busy && fileInputRef.current?.click()}
          data-testid="gov-data-mx-dropzone"
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {progress
              ? t('govDataMx.upload.uploading', `Subiendo ${progress.name}…`)
              : t('govDataMx.upload.dropOrClick', 'Arrastra archivo aquí o haz click para seleccionar')}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
            {t('govDataMx.upload.constraints', 'CSV · Excel · PDF · max 10MB')}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files?.[0])}
            disabled={busy}
          />
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('govDataMx.upload.tableTitle', 'Uploads previos')} · {total}
          </div>
          <button
            onClick={load}
            disabled={loading || busy}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: GRAD, color: '#06080F',
              border: 'none', fontWeight: 700, fontSize: 11, letterSpacing: 0.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {loading ? t('common.loading', 'Cargando') : t('common.refresh', 'Refrescar')}
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
            {t('govDataMx.upload.noUploads', 'Sin uploads aún')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                    {t('govDataMx.upload.col.filename', 'Archivo')}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                    {t('govDataMx.upload.col.source', 'Fuente')}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                    {t('govDataMx.upload.col.size', 'Tamaño')}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                    {t('govDataMx.upload.col.uploadedAt', 'Fecha')}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                    {t('govDataMx.upload.col.actions', 'Acciones')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`gov-data-mx-upload-${it.id}`}>
                    <td style={{ padding: '10px 8px' }}>{it.filename}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.75 }}>
                      {t(`govDataMx.uploadSource.${it.source_label}`, it.source_label)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtBytes(it.size)}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.75 }}>{fmtDate(it.uploaded_at)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(it.id)}
                        disabled={busy}
                        style={{
                          padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                          background: 'rgba(236,72,153,0.18)', color: CREAM,
                          border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer',
                        }}
                      >
                        {t('common.delete', 'Borrar')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
