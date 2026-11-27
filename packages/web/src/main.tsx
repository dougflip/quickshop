// Composition root: picks the backend. Only this file and src/composition/ may import adapters.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryWorld } from "./composition/memory-world.ts";
import { createSupabaseWorld } from "./composition/supabase-world.ts";
import { Harness } from "./harness/Harness.tsx";

// `npm run dev` uses the in-memory backend; `npm run dev:supabase` the hosted project.
const world =
  import.meta.env["VITE_BACKEND"] === "supabase" ? createSupabaseWorld() : createMemoryWorld();

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing #root");
createRoot(root).render(
  <StrictMode>
    <Harness world={world} />
  </StrictMode>,
);
