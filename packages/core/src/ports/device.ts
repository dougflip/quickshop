import type { Instant } from "../domain/ids.ts";
import type { Unsubscribe } from "./backend.ts";

/** Key-value storage that survives a reload of the app on this device. */
export type LocalStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type NetworkStatus = {
  isOnline(): boolean;
  subscribe(onChange: (online: boolean) => void): Unsubscribe;
};

export type Clock = { now(): Instant };

/** Creates ids for new records on this device, so things made offline already have their final id. */
export type IdGenerator = { newId(): string };
