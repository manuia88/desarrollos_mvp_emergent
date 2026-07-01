/**
 * LeadCaptureModal — el ÚLTIMO cable del ciclo: en alto intento (agendar / "que un asesor me arme el plan" / PDF / comparador)
 * captura nombre + contacto y llama a /api/buyer/registrar con el visitor_id (que YA trae todo el contexto de señales: lente,
 * unidad, módulos abiertos). El backend crea el lead → lo espeja a asesor_contactos → notifica al asesor. Reusa el motor
 * existente (create_buyer_lead), no duplica. Sistema visual único.
 */
import React, { useState } from 'react';
import { Card, BtnPrimary, SERIF, SANS, HEAD } from './ui';
import { visitorId } from '../../lib/buyerSignal';

const API = process.env.REACT_APP_BACKEND_URL;
const REASON_TXT = {
  agendar: 'Agenda tu visita',
  wizard_vivir: 'Un asesor te arma el plan para vivir aquí',
  asesor_vivir: 'Un asesor te arma el plan',
  asesor: 'Que un asesor te contacte',
  calc_inversion_pdf: 'Recibe tu análisis de inversión',
  default: 'Habla con un asesor',
};
// El wizard "para vivir" NO debe heredar el lensLabel "Invertir" de la ficha. Cuando el lead viene del wizard vivir
// (o el caller pasa lensOverride), forzamos la etiqueta correcta.
const LENS_OVERRIDE = { wizard_vivir: 'Para vivir', asesor_vivir: 'Para vivir' };

export default function LeadCaptureModal({ dev, unit, lensLabel, lensOverride, keyAns, reason = 'default', onClose }) {
  // Etiqueta de lente EFECTIVA: override explícito > override por reason (wizard vivir) > la que trae la ficha.
  const lens = lensOverride || LENS_OVERRIDE[reason] || lensLabel || null;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);   // el POST falló → mostramos error + permitimos reintentar (no fingimos éxito)
  const ok = name.trim().length >= 2 && (phone.replace(/\D/g, '').length >= 10 || /@/.test(email));

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(false);
    try {
      const resp = await fetch(`${API}/api/buyer/registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ visitor_id: visitorId(), name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, dev_id: dev.id, source: `ficha_${reason}`, unit_number: unit ? unit.unit_number : null, lens: lens || null, contexto: keyAns || null }),
      });
      if (!resp.ok) throw new Error('registro falló');
      setSent(true);
    } catch (e) { setError(true); /* no marcamos sent: el cliente puede reintentar */ }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(16,18,28,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440 }}>
        <Card>
          {!sent ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(22px,3vw,28px)', color: 'var(--cream)', lineHeight: 1.1 }}>{REASON_TXT[reason] || REASON_TXT.default}</div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              {/* qué recibe el asesor — para que sepa que no repite nada */}
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tu asesor recibe</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginTop: 5, lineHeight: 1.5 }}>
                  {dev.name}{unit ? ` · unidad ${unit.unit_number}` : ''}{lens ? ` · ${lens}` : ''}{keyAns ? ` · ${keyAns}` : ''}. <span style={{ color: 'var(--cream-3)' }}>No repites nada.</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inp} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="WhatsApp / teléfono" style={inp} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Email (opcional)" style={inp} />
              </div>

              {error && (
                <div data-testid="lead-capture-error" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)' }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: '#DC2626' }}>No pudimos enviar tus datos</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4, lineHeight: 1.5 }}>Revisa tu conexión e inténtalo de nuevo — no se registró nada todavía.</div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <BtnPrimary onClick={submit} style={{ opacity: ok && !busy ? 1 : 0.55, cursor: ok && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Enviando…' : error ? 'Reintentar →' : 'Que me contacte un asesor →'}</BtnPrimary>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 10, lineHeight: 1.5 }}>Te contacta un asesor verificado del desarrollo. Sin spam.</div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 4px' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, color: 'var(--cream)', marginTop: 8 }}>¡Listo, {name.split(' ')[0]}!</div>
              <p style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', marginTop: 8, lineHeight: 1.6 }}>Un asesor te contacta pronto con tu análisis{unit ? ` de la ${unit.unit_number}` : ''} — ya tiene todo tu contexto.</p>
              <div style={{ marginTop: 16 }}><BtnPrimary onClick={onClose}>Seguir explorando</BtnPrimary></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const inp = { padding: '13px 15px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream)', outline: 'none', width: '100%', boxSizing: 'border-box' };
