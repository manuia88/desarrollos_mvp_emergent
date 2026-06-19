// Página de Zona v2 — rebuild PREMIUM + DISRUPTIVO (bento grid). Formato marketplace claro.
// Hero editorial + BENTO de inteligencia (veredicto ancla + métricas orbitando) + nav sticky + micro-interacciones.
// Reúsa /inversion + landing + developments + similar. Wireframe: memory/ZONA_PAGE_WIREFRAME.md
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
const eyebrow = { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const h2 = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: INK, letterSpacing: '-0.02em', margin: '6px 0 0' };
const cardBase = { background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.08), 0 2px 8px rgba(16,18,28,0.04)' };

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
      return { l: 'Para invertir', r: `Sube de valor (~${plus}%/año) y la renta deja buen rendimiento — buen momento para entrar.` };
    if (plus >= 6) return { l: 'Para invertir', r: `En alza (~${plus}%/año), todavía con espacio de entrada.` };
    return { l: 'Para vivir', r: 'Zona consolidada: buena calidad de vida y valor estable.' };
  })();
  const VER = { excelente: '#0E9F6E', buena: '#16C784', moderada: '#E0A33E', baja: '#DC2626' };

  // azulejos de métrica del bento
  const TILE = inv ? {
    precio_m2: { l: 'Precio por m²', v: inv.precio_m2 ? `$${Math.round(inv.precio_m2 / 1000)}k` : null, sub: 'valor de la zona', c: INK,
      t: 'Precio promedio del metro cuadrado en la zona, estimado con los desarrollos y el motor de valor.' },
    plusvalia: { l: 'Plusvalía anual', v: plus != null ? `+${plus}%` : null, sub: 'sube de precio/año', c: '#0E9F6E',
      t: `Cuánto sube de precio el inmueble cada año por el mercado, no porque alguien lo decida.${inv.plusvalia_anual_abs ? ` Aquí: ~${plus}% = un depto de ${m1(inv.precio_prom)} sube ~$${Math.round(inv.plusvalia_anual_abs / 1000).toLocaleString('es-MX')}k al año.` : ''} No incluye las rentas.` },
    renta: { l: 'Renta mensual', v: inv.renta_prom ? `$${(inv.renta_prom / 1000).toFixed(1)}k` : null, sub: 'bruta, al mes', c: INK,
      t: `Lo que cobrarías al mes de renta (bruta, antes de gastos) para un depto al precio promedio.${inv.renta_prom ? ` Aquí ~$${inv.renta_prom.toLocaleString('es-MX')}.` : ''}` },
    cap: { l: 'Cap rate', v: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : null, sub: 'rinde solo por rentarlo', c: '#C026D3',
      t: `Cuánto rinde la PROPIEDAD por su renta, sin importar cómo la pagues (no mira el crédito). NOI ÷ precio.${inv.renta_anual ? ` Aquí: ~$${Math.round(inv.renta_anual / 1000).toLocaleString('es-MX')}k ÷ ${m1(inv.precio_prom)} = ${inv.cap_rate_anual_pct}%.` : ''} No incluye la plusvalía.` },
    tir: { l: 'TIR anual', v: inv.tir_anual_pct != null ? `${inv.tir_anual_pct}%` : null, sub: 'rendimiento real/año', c: '#7C5CFF',
      t: `El rendimiento POR AÑO: a qué tasa anual equivale tu inversión contando rentas + venta, ajustado al tiempo. Aquí ${inv.tir_anual_pct}% al año. Es el ROI de 5 años repartido por año.` },
    roi: { l: 'ROI a 5 años', v: inv.ganancia_5y_pct != null ? `+${inv.ganancia_5y_pct}%` : null, sub: 'ganancia total si vendes', c: '#0E9F6E',
      t: `Tu ganancia TOTAL si lo tienes 5 años y lo vendes.${inv.ganancia_5y_abs ? ` Ejemplo: pones ~${m1(inv.precio_prom)} y ganas ~${m1(inv.ganancia_5y_abs)} → +${inv.ganancia_5y_pct}%.` : ''} Es el total del periodo, no por año (por año es la TIR).` },
  } : {};
  const cred = inv && inv.credito;

  const sec = { maxWidth: 1100, margin: '0 auto', padding: '0 24px' };
  const NAV = [['bento', 'Inteligencia'], ['desarrollos', 'Desarrollos'], ['compara', 'Compara']];

  // azulejo reutilizable
  const MetricTile = ({ k, big }) => {
    const t = TILE[k]; if (!t || t.v == null) return null;
    return (
      <div className={`tip zv2-tile zv2-stat${big ? ' zv2-wide' : ''}`} style={{ ...cardBase, position: 'relative', padding: '18px 20px', cursor: 'help' }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{tc(t.l)}<span className="tip-q" style={{ color: '#6366F1' }}>?</span></div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: big ? 38 : 31, letterSpacing: '-0.03em', color: t.c, marginTop: 6, lineHeight: 1 }}>{t.v}</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 5 }}>{t.sub}</div>
        <span className="tip-box">{t.t}</span>
      </div>
    );
  };

  return (
    <LightScope>
      <style>{`
        @keyframes zv2up { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        .zv2-up { animation: zv2up .6s cubic-bezier(.2,.8,.2,1) both }
        .zv2-stat { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease }
        .zv2-stat:hover { transform: translateY(-4px); box-shadow: 0 22px 48px rgba(99,102,241,.16) }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,.42) }
        .zv2-nav a:hover { color: #6D4AFF }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
        .zv2-bento { display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; }
        .zv2-verdict { grid-column: span 2; grid-row: span 2; }
        .zv2-wide { grid-column: span 2; }
        .zv2-full { grid-column: 1 / -1; }
        @media (max-width: 860px){ .zv2-bento{ grid-template-columns: repeat(2,1fr) } .zv2-verdict{ grid-column: 1 / -1; grid-row:auto } }
        @media (max-width: 480px){ .zv2-bento{ grid-template-columns: 1fr } .zv2-verdict,.zv2-wide{ grid-column:1/-1 } }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 70, color: INK }}>

        {/* ── HERO editorial ── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 92%)' }}>
          <div style={{ position: 'absolute', top: -130, right: -70, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.20), rgba(124,92,255,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 30, left: -110, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.13), rgba(192,38,211,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ ...sec, position: 'relative', paddingTop: 26, paddingBottom: 28 }}>
            <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#6B6F86', textDecoration: 'none', fontWeight: 600 }}>← Volver al marketplace</Link>
            <div className="zv2-up" style={{ marginTop: 16 }}>
              <div style={{ ...eyebrow, fontSize: 12 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''}</div>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(42px,7vw,72px)', letterSpacing: '-0.035em', color: INK, margin: '4px 0 0', lineHeight: 1.0 }}>{name}</h1>
              {veredicto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 15px', borderRadius: 9999, background: 'rgba(14,159,110,0.10)', border: '1px solid rgba(14,159,110,0.28)', fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: '#0E9F6E' }}>🟢 {veredicto.l}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#4B4F66', maxWidth: 580, lineHeight: 1.5 }}>{veredicto.r}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                <a href="#desarrollos" className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, textDecoration: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>Ver desarrollos →</a>
                <button type="button" disabled title="Próximamente" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'not-allowed', opacity: 0.7 }}>🔔 Vigila esta zona</button>
              </div>
            </div>
          </div>
          <div className="zv2-nav" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(16,18,28,0.06)', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
            <div style={{ ...sec, display: 'flex', gap: 22, padding: '12px 24px' }}>
              {NAV.map(([id, l]) => <a key={id} href={`#${id}`} style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#5B5F76', textDecoration: 'none' }}>{l}</a>)}
            </div>
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 26 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la inteligencia de {name}…</div></section>
        ) : (
        <>
        {/* ── BENTO de inteligencia ── */}
        {inv && inv.precio_prom && (
          <section id="bento" style={{ ...sec, marginTop: 34 }}>
            <div style={eyebrow}>{tc('La inteligencia de la zona')}</div>
            <h2 style={{ ...h2, marginBottom: 18 }}>Todo para decidir, de un vistazo</h2>
            <div className="zv2-bento zv2-up">
              {/* TILE ANCLA · veredicto de inversión */}
              <div className="zv2-tile zv2-verdict zv2-stat" style={{ ...cardBase, padding: '24px 26px', background: 'linear-gradient(150deg, #ffffff 60%, rgba(124,92,255,0.07))', display: 'flex', flexDirection: 'column' }}>
                <div style={eyebrow}>{tc('El veredicto')}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(30px,4vw,42px)', letterSpacing: '-0.03em', lineHeight: 1.02, marginTop: 8, background: 'linear-gradient(120deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{veredicto ? veredicto.l : '—'}</div>
                {inv.veredicto_inversion && <div style={{ marginTop: 10 }}><span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: VER[inv.veredicto_inversion], background: `${VER[inv.veredicto_inversion]}14`, border: `1px solid ${VER[inv.veredicto_inversion]}38`, borderRadius: 9999, padding: '5px 14px' }}>{tc(inv.veredicto_inversion)} inversión</span></div>}
                <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: '#4B4F66', marginTop: 12, lineHeight: 1.55, flex: 1 }}>{veredicto && veredicto.r}</div>
                {inv.ganancia_5y_abs && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(16,18,28,0.08)' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#8A8FA6' }}>Si compras (~{m1(inv.precio_prom)}) y vendes en 5 años</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: '#0E9F6E', marginTop: 2 }}>ganarías ~{m1(inv.ganancia_5y_abs)} <span style={{ fontSize: 18, color: '#16C784' }}>(+{inv.ganancia_5y_pct}%)</span></div>
                  </div>
                )}
              </div>
              {/* métricas orbitando */}
              <MetricTile k="precio_m2" />
              <MetricTile k="plusvalia" />
              <MetricTile k="renta" />
              <MetricTile k="cap" />
              {/* rango de precios (ancho) */}
              <div className="zv2-tile zv2-wide zv2-stat" style={{ ...cardBase, padding: '18px 20px' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{tc('Rango de precios')}</div>
                <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
                  {[['Desde', inv.precio_min], ['Promedio', inv.precio_prom], ['Hasta', inv.precio_max]].map(([l, v]) => (
                    <div key={l}><div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>{m1(v)}</div><div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 1 }}>{l}</div></div>
                  ))}
                </div>
              </div>
              <MetricTile k="tir" />
              <MetricTile k="roi" />
              {/* crédito (full) */}
              {cred && cred.escenarios && (
                <div className="zv2-tile zv2-full zv2-stat" style={{ ...cardBase, padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: INK }}>🏦 {tc('Crédito hipotecario')}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC' }}>sobre ~{m1(cred.valor_inmueble)} · a {cred.plazo_anios} años · tasa prom {cred.tasa_prom_pct}%</div>
                  </div>
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
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>estimado por el motor de inversión (AVM + tasas Banxico) sobre los desarrollos reales de la zona</div>
          </section>
        )}

        {/* ── DESARROLLOS ── */}
        <section id="desarrollos" style={{ ...sec, marginTop: 46 }}>
          <div style={eyebrow}>{tc('Oferta')}</div>
          <h2 style={{ ...h2, marginBottom: 16 }}>Desarrollos en {name}</h2>
          {devs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {devs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6' }}>Aún no hay desarrollos publicados en esta zona.</div>
          )}
        </section>

        {/* ── COMPARA ── */}
        {(comparables.length > 0 || similar.length > 0) && (
          <section id="compara" style={{ ...sec, marginTop: 46 }}>
            <div style={eyebrow}>{tc('Compara')}</div>
            <h2 style={{ ...h2, marginBottom: 16 }}>Zonas parecidas a {name}</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} className="zv2-zlink" style={{ textDecoration: 'none', ...cardBase, padding: '14px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))}</span>
                  <span style={{ color: '#6D4AFF', fontWeight: 800 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── FUENTES ── */}
        <section style={{ ...sec, marginTop: 46 }}>
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
