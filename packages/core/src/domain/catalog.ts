import type { CategoryNotFound, DuplicateItemName, EmptyName, ItemNotFound } from "./errors.ts";
import type { CategoryId, ItemId } from "./ids.ts";
import { compareNames, nameKey, normalizeName } from "./names.ts";
import { err, ok, type Result } from "./result.ts";
import type { HouseholdData, Item } from "./types.ts";

export function findItem(data: HouseholdData, itemId: ItemId): Item | undefined {
  return data.items.find((item) => item.id === itemId);
}

/** The item whose name matches, ignoring case and extra spaces. */
export function findItemByName(data: HouseholdData, name: string): Item | undefined {
  const key = nameKey(name);
  return data.items.find((item) => nameKey(item.name) === key);
}

/**
 * Catalog items whose name contains the query, for quick-add.
 * Names that start with the query come first, then alphabetical.
 */
export function searchItems(data: HouseholdData, query: string, limit = 6): readonly Item[] {
  const key = nameKey(query);
  if (key === "") return [];
  const startsWith = (item: Item) => nameKey(item.name).startsWith(key);
  return data.items
    .filter((item) => nameKey(item.name).includes(key))
    .toSorted(
      (a, b) => Number(startsWith(b)) - Number(startsWith(a)) || compareNames(a.name, b.name),
    )
    .slice(0, limit);
}

export type CreateItemInput = {
  readonly id: ItemId;
  readonly name: string;
  readonly categoryIds: readonly CategoryId[];
};

export function createItem(
  data: HouseholdData,
  input: CreateItemInput,
): Result<HouseholdData, EmptyName | DuplicateItemName | CategoryNotFound> {
  const name = validateName(data, input.name, null);
  if (!name.ok) return name;
  const categoryIds = validateCategoryIds(data, input.categoryIds);
  if (!categoryIds.ok) return categoryIds;
  const item: Item = { id: input.id, name: name.value, categoryIds: categoryIds.value };
  return ok({ ...data, items: [...data.items, item] });
}

export function renameItem(
  data: HouseholdData,
  input: { readonly itemId: ItemId; readonly name: string },
): Result<HouseholdData, ItemNotFound | EmptyName | DuplicateItemName> {
  if (findItem(data, input.itemId) === undefined) {
    return err({ kind: "itemNotFound", itemId: input.itemId });
  }
  const name = validateName(data, input.name, input.itemId);
  if (!name.ok) return name;
  return ok(updateItem(data, input.itemId, (item) => ({ ...item, name: name.value })));
}

/** Replaces an item's categories. Order matters: the first is where it is grouped. Duplicates are dropped. */
export function setItemCategories(
  data: HouseholdData,
  input: { readonly itemId: ItemId; readonly categoryIds: readonly CategoryId[] },
): Result<HouseholdData, ItemNotFound | CategoryNotFound> {
  if (findItem(data, input.itemId) === undefined) {
    return err({ kind: "itemNotFound", itemId: input.itemId });
  }
  const categoryIds = validateCategoryIds(data, input.categoryIds);
  if (!categoryIds.ok) return categoryIds;
  return ok(
    updateItem(data, input.itemId, (item) => ({ ...item, categoryIds: categoryIds.value })),
  );
}

/** Removes the item from the catalog and from the current list. Completed trips keep their copy. */
export function deleteItem(
  data: HouseholdData,
  input: { readonly itemId: ItemId },
): Result<HouseholdData, ItemNotFound> {
  if (findItem(data, input.itemId) === undefined) {
    return err({ kind: "itemNotFound", itemId: input.itemId });
  }
  return ok({
    ...data,
    items: data.items.filter((item) => item.id !== input.itemId),
    entries: data.entries.filter((entry) => entry.itemId !== input.itemId),
  });
}

function validateName(
  data: HouseholdData,
  raw: string,
  ignoreItemId: ItemId | null,
): Result<string, EmptyName | DuplicateItemName> {
  const name = normalizeName(raw);
  if (name === "") return err({ kind: "emptyName" });
  const existing = findItemByName(data, name);
  if (existing !== undefined && existing.id !== ignoreItemId) {
    return err({ kind: "duplicateItemName", existingItemId: existing.id });
  }
  return ok(name);
}

function validateCategoryIds(
  data: HouseholdData,
  categoryIds: readonly CategoryId[],
): Result<readonly CategoryId[], CategoryNotFound> {
  const known = new Set(data.categories.map((category) => category.id));
  const missing = categoryIds.find((id) => !known.has(id));
  if (missing !== undefined) return err({ kind: "categoryNotFound", categoryId: missing });
  return ok([...new Set(categoryIds)]);
}

function updateItem(
  data: HouseholdData,
  itemId: ItemId,
  update: (item: Item) => Item,
): HouseholdData {
  return { ...data, items: data.items.map((item) => (item.id === itemId ? update(item) : item)) };
}
