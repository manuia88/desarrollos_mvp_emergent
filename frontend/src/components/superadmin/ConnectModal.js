// ConnectModal — dynamic form per access_mode (api_key | ckan_resource | keyless_url | wms_wfs).
// Saves credentials encrypted server-side; optional "Probar al guardar" runs test_connection inline.
import React, { useState, useEffect } from 'react';
import { X, Sparkle, Shield } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const ACCESS_MODE_FIELDS = {
  api_key: [
    { k: 'api_key', label: 'API key / token', type: 'password', placeholder: 'pk_xxx…', help: 'Pegada cifrada con Fernet en MongoDB.' },
    { k: 'token',   label: 'Token alterno',   type: 'password', optional: true, help: 'Solo si la fuente usa "token" en lugar de "api_key".' },
  ],
  ckan_resource: [
    { k: 'resource_id', label: 'Resource ID (CKAN)', type: 'text', placeholder: '6c2a2cc0-…', help: 'ID del dataset en datos.cdmx.' },
    { k: 'base_url',    label: 'Base URL (opcional)', type: 'text', optional: true, placeholder: 'https://datos.cdmx.gob.mx/api/3/action' },
  ],
  keyless_url: [],
  wms_wfs: [
    { k: 'wfs_url', label: 'Endpoint WFS / WMS', type: 'text', placeholder: 'https://…/geoserver/wfs' },
  ],
};

export default function ConnectModal({ open, source, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [runTest, setRunTest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (open) {
      setValues({});
      setErr(null);
      setSuccess(null);
    }
  }, [open, source]);

  if (!open || !source) return null;

  const fields = ACCESS_MODE_FIELDS[source.access_mode] || [];
  const isKeyless = source.access_mode === 'keyless_url';

  const handleSubmit = async () => {
    setErr(null); setSuccess(null);
    setSaving(true);
    try {
      // Filter out empty values so PATCH doesn't wipe existing creds with blanks.
      const payload = { credentials: {}, run_test: runTest };
      Object.entries(values).forEach(([k, v]) => { if (v && v.trim()) payload.credentials[k] = v.trim(); });

      let updatedSource;
      if (isKeyless) {
        // Keyless: just hit /test, no PATCH needed
        const r = await fetch(`${API}/api/superadmin/data-sources/${source.id}/test`, {
          method: 'POST', credentials: 'include',
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.detail || 'Error en test');
        }
        const t = await r.json();
        if (!t.ok) throw new Error(t.message);
        setSuccess(t.message);
      } else {
        if (Object.keys(payload.credentials).length === 0 && !runTest) {
          throw new Error('Llena al menos un campo o desmarca "Probar".');
        }
        const r = await fetch(`${API}/api/superadmin/data-sources/${source.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.detail || 'Error al guardar credenciales');
        }
        updatedSource = await r.json();
        if (runTest && updatedSource.last_status === 'error') {
          const last = (updatedSource.error_log || []).slice(-1)[0]?.message || 'Test falló.';
          throw new Error(`Credenciales guardadas, pero el test falló: ${last}`);
        }
        setSuccess(runTest ? 'Credenciales guardadas y probadas correctamente.' : 'Credenciales guardadas.');
      }

      onSaved?.(updatedSource);
      // Auto-close after 1.5s on success
      setTimeout(() => onClose(), 1400);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '11px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 9999,
    color: 'var(--cream)',
    fontFamily: 'DM Sans', fontSize: 13.5,
    outline: 'none',
  };
  const lblStyle = {
    fontFamily: 'DM Sans', fontSize: 11,
    color: 'var(--cream-3)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 6,
  };

  return (
    <div data-testid="connect-modal" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)',
        borderRadius: 22, padding: 32,
        boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>CONECTAR FUENTE</div>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: 'var(--cream)', letterSpacing: '-0.02em',
              margin: 0, lineHeight: 1.2,
            }}>
              {source.name}
            </h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 4 }}>
              Modo: <strong style={{ color: 'var(--cream)' }}>{source.access_mode}</strong>
            </div>
          </div>
          <button data-testid="connect-close" onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {source.description && (
          <div style={{
            padding: 12, marginBottom: 16,
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 12,
            fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5,
          }}>
            {source.description}
          </div>
        )}

        {isKeyless ? (
          <div style={{
            padding: 14, marginBottom: 16,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55,
          }}>
            Esta fuente no requiere credenciales — solo verificamos que el endpoint público responda.
            <div style={{ marginTop: 6, color: 'var(--cream-3)', fontSize: 12 }}>
              Endpoint: <code style={{ color: 'var(--indigo-3)' }}>{source.endpoint || '—'}</code>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {fields.map(f => {
              const envKey = source.credentials_env?.[f.k];
              const summary = source.credentials_summary?.[f.k];
              return (
                <label key={f.k}>
                  <div style={lblStyle}>
                    {f.label} {f.optional ? <span style={{ color: 'var(--cream-3)', textTransform: 'none' }}>(opcional)</span> : null}
                  </div>
                  <input
                    type={f.type}
                    placeholder={f.placeholder || ''}
                    data-testid={`connect-field-${f.k}`}
                    value={values[f.k] || ''}
                    onChange={e => setValues(v => ({ ...v, [f.k]: e.target.value }))}
                    style={inputStyle}
                  />
                  {summary?.set && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#86efac', marginTop: 4 }}>
                      <Shield size={9} /> Ya configurado: <code>{summary.preview}</code>
                    </div>
                  )}
                  {envKey && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>
                      Fallback env: <code>{envKey}</code>
                    </div>
                  )}
                  {f.help && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>
                      {f.help}
                    </div>
                  )}
                </label>
              );
            })}
            {fields.length === 0 && (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                Sin campos para este modo de acceso.
              </div>
            )}
          </div>
        )}

        {!isKeyless && (
          <label data-testid="connect-runtest" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={runTest} onChange={e => setRunTest(e.target.checked)} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
              Probar conexión al guardar
            </span>
          </label>
        )}

        {err && (
          <div data-testid="connect-error" style={{
            padding: 10, marginBottom: 12,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.32)',
            borderRadius: 10,
            fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5', lineHeight: 1.5,
          }}>{err}</div>
        )}
        {success && (
          <div data-testid="connect-success" style={{
            padding: 10, marginBottom: 12,
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.32)',
            borderRadius: 10,
            fontFamily: 'DM Sans', fontSize: 12.5, color: '#86efac', lineHeight: 1.5,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Sparkle size={11} /> {success}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          data-testid="connect-submit"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Procesando…' : isKeyless ? 'Probar conexión' : 'Guardar credenciales'}
        </button>
      </div>
    </div>
  );
}
