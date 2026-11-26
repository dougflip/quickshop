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
   * Live changes for one household. Nothing is delivered while offline and missed changes are
   * not replayed, so reload the household after reconnecting.
   */
  subscribe(householdId: HouseholdId, onChange: (change: Change) => void): Unsubscribe;
};
