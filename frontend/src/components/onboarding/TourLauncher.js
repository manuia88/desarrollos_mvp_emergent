/**
 * TourLauncher — Joyride global provider.
 * Montado en App.js dentro de AuthProvider.
 * Expone TourCtx para que PortalLayout y otros componentes accedan a startTour.
 */
import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { Joyride } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useTour } from '../../hooks/useTour';
import { getFirstLoginTourId } from '../../config/tours';
import { useAuth } from '../../App';
import useReducedMotion from '../../hooks/useReducedMotion';
import { Z } from '../../styles/zIndex';

// ─── Context ────────────────────────────────────────────────────────────────
export const TourCtx = createContext({ startTour: () => {}, stopTour: () => {} });
export const useTourContext = () => useContext(TourCtx);

// ─── Joyride options (Joyride v3 espera este shape SEPARADO de styles) ──────
// Bug-fix 2026-05-13: react-joyride@^3.1.0 lee options desde props.options · NO
// desde props.styles.options. Si se anida en styles, defaults toman precedencia
// (backgroundColor #ffffff = cuadro blanco · overlay sin tematizar).
function buildOptions(reducedMotion) {
  return {
    primaryColor: 'var(--theme)',
    backgroundColor: 'rgba(13,16,23,0.97)',
    textColor: '#F0EBE0',
    arrowColor: 'rgba(13,16,23,0.97)',
    // Bug-fix 2026-05-15: overlay oscuro a zIndex 9000 tapaba modales (zIndex
    // 200-2000) en developer module · 11+ páginas afectadas (CRM, Solicitudes,
    // Mini Market, Reportes, Demanda, Site Selection, Precios, Alianzas,
    // Configuración, Mis Proyectos, ProyectoDetail). Solución sistémica:
    // 1) overlayColor transparente (sin dimming · no bloquea clicks visuales)
    // 2) zIndex 5000 (debajo de cualquier modal estándar 1000-2000 · arriba
    //    de banners 200) · modales naturalmente quedan arriba del tour
    // 3) spotlight sigue funcionando para enfocar elemento sin oscurecer resto
    overlayColor: 'transparent',
    spotlightShadow: '0 0 0 3px var(--theme), 0 0 0 9999px rgba(6,8,15,0.35)',
    zIndex: Z.TOUR,
  };
}

// ─── Joyride styles (solo tooltips/buttons · no options) ─────────────────────
function buildStyles(reducedMotion) {
  return {
    tooltip: {
      borderRadius: 16,
      border: '1px solid rgba(var(--theme-rgb),0.28)',
      backdropFilter: 'blur(24px)',
      padding: '20px 24px',
      maxWidth: 'min(400px, 90vw)',
    },
    tooltipTitle: {
      fontFamily: 'Outfit',
      fontWeight: 800,
      fontSize: 16,
      color: '#F0EBE0',
      marginBottom: 6,
    },
    tooltipContent: {
      fontFamily: 'DM Sans',
      fontSize: 14,
      color: 'rgba(240,235,224,0.72)',
      lineHeight: 1.55,
      paddingTop: 2,
    },
    buttonNext: {
      borderRadius: 9999,
      fontFamily: 'DM Sans',
      fontWeight: 700,
      fontSize: 13,
      background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
      color: '#fff',
      border: 'none',
      padding: '8px 20px',
    },
    buttonBack: {
      borderRadius: 9999,
      fontFamily: 'DM Sans',
      fontSize: 12,
      color: 'rgba(240,235,224,0.55)',
      background: 'none',
      border: '1px solid rgba(var(--theme-rgb),0.35)',
      padding: '6px 14px',
    },
    buttonSkip: {
      fontFamily: 'DM Sans',
      fontSize: 12,
      color: 'rgba(240,235,224,0.4)',
      background: 'none',
      border: 'none',
    },
    buttonClose: {
      color: 'rgba(240,235,224,0.4)',
      top: 12,
      right: 12,
    },
  };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function TourLauncher({ children }) {
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const {
    run,
    tourId,
    steps: rawSteps,
    stepIndex,
    handleJoyrideCallback,
    startTour,
    stopTour,
  } = useTour(user);

  // Force-restart via localStorage (desde botón "Reiniciar tour")
  useEffect(() => {
    if (!user?.role) return;
    const flag = localStorage.getItem('dmx_restart_tour');
    if (flag) {
      localStorage.removeItem('dmx_restart_tour');
      const tid = getFirstLoginTourId(user.role);
      if (tid) setTimeout(() => startTour(tid), 800);
    }
  }, [user?.role, user?.user_id, startTour]);

  // Localizar steps desde i18n (fallback a strings hardcoded si la clave no existe)
  const steps = useMemo(() => {
    if (!tourId || !rawSteps.length) return rawSteps;
    return rawSteps.map((step, i) => {
      const baseKey = `tours.${tourId}.step${i + 1}`;
      const titleKey = `${baseKey}.title`;
      const contentKey = `${baseKey}.content`;
      const title = t(titleKey, { defaultValue: step.title });
      const content = t(contentKey, { defaultValue: step.content });
      return { ...step, title, content };
    });
  }, [rawSteps, tourId, t]);

  const jrStyles = useMemo(() => buildStyles(reducedMotion), [reducedMotion]);
  const jrOptions = useMemo(() => buildOptions(reducedMotion), [reducedMotion]);

  return (
    <TourCtx.Provider value={{ startTour, stopTour }}>
      {/* Bug-fix 2026-05-16: Joyride SOLO se monta cuando run=true · safeguard adicional
          al disableOverlay=true · si por alguna razón el overlay aparece bloqueando, no
          existe el componente en absoluto cuando el tour no está activo. */}
      {run && steps.length > 0 && (
        <Joyride
          steps={steps}
          run={run}
          stepIndex={stepIndex}
          callback={handleJoyrideCallback}
          continuous
          showProgress={steps.length > 4}
          showSkipButton
          scrollToFirstStep
          disableOverlayClose={false}
          spotlightClicks={true}
          // Bug-fix 2026-05-15 v2: disableOverlay elimina el div fullscreen
          // que tapaba modales (11+ páginas developer reportadas). Tooltips
          // siguen funcionando · sin overlay = sin bloqueo de clicks.
          disableOverlay={true}
          disableAnimation={reducedMotion}
          locale={{
            back: t('tours.nav.back', 'Atrás'),
            close: t('tours.nav.close', 'Cerrar'),
            last: t('tours.nav.last', 'Listo, ir al portal'),
            next: t('tours.nav.next', 'Siguiente'),
            skip: t('tours.nav.skip', 'Saltar tour'),
            open: t('tours.nav.open', 'Abrir'),
          }}
          options={jrOptions}
          styles={jrStyles}
        />
      )}
      {children}
    </TourCtx.Provider>
  );
}
