import {
  asInstant,
  createEngine,
  type AuthPort,
  type BackendPort,
  type Clock,
  type IdGenerator,
  type LocalStore,
  type NetworkStatus,
} from "@quickshop/core";
import type { Phone } from "../harness/world.ts";

const clock: Clock = { now: () => asInstant(Date.now()) };
const ids: IdGenerator = { newId: () => crypto.randomUUID() };

/** What one phone has whichever backend is behind it: a connection and its own storage. */
export type DeviceParts = {
  readonly auth: AuthPort;
  readonly backend: BackendPort;
  readonly network: NetworkStatus;
  readonly store: LocalStore;
};

/** Starts the app on a phone: a fresh engine over the phone's connection and storage. */
export function launch(
  device: DeviceParts,
  phone: Omit<Phone, "engine" | "launch">,
  count: number,
): Phone {
  const engine = createEngine({
    auth: device.auth,
    backend: device.backend,
    network: device.network,
    store: device.store,
    clock,
    ids,
  });
  void engine.start();
  return { ...phone, engine, launch: count };
}
