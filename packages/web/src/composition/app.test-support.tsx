// Shared setup for screen tests: the real app on an in-memory server, driven like a person would.
import {
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  sample,
  type MemoryServer,
} from "@quickshop/adapter-memory";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App.tsx";
import { createAppEngine } from "./launch.ts";

export type Person = keyof typeof sample.credentials;

/** Renders the app for one phone. Pass a server to put two phones on the same household. */
export function openApp(server: MemoryServer = createMemoryServer(createSampleSeed())) {
  const connection = server.connect();
  const engine = createAppEngine({ ...connection, store: createMemoryLocalStore() });
  void engine.start();
  render(<App engine={engine} signIn={{ email: "", password: "", hint: "Sample accounts" }} />);
  return { server, engine, connection, user: userEvent.setup() };
}

export async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

/** Opens the app signed in, on the list screen. */
export async function openSignedIn(person: Person = "doug", server?: MemoryServer) {
  const app = openApp(server);
  const { email, password } = sample.credentials[person];
  await signIn(app.user, email, password);
  await screen.findByRole("heading", { name: "Shopping list" });
  return app;
}

/** Another phone on the same server, driven through its engine only (it isn't rendered). */
export async function otherPhone(server: MemoryServer, person: Person) {
  const engine = createAppEngine({ ...server.connect(), store: createMemoryLocalStore() });
  await engine.start();
  const { email, password } = sample.credentials[person];
  await engine.signIn(email, password);
  return engine;
}
