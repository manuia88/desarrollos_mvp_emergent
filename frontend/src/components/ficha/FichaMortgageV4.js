/**
 * FichaMortgageV4 — calculadora de crédito hipotecario multi-fuente (Infonavit + Fovissste + bancos)
 * re-vestida al look v4 (light + degradado morado). MOTOR INTACTO: POST /api/public/mortgage/calculate
 * vía calculateMortgage. Misma lógica/inputs/outputs que components/marketplace/MortgageCalculator.js,
 * solo cambia la piel. No duplica motor.
 */
import React, { useState } from 'react';
import { calculateMortgage, saveMortgage } from '../../api/marketplace';
import { V4, HEAD, SANS, GRAD, fmtMXN, inpV4, cardV4, BtnV4, Field, CalcHeader, Disclaimer } from './calcV4';

const FIELDS = [
  { k: 'precio', label: 'Precio del inmueble (MXN)', required: true },
  { k: 'enganche_pct', label: 'Enganche %', step: 1, min: 0, max: 95 },
  { k: 'plazo_anos', label: 'Plazo (años)', step: 1, min: 1, max: 30 },
  { k: 'ingreso_mensual', label: 'Ingreso mensual (MXN)' },
  { k: 'edad', label: 'Edad', step: 1, min: 18, max: 80 },
  { k: 'sbc', label: 'SBC Infonavit (mensual)' },
  { k: 'sueldo_basico', label: 'Sueldo básico Fovissste' },
  { k: 'ahorro_voluntario', label: 'Ahorro voluntario' },
];

function Kpi({ label, value, big }) {
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, color: V4.ink3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: HEAD, fontWeight: big ? 800 : 700, fontSize: big ? 20 : 14, color: big ? V4.theme : V4.ink }}>{value}</div>
    </div>
  );
}

function SourceCard({ entry }) {
  if (!entry) return null;
  const viable = !!entry.viable;
  return (
    <div className="dmx-card" style={{ ...cardV4, padding: '16px 18px', borderColor: viable ? 'rgba(109,74,255,0.28)' : 'rgba(220,38,38,0.22)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.ink }}>{entry.banco}</div>
        <span style={{ padding: '3px 10px', borderRadius: 9999, fontFamily: SANS, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: viable ? V4.green : V4.red, background: viable ? 'rgba(14,159,110,0.10)' : 'rgba(220,38,38,0.08)', border: `1px solid ${viable ? 'rgba(14,159,110,0.32)' : 'rgba(220,38,38,0.28)'}` }}>{viable ? 'Viable' : 'No viable'}</span>
      </div>
      {viable ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
          <Kpi label="Pago mensual" value={fmtMXN(entry.pago_mensual)} big />
          <Kpi label="Monto crédito" value={fmtMXN(entry.monto_credito)} />
          <Kpi label="Plazo" value={`${entry.plazo_anos} años`} />
          <Kpi label="CAT" value={entry.cat_pct != null ? `${entry.cat_pct}%` : '—'} />
          {entry.tasa_anual_pct != null && <Kpi label="Tasa anual" value={`${entry.tasa_anual_pct}%`} />}
          {entry.dti_ratio != null && <Kpi label="DTI" value={`${(entry.dti_ratio * 100).toFixed(1)}%`} />}
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2, background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>{entry.razon || 'No viable con los datos proporcionados.'}</div>
      )}
    </div>
  );
}

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
      <CalcHeader eyebrow="Calculadora hipotecaria" title={`Tu hipoteca${devName ? ` para ${devName}` : ''}`} subtitle="Compara Infonavit, Fovissste y bancos en una sola corrida." />
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
          <div className="mortv4-res" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <SourceCard entry={result.infonavit} />
            <SourceCard entry={result.fovissste} />
            <div className="dmx-card" style={{ ...cardV4, padding: '16px 18px' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: V4.ink, marginBottom: 12 }}>Banca privada</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(result.banca || []).map((b) => (
                  <div key={b.banco} style={{ padding: '9px 11px', borderRadius: 10, background: b.viable ? 'rgba(109,74,255,0.06)' : 'rgba(220,38,38,0.04)', border: `1px solid ${b.viable ? 'rgba(109,74,255,0.20)' : 'rgba(220,38,38,0.16)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div><div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: V4.ink }}>{b.banco}</div><div style={{ fontFamily: SANS, fontSize: 10.5, color: V4.ink3 }}>CAT {b.cat_pct}%{b.dti_ratio != null ? ` · DTI ${(b.dti_ratio * 100).toFixed(1)}%` : ''}</div></div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: b.viable ? V4.theme : V4.red }}>{fmtMXN(b.pago_mensual)}</div>
                  </div>
                ))}
              </div>
            </div>
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
