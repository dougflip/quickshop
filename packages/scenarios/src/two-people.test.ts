import { createManualClock, createSequentialIds } from "@quickshop/adapter-memory";
import { asInstant, createEngine } from "@quickshop/core";
import { describe, expect, it } from "vitest";
import { entryFor, household, itemNames, ready, sample, sampleItemId, signIn } from "./support.ts";

describe("signing in", () => {
  it("starts signed out, rejects a wrong password, then loads the household", async () => {
    const { phone } = household();
    const doug = phone("doug");
    await doug.engine.start();
    expect(doug.engine.getState()).toEqual({ kind: "signedOut", signingIn: false, error: null });

    await doug.engine.signIn(sample.credentials.doug.email, "nope");
    expect(doug.engine.getState()).toEqual({
      kind: "signedOut",
      signingIn: false,
      error: { kind: "invalidCredentials" },
    });

    const state = await signIn(doug, "doug");
    expect(state.user.displayName).toBe("Doug");
    expect(state.household.name).toBe("Home");
    expect(state.members.map((m) => m.displayName)).toEqual(["Doug", "Alex"]);
    expect(itemNames(state.data)).toEqual(["Bananas", "Coffee", "Eggs", "Milk"]);
  });

  it("restores a saved session at launch", async () => {
    const { phone } = household();
    const doug = phone("doug");
    await signIn(doug, "doug");
    doug.engine.dispose();

    // Same device, app relaunched: the connection still holds the session.
    const relaunched = createEngine({
      auth: doug.connection.auth,
      backend: doug.connection.backend,
      clock: createManualClock(asInstant(0)),
      ids: createSequentialIds("relaunch"),
    });
    await relaunched.start();
    expect(relaunched.getState().kind).toBe("ready");
  });

  it("signs out", async () => {
    const { phone } = household();
    const doug = phone("doug");
    await signIn(doug, "doug");
    await doug.engine.signOut();
    expect(doug.engine.getState().kind).toBe("signedOut");
    expect(doug.engine.addToList(sampleItemId("Spinach"))).toEqual({
      ok: false,
      error: { kind: "notReady" },
    });
  });
});

describe("two people, one list", () => {
  it("shows Doug's addition on his phone at once and on Alex's after it syncs", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    const added = doug.engine.addToList(sampleItemId("Spinach"), "baby");
    expect(added.ok).toBe(true);
    expect(itemNames(ready(doug).data)).toContain("Spinach");
    expect(ready(doug).pendingCount).toBe(1);

    await sync(doug, alex);
    expect(ready(doug).pendingCount).toBe(0);
    const spinach = entryFor(ready(alex).data, "Spinach");
    expect(spinach).toMatchObject({ note: "baby", addedBy: sample.doug, status: "needed" });
  });

  it("shows who is shopping on the other phone", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    const trip = alex.engine.startTrip();
    expect(trip.ok).toBe(true);
    await sync(doug, alex);
    expect(ready(doug).data.shop).toMatchObject({
      kind: "shopping",
      trip: { startedBy: sample.alex },
    });
    expect(doug.engine.startTrip()).toMatchObject({
      ok: false,
      error: { kind: "tripAlreadyInProgress" },
    });
  });

  it("runs a whole trip, keeping what was added mid-trip", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    alex.engine.startTrip();
    await sync(doug, alex);
    for (const name of ["Milk", "Bananas"]) {
      expect(alex.engine.toggleInCart(entryFor(ready(alex).data, name).id)).toEqual({
        ok: true,
        value: "in_cart",
      });
    }
    doug.engine.addToList(sampleItemId("Butter"));
    await sync(doug, alex);
    expect(entryFor(ready(doug).data, "Milk").status).toBe("in_cart");

    const completed = alex.engine.completeTrip();
    if (!completed.ok) throw new Error("completeTrip failed");
    expect(completed.value.items.filter((i) => i.outcome === "bought").map((i) => i.name)).toEqual([
      "Bananas",
      "Milk",
    ]);
    expect(ready(alex).lastTrip).toEqual(completed.value);

    await sync(doug, alex);
    for (const p of [doug, alex]) {
      expect(ready(p).data.shop).toEqual({ kind: "planning" });
      expect(itemNames(ready(p).data)).toEqual(["Butter", "Coffee", "Eggs"]);
    }
    alex.engine.dismissTripSummary();
    expect(ready(alex).lastTrip).toBeNull();
  });

  it("creates a new item from quick-add and puts it on the list", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    const produce = ready(doug).data.categories[0]?.id;
    if (produce === undefined) throw new Error("no categories");
    const result = doug.engine.addNewItemToList({ name: " Kale ", categoryIds: [produce] });
    expect(result.ok).toBe(true);
    await sync(doug, alex);
    expect(ready(alex).data.items).toContainEqual(
      expect.objectContaining({ name: "Kale", categoryIds: [produce] }),
    );
    expect(itemNames(ready(alex).data)).toContain("Kale");
  });
});

describe("refused changes", () => {
  it("refuses locally invalid changes without sending anything", async () => {
    const { phone } = household();
    const doug = phone("doug");
    await signIn(doug, "doug");

    expect(doug.engine.addToList(sampleItemId("Milk"))).toMatchObject({
      ok: false,
      error: { kind: "alreadyOnList" },
    });
    expect(doug.engine.createItem({ name: "milk", categoryIds: [] })).toMatchObject({
      ok: false,
      error: { kind: "duplicateItemName" },
    });
    expect(doug.engine.toggleInCart(entryFor(ready(doug).data, "Milk").id)).toEqual({
      ok: false,
      error: { kind: "noTripInProgress" },
    });
    expect(ready(doug).pendingCount).toBe(0);
  });

  it("undoes a change the server rejects and says why", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    // Both add Spinach before either has heard about the other's. Alex's reaches the server first.
    alex.engine.addToList(sampleItemId("Spinach"), "from Alex");
    doug.engine.addToList(sampleItemId("Spinach"), "from Doug");
    expect(entryFor(ready(doug).data, "Spinach").note).toBe("from Doug");

    await sync(doug, alex);
    expect(entryFor(ready(doug).data, "Spinach")).toMatchObject({
      note: "from Alex",
      addedBy: sample.alex,
    });
    expect(ready(doug).notice).toMatchObject({
      kind: "rejected",
      reason: { kind: "alreadyOnList" },
    });
    doug.engine.dismissNotice();
    expect(ready(doug).notice).toBeNull();
  });

  it("undoes a change when the network is down (queued offline in M4)", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    await signIn(doug, "doug");

    doug.connection.setOnline(false);
    doug.engine.removeFromList(entryFor(ready(doug).data, "Milk").id);
    expect(itemNames(ready(doug).data)).not.toContain("Milk");

    await sync(doug);
    expect(itemNames(ready(doug).data)).toContain("Milk");
    expect(ready(doug).notice).toMatchObject({ kind: "failed", error: { kind: "unavailable" } });
  });

  it("drops a change whose item the other person deleted, without a notice", async () => {
    const { phone, sync } = household();
    const doug = phone("doug");
    const alex = phone("alex");
    await signIn(doug, "doug");
    await signIn(alex, "alex");

    alex.engine.deleteItem(sampleItemId("Spinach"));
    doug.engine.addToList(sampleItemId("Spinach"));
    await sync(doug, alex);
    expect(itemNames(ready(doug).data)).not.toContain("Spinach");
    expect(ready(doug).notice).toBeNull();
  });
});
