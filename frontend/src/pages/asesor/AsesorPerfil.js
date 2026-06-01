/**
 * Phase 4 Batch 32 · Page — /asesor/perfil
 * Asesor's own profile management (auth).
 */
import React, { useEffect, useState, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader } from '../../components/advisor/primitives';
import TrustScoreBadge from '../../components/asesor/TrustScoreBadge';
import EndorsementsCard from '../../components/asesor/EndorsementsCard';
import LinkedInImportModal from '../../components/asesor/LinkedInImportModal';
import DiscTestModal from '../../components/asesor/DiscTestModal';
import {
  fetchMyTrustScore, fetchMyLinkedIn, fetchMyDisc, fetchMyEndorsements,
} from '../../api/asesor_identity';
import { PRIMARY_LABELS, PRIMARY_COLORS } from '../../config/discQuestions';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const cardStyle = {
  padding: 20, borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  backdropFilter: 'blur(24px)',
  display: 'flex', flexDirection: 'column', gap: 12,
};

export default function AsesorPerfil({ user, onLogout }) {
  const [trust, setTrust] = useState(null);
  const [linkedin, setLinkedin] = useState(null);
  const [disc, setDisc] = useState(null);
  const [endorsements, setEndorsements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLinkedIn, setShowLinkedIn] = useState(false);
  const [showDisc, setShowDisc] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const [t, l, d, e] = await Promise.all([
        fetchMyTrustScore({ force }).catch(() => null),
        fetchMyLinkedIn().then((r) => r.profile).catch(() => null),
        fetchMyDisc().then((r) => r.profile).catch(() => null),
        fetchMyEndorsements({ onlyVerified: false }).catch(() => null),
      ]);
      setTrust(t); setLinkedin(l); setDisc(d); setEndorsements(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publicUrl = `/asesor-publico/${user?.user_id || ''}`;
  const primary = disc?.result?.primary;

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="MI IDENTIDAD · TRUST SCORE"
        title="Mi perfil profesional"
        sub="Construye tu credibilidad: importa LinkedIn, toma el test DISC y gestiona tus reseñas verificadas."
      />

      <div data-testid="asesor-perfil-page" style={{
        display: 'grid', gap: 16, marginTop: 12,
      }}>
        {/* Top: Trust Score + Acciones rápidas */}
        <div style={{
          ...cardStyle,
          flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 24,
        }}>
          <TrustScoreBadge
            score={trust?.score ?? 0}
            components={trust?.components}
            size={120}
            testId="asesor-perfil-trust-badge"
          />

          <div style={{ flex: 1, minWidth: 260,
                        display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{
                fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--cream-3)',
              }}>Resumen</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--cream)',
                            marginTop: 4 }}>
                {user?.name || user?.email || 'Asesor'}
              </div>
              {linkedin?.profile_data?.headline && (
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 2 }}>
                  {linkedin.profile_data.headline}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a data-testid="asesor-perfil-preview-public"
                 href={publicUrl} target="_blank" rel="noopener noreferrer"
                 style={{
                   padding: '8px 16px', borderRadius: 9999,
                   border: '1px solid var(--border)',
                   background: 'transparent', color: 'var(--cream)',
                   fontSize: 12, textDecoration: 'none', cursor: 'pointer',
                 }}>Ver mi perfil público</a>
              <button data-testid="asesor-perfil-linkedin-btn" type="button"
                      onClick={() => setShowLinkedIn(true)}
                      style={{
                        padding: '8px 16px', borderRadius: 9999,
                        border: 'none', background: GRADIENT, color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                {linkedin ? 'Editar LinkedIn' : 'Importar desde LinkedIn'}
              </button>
              <button data-testid="asesor-perfil-disc-btn" type="button"
                      onClick={() => setShowDisc(true)}
                      style={{
                        padding: '8px 16px', borderRadius: 9999,
                        border: '1px solid rgba(99,102,241,0.4)',
                        background: 'rgba(99,102,241,0.08)',
                        color: 'var(--cream)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                {disc ? 'Volver a tomar DISC' : 'Tomar test DISC (2 min)'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div data-testid="asesor-perfil-stats" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}>
          <Stat testId="stat-trust-score" label="Trust Score"
                value={trust?.score ?? '—'} sub="0-100" />
          <Stat testId="stat-endorsements"
                label="Reseñas verificadas"
                value={endorsements?.count_verified ?? '—'}
                sub={`Promedio ${(endorsements?.avg_rating || 0).toFixed(1)}`} />
          <Stat testId="stat-disc-primary"
                label="Perfil DISC"
                value={primary || '—'}
                sub={primary ? PRIMARY_LABELS[primary] : 'Sin tomar'}
                color={primary ? PRIMARY_COLORS[primary] : null} />
          <Stat testId="stat-experience"
                label="Años experiencia"
                value={linkedin?.profile_data?.years_experience ?? 0}
                sub={linkedin?.profile_data?.current_company || '—'} />
        </div>

        {/* LinkedIn preview */}
        {linkedin && (
          <div data-testid="asesor-perfil-linkedin-preview" style={cardStyle}>
            <div style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>LinkedIn (manual)</div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {linkedin.profile_data?.photo_url && (
                <img src={linkedin.profile_data.photo_url}
                     alt={linkedin.profile_data.full_name || ''}
                     style={{ width: 56, height: 56, borderRadius: 9999,
                              objectFit: 'cover',
                              border: '1px solid var(--border)' }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cream)' }}>
                  {linkedin.profile_data?.full_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>
                  {linkedin.profile_data?.headline}
                </div>
              </div>
            </div>

            {(linkedin.profile_data?.certifications || []).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--cream-3)',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              marginBottom: 4 }}>Certificaciones</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--cream-2)',
                             fontSize: 12, lineHeight: 1.6 }}>
                  {linkedin.profile_data.certifications.map((c, i) =>
                    <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {(linkedin.profile_data?.education || []).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--cream-3)',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              marginBottom: 4 }}>Educación</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--cream-2)',
                             fontSize: 12, lineHeight: 1.6 }}>
                  {linkedin.profile_data.education.map((c, i) =>
                    <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* DISC card */}
        {disc?.result && (
          <div data-testid="asesor-perfil-disc-summary" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between' }}>
              <div>
                <div style={{
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--cream-3)',
                }}>Perfil DISC</div>
                <div style={{ fontSize: 22, fontWeight: 700,
                              color: PRIMARY_COLORS[primary] || 'var(--cream)',
                              fontFamily: 'Outfit', marginTop: 4 }}>
                  {primary} · {PRIMARY_LABELS[primary] || ''}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>
                {disc.completed_at?.slice(0, 10)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.7 }}>
              {disc.narrative_text}
            </div>
          </div>
        )}

        {/* Endorsements (own management) */}
        <EndorsementsCard
          asesorId={user?.user_id}
          asesorOwn={true}
          canSubmit={false}
          endorsementsData={endorsements}
          onChange={() => load(true)}
        />

        {loading && (
          <div style={{ padding: 20, textAlign: 'center',
                        color: 'var(--cream-3)', fontSize: 12 }}>
            Cargando perfil…
          </div>
        )}
      </div>

      <LinkedInImportModal
        open={showLinkedIn}
        onClose={() => setShowLinkedIn(false)}
        onImported={() => load(true)}
      />
      <DiscTestModal
        open={showDisc}
        onClose={() => setShowDisc(false)}
        onSubmitted={() => load(true)}
      />
    </AdvisorLayout>
  );
}

function Stat({ testId, label, value, sub, color }) {
  return (
    <div data-testid={testId} style={{
      padding: 14, borderRadius: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700,
        color: color || 'var(--cream)', fontFamily: 'Outfit',
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
