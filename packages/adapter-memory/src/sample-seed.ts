import {
  asCategoryId,
  asEntryId,
  asHouseholdId,
  asInstant,
  asItemId,
  asUserId,
  type Category,
  type CategoryId,
  type Item,
  type ListEntry,
} from "@quickshop/core";
import type { MemorySeed } from "./memory-server.ts";

export const sample = {
  household: asHouseholdId("home"),
  doug: asUserId("doug"),
  alex: asUserId("alex"),
  credentials: {
    doug: { email: "doug@example.com", password: "doug" },
    alex: { email: "alex@example.com", password: "alex" },
  },
} as const;

const categoryNames = [
  "Produce",
  "Bakery",
  "Dairy",
  "Meat & fish",
  "Pantry",
  "Frozen",
  "Household",
];

const itemsByCategory: Record<string, readonly string[]> = {
  Produce: ["Bananas", "Apples", "Spinach", "Avocados", "Onions"],
  Bakery: ["Sourdough bread", "Bagels"],
  Dairy: ["Milk", "Greek yogurt", "Cheddar", "Eggs", "Butter"],
  "Meat & fish": ["Chicken thighs", "Salmon", "Ground beef"],
  Pantry: ["Pasta", "Rice", "Peanut butter", "Coffee", "Olive oil"],
  Frozen: ["Frozen peas", "Ice cream"],
  Household: ["Paper towels", "Dish soap", "Trash bags"],
};

const slug = (name: string) => name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
export const sampleCategoryId = (name: string): CategoryId => asCategoryId(`cat-${slug(name)}`);
export const sampleItemId = (name: string) => asItemId(`item-${slug(name)}`);

/** Doug and Alex sharing "Home", with a small catalog and a few things already on the list. */
export function createSampleSeed(): MemorySeed {
  const categories: Category[] = categoryNames.map((name, position) => ({
    id: sampleCategoryId(name),
    name,
    position,
  }));
  const items: Item[] = Object.entries(itemsByCategory).flatMap(([category, names]) =>
    names.map((name) => ({
      id: sampleItemId(name),
      name,
      categoryIds: [sampleCategoryId(category)],
    })),
  );
  const onList: [string, string | null][] = [
    ["Milk", "2 gallons"],
    ["Bananas", null],
    ["Eggs", null],
    ["Coffee", "the good kind"],
  ];
  const entries: ListEntry[] = onList.map(([name, note]) => ({
    id: asEntryId(`entry-${slug(name)}`),
    itemId: sampleItemId(name),
    note,
    status: "needed",
    addedBy: sample.doug,
    updatedAt: asInstant(Date.UTC(2026, 0, 1)),
  }));
  return {
    users: [
      { id: sample.doug, displayName: "Doug", ...sample.credentials.doug },
      { id: sample.alex, displayName: "Alex", ...sample.credentials.alex },
    ],
    households: [
      {
        household: { id: sample.household, name: "Home" },
        memberIds: [sample.doug, sample.alex],
        data: { categories, items, entries, shop: { kind: "planning" } },
      },
    ],
  };
}
