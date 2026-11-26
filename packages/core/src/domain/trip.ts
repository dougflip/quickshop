import { findItem } from "./catalog.ts";
import type {
  EntryNotFound,
  NoTripInProgress,
  TripAlreadyInProgress,
  TripMismatch,
} from "./errors.ts";
import type { EntryId, Instant, TripId, UserId } from "./ids.ts";
import { findEntry, groupEntries, updateEntry, type EntryGroup, type EntryView } from "./list.ts";
import { compareNames } from "./names.ts";
import { err, ok, type Result } from "./result.ts";
import type {
  ActiveTrip,
  CompletedTrip,
  EntryStatus,
  HouseholdData,
  ShopState,
  TripItem,
} from "./types.ts";

export function activeTrip(shop: ShopState): ActiveTrip | null {
  switch (shop.kind) {
    case "planning":
      return null;
    case "shopping":
      return shop.trip;
  }
}

export function startTrip(
  data: HouseholdData,
  input: { readonly id: TripId; readonly startedBy: UserId; readonly at: Instant },
): Result<HouseholdData, TripAlreadyInProgress> {
  const current = activeTrip(data.shop);
  if (current !== null) return err({ kind: "tripAlreadyInProgress", trip: current });
  const trip: ActiveTrip = { id: input.id, startedBy: input.startedBy, startedAt: input.at };
  return ok({ ...data, shop: { kind: "shopping", trip } });
}

/**
 * Puts an entry in the cart or takes it out. Only while a trip is in progress.
 * The newest change wins: a change older than the entry's last update is ignored.
 */
export function setEntryStatus(
  data: HouseholdData,
  input: { readonly entryId: EntryId; readonly status: EntryStatus; readonly at: Instant },
): Result<HouseholdData, NoTripInProgress | EntryNotFound> {
  if (activeTrip(data.shop) === null) return err({ kind: "noTripInProgress" });
  const entry = findEntry(data, input.entryId);
  if (entry === undefined) return err({ kind: "entryNotFound", entryId: input.entryId });
  if (input.at < entry.updatedAt) return ok(data);
  return ok(
    updateEntry(data, input.entryId, (e) => ({ ...e, status: input.status, updatedAt: input.at })),
  );
}

/**
 * Ends the trip. Entries in the cart are cleared from the list and recorded as bought.
 * Entries still needed stay on the list for next time and are recorded as left.
 */
export function completeTrip(
  data: HouseholdData,
  input: { readonly tripId: TripId; readonly at: Instant },
): Result<
  { readonly data: HouseholdData; readonly trip: CompletedTrip },
  NoTripInProgress | TripMismatch
> {
  const current = activeTrip(data.shop);
  if (current === null) return err({ kind: "noTripInProgress" });
  if (current.id !== input.tripId) {
    return err({ kind: "tripMismatch", expected: input.tripId, inProgress: current.id });
  }
  const items: TripItem[] = [];
  for (const entry of data.entries) {
    const item = findItem(data, entry.itemId);
    if (item === undefined) continue;
    items.push({
      itemId: item.id,
      name: item.name,
      note: entry.note,
      outcome: entry.status === "in_cart" ? "bought" : "left",
    });
  }
  return ok({
    data: {
      ...data,
      entries: data.entries.filter((entry) => entry.status === "needed"),
      shop: { kind: "planning" },
    },
    trip: {
      ...current,
      completedAt: input.at,
      items: items.toSorted((a, b) => compareNames(a.name, b.name)),
    },
  });
}

/** What the shopping screen shows: what is left to get, grouped, and what is in the cart. */
export type ShoppingView = {
  readonly toGet: readonly EntryGroup[];
  readonly inCart: readonly EntryView[];
  readonly progress: { readonly inCart: number; readonly total: number };
};

export function shoppingView(data: HouseholdData): ShoppingView {
  const inCart = groupEntries(
    data,
    data.entries.filter((entry) => entry.status === "in_cart"),
  ).flatMap((group) => group.entries);
  return {
    toGet: groupEntries(
      data,
      data.entries.filter((entry) => entry.status === "needed"),
    ),
    inCart,
    progress: { inCart: inCart.length, total: data.entries.length },
  };
}
