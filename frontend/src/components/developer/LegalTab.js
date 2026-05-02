/**
 * Phase 4 Batch 11 — Sub-chunk A
 * LegalTab — documentos legales, upload, status timeline, IA categorización
 */
import React, { useState, useEffect, useCallback } from 'react';
import DragDropZone from '../shared/DragDropZone';
import { listDevDocuments, uploadDevDocument } from '../../api/developer';
import { FileText, Check, Clock, X } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const DOC_STATUS = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  aprobado:   { label: 'Aprobado',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  rechazado:  { label: 'Rechazado',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  revision:   { label: 'En revisión',color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
};

const DOC_CATEGORIES = [
  'Escritura', 'Permiso SEDUVI', 'Uso de Suelo', 'Predial', 'Planos autorizados',
  'Contrato modelo', 'Fideicomiso', 'Constancia municipal', 'Otro',
];

const TIMELINE_STAGES = [
  { key: 'Uso de Suelo',       label: 'Uso de suelo' },
  { key: 'Permiso SEDUVI',     label: 'Permiso SEDUVI' },
  { key: 'Planos autorizados', label: 'Planos autorizados' },
  { key: 'Contrato modelo',    label: 'Contrato firmado' },
  { key: 'Escritura',          label: 'Escritura' },
];

function DocCard({ doc, onDelete }) {
  const st = DOC_STATUS[doc.status || 'pendiente'] || DOC_STATUS.pendiente;
  return (
    <div
      data-testid={`doc-card-${doc.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.10)',
        borderRadius: 10, padding: '12px 16px',
      }}
    >
      <div style={{
        width: 40, height: 48, borderRadius: 6, flexShrink: 0,
        background: 'rgba(240,235,224,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={20} color="rgba(240,235,224,0.4)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title || doc.filename || 'Documento'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
          {doc.doc_category || doc.doc_type || 'Sin categoría'} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('es-MX') : '—'}
        </div>
      </div>
      <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
        {st.label}
      </span>
      {doc.file_url && (
        <a href={doc.file_url} target="_blank" rel="noreferrer"
          style={{ color: 'var(--cream-3)', textDecoration: 'none', fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(240,235,224,0.1)' }}>
          Ver
        </a>
      )}
      {onDelete && (
        <button onClick={() => onDelete(doc.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: 4 }} title="Eliminar">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function LegalTimeline({ docs }) {
  const uploadedTypes = new Set(docs.map(d => d.doc_category || d.doc_type || ''));
  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--cream-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Estado del proceso legal
      </h4>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
        {TIMELINE_STAGES.map((s, i) => {
          const done = uploadedTypes.has(s.key);
          return (
            <React.Fragment key={s.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: done ? 'var(--cream)' : 'rgba(240,235,224,0.08)',
                  border: `2px solid ${done ? 'var(--cream)' : 'rgba(240,235,224,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done ? <Check size={13} color="var(--navy)" strokeWidth={3} /> : <Clock size={13} color="rgba(240,235,224,0.3)" />}
                </div>
                <span style={{ fontSize: 9, color: done ? 'var(--cream)' : 'var(--cream-3)', textAlign: 'center', lineHeight: 1.3, fontWeight: done ? 600 : 400 }}>
                  {s.label}
                </span>
              </div>
              {i < TIMELINE_STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? 'rgba(240,235,224,0.3)' : 'rgba(240,235,224,0.08)', marginTop: -16 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function LegalTab({ devId, user }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(DOC_CATEGORIES[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDevDocuments(devId, 'legal');
      const list = Array.isArray(data) ? data : (data?.items || data?.documents || []);
      setDocs(list);
    } catch (e) {
      setDocs([]);
    } finally { setLoading(false); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', 'legal');
        fd.append('doc_category', selectedCategory);
        fd.append('title', selectedCategory);
        await uploadDevDocument(devId, fd);
      }
      await load();
    } catch (e) { console.error('Legal upload:', e); }
    finally { setUploading(false); }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    try {
      await fetch(`${API}/api/desarrollador/developments/${devId}/documents/${docId}`, {
        method: 'DELETE', credentials: 'include',
      });
      await load();
    } catch (e) { console.error('Delete doc:', e); }
  };

  return (
    <div>
      <LegalTimeline docs={docs} />

      {/* Upload section */}
      <div style={{
        background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.1)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 20,
      }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
          Subir documento legal
        </h4>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{
              background: 'rgba(240,235,224,0.08)', color: 'var(--cream)',
              border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
              padding: '6px 10px', fontSize: 12, cursor: 'pointer',
            }}
          >
            {DOC_CATEGORIES.map(c => (
              <option key={c} value={c} style={{ background: 'var(--navy)' }}>{c}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--cream-3)', alignSelf: 'center' }}>
            Categoría auto-detectada por IA al subir ·&nbsp;
            <em>PDF, DOCX hasta 12MB</em>
          </span>
        </div>
        <DragDropZone
          onFiles={handleUpload}
          accept=".pdf,.docx,.doc,.jpg,.png"
          label="Arrastra documentos aquí o haz click para seleccionar"
          disabled={uploading}
        />
        {uploading && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>Subiendo y categorizando con IA…</p>}
      </div>

      {/* Documents list */}
      <h4 style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--cream-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Documentos ({docs.length})
      </h4>
      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontSize: 13, textAlign: 'center', padding: 20 }}>Cargando…</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--cream-3)', fontSize: 13 }}>
          Sin documentos legales cargados.<br />
          <span style={{ fontSize: 11, opacity: 0.7 }}>Usa la zona de arriba para subir escrituras, permisos, predial, etc.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => <DocCard key={d.id} doc={d} onDelete={user?.role === 'developer_admin' ? handleDelete : null} />)}
        </div>
      )}
    </div>
  );
}
