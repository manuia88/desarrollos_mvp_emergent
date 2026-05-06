/**
 * Phase 4 Batch 32 · Component — LinkedInImportModal
 *
 * Modal manual stub: input URL LinkedIn + form fields.
 * (LinkedIn API requiere partnership → OAuth defer Phase 8).
 */
import React, { useState, useEffect } from 'react';
import { importLinkedIn, fetchMyLinkedIn, revokeLinkedIn } from '../../api/asesor_identity';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 12,
  border: '1px solid rgba(240,235,224,0.18)',
  background: 'rgba(240,235,224,0.04)',
  color: 'var(--cream)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

export default function LinkedInImportModal({ open, onClose, onImported }) {
  const [url, setUrl] = useState('');
  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [certifications, setCertifications] = useState('');
  const [education, setEducation] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    if (!open) return;
    fetchMyLinkedIn().then(({ profile }) => {
      if (profile) {
        setExisting(profile);
        setUrl(profile.linkedin_url || '');
        const pd = profile.profile_data || {};
        setFullName(pd.full_name || '');
        setHeadline(pd.headline || '');
        setPhotoUrl(pd.photo_url || '');
        setYearsExperience(pd.years_experience || 0);
        setCertifications((pd.certifications || []).join('\n'));
        setEducation((pd.education || []).join('\n'));
        setCurrentCompany(pd.current_company || '');
      }
    }).catch(() => {});
  }, [open]);

  const submit = async () => {
    setError('');
    if (!url.trim().match(/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|pub)\//i)) {
      setError('URL de LinkedIn no válida (debe ser /in/usuario)');
      return;
    }
    setLoading(true);
    try {
      const data = await importLinkedIn({
        linkedinUrl: url.trim(),
        profileData: {
          full_name: fullName,
          headline,
          photo_url: photoUrl,
          years_experience: parseInt(yearsExperience) || 0,
          certifications,
          education,
          current_company: currentCompany,
        },
      });
      onImported?.(data);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Error al importar');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('¿Eliminar tu perfil LinkedIn importado?')) return;
    try {
      await revokeLinkedIn();
      setExisting(null);
      setUrl(''); setFullName(''); setHeadline(''); setPhotoUrl('');
      setYearsExperience(0); setCertifications(''); setEducation('');
      setCurrentCompany('');
      onImported?.(null);
    } catch (e) {
      alert(e.message);
    }
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 75,
        background: 'rgba(6,8,15,0.7)', backdropFilter: 'blur(4px)',
      }} />
      <div data-testid="linkedin-modal" role="dialog" aria-label="Importar LinkedIn"
           style={{
             position: 'fixed', top: '50%', left: '50%',
             transform: 'translate(-50%,-50%)', zIndex: 76,
             width: 'min(560px, 96vw)',
             maxHeight: '92vh', overflowY: 'auto',
             padding: 24, borderRadius: 18,
             background: 'rgba(13,16,23,0.96)',
             border: '1px solid rgba(240,235,224,0.14)',
             backdropFilter: 'blur(24px)',
             display: 'flex', flexDirection: 'column', gap: 12,
           }}>
        <header style={{ display: 'flex', alignItems: 'center',
                         justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>Perfil profesional</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cream)',
                          marginTop: 2, fontFamily: 'Outfit' }}>
              {existing ? 'Editar perfil LinkedIn' : 'Importar desde LinkedIn'}
            </div>
          </div>
          <button data-testid="linkedin-close-btn" type="button" onClick={onClose}
                  aria-label="Cerrar"
                  style={{
                    width: 36, height: 36, borderRadius: 9999,
                    border: '1px solid rgba(240,235,224,0.18)',
                    background: 'transparent', color: 'var(--cream)',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1,
                  }}>×</button>
        </header>

        <div style={{
          padding: 10, borderRadius: 10,
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.6,
        }}>
          Pega tu URL pública de LinkedIn y completa los campos.
          Validaremos automáticamente cuando la integración OAuth esté disponible (Phase 8).
        </div>

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          URL LinkedIn pública
        </label>
        <input data-testid="linkedin-url-input" placeholder="https://www.linkedin.com/in/tu-usuario/"
               value={url} onChange={(e) => setUrl(e.target.value)}
               style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--cream-3)' }}>
              Nombre completo
            </label>
            <input data-testid="linkedin-full-name" placeholder="Ana Gutiérrez"
                   value={fullName} onChange={(e) => setFullName(e.target.value)}
                   style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--cream-3)' }}>
              Años de experiencia
            </label>
            <input data-testid="linkedin-years" type="number" min={0} max={60}
                   value={yearsExperience}
                   onChange={(e) => setYearsExperience(e.target.value)}
                   style={inputStyle} />
          </div>
        </div>

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Headline
        </label>
        <input data-testid="linkedin-headline"
               placeholder="Asesor inmobiliario senior · DesarrollosMX"
               value={headline} onChange={(e) => setHeadline(e.target.value)}
               style={inputStyle} />

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Empresa actual
        </label>
        <input data-testid="linkedin-company"
               placeholder="DesarrollosMX"
               value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)}
               style={inputStyle} />

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Foto (URL opcional)
        </label>
        <input data-testid="linkedin-photo"
               placeholder="https://media.licdn.com/..."
               value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)}
               style={inputStyle} />

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Certificaciones (una por línea)
        </label>
        <textarea data-testid="linkedin-certs" rows={3}
                  placeholder={'AMPI Certificada\nCurso Avanzado Plusvalía'}
                  value={certifications}
                  onChange={(e) => setCertifications(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }} />

        <label style={{ fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--cream-3)' }}>
          Educación (una por línea)
        </label>
        <textarea data-testid="linkedin-education" rows={2}
                  placeholder={'Lic. Administración - UNAM'}
                  value={education} onChange={(e) => setEducation(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }} />

        {error && (
          <div data-testid="linkedin-error" style={{
            padding: 8, borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#fca5a5', fontSize: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button data-testid="linkedin-submit-btn" type="button"
                  onClick={submit} disabled={loading}
                  style={{
                    flex: 1, padding: '12px 20px', borderRadius: 9999,
                    border: 'none', background: GRADIENT, color: '#fff',
                    fontWeight: 600, fontSize: 13,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}>
            {loading ? 'Guardando…' : (existing ? 'Actualizar' : 'Importar')}
          </button>
          {existing && (
            <button data-testid="linkedin-revoke-btn" type="button"
                    onClick={handleRevoke}
                    style={{
                      padding: '12px 18px', borderRadius: 9999,
                      border: '1px solid rgba(239,68,68,0.3)',
                      background: 'transparent', color: '#fca5a5',
                      fontSize: 12, cursor: 'pointer',
                    }}>Eliminar</button>
          )}
        </div>
      </div>
    </>
  );
}
