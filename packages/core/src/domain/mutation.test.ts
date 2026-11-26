import { describe, expect, it } from "vitest";
import {
  alex,
  at,
  doug,
  entry,
  expectErr,
  expectOk,
  item,
  sampleHousehold,
  shoppingHousehold,
  trip1,
} from "./fixtures.test-support.ts";
import { asEntryId, asItemId } from "./ids.ts";
import { applyChange, applyMutation, changesBetween, type Change } from "./mutation.ts";

describe("applyMutation", () => {
  it("records the actor as who added an entry, whatever the mutation says", () => {
    const { data, outcome } = expectOk(
      applyMutation(
        sampleHousehold(),
        {
          kind: "addEntry",
          entry: {
            id: asEntryId("e-new"),
            itemId: item.spinach,
            note: null,
            status: "in_cart",
            addedBy: doug,
            updatedAt: at(5),
          },
        },
        alex,
      ),
    );
    expect(outcome).toBe("applied");
    expect(data.entries.find((e) => e.id === asEntryId("e-new"))).toMatchObject({
      addedBy: alex,
      status: "needed",
    });
  });

  it("ignores a missing target instead of failing", () => {
    const result = applyMutation(
      sampleHousehold(),
      { kind: "removeEntry", entryId: asEntryId("gone") },
      doug,
    );
    expect(expectOk(result).outcome).toBe("ignored");
  });

  it("returns conflicts as errors", () => {
    const result = applyMutation(
      sampleHousehold(),
      { kind: "createItem", item: { id: asItemId("x"), name: "milk", categoryIds: [] } },
      doug,
    );
    expect(expectErr(result).kind).toBe("duplicateItemName");
  });

  it("ignores a replayed start for a trip that already finished", () => {
    const result = applyMutation(
      sampleHousehold(),
      { kind: "startTrip", trip: { id: trip1, startedBy: doug, startedAt: at(1) } },
      doug,
      new Set([trip1]),
    );
    expect(expectOk(result).outcome).toBe("ignored");
  });

  it("completes a trip, resetting cart entries that were not listed as bought", () => {
    const data = shoppingHousehold();
    const checked = expectOk(
      applyMutation(
        data,
        { kind: "setEntryStatus", entryId: entry.eggs, status: "in_cart", at: at(5) },
        doug,
      ),
    ).data;
    const { data: after } = expectOk(
      applyMutation(
        checked,
        {
          kind: "completeTrip",
          tripId: trip1,
          completedAt: at(9),
          boughtEntryIds: [entry.milk],
          items: [],
        },
        doug,
      ),
    );
    expect(after.shop).toEqual({ kind: "planning" });
    expect(after.entries.map((e) => [e.id, e.status])).toEqual([
      [entry.paperTowels, "needed"],
      [entry.bananas, "needed"],
      [entry.eggs, "needed"],
    ]);
  });
});

describe("changesBetween and applyChange", () => {
  it("replaying the changes between two versions turns the first into the second", () => {
    const before = shoppingHousehold();
    let after = expectOk(
      applyMutation(before, { kind: "removeEntry", entryId: entry.milk }, doug),
    ).data;
    after = expectOk(
      applyMutation(after, { kind: "deleteItem", itemId: item.iceCream }, doug),
    ).data;
    after = expectOk(
      applyMutation(
        after,
        { kind: "setNote", entryId: entry.eggs, note: "a dozen", at: at(3) },
        doug,
      ),
    ).data;

    const changes = changesBetween(before, after);
    expect(changes.map((c) => c.kind).toSorted()).toEqual([
      "entryDeleted",
      "entrySaved",
      "itemDeleted",
    ]);
    expect(changes.reduce(applyChange, before)).toEqual(after);
  });

  it("is harmless to apply twice", () => {
    const change: Change = { kind: "entryDeleted", entryId: entry.milk };
    const once = applyChange(sampleHousehold(), change);
    expect(applyChange(once, change)).toEqual(once);
  });

  it("adds a saved row it has not seen and replaces one it has", () => {
    const data = sampleHousehold();
    const kale = { id: asItemId("kale"), name: "Kale", categoryIds: [] };
    const added = applyChange(data, { kind: "itemSaved", item: kale });
    expect(added.items).toHaveLength(data.items.length + 1);
    const renamed = applyChange(added, {
      kind: "itemSaved",
      item: { ...kale, name: "Curly kale" },
    });
    expect(renamed.items.filter((i) => i.id === kale.id)).toEqual([
      { ...kale, name: "Curly kale" },
    ]);
  });
});
