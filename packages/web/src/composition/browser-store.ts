import type { LocalStore } from "@quickshop/core";

/** Runs a storage write, logging instead of failing. */
function attempt(what: string, run: () => void): Promise<void> {
  try {
    run();
  } catch (error) {
    console.warn(`QuickShop: couldn't ${what} the copy on this device`, error);
  }
  return Promise.resolve();
}

/**
 * The engine's device copy (the household and unsent changes) in Web Storage, so it survives
 * closing the app. A full or unavailable storage only loses the copy, never the running app.
 */
export function createBrowserLocalStore(storage: Storage): LocalStore {
  return {
    get: (key) => {
      try {
        return Promise.resolve(storage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    },
    set: (key, value) => attempt("save", () => storage.setItem(key, value)),
    remove: (key) => attempt("clear", () => storage.removeItem(key)),
  };
}
