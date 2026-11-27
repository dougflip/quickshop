import type { Category, HouseholdData, Item } from "@quickshop/core";

/** The household's categories in shelf order. */
export function orderedCategories(data: HouseholdData): readonly Category[] {
  return data.categories.toSorted(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
}

/** "Dairy, Frozen": an item's categories by name, in the item's own order. */
export function categoryNames(data: HouseholdData, item: Item): string {
  return item.categoryIds
    .flatMap((id) => data.categories.find((c) => c.id === id)?.name ?? [])
    .join(", ");
}
