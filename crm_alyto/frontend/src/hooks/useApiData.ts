import { useCallback, useEffect, useRef, useState } from 'react';

export function useApiData<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T; loading: boolean; error: string | null; live: boolean }>({
    data: fallback,
    loading: true,
    error: null,
    live: false,
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ data, loading: false, error: null, live: true });
    } catch (err) {
      if (mounted.current) {
        setState({
          data: fallbackRef.current,
          loading: false,
          error: err instanceof Error ? err.message : 'Error de red',
          live: false,
        });
      }
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  const setData = useCallback((updater: T | ((prev: T) => T)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === 'function' ? (updater as (prev: T) => T)(s.data) : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}
