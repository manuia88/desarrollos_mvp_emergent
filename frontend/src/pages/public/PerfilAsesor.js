/**
 * Phase 4 Batch 32 · Page — /asesor-publico/:id  (público sin auth)
 *
 * Hero · LinkedIn · Trust Score · Endorsements · Proyectos · CTAs.
 * Mobile-first responsive (sections stack vertical en <640px).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import TrustScoreBadge from '../../components/asesor/TrustScoreBadge';
import EndorsementsCard from '../../components/asesor/EndorsementsCard';
import { fetchPublicProfile, fetchPublicProfileBySlug, revealAsesorContact } from '../../api/asesor_identity';
import { PRIMARY_LABELS, PRIMARY_COLORS } from '../../config/discQuestions';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

// W5.ASR.4 Parte 2 — Detect subdomain pattern `{slug}.asesores.{domain}` o
// host con prefijo `asesor-{slug}`. Captura el slug si encontrado.
const SUBDOMAIN_RE = /^([a-z0-9-]+)\.asesores\./i;

function detectSubdomainSlug() {
  try {
    const host = window.location.hostname || '';
    const m = SUBDOMAIN_RE.exec(host);
    if (m && m[1]) return m[1].toLowerCase();
  } catch (_) {
    /* SSR-safe noop */
  }
  return null;
}

const cardStyle = {
  padding: 20, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(240,235,224,0.12)',
  backdropFilter: 'blur(24px)',
};

function buildWaHref(phone, name) {
  if (!phone) return null;
  const clean = phone.replace(/[^\d]/g, '');
  if (!clean) return null;
  const msg = encodeURIComponent(
    `Hola ${name || ''}, vi tu perfil en DesarrollosMX y me interesa platicar.`,
  );
  return `https://wa.me/${clean}?text=${msg}`;
}

// Contacto del asesor OCULTO hasta dejar datos. Al enviar, se registra el lead
// y se revela el teléfono (anti-scraping + el asesor recibe el prospecto).
function ContactGate({ asesorId, asesorName }) {
  const [revealed, setRevealed] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (revealed) {
    const waHref = buildWaHref(revealed, asesorName);
    return waHref ? (
      <a data-testid="public-cta-whatsapp" href={waHref} target="_blank" rel="noopener noreferrer"
         style={{ padding: '12px 22px', borderRadius: 9999, background: GRADIENT,
                  color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
        Habla conmigo
      </a>
    ) : (
      <div style={{ fontSize: 13, color: 'var(--cream-2)' }}>Contacto: {revealed}</div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email && !form.phone) { setMsg('Deja tu email o teléfono'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await revealAsesorContact(asesorId, form);
      const ph = res && res.asesor && res.asesor.phone;
      if (ph) setRevealed(ph);
      else setMsg('¡Listo! El asesor te contactará pronto.');
    } catch (err) {
      setMsg(err.message || 'No se pudo enviar · intenta de nuevo');
    } finally { setBusy(false); }
  };

  const inp = {
    padding: '10px 12px', borderRadius: 10, fontSize: 13,
    background: 'rgba(240,235,224,0.06)', color: 'var(--cream)',
    border: '1px solid rgba(240,235,224,0.18)', outline: 'none', width: '100%',
  };
  return (
    <form data-testid="public-contact-gate" onSubmit={submit}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, width: '100%' }}>
      <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Deja tus datos y te paso el contacto del asesor:</div>
      <input style={inp} placeholder="Tu nombre" aria-label="Tu nombre" value={form.name}
             onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input style={inp} placeholder="Tu WhatsApp / teléfono" aria-label="Tu teléfono" value={form.phone}
             onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input style={inp} placeholder="Tu email (opcional)" aria-label="Tu email" type="email" value={form.email}
             onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <button type="submit" disabled={busy}
              style={{ padding: '12px 22px', borderRadius: 9999, background: GRADIENT, color: '#fff',
                       fontSize: 13, fontWeight: 600, border: 'none',
                       cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Enviando…' : 'Ver contacto del asesor'}
      </button>
      {msg && <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>{msg}</div>}
    </form>
  );
}

export default function PerfilAsesor() {
  const { id: asesorId } = useParams();
  const [params] = useSearchParams();
  const justConfirmed = params.get('confirmed') === 'true';

  // W5.ASR.4 Parte 2 — Subdomain detection
  const [subdomainSlug] = useState(() => detectSubdomainSlug());

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = subdomainSlug
        ? await fetchPublicProfileBySlug(subdomainSlug)
        : await fetchPublicProfile(asesorId);
      setData(d);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  }, [asesorId, subdomainSlug]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>
          Cargando perfil…
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: 'var(--cream)', marginBottom: 8 }}>
            {error || 'Perfil no encontrado'}
          </div>
          <Link to="/" style={{ color: 'var(--cream)',
                                textDecoration: 'underline', fontSize: 13 }}>
            Volver al inicio
          </Link>
        </div>
      </PageShell>
    );
  }

  const asesor = data.asesor || {};
  const linkedin = data.linkedin?.profile_data || {};
  const disc = data.disc;
  const trust = data.trust_score || {};
  const endorsements = data.endorsements || {};
  const projects = data.projects || [];
  const photo = linkedin.photo_url || asesor.avatar_url;

  return (
    <PageShell>
      {justConfirmed && (
        <div data-testid="confirmed-banner" style={{
          padding: '10px 16px', borderRadius: 9999,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          color: '#86efac', fontSize: 12,
          textAlign: 'center', marginBottom: 18,
        }}>
          ¡Tu reseña fue confirmada! Ya aparece en este perfil.
        </div>
      )}

      <div data-testid="public-perfil-page" style={{
        display: 'grid', gap: 18,
      }}>
        {/* Hero */}
        <div data-testid="public-perfil-hero" style={{
          ...cardStyle,
          display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
        }}>
          {photo ? (
            <img src={photo} alt={asesor.name}
                 style={{ width: 96, height: 96, borderRadius: 9999,
                          objectFit: 'cover',
                          border: '1px solid rgba(240,235,224,0.18)' }} />
          ) : (
            <div style={{
              width: 96, height: 96, borderRadius: 9999,
              background: GRADIENT,
              display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40, fontWeight: 700, color: '#fff',
              fontFamily: 'Outfit',
            }}>{(asesor.name || 'A').charAt(0).toUpperCase()}</div>
          )}

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>Asesor verificado · DesarrollosMX</div>
            <h1 style={{
              fontSize: 28, fontFamily: 'Outfit', fontWeight: 700,
              color: 'var(--cream)', margin: '4px 0',
              letterSpacing: '-0.02em',
            }}>{asesor.name}</h1>
            {linkedin.headline && (
              <div style={{ fontSize: 14, color: 'var(--cream-2)' }}>
                {linkedin.headline}
              </div>
            )}
            {disc?.primary && (
              <div data-testid="public-disc-pill" style={{
                display: 'inline-block', marginTop: 8,
                padding: '4px 12px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.1)',
                border: `1px solid ${PRIMARY_COLORS[disc.primary] || '#6366F1'}55`,
                color: PRIMARY_COLORS[disc.primary] || 'var(--cream)',
                fontSize: 11, fontWeight: 600,
              }}>
                Perfil DISC: {disc.primary} · {PRIMARY_LABELS[disc.primary]}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <TrustScoreBadge
              score={trust.score ?? 0}
              components={trust.components}
              size={96}
              testId="public-trust-badge"
            />
          </div>
        </div>

        {/* CTA · contacto gated (oculto hasta dejar datos) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <ContactGate asesorId={asesor.user_id || asesorId} asesorName={asesor.name} />
        </div>

        {/* Sobre mí */}
        {(linkedin.headline || (linkedin.certifications || []).length > 0 ||
          (linkedin.education || []).length > 0) && (
          <div data-testid="public-about" style={cardStyle}>
            <div style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--cream-3)', marginBottom: 8,
            }}>Sobre mí</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {linkedin.years_experience > 0 && (
                <div style={{ fontSize: 13, color: 'var(--cream-2)' }}>
                  <strong style={{ color: 'var(--cream)' }}>
                    {linkedin.years_experience} años
                  </strong> de experiencia en bienes raíces.
                  {linkedin.current_company && (
                    <> Actualmente en <strong style={{ color: 'var(--cream)' }}>
                      {linkedin.current_company}
                    </strong>.</>
                  )}
                </div>
              )}

              {(linkedin.certifications || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)',
                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                marginBottom: 4 }}>Certificaciones</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--cream-2)',
                               fontSize: 13, lineHeight: 1.7 }}>
                    {linkedin.certifications.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {(linkedin.education || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)',
                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                marginBottom: 4 }}>Educación</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--cream-2)',
                               fontSize: 13, lineHeight: 1.7 }}>
                    {linkedin.education.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {disc?.narrative_text && (
                <div style={{
                  padding: 12, borderRadius: 12,
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.18)',
                  fontSize: 13, color: 'var(--cream)', lineHeight: 1.7,
                }}>
                  {disc.narrative_text}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Endorsements card (with submit) */}
        <EndorsementsCard
          asesorId={asesorId}
          asesorOwn={false}
          canSubmit={true}
          endorsementsData={endorsements}
          onChange={() => load()}
        />

        {/* Proyectos asignados */}
        {projects.length > 0 && (
          <div data-testid="public-projects" style={cardStyle}>
            <div style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--cream-3)', marginBottom: 12,
            }}>Proyectos cerrados</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}>
              {projects.map((p) => (
                <a key={p.id} href={`/desarrollo/${p.id}`}
                   data-testid={`public-project-${p.id}`}
                   style={{
                     padding: 12, borderRadius: 12,
                     background: 'rgba(240,235,224,0.04)',
                     border: '1px solid rgba(240,235,224,0.1)',
                     color: 'var(--cream)', textDecoration: 'none',
                     display: 'flex', flexDirection: 'column', gap: 6,
                   }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>
                    {p.colonia}{p.ciudad ? `, ${p.ciudad}` : ''}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '60px 20px',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <Link to="/" data-testid="public-perfil-home-link"
              style={{
                display: 'inline-block', marginBottom: 18,
                fontSize: 12, color: 'var(--cream-3)',
                textDecoration: 'none',
              }}>← DesarrollosMX</Link>
        {children}
      </div>
    </div>
  );
}
