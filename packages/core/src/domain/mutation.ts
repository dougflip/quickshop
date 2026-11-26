import { createItem, deleteItem, renameItem, setItemCategories } from "./catalog.ts";
import type { DomainError } from "./errors.ts";
import type { CategoryId, EntryId, Instant, ItemId, TripId, UserId } from "./ids.ts";
import { addToList, removeFromList, setNote } from "./list.ts";
import { ok, type Result } from "./result.ts";
import { setEntryStatus, startTrip } from "./trip.ts";
import type {
  ActiveTrip,
  EntryStatus,
  HouseholdData,
  Item,
  ListEntry,
  ShopState,
  TripItem,
} from "./types.ts";

/**
 * A change to a household, as sent to the backend and kept in the offline queue. Each one sets
 * values rather than toggling them, so applying the same mutation twice is harmless.
 */
export type Mutation =
  | { readonly kind: "createItem"; readonly item: Item }
  | { readonly kind: "renameItem"; readonly itemId: ItemId; readonly name: string }
  | {
      readonly kind: "setItemCategories";
      readonly itemId: ItemId;
      readonly categoryIds: readonly CategoryId[];
    }
  | { readonly kind: "deleteItem"; readonly itemId: ItemId }
  | { readonly kind: "addEntry"; readonly entry: ListEntry }
  | { readonly kind: "removeEntry"; readonly entryId: EntryId }
  | {
      readonly kind: "setNote";
      readonly entryId: EntryId;
      readonly note: string;
      readonly at: Instant;
    }
  | { readonly kind: "startTrip"; readonly trip: ActiveTrip }
  | {
      readonly kind: "setEntryStatus";
      readonly entryId: EntryId;
      readonly status: EntryStatus;
      readonly at: Instant;
    }
  | {
      readonly kind: "completeTrip";
      readonly tripId: TripId;
      readonly completedAt: Instant;
      /** Only these entries are cleared, so anything added during the trip survives. */
      readonly boughtEntryIds: readonly EntryId[];
      readonly items: readonly TripItem[];
    };

/** A committed row-level change, as a backend's live feed reports it. */
export type Change =
  | { readonly kind: "itemSaved"; readonly item: Item }
  | { readonly kind: "itemDeleted"; readonly itemId: ItemId }
  | { readonly kind: "entrySaved"; readonly entry: ListEntry }
  | { readonly kind: "entryDeleted"; readonly entryId: EntryId }
  | { readonly kind: "shopChanged"; readonly shop: ShopState };

/**
 * `applied`: the mutation changed something.
 * `ignored`: it was already applied, is older than what is stored, or its target no longer exists.
 */
export type ApplyOutcome = "applied" | "ignored";

export type MutationResult = { readonly data: HouseholdData; readonly outcome: ApplyOutcome };

/**
 * Applies a mutation with the rules every backend follows, so the device and the server agree:
 * - `actor` is recorded as who added an entry or started a trip, whatever the mutation says.
 * - Repeated or stale mutations, missing targets and finished trips are ignored.
 * - Anything else the domain refuses is returned as an error.
 *
 * `finishedTripIds` lets a server ignore a replayed `startTrip` for a trip that already ended.
 */
export function applyMutation(
  data: HouseholdData,
  mutation: Mutation,
  actor: UserId,
  finishedTripIds: ReadonlySet<TripId> = new Set(),
): Result<MutationResult, DomainError> {
  const result = run(data, mutation, actor, finishedTripIds);
  if (!result.ok) {
    return isExpectedOnReplay(result.error) ? ok({ data, outcome: "ignored" }) : result;
  }
  const next = result.value;
  return ok({
    data: next,
    outcome: changesBetween(data, next).length === 0 ? "ignored" : "applied",
  });
}

function run(
  data: HouseholdData,
  mutation: Mutation,
  actor: UserId,
  finishedTripIds: ReadonlySet<TripId>,
): Result<HouseholdData, DomainError> {
  switch (mutation.kind) {
    case "createItem":
      if (data.items.some((i) => i.id === mutation.item.id)) return ok(data);
      return createItem(data, mutation.item);
    case "renameItem":
      return renameItem(data, mutation);
    case "setItemCategories":
      return setItemCategories(data, mutation);
    case "deleteItem":
      return deleteItem(data, mutation);
    case "addEntry": {
      const { entry } = mutation;
      if (data.entries.some((e) => e.id === entry.id)) return ok(data);
      return addToList(data, {
        id: entry.id,
        itemId: entry.itemId,
        addedBy: actor,
        at: entry.updatedAt,
        ...(entry.note === null ? {} : { note: entry.note }),
      });
    }
    case "removeEntry":
      return removeFromList(data, mutation);
    case "setNote":
      return setNote(data, mutation);
    case "startTrip": {
      const { trip } = mutation;
      const inProgress = data.shop.kind === "shopping" && data.shop.trip.id === trip.id;
      if (inProgress || finishedTripIds.has(trip.id)) return ok(data);
      return startTrip(data, { id: trip.id, startedBy: actor, at: trip.startedAt });
    }
    case "setEntryStatus":
      return setEntryStatus(data, mutation);
    case "completeTrip": {
      if (data.shop.kind !== "shopping" || data.shop.trip.id !== mutation.tripId) return ok(data);
      const bought = new Set(mutation.boughtEntryIds);
      return ok({
        ...data,
        entries: data.entries
          .filter((e) => !bought.has(e.id))
          .map((e) => (e.status === "needed" ? e : { ...e, status: "needed" })),
        shop: { kind: "planning" },
      });
    }
  }
}

/** Missing targets and finished trips are normal when replaying old changes; the rest are conflicts. */
function isExpectedOnReplay(error: DomainError): boolean {
  switch (error.kind) {
    case "itemNotFound":
    case "entryNotFound":
    case "noTripInProgress":
    case "tripMismatch":
      return true;
    case "emptyName":
    case "duplicateItemName":
    case "categoryNotFound":
    case "alreadyOnList":
    case "tripAlreadyInProgress":
      return false;
  }
}

/** The row-level changes between two versions of a household, like a database's change feed. */
export function changesBetween(before: HouseholdData, after: HouseholdData): Change[] {
  const changes: Change[] = [];
  const beforeItems = new Map(before.items.map((i) => [i.id, i]));
  const afterItems = new Set(after.items.map((i) => i.id));
  for (const item of after.items) {
    if (beforeItems.get(item.id) !== item) changes.push({ kind: "itemSaved", item });
  }
  for (const item of before.items) {
    if (!afterItems.has(item.id)) changes.push({ kind: "itemDeleted", itemId: item.id });
  }
  const beforeEntries = new Map(before.entries.map((e) => [e.id, e]));
  const afterEntries = new Set(after.entries.map((e) => e.id));
  for (const entry of after.entries) {
    if (beforeEntries.get(entry.id) !== entry) changes.push({ kind: "entrySaved", entry });
  }
  for (const entry of before.entries) {
    if (!afterEntries.has(entry.id)) changes.push({ kind: "entryDeleted", entryId: entry.id });
  }
  if (before.shop !== after.shop) changes.push({ kind: "shopChanged", shop: after.shop });
  return changes;
}

/** Merges a change from the live feed into local data. Applying it twice gives the same result. */
export function applyChange(data: HouseholdData, change: Change): HouseholdData {
  switch (change.kind) {
    case "itemSaved":
      return { ...data, items: upsert(data.items, change.item) };
    case "itemDeleted":
      return { ...data, items: data.items.filter((i) => i.id !== change.itemId) };
    case "entrySaved":
      return { ...data, entries: upsert(data.entries, change.entry) };
    case "entryDeleted":
      return { ...data, entries: data.entries.filter((e) => e.id !== change.entryId) };
    case "shopChanged":
      return { ...data, shop: change.shop };
  }
}

function upsert<T extends { readonly id: string }>(rows: readonly T[], row: T): readonly T[] {
  return rows.some((r) => r.id === row.id)
    ? rows.map((r) => (r.id === row.id ? row : r))
    : [...rows, row];
}
