import {
  asInstant,
  type Clock,
  type IdGenerator,
  type Instant,
  type LocalStore,
} from "@quickshop/core";

/** Storage that lives as long as the object. Share one between engines to simulate an app reload. */
export function createMemoryLocalStore(
  initial: Readonly<Record<string, string>> = {},
): LocalStore & {
  snapshot(): Record<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
    snapshot: () => Object.fromEntries(values),
  };
}

/** A clock that only moves when told to, so tests control every timestamp. */
export function createManualClock(
  start: Instant,
): Clock & { advance(ms: number): Instant; set(at: Instant): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current = asInstant(current + ms);
      return current;
    },
    set: (at) => {
      current = at;
    },
  };
}

/** Predictable ids: `prefix-1`, `prefix-2`, … */
export function createSequentialIds(prefix = "id"): IdGenerator {
  let next = 0;
  return { newId: () => `${prefix}-${String(++next)}` };
}
