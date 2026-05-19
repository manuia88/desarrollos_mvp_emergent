// W5.22 Z.1 Sub-A — Brand Kit page · /portal/studio/brand-kit
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import * as api from '../../../api/studio';
import { Palette, Check, Upload, X, Save, Trash2 } from 'lucide-react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const VARIANT_LABELS = {
  dev: 'Desarrolladora',
  asesor: 'Asesor',
  inmobiliaria: 'Inmobiliaria',
  dmx: 'DMX (default)',
};

export default function BrandKitPage({ user, onLogout }) {
  const { t } = useTranslation();
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.getBrandKits();
      setKits(r.items || []);
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const tm = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(tm);
  }, [toast]);

  const save = async (payload) => {
    try {
      await api.upsertBrandKit(payload);
      setToast(t('studio.brand_kit.toast_saved'));
      setEditing(null);
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  const activate = async (id) => {
    try {
      await api.activateBrandKit(id);
      setToast(t('studio.brand_kit.toast_activated'));
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('studio.brand_kit.confirm_delete'))) return;
    try {
      await api.deleteBrandKit(id);
      setToast(t('studio.brand_kit.toast_deleted'));
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="brand-kit-page" style={{ padding: '22px 28px 80px', maxWidth: 1280 }}>
        <header style={{ marginBottom: 24 }}>
          <div className="eyebrow">DMX STUDIO Z.1</div>
          <h1 style={hStyle()}>{t('studio.brand_kit.title')}</h1>
          <p style={subStyle()}>{t('studio.brand_kit.subtitle')}</p>
        </header>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
            {t('studio.brand_kit.loading')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {kits.map((k) => (
              <VariantCard
                key={k.id}
                kit={k}
                onEdit={() => setEditing(k)}
                onActivate={() => activate(k.id)}
                onDelete={() => remove(k.id)}
                t={t}
              />
            ))}
          </div>
        )}

        {editing && (
          <EditorModal
            kit={editing}
            onClose={() => setEditing(null)}
            onSave={save}
            t={t}
          />
        )}

        {toast && (
          <div data-testid="brand-kit-toast" role="status" style={toastStyle()}>{toast}</div>
        )}
      </div>
    </PortalLayout>
  );
}

function VariantCard({ kit, onEdit, onActivate, onDelete, t }) {
  return (
    <article
      data-testid={`brand-kit-card-${kit.variant_key}`}
      style={cardStyle(kit.is_active)}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {VARIANT_LABELS[kit.variant_key] || kit.variant_key}
          </div>
          {kit.is_active && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', marginTop: 4,
              borderRadius: 9999,
              background: 'rgba(34,197,94,0.15)', color: 'var(--success, #22C55E)',
              fontSize: 10, fontWeight: 700,
            }}>
              <Check size={10} /> {t('studio.brand_kit.active')}
            </div>
          )}
        </div>
        <Palette size={18} style={{ color: 'var(--cream-3)' }} />
      </header>

      {/* Color preview swatches */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[kit.color_primary, kit.color_secondary, kit.color_accent].map((c, i) => (
          <div key={i} style={{
            width: 36, height: 36, borderRadius: 9999,
            background: c || 'var(--bg, #06080F)', border: '1px solid rgba(255,255,255,0.10)',
          }} title={c} />
        ))}
      </div>

      {/* Live mock */}
      <div style={{
        marginBottom: 14, padding: '14px 16px',
        background: 'rgba(6,8,15,0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, backdropFilter: 'blur(24px)',
      }}>
        <div style={{ fontFamily: kit.font_heading || 'Outfit', fontWeight: 700, fontSize: 16, color: kit.color_accent || '#F0EBE0' }}>
          Preview · {kit.font_heading}
        </div>
        <div style={{ fontFamily: kit.font_body || 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>
          {(kit.disclaimer_text || '').slice(0, 80) || t('studio.brand_kit.preview_default')}
        </div>
        <button style={ctaPreview(kit)}>{kit.cta_default || 'CTA'}</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button data-testid={`edit-${kit.variant_key}`} onClick={onEdit} style={btnGhost()}>
          {t('studio.brand_kit.edit')}
        </button>
        {!kit.is_active && (
          <button data-testid={`activate-${kit.variant_key}`} onClick={onActivate} style={btnPrimary()}>
            {t('studio.brand_kit.activate')}
          </button>
        )}
        <button data-testid={`delete-${kit.variant_key}`} onClick={onDelete} style={btnDanger()}>
          <Trash2 size={12} />
        </button>
      </div>
    </article>
  );
}

function EditorModal({ kit, onClose, onSave, t }) {
  const [form, setForm] = useState({
    variant_key: kit.variant_key,
    color_primary: kit.color_primary || '#6366F1',
    color_secondary: kit.color_secondary || '#EC4899',
    color_accent: kit.color_accent || '#F0EBE0',
    font_heading: kit.font_heading || 'Outfit',
    font_body: kit.font_body || 'DM Sans',
    disclaimer_text: kit.disclaimer_text || '',
    cta_default: kit.cta_default || '',
    footer_legal: kit.footer_legal || '',
    logo_r2_key: kit.logo_r2_key || null,
    logo_url: kit.logo_url || null,
  });
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const r = await api.requestLogoUpload({
        file_ext: ext, mime: file.type || 'image/png', size_bytes: file.size,
      });
      // En modo stub no se sube real, solo se guardan refs (frontend dev sin R2 vars)
      set('logo_r2_key', r.upload.r2_key);
      if (r.upload.presigned_url) {
        await fetch(r.upload.presigned_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      }
      set('logo_url', r.upload.public_url || URL.createObjectURL(file));
    } catch (err) {
      window.alert(err.message || 'Upload error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={modalOverlayStyle()}>
      <div data-testid="brand-kit-editor" style={modalStyle()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>
            {t('studio.brand_kit.editor_title')} · {VARIANT_LABELS[kit.variant_key] || kit.variant_key}
          </h2>
          <button data-testid="editor-close" onClick={onClose} style={iconBtn()}>
            <X size={16} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12 }}>
          <FieldRow label={t('studio.brand_kit.field_logo')}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.30)',
              borderRadius: 9999, cursor: 'pointer',
              fontSize: 12.5, color: 'var(--cream)',
            }}>
              <Upload size={12} />
              {uploading ? t('studio.brand_kit.uploading') : t('studio.brand_kit.upload_logo')}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogoSelect}
                style={{ display: 'none' }} data-testid="logo-upload-input" />
            </label>
            {form.logo_url && (
              <img src={form.logo_url} alt="logo preview" style={{ maxWidth: 64, maxHeight: 64, marginLeft: 10, borderRadius: 8 }} />
            )}
          </FieldRow>

          <FieldRow label={t('studio.brand_kit.field_primary')}>
            <ColorInput value={form.color_primary} onChange={(v) => set('color_primary', v)} testid="color-primary" />
          </FieldRow>
          <FieldRow label={t('studio.brand_kit.field_secondary')}>
            <ColorInput value={form.color_secondary} onChange={(v) => set('color_secondary', v)} testid="color-secondary" />
          </FieldRow>
          <FieldRow label={t('studio.brand_kit.field_accent')}>
            <ColorInput value={form.color_accent} onChange={(v) => set('color_accent', v)} testid="color-accent" />
          </FieldRow>
          <FieldRow label={t('studio.brand_kit.field_disclaimer')}>
            <textarea value={form.disclaimer_text} onChange={(e) => set('disclaimer_text', e.target.value)}
              rows={2} style={textareaStyle()} data-testid="field-disclaimer" />
          </FieldRow>
          <FieldRow label={t('studio.brand_kit.field_cta')}>
            <input value={form.cta_default} onChange={(e) => set('cta_default', e.target.value)}
              style={inputStyle()} data-testid="field-cta" />
          </FieldRow>
          <FieldRow label={t('studio.brand_kit.field_footer')}>
            <input value={form.footer_legal} onChange={(e) => set('footer_legal', e.target.value)}
              style={inputStyle()} data-testid="field-footer" />
          </FieldRow>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={btnGhost()}>{t('studio.brand_kit.cancel')}</button>
          <button data-testid="editor-save" onClick={() => onSave(form)} style={{ ...btnPrimary(), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={12} /> {t('studio.brand_kit.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <label style={{ minWidth: 140, fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange, testid }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        style={{ width: 36, height: 36, padding: 0, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9999, background: 'transparent', cursor: 'pointer' }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle(), width: 120, fontFamily: 'monospace', fontSize: 12 }} />
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const hStyle = () => ({
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 36,
  letterSpacing: '-0.028em', margin: '6px 0 6px', color: 'var(--cream)',
});
const subStyle = () => ({ fontSize: 14, color: 'var(--cream-2)', maxWidth: 720, margin: 0 });

const cardStyle = (active) => ({
  padding: '16px 18px',
  background: 'rgba(13,17,28,0.62)',
  border: `1px solid ${active ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 22,
  backdropFilter: 'blur(24px)',
});

const ctaPreview = (kit) => ({
  marginTop: 10,
  padding: '8px 16px',
  background: `linear-gradient(90deg, ${kit.color_primary || '#6366F1'}, ${kit.color_secondary || '#EC4899'})`,
  color: 'var(--cream, #F0EBE0)',
  border: 'none',
  borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});

const btnPrimary = () => ({
  padding: '8px 14px',
  background: GRADIENT, color: 'var(--cream, #F0EBE0)',
  border: 'none', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
  cursor: 'pointer',
});
const btnGhost = () => ({
  padding: '8px 14px',
  background: 'transparent', color: 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
  cursor: 'pointer',
});
const btnDanger = () => ({
  padding: '8px 10px',
  background: 'transparent', color: 'var(--danger, #EF4444)',
  border: '1px solid rgba(239,68,68,0.30)', borderRadius: 9999,
  cursor: 'pointer',
});
const iconBtn = () => ({
  width: 32, height: 32,
  background: 'transparent', color: 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 9999, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});
const inputStyle = () => ({
  width: '100%', padding: '8px 12px',
  background: 'rgba(6,8,15,0.7)', color: 'var(--cream)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14,
  fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
});
const textareaStyle = () => ({ ...inputStyle(), resize: 'vertical' });
const modalOverlayStyle = () => ({
  position: 'fixed', inset: 0, zIndex: 1400,
  background: 'rgba(6,8,15,0.65)',
  backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
});
const modalStyle = () => ({
  width: '100%', maxWidth: 620,
  background: 'rgba(13,17,28,0.92)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 22, padding: '22px 24px',
  backdropFilter: 'blur(24px)',
  maxHeight: '88vh', overflowY: 'auto',
});
const toastStyle = () => ({
  position: 'fixed', bottom: 24, right: 24,
  padding: '10px 16px',
  background: 'rgba(13,17,28,0.94)', color: 'var(--cream)',
  border: '1px solid rgba(99,102,241,0.30)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontSize: 13, zIndex: 1500,
});
