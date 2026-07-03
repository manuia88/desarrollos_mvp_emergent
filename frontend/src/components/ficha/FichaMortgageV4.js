/**
 * FichaMortgageV4 — calculadora de crédito hipotecario multi-fuente (Infonavit + Fovissste + bancos)
 * re-vestida al look v4 (light + degradado morado). MOTOR INTACTO: POST /api/public/mortgage/calculate
 * vía calculateMortgage. Misma lógica/inputs/outputs que components/marketplace/MortgageCalculator.js,
 * solo cambia la piel. No duplica motor.
 */
import React, { useState } from 'react';
import { calculateMortgage, saveMortgage } from '../../api/marketplace';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer } from './calcV4';

// Solo crédito BANCARIO (sin Infonavit/Fovissste)
const FIELDS = [
  { k: 'precio', label: 'Precio del inmueble (MXN)', required: true },
  { k: 'enganche_pct', label: 'Enganche %', step: 1, min: 0, max: 95 },
  { k: 'plazo_anos', label: 'Plazo (años)', step: 1, min: 1, max: 30 },
  { k: 'ingreso_mensual', label: 'Ingreso mensual (MXN)' },
];

export default function FichaMortgageV4({ basePrice = 0, devId, devName }) {
  const [form, setForm] = useState({ precio: basePrice || '', enganche_pct: 20, plazo_anos: 20, ingreso_mensual: '', edad: 32, sbc: '', sueldo_basico: '', ahorro_voluntario: '' });
  const [loading, setLoading] = useState(false); const [error, setError] = useState(null); const [result, setResult] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false); const [email, setEmail] = useState(''); const [accepted, setAccepted] = useState(false); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.precio || Number(form.precio) <= 0) { setError('Ingresa un precio válido'); return; }
    setLoading(true);
    try {
      const data = await calculateMortgage({
        precio: Number(form.precio), enganche_pct: Number(form.enganche_pct) / 100, plazo_anos: Number(form.plazo_anos),
        ingreso_mensual: Number(form.ingreso_mensual) || 0, edad: Number(form.edad) || 30, sbc: Number(form.sbc) || 0,
        sueldo_basico: Number(form.sueldo_basico) || 0, ahorro_voluntario: Number(form.ahorro_voluntario) || 0,
      });
      setResult(data);
    } catch (e) { setError(e?.message || 'Error al calcular'); }
    setLoading(false);
  };
  const submitSave = async () => {
    if (!email.includes('@') || !accepted || !result) return;
    setSaving(true);
    try { await saveMortgage(email.trim(), result, devId, true); setSaved(true); } catch (e) { setError(e?.message || 'Error al guardar'); }
    setSaving(false);
  };

  return (
    <div style={{ ...cardV4, padding: 24 }}>
      <CalcHeader eyebrow="Calculadora hipotecaria" title={`Tu crédito${devName ? ` para ${devName}` : ''}`} subtitle="Compara las mejores tasas de crédito bancario para esta propiedad." />
      <div className="mortv4-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 16 }}>
        {FIELDS.map((f) => (
          <Field key={f.k} label={f.label} required={f.required}>
            <input type="number" value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} step={f.step} min={f.min} max={f.max} style={inpV4} onFocus={(e) => { e.target.style.borderColor = V4.theme; e.target.style.boxShadow = '0 0 0 3px rgba(109,74,255,0.12)'; }} onBlur={(e) => { e.target.style.borderColor = V4.line; e.target.style.boxShadow = 'none'; }} />
          </Field>
        ))}
      </div>
      {error && <div style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 12, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)', fontFamily: SANS, fontSize: 12.5, color: V4.red }}>{error}</div>}
      <BtnV4 full onClick={submit} disabled={loading}>{loading ? 'Calculando…' : 'Calcular hipoteca'}</BtnV4>

      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.ink, marginBottom: 12 }}>Crédito bancario</div>
          <div className="mortv4-res" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
            {(result.banca || []).map((b) => (
              <div key={b.banco} className="dmx-card" style={{ ...cardV4, padding: '14px 16px', borderColor: b.viable ? 'rgba(109,74,255,0.28)' : V4.line }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: V4.ink }}>{b.banco}</div>
                  <span style={{ padding: '2px 9px', borderRadius: 9999, fontFamily: SANS, fontWeight: 700, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: b.viable ? V4.green : V4.red, background: b.viable ? 'rgba(14,159,110,0.1)' : 'rgba(220,38,38,0.08)' }}>{b.viable ? 'Viable' : 'No viable'}</span>
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: V4.theme }}>{fmtMXN(b.pago_mensual)}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink3, marginBottom: 8 }}>al mes</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: SANS, fontSize: 11.5, color: V4.ink2 }}>
                  <span>CAT <b style={{ color: V4.ink }}>{b.cat_pct}%</b></span>
                  {b.dti_ratio != null && <span>DTI <b style={{ color: V4.ink }}>{(b.dti_ratio * 100).toFixed(1)}%</b></span>}
                </div>
                {!b.viable && b.razon && <div style={{ fontFamily: SANS, fontSize: 11, color: V4.amber, marginTop: 8, lineHeight: 1.4 }}>{b.razon}</div>}
              </div>
            ))}
          </div>

          {!saved && !saveOpen && <button className="dmx-press" onClick={() => setSaveOpen(true)} style={{ padding: '11px 18px', borderRadius: 9999, background: '#fff', border: `1px solid ${V4.line}`, color: V4.ink, fontFamily: SANS, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Enviarme este cálculo por email</button>}
          {saveOpen && !saved && (
            <div style={{ padding: 14, borderRadius: 12, background: V4.surface, border: `1px solid ${V4.line}` }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" style={{ ...inpV4, marginBottom: 10 }} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontFamily: SANS, fontSize: 12, color: V4.ink2 }}><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 2, accentColor: V4.theme }} /><span>Acepto recibir el resumen y comunicación de DesarrollosMX.</span></label>
              <BtnV4 onClick={submitSave} disabled={saving || !email.includes('@') || !accepted} style={{ padding: '10px 18px', fontSize: 12 }}>{saving ? 'Enviando…' : 'Enviar resumen'}</BtnV4>
            </div>
          )}
          {saved && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(14,159,110,0.08)', border: '1px solid rgba(14,159,110,0.3)', fontFamily: SANS, fontSize: 13, color: V4.green }}>✓ Cálculo enviado a {email}.</div>}
          {result.disclaimer && <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 11, color: V4.ink3, lineHeight: 1.5 }}>{result.disclaimer}</div>}
        </div>
      )}
      <style>{`@media(max-width:720px){ .mortv4-grid{ grid-template-columns:1fr !important; } .mortv4-res{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
