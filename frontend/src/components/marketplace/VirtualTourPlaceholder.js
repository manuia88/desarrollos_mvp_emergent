/**
 * VirtualTourPlaceholder — Phase 4 Batch 27 (Sub-C)
 * Embed 16:9 con tour virtual real (Pedra/Matterport) o placeholder con
 * captura de email para notificación cuando el tour esté listo.
 *
 * Props:
 *   propiedadId      — id del desarrollo
 *   propiedadNombre  — nombre legible
 *   tourUrl          — virtual_tour_url (si existe → embed iframe)
 */
import React, { useState } from 'react';
import { captureTourRequest } from '../../api/marketplace';
import { Sparkle } from '../icons';

export default function VirtualTourPlaceholder({
  propiedadId,
  propiedadNombre,
  tourUrl,
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Email inválido');
      return;
    }
    setLoading(true); setError(null);
    try {
      await captureTourRequest(propiedadId, propiedadNombre, email.trim());
      setDone(true);
    } catch (e) {
      setError(e?.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  // ── Tour real disponible ─────────────────────────────────────────────────
  if (tourUrl) {
    return (
      <div data-testid="virtual-tour-iframe" style={{
        position: 'relative',
        paddingTop: '56.25%', // 16:9
        background: 'rgba(13,16,23,0.92)',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(240,235,224,0.10)',
      }}>
        <iframe
          src={tourUrl}
          title="Tour virtual"
          allow="fullscreen; xr-spatial-tracking"
          allowFullScreen
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            border: 'none',
          }}
        />
      </div>
    );
  }

  // ── Placeholder + capture ────────────────────────────────────────────────
  return (
    <div data-testid="virtual-tour-placeholder" style={{
      position: 'relative',
      paddingTop: '56.25%',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.10))',
      borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(99,102,241,0.22)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(6,8,15,0.62)',
        backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px 24px', textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 11px', borderRadius: 9999,
          background: 'rgba(99,102,241,0.18)',
          border: '1px solid rgba(99,102,241,0.35)',
          fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
          color: 'rgba(165,180,252,1)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          marginBottom: 12,
        }}>
          <Sparkle size={10} /> Tour virtual
        </div>

        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px, 3vw, 26px)',
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
          marginBottom: 6, lineHeight: 1.2,
        }}>
          Tour virtual disponible próximamente
        </div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 13,
          color: 'rgba(240,235,224,0.6)',
          maxWidth: 380, marginBottom: 16,
        }}>
          Te avisamos en cuanto esté listo el recorrido 360° de {propiedadNombre || 'este desarrollo'}.
        </div>

        {done ? (
          <div data-testid="virtual-tour-done" style={{
            padding: '8px 14px', borderRadius: 9999,
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.30)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            color: '#86EFAC',
          }}>
            ✓ Te avisamos cuando esté listo · {email}
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: 8, width: '100%', maxWidth: 380,
            flexWrap: 'wrap', justifyContent: 'center',
          }}>
            <input
              data-testid="virtual-tour-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="tu@email.com"
              style={{
                flex: 1, minWidth: 200,
                padding: '10px 14px',
                background: 'rgba(13,16,23,0.85)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(240,235,224,0.20)'}`,
                borderRadius: 9999, outline: 'none',
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'var(--cream, #F0EBE0)',
              }}
            />
            <button
              data-testid="virtual-tour-submit"
              onClick={submit}
              disabled={loading}
              style={{
                padding: '10px 18px', borderRadius: 9999, border: 'none',
                background: loading
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(90deg,#6366F1,#EC4899)',
                color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Registrando…' : 'Avísame'}
            </button>
          </div>
        )}
        {error && (
          <div style={{
            marginTop: 8,
            fontFamily: 'DM Sans', fontSize: 11, color: '#FCA5A5',
          }}>{error}</div>
        )}
      </div>
    </div>
  );
}
