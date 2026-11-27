// @vitest-environment happy-dom
// 8c: the catalog tab and the item editor.
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openSignedIn } from "./app.test-support.tsx";

afterEach(cleanup);

async function openCatalog() {
  const app = await openSignedIn();
  await app.user.click(screen.getByRole("button", { name: "Catalog" }));
  return app;
}

/** Item names (and their "Also in" tags) under one catalog section. */
function section(name: string): string[] {
  return within(screen.getByRole("region", { name }))
    .getAllByRole("listitem")
    .map((row) => row.querySelector(".main")?.textContent ?? "");
}

describe("catalog", () => {
  it("lists every item by category, alphabetically", async () => {
    await openCatalog();
    expect(screen.getByRole("heading", { name: "Catalog" })).toBeDefined();
    expect(screen.getByText("25 items · 7 categories")).toBeDefined();
    expect(section("Bakery")).toEqual(["Bagels", "Sourdough bread"]);
    expect(screen.getByRole("button", { name: "Catalog" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("searches by name", async () => {
    const { user } = await openCatalog();
    await user.type(screen.getByRole("searchbox", { name: "Search items" }), "PEA");
    expect(section("Pantry")).toEqual(["Peanut butter"]);
    expect(section("Frozen")).toEqual(["Frozen peas"]);
    expect(screen.queryByRole("region", { name: "Dairy" })).toBeNull();

    await user.type(screen.getByRole("searchbox", { name: "Search items" }), "zzz");
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("puts items on the list and takes them off", async () => {
    const { user } = await openCatalog();
    await user.click(screen.getByRole("button", { name: "Add Rice" }));
    const onList = screen.getByRole("button", { name: "Rice is on the list" });
    expect(onList.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("Rice")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Catalog" }));
    await user.click(screen.getByRole("button", { name: "Rice is on the list" }));
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.queryByText("Rice")).toBeNull();
  });

  it("creates an item without putting it on the list", async () => {
    const { user } = await openCatalog();
    await user.click(screen.getByRole("button", { name: "New item" }));
    const sheet = screen.getByRole("dialog", { name: "New item" });
    await user.type(within(sheet).getByLabelText("Name"), "Kale");
    await user.click(within(sheet).getByRole("button", { name: "Produce" }));
    await user.click(within(sheet).getByRole("button", { name: "Create item" }));
    expect(section("Produce")).toContain("Kale");
    expect(screen.getByRole("button", { name: "Add Kale" })).toBeDefined();
  });
});

describe("item editor", () => {
  it("renames an item and adds a second category", async () => {
    const { user } = await openCatalog();
    await user.click(screen.getByRole("button", { name: "Milk" }));
    const sheet = screen.getByRole("dialog", { name: "Edit item" });
    expect(within(sheet).getByRole("button", { name: "Dairy", pressed: true })).toBeDefined();

    const name = within(sheet).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Whole milk");
    await user.click(within(sheet).getByRole("button", { name: "Frozen" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(section("Dairy")).toContain("Whole milkAlso in Frozen");
    expect(section("Frozen")).toContain("Whole milkAlso in Dairy");
  });

  it("refuses a name another item already has", async () => {
    const { user } = await openCatalog();
    await user.click(screen.getByRole("button", { name: "Milk" }));
    const sheet = screen.getByRole("dialog", { name: "Edit item" });
    const name = within(sheet).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "eggs");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByRole("alert").textContent).toBe(
      "An item with that name already exists.",
    );
  });

  it("deletes an item after a second tap, taking it off the list too", async () => {
    const { user } = await openCatalog();
    await user.click(screen.getByRole("button", { name: "Milk" }));
    const sheet = screen.getByRole("dialog", { name: "Edit item" });
    await user.click(within(sheet).getByRole("button", { name: "Delete item" }));
    const confirm = within(sheet).getByRole("button", {
      name: "Tap again to delete Milk and take it off the list",
    });
    await user.click(confirm);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Milk" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.queryByText("Milk")).toBeNull();
  });
});
