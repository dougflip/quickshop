import { activeTrip, describeNotice, type Engine, type ReadyState } from "@quickshop/core";
import { useState } from "react";
import { CatalogScreen } from "./CatalogScreen.tsx";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { ListScreen } from "./ListScreen.tsx";
import { ShopScreen } from "./ShopScreen.tsx";
import { TripSummary } from "./TripSummary.tsx";

type Tab = "list" | "catalog";

const tabs: readonly { readonly tab: Tab; readonly label: string }[] = [
  { tab: "list", label: "List" },
  { tab: "catalog", label: "Catalog" },
];

/**
 * Signed in and loaded. The list and catalog tabs, or the shopping screen while this phone is
 * following a trip, or the summary right after completing one. Plus the offline bar and notices.
 */
export function Home({ engine, state }: { engine: Engine; state: ReadyState }) {
  const [tab, setTab] = useState<Tab>("list");
  const [shopping, setShopping] = useState(false);
  const trip = activeTrip(state.data.shop);

  return (
    <>
      <OfflineBar state={state} />
      {screen()}
      {state.notice !== null && (
        <div className="toast" role="alert">
          <span>{describeNotice(state.notice)}</span>
          <button onClick={engine.dismissNotice}>OK</button>
        </div>
      )}
    </>
  );

  function screen() {
    if (state.lastTrip !== null) return <TripSummary engine={engine} trip={state.lastTrip} />;
    // If the trip ends (here or on the other phone), this falls back to the tabs.
    if (shopping && trip !== null) {
      return (
        <ShopScreen engine={engine} state={state} trip={trip} onBack={() => setShopping(false)} />
      );
    }
    return (
      <>
        {tab === "list" ? (
          <ListScreen engine={engine} state={state} onShop={() => setShopping(true)} />
        ) : (
          <CatalogScreen engine={engine} state={state} />
        )}
        <nav className="tabs" aria-label="Screens">
          {tabs.map(({ tab: t, label }) => (
            <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
              <Icon name={t} weight={1.9} />
              {label}
            </button>
          ))}
        </nav>
      </>
    );
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
