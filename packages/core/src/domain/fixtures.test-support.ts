// Shared test data. Not a test file itself; imported by the domain tests.
import { expect } from "vitest";
import {
  asCategoryId,
  asEntryId,
  asInstant,
  asItemId,
  asTripId,
  asUserId,
  type CategoryId,
  type Instant,
  type ItemId,
} from "./ids.ts";
import type { Result } from "./result.ts";
import type { Category, HouseholdData, Item, ListEntry } from "./types.ts";

export const doug = asUserId("doug");
export const alex = asUserId("alex");
export const at = (minute: number): Instant => asInstant(Date.UTC(2026, 10, 26, 10, minute));

export const cat = {
  produce: asCategoryId("produce"),
  dairy: asCategoryId("dairy"),
  frozen: asCategoryId("frozen"),
};
export const item = {
  bananas: asItemId("bananas"),
  spinach: asItemId("spinach"),
  milk: asItemId("milk"),
  eggs: asItemId("eggs"),
  iceCream: asItemId("ice-cream"),
  salmon: asItemId("salmon"),
  paperTowels: asItemId("paper-towels"),
};
export const entry = {
  bananas: asEntryId("e-bananas"),
  milk: asEntryId("e-milk"),
  eggs: asEntryId("e-eggs"),
  paperTowels: asEntryId("e-paper-towels"),
};
export const trip1 = asTripId("trip-1");

const category = (id: CategoryId, name: string, position: number): Category => ({
  id,
  name,
  position,
});
const catalogItem = (id: ItemId, name: string, categoryIds: CategoryId[]): Item => ({
  id,
  name,
  categoryIds,
});
const listEntry = (id: ListEntry["id"], itemId: ItemId, note: string | null = null): ListEntry => ({
  id,
  itemId,
  note,
  status: "needed",
  addedBy: doug,
  updatedAt: at(0),
});

/**
 * Three categories listed out of position order, a mixed catalog including an item in two
 * categories and one in none, and four entries on the list. Planning mode.
 */
export function sampleHousehold(): HouseholdData {
  return {
    categories: [
      category(cat.frozen, "Frozen", 2),
      category(cat.produce, "Produce", 0),
      category(cat.dairy, "Dairy", 1),
    ],
    items: [
      catalogItem(item.bananas, "Bananas", [cat.produce]),
      catalogItem(item.spinach, "Spinach", [cat.produce]),
      catalogItem(item.milk, "Milk", [cat.dairy]),
      catalogItem(item.eggs, "Eggs", [cat.dairy]),
      catalogItem(item.iceCream, "Ice cream", [cat.frozen]),
      catalogItem(item.salmon, "Salmon", [cat.frozen, cat.dairy]),
      catalogItem(item.paperTowels, "Paper towels", []),
    ],
    entries: [
      listEntry(entry.milk, item.milk, "2 gallons"),
      listEntry(entry.paperTowels, item.paperTowels),
      listEntry(entry.bananas, item.bananas),
      listEntry(entry.eggs, item.eggs),
    ],
    shop: { kind: "planning" },
  };
}

export function shoppingHousehold(): HouseholdData {
  return {
    ...sampleHousehold(),
    shop: { kind: "shopping", trip: { id: trip1, startedBy: doug, startedAt: at(1) } },
  };
}

/** Returns the value of an ok result, failing the test otherwise. */
export function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) expect.fail(`expected ok, got error ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Returns the error of a failed result, failing the test otherwise. */
export function expectErr<T, E>(result: Result<T, E>): E {
  if (result.ok) expect.fail("expected an error, got ok");
  return result.error;
}
