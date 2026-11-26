import type { DomainError } from "../domain/errors.ts";
import type {
  CategoryId,
  EntryId,
  HouseholdId,
  Instant,
  ItemId,
  TripId,
  UserId,
} from "../domain/ids.ts";
import type { Result } from "../domain/result.ts";
import type {
  ActiveTrip,
  EntryStatus,
  HouseholdData,
  Item,
  ListEntry,
  ShopState,
  TripItem,
} from "../domain/types.ts";

export type Household = { readonly id: HouseholdId; readonly name: string };
export type Member = { readonly userId: UserId; readonly displayName: string };

export type HouseholdSnapshot = {
  readonly household: Household;
  readonly members: readonly Member[];
  readonly data: HouseholdData;
};

/**
 * A change sent to the backend. Each one sets values rather than toggling them, so applying the
 * same mutation twice is harmless. The offline queue stores and replays these.
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

/** A committed change, pushed to every subscriber of the household, including the one who made it. */
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

export type BackendError =
  | { readonly kind: "unavailable" }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "rejected"; readonly reason: DomainError };

export type Unsubscribe = () => void;

export type BackendPort = {
  /** The signed-in user's households, oldest membership first. */
  listHouseholds(): Promise<Result<readonly Household[], BackendError>>;
  loadHousehold(householdId: HouseholdId): Promise<Result<HouseholdSnapshot, BackendError>>;
  apply(householdId: HouseholdId, mutation: Mutation): Promise<Result<ApplyOutcome, BackendError>>;
  /**
   * Live changes for one household. Nothing is delivered while offline and missed changes are
   * not replayed, so reload the household after reconnecting.
   */
  subscribe(householdId: HouseholdId, onChange: (change: Change) => void): Unsubscribe;
};
