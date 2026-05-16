/**
 * W4.18.2A — AtlaxContextualButton
 * Botón flotante bottom-right. Obtiene context del mapa y abre AtlaxBubble.
 */
import React, { useState } from 'react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

export default function AtlaxContextualButton({ mapState, activeLayers, onOpenAtlax }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleClick = async () => {
    if (!mapState?.lat) {
      onOpenAtlax?.('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API}/api/maps/atlax-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          lat: mapState.lat,
          lng: mapState.lng,
          zoom: mapState.zoom || 11,
          active_layers: activeLayers ? Array.from(activeLayers) : ['devs', 'catastro'],
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        onOpenAtlax?.(data.context || '');
      } else {
        onOpenAtlax?.('');
      }
    } catch {
      onOpenAtlax?.('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      data-testid="atlax-contextual-btn"
      onClick={handleClick}
      disabled={loading}
      title="Preguntale a Atlax sobre esta zona del mapa"
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        width: 56,
        height: 56,
        borderRadius: '9999px',
        background: loading ? 'rgba(var(--theme-rgb),0.5)' : 'linear-gradient(135deg, var(--theme), var(--theme-3))',
        border: '2px solid rgba(255,255,255,0.15)',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(var(--theme-rgb),0.4)',
        zIndex: Z.STICKY,
        transition: 'all 0.25s ease',
      }}
    >
      {loading ? (
        <div style={{
          width: 20, height: 20, border: '2px solid rgba(255,255,255,0.4)',
          borderTopColor: '#fff', borderRadius: '50%',
          animation: 'atlax-ctx-spin 0.8s linear infinite',
        }} />
      ) : (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      <style>{`
        @keyframes atlax-ctx-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
