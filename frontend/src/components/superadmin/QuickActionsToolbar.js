// W2.6 SA8 — Quick actions toolbar (vertical · founder-defined CRUD)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, AlertTriangle, DollarSign, Sparkles, Camera, FolderUp, Star,
  Plus, X, Settings,
} from 'lucide-react';
import { deleteQuickAction, createQuickAction } from '../../api/superadminFounderConsole';
import { Z } from '../../styles/zIndex';

const ICON_MAP = {
  RefreshCw, AlertTriangle, DollarSign, Sparkles, Camera, FolderUp, Star,
};

const API = process.env.REACT_APP_BACKEND_URL;

async function executeAction(action, navigate) {
  const t = action.action_type;
  const p = action.payload || {};
  if (t === 'navigate') {
    navigate(p.route || '/superadmin');
  } else if (t === 'api_call') {
    try {
      const url = p.url.startsWith('http') ? p.url : `${API}${p.url}`;
      const res = await fetch(url, {
        method: p.method || 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: p.body ? JSON.stringify(p.body) : undefined,
      });
      return await res.json().catch(() => ({}));
    } catch (e) { console.warn(e); }
  } else if (t === 'impersonate') {
    try {
      const url = `${API}/api/superadmin/tenants/${encodeURIComponent(p.tenant_id)}/impersonate`;
      await fetch(url, { method: 'POST', credentials: 'include' });
      window.location.href = '/desarrollador';
    } catch (e) { console.warn(e); }
  }
}

function CreateModal({ onClose, onDone }) {
  const [label, setLabel] = useState('');
  const [actionType, setActionType] = useState('navigate');
  const [route, setRoute] = useState('/superadmin');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (label.length < 1) return;
    setBusy(true);
    try {
      const body = {
        label, action_type: actionType,
        payload: actionType === 'navigate'
          ? { route }
          : actionType === 'api_call'
            ? { method: 'POST', url: route }
            : { tenant_id: route },
        sort_order: 99,
      };
      await createQuickAction(body);
      onDone && onDone();
      onClose();
    } catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
        backdropFilter: 'blur(8px)', zIndex: Z.DRAWER,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div data-testid="qa-create-modal" style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)',
        borderRadius: 14, padding: 22,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream)', margin: 0 }}>Crear quick action</h3>
        <input data-testid="qa-label" value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Etiqueta"
          style={{
            padding: '9px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
          }} />
        <select value={actionType} onChange={e => setActionType(e.target.value)}
          data-testid="qa-action-type"
          style={{
            padding: '9px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
          }}>
          <option value="navigate">Navegar</option>
          <option value="api_call">Llamar API</option>
          <option value="impersonate">Impersonar tenant</option>
        </select>
        <input value={route} onChange={e => setRoute(e.target.value)}
          data-testid="qa-payload"
          placeholder={actionType === 'navigate' ? '/superadmin/...'
            : actionType === 'api_call' ? '/api/...' : 'tenant_id'}
          style={{
            padding: '9px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'var(--cream)', fontFamily: 'DM Mono, monospace',
            fontSize: 12, outline: 'none',
          }} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9999, background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,224,0.55)',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
          <button data-testid="qa-create-confirm" onClick={submit} disabled={busy}
            style={{
              padding: '9px 20px', borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}>{busy ? 'Creando…' : 'Crear'}</button>
        </div>
      </div>
    </div>
  );
}

export default function QuickActionsToolbar({ items, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const onDelete = async (id) => {
    try { await deleteQuickAction(id); onChanged && onChanged(); }
    catch (e) { console.warn(e); }
  };

  return (
    <div
      data-testid="quick-actions-toolbar"
      className="sa-quick-action-toolbar"
      style={{
        padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: 'rgba(240,235,224,0.55)',
        }}>Quick actions</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button data-testid="qa-personalize" onClick={() => setEditing(e => !e)}
            style={{
              padding: 4, borderRadius: 9999, background: 'transparent',
              border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer',
              color: editing ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
            }}>
            <Settings size={11} />
          </button>
          {editing && (
            <button data-testid="qa-add" onClick={() => setShowCreate(true)}
              style={{
                padding: 4, borderRadius: 9999,
                background: 'rgba(var(--theme-rgb),0.10)',
                border: '1px solid rgba(var(--theme-rgb),0.30)',
                cursor: 'pointer', color: 'var(--theme)',
              }}>
              <Plus size={11} />
            </button>
          )}
        </div>
      </div>
      {(items || []).map(qa => {
        const Icon = ICON_MAP[qa.icon_key] || Star;
        return (
          <div key={qa.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <button
              data-testid={`qa-item-${qa.id}`}
              onClick={() => executeAction(qa, navigate)}
              className="sa-quick-action"
              style={{
                flex: 1, padding: '9px 14px',
                color: 'var(--cream)', fontFamily: 'DM Sans',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                textAlign: 'left',
              }}
            >
              <Icon size={11} style={{ color: 'var(--sa-accent, var(--theme))', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>{qa.label}</span>
            </button>
            {editing && (
              <button data-testid={`qa-delete-${qa.id}`} onClick={() => onDelete(qa.id)}
                style={{
                  padding: 5, borderRadius: 9999,
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.28)',
                  color: '#F87171', cursor: 'pointer',
                }}>
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}
      {(!items || items.length === 0) && (
        <div style={{
          padding: 12, textAlign: 'center', fontFamily: 'DM Sans',
          fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)',
        }}>Sin acciones configuradas.</div>
      )}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)}
          onDone={() => { onChanged && onChanged(); }} />
      )}
    </div>
  );
}
