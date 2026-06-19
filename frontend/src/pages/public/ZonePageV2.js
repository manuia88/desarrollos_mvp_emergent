// Página de Zona v2 — NARRATIVA (Hormozi/Brunson): cada dato es prueba dentro de una historia ordenada que toca los
// sueños del avatar (hogar, inversión, familia, nuevos inicios, logros, calidad de vida). Claro, formato marketplace.
// Reúsa /inversion + landing + developments + similar. Wireframe: memory/ZONA_PAGE_WIREFRAME.md
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import DevelopmentCard from '../../components/marketplace/DevelopmentCard';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const m1 = (n) => `$${(n / 1e6).toFixed(1)}M`;
const k = (n) => `$${Math.round(n / 1000).toLocaleString('es-MX')}k`;
const get = async (u) => { try { const r = await fetch(API + u); return r.ok ? await r.json() : null; } catch { return null; } };

const INK = '#16182A';
const MUT = '#5B5F76';
const cardBase = { background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.08), 0 2px 8px rgba(16,18,28,0.04)' };
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const chapTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,38px)', color: INK, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.08 };
const lead = { fontFamily: 'DM Sans', fontSize: 16, color: MUT, lineHeight: 1.6, marginTop: 12, maxWidth: 620 };
const grad = { background: 'linear-gradient(120deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

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
  const vivir = inv && inv.precio_prom && plus != null && (inv.veredicto_inversion === 'moderada' || inv.veredicto_inversion === 'baja') && plus < 6 && (inv.precio_m2 || 0) > 90000;
  // tono del avatar: invertir (default donde rinde) vs vivir (zona cara consolidada)
  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };

  // (?) tooltip helper
  const Q = ({ t }) => (<span className="tip" style={{ position: 'relative' }}><span className="tip-q" style={{ color: '#6366F1' }}>?</span><span className="tip-box">{t}</span></span>);

  return (
    <LightScope>
      <style>{`
        @keyframes zv2up { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        .zv2-up { animation: zv2up .6s cubic-bezier(.2,.8,.2,1) both }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,.42) }
        .zv2-win { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s }
        .zv2-win:hover { transform: translateY(-3px); box-shadow: 0 22px 48px rgba(99,102,241,.14) }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
        .zv2-nav a:hover { color:#6D4AFF }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 80, color: INK }}>

        {/* ───── HOOK ───── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 92%)' }}>
          <div style={{ position: 'absolute', top: -130, right: -70, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.20), rgba(124,92,255,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 30, left: -110, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.13), rgba(192,38,211,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ ...sec, position: 'relative', paddingTop: 26, paddingBottom: 38 }}>
            <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#6B6F86', textDecoration: 'none', fontWeight: 600 }}>← Volver al marketplace</Link>
            <div className="zv2-up" style={{ marginTop: 18, maxWidth: 760 }}>
              <div style={{ ...eyebrow, fontSize: 12 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''}</div>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(38px,6vw,62px)', letterSpacing: '-0.035em', color: INK, margin: '8px 0 0', lineHeight: 1.04 }}>
                {vivir ? <>{name} no es solo una dirección.<br /><span style={grad}>Es la vida que estás buscando.</span></> : <>En {name}, tu dinero <span style={grad}>no se queda quieto.</span></>}
              </h1>
              <p style={{ ...lead, fontSize: 17, marginTop: 16, maxWidth: 680 }}>
                {vivir
                  ? `Una de las zonas más buscadas de la ciudad para echar raíces: todo cerca, valor que sube parejo y la calidad de vida que querías para esta etapa. Esto es lo que ${name} te ofrece — con números, no promesas.`
                  : `Cada año vale más, y mientras tanto te paga renta. Aquí está, paso a paso y con números reales, por qué poner tu patrimonio en ${name} tiene sentido.`}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
                <a href="#empezar" className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 24px', borderRadius: 14, textDecoration: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>{vivir ? 'Ver dónde puedo vivir →' : 'Ver dónde invertir →'}</a>
                <button type="button" disabled title="Próximamente" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'not-allowed', opacity: 0.7 }}>🔔 Vigila esta zona</button>
              </div>
            </div>
          </div>
          <div className="zv2-nav" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(16,18,28,0.06)', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
            <div style={{ ...sec, display: 'flex', gap: 22, padding: '12px 24px' }}>
              {[['porque', `Por qué ${name}`], ['dinero', 'Tu dinero'], ['empezar', 'Cómo empezar'], ['desarrollos', 'Desarrollos']].map(([id, l]) => <a key={id} href={`#${id}`} style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#5B5F76', textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>)}
            </div>
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la historia de {name}…</div></section>
        ) : !inv || !inv.precio_prom ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, color: '#8A8FA6', fontFamily: 'DM Sans' }}>Aún estamos reuniendo los datos de {name}.</div></section>
        ) : (
        <>
        {/* ───── CAP 1 · POR QUÉ ───── */}
        <section id="porque" style={{ ...sec, marginTop: 56 }}>
          <div style={eyebrow}>{tc('Por qué aquí')}</div>
          <h2 style={chapTitle}>{vivir ? `Un lugar que ya valió la pena` : `Pones tu dinero donde el mercado ya apuesta`}</h2>
          <p style={lead}>
            {vivir
              ? `${name} es de las zonas más consolidadas de la ciudad. Comprar aquí es asegurar tu lugar en un barrio que la gente no deja de buscar — y eso, con el tiempo, se nota en tu patrimonio.`
              : `${name} no es una apuesta a ciegas: es una zona donde la demanda no para y los precios suben parejo. Comprar aquí es poner tu dinero del lado del mercado.`}
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
            <div className="zv2-win" style={{ ...cardBase, padding: '18px 22px', minWidth: 180 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: INK, letterSpacing: '-0.03em' }}>{k(inv.precio_m2)}<span style={{ fontSize: 16, color: '#A2A6BC', fontWeight: 700 }}>/m²</span></div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 4 }}>lo que vale el metro aquí</div>
            </div>
            <div className="zv2-win" style={{ ...cardBase, padding: '18px 22px', minWidth: 180 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: '#0E9F6E', letterSpacing: '-0.03em' }}>+{plus}%</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 4 }}>sube de valor cada año <Q t="Plusvalía: cuánto sube el precio por el mercado, no porque alguien lo decida. No incluye las rentas." /></div>
            </div>
          </div>
        </section>

        {/* ───── CAP 2 · TU DINERO TRABAJANDO (value stack ordenado) ───── */}
        <section id="dinero" style={{ ...sec, marginTop: 60 }}>
          <div style={eyebrow}>{tc('Tu dinero, trabajando')}</div>
          <h2 style={chapTitle}>Tres formas de ganar, al mismo tiempo</h2>
          <p style={lead}>Compras una vez. A partir de ahí, tu propiedad trabaja para ti de tres maneras — todas juntas, todos los años.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
            {[
              { n: 1, h: 'Sube de valor — solo.', big: `+${plus}%`, bigc: '#0E9F6E',
                copy: <>Cada año tu propiedad vale más. Un depto de {m1(inv.precio_prom)} se aprecia <b>~${Math.round((inv.plusvalia_anual_abs || 0) / 1000).toLocaleString('es-MX')}k al año</b> — sin que muevas un dedo.</> },
              { n: 2, h: 'Y te paga mientras la tienes.', big: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : '—', bigc: '#C026D3',
                copy: <>Si la rentas, te deja <b>~${(inv.renta_prom || 0).toLocaleString('es-MX')}/mes</b>. Eso es un cap rate de {inv.cap_rate_anual_pct}% <Q t="Cap rate: lo que rinde la propiedad por su renta (NOI ÷ precio), sin importar cómo la pagues. No incluye la plusvalía." /> — lo que rinde cada año solo por rentarla.</> },
              { n: 3, h: 'En 5 años, te llevas esto.', big: `+${inv.ganancia_5y_pct}%`, bigc: '#0E9F6E',
                copy: <>Si vendes a los 5 años, recuperas tu dinero <b>+ ~{m1(inv.ganancia_5y_abs)}</b> de ganancia. Tu rendimiento real, año con año: <b>{inv.tir_anual_pct}%</b> <Q t="TIR: tu rendimiento real por año, contando rentas + venta y ajustado al tiempo. Es el ROI de 5 años repartido por año." />.</> },
            ].map((w) => (
              <div key={w.n} className="zv2-win" style={{ ...cardBase, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13 }}>{w.n}</span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: INK }}>{w.h}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14.5, color: MUT, marginTop: 8, lineHeight: 1.55 }}>{w.copy}</div>
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(36px,5vw,52px)', color: w.bigc, letterSpacing: '-0.04em', lineHeight: 1 }}>{w.big}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ───── CAP 3 · CÓMO EMPEZAR (precio + crédito, maneja la objeción) ───── */}
        <section id="empezar-precio" style={{ ...sec, marginTop: 60 }}>
          <div style={eyebrow}>{tc('Cómo empezar')}</div>
          <h2 style={chapTitle}>Más alcanzable de lo que crees</h2>
          <p style={lead}>Entrar a {name} arranca desde <b style={{ color: INK }}>{m1(inv.precio_min)}</b> (el promedio anda en {m1(inv.precio_prom)}). ¿Cómo lo pagas? Con crédito — y estas son las opciones reales.</p>
          {inv.credito && inv.credito.escenarios && (
            <div style={{ ...cardBase, padding: 22, marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC' }}>sobre ~{m1(inv.credito.valor_inmueble)} · a {inv.credito.plazo_anios} años · tasa prom {inv.credito.tasa_prom_pct}%</div>
              <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 12, paddingBottom: 6, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                <span style={{ flex: '0 0 92px' }}>crédito</span><span style={{ flex: 1, textAlign: 'right' }}>te prestan</span><span style={{ flex: 1, textAlign: 'right' }}>al mes</span><span style={{ flex: 1, textAlign: 'right' }}>pagas en total</span>
              </div>
              {inv.credito.escenarios.map((e) => (
                <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                  <span style={{ flex: '0 0 92px', fontWeight: 800, color: INK }}>{e.aforo}% a crédito</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{m1(e.prestamo)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{k(e.pago)}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#C026D3' }}>{m1(e.total)}</span>
                </div>
              ))}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>Solo informativo. Va con la tasa (el CAT real, con seguros y comisiones, es mayor). Tu pago final lo define el banco según tu perfil.</div>
            </div>
          )}
        </section>

        {/* ───── CAP 4 · NO ERES EL ÚNICO (social proof) ───── */}
        {(comparables.length > 0 || similar.length > 0) && (
          <section style={{ ...sec, marginTop: 60 }}>
            <div style={eyebrow}>{tc('No eres el único')}</div>
            <h2 style={chapTitle}>La gente que sabe, está mirando aquí</h2>
            <p style={lead}>{name} compite con las zonas más buscadas de la ciudad. Si estás comparando, estas son las que valen la pena ver al lado:</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
              {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} className="zv2-zlink" style={{ textDecoration: 'none', ...cardBase, padding: '14px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))}</span>
                  <span style={{ color: '#6D4AFF', fontWeight: 800 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ───── CIERRE · EMPIEZA AQUÍ (desarrollos + CTA) ───── */}
        <section id="empezar" style={{ ...sec, marginTop: 64 }}>
          <div id="desarrollos" style={eyebrow}>{tc('Da el primer paso')}</div>
          <h2 style={chapTitle}>{vivir ? `Aquí empieza tu nueva etapa` : `Aquí empieza tu inversión`}</h2>
          <p style={{ ...lead, marginBottom: 18 }}>Estos son los desarrollos en {name} donde puedes dar el primer paso hoy.</p>
          {devs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {devs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6' }}>Aún no hay desarrollos publicados en {name}. Activa "Vigila esta zona" y te avisamos al primero.</div>
          )}
        </section>

        {/* ───── FUENTES ───── */}
        <section style={{ ...sec, marginTop: 46 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', lineHeight: 1.6, borderTop: '1px solid rgba(16,18,28,0.06)', paddingTop: 18 }}>
            Valor y rentabilidad estimados por el motor de inversión de DesarrollosMX (AVM + tasas Banxico) sobre los
            desarrollos reales de la zona. Cifras informativas, no asesoría financiera. Próximamente: cómo se vive
            (amenidades, transporte, riesgo), mercado en vivo y "pregúntale a Atlax sobre {name}".
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
