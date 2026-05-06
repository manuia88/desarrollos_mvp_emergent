/**
 * Batch 19 Sub-B — useCrossPortalEvents
 * Polls /api/orgs/cross-portal/events every 30s and shows toasts.
 */
import { useEffect, useRef } from 'react';
import { showCrossPortalSync } from '../lib/crossPortalToast';

const API = process.env.REACT_APP_BACKEND_URL;
const POLL_INTERVAL = 30000; // 30s

export function useCrossPortalEvents(enabled = true) {
  const lastSeenRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const params = lastSeenRef.current
          ? `?since=${encodeURIComponent(lastSeenRef.current)}&limit=10`
          : '?limit=5';

        const res = await fetch(`${API}/api/orgs/cross-portal/events${params}`, {
          credentials: 'include',
        });
        if (!res.ok) return;

        const data = await res.json();
        const events = data.events || [];

        if (events.length > 0) {
          // Update the cursor to the most recent event
          lastSeenRef.current = events[0].created_at;

          // Show toasts for new events (skip on initial load to avoid flooding)
          if (lastSeenRef.current) {
            events.forEach(evt => {
              showCrossPortalSync(evt.event_type, evt.affected_portals || []);
            });
          }
        } else if (!lastSeenRef.current) {
          // First poll, set cursor to now so future events show
          lastSeenRef.current = new Date().toISOString();
        }
      } catch {
        // Network errors are silent
      }
    };

    // First poll after 5s (to let the page settle)
    const initialTimer = setTimeout(() => {
      lastSeenRef.current = new Date().toISOString(); // don't show historical events
      timerRef.current = setInterval(poll, POLL_INTERVAL);
    }, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timerRef.current);
    };
  }, [enabled]);
}

export default useCrossPortalEvents;
