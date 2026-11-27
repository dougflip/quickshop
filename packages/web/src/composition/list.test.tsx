// @vitest-environment happy-dom
// 8b: the list screen. Quick add, creating items, notes, removing, and the other phone's changes.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openSignedIn, otherPhone } from "./app.test-support.tsx";

afterEach(cleanup);

/** The list rows under a category heading, by item name. */
function groupNames(category: string): string[] {
  const heading = screen.getByRole("heading", { level: 3, name: new RegExp(`^${category}`) });
  const section = heading.closest("section");
  if (section === null) throw new Error(`no section for ${category}`);
  return within(section)
    .getAllByRole("listitem")
    .map((row) => row.querySelector(".nm")?.textContent ?? "");
}

const addBox = () => screen.getByRole("textbox", { name: "Add to the list" });

describe("quick add", () => {
  it("suggests matching items and adds one", async () => {
    const { user } = await openSignedIn();
    await user.type(addBox(), "sal");
    const suggestions = screen.getByRole("list", { name: "Matching items" });
    expect(within(suggestions).getByRole("button", { name: /Salmon/ }).textContent).toBe(
      "SalmonMeat & fish",
    );
    await user.click(within(suggestions).getByRole("button", { name: /Salmon/ }));
    expect(groupNames("Meat & fish")).toEqual(["Salmon"]);
    expect(addBox()).toHaveProperty("value", "");
  });

  it("shows items already on the list, but won't add them twice", async () => {
    const { user } = await openSignedIn();
    await user.type(addBox(), "milk");
    const milk = screen.getByRole("button", { name: /^Milk\s*On list$/ });
    expect(milk).toHaveProperty("disabled", true);
  });

  it("adds an exact match on Enter, ignoring case and spaces", async () => {
    const { user } = await openSignedIn();
    await user.type(addBox(), "  CHEDDAR {Enter}");
    expect(groupNames("Dairy")).toContain("Cheddar");
  });

  it("offers to create something new, and puts it on the list", async () => {
    const { user } = await openSignedIn();
    await user.type(addBox(), "oat  milk{Enter}");

    const sheet = screen.getByRole("dialog", { name: "New item" });
    expect(within(sheet).getByLabelText("Name")).toHaveProperty("value", "oat milk");
    await user.click(within(sheet).getByRole("button", { name: "Dairy" }));
    await user.click(within(sheet).getByRole("button", { name: "Pantry" }));
    // The numbers show the order: the first category decides where it's grouped.
    const chip = (name: string) => within(sheet).getByRole("button", { name, pressed: true });
    expect(chip("Dairy").textContent).toBe("1Dairy");
    expect(chip("Pantry").textContent).toBe("2Pantry");
    await user.click(within(sheet).getByRole("button", { name: "Create and add to list" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(groupNames("Dairy")).toContain("oat milk");
  });

  it("explains when the new name is already taken", async () => {
    const { user } = await openSignedIn();
    await user.type(addBox(), "Kale{Enter}");
    const sheet = screen.getByRole("dialog", { name: "New item" });
    const name = within(sheet).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "SPINACH");
    await user.click(within(sheet).getByRole("button", { name: "Create and add to list" }));
    expect(within(sheet).getByRole("alert").textContent).toBe(
      "An item with that name already exists.",
    );
  });
});

describe("list rows", () => {
  it("edits and clears a note", async () => {
    const { user } = await openSignedIn();
    await user.click(screen.getByRole("button", { name: "Edit the note for Milk" }));
    const note = screen.getByRole("textbox", { name: "Note" });
    expect(note).toHaveProperty("value", "2 gallons");
    await user.clear(note);
    await user.type(note, "1 gallon, oat");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("button", { name: "Edit the note for Milk" }).textContent).toBe(
      "1 gallon, oat",
    );

    await user.click(screen.getByRole("button", { name: "Edit the note for Milk" }));
    await user.clear(screen.getByRole("textbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("button", { name: "Add a note for Milk" }).textContent).toBe(
      "Add note",
    );
  });

  it("removes an entry", async () => {
    const { user } = await openSignedIn();
    await user.click(screen.getByRole("button", { name: "Remove Bananas" }));
    expect(screen.queryByText("Bananas")).toBeNull();
    expect(screen.getByText("Home · 3 items")).toBeDefined();
  });

  it("shows the other person's additions as they happen, with who added them", async () => {
    const { server } = await openSignedIn("doug");
    const alex = await otherPhone(server, "alex");
    const state = alex.getState();
    if (state.kind !== "ready") throw new Error("Alex should be signed in");
    const apples = state.data.items.find((i) => i.name === "Apples");
    if (apples === undefined) throw new Error("sample has Apples");
    expect(alex.addToList(apples.id).ok).toBe(true);

    await waitFor(() => expect(groupNames("Produce")).toContain("Apples"));
    const row = screen.getByText("Apples").closest("li");
    expect(row?.classList.contains("fresh")).toBe(true);
    expect(row?.querySelector(".by")?.getAttribute("title")).toBe("Added by Alex");
  });
});

describe("offline", () => {
  it("turns off adding and editing, and says why", async () => {
    const { connection } = await openSignedIn();
    connection.setOnline(false);
    await screen.findByText("Adding and editing need a connection.");
    expect(addBox()).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Remove Milk" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toBe("Offline · shopping still works");
  });
});
