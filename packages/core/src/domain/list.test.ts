import { describe, expect, it } from "vitest";
import { createItem, setItemCategories } from "./catalog.ts";
import {
  alex,
  at,
  cat,
  entry,
  expectErr,
  expectOk,
  item,
  sampleHousehold,
} from "./fixtures.test-support.ts";
import { asEntryId, asItemId } from "./ids.ts";
import {
  addToList,
  findEntry,
  groupEntries,
  primaryCategory,
  removeFromList,
  setNote,
} from "./list.ts";

const newEntry = asEntryId("e-new");
const summarize = (groups: ReturnType<typeof groupEntries>) =>
  groups.map((g) => [g.category?.name ?? "Other", g.entries.map((v) => v.item.name)]);

describe("addToList", () => {
  it("adds a needed entry with who added it and when", () => {
    const data = expectOk(
      addToList(sampleHousehold(), {
        id: newEntry,
        itemId: item.spinach,
        addedBy: alex,
        at: at(5),
      }),
    );
    expect(findEntry(data, newEntry)).toEqual({
      id: newEntry,
      itemId: item.spinach,
      note: null,
      status: "needed",
      addedBy: alex,
      updatedAt: at(5),
    });
  });

  it("keeps a trimmed note and drops a blank one", () => {
    const withNote = expectOk(
      addToList(sampleHousehold(), {
        id: newEntry,
        itemId: item.spinach,
        addedBy: alex,
        at: at(5),
        note: " baby ",
      }),
    );
    expect(findEntry(withNote, newEntry)?.note).toBe("baby");
    const blank = expectOk(
      addToList(sampleHousehold(), {
        id: newEntry,
        itemId: item.spinach,
        addedBy: alex,
        at: at(5),
        note: "  ",
      }),
    );
    expect(findEntry(blank, newEntry)?.note).toBeNull();
  });

  it("rejects an item that is already on the list", () => {
    expect(
      expectErr(
        addToList(sampleHousehold(), { id: newEntry, itemId: item.milk, addedBy: alex, at: at(5) }),
      ),
    ).toEqual({ kind: "alreadyOnList", entryId: entry.milk });
  });

  it("rejects an unknown item", () => {
    const missing = asItemId("nope");
    expect(
      expectErr(
        addToList(sampleHousehold(), { id: newEntry, itemId: missing, addedBy: alex, at: at(5) }),
      ),
    ).toEqual({ kind: "itemNotFound", itemId: missing });
  });
});

describe("removeFromList", () => {
  it("removes the entry", () => {
    const data = expectOk(removeFromList(sampleHousehold(), { entryId: entry.milk }));
    expect(findEntry(data, entry.milk)).toBeUndefined();
    expect(data.entries).toHaveLength(3);
  });

  it("rejects an unknown entry", () => {
    expect(expectErr(removeFromList(sampleHousehold(), { entryId: newEntry }))).toEqual({
      kind: "entryNotFound",
      entryId: newEntry,
    });
  });
});

describe("setNote", () => {
  it("sets a trimmed note and records when", () => {
    const data = expectOk(
      setNote(sampleHousehold(), { entryId: entry.eggs, note: " a dozen ", at: at(7) }),
    );
    expect(findEntry(data, entry.eggs)).toMatchObject({ note: "a dozen", updatedAt: at(7) });
  });

  it("clears the note when blank", () => {
    const data = expectOk(setNote(sampleHousehold(), { entryId: entry.milk, note: "", at: at(7) }));
    expect(findEntry(data, entry.milk)?.note).toBeNull();
  });

  it("rejects an unknown entry", () => {
    expect(
      expectErr(setNote(sampleHousehold(), { entryId: newEntry, note: "x", at: at(7) })).kind,
    ).toBe("entryNotFound");
  });
});

describe("primaryCategory", () => {
  it("is the item's first category", () => {
    const data = sampleHousehold();
    const salmon = data.items.find((i) => i.id === item.salmon);
    expect(salmon && primaryCategory(data, salmon)?.id).toBe(cat.frozen);
  });

  it("is null when the item has no categories", () => {
    const data = sampleHousehold();
    const towels = data.items.find((i) => i.id === item.paperTowels);
    expect(towels && primaryCategory(data, towels)).toBeNull();
  });
});

describe("groupEntries", () => {
  it("groups by primary category in position order, alphabetical inside, Other last", () => {
    expect(summarize(groupEntries(sampleHousehold()))).toEqual([
      ["Produce", ["Bananas"]],
      ["Dairy", ["Eggs", "Milk"]],
      ["Other", ["Paper towels"]],
    ]);
  });

  it("groups an item in several categories under its first one only", () => {
    const data = expectOk(
      addToList(sampleHousehold(), { id: newEntry, itemId: item.salmon, addedBy: alex, at: at(5) }),
    );
    expect(summarize(groupEntries(data))).toEqual([
      ["Produce", ["Bananas"]],
      ["Dairy", ["Eggs", "Milk"]],
      ["Frozen", ["Salmon"]],
      ["Other", ["Paper towels"]],
    ]);
  });

  it("follows a change of primary category", () => {
    const data = expectOk(
      setItemCategories(sampleHousehold(), { itemId: item.milk, categoryIds: [cat.produce] }),
    );
    expect(summarize(groupEntries(data))).toEqual([
      ["Produce", ["Bananas", "Milk"]],
      ["Dairy", ["Eggs"]],
      ["Other", ["Paper towels"]],
    ]);
  });

  it("sorts names ignoring case", () => {
    const withLower = expectOk(
      createItem(sampleHousehold(), {
        id: asItemId("apples"),
        name: "apples",
        categoryIds: [cat.produce],
      }),
    );
    const data = expectOk(
      addToList(withLower, { id: newEntry, itemId: asItemId("apples"), addedBy: alex, at: at(5) }),
    );
    expect(summarize(groupEntries(data))[0]).toEqual(["Produce", ["apples", "Bananas"]]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupEntries({ ...sampleHousehold(), entries: [] })).toEqual([]);
  });

  it("can group a subset of entries", () => {
    const data = sampleHousehold();
    const onlyMilk = data.entries.filter((e) => e.id === entry.milk);
    expect(summarize(groupEntries(data, onlyMilk))).toEqual([["Dairy", ["Milk"]]]);
  });
});
