/**
 * W4.18.2B Sub-D — ColoniaLanding (/colonia/:slug)
 * SSR-friendly metadata · stats colonia · top devs · embed mapa · CTA valuar.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import CtaFooter from '../../components/landing/CtaFooter';
import BuyerCoachWidget from '../../components/buyer_coach/BuyerCoachWidget';

const API = process.env.REACT_APP_BACKEND_URL;

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n}`;
}

export default function ColoniaLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API}/api/avm-public/colonia/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setData(d);
        document.title = `${d.name} · DesarrollosMX · Valuación, desarrollos y datos`;
        // og:image dinámico
        let og = document.querySelector('meta[property="og:image"]');
        if (!og) {
          og = document.createElement('meta');
          og.setAttribute('property', 'og:image');
          document.head.appendChild(og);
        }
        og.setAttribute('content', `https://desarrollosmx.io/og/colonia/${slug}.png`);
        let desc = document.querySelector('meta[name="description"]');
        if (!desc) {
          desc = document.createElement('meta');
          desc.setAttribute('name', 'description');
          document.head.appendChild(desc);
        }
        desc.setAttribute('content', `Valuación, desarrollos preventa y datos de mercado en ${d.name}, ${d.alcaldia}. Tier ${d.tier} · ${d.total_devs_active} desarrollos activos.`);
      })
      .catch(s => setErr(s === 404 ? 'colonia_not_found' : 'load_error'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0', padding: 80, textAlign: 'center', fontFamily: 'DM Sans' }}>Cargando…</div>;
  }
  if (err === 'colonia_not_found') {
    return (
      <div style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
        <Navbar />
        <main style={{ padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 32, fontWeight: 800 }}>Colonia no encontrada</h1>
          <Link to="/marketplace" style={{ color: '#a5b4fc', marginTop: 14, display: 'inline-block' }}>← Volver al marketplace</Link>
        </main>
      </div>
    );
  }
  if (!data) return null;

  const c = data;

  return (
    <div style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
      <Navbar />
      <main style={{ paddingTop: 80, paddingBottom: 60 }}>
        {/* Hero */}
        <section data-testid="colonia-hero" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 12 }}>
            COLONIA · {c.alcaldia}
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(36px, 6vw, 64px)', lineHeight: 1, letterSpacing: '-0.025em',
            margin: '0 0 18px', color: '#F0EBE0',
          }}>
            {c.name}
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
            {[
              { label: 'Precio/m²', value: fmtMXN(c.price_m2) },
              { label: 'Tier',      value: c.tier || '—' },
              { label: 'Devs activos', value: c.total_devs_active },
              { label: 'Momentum',  value: c.momentum || '—' },
            ].map((s, i) => (
              <div key={i} style={{ padding: 16, borderRadius: 14, background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Top devs */}
        {c.top_3_devs?.length > 0 && (
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: '0 0 14px' }}>
              Top desarrollos preventa en {c.name}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
              {c.top_3_devs.map(d => (
                <Link key={d.dev_id} to={`/desarrollo/${d.slug || d.dev_id}`} style={{
                  padding: 18, borderRadius: 16,
                  background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#F0EBE0', textDecoration: 'none', display: 'block',
                }}>
                  <div style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>desde {fmtMXN(d.price_from)} · {d.stage}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Mapa embed */}
        <section data-testid="colonia-mapa-embed" style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: '0 0 14px' }}>
            Mapa de la zona
          </h2>
          <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', height: 480 }}>
            <iframe
              title={`Mapa ${c.name}`}
              src={`/mapa?colonia=${c.slug}`}
              style={{ width: '100%', height: '100%', border: 0 }}
              loading="lazy"
            />
          </div>
        </section>

        {/* CTA Valuar */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
          <div style={{
            padding: 28, borderRadius: 20,
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h3 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>
                ¿Tienes propiedad en {c.name}?
              </h3>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', margin: 0 }}>
                Estimación gratuita basada en datos reales de mercado. 5 campos · sin login.
              </p>
            </div>
            <button
              data-testid="colonia-valuar-cta"
              onClick={() => navigate(`/valores?colonia=${c.slug}`)}
              style={{
                padding: '12px 24px', borderRadius: 9999, border: 'none',
                background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >Valuar mi propiedad</button>
          </div>
        </section>
      </main>
      <CtaFooter />
      <BuyerCoachWidget colonia={slug} />
    </div>
  );
}
