// W5.x F7 · useBehavioralTracker · scroll/time/exit-intent + polling score endpoint
import { useEffect, useRef } from 'react';
import { postLeadCaptureScore } from '../api/lead_capture';

const SESSION_KEY = 'visitor_session_id';
const TRIGGER_FLAG_KEY = 'lead_capture_triggered_session';
const PROPERTIES_VIEWED_KEY = 'properties_viewed_count';
const POLL_INTERVAL_MS = 15000;
const MIN_TIME_BEFORE_POLL_S = 30;

function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `vs_${Date.now()}`;
  }
}

function readPropertiesViewed() {
  try {
    return parseInt(localStorage.getItem(PROPERTIES_VIEWED_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export default function useBehavioralTracker({ enabled = true, pageType = 'development', entityId = null } = {}) {
  const stateRef = useRef({
    scrollDepth: 0,
    timeOnPage: 0,
    exitIntentFired: false,
    triggered: false,
    sessionId: getOrCreateSessionId(),
  });

  useEffect(() => {
    if (!enabled) return undefined;

    // Si ya se disparo en esta sesion para esta page, no rearmar listener
    try {
      if (sessionStorage.getItem(TRIGGER_FLAG_KEY) === '1') {
        stateRef.current.triggered = true;
      }
    } catch { /* ignore */ }

    const onScroll = () => {
      const doc = document.documentElement;
      const total = (doc.scrollHeight - doc.clientHeight) || 1;
      const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / total) * 100)));
      if (pct > stateRef.current.scrollDepth) stateRef.current.scrollDepth = pct;
    };

    const onMouseLeave = (e) => {
      if (!stateRef.current.exitIntentFired && e.clientY < 10) {
        stateRef.current.exitIntentFired = true;
        // exit intent fuerza un poll inmediato
        runPoll();
      }
    };

    const tickInterval = setInterval(() => {
      stateRef.current.timeOnPage += 1;
    }, 1000);

    const dispatchTrigger = (audience, score) => {
      if (stateRef.current.triggered) return;
      stateRef.current.triggered = true;
      try { sessionStorage.setItem(TRIGGER_FLAG_KEY, '1'); } catch { /* ignore */ }
      try {
        window.dispatchEvent(new CustomEvent('lead_capture_trigger', {
          detail: { audience: audience || 'neutral', score: score || 0, entityId, pageType },
        }));
      } catch { /* ignore */ }
    };

    const runPoll = async () => {
      if (stateRef.current.triggered) return;
      if (stateRef.current.timeOnPage < MIN_TIME_BEFORE_POLL_S && !stateRef.current.exitIntentFired) return;
      const body = {
        visitor_session_id: stateRef.current.sessionId,
        scroll_depth_pct: stateRef.current.scrollDepth,
        time_on_page_sec: stateRef.current.timeOnPage,
        properties_viewed_count: readPropertiesViewed(),
        exit_intent_triggered: stateRef.current.exitIntentFired,
      };
      const r = await postLeadCaptureScore(body);
      if (r && r.should_trigger === true) {
        dispatchTrigger(r.suggested_audience, r.score);
      }
    };

    const pollInterval = setInterval(runPoll, POLL_INTERVAL_MS);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      clearInterval(tickInterval);
      clearInterval(pollInterval);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [enabled, pageType, entityId]);

  return stateRef;
}

export { SESSION_KEY, PROPERTIES_VIEWED_KEY };
