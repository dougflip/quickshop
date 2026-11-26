declare const brand: unique symbol;

/** A value of type `T` that the type checker will not confuse with other `T`s. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type HouseholdId = Brand<string, "HouseholdId">;
export type UserId = Brand<string, "UserId">;
export type CategoryId = Brand<string, "CategoryId">;
export type ItemId = Brand<string, "ItemId">;
export type EntryId = Brand<string, "EntryId">;
export type TripId = Brand<string, "TripId">;

/** A point in time as milliseconds since the Unix epoch. */
export type Instant = Brand<number, "Instant">;

// Branding is the trust boundary: only adapters (reading stored data), id generators and tests
// should call these. Domain code receives values that are already branded.
/* oxlint-disable typescript/no-unsafe-type-assertion -- these casts are what branding means */
export const asHouseholdId = (value: string): HouseholdId => value as HouseholdId;
export const asUserId = (value: string): UserId => value as UserId;
export const asCategoryId = (value: string): CategoryId => value as CategoryId;
export const asItemId = (value: string): ItemId => value as ItemId;
export const asEntryId = (value: string): EntryId => value as EntryId;
export const asTripId = (value: string): TripId => value as TripId;
export const asInstant = (epochMs: number): Instant => epochMs as Instant;
/* oxlint-enable typescript/no-unsafe-type-assertion */
