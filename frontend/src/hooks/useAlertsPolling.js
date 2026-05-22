// W5.x F8 · useAlertsPolling · polling 30s + refresh on tab visibility
import { useCallback, useEffect, useRef, useState } from 'react';
import { listAlertas } from '../api/predictive_alerts';

const POLL_INTERVAL_MS = 30000;

export default function useAlertsPolling({ status = 'active', limit = 20, enabled = true } = {}) {
  const [alertas, setAlertas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [silentFailure, setSilentFailure] = useState(false);
  const mountedRef = useRef(true);
  const intervalRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    const data = await listAlertas({ status, limit });
    if (!mountedRef.current) return;
    if (data?._silent) {
      // Backend aun no disponible · mostrar empty state, sin error visible
      setSilentFailure(true);
      setAlertas([]);
      setTotal(0);
    } else {
      setSilentFailure(false);
      const list = Array.isArray(data?.alertas) ? data.alertas : (Array.isArray(data) ? data : []);
      setAlertas(list);
      setTotal(typeof data?.total === 'number' ? data.total : list.length);
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, [status, limit]);

  // Initial fetch + interval polling
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    fetchOnce();
    intervalRef.current = setInterval(fetchOnce, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchOnce]);

  // Refresh inmediato al regresar a la pestana
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOnce();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, fetchOnce]);

  return {
    alertas,
    total,
    loading,
    lastUpdated,
    silentFailure,
    refresh: fetchOnce,
  };
}
