// W4.9.6 — Tour3DOnboardingWizard
// 3 steps: device picker → device instructions → submit Luma URL.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

const DEVICES = [
  {
    id: 'iphone_pro',
    label: 'iPhone Pro / Pro Max (12+)',
    badge: 'Recomendado · LiDAR',
    steps: [
      'Descarga la app Luma AI desde el App Store.',
      'Inicia sesión con tu cuenta (gratuita).',
      'Modo Cámara → "Free Form".',
      'Captura 30 segundos rotando 360° alrededor del espacio.',
      'Espera 3-5 minutos de procesamiento.',
      'Comparte el enlace público con DMX.',
    ],
  },
  {
    id: 'iphone_std',
    label: 'iPhone (sin LiDAR)',
    badge: 'Buena calidad · requiere más fotos',
    steps: [
      'Descarga la app Luma AI desde el App Store.',
      'Captura 60-100 fotos del espacio desde múltiples ángulos.',
      'Asegúrate de superposición ≥ 50% entre fotos.',
      'Procesa el scan (5-10 min).',
      'Comparte el enlace público con DMX.',
    ],
  },
  {
    id: 'android',
    label: 'Android (cualquier modelo)',
    badge: 'Calidad media · más fotos compensan ausencia de LiDAR',
    steps: [
      'Descarga la app Luma AI universal desde Play Store.',
      'Captura 80-100 fotos del espacio en múltiples ángulos.',
      'Mueve lento, sin sacudidas, mucha luz natural.',
      'Procesa el scan (8-15 min).',
      'Comparte el enlace público con DMX.',
    ],
  },
];

function extractLumaId(url) {
  if (!url) return null;
  const m = url.match(/captures?\/([a-zA-Z0-9-_]+)/) || url.match(/([a-f0-9-]{20,})/);
  return m ? m[1] : null;
}

export default function Tour3DOnboardingWizard({
  unitId,
  projectSlug,
  devId,
  onClose,
  onCreated,
}) {
  useTranslation(); // ensure namespace pre-loaded; UI labels are inlined es-MX
  const [step, setStep] = useState(1);
  const [device, setDevice] = useState(null);
  const [lumaUrl, setLumaUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError('');
    const id = extractLumaId(lumaUrl);
    if (!id) {
      setError('No reconocí un ID Luma válido en el enlace.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/tour-3dgs/scans`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          source_format: 'luma',
          luma_scan_id: id,
          project_slug: projectSlug || null,
          dev_id: devId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.detail || 'create_failed');
      onCreated?.(data.scan);
    } catch (e) {
      setError(typeof e?.message === 'string' ? e.message : 'No se pudo crear el scan.');
    } finally {
      setBusy(false);
    }
  };

  const selectedDevice = DEVICES.find((d) => d.id === device);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(6,8,15,0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: Z.MODAL_CRITICAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, maxHeight: '92vh',
          background: '#0E1220',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(240,235,224,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(99,102,241,0.06), rgba(236,72,153,0.04))',
        }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
              Capturar tour 3D
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
              Paso {step} de 3 · ~{['1 min', '2 min', '1 min'][step - 1]}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(240,235,224,0.25)',
                borderRadius: 9999,
                color: 'var(--cream)',
                padding: '6px 14px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              CERRAR
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 20 }}>
          {step === 1 && (
            <div data-testid="wizard-step-1" style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
                Selecciona tu dispositivo
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, #a0a4b0)' }}>
                Te damos las instrucciones específicas para tu equipo.
              </div>
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}>
                {DEVICES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`wizard-device-${d.id}`}
                    onClick={() => { setDevice(d.id); setStep(2); }}
                    style={{
                      textAlign: 'left',
                      background: 'rgba(15,18,28,0.85)',
                      border: '1px solid rgba(240,235,224,0.12)',
                      borderRadius: 14,
                      padding: 16,
                      color: 'var(--cream)',
                      cursor: 'pointer',
                      transition: 'border-color 220ms ease, transform 220ms ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EC4899'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(240,235,224,0.12)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
                      {d.label}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                      color: '#fff',
                      borderRadius: 9999,
                      padding: '3px 10px',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10,
                      letterSpacing: '0.04em',
                    }}>
                      {d.badge}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedDevice && (
            <div data-testid="wizard-step-2" style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                {selectedDevice.label}
              </div>
              <ol style={{
                margin: 0, paddingLeft: 22,
                fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2, #d4d4d8)',
                lineHeight: 1.7,
              }}>
                {selectedDevice.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={secondaryBtn}
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={primaryBtn}
                >
                  YA CAPTURÉ · CONTINUAR
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div data-testid="wizard-step-3" style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                Comparte el enlace Luma
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, #a0a4b0)' }}>
                Pega aquí el enlace público que Luma generó al terminar el procesamiento.
              </div>
              <input
                type="url"
                data-testid="wizard-luma-url-input"
                value={lumaUrl}
                onChange={(e) => setLumaUrl(e.target.value)}
                placeholder="https://lumalabs.ai/capture/..."
                style={{
                  background: 'rgba(15,18,28,0.85)',
                  border: '1px solid rgba(240,235,224,0.12)',
                  borderRadius: 10,
                  color: 'var(--cream)',
                  padding: '12px 14px',
                  fontFamily: 'DM Sans', fontSize: 13,
                  outline: 'none',
                }}
              />
              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  color: '#fca5a5',
                  padding: '8px 12px',
                  fontFamily: 'DM Sans', fontSize: 12,
                }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 6 }}>
                <button type="button" onClick={() => setStep(2)} style={secondaryBtn}>
                  Volver
                </button>
                <button
                  type="button"
                  data-testid="wizard-submit"
                  onClick={handleSubmit}
                  disabled={busy || !lumaUrl}
                  style={{ ...primaryBtn, opacity: busy || !lumaUrl ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
                >
                  {busy ? 'ENVIANDO…' : 'CREAR TOUR 3D'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  color: '#fff', border: 'none', borderRadius: 9999,
  padding: '11px 22px',
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 12,
  letterSpacing: '0.1em', cursor: 'pointer',
};

const secondaryBtn = {
  background: 'transparent', color: 'var(--cream)',
  border: '1px solid rgba(240,235,224,0.25)', borderRadius: 9999,
  padding: '10px 20px',
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
  letterSpacing: '0.08em', cursor: 'pointer',
};
