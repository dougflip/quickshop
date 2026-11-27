import { groupEntries, type Engine, type ReadyState } from "@quickshop/core";
import { useState } from "react";
import { AccountSheet } from "./AccountSheet.tsx";
import { initial, plural } from "./format.ts";

/** The shopping list. 8a: header, account and the list itself; adding and editing come in 8b. */
export function ListScreen({ engine, state }: { engine: Engine; state: ReadyState }) {
  const [sheet, setSheet] = useState<"account" | null>(null);
  const { data, members, household, user } = state;
  const groups = groupEntries(data);
  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? "?";

  return (
    <>
      <header className="top">
        <div>
          <p className="sub">
            {household.name} · {plural(data.entries.length, "item")}
          </p>
          <h1>Shopping list</h1>
        </div>
        <button className="av" aria-label="Account" onClick={() => setSheet("account")}>
          {initial(user.displayName)}
        </button>
      </header>
      <div className="scroll">
        {groups.length === 0 ? (
          <div className="empty">
            <b>Nothing on the list</b>Add what you need for the next trip.
          </div>
        ) : (
          groups.map((group) => (
            <section className="grp" key={group.category?.id ?? "other"}>
              <h3>
                {group.category?.name ?? "Other"}
                <span>{group.entries.length}</span>
              </h3>
              <ul>
                {group.entries.map(({ entry, item }) => (
                  <li key={entry.id} className={entry.status === "in_cart" ? "row done" : "row"}>
                    <div className="main">
                      <span className="nm">{item.name}</span>
                      {entry.note !== null && <span className="note">{entry.note}</span>}
                    </div>
                    <span className="by" title={`Added by ${nameOf(entry.addedBy)}`}>
                      {initial(nameOf(entry.addedBy))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {sheet === "account" && (
        <AccountSheet engine={engine} state={state} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
