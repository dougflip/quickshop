import {
  applyMutation,
  changesBetween,
  err,
  ok,
  type ApplyOutcome,
  type BackendError,
  type Change,
  type CompletedTrip,
  type HouseholdData,
  type Mutation,
  type Result,
  type UserId,
} from "@quickshop/core";

/** One household as the server stores it. */
export type StoredHousehold = {
  readonly data: HouseholdData;
  readonly completedTrips: readonly CompletedTrip[];
};

export type ServerApplied = {
  readonly outcome: ApplyOutcome;
  readonly household: StoredHousehold;
  readonly changes: readonly Change[];
};

/**
 * What the server does with a mutation: the shared rules in core's `applyMutation`, plus keeping
 * a record of completed trips and working out which rows changed for the live feed.
 */
export function serverApply(
  stored: StoredHousehold,
  mutation: Mutation,
  actor: UserId,
): Result<ServerApplied, BackendError> {
  const finished = new Set(stored.completedTrips.map((t) => t.id));
  const result = applyMutation(stored.data, mutation, actor, finished);
  if (!result.ok) return err({ kind: "rejected", reason: result.error });
  const { data, outcome } = result.value;
  const completedTrips =
    mutation.kind === "completeTrip" &&
    outcome === "applied" &&
    stored.data.shop.kind === "shopping"
      ? [
          ...stored.completedTrips,
          { ...stored.data.shop.trip, completedAt: mutation.completedAt, items: mutation.items },
        ]
      : stored.completedTrips;
  return ok({
    outcome,
    household: { data, completedTrips },
    changes: changesBetween(stored.data, data),
  });
}
