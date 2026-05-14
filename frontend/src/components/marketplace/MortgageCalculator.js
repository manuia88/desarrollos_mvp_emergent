/**
 * MortgageCalculator — Phase 4 Batch 27 (Sub-A)
 * Calculadora hipotecaria multi-fuente: Infonavit + Fovissste + 5 bancos.
 * Embebible (modo 'inline' compact) o standalone modal.
 *
 * Props:
 *   open           — boolean (modo modal). Si false, renderiza inline.
 *   onClose        — callback (solo modal)
 *   propiedadId    — id del desarrollo/propiedad para attribution
 *   propiedadNombre — nombre legible
 *   precioInicial  — autocompleta el campo precio
 */
import React, { useState } from 'react';
import { calculateMortgage, saveMortgage } from '../../api/marketplace';
import { X, Sparkle } from '../icons';

const FIELDS = [
  { k: 'precio',           label: 'Precio del inmueble (MXN)',     type: 'number', required: true },
  { k: 'enganche_pct',     label: 'Enganche %',                    type: 'number', step: 1, min: 0, max: 95 },
  { k: 'plazo_anos',       label: 'Plazo (años)',                  type: 'number', step: 1, min: 1, max: 30 },
  { k: 'ingreso_mensual',  label: 'Ingreso mensual (MXN)',         type: 'number' },
  { k: 'edad',             label: 'Edad',                          type: 'number', step: 1, min: 18, max: 80 },
  { k: 'sbc',              label: 'SBC Infonavit (mensual MXN)',   type: 'number' },
  { k: 'sueldo_basico',    label: 'Sueldo básico Fovissste (MXN)', type: 'number' },
  { k: 'ahorro_voluntario',label: 'Ahorro voluntario (MXN)',       type: 'number' },
];

function fmtMxn(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

function ResultCard({ entry, idx = 0 }) {
  const viable = !!entry?.viable;
  const dotColor = viable ? '#22C55E' : '#EF4444';
  return (
    <div data-testid={`mortgage-result-${entry?.banco?.toLowerCase().replace(/\s+/g, '-') || idx}`}
      style={{
        padding: '16px 18px',
        borderRadius: 14,
        background: 'rgba(13,16,23,0.92)',
        border: `1px solid ${viable ? 'rgba(var(--theme-rgb),0.32)' : 'rgba(239,68,68,0.28)'}`,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
      }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.01em',
        }}>
          {entry.banco}
        </div>
        <div style={{
          padding: '3px 10px', borderRadius: 9999,
          background: viable ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
          border: `1px solid ${viable ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
          color: dotColor, textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {viable ? 'Viable' : 'No viable'}
        </div>
      </div>

      {viable ? (
        <>
          <div style={kpiGrid}>
            <Kpi label="Pago mensual" value={fmtMxn(entry.pago_mensual)} highlight />
            <Kpi label="Monto crédito" value={fmtMxn(entry.monto_credito)} />
            <Kpi label="Plazo" value={`${entry.plazo_anos} años`} />
            <Kpi label="CAT" value={`${entry.cat_pct ?? '—'}%`} />
            {entry.tasa_anual_pct !== undefined && (
              <Kpi label="Tasa anual" value={`${entry.tasa_anual_pct}%`} />
            )}
            {entry.dti_ratio !== undefined && (
              <Kpi label="DTI" value={`${(entry.dti_ratio * 100).toFixed(1)}%`} />
            )}
          </div>
        </>
      ) : (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(252,165,165,0.85)',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 9, padding: '9px 11px',
        }}>
          {entry.razon || 'No viable con los datos proporcionados.'}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }) {
  return (
    <div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 9, fontWeight: 600,
        color: 'rgba(240,235,224,0.45)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: highlight ? 800 : 700,
        fontSize: highlight ? 18 : 14,
        color: highlight ? 'rgba(165,180,252,1)' : 'var(--cream, #F0EBE0)',
      }}>
        {value}
      </div>
    </div>
  );
}

const kpiGrid = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginTop: 4,
};

export default function MortgageCalculator({
  open = true,
  onClose,
  propiedadId,
  propiedadNombre,
  precioInicial = 0,
  variant = 'inline', // 'inline' | 'modal'
}) {
  const [form, setForm] = useState({
    precio: precioInicial || '',
    enganche_pct: 20,
    plazo_anos: 20,
    ingreso_mensual: '',
    edad: 32,
    sbc: '',
    sueldo_basico: '',
    ahorro_voluntario: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // save flow
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveEmail, setSaveEmail] = useState('');
  const [saveAccepted, setSaveAccepted] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveDone, setSaveDone] = useState(false);

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.precio || Number(form.precio) <= 0) {
      setError('Ingresa un precio válido');
      return;
    }
    setLoading(true);
    try {
      const body = {
        precio: Number(form.precio),
        enganche_pct: Number(form.enganche_pct) / 100,
        plazo_anos: Number(form.plazo_anos),
        ingreso_mensual: Number(form.ingreso_mensual) || 0,
        edad: Number(form.edad) || 30,
        sbc: Number(form.sbc) || 0,
        sueldo_basico: Number(form.sueldo_basico) || 0,
        ahorro_voluntario: Number(form.ahorro_voluntario) || 0,
      };
      const data = await calculateMortgage(body);
      setResult(data);
    } catch (e) {
      setError(e?.message || 'Error al calcular');
    } finally {
      setLoading(false);
    }
  };

  const submitSave = async () => {
    if (!saveEmail.trim() || !saveEmail.includes('@') || !saveAccepted || !result) return;
    setSaveLoading(true);
    try {
      await saveMortgage(saveEmail.trim(), result, propiedadId, true);
      setSaveDone(true);
    } catch (e) {
      setError(e?.message || 'Error al guardar');
    } finally {
      setSaveLoading(false);
    }
  };

  if (variant === 'modal' && !open) return null;

  const Body = (
    <div data-testid="mortgage-calculator">
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18,
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 9999,
            background: 'rgba(var(--theme-rgb),0.12)',
            border: '1px solid rgba(var(--theme-rgb),0.28)',
            fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
            color: 'rgba(var(--theme-rgb),0.95)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 8,
          }}>
            <Sparkle size={10} /> Calculadora hipotecaria
          </div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
            color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
          }}>
            Tu hipoteca {propiedadNombre ? `para ${propiedadNombre}` : ''}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 12,
            color: 'rgba(240,235,224,0.5)', marginTop: 4,
          }}>
            Compara Infonavit, Fovissste y 5 bancos en una sola corrida.
          </div>
        </div>
        {variant === 'modal' && (
          <button onClick={onClose} data-testid="mortgage-close"
            style={closeBtnStyle}><X size={12} /></button>
        )}
      </div>

      {/* Form grid */}
      <div className="mort-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: 16,
      }}>
        {FIELDS.map(f => (
          <label key={f.k} style={{ display: 'block' }}>
            <div style={{
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
              color: 'rgba(240,235,224,0.7)', marginBottom: 5,
            }}>
              {f.label}{f.required && <span style={{ color: 'var(--theme-3)' }}> *</span>}
            </div>
            <input
              data-testid={`mortgage-input-${f.k}`}
              type={f.type}
              value={form[f.k]}
              onChange={e => onChange(f.k, e.target.value)}
              step={f.step}
              min={f.min}
              max={f.max}
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '9px 12px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
        }}>
          {error}
        </div>
      )}

      <button
        data-testid="mortgage-submit"
        onClick={submit}
        disabled={loading}
        style={{
          width: '100%', padding: '13px 22px', borderRadius: 9999, border: 'none',
          background: loading ? 'rgba(var(--theme-rgb),0.3)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: 18,
        }}
      >
        {loading ? 'Calculando…' : 'Calcular hipoteca'}
      </button>

      {/* Results */}
      {result && (
        <div data-testid="mortgage-results">
          <div className="mort-results-grid" style={{
            display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 18,
          }}>
            <ResultCard entry={result.infonavit} idx={0} />
            <ResultCard entry={result.fovissste} idx={1} />
            <div style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: 'rgba(13,16,23,0.92)',
              border: '1px solid rgba(240,235,224,0.10)',
              backdropFilter: 'blur(24px)',
            }}>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
                color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.01em', marginBottom: 12,
              }}>
                Banca privada
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(result.banca || []).map(b => (
                  <div key={b.banco} data-testid={`mortgage-banca-${b.banco.toLowerCase()}`}
                    style={{
                      padding: '8px 10px', borderRadius: 9,
                      background: b.viable ? 'rgba(var(--theme-rgb),0.10)' : 'rgba(239,68,68,0.06)',
                      border: `1px solid ${b.viable ? 'rgba(var(--theme-rgb),0.25)' : 'rgba(239,68,68,0.20)'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <div>
                      <div style={{
                        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                        color: 'var(--cream, #F0EBE0)',
                      }}>
                        {b.banco}
                      </div>
                      <div style={{
                        fontFamily: 'DM Sans', fontSize: 10,
                        color: 'rgba(240,235,224,0.5)',
                      }}>
                        CAT {b.cat_pct}% · DTI {(b.dti_ratio * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
                      color: b.viable ? 'rgba(165,180,252,1)' : '#FCA5A5',
                    }}>
                      {fmtMxn(b.pago_mensual)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Save flow */}
          {!saveOpen && !saveDone && (
            <button
              data-testid="mortgage-save-trigger"
              onClick={() => setSaveOpen(true)}
              style={{
                padding: '11px 18px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(240,235,224,0.18)',
                color: 'var(--cream, #F0EBE0)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Enviarme este cálculo por email
            </button>
          )}

          {saveOpen && !saveDone && (
            <div style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(240,235,224,0.10)',
            }}>
              <input
                data-testid="mortgage-save-email"
                type="email" value={saveEmail}
                onChange={e => setSaveEmail(e.target.value)}
                placeholder="tu@email.com"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <label style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10,
                fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)',
              }}>
                <input type="checkbox" data-testid="mortgage-save-accept"
                  checked={saveAccepted} onChange={e => setSaveAccepted(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--theme)' }} />
                <span>Acepto recibir el resumen y comunicación de DesarrollosMX.</span>
              </label>
              <button
                data-testid="mortgage-save-submit"
                onClick={submitSave}
                disabled={saveLoading || !saveEmail.includes('@') || !saveAccepted}
                style={{
                  padding: '10px 18px', borderRadius: 9999, border: 'none',
                  background: (saveLoading || !saveEmail.includes('@') || !saveAccepted)
                    ? 'rgba(var(--theme-rgb),0.3)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                  cursor: (saveLoading || !saveEmail.includes('@') || !saveAccepted) ? 'not-allowed' : 'pointer',
                }}
              >
                {saveLoading ? 'Enviando…' : 'Enviar resumen'}
              </button>
            </div>
          )}

          {saveDone && (
            <div data-testid="mortgage-save-done" style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.30)',
              fontFamily: 'DM Sans', fontSize: 13, color: '#86EFAC',
            }}>
              ✓ Cálculo enviado a {saveEmail}.
            </div>
          )}

          {result?.disclaimer && (
            <div style={{
              marginTop: 14,
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.4)', lineHeight: 1.5,
            }}>
              {result.disclaimer}
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .mort-grid { grid-template-columns: 1fr !important; }
          .mort-results-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );

  if (variant === 'modal') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(6,8,15,0.86)', backdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        overflowY: 'auto',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'rgba(13,16,23,0.97)',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 22, padding: '24px',
          width: '100%', maxWidth: 880, maxHeight: '92vh', overflowY: 'auto',
        }}>
          {Body}
        </div>
      </div>
    );
  }
  return Body;
}

const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(240,235,224,0.15)',
  borderRadius: 9, outline: 'none',
  fontFamily: 'DM Sans', fontSize: 13,
  color: 'var(--cream, #F0EBE0)',
  boxSizing: 'border-box',
};

const closeBtnStyle = {
  width: 30, height: 30, borderRadius: 9999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(240,235,224,0.15)',
  color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
