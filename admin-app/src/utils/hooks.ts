import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import { useApp } from "@/context/AppContext";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads data and refetches whenever the screen regains focus or the global
 * `dataVersion` changes.
 *
 * The focus refetch matters here because almost every edit happens on a pushed
 * screen: after saving a student the list underneath must reflect it without a
 * manual pull-to-refresh.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const { dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      if (!mounted.current) return;
      // Live updates refetch on every change anywhere in the hostel. When this
      // screen's data came back the same, keep the old object, so effects that
      // seed a form from it (the composer's ticked recipients, say) do not
      // reset under the admin because someone else edited something else.
      setData((previous) => (sameData(previous, result) ? previous : result));
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, tick, dataVersion, ...deps]);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run])
  );

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

function sameData(previous: unknown, next: unknown): boolean {
  if (previous === next) return true;
  if (previous === null || next === null) return false;
  try {
    return JSON.stringify(previous) === JSON.stringify(next);
  } catch {
    return false;
  }
}

/** Debounces a fast-changing value, used to keep search from querying per keystroke. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
