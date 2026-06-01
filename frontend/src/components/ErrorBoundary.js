// Error boundary global: evita la pantalla en blanco silenciosa cuando un componente
// truena en render. Reporta a Sentry y muestra un fallback amable con "Recargar".
import React from 'react';
import { Sentry } from '../observability';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Hacer visible el crash (antes quedaba como pantalla blanca invisible a Sentry).
    try {
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, { extra: { componentStack: info && info.componentStack } });
      }
    } catch (_) { /* no-op */ }
  }

  handleReload = () => {
    try { window.location.reload(); } catch (_) { /* no-op */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0b0d12', color: '#f0ebe0', padding: 24, textAlign: 'center',
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: 20, marginBottom: 8, fontWeight: 700 }}>Algo salió mal</h1>
          <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            Tuvimos un problema al mostrar esta pantalla. El sistema ya quedó avisado;
            intenta recargar.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: '#6366F1', color: '#fff', border: 'none', borderRadius: 9999,
              padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
