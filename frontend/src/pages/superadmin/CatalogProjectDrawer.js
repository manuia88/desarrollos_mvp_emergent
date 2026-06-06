/**
 * CatalogProjectDrawer (B3.2 upgrade) — ficha COMPLETA de un proyecto para el superadmin (vista de dios).
 * Tres lentes: lo que ve el comprador (público) + lo INTERNO del dev (comisión/políticas/costos) +
 * operación (demanda real). El superadmin ve TODO lo de la plataforma, no solo el concentrado.
 */
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchCatalogProject, ASSET_BASE } from '../../api/superadminCatalogPulse';

const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const sectionCard = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };

function Section({ title, sub, children }) {
  return (
    <div style={{ ...sectionCard, marginBottom: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
        {sub && <div style={{ fontSize: 11, ...mute, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, ...dim }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: tone || 'var(--sa-text)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const cobToBadge = (ok) => ok ? { t: 'Sí', c: '#34D399' } : { t: 'No', c: 'var(--sa-text-mute)' };

export default function CatalogProjectDrawer({ projectId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchCatalogProject(projectId).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [projectId]);

  const cov = d?.comprador || {};
  const it = d?.interno || {};
  const op = d?.operacion || {};
  const bp = it.broker_policy || {};
  const sp = it.sales_policy || {};

  return (
    <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(640px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--bg-base, #0a0a12)', borderLeft: '1px solid var(--sa-border)', padding: 22 }}>
        <button onClick={onClose} data-testid="drawer-close" style={{ position: 'sticky', top: 0, float: 'right', width: 32, height: 32, borderRadius: 9999, background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)', cursor: 'pointer' }}><X size={15} /></button>

        {err && <div style={{ ...sectionCard, color: '#FCA5A5' }}>No se pudo cargar: {err}</div>}
        {!d && !err && <div style={mute}>Cargando ficha completa…</div>}

        {d && (
          <div data-testid="catalog-detail">
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              {d.cover && <img src={d.cover.startsWith('/api') ? `${ASSET_BASE}${d.cover}` : d.cover} alt="" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 14, marginBottom: 12 }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--sa-text)', margin: 0 }}>{d.nombre}</h2>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: d.publicado ? '#34D399' : 'var(--sa-text-mute)', background: d.publicado ? 'rgba(52,211,153,0.12)' : 'var(--bg-card-2)' }}>
                  {d.publicado ? 'Publicado' : 'No publicado'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.readiness?.pct >= 80 ? '#34D399' : 'var(--theme)' }}>{d.readiness?.pct}% ficha</span>
              </div>
              <div style={{ fontSize: 12.5, ...dim, marginTop: 3 }}>{d.colonia} · desde {mxn(d.price_from)} · {d.stage} · {d.units_total || '—'} unidades</div>
            </div>

            {/* Comprador (público) */}
            <Section title="🏠 Lo que ve el comprador" sub="Igual que en el marketplace público">
              <Row label="Amenidades" value={`${(cov.amenidades || []).length}`} />
              <Row label="Servicios" value={Object.keys(cov.servicios || {}).join(', ') || '—'} />
              <Row label="Formas de pago" value={(cov.formas_pago || []).map(s => s.nombre).join(' · ') || '—'} />
              <Row label="Sistema constructivo" value={cov.sello_constructivo?.configured ? cov.sello_constructivo.titulo : '—'} />
              <Row label="Sello legal" value={cov.sello_legal?.titulo || '—'} tone={cov.sello_legal?.tier === 'green' ? '#34D399' : undefined} />
              <Row label="Plusvalía" value={cov.plusvalia_pct != null ? `+${cov.plusvalia_pct}%` : '—'} />
              <Row label="Fotos" value={`${cov.fotos || 0}`} />
            </Section>

            {/* Interno (solo dev) */}
            <Section title="🔒 Lo interno (solo el desarrollador)" sub="No sale al comprador. Aquí lo ve el corporativo.">
              {!it.comercializacion_configurada && (
                <div style={{ fontSize: 11.5, color: '#FBBF24', marginBottom: 8 }}>⚠ El dev aún no configura su política comercial (valores por defecto).</div>
              )}
              <Row label="Comisión al asesor" value={it.comision_pct != null ? `${it.comision_pct}%` : '—'} tone="var(--theme)" />
              <Row label="Trabaja con brokers" value={cobToBadge(it.trabaja_con_brokers).t} tone={cobToBadge(it.trabaja_con_brokers).c} />
              <Row label="Solo venta interna" value={cobToBadge(it.solo_interno).t} />
              {bp.registro_leads && <Row label="Registro de leads" value={bp.registro_leads} />}
              {bp.descuento_max_pct != null && <Row label="Descuento máx" value={`${bp.descuento_max_pct}%`} />}
              {bp.cobrokering_reparto && <Row label="Co-brokering" value={bp.cobrokering_reparto} />}
              {sp.apartado_mxn != null && <Row label="Apartado" value={mxn(sp.apartado_mxn)} />}
              <Row label="Costo de construcción" value={mxn(it.costo_construccion)} />
              <Row label="Precio objetivo" value={mxn(it.precio_objetivo)} />
              <Row label="Meta de absorción" value={it.absorcion_meses_meta ? `${it.absorcion_meses_meta} meses` : '—'} />
              <Row label="Documentos legales" value={`${it.documentos_legales || 0}`} />
              <Row label="Desarrolladora (org)" value={it.dev_org_id || '—'} />
            </Section>

            {/* Operación */}
            <Section title="📊 Operación" sub="Demanda real del mercado por este proyecto.">
              <Row label="Compradores interesados" value={`${op.leads_interes || 0}`} tone={op.leads_interes ? 'var(--theme)' : undefined} />
              <Row label="Planes que piden" value={(op.demanda_planes || []).map(p => `${p.plan} (${p.veces})`).join(' · ') || 'Aún ninguno'} />
            </Section>

            {/* Qué le falta */}
            {(d.readiness?.missing || []).length > 0 && (
              <Section title="🧩 Qué le falta a la ficha">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {d.readiness.missing.map((m, i) => (
                    <span key={i} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)', ...dim }}>{m.label}</span>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
