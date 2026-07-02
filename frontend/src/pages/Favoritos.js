// Mis Favoritos — la cara pública del "link tipo Tinder" del asesor (2026-06-18).
// Reusa la MISMA tarjeta del marketplace (DevelopmentCard) → diseño idéntico. Bajo cada tarjeta: Agendar visita /
// Nota / Quitar. Al agendar/registrarse, todo cae al tablero del asesor (Ficha360). Identidad = visitor_id.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../components/ui';
import DevelopmentCard from '../components/marketplace/DevelopmentCard';
import { fetchDevelopments, isFavorite, toggleFavorite } from '../api/marketplace';
import { visitorId } from '../lib/buyerSignal';
import { tc } from '../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Favoritos() {
  const [favMeta, setFavMeta] = useState([]);      // [{dev_id, cita, nota, status}]
  const [allDevs, setAllDevs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(null);  // { devId, kind }
  const [tab, setTab] = useState('todos');          // todos | cita | nota
  const vid = visitorId();
  const leadId = (() => { try { return localStorage.getItem('dmx_lead_id') || null; } catch { return null; } })();

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API}/api/buyer/favoritos?visitor_id=${vid}`).then((r) => r.json()).catch(() => ({ favoritos: [] })),
      fetchDevelopments({}).catch(() => ({ developments: [] })),
    ]).then(([fav, devsResp]) => {
      setFavMeta(fav?.favoritos || []);
      const devs = Array.isArray(devsResp) ? devsResp : (devsResp?.developments || devsResp?.items || []);
      setAllDevs(devs);
    }).finally(() => setLoading(false));
  }, [vid]);

  useEffect(() => {
    document.body.classList.add('public-light');
    load();
    return () => document.body.classList.remove('public-light');
  }, [load]);

  // Une cada favorito (id + cita/nota) con su desarrollo COMPLETO del marketplace → tarjeta idéntica.
  const items = useMemo(() => {
    const byId = new Map(allDevs.map((d) => [d.id, d]));
    return favMeta.map((f) => ({ ...f, dev: byId.get(f.dev_id) })).filter((x) => x.dev);
  }, [favMeta, allDevs]);

  const shown = items.filter((x) => tab === 'todos' || (tab === 'cita' && x.cita) || (tab === 'nota' && x.nota));
  const nCita = items.filter((x) => x.cita).length;
  const nNota = items.filter((x) => x.nota).length;

  const quitar = async (devId) => {
    setFavMeta((m) => m.filter((x) => x.dev_id !== devId));
    if (isFavorite(devId)) toggleFavorite(devId);   // sincroniza el corazón de las tarjetas + el contador del nav
    try { await fetch(`${API}/api/buyer/favoritos/quitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: vid, dev_id: devId }) }); } catch { /* noop */ }
  };

  // Función (no componente inline) → el <button> conserva su identidad entre renders y no pierde el foco al cambiar de tab.
  const tabBtn = (k, label, n) => (
    <button key={k} onClick={() => setTab(k)} data-testid={`fav-tab-${k}`}
      style={{ padding: '8px 16px', borderRadius: 9999, border: '1px solid ' + (tab === k ? 'var(--theme)' : 'var(--border)'), background: tab === k ? 'var(--theme)' : '#fff', color: tab === k ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
      {tc(label)}{n != null && <span style={{ opacity: 0.7, marginLeft: 5 }}>{n}</span>}
    </button>
  );

  return (
    <LightScope>
      <PublicNav />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '36px 24px 60px' }}>
        <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 6 }}>{tc('♥ Tu selección')}</div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,36px)', color: 'var(--cream)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>
          {tc('Mis favoritos')}
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-3)', margin: '0 0 16px', maxWidth: 640 }}>
          Lo que guardaste, en un solo lugar. Agenda una visita o deja una nota — tu asesor se entera de todo.
        </p>
        {!loading && items.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: leadId ? 'rgba(31,160,106,0.10)' : 'rgba(var(--theme-rgb),0.07)', border: '1px solid ' + (leadId ? 'rgba(31,160,106,0.28)' : 'rgba(var(--theme-rgb),0.22)'), marginBottom: 22 }}>
            <span style={{ fontSize: 15 }}>{leadId ? '✅' : '💡'}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
              {leadId
                ? 'Estás registrado: tu asesor ve tus favoritos, visitas y notas, y te ayuda con cada uno.'
                : 'Se guardan en este equipo. Agenda una visita (con tu WhatsApp) y un asesor te contacta y te acompaña.'}
            </span>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {tabBtn('todos', 'Todos', items.length)}
            {tabBtn('cita', 'Con visita', nCita)}
            {tabBtn('nota', 'Con nota', nNota)}
          </div>
        )}

        {loading && <div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>Cargando…</div>}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 18, background: 'var(--surface-card)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏠</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 6 }}>{tc('Aún no guardas nada')}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', marginBottom: 18 }}>Dale ♥ a los desarrollos que te gusten y aparecerán aquí.</div>
            <Link to="/marketplace" className="btn btn-primary" style={{ textDecoration: 'none' }}>Explorar desarrollos</Link>
          </div>
        )}

        {!loading && items.length > 0 && shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--border)', borderRadius: 18, background: 'var(--surface-card)' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)' }}>
              {tab === 'cita' ? 'Ninguno de tus favoritos tiene visita agendada todavía.' : tab === 'nota' ? 'Ninguno de tus favoritos tiene nota todavía.' : 'Sin resultados en este filtro.'}
            </div>
            <button onClick={() => setTab('todos')} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Ver todos</button>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <div className="dev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {shown.map(({ dev, cita, nota, unidades_guardadas }, i) => (
              <div key={dev.id} data-testid={`fav-${dev.id}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {/* MISMA tarjeta del marketplace */}
                <DevelopmentCard dev={dev} index={i} />

                {/* unidades específicas guardadas (unidad como átomo) + cita / nota */}
                {((unidades_guardadas || []).length > 0 || cita || nota) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {(unidades_guardadas || []).length > 0 && (
                      <div style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.26)', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        ♥ Unidades guardadas: <b style={{ color: 'var(--cream)' }}>{unidades_guardadas.map((u) => `#${u}`).join(', ')}</b>
                      </div>
                    )}
                    {cita && <div style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.08)', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>📅 Visita: <b>{cita}</b></div>}
                    {nota && <div style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.06)', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>📝 {nota}</div>}
                  </div>
                )}

                {/* Acciones */}
                {openForm?.devId === dev.id
                  ? <InlineForm kind={openForm.kind} devId={dev.id} vid={vid} leadId={leadId} onDone={() => { setOpenForm(null); load(); }} onCancel={() => setOpenForm(null)} />
                  : (
                    <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                      <button onClick={() => setOpenForm({ devId: dev.id, kind: 'cita' })} data-testid={`fav-cita-${dev.id}`} className="btn btn-primary" style={{ flex: 1, fontSize: 12.5, padding: '9px 10px' }}>📅 Agendar visita</button>
                      <button onClick={() => setOpenForm({ devId: dev.id, kind: 'nota' })} className="btn btn-glass" style={{ fontSize: 12.5, padding: '9px 11px' }}>📝 Nota</button>
                      <button onClick={() => quitar(dev.id)} data-testid={`fav-quitar-${dev.id}`} title="Quitar de favoritos" className="btn btn-glass" style={{ fontSize: 12.5, padding: '9px 12px' }}>✕</button>
                    </div>
                  )}
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
    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-card)' }}>
      {kind === 'nota'
        ? <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tu nota (ej. me encanta pero le falta luz)…" aria-label="Tu nota" rows={2} style={{ ...inStyle, resize: 'vertical' }} />
        : (
          <>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', fontWeight: 600, marginBottom: 7 }}>Agenda tu visita {leadId ? '' : '— y te contactamos'}</div>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Cuándo te queda? (ej. sábado 11am)" aria-label="¿Cuándo te queda la visita?" style={inStyle} />
            {!leadId && (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" style={inStyle} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" aria-label="Tu WhatsApp" type="tel" inputMode="tel" style={inStyle} />
              </>
            )}
          </>
        )}
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={submit} disabled={busy || (kind === 'cita' && !leadId && (!name || !phone))} className="btn btn-primary" style={{ flex: 1, fontSize: 12.5, padding: '9px 10px' }}>{busy ? '…' : (kind === 'nota' ? 'Guardar nota' : 'Pedir visita')}</button>
        <button onClick={onCancel} className="btn btn-glass" style={{ fontSize: 12.5, padding: '9px 12px' }}>Cancelar</button>
      </div>
    </div>
  );
}
