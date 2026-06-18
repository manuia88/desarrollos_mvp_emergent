// Mis Favoritos — la cara pública del "link tipo Tinder" del asesor (2026-06-18).
// El comprador ve lo que guardó, lo quita, agenda una visita o deja una nota. Al agendar/registrarse, todo cae al
// tablero de su asesor (Ficha360) → las dos caras enteradas. Identidad = visitor_id (localStorage).
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../components/ui';
import { visitorId } from '../lib/buyerSignal';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Favoritos() {
  const [favoritos, setFavoritos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(null);   // { devId, kind: 'cita'|'nota' }
  const vid = visitorId();
  const leadId = (() => { try { return localStorage.getItem('dmx_lead_id') || null; } catch { return null; } })();

  const load = useCallback(() => {
    fetch(`${API}/api/buyer/favoritos?visitor_id=${vid}`)
      .then((r) => r.json()).then((d) => setFavoritos(d?.favoritos || [])).catch(() => {}).finally(() => setLoading(false));
  }, [vid]);

  useEffect(() => {
    document.body.classList.add('public-light');
    load();
    return () => document.body.classList.remove('public-light');
  }, [load]);

  const quitar = async (devId) => {
    setFavoritos((f) => f.filter((x) => x.dev_id !== devId));
    try { await fetch(`${API}/api/buyer/favoritos/quitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: vid, dev_id: devId }) }); } catch { /* noop */ }
  };

  return (
    <LightScope>
      <PublicNav />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 24px 60px' }}>
        <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 6 }}>♥ Tu selección</div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,36px)', color: 'var(--cream)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>
          Mis favoritos
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-3)', margin: '0 0 28px', maxWidth: 620 }}>
          Lo que guardaste, en un solo lugar. Agenda una visita o deja una nota — tu asesor se entera de todo.
        </p>

        {loading && <div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>Cargando…</div>}

        {!loading && favoritos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 18, background: 'var(--surface-card)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏠</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 6 }}>Aún no guardas nada</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', marginBottom: 18 }}>Dale ♥ a los desarrollos que te gusten y aparecerán aquí.</div>
            <Link to="/marketplace" className="btn btn-primary" style={{ textDecoration: 'none' }}>Explorar desarrollos</Link>
          </div>
        )}

        {!loading && favoritos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {favoritos.map((f) => (
              <div key={f.dev_id} className="dmx-card" data-testid={`fav-${f.dev_id}`}
                style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <Link to={`/desarrollo/${f.dev_id}`} style={{ display: 'block', position: 'relative', height: 168, background: '#e9e9ee' }}>
                  {f.photo && <img src={f.photo} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {f.cita && <span style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 9999, background: 'var(--theme)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11 }}>📅 Visita pedida</span>}
                </Link>
                <div style={{ padding: 15, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{f.name}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 2 }}>{f.colonia}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--theme)', marginTop: 8 }}>{f.price_from_display}</div>
                  {f.nota && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.06)', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>📝 {f.nota}</div>}

                  {openForm?.devId === f.dev_id
                    ? <InlineForm kind={openForm.kind} devId={f.dev_id} vid={vid} leadId={leadId} onDone={() => { setOpenForm(null); load(); }} onCancel={() => setOpenForm(null)} />
                    : (
                      <div style={{ display: 'flex', gap: 7, marginTop: 'auto', paddingTop: 13, flexWrap: 'wrap' }}>
                        <button onClick={() => setOpenForm({ devId: f.dev_id, kind: 'cita' })} data-testid={`fav-cita-${f.dev_id}`} className="btn btn-primary" style={{ flex: 1, fontSize: 12.5, padding: '8px 10px' }}>📅 Agendar visita</button>
                        <button onClick={() => setOpenForm({ devId: f.dev_id, kind: 'nota' })} className="btn btn-glass" style={{ fontSize: 12.5, padding: '8px 11px' }}>📝 Nota</button>
                        <button onClick={() => quitar(f.dev_id)} data-testid={`fav-quitar-${f.dev_id}`} title="Quitar de favoritos" className="btn btn-glass" style={{ fontSize: 12.5, padding: '8px 11px' }}>✕</button>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </LightScope>
  );
}

// Formulario inline: nota (texto) o cita (cuándo + datos si aún no es lead). Al agendar registra el lead → asesor.
function InlineForm({ kind, devId, vid, leadId, onDone, onCancel }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const inStyle = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', outline: 'none', boxSizing: 'border-box', marginBottom: 7 };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === 'nota') {
        await fetch(`${API}/api/buyer/favoritos/nota`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: vid, dev_id: devId, text, lead_id: leadId }) });
      } else {
        let lid = leadId;
        if (!lid && name && phone) {
          const r = await fetch(`${API}/api/buyer/registrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: vid, name, phone, dev_id: devId, source: 'favoritos_cita' }) }).then((x) => x.json()).catch(() => null);
          if (r?.lead_id) { lid = r.lead_id; try { localStorage.setItem('dmx_lead_id', lid); } catch { /* noop */ } }
        }
        await fetch(`${API}/api/buyer/favoritos/cita`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: vid, dev_id: devId, when: text || 'Cuando se pueda', lead_id: lid }) });
      }
      onDone();
    } catch { onDone(); } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 'auto', paddingTop: 13 }}>
      {kind === 'nota'
        ? <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tu nota (ej. me encanta pero le falta luz)…" rows={2} style={{ ...inStyle, resize: 'vertical' }} />
        : (
          <>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Cuándo te queda? (ej. sábado 11am)" style={inStyle} />
            {!leadId && (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inStyle} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" style={inStyle} />
              </>
            )}
          </>
        )}
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={submit} disabled={busy || (kind === 'cita' && !leadId && (!name || !phone))} className="btn btn-primary" style={{ flex: 1, fontSize: 12.5, padding: '8px 10px' }}>{busy ? '…' : (kind === 'nota' ? 'Guardar nota' : 'Pedir visita')}</button>
        <button onClick={onCancel} className="btn btn-glass" style={{ fontSize: 12.5, padding: '8px 11px' }}>Cancelar</button>
      </div>
    </div>
  );
}
