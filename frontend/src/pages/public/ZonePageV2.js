// Página de Zona v2 — rebuild PREMIUM, formato marketplace claro. Hero ambiental + stats grandes + nav sticky +
// métricas como tarjetas + profundidad + micro-interacciones. Reúsa /inversion + /pulso + landing + developments.
// Wireframe: memory/ZONA_PAGE_WIREFRAME.md · Arsenal: memory/ZONA_PAGE_ARSENAL.md
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import DevelopmentCard from '../../components/marketplace/DevelopmentCard';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const m1 = (n) => `$${(n / 1e6).toFixed(1)}M`;
const kfmt = (n) => `$${Math.round(n / 1000).toLocaleString('es-MX')}k`;
const get = async (u) => { try { const r = await fetch(API + u); return r.ok ? await r.json() : null; } catch { return null; } };

const INK = '#16182A';
const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.09), 0 2px 8px rgba(16,18,28,0.04)' };
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const h2 = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: INK, letterSpacing: '-0.02em', margin: '6px 0 0' };

function Chip({ children, c = '99,102,241' }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: `rgb(${c})`, background: `rgba(${c},0.09)`, border: `1px solid rgba(${c},0.22)`, borderRadius: 9999, padding: '6px 14px' }}>{children}</span>;
}

export default function ZonePageV2() {
  const { slug } = useParams();
  const [inv, setInv] = useState(null);
  const [landing, setLanding] = useState(null);
  const [devs, setDevs] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      get(`/api/zona/${slug}/inversion`),
      get(`/api/public/landing/colonia/${slug}`),
      get(`/api/developments?colonia=${slug}&limit=12`),
      get(`/api/colonias-similar/${slug}`),
    ]).then(([i, l, d, s]) => {
      if (!alive) return;
      setInv(i); setLanding(l);
      setDevs(Array.isArray(d) ? d : []);
      setSimilar((s && Array.isArray(s.similar)) ? s.similar : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

  const name = (landing && landing.name) || tc((slug || '').replace(/-/g, ' '));
  const alcaldia = landing && landing.alcaldia;
  const tier = landing && landing.tier;
  const comparables = (landing && landing.comparable_zones) || [];
  const plus = inv && inv.plusvalia_anual_pct;

  const veredicto = (() => {
    if (!inv || !inv.precio_prom) return null;
    if (inv.veredicto_inversion === 'excelente' || inv.veredicto_inversion === 'buena')
      return { e: '🟢', l: 'Para invertir', r: `Sube de valor (~${plus}%/año) y la renta deja buen rendimiento — buen momento para entrar.` };
    if (plus >= 6) return { e: '🟢', l: 'Para invertir', r: `En alza (~${plus}%/año), todavía con espacio de entrada.` };
    return { e: '🟢', l: 'Para vivir', r: 'Zona consolidada: buena calidad de vida y valor estable.' };
  })();
  const VER = { excelente: '#0E9F6E', buena: '#16C784', moderada: '#E0A33E', baja: '#DC2626' };

  const METRICS = inv ? [
    { l: 'Renta mensual', v: inv.renta_prom ? `$${inv.renta_prom.toLocaleString('es-MX')}` : null, sub: 'bruta, al mes', c: INK,
      t: 'Lo que cobrarías al mes de renta (bruta, antes de gastos) para un depto al precio promedio de la zona.' },
    { l: 'Plusvalía anual', v: plus != null ? `+${plus}%` : null, sub: 'sube de precio/año', c: '#0E9F6E',
      t: `Cuánto sube de precio el inmueble cada año por el mercado (la demanda y el desarrollo de la zona), no porque alguien lo decida.${inv.plusvalia_anual_abs ? ` Aquí: ~${plus}% = un depto de ${m1(inv.precio_prom)} sube ~$${Math.round(inv.plusvalia_anual_abs / 1000).toLocaleString('es-MX')}k al año.` : ''} No incluye las rentas.` },
    { l: 'Cap rate anual', v: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : null, sub: 'rinde solo por rentarlo', c: '#C026D3',
      t: `Mide cuánto rinde la PROPIEDAD por su renta, sin importar cómo la pagues (no mira el crédito). Es el NOI ÷ precio. El NOI es la renta de un año menos los gastos de operarla.${inv.renta_anual ? ` Aquí: ~$${Math.round(inv.renta_anual / 1000).toLocaleString('es-MX')}k ÷ ${m1(inv.precio_prom)} = ${inv.cap_rate_anual_pct}%.` : ''} No incluye la plusvalía.` },
    { l: 'TIR anual', v: inv.tir_anual_pct != null ? `${inv.tir_anual_pct}%` : null, sub: 'rendimiento real/año', c: '#7C5CFF',
      t: `El rendimiento POR AÑO: a qué tasa anual equivale tu inversión contando las rentas de cada año y la venta al final, ajustado al tiempo. Aquí: ${inv.tir_anual_pct}% al año. Es el ROI de 5 años repartido por año.` },
    { l: 'ROI a 5 años', v: inv.ganancia_5y_pct != null ? `+${inv.ganancia_5y_pct}%` : null, sub: 'ganancia total si vendes', c: '#0E9F6E',
      t: `Tu ganancia TOTAL si lo tienes 5 años y lo vendes (renta acumulada + lo que subió de precio − costos).${inv.ganancia_5y_abs ? ` Ejemplo: pones ~${m1(inv.precio_prom)} y en 5 años ganas ~${m1(inv.ganancia_5y_abs)} → +${inv.ganancia_5y_pct}%.` : ''} Es el total del periodo, no por año (por año, ajustado al tiempo, es la TIR).` },
  ] : [];
  const cred = inv && inv.credito;

  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };
  const NAV = [['precios', 'Precios'], ['inversion', 'Inversión'], ['desarrollos', 'Desarrollos'], ['compara', 'Compara']];

  return (
    <LightScope>
      <style>{`
        @keyframes zv2up { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        .zv2-up { animation: zv2up .6s cubic-bezier(.2,.8,.2,1) both }
        .zv2-stat { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease }
        .zv2-stat:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(99,102,241,.16) }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,.42) }
        .zv2-nav a { transition: color .15s }
        .zv2-nav a:hover { color: #6D4AFF }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 70, color: INK }}>

        {/* ── HERO ambiental ── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 88%)' }}>
          <div style={{ position: 'absolute', top: -120, right: -80, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.18), rgba(124,92,255,0) 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 40, left: -100, width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.12), rgba(192,38,211,0) 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
          <div style={{ ...sec, position: 'relative', paddingTop: 28, paddingBottom: 30 }}>
            <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#6B6F86', textDecoration: 'none', fontWeight: 600 }}>← Volver al marketplace</Link>
            <div className="zv2-up" style={{ marginTop: 18 }}>
              <div style={{ ...eyebrow, fontSize: 12 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''}</div>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(40px,6.5vw,68px)', letterSpacing: '-0.035em', color: INK, margin: '4px 0 0', lineHeight: 1.02 }}>{name}</h1>
              {veredicto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 15px', borderRadius: 9999, background: 'rgba(14,159,110,0.10)', border: '1px solid rgba(14,159,110,0.28)', fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: '#0E9F6E' }}>{veredicto.e} {veredicto.l}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#4B4F66', maxWidth: 560, lineHeight: 1.5 }}>{veredicto.r}</span>
                </div>
              )}
            </div>

            {/* Stats grandes (estilo fintech) */}
            {inv && inv.precio_prom && (
              <div className="zv2-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 24, animationDelay: '.06s' }}>
                {[
                  { n: `$${Math.round(inv.precio_m2 / 1000)}k`, l: 'precio por m²', c: INK },
                  { n: plus != null ? `+${plus}%` : '—', l: 'plusvalía al año', c: '#0E9F6E' },
                  { n: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : '—', l: 'rinde de renta', c: '#C026D3' },
                  { n: inv.n_desarrollos || devs.length || 0, l: 'desarrollos activos', c: '#7C5CFF' },
                ].map((s, i) => (
                  <div key={i} className="zv2-stat" style={{ ...card, padding: '16px 18px', borderRadius: 18 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: s.c }}>{s.n}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#8A8FA6', marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
              <a href="#desarrollos" className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, textDecoration: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>Ver desarrollos →</a>
              <button type="button" disabled title="Próximamente" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'not-allowed', opacity: 0.7 }}>🔔 Vigila esta zona</button>
            </div>
          </div>

          {/* Nav sticky por secciones */}
          <div className="zv2-nav" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(16,18,28,0.06)', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
            <div style={{ ...sec, display: 'flex', gap: 22, padding: '12px 24px' }}>
              {NAV.map(([id, l]) => (
                <a key={id} href={`#${id}`} style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#5B5F76', textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 26 }}><div style={{ ...card, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la inteligencia de {name}…</div></section>
        ) : (
        <>
        {/* ── PRECIOS Y VALOR ── */}
        {inv && inv.precio_prom && (
          <section id="precios" style={{ ...sec, marginTop: 34 }}>
            <div style={eyebrow}>{tc('Precios y valor')}</div>
            <h2 style={h2}>Cuánto cuesta {name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14, marginTop: 16 }}>
              {[['Más accesible', m1(inv.precio_min)], ['Promedio', m1(inv.precio_prom)], ['Más alto', m1(inv.precio_max)], ['Por m²', `$${Math.round(inv.precio_m2 / 1000)}k`]].map(([l, v]) => (
                <div key={l} className="zv2-stat" style={{ ...card, padding: '18px 20px' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: INK }}>{v}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#8A8FA6', marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>estimado a partir de los desarrollos y el motor de valor de la zona</div>
          </section>
        )}

        {/* ── ¿BUENA INVERSIÓN? ── */}
        {inv && inv.veredicto_inversion && (
          <section id="inversion" style={{ ...sec, marginTop: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={eyebrow}>{tc('¿Buena inversión?')}</div>
                <h2 style={h2}>Qué deja invertir aquí</h2>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC', marginTop: 4 }}>sobre un depto al precio promedio (~{m1(inv.precio_prom)})</div>
              </div>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: VER[inv.veredicto_inversion], background: `${VER[inv.veredicto_inversion]}14`, border: `1px solid ${VER[inv.veredicto_inversion]}38`, borderRadius: 9999, padding: '7px 16px' }}>{tc(inv.veredicto_inversion)} inversión</span>
            </div>
            {/* métricas como tarjetas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginTop: 18 }}>
              {METRICS.filter((r) => r.v != null).map((r) => (
                <div key={r.l} className="tip zv2-stat" style={{ ...card, position: 'relative', padding: '17px 19px', cursor: 'help' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{tc(r.l)}<span className="tip-q" style={{ color: '#6366F1' }}>?</span></div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: r.c, marginTop: 5 }}>{r.v}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 2 }}>{r.sub}</div>
                  <span className="tip-box">{r.t}</span>
                </div>
              ))}
            </div>
            {/* Crédito */}
            {cred && cred.escenarios && (
              <div style={{ ...card, padding: 22, marginTop: 16 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: INK }}>🏦 {tc('Crédito hipotecario')}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC', marginTop: 4 }}>sobre ~{m1(cred.valor_inmueble)} · a {cred.plazo_anios} años · tasa prom {cred.tasa_prom_pct}%</div>
                <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 12, paddingBottom: 6, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                  <span style={{ flex: '0 0 90px' }}>crédito</span><span style={{ flex: 1, textAlign: 'right' }}>te prestan</span><span style={{ flex: 1, textAlign: 'right' }}>al mes</span><span style={{ flex: 1, textAlign: 'right' }}>pagas en total</span>
                </div>
                {cred.escenarios.map((e) => (
                  <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                    <span style={{ flex: '0 0 90px', fontWeight: 800, color: INK }}>{e.aforo}% a crédito</span>
                    <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{m1(e.prestamo)}</span>
                    <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{kfmt(e.pago)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#C026D3' }}>{m1(e.total)}</span>
                  </div>
                ))}
                <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>Solo informativo. Va con la tasa (el CAT real, con seguros y comisiones, es mayor). Tu pago final lo define el banco según tu perfil.</div>
              </div>
            )}
          </section>
        )}

        {/* ── DESARROLLOS ── */}
        <section id="desarrollos" style={{ ...sec, marginTop: 44 }}>
          <div style={eyebrow}>{tc('Oferta')}</div>
          <h2 style={{ ...h2, marginBottom: 16 }}>Desarrollos en {name}</h2>
          {devs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {devs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...card, fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6' }}>Aún no hay desarrollos publicados en esta zona.</div>
          )}
        </section>

        {/* ── COMPARA ── */}
        {(comparables.length > 0 || similar.length > 0) && (
          <section id="compara" style={{ ...sec, marginTop: 44 }}>
            <div style={eyebrow}>{tc('Compara')}</div>
            <h2 style={{ ...h2, marginBottom: 16 }}>Zonas parecidas a {name}</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} className="zv2-zlink" style={{ textDecoration: 'none', ...card, padding: '14px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))}</span>
                  <span style={{ color: '#6D4AFF', fontWeight: 800 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── FUENTES ── */}
        <section style={{ ...sec, marginTop: 44 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', lineHeight: 1.6, borderTop: '1px solid rgba(16,18,28,0.06)', paddingTop: 18 }}>
            Datos de DesarrollosMX: valor y rentabilidad estimados por el motor de inversión (AVM + tasas Banxico),
            precios de los desarrollos reales de la zona. Cifras informativas, no asesoría financiera. Próximamente:
            cómo se vive (amenidades, transporte, riesgo), mercado en vivo y "pregúntale a Atlax sobre esta zona".
          </div>
        </section>
        </>
        )}
      </div>
      <AtlaxBubble theme="light" />
      <Footer />
    </LightScope>
  );
}
