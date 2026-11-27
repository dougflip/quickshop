import {
  createManualClock,
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  createSequentialIds,
  sample,
  sampleItemId,
  type MemoryConnection,
  type MemoryServer,
} from "@quickshop/adapter-memory";
import {
  asInstant,
  createEngine,
  type Engine,
  type EngineState,
  type HouseholdData,
  type ReadyState,
} from "@quickshop/core";

export { sample, sampleItemId };

export type Person = "doug" | "alex";

export type Phone = {
  readonly engine: Engine;
  readonly connection: MemoryConnection;
  /** The phone's own storage; it outlives the engine, like a real device across app launches. */
  readonly store: ReturnType<typeof createMemoryLocalStore>;
  /** Closes the app and opens it again on the same device. */
  relaunch: () => Phone;
};

/** One shared server with the sample household, and a phone per person. */
export function household(): {
  server: MemoryServer;
  phone: (person: Person) => Phone;
  /** Waits until every phone has sent its changes and every change has been delivered. */
  sync: (...phones: Phone[]) => Promise<void>;
} {
  const server = createMemoryServer(createSampleSeed());
  const clock = createManualClock(asInstant(Date.UTC(2026, 10, 26, 10, 0)));
  const launch = (
    person: Person,
    connection: MemoryConnection,
    store: ReturnType<typeof createMemoryLocalStore>,
    launchCount: number,
  ): Phone => {
    const engine = createEngine({
      auth: connection.auth,
      backend: connection.backend,
      network: connection.network,
      store,
      clock: { now: () => clock.advance(1000) },
      ids: createSequentialIds(`${person}-${String(launchCount)}`),
    });
    return {
      engine,
      connection,
      store,
      relaunch: () => {
        engine.dispose();
        return launch(person, connection, store, launchCount + 1);
      },
    };
  };
  const phone = (person: Person): Phone =>
    launch(person, server.connect(), createMemoryLocalStore(), 1);
  const sync = async (...phones: Phone[]) => {
    await Promise.all(phones.map((p) => p.engine.idle()));
    await server.settle();
  };
  return { server, phone, sync };
}

export async function signIn(phone: Phone, person: Person): Promise<ReadyState> {
  const { email, password } = sample.credentials[person];
  await phone.engine.signIn(email, password);
  return ready(phone);
}

/** The phone's state, failing the test unless it is ready. */
export function ready(phone: Phone): ReadyState {
  const state: EngineState = phone.engine.getState();
  if (state.kind !== "ready") throw new Error(`expected ready, got ${state.kind}`);
  return state;
}

export const itemNames = (data: HouseholdData): string[] =>
  data.entries
    .map((e) => data.items.find((i) => i.id === e.itemId)?.name ?? "?")
    .toSorted((a, b) => a.localeCompare(b));

export const entryFor = (data: HouseholdData, itemName: string) => {
  const itemId = sampleItemId(itemName);
  const entry = data.entries.find((e) => e.itemId === itemId);
  if (entry === undefined) throw new Error(`${itemName} is not on the list`);
  return entry;
};
