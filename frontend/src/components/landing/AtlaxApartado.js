// AtlaxApartado — Capa 1 F4 · cierre agéntico a venta (apartado).
// Modal GLOBAL: cualquier tarjeta de desarrollo (AtlaxBlocks) dispara `dmx:apartar` con {dev} → abre el flujo:
// términos reales (enganche/mensualidad) + precalificación corta (crédito/enganche) + contacto → crea un LEAD
// CALIFICADO vía /api/lead-capture (el asesor confirma el hold real). Reusa lib/buyerSignal (flywheel). Tema oscuro propio.
import React, { useEffect, useState } from 'react';
import { Sparkle, X } from '../icons';
import { sendBuyerSignal } from '../../lib/buyerSignal';

const API = process.env.REACT_APP_BACKEND_URL || '';
const fmtMXN = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);
const fmtM = (n) => (n == null ? '—' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : fmtMXN(n)));

function calcTerms(price) {
  if (!price) return null;
  const enganche = Math.round(price * 0.20);
  const credito = price - enganche;
  const rate = 0.105, n = 240, rm = rate / 12;
  const mensualidad = Math.round(credito * rm / (1 - Math.pow(1 + rm, -n)));
  const apartado = Math.min(50000, Math.max(20000, Math.round(price * 0.01)));
  return { enganche, credito, mensualidad, apartado };
}

const CREDITOS = ['Infonavit', 'Crédito bancario', 'Contado'];
const ENGANCHES = ['Menos de $500K', '$500K – $1M', 'Más de $1M'];

const ov = { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(4,6,12,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const card = { width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', background: '#0E1118', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', color: '#F0EBE0', fontFamily: "'DM Sans',sans-serif" };
const labelS = { fontSize: 12.5, fontWeight: 700, color: 'rgba(240,235,224,0.6)', margin: '16px 0 8px' };
const chip = (on) => ({ borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.12)'}`, background: on ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)', color: on ? '#A5B4FC' : '#F0EBE0' });
const inp = { width: '100%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '11px 13px', color: '#F0EBE0', fontFamily: "'DM Sans',sans-serif", fontSize: 14.5, outline: 'none' };

export default function AtlaxApartado() {
  const [dev, setDev] = useState(null);
  const [credito, setCredito] = useState('');
  const [engancheDisp, setEngancheDisp] = useState('');
  const [name, setName] = useState('');
  const [wa, setWa] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onApartar = (e) => {
      const d = e && e.detail && e.detail.dev;
      if (d) { setDev(d); setCredito(''); setEngancheDisp(''); setName(''); setWa(''); setConsent(false); setDone(false); setErr(''); }
    };
    window.addEventListener('dmx:apartar', onApartar);
    return () => window.removeEventListener('dmx:apartar', onApartar);
  }, []);

  if (!dev) return null;
  const terms = calcTerms(dev.price_from || dev.price);
  const close = () => setDev(null);

  const submit = async () => {
    setErr('');
    if (!name.trim() || name.trim().length < 2) { setErr('Escribe tu nombre.'); return; }
    const waClean = wa.replace(/[\s\-()]/g, '');
    if (!/^(\+?52)?\d{10}$/.test(waClean)) { setErr('WhatsApp: 10 dígitos (o +52…).'); return; }
    if (!consent) { setErr('Acepta el aviso de privacidad para continuar.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/lead-capture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), whatsapp: waClean, property_id: dev.id, property_scope: 'project',
          source_page: 'atlax_apartado', audience: 'neutral',
          interes: { apartado: true, credito, enganche_disponible: engancheDisp, terms },
          consents: { privacy_policy: true },
        }),
      });
      if (!r.ok) throw new Error('fail');
      try { sendBuyerSignal('atlax_apartado', { dev_id: dev.id, credito, enganche: engancheDisp }); } catch (_) { /* noop */ }
      setDone(true);
    } catch (_) {
      setErr('No se pudo enviar. Intenta de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={ov} onClick={close}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#A5B4FC', fontWeight: 700, fontSize: 13 }}><Sparkle size={16} /> Apartar con Atlax</span>
          <button onClick={close} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', color: 'rgba(240,235,224,0.6)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
        </div>

        {done ? (
          <div style={{ padding: '18px 22px 26px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, margin: '0 0 8px' }}>¡Apartaste tu lugar!</h2>
            <p style={{ color: 'rgba(240,235,224,0.7)', fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>
              Reservamos tu interés en <b style={{ color: '#F0EBE0' }}>{dev.name}</b>. Un asesor te contacta por WhatsApp <b style={{ color: '#F0EBE0' }}>hoy</b> para confirmar el apartado y resolver tu crédito.
            </p>
            <button onClick={close} style={{ marginTop: 20, border: 'none', cursor: 'pointer', background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', borderRadius: 999, padding: '12px 26px', fontWeight: 700, fontSize: 14.5 }}>Listo</button>
          </div>
        ) : (
          <div style={{ padding: '12px 22px 24px' }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em', margin: '6px 0 2px' }}>{dev.name}</h2>
            <div style={{ color: 'rgba(240,235,224,0.6)', fontSize: 13 }}>{dev.colonia}{dev.alcaldia ? ` · ${dev.alcaldia}` : ''}</div>

            {terms && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
                {[['Apartas con', fmtMXN(terms.apartado)], ['Enganche (20%)', fmtM(terms.enganche)], ['Mensualidad', fmtMXN(terms.mensualidad)]].map(([l, v], i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 11px' }}>
                    <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: i === 2 ? '#10B981' : '#F0EBE0' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={labelS}>¿Cómo lo pagarías?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CREDITOS.map((c) => <button key={c} onClick={() => setCredito(c)} style={chip(credito === c)}>{c}</button>)}
            </div>

            <div style={labelS}>¿Cuánto tienes para el enganche?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ENGANCHES.map((c) => <button key={c} onClick={() => setEngancheDisp(c)} style={chip(engancheDisp === c)}>{c}</button>)}
            </div>

            <div style={labelS}>Tus datos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inp} />
              <input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="WhatsApp (10 dígitos)" inputMode="tel" style={inp} />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.65)', lineHeight: 1.45 }}>Acepto que un asesor me contacte y el <a href="/privacy/dsr" target="_blank" rel="noreferrer" style={{ color: '#A5B4FC' }}>aviso de privacidad</a>.</span>
            </label>

            {err && <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 10 }}>{err}</div>}

            <button onClick={submit} disabled={busy} style={{ width: '100%', marginTop: 16, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', borderRadius: 999, padding: '13px', fontWeight: 700, fontSize: 15 }}>
              {busy ? 'Enviando…' : 'Apartar mi lugar'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 10 }}>Sin costo · sin compromiso · un asesor confirma contigo</div>
          </div>
        )}
      </div>
    </div>
  );
}
