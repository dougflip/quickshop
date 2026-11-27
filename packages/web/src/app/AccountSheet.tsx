import type { Engine, ReadyState } from "@quickshop/core";
import { plural } from "./format.ts";
import { Sheet } from "./Sheet.tsx";

export function AccountSheet({
  engine,
  state,
  onClose,
}: {
  engine: Engine;
  state: ReadyState;
  onClose: () => void;
}) {
  const others = state.members.filter((m) => m.userId !== state.user.id).map((m) => m.displayName);
  return (
    <Sheet label="Account" onClose={onClose}>
      <h2>{state.user.displayName}</h2>
      <p>
        {state.user.email} · {state.household.name} household
      </p>
      {others.length > 0 && <p>Shared with {others.join(", ")}.</p>}
      {state.pendingCount > 0 && (
        <p className="warn" role="alert">
          {plural(state.pendingCount, "change")} on this phone{" "}
          {state.pendingCount === 1 ? "hasn't" : "haven't"} synced yet. Signing out now loses{" "}
          {state.pendingCount === 1 ? "it" : "them"}.
        </p>
      )}
      <div className="acts">
        <button className="ghost danger" onClick={() => void engine.signOut()}>
          Sign out
        </button>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
