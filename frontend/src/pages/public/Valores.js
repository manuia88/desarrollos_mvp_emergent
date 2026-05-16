/**
 * W4.18.2B Sub-D — /valores AVM público
 * Form 5 campos → fetch /api/avm-public/quick → muestra precio + range + 3 comparables.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import CtaFooter from '../../components/landing/CtaFooter';
import ExplainabilityCard from '../../components/avm/ExplainabilityCard';
import { fetchAvmQuick, fetchTopColonias } from '../../api/avm';

function fmtMXN(n) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export default function Valores() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [colonias, setColonias] = useState([]);
  const [coloniaSlug, setColoniaSlug] = useState(searchParams.get('colonia') || '');
  const [m2, setM2] = useState(80);
  const [recamaras, setRecamaras] = useState(2);
  const [banos, setBanos] = useState(2);
  const [antiguedad, setAntiguedad] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Valores · ¿Cuánto vale tu propiedad? · DesarrollosMX';
    fetchTopColonias(30).then(d => setColonias(d.colonias || [])).catch(() => setColonias([]));
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    setError(null); setLoading(true); setResult(null);
    try {
      const data = await fetchAvmQuick({
        coloniaSlug, m2, recamaras, banos, antiguedadAnos: antiguedad, explain: true,
      });
      setResult(data);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: 'var(--bg, #06080F)', minHeight: '100vh', color: '#F0EBE0' }}>
      <Navbar />
      <main style={{ paddingTop: 80, paddingBottom: 60 }}>
        {/* Hero */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 14 }}>
            VALUACIÓN AUTOMÁTICA · CDMX
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: '-0.025em',
            lineHeight: 1.05, margin: '0 0 16px', color: '#F0EBE0',
          }}>
            ¿Cuánto vale tu propiedad en CDMX?
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'rgba(240,235,224,0.7)', maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
            Estimación referencial gratuita basada en datos reales de mercado en 16 colonias.
            5 campos · Resultado inmediato · Sin login.
          </p>
        </section>

        {/* Form */}
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '12px 24px' }}>
          <form
            data-testid="valores-form"
            onSubmit={submit}
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
              padding: 24, borderRadius: 20,
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <label style={{ gridColumn: 'span 2' }}>
              <div style={LBL_STYLE}>Colonia</div>
              <select
                data-testid="valores-input-colonia"
                value={coloniaSlug}
                onChange={e => setColoniaSlug(e.target.value)}
                required
                style={INPUT_STYLE}
              >
                <option value="">— Elige colonia —</option>
                {colonias.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <div style={LBL_STYLE}>m² construidos</div>
              <input data-testid="valores-input-m2" type="number" min={20} max={2000} value={m2} onChange={e => setM2(+e.target.value)} required style={INPUT_STYLE} />
            </label>
            <label>
              <div style={LBL_STYLE}>Recámaras</div>
              <input data-testid="valores-input-rec" type="number" min={0} max={10} value={recamaras} onChange={e => setRecamaras(+e.target.value)} required style={INPUT_STYLE} />
            </label>
            <label>
              <div style={LBL_STYLE}>Baños</div>
              <input data-testid="valores-input-banos" type="number" min={0} max={10} value={banos} onChange={e => setBanos(+e.target.value)} required style={INPUT_STYLE} />
            </label>
            <label>
              <div style={LBL_STYLE}>Antigüedad (años)</div>
              <input data-testid="valores-input-ant" type="number" min={0} max={150} value={antiguedad} onChange={e => setAntiguedad(+e.target.value)} required style={INPUT_STYLE} />
            </label>
            <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
              <button
                data-testid="valores-submit"
                type="submit"
                disabled={loading || !coloniaSlug}
                style={{
                  padding: '12px 24px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer', opacity: loading || !coloniaSlug ? 0.6 : 1,
                }}
              >{loading ? 'Calculando…' : 'Estimar valor'}</button>
            </div>
            {error && (
              <div style={{ gridColumn: 'span 2', padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
                {error}
              </div>
            )}
          </form>
        </section>

        {/* Result */}
        {result && (
          <section data-testid="valores-result" style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px' }}>
            <div style={{
              padding: 28, borderRadius: 20,
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(99,102,241,0.3)',
            }}>
              <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Estimación · {result.colonia_name}
              </div>
              <div style={{ fontFamily: 'Outfit', fontSize: 44, fontWeight: 800, color: '#F0EBE0', lineHeight: 1 }}>
                {fmtMXN(result.precio_estimado)}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)', marginTop: 6 }}>
                Rango: {fmtMXN(result.range_low)} — {fmtMXN(result.range_high)}
                <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                Confianza: {result.confidence}
                <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                {fmtMXN(result.precio_per_m2)} / m²
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/colonia/${result.colonia_slug}`)}
                  style={{ padding: '9px 16px', borderRadius: 9999, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.10)', color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >Ver landing colonia</button>
                <button
                  onClick={() => navigate(`/mapa?colonia=${result.colonia_slug}`)}
                  style={{ padding: '9px 16px', borderRadius: 9999, border: 'none', background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >Ver mapa zona</button>
              </div>
              {result.comparables?.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Comparables en la zona
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                    {result.comparables.map(c => (
                      <Link
                        key={c.dev_id}
                        to={`/desarrollo/${c.slug || c.dev_id}`}
                        style={{
                          padding: 14, borderRadius: 14,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: '#F0EBE0', textDecoration: 'none', display: 'block',
                        }}
                      >
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)' }}>desde {fmtMXN(c.price_from)} · {fmtMXN(c.price_per_m2)}/m²</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 10.5, color: 'rgba(240,235,224,0.35)', fontStyle: 'italic' }}>
                {result.disclaimer}
              </div>
            </div>
            {/* W5.1 Sub-D — Explainability */}
            <ExplainabilityCard explain={result.explain} />
          </section>
        )}
      </main>
      <CtaFooter />
    </div>
  );
}

const LBL_STYLE = {
  fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans',
};
const INPUT_STYLE = {
  width: '100%', padding: '10px 14px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
};
