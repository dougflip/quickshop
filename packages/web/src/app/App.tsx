import { describeNotice, type BackendError, type Engine, type ReadyState } from "@quickshop/core";
import { useEngine } from "../hooks.ts";
import { plural } from "./format.ts";
import { ListScreen } from "./ListScreen.tsx";
import { SignIn, type SignInDefaults } from "./SignIn.tsx";

/** The QuickShop app: picks a screen from the engine's state and nothing else. */
export function App({ engine, signIn }: { engine: Engine; signIn: SignInDefaults }) {
  const state = useEngine(engine);
  return <div className="app">{screen()}</div>;

  function screen() {
    switch (state.kind) {
      case "starting":
        return <div className="status" aria-busy="true" />;
      case "signedOut":
        return (
          <SignIn engine={engine} busy={state.signingIn} error={state.error} defaults={signIn} />
        );
      case "loading":
        return (
          <div className="status" aria-busy="true">
            Loading your list…
          </div>
        );
      case "noHousehold":
        return (
          <div className="status">
            <b>No household yet</b>
            <span>
              {state.user.email} isn't part of a household. Ask whoever set up QuickShop to add you.
            </span>
            <button className="ghost" onClick={() => void engine.signOut()}>
              Sign out
            </button>
          </div>
        );
      case "loadFailed":
        return (
          <div className="status">
            <b>Couldn't load your list</b>
            <span>{loadFailure(state.error)}</span>
            <button className="ghost" onClick={() => void engine.retryLoad()}>
              Try again
            </button>
            <button className="ghost" onClick={() => void engine.signOut()}>
              Sign out
            </button>
          </div>
        );
      case "ready":
        return (
          <>
            <OfflineBar state={state} />
            <ListScreen engine={engine} state={state} />
            {state.notice !== null && (
              <div className="toast" role="alert">
                <span>{describeNotice(state.notice)}</span>
                <button onClick={engine.dismissNotice}>OK</button>
              </div>
            )}
          </>
        );
    }
  }
}

function loadFailure(error: BackendError): string {
  switch (error.kind) {
    case "unavailable":
      return "Can't reach QuickShop. Check your connection.";
    case "unauthorized":
      return "Your session has ended. Sign out and back in.";
    case "rejected":
      return "Something went wrong on the server.";
  }
}

function OfflineBar({ state }: { state: ReadyState }) {
  if (state.online) return null;
  return (
    <div className="offline" role="status">
      Offline ·{" "}
      {state.pendingCount > 0
        ? `${plural(state.pendingCount, "change")} waiting to sync`
        : "shopping still works"}
    </div>
  );
}
