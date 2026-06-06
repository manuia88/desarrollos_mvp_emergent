/**
 * SuperadminDesarrolloFicha (Dev-Master · Fase 1) — ficha completa de un desarrollo para el superadmin,
 * en 3 lentes: Concentrado (estado, lo que ve el comprador) · Analítica (reusa los cockpits del dev:
 * AVM/forecast/canales/ventas — "junta lo disperso") · Solo superadmin (interno + comparativo + auditoría).
 * Para EDITAR como el dev → botón "Impersonar" (reusa el de tenants, cero deuda).
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { ArrowLeft, UserCog } from 'lucide-react';
import { fetchDevmasterProject, ASSET_BASE } from '../../api/superadminDevmaster';
import { impersonateTenant } from '../../api/superadminTenants';
import InsightsIntel from '../../components/developer/InsightsIntel';
import CanalesIntel from '../../components/developer/CanalesIntel';
import VentasIntel from '../../components/developer/VentasIntel';

const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const TABS = [['concentrado', 'Concentrado'], ['analitica', 'Analítica'], ['superadmin', 'Solo superadmin']];

function Row({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, ...dim }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: tone || 'var(--sa-text)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
function Section({ title, sub, children }) {
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: '0 0 2px' }}>{title}</h3>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  );
}
function CompareBar({ label, mio, promedio, percentil, fmt }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{label}</span>
        <span style={dim}>{fmt(mio)} · vs prom {fmt(promedio)}</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percentil}%`, borderRadius: 999, background: percentil >= 50 ? '#34D399' : 'var(--theme)' }} />
      </div>
      <div style={{ fontSize: 10.5, ...mute, marginTop: 3 }}>Percentil {percentil} de su cohorte</div>
    </div>
  );
}

export default function SuperadminDesarrolloFicha({ user, onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('concentrado');
  const [imp, setImp] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchDevmasterProject(id).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id]);

  const impersonar = async () => {
    if (!d?.interno?.dev_org_id) return;
    setImp(true);
    try { await impersonateTenant(d.interno.dev_org_id); window.location.href = `/desarrollador/proyectos/${id}`; }
    catch { setImp(false); }
  };

  const cov = d?.comprador || {};
  const it = d?.interno || {};
  const op = d?.operacion || {};
  const cmp = d?.comparativo || {};

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <button onClick={() => navigate('/superadmin/desarrollos')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--sa-text-dim)', cursor: 'pointer', fontSize: 13, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Desarrollos
      </button>

      {err && <div style={{ ...card, color: '#FCA5A5' }}>No se pudo cargar: {err}</div>}
      {!d && !err && <div style={mute}>Cargando ficha…</div>}

      {d && (
        <div>
          {/* Header */}
          <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {d.cover && <img src={d.cover.startsWith('/api') ? `${ASSET_BASE}${d.cover}` : d.cover} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 10 }} />}
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--sa-text)', margin: 0 }}>{d.nombre}</h1>
              <div style={{ fontSize: 12.5, ...dim, marginTop: 3 }}>{d.colonia} · desde {mxn(d.price_from)} · {d.stage} · {d.units_total || '—'} unidades · {it.dev_org_id || '—'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.readiness?.pct >= 80 ? '#34D399' : 'var(--theme)' }}>{d.readiness?.pct}% ficha</span>
                <span style={{ fontSize: 11, fontWeight: 700, ...(d.publicado ? { color: '#34D399' } : mute) }}>{d.publicado ? '· Publicado' : '· No publicado'}</span>
              </div>
            </div>
            <button onClick={impersonar} disabled={imp} data-testid="impersonar-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--grad)', color: 'var(--theme-text, #1a0009)', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <UserCog size={14} /> {imp ? 'Entrando…' : 'Impersonar dev (editar)'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`} style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: tab === k ? 'var(--theme)' : 'var(--bg-card)', color: tab === k ? 'var(--theme-text, #1a0009)' : 'var(--sa-text-dim)',
                border: '1px solid var(--sa-border)',
              }}>{label}</button>
            ))}
          </div>

          {/* Concentrado */}
          {tab === 'concentrado' && (
            <div data-testid="tab-content-concentrado">
              <Section title="🏠 Lo que ve el comprador">
                <Row label="Amenidades" value={`${(cov.amenidades || []).length}`} />
                <Row label="Servicios" value={Object.keys(cov.servicios || {}).join(', ') || '—'} />
                <Row label="Formas de pago" value={(cov.formas_pago || []).map(s => s.nombre).join(' · ') || '—'} />
                <Row label="Sistema constructivo" value={cov.sello_constructivo?.configured ? cov.sello_constructivo.titulo : '—'} />
                <Row label="Sello legal" value={cov.sello_legal?.titulo || '—'} tone={cov.sello_legal?.tier === 'green' ? '#34D399' : undefined} />
                <Row label="Plusvalía" value={cov.plusvalia_pct != null ? `+${cov.plusvalia_pct}%` : '—'} />
                <Row label="Fotos" value={`${cov.fotos || 0}`} />
              </Section>
              <Section title="📊 Operación" sub="Demanda real del mercado por este proyecto.">
                <Row label="Compradores interesados" value={`${op.leads_interes || 0}`} tone={op.leads_interes ? 'var(--theme)' : undefined} />
                <Row label="Planes que piden" value={(op.demanda_planes || []).map(p => `${p.plan} (${p.veces})`).join(' · ') || 'Aún ninguno'} />
              </Section>
              {(d.readiness?.missing || []).length > 0 && (
                <Section title="🧩 Qué le falta a la ficha">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {d.readiness.missing.map((m, i) => <span key={i} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)', ...dim }}>{m.label}</span>)}
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* Analítica — reusa los cockpits del dev (junta lo disperso) */}
          {tab === 'analitica' && (
            <div data-testid="tab-content-analitica" className="theme-light-scope"
              style={{ background: 'var(--bg, #FAFAFB)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
              <InsightsIntel slug={id} />
              <CanalesIntel slug={id} />
              <VentasIntel slug={id} />
            </div>
          )}

          {/* Solo superadmin */}
          {tab === 'superadmin' && (
            <div data-testid="tab-content-superadmin">
              <Section title="🔒 Lo interno (solo el desarrollador)" sub="No sale al comprador.">
                {!it.comercializacion_configurada && <div style={{ fontSize: 11.5, color: '#FBBF24', marginBottom: 8 }}>⚠ El dev aún no configura su política comercial (valores por defecto).</div>}
                <Row label="Comisión al asesor" value={it.comision_pct != null ? `${it.comision_pct}%` : '—'} tone="var(--theme)" />
                <Row label="Trabaja con brokers" value={it.trabaja_con_brokers ? 'Sí' : 'No'} />
                <Row label="Costo de construcción" value={mxn(it.costo_construccion)} />
                <Row label="Precio objetivo" value={mxn(it.precio_objetivo)} />
                <Row label="Meta de absorción" value={it.absorcion_meses_meta ? `${it.absorcion_meses_meta} meses` : '—'} />
                <Row label="Documentos legales" value={`${it.documentos_legales || 0}`} />
              </Section>
              {cmp.cohorte && (
                <Section title="📐 Comparativo" sub={`Este desarrollo vs ${cmp.cohorte} (${cmp.n} proyectos).`}>
                  <CompareBar label="Precio desde" mio={cmp.precio?.mio} promedio={cmp.precio?.promedio} percentil={cmp.precio?.percentil} fmt={mxn} />
                  <CompareBar label="Ficha completa" mio={cmp.readiness?.mio} promedio={cmp.readiness?.promedio} percentil={cmp.readiness?.percentil} fmt={(v) => `${v ?? 0}%`} />
                  <CompareBar label="Demanda (interesados)" mio={cmp.demanda?.mio} promedio={cmp.demanda?.promedio} percentil={cmp.demanda?.percentil} fmt={(v) => `${v ?? 0}`} />
                </Section>
              )}
              <Section title="🧾 Auditoría">
                <button onClick={() => navigate(`/superadmin/audit-log?entity=${id}`)} style={{ background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)', color: 'var(--sa-text-dim)', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer' }}>
                  Ver historial de cambios de este desarrollo →
                </button>
              </Section>
            </div>
          )}
        </div>
      )}
    </SuperadminLayout>
  );
}
