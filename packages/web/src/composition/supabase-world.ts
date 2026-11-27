import { createSupabaseConnection, hostedProject } from "@quickshop/adapter-supabase";
import type { Phone, World } from "../harness/world.ts";
import { createBrowserLocalStore } from "./browser-store.ts";
import { launch } from "./launch.ts";

/**
 * One phone on the hosted Supabase project. Open a second window to be the other person: the
 * session and device copy are kept in this tab's sessionStorage, so each window signs in separately.
 */
export function createSupabaseWorld(): World {
  const listeners = new Set<() => void>();
  const connection = createSupabaseConnection({
    project: hostedProject,
    storage: window.sessionStorage,
    storageKey: "quickshop-harness",
  });
  const device = { ...connection, store: createBrowserLocalStore(window.sessionStorage) };
  let phone: Phone = launch(
    device,
    {
      id: "this",
      label: "This window",
      credentials: { email: "", password: "" },
      online: true,
      serverReachable: true,
    },
    1,
  );
  let phones: readonly Phone[] = [phone];

  const update = (next: Phone) => {
    phone = next;
    phones = [phone];
    for (const listener of listeners) listener();
  };

  return {
    description:
      "One phone on the real Supabase project. Open another window to be the other person.",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPhones: () => phones,
    setOnline: (_phoneId, online) => {
      connection.setOnline(online);
      update({ ...phone, online });
    },
    setServerReachable: (_phoneId, reachable) => {
      connection.setServerReachable(reachable);
      update({ ...phone, serverReachable: reachable });
    },
    relaunch: () => {
      phone.engine.dispose();
      update(launch(device, phone, phone.launch + 1));
    },
    reset: null,
  };
}
