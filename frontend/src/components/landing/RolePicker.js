// RolePicker — mandatory modal shown after Google OAuth for users with onboarded=false.
// No close/escape allowed until a role is chosen.
import React, { useState } from 'react';
import { MapPin } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const ROLES = [
  {
    k: 'buyer',
    label: 'Soy comprador',
    sub: 'Exploro desarrollos, comparo barrios y guardo propiedades que me interesan.',
  },
  {
    k: 'advisor',
    label: 'Soy asesor inmobiliario',
    sub: 'Quiero gestionar mis contactos, búsquedas y operaciones dentro del CRM Pulppo+.',
  },
  {
    k: 'developer_admin',
    label: 'Represento una desarrolladora',
    sub: 'Administro inventario, analizo demanda por colonia y quiero usar pricing + reportes IA.',
  },
];

export default function RolePicker({ user, onDone }) {
  const [selected, setSelected] = useState('buyer');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/select-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: selected }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || 'No se pudo guardar tu selección');
      }
      const data = await r.json();
      onDone?.(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="role-picker-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(6,8,15,0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 520, maxWidth: '100%',
          background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          padding: 32,
          boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--grad)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              DesarrollosMX
            </div>
            <div className="eyebrow" style={{ marginTop: 2 }}>COMPLETA TU PERFIL</div>
          </div>
        </div>

        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
          color: 'var(--cream)', letterSpacing: '-0.02em',
          margin: '0 0 8px', lineHeight: 1.15,
        }}>
          Hola{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. ¿Cómo vas a usar DMX?
        </h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Elige tu rol para desbloquear la experiencia correcta. Puedes cambiarlo después desde tu perfil.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {ROLES.map(r => {
            const active = selected === r.k;
            return (
              <button
                key={r.k}
                data-testid={`role-picker-${r.k}`}
                onClick={() => setSelected(r.k)}
                style={{
                  textAlign: 'left',
                  padding: '13px 16px',
                  borderRadius: 14,
                  cursor: 'pointer',
                  background: active ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.48)' : 'var(--border)'}`,
                  color: 'var(--cream)',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15 }}>{r.label}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 3, lineHeight: 1.45 }}>
                  {r.sub}
                </div>
              </button>
            );
          })}
        </div>

        {err && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5', marginBottom: 10 }}>
            {err}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          data-testid="role-picker-submit"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
