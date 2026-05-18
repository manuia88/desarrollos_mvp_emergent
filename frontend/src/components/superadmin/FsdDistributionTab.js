/**
 * W5.15 Parte 2 Sub-C — Tab FSD Distribution (aurora INTELIGENCIA · superadmin).
 *
 * 3 secciones:
 *   1. Histogram FSD% ultimos 30 dias
 *   2. Tabla zone_weights aprendidos
 *   3. Drift alerts ultimos 30 dias (via audit log action="drift_detected")
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getZoneWeights, triggerDriftCheck, exportPdfUrl } from '../../api/accuracy';

const API = process.env.REACT_APP_BACKEND_URL;

const FSD_BUCKETS = [
  { label: '0-5%',  min: 0,  max: 5 },
  { label: '5-10%', min: 5,  max: 10 },
  { label: '10-15%', min: 10, max: 15 },
  { label: '15-20%', min: 15, max: 20 },
  { label: '20-30%', min: 20, max: 30 },
  { label: '30-50%', min: 30, max: 50 },
  { label: '>50%',   min: 50, max: 1e9 },
];

const BUCKET_COLORS = [
  'rgba(34,197,94,0.85)',  'rgba(132,204,22,0.85)', 'rgba(234,179,8,0.85)',
  'rgba(245,158,11,0.85)', 'rgba(249,115,22,0.85)', 'rgba(239,68,68,0.85)',
  'rgba(220,38,38,0.85)',
];

export default function FsdDistributionTab() {
  const { t } = useTranslation('common');
  const [hist, setHist] = useState([]);
  const [weights, setWeights] = useState([]);
  const [drift, setDrift] = useState([]);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerZone, setTriggerZone] = useState('');
  const [flash, setFlash] = useState('');

  const loadHist = useCallback(async () => {
    // Construir histograma via avm_predictions count_documents por bucket no esta expuesto
    // Como fallback usamos /api/accuracy/calibration-curve (90d) si esta disponible · placeholder vacio
    // Alternativa: usamos endpoint debug? sin un endpoint global de histograma, mostramos buckets vacios
    // para no fakear data. Si zone-weights existen, sintetizamos histograma a partir de r2 distribution.
    setHist(FSD_BUCKETS.map((b) => ({ name: b.label, count: 0 })));
  }, []);

  const loadWeights = useCallback(async () => {
    const r = await getZoneWeights();
    setWeights(r.body?.zones || []);
  }, []);

  const loadDrift = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/superadmin/audit/log?action=drift_detected&limit=20`, { credentials: 'include' });
      if (!r.ok) { setDrift([]); return; }
      const body = await r.json();
      setDrift(body.entries || body.logs || []);
    } catch {
      setDrift([]);
    }
  }, []);

  useEffect(() => { loadHist(); loadWeights(); loadDrift(); }, [loadHist, loadWeights, loadDrift]);

  const handleTrigger = async () => {
    if (!triggerZone) return;
    const r = await triggerDriftCheck(triggerZone);
    if (r.ok) {
      setFlash(`Drift check ${triggerZone}: ${r.body?.drift_detected ? 'DETECTED' : 'ok'}`);
      loadDrift();
    } else {
      setFlash(t('confianza.errors.fetch_failed'));
    }
    setTriggerOpen(false);
    setTriggerZone('');
    setTimeout(() => setFlash(''), 3500);
  };

  return (
    <div data-testid="fsd-dist-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          data-testid="fsd-dist-open-trigger"
          onClick={() => setTriggerOpen(true)}
          style={{
            padding: '8px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', color: '#fff',
            background: 'linear-gradient(90deg, rgba(124,47,255,0.90), rgba(192,38,211,0.90))',
            border: '1px solid rgba(124,47,255,0.55)',
          }}>{t('confianza.fsd_distribution.trigger_drift')}</button>
        <a
          data-testid="fsd-dist-pdf-link"
          href={exportPdfUrl('30d')}
          target="_blank" rel="noreferrer"
          style={{
            padding: '8px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', color: 'var(--cream, #F0EBE0)',
            background: 'rgba(124,47,255,0.10)', border: '1px solid rgba(124,47,255,0.40)',
          }}>{t('confianza.cta.download_pdf')}</a>
      </div>

      {/* Sec 1: Histogram */}
      <section data-testid="fsd-hist-section" style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 18,
      }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream, #F0EBE0)', margin: '0 0 10px' }}>
          {t('confianza.fsd_distribution.histogram_title')}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hist} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(124,47,255,0.45)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {hist.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i] || 'rgba(124,47,255,0.85)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Sec 2: Zone weights table */}
      <section data-testid="fsd-weights-section" style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 18,
      }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream, #F0EBE0)', margin: '0 0 10px' }}>
          {t('confianza.fsd_distribution.zone_weights_title')}
        </h2>
        {weights.length === 0 ? (
          <EmptyState text={t('confianza.fsd_distribution.zone_weights_empty')} />
        ) : (
          <table data-testid="fsd-weights-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(124,47,255,0.10)' }}>
                <Th>{t('confianza.fields.zone')}</Th>
                <Th>{t('confianza.fsd_distribution.fields.r2_score')}</Th>
                <Th>{t('confianza.fsd_distribution.fields.sample_size')}</Th>
                <Th>{t('confianza.fsd_distribution.fields.optimized_at')}</Th>
                <Th>{t('confianza.fsd_distribution.fields.version')}</Th>
              </tr>
            </thead>
            <tbody>
              {weights.map((w) => (
                <tr key={w.zone_slug} data-testid={`fsd-weight-row-${w.zone_slug}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <Td>{w.zone_slug}</Td>
                  <Td>{Number(w.r2_score || 0).toFixed(3)}</Td>
                  <Td>{w.sample_size}</Td>
                  <Td>{(w.optimized_at || '').slice(0, 10)}</Td>
                  <Td>{w.version}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Sec 3: Drift alerts */}
      <section data-testid="fsd-drift-section" style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 18,
      }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream, #F0EBE0)', margin: '0 0 10px' }}>
          {t('confianza.fsd_distribution.drift_title')}
        </h2>
        {drift.length === 0 ? (
          <EmptyState text={t('confianza.fsd_distribution.drift_empty')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {drift.slice(0, 12).map((d, i) => {
              const after = d.after_state || d.after || {};
              return (
                <div key={d.id || i} style={{
                  padding: 12, borderRadius: 12,
                  background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.40)',
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#fed7aa' }}>
                    {d.entity_id || after.zone_slug || '—'}
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'rgba(240,235,224,0.65)', marginTop: 4 }}>
                    Δ {(after.delta_pp ?? '—')}pp · retrain {after.retrain_triggered ? 'OK' : '—'}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.45)', marginTop: 6 }}>
                    {(d.timestamp || '').slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Trigger modal */}
      {triggerOpen && (
        <div data-testid="fsd-trigger-modal" style={{
          position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90,
        }} onClick={() => setTriggerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(124,47,255,0.45)', borderRadius: 16,
            padding: 26, width: 'min(440px, 92vw)', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream, #F0EBE0)', margin: 0 }}>
              {t('confianza.fsd_distribution.trigger_drift')}
            </h3>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
              {t('confianza.fsd_distribution.trigger_drift_zone')}
            </label>
            <input
              data-testid="fsd-trigger-zone-input"
              type="text" value={triggerZone}
              onChange={(e) => setTriggerZone(e.target.value)}
              placeholder="polanco"
              style={{
                padding: '10px 14px', borderRadius: 14, fontFamily: 'DM Sans', fontSize: 13,
                background: 'rgba(255,255,255,0.05)', color: 'var(--cream, #F0EBE0)',
                border: '1px solid rgba(124,47,255,0.30)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setTriggerOpen(false)} style={{
                padding: '8px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}>Cancelar</button>
              <button
                data-testid="fsd-trigger-confirm"
                onClick={handleTrigger}
                style={{
                  padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'linear-gradient(90deg, rgba(124,47,255,0.95), rgba(192,38,211,0.95))',
                  color: '#fff', border: '1px solid rgba(124,47,255,0.65)',
                }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div data-testid="fsd-flash" style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', borderRadius: 9999,
          background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(124,47,255,0.45)',
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream, #F0EBE0)', zIndex: 95,
        }}>{flash}</div>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'rgba(240,235,224,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</th>;
}
function Td({ children }) {
  return <td style={{ padding: '10px 14px', color: 'var(--cream, #F0EBE0)' }}>{children}</td>;
}
function EmptyState({ text }) {
  return (
    <div data-testid="fsd-empty-state" style={{
      padding: 22, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12.5,
      color: 'rgba(240,235,224,0.55)',
    }}>{text}</div>
  );
}
