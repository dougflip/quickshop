import {
  findEntryForItem,
  findItemByName,
  nameKey,
  normalizeName,
  searchItems,
  type Engine,
  type ItemId,
  type ReadyState,
} from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { categoryNames } from "./categories.ts";

/**
 * The box at the top of the list: type, pick a match, or create something new.
 * Enter adds an exact match, or offers to create the item when there isn't one.
 */
export function QuickAdd({
  engine,
  state,
  onCreate,
}: {
  engine: Engine;
  state: ReadyState;
  /** Opens the new-item sheet with this name. */
  onCreate: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const feedback = useCommandFeedback();
  const { data, online } = state;
  const typed = nameKey(query) !== "";
  const matches = typed ? searchItems(data, query) : [];
  const exact = typed ? findItemByName(data, query) : undefined;

  const add = (itemId: ItemId) => {
    if (feedback.run(engine.addToList(itemId))) setQuery("");
  };
  const create = () => {
    onCreate(normalizeName(query));
    setQuery("");
    feedback.clear();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!typed) return;
    if (exact === undefined) create();
    else add(exact.id);
  };

  return (
    <form className="addbox" onSubmit={submit} role="search">
      <input
        className="field"
        aria-label="Add to the list"
        placeholder="Add milk, eggs, bread…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          feedback.clear();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
        }}
        autoComplete="off"
        enterKeyHint="done"
        disabled={!online}
      />
      {typed && (
        <ul className="sugg" aria-label="Matching items">
          {matches.map((item) => {
            const onList = findEntryForItem(data, item.id) !== undefined;
            return (
              <li key={item.id}>
                <button type="button" disabled={onList} onClick={() => add(item.id)}>
                  <span>{item.name}</span>
                  <small>{onList ? "On list" : categoryNames(data, item)}</small>
                </button>
              </li>
            );
          })}
          {exact === undefined && (
            <li>
              <button type="button" onClick={create}>
                <span>Create “{normalizeName(query)}”</span>
                <small>New item</small>
              </button>
            </li>
          )}
        </ul>
      )}
      {feedback.error !== null && (
        <p className="hint error" role="alert">
          {feedback.error}
        </p>
      )}
      {!online && <p className="hint">Adding and editing need a connection.</p>}
    </form>
  );
}
