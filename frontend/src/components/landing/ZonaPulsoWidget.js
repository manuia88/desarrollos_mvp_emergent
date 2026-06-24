/**
 * ZonaPulsoWidget — lead magnet de las landings /desarrolladores y /asesores.
 * El visitante teclea SU zona (y, si es dev, tipo + precio) → mostramos una MUESTRA real pero mínima del pulso de la zona
 * (demanda real + índices de la colonia, de /api/public/pulso-zona) → para ver el reporte completo se registra
 * (/api/public/registro-interes). Estilo Hormozi: da el valor primero, captura después. Dato 100% real (no inventa nada).
 */
import React, { useEffect, useRef, useState } from 'react';

const HEAD = "'Outfit',sans-serif";
const API = process.env.REACT_APP_BACKEND_URL;

const fmtVal = (v, fmt) => {
  if (v === null || v === undefined || v === '') return '—';
  if (fmt === 'money') return `$${Number(v).toLocaleString('es-MX')}`;
  if (fmt === 'rec') return `${v} rec.`;
  return Number(v).toLocaleString('es-MX');
};

export default function ZonaPulsoWidget({ rol = 'dev' }) {
  const dev = rol !== 'asesor';
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [colonia, setColonia] = useState(null);   // {id, name}
  const [tipo, setTipo] = useState('departamento');
  const [precio, setPrecio] = useState('');
  const [pulso, setPulso] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const boxRef = useRef(null);

  // Typeahead de colonia sobre TODO el catálogo (1,811).
  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2 || (colonia && colonia.name === qq)) { setSug([]); return undefined; }
    let alive = true;
    const tid = setTimeout(() => {
      fetch(`${API}/api/colonias-search?q=${encodeURIComponent(qq)}&limit=6`)
        .then((r) => r.json()).then((list) => { if (alive) setSug(Array.isArray(list) ? list : []); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(tid); };
  }, [q, colonia]);

  const verPulso = async () => {
    if (!colonia) { setErr('Elige tu zona de la lista.'); return; }
    setErr(null); setLoading(true); setPulso(null); setSent(false);
    try {
      const p = new URLSearchParams({ colonia: colonia.id, rol });
      if (dev && tipo) p.set('tipo', tipo);
      if (dev && precio) p.set('precio', String(precio).replace(/[^0-9]/g, ''));
      const r = await fetch(`${API}/api/public/pulso-zona?${p.toString()}`);
      setPulso(await r.json());
    } catch { setErr('No pudimos traer el pulso ahora. Intenta de nuevo.'); }
    finally { setLoading(false); }
  };

  const registrar = async () => {
    if (!form.email.trim() && !form.telefono.trim()) { setErr('Déjanos un email o WhatsApp para enviarte el reporte.'); return; }
    setErr(null); setSending(true);
    try {
      await fetch(`${API}/api/public/registro-interes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol, ...form, colonia: colonia?.id, tipo: dev ? tipo : null, precio: dev && precio ? Number(String(precio).replace(/[^0-9]/g, '')) : null }),
      });
      setSent(true);
    } catch { setErr('No pudimos guardar tu registro. Intenta de nuevo.'); }
    finally { setSending(false); }
  };

  const inp = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--card-border)', background: '#fff', fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)', boxSizing: 'border-box', outline: 'none' };
  const eyebrow = { fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme)' };

  return (
    <div ref={boxRef} style={{ borderRadius: 'var(--r-card)', border: '1px solid var(--card-border)', background: 'var(--surface-card)', padding: 'clamp(20px,3vw,32px)', boxShadow: '0 24px 60px rgba(var(--theme-rgb),0.12)' }}>
      <div style={eyebrow}>{dev ? 'Pulso de tu zona · gratis' : 'Demanda en tu zona · gratis'}</div>
      <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(20px,2.6vw,26px)', letterSpacing: -0.4, margin: '6px 0 4px' }}>
        {dev ? 'Mira qué busca la gente en tu zona' : 'Mira cuántos compradores buscan en tu zona'}
      </h3>
      <p style={{ fontSize: 13.5, color: 'var(--cream-2)', margin: '0 0 18px', lineHeight: 1.55 }}>
        {dev ? 'Pon tu zona y tu proyecto. Te damos una muestra real — sin costo.' : 'Pon la zona donde trabajas. Te damos una muestra real de la demanda — sin costo.'}
      </p>

      {/* ── Inputs ── */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setColonia(null); }} placeholder="Escribe tu colonia o zona…" style={inp} data-testid="pulso-colonia" />
        {sug.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--card-border)', borderRadius: 12, zIndex: 20, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.12)' }}>
            {sug.map((c) => (
              <button key={c.id} onClick={() => { setColonia({ id: c.id, name: c.name }); setQ(c.name); setSug([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream)' }}>
                {c.name} {c.alcaldia ? <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>· {c.alcaldia}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
      {dev && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['departamento', 'Departamento'], ['casa', 'Casa']].map(([k, l]) => (
              <button key={k} onClick={() => setTipo(k)} style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, border: tipo === k ? '1px solid var(--theme)' : '1px solid var(--card-border)', background: tipo === k ? 'rgba(var(--theme-rgb),0.1)' : '#fff', color: tipo === k ? 'var(--theme)' : 'var(--cream-2)' }}>{l}</button>
            ))}
          </div>
          <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio desde (ej. 4000000)" inputMode="numeric" style={{ ...inp, flex: 1, minWidth: 160 }} />
        </div>
      )}
      <button onClick={verPulso} disabled={loading} data-testid="pulso-ver" style={{ width: '100%', padding: '13px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}>
        {loading ? 'Leyendo tu zona…' : (dev ? 'Ver el pulso de mi zona →' : 'Ver la demanda de mi zona →')}
      </button>
      {err && !pulso && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--red, #DC2626)', marginTop: 8 }}>{err}</div>}

      {/* ── Resultado (muestra real) + gate de registro ── */}
      {pulso && pulso.ok && (
        <div data-testid="pulso-result" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--card-border)' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, marginBottom: 12 }}>{pulso.colonia}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
            {(pulso.visible || []).map((x, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 12, background: '#fff', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(18px,3vw,24px)', color: 'var(--theme)' }}>{fmtVal(x.v, x.fmt)}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-2)', marginTop: 3, lineHeight: 1.35 }}>{x.k}</div>
              </div>
            ))}
          </div>
          {/* dato concreto extra (solo si hay oferta) — precio/m² de mercado de los desarrollos reales de la zona */}
          {pulso.precio_m2 != null && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <span style={chip}>🏷️ Precio/m² de mercado: <b style={{ color: 'var(--cream)' }}>${Number(pulso.precio_m2).toLocaleString('es-MX')}/m²</b></span>
            </div>
          )}

          {sent ? (
            <div style={{ padding: '18px 16px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: 26, marginBottom: 4 }}>✓</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: '#059669' }}>¡Listo!</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>Te enviaremos el reporte completo de {pulso.colonia} en breve.</div>
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: 14, background: 'rgba(var(--theme-rgb),0.05)', border: '1px dashed rgba(var(--theme-rgb),0.3)' }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', marginBottom: 8 }}>🔓 Desbloquea gratis el reporte completo de tu zona:</div>
              <div style={{ display: 'grid', gap: 5, marginBottom: 14 }}>
                {(pulso.locked || []).map((l, i) => (
                  <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', display: 'flex', gap: 7 }}><span style={{ opacity: 0.5 }}>🔒</span> {l}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Tu nombre" style={inp} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" style={{ ...inp, flex: 1, minWidth: 140 }} data-testid="pulso-email" />
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="WhatsApp" inputMode="tel" style={{ ...inp, flex: 1, minWidth: 140 }} />
                </div>
                <button onClick={registrar} disabled={sending} data-testid="pulso-registrar" style={{ padding: '13px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: sending ? 'wait' : 'pointer' }}>
                  {sending ? 'Enviando…' : 'Desbloquear mi reporte completo →'}
                </button>
                {err && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--red, #DC2626)' }}>{err}</div>}
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textAlign: 'center' }}>{pulso.nota}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const chip = { fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.2)', color: 'var(--cream-2)' };
