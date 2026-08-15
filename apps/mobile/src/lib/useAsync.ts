import { useFocusEffect } from 'expo-router';
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

/**
 * Refetch whenever the screen comes back into view.
 *
 * A stack screen is not unmounted when another is pushed on top of it, so
 * returning from "add a competition" or "add a health record" showed the
 * record exactly as it was before — the new row was in the database and not on
 * the screen, which reads as the save having failed. Adding it to the deps
 * would not help: nothing in them changes on the way back.
 */
export function useReloadOnFocus(reload: () => void) {
  const first = useRef(true);

  useFocusEffect(
    useCallback(() => {
      // The first focus is the initial mount, which `useAsync` has already
      // fetched for; reloading again would double every screen's opening
      // request.
      if (first.current) {
        first.current = false;
        return;
      }

      reload();
    }, [reload]),
  );
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
