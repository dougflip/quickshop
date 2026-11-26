import {
  err,
  ok,
  type AuthPort,
  type BackendError,
  type BackendPort,
  type Change,
  type Household,
  type HouseholdData,
  type HouseholdId,
  type NetworkStatus,
  type Result,
  type Session,
  type UserId,
} from "@quickshop/core";
import { applyMutation, type StoredHousehold } from "./apply-mutation.ts";

export type MemoryUser = {
  readonly id: UserId;
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
};

export type MemoryHousehold = {
  readonly household: Household;
  /** In the order they joined. */
  readonly memberIds: readonly UserId[];
  readonly data: HouseholdData;
};

export type MemorySeed = {
  readonly users: readonly MemoryUser[];
  readonly households: readonly MemoryHousehold[];
};

/** One device talking to the server: its own session and its own network state. */
export type MemoryConnection = {
  readonly auth: AuthPort;
  readonly backend: BackendPort;
  readonly network: NetworkStatus;
  setOnline(online: boolean): void;
};

export type MemoryServer = {
  connect(): MemoryConnection;
  /** Resolves once every change applied so far has reached its subscribers. */
  settle(): Promise<void>;
  /** The server's current copy of a household, for tests. */
  inspect(householdId: HouseholdId): StoredHousehold | undefined;
};

type Subscriber = {
  readonly householdId: HouseholdId;
  readonly connection: ConnectionState;
  readonly onChange: (change: Change) => void;
};

type ConnectionState = { session: Session | null; online: boolean };

/**
 * A backend held in memory that several connections share, so tests and the harness can act as
 * two people on two phones. Changes are delivered asynchronously, like a real change feed.
 */
export function createMemoryServer(seed: MemorySeed): MemoryServer {
  const users = new Map(seed.users.map((u) => [u.id, u]));
  const households = new Map<
    HouseholdId,
    { household: Household; memberIds: readonly UserId[]; stored: StoredHousehold }
  >(
    seed.households.map((h) => [
      h.household.id,
      {
        household: h.household,
        memberIds: h.memberIds,
        stored: { data: h.data, completedTrips: [] },
      },
    ]),
  );
  const subscribers = new Set<Subscriber>();
  let deliveries: Promise<void> = Promise.resolve();

  function publish(householdId: HouseholdId, changes: readonly Change[]) {
    const recipients = [...subscribers].filter(
      (s) =>
        s.householdId === householdId && s.connection.online && isMember(s.connection, householdId),
    );
    deliveries = deliveries.then(() => {
      for (const change of changes) {
        for (const s of recipients) if (subscribers.has(s)) s.onChange(change);
      }
    });
  }

  function isMember(connection: ConnectionState, householdId: HouseholdId): boolean {
    const userId = connection.session?.user.id;
    return (
      userId !== undefined && (households.get(householdId)?.memberIds.includes(userId) ?? false)
    );
  }

  function connect(): MemoryConnection {
    const state: ConnectionState = { session: null, online: true };
    const networkListeners = new Set<(online: boolean) => void>();

    /** Every backend call goes through here: network first, then who is asking. */
    function guard<T>(
      householdId: HouseholdId | null,
      run: (userId: UserId) => Result<T, BackendError>,
    ): Promise<Result<T, BackendError>> {
      if (!state.online) return Promise.resolve(err({ kind: "unavailable" }));
      const userId = state.session?.user.id;
      if (userId === undefined) return Promise.resolve(err({ kind: "unauthorized" }));
      if (householdId !== null && !isMember(state, householdId)) {
        return Promise.resolve(err({ kind: "unauthorized" }));
      }
      return Promise.resolve(run(userId));
    }

    const auth: AuthPort = {
      currentSession: () => Promise.resolve(state.session),
      signIn: (email, password) => {
        if (!state.online) return Promise.resolve(err({ kind: "unavailable" }));
        const user = [...users.values()].find((u) => u.email === email && u.password === password);
        if (user === undefined) return Promise.resolve(err({ kind: "invalidCredentials" }));
        state.session = { user: { id: user.id, displayName: user.displayName } };
        return Promise.resolve(ok(state.session));
      },
      signOut: () => {
        state.session = null;
        return Promise.resolve();
      },
    };

    const backend: BackendPort = {
      listHouseholds: () =>
        guard(null, (userId) =>
          ok(
            [...households.values()]
              .filter((h) => h.memberIds.includes(userId))
              .map((h) => h.household),
          ),
        ),
      loadHousehold: (householdId) =>
        guard(householdId, () => {
          const h = households.get(householdId);
          if (h === undefined) return err({ kind: "unauthorized" });
          return ok({
            household: h.household,
            members: h.memberIds.flatMap((id) => {
              const user = users.get(id);
              return user === undefined ? [] : [{ userId: id, displayName: user.displayName }];
            }),
            data: h.stored.data,
          });
        }),
      apply: (householdId, mutation) =>
        guard(householdId, (userId) => {
          const h = households.get(householdId);
          if (h === undefined) return err({ kind: "unauthorized" });
          const result = applyMutation(h.stored, mutation, userId);
          if (!result.ok) return result;
          h.stored = result.value.household;
          publish(householdId, result.value.changes);
          return ok(result.value.outcome);
        }),
      subscribe: (householdId, onChange) => {
        const subscriber: Subscriber = { householdId, connection: state, onChange };
        subscribers.add(subscriber);
        return () => subscribers.delete(subscriber);
      },
    };

    const network: NetworkStatus = {
      isOnline: () => state.online,
      subscribe: (listener) => {
        networkListeners.add(listener);
        return () => networkListeners.delete(listener);
      },
    };

    return {
      auth,
      backend,
      network,
      setOnline: (online) => {
        if (state.online === online) return;
        state.online = online;
        for (const listener of networkListeners) listener(online);
      },
    };
  }

  return {
    connect,
    settle: () => deliveries,
    inspect: (householdId) => households.get(householdId)?.stored,
  };
}
