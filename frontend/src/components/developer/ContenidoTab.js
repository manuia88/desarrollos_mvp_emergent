/**
 * Phase 4 Batch 11 — Sub-chunk A
 * ContenidoTab — 6 sub-tabs de assets multimedia
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DragDropZone from '../shared/DragDropZone';
import { listDevAssets } from '../../api/developer';
import { Upload, X, Download, Star } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const CONTENT_SUBS = [
  { key: 'fotos',     label: 'Fotos',     asset_type: 'foto_render' },
  { key: 'planos',    label: 'Planos',    asset_type: 'plano_thumbnail' },
  { key: 'renders',   label: 'Renders',   asset_type: 'foto_unidad_modelo' },
  { key: 'videos',    label: 'Videos',    asset_type: 'video' },
  { key: 'tour360',   label: 'Tour 360°', asset_type: 'tour_360' },
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
        border: `1.5px solid ${hover ? 'rgba(240,235,224,0.3)' : 'rgba(240,235,224,0.1)'}`,
        background: 'rgba(240,235,224,0.04)', cursor: 'pointer',
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
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(240,235,224,0.06)' }}>
          <Upload size={24} color="rgba(240,235,224,0.2)" />
        </div>
      )}
      {/* Hover overlay */}
      {hover && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(6,8,15,0.7)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {asset.url && (
            <a href={asset.url} download target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(240,235,224,0.15)', color: 'var(--cream)', padding: '4px 10px', borderRadius: 6, fontSize: 11, textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}>
              <Download size={12} /> Descargar
            </a>
          )}
          <button onClick={(e) => { e.stopPropagation(); onSetCover(asset.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(240,235,224,0.15)', color: 'var(--cream)', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
            <Star size={12} /> Portada
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
            style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
            Eliminar
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
        background: 'linear-gradient(transparent, rgba(6,8,15,0.85))',
        padding: '12px 8px 6px',
      }}>
        <div style={{ fontSize: 10, color: 'var(--cream-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.filename || 'Sin nombre'}
        </div>
      </div>
    </div>
  );
}

export default function ContenidoTab({ devId, user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);

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
      await fetch(`${API}/api/desarrollador/developments/${devId}/assets/${assetId}/role`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'cover' }),
      });
      await load();
    } catch (e) { console.error('Set cover error:', e); }
  };

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {CONTENT_SUBS.map(s => (
          <button
            key={s.key}
            data-testid={`content-sub-${s.key}`}
            onClick={() => setContentSub(s.key)}
            style={{
              background: activeKey === s.key ? 'var(--cream)' : 'rgba(240,235,224,0.06)',
              color: activeKey === s.key ? 'var(--navy)' : 'var(--cream-2)',
              border: activeKey === s.key ? 'none' : '1px solid rgba(240,235,224,0.12)',
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
            <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, background: 'rgba(240,235,224,0.05)', animation: 'pulse 1.5s infinite' }} />
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
            position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          }}
        >
          <button onClick={() => setPreviewAsset(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(240,235,224,0.15)', border: 'none', color: 'var(--cream)', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>
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
