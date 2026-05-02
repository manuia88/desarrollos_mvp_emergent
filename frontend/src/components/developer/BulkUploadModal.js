/**
 * BulkUploadModal — Phase 4.1
 * Drag & drop CSV/Excel → parse + preview → commit
 */
import React, { useState, useRef, useCallback } from 'react';
import { bulkUploadParse, bulkUploadCommit } from '../../api/developer';
import { Upload, X, AlertTriangle, CheckCircle, FileText } from '../icons';

const COL_LABELS = {
  unit_number: 'Unidad', prototype: 'Prototipo', level: 'Nivel',
  bedrooms: 'Rec.', bathrooms: 'Baños', m2_total: 'm² total',
  price: 'Precio', status: 'Estado', parking_spots: 'Est.', notes: 'Notas',
};

const STATUS_COLORS = {
  disponible: '#22c55e', apartado: '#f59e0b', reservado: '#ec4899',
  vendido: '#94a3b8', bloqueado: '#ef4444',
};

export default function BulkUploadModal({ devId, onClose, onCommitted }) {
  const [step, setStep] = useState('idle'); // idle | parsing | preview | committing | done
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [error, setError] = useState(null);
  const [overrideMode, setOverrideMode] = useState('upsert');
  const fileRef = useRef();

  const parseFile = useCallback(async (file) => {
    setStep('parsing');
    setError(null);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append('dev_id', devId);
      formData.append('file', file);
      const result = await bulkUploadParse(formData);
      setPreview(result);
      setStep('preview');
    } catch (e) {
      setError(e.body?.detail || e.message || 'Error al parsear el archivo');
      setStep('idle');
    }
  }, [devId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) parseFile(file);
  };

  const commit = async () => {
    if (!preview) return;
    setStep('committing');
    setError(null);
    try {
      const validRows = preview.preview.filter(r => r.valid);
      const result = await bulkUploadCommit({
        dev_id: devId,
        filename: preview.filename,
        rows: validRows,
        override_mode: overrideMode,
      });
      setCommitResult(result);
      setStep('done');
      if (onCommitted) onCommitted(result);
    } catch (e) {
      setError(e.body?.detail || e.message || 'Error al persistir');
      setStep('preview');
    }
  };

  const displayCols = preview
    ? (preview.detected_columns || []).filter(c => COL_LABELS[c]).slice(0, 7)
    : [];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} data-testid="bulk-upload-modal" style={{
        width: '100%', maxWidth: 820, maxHeight: '90vh',
        background: '#0D1118', border: '1px solid var(--border)',
        borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              Bulk Upload Unidades
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
              Sube un archivo CSV o Excel con tus unidades
            </div>
          </div>
          <button onClick={onClose} data-testid="bulk-close-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* Step: idle / drag zone */}
          {(step === 'idle' || step === 'parsing') && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                data-testid="bulk-dropzone"
                style={{
                  border: `2px dashed ${dragOver ? '#6366F1' : 'var(--border)'}`,
                  borderRadius: 14, padding: '40px 24px', textAlign: 'center',
                  cursor: 'pointer', transition: 'border-color 0.18s, background 0.18s',
                  background: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <Upload size={28} color={dragOver ? '#6366F1' : 'var(--cream-3)'} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 15, color: 'var(--cream-2)', marginBottom: 6 }}>
                  {step === 'parsing' ? 'Procesando archivo...' : 'Arrastra tu archivo aquí'}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-4)' }}>
                  Formatos: .csv · .xlsx · .xls &nbsp;·&nbsp; Máx 2,000 filas · 10 MB
                </div>
                <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)' }}>
                  Columnas recomendadas: unit_number, prototype, level, bedrooms, bathrooms, m2_total, price, status
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />

              {/* Template download hint */}
              <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textAlign: 'center' }}>
                Tip: Las columnas no necesitan orden específico. unit_number es el único campo requerido.
              </div>
            </>
          )}

          {/* Step: preview */}
          {step === 'preview' && preview && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatPill label="Total filas" value={preview.total_rows} color="#6366F1" />
                <StatPill label="Válidas" value={preview.valid_rows} color="#22c55e" />
                {preview.error_rows > 0 && <StatPill label="Con errores" value={preview.error_rows} color="#ef4444" />}
                <StatPill label="Columnas detectadas" value={preview.detected_columns?.length || 0} color="#f59e0b" />
              </div>

              {/* Override mode */}
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Modo:</span>
                {[['upsert', 'Actualizar existentes'], ['skip_existing', 'Solo nuevas']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setOverrideMode(val)} data-testid={`override-mode-${val}`}
                    style={{
                      padding: '5px 12px', borderRadius: 7,
                      background: overrideMode === val ? 'rgba(99,102,241,0.18)' : 'transparent',
                      border: `1px solid ${overrideMode === val ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                      color: overrideMode === val ? '#a5b4fc' : 'var(--cream-3)',
                      fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                    }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* Preview table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#0D1118' }}>
                      <th style={thStyle}>#</th>
                      {displayCols.map(c => <th key={c} style={thStyle}>{COL_LABELS[c] || c}</th>)}
                      <th style={thStyle}>Estado</th>
                      <th style={thStyle}>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} data-testid={`preview-row-${i}`} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: !row.valid ? 'rgba(239,68,68,0.04)' : 'transparent',
                      }}>
                        <td style={tdStyle}>{row._row_index || i + 1}</td>
                        {displayCols.map(c => (
                          <td key={c} style={tdStyle}>
                            {c === 'status' && row[c]
                              ? <span style={{ color: STATUS_COLORS[row[c]] || 'var(--cream-3)' }}>{row[c]}</span>
                              : row[c] || <span style={{ color: 'var(--cream-4)' }}>—</span>}
                          </td>
                        ))}
                        <td style={tdStyle}>
                          {row.valid
                            ? <span style={{ color: '#22c55e', fontSize: 11 }}>OK</span>
                            : <span style={{ color: '#ef4444', fontSize: 11 }}>Error</span>}
                        </td>
                        <td style={{ ...tdStyle, color: '#fca5a5', fontSize: 11 }}>
                          {(row.errors || []).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.total_rows > 100 && (
                <div style={{ textAlign: 'center', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', marginTop: 8 }}>
                  Mostrando primeras 100 filas · {preview.total_rows} totales
                </div>
              )}
            </>
          )}

          {/* Step: done */}
          {step === 'done' && commitResult && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <CheckCircle size={40} color="#22c55e" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
                Batch completado
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', marginBottom: 18 }}>
                {commitResult.rows_committed} unidades actualizadas exitosamente
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <StatPill label="Parseadas" value={commitResult.rows_parsed} color="#6366F1" />
                <StatPill label="Committed" value={commitResult.rows_committed} color="#22c55e" />
                {commitResult.errors?.length > 0 && <StatPill label="Errores" value={commitResult.errors.length} color="#ef4444" />}
              </div>
            </div>
          )}

          {error && (
            <div data-testid="bulk-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px' }}>
              <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#fca5a5' }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'preview' || step === 'committing') && preview && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => { setStep('idle'); setPreview(null); }}
              style={{ padding: '9px 18px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
              Cargar otro archivo
            </button>
            <button onClick={commit} disabled={step === 'committing' || preview.valid_rows === 0}
              data-testid="bulk-commit-btn"
              style={{
                padding: '9px 22px', borderRadius: 9999,
                background: preview.valid_rows > 0 ? 'var(--grad)' : 'rgba(255,255,255,0.08)',
                border: 'none', color: preview.valid_rows > 0 ? '#fff' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: preview.valid_rows > 0 ? 'pointer' : 'default',
                opacity: step === 'committing' ? 0.6 : 1,
              }}>
              {step === 'committing' ? 'Guardando...' : `Confirmar ${preview.valid_rows} unidades`}
            </button>
          </div>
        )}
        {step === 'done' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}28`, borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color }}>{value}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const thStyle = { padding: '9px 12px', textAlign: 'left', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' };
const tdStyle = { padding: '9px 12px', color: 'var(--cream-2)', verticalAlign: 'middle' };
