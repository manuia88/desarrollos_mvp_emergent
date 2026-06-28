// AtlaxMyList — "Mi Lista": las opciones que el cliente GUARDÓ (♥), en un solo lugar para dar SEGUIMIENTO, y de ahí
// entregarlas CALIENTES al asesor. Reusa /api/buyer/favoritos (lee los save de buyer_signals). El handoff lo hace
// AtlaxLeadModal → create_buyer_lead, que ya espeja liked_devs + gusto + favoritos al CRM del asesor (Ficha360).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { visitorId } from '../../lib/buyerSignal';
import { toggleSave } from '../../lib/atlaxPrefs';
import { tc } from '../../lib/titleCase';
import { Sparkle, X, Heart } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const HEAD = "'Outfit',sans-serif";
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const fmtM = (n) => (n == null ? '' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));

export default function AtlaxMyList({ onClose, onAdvisor }) {
  const [items, setItems] = useState(null);
  const [gusto, setGusto] = useState(null);   // "Atlax ya te conoce" — el gusto granular aprendido
  useEffect(() => {
    let alive = true;
    const vid = encodeURIComponent(visitorId());
    fetch(`${API}/api/buyer/favoritos?visitor_id=${vid}`).then((r) => r.json()).then((d) => { if (alive) setItems((d && d.favoritos) || []); }).catch(() => { if (alive) setItems([]); });
    fetch(`${API}/api/buyer/mi-gusto?visitor_id=${vid}`).then((r) => r.json()).then((d) => { if (alive) setGusto((d && d.gusto) || null); }).catch(() => { /* noop */ });
    return () => { alive = false; };
  }, []);
  const remove = (it) => { toggleSave({ id: it.dev_id, name: it.name, colonia_id: it.colonia }); setItems((prev) => (prev || []).filter((x) => x.dev_id !== it.dev_id)); };
  const n = (items || []).length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1850, background: 'rgba(20,18,30,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="theme-light-scope" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 22, border: '1px solid var(--card-border)', boxShadow: '0 30px 80px rgba(20,18,30,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13 }}><Sparkle size={15} /> Mi Lista</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', color: 'var(--cream-3)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '8px 20px 20px' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '0 0 4px' }}>Lo Que Te Interesa</h2>
          <p style={{ fontSize: 13.5, color: 'var(--cream-3)', margin: '0 0 16px' }}>Tus opciones guardadas, en un solo lugar. Un asesor les da seguimiento contigo.</p>

          {gusto && gusto.resumen && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.20)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}><Sparkle size={14} color="var(--theme)" /><span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: 'var(--theme)' }}>Atlax Ya Te Conoce</span></div>
              <div style={{ fontSize: 13.5, color: 'var(--cream)', lineHeight: 1.5 }}>{gusto.resumen.replace('Atlax ya te conoce: ', '')}</div>
              {(gusto.evita || []).length > 0 && <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>Evitas: {gusto.evita.join(', ')}</div>}
            </div>
          )}

          {items === null ? (
            <div style={{ color: 'var(--cream-3)', fontStyle: 'italic', padding: '20px 0' }}>Cargando…</div>
          ) : n === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.5 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>♡</div>
              Aún no guardas nada. Toca el <b style={{ color: '#DB2777' }}>♥</b> en las opciones que te laten y aquí las juntas.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((it) => (
                  <div key={it.dev_id} style={{ display: 'flex', gap: 11, alignItems: 'center', border: '1px solid var(--card-border)', borderRadius: 14, padding: 10, background: 'var(--surface-card)' }}>
                    <div style={{ width: 74, height: 60, flexShrink: 0, borderRadius: 9, overflow: 'hidden', background: 'var(--surface-card)' }}>
                      {it.photo && <img src={it.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>{tc(it.colonia || '')}</div>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--theme)' }}>{it.price_from_display || fmtM(it.price_from)}</div>
                    </div>
                    <Link to={`/desarrollo/${it.dev_id}?from=atlax`} style={{ flexShrink: 0, textDecoration: 'none', background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', borderRadius: 9, padding: '8px 12px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Ver</Link>
                    <button onClick={() => remove(it)} title="Quitar de mi lista" style={{ flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: '#DB2777', display: 'flex' }}><Heart size={18} filled color="#DB2777" /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => { if (onAdvisor) onAdvisor(); }} style={{ width: '100%', marginTop: 16, border: 'none', cursor: 'pointer', background: GRAD, color: '#fff', borderRadius: 999, padding: '13px', fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}>Que un Asesor Me Ayude con Mi Lista ({n})</button>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 9 }}>El asesor recibe tu lista completa y lo que te gusta — no repites nada.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
