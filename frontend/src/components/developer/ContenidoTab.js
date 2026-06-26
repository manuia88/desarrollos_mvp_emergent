/**
 * Phase 4 Batch 11 — Sub-chunk A
 * ContenidoTab — 6 sub-tabs de assets multimedia
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import DragDropZone from '../shared/DragDropZone';
import { listDevAssets } from '../../api/developer';
import { Upload, X, Download, Star } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

const CONTENT_SUBS = [
  { key: 'fotos',     label: 'Fotos',     asset_type: 'foto_render' },
  { key: 'planos',    label: 'Planos',    asset_type: 'plano_thumbnail' },
  { key: 'renders',   label: 'Renders',   asset_type: 'foto_unidad_modelo' },
  { key: 'videos',    label: 'Videos',    asset_type: 'video' },
  { key: 'brochures', label: 'Brochures', asset_type: 'brochure' },
];

function AssetThumb({ asset, onDelete, onSetCover }) {
  const [hover, setHover] = useState(false);
  const isImage = !asset.asset_type?.includes('video') && !asset.asset_type?.includes('brochure');

  return (
    <div
      data-testid={`asset-thumb-${asset.id}`}
      style={{
        position: 'relative', borderRadius: 10, overflow: 'hidden',
        border: `1.5px solid ${hover ? 'rgba(var(--cream-rgb),0.3)' : 'rgba(var(--cream-rgb),0.1)'}`,
        background: 'rgba(var(--cream-rgb),0.04)', cursor: 'pointer',
        transition: 'border-color 0.15s',
        aspectRatio: '4/3',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail */}
      {isImage && asset.url ? (
        <img src={asset.url} alt={asset.filename || 'asset'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--cream-rgb),0.06)' }}>
          <Upload size={24} color="rgba(var(--cream-rgb),0.2)" />
        </div>
      )}
      {/* Hover overlay — suave con degradado + blur (antes era negro sólido) */}
      {hover && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(var(--bg-rgb),0.86), rgba(var(--bg-rgb),0.28))',
          backdropFilter: 'blur(2px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'opacity 0.15s',
        }}>
          {asset.url && (
            <a href={asset.url} download target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(var(--cream-rgb),0.18)', color: 'var(--cream)', padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}>
              <Download size={12} /> Descargar
            </a>
          )}
          <button onClick={(e) => { e.stopPropagation(); onSetCover(asset.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(245,158,11,0.22)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.4)', padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Star size={12} /> Usar de portada
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.2)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.4)', padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <X size={11} /> Eliminar
          </button>
        </div>
      )}
      {/* Cover badge */}
      {asset.role === 'cover' && (
        <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(245,158,11,0.9)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          PORTADA
        </div>
      )}
      {/* Filename */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(var(--bg-rgb),0.85))',
        padding: '12px 8px 6px',
      }}>
        <div style={{ fontSize: 10, color: 'var(--cream-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.filename || 'Sin nombre'}
        </div>
      </div>
    </div>
  );
}

// Editor MANUAL de la descripción del proyecto (la "historia" que ve el comprador en la ficha). Se pre-llena del
// dato público actual y guarda al overlay del dev (PATCH /projects/{id}/basics) → se refleja en el marketplace.
function DescripcionEditor({ devId }) {
  const [desc, setDesc] = useState('');
  const [orig, setOrig] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/developments/${devId}`).then(r => r.json())
      .then(d => { if (alive) { const v = d.description || ''; setDesc(v); setOrig(v); } }).catch(() => {});
    return () => { alive = false; };
  }, [devId]);
  const dirty = desc.trim() !== orig.trim();
  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await fetch(`${API}/api/dev/projects/${devId}/basics`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ description: desc.trim() }),
      });
      setOrig(desc.trim()); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { /* fail-open */ }
    setBusy(false);
  };
  return (
    <div style={{ marginBottom: 22, padding: 18, borderRadius: 14, border: '1px solid rgba(var(--cream-rgb),0.12)', background: 'rgba(var(--cream-rgb),0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>Descripción del proyecto</div>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>La "historia" que ve el comprador en la ficha. Lo que escribas aquí se publica en el marketplace.</div>
        </div>
        <button data-testid="save-descripcion" onClick={save} disabled={!dirty || busy}
          style={{ background: (dirty && !busy) ? 'var(--grad, #6D4AFF)' : 'rgba(var(--cream-rgb),0.12)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 18px', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 13, cursor: (dirty && !busy) ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
          {busy ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1500}
        placeholder="Describe el proyecto: concepto, ubicación, qué lo hace especial…"
        style={{ width: '100%', minHeight: 110, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(var(--cream-rgb),0.16)', background: 'rgba(var(--cream-rgb),0.04)', color: 'var(--cream)', fontFamily: "'DM Sans',sans-serif", fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none' }} />
      <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 5, textAlign: 'right' }}>{desc.length}/1500</div>
    </div>
  );
}

export default function ContenidoTab({ devId, user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const fileInputRef = useRef(null);

  const activeKey = searchParams.get('content_sub') || 'fotos';
  const activeConfig = CONTENT_SUBS.find(s => s.key === activeKey) || CONTENT_SUBS[0];

  const setContentSub = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('content_sub', key);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDevAssets(devId, activeConfig.asset_type);
      setAssets(Array.isArray(data) ? data : (data?.assets || []));
    } catch (e) {
      console.error('ContenidoTab load:', e);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [devId, activeConfig.asset_type]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('asset_type', activeConfig.asset_type);
        fd.append('dev_id', devId);
        await fetch(`${API}/api/desarrollador/developments/${devId}/assets/upload`, {
          method: 'POST', credentials: 'include', body: fd,
        });
      }
      await load();
    } catch (e) {
      console.error('Upload error:', e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (assetId) => {
    if (!window.confirm('¿Eliminar este asset?')) return;
    try {
      await fetch(`${API}/api/desarrollador/developments/${devId}/assets/${assetId}`, {
        method: 'DELETE', credentials: 'include',
      });
      await load();
    } catch (e) { console.error('Delete error:', e); }
  };

  const handleSetCover = async (assetId) => {
    try {
      await fetch(`${API}/api/dev/projects/${devId}/assets/${assetId}/role`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'cover' }),
      });
      await load();
    } catch (e) { console.error('Set cover error:', e); }
  };

  return (
    <div>
      <DescripcionEditor devId={devId} />
      {/* Sub-tab bar + botón subir */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CONTENT_SUBS.map(s => (
            <button
              key={s.key}
              data-testid={`content-sub-${s.key}`}
              onClick={() => setContentSub(s.key)}
              style={{
                background: activeKey === s.key ? 'var(--cream)' : 'rgba(var(--cream-rgb),0.06)',
                color: activeKey === s.key ? 'var(--navy)' : 'var(--cream-2)',
                border: activeKey === s.key ? 'none' : '1px solid rgba(var(--cream-rgb),0.12)',
                borderRadius: 20, padding: '5px 14px', fontSize: 12,
                fontWeight: activeKey === s.key ? 700 : 400, cursor: 'pointer',
              }}
            >
              {s.label}
              <span style={{ marginLeft: 5, opacity: 0.7, fontSize: 10 }}>
                {activeKey === s.key ? assets.length : ''}
              </span>
            </button>
          ))}
        </div>
        <button
          data-testid="content-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: uploading ? 'rgba(148,163,184,0.25)' : 'var(--grad)',
            color: '#fff', border: 'none', borderRadius: 9999,
            padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
            cursor: uploading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}>
          <Upload size={14} /> {uploading ? 'Subiendo…' : `Subir ${activeConfig.label.toLowerCase()}`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Upload zone */}
      <div style={{ marginBottom: 20 }}>
        <DragDropZone
          onFiles={handleUpload}
          accept="image/*,video/*,.pdf"
          label={`Arrastra ${activeConfig.label.toLowerCase()} aquí o haz click para subir`}
          disabled={uploading}
        />
        {uploading && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>
            Subiendo archivos…
          </p>
        )}
      </div>

      {/* Asset grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, background: 'rgba(var(--cream-rgb),0.05)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--cream-3)', fontSize: 13 }}>
          No hay {activeConfig.label.toLowerCase()} cargados todavía.<br />
          Usa la zona de arriba para subir.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {assets.map(a => (
            <AssetThumb
              key={a.id}
              asset={a}
              onDelete={handleDelete}
              onSetCover={handleSetCover}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewAsset && (
        <div
          onClick={() => setPreviewAsset(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.TOAST,
          }}
        >
          <button onClick={() => setPreviewAsset(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(var(--cream-rgb),0.15)', border: 'none', color: 'var(--cream)', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>
            <X size={16} />
          </button>
          <img src={previewAsset.url} alt={previewAsset.filename}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
