// Página de Zona v2 — rebuild claro, formato marketplace. Reúsa /inversion + /pulso + landing + developments.
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

const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 20, boxShadow: '0 12px 36px rgba(99,102,241,0.10), 0 2px 8px rgba(16,18,28,0.05)', padding: 22 };
const eyebrow = { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const cellStyle = { flex: 1, textAlign: 'center', padding: '11px 6px', borderRadius: 13, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.13)' };
const cellNum = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', letterSpacing: '-0.02em' };
const cellLbl = { fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 3 };

function Chip({ children, c = '99,102,241' }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: `rgb(${c})`, background: `rgba(${c},0.09)`, border: `1px solid rgba(${c},0.22)`, borderRadius: 9999, padding: '5px 13px' }}>{children}</span>;
}

export default function ZonePageV2() {
  const { slug } = useParams();
  const [inv, setInv] = useState(null);
  const [pulso, setPulso] = useState(null);
  const [landing, setLanding] = useState(null);
  const [devs, setDevs] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      get(`/api/zona/${slug}/inversion`),
      get(`/api/zona/${slug}/pulso`),
      get(`/api/public/landing/colonia/${slug}`),
      get(`/api/developments?colonia=${slug}&limit=12`),
      get(`/api/colonias-similar/${slug}`),
    ]).then(([i, p, l, d, s]) => {
      if (!alive) return;
      setInv(i); setPulso(p); setLanding(l);
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

  // Veredicto (mismo criterio que el menú): invertir si sube + accesible · vivir si premium
  const plus = inv && inv.plusvalia_anual_pct;
  const veredicto = (() => {
    if (!inv || !inv.precio_prom) return null;
    if (inv.veredicto_inversion === 'excelente' || inv.veredicto_inversion === 'buena')
      return { e: '🟢', l: 'Para invertir', r: `Sube de valor (~${plus}%/año) y la renta deja buen rendimiento — buen momento para entrar.` };
    if (plus >= 6) return { e: '🟢', l: 'Para invertir', r: `En alza (~${plus}%/año), todavía con espacio de entrada.` };
    return { e: '🟢', l: 'Para vivir', r: 'Zona consolidada: buena calidad de vida y valor estable.' };
  })();

  const VER = { excelente: '#0E9F6E', buena: '#16C784', moderada: '#E0A33E', baja: '#DC2626' };

  const INVEST = inv ? [
    { l: 'Renta mensual', v: inv.renta_prom ? `$${inv.renta_prom.toLocaleString('es-MX')}` : null, c: 'var(--cream)',
      t: 'Lo que cobrarías al mes de renta (bruta, antes de gastos) para un depto al precio promedio de la zona.' },
    { l: 'Plusvalía anual', v: inv.plusvalia_anual_pct != null ? `${inv.plusvalia_anual_pct}%` : null, c: '#0E9F6E',
      t: `Cuánto sube de precio el inmueble cada año por el mercado (la demanda y el desarrollo de la zona), no porque alguien lo decida.${inv.plusvalia_anual_abs ? ` Aquí: ~${inv.plusvalia_anual_pct}% = un depto de ${m1(inv.precio_prom)} sube ~$${Math.round(inv.plusvalia_anual_abs / 1000).toLocaleString('es-MX')}k al año.` : ''} No incluye las rentas.` },
    { l: 'Cap rate anual', v: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : null, c: '#C026D3',
      t: `Mide cuánto rinde la PROPIEDAD por su renta, sin importar cómo la pagues (no mira el crédito). Es el NOI ÷ precio. El NOI es la renta de un año menos los gastos de operarla.${inv.renta_anual ? ` Aquí: ~$${Math.round(inv.renta_anual / 1000).toLocaleString('es-MX')}k ÷ ${m1(inv.precio_prom)} = ${inv.cap_rate_anual_pct}%.` : ''} No incluye la plusvalía.` },
    { l: 'TIR anual', v: inv.tir_anual_pct != null ? `${inv.tir_anual_pct}%` : null, c: '#7C5CFF',
      t: `El rendimiento POR AÑO: a qué tasa anual equivale tu inversión contando las rentas de cada año y la venta al final, y que un peso hoy vale más que en 5 años. Aquí: ${inv.tir_anual_pct}% al año. Es el ROI de 5 años repartido por año y ajustado al tiempo.` },
    { l: 'ROI a 5 años', v: inv.ganancia_5y_pct != null ? `+${inv.ganancia_5y_pct}%` : null, c: '#0E9F6E',
      t: `Tu ganancia TOTAL si lo tienes 5 años y lo vendes (renta acumulada + lo que subió de precio − costos).${inv.ganancia_5y_abs ? ` Ejemplo: pones ~${m1(inv.precio_prom)} y en 5 años ganas ~${m1(inv.ganancia_5y_abs)} → +${inv.ganancia_5y_pct}%.` : ''} Es el total del periodo, NO por año (por año, ajustado al tiempo, es la TIR).` },
  ] : [];
  const cred = inv && inv.credito;

  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };

  return (
    <LightScope>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 60 }}>
        {/* ── HERO ── */}
        <section style={{ ...sec, paddingTop: 32, paddingBottom: 8 }}>
          <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', textDecoration: 'none' }}>← Volver al marketplace</Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', fontWeight: 600 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''}</div>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 44, letterSpacing: '-0.03em', color: 'var(--cream)', margin: '2px 0 0' }}>{name}</h1>
              {veredicto && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>{veredicto.e} El veredicto: <span style={{ background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{veredicto.l}</span></div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', marginTop: 5, lineHeight: 1.5, maxWidth: 560 }}>{veredicto.r}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {inv && inv.precio_m2 && <Chip>💰 ${Math.round(inv.precio_m2 / 1000)}k/m²</Chip>}
                {plus != null && <Chip c="22,199,132">📈 +{plus}%/año</Chip>}
                {inv && inv.cap_rate_anual_pct != null && <Chip c="192,38,211">🔑 {inv.cap_rate_anual_pct}% renta</Chip>}
                {inv && inv.n_desarrollos > 0 && <Chip>🏢 {inv.n_desarrollos} desarrollos</Chip>}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <a href="#desarrollos" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 20px', borderRadius: 13, textDecoration: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, boxShadow: '0 8px 22px rgba(124,92,255,0.32)' }}>Ver desarrollos →</a>
                <button type="button" disabled title="Próximamente" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 20px', borderRadius: 13, border: '1px solid rgba(99,102,241,0.3)', background: '#fff', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, cursor: 'not-allowed', opacity: 0.7 }}>🔔 Vigila esta zona</button>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 24 }}><div style={{ ...card, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando la inteligencia de {name}…</div></section>
        ) : (
        <>
        {/* ── PRECIOS Y VALOR ── */}
        {inv && inv.precio_prom && (
          <section style={{ ...sec, marginTop: 22 }}>
            <div style={card}>
              <div style={eyebrow}>{tc('Precios y valor')}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {[['Más accesible', inv.precio_min], ['Promedio', inv.precio_prom], ['Más alto', inv.precio_max]].map(([l, v]) => (
                  <div key={l} style={{ ...cellStyle, minWidth: 130 }}><div style={cellNum}>{m1(v)}</div><div style={cellLbl}>{l}</div></div>
                ))}
                {inv.precio_m2 && <div style={{ ...cellStyle, minWidth: 130 }}><div style={cellNum}>${Math.round(inv.precio_m2 / 1000)}k</div><div style={cellLbl}>por m²</div></div>}
              </div>
              {landing && landing.drpi && landing.drpi.available && landing.drpi.delta_30d_pct != null && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 12 }}>Índice de precios DRPI: <b>{landing.drpi.delta_30d_pct >= 0 ? '↑' : '↓'} {Math.abs(landing.drpi.delta_30d_pct)}%</b> en el último mes</div>
              )}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 12, fontStyle: 'italic' }}>estimado a partir de los desarrollos y el motor de valor de la zona</div>
            </div>
          </section>
        )}

        {/* ── ¿BUENA INVERSIÓN? ── */}
        {inv && inv.veredicto_inversion && (
          <section style={{ ...sec, marginTop: 18 }}>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={eyebrow}>{tc('¿Buena inversión?')}</div>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: VER[inv.veredicto_inversion], background: `${VER[inv.veredicto_inversion]}14`, border: `1px solid ${VER[inv.veredicto_inversion]}33`, borderRadius: 9999, padding: '4px 12px' }}>{tc(inv.veredicto_inversion)}</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 5 }}>calculado sobre un depto al precio promedio (~{m1(inv.precio_prom)})</div>
              <div style={{ marginTop: 8 }}>
                {INVEST.filter((r) => r.v != null).map((r) => (
                  <div key={r.l} className="tip" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '11px 0', borderTop: '1px solid rgba(16,18,28,0.06)', cursor: 'help' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>{tc(r.l)}<span className="tip-q" style={{ color: '#6366F1' }}>?</span></div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: r.c, whiteSpace: 'nowrap' }}>{r.v}</div>
                    <span className="tip-box">{r.t}</span>
                  </div>
                ))}
              </div>
              {/* Crédito */}
              {cred && cred.escenarios && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(16,18,28,0.06)' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>🏦 {tc('Crédito hipotecario')}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>sobre ~{m1(cred.valor_inmueble)} · a {cred.plazo_anios} años · tasa prom {cred.tasa_prom_pct}%</div>
                  <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 10, paddingBottom: 5, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                    <span style={{ flex: '0 0 70px' }}>crédito</span><span style={{ flex: 1, textAlign: 'right' }}>te prestan</span><span style={{ flex: 1, textAlign: 'right' }}>al mes</span><span style={{ flex: 1, textAlign: 'right' }}>pagas en total</span>
                  </div>
                  {cred.escenarios.map((e) => (
                    <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 12.5, padding: '8px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                      <span style={{ flex: '0 0 70px', fontWeight: 800, color: 'var(--cream)' }}>{e.aforo}% a crédito</span>
                      <span style={{ flex: 1, textAlign: 'right', color: 'var(--cream-2)' }}>{m1(e.prestamo)}</span>
                      <span style={{ flex: 1, textAlign: 'right', color: 'var(--cream-2)' }}>{kfmt(e.pago)}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#C026D3' }}>{m1(e.total)}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 9, fontStyle: 'italic' }}>Solo informativo. Va con la tasa (el CAT real, con seguros y comisiones, es mayor). Tu pago final lo define el banco según tu perfil.</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── DESARROLLOS EN LA ZONA ── */}
        <section id="desarrollos" style={{ ...sec, marginTop: 26 }}>
          <div style={{ ...eyebrow, marginBottom: 12 }}>{tc('Desarrollos en')} {name}</div>
          {devs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {devs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...card, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Aún no hay desarrollos publicados en esta zona.</div>
          )}
        </section>

        {/* ── COMPARA ── */}
        {(comparables.length > 0 || similar.length > 0) && (
          <section style={{ ...sec, marginTop: 26 }}>
            <div style={card}>
              <div style={eyebrow}>{tc('Compara con zonas parecidas')}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                  <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} style={{ textDecoration: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.16)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--theme)' }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))} →</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── FUENTES ── */}
        <section style={{ ...sec, marginTop: 26 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.6 }}>
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
