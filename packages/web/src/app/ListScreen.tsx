import {
  activeTrip,
  findEntry,
  findItem,
  groupEntries,
  type Engine,
  type EntryId,
  type ReadyState,
} from "@quickshop/core";
import { useState } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { AccountSheet } from "./AccountSheet.tsx";
import { initial, plural } from "./format.ts";
import { useFresh } from "./fresh.ts";
import { Icon } from "./icons.tsx";
import { ItemSheet, type NewItem } from "./ItemSheet.tsx";
import { NoteSheet } from "./NoteSheet.tsx";
import { QuickAdd } from "./QuickAdd.tsx";

type OpenSheet =
  | { readonly kind: "account" }
  | { readonly kind: "note"; readonly entryId: EntryId }
  | { readonly kind: "item"; readonly item: NewItem };

/** The shopping list: quick add, the list grouped by category, notes and removing. */
export function ListScreen({
  engine,
  state,
  onShop,
}: {
  engine: Engine;
  state: ReadyState;
  /** Opens the shopping screen. */
  onShop: () => void;
}) {
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const feedback = useCommandFeedback();
  const { data, members, household, user, online } = state;
  const groups = groupEntries(data);
  const fresh = useFresh(data.entries.map((e) => e.id));
  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? "?";
  const close = () => setSheet(null);

  return (
    <>
      <header className="top">
        <div>
          <p className="sub">
            {household.name} · {plural(data.entries.length, "item")}
          </p>
          <h1>Shopping list</h1>
        </div>
        <button className="av" aria-label="Account" onClick={() => setSheet({ kind: "account" })}>
          {initial(user.displayName)}
        </button>
      </header>
      <TripBanner state={state} nameOf={nameOf} onResume={onShop} />
      <QuickAdd
        engine={engine}
        state={state}
        onCreate={(name) =>
          setSheet({ kind: "item", item: { kind: "new", name, addToList: true } })
        }
      />
      {feedback.error !== null && (
        <p className="hint error inset" role="alert">
          {feedback.error}
        </p>
      )}
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
                  <li
                    key={entry.id}
                    className={[
                      "row",
                      entry.status === "in_cart" ? "done" : "",
                      fresh.has(entry.id) ? "fresh" : "",
                    ].join(" ")}
                  >
                    <div className="main">
                      <span className="nm">{item.name}</span>
                      <button
                        className="note"
                        disabled={!online}
                        aria-label={
                          entry.note === null
                            ? `Add a note for ${item.name}`
                            : `Edit the note for ${item.name}`
                        }
                        onClick={() => setSheet({ kind: "note", entryId: entry.id })}
                      >
                        {entry.note ?? "Add note"}
                      </button>
                    </div>
                    <span className="by" title={`Added by ${nameOf(entry.addedBy)}`}>
                      {initial(nameOf(entry.addedBy))}
                    </span>
                    <button
                      className="icon"
                      aria-label={`Remove ${item.name}`}
                      disabled={!online}
                      onClick={() => feedback.run(engine.removeFromList(entry.id))}
                    >
                      <Icon name="x" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {activeTrip(data.shop) === null && (
        <div className="dock">
          <button
            className="primary"
            disabled={data.entries.length === 0}
            onClick={() => {
              if (feedback.run(engine.startTrip())) onShop();
            }}
          >
            Start shopping
          </button>
        </div>
      )}
      {sheet?.kind === "account" && <AccountSheet engine={engine} state={state} onClose={close} />}
      {sheet?.kind === "item" && (
        <ItemSheet engine={engine} state={state} item={sheet.item} onClose={close} />
      )}
      {sheet?.kind === "note" && (
        <OpenNote engine={engine} state={state} entryId={sheet.entryId} onClose={close} />
      )}
    </>
  );
}

/** The note sheet, as long as the entry is still on the list. */
function OpenNote({
  engine,
  state,
  entryId,
  onClose,
}: {
  engine: Engine;
  state: ReadyState;
  entryId: EntryId;
  onClose: () => void;
}) {
  const entry = findEntry(state.data, entryId);
  const item = entry === undefined ? undefined : findItem(state.data, entry.itemId);
  if (entry === undefined || item === undefined) return null;
  return <NoteSheet engine={engine} entry={entry} item={item} onClose={onClose} />;
}

/** "Ashley is shopping · 3 of 9 in cart", while a trip is in progress. */
function TripBanner({
  state,
  nameOf,
  onResume,
}: {
  state: ReadyState;
  nameOf: (userId: string) => string;
  onResume: () => void;
}) {
  const trip = activeTrip(state.data.shop);
  if (trip === null) return null;
  const inCart = state.data.entries.filter((e) => e.status === "in_cart").length;
  const mine = trip.startedBy === state.user.id;
  const who = mine ? "You are" : `${nameOf(trip.startedBy)} is`;
  return (
    <div className="banner" role="status">
      <span>
        <b>{who} shopping</b> · {inCart} of {state.data.entries.length} in cart
      </span>
      <button onClick={onResume}>{mine ? "Resume" : "Follow"}</button>
    </div>
  );
}
