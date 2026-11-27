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
import { asEntryId, asTripId } from "./ids.ts";
import { addToList, findEntry } from "./list.ts";
import { activeTrip, completeTrip, setEntryStatus, shoppingView, startTrip } from "./trip.ts";
import type { HouseholdData } from "./types.ts";

const check = (data: HouseholdData, entryId: typeof entry.milk, minute: number) =>
  expectOk(setEntryStatus(data, { entryId, status: "in_cart", at: at(minute) }));

describe("startTrip", () => {
  it("switches to shopping with who started it and when", () => {
    const data = expectOk(startTrip(sampleHousehold(), { id: trip1, startedBy: alex, at: at(3) }));
    expect(data.shop).toEqual({
      kind: "shopping",
      trip: { id: trip1, startedBy: alex, startedAt: at(3) },
    });
    expect(activeTrip(data.shop)?.id).toBe(trip1);
  });

  it("rejects a second trip while one is in progress", () => {
    const data = shoppingHousehold();
    expect(
      expectErr(startTrip(data, { id: asTripId("trip-2"), startedBy: alex, at: at(4) })),
    ).toEqual({
      kind: "tripAlreadyInProgress",
      trip: activeTrip(data.shop),
    });
  });
});

describe("activeTrip", () => {
  it("is null while planning", () => {
    expect(activeTrip(sampleHousehold().shop)).toBeNull();
  });
});

describe("setEntryStatus", () => {
  it("puts an entry in the cart and takes it out again", () => {
    const inCart = check(shoppingHousehold(), entry.milk, 5);
    expect(findEntry(inCart, entry.milk)).toMatchObject({ status: "in_cart", updatedAt: at(5) });
    const back = expectOk(
      setEntryStatus(inCart, { entryId: entry.milk, status: "needed", at: at(6) }),
    );
    expect(findEntry(back, entry.milk)).toMatchObject({ status: "needed", updatedAt: at(6) });
  });

  it("ignores a change older than the entry's last update", () => {
    const inCart = check(shoppingHousehold(), entry.milk, 10);
    const stale = expectOk(
      setEntryStatus(inCart, { entryId: entry.milk, status: "needed", at: at(8) }),
    );
    expect(findEntry(stale, entry.milk)).toMatchObject({ status: "in_cart", updatedAt: at(10) });
  });

  it("applies the same change twice with the same result", () => {
    const once = check(shoppingHousehold(), entry.milk, 5);
    expect(check(once, entry.milk, 5)).toEqual(once);
  });

  it("is only allowed during a trip", () => {
    expect(
      expectErr(
        setEntryStatus(sampleHousehold(), { entryId: entry.milk, status: "in_cart", at: at(5) }),
      ),
    ).toEqual({ kind: "noTripInProgress" });
  });

  it("rejects an unknown entry", () => {
    const missing = asEntryId("nope");
    expect(
      expectErr(
        setEntryStatus(shoppingHousehold(), { entryId: missing, status: "in_cart", at: at(5) }),
      ),
    ).toEqual({ kind: "entryNotFound", entryId: missing });
  });
});

describe("completeTrip", () => {
  it("clears bought entries, keeps the rest, and records both", () => {
    const shopped = check(check(shoppingHousehold(), entry.milk, 5), entry.bananas, 6);
    const { data, trip } = expectOk(completeTrip(shopped, { tripId: trip1, at: at(30) }));

    expect(data.shop).toEqual({ kind: "planning" });
    expect(data.entries.map((e) => e.id).toSorted()).toEqual(
      [entry.eggs, entry.paperTowels].toSorted(),
    );
    expect(data.entries.every((e) => e.status === "needed")).toBe(true);

    expect(trip).toMatchObject({
      id: trip1,
      startedBy: doug,
      startedAt: at(1),
      completedAt: at(30),
    });
    expect(trip.items).toEqual([
      { itemId: item.bananas, name: "Bananas", note: null, outcome: "bought" },
      { itemId: item.eggs, name: "Eggs", note: null, outcome: "left" },
      { itemId: item.milk, name: "Milk", note: "2 gallons", outcome: "bought" },
      { itemId: item.paperTowels, name: "Paper towels", note: null, outcome: "left" },
    ]);
  });

  it("keeps an item someone added mid-trip", () => {
    const added = expectOk(
      addToList(check(shoppingHousehold(), entry.milk, 5), {
        id: asEntryId("e-spinach"),
        itemId: item.spinach,
        addedBy: alex,
        at: at(6),
      }),
    );
    const { data } = expectOk(completeTrip(added, { tripId: trip1, at: at(30) }));
    expect(data.entries.some((e) => e.itemId === item.spinach)).toBe(true);
  });

  it("works with nothing in the cart", () => {
    const { data, trip } = expectOk(
      completeTrip(shoppingHousehold(), { tripId: trip1, at: at(30) }),
    );
    expect(data.entries).toHaveLength(4);
    expect(trip.items.every((i) => i.outcome === "left")).toBe(true);
  });

  it("is only allowed during a trip", () => {
    expect(expectErr(completeTrip(sampleHousehold(), { tripId: trip1, at: at(30) }))).toEqual({
      kind: "noTripInProgress",
    });
  });

  it("rejects completing a different trip than the one in progress", () => {
    const other = asTripId("trip-0");
    expect(expectErr(completeTrip(shoppingHousehold(), { tripId: other, at: at(30) }))).toEqual({
      kind: "tripMismatch",
      expected: other,
      inProgress: trip1,
    });
  });
});

describe("shoppingView", () => {
  it("groups what is left to get and lists the cart in category order", () => {
    const shopped = check(check(shoppingHousehold(), entry.paperTowels, 5), entry.milk, 6);
    const view = shoppingView(shopped);
    expect(view.toGet.map((g) => [g.category?.name, g.entries.map((v) => v.item.name)])).toEqual([
      ["Produce", ["Bananas"]],
      ["Dairy", ["Eggs"]],
    ]);
    expect(view.inCart.map((v) => v.item.name)).toEqual(["Milk", "Paper towels"]);
    expect(view.progress).toEqual({ inCart: 2, total: 4 });
  });
});
