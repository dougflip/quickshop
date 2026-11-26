import type { CategoryId, EntryId, ItemId, TripId } from "./ids.ts";
import type { ActiveTrip } from "./types.ts";

export type EmptyName = { readonly kind: "emptyName" };
export type DuplicateItemName = {
  readonly kind: "duplicateItemName";
  readonly existingItemId: ItemId;
};
export type ItemNotFound = { readonly kind: "itemNotFound"; readonly itemId: ItemId };
export type CategoryNotFound = {
  readonly kind: "categoryNotFound";
  readonly categoryId: CategoryId;
};
export type AlreadyOnList = { readonly kind: "alreadyOnList"; readonly entryId: EntryId };
export type EntryNotFound = { readonly kind: "entryNotFound"; readonly entryId: EntryId };
export type TripAlreadyInProgress = {
  readonly kind: "tripAlreadyInProgress";
  readonly trip: ActiveTrip;
};
export type NoTripInProgress = { readonly kind: "noTripInProgress" };
export type TripMismatch = {
  readonly kind: "tripMismatch";
  readonly expected: TripId;
  readonly inProgress: TripId;
};

/** Every expected failure a domain function can report. Each function returns a narrower subset. */
export type DomainError =
  | EmptyName
  | DuplicateItemName
  | ItemNotFound
  | CategoryNotFound
  | AlreadyOnList
  | EntryNotFound
  | TripAlreadyInProgress
  | NoTripInProgress
  | TripMismatch;

/** A short message a UI can show as-is. */
export function describeError(error: DomainError): string {
  switch (error.kind) {
    case "emptyName":
      return "Give it a name.";
    case "duplicateItemName":
      return "An item with that name already exists.";
    case "itemNotFound":
      return "That item no longer exists.";
    case "categoryNotFound":
      return "That category no longer exists.";
    case "alreadyOnList":
      return "That item is already on the list.";
    case "entryNotFound":
      return "That item is no longer on the list.";
    case "tripAlreadyInProgress":
      return "A shopping trip is already in progress.";
    case "noTripInProgress":
      return "No shopping trip is in progress.";
    case "tripMismatch":
      return "That shopping trip has already ended.";
  }
}
