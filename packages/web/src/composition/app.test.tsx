// @vitest-environment happy-dom
// The real app, rendered against the in-memory backend and driven like a person would.
import {
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  sample,
} from "@quickshop/adapter-memory";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app/App.tsx";
import { createAppEngine } from "./launch.ts";

afterEach(cleanup);

function openApp() {
  const server = createMemoryServer(createSampleSeed());
  const connection = server.connect();
  const engine = createAppEngine({ ...connection, store: createMemoryLocalStore() });
  void engine.start();
  render(<App engine={engine} signIn={{ email: "", password: "", hint: "Sample accounts" }} />);
  return { engine, connection, user: userEvent.setup() };
}

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("sign in", () => {
  it("says so when the email and password don't match", async () => {
    const { user } = openApp();
    await signIn(user, sample.credentials.doug.email, "wrong");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That email and password don't match.",
    );
  });

  it("opens the household's list", async () => {
    const { user } = openApp();
    await signIn(user, sample.credentials.doug.email, sample.credentials.doug.password);
    expect(await screen.findByRole("heading", { name: "Shopping list" })).toBeDefined();
    expect(screen.getByText(/^Home · \d+ items?$/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Account" }).textContent).toBe("D");
  });
});

describe("account sheet", () => {
  it("shows who is signed in and signs out", async () => {
    const { user } = openApp();
    await signIn(user, sample.credentials.alex.email, sample.credentials.alex.password);
    await user.click(await screen.findByRole("button", { name: "Account" }));

    const sheet = screen.getByRole("dialog", { name: "Account" });
    expect(within(sheet).getByRole("heading").textContent).toBe("Alex");
    expect(within(sheet).getByText(/alex@example\.com · Home household/)).toBeDefined();
    expect(within(sheet).getByText("Shared with Doug.")).toBeDefined();

    await user.click(within(sheet).getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("closes without signing out", async () => {
    const { user } = openApp();
    await signIn(user, sample.credentials.doug.email, sample.credentials.doug.password);
    await user.click(await screen.findByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Shopping list" })).toBeDefined();
  });

  it("warns before signing out loses changes that haven't synced", async () => {
    const { engine, connection, user } = openApp();
    await signIn(user, sample.credentials.doug.email, sample.credentials.doug.password);
    await user.click(await screen.findByRole("button", { name: "Account" }));
    expect(screen.queryByText(/synced yet/)).toBeNull();

    // A dead spot in the store: starting a trip works, but can't reach the server yet.
    connection.setServerReachable(false);
    expect(engine.startTrip().ok).toBe(true);
    expect(
      await screen.findByText(
        "1 change on this phone hasn't synced yet. Signing out now loses it.",
      ),
    ).toBeDefined();
  });
});
