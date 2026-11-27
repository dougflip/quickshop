import { describe, expect, it } from "vitest";
import {
  createItem,
  deleteItem,
  findItem,
  findItemByName,
  renameItem,
  searchItems,
  setItemCategories,
} from "./catalog.ts";
import { cat, expectErr, expectOk, item, sampleHousehold } from "./fixtures.test-support.ts";
import { asCategoryId, asItemId } from "./ids.ts";

const newId = asItemId("new");
const names = (query: string, limit?: number) =>
  searchItems(sampleHousehold(), query, limit).map((i) => i.name);

describe("createItem", () => {
  it("adds a normalized item with its categories in order", () => {
    const data = expectOk(
      createItem(sampleHousehold(), {
        id: newId,
        name: "  Greek   yogurt ",
        categoryIds: [cat.dairy, cat.produce],
      }),
    );
    expect(findItem(data, newId)).toEqual({
      id: newId,
      name: "Greek yogurt",
      categoryIds: [cat.dairy, cat.produce],
    });
  });

  it("allows an item with no categories", () => {
    const data = expectOk(
      createItem(sampleHousehold(), { id: newId, name: "Batteries", categoryIds: [] }),
    );
    expect(findItem(data, newId)?.categoryIds).toEqual([]);
  });

  it("drops duplicate category ids, keeping the first position", () => {
    const data = expectOk(
      createItem(sampleHousehold(), {
        id: newId,
        name: "Kefir",
        categoryIds: [cat.dairy, cat.frozen, cat.dairy],
      }),
    );
    expect(findItem(data, newId)?.categoryIds).toEqual([cat.dairy, cat.frozen]);
  });

  it("rejects a blank name", () => {
    expect(
      expectErr(createItem(sampleHousehold(), { id: newId, name: "   ", categoryIds: [] })),
    ).toEqual({
      kind: "emptyName",
    });
  });

  it("rejects a name that already exists, ignoring case and spacing", () => {
    expect(
      expectErr(createItem(sampleHousehold(), { id: newId, name: " ice  CREAM", categoryIds: [] })),
    ).toEqual({
      kind: "duplicateItemName",
      existingItemId: item.iceCream,
    });
  });

  it("rejects an unknown category", () => {
    const missing = asCategoryId("bakery");
    expect(
      expectErr(
        createItem(sampleHousehold(), { id: newId, name: "Bagels", categoryIds: [missing] }),
      ),
    ).toEqual({
      kind: "categoryNotFound",
      categoryId: missing,
    });
  });

  it("does not change the data it was given", () => {
    const before = sampleHousehold();
    createItem(before, { id: newId, name: "Kefir", categoryIds: [] });
    expect(before).toEqual(sampleHousehold());
  });
});

describe("renameItem", () => {
  it("renames and normalizes", () => {
    const data = expectOk(
      renameItem(sampleHousehold(), { itemId: item.milk, name: " Oat  milk " }),
    );
    expect(findItem(data, item.milk)?.name).toBe("Oat milk");
  });

  it("allows changing only the case of its own name", () => {
    const data = expectOk(renameItem(sampleHousehold(), { itemId: item.milk, name: "MILK" }));
    expect(findItem(data, item.milk)?.name).toBe("MILK");
  });

  it("rejects another item's name", () => {
    expect(expectErr(renameItem(sampleHousehold(), { itemId: item.milk, name: "eggs" }))).toEqual({
      kind: "duplicateItemName",
      existingItemId: item.eggs,
    });
  });

  it("rejects a blank name", () => {
    expect(expectErr(renameItem(sampleHousehold(), { itemId: item.milk, name: "" })).kind).toBe(
      "emptyName",
    );
  });

  it("rejects an unknown item", () => {
    expect(expectErr(renameItem(sampleHousehold(), { itemId: newId, name: "Kefir" }))).toEqual({
      kind: "itemNotFound",
      itemId: newId,
    });
  });
});

describe("setItemCategories", () => {
  it("replaces the categories in the given order", () => {
    const data = expectOk(
      setItemCategories(sampleHousehold(), {
        itemId: item.milk,
        categoryIds: [cat.frozen, cat.dairy],
      }),
    );
    expect(findItem(data, item.milk)?.categoryIds).toEqual([cat.frozen, cat.dairy]);
  });

  it("can clear all categories", () => {
    const data = expectOk(
      setItemCategories(sampleHousehold(), { itemId: item.milk, categoryIds: [] }),
    );
    expect(findItem(data, item.milk)?.categoryIds).toEqual([]);
  });

  it("rejects an unknown item", () => {
    expect(
      expectErr(setItemCategories(sampleHousehold(), { itemId: newId, categoryIds: [] })).kind,
    ).toBe("itemNotFound");
  });

  it("rejects an unknown category", () => {
    expect(
      expectErr(
        setItemCategories(sampleHousehold(), {
          itemId: item.milk,
          categoryIds: [asCategoryId("nope")],
        }),
      ).kind,
    ).toBe("categoryNotFound");
  });
});

describe("deleteItem", () => {
  it("removes the item and its list entry", () => {
    const data = expectOk(deleteItem(sampleHousehold(), { itemId: item.milk }));
    expect(findItem(data, item.milk)).toBeUndefined();
    expect(data.entries.some((e) => e.itemId === item.milk)).toBe(false);
    expect(data.entries).toHaveLength(3);
  });

  it("rejects an unknown item", () => {
    expect(expectErr(deleteItem(sampleHousehold(), { itemId: newId }))).toEqual({
      kind: "itemNotFound",
      itemId: newId,
    });
  });
});

describe("findItemByName", () => {
  it("matches ignoring case and extra spaces", () => {
    expect(findItemByName(sampleHousehold(), "  paper   TOWELS")?.id).toBe(item.paperTowels);
  });

  it("returns undefined when nothing matches", () => {
    expect(findItemByName(sampleHousehold(), "Kefir")).toBeUndefined();
  });
});

describe("searchItems", () => {
  it("puts names starting with the query first, then alphabetical", () => {
    // "Spinach" and "Salmon" start with "s"; "Bananas", "Eggs", "Paper towels" only contain it.
    expect(names("s")).toEqual(["Salmon", "Spinach", "Bananas", "Eggs", "Paper towels"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(names("  ICE ")).toEqual(["Ice cream"]);
  });

  it("returns nothing for a blank query", () => {
    expect(names("   ")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(names("s", 2)).toEqual(["Salmon", "Spinach"]);
  });
});
