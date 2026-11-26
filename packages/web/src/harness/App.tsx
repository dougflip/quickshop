import type { Engine, ReadyState } from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { CatalogSection } from "./CatalogSection.tsx";
import { useEngine } from "./hooks.ts";
import { ListSection } from "./ListSection.tsx";
import { ShoppingSection } from "./ShoppingSection.tsx";

/** One phone's app: picks a screen from the engine state and nothing else. */
export function App({
  engine,
  credentials,
}: {
  engine: Engine;
  credentials: { email: string; password: string };
}) {
  const state = useEngine(engine);
  switch (state.kind) {
    case "starting":
      return <p>Starting…</p>;
    case "signedOut":
      return (
        <SignIn
          engine={engine}
          credentials={credentials}
          busy={state.signingIn}
          error={state.error === null ? null : state.error.kind}
        />
      );
    case "loading":
      return <p>Loading {state.user.displayName}'s household…</p>;
    case "noHousehold":
      return <p>{state.user.displayName} is not in a household yet.</p>;
    case "loadFailed":
      return (
        <p>
          Could not load the household ({state.error.kind}).{" "}
          <button onClick={() => void engine.retryLoad()}>Retry</button>
        </p>
      );
    case "ready":
      return <Ready engine={engine} state={state} />;
  }
}

function SignIn({
  engine,
  credentials,
  busy,
  error,
}: {
  engine: Engine;
  credentials: { email: string; password: string };
  busy: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState(credentials.email);
  const [password, setPassword] = useState(credentials.password);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void engine.signIn(email, password);
  };
  return (
    <form onSubmit={submit}>
      <h3>Sign in</h3>
      <p>
        <label>
          Email <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </p>
      <p>
        <label>
          Password{" "}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </p>
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error !== null && <p role="alert">Sign-in failed: {error}</p>}
    </form>
  );
}

function Ready({ engine, state }: { engine: Engine; state: ReadyState }) {
  const shopping = state.data.shop.kind === "shopping";
  return (
    <div>
      <p>
        <strong>{state.user.displayName}</strong> in {state.household.name} ·{" "}
        {state.online ? "online" : "OFFLINE"} · {state.pendingCount} waiting to sync ·{" "}
        <button onClick={() => void engine.signOut()}>Sign out</button>
      </p>

      {state.notice !== null && (
        <p role="alert">
          A change did not stick ({state.notice.mutation.kind}:{" "}
          {state.notice.kind === "rejected" ? state.notice.reason.kind : state.notice.error.kind}
          ). <button onClick={engine.dismissNotice}>Dismiss</button>
        </p>
      )}

      {state.lastTrip !== null && (
        <section>
          <h3>Trip done</h3>
          <p>
            Bought:{" "}
            {state.lastTrip.items
              .filter((i) => i.outcome === "bought")
              .map((i) => i.name)
              .join(", ") || "nothing"}
          </p>
          <p>
            Still on the list:{" "}
            {state.lastTrip.items
              .filter((i) => i.outcome === "left")
              .map((i) => i.name)
              .join(", ") || "nothing"}
          </p>
          <button onClick={engine.dismissTripSummary}>Back to list</button>
        </section>
      )}

      {shopping ? (
        <ShoppingSection engine={engine} state={state} />
      ) : (
        <ListSection engine={engine} state={state} />
      )}
      <CatalogSection engine={engine} state={state} />
    </div>
  );
}
