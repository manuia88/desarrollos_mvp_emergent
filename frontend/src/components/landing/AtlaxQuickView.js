// AtlaxQuickView — vista rápida DENTRO de Atlax: el cliente ve fotos + datos + "¿es buena compra?" SIN salir del chat
// (no lo expulsamos del LLM). Reusa el motor de buy-signal (AVM + plusvalía SHF + momento de ciclo) para PERSUADIR con
// datos reales. "Ver Ficha Completa" sí navega — pero el chat de Atlax se conserva (sessionStorage en AtlaxSurface).
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBuySignal } from '../../api/marketplace';
import { tc } from '../../lib/titleCase';
import { toggleSave, isSaved, dismiss, logPhotoDwell, logPhotoZoom, REJECT_REASONS } from '../../lib/atlaxPrefs';
import { Sparkle, X, Heart } from '../icons';

const HEAD = "'Outfit',sans-serif";
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const fmtM = (n) => (n == null ? '—' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));
const range = (r, suf = '') => (Array.isArray(r) && r.length ? (r[0] === r[1] ? `${r[0]}${suf}` : `${r[0]}–${r[1]}${suf}`) : null);
// "¿Cuánto al mes?" — estimado estándar (enganche 20% · 20 años · tasa ~10.5%). El real depende del banco/perfil.
const mensualidadEstim = (price) => { if (!price || price < 200000) return null; const credito = price * 0.8, rm = 0.105 / 12, n = 240; return Math.round(credito * rm / (1 - Math.pow(1 + rm, -n))); };
const TONE = { verde: { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.30)', fg: '#0F9D6E' }, ambar: { bg: 'rgba(224,163,62,0.10)', bd: 'rgba(224,163,62,0.30)', fg: '#B9822E' }, rojo: { bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.28)', fg: '#DC4D4D' } };
const AMEN = { roof: 'Roof Garden', gym: 'Gym', alberca: 'Alberca', pet: 'Pet Friendly', cowork: 'Coworking', bicicletas: 'Biciestacionamiento', seguridad: 'Seguridad 24h', jardines: 'Áreas Verdes' };

export default function AtlaxQuickView({ list, start = 0, dev: devProp, onClose, onAdvisor }) {
  const items = (list && list.length) ? list : (devProp ? [devProp] : []);
  const [idx, setIdx] = useState(start);
  const dev = items[Math.min(idx, Math.max(0, items.length - 1))] || null;
  const [i, setI] = useState(0);
  const [buy, setBuy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);   // mostrando los motivos del 👎 (el porqué del NO)
  useEffect(() => {
    let alive = true; setI(0); setBuy(null); setLoading(true); setAsking(false);
    setSaved(isSaved(dev && dev.id));
    if (dev && dev.id) {
      fetchBuySignal(dev.id).then((b) => { if (alive) { setBuy(b && b.ok ? b : null); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    } else setLoading(false);
    return () => { alive = false; };
  }, [dev]);
  // Engagement por FOTO: tiempo en cada foto (dwell) → inferimos si la imagen vende o mata (sin IA-juez).
  const shownAt = useRef(0);
  useEffect(() => { shownAt.current = Date.now(); return () => { if (shownAt.current && dev) logPhotoDwell(dev, i, Date.now() - shownAt.current); }; }, [i, dev]);
  if (!dev) return null;
  const hasNav = items.length > 1;
  const go = (delta) => setIdx((x) => Math.max(0, Math.min(items.length - 1, x + delta)));
  const onLike = () => { const on = toggleSave(dev); setSaved(on); if (on && hasNav && idx < items.length - 1) setTimeout(() => go(1), 280); };
  const onReason = (key) => { dismiss(dev, key); setAsking(false); if (hasNav && idx < items.length - 1) go(1); else onClose(); };

  const photos = (dev.photos || []).filter(Boolean);
  const weakImg = photos.length < 2;   // image-health: framing honesto para que la imagen no mate un buen match
  const ver = buy && buy.veredicto;
  const pos = buy && buy.precio_contexto && buy.precio_contexto.posicion;
  const plus = buy && buy.valuacion_zona && buy.valuacion_zona.plusvalia_oficial;
  const timing = buy && buy.timing;
  const t = ver && TONE[ver.color] ? TONE[ver.color] : TONE.verde;
  const amen = (dev.amenities || []).map((a) => AMEN[a] || tc(String(a))).slice(0, 6);
  const url = `/desarrollo/${dev.id}?from=atlax`;

  const Spec = ({ k, v }) => (v ? (
    <div style={{ flex: '1 1 0', minWidth: 64, textAlign: 'center', padding: '8px 6px', background: 'var(--surface-card)', borderRadius: 10, border: '1px solid var(--card-border)' }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>{v}</div>
      <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 1 }}>{k}</div>
    </div>
  ) : null);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1800, background: 'rgba(20,18,30,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="theme-light-scope" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, border: '1px solid var(--card-border)', boxShadow: '0 30px 80px rgba(20,18,30,0.4)' }}>
        {/* Galería */}
        <div style={{ position: 'relative' }}>
          <div onClick={() => logPhotoZoom(dev, i)} style={{ height: 250, background: 'var(--surface-card)', borderRadius: '22px 22px 0 0', overflow: 'hidden', cursor: 'zoom-in' }}>
            {photos[i] && <img src={photos[i]} alt={dev.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.92)', color: '#1E2230', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}><X size={18} /></button>
          {dev.stage === 'preventa' && <span style={{ position: 'absolute', top: 12, left: 12, background: GRAD, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 11.5, padding: '5px 11px', borderRadius: 999 }}>Preventa</span>}
          {hasNav && (
            <>
              <button onClick={() => go(-1)} disabled={idx === 0} aria-label="Anterior" style={{ position: 'absolute', left: 10, top: 105, width: 38, height: 38, borderRadius: 999, border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.35 : 1, background: 'rgba(255,255,255,0.94)', color: '#1E2230', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', fontSize: 20, fontWeight: 800, lineHeight: 1 }}>‹</button>
              <button onClick={() => go(1)} disabled={idx === items.length - 1} aria-label="Siguiente" style={{ position: 'absolute', right: 10, top: 105, width: 38, height: 38, borderRadius: 999, border: 'none', cursor: idx === items.length - 1 ? 'default' : 'pointer', opacity: idx === items.length - 1 ? 0.35 : 1, background: 'rgba(255,255,255,0.94)', color: '#1E2230', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', fontSize: 20, fontWeight: 800, lineHeight: 1 }}>›</button>
              <span style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,18,30,0.7)', color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 11, padding: '3px 11px', borderRadius: 999 }}>{idx + 1} de {items.length}</span>
            </>
          )}
          {photos.length > 1 && (
            <div style={{ display: 'flex', gap: 6, padding: '8px 14px 0', flexWrap: 'wrap' }}>
              {photos.slice(0, 6).map((p, k) => (
                <button key={k} onClick={() => setI(k)} style={{ width: 46, height: 36, borderRadius: 7, overflow: 'hidden', padding: 0, cursor: 'pointer', border: `2px solid ${k === i ? 'var(--theme)' : 'transparent'}`, background: 'var(--surface-card)' }}>
                  <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 12, marginBottom: 6 }}><Sparkle size={13} /> Vista Rápida</div>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--cream)', margin: 0 }}>{dev.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 2 }}>{tc(dev.colonia || '')}{dev.alcaldia ? ` · ${tc(dev.alcaldia)}` : ''}</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, color: 'var(--theme)', marginTop: 8 }}>{dev.price_from_display || fmtM(dev.price_from)}{dev.price_to && dev.price_to !== dev.price_from ? <span style={{ fontSize: 13, color: 'var(--cream-3)', fontWeight: 600 }}> — {fmtM(dev.price_to)}</span> : null}</div>
          {mensualidadEstim(dev.price_from) && <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4 }}>Desde <b style={{ color: 'var(--cream)' }}>~{fmtM(mensualidadEstim(dev.price_from))}/mes</b> <span style={{ color: 'var(--cream-3)' }}>· enganche 20%, 20 años (estimado)</span></div>}
          {weakImg && <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 11, background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.18)', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>Las fotos son <b style={{ color: 'var(--cream)' }}>preliminares</b> (preventa). Júzgalo por los números — en métricas encaja muy bien con lo que buscas.</div>}

          <div style={{ display: 'flex', gap: 7, marginTop: 13 }}>
            <Spec k="Recámaras" v={range(dev.bedrooms_range)} />
            <Spec k="Baños" v={range(dev.bathrooms_range)} />
            <Spec k="m²" v={range(dev.m2_range)} />
            <Spec k="Estac." v={range(dev.parking_range)} />
          </div>

          {/* ¿Es buena compra? — motor real (AVM + plusvalía SHF + momento) */}
          <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 14, background: t.bg, border: `1px solid ${t.bd}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ver ? 6 : 0 }}>
              <Sparkle size={14} color={t.fg} />
              <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: t.fg }}>{loading ? 'Analizando si es buena compra…' : ver ? `¿Es buena compra? · ${ver.titulo}` : 'Análisis de compra'}</span>
            </div>
            {ver && <div style={{ fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>{ver.lectura}</div>}
            {!loading && (pos || plus || timing) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                {pos && <Row label="Precio" value={pos.etiqueta} />}
                {plus && <Row label="Plusvalía de la zona" value={`+${plus.plusvalia_anual_pct}% / año`} note="SHF" />}
                {timing && <Row label="Momento del mercado" value={timing.fase_label} />}
              </div>
            )}
          </div>

          {amen.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream-3)', marginBottom: 7 }}>Amenidades</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {amen.map((a) => <span key={a} style={{ fontSize: 12, color: 'var(--cream-2)', background: 'var(--surface-card)', border: '1px solid var(--card-border)', borderRadius: 999, padding: '5px 11px' }}>{a}</span>)}
              </div>
            </div>
          )}

          {/* Veredicto tipo Tinder → alimenta el GUSTO + el porqué del NO (la data privilegiada) */}
          {!asking ? (
            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
              <button onClick={() => setAsking(true)} style={{ flex: 1, cursor: 'pointer', background: 'var(--surface-card)', border: '1px solid var(--card-border)', color: 'var(--cream-2)', borderRadius: 12, padding: '11px', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5 }}>👎 No Me Gusta</button>
              <button onClick={onLike} style={{ flex: 1, cursor: 'pointer', background: saved ? 'rgba(236,72,153,0.12)' : 'rgba(var(--theme-rgb),0.10)', border: `1px solid ${saved ? 'rgba(236,72,153,0.40)' : 'rgba(var(--theme-rgb),0.28)'}`, color: saved ? '#DB2777' : 'var(--theme)', borderRadius: 12, padding: '11px', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Heart size={15} filled={saved} /> {saved ? 'Guardado' : 'Me Interesa'}</button>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--cream-2)', marginBottom: 8, fontFamily: 'DM Sans' }}>¿Qué no te convenció? <span style={{ color: 'var(--cream-3)' }}>(nos ayuda a mostrarte mejor)</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REJECT_REASONS.map((rr) => <button key={rr.key} onClick={() => onReason(rr.key)} style={{ cursor: 'pointer', background: 'var(--surface-card)', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 999, padding: '8px 13px', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600 }}>{rr.label}</button>)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
            <Link to={url} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', background: GRAD, color: '#fff', borderRadius: 999, padding: '12px', fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>Ver Ficha Completa →</Link>
            <button onClick={() => { if (onAdvisor) onAdvisor(dev); }} style={{ flexShrink: 0, cursor: 'pointer', background: '#fff', color: 'var(--cream)', border: '1px solid var(--card-border)', borderRadius: 999, padding: '12px 16px', fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>Asesor</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>{value}{note && <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 600 }}> · {note}</span>}</span>
    </div>
  );
}
