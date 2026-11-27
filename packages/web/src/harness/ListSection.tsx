import {
  findEntryForItem,
  groupEntries,
  searchItems,
  type CommandResult,
  type Engine,
  type EntryView,
  type ReadyState,
} from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { useCommandFeedback } from "../hooks.ts";

/** Planning mode: quick-add, the list grouped by category, notes, and starting a trip. */
export function ListSection({ engine, state }: { engine: Engine; state: ReadyState }) {
  const { data } = state;
  const [query, setQuery] = useState("");
  const feedback = useCommandFeedback();
  const matches = searchItems(data, query);
  const exact = matches.some((i) => i.name.toLowerCase() === query.trim().toLowerCase());
  const trip = data.shop.kind === "shopping" ? data.shop.trip : null;

  const createAndAdd = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim() === "" || exact) return;
    if (feedback.run(engine.addNewItemToList({ name: query, categoryIds: [] }))) setQuery("");
  };

  return (
    <section>
      <h3>List ({data.entries.length})</h3>
      <form onSubmit={createAndAdd}>
        <input
          placeholder="Add an item…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      {query.trim() !== "" && (
        <ul>
          {matches.map((item) => {
            const onList = findEntryForItem(data, item.id) !== undefined;
            return (
              <li key={item.id}>
                <button
                  disabled={onList}
                  onClick={() => {
                    if (feedback.run(engine.addToList(item.id))) setQuery("");
                  }}
                >
                  {item.name}
                </button>
                {onList && " (on list)"}
              </li>
            );
          })}
          {!exact && (
            <li>
              <button onClick={createAndAdd}>Create “{query.trim()}”</button>
            </li>
          )}
        </ul>
      )}
      {feedback.error !== null && <p role="alert">{feedback.error}</p>}

      {groupEntries(data).map((group) => (
        <div key={group.category?.id ?? "other"}>
          <h4>{group.category?.name ?? "Other"}</h4>
          <ul>
            {group.entries.map((view) => (
              <EntryRow
                key={view.entry.id}
                engine={engine}
                state={state}
                view={view}
                onResult={feedback.run}
              />
            ))}
          </ul>
        </div>
      ))}
      {data.entries.length === 0 && <p>Nothing on the list.</p>}

      {trip === null ? (
        <button
          disabled={data.entries.length === 0}
          onClick={() => feedback.run(engine.startTrip())}
        >
          Start shopping
        </button>
      ) : (
        <p>A trip is in progress.</p>
      )}
    </section>
  );
}

function EntryRow({
  engine,
  state,
  view,
  onResult,
}: {
  engine: Engine;
  state: ReadyState;
  view: EntryView;
  onResult: <T>(result: CommandResult<T>) => boolean;
}) {
  const { entry, item } = view;
  const [note, setNote] = useState<string | null>(null);
  const addedBy = state.members.find((m) => m.userId === entry.addedBy)?.displayName ?? "?";
  return (
    <li>
      {item.name}
      {entry.status === "in_cart" && " (in cart)"} · added by {addedBy} ·{" "}
      {note === null ? (
        <button onClick={() => setNote(entry.note ?? "")}>{entry.note ?? "add note"}</button>
      ) : (
        <form
          style={{ display: "inline" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (onResult(engine.setNote(entry.id, note))) setNote(null);
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}{" "}
      <button onClick={() => onResult(engine.removeFromList(entry.id))}>Remove</button>
    </li>
  );
}
