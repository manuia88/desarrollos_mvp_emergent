// W5.x F11 · useFitScore · fetch score lead↔property con fail-silent
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFitScore } from '../api/fit';

export default function useFitScore({ leadId, propertyId, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    if (!enabled || !leadId || !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getFitScore(leadId, propertyId);
      if (!mountedRef.current) return;
      setData(res);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e?.message || 'fit_error');
      setData(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, leadId, propertyId]);

  useEffect(() => {
    mountedRef.current = true;
    run();
    return () => { mountedRef.current = false; };
  }, [run]);

  return { data, loading, error, refresh: run };
}
