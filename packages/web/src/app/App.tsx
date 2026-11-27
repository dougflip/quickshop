import type { BackendError, Engine } from "@quickshop/core";
import { useEngine } from "../hooks.ts";
import { Home } from "./Home.tsx";
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
        return <Home engine={engine} state={state} />;
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
