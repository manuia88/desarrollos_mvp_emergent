// /desarrollador/reportes — D9 Monthly AI Report
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmt0, fmtMXN, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Sparkle } from '../../components/icons';

export default function DesarrolladorReportes({ user, onLogout }) {
  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null);

  const load = async () => {
    const r = await api.listReports();
    setReports(r);
    if (r.length && !active) setActive(r[0]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api.generateReport();
      setActive(r); load();
      setToast({ kind: 'success', text: 'Reporte generado con Claude Sonnet 4.5' });
    } catch { setToast({ kind: 'error', text: 'Error al generar' }); }
    finally { setGenerating(false); }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D9 · REPORTES IA MENSUALES"
        title="Reportes ejecutivos narrados"
        sub="Resumen ejecutivo + wins + alertas + recomendaciones accionables generadas con Claude Sonnet 4.5."
        actions={
          <button onClick={generate} disabled={generating} data-testid="gen-report" className="btn btn-primary" style={{ opacity: generating ? 0.6 : 1 }}>
            <Sparkle size={12} />
            {generating ? 'Generando…' : 'Generar reporte mes pasado'}
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14 }} className="rep-grid">
        <Card style={{ padding: 8, height: 'fit-content' }}>
          {reports.length === 0 ? <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>Sin reportes aún.</div>
            : reports.map(r => (
              <button key={r.id} onClick={() => setActive(r)} data-testid={`rep-${r.month}`} style={{
                width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                background: r.id === active?.id ? 'rgba(99,102,241,0.10)' : 'transparent',
                border: `1px solid ${r.id === active?.id ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                <div>{r.month}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
                  {r.metrics?.absorption_pct}% abs · {r.metrics?.units_sold} cerrad.
                </div>
              </button>
            ))}
        </Card>

        {active ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>REPORTE EJECUTIVO · {active.month}</div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em', margin: 0 }}>
                  Desempeño del portafolio
                </h2>
              </div>
              <Badge tone="brand"><Sparkle size={9} /> Claude Sonnet 4.5</Badge>
            </div>

            <div style={{ padding: 18, background: 'linear-gradient(140deg, rgba(99,102,241,0.06), transparent)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 18 }}>
              <pre data-testid="rep-summary" style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {active.summary}
              </pre>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
              <Metric label="Absorción" v={`${active.metrics.absorption_pct}%`} />
              <Metric label="Unidades cerradas" v={fmt0(active.metrics.units_sold)} />
              <Metric label="Ticket promedio" v={fmtMXN(active.metrics.avg_price)} />
              <Metric label="Ingresos del mes" v={fmtMXN(active.metrics.revenue)} accent="#86efac" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }} className="rep-cols">
              <ListBox title="WINS DEL MES" items={active.wins} tone="ok" />
              <ListBox title="ALERTAS" items={active.alerts} tone="bad" />
              <ListBox title="RECOMENDACIONES" items={active.recommendations} tone="brand" />
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            Genera tu primer reporte con el botón superior.
          </Card>
        )}
      </div>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`
        @media (max-width: 940px) { .rep-grid { grid-template-columns: 1fr !important; } .rep-cols { grid-template-columns: 1fr !important; } }
      `}</style>
    </DeveloperLayout>
  );
}

function Metric({ label, v, accent }) {
  return (
    <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function ListBox({ title, items, tone }) {
  return (
    <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
          <Badge tone={tone}>{i + 1}</Badge>
          <div style={{ flex: 1 }}>{t}</div>
        </div>
      ))}
    </div>
  );
}
