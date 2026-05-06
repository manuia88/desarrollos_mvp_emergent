/**
 * CompradorPrivacy — Phase 4 Batch 28 (Sub-C)
 * LFPDPPP-compliant: 5 toggles consent + export datos + soft-delete con 30d gracia.
 */
import React, { useEffect, useState } from 'react';
import { fetchConsents, updateConsents, requestExport, deleteAccount } from '../../api/comprador';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { Shield } from '../../components/icons';

const CONSENTS_DEFS = [
  {
    k: 'marketing_email',
    label: 'Marketing por email',
    desc: 'Recibe sugerencias de desarrollos, promociones y eventos.',
  },
  {
    k: 'marketing_wa',
    label: 'Marketing por WhatsApp',
    desc: 'Notificaciones push de oportunidades vía WhatsApp Business.',
  },
  {
    k: 'analytics',
    label: 'Analítica de uso',
    desc: 'Permite analizar tu navegación para mejorar tu experiencia (anónimo).',
  },
  {
    k: 'share_with_dev',
    label: 'Compartir con desarrolladores',
    desc: 'Tu interés será visible al desarrollador del proyecto que marcas.',
  },
  {
    k: 'share_with_asesor',
    label: 'Compartir con asesores',
    desc: 'Asesores DMX podrán contactarte cuando hagas match con un proyecto.',
  },
];

export default function CompradorPrivacy() {
  const [consents, setConsents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportStatus, setExportStatus] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    fetchConsents()
      .then(d => { setConsents(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggleConsent = async (k) => {
    if (!consents) return;
    const next = { [k]: !consents.consents[k] };
    const updated = await updateConsents(next);
    setConsents(prev => ({ ...prev, consents: updated.consents, is_default: false }));
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const r = await requestExport();
      setExportStatus(r);
    } finally {
      setExporting(false);
    }
  };

  return (
    <CompradorLayout>
      <div data-testid="privacy-page">
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.025em',
          margin: 0, lineHeight: 1.1,
        }}>
          Privacidad y datos
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 13,
          color: 'rgba(240,235,224,0.55)', marginTop: 8, marginBottom: 26,
        }}>
          Tienes derecho a controlar tus datos. Este flujo cumple con la LFPDPPP (Art. 25).
        </p>

        {loading ? (
          <Loading />
        ) : (
          <>
            {/* Section: Consents */}
            <Section title="Consentimientos">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {CONSENTS_DEFS.map(({ k, label, desc }) => {
                  const value = !!consents?.consents?.[k];
                  return (
                    <ConsentRow
                      key={k}
                      testId={`consent-${k}`}
                      label={label} desc={desc}
                      value={value}
                      onToggle={() => toggleConsent(k)}
                    />
                  );
                })}
              </div>
              {consents?.is_default && (
                <div style={{
                  marginTop: 14, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.20)',
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: 'rgba(165,180,252,0.85)',
                }}>
                  Estás viendo configuración predeterminada. Cualquier cambio se guarda automáticamente.
                </div>
              )}
            </Section>

            {/* Section: Export */}
            <Section title="Tus datos">
              <p style={pStyle}>
                Solicita una copia completa de toda la información que tenemos sobre ti
                (perfil, búsquedas, favoritos, histórico). Te llega por email en JSON.
              </p>
              <button
                data-testid="privacy-export"
                onClick={onExport}
                disabled={exporting}
                style={primaryBtnStyle(exporting)}
              >
                {exporting ? 'Generando…' : 'Descargar mis datos'}
              </button>
              {exportStatus && (
                <div data-testid="export-status" style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.30)',
                  fontFamily: 'DM Sans', fontSize: 12, color: '#86EFAC',
                }}>
                  Solicitud {exportStatus.status === 'sent' ? 'enviada por email' : 'lista'}.
                  {' '}{exportStatus.items?.saved_searches || 0} búsquedas, {exportStatus.items?.favorites || 0} favoritos, {exportStatus.items?.views || 0} vistas.
                </div>
              )}
            </Section>

            {/* Section: Delete */}
            <Section title="Zona peligrosa" danger>
              <p style={pStyle}>
                Si decides eliminar tu cuenta, entrarás en período de gracia de 30 días.
                Durante ese tiempo puedes volver y cancelar la eliminación. Después, los datos
                se borran de forma definitiva (excepto los requeridos por ley).
              </p>
              <button
                data-testid="privacy-delete-trigger"
                onClick={() => setDeleteModalOpen(true)}
                style={dangerBtnStyle}
              >
                Eliminar mi cuenta
              </button>
            </Section>

            {/* Footer DPO */}
            <div style={{
              marginTop: 32, paddingTop: 18,
              borderTop: '1px solid rgba(240,235,224,0.08)',
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.4)',
              display: 'flex', flexWrap: 'wrap', gap: 14,
            }}>
              <span>DPO: privacidad@desarrollosmx.com</span>
              <span>·</span>
              <a href="/legal/privacidad" style={{ color: 'rgba(99,102,241,0.8)', textDecoration: 'none' }}>Política de privacidad</a>
              <span>·</span>
              <a href="/legal/terminos" style={{ color: 'rgba(99,102,241,0.8)', textDecoration: 'none' }}>Términos</a>
            </div>
          </>
        )}

        {deleteModalOpen && (
          <DeleteModal onClose={() => setDeleteModalOpen(false)} />
        )}
      </div>
    </CompradorLayout>
  );
}

function ConsentRow({ label, desc, value, onToggle, testId }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14,
      padding: '14px 16px', borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.08)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
          color: 'var(--cream, #F0EBE0)',
        }}>{label}</div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11,
          color: 'rgba(240,235,224,0.5)', marginTop: 2, lineHeight: 1.5,
        }}>{desc}</div>
      </div>
      <button
        data-testid={testId}
        onClick={onToggle}
        role="switch"
        aria-checked={value}
        style={{
          width: 44, height: 26, borderRadius: 9999,
          background: value ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(240,235,224,0.15)',
          position: 'relative', cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2, left: value ? 20 : 2,
          width: 20, height: 20, borderRadius: 9999,
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

function DeleteModal({ onClose }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [acceptedGrace, setAcceptedGrace] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const submit = async () => {
    setLoading(true); setError(null);
    try {
      const r = await deleteAccount(confirmEmail.trim().toLowerCase(), reason);
      setDone(r);
    } catch (e) {
      setError(e?.message || 'No se pudo procesar la eliminación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 80,
      background: 'rgba(6,8,15,0.92)',
      backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} data-testid="delete-modal" style={{
        background: 'rgba(13,16,23,0.98)',
        border: '1px solid rgba(239,68,68,0.32)',
        borderRadius: 18, padding: '24px',
        width: '100%', maxWidth: 480,
      }}>
        {done ? (
          <>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: '#F472B6', margin: '0 0 10px',
            }}>Eliminación programada</h2>
            <p style={pStyle}>
              Tu cuenta entró en período de gracia. La eliminación definitiva se ejecutará
              en 30 días. Te enviamos confirmación por email. Puedes cancelar volviendo a iniciar sesión.
            </p>
            <button onClick={onClose} style={primaryBtnStyle(false)}>Entendido</button>
          </>
        ) : (
          <>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: '#FCA5A5', letterSpacing: '-0.02em', margin: '0 0 10px',
            }}>Eliminar tu cuenta</h2>
            <p style={pStyle}>
              Para confirmar, escribe tu email exacto. Tendrás 30 días de gracia
              durante los cuales podrás volver y cancelar la eliminación.
            </p>
            <input
              data-testid="delete-confirm-email"
              type="email"
              value={confirmEmail}
              onChange={e => setConfirmEmail(e.target.value)}
              placeholder="tu@email.com"
              style={inputStyle}
            />
            <textarea
              data-testid="delete-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginTop: 10 }}
            />
            <label style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12,
              fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)',
              cursor: 'pointer',
            }}>
              <input type="checkbox" data-testid="delete-grace-check"
                checked={acceptedGrace} onChange={e => setAcceptedGrace(e.target.checked)}
                style={{ marginTop: 3, accentColor: '#EC4899' }} />
              <span>Entiendo que tengo 30 días de gracia. Después, mis datos se eliminan de forma irreversible.</span>
            </label>
            {error && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
              }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: '11px 18px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(240,235,224,0.18)',
                color: 'var(--cream, #F0EBE0)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
              }}>Cancelar</button>
              <button
                data-testid="delete-confirm-btn"
                onClick={submit}
                disabled={loading || !acceptedGrace || !confirmEmail.includes('@')}
                style={{
                  flex: 1, padding: '11px 18px', borderRadius: 9999,
                  background: (loading || !acceptedGrace || !confirmEmail.includes('@'))
                    ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.18)',
                  border: '1px solid rgba(239,68,68,0.45)',
                  color: '#FCA5A5',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: (loading || !acceptedGrace || !confirmEmail.includes('@'))
                    ? 'not-allowed' : 'pointer',
                }}
              >{loading ? 'Procesando…' : 'Eliminar definitivamente'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, danger }) {
  return (
    <section style={{
      padding: '22px 22px',
      borderRadius: 16,
      background: danger ? 'rgba(239,68,68,0.04)' : 'rgba(13,16,23,0.92)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.22)' : 'rgba(240,235,224,0.10)'}`,
      backdropFilter: 'blur(24px)',
      marginBottom: 18,
    }}>
      <h2 style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
        color: danger ? '#FCA5A5' : 'var(--cream, #F0EBE0)',
        letterSpacing: '-0.02em',
        margin: '0 0 14px',
      }}>{title}</h2>
      {children}
    </section>
  );
}

const Loading = () => (
  <div style={{ padding: 30, textAlign: 'center', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)' }}>
    Cargando privacidad…
  </div>
);

const pStyle = {
  fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55,
  color: 'rgba(240,235,224,0.6)', margin: '0 0 16px',
};
const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(240,235,224,0.15)',
  borderRadius: 9, outline: 'none',
  fontFamily: 'DM Sans', fontSize: 13,
  color: 'var(--cream, #F0EBE0)',
  boxSizing: 'border-box',
};
const primaryBtnStyle = (disabled) => ({
  padding: '11px 20px', borderRadius: 9999, border: 'none',
  background: disabled ? 'rgba(99,102,241,0.3)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
  color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
const dangerBtnStyle = {
  padding: '10px 18px', borderRadius: 9999,
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.40)',
  color: '#FCA5A5',
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
  cursor: 'pointer',
};
