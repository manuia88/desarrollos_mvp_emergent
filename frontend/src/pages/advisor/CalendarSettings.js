/**
 * Phase 4 Batch 15 — /asesor/configuracion/calendar
 * Google Calendar OAuth connection card + Microsoft "Próximamente" stub.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { Check, AlertCircle, RefreshCw, ExternalLink, Calendar } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

function ConnectionCard({ provider, label, connection, onConnect, onDisconnect, disabled, comingSoon }) {
  const connected = connection?.status === 'active';
  const expired = connection?.status === 'expired';
  const email = connection?.email_connected || connection?.email || '';
  const lastRefreshed = connection?.last_refreshed_at;

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  }

  return (
    <Card
      data-testid={`calendar-card-${provider}`}
      style={{
        border: connected
          ? '1px solid rgba(74,222,128,0.28)'
          : comingSoon ? '1px solid rgba(240,235,224,0.08)' : '1px solid rgba(240,235,224,0.12)',
        opacity: comingSoon ? 0.65 : 1,
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {connected && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #4ade80, #22d3ee)',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: provider === 'google' ? 'rgba(234,67,53,0.12)' : 'rgba(0,120,212,0.12)',
          border: `1px solid ${provider === 'google' ? 'rgba(234,67,53,0.25)' : 'rgba(0,120,212,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Calendar size={20} color={provider === 'google' ? '#ea4335' : '#0078d4'} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
              {label}
            </span>
            {connected && (
              <Badge tone="ok" style={{ fontSize: 9 }}>CONECTADO</Badge>
            )}
            {expired && (
              <Badge tone="warn" style={{ fontSize: 9 }}>EXPIRADO</Badge>
            )}
            {comingSoon && (
              <Badge style={{ fontSize: 9, background: 'rgba(240,235,224,0.08)', color: 'rgba(240,235,224,0.4)' }}>
                PRÓXIMAMENTE
              </Badge>
            )}
          </div>

          {connected && email && (
            <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 2 }}>
              <Check size={10} color="#4ade80" /> {email}
            </div>
          )}
          {connected && lastRefreshed && (
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={9} />
              Actualizado: {formatDate(lastRefreshed)}
            </div>
          )}
          {!connected && !comingSoon && (
            <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.4)' }}>
              No conectado — sincroniza tu agenda para gestión de citas automática
            </div>
          )}
          {comingSoon && (
            <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.3)' }}>
              Integración Microsoft Outlook disponible próximamente
            </div>
          )}
        </div>

        {/* Action */}
        {!comingSoon && (
          <div style={{ flexShrink: 0 }}>
            {connected ? (
              <button
                data-testid={`disconnect-${provider}-btn`}
                onClick={onDisconnect}
                style={{
                  padding: '7px 16px', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)',
                  color: '#f87171', transition: 'all 0.15s',
                }}
              >
                Desconectar
              </button>
            ) : (
              <button
                data-testid={`connect-${provider}-btn`}
                onClick={onConnect}
                disabled={disabled}
                style={{
                  padding: '7px 18px', borderRadius: 9999, cursor: disabled ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 700, opacity: disabled ? 0.5 : 1,
                  background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                  border: 'none', color: '#fff', transition: 'all 0.15s',
                }}
              >
                {expired ? 'Reconectar' : 'Conectar'}
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function CalendarSettings({ user, onLogout }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [searchParams] = useSearchParams();
  const [toastMsg, setToastMsg] = useState(null);

  function showToast(type, msg) {
    setToastMsg({ type, msg });
    setTimeout(() => setToastMsg(null), 3500);
  }

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/oauth/connections`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setConnections(d.connections || []);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConnections();
    // Handle OAuth callback result
    const success = searchParams.get('oauth_success');
    const err = searchParams.get('oauth_error');
    const email = searchParams.get('email');
    if (success) {
      showToast('ok', `Google Calendar conectado${email ? `: ${email}` : ''}`);
    } else if (err) {
      const msgs = {
        invalid_state: 'Sesión OAuth inválida — intenta de nuevo',
        exchange_failed: 'Error al conectar con Google — verifica permisos',
        missing_params: 'Callback OAuth incompleto',
      };
      showToast('error', msgs[err] || `Error OAuth: ${err}`);
    }
  }, [loadConnections, searchParams]);

  async function handleConnect(provider) {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/api/oauth/${provider}/initiate`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      window.location.href = d.auth_url;
    } catch (e) {
      showToast('error', `No se pudo iniciar la conexión: ${e.message}`);
      setConnecting(false);
    }
  }

  async function handleDisconnect(provider) {
    if (!window.confirm(`¿Desconectar ${provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar'}?`)) return;
    try {
      const res = await fetch(`${API}/api/oauth/${provider}/revoke`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        showToast('ok', 'Conexión revocada correctamente');
        loadConnections();
      } else {
        showToast('error', 'Error al revocar — intenta de nuevo');
      }
    } catch (e) {
      showToast('error', `Error: ${e.message}`);
    }
  }

  const googleConn = connections.find(c => c.provider === 'google');

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Calendarios conectados"
        sub="Conecta tu Google Calendar para gestionar citas automáticamente desde el sistema."
      />

      {/* Toast message */}
      {toastMsg && (
        <div data-testid="calendar-toast" style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: toastMsg.type === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
          border: `1px solid ${toastMsg.type === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: toastMsg.type === 'ok' ? '#86efac' : '#fca5a5',
        }}>
          {toastMsg.msg}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ height: 90, borderRadius: 12, background: 'rgba(240,235,224,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ConnectionCard
            provider="google"
            label="Google Calendar"
            connection={googleConn}
            onConnect={() => handleConnect('google')}
            onDisconnect={() => handleDisconnect('google')}
            disabled={connecting}
          />
          {/* Microsoft — stub / coming soon */}
          <ConnectionCard
            provider="microsoft"
            label="Microsoft Outlook Calendar"
            connection={null}
            onConnect={() => {}}
            onDisconnect={() => {}}
            disabled={true}
            comingSoon={true}
          />
        </div>
      )}

      {/* Info box */}
      <Card style={{ marginTop: 20, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <AlertCircle size={14} color="#a5b4fc" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.55)', lineHeight: 1.6 }}>
            Al conectar tu Google Calendar, el sistema podrá ver tu disponibilidad real para asignar citas automáticamente.
            Tus eventos personales <strong style={{ color: 'rgba(240,235,224,0.7)' }}>no se comparten</strong> con clientes — solo se consulta tu disponibilidad (ocupado/libre).
          </div>
        </div>
      </Card>
    </AdvisorLayout>
  );
}
