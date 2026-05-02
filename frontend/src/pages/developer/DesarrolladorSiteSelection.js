/**
 * DesarrolladorSiteSelection — Phase 4 Batch 7 · 4.22
 * Site Selection AI standalone page · 3 tabs: Estudios | Crear | Resultados.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0 } from '../../components/advisor/primitives';
import { Sparkle, MapPin, Target, Activity, Plus, Download, ArrowRight, X, BarChart, AlertTriangle } from '../../components/icons';
import * as api from '../../api/developer';
import SiteSelectionWizard from '../../components/developer/SiteSelectionWizard';
import SiteSelectionMap from '../../components/developer/SiteSelectionMap';
import RadarChart from '../../components/developer/RadarChart';
import CompareTab from '../../components/developer/CompareTab';
import ExpansionSimulatorModal from '../../components/developer/ExpansionSimulatorModal';
import DemographicsSection from '../../components/developer/DemographicsSection';

function StatusPill({ status }) {
  const map = {
    draft: { tone: 'neutral', label: 'Borrador' },
    running: { tone: 'brand', label: 'Ejecutando' },
    completed: { tone: 'ok', label: 'Completado' },
    failed: { tone: 'bad', label: 'Falló' },
  };
  const o = map[status] || { tone: 'neutral', label: status };
  return <Badge tone={o.tone} data-testid={`site-status-${status}`}>{o.label}</Badge>;
}

function TabButton({ active, onClick, children, testid }) {
  return (
    <button data-testid={testid} onClick={onClick} style={{
      padding: '11px 16px', background: 'transparent', border: 'none',
      borderBottom: `2px solid ${active ? '#EC4899' : 'transparent'}`,
      color: active ? 'var(--cream)' : 'var(--cream-3)',
      fontFamily: 'DM Sans', fontWeight: active ? 600 : 500, fontSize: 13,
      cursor: 'pointer', marginBottom: -1,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  );
}

function StudyDetailDrawer({ zone, studyId, onClose, onSimulate }) {
  if (!zone) return null;
  const sub = zone.sub_scores || {};
  return (
    <div data-testid="site-zone-drawer" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
      background: '#0b0e18', borderLeft: '1px solid var(--border)', zIndex: 1200,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '-12px 0 32px rgba(0,0,0,0.42)',
    }}>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--cream-3)', marginBottom: 3 }}>ZONA · #{zone._rank} CANDIDATA</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>{zone.colonia}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>{zone.alcaldia} · {zone.state}</div>
        </div>
        <button data-testid="site-drawer-close" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--cream-2)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '16px 22px', flex: 1 }}>
        <button data-testid="site-zone-simulate" onClick={() => onSimulate && onSimulate(zone)} style={{
          width: '100%', marginBottom: 14, padding: '10px 14px', borderRadius: 10,
          background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
          border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><BarChart size={12} /> Simular expansión en esta zona</button>

        {/* Headline KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.32)', borderRadius: 10 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>FEASIBILITY</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{zone.feasibility_score}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.32)', borderRadius: 10 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>ROI 5y</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{zone.estimated_roi_5y}%</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>UNIDADES EST.</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{zone.target_units_estimate}</div>
          </div>
        </div>

        {/* Radar */}
        <Card style={{ marginBottom: 14, padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>SUB-SCORES</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadarChart data={sub} size={240} />
          </div>
        </Card>

        {/* Narrative */}
        <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04) 60%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Sparkle size={13} color="#f9a8d4" />
            <div className="eyebrow" style={{ color: '#f9a8d4' }}>NARRATIVE IA · CLAUDE HAIKU</div>
          </div>
          <p data-testid="site-zone-narrative" style={{ fontFamily: 'DM Sans', fontSize: 13.2, color: 'var(--cream)', lineHeight: 1.55, margin: 0 }}>
            {zone.narrative || '—'}
          </p>
        </Card>

        {/* Phase 4 Batch 7.2 — INEGI demographics */}
        <DemographicsSection zone={zone} />

        {/* Pros/Cons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Card style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: '#86efac' }}>PROS</div>
            <ul data-testid="site-zone-pros" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(zone.pros || []).map((p, i) => (
                <li key={i} style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>• {p}</li>
              ))}
            </ul>
          </Card>
          <Card style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: '#fca5a5' }}>CONS</div>
            <ul data-testid="site-zone-cons" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(zone.cons || []).map((c, i) => (
                <li key={i} style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>• {c}</li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Data points */}
        <Card>
          <div className="eyebrow" style={{ marginBottom: 8 }}>DATA POINTS</div>
          <table style={{ width: '100%', fontFamily: 'DM Sans', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(zone.data_points || {})
                .filter(([k, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
                .map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--cream-3)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '6px 0', color: 'var(--cream)', textAlign: 'right', fontWeight: 600 }}>
                    {typeof v === 'number' ? (k.includes('price') ? `$${v.toLocaleString()}` : v) : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function StudiesTab({ studies, onOpen, onNew }) {
  return (
    <div data-testid="site-studies-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="eyebrow">{studies.length} ESTUDIOS</div>
        <button data-testid="site-new-btn" onClick={onNew} style={{
          padding: '9px 16px', borderRadius: 9999,
          background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
          border: 'none', color: '#fff',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}><Plus size={12} /> Nuevo estudio</button>
      </div>

      {studies.length === 0 ? (
        <Card style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: 9999,
                        background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.32)',
                        marginBottom: 12 }}>
            <Sparkle size={22} color="#f9a8d4" />
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
            Tu primer estudio en 4 pasos
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 480, margin: '6px auto 14px', lineHeight: 1.55 }}>
            Define criterios y presupuesto. La IA evalúa zonas candidatas, calcula feasibility 0-100, ROI proyectado y narrative honesta con pros/cons.
          </p>
          <button data-testid="site-empty-cta" onClick={onNew} style={{
            padding: '9px 18px', borderRadius: 9999,
            background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>Crear estudio</button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {studies.map(s => (
            <Card key={s.id} data-testid={`site-study-${s.id}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(s)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{s.name}</div>
                <StatusPill status={s.status} />
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                {s.inputs?.project_type || '—'} · {s.inputs?.target_segment || '—'}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6 }}>
                Creado: {(s.created_at || '').slice(0, 10)} · {(s.inputs?.total_units_target || 0)} unidades target
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600 }}>
                Ver detalles <ArrowRight size={11} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultsTab({ study, onRefresh, onExport, onSelectZone, selectedZoneId }) {
  if (!study) {
    return <Card style={{ padding: 36, textAlign: 'center', color: 'var(--cream-3)' }}>Selecciona un estudio en la pestaña "Estudios".</Card>;
  }
  const zones = (study.candidate_zones || []).map((z, i) => ({ ...z, _rank: i + 1 }));
  const isRunning = study.status === 'running';
  const isFailed = study.status === 'failed';

  return (
    <div data-testid="site-results-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>ESTUDIO ACTIVO</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{study.name}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
              {study.inputs?.project_type} · {study.inputs?.target_segment} · {study.inputs?.total_units_target} unidades
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusPill status={study.status} />
            {isRunning && (
              <button data-testid="site-refresh-btn" onClick={onRefresh} style={{
                padding: '7px 12px', borderRadius: 9999, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer',
              }}>Refrescar</button>
            )}
            {study.status === 'completed' && (
              <button data-testid="site-export-btn" onClick={onExport} style={{
                padding: '7px 12px', borderRadius: 9999,
                background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
                border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
              }}><Download size={11} /> Exportar PDF</button>
            )}
          </div>
        </div>
      </Card>

      {isFailed && (
        <Card style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)' }}>
          <div className="eyebrow" style={{ color: '#fca5a5', marginBottom: 6 }}>EL MOTOR FALLÓ</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>
            {study.error_message || 'Error sin detalle. Crea un nuevo estudio para reintentar.'}
          </div>
        </Card>
      )}

      {isRunning && (
        <Card style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: 9999,
                        background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.32)',
                        marginBottom: 12 }}>
            <Sparkle size={22} color="#f9a8d4" />
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>Motor IA en ejecución…</div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 460, margin: '6px auto 0', lineHeight: 1.55 }}>
            Filtrando 16 colonias, calculando feasibility, llamando Claude haiku para narrative + pros/cons. ETA ~30-90s.
          </p>
        </Card>
      )}

      {study.status === 'completed' && zones.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }} className="site-grid">
          <SiteSelectionMap zones={zones} selectedId={selectedZoneId} onSelect={onSelectZone} height={520} />
          <div data-testid="site-ranking-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 520 }}>
            <div className="eyebrow">RANKING · {zones.length} ZONAS</div>
            {zones.map(z => (
              <button key={z.colonia_id} data-testid={`site-zone-${z.colonia_id}`} onClick={() => onSelectZone(z.colonia_id)} style={{
                textAlign: 'left', padding: '11px 14px',
                background: selectedZoneId === z.colonia_id ? 'rgba(236,72,153,0.12)' : 'rgba(240,235,224,0.03)',
                border: '1px solid ' + (selectedZoneId === z.colonia_id ? 'rgba(236,72,153,0.4)' : 'var(--border)'),
                borderRadius: 12, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
                    <span style={{ color: 'var(--cream-3)', marginRight: 6, fontSize: 11 }}>#{z._rank}</span>
                    {z.colonia}
                  </div>
                  <Badge tone={z.feasibility_score > 75 ? 'brand' : z.feasibility_score > 50 ? 'ok' : 'neutral'}>{z.feasibility_score}</Badge>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 5 }}>
                  ROI 5y {z.estimated_roi_5y}% · {z.target_units_estimate} unidades · ${fmt0(z.target_price_range?.min || 0)}/m²
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@media (max-width: 940px) { .site-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

export default function DesarrolladorSiteSelection({ user, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillColonia = searchParams.get('prefill_colonia');
  const prefillState = searchParams.get('prefill_state');
  const fromHeatmap = searchParams.get('from') === 'heatmap';

  const [tab, setTab] = useState(fromHeatmap ? 'create' : 'studies');
  const [studies, setStudies] = useState([]);
  const [activeStudy, setActiveStudy] = useState(null);
  const [activeStudyDetail, setActiveStudyDetail] = useState(null);
  const [showWizard, setShowWizard] = useState(fromHeatmap);
  const [drawerZoneId, setDrawerZoneId] = useState(null);
  const [simulateZone, setSimulateZone] = useState(null);

  const loadStudies = useCallback(() => {
    api.listSiteStudies().then(d => setStudies(d.items || [])).catch(() => setStudies([]));
  }, []);
  useEffect(() => { loadStudies(); }, [loadStudies]);

  // Polling for active running study
  useEffect(() => {
    if (!activeStudy) return;
    let cancelled = false;
    const tick = () => {
      api.getSiteStudy(activeStudy.id).then(d => {
        if (cancelled) return;
        setActiveStudyDetail(d);
        if (d.status === 'completed' || d.status === 'failed') return;
        setTimeout(tick, 3500);
      }).catch(() => { if (!cancelled) setTimeout(tick, 6000); });
    };
    tick();
    return () => { cancelled = true; };
  }, [activeStudy]);

  const openStudy = (s) => {
    setActiveStudy(s);
    setActiveStudyDetail(s);
    setTab('results');
    setDrawerZoneId(null);
  };
  const onCreated = (study) => {
    setShowWizard(false);
    // Clear prefill query params after creation
    if (fromHeatmap) {
      const next = new URLSearchParams(searchParams);
      next.delete('prefill_colonia'); next.delete('prefill_state'); next.delete('from');
      setSearchParams(next, { replace: true });
    }
    loadStudies();
    openStudy(study);
  };
  const onExport = async () => {
    if (!activeStudyDetail) return;
    try {
      const r = await api.exportSiteStudyPdf(activeStudyDetail.id);
      window.open(api.siteStudyDownloadUrl(r.file_id), '_blank');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('No se pudo exportar PDF: ' + (e.message || ''));
    }
  };

  const drawerZone = activeStudyDetail?.candidate_zones?.find(z => z.colonia_id === drawerZoneId);
  const drawerZoneWithRank = drawerZone
    ? { ...drawerZone, _rank: (activeStudyDetail.candidate_zones || []).indexOf(drawerZone) + 1 }
    : null;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="4.22 · SITE SELECTION AI"
        title="Selección de zonas"
        sub="Motor IA recomendación de colonias candidatas con feasibility 0-100, ROI proyectado y narrative Claude haiku para nuevos proyectos."
      />

      {/* Tabs */}
      <div data-testid="site-tabs" style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <TabButton testid="site-tab-studies" active={tab === 'studies'} onClick={() => setTab('studies')}><Sparkle size={12} /> Estudios</TabButton>
        <TabButton testid="site-tab-create" active={tab === 'create'} onClick={() => { setTab('create'); setShowWizard(true); }}><Plus size={12} /> Crear estudio</TabButton>
        <TabButton testid="site-tab-compare" active={tab === 'compare'} onClick={() => setTab('compare')}><BarChart size={12} /> Comparar</TabButton>
        <TabButton testid="site-tab-results" active={tab === 'results'} onClick={() => setTab('results')}><Activity size={12} /> Resultados</TabButton>
      </div>

      {tab === 'studies' && (
        <StudiesTab studies={studies} onOpen={openStudy} onNew={() => { setTab('create'); setShowWizard(true); }} />
      )}

      {tab === 'create' && (
        <Card style={{ padding: 28, textAlign: 'center' }}>
          <Target size={28} color="#f9a8d4" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginTop: 10 }}>Wizard 4 pasos</div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 480, margin: '6px auto 14px', lineHeight: 1.55 }}>
            Define el alcance del estudio, presupuesto y features deseadas/evitar. La IA hace el resto.
          </p>
          <button data-testid="site-open-wizard" onClick={() => setShowWizard(true)} style={{
            padding: '9px 18px', borderRadius: 9999,
            background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
            border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>Abrir wizard</button>
        </Card>
      )}

      {tab === 'compare' && (
        <CompareTab />
      )}

      {tab === 'results' && (
        <ResultsTab
          study={activeStudyDetail}
          onRefresh={() => activeStudy && api.getSiteStudy(activeStudy.id).then(setActiveStudyDetail)}
          onExport={onExport}
          selectedZoneId={drawerZoneId}
          onSelectZone={setDrawerZoneId}
        />
      )}

      {showWizard && (
        <SiteSelectionWizard
          onClose={() => setShowWizard(false)}
          onCreated={onCreated}
          prefillColonia={prefillColonia}
          prefillState={prefillState}
          fromHeatmap={fromHeatmap}
        />
      )}

      <StudyDetailDrawer
        zone={drawerZoneWithRank}
        studyId={activeStudyDetail?.id}
        onClose={() => setDrawerZoneId(null)}
        onSimulate={(z) => setSimulateZone(z)}
      />

      {simulateZone && activeStudyDetail && (
        <ExpansionSimulatorModal
          studyId={activeStudyDetail.id}
          zoneColonia={simulateZone.colonia}
          defaultPrice={simulateZone.target_price_range?.min || activeStudyDetail.inputs?.price_range_per_m2?.min || 80000}
          onClose={() => setSimulateZone(null)}
        />
      )}
    </DeveloperLayout>
  );
}
