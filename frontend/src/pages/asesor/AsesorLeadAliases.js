/**
 * W5.ASR.5 Parte 2 — AsesorLeadAliases
 * Ruta: /asesor/lead-aliases
 * Gestión de email aliases de captura + configuraciones FB Lead Ads.
 */
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import { listAliases, createAlias, listFBConfigs, createFBConfig } from '../../api/lead_capture';
import { Mail, Plug, Copy, CheckCircle, X } from 'lucide-react';

export default function AsesorLeadAliases({ user, onLogout }) {
  const [aliases, setAliases]     = useState([]);
  const [fbConfigs, setFBConfigs] = useState([]);
  const [loadingA, setLoadingA]   = useState(true);
  const [loadingF, setLoadingF]   = useState(true);
  const [copied, setCopied]       = useState(null);
  const [showFBModal, setShowFBModal] = useState(false);
  const [fbForm, setFbForm]       = useState({ fb_page_id: '', form_id: '', stub_mode: true });
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);

  const loadAliases = async () => {
    setLoadingA(true);
    try { const r = await listAliases(); setAliases(r.aliases || []); }
    finally { setLoadingA(false); }
  };

  const loadFB = async () => {
    setLoadingF(true);
    try { const r = await listFBConfigs(); setFBConfigs(r.configs || []); }
    finally { setLoadingF(false); }
  };

  useEffect(() => { loadAliases(); loadFB(); }, []);

  const handleGenerateAlias = async () => {
    setSaving(true);
    try {
      await createAlias();
      await loadAliases();
      showToast('success', 'Alias generado (o existente recuperado)');
    } catch { showToast('error', 'Error al generar alias'); }
    finally { setSaving(false); }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const handleSaveFBConfig = async () => {
    if (!fbForm.fb_page_id || !fbForm.form_id) {
      showToast('error', 'Page ID y Form ID son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await createFBConfig(fbForm);
      await loadFB();
      setShowFBModal(false);
      setFbForm({ fb_page_id: '', form_id: '', stub_mode: true });
      showToast('success', 'Configuracion FB registrada');
    } catch { showToast('error', 'Error al guardar configuracion FB'); }
    finally { setSaving(false); }
  };

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3200);
  };

  const WEBHOOK_URL = `${process.env.REACT_APP_BACKEND_URL}/api/webhooks/fb-lead-ads`;

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="LEADS · CAPTURA AUTOMATICA"
        title="Conectar fuentes de leads"
        sub="Reenvía emails de portales a tu alias o conecta FB Lead Ads para captura automática de leads."
      />

      {/* Banner informativo */}
      <div data-testid="lead-aliases-banner" style={{
        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.22)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <Plug size={18} color="#a5b4fc" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--cream)' }}>Captura automatica activa</strong>
          {' — '}En Inmuebles24 o Lamudi, configura el reenvio de notificaciones a tu alias de email.
          Para FB Lead Ads, registra tu Page ID + Form ID y pega la URL del webhook en Meta Business Suite.
        </div>
      </div>

      {/* Seccion Email Aliases */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={15} color="#a5b4fc" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
              Email aliases
            </span>
          </div>
          <button
            data-testid="generate-alias-btn"
            onClick={handleGenerateAlias}
            disabled={saving}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 14px' }}>
            {saving ? 'Generando…' : '+ Generar alias'}
          </button>
        </div>

        {loadingA ? (
          <div style={{ padding: 24, color: 'var(--cream-3)', textAlign: 'center', fontSize: 13 }}>Cargando aliases…</div>
        ) : aliases.length === 0 ? (
          <Empty title="Sin aliases" sub="Genera tu primer alias para captura de emails." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Alias email', 'Slug', 'Activo', 'Creado', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aliases.map(a => (
                <tr key={a.id || a.alias_email} data-testid={`alias-row-${a.alias_slug}`}
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: '#a5b4fc', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{a.alias_email}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>{a.alias_slug}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: a.active ? '#86efac' : '#f87171', fontSize: 11, fontWeight: 600 }}>
                      {a.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-3)', fontSize: 11 }}>
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => handleCopy(a.alias_email)}
                      title="Copiar alias"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {copied === a.alias_email
                        ? <CheckCircle size={13} color="#86efac" />
                        : <Copy size={13} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Seccion FB Lead Ads */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plug size={15} color="#93c5fd" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
              FB Lead Ads
            </span>
            <span style={{ padding: '2px 7px', borderRadius: 9999, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)', color: '#93c5fd', fontSize: 10, fontFamily: 'DM Mono, monospace' }}>
              STUB MODE
            </span>
          </div>
          <button
            data-testid="add-fb-config-btn"
            onClick={() => setShowFBModal(true)}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 14px' }}>
            + Configurar form
          </button>
        </div>

        {/* URL webhook para pegar en Meta */}
        <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{WEBHOOK_URL}</span>
          <button onClick={() => handleCopy(WEBHOOK_URL)} title="Copiar URL webhook"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', display: 'flex' }}>
            {copied === WEBHOOK_URL ? <CheckCircle size={13} color="#86efac" /> : <Copy size={13} />}
          </button>
        </div>

        {loadingF ? (
          <div style={{ padding: 24, color: 'var(--cream-3)', textAlign: 'center', fontSize: 13 }}>Cargando configs…</div>
        ) : fbConfigs.length === 0 ? (
          <Empty title="Sin configuraciones FB" sub='Registra tu Page ID y Form ID de Meta Business Suite.' />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Page ID', 'Form ID', 'Stub mode', 'Activo', 'Creado'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fbConfigs.map(c => (
                <tr key={c.id} data-testid={`fb-config-row-${c.form_id}`}
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{c.fb_page_id}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-2)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{c.form_id}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: c.stub_mode ? '#fcd34d' : '#86efac', fontSize: 11, fontWeight: 600 }}>{c.stub_mode ? 'Stub' : 'Produccion'}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: c.active ? '#86efac' : '#f87171', fontSize: 11, fontWeight: 600 }}>{c.active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--cream-3)', fontSize: 11 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal crear FB config */}
      {showFBModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
        }}>
          <div data-testid="fb-config-modal" style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 28, width: 400, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>Configurar FB Lead Ads</span>
              <button onClick={() => setShowFBModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}>
                <X size={16} />
              </button>
            </div>
            {[
              { label: 'Facebook Page ID', key: 'fb_page_id', placeholder: '123456789012345' },
              { label: 'Form ID', key: 'form_id', placeholder: 'form_xxxxxxxxxxxxxxx' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--cream-3)', marginBottom: 5, fontFamily: 'DM Sans', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
                <input
                  data-testid={`fb-${f.key}-input`}
                  value={fbForm[f.key]}
                  onChange={e => setFbForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <input
                data-testid="fb-stub-mode-checkbox"
                type="checkbox"
                id="stub_mode_cb"
                checked={fbForm.stub_mode}
                onChange={e => setFbForm(p => ({ ...p, stub_mode: e.target.checked }))}
                style={{ accentColor: '#6366f1' }}
              />
              <label htmlFor="stub_mode_cb" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', cursor: 'pointer' }}>
                Stub mode (no requiere firma Meta · modo desarrollo)
              </label>
            </div>
            <button
              data-testid="save-fb-config-btn"
              onClick={handleSaveFBConfig}
              disabled={saving}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: 13 }}>
              {saving ? 'Guardando…' : 'Guardar configuracion'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.kind === 'error' ? '#7f1d1d' : '#14532d',
          border: `1px solid ${toast.kind === 'error' ? '#f87171' : '#86efac'}`,
          color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13,
          fontFamily: 'DM Sans', zIndex: 9999,
        }}>{toast.text}</div>
      )}
    </AdvisorLayout>
  );
}
