// AtlaxExperiencia — la ficha como EXPERIENCIA cinemática (no una tabla). Pilot de los módulos ATOMS portados a React
// con assets REALES del desarrollo (cero generación falsa · regla anti-alucinación):
//   1) Hero IMAGE-REVEAL: el cursor revela una 2ª foto bajo la 1ª.
//   2) WALKTHROUGH scroll-scrub: el scroll recorre las fotos del depa (o el video real si hay video_url).
//   3) CTA: me interesa / ver ficha / asesor.
// Y es SENSOR: el tiempo por foto + el avance alimentan el gusto (visitor_taste vía buyer_signals). La experiencia que
// enamora también te aprende. Degrada con gracia (si no hay fotos, manda a la ficha). Reusa fetchDevelopment + photos.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchDevelopment } from '../../api/marketplace';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { toggleSave, isSaved } from '../../lib/atlaxPrefs';
import { tc } from '../../lib/titleCase';
import { Sparkle, Heart, ArrowRight } from '../../components/icons';

const HEAD = "'Outfit',sans-serif";
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const fmtM = (n) => (n == null ? '' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));

export default function AtlaxExperiencia() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dev, setDev] = useState(null);
  const [err, setErr] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then((d) => { if (alive) { setDev(d); setSaved(isSaved(id)); try { sendBuyerSignal('view', { entity_id: id, colonia: String((d && (d.colonia_id || d.colonia)) || '').toLowerCase(), value: 'atlax_experiencia' }); } catch (_) { /* noop */ } } })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [id]);

  if (err) return <Fallback id={id} />;
  if (!dev) return <div style={{ minHeight: '100vh', background: '#0A0A0F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans' }}>Cargando experiencia…</div>;
  const photos = (dev.photos || []).filter(Boolean);
  if (photos.length < 2) return <Fallback id={id} />;   // sin assets reales suficientes → a la ficha (cero invento)

  return (
    <div style={{ background: '#0A0A0F', color: '#fff', fontFamily: 'DM Sans' }}>
      <Hero dev={dev} photos={photos} />
      <Walkthrough dev={dev} photos={photos} />
      <Cierre dev={dev} saved={saved} setSaved={setSaved} navigate={navigate} />
      <Link to={`/desarrollo/${id}`} aria-label="Cerrar" style={{ position: 'fixed', top: 16, right: 18, zIndex: 50, width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 20, fontWeight: 700 }}>×</Link>
    </div>
  );
}

// ── 1 · HERO image-reveal (cursor revela la 2ª foto bajo la 1ª) ───────────────
function Hero({ dev, photos }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: -999, y: -999, on: false });
  const move = (clientX, clientY) => {
    const r = ref.current && ref.current.getBoundingClientRect();
    if (!r) return;
    setPos({ x: clientX - r.left, y: clientY - r.top, on: true });
  };
  const mask = pos.on ? `radial-gradient(circle 150px at ${pos.x}px ${pos.y}px, transparent 0 96px, #000 168px)` : 'none';
  return (
    <section ref={ref}
      onMouseMove={(e) => move(e.clientX, e.clientY)} onMouseLeave={() => setPos((p) => ({ ...p, on: false }))}
      onTouchMove={(e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
      style={{ position: 'relative', height: '100vh', overflow: 'hidden', cursor: 'crosshair' }}>
      <img src={photos[1]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <img src={photos[0]} alt={dev.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', WebkitMaskImage: mask, maskImage: mask }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,15,0.45) 0%, transparent 30%, transparent 60%, rgba(10,10,15,0.85) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#fff', opacity: 0.85, fontSize: 13, fontWeight: 700, marginBottom: 10 }}><Sparkle size={15} /> {dev.stage === 'preventa' ? 'Preventa' : 'Disponible'} · {tc(dev.colonia || '')}</div>
        <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(34px,6vw,64px)', letterSpacing: '-0.03em', margin: 0, textShadow: '0 4px 30px rgba(0,0,0,0.5)' }}>{dev.name}</h1>
        <div style={{ marginTop: 18, fontSize: 13, opacity: 0.7 }}>Pasa el cursor para mirar dentro · baja para recorrerlo ↓</div>
      </div>
    </section>
  );
}

// ── 2 · WALKTHROUGH scroll-scrub (el scroll recorre las fotos del depa) ────────
function Walkthrough({ dev, photos }) {
  const wrapRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const shownAt = useRef(0);

  const onScroll = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    const prog = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    const next = Math.min(photos.length - 1, Math.floor(prog * photos.length));
    if (next !== idxRef.current) {
      // SENSOR: tiempo en la foto que dejamos → alimenta el gusto (qué espacio le importa).
      const dt = shownAt.current ? Date.now() - shownAt.current : 0;
      if (dt > 600) { try { sendBuyerSignal('photo_dwell', { entity_id: dev.id, value: String(idxRef.current), dwell_ms: Math.min(600000, dt) }); } catch (_) { /* noop */ } }
      shownAt.current = Date.now();
      idxRef.current = next;
      setIdx(next);
    }
  }, [dev.id, photos.length]);

  useEffect(() => {
    shownAt.current = Date.now();
    let ticking = false;
    const h = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { onScroll(); ticking = false; }); } };
    window.addEventListener('scroll', h, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', h); const dt = shownAt.current ? Date.now() - shownAt.current : 0; if (dt > 600) { try { sendBuyerSignal('photo_dwell', { entity_id: dev.id, value: String(idxRef.current), dwell_ms: Math.min(600000, dt) }); } catch (_) { /* noop */ } } };
  }, [onScroll, dev.id]);

  return (
    <section ref={wrapRef} style={{ height: `${photos.length * 100}vh`, position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        {photos.map((p, i) => (
          <img key={i} src={p} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === idx ? 1 : 0, transition: 'opacity 0.45s ease' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(10,10,15,0.8) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 28, bottom: 36, pointerEvents: 'none' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22 }}>{dev.name}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Recorrido {idx + 1} de {photos.length}</div>
        </div>
        <div style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 7, pointerEvents: 'none' }}>
          {photos.map((_, i) => <span key={i} style={{ width: 4, height: i === idx ? 22 : 12, borderRadius: 999, background: i === idx ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.3s' }} />)}
        </div>
      </div>
    </section>
  );
}

// ── 3 · CIERRE (CTA: me interesa / ficha / asesor) ────────────────────────────
function Cierre({ dev, saved, setSaved, navigate }) {
  const onLike = () => { setSaved(toggleSave(dev)); };
  const onAdvisor = () => { try { sendBuyerSignal('lead', { value: 'atlax_experiencia', entity_id: dev.id }); } catch (_) { /* noop */ } navigate(`/desarrollo/${dev.id}?from=atlax`); };
  return (
    <section style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', background: 'radial-gradient(120% 80% at 50% 0%, rgba(99,102,241,0.18), #0A0A0F 60%)' }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-0.02em' }}>{dev.name}</div>
      <div style={{ fontSize: 15, opacity: 0.8, marginTop: 6 }}>{tc(dev.colonia || '')}{dev.alcaldia ? ` · ${tc(dev.alcaldia)}` : ''}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: '#A5B4FC', marginTop: 14 }}>{dev.price_from_display || fmtM(dev.price_from)}</div>
      <div style={{ fontSize: 14, opacity: 0.85, marginTop: 18, maxWidth: 440, lineHeight: 1.5 }}>¿Te late? Guárdalo en tu lista, mira los números completos, o deja que un asesor te acompañe.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 26 }}>
        <button onClick={onLike} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: saved ? '#DB2777' : 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 999, padding: '13px 22px', fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}><Heart size={16} filled={saved} color="#fff" /> {saved ? 'Guardado' : 'Me Interesa'}</button>
        <Link to={`/desarrollo/${dev.id}?from=atlax`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', borderRadius: 999, padding: '13px 22px', fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}>Ver Los Números <ArrowRight size={15} /></Link>
        <button onClick={onAdvisor} style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.22)', background: 'transparent', color: '#fff', borderRadius: 999, padding: '13px 22px', fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}>Hablar con un Asesor</button>
      </div>
    </section>
  );
}

function Fallback({ id }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(`/desarrollo/${id}`, { replace: true }); }, [id, navigate]);
  return null;
}
