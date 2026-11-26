import type { CategoryId, EntryId, Instant, ItemId, TripId, UserId } from "./ids.ts";

export type Category = {
  readonly id: CategoryId;
  readonly name: string;
  /** Lower comes first on the list and shopping screens. */
  readonly position: number;
};

/** An entry in the household's catalog: something the household buys, whether or not it is needed now. */
export type Item = {
  readonly id: ItemId;
  readonly name: string;
  /** In priority order. The first one that exists decides where the item is grouped. */
  readonly categoryIds: readonly CategoryId[];
};

export type EntryStatus = "needed" | "in_cart";

/** An item on the current shopping list. */
export type ListEntry = {
  readonly id: EntryId;
  readonly itemId: ItemId;
  readonly note: string | null;
  readonly status: EntryStatus;
  readonly addedBy: UserId;
  /** When this entry last changed. The newest change wins when offline changes sync. */
  readonly updatedAt: Instant;
};

export type ActiveTrip = {
  readonly id: TripId;
  readonly startedBy: UserId;
  readonly startedAt: Instant;
};

/** Whether the household is building its list or someone is in the store. */
export type ShopState =
  | { readonly kind: "planning" }
  | { readonly kind: "shopping"; readonly trip: ActiveTrip };

export type TripOutcome = "bought" | "left";

/** A copy of an entry taken when the trip completed, so it still reads correctly after renames. */
export type TripItem = {
  readonly itemId: ItemId;
  readonly name: string;
  readonly note: string | null;
  readonly outcome: TripOutcome;
};

export type CompletedTrip = ActiveTrip & {
  readonly completedAt: Instant;
  readonly items: readonly TripItem[];
};

/** Everything one household's screens work from. Every domain function takes and returns this. */
export type HouseholdData = {
  readonly categories: readonly Category[];
  readonly items: readonly Item[];
  readonly entries: readonly ListEntry[];
  readonly shop: ShopState;
};

export const emptyHousehold: HouseholdData = {
  categories: [],
  items: [],
  entries: [],
  shop: { kind: "planning" },
};
