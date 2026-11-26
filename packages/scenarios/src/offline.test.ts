import { describe, expect, it } from "vitest";
import { entryFor, household, itemNames, ready, sample, sampleItemId, signIn } from "./support.ts";

async function shopper() {
  const h = household();
  const doug = h.phone("doug");
  const alex = h.phone("alex");
  await signIn(doug, "doug");
  await signIn(alex, "alex");
  return { ...h, doug, alex };
}

describe("shopping offline", () => {
  it("starts, checks off and completes a whole trip offline, then syncs on reconnect", async () => {
    const { server, sync, doug, alex } = await shopper();
    doug.connection.setOnline(false);
    expect(ready(doug).online).toBe(false);

    expect(doug.engine.startTrip().ok).toBe(true);
    for (const name of ["Milk", "Eggs"]) {
      expect(doug.engine.toggleInCart(entryFor(ready(doug).data, name).id).ok).toBe(true);
    }
    const completed = doug.engine.completeTrip();
    expect(completed.ok).toBe(true);
    expect(ready(doug).pendingCount).toBe(4);
    expect(itemNames(ready(doug).data)).toEqual(["Bananas", "Coffee"]);

    await sync(doug, alex);
    expect(server.inspect(sample.household)?.data.shop).toEqual({ kind: "planning" });
    expect(itemNames(ready(alex).data)).toEqual(["Bananas", "Coffee", "Eggs", "Milk"]);

    doug.connection.setOnline(true);
    await sync(doug, alex);
    expect(ready(doug).pendingCount).toBe(0);
    expect(ready(doug).notice).toBeNull();
    const stored = server.inspect(sample.household);
    expect(stored?.data.shop).toEqual({ kind: "planning" });
    expect(stored?.completedTrips).toHaveLength(1);
    expect(stored?.completedTrips[0]?.startedBy).toBe(sample.doug);
    for (const p of [doug, alex]) expect(itemNames(ready(p).data)).toEqual(["Bananas", "Coffee"]);
  });

  it("keeps what someone else added while the shopper was offline", async () => {
    const { sync, doug, alex } = await shopper();
    doug.engine.startTrip();
    await sync(doug, alex);

    doug.connection.setOnline(false);
    doug.engine.toggleInCart(entryFor(ready(doug).data, "Milk").id);
    alex.engine.addToList(sampleItemId("Butter"));
    await sync(doug, alex);
    expect(itemNames(ready(doug).data)).not.toContain("Butter");
    doug.engine.completeTrip();

    doug.connection.setOnline(true);
    await sync(doug, alex);
    for (const p of [doug, alex]) {
      expect(itemNames(ready(p).data)).toEqual(["Bananas", "Butter", "Coffee", "Eggs"]);
      expect(ready(p).data.shop).toEqual({ kind: "planning" });
    }
  });

  it("gives the same result when the same queue is replayed twice", async () => {
    const { server, sync, doug } = await shopper();
    doug.connection.setOnline(false);
    doug.engine.startTrip();
    doug.engine.toggleInCart(entryFor(ready(doug).data, "Milk").id);
    doug.engine.completeTrip();
    await doug.engine.idle();
    const savedBeforeSync = doug.store.snapshot();

    doug.connection.setOnline(true);
    await sync(doug);
    const afterFirst = server.inspect(sample.household);

    // A copy of the device that never heard the queue was delivered sends it all again.
    await Promise.all(
      Object.entries(savedBeforeSync).map(([key, value]) => doug.store.set(key, value)),
    );
    const replay = doug.relaunch();
    await replay.engine.start();
    await sync(replay);
    expect(ready(replay).pendingCount).toBe(0);
    expect(ready(replay).notice).toBeNull();
    expect(server.inspect(sample.household)).toEqual(afterFirst);
  });

  it("keeps the list and the queue when the app is reopened offline", async () => {
    const { server, sync, doug } = await shopper();
    doug.engine.startTrip();
    await sync(doug);
    doug.connection.setOnline(false);
    doug.engine.toggleInCart(entryFor(ready(doug).data, "Milk").id);
    await doug.engine.idle();

    const reopened = doug.relaunch();
    await reopened.engine.start();
    const state = ready(reopened);
    expect(state.online).toBe(false);
    expect(state.pendingCount).toBe(1);
    expect(entryFor(state.data, "Milk").status).toBe("in_cart");
    expect(reopened.engine.toggleInCart(entryFor(state.data, "Eggs").id).ok).toBe(true);

    reopened.connection.setOnline(true);
    await sync(reopened);
    expect(ready(reopened).pendingCount).toBe(0);
    const entries = server.inspect(sample.household)?.data.entries ?? [];
    expect(entries.filter((e) => e.status === "in_cart").map((e) => e.itemId)).toEqual([
      sampleItemId("Milk"),
      sampleItemId("Eggs"),
    ]);
  });

  it("cannot open offline on a device that has never loaded the household", async () => {
    const { phone } = household();
    const doug = phone("doug");
    await signIn(doug, "doug");
    const fresh = doug.relaunch();
    await fresh.store.remove("quickshop/v1/household/doug");
    fresh.connection.setOnline(false);
    await fresh.engine.start();
    expect(fresh.engine.getState()).toMatchObject({
      kind: "loadFailed",
      error: { kind: "unavailable" },
    });
  });
});

describe("editing offline", () => {
  it("refuses adding and editing while offline, and queues nothing", async () => {
    const { doug } = await shopper();
    doug.connection.setOnline(false);
    const milk = entryFor(ready(doug).data, "Milk").id;
    expect(doug.engine.addToList(sampleItemId("Butter"))).toEqual({
      ok: false,
      error: { kind: "offline" },
    });
    expect(doug.engine.removeFromList(milk)).toEqual({ ok: false, error: { kind: "offline" } });
    expect(doug.engine.setNote(milk, "1 gallon")).toEqual({
      ok: false,
      error: { kind: "offline" },
    });
    expect(doug.engine.createItem({ name: "Kale", categoryIds: [] })).toEqual({
      ok: false,
      error: { kind: "offline" },
    });
    expect(ready(doug).pendingCount).toBe(0);
  });

  it("still reports a local mistake before the offline error", async () => {
    const { doug } = await shopper();
    doug.connection.setOnline(false);
    expect(doug.engine.addToList(sampleItemId("Milk"))).toMatchObject({
      ok: false,
      error: { kind: "alreadyOnList" },
    });
  });
});

describe("unreliable connection", () => {
  it("keeps a shopping change queued when a request fails, and sends it on the next change", async () => {
    const { server, sync, doug } = await shopper();
    doug.engine.startTrip();
    await sync(doug);

    doug.connection.setServerReachable(false);
    doug.engine.toggleInCart(entryFor(ready(doug).data, "Milk").id);
    await sync(doug);
    expect(ready(doug).pendingCount).toBe(1);
    expect(ready(doug).notice).toBeNull();

    doug.connection.setServerReachable(true);
    doug.engine.toggleInCart(entryFor(ready(doug).data, "Eggs").id);
    await sync(doug);
    expect(ready(doug).pendingCount).toBe(0);
    const inCart = (server.inspect(sample.household)?.data.entries ?? []).filter(
      (e) => e.status === "in_cart",
    );
    expect(inCart).toHaveLength(2);
  });
});
