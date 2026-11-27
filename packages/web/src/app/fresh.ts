import { useEffect, useRef, useState } from "react";

const flashMs = 1500;

/**
 * Ids that just appeared (not on first render), for a brief highlight, so someone else's
 * additions catch the eye. Presentation only.
 */
export function useFresh(ids: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  // Ids never contain spaces, so this string changes exactly when the ids do.
  const key = ids.join(" ");

  useEffect(() => {
    const current = key === "" ? [] : key.split(" ");
    if (seen.current === null) {
      seen.current = new Set(current);
      return;
    }
    const known = seen.current;
    const added = current.filter((id) => !known.has(id));
    for (const id of added) known.add(id);
    if (added.length === 0) return;
    setFresh((shown) => new Set([...shown, ...added]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setFresh((shown) => new Set([...shown].filter((id) => !added.includes(id))));
    }, flashMs);
    timers.current.add(timer);
  }, [key]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  return fresh;
}
