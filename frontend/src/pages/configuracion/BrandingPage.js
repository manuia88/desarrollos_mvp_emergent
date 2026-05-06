/**
 * Batch 19 Sub-B — /configuracion/branding
 * Org branding settings page. Only visible to dev_admin / inmobiliaria_admin / superadmin.
 */
import React, { useState, useEffect, useRef } from 'react';
import { PortalLayout } from '../../components/shared/PortalLayout';
import { getMyBranding, putMyBranding, uploadBrandingLogo, deleteBrandingLogo } from '../../api/branding';
import { invalidateBrandingCache } from '../../hooks/useBranding';
import { Check, Upload, Trash, RotateCcw } from 'lucide-react';

const ALLOWED_ROLES = ['developer_admin', 'asesor_admin', 'inmobiliaria_admin', 'superadmin'];
const API = process.env.REACT_APP_BACKEND_URL;

function ColorSwatch({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="color"
          value={value || '#06080F'}
          onChange={e => onChange(e.target.value)}
          data-testid={`color-input-${label.toLowerCase().replace(/\s/g,'-')}`}
          style={{
            width: 44, height: 36, borderRadius: 8,
            border: '1px solid rgba(240,235,224,0.2)',
            cursor: 'pointer', background: 'none', padding: 2,
          }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="#06080F"
          style={{
            flex: 1, background: 'rgba(240,235,224,0.06)',
            border: '1px solid rgba(240,235,224,0.15)',
            borderRadius: 8, padding: '8px 12px',
            color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 13,
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

// Mini project card preview
function BrandingPreview({ branding }) {
  const bg   = branding.primary_color || '#06080F';
  const acc  = branding.accent_color  || '#F4E9D8';
  const logo = branding.logo_url;
  const name = branding.display_name || 'Mi Empresa';
  return (
    <div data-testid="branding-preview" style={{
      border: '1px solid rgba(240,235,224,0.15)', borderRadius: 12, overflow: 'hidden',
      background: bg, maxWidth: 260,
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: `1px solid ${acc}22`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {logo ? (
          <img src={logo.startsWith('/api') ? `${API}${logo}` : logo} alt="logo" style={{ height: 32, width: 'auto', objectFit: 'contain', maxWidth: 80 }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: acc, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: bg,
          }}>
            {name[0]}
          </div>
        )}
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: acc }}>
            {name}
          </div>
          {branding.tagline && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: `${acc}99`, marginTop: 2 }}>
              {branding.tagline}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: `${acc}0a`, border: `1px solid ${acc}22`,
        }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: acc }}>
            Proyecto Ejemplo
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: `${acc}80`, marginTop: 4 }}>
            3 recámaras · Preventa
          </div>
        </div>
        <button style={{
          marginTop: 10, width: '100%', padding: '8px 0',
          background: acc, color: bg, border: 'none',
          borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
          cursor: 'pointer',
        }}>
          Ver detalles
        </button>
      </div>
    </div>
  );
}

export default function BrandingPage({ user, onLogout }) {
  const [branding, setBranding] = useState({
    logo_url: null,
    primary_color: '#06080F',
    accent_color: '#F4E9D8',
    display_name: '',
    tagline: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const isAdmin = ALLOWED_ROLES.includes(user?.role);

  useEffect(() => {
    getMyBranding()
      .then(data => setBranding({ ...branding, ...(data.branding || {}) }))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await putMyBranding(branding);
      setBranding(res.branding);
      invalidateBrandingCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.status === 403 ? 'Sin permiso para modificar branding' : e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setError('');
    try {
      const res = await uploadBrandingLogo(file);
      setBranding(b => ({ ...b, logo_url: res.logo_url }));
      invalidateBrandingCache();
    } catch (e) {
      setError(e.message);
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    setError('');
    try {
      await deleteBrandingLogo();
      setBranding(b => ({ ...b, logo_url: null }));
      invalidateBrandingCache();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleReset = async () => {
    const defaults = { logo_url: null, primary_color: '#06080F', accent_color: '#F4E9D8', display_name: '', tagline: '' };
    setBranding(defaults);
    setSaving(true);
    try {
      await putMyBranding(defaults);
      invalidateBrandingCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  if (!isAdmin) {
    return (
      <PortalLayout role={user?.role || 'developer_admin'} user={user} onLogout={onLogout}>
        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
          Sin permisos para acceder a esta página.
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout role={user?.role || 'developer_admin'} user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', fontFamily: 'DM Sans' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Configuración · Marca</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, marginBottom: 8 }}>
            Personalización de marca
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Aplica los colores e identidad de tu empresa en el portal, reportes PDF y la página de reservas pública.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, alignItems: 'start' }}>
            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Logo upload */}
              <div style={{ padding: '20px', background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 14 }}>
                  Logo
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {branding.logo_url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={branding.logo_url.startsWith('/api') ? `${API}${branding.logo_url}` : branding.logo_url}
                        alt="Logo"
                        style={{ height: 48, maxWidth: 120, objectFit: 'contain', borderRadius: 6, background: 'rgba(240,235,224,0.1)', padding: 4 }}
                      />
                      <button
                        data-testid="delete-logo-btn"
                        onClick={handleDeleteLogo}
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 12px', color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      >
                        <Trash size={12} /> Eliminar
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      width: 80, height: 48, borderRadius: 8,
                      background: 'rgba(240,235,224,0.06)',
                      border: '1px dashed rgba(240,235,224,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--cream-3)', fontSize: 11,
                    }}>
                      Sin logo
                    </div>
                  )}
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".png,.svg"
                      style={{ display: 'none' }}
                      onChange={handleLogoUpload}
                      data-testid="logo-file-input"
                    />
                    <button
                      data-testid="upload-logo-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={logoUploading}
                      style={{
                        background: 'rgba(240,235,224,0.08)', border: '1px solid rgba(240,235,224,0.2)',
                        borderRadius: 9999, padding: '7px 14px', color: 'var(--cream-2)',
                        cursor: logoUploading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <Upload size={13} />
                      {logoUploading ? 'Subiendo…' : 'Subir PNG / SVG'}
                    </button>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--cream-3)' }}>Máx. 500KB · PNG o SVG</div>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div style={{ padding: '20px', background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  Colores de marca
                </div>
                <ColorSwatch
                  label="Color primario"
                  value={branding.primary_color}
                  onChange={v => setBranding(b => ({ ...b, primary_color: v }))}
                />
                <ColorSwatch
                  label="Color de acento"
                  value={branding.accent_color}
                  onChange={v => setBranding(b => ({ ...b, accent_color: v }))}
                />
              </div>

              {/* Text */}
              <div style={{ padding: '20px', background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.1)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  Texto de marca
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--cream-3)', marginBottom: 6 }}>Nombre a mostrar</label>
                  <input
                    data-testid="branding-display-name"
                    value={branding.display_name || ''}
                    onChange={e => setBranding(b => ({ ...b, display_name: e.target.value }))}
                    placeholder="Constructora Ejemplo"
                    style={{
                      width: '100%', background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.15)',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--cream-3)', marginBottom: 6 }}>Tagline (opcional)</label>
                  <textarea
                    data-testid="branding-tagline"
                    value={branding.tagline || ''}
                    onChange={e => setBranding(b => ({ ...b, tagline: e.target.value }))}
                    placeholder="Construyendo el futuro de tu familia"
                    rows={2}
                    style={{
                      width: '100%', background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.15)',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14,
                      resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  data-testid="save-branding-btn"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '11px', background: saved ? 'rgba(34,197,94,0.15)' : 'var(--cream)',
                    color: saved ? 'var(--green)' : 'var(--navy)', border: saved ? '1px solid rgba(34,197,94,0.4)' : 'none',
                    borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                    cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}
                >
                  {saving ? 'Guardando…' : saved ? (<><Check size={15} /> Guardado</>) : 'Aplicar marca'}
                </button>
                <button
                  data-testid="reset-branding-btn"
                  onClick={handleReset}
                  title="Restaurar colores DMX"
                  style={{
                    padding: '11px 16px', background: 'rgba(240,235,224,0.06)',
                    border: '1px solid rgba(240,235,224,0.15)', borderRadius: 9999,
                    color: 'var(--cream-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                  }}
                >
                  <RotateCcw size={14} /> Restaurar defaults
                </button>
              </div>
            </div>

            {/* Live preview */}
            <div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Vista previa en vivo
              </div>
              <BrandingPreview branding={branding} />
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
