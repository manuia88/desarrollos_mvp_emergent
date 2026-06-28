// AtlaxLeadModal — captura ligera de "Hablar con un Asesor" desde Atlax. CIERRA EL CICLO de verdad: llama
// /api/buyer/registrar (visitor_id ya trae todo el contexto de señales) → create_buyer_lead → lead_bridge →
// asesor_contactos (un asesor real recibe el lead). Antes la superficie solo mostraba un toast = promesa rota.
// Tema claro v2 explícito (vive fuera de LightScope). Contexto opcional: {dev, query}.
import React, { useState } from 'react';
import { visitorId } from '../../lib/buyerSignal';
import { Sparkle, X } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const HEAD = "'Outfit',sans-serif";
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';

export default function AtlaxLeadModal({ ctx, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  if (!ctx) return null;
  const dev = ctx.dev || null;

  const submit = async () => {
    setErr('');
    if (name.trim().length < 2) { setErr('Escribe tu nombre.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { setErr('WhatsApp: 10 dígitos.'); return; }
    if (!consent) { setErr('Acepta el aviso de privacidad.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/buyer/registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId(), name: name.trim(), phone: phone.trim(), email: null, dev_id: dev ? dev.id : null, source: 'atlax_surface', contexto: (ctx.query || '').slice(0, 160) || null }),
      });
      if (!r.ok) throw new Error('fail');
      setDone(true);
    } catch (_) { setErr('No se pudo enviar. Intenta de nuevo.'); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1900, background: 'rgba(20,18,30,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, border: '1px solid #ECECEC', boxShadow: '0 30px 80px rgba(20,18,30,0.4)', color: '#1E2230', fontFamily: 'DM Sans' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#6D4AFF', fontWeight: 700, fontSize: 13 }}><Sparkle size={15} /> Hablar con un Asesor</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', color: 'rgba(30,34,48,0.6)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
        </div>
        {done ? (
          <div style={{ padding: '14px 22px 26px', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>✓</div>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, margin: '0 0 8px' }}>¡Listo, {name.split(' ')[0]}!</h2>
            <p style={{ color: 'rgba(30,34,48,0.7)', fontSize: 14.5, lineHeight: 1.5, margin: 0 }}>Un asesor revisa tu búsqueda y te contacta por WhatsApp. Tiene todo tu contexto — no repites nada.</p>
            <button onClick={onClose} style={{ marginTop: 18, border: 'none', cursor: 'pointer', background: GRAD, color: '#fff', borderRadius: 999, padding: '12px 26px', fontWeight: 700, fontSize: 14.5, fontFamily: HEAD }}>Cerrar</button>
          </div>
        ) : (
          <div style={{ padding: '12px 22px 22px' }}>
            <p style={{ fontSize: 14, color: 'rgba(30,34,48,0.7)', lineHeight: 1.5, margin: '6px 0 14px' }}>
              Déjame tus datos y un asesor te ayuda con {dev ? <b style={{ color: '#1E2230' }}>{dev.name}</b> : 'tu búsqueda'}. Lleva todo lo que viste — sin empezar de cero.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inp} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp (10 dígitos)" inputMode="tel" style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: 'rgba(30,34,48,0.65)', lineHeight: 1.45 }}>Acepto que un asesor me contacte y el <a href="/privacy/dsr" target="_blank" rel="noreferrer" style={{ color: '#6D4AFF' }}>aviso de privacidad</a>.</span>
            </label>
            {err && <div style={{ color: '#DC4D4D', fontSize: 12.5, marginTop: 10 }}>{err}</div>}
            <button onClick={submit} disabled={busy} style={{ width: '100%', marginTop: 15, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, background: GRAD, color: '#fff', borderRadius: 999, padding: '13px', fontWeight: 700, fontSize: 15, fontFamily: HEAD }}>{busy ? 'Enviando…' : 'Que me contacte un asesor'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const inp = { width: '100%', border: '1px solid #ECECEC', background: '#fff', borderRadius: 12, padding: '11px 13px', color: '#1E2230', fontFamily: 'DM Sans', fontSize: 14.5, outline: 'none' };
