import {
  asCategoryId,
  asEntryId,
  asHouseholdId,
  asInstant,
  asItemId,
  asUserId,
  emptyHousehold,
} from "@quickshop/core";
import { backendContract, type ContractWorld } from "@quickshop/core/contract";
import { describe, expect, it } from "vitest";
import { createMemoryLocalStore, createSequentialIds } from "./device.ts";
import { createMemoryServer, type MemorySeed } from "./memory-server.ts";

const ids = {
  home: asHouseholdId("home"),
  elsewhere: asHouseholdId("elsewhere"),
  doug: asUserId("doug"),
  alex: asUserId("alex"),
  olive: asUserId("olive"),
  produce: asCategoryId("produce"),
  dairy: asCategoryId("dairy"),
  milk: asItemId("milk"),
  bananas: asItemId("bananas"),
  milkEntry: asEntryId("e-milk"),
};

const credentials = {
  doug: { email: "doug@example.com", password: "doug-pw" },
  alex: { email: "alex@example.com", password: "alex-pw" },
  olive: { email: "olive@example.com", password: "olive-pw" },
};

const seed: MemorySeed = {
  users: [
    { id: ids.doug, displayName: "Doug", ...credentials.doug },
    { id: ids.alex, displayName: "Alex", ...credentials.alex },
    { id: ids.olive, displayName: "Olive", ...credentials.olive },
  ],
  households: [
    {
      household: { id: ids.home, name: "Home" },
      memberIds: [ids.doug, ids.alex],
      data: {
        categories: [
          { id: ids.produce, name: "Produce", position: 0 },
          { id: ids.dairy, name: "Dairy", position: 1 },
        ],
        items: [
          { id: ids.milk, name: "Milk", categoryIds: [ids.dairy] },
          { id: ids.bananas, name: "Bananas", categoryIds: [ids.produce] },
        ],
        entries: [
          {
            id: ids.milkEntry,
            itemId: ids.milk,
            note: null,
            status: "needed",
            addedBy: ids.doug,
            updatedAt: asInstant(Date.UTC(2026, 0, 1)),
          },
        ],
        shop: { kind: "planning" },
      },
    },
    {
      household: { id: ids.elsewhere, name: "Elsewhere" },
      memberIds: [ids.olive],
      data: emptyHousehold,
    },
  ],
};

backendContract("memory", () => {
  const server = createMemoryServer(seed);
  const newIds = createSequentialIds("new");
  const world: ContractWorld = {
    householdId: ids.home,
    otherHouseholdId: ids.elsewhere,
    users: { doug: ids.doug, alex: ids.alex, olive: ids.olive },
    credentials,
    categories: { produce: ids.produce, dairy: ids.dairy },
    items: { milk: ids.milk, bananas: ids.bananas },
    entries: { milk: ids.milkEntry },
    newId: () => newIds.newId(),
    connect: () => Promise.resolve(server.connect()),
    settle: () => server.settle(),
  };
  return Promise.resolve(world);
});

describe("memory server", () => {
  it("does not share state between servers made from the same seed", async () => {
    const a = createMemoryServer(seed).connect();
    expect((await a.auth.signIn(credentials.doug.email, credentials.doug.password)).ok).toBe(true);
    await a.backend.apply(ids.home, { kind: "removeEntry", entryId: ids.milkEntry });
    expect(createMemoryServer(seed).inspect(ids.home)?.data.entries).toHaveLength(1);
  });

  it("tells network listeners when the connection goes offline and back", () => {
    const connection = createMemoryServer(seed).connect();
    const seen: boolean[] = [];
    connection.network.subscribe((online) => seen.push(online));
    connection.setOnline(false);
    connection.setOnline(false);
    connection.setOnline(true);
    expect(seen).toEqual([false, true]);
    expect(connection.network.isOnline()).toBe(true);
  });
});

describe("memory local store", () => {
  it("gets, sets and removes values", async () => {
    const store = createMemoryLocalStore({ a: "1" });
    expect(await store.get("a")).toBe("1");
    await store.set("b", "2");
    await store.remove("a");
    expect(await store.get("a")).toBeNull();
    expect(store.snapshot()).toEqual({ b: "2" });
  });
});
