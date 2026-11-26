// Composition root: the only file in the web app that chooses an adapter.
import {
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  sample,
  type MemoryConnection,
  type MemoryServer,
} from "@quickshop/adapter-memory";
import {
  asInstant,
  createEngine,
  type Clock,
  type IdGenerator,
  type LocalStore,
} from "@quickshop/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Harness } from "./harness/Harness.tsx";
import type { Phone, World } from "./harness/world.ts";

const clock: Clock = { now: () => asInstant(Date.now()) };
const ids: IdGenerator = { newId: () => crypto.randomUUID() };

type Device = {
  phone: Phone;
  readonly connection: MemoryConnection;
  readonly store: LocalStore;
};

function launch(
  device: Omit<Device, "phone">,
  phone: Omit<Phone, "engine" | "launch">,
  count: number,
): Phone {
  const engine = createEngine({
    auth: device.connection.auth,
    backend: device.connection.backend,
    network: device.connection.network,
    store: device.store,
    clock,
    ids,
  });
  void engine.start();
  return { ...phone, engine, launch: count };
}

function createWorld(): World {
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
        device,
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
        d.phone = launch(d, d.phone, d.phone.launch + 1);
      }),
    reset: build,
  };
}

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing #root");
createRoot(root).render(
  <StrictMode>
    <Harness world={createWorld()} />
  </StrictMode>,
);
