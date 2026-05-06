/**
 * Phase 4 Batch 18.5 — useIsMobile
 *
 * Reactive viewport check. Re-renders when window crosses the breakpoint.
 * Default breakpoint: 768px (matches VistaPlanta + portal mobile threshold).
 * Pass `breakpoint=430` for the ProjectSwitcher fullscreen-modal threshold.
 *
 * Usage:
 *   const isMobile = useIsMobile();          // 768px
 *   const isTiny   = useIsMobile(430);
 */
import { useState, useEffect } from 'react';

function readMobile(bp) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= bp;
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => readMobile(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);

    // Sync once on mount (in case viewport changed between mount and effect)
    setIsMobile(mq.matches);

    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler); // Safari < 14

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
