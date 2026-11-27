import { describeNotice, type Engine, type ReadyState } from "@quickshop/core";
import { useState } from "react";
import { CatalogScreen } from "./CatalogScreen.tsx";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { ListScreen } from "./ListScreen.tsx";

type Tab = "list" | "catalog";

const tabs: readonly { readonly tab: Tab; readonly label: string }[] = [
  { tab: "list", label: "List" },
  { tab: "catalog", label: "Catalog" },
];

/** Signed in and loaded: the list and catalog tabs, the offline bar and notices. */
export function Home({ engine, state }: { engine: Engine; state: ReadyState }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <>
      <OfflineBar state={state} />
      {tab === "list" ? (
        <ListScreen engine={engine} state={state} />
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
      {state.notice !== null && (
        <div className="toast" role="alert">
          <span>{describeNotice(state.notice)}</span>
          <button onClick={engine.dismissNotice}>OK</button>
        </div>
      )}
    </>
  );
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
