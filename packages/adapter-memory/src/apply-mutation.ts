import {
  addToList,
  createItem,
  deleteItem,
  err,
  ok,
  removeFromList,
  renameItem,
  setEntryStatus,
  setItemCategories,
  setNote,
  startTrip,
  type ApplyOutcome,
  type BackendError,
  type Change,
  type CompletedTrip,
  type DomainError,
  type HouseholdData,
  type Mutation,
  type Result,
  type UserId,
} from "@quickshop/core";

/** One household as the server stores it. */
export type StoredHousehold = {
  readonly data: HouseholdData;
  readonly completedTrips: readonly CompletedTrip[];
};

export type Applied = {
  readonly outcome: ApplyOutcome;
  readonly household: StoredHousehold;
  readonly changes: readonly Change[];
};

/**
 * Applies a mutation the way the real server does: the signed-in user is recorded as the author,
 * repeated or stale mutations and missing targets are ignored, and real conflicts are rejected.
 */
export function applyMutation(
  stored: StoredHousehold,
  mutation: Mutation,
  actor: UserId,
): Result<Applied, BackendError> {
  const { data } = stored;
  const result = run(stored, mutation, actor);
  if (!result.ok) {
    return ignoreOrReject(result.error) === "ignore"
      ? ok({ outcome: "ignored", household: stored, changes: [] })
      : err({ kind: "rejected", reason: result.error });
  }
  const next = result.value;
  const changes = diff(data, next.data);
  return ok({ outcome: changes.length === 0 ? "ignored" : "applied", household: next, changes });
}

function run(
  stored: StoredHousehold,
  mutation: Mutation,
  actor: UserId,
): Result<StoredHousehold, DomainError> {
  const { data } = stored;
  const withData = (r: Result<HouseholdData, DomainError>): Result<StoredHousehold, DomainError> =>
    r.ok ? ok({ ...stored, data: r.value }) : r;
  switch (mutation.kind) {
    case "createItem": {
      if (data.items.some((i) => i.id === mutation.item.id)) return ok(stored);
      return withData(createItem(data, mutation.item));
    }
    case "renameItem":
      return withData(renameItem(data, mutation));
    case "setItemCategories":
      return withData(setItemCategories(data, mutation));
    case "deleteItem":
      return withData(deleteItem(data, mutation));
    case "addEntry": {
      const { entry } = mutation;
      if (data.entries.some((e) => e.id === entry.id)) return ok(stored);
      return withData(
        addToList(data, {
          id: entry.id,
          itemId: entry.itemId,
          addedBy: actor,
          at: entry.updatedAt,
          ...(entry.note === null ? {} : { note: entry.note }),
        }),
      );
    }
    case "removeEntry":
      return withData(removeFromList(data, mutation));
    case "setNote":
      return withData(setNote(data, mutation));
    case "startTrip": {
      const { trip } = mutation;
      const alreadyStarted =
        (data.shop.kind === "shopping" && data.shop.trip.id === trip.id) ||
        stored.completedTrips.some((t) => t.id === trip.id);
      if (alreadyStarted) return ok(stored);
      return withData(startTrip(data, { id: trip.id, startedBy: actor, at: trip.startedAt }));
    }
    case "setEntryStatus":
      return withData(setEntryStatus(data, mutation));
    case "completeTrip": {
      if (data.shop.kind !== "shopping" || data.shop.trip.id !== mutation.tripId) return ok(stored);
      const bought = new Set(mutation.boughtEntryIds);
      const trip: CompletedTrip = {
        ...data.shop.trip,
        completedAt: mutation.completedAt,
        items: mutation.items,
      };
      return ok({
        data: {
          ...data,
          entries: data.entries
            .filter((e) => !bought.has(e.id))
            .map((e) => (e.status === "needed" ? e : { ...e, status: "needed" })),
          shop: { kind: "planning" },
        },
        completedTrips: [...stored.completedTrips, trip],
      });
    }
  }
}

/** Missing targets and finished trips are expected when replaying old changes; the rest are conflicts. */
function ignoreOrReject(error: DomainError): "ignore" | "reject" {
  switch (error.kind) {
    case "itemNotFound":
    case "entryNotFound":
    case "noTripInProgress":
    case "tripMismatch":
      return "ignore";
    case "emptyName":
    case "duplicateItemName":
    case "categoryNotFound":
    case "alreadyOnList":
    case "tripAlreadyInProgress":
      return "reject";
  }
}

/** The row-level changes between two versions, like a database's change feed. */
function diff(before: HouseholdData, after: HouseholdData): Change[] {
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
