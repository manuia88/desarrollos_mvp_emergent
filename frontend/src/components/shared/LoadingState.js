/**
 * Phase 4 Batch 0 — LoadingState + ErrorState
 * Unified skeleton and error patterns.
 */
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

// ─── LoadingState ─────────────────────────────────────────────────────────────
export function LoadingState({
  variant = 'page',   // 'page' | 'card' | 'table' | 'inline' | 'overlay'
  rows = 3,
  message,
  className = '',
}) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-[rgba(240,235,224,0.5)] ${className}`} data-testid="loading-inline">
        <span className="w-4 h-4 border-2 border-[rgba(240,235,224,0.2)] border-t-[rgba(240,235,224,0.6)] rounded-full animate-spin" />
        <span className="text-sm">{message || 'Cargando…'}</span>
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-[var(--navy)]/80 backdrop-blur-sm rounded-xl z-20 ${className}`} data-testid="loading-overlay">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-2 border-[rgba(240,235,224,0.15)] border-t-[var(--cream)] rounded-full animate-spin" />
          {message && <p className="text-[rgba(240,235,224,0.6)] text-sm">{message}</p>}
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`rounded-2xl bg-[#0f1320] border border-[rgba(240,235,224,0.08)] p-4 space-y-3 animate-pulse ${className}`} data-testid="loading-card">
        <div className="h-5 bg-[rgba(240,235,224,0.08)] rounded-lg w-3/4" />
        <div className="h-3 bg-[rgba(240,235,224,0.05)] rounded-lg w-1/2" />
        <div className="h-16 bg-[rgba(240,235,224,0.05)] rounded-lg" />
        <div className="flex gap-2">
          <div className="h-8 flex-1 bg-[rgba(240,235,224,0.06)] rounded-lg" />
          <div className="h-8 flex-1 bg-[rgba(240,235,224,0.04)] rounded-lg" />
        </div>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`space-y-2 animate-pulse ${className}`} data-testid="loading-table">
        <div className="h-10 bg-[rgba(240,235,224,0.06)] rounded-lg" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 bg-[rgba(240,235,224,0.04)] rounded-lg" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }

  // Default: page variant
  return (
    <div className={`flex flex-col items-center justify-center py-24 gap-4 ${className}`} data-testid="loading-page">
      <div className="w-12 h-12 border-2 border-[rgba(240,235,224,0.1)] border-t-[var(--cream)] rounded-full animate-spin" />
      <p className="text-[rgba(240,235,224,0.45)] text-sm">{message || 'Cargando…'}</p>
    </div>
  );
}

// ─── ErrorState ────────────────────────────────────────────────────────────────
export function ErrorState({
  title = 'Algo salió mal',
  message,
  onRetry,
  variant = 'page',  // 'page' | 'card' | 'inline'
  className = '',
}) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-red-400 text-sm ${className}`} data-testid="error-inline">
        <AlertCircle size={14} />
        <span>{message || title}</span>
        {onRetry && (
          <button onClick={onRetry} className="underline text-xs hover:text-red-300 transition-colors">Reintentar</button>
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`rounded-2xl bg-[#0f1320] border border-red-900/40 p-4 ${className}`} data-testid="error-card">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} className="text-red-400" />
          <span className="text-red-400 font-medium text-sm">{title}</span>
        </div>
        {message && <p className="text-[rgba(240,235,224,0.4)] text-xs">{message}</p>}
        {onRetry && (
          <button onClick={onRetry} className="mt-3 flex items-center gap-1.5 text-xs text-[rgba(240,235,224,0.55)] hover:text-[var(--cream)] transition-colors">
            <RefreshCw size={11} />
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-24 gap-4 ${className}`} data-testid="error-page">
      <AlertCircle size={40} className="text-red-400/60" />
      <div className="text-center space-y-1">
        <p className="text-[var(--cream)] font-medium">{title}</p>
        {message && <p className="text-[rgba(240,235,224,0.45)] text-sm max-w-md">{message}</p>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(240,235,224,0.08)] text-[rgba(240,235,224,0.65)] hover:text-[var(--cream)] text-sm transition-all hover:bg-[rgba(240,235,224,0.12)]"
          data-testid="error-retry-btn"
        >
          <RefreshCw size={14} />
          Reintentar
        </button>
      )}
    </div>
  );
}

export default LoadingState;
