import {
  compareNames,
  findEntryForItem,
  nameKey,
  primaryCategory,
  type Engine,
  type Item,
  type ReadyState,
} from "@quickshop/core";
import { useState } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { orderedCategories } from "./categories.ts";
import { plural } from "./format.ts";
import { ItemSheet, type EditItem, type NewItem } from "./ItemSheet.tsx";

type Section = { readonly key: string; readonly name: string; readonly items: readonly Item[] };

/**
 * Everything the household buys. An item shows under each of its categories, so it can be found
 * wherever someone looks for it. Tap one to edit it; the pill puts it on the list or takes it off.
 */
export function CatalogScreen({ engine, state }: { engine: Engine; state: ReadyState }) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<NewItem | EditItem | null>(null);
  const feedback = useCommandFeedback();
  const { data, online } = state;
  const categories = orderedCategories(data);
  const key = nameKey(query);
  const matches = data.items
    .filter((item) => nameKey(item.name).includes(key))
    .toSorted((a, b) => compareNames(a.name, b.name));

  const sections: Section[] = [
    ...categories.map((c) => ({
      key: c.id,
      name: c.name,
      items: matches.filter((item) => item.categoryIds.includes(c.id)),
    })),
    {
      key: "none",
      name: "No category",
      items: matches.filter((item) => primaryCategory(data, item) === null),
    },
  ].filter((section) => section.items.length > 0);

  const alsoIn = (item: Item, shownUnder: string) =>
    item.categoryIds
      .filter((id) => id !== shownUnder)
      .flatMap((id) => categories.find((c) => c.id === id)?.name ?? []);

  const toggleOnList = (item: Item) => {
    const entry = findEntryForItem(data, item.id);
    feedback.run(entry === undefined ? engine.addToList(item.id) : engine.removeFromList(entry.id));
  };

  return (
    <>
      <header className="top">
        <div>
          <p className="sub">
            {plural(data.items.length, "item")} ·{" "}
            {data.categories.length === 1
              ? "1 category"
              : `${String(data.categories.length)} categories`}
          </p>
          <h1>Catalog</h1>
        </div>
        <button
          className="ghost"
          disabled={!online}
          onClick={() => setSheet({ kind: "new", name: "", addToList: false })}
        >
          New item
        </button>
      </header>
      <div className="addbox">
        <input
          className="field"
          type="search"
          aria-label="Search items"
          placeholder="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {feedback.error !== null && (
          <p className="hint error" role="alert">
            {feedback.error}
          </p>
        )}
        {!online && <p className="hint">Adding and editing need a connection.</p>}
      </div>
      <div className="scroll">
        {sections.length === 0 ? (
          <div className="empty">
            <b>No matches</b>Try another name, or create a new item.
          </div>
        ) : (
          sections.map((section) => (
            <section className="grp" key={section.key} aria-label={section.name}>
              <h3>
                {section.name}
                <span>{section.items.length}</span>
              </h3>
              <ul>
                {section.items.map((item) => {
                  const others = alsoIn(item, section.key);
                  const onList = findEntryForItem(data, item.id) !== undefined;
                  return (
                    <li className="row" key={item.id}>
                      <button
                        className="main"
                        disabled={!online}
                        onClick={() => setSheet({ kind: "edit", itemId: item.id })}
                      >
                        <span className="nm">{item.name}</span>
                        {others.length > 0 && (
                          <span className="tags">Also in {others.join(", ")}</span>
                        )}
                      </button>
                      <button
                        className="pill"
                        aria-pressed={onList}
                        aria-label={onList ? `${item.name} is on the list` : `Add ${item.name}`}
                        disabled={!online}
                        onClick={() => toggleOnList(item)}
                      >
                        {onList ? "On list" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      {sheet !== null && (
        <ItemSheet engine={engine} state={state} item={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
