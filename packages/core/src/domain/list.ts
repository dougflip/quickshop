import { findItem } from "./catalog.ts";
import type { AlreadyOnList, EntryNotFound, ItemNotFound } from "./errors.ts";
import type { EntryId, Instant, ItemId, UserId } from "./ids.ts";
import { compareNames } from "./names.ts";
import { err, ok, type Result } from "./result.ts";
import type { Category, HouseholdData, Item, ListEntry } from "./types.ts";

export function findEntry(data: HouseholdData, entryId: EntryId): ListEntry | undefined {
  return data.entries.find((entry) => entry.id === entryId);
}

export function findEntryForItem(data: HouseholdData, itemId: ItemId): ListEntry | undefined {
  return data.entries.find((entry) => entry.itemId === itemId);
}

export type AddToListInput = {
  readonly id: EntryId;
  readonly itemId: ItemId;
  readonly addedBy: UserId;
  readonly at: Instant;
  readonly note?: string;
};

export function addToList(
  data: HouseholdData,
  input: AddToListInput,
): Result<HouseholdData, ItemNotFound | AlreadyOnList> {
  if (findItem(data, input.itemId) === undefined) {
    return err({ kind: "itemNotFound", itemId: input.itemId });
  }
  const existing = findEntryForItem(data, input.itemId);
  if (existing !== undefined) return err({ kind: "alreadyOnList", entryId: existing.id });
  const entry: ListEntry = {
    id: input.id,
    itemId: input.itemId,
    note: cleanNote(input.note ?? ""),
    status: "needed",
    addedBy: input.addedBy,
    updatedAt: input.at,
  };
  return ok({ ...data, entries: [...data.entries, entry] });
}

export function removeFromList(
  data: HouseholdData,
  input: { readonly entryId: EntryId },
): Result<HouseholdData, EntryNotFound> {
  if (findEntry(data, input.entryId) === undefined) {
    return err({ kind: "entryNotFound", entryId: input.entryId });
  }
  return ok({ ...data, entries: data.entries.filter((entry) => entry.id !== input.entryId) });
}

/** Sets the free-text note. A blank note clears it. */
export function setNote(
  data: HouseholdData,
  input: { readonly entryId: EntryId; readonly note: string; readonly at: Instant },
): Result<HouseholdData, EntryNotFound> {
  if (findEntry(data, input.entryId) === undefined) {
    return err({ kind: "entryNotFound", entryId: input.entryId });
  }
  return ok(
    updateEntry(data, input.entryId, (entry) => ({
      ...entry,
      note: cleanNote(input.note),
      updatedAt: input.at,
    })),
  );
}

export function updateEntry(
  data: HouseholdData,
  entryId: EntryId,
  update: (entry: ListEntry) => ListEntry,
): HouseholdData {
  return {
    ...data,
    entries: data.entries.map((entry) => (entry.id === entryId ? update(entry) : entry)),
  };
}

function cleanNote(raw: string): string | null {
  const note = raw.trim();
  return note === "" ? null : note;
}

// ---- Grouping for the list and shopping screens ----

/** An entry together with its catalog item, ready to display. */
export type EntryView = { readonly entry: ListEntry; readonly item: Item };

/** Entries under one category heading. `category` is null for the "Other" group. */
export type EntryGroup = {
  readonly category: Category | null;
  readonly entries: readonly EntryView[];
};

/** The first of the item's categories that still exists, or null. */
export function primaryCategory(data: HouseholdData, item: Item): Category | null {
  for (const id of item.categoryIds) {
    const category = data.categories.find((c) => c.id === id);
    if (category !== undefined) return category;
  }
  return null;
}

/**
 * Groups entries under their item's primary category, in category order, with "Other" last.
 * Within a group, entries are alphabetical. Empty groups are left out.
 */
export function groupEntries(
  data: HouseholdData,
  entries: readonly ListEntry[] = data.entries,
): readonly EntryGroup[] {
  const byCategory = new Map<Category | null, EntryView[]>();
  for (const entry of entries) {
    const item = findItem(data, entry.itemId);
    if (item === undefined) continue;
    const category = primaryCategory(data, item);
    const views = byCategory.get(category) ?? [];
    views.push({ entry, item });
    byCategory.set(category, views);
  }
  return [...byCategory.entries()]
    .toSorted(([a], [b]) => groupRank(a) - groupRank(b))
    .map(([category, views]) => ({
      category,
      entries: views.toSorted((a, b) => compareNames(a.item.name, b.item.name)),
    }));
}

function groupRank(category: Category | null): number {
  return category === null ? Number.POSITIVE_INFINITY : category.position;
}
