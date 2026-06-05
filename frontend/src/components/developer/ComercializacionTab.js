/**
 * ComercializacionTab — "Pagos y administración": formas de pago + políticas (brokers/venta)
 * + política comercial (trabajar con brokers / in-house). Lo operativo de canales (asignar
 * brokers, pre-asignar asesores) vive en CanalesTab. Estilo cockpit (tarjetas blancas).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getCommercialization, patchCommercialization, listProjectsWithStats } from '../../api/developer';
import PaymentSchemesConfig from './PaymentSchemesConfig';
import PoliciesConfig from './PoliciesConfig';
import { Z } from '../../styles/zIndex';

const inp = { width: '100%', maxWidth: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--cream)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' };

function Toggle({ value, onChange, label, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div onClick={() => !disabled && onChange(!value)} style={{
        width: 42, height: 24, borderRadius: 999, position: 'relative', flexShrink: 0,
        background: value ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : 'var(--border)',
        cursor: disabled ? 'default' : 'pointer', transition: 'background .2s',
      }}>
        <div style={{ position: 'absolute', top: 2.5, left: value ? 20 : 2.5, width: 19, height: 19, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--cream-2)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export default function ComercializacionTab({ devId, user, projectName }) {
  const [config, setConfig] = useState(null);
  const [otherProjects, setOtherProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    try { setConfig(await getCommercialization(devId)); } catch (e) { console.error('ComercializacionTab:', e); }
  }, [devId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listProjectsWithStats().then(all => setOtherProjects((all || []).filter(p => p.id !== devId))).catch(() => {}); }, [devId]);

  const saveConfig = async (patch) => {
    setSaving(true);
    try { setConfig(await patchCommercialization(devId, patch)); } catch (e) { console.error('Save config:', e); } finally { setSaving(false); }
  };
  const applyFrom = async (projectId) => {
    try {
      const o = await getCommercialization(projectId);
      await saveConfig({ works_with_brokers: o.works_with_brokers, default_commission_pct: o.default_commission_pct, iva_included: o.iva_included, in_house_only: o.in_house_only, broker_terms: o.broker_terms });
      setShowDefaults(false);
    } catch (e) { console.error('Apply defaults:', e); }
  };

  if (!config) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <PaymentSchemesConfig devId={devId} />
      <PoliciesConfig devId={devId} projectName={projectName} />

      {/* Política comercial */}
      <div className="dmx-card" style={{ background: '#fff', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 4, height: 16, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />
            <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 15.5, fontWeight: 800, color: 'var(--cream)' }}>Política comercial</h3>
          </div>
          {isAdmin && otherProjects.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button data-testid="comercial-defaults-btn" onClick={() => setShowDefaults(!showDefaults)}
                style={{ background: '#fff', color: 'var(--cream-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Copiar de otro proyecto ↓
              </button>
              {showDefaults && (
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: Z.DROPDOWN, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 210, boxShadow: '0 16px 40px rgba(0,0,0,0.14)' }}>
                  {otherProjects.map(p => (
                    <button key={p.id} onClick={() => applyFrom(p.id)}
                      style={{ width: '100%', background: 'none', border: 'none', padding: '9px 14px', textAlign: 'left', cursor: 'pointer', color: 'var(--cream)', fontSize: 12.5 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>{p.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Toggle value={config.works_with_brokers} onChange={v => isAdmin && saveConfig({ works_with_brokers: v })} label="Trabajar con brokers externos" disabled={!isAdmin || saving} />

          {config.works_with_brokers && (
            <div style={{ marginLeft: 53, display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', background: 'rgba(var(--theme-rgb),0.04)', borderRadius: 11 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 700, display: 'block', marginBottom: 5 }}>Comisión default</label>
                  <div style={{ position: 'relative', maxWidth: 130 }}>
                    <input type="number" step={0.5} value={config.default_commission_pct ?? 3} disabled={!isAdmin}
                      onChange={e => saveConfig({ default_commission_pct: parseFloat(e.target.value) })} style={inp} />
                    <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, color: 'var(--cream-3)', fontWeight: 700 }}>%</span>
                  </div>
                </div>
                <Toggle value={config.iva_included} onChange={v => isAdmin && saveConfig({ iva_included: v })} label="Incluye IVA" disabled={!isAdmin || saving} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 700, display: 'block', marginBottom: 5 }}>Términos comerciales (opcional)</label>
                <textarea rows={2} value={config.broker_terms || ''} disabled={!isAdmin}
                  placeholder="Condiciones para brokers externos…"
                  onChange={e => setConfig(c => ({ ...c, broker_terms: e.target.value }))}
                  onBlur={e => isAdmin && saveConfig({ broker_terms: e.target.value })}
                  style={{ ...inp, maxWidth: '100%', resize: 'vertical', fontFamily: 'DM Sans,sans-serif' }} />
              </div>
            </div>
          )}

          <Toggle value={config.in_house_only} onChange={v => isAdmin && saveConfig({ in_house_only: v })} label="Solo asesores in-house (excluye externos)" disabled={!isAdmin || saving} />
        </div>
      </div>
    </div>
  );
}
