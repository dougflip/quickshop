// The behaviour every backend adapter must have. An adapter's test file calls `backendContract`
// with a setup function that seeds the world described by `ContractWorld`.
import { describe, expect, it, vi } from "vitest";
import {
  asCategoryId,
  asEntryId,
  asInstant,
  asItemId,
  asTripId,
  type CategoryId,
  type EntryId,
  type HouseholdId,
  type Instant,
  type ItemId,
  type UserId,
} from "../../domain/ids.ts";
import type { Result } from "../../domain/result.ts";
import type { ListEntry } from "../../domain/types.ts";
import type { AuthPort } from "../auth.ts";
import type { Change, Mutation } from "../../domain/mutation.ts";
import type { BackendPort } from "../backend.ts";

export type ContractPerson = "doug" | "alex" | "olive";

export type ContractConnection = {
  readonly auth: AuthPort;
  readonly backend: BackendPort;
  /** Simulates losing and regaining the network. Offline tests are skipped without it. */
  readonly setOnline?: (online: boolean) => void;
};

/**
 * The seeded world. Required contents:
 * - Household "Home" with Doug and Alex (display names "Doug" and "Alex").
 * - Household "Elsewhere" with only Olive ("Olive"). It may be empty.
 * - Home categories: Produce (position 0), Dairy (position 1).
 * - Home items: Milk [Dairy], Bananas [Produce].
 * - Home list: one entry for Milk, needed, no note, added by Doug, updated before 2030.
 * - No trip in progress.
 * Every call to the setup function must return a fresh, independent world.
 */
export type ContractWorld = {
  readonly householdId: HouseholdId;
  readonly otherHouseholdId: HouseholdId;
  readonly users: Readonly<Record<ContractPerson, UserId>>;
  readonly credentials: Readonly<Record<ContractPerson, { email: string; password: string }>>;
  readonly categories: { readonly produce: CategoryId; readonly dairy: CategoryId };
  readonly items: { readonly milk: ItemId; readonly bananas: ItemId };
  readonly entries: { readonly milk: EntryId };
  /** A new id in the format the backend expects. */
  newId(): string;
  /** A new connection with nobody signed in. */
  connect(): Promise<ContractConnection>;
  /** Resolves once changes already applied have reached subscribers. */
  settle(): Promise<void>;
};

/** Timestamps well after anything the seed could contain. */
const t = (minute: number): Instant => asInstant(Date.UTC(2030, 0, 1, 10, minute));

function expectOk<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
}

function expectErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
}

/** Live changes can take a moment on a real backend. */
const waitLong = { timeout: 10_000, interval: 50 };

/** Subscribes, then loads, which is when delivery is guaranteed to have started (see BackendPort). */
async function listen(
  connection: ContractConnection,
  householdId: HouseholdId,
  onChange: (change: Change) => void,
) {
  const unsubscribe = connection.backend.subscribe(householdId, onChange);
  await connection.backend.loadHousehold(householdId);
  return unsubscribe;
}

async function signedIn(world: ContractWorld, who: ContractPerson) {
  const connection = await world.connect();
  const { email, password } = world.credentials[who];
  expectOk(await connection.auth.signIn(email, password));
  return connection;
}

export function backendContract(name: string, setup: () => Promise<ContractWorld>): void {
  async function homeAs(who: ContractPerson) {
    const world = await setup();
    const connection = await signedIn(world, who);
    const apply = (mutation: Mutation) => connection.backend.apply(world.householdId, mutation);
    const load = async () =>
      expectOk(await connection.backend.loadHousehold(world.householdId)).data;
    const entry = (id: EntryId, itemId: ItemId, minute = 1): ListEntry => ({
      id,
      itemId,
      note: null,
      status: "needed",
      addedBy: world.users[who],
      updatedAt: t(minute),
    });
    return { world, connection, apply, load, entry };
  }

  async function shopping(who: ContractPerson = "doug") {
    const home = await homeAs(who);
    const trip = {
      id: asTripId(home.world.newId()),
      startedBy: home.world.users[who],
      startedAt: t(1),
    };
    expectOk(await home.apply({ kind: "startTrip", trip }));
    return { ...home, trip };
  }

  describe(`${name}: backend contract`, () => {
    describe("auth", () => {
      it("rejects a wrong password", async () => {
        const world = await setup();
        const { auth } = await world.connect();
        expect(expectErr(await auth.signIn(world.credentials.doug.email, "wrong"))).toEqual({
          kind: "invalidCredentials",
        });
        expect(await auth.currentSession()).toBeNull();
      });

      it("signs in and keeps the session", async () => {
        const world = await setup();
        const { auth } = await world.connect();
        const session = expectOk(
          await auth.signIn(world.credentials.alex.email, world.credentials.alex.password),
        );
        expect(session.user).toEqual({
          id: world.users.alex,
          displayName: "Alex",
          email: world.credentials.alex.email,
        });
        expect(await auth.currentSession()).toEqual(session);
      });

      it("signs out, after which the backend refuses requests", async () => {
        const world = await setup();
        const { auth, backend } = await signedIn(world, "doug");
        await auth.signOut();
        expect(await auth.currentSession()).toBeNull();
        expect(expectErr(await backend.listHouseholds())).toEqual({ kind: "unauthorized" });
        expect(expectErr(await backend.loadHousehold(world.householdId))).toEqual({
          kind: "unauthorized",
        });
      });
    });

    describe("households", () => {
      it("lists only the user's households", async () => {
        const world = await setup();
        const doug = await signedIn(world, "doug");
        expect(expectOk(await doug.backend.listHouseholds())).toEqual([
          { id: world.householdId, name: "Home" },
        ]);
        const olive = await signedIn(world, "olive");
        expect(expectOk(await olive.backend.listHouseholds())).toEqual([
          { id: world.otherHouseholdId, name: "Elsewhere" },
        ]);
      });

      it("loads the seeded household", async () => {
        const { world, connection } = await homeAs("doug");
        const snapshot = expectOk(await connection.backend.loadHousehold(world.householdId));
        expect(snapshot.household).toEqual({ id: world.householdId, name: "Home" });
        expect(
          snapshot.members.map((m) => m.displayName).toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(["Alex", "Doug"]);
        const { data } = snapshot;
        expect(
          data.categories
            .toSorted((a, b) => a.position - b.position)
            .map((c) => [c.name, c.position]),
        ).toEqual([
          ["Produce", 0],
          ["Dairy", 1],
        ]);
        expect(
          data.items
            .toSorted((a, b) => a.name.localeCompare(b.name))
            .map((i) => [i.name, i.categoryIds]),
        ).toEqual([
          ["Bananas", [world.categories.produce]],
          ["Milk", [world.categories.dairy]],
        ]);
        expect(data.entries).toEqual([
          expect.objectContaining({
            id: world.entries.milk,
            itemId: world.items.milk,
            note: null,
            status: "needed",
            addedBy: world.users.doug,
          }),
        ]);
        expect(data.shop).toEqual({ kind: "planning" });
      });

      it("refuses access to a household the user is not in", async () => {
        const world = await setup();
        const olive = await signedIn(world, "olive");
        expect(expectErr(await olive.backend.loadHousehold(world.householdId))).toEqual({
          kind: "unauthorized",
        });
        expect(
          expectErr(
            await olive.backend.apply(world.householdId, {
              kind: "removeEntry",
              entryId: world.entries.milk,
            }),
          ),
        ).toEqual({ kind: "unauthorized" });
      });
    });

    describe("catalog mutations", () => {
      it("creates an item once; replaying it is ignored", async () => {
        const { world, apply, load } = await homeAs("doug");
        const item = {
          id: asItemId(world.newId()),
          name: "Eggs",
          categoryIds: [world.categories.dairy],
        };
        expect(expectOk(await apply({ kind: "createItem", item }))).toBe("applied");
        expect(expectOk(await apply({ kind: "createItem", item }))).toBe("ignored");
        expect((await load()).items).toContainEqual(item);
      });

      it("rejects a duplicate name and an unknown category", async () => {
        const { world, apply } = await homeAs("doug");
        const duplicate = await apply({
          kind: "createItem",
          item: { id: asItemId(world.newId()), name: "MILK", categoryIds: [] },
        });
        expect(expectErr(duplicate)).toEqual({
          kind: "rejected",
          reason: { kind: "duplicateItemName", existingItemId: world.items.milk },
        });
        const unknownCategory = await apply({
          kind: "createItem",
          item: {
            id: asItemId(world.newId()),
            name: "Eggs",
            categoryIds: [world.categories.dairy, asCategoryId(world.newId())],
          },
        });
        expect(expectErr(unknownCategory)).toMatchObject({
          kind: "rejected",
          reason: { kind: "categoryNotFound" },
        });
      });

      it("renames and recategorizes an item", async () => {
        const { world, apply, load } = await homeAs("alex");
        const { milk } = world.items;
        expect(expectOk(await apply({ kind: "renameItem", itemId: milk, name: "Oat milk" }))).toBe(
          "applied",
        );
        const categoryIds = [world.categories.produce, world.categories.dairy];
        expect(
          expectOk(await apply({ kind: "setItemCategories", itemId: milk, categoryIds })),
        ).toBe("applied");
        expect((await load()).items).toContainEqual({ id: milk, name: "Oat milk", categoryIds });
      });

      it("deletes an item along with its list entry; replaying it is ignored", async () => {
        const { world, apply, load } = await homeAs("doug");
        const mutation: Mutation = { kind: "deleteItem", itemId: world.items.milk };
        expect(expectOk(await apply(mutation))).toBe("applied");
        expect(expectOk(await apply(mutation))).toBe("ignored");
        const data = await load();
        expect(data.items.map((i) => i.name)).toEqual(["Bananas"]);
        expect(data.entries).toEqual([]);
      });

      it("ignores changes to an item that no longer exists", async () => {
        const { apply, world } = await homeAs("doug");
        const missing = asItemId(world.newId());
        expect(expectOk(await apply({ kind: "renameItem", itemId: missing, name: "X" }))).toBe(
          "ignored",
        );
        expect(
          expectOk(await apply({ kind: "setItemCategories", itemId: missing, categoryIds: [] })),
        ).toBe("ignored");
      });
    });

    describe("list mutations", () => {
      it("adds an entry, recording the signed-in user as who added it", async () => {
        const { world, apply, load, entry } = await homeAs("alex");
        const added = {
          ...entry(asEntryId(world.newId()), world.items.bananas),
          addedBy: world.users.doug,
        };
        expect(expectOk(await apply({ kind: "addEntry", entry: added }))).toBe("applied");
        expect(expectOk(await apply({ kind: "addEntry", entry: added }))).toBe("ignored");
        expect((await load()).entries).toContainEqual(
          expect.objectContaining({
            id: added.id,
            itemId: world.items.bananas,
            addedBy: world.users.alex,
          }),
        );
      });

      it("rejects adding an item that is already on the list", async () => {
        const { world, apply, entry } = await homeAs("doug");
        const result = await apply({
          kind: "addEntry",
          entry: entry(asEntryId(world.newId()), world.items.milk),
        });
        expect(expectErr(result)).toEqual({
          kind: "rejected",
          reason: { kind: "alreadyOnList", entryId: world.entries.milk },
        });
      });

      it("sets and clears a note", async () => {
        const { world, apply, load } = await homeAs("doug");
        const entryId = world.entries.milk;
        expect(
          expectOk(await apply({ kind: "setNote", entryId, note: " 2 gallons ", at: t(1) })),
        ).toBe("applied");
        expect((await load()).entries[0]?.note).toBe("2 gallons");
        await apply({ kind: "setNote", entryId, note: "", at: t(2) });
        expect((await load()).entries[0]?.note).toBeNull();
      });

      it("removes an entry; replaying it is ignored", async () => {
        const { world, apply, load } = await homeAs("doug");
        const mutation: Mutation = { kind: "removeEntry", entryId: world.entries.milk };
        expect(expectOk(await apply(mutation))).toBe("applied");
        expect(expectOk(await apply(mutation))).toBe("ignored");
        expect((await load()).entries).toEqual([]);
      });

      it("ignores a note for an entry that no longer exists", async () => {
        const { world, apply } = await homeAs("doug");
        const mutation: Mutation = {
          kind: "setNote",
          entryId: asEntryId(world.newId()),
          note: "x",
          at: t(1),
        };
        expect(expectOk(await apply(mutation))).toBe("ignored");
      });
    });

    describe("trips", () => {
      it("starts a trip; replaying it is ignored; a second trip is rejected", async () => {
        const { world, apply, load, trip } = await shopping("alex");
        expect((await load()).shop).toEqual({ kind: "shopping", trip });
        expect(expectOk(await apply({ kind: "startTrip", trip }))).toBe("ignored");
        const second = await apply({
          kind: "startTrip",
          trip: { id: asTripId(world.newId()), startedBy: world.users.alex, startedAt: t(2) },
        });
        expect(expectErr(second)).toEqual({
          kind: "rejected",
          reason: { kind: "tripAlreadyInProgress", trip },
        });
      });

      it("records the signed-in user as who started the trip", async () => {
        const { world, apply, load } = await homeAs("alex");
        const trip = { id: asTripId(world.newId()), startedBy: world.users.doug, startedAt: t(1) };
        expectOk(await apply({ kind: "startTrip", trip }));
        expect((await load()).shop).toEqual({
          kind: "shopping",
          trip: { ...trip, startedBy: world.users.alex },
        });
      });

      it("sets entry status, keeping the newest change", async () => {
        const { world, apply, load } = await shopping();
        const entryId = world.entries.milk;
        expect(
          expectOk(await apply({ kind: "setEntryStatus", entryId, status: "in_cart", at: t(5) })),
        ).toBe("applied");
        expect(
          expectOk(await apply({ kind: "setEntryStatus", entryId, status: "needed", at: t(4) })),
        ).toBe("ignored");
        expect((await load()).entries[0]).toMatchObject({ status: "in_cart", updatedAt: t(5) });
      });

      it("ignores entry status outside a trip and for missing entries", async () => {
        const { world, apply } = await homeAs("doug");
        const noTrip = await apply({
          kind: "setEntryStatus",
          entryId: world.entries.milk,
          status: "in_cart",
          at: t(5),
        });
        expect(expectOk(noTrip)).toBe("ignored");
        const s = await shopping();
        const missing = await s.apply({
          kind: "setEntryStatus",
          entryId: asEntryId(s.world.newId()),
          status: "in_cart",
          at: t(5),
        });
        expect(expectOk(missing)).toBe("ignored");
      });

      it("completes a trip, clearing only the bought entries; replaying it is ignored", async () => {
        const { world, apply, load, entry, trip } = await shopping();
        const bananas = entry(asEntryId(world.newId()), world.items.bananas, 6);
        expectOk(
          await apply({
            kind: "setEntryStatus",
            entryId: world.entries.milk,
            status: "in_cart",
            at: t(5),
          }),
        );
        expectOk(await apply({ kind: "addEntry", entry: bananas }));
        const complete: Mutation = {
          kind: "completeTrip",
          tripId: trip.id,
          completedAt: t(30),
          boughtEntryIds: [world.entries.milk],
          items: [{ itemId: world.items.milk, name: "Milk", note: null, outcome: "bought" }],
        };
        expect(expectOk(await apply(complete))).toBe("applied");
        expect(expectOk(await apply(complete))).toBe("ignored");
        const data = await load();
        expect(data.shop).toEqual({ kind: "planning" });
        expect(data.entries.map((e) => e.id)).toEqual([bananas.id]);
      });
    });

    describe("live changes", () => {
      it("delivers changes to every subscriber, including the one who made them", async () => {
        const { world, apply } = await homeAs("doug");
        const alex = await signedIn(world, "alex");
        const toAlex: Change[] = [];
        const toDoug: Change[] = [];
        await listen(alex, world.householdId, (c) => toAlex.push(c));
        const doug = await world.connect();
        expectOk(
          await doug.auth.signIn(world.credentials.doug.email, world.credentials.doug.password),
        );
        await listen(doug, world.householdId, (c) => toDoug.push(c));

        expectOk(await apply({ kind: "removeEntry", entryId: world.entries.milk }));
        const expected = { kind: "entryDeleted", entryId: world.entries.milk };
        await vi.waitFor(() => {
          expect(toAlex).toContainEqual(expected);
          expect(toDoug).toContainEqual(expected);
        }, waitLong);
      });

      it("sends the full saved row", async () => {
        const { world, apply, entry } = await homeAs("doug");
        const alex = await signedIn(world, "alex");
        const changes: Change[] = [];
        await listen(alex, world.householdId, (c) => changes.push(c));
        const added = entry(asEntryId(world.newId()), world.items.bananas);
        expectOk(await apply({ kind: "addEntry", entry: added }));
        await vi.waitFor(
          () => expect(changes).toContainEqual({ kind: "entrySaved", entry: added }),
          waitLong,
        );
      });

      it("stops after unsubscribing", async () => {
        const { world, apply } = await homeAs("doug");
        const alex = await signedIn(world, "alex");
        const changes: Change[] = [];
        const unsubscribe = await listen(alex, world.householdId, (c) => changes.push(c));
        unsubscribe();
        expectOk(await apply({ kind: "removeEntry", entryId: world.entries.milk }));
        await world.settle();
        expect(changes).toEqual([]);
      });

      it("delivers nothing to someone outside the household", async () => {
        const { world, apply } = await homeAs("doug");
        const olive = await signedIn(world, "olive");
        const changes: Change[] = [];
        await listen(olive, world.householdId, (c) => changes.push(c));
        expectOk(await apply({ kind: "removeEntry", entryId: world.entries.milk }));
        await world.settle();
        expect(changes).toEqual([]);
      });
    });

    describe("offline", () => {
      it("fails requests with unavailable and delivers nothing until back online", async () => {
        const { world, apply } = await homeAs("doug");
        const alex = await signedIn(world, "alex");
        if (alex.setOnline === undefined) return;
        const changes: Change[] = [];
        await listen(alex, world.householdId, (c) => changes.push(c));

        alex.setOnline(false);
        expect(expectErr(await alex.backend.loadHousehold(world.householdId))).toEqual({
          kind: "unavailable",
        });
        expect(
          expectErr(
            await alex.backend.apply(world.householdId, {
              kind: "removeEntry",
              entryId: world.entries.milk,
            }),
          ),
        ).toEqual({ kind: "unavailable" });
        expect(expectErr(await alex.auth.signIn("a", "b"))).toEqual({ kind: "unavailable" });
        expect(await alex.auth.currentSession()).not.toBeNull();

        expectOk(await apply({ kind: "removeEntry", entryId: world.entries.milk }));
        await world.settle();
        expect(changes).toEqual([]);

        alex.setOnline(true);
        expectOk(await apply({ kind: "deleteItem", itemId: world.items.bananas }));
        await vi.waitFor(
          () =>
            expect(changes).toContainEqual({ kind: "itemDeleted", itemId: world.items.bananas }),
          waitLong,
        );
      });
    });
  });
}
