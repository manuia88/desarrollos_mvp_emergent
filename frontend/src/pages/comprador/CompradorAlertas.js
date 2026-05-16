/**
 * CompradorAlertas — Phase 4 Batch 29
 * Página /comprador/alertas — gestión de Smart Alerts.
 * Tabs: Activas | Historial
 */
import React, { useEffect, useState, useCallback } from 'react';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import AlertSettingsForm from '../../components/comprador/AlertSettingsForm';
import { fetchAlerts, createAlert, updateAlert, deleteAlert, fetchDeliveries } from '../../api/buyer_alerts';
import { Plus, Bell, Trash, Check, X, AlertTriangle, Clock } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const TYPE_LABELS = {
  new_match: 'Nuevo match',
  price_drop: 'Bajada de precio',
  slot_available: 'Unidades disponibles',
  project_status: 'Estado del proyecto',
};

const CHANNEL_LABELS = {
  email: 'Email',
  push: 'Push',
  whatsapp: 'WhatsApp',
};

const FREQ_LABELS = {
  instant: 'Inmediata',
  daily: 'Diaria',
  weekly: 'Semanal',
};

const STATUS_COLORS = {
  sent: '#86efac',
  failed: '#fca5a5',
  pending_wa: '#fde68a',
};

// ─── StatusIcon SVG ─────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'sent') return <Check size={13} color="#86efac" />;
  if (status === 'failed') return <X size={13} color="#fca5a5" />;
  return <Clock size={13} color="#fde68a" />;
}

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alert, onToggle, onDelete, toggling, deleting }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      await onToggle(alert.alert_id, data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid={`alert-card-${alert.alert_id}`}
      style={{
        borderRadius: 12,
        background: 'rgba(13,16,23,0.85)',
        border: alert.active
          ? '1px solid rgba(99,102,241,0.25)'
          : '1px solid rgba(240,235,224,0.08)',
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Active dot */}
        <div style={{
          width: 8, height: 8, borderRadius: 9999, flexShrink: 0,
          background: alert.active ? '#86efac' : 'rgba(240,235,224,0.2)',
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            color: 'var(--cream, #F0EBE0)',
          }}>
            {TYPE_LABELS[alert.type] || alert.type}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'rgba(240,235,224,0.45)', marginTop: 2,
          }}>
            {CHANNEL_LABELS[alert.channel]} · {FREQ_LABELS[alert.frequency]}
            {alert.last_triggered && (
              <> · Última vez: {new Date(alert.last_triggered).toLocaleDateString('es-MX')}</>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button
          data-testid={`alert-toggle-${alert.alert_id}`}
          disabled={toggling}
          onClick={() => onToggle(alert.alert_id, { active: !alert.active })}
          style={{
            padding: '5px 12px', borderRadius: 9999, cursor: 'pointer',
            border: '1px solid rgba(240,235,224,0.15)',
            background: 'rgba(255,255,255,0.04)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            color: alert.active ? '#86efac' : 'rgba(240,235,224,0.4)',
          }}
        >
          {alert.active ? 'Activa' : 'Pausada'}
        </button>

        {/* Edit */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: 28, height: 28, borderRadius: 9999, cursor: 'pointer',
            background: expanded ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(240,235,224,0.12)',
            color: 'rgba(240,235,224,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Editar"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* Delete */}
        <button
          data-testid={`alert-delete-${alert.alert_id}`}
          disabled={deleting}
          onClick={() => onDelete(alert.alert_id)}
          style={{
            width: 28, height: 28, borderRadius: 9999, cursor: 'pointer',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.18)',
            color: '#fca5a5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Eliminar"
        >
          <Trash size={12} />
        </button>
      </div>

      {/* Collapsible form */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px',
          borderTop: '1px solid rgba(240,235,224,0.06)',
        }}>
          <div style={{ paddingTop: 14 }}>
            <AlertSettingsForm
              initialValues={alert}
              onSubmit={handleSave}
              onCancel={() => setExpanded(false)}
              loading={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function CompradorAlertas() {
  const [tab, setTab] = useState('activas');
  const [alerts, setAlerts] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [al, dl] = await Promise.all([fetchAlerts(), fetchDeliveries(50)]);
      setAlerts(al);
      setDeliveries(dl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async (data) => {
    setCreating(true);
    try {
      const alert = await createAlert(data);
      setAlerts(prev => [alert, ...prev]);
      setShowModal(false);
    } catch (e) {
      throw e;
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (alertId, updates) => {
    const updated = await updateAlert(alertId, updates);
    setAlerts(prev => prev.map(a => a.alert_id === alertId ? updated : a));
  };

  const handleDelete = async (alertId) => {
    await deleteAlert(alertId);
    setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
  };

  return (
    <CompradorLayout>
      <div style={{ maxWidth: 720 }}>
        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '4px 12px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.28)',
              fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
              color: 'rgba(99,102,241,0.9)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 10,
            }}>
              <Bell size={11} />Alertas
            </div>
            <h1 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
              color: 'var(--cream, #F0EBE0)', margin: 0,
              letterSpacing: '-0.02em',
            }}>
              Mis alertas
            </h1>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13, marginTop: 6,
              color: 'rgba(240,235,224,0.5)', margin: '6px 0 0',
            }}>
              Te avisamos por email, push o WhatsApp cuando haya novedades en tu búsqueda.
            </p>
          </div>
          <button
            data-testid="nueva-alerta-btn"
            onClick={() => setShowModal(true)}
            style={{
              padding: '10px 18px', borderRadius: 9999, border: 'none', flexShrink: 0,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <Plus size={13} /> Nueva alerta
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '1px solid rgba(240,235,224,0.08)', paddingBottom: 0 }}>
          {[
            { key: 'activas', label: `Activas (${alerts.length})` },
            { key: 'historial', label: 'Historial' },
          ].map(t => (
            <button
              key={t.key}
              data-testid={`alertas-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 16px', borderRadius: '8px 8px 0 0',
                background: 'transparent', border: 'none',
                borderBottom: tab === t.key ? '2px solid #6366F1' : '2px solid transparent',
                fontFamily: 'DM Sans', fontWeight: tab === t.key ? 700 : 600, fontSize: 13,
                color: tab === t.key ? 'rgba(99,102,241,0.95)' : 'rgba(240,235,224,0.45)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>
        ) : error ? (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
            fontFamily: 'DM Sans', fontSize: 13, color: '#FCA5A5',
          }}>
            {error}
          </div>
        ) : tab === 'activas' ? (
          alerts.length === 0 ? (
            /* Empty state */
            <div style={{
              textAlign: 'center', padding: '60px 24px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(240,235,224,0.10)',
              borderRadius: 14,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 9999, margin: '0 auto 16px',
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={22} color="rgba(99,102,241,0.7)" />
              </div>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
                color: 'var(--cream, #F0EBE0)', marginBottom: 8,
              }}>
                Crea tu primera alerta
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.45)', marginBottom: 20, maxWidth: 340, margin: '0 auto 20px',
              }}>
                Te avisamos cuando aparezca tu propiedad ideal.
              </div>
              <button
                data-testid="create-first-alert-btn"
                onClick={() => setShowModal(true)}
                style={{
                  padding: '10px 22px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Crear alerta
              </button>
            </div>
          ) : (
            alerts.map(alert => (
              <AlertCard
                key={alert.alert_id}
                alert={alert}
                onToggle={handleToggle}
                onDelete={handleDelete}
                toggling={false}
                deleting={false}
              />
            ))
          )
        ) : (
          /* Historial tab */
          deliveries.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans', fontSize: 13,
            }}>
              Sin entregas registradas aún.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deliveries.map(d => (
                <div
                  key={d.delivery_id}
                  data-testid={`delivery-${d.delivery_id}`}
                  style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(13,16,23,0.85)',
                    border: '1px solid rgba(240,235,224,0.08)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <StatusIcon status={d.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                      color: 'var(--cream, #F0EBE0)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {d.payload?.summary || 'Alerta enviada'}
                    </div>
                    <div style={{
                      fontFamily: 'DM Sans', fontSize: 11, marginTop: 2,
                      color: 'rgba(240,235,224,0.4)',
                    }}>
                      {d.sent_at ? new Date(d.sent_at).toLocaleString('es-MX') : '—'}
                    </div>
                  </div>
                  {/* Channel badge */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 9999, flexShrink: 0,
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
                    color: 'rgba(165,180,252,0.85)',
                  }}>
                    {CHANNEL_LABELS[d.channel] || d.channel}
                  </span>
                  {/* Status badge */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 9999, flexShrink: 0,
                    background: d.status === 'sent'
                      ? 'rgba(134,239,172,0.10)'
                      : d.status === 'failed'
                        ? 'rgba(252,165,165,0.10)'
                        : 'rgba(253,230,138,0.10)',
                    border: `1px solid ${STATUS_COLORS[d.status] || 'rgba(240,235,224,0.15)'}30`,
                    fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
                    color: STATUS_COLORS[d.status] || 'rgba(240,235,224,0.5)',
                  }}>
                    {d.status === 'sent' ? 'Enviada' : d.status === 'failed' ? 'Fallida' : 'WA pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Modal nueva alerta */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
            background: 'rgba(6,8,15,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460,
              background: 'rgba(13,16,23,0.96)',
              border: '1px solid rgba(240,235,224,0.12)',
              borderRadius: 16, padding: 28,
              backdropFilter: 'blur(24px)',
            }}
          >
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
              color: 'var(--cream, #F0EBE0)', marginBottom: 20,
              letterSpacing: '-0.02em',
            }}>
              Nueva alerta
            </div>
            <AlertSettingsForm
              onSubmit={handleCreate}
              onCancel={() => setShowModal(false)}
              loading={creating}
            />
          </div>
        </div>
      )}
    </CompradorLayout>
  );
}
