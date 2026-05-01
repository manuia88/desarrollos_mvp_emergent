// AssetGallery — Phase 7.6 · Drag-reorder grid + AI category badges + delete + bulk upload + 360°.
import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash, Sparkle, RotateCcw, Camera, AlertTriangle } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const ASSET_TYPE_LABELS = {
  foto_hero: 'Hero',
  foto_render: 'Render',
  foto_unidad_modelo: 'Depto muestra',
  plano_thumbnail: 'Plano',
  tour_360: '360°',
};

const CAT_TONE = {
  sala: '#a5b4fc', cocina: '#fcd34d', recamara: '#86efac', bano: '#67e8f9',
  fachada: '#fda4af', exterior: '#bef264', amenidad: '#f9a8d4', plano: '#cbd5e1',
};


function fetchAssets(devId, asset_type) {
  const url = `${API}/api/developments/${encodeURIComponent(devId)}/assets${asset_type ? `?asset_type=${asset_type}` : ''}`;
  return fetch(url).then(r => r.json());
}


export default function AssetGallery({ devId, scope = 'developer', filterType = null, allowGenerate360 = false }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);
  const fileRef = useRef(null);

  const basePath = scope === 'developer' ? '/api/desarrollador' : '/api/superadmin';

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAssets(devId, filterType);
      setAssets(r.assets || []);
    } catch (e) {
      setToast({ ok: false, msg: e.message });
    }
    setLoading(false);
  };

  useEffect(() => { if (devId) load(); /* eslint-disable-next-line */ }, [devId, filterType]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-poll while any asset is missing AI categorization
  useEffect(() => {
    const pending = assets.some(a => a.asset_type !== 'plano_thumbnail' && !a.ai_category && !a.ai_error);
    if (!pending) return;
    const t = setInterval(load, 3500);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [assets]);

  const upload = async (files) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('asset_type', filterType || 'foto_render');
    for (const f of files) fd.append('files', f);
    try {
      const r = await fetch(`${API}${basePath}/developments/${encodeURIComponent(devId)}/assets/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail || r.statusText);
      setToast({ ok: true, msg: `Subidas ${data.count} imagen${data.count === 1 ? '' : 'es'} · IA categorizando…` });
      await load();
    } catch (e) {
      setToast({ ok: false, msg: e.message });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = async (e) => {
    e.preventDefault();
    upload(e.dataTransfer?.files);
  };

  const reorder = async (newOrder) => {
    setAssets(newOrder);
    try {
      await fetch(`${API}${basePath}/developments/${encodeURIComponent(devId)}/assets/reorder`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: newOrder.map(a => a.id) }),
      });
    } catch (e) { setToast({ ok: false, msg: e.message }); load(); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este asset?')) return;
    try {
      await fetch(`${API}${basePath}/developments/${encodeURIComponent(devId)}/assets/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      setToast({ ok: true, msg: 'Asset eliminado.' });
      load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
  };

  const handleRecategorize = async (id) => {
    try {
      await fetch(`${API}${basePath}/developments/${encodeURIComponent(devId)}/assets/${id}/categorize`, {
        method: 'POST', credentials: 'include',
      });
      load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
  };

  const handleGenerate360 = async (id) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}${basePath}/developments/${encodeURIComponent(devId)}/assets/${id}/generate-360`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      if (data.ok) {
        setToast({ ok: true, msg: 'Tour 360° generado · refrescando…' });
      } else {
        setToast({ ok: false, msg: data.hint || data.error || 'Error generando 360°' });
      }
      load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
    setBusy(false);
  };

  // Drag-reorder
  const onDragStart = (id) => setDragId(id);
  const onDragOver = (e) => e.preventDefault();
  const onDragDropOn = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const fromIdx = assets.findIndex(a => a.id === dragId);
    const toIdx = assets.findIndex(a => a.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...assets];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reorder(reordered);
    setDragId(null);
  };

  return (
    <div data-testid="asset-gallery">
      <div onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
           onDragLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
           onDrop={(e) => { e.currentTarget.style.background = 'transparent'; onDrop(e); }}
           style={{
             border: '1.5px dashed var(--border)', borderRadius: 14, padding: 22, marginBottom: 18,
             textAlign: 'center', cursor: 'pointer',
             transition: 'background 0.15s',
           }}
           onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden
               onChange={(e) => upload(e.target.files)} data-testid="asset-upload-input" />
        <Upload size={22} color="var(--cream-3)" />
        <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream)', marginTop: 8 }}>
          Arrastra hasta 20 imágenes o haz clic
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
          JPG · PNG · WebP · max 12 MB · auto-watermark + auto-categorización con IA
        </div>
        {busy && <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--indigo-3)' }}>Subiendo…</div>}
      </div>

      {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando…</div>}

      {!loading && assets.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12 }}>
          <Camera size={26} color="var(--cream-3)" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 8 }}>
            Sin imágenes aún en este desarrollo.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {assets.map((a) => (
          <div key={a.id}
               data-testid="asset-card"
               draggable={!a.tour_url}
               onDragStart={() => onDragStart(a.id)}
               onDragOver={onDragOver}
               onDrop={() => onDragDropOn(a.id)}
               style={{
                 position: 'relative',
                 background: '#0D1118', border: '1px solid var(--border)', borderRadius: 12,
                 overflow: 'hidden',
                 cursor: 'grab',
                 transition: 'transform 0.15s, box-shadow 0.15s',
               }}
               onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.35)'; }}
               onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <img src={`${API}${a.public_url}`} alt={a.ai_caption || a.filename}
                 style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />

            {a.ai_category && (
              <span data-testid={`asset-cat-${a.ai_category}`} style={{
                position: 'absolute', top: 8, left: 8,
                padding: '3px 9px', borderRadius: 9999,
                background: 'rgba(6,8,15,0.74)', backdropFilter: 'blur(10px)',
                color: CAT_TONE[a.ai_category] || '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 9.5,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                border: `1px solid ${CAT_TONE[a.ai_category] || 'var(--border)'}66`,
              }}>{a.ai_category}</span>
            )}

            {a.tour_url && (
              <span style={{
                position: 'absolute', top: 8, right: 8,
                padding: '3px 9px', borderRadius: 9999,
                background: 'linear-gradient(92deg, rgba(99,102,241,0.92), rgba(168,85,247,0.92))',
                color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 9.5,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
              }}>360°</span>
            )}

            <div style={{ padding: 10 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.4, minHeight: 32 }}>
                {a.ai_caption || (a.ai_error ? <span style={{ color: '#fca5a5' }}>Sin caption (error IA)</span> : <span style={{ color: 'var(--cream-3)', fontStyle: 'italic' }}>Categorizando con IA…</span>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)' }}>
                  {ASSET_TYPE_LABELS[a.asset_type] || a.asset_type}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleRecategorize(a.id)} title="Re-categorizar IA" style={{
                    padding: '4px 8px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)',
                    color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}><Sparkle size={9} /></button>
                  {allowGenerate360 && !a.tour_url && (
                    <button data-testid="asset-360-btn" onClick={() => handleGenerate360(a.id)} disabled={busy} title="Generar tour 360°" style={{
                      padding: '4px 8px', borderRadius: 9999,
                      background: 'var(--grad)', border: 'none', color: '#fff',
                      fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    }}>360°</button>
                  )}
                  <button data-testid="asset-delete" onClick={() => handleDelete(a.id)} title="Eliminar" style={{
                    padding: '4px 8px', borderRadius: 9999,
                    background: 'transparent', border: '1px solid rgba(239,68,68,0.32)',
                    color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 10, cursor: 'pointer',
                  }}><Trash size={9} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div data-testid="asset-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.ok ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.ok ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
