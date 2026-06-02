/**
 * Batch 19 Sub-A — useTour hook
 * Manages Joyride tour lifecycle per user role.
 */
import { useState, useEffect, useCallback } from 'react';
import { TOURS, getFirstLoginTourId } from '../config/tours';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Fix definitivo "tour se atora / pantalla congelada" (2026-06-02) ──────────
// CAUSA RAÍZ: los tours (react-joyride) apuntan a elementos del DOM por
// data-testid (nav-item-*, nuevo-proyecto-btn, diagnostic-widget…). Cada rediseño
// de UI mueve/renombra esos elementos → el paso queda sin target → react-joyride
// deja un overlay huérfano a pantalla completa SIN tooltip (sin botón para avanzar
// ni cerrar) = pantalla "congelada". Los parches previos tocaron el overlay, nunca
// esta causa. Durante el rediseño del portal Dev se rompería en CADA pantalla.
//
// Capa 1 (aquí): tours APAGADOS por defecto — auto Y manual (react-joyride deja un
//   overlay a pantalla completa SIN tooltip aun en pasos con target válido = "stall").
//   Revivible con el flag cuando la UI esté estable y los anchors de tours.js sean
//   estables (idealmente migrar a un walkthrough propio sin react-joyride).
// Capa 2: startTour filtra pasos cuyo target NO existe (defensa si se revive).
// Capa 3 (TourLauncher): limpieza de overlays huérfanos cuando el tour no corre.
const TOURS_ENABLED = process.env.REACT_APP_ONBOARDING_TOURS === 'true';

// Mantiene solo los pasos cuyo target existe (o son centrados/body).
function filterStepsToDom(steps) {
  if (typeof document === 'undefined') return steps || [];
  return (steps || []).filter((s) => {
    const t = s?.target;
    if (!t || t === 'body' || s.placement === 'center') return true;
    try { return !!document.querySelector(t); } catch { return false; }
  });
}

async function fetchPrefs() {
  try {
    const res = await fetch(`${API}/api/preferences/me`, { credentials: 'include' });
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

async function markTourComplete(tour_id) {
  try {
    await fetch(`${API}/api/preferences/me/tour-complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id }),
    });
  } catch {}
}

async function markTourDismiss(tour_id) {
  try {
    await fetch(`${API}/api/preferences/me/tour-dismiss`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id }),
    });
  } catch {}
}

/**
 * useTour(user)
 *
 * Returns:
 *   { run, tourId, steps, stepIndex, handleJoyrideCallback, startTour, stopTour }
 */
export function useTour(user) {
  const [run, setRun] = useState(false);
  const [tourId, setTourId] = useState(null);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);

  // On user load: check if first_login tour is needed
  useEffect(() => {
    if (!TOURS_ENABLED) return;  // Capa 1: auto-tour apagado (anti-stall durante rediseño)
    if (!user?.role) return;

    const firstLoginId = getFirstLoginTourId(user.role);
    if (!firstLoginId) return;

    fetchPrefs().then((prefs) => {
      const completed = prefs.tours_completed || [];
      const dismissed = prefs.tours_dismissed || [];

      if (!completed.includes(firstLoginId) && !dismissed.includes(firstLoginId)) {
        const tour = TOURS[firstLoginId];
        if (tour) {
          setTourId(firstLoginId);
          setSteps(tour.steps);
          // Bug-fix 2026-05-15 v2: el tour overlay zIndex 9000 tapaba modales
          // estándar (zIndex 200-2000) en developer module y otros portales.
          // Detección sistémica de bloqueadores:
          //   a) body classes (dmx-onboarding-blocking · dmx-tour-blocker)
          //   b) cualquier elemento [role="dialog"] (modales accesibles)
          //   c) body.style.overflow === 'hidden' (modales bloquean scroll)
          // Si cualquiera presente → esperar · sin esto, modales aparecen
          // tapados por el overlay del tour e impiden cerrarlos.
          setTimeout(() => {
            const tryLaunch = () => {
              const hasBlockerClass = document.body.classList.contains('dmx-onboarding-blocking')
                || document.body.classList.contains('dmx-tour-blocker');
              const hasDialog = document.querySelector('[role="dialog"]') !== null;
              const bodyLocked = document.body.style.overflow === 'hidden';
              if (hasBlockerClass || hasDialog || bodyLocked) {
                setTimeout(tryLaunch, 500);
              } else {
                setRun(true);
              }
            };
            tryLaunch();
          }, 2000);
        }
      }
    });
  }, [user?.role, user?.user_id]);

  const startTour = useCallback((id) => {
    if (!TOURS_ENABLED) return;  // Capa 1: tour manual también apagado durante el rediseño
    const tour = TOURS[id];
    if (!tour) return;
    // Capa 2: solo pasos cuyo target existe AHORA → el tour nunca se atora en un
    // elemento ausente. Si no queda ninguno, no se arranca (evita overlay huérfano).
    const usable = filterStepsToDom(tour.steps);
    if (!usable.length) return;
    setTourId(id);
    setSteps(usable);
    setStepIndex(0);
    setRun(true);
  }, []);

  const stopTour = useCallback(() => {
    setRun(false);
    setStepIndex(0);
  }, []);

  const handleJoyrideCallback = useCallback(async (data) => {
    const { action, index, status, type } = data;

    // Import STATUS + EVENTS lazily to avoid SSR issues
    const { EVENTS, STATUS } = await import('react-joyride');

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + (action === 'PREV' ? -1 : 1));
    } else if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRun(false);
      setStepIndex(0);

      if (status === STATUS.FINISHED && tourId) {
        await markTourComplete(tourId);
      } else if (status === STATUS.SKIPPED && tourId) {
        await markTourDismiss(tourId);
      }
    }
    // Bug-fix 2026-05-15: si Joyride dispara action 'close' (X del tooltip), tratar como skip
    // y dismissar permanentemente. Previene tooltips atascados sin botón Saltar visible.
    if (action === 'close' && tourId) {
      setRun(false);
      setStepIndex(0);
      await markTourDismiss(tourId);
    }
  }, [tourId]);

  return { run, tourId, steps, stepIndex, handleJoyrideCallback, startTour, stopTour };
}

export default useTour;
