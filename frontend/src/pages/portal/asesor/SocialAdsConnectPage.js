/**
 * W5.10 · SocialAdsConnectPage · /portal/asesor/social-ads
 * OAuth Meta connect + lista de ad accounts + status (STUB-aware).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOAuthUrl, getAccounts, disconnectAccount } from '../../../api/socialAds';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

function bannerFromQuery() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('social_ads') || '';
  } catch { return ''; }
}

function SocialAdsConnectPageBody() {
  const { t } = useTranslation('common');
  const [accounts, setAccounts] = useState([]);
  const [meta, setMeta] = useState({ stub_mode: true, connections: 0, cap: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [flash] = useState(bannerFromQuery());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, body } = await getAccounts();
      if (!ok) { setError(t('socialAds.loadError', 'No se pudieron cargar las cuentas.')); return; }
      setAccounts(body.accounts || []);
      setMeta({
        stub_mode: !!body.stub_mode,
        connections: body.connections || 0,
        cap: body.cap || 5,
      });
    } catch (e) {
      setError(t('socialAds.loadError', 'No se pudieron cargar las cuentas.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { ok, body } = await getOAuthUrl();
      if (ok && body.url) {
        window.location.href = body.url;
      } else {
        setError(t('socialAds.connectError', 'No se pudo iniciar la conexión con Meta.'));
        setConnecting(false);
      }
    } catch (e) {
      setError(t('socialAds.connectError', 'No se pudo iniciar la conexión con Meta.'));
      setConnecting(false);
    }
  }, [t]);

  const handleDisconnect = useCallback(async (accountId) => {
    setConfirmId(null);
    try {
      await disconnectAccount(accountId);
      await load();
    } catch (e) {
      setError(t('socialAds.disconnectError', 'No se pudo desconectar la cuenta.'));
    }
  }, [load, t]);

  const atCap = meta.connections >= meta.cap;

  return (
    <div
      data-testid="social-ads-connect-page"
      style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif', padding: 24 }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · Social Ads
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('socialAds.connect.title', 'Conectar Meta Business')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 680 }}>
            {t('socialAds.connect.subtitle', 'Vincula tu cuenta de Meta Ads para ver campañas, gasto y recibir sugerencias de presupuesto con IA.')}
          </div>
        </header>

        {/* Status banner */}
        <div style={{
          padding: '12px 16px', borderRadius: 9999, marginBottom: 18,
          display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13,
          background: meta.stub_mode ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)',
          border: `1px solid ${meta.stub_mode ? 'rgba(245,158,11,0.30)' : 'rgba(16,185,129,0.30)'}`,
          color: meta.stub_mode ? '#FCD34D' : '#6EE7B7',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'currentColor' }} />
          {meta.stub_mode
            ? t('socialAds.connect.stubBanner', 'Modo demo · Meta App Review pendiente')
            : t('socialAds.connect.liveBanner', 'Conectado en modo real')}
        </div>

        {flash === 'connected' && (
          <div style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: '#6EE7B7', fontSize: 13 }}>
            {t('socialAds.connect.flashConnected', 'Cuenta conectada correctamente.')}
          </div>
        )}
        {flash === 'cap_exceeded' && (
          <div style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#FCD34D', fontSize: 13 }}>
            {t('socialAds.connect.flashCap', 'Alcanzaste el máximo de conexiones permitidas.')}
          </div>
        )}
        {(flash === 'error' || flash === 'failed' || flash === 'invalid_or_expired_state') && (
          <div style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.30)', color: '#FBCFE8', fontSize: 13 }}>
            {t('socialAds.connect.flashError', 'La conexión no se completó. Intenta de nuevo.')}
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.30)', color: '#FBCFE8', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Connect CTA */}
        <section style={{ background: CARD_BG, border: BORDER, borderRadius: 20, padding: 24, marginBottom: 22 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                {t('socialAds.connect.cardTitle', 'Tu conexión con Meta')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                {t('socialAds.connect.usage', 'Conexiones')}: <strong style={{ color: CREAM }}>{meta.connections}</strong> / {meta.cap}
              </div>
            </div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting || atCap}
              data-testid="connect-meta-btn"
              style={{
                padding: '12px 22px', borderRadius: 9999, border: 'none', cursor: (connecting || atCap) ? 'not-allowed' : 'pointer',
                background: (connecting || atCap) ? 'rgba(99,102,241,0.25)' : GRAD,
                color: '#fff', fontSize: 14, fontWeight: 700, opacity: (connecting || atCap) ? 0.6 : 1,
              }}
            >
              {connecting
                ? t('socialAds.connect.connecting', 'Conectando…')
                : atCap
                  ? t('socialAds.connect.capReached', 'Límite alcanzado')
                  : t('socialAds.connect.connectBtn', 'Conectar con Meta Business')}
            </button>
          </div>
        </section>

        {/* Accounts list */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 700, margin: 0 }}>
              {t('socialAds.connect.accountsTitle', 'Cuentas conectadas')}
            </h2>
            <Link to="/portal/asesor/social-ads/campaigns" style={{ fontSize: 12, color: '#A5B4FC', textDecoration: 'none' }}>
              {t('socialAds.connect.goCampaigns', 'Ver campañas →')}
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: MUTED }}>{t('common.loading', 'Cargando…')}</div>
          ) : accounts.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: MUTED, background: CARD_BG, border: BORDER, borderRadius: 16 }}>
              {t('socialAds.connect.empty', 'Aún no tienes cuentas conectadas.')}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {accounts.map((a) => (
                <div key={a.account_id} data-testid={`sa-account-${a.account_id}`}
                  style={{ background: CARD_BG, border: BORDER, borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9999, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff' }}>
                    {(a.name || 'M').charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.55, fontFamily: 'ui-monospace, Menlo, monospace' }}>{a.account_id} · {a.currency || 'MXN'}</div>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                    background: a.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: a.status === 'active' ? '#6EE7B7' : '#FCD34D',
                  }}>
                    {a.status === 'active' ? t('socialAds.statusActive', 'Activa') : t('socialAds.statusExpired', 'Expirada')}
                  </span>
                  {confirmId === a.account_id ? (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => handleDisconnect(a.account_id)}
                        style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(236,72,153,0.4)', background: 'rgba(236,72,153,0.12)', color: '#FBCFE8', fontSize: 12, cursor: 'pointer' }}>
                        {t('socialAds.confirmYes', 'Confirmar')}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)}
                        style={{ padding: '6px 12px', borderRadius: 9999, border: BORDER, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
                        {t('common.cancel', 'Cancelar')}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(a.account_id)}
                      data-testid={`disconnect-${a.account_id}`}
                      style={{ padding: '6px 12px', borderRadius: 9999, border: BORDER, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
                      {t('socialAds.disconnect', 'Desconectar')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function SocialAdsConnectPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <SocialAdsConnectPageBody {...props} />
    </PortalLayout>
  );
}
