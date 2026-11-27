import {
  createMemoryLocalStore,
  createMemoryServer,
  createSampleSeed,
  sample,
} from "@quickshop/adapter-memory";
import { createSupabaseConnection, hostedProject } from "@quickshop/adapter-supabase";
import type { Engine } from "@quickshop/core";
import type { SignInDefaults } from "../app/SignIn.tsx";
import { createBrowserLocalStore } from "./browser-store.ts";
import { createAppEngine } from "./launch.ts";

export type AppDevice = { readonly engine: Engine; readonly signIn: SignInDefaults };

/** The real app on the hosted project. The session and the device copy live in localStorage. */
export function supabaseDevice(): AppDevice {
  const connection = createSupabaseConnection({
    project: hostedProject,
    storage: window.localStorage,
    storageKey: "quickshop",
  });
  const engine = createAppEngine({
    ...connection,
    store: createBrowserLocalStore(window.localStorage),
  });
  return {
    engine,
    signIn: {
      email: "",
      password: "",
      hint: "Accounts are created by hand, so there is no sign-up.",
    },
  };
}

/** The app on a private in-memory server with the sample household, for working on screens. */
export function memoryDevice(): AppDevice {
  const server = createMemoryServer(createSampleSeed());
  const engine = createAppEngine({ ...server.connect(), store: createMemoryLocalStore() });
  return {
    engine,
    signIn: {
      ...sample.credentials.doug,
      hint: `In-memory sample data. Also try ${sample.credentials.alex.email}. Resets on reload.`,
    },
  };
}
