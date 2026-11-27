import type { Engine } from "@quickshop/core";

/** One simulated phone: its engine plus the knobs the harness can turn. */
export type Phone = {
  readonly id: string;
  readonly label: string;
  readonly engine: Engine;
  /** Goes up each time the app is relaunched on this phone. */
  readonly launch: number;
  readonly credentials: { readonly email: string; readonly password: string };
  readonly online: boolean;
  readonly serverReachable: boolean;
};

/**
 * Everything the harness can do, without saying which backend is behind it. Only `main.tsx`
 * knows that, so components never import an adapter.
 */
export type World = {
  /** One line about what is behind the harness. */
  readonly description: string;
  subscribe: (listener: () => void) => () => void;
  getPhones: () => readonly Phone[];
  setOnline: (phoneId: string, online: boolean) => void;
  setServerReachable: (phoneId: string, reachable: boolean) => void;
  /** Closes the app on that phone and opens it again, keeping its device storage. */
  relaunch: (phoneId: string) => void;
  /** Throws everything away and starts over from the sample household. Null on a real backend. */
  reset: (() => void) | null;
};
