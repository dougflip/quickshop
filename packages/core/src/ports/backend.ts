import type { DomainError } from "../domain/errors.ts";
import type { HouseholdId, UserId } from "../domain/ids.ts";
import type { ApplyOutcome, Change, Mutation } from "../domain/mutation.ts";
import type { Result } from "../domain/result.ts";
import type { HouseholdData } from "../domain/types.ts";

export type Household = { readonly id: HouseholdId; readonly name: string };
export type Member = { readonly userId: UserId; readonly displayName: string };

export type HouseholdSnapshot = {
  readonly household: Household;
  readonly members: readonly Member[];
  readonly data: HouseholdData;
};

export type BackendError =
  | { readonly kind: "unavailable" }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "rejected"; readonly reason: DomainError };

export type Unsubscribe = () => void;

export type BackendPort = {
  /** The signed-in user's households, oldest membership first. */
  listHouseholds(): Promise<Result<readonly Household[], BackendError>>;
  loadHousehold(householdId: HouseholdId): Promise<Result<HouseholdSnapshot, BackendError>>;
  apply(householdId: HouseholdId, mutation: Mutation): Promise<Result<ApplyOutcome, BackendError>>;
  /**
   * Live changes for one household. Joining may finish in the background, but every change
   * committed after a later `loadHousehold` returns is delivered: subscribe, then load, and
   * nothing falls in between. Nothing is delivered while offline and missed changes are not
   * replayed, so reload the household after reconnecting.
   *
   * Live delivery can also drop and come back on its own, without the device going offline (a
   * phone waking up, a flaky signal). `onReconnect` is called when it comes back: changes from
   * the gap were missed, so reload then too.
   */
  subscribe(
    householdId: HouseholdId,
    onChange: (change: Change) => void,
    onReconnect?: () => void,
  ): Unsubscribe;
};
