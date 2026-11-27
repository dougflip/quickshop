// @vitest-environment happy-dom
// 8d: shopping, completing a trip, the summary, and doing it all offline.
import { sample } from "@quickshop/adapter-memory";
import type { Engine } from "@quickshop/core";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openSignedIn, otherPhone } from "./app.test-support.tsx";

afterEach(cleanup);

/** Names of the shopping rows in one section ("Dairy", "In cart", …). */
function shopSection(name: string): string[] {
  return within(screen.getByRole("region", { name }))
    .getAllByRole("button")
    .map((row) => row.querySelector(".nm")?.textContent ?? "");
}

/** Item names in a labelled list on the summary screen. */
function listNames(label: string) {
  return within(screen.getByRole("list", { name: label }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
}

async function startShopping() {
  const app = await openSignedIn();
  await app.user.click(screen.getByRole("button", { name: "Start shopping" }));
  await screen.findByRole("heading", { name: "0 of 4 in cart" });
  return app;
}

const check = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

function entryId(engine: Engine, itemName: string) {
  const state = engine.getState();
  if (state.kind !== "ready") throw new Error("expected ready");
  const item = state.data.items.find((i) => i.name === itemName);
  const entry = state.data.entries.find((e) => e.itemId === item?.id);
  if (entry === undefined) throw new Error(`${itemName} is not on the list`);
  return entry.id;
}

describe("shopping", () => {
  it("starts a trip and shows what to get, by aisle", async () => {
    await startShopping();
    expect(screen.getByText(/^Shopping · started /)).toBeDefined();
    expect(shopSection("Dairy")).toEqual(["Eggs", "Milk"]);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("checks items into the cart and back out", async () => {
    const { user } = await startShopping();
    await user.click(check("Milk"));
    expect(screen.getByRole("heading", { name: "1 of 4 in cart" })).toBeDefined();
    expect(shopSection("In cart")).toEqual(["Milk"]);
    expect(check("Milk").getAttribute("aria-pressed")).toBe("true");
    expect(shopSection("Dairy")).toEqual(["Eggs"]);

    await user.click(check("Milk"));
    expect(screen.getByRole("heading", { name: "0 of 4 in cart" })).toBeDefined();
    expect(screen.queryByRole("region", { name: "In cart" })).toBeNull();
  });

  it("goes back to the list mid-trip and resumes", async () => {
    const { user } = await startShopping();
    await user.click(check("Eggs"));
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("You are shopping")).toBeDefined();
    expect(screen.getByText(/1 of 4 in cart/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Start shopping" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByRole("heading", { name: "1 of 4 in cart" })).toBeDefined();
  });

  it("completes the trip, keeping what wasn't found", async () => {
    const { user } = await startShopping();
    await user.click(check("Milk"));
    await user.click(check("Eggs"));
    await user.click(screen.getByRole("button", { name: "Complete trip" }));

    const sheet = screen.getByRole("dialog", { name: "Complete trip?" });
    expect(within(sheet).getByText(/^2 items in the cart/).textContent).toBe(
      "2 items in the cart will be cleared from the list. 2 items not found will stay on the list for next time.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Complete trip" }));

    expect(screen.getByRole("heading", { name: "Trip done" })).toBeDefined();
    expect(listNames("Bought")).toEqual(["Eggs", "Milk"]);
    expect(listNames("Still on your list")).toEqual(["Bananas", "Coffee"]);

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByText("Home · 2 items")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start shopping" })).toBeDefined();
  });

  it("keeps shopping working offline and syncs when back", async () => {
    const { user, connection, server } = await openSignedIn();
    connection.setOnline(false);
    await screen.findByText("Offline · shopping still works");

    await user.click(screen.getByRole("button", { name: "Start shopping" }));
    await user.click(check("Milk"));
    expect(screen.getByRole("status").textContent).toBe("Offline · 2 changes waiting to sync");
    await user.click(screen.getByRole("button", { name: "Complete trip" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Complete trip" }),
    );
    expect(screen.getByRole("heading", { name: "Trip done" })).toBeDefined();
    expect(server.inspect(sample.household)?.data.entries).toHaveLength(4);

    connection.setOnline(true);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(server.inspect(sample.household)?.data.entries).toHaveLength(3);
    expect(server.inspect(sample.household)?.data.shop).toEqual({ kind: "planning" });
  });
});

describe("the other phone's trip", () => {
  it("shows who is shopping and their progress, live", async () => {
    const { server, user } = await openSignedIn("doug");
    const alex = await otherPhone(server, "alex");
    expect(alex.startTrip().ok).toBe(true);
    await screen.findByText("Alex is shopping");
    expect(screen.getByText(/0 of 4 in cart/)).toBeDefined();

    expect(alex.toggleInCart(entryId(alex, "Coffee")).ok).toBe(true);
    await screen.findByText(/1 of 4 in cart/);

    await user.click(screen.getByRole("button", { name: "Follow" }));
    expect(screen.getByText(/^Alex is shopping · started /)).toBeDefined();
    expect(shopSection("In cart")).toEqual(["Coffee"]);
  });

  it("returns to the list when the trip ends on the other phone", async () => {
    const { server, user } = await openSignedIn("doug");
    const alex = await otherPhone(server, "alex");
    expect(alex.startTrip().ok).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Follow" }));
    await screen.findByRole("heading", { name: "0 of 4 in cart" });

    expect(alex.completeTrip().ok).toBe(true);
    await screen.findByRole("heading", { name: "Shopping list" });
    expect(screen.getByRole("button", { name: "Start shopping" })).toBeDefined();
  });
});
