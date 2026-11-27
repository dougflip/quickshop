import { describeError, type DomainError } from "../domain/errors.ts";
import {
  asEntryId,
  asItemId,
  asTripId,
  type CategoryId,
  type EntryId,
  type HouseholdId,
  type ItemId,
  type TripId,
} from "../domain/ids.ts";
import { applyChange, applyMutation, type Change, type Mutation } from "../domain/mutation.ts";
import { err, ok, type Result } from "../domain/result.ts";
import { activeTrip, completeTrip as completeTripDomain } from "../domain/trip.ts";
import type { CompletedTrip, EntryStatus, HouseholdData, ListEntry } from "../domain/types.ts";
import type { AuthError, AuthPort, SessionUser } from "../ports/auth.ts";
import type {
  BackendError,
  BackendPort,
  Household,
  HouseholdSnapshot,
  Member,
  Unsubscribe,
} from "../ports/backend.ts";
import type { Clock, IdGenerator, LocalStore, NetworkStatus } from "../ports/device.ts";
import { clearSaved, readSaved, worksOffline, writeSaved, type SavedHousehold } from "./offline.ts";

export type EngineDeps = {
  readonly auth: AuthPort;
  readonly backend: BackendPort;
  readonly network: NetworkStatus;
  /** Keeps the household and unsent changes on the device, for opening and shopping offline. */
  readonly store: LocalStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

/** Something the person should be told about: a change of theirs that did not stick. */
export type Notice =
  | { readonly kind: "rejected"; readonly mutation: Mutation; readonly reason: DomainError }
  | {
      readonly kind: "failed";
      readonly mutation: Mutation;
      readonly error: Exclude<BackendError, { kind: "rejected" }>;
    };

export type ReadyState = {
  readonly kind: "ready";
  readonly user: SessionUser;
  readonly household: Household;
  readonly members: readonly Member[];
  /** What the screens show: the server's data plus this device's changes not yet confirmed. */
  readonly data: HouseholdData;
  readonly online: boolean;
  /** Changes made on this device that the server has not confirmed yet. */
  readonly pendingCount: number;
  /** The trip this device just completed, for the summary screen. */
  readonly lastTrip: CompletedTrip | null;
  readonly notice: Notice | null;
};

export type EngineState =
  | { readonly kind: "starting" }
  | { readonly kind: "signedOut"; readonly signingIn: boolean; readonly error: AuthError | null }
  | { readonly kind: "loading"; readonly user: SessionUser }
  | { readonly kind: "noHousehold"; readonly user: SessionUser }
  | { readonly kind: "loadFailed"; readonly user: SessionUser; readonly error: BackendError }
  | ReadyState;

export type NotReady = { readonly kind: "notReady" };
/** Adding and editing need a connection; only shopping works offline. */
export type Offline = { readonly kind: "offline" };
export type CommandError = DomainError | NotReady | Offline;
export type CommandResult<T = void> = Result<T, CommandError>;

/** A short message a UI can show as-is. */
export function describeCommandError(error: CommandError): string {
  switch (error.kind) {
    case "notReady":
      return "Still loading. Try again in a moment.";
    case "offline":
      return "You're offline. Adding and editing need a connection; shopping still works.";
    case "emptyName":
    case "duplicateItemName":
    case "itemNotFound":
    case "categoryNotFound":
    case "alreadyOnList":
    case "entryNotFound":
    case "tripAlreadyInProgress":
    case "noTripInProgress":
    case "tripMismatch":
      return describeError(error);
  }
}

/** A short message for a change that did not stick, which a UI can show as-is. */
export function describeNotice(notice: Notice): string {
  switch (notice.kind) {
    case "rejected":
      return `That change was undone. ${describeError(notice.reason)}`;
    case "failed":
      switch (notice.error.kind) {
        case "unavailable":
          return "Couldn't reach QuickShop, so that change was undone. Try again.";
        case "unauthorized":
          return "You've been signed out, so that change was undone. Sign in again.";
      }
  }
}

export type Engine = {
  getState: () => EngineState;
  /** Called after every state change. `getState()` returns a new object only when it changed. */
  subscribe: (listener: () => void) => Unsubscribe;

  /** Restores a saved session if there is one. Call once at launch. */
  start: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Signs out and forgets this device's copy of the household, including unsent changes. */
  signOut: () => Promise<void>;
  /** Tries loading the household again after `loadFailed`. */
  retryLoad: () => Promise<void>;

  createItem: (input: {
    name: string;
    categoryIds: readonly CategoryId[];
  }) => CommandResult<ItemId>;
  /** Quick-add of something not in the catalog yet: creates it and puts it on the list. */
  addNewItemToList: (input: {
    name: string;
    categoryIds: readonly CategoryId[];
    note?: string;
  }) => CommandResult<{ itemId: ItemId; entryId: EntryId }>;
  renameItem: (itemId: ItemId, name: string) => CommandResult;
  setItemCategories: (itemId: ItemId, categoryIds: readonly CategoryId[]) => CommandResult;
  deleteItem: (itemId: ItemId) => CommandResult;

  addToList: (itemId: ItemId, note?: string) => CommandResult<EntryId>;
  removeFromList: (entryId: EntryId) => CommandResult;
  setNote: (entryId: EntryId, note: string) => CommandResult;

  startTrip: () => CommandResult<TripId>;
  /** Puts an entry in the cart, or takes it back out. Returns the new status. */
  toggleInCart: (entryId: EntryId) => CommandResult<EntryStatus>;
  completeTrip: () => CommandResult<CompletedTrip>;
  dismissTripSummary: () => void;
  dismissNotice: () => void;

  /** Resolves once every change that can be sent has been, and the device copy is saved. */
  idle: () => Promise<void>;
  dispose: () => void;
};

/** The signed-in household while ready. Mutable on purpose: this is the engine's private shell. */
type Live = {
  readonly user: SessionUser;
  readonly household: Household;
  members: readonly Member[];
  confirmed: HouseholdData;
  pending: readonly Mutation[];
  lastTrip: CompletedTrip | null;
  notice: Notice | null;
  readonly unsubscribe: Unsubscribe;
};

/**
 * The app's single source of truth. Screens read `getState()` and call commands; they hold no
 * logic of their own.
 *
 * Commands are checked locally, shown at once, and sent to the backend in order. The screen shows
 * the server's data with this device's unsent changes applied on top, so a change the server
 * refuses simply drops out and is reported as a notice. Offline, shopping changes wait in a queue
 * saved on the device and are sent when the connection returns.
 */
export function createEngine(deps: EngineDeps): Engine {
  const { auth, backend, network, store, clock, ids } = deps;
  const listeners = new Set<() => void>();
  let state: EngineState = { kind: "starting" };
  let live: Live | null = null;
  /** Bumped on sign-in and sign-out so late async results from an old session are dropped. */
  let generation = 0;
  let sending: Promise<void> | null = null;
  let sendAgain = false;
  let reconnecting: Promise<void> | null = null;
  let saving: Promise<void> = Promise.resolve();

  const stopWatchingNetwork = network.subscribe((online) => {
    if (live === null) return;
    publish();
    if (online) catchUp(live);
  });

  function setState(next: EngineState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function view(l: Live): HouseholdData {
    return l.pending.reduce((data, mutation) => {
      const result = applyMutation(data, mutation, l.user.id);
      return result.ok ? result.value.data : data;
    }, l.confirmed);
  }

  /** Shows the current household and saves the device copy. */
  function publish() {
    if (live === null) return;
    const l = live;
    setState({
      kind: "ready",
      user: l.user,
      household: l.household,
      members: l.members,
      data: view(l),
      online: network.isOnline(),
      pendingCount: l.pending.length,
      lastTrip: l.lastTrip,
      notice: l.notice,
    });
    const saved: SavedHousehold = {
      version: 1,
      household: l.household,
      members: l.members,
      confirmed: l.confirmed,
      pending: l.pending,
    };
    saving = saving.then(() => writeSaved(store, l.user.id, saved));
  }

  async function enterSession(user: SessionUser) {
    const gen = ++generation;
    setState({ kind: "loading", user });
    const saved = await readSaved(store, user.id);
    if (gen !== generation) return;
    if (!network.isOnline()) {
      if (saved === null)
        return setState({ kind: "loadFailed", user, error: { kind: "unavailable" } });
      return goLive(user, saved, gen);
    }

    const households = await backend.listHouseholds();
    if (gen !== generation) return;
    if (!households.ok) {
      if (households.error.kind === "unavailable" && saved !== null)
        return goLive(user, saved, gen);
      return setState({ kind: "loadFailed", user, error: households.error });
    }
    const household = households.value[0];
    if (household === undefined) return setState({ kind: "noHousehold", user });
    const pending = saved?.household.id === household.id ? saved.pending : [];

    // Subscribe first and hold early changes, so nothing is missed between load and subscribe.
    const early: Change[] = [];
    let target: Live | null = null;
    const unsubscribe = subscribeTo(household.id, () => target, early);
    const snapshot = await backend.loadHousehold(household.id);
    if (gen !== generation) return unsubscribe();
    if (!snapshot.ok) {
      unsubscribe();
      if (snapshot.error.kind === "unavailable" && saved !== null) return goLive(user, saved, gen);
      return setState({ kind: "loadFailed", user, error: snapshot.error });
    }
    target = {
      user,
      household: snapshot.value.household,
      members: snapshot.value.members,
      confirmed: early.reduce(applyChange, snapshot.value.data),
      pending,
      lastTrip: null,
      notice: null,
      unsubscribe,
    };
    live = target;
    publish();
    void send();
  }

  /** Opens the household from the device copy, then catches up if the network is there. */
  function goLive(user: SessionUser, saved: SavedHousehold, gen: number) {
    if (gen !== generation) return;
    let target: Live | null = null;
    const unsubscribe = subscribeTo(saved.household.id, () => target, []);
    target = {
      user,
      household: saved.household,
      members: saved.members,
      confirmed: saved.confirmed,
      pending: saved.pending,
      lastTrip: null,
      notice: null,
      unsubscribe,
    };
    live = target;
    publish();
    if (network.isOnline()) catchUp(target);
  }

  function subscribeTo(
    householdId: HouseholdId,
    target: () => Live | null,
    early: Change[],
  ): Unsubscribe {
    return backend.subscribe(
      householdId,
      (change) => {
        const l = target();
        if (l === null) {
          early.push(change);
          return;
        }
        if (live !== l) return;
        l.confirmed = applyChange(l.confirmed, change);
        publish();
      },
      () => {
        // Live delivery was interrupted, so changes may have been missed: catch up.
        const l = target();
        if (l !== null && live === l && network.isOnline()) catchUp(l);
      },
    );
  }

  function catchUp(l: Live) {
    reconnecting ??= reconnect(l).finally(() => {
      reconnecting = null;
    });
  }

  /** Back online: send what waited, then reload to pick up anything missed while away. */
  async function reconnect(l: Live) {
    await send();
    if (live !== l || !network.isOnline()) return;
    const snapshot: Result<HouseholdSnapshot, BackendError> = await backend.loadHousehold(
      l.household.id,
    );
    if (live !== l || !snapshot.ok) return;
    l.confirmed = snapshot.value.data;
    l.members = snapshot.value.members;
    publish();
  }

  function leaveSession() {
    generation++;
    live?.unsubscribe();
    live = null;
  }

  /**
   * Sends pending changes one at a time, oldest first. Stops when offline; a shopping change that
   * could not be delivered stays at the front of the queue for the next attempt. Asking again while
   * a pass is running schedules another pass, so a reconnect at the tail of one is not missed.
   */
  function send(): Promise<void> {
    if (sending !== null) {
      sendAgain = true;
      return sending;
    }
    sending = (async () => {
      do {
        sendAgain = false;
        // oxlint-disable-next-line no-await-in-loop -- each pass must finish before the next
        await drainQueue();
        // send() can set it again while the pass above is awaiting.
        // oxlint-disable-next-line typescript/no-unnecessary-condition
      } while (sendAgain);
    })().finally(() => {
      sending = null;
    });
    return sending;
  }

  async function drainQueue() {
    // Changes must reach the backend in order, so each waits for the one before it.
    // `live`, its queue and the network change while awaiting; the condition re-reads them.
    // oxlint-disable-next-line no-unmodified-loop-condition
    while (live !== null && live.pending.length > 0 && network.isOnline()) {
      const current = live;
      const [mutation] = current.pending;
      if (mutation === undefined) break;
      // oxlint-disable-next-line no-await-in-loop
      const result = await backend.apply(current.household.id, mutation);
      if (live !== current) break;
      if (!result.ok && result.error.kind === "unavailable" && worksOffline(mutation)) break;
      current.pending = current.pending.slice(1);
      if (result.ok) {
        const applied = applyMutation(current.confirmed, mutation, current.user.id);
        if (applied.ok) current.confirmed = applied.value.data;
      } else {
        current.notice = toNotice(mutation, result.error);
      }
      publish();
    }
  }

  /**
   * Checks the mutations against what the screen shows, queues them and shows them at once.
   * Nothing is queued if any of them is refused, or if one needs a connection that is missing.
   * Local mistakes are reported before the missing connection.
   */
  function commit<T>(
    build: (ctx: {
      live: Live;
      data: HouseholdData;
    }) => Result<{ mutations: readonly Mutation[]; value: T }, DomainError>,
  ): CommandResult<T> {
    if (live === null) return err({ kind: "notReady" });
    const current = live;
    const built = build({ live: current, data: view(current) });
    if (!built.ok) return built;
    let data = view(current);
    for (const mutation of built.value.mutations) {
      const result = applyMutation(data, mutation, current.user.id);
      if (!result.ok) return result;
      data = result.value.data;
    }
    if (!network.isOnline() && !built.value.mutations.every(worksOffline)) {
      return err({ kind: "offline" });
    }
    current.pending = [...current.pending, ...built.value.mutations];
    publish();
    void send();
    return ok(built.value.value);
  }

  function newEntry(ctx: { live: Live }, itemId: ItemId, note: string | undefined): ListEntry {
    return {
      id: asEntryId(ids.newId()),
      itemId,
      note: note ?? null,
      status: "needed",
      addedBy: ctx.live.user.id,
      updatedAt: clock.now(),
    };
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start() {
      const session = await auth.currentSession();
      if (session === null) setState({ kind: "signedOut", signingIn: false, error: null });
      else await enterSession(session.user);
    },

    async signIn(email, password) {
      setState({ kind: "signedOut", signingIn: true, error: null });
      const result = await auth.signIn(email, password);
      if (!result.ok) return setState({ kind: "signedOut", signingIn: false, error: result.error });
      await enterSession(result.value.user);
    },

    async signOut() {
      const userId = live?.user.id ?? null;
      leaveSession();
      if (userId !== null) saving = saving.then(() => clearSaved(store, userId));
      await saving;
      await auth.signOut();
      setState({ kind: "signedOut", signingIn: false, error: null });
    },

    async retryLoad() {
      if (state.kind === "loadFailed") await enterSession(state.user);
    },

    createItem: (input) =>
      commit(() => {
        const id = asItemId(ids.newId());
        return single({ kind: "createItem", item: { id, ...input } }, id);
      }),

    addNewItemToList: (input) =>
      commit((ctx) => {
        const itemId = asItemId(ids.newId());
        const entry = newEntry(ctx, itemId, input.note);
        return ok({
          mutations: [
            {
              kind: "createItem",
              item: { id: itemId, name: input.name, categoryIds: input.categoryIds },
            },
            { kind: "addEntry", entry },
          ],
          value: { itemId, entryId: entry.id },
        });
      }),

    renameItem: (itemId, name) =>
      commit(() => single({ kind: "renameItem", itemId, name }, undefined)),

    setItemCategories: (itemId, categoryIds) =>
      commit(() => single({ kind: "setItemCategories", itemId, categoryIds }, undefined)),

    deleteItem: (itemId) => commit(() => single({ kind: "deleteItem", itemId }, undefined)),

    addToList: (itemId, note) =>
      commit((ctx) => {
        const entry = newEntry(ctx, itemId, note);
        return single({ kind: "addEntry", entry }, entry.id);
      }),

    removeFromList: (entryId) => commit(() => single({ kind: "removeEntry", entryId }, undefined)),

    setNote: (entryId, note) =>
      commit(() => single({ kind: "setNote", entryId, note, at: clock.now() }, undefined)),

    startTrip: () =>
      commit((ctx) => {
        const current = activeTrip(ctx.data.shop);
        if (current !== null) return err({ kind: "tripAlreadyInProgress", trip: current });
        const id = asTripId(ids.newId());
        return single(
          { kind: "startTrip", trip: { id, startedBy: ctx.live.user.id, startedAt: clock.now() } },
          id,
        );
      }),

    toggleInCart: (entryId) =>
      commit(({ data }) => {
        if (activeTrip(data.shop) === null) return err({ kind: "noTripInProgress" });
        const entry = data.entries.find((e) => e.id === entryId);
        if (entry === undefined) return err({ kind: "entryNotFound", entryId });
        const status: EntryStatus = entry.status === "needed" ? "in_cart" : "needed";
        return single({ kind: "setEntryStatus", entryId, status, at: clock.now() }, status);
      }),

    completeTrip() {
      const result = commit(({ data }) => {
        const current = activeTrip(data.shop);
        if (current === null) return err({ kind: "noTripInProgress" });
        const completed = completeTripDomain(data, { tripId: current.id, at: clock.now() });
        if (!completed.ok) return completed;
        const { trip } = completed.value;
        return single(
          {
            kind: "completeTrip",
            tripId: trip.id,
            completedAt: trip.completedAt,
            boughtEntryIds: data.entries.filter((e) => e.status === "in_cart").map((e) => e.id),
            items: trip.items,
          },
          trip,
        );
      });
      if (result.ok && live !== null) {
        live.lastTrip = result.value;
        publish();
      }
      return result;
    },

    dismissTripSummary() {
      if (live === null) return;
      live.lastTrip = null;
      publish();
    },

    dismissNotice() {
      if (live === null) return;
      live.notice = null;
      publish();
    },

    async idle() {
      // A new send or catch-up can start while awaiting another, and each publish queues a save.
      // oxlint-disable-next-line no-unmodified-loop-condition
      while (sending !== null || reconnecting !== null) {
        // oxlint-disable-next-line no-await-in-loop
        await Promise.all([sending, reconnecting]);
      }
      await saving;
    },

    dispose() {
      leaveSession();
      stopWatchingNetwork();
      listeners.clear();
    },
  };
}

const single = <T>(mutation: Mutation, value: T) => ok({ mutations: [mutation], value });

function toNotice(mutation: Mutation, error: BackendError): Notice {
  switch (error.kind) {
    case "rejected":
      return { kind: "rejected", mutation, reason: error.reason };
    case "unavailable":
    case "unauthorized":
      return { kind: "failed", mutation, error };
  }
}
