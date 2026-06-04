/**
 * FichaHome — Home de la ficha del proyecto (ProyectoDetail) detrás de REACT_APP_DEV_V2.
 * Responde "¿cómo va este activo y qué hago hoy?": corona (Salud + la jugada de hoy del
 * asistente) + 4 categorías (Inventario y ritmo · Posición de mercado · Demanda y leads · Dinero).
 * Lógica oficial: memory/DEV_FICHA_HOME_SPEC.md. Cada métrica = valor + comparación + tendencia +
 * semáforo + puerta a Insights. Fase 1: dato real donde existe; conectores que faltan = stub honesto.
 */
import React, { useEffect, useState } from 'react';
import { listProjectsWithStats, getDevAmenityRanker, getConstructionProgress } from '../../api/developer';
import { getInsightsMarketValue } from '../../api/insights';
import { getCerebroStatus, runCerebroGoal, approveCerebroTask, rejectCerebroTask } from '../../api/cerebro';
import { Z } from '../../styles/zIndex';

// La dimensión más débil del score → la meta del asistente que la ataca.
const DIM_GOAL = {
  'Demanda y leads': 'attract_buyers',
  'Salud comercial': 'project_health',
  'Absorción': 'attract_buyers',
  'Ritmo de venta': 'attract_buyers',
  'Margen': 'price_project',
};
// Etiqueta humana del paso delicado que pausa esperando tu OK.
const ACTION_LABEL = {
  'content.publish_public': 'publicar la landing mejorada',
  'deal.change_price': 'aplicar el nuevo precio',
  'comm.send_external': 'enviar el mensaje al cliente',
  'dev.update_landing': 'actualizar la landing del proyecto',
};

const fmtMXN = (v) => {
  if (v == null || v === 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};
const TONE = {
  green: { dot: '#1FA06A', text: '#15803d' },
  amber: { dot: '#E2982E', text: '#B7791F' },
  red: { dot: '#F2635B', text: '#DC2626' },
  flat: { dot: 'rgba(var(--cream-rgb),0.3)', text: 'var(--cream-3)' },
};

// Tarjeta de métrica: valor + comparación + semáforo + (opcional) chip de asistente · puerta a Insights.
function Metric({ label, value, unit, cmp, tone = 'flat', spark, assistant, stub, onClick }) {
  const t = TONE[tone] || TONE.flat;
  return (
    <div className="dmx-card" data-testid="ficha-metric" onClick={onClick}
      style={{ background: '#fff', padding: '13px 15px', cursor: onClick ? 'pointer' : 'default', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{label}</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.dot }} />
      </div>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--cream)', lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 13, color: 'var(--cream-3)', fontWeight: 700 }}>{unit}</span>}
      </div>
      {cmp && <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, color: t.text }}>{cmp}</div>}
      {spark && <Spark data={spark} color={t.dot} />}
      {stub && <div style={{ fontSize: 9.5, color: 'var(--cream-3)', marginTop: 5, fontStyle: 'italic' }}>○ estimado · se conecta pronto</div>}
      {assistant && <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px dashed var(--border)', fontSize: 10.5, fontWeight: 700, color: 'var(--theme)' }}>✦ {assistant}</div>}
    </div>
  );
}

function Spark({ data, color }) {
  const w = 150, h = 24, max = Math.max(...data, 1), min = Math.min(...data, 0);
  const rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h} style={{ marginTop: 7 }}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Section({ n, title, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(var(--theme-rgb),0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{n}</span>
        {title}
        {hint && <span style={{ color: 'var(--cream-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· {hint}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>{children}</div>
    </div>
  );
}

const SCORE_ACTION = {
  'Salud comercial': 'sube ritmo: marketing + seguimiento a leads',
  'Absorción': 'acelera ventas: empuja marketing o ajusta el precio',
  'Margen': 'protege el margen: cuida costos y descuentos',
  'Ritmo de venta': 'reactiva la demanda con campañas y seguimiento a leads',
  'Demanda y leads': 'genera más leads: difusión y landing pública',
};

export default function FichaHome({ slug, summary, onOpenInsights, onOpenDiagnostic }) {
  const [stats, setStats] = useState(null);
  const [driver, setDriver] = useState(null);
  const [avm, setAvm] = useState(null);
  const [obra, setObra] = useState(null);
  const [toast, setToast] = useState(null);
  const [cerebro, setCerebro] = useState({ enabled: false, goals: {} });
  const [run, setRun] = useState(null);     // {status:'done'|'paused', results, awaiting}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listProjectsWithStats().then(r => {
      const arr = Array.isArray(r) ? r : (r.projects || r.items || []);
      setStats(arr.find(x => x.id === slug) || arr.find(x => (x.name || '') === (summary?.name || '')) || null);
    }).catch(() => {});
    getDevAmenityRanker().then(d => {
      const pos = (d.amenity_ranker || []).filter(a => a.significativo && a.impacto_pct_precio_m2 > 0).sort((a, b) => b.impacto_pct_precio_m2 - a.impacto_pct_precio_m2);
      setDriver(pos[0] || null);
    }).catch(() => {});
    getInsightsMarketValue(slug).then(setAvm).catch(() => {});
    getConstructionProgress(slug).then(setObra).catch(() => {});
    getCerebroStatus().then(s => setCerebro({ enabled: !!s.enabled, goals: s.goals || {} })).catch(() => {});
    setRun(null);
  }, [slug, summary]);

  if (!summary) return null;
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Derivados ──────────────────────────────────────────────────────────────
  const score = stats?.full_score || (summary.health_score != null ? { score: summary.health_score, breakdown: [] } : null);
  const health = score?.score ?? summary.health_score ?? 0;
  const verdict = health >= 75 ? 'Va muy bien' : health >= 60 ? 'Sano, con espacio para crecer' : health >= 45 ? 'Va con problemas' : 'Necesita tu atención';

  const by = stats?.units_by_status || summary.units_by_status || {};
  const avail = by.disponible ?? (summary.units_total - (summary.sold_units || 0) - (summary.reserved_units || 0));
  const ws = stats?.weekly_sales || [];
  const rate = ws.length ? ws.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, ws.slice(-4).length) : 0;
  const prevRate = ws.length >= 8 ? ws.slice(-8, -4).reduce((a, b) => a + b, 0) / 4 : rate;
  const months = rate > 0 ? Math.round(avail / (rate * 4.33)) : null;
  const rateTrend = rate > prevRate * 1.05 ? 'green' : rate < prevRate * 0.95 ? 'amber' : 'flat';

  const avgPrice = stats?.avg_price || ((summary.price_from + summary.price_to) / 2) || 0;
  const valorVendido = (summary.sold_units || 0) * avgPrice;
  const valorPorColocar = avail * avgPrice;
  const margin = stats?.margin || null;

  // Meses a la entrega (para "se agota vs entrega")
  const mesesEntrega = (() => {
    if (!summary.delivery_estimate) return null;
    const [y, m] = String(summary.delivery_estimate).split('-').map(Number);
    if (!y) return null;
    const n = new Date();
    return Math.max(0, (y - n.getFullYear()) * 12 + ((m || 1) - (n.getMonth() + 1)));
  })();
  const agotaTone = (months != null && mesesEntrega != null) ? (months <= mesesEntrega ? 'green' : 'red') : 'flat';
  const agotaCmp = (months != null && mesesEntrega != null)
    ? (months <= mesesEntrega ? `${mesesEntrega - months} meses antes de la entrega ✓` : `te quedas con inventario en la entrega`)
    : `${avail} uds · ritmo ${rate.toFixed(1)}/sem`;

  // AVM vs mercado (defensivo: campos varían)
  const vsMkt = avm ? (avm.vs_market_pct ?? avm.vs_pct ?? null) : null;
  const myM2 = avm ? (avm.my_price_m2 ?? avm.price_m2 ?? avm.precio_m2 ?? null) : null;
  const mktTone = vsMkt == null ? 'flat' : (vsMkt > 12 ? 'amber' : vsMkt < -8 ? 'green' : 'green');

  // Jugada de hoy: la dimensión más débil = la raíz
  const low = [...(score?.breakdown || [])].sort((a, b) => a.value - b.value)[0];
  const jugada = (() => {
    if (low && low.value < 60) {
      return {
        title: `Tu mayor freno: ${low.dim.toLowerCase()}`,
        body: `Cruzando tus números, lo que más detiene a este activo es **${low.dim.toLowerCase()}**. ${SCORE_ACTION[low.dim] || 'Atiéndelo esta semana.'}`,
        whatif: `Si lo subes ~15 puntos, tu salud pasa de ${health} a ~${Math.min(100, health + 9)} y aceleras el agotado.`,
      };
    }
    return {
      title: 'Tienes poder de precio',
      body: `Vendes con ritmo${months != null ? ` (te agotas en ${months} meses)` : ''}${margin?.margin_pct ? ` y tu margen es ${margin.margin_pct}%` : ''}. Hay espacio para mover precio en lo que más se vende, sin frenar la demanda.`,
      whatif: `Si subes 3% en los prototipos que vuelan → más ingreso sin tocar el ritmo.`,
    };
  })();

  const bold = (s) => s.split('**').map((p, i) => i % 2 ? <b key={i} style={{ color: 'var(--theme)' }}>{p}</b> : p);

  // Meta del asistente para esta jugada (solo metas runnable para el rol).
  const goalId = (() => {
    const g = cerebro.goals || {};
    const want = (low && low.value < 60) ? (DIM_GOAL[low.dim] || 'project_health') : 'price_timing';
    if (g[want]) return want;
    return ['attract_buyers', 'project_health', 'price_project', 'make_marketing', 'price_timing', 'what_if'].find(k => g[k]) || Object.keys(g)[0] || null;
  })();

  const ejecutar = async () => {
    if (onOpenDiagnostic && !cerebro.enabled) { /* fallback fuera */ }
    if (!cerebro.enabled) { flash('Tu asistente se activa al prender el Cerebro (un paso de deploy). Por ahora abre el diagnóstico para actuar a mano.'); onOpenDiagnostic && onOpenDiagnostic(); return; }
    if (!goalId) { flash('No hay una jugada ejecutable ahora mismo.'); return; }
    setBusy(true);
    try {
      const r = await runCerebroGoal(goalId, { project_id: slug });
      setRun(r);
      if (r.status === 'done') flash(`✓ Hecho · el asistente corrió ${(r.results || []).length} pasos.`);
    } catch (e) { flash('No se pudo ejecutar la jugada ahora.'); } finally { setBusy(false); }
  };
  const aprobarPaso = async () => {
    const tid = run?.awaiting?.task_id; if (!tid) return;
    setBusy(true);
    try { await approveCerebroTask(tid); setRun({ status: 'done', approved: true, results: run.results || [] }); flash('✓ Ejecutado. El asistente medirá el resultado y aprende para la próxima.'); }
    catch (e) { flash('No se pudo aprobar el paso.'); } finally { setBusy(false); }
  };
  const rechazarPaso = async () => {
    const tid = run?.awaiting?.task_id;
    if (tid) { try { await rejectCerebroTask(tid); } catch (e) { /* noop */ } }
    setRun(null); flash('Listo, el asistente no la ejecuta y aprende de esto.');
  };

  return (
    <div data-testid="ficha-home" style={{ marginBottom: 8 }}>
      {/* 👑 CORONA: Salud + la jugada de hoy */}
      <div className="dmx-card" style={{ display: 'grid', gridTemplateColumns: '218px 1fr', gap: 0, overflow: 'hidden', padding: 0, marginBottom: 22, background: '#fff' }}>
        <div style={{ background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(198,63,174,0.05))', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 12 }}>Salud del activo</div>
          <Ring value={health} />
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--cream-2)', marginTop: 12 }}>{verdict}</div>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--grad)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✦</span>
            <b style={{ fontSize: 13, color: 'var(--cream)' }}>Tu asistente</b>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', padding: '3px 10px', borderRadius: 999 }}>La jugada de hoy</span>
          </div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 16.5, fontWeight: 800, color: 'var(--cream)', marginBottom: 5 }}>{jugada.title}</div>
          <p style={{ fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, margin: '0 0 11px' }}>{bold(jugada.body)}</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.28)', color: '#15803d', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 10, marginBottom: 12 }}>⚡ {jugada.whatif}</div>
          {run?.status === 'paused' ? (
            // Tu turno: el asistente preparó un paso delicado y espera tu OK.
            <div style={{ background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.25)', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 600, marginBottom: 9 }}>
                ⏸ Tu turno · el asistente preparó <b>{ACTION_LABEL[run.awaiting?.action] || 'el paso delicado'}</b>. ¿Lo ejecuto?
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button data-testid="jugada-aprobar-paso" onClick={aprobarPaso} disabled={busy} style={{ background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>Sí, ejecutar</button>
                <button onClick={rechazarPaso} disabled={busy} style={{ background: '#fff', color: 'var(--cream-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>No, ahora no</button>
              </div>
            </div>
          ) : run?.status === 'done' ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.28)', color: '#15803d', fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 10 }}>
              ✓ El asistente ejecutó la jugada{run.results?.length ? ` · ${run.results.length} pasos` : ''}. Medirá el resultado y aprende.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <button data-testid="jugada-aprobar" onClick={ejecutar} disabled={busy}
                style={{ background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Trabajando…' : 'Aprobar y ejecutar'}</button>
              <button onClick={() => onOpenDiagnostic && onOpenDiagnostic()} style={{ background: '#fff', color: 'var(--cream-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Ver / editar</button>
              <button onClick={rechazarPaso} style={{ background: '#fff', color: 'var(--cream-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--cream-3)' }}>{cerebro.enabled ? 'Lo seguro lo hace solo · lo delicado espera tu OK' : 'Acción delicada · espera tu OK'}</span>
            </div>
          )}
        </div>
      </div>

      {/* 1 · Inventario y ritmo */}
      <Section n="1" title="Inventario y ritmo">
        <Metric label="% Vendido" value={summary.sold_pct ?? 0} unit="%" tone="green" cmp={`${summary.sold_units ?? 0} de ${summary.units_total} unidades`} onClick={onOpenInsights} />
        <Metric label="Ritmo de venta" value={rate.toFixed(1)} unit=" uds/sem" tone={rateTrend} cmp={rate > prevRate ? '↑ subiendo' : rate < prevRate ? '↓ bajando' : '→ estable'} spark={ws.length ? ws.slice(-8) : null} onClick={onOpenInsights} />
        <Metric label="Se agota en" value={months != null ? months : '—'} unit={months != null ? ' meses' : ''} tone={agotaTone} cmp={agotaCmp} onClick={onOpenInsights} />
        <Metric label="Avance de obra" value={obra?.overall_percent ?? summary.construction_pct ?? 0} unit="%" tone={(obra?.overall_percent ?? summary.construction_pct ?? 0) > 0 ? 'green' : 'flat'}
          cmp={obra?.current_stage ? `En tiempo · ${String(obra.current_stage).replace(/_/g, ' ')}` : 'En tiempo según calendario'} onClick={onOpenInsights} />
      </Section>

      {/* 2 · Posición de mercado */}
      <Section n="2" title="Posición de mercado" hint="tu dato × la zona">
        <Metric label="Tu precio /m²"
          value={myM2 ? fmtMXN(myM2) : (vsMkt != null ? `${vsMkt > 0 ? '+' : ''}${Math.round(vsMkt)}%` : '—')}
          tone={mktTone}
          cmp={vsMkt != null ? (myM2 ? `${vsMkt > 0 ? '+' : ''}${Math.round(vsMkt)}% vs la zona` : 'vs la zona') + (vsMkt > 12 ? ' · caro' : vsMkt < -8 ? ' · barato' : ' · en línea') : 'sin comparativo aún'}
          stub={vsMkt == null} assistant={vsMkt != null && vsMkt > 12 ? 'Hay una jugada de precio' : null} onClick={onOpenInsights} />
        <Metric label="Qué sube el valor" value={driver ? driver.atributo : '—'} tone={driver ? 'green' : 'flat'}
          cmp={driver ? `+${driver.impacto_pct_precio_m2}% en precio/m² · tu mercado` : 'sin muestra suficiente'} onClick={onOpenInsights} />
        <Metric label="Demanda de la zona" value="Estable" tone="flat" cmp="tendencia de búsquedas" stub assistant="El asistente lo vigila" onClick={onOpenInsights} />
      </Section>

      {/* 3 · Demanda y leads */}
      <Section n="3" title="Demanda y leads">
        <Metric label="Leads activos" value={summary.leads_active ?? 0} tone={(summary.leads_active ?? 0) > 0 ? 'green' : 'amber'} cmp={(summary.leads_active ?? 0) > 0 ? 'en seguimiento' : 'genera más leads'} onClick={onOpenInsights} />
        <Metric label="Leads calientes" value="—" tone="flat" cmp="a punto de cerrar" stub assistant="El asistente prioriza el seguimiento" onClick={onOpenInsights} />
        <Metric label="Conversión del embudo" value="—" tone="flat" cmp="vista → lead → cita → cierre" stub onClick={onOpenInsights} />
      </Section>

      {/* 4 · Dinero */}
      <Section n="4" title="Dinero">
        <Metric label="Vendido (valor)" value={fmtMXN(valorVendido)} tone="green" cmp={`${fmtMXN(valorPorColocar)} por colocar`} onClick={onOpenInsights} />
        <Metric label="Margen estimado" value={margin?.margin_pct != null ? margin.margin_pct : '—'} unit={margin?.margin_pct != null ? '%' : ''}
          tone={margin ? (margin.color === 'green' ? 'green' : margin.color === 'red' ? 'red' : 'amber') : 'flat'}
          cmp={margin?.verdict || 'sin dato de costos'} onClick={onOpenInsights} />
        <Metric label="Inventario por colocar" value={avail} unit=" uds" tone={avail > 0 ? 'amber' : 'green'} cmp={`${fmtMXN(valorPorColocar)} en inventario`} assistant={avail > 0 ? 'El asistente propone incentivos' : null} onClick={onOpenInsights} />
      </Section>

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <button onClick={onOpenInsights} style={{ background: 'none', border: 'none', color: 'var(--theme)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Ver todo el análisis en Insights →</button>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY, background: '#1E2230', color: '#fff', padding: '12px 18px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, maxWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}
    </div>
  );
}

function Ring({ value }) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, Math.max(0, value)) / 100);
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={r} stroke="#ECEDF2" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke="url(#fhg)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <defs><linearGradient id="fhg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D4AFF" /><stop offset="1" stopColor="#C63FAE" /></linearGradient></defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <b style={{ fontFamily: 'Outfit,sans-serif', fontSize: 34, fontWeight: 800, color: 'var(--cream)', lineHeight: 1 }}>{Math.round(value)}</b>
        <span style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>de 100</span>
      </div>
    </div>
  );
}
