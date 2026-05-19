// W5.22 Z.1 Sub-C — Asset Library page · /portal/studio/assets
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import { SmartEmptyState } from '../../../components/shared/SmartEmptyState';
import * as api from '../../../api/studio';
import { Upload, Trash2, Search, Image as ImageIcon, Video, FileText, Box, X } from 'lucide-react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const ASSET_ICONS = { photo: ImageIcon, video: Video, pdf: FileText, '3dgs_scan': Box };

export default function AssetLibraryPage({ user, onLogout }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ project_id: '', asset_type: '', tags: '', search: '' });
  const [assets, setAssets] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(null);
  const [toast, setToast] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const fileInputRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listStudioAssets(filters);
      setAssets(r);
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const tm = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(tm);
  }, [toast]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const assetType = detectAssetType(file.type, file.name);
      setUploadProgress((p) => ({ ...p, [file.name]: 0 }));
      try {
        const initiate = await api.initiateAssetUpload({
          asset_type: assetType,
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size_bytes: file.size,
        });
        if (initiate.upload.presigned_url) {
          await fetch(initiate.upload.presigned_url, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });
        }
        await api.confirmAsset({
          r2_key: initiate.upload.r2_key,
          r2_url: initiate.upload.public_url,
          asset_type: assetType,
          filename: file.name,
          size_bytes: file.size,
          mime: file.type || 'application/octet-stream',
          project_id: filters.project_id || null,
        });
        setUploadProgress((p) => ({ ...p, [file.name]: 100 }));
      } catch (e) {
        setToast(`${file.name}: ${e.message}`);
        setUploadProgress((p) => { const n = { ...p }; delete n[file.name]; return n; });
      }
    }
    setTimeout(() => setUploadProgress({}), 1500);
    await load();
    setToast(t('studio.assets.toast_uploaded'));
  };

  const remove = async (id) => {
    if (!window.confirm(t('studio.assets.confirm_delete'))) return;
    try {
      await api.deleteStudioAsset(id);
      await load();
      setToast(t('studio.assets.toast_deleted'));
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="asset-library-page" style={{ padding: '22px 28px 80px', maxWidth: 1400, display: 'grid', gap: 18, gridTemplateColumns: '240px 1fr' }}>
        {/* Sidebar filters */}
        <aside style={sidebarStyle()}>
          <h3 style={{ margin: '0 0 12px', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            {t('studio.assets.filters_title')}
          </h3>
          <Field label={t('studio.assets.filter_project')}>
            <input data-testid="filter-project" placeholder="proj_xxx" value={filters.project_id}
              onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value }))}
              style={inputStyle()} />
          </Field>
          <Field label={t('studio.assets.filter_type')}>
            <select data-testid="filter-type" value={filters.asset_type}
              onChange={(e) => setFilters((f) => ({ ...f, asset_type: e.target.value }))}
              style={inputStyle()}>
              <option value="">{t('studio.assets.all')}</option>
              <option value="photo">Photo</option>
              <option value="video">Video</option>
              <option value="pdf">PDF</option>
              <option value="3dgs_scan">3DGS Scan</option>
            </select>
          </Field>
          <Field label={t('studio.assets.filter_tags')}>
            <input data-testid="filter-tags" placeholder="hero, render, drone" value={filters.tags}
              onChange={(e) => setFilters((f) => ({ ...f, tags: e.target.value }))}
              style={inputStyle()} />
          </Field>
          <Field label={t('studio.assets.filter_search')}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--cream-3)' }} />
              <input data-testid="filter-search" placeholder={t('studio.assets.search_placeholder')}
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                style={{ ...inputStyle(), paddingLeft: 28 }} />
            </div>
          </Field>
        </aside>

        {/* Main */}
        <main>
          <header style={{ marginBottom: 18 }}>
            <div className="eyebrow">DMX STUDIO Z.1</div>
            <h1 style={hStyle()}>{t('studio.assets.title')}</h1>
            <p style={subStyle()}>
              {t('studio.assets.subtitle', { total: assets.total })}
            </p>
          </header>

          {/* Upload zone */}
          <div
            data-testid="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            style={uploadZoneStyle()}>
            <Upload size={20} style={{ color: 'var(--cream-2)' }} />
            <div style={{ fontWeight: 700, color: 'var(--cream)', marginTop: 6 }}>
              {t('studio.assets.upload_cta')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>
              {t('studio.assets.upload_hint')}
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
              data-testid="upload-input"
              onChange={(e) => handleFiles(e.target.files)} />
          </div>

          {/* Progress */}
          {Object.entries(uploadProgress).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {Object.entries(uploadProgress).map(([name, pct]) => (
                <div key={name} style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 4 }}>
                  {name} · {pct}%
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', marginTop: 3, borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: GRADIENT, transition: 'width 300ms ease' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
              {t('studio.assets.loading')}
            </div>
          ) : assets.total === 0 ? (
            <SmartEmptyState
              contextKey="studio.assets.empty"
              overrides={{
                title: t('studio.assets.empty_title'),
                body: t('studio.assets.empty_body'),
              }}
            />
          ) : (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {assets.items.map((a) => (
                <AssetCard key={a.id} asset={a} onClick={() => setPreviewing(a)} onDelete={() => remove(a.id)} t={t} />
              ))}
            </div>
          )}
        </main>

        {previewing && (
          <PreviewModal asset={previewing} onClose={() => setPreviewing(null)} t={t} />
        )}

        {toast && (
          <div data-testid="assets-toast" role="status" style={toastStyle()}>{toast}</div>
        )}
      </div>
    </PortalLayout>
  );
}

function AssetCard({ asset, onClick, onDelete, t }) {
  const Icon = ASSET_ICONS[asset.asset_type] || FileText;
  const isPhoto = asset.asset_type === 'photo' && asset.r2_url;
  return (
    <article data-testid={`asset-card-${asset.id}`} style={cardStyle()}>
      <div onClick={onClick} style={{
        width: '100%', aspectRatio: '1 / 1',
        background: isPhoto ? `url(${asset.r2_url}) center/cover` : 'rgba(99,102,241,0.08)',
        borderRadius: 14, marginBottom: 8, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!isPhoto && <Icon size={28} style={{ color: 'var(--cream-2)' }} />}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.filename}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={typePill()}>{asset.asset_type}</span>
        <button data-testid={`delete-${asset.id}`} onClick={onDelete} style={iconBtn()}>
          <Trash2 size={12} />
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>
        {(asset.size_bytes / 1024).toFixed(1)} KB
      </div>
    </article>
  );
}

function PreviewModal({ asset, onClose, t }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={modalOverlay()}>
      <div data-testid="asset-preview-modal" style={modalContent()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
            {asset.filename}
          </h2>
          <button data-testid="preview-close" onClick={onClose} style={iconBtnLg()}>
            <X size={16} />
          </button>
        </header>
        {asset.asset_type === 'photo' && asset.r2_url ? (
          <img src={asset.r2_url} alt={asset.filename}
            style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 14, background: 'rgba(0,0,0,0.4)' }} />
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', background: 'rgba(0,0,0,0.4)', borderRadius: 14 }}>
            {t('studio.assets.preview_unavailable')}
          </div>
        )}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field label={t('studio.assets.meta_type')}><span style={{ color: 'var(--cream)' }}>{asset.asset_type}</span></Field>
          <Field label={t('studio.assets.meta_size')}><span style={{ color: 'var(--cream)' }}>{(asset.size_bytes / 1024).toFixed(1)} KB</span></Field>
          <Field label={t('studio.assets.meta_mime')}><span style={{ color: 'var(--cream)' }}>{asset.mime}</span></Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function detectAssetType(mime, filename) {
  if ((mime || '').startsWith('image/')) return 'photo';
  if ((mime || '').startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if ((filename || '').match(/\.(splat|ply|glb)$/i)) return '3dgs_scan';
  return 'photo';
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const hStyle = () => ({ fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, letterSpacing: '-0.028em', margin: '6px 0 6px', color: 'var(--cream)' });
const subStyle = () => ({ fontSize: 14, color: 'var(--cream-2)', maxWidth: 720, margin: 0 });
const sidebarStyle = () => ({
  position: 'sticky', top: 96,
  padding: '14px 16px',
  background: 'rgba(13,17,28,0.62)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 22, backdropFilter: 'blur(24px)',
  height: 'fit-content',
});
const inputStyle = () => ({
  width: '100%', padding: '8px 12px',
  background: 'rgba(6,8,15,0.7)', color: 'var(--cream)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
});
const uploadZoneStyle = () => ({
  padding: '24px 16px', marginBottom: 18,
  background: 'rgba(99,102,241,0.06)',
  border: '2px dashed rgba(99,102,241,0.30)',
  borderRadius: 22, textAlign: 'center', cursor: 'pointer',
  backdropFilter: 'blur(24px)',
});
const cardStyle = () => ({
  padding: 10,
  background: 'rgba(13,17,28,0.62)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16, backdropFilter: 'blur(24px)',
});
const typePill = () => ({
  display: 'inline-block', padding: '2px 8px',
  background: 'rgba(99,102,241,0.12)',
  color: 'var(--cream-2)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 9999, fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em',
});
const iconBtn = () => ({
  width: 24, height: 24,
  background: 'transparent', color: '#EF4444',
  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9999,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});
const iconBtnLg = () => ({
  width: 32, height: 32,
  background: 'transparent', color: 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});
const modalOverlay = () => ({
  position: 'fixed', inset: 0, zIndex: 1400,
  background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
});
const modalContent = () => ({
  width: '100%', maxWidth: 720,
  background: 'rgba(13,17,28,0.92)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 22, padding: '22px 24px',
  backdropFilter: 'blur(24px)',
  maxHeight: '90vh', overflowY: 'auto',
});
const toastStyle = () => ({
  position: 'fixed', bottom: 24, right: 24,
  padding: '10px 16px',
  background: 'rgba(13,17,28,0.94)', color: 'var(--cream)',
  border: '1px solid rgba(99,102,241,0.30)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontSize: 13, zIndex: 1500,
});
