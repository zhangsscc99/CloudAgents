import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useRemote(path, dependencies = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const result = await api.get(path);
      setData(result);
      return result;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...dependencies]);

  return { data, setData, error, loading, reload: load };
}

export function useTicker(enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}
