import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async read and expose it as loading / error / data.
 *
 * The `settled` ref is the whole point: a screen that navigates away while a
 * fetch is in flight would otherwise set state on an unmounted tree, and on a
 * search screen that fires on every keystroke an older response can land after
 * a newer one and overwrite it. Both are silent — the screen just shows the
 * wrong horses — so the sequence number is checked before every commit.
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    const ticket = ++sequence.current;
    setLoading(true);

    run()
      .then((value) => {
        if (ticket !== sequence.current) return;
        setData(value);
        setLoading(false);
      })
      .catch(() => {
        if (ticket !== sequence.current) return;
        setLoading(false);
      });

    return () => {
      // Invalidate this ticket so a late response cannot commit.
      sequence.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, reload };
}

/** Debounce a value — used by the search field so it does not fetch per key. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
