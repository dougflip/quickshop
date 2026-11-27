// Composition root: picks the backend and what to show. Only this file and src/composition/ may
// import adapters.
//   npm run dev            the app on an in-memory sample household
//   npm run dev:supabase   the app on the hosted project
//   add ?harness           the bare-bones harness on the same backend
import "@fontsource-variable/figtree";
import "./app/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { memoryDevice, supabaseDevice } from "./composition/app-device.ts";
import { createMemoryWorld } from "./composition/memory-world.ts";
import { createSupabaseWorld } from "./composition/supabase-world.ts";
import { Harness } from "./harness/Harness.tsx";

const onSupabase = import.meta.env["VITE_BACKEND"] === "supabase";
const harness = new URLSearchParams(window.location.search).has("harness");

function root() {
  if (harness) {
    return <Harness world={onSupabase ? createSupabaseWorld() : createMemoryWorld()} />;
  }
  const device = onSupabase ? supabaseDevice() : memoryDevice();
  void device.engine.start();
  return <App engine={device.engine} signIn={device.signIn} />;
}

const element = document.getElementById("root");
if (element === null) throw new Error("index.html is missing #root");
createRoot(element).render(<StrictMode>{root()}</StrictMode>);
