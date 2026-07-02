/**
 * W4.18.2B Sub-D — /valores AVM público · REDISEÑO CLARO Apple-tier (2026-07-01)
 *
 * Mini-AVM "¿cuánto vale tu propiedad?". Form 5 campos → GET /api/avm-public/quick →
 * resultado grande primero + tarjetas claras (rango · confianza · comparables · fuente) +
 * "qué mueve el precio" en lenguaje normal (result.drivers del avm_feature_engine).
 *
 * TEMA CLARO (LightScope + .dmx-card). NO se toca el backend: avm_public_engine (fórmula,
 * guards, sello de honestidad, supresión de explain público, rate-limit) queda intacto.
 * NOTA: <ExplainabilityCard> estaba MUERTO (backend fuerza with_explain=False por pentest →
 * result.explain siempre undefined). Se reemplaza por drivers en lenguaje normal.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import LightScope from '../../components/ui/LightScope';
import ToolNav from '../../components/ui/ToolNav';
import { fetchAvmQuick, fetchTopColonias } from '../../api/avm';

function fmtMXN(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}
function fmtFull(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

// Etiqueta humana + color por nivel de confianza (honesto: "referencial" cuando es heurístico seed)
const CONF_META = {
  alta:        { label: 'Alta',        color: '#1FA06A', bg: 'rgba(31,160,106,0.10)', bd: 'rgba(31,160,106,0.28)' },
  media:       { label: 'Media',       color: '#B8860B', bg: 'rgba(226,152,46,0.12)', bd: 'rgba(226,152,46,0.30)' },
  baja:        { label: 'Baja',        color: '#C2540A', bg: 'rgba(242,99,91,0.10)',  bd: 'rgba(242,99,91,0.28)' },
  referencial: { label: 'Referencial', color: '#6B7385', bg: 'rgba(107,115,133,0.10)', bd: 'rgba(107,115,133,0.26)' },
};
function confMeta(result) {
  const key = (result?.confidence_label || result?.confidence || '').toLowerCase();
  return CONF_META[key] || CONF_META.referencial;
}
// Fuente en lenguaje normal (sello de honestidad del backend)
function fuenteLabel(result) {
  if (result?.es_estimado) return 'Estimación referencial (datos de mercado semilla)';
  const f = result?.fuente || result?.pricing_model || '';
  if (f === 'hedonic_regression') return 'Modelo hedónico OLS (regresión)';
  return f ? `Modelo: ${f}` : 'Modelo de valuación';
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
  const [vista, setVista] = useState('');
  const [estado, setEstado] = useState('');
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
      // explain:true se manda pero el backend lo IGNORA (with_explain=False por pentest).
      // El resultado rico viene por result.drivers — no dependemos de result.explain.
      const data = await fetchAvmQuick({
        coloniaSlug, m2, recamaras, banos, antiguedadAnos: antiguedad, explain: true,
        vista, estadoConservacion: estado,
      });
      setResult(data);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  };

  const cm = result ? confMeta(result) : null;
  const nComparables = result?.comparables?.length || 0;

  return (
    <LightScope>
      {/* keyframe local del skeleton (self-contained · no tocamos index.css) */}
      <style>{`@keyframes valSkel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      {/* ═══════════ NAV SUPERIOR unificado (menú Herramientas real) ═══════════ */}
      <ToolNav />

      <main className="tool-surface" style={{ paddingBottom: 72 }}>
        {/* ═══════════ HERO ═══════════ */}
        <section style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 24px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--theme)', marginBottom: 14 }}>
            Valuación automática · CDMX
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 5vw, 54px)', letterSpacing: '-0.02em',
            lineHeight: 1.05, margin: '0 0 14px', color: '#1E2230',
          }}>
            ¿Cuánto vale tu propiedad en CDMX?
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16.5, color: '#5A5F6E', maxWidth: 640, lineHeight: 1.55, margin: 0 }}>
            Estimación referencial gratuita con datos reales de mercado.
            5 campos · resultado inmediato · sin registro.
          </p>
        </section>

        {/* ═══════════ FORM ═══════════ */}
        <section style={{ maxWidth: 1080, margin: '0 auto', padding: '10px 24px' }}>
          <form
            data-testid="valores-form"
            onSubmit={submit}
            className="dmx-card"
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
              padding: 26, borderRadius: 20, background: 'var(--surface-card)',
              border: '1px solid var(--card-border)',
            }}
          >
            <label style={{ gridColumn: 'span 2' }}>
              <div style={LBL}>Colonia</div>
              <select data-testid="valores-input-colonia" value={coloniaSlug}
                onChange={e => setColoniaSlug(e.target.value)} required style={INPUT}>
                <option value="">— Elige colonia —</option>
                {colonias.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <div style={LBL}>m² construidos</div>
              <input data-testid="valores-input-m2" type="number" min={20} max={2000} value={m2} onChange={e => setM2(+e.target.value)} required style={INPUT} />
            </label>
            <label>
              <div style={LBL}>Recámaras</div>
              <input data-testid="valores-input-rec" type="number" min={0} max={10} value={recamaras} onChange={e => setRecamaras(+e.target.value)} required style={INPUT} />
            </label>
            <label>
              <div style={LBL}>Baños</div>
              <input data-testid="valores-input-banos" type="number" min={0} max={10} value={banos} onChange={e => setBanos(+e.target.value)} required style={INPUT} />
            </label>
            <label>
              <div style={LBL}>Antigüedad (años)</div>
              <input data-testid="valores-input-ant" type="number" min={0} max={150} value={antiguedad} onChange={e => setAntiguedad(+e.target.value)} required style={INPUT} />
            </label>
            <label>
              <div style={LBL}>Vista <span style={OPT}>opcional</span></div>
              <select data-testid="valores-input-vista" value={vista} onChange={e => setVista(e.target.value)} style={INPUT}>
                <option value="">A la calle / sin especificar</option>
                <option value="parque">Al parque</option>
                <option value="area_verde">A área verde</option>
                <option value="ciudad">A la ciudad</option>
                <option value="interior">Interior</option>
              </select>
            </label>
            <label>
              <div style={LBL}>Estado <span style={OPT}>opcional</span></div>
              <select data-testid="valores-input-estado" value={estado} onChange={e => setEstado(e.target.value)} style={INPUT}>
                <option value="">Sin especificar</option>
                <option value="excelente">Excelente</option>
                <option value="bueno">Bueno</option>
                <option value="a_remodelar">Para remodelar</option>
              </select>
            </label>
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9AA0AE' }}>
                Gratis · no constituye avalúo profesional.
              </span>
              <button
                data-testid="valores-submit"
                type="submit"
                disabled={loading || !coloniaSlug}
                style={{
                  padding: '12px 26px', borderRadius: 9999, border: 'none',
                  background: 'var(--grad)', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer', opacity: loading || !coloniaSlug ? 0.55 : 1,
                  transition: 'opacity .15s, transform .15s', boxShadow: '0 8px 22px rgba(var(--theme-rgb),0.24)',
                }}
                onMouseEnter={(e) => { if (!(loading || !coloniaSlug)) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
              >{loading ? 'Calculando…' : 'Estimar valor'}</button>
            </div>
            {error && (
              <div style={{ gridColumn: 'span 2', padding: '10px 14px', borderRadius: 12, background: 'rgba(242,99,91,0.08)', border: '1px solid rgba(242,99,91,0.28)', color: '#C2540A', fontFamily: 'DM Sans', fontSize: 13 }}>
                {error}
              </div>
            )}
          </form>
        </section>

        {/* ═══════════ SKELETON (carga) ═══════════ */}
        {loading && (
          <section style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 24px' }}>
            <div className="dmx-card" style={{ padding: 30, borderRadius: 20, background: 'var(--surface-card)', border: '1px solid var(--card-border)' }}>
              <div style={{ ...SKEL, width: 160, height: 12, marginBottom: 16 }} />
              <div style={{ ...SKEL, width: 260, height: 52, marginBottom: 18 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ ...SKEL, height: 78 }} />)}
              </div>
            </div>
          </section>
        )}

        {/* ═══════════ RESULTADO ═══════════ */}
        {result && !loading && (
          <section data-testid="valores-result" style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 24px' }}>
            {/* — Tarjeta HÉROE: precio primero — */}
            <div className="dmx-card" style={{ padding: 30, borderRadius: 22, background: 'var(--surface-card)', border: '1px solid var(--card-border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--theme)', marginBottom: 8 }}>
                    Valor estimado · {result.colonia_name}
                  </div>
                  <div data-testid="valores-precio" style={{ fontFamily: 'Outfit', fontSize: 'clamp(40px, 7vw, 60px)', fontWeight: 800, color: '#1E2230', lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {fmtFull(result.precio_estimado)}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#5A5F6E', marginTop: 8 }}>
                    {fmtFull(result.precio_per_m2)} <span style={{ color: '#9AA0AE' }}>/ m²</span>
                  </div>
                </div>
                {/* Chip de confianza (honesto) */}
                {cm && (
                  <span data-testid="valores-confianza" style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 9999, color: cm.color, background: cm.bg, border: `1px solid ${cm.bd}`, whiteSpace: 'nowrap' }}>
                    Confianza: {cm.label}
                  </span>
                )}
              </div>

              {/* — Trío de tarjetas: rango · comparables · fuente — */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginTop: 24 }}>
                <Metric label="Rango probable"
                  value={`${fmtMXN(result.range_low)} — ${fmtMXN(result.range_high)}`}
                  sub="Piso y techo de la estimación" />
                <Metric label="Comparables usados"
                  value={nComparables > 0 ? `${nComparables} en la zona` : 'Sin comparables directos'}
                  sub={nComparables > 0 ? 'Desarrollos activos en la colonia' : 'Basado en el precio de mercado de la colonia'} />
                <Metric label="Fuente"
                  value={result.es_estimado ? 'Referencial' : 'Modelo de mercado'}
                  sub={fuenteLabel(result)}
                  flagged={result.es_estimado} />
              </div>

              {/* — Qué mueve el precio (drivers en lenguaje normal · reemplaza ExplainabilityCard) — */}
              {(result.drivers || []).length > 0 && (
                <div data-testid="valores-drivers" style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--card-border)' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#9AA0AE', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, marginBottom: 4 }}>
                    Qué mueve el precio
                  </div>
                  {result.drivers_resumen && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#5A5F6E', marginBottom: 14, lineHeight: 1.45 }}>
                      {result.drivers_resumen}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                    {result.drivers.map((d, i) => {
                      const up = d.dir === 'up';
                      return (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, padding: '6px 13px', borderRadius: 9999,
                          background: up ? 'rgba(31,160,106,0.09)' : 'rgba(226,152,46,0.11)',
                          border: `1px solid ${up ? 'rgba(31,160,106,0.28)' : 'rgba(226,152,46,0.30)'}`,
                          color: up ? '#1FA06A' : '#B8860B',
                        }}>
                          <span style={{ fontSize: 13 }}>{up ? '↑' : '↓'}</span>
                          {d.plain}
                          {d.pct !== null && d.pct !== undefined && (
                            <span style={{ opacity: 0.75, fontWeight: 600 }}>
                              {d.pct > 0 ? '+' : ''}{d.pct}%
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* — CTAs — */}
              <div style={{ marginTop: 26, display: 'flex', gap: 11, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/colonia/${result.colonia_slug}`)}
                  style={{ padding: '10px 18px', borderRadius: 9999, border: '1px solid var(--card-border)', background: 'var(--bg-2, #fff)', color: '#1E2230', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'border-color .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--card-border)'; }}
                >Ver colonia</button>
                <button
                  onClick={() => navigate(`/mapa?colonia=${result.colonia_slug}`)}
                  style={{ padding: '10px 18px', borderRadius: 9999, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(var(--theme-rgb),0.22)' }}
                >Ver mapa de la zona</button>
              </div>

              <div style={{ marginTop: 18, fontSize: 12, color: '#9AA0AE', fontStyle: 'italic', fontFamily: 'DM Sans' }}>
                {result.disclaimer}
              </div>
            </div>

            {/* — Comparables en la zona (tarjetas claras) — */}
            {nComparables > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#9AA0AE', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, margin: '0 4px 12px' }}>
                  Comparables en la zona
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
                  {result.comparables.map(c => (
                    <Link
                      key={c.dev_id}
                      to={`/desarrollo/${c.slug || c.dev_id}`}
                      className="dmx-card"
                      style={{
                        padding: 18, borderRadius: 16, background: 'var(--surface-card)',
                        border: '1px solid var(--card-border)', color: '#1E2230', textDecoration: 'none', display: 'block',
                      }}
                    >
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, marginBottom: 6, letterSpacing: '-0.01em' }}>{c.name}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#5A5F6E' }}>
                        desde {fmtMXN(c.price_from)}
                        {c.price_per_m2 ? <span style={{ color: '#9AA0AE' }}> · {fmtMXN(c.price_per_m2)}/m²</span> : null}
                      </div>
                      {c.stage && (
                        <span style={{ display: 'inline-block', marginTop: 10, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.08)', padding: '3px 9px', borderRadius: 9999 }}>{c.stage}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </LightScope>
  );
}

// ─── Sub-componente: tarjeta métrica clara ───────────────────────────────────
function Metric({ label, value, sub, flagged = false }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-2, #fff)', border: '1px solid var(--card-border)' }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#9AA0AE', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {flagged && <span title="Estimación de datos semilla — no es un avalúo" style={{ fontSize: 9, fontWeight: 800, color: '#B8860B', background: 'rgba(226,152,46,0.14)', padding: '1px 6px', borderRadius: 6 }}>SEMILLA</span>}
      </div>
      <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: '#1E2230', lineHeight: 1.15, letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#5A5F6E', marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ─── Estilos de formulario (tema claro) ──────────────────────────────────────
const LBL = {
  fontFamily: 'DM Sans', fontSize: 11, color: '#5A5F6E', marginBottom: 7,
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
};
const OPT = { fontWeight: 600, color: '#9AA0AE', textTransform: 'none', letterSpacing: 0, marginLeft: 4 };
const INPUT = {
  width: '100%', padding: '11px 14px', borderRadius: 12,
  background: 'var(--bg-2, #fff)', border: '1px solid var(--border-2, #D5D8E2)',
  color: '#1E2230', fontFamily: 'DM Sans', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .15s, box-shadow .15s',
};
const SKEL = {
  borderRadius: 12, background: 'linear-gradient(90deg, #EEF0F4 25%, #F6F7FA 50%, #EEF0F4 75%)',
  backgroundSize: '200% 100%', animation: 'valSkel 1.3s ease-in-out infinite',
};
