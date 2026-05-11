// W4.9.6 — Tour3DViewer
// Viewer 3D Gaussian Splatting · usa @mkkellogg/gaussian-splats-3d
import React, { useEffect, useRef, useState, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const THEME_BG = {
  cream: '#F0EBE0',
  light: '#F4F4F5',
  dark:  '#06080F',
};

export default function Tour3DViewer({
  scanId,
  viewerConfig,
  theme = 'cream',
  uiMode = 'full',
  onClose,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const sceneUrlRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [scan, setScan] = useState(null);

  // Fetch scan
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${API}/api/tour-3dgs/scans/${scanId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d?.ok) throw new Error(d?.detail || 'scan_unavailable');
        setScan(d.scan);
      })
      .catch(() => {
        if (alive) setError('Tour temporalmente no disponible · contacta asesor');
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [scanId]);

  // Initialise viewer
  useEffect(() => {
    if (!scan || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const GS = await import('@mkkellogg/gaussian-splats-3d');
        if (cancelled) return;
        const splatUrl = scan.spz_url || scan.splat_url || scan.ply_url;
        if (!splatUrl) {
          setError('Tour temporalmente no disponible · contacta asesor');
          setLoading(false);
          return;
        }
        const url = splatUrl.startsWith('http') ? splatUrl : `${API}${splatUrl}`;
        sceneUrlRef.current = url;

        // Guard: validate file size before attempting to parse (stub placeholders are tiny)
        try {
          const head = await fetch(url, { method: 'HEAD' });
          const size = parseInt(head.headers.get('content-length') || '0', 10);
          if (!head.ok || size > 0 && size < 1024) {
            setError('Tour temporalmente no disponible · contacta asesor');
            setLoading(false);
            return;
          }
        } catch (_) { /* if HEAD fails, attempt full load anyway */ }

        const cfg = { ...(viewerConfig || scan.viewer_config || {}) };
        const initialCamPos = cfg.camera_init_position || [0, 1.6, 4];
        const initialCamTgt = cfg.camera_init_target || [0, 1.0, 0];

        const viewer = new GS.Viewer({
          rootElement: containerRef.current,
          cameraUp: [0, 1, 0],
          initialCameraPosition: initialCamPos,
          initialCameraLookAt: initialCamTgt,
          selfDrivenMode: true,
          useBuiltInControls: true,
          sharedMemoryForWorkers: false,
          gpuAcceleratedSort: false,
        });
        viewerRef.current = viewer;

        await viewer.addSplatScene(url, {
          splatAlphaRemovalThreshold: 5,
          showLoadingUI: false,
          progressiveLoad: true,
        }).catch((err) => {
          // Bubble to outer catch with a clean error
          throw new Error('splat_load_failed');
        });
        if (cancelled) return;
        viewer.start();
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Tour temporalmente no disponible · contacta asesor');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (viewerRef.current?.stop) viewerRef.current.stop();
        if (viewerRef.current?.dispose) viewerRef.current.dispose();
      } catch (_) { /* noop */ }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const resetCamera = useCallback(() => {
    const v = viewerRef.current;
    const cfg = scan?.viewer_config || viewerConfig || {};
    if (!v) return;
    try {
      const pos = cfg.camera_init_position || [0, 1.6, 4];
      const tgt = cfg.camera_init_target || [0, 1.0, 0];
      v.camera?.position?.set?.(pos[0], pos[1], pos[2]);
      v.controls?.target?.set?.(tgt[0], tgt[1], tgt[2]);
      v.controls?.update?.();
    } catch (_) { /* noop */ }
  }, [scan, viewerConfig]);

  const handleShare = useCallback(() => {
    const unitId = scan?.unit_id || 'unidad';
    const url = `${window.location.origin}/embed/3dgs/${unitId}`;
    try {
      navigator.clipboard.writeText(url);
      setShareToast('Enlace copiado al portapapeles');
      setTimeout(() => setShareToast(''), 2200);
    } catch (_) {
      setShareToast('No se pudo copiar · ' + url);
      setTimeout(() => setShareToast(''), 3500);
    }
  }, [scan]);

  const isMinimal = uiMode === 'minimal';
  const bg = THEME_BG[theme] || THEME_BG.cream;

  return (
    <div
      data-testid="tour-3d-viewer"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: fullscreen ? 'auto' : '16 / 9',
        background: bg,
        borderRadius: isMinimal ? 0 : 16,
        overflow: 'hidden',
        border: isMinimal ? 'none' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading */}
      {loading && !error && (
        <div
          data-testid="tour-3d-loading"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14,
            background: theme === 'dark' ? 'rgba(6,8,15,0.85)' : 'rgba(240,235,224,0.85)',
            backdropFilter: 'blur(8px)',
            color: theme === 'dark' ? '#F0EBE0' : '#06080F',
            fontFamily: 'DM Sans', fontSize: 14,
          }}
        >
          <div style={{
            width: 42, height: 42, borderRadius: 9999,
            background: 'conic-gradient(from 0deg, #6366F1, #EC4899, #6366F1)',
            animation: 'tour3dSpin 1.05s linear infinite',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 4, borderRadius: 9999, background: bg,
            }} />
          </div>
          <div>Cargando tour 3D · 3-5 segundos…</div>
          <style>{`@keyframes tour3dSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
          background: theme === 'dark' ? 'rgba(6,8,15,0.9)' : 'rgba(240,235,224,0.9)',
          color: theme === 'dark' ? '#F0EBE0' : '#06080F',
          fontFamily: 'DM Sans', fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* Overlay controls */}
      {!loading && !error && (
        <>
          {/* Top-right: fullscreen */}
          <button
            type="button"
            data-testid="tour-3d-fullscreen-btn"
            onClick={toggleFullscreen}
            style={overlayBtn('top-right')}
            aria-label="Pantalla completa"
          >
            {fullscreen ? '⤡ Salir pantalla completa' : '⤢ Pantalla completa'}
          </button>

          {/* Bottom-left: reset camera */}
          <button
            type="button"
            data-testid="tour-3d-reset-btn"
            onClick={resetCamera}
            style={overlayBtn('bottom-left')}
            aria-label="Resetear cámara"
          >
            Resetear cámara
          </button>

          {/* Top-left: share */}
          {!isMinimal && (
            <button
              type="button"
              data-testid="tour-3d-share-btn"
              onClick={handleShare}
              style={overlayBtn('top-left')}
              aria-label="Compartir"
            >
              Compartir
            </button>
          )}

          {/* Close (only when onClose provided) */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={overlayBtn('top-right-far')}
              aria-label="Cerrar"
            >
              Cerrar
            </button>
          )}

          {shareToast && (
            <div style={{
              position: 'absolute', bottom: 18, left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(13,16,23,0.88)',
              color: '#F0EBE0',
              padding: '8px 16px', borderRadius: 9999,
              fontFamily: 'DM Sans', fontSize: 12,
              backdropFilter: 'blur(10px)',
            }}>
              {shareToast}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function overlayBtn(position) {
  const base = {
    position: 'absolute',
    background: 'rgba(13,16,23,0.72)',
    backdropFilter: 'blur(14px)',
    color: '#F0EBE0',
    border: '1px solid rgba(240,235,224,0.18)',
    borderRadius: 9999,
    padding: '7px 14px',
    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
    cursor: 'pointer',
    transition: 'transform 220ms ease, background 220ms ease',
    zIndex: 5,
  };
  const positions = {
    'top-right':     { top: 14, right: 14 },
    'top-right-far': { top: 14, right: 170 },
    'top-left':      { top: 14, left: 14 },
    'bottom-left':   { bottom: 14, left: 14 },
  };
  return { ...base, ...(positions[position] || {}) };
}
