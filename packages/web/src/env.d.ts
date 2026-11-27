// Build-time settings. Vite replaces these with their values, so the unused backend's code is
// left out of the bundle.
// oxlint-disable typescript/consistent-type-definitions -- these merge into Vite's interfaces
interface ImportMetaEnv {
  /** "supabase" for the hosted project; anything else is the in-memory sample. */
  readonly VITE_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
