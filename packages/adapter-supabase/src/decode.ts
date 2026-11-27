// Turns the JSON the database sends into core types. The SQL builds core's shapes directly
// (supabase/migrations), so this only checks them and brands the ids. Anything unexpected throws
// a DecodeError: it means the app and the database disagree, which is a bug, not a user error.
import {
  asCategoryId,
  asEntryId,
  asHouseholdId,
  asInstant,
  asItemId,
  asTripId,
  asUserId,
  type ActiveTrip,
  type ApplyOutcome,
  type Category,
  type Change,
  type DomainError,
  type EntryStatus,
  type Household,
  type HouseholdSnapshot,
  type Item,
  type ListEntry,
  type Member,
  type ShopState,
} from "@quickshop/core";

export class DecodeError extends Error {
  override name = "DecodeError";
}

type Fields = { readonly [key: string]: unknown };

function fields(value: unknown, what: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DecodeError(`${what}: expected an object, got ${JSON.stringify(value)}`);
  }
  // A non-null, non-array object: reading its keys as unknown is safe.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Fields;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new DecodeError(`${what}: expected a string`);
  return value;
}

function optionalText(value: unknown, what: string): string | null {
  return value === null ? null : text(value, what);
}

function int(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DecodeError(`${what}: expected an integer`);
  }
  return value;
}

function list<T>(value: unknown, what: string, each: (element: unknown, what: string) => T): T[] {
  if (!Array.isArray(value)) throw new DecodeError(`${what}: expected a list`);
  return value.map((element: unknown, i) => each(element, `${what}[${String(i)}]`));
}

function category(value: unknown, what: string): Category {
  const f = fields(value, what);
  return {
    id: asCategoryId(text(f["id"], `${what}.id`)),
    name: text(f["name"], `${what}.name`),
    position: int(f["position"], `${what}.position`),
  };
}

function item(value: unknown, what: string): Item {
  const f = fields(value, what);
  return {
    id: asItemId(text(f["id"], `${what}.id`)),
    name: text(f["name"], `${what}.name`),
    categoryIds: list(f["categoryIds"], `${what}.categoryIds`, (id, w) =>
      asCategoryId(text(id, w)),
    ),
  };
}

function status(value: unknown, what: string): EntryStatus {
  if (value === "needed" || value === "in_cart") return value;
  throw new DecodeError(`${what}: unknown status ${JSON.stringify(value)}`);
}

function entry(value: unknown, what: string): ListEntry {
  const f = fields(value, what);
  return {
    id: asEntryId(text(f["id"], `${what}.id`)),
    itemId: asItemId(text(f["itemId"], `${what}.itemId`)),
    note: optionalText(f["note"], `${what}.note`),
    status: status(f["status"], `${what}.status`),
    addedBy: asUserId(text(f["addedBy"], `${what}.addedBy`)),
    updatedAt: asInstant(int(f["updatedAt"], `${what}.updatedAt`)),
  };
}

function trip(value: unknown, what: string): ActiveTrip {
  const f = fields(value, what);
  return {
    id: asTripId(text(f["id"], `${what}.id`)),
    startedBy: asUserId(text(f["startedBy"], `${what}.startedBy`)),
    startedAt: asInstant(int(f["startedAt"], `${what}.startedAt`)),
  };
}

function shop(value: unknown, what: string): ShopState {
  const f = fields(value, what);
  if (f["kind"] === "planning") return { kind: "planning" };
  if (f["kind"] === "shopping") return { kind: "shopping", trip: trip(f["trip"], `${what}.trip`) };
  throw new DecodeError(`${what}: unknown shop state ${JSON.stringify(f["kind"])}`);
}

function household(value: unknown, what: string): Household {
  const f = fields(value, what);
  return {
    id: asHouseholdId(text(f["id"], `${what}.id`)),
    name: text(f["name"], `${what}.name`),
  };
}

function member(value: unknown, what: string): Member {
  const f = fields(value, what);
  return {
    userId: asUserId(text(f["userId"], `${what}.userId`)),
    displayName: text(f["displayName"], `${what}.displayName`),
  };
}

export function decodeHouseholds(value: unknown): Household[] {
  return list(value, "households", household);
}

export function decodeSnapshot(value: unknown): HouseholdSnapshot {
  const f = fields(value, "snapshot");
  const data = fields(f["data"], "snapshot.data");
  return {
    household: household(f["household"], "snapshot.household"),
    members: list(f["members"], "snapshot.members", member),
    data: {
      categories: list(data["categories"], "categories", category),
      items: list(data["items"], "items", item),
      entries: list(data["entries"], "entries", entry),
      shop: shop(data["shop"], "shop"),
    },
  };
}

/** What `apply_mutation` returns. */
export type ApplyResult =
  | { readonly kind: ApplyOutcome }
  | { readonly kind: "rejected"; readonly reason: DomainError }
  | { readonly kind: "unauthorized" };

/** Only the conflicts the server reports. Missing targets come back as `ignored` instead. */
function domainError(value: unknown, what: string): DomainError {
  const f = fields(value, what);
  switch (f["kind"]) {
    case "emptyName":
      return { kind: "emptyName" };
    case "duplicateItemName":
      return {
        kind: "duplicateItemName",
        existingItemId: asItemId(text(f["existingItemId"], `${what}.existingItemId`)),
      };
    case "categoryNotFound":
      return {
        kind: "categoryNotFound",
        categoryId: asCategoryId(text(f["categoryId"], `${what}.categoryId`)),
      };
    case "alreadyOnList":
      return { kind: "alreadyOnList", entryId: asEntryId(text(f["entryId"], `${what}.entryId`)) };
    case "tripAlreadyInProgress":
      return { kind: "tripAlreadyInProgress", trip: trip(f["trip"], `${what}.trip`) };
    default:
      throw new DecodeError(`${what}: unknown error ${JSON.stringify(f["kind"])}`);
  }
}

export function decodeApplyResult(value: unknown): ApplyResult {
  const f = fields(value, "apply result");
  switch (f["kind"]) {
    case "applied":
    case "ignored":
    case "unauthorized":
      return { kind: f["kind"] };
    case "rejected":
      return { kind: "rejected", reason: domainError(f["reason"], "apply result.reason") };
    default:
      throw new DecodeError(`apply result: unknown kind ${JSON.stringify(f["kind"])}`);
  }
}

export function decodeChange(value: unknown): Change {
  const f = fields(value, "change");
  switch (f["kind"]) {
    case "itemSaved":
      return { kind: "itemSaved", item: item(f["item"], "change.item") };
    case "itemDeleted":
      return { kind: "itemDeleted", itemId: asItemId(text(f["itemId"], "change.itemId")) };
    case "entrySaved":
      return { kind: "entrySaved", entry: entry(f["entry"], "change.entry") };
    case "entryDeleted":
      return { kind: "entryDeleted", entryId: asEntryId(text(f["entryId"], "change.entryId")) };
    case "shopChanged":
      return { kind: "shopChanged", shop: shop(f["shop"], "change.shop") };
    default:
      throw new DecodeError(`change: unknown kind ${JSON.stringify(f["kind"])}`);
  }
}
