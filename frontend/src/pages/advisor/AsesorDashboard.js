// /asesor → dashboard with widgets
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Stat, Badge, Empty, fmtMXN, relDate, isOverdue } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import { ArrowRight, Sparkle, Clock } from '../../components/icons';

export default function AsesorDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, p] = await Promise.all([api.getDashboard(), api.getProfile()]);
      setData(d); setProfile(p); setBriefing(d?.briefing || null);
    } catch (e) {
      // B3: unauthenticated → redirect home with login modal trigger
      if (e?.status === 401) {
        window.location.href = '/?login=1&next=/asesor';
        return;
      }
      // B4: 403 is handled by AdvisorLayout; everything else → soft error
      setLoadError(e?.message || 'No se pudo cargar el panel.');
      setData(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const runBriefing = async () => {
    setBriefingLoading(true);
    try {
      const b = await api.generateBriefing();
      setBriefing(b);
    } finally { setBriefingLoading(false); }
  };

  const seed = async () => {
    try { await api.seedDemo(); await load(); } catch (e) { /* already seeded */ }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="PANEL DE ASESOR"
        title={`Hola, ${(user?.name || '').split(' ')[0] || ''}`}
        sub="Resumen operativo del día. Los widgets reflejan tu CRM en tiempo real."
        actions={
          <>
            <button onClick={runBriefing} disabled={briefingLoading} data-testid="run-briefing"
              className="btn btn-primary"
              style={{ opacity: briefingLoading ? 0.6 : 1 }}>
              <Sparkle size={12} />
              {briefingLoading ? 'Generando…' : 'Briefing diario IA'}
            </button>
            {!data?.counts?.contactos && (
              <button onClick={seed} data-testid="seed-demo" className="btn btn-glass">
                Cargar datos demo
              </button>
            )}
          </>
        }
      />

      {loading ? (
        <div style={{ padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', textAlign: 'center' }}>Cargando panel…</div>
      ) : loadError ? (
        <div data-testid="dashboard-error" style={{ padding: 40, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: '#fca5a5' }}>ERROR</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', marginBottom: 10 }}>
            No pudimos cargar tu panel
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 16 }}>
            {loadError}
          </div>
          <button onClick={load} className="btn btn-primary">Reintentar</button>
        </div>
      ) : !data ? (
        <div style={{ padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', textAlign: 'center' }}>Sin datos.</div>
      ) : (
        <>
          {/* Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
            <Stat label="Contactos" value={data.counts.contactos} />
            <Stat label="Búsquedas activas" value={data.counts.busquedas} />
            <Stat label="Captaciones" value={data.counts.captaciones} />
            <Stat label="Tareas vencidas" value={data.counts.tareas_vencidas} accent={data.counts.tareas_vencidas ? '#fca5a5' : 'var(--cream)'} />
            <Stat label="Operaciones abiertas" value={data.counts.operaciones_abiertas} />
            <Stat label="Comisiones por cobrar" value={fmtMXN(data.comisiones_por_cobrar)} accent="#86efac" />
          </div>

          {/* Briefing card */}
          <Card style={{ marginBottom: 22, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04))' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>BRIEFING IA · WhatsApp-ready</div>
            {briefing ? (
              <pre data-testid="briefing-text" style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {briefing.text}
              </pre>
            ) : (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                Aún no generas el briefing de hoy. Haz click en <strong>Briefing diario IA</strong> arriba para generarlo.
              </div>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dash-grid">
            {/* Tareas hoy */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="eyebrow">TAREAS DEL DÍA</div>
                <Link to="/asesor/tareas" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--indigo-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Ver todas <ArrowRight size={10} />
                </Link>
              </div>
              {data.tareas_hoy.length === 0 ? <Empty title="Sin tareas pendientes" sub="Disfruta el día (o crea una nueva)." />
                : data.tareas_hoy.map(t => (
                  <div key={t.id} data-testid={`dash-tarea-${t.id}`} style={{
                    padding: '10px 12px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <Clock size={12} color={isOverdue(t.due_at) ? '#fca5a5' : 'var(--cream-3)'} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.titulo}
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>
                          {t.entity_label || t.tipo}
                        </div>
                      </div>
                    </div>
                    {isOverdue(t.due_at) ? <Badge tone="bad">Vencida {relDate(t.due_at)}</Badge> : <Badge tone="neutral">{relDate(t.due_at)}</Badge>}
                  </div>
                ))
              }
            </Card>

            {/* Leads recientes */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="eyebrow">LEADS RECIENTES</div>
                <Link to="/asesor/contactos" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--indigo-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Ver todos <ArrowRight size={10} />
                </Link>
              </div>
              {data.leads_recientes.length === 0 ? <Empty title="Sin contactos aún" sub="Empieza creando uno nuevo." />
                : data.leads_recientes.map(c => (
                  <Link key={c.id} to={`/asesor/contactos/${c.id}`} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderBottom: '1px solid var(--border)',
                    textDecoration: 'none',
                  }}>
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, color: 'var(--cream)' }}>
                        {c.first_name} {c.last_name}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>
                        {c.tipo} · {c.tags?.slice(0, 2).join(' · ')}
                      </div>
                    </div>
                    <Badge tone={c.temperatura === 'caliente' ? 'bad' : c.temperatura === 'tibio' ? 'warn' : c.temperatura === 'cliente' ? 'ok' : 'neutral'}>
                      {c.temperatura}
                    </Badge>
                  </Link>
                ))
              }
            </Card>
          </div>

          {/* Score & profile */}
          {profile && (
            <Card style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'var(--grad)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: '#fff',
                  }}>
                    {(profile.full_name || 'A')[0]}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
                      {profile.full_name}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                      {profile.brokerage || 'Agencia no configurada'}
                      {profile.license_ampi && ` · AMPI ${profile.license_ampi}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{profile.score_elo}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Elo</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{profile.cierres_total}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cierres</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{profile.xp}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>XP</div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <style>{`@media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </AdvisorLayout>
  );
}
