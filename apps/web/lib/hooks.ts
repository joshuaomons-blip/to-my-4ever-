'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

/** Minimal data hook: fetch on mount, optional polling, manual reload. */
export function useApi<T>(path: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Network error'));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    setLoading(!!path);
    load();
    if (!opts.refreshMs) return () => void (alive.current = false);
    const t = setInterval(load, opts.refreshMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, opts.refreshMs, path]);
  return { data, error, loading, reload: load, setData };
}
