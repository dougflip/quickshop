import {
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  sample,
  type MemoryConnection,
  type MemoryServer,
} from "@quickshop/adapter-memory";
import type { LocalStore } from "@quickshop/core";
import type { Phone, World } from "../harness/world.ts";
import { launch } from "./launch.ts";

type Device = {
  phone: Phone;
  readonly connection: MemoryConnection;
  readonly store: LocalStore;
};

const parts = (d: Omit<Device, "phone">) => ({ ...d.connection, store: d.store });

/** Doug's and Alex's phones side by side, sharing one in-memory server. */
export function createMemoryWorld(): World {
  const listeners = new Set<() => void>();
  let server: MemoryServer;
  let devices: Device[] = [];
  let phones: readonly Phone[] = [];

  const changed = () => {
    phones = devices.map((d) => d.phone);
    for (const listener of listeners) listener();
  };

  const build = () => {
    for (const d of devices) d.phone.engine.dispose();
    server = createMemoryServer(createSampleSeed());
    devices = (["doug", "alex"] as const).map((person) => {
      const device = { connection: server.connect(), store: createMemoryLocalStore() };
      const label = `${person === "doug" ? "Doug" : "Alex"}'s phone`;
      const phone = launch(
        parts(device),
        {
          id: person,
          label,
          credentials: sample.credentials[person],
          online: true,
          serverReachable: true,
        },
        1,
      );
      return { ...device, phone };
    });
    changed();
  };

  const update = (phoneId: string, fn: (d: Device) => void) => {
    const device = devices.find((d) => d.phone.id === phoneId);
    if (device === undefined) return;
    fn(device);
    changed();
  };

  build();
  return {
    description: "Two phones on an in-memory backend. Everything resets on page reload.",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPhones: () => phones,
    setOnline: (phoneId, online) =>
      update(phoneId, (d) => {
        d.connection.setOnline(online);
        d.phone = { ...d.phone, online };
      }),
    setServerReachable: (phoneId, reachable) =>
      update(phoneId, (d) => {
        d.connection.setServerReachable(reachable);
        d.phone = { ...d.phone, serverReachable: reachable };
      }),
    relaunch: (phoneId) =>
      update(phoneId, (d) => {
        d.phone.engine.dispose();
        d.phone = launch(parts(d), d.phone, d.phone.launch + 1);
      }),
    reset: build,
  };
}
