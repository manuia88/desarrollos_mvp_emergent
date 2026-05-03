/**
 * Batch 18 Sub-A — /configuracion/preferencias
 * 3 visual density preview cards + radio button select + save inmediato (PATCH).
 *
 * B18.5: wrapped in PortalLayout so users keep the portal nav/topbar context.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyPreferences, patchMyPreferences } from '../../api/preferences18';
import { invalidateDensityCache } from '../../hooks/useDensity';
import { PortalLayout } from '../../components/shared/PortalLayout';
import { usePresentationMode } from '../../hooks/usePresentationMode';
import { useTour } from '../../hooks/useTour';
import { getFirstLoginTourId } from '../../config/tours';
import { Check, Monitor } from 'lucide-react';

const DENSITIES = [
  {
    key: 'comfortable',
    label: 'Cómoda',
    description: 'Espaciado estándar. Ideal para trabajo enfocado.',
    preview: { rows: 3, rowH: 40, gap: 12, pad: 14 },
  },
  {
    key: 'compact',
    label: 'Compacta',
    description: 'Espaciado reducido 25%. Más datos en pantalla.',
    preview: { rows: 4, rowH: 30, gap: 9, pad: 10 },
  },
  {
    key: 'spacious',
    label: 'Espaciosa',
    description: 'Espaciado ampliado 30%. Mejor legibilidad.',
    preview: { rows: 2, rowH: 52, gap: 16, pad: 18 },
  },
];

function DensityPreview({ density, selected }) {
  const { preview } = density;
  return (
    <div style={{
      background: 'rgba(240,235,224,0.04)',
      borderRadius: 10,
      overflow: 'hidden',
      padding: preview.pad,
      display: 'flex',
      flexDirection: 'column',
      gap: preview.gap,
      height: 140,
      transition: 'all 0.18s',
    }}>
      {Array.from({ length: preview.rows }).map((_, i) => (
        <div key={i} style={{
          height: preview.rowH,
          borderRadius: 6,
          background: selected
            ? 'rgba(99,102,241,0.18)'
            : 'rgba(240,235,224,0.08)',
          border: `1px solid ${selected ? 'rgba(99,102,241,0.35)' : 'rgba(240,235,224,0.1)'}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 8,
          transition: 'all 0.18s',
        }}>
          <div style={{ width: 20, height: 6, borderRadius: 3, background: selected ? 'rgba(99,102,241,0.5)' : 'rgba(240,235,224,0.15)' }} />
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: selected ? 'rgba(99,102,241,0.3)' : 'rgba(240,235,224,0.1)' }} />
          <div style={{ width: 30, height: 6, borderRadius: 3, background: selected ? 'rgba(99,102,241,0.4)' : 'rgba(240,235,224,0.1)' }} />
        </div>
      ))}
    </div>
  );
}

export default function PreferenciasPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [density, setDensityLocal] = useState('comfortable');
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);

  // Presentation mode state
  const { isActive: pmActive, config: pmConfig, toggle: pmToggle, setConfig: pmSetConfig } = usePresentationMode();

  // Tour restart
  const { startTour } = useTour(user);

  useEffect(() => {
    getMyPreferences()
      .then(p => setDensityLocal(p.density || 'comfortable'))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (key) => {
    if (saving || key === density) return;
    setDensityLocal(key);
    setSaving(key);
    try {
      await patchMyPreferences({ density: key });
      invalidateDensityCache();
      // Apply immediately to body
      document.body.classList.remove('density-comfortable', 'density-compact', 'density-spacious');
      document.body.classList.add(`density-${key}`);
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (_) {
      setDensityLocal(density); // rollback
    } finally {
      setSaving(null);
    }
  };

  return (
    <PortalLayout role={user?.role || 'developer_admin'} user={user} onLogout={onLogout}>
      <div style={{
        minHeight: '100%', background: 'var(--bg)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Configuración · Preferencias</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, marginBottom: 8 }}>
            Densidad de información
          </h1>
          <p style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.6 }}>
            Controla el espaciado y tamaño de la interfaz. Se aplica a todas las vistas del portal.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                flex: 1, height: 220, borderRadius: 14,
                background: 'rgba(240,235,224,0.04)',
                animation: 'pulse 850ms ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
            data-testid="density-cards"
          >
            {DENSITIES.map(d => {
              const isSelected = density === d.key;
              const isSaving = saving === d.key;
              const isSaved = saved === d.key;
              return (
                <button
                  key={d.key}
                  data-testid={`density-card-${d.key}`}
                  onClick={() => handleSelect(d.key)}
                  disabled={!!saving}
                  style={{
                    background: isSelected
                      ? 'rgba(99,102,241,0.10)'
                      : 'rgba(240,235,224,0.03)',
                    border: `2px solid ${isSelected ? 'rgba(99,102,241,0.55)' : 'rgba(240,235,224,0.12)'}`,
                    borderRadius: 14,
                    padding: '16px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.18s ease',
                    opacity: saving && !isSaving ? 0.7 : 1,
                    outline: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !saving) {
                      e.currentTarget.style.borderColor = 'rgba(240,235,224,0.25)';
                      e.currentTarget.style.transform = 'translateY(-6px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(240,235,224,0.12)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {/* Preview */}
                  <DensityPreview density={d} selected={isSelected} />

                  {/* Label + description */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{
                        fontFamily: 'Outfit', fontWeight: 700, fontSize: 15,
                        color: isSelected ? 'var(--cream)' : 'var(--cream-2)',
                        marginBottom: 3,
                      }}>
                        {d.label}
                      </div>
                      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                        {d.description}
                      </p>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: 9999, flexShrink: 0,
                      border: `2px solid ${isSelected ? '#6366F1' : 'rgba(240,235,224,0.2)'}`,
                      background: isSelected ? '#6366F1' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: 2,
                      transition: 'all 0.15s',
                    }}>
                      {isSaving ? (
                        <div style={{
                          width: 10, height: 10, borderRadius: 9999,
                          border: '2px solid rgba(255,255,255,0.5)',
                          borderTopColor: 'white',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                      ) : isSelected ? (
                        <Check size={12} color="white" />
                      ) : null}
                    </div>
                  </div>

                  {isSaved && (
                    <div style={{
                      fontSize: 11, color: 'var(--green)', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Check size={11} /> Guardado
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Current selection label */}
        {!loading && (
          <div style={{
            marginTop: 24, padding: '12px 16px',
            background: 'rgba(240,235,224,0.03)',
            border: '1px solid rgba(240,235,224,0.1)',
            borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>Densidad activa:</span>
            <span
              data-testid="current-density-label"
              style={{
                fontFamily: 'DM Mono, monospace', fontSize: 12,
                color: 'var(--cream)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}
            >
              {density}
            </span>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', marginLeft: 4 }}>
              · Aplica a CRM, proyectos, inventario, tareas y drawers
            </span>
          </div>
        )}

        {/* ─── Presentation Mode Section (B19 Sub-C) ────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <div style={{ marginBottom: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Modo Presentación · Cmd+Shift+P</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0, marginBottom: 8 }}>
              Modo Presentación
            </h2>
            <p style={{ color: 'var(--cream-2)', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
              Para mostrar el portal a clientes o inversionistas sin exponer datos sensibles (PII, precios internos, notas).
            </p>
          </div>

          <div style={{
            background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.1)',
            borderRadius: 14, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18,
          }}>

            {/* Main activate button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
                  {pmActive ? 'Modo Presentación activo' : 'Modo Presentación inactivo'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>
                  Activa con <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(240,235,224,0.1)', border: '1px solid rgba(240,235,224,0.2)', fontFamily: 'DM Mono', fontSize: 10 }}>Cmd+Shift+P</kbd>
                </div>
              </div>
              <button
                data-testid="presentation-mode-toggle-btn"
                onClick={pmToggle}
                style={{
                  padding: '9px 18px', borderRadius: 9999,
                  background: pmActive ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.12)',
                  border: `1px solid ${pmActive ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.35)'}`,
                  color: pmActive ? 'var(--green)' : 'var(--cream)',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s',
                }}
              >
                <Monitor size={14} />
                {pmActive ? 'Desactivar' : 'Activar ahora'}
              </button>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(240,235,224,0.08)' }} />

            {/* Config toggles */}
            {[
              { field: 'anonymize_pii', label: 'Anonimizar datos de contacto', desc: 'Nombres, email y teléfono de leads → "Lead 001"', defaultOn: true },
              { field: 'hide_pricing', label: 'Ocultar precios', desc: 'Precios de unidades y comisiones quedan borrosos', defaultOn: false },
              { field: 'hide_internal_notes', label: 'Ocultar notas internas', desc: 'Notas y comentarios internos del equipo no se muestran', defaultOn: true },
            ].map(({ field, label, desc, defaultOn }) => {
              const val = pmConfig[field] !== undefined ? pmConfig[field] : defaultOn;
              return (
                <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream-2)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{desc}</div>
                  </div>
                  <button
                    data-testid={`pm-toggle-${field}`}
                    onClick={() => pmSetConfig({ [field]: !val })}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none',
                      background: val ? 'rgba(99,102,241,0.55)' : 'rgba(240,235,224,0.12)',
                      cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: val ? 22 : 3,
                      width: 18, height: 18, borderRadius: 9,
                      background: 'white', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Tour onboarding restart ────────────────────────────────────────── */}
        <div style={{ marginTop: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Onboarding</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0, marginBottom: 4 }}>
              Tour de bienvenida
            </h2>
          </div>
          <div style={{
            background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.1)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: 13, color: 'var(--cream-2)', margin: 0, lineHeight: 1.6 }}>
              Volver a ver el tour de onboarding para tu rol.
            </p>
            <button
              data-testid="restart-tour-btn"
              onClick={() => {
                const tourId = getFirstLoginTourId(user?.role || 'developer_admin');
                if (tourId) startTour(tourId);
              }}
              style={{
                padding: '8px 16px', borderRadius: 9999, whiteSpace: 'nowrap',
                background: 'rgba(240,235,224,0.08)', border: '1px solid rgba(240,235,224,0.2)',
                color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', flexShrink: 0, marginLeft: 16,
              }}
            >
              Volver a ver tour
            </button>
          </div>
        </div>

        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
      </div>
    </PortalLayout>
  );
}