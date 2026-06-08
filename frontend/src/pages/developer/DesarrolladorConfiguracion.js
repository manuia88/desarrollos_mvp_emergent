/**
 * DesarrolladorConfiguracion — Phase 4.9 + 4.10
 * /desarrollador/configuracion — Org settings + ERP integrations
 */
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Toast } from '../../components/advisor/primitives';
import { SetupChecklist } from '../../components/shared/SetupChecklist';
import * as api from '../../api/developer';
import { Settings, CheckCircle, AlertTriangle, RefreshCw } from '../../components/icons';
import AutoApproveSettings from '../../components/developer/AutoApproveSettings';
import AIROIPanelDev from '../../components/agentic_crm/AIROIPanelDev';
import CitasPolicies from './CitasPolicies';
import { Z } from '../../styles/zIndex';

const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';
const AJ_AREAS = [['general', 'General'], ['citas', 'Políticas de cita']];

const ERP_PROVIDERS = [
  { id: 'easybroker', label: 'EasyBroker', color: '#22c55e', desc: 'Sincronización de listings y leads' },
  { id: 'salesforce', label: 'Salesforce', color: '#0080FF', desc: 'CRM enterprise, leads y oportunidades' },
  { id: 'hubspot', label: 'HubSpot', color: '#FF7A59', desc: 'Marketing automation + CRM' },
  { id: 'pipedrive', label: 'Pipedrive', color: '#017737', desc: 'Pipeline de ventas visual' },
  { id: 'ghl', label: 'Go High Level', color: '#a855f7', desc: 'Marketing y automatización LATAM' },
];

export default function DesarrolladorConfiguracion({ user, onLogout }) {
  const [orgSettings, setOrgSettings] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);
  const [providerForm, setProviderForm] = useState({ api_key: '', endpoint: '', events: [] });
  const [savingErp, setSavingErp] = useState(false);
  const [area, setArea] = useState('general');   // V2: general | citas
  const [erpEvents, setErpEvents] = useState({});

  const [security, setSecurity] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [settings, whs] = await Promise.all([api.getOrgSettings(), api.listErpWebhooks()]);
      setOrgSettings(settings || {});
      setWebhooks(whs || []);
    } finally { setLoading(false); }
    api.getSecuritySummary().then(setSecurity).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const saveOrgSetting = async (key, value) => {
    setSavingSettings(true);
    try {
      const updated = await api.patchOrgSettings({ [key]: value });
      setOrgSettings(updated);
      setToast({ kind: 'success', text: 'Configuración guardada' });
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al guardar' });
    } finally { setSavingSettings(false); }
  };

  const saveErp = async () => {
    if (!activeProvider) return;
    setSavingErp(true);
    try {
      await api.createErpWebhook({ provider: activeProvider, ...providerForm });
      setToast({ kind: 'success', text: `${activeProvider} configurado correctamente` });
      setActiveProvider(null);
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.body?.detail || 'Error al configurar' });
    } finally { setSavingErp(false); }
  };

  const loadErpEvents = async (provider) => {
    try {
      const evts = await api.listErpEvents(provider);
      setErpEvents(prev => ({ ...prev, [provider]: evts }));
    } catch {}
  };

  const testWebhook = async (provider) => {
    const API = process.env.REACT_APP_BACKEND_URL;
    try {
      const r = await fetch(`${API}/api/dev/erp-webhooks/${provider}/event`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test_ping', source: 'dmx_portal', ts: new Date().toISOString() }),
      });
      const d = await r.json();
      setToast({ kind: 'success', text: `Test enviado (event_id: ${d.event_id})` });
      loadErpEvents(provider);
    } catch (e) {
      setToast({ kind: 'error', text: 'Error en test' });
    }
  };

  const getWebhook = (provider) => webhooks.find(w => w.provider === provider);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow={DEV_V2 ? 'AJUSTES' : '4.9 · CONFIGURACIÓN'}
        title="Ajustes"
        sub="Ajustes de organización, integraciones ERP, costo de IA y políticas de cita."
      />

      {/* Switch de áreas (V2) — fold de Políticas de cita como área del centro. */}
      {DEV_V2 && (
        <div data-testid="aj-area-switcher" style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3, marginBottom: 20 }}>
          {AJ_AREAS.map(([k, lbl]) => {
            const on = area === k;
            return (
              <button key={k} data-testid={`aj-area-${k}`} onClick={() => setArea(k)}
                style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>
                {lbl}
              </button>
            );
          })}
        </div>
      )}

      {DEV_V2 && area === 'citas' && <CitasPolicies user={user} embedded />}

      {(!DEV_V2 || area === 'general') && (<>
      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Configuración inicial (onboarding) — solo aparece si falta algún paso */}
          <SetupChecklist />

          {/* Seguridad de tus Datos — aislamiento entre cuentas (lenguaje de persona) */}
          {security && (
            <Card data-testid="dev-security">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CheckCircle size={16} color={security.intentos_bloqueados ? '#f59e0b' : '#22c55e'} />
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Seguridad de tus Datos</div>
                <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                  Aislado
                </span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>{security.mensaje}</div>
              <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{security.proyectos_propios}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Tus proyectos</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: security.intentos_bloqueados ? '#f59e0b' : 'var(--cream)' }}>{security.intentos_bloqueados}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Intentos bloqueados de otras cuentas</div>
                </div>
              </div>
            </Card>
          )}

          {/* Org settings */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Settings size={16} color="#6366F1" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Configuración de organización</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ToggleRow
                label="Inventario externo"
                desc="Permite que asesores externos vean tu inventario en el marketplace"
                value={orgSettings?.allow_external_inventory || false}
                onChange={v => saveOrgSetting('allow_external_inventory', v)}
                disabled={savingSettings}
                testId="toggle-external-inventory"
              />
            </div>
          </Card>

          {/* ERP Integrations */}
          <Card>

          {/* Phase 13 Batch 36 — Auto-Approve Settings */}
          <AutoApproveSettings />
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <RefreshCw size={16} color="#22c55e" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>Integraciones ERP</div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '2px 8px' }}>
                stub honesto
              </span>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 18, lineHeight: 1.5 }}>
              Configura el endpoint y API key de cada partner. El webhook receiver ya está activo en{' '}
              <code style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--blue)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 4 }}>/api/dev/erp-webhooks/:provider/event</code>.
              Las integraciones reales requieren acuerdo con cada partner.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ERP_PROVIDERS.map(p => {
                const wh = getWebhook(p.id);
                const evts = erpEvents[p.id] || [];
                return (
                  <div key={p.id} data-testid={`erp-${p.id}`} style={{ border: `1px solid ${wh ? p.color + '28' : 'var(--border)'}`, borderRadius: 12, padding: '14px 18px', background: wh ? `${p.color}09` : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: wh ? p.color : 'var(--border)' }} />
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{p.label}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)' }}>{p.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {wh && (
                          <>
                            <button onClick={() => testWebhook(p.id)} data-testid={`test-erp-${p.id}`}
                              style={smallBtn('#22c55e')}>Test ping</button>
                            <button onClick={() => { loadErpEvents(p.id); }}
                              style={smallBtn('#6366F1')}>Ver eventos ({evts.length})</button>
                          </>
                        )}
                        <button onClick={() => {
                          setActiveProvider(p.id);
                          setProviderForm({ api_key: '', endpoint: wh?.endpoint || '', events: wh?.events || [] });
                        }}
                          data-testid={`config-erp-${p.id}`}
                          style={smallBtn(p.color)}>
                          {wh ? 'Reconfigurar' : 'Configurar'}
                        </button>
                      </div>
                    </div>
                    {wh && wh.last_ping_ts && (
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)', marginTop: 8 }}>
                        Último evento: {new Date(wh.last_ping_ts).toLocaleString('es-MX')}
                      </div>
                    )}
                    {evts.length > 0 && (
                      <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Últimos eventos</div>
                        {evts.slice(0, 3).map((ev, i) => (
                          <div key={i} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', background: 'rgba(var(--cream-rgb),0.03)', borderRadius: 6, padding: '5px 10px', marginBottom: 4 }}>
                            {ev.ts} · {JSON.stringify(ev.payload).slice(0, 80)}...
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ERP Config modal */}
      {activeProvider && (
        <div onClick={() => setActiveProvider(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.STICKY, background: 'rgba(var(--bg-rgb),0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} data-testid="erp-config-modal" style={{ width: '100%', maxWidth: 460, background: 'linear-gradient(180deg, #1c2233, #11151f)', border: '1px solid var(--border)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', marginBottom: 20 }}>
              Configurar {ERP_PROVIDERS.find(p => p.id === activeProvider)?.label}
            </div>
            {[
              { label: 'API Key', key: 'api_key', type: 'password', placeholder: 'Pega tu API key aquí...' },
              { label: 'Endpoint URL (opcional)', key: 'endpoint', type: 'text', placeholder: 'https://api.proveedor.com/webhook' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                <input type={type} placeholder={placeholder} value={providerForm[key]}
                  onChange={e => setProviderForm(f => ({ ...f, [key]: e.target.value }))}
                  data-testid={`erp-input-${key}`}
                  style={{ width: '100%', background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>
                  Integración stub — el webhook receiver registra eventos pero no activa sincronización bidireccional sin acuerdo partner activado.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setActiveProvider(null)} style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveErp} disabled={savingErp} data-testid="save-erp-btn"
                style={{ flex: 2, padding: '10px', borderRadius: 9, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: savingErp ? 0.6 : 1 }}>
                {savingErp ? 'Guardando...' : <><CheckCircle size={13} style={{ marginRight: 5 }} />Guardar configuración</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Costo de mi IA — re-ubicado del Inicio (V2). Es un view de billing/uso, va en Ajustes. */}
      {DEV_V2 && (
        <div data-testid="config-costo-ia" style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>COSTO DE MI IA</div>
          <AIROIPanelDev user={user} />
        </div>
      )}
      </>
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

function ToggleRow({ label, desc, value, onChange, disabled, testId }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
      <div>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, color: 'var(--cream)' }}>{label}</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-4)', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        data-testid={testId}
        style={{
          width: 46, height: 26, borderRadius: 9999,
          background: value ? 'rgba(34,197,94,0.25)' : 'rgba(var(--cream-rgb),0.08)',
          border: `1px solid ${value ? 'rgba(34,197,94,0.5)' : 'rgba(var(--cream-rgb),0.15)'}`,
          position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 22 : 4,
          width: 18, height: 18, borderRadius: '50%',
          background: value ? '#22c55e' : 'rgba(var(--cream-rgb),0.4)',
          transition: 'left 0.18s, background 0.18s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }} />
      </button>
    </div>
  );
}

function smallBtn(color) {
  return {
    padding: '5px 11px', borderRadius: 7,
    background: `${color}18`, border: `1px solid ${color}33`,
    color, fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer',
  };
}
