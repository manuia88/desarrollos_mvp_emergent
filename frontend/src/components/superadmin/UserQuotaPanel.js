// W5.x F1 — User-tier quotas panel
import React, { useEffect, useState, useCallback } from 'react';
import { Users, RefreshCw, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listUserUsage, updateUserTier } from '../../api/superadminAiCost';

const TIERS = ['free', 'pro', 'premium', 'enterprise'];

function fmt$(v) {
  if (v == null) return '—';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${Number(v).toFixed(2)}`;
}

function pctBar(used, limit) {
  if (limit == null || limit <= 0) {
    return (
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.30)' }}>
        ∞
      </span>
    );
  }
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct >= 90 ? '#F87171' : pct >= 75 ? '#FACC15' : '#4ADE80';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 200ms' }} />
      </div>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color, minWidth: 36, textAlign: 'right' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

const TIER_MONTHLY_COST = { free: 15, pro: 75, premium: 300, enterprise: null };
const TIER_MONTHLY_CALLS = { free: 200, pro: 1000, premium: 5000, enterprise: null };

export default function UserQuotaPanel() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState('');
  const [savingUserId, setSavingUserId] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await listUserUsage({ limit: 50, skip: 0, tier: tierFilter || undefined });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setErr(e.message || 'Error al cargar cuotas');
    } finally {
      setLoading(false);
    }
  }, [tierFilter]);

  useEffect(() => { load(); }, [load]);

  const onChangeTier = async (userId, newTier) => {
    setSavingUserId(userId);
    try {
      await updateUserTier(userId, newTier);
      await load();
    } catch (e) {
      setErr(e.message || 'No se pudo actualizar el tier');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div data-testid="user-quota-panel" style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={14} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: 0 }}>
            {t('superadmin.ai_cost.user_quotas.title', 'Cuotas por usuario')}
          </h3>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>
            {total} usuarios
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            data-testid="user-quota-tier-filter"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11.5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)' }}
          >
            <option value="">{t('superadmin.ai_cost.user_quotas.filter_all', 'Todos los tiers')}</option>
            {TIERS.map(tr => (
              <option key={tr} value={tr}>
                {t(`superadmin.ai_cost.user_quotas.option_${tr}`, tr)}
              </option>
            ))}
          </select>
          <button
            data-testid="user-quota-refresh"
            onClick={load}
            disabled={loading}
            style={{ padding: '6px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', cursor: loading ? 'wait' : 'pointer' }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.50)', margin: '0 0 12px' }}>
        {t('superadmin.ai_cost.user_quotas.subtitle', 'Usuarios ordenados por gasto mensual. Cambia el tier para ajustar sus cuotas (Free → Pro → Premium → Enterprise).')}
      </p>

      {err && (
        <div data-testid="user-quota-error" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 11.5, marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.55)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px', fontWeight: 600 }}>{t('superadmin.ai_cost.user_quotas.col_user', 'Usuario')}</th>
              <th style={{ padding: '8px 6px', fontWeight: 600 }}>{t('superadmin.ai_cost.user_quotas.col_tier', 'Tier')}</th>
              <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>{t('superadmin.ai_cost.user_quotas.col_calls', 'Llamadas mes')}</th>
              <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>{t('superadmin.ai_cost.user_quotas.col_cost', 'Gasto USD')}</th>
              <th style={{ padding: '8px 6px', fontWeight: 600 }}>{t('superadmin.ai_cost.user_quotas.col_usage_pct', '% cuota mensual')}</th>
            </tr>
          </thead>
          <tbody>
            {(!loading && items.length === 0) && (
              <tr><td colSpan={5} style={{ padding: 18, textAlign: 'center', color: 'rgba(240,235,224,0.40)' }}>
                {t('superadmin.ai_cost.user_quotas.empty', 'Sin datos · ningún usuario ha consumido IA este mes')}
              </td></tr>
            )}
            {items.map((row) => {
              const tier = row.tier || 'free';
              const calls = row.calls_count_monthly || 0;
              const cost = row.cost_usd_monthly || 0;
              const callLimit = TIER_MONTHLY_CALLS[tier];
              const costLimit = TIER_MONTHLY_COST[tier];
              return (
                <tr key={row.user_id} data-testid={`user-quota-row-${row.user_id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px 6px', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{row.user_id}</td>
                  <td style={{ padding: '8px 6px' }}>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <select
                        data-testid={`user-quota-tier-${row.user_id}`}
                        value={tier}
                        disabled={savingUserId === row.user_id}
                        onChange={(e) => onChangeTier(row.user_id, e.target.value)}
                        style={{ padding: '4px 22px 4px 10px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', appearance: 'none', cursor: 'pointer' }}
                      >
                        {TIERS.map(tr => (
                          <option key={tr} value={tr}>
                            {t(`superadmin.ai_cost.user_quotas.option_${tr}`, tr)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={10} style={{ position: 'absolute', right: 6, pointerEvents: 'none', color: 'rgba(240,235,224,0.45)' }} />
                    </div>
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--cream)' }}>
                    {calls}{callLimit ? ` / ${callLimit}` : ''}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--cream)' }}>
                    {fmt$(cost)}{costLimit ? ` / ${fmt$(costLimit)}` : ''}
                  </td>
                  <td style={{ padding: '8px 6px' }}>{pctBar(cost, costLimit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
