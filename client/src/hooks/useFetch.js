'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async fetcher and exposes { data, loading, error, reload }.
 * Handles the race where a fast second request would otherwise be
 * overwritten by a slow first one.
 *
 *   const { data, loading, reload } = useFetch(() => dashboardApi.summary(), []);
 */
export function useFetch(fetcher, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (skip) {
      setLoading(false);
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);

    try {
      const res = await fetcher();
      // Ignore a response that a newer request has already superseded.
      if (!mounted.current || requestId.current !== id) return;
      setData(res?.data ?? null);
      setMeta(res?.meta ?? null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!mounted.current || requestId.current !== id) return;
      setError(err);
    } finally {
      if (mounted.current && requestId.current === id) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, skip]);

  return { data, meta, loading, error, reload: run, setData };
}

/** Delays a rapidly-changing value — used for search inputs. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
