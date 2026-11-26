import type { UserId } from "../domain/ids.ts";
import type { Mutation } from "../domain/mutation.ts";
import type { HouseholdData } from "../domain/types.ts";
import type { Household, Member } from "../ports/backend.ts";
import type { LocalStore } from "../ports/device.ts";

/**
 * Which changes can be made without a connection: everything needed to shop a trip.
 * Adding and editing the list wait for a connection, which keeps conflicts simple.
 */
export function worksOffline(mutation: Mutation): boolean {
  switch (mutation.kind) {
    case "startTrip":
    case "setEntryStatus":
    case "completeTrip":
      return true;
    case "createItem":
    case "renameItem":
    case "setItemCategories":
    case "deleteItem":
    case "addEntry":
    case "removeEntry":
    case "setNote":
      return false;
  }
}

/** What the device keeps so the app can open and shop offline, and so queued changes survive a reload. */
export type SavedHousehold = {
  readonly version: 1;
  readonly household: Household;
  readonly members: readonly Member[];
  /** The server's data as last seen, without this device's unsent changes. */
  readonly confirmed: HouseholdData;
  /** This device's changes not yet confirmed by the server, oldest first. */
  readonly pending: readonly Mutation[];
};

const keyFor = (userId: UserId) => `quickshop/v1/household/${userId}`;

export async function readSaved(store: LocalStore, userId: UserId): Promise<SavedHousehold | null> {
  const raw = await store.get(keyFor(userId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 1
    ) {
      // Only this module writes the key, with this version, so the shape is known.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return parsed as SavedHousehold;
    }
  } catch {
    // Unreadable saved data is treated like none: the app loads from the server instead.
  }
  return null;
}

export function writeSaved(
  store: LocalStore,
  userId: UserId,
  saved: SavedHousehold,
): Promise<void> {
  return store.set(keyFor(userId), JSON.stringify(saved));
}

export function clearSaved(store: LocalStore, userId: UserId): Promise<void> {
  return store.remove(keyFor(userId));
}
