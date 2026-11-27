import {
  findEntryForItem,
  type CategoryId,
  type CommandResult,
  type Engine,
  type Item,
  type ReadyState,
} from "@quickshop/core";
import { useState } from "react";
import { useCommandFeedback } from "../hooks.ts";

/** The catalog: add to or remove from the list, rename, set categories, delete. */
export function CatalogSection({ engine, state }: { engine: Engine; state: ReadyState }) {
  const feedback = useCommandFeedback();
  const items = state.data.items.toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <details>
      <summary>Catalog ({items.length} items)</summary>
      {feedback.error !== null && <p role="alert">{feedback.error}</p>}
      <ul>
        {items.map((item) => (
          <CatalogRow
            key={item.id}
            engine={engine}
            state={state}
            item={item}
            onResult={feedback.run}
          />
        ))}
      </ul>
    </details>
  );
}

function CatalogRow({
  engine,
  state,
  item,
  onResult,
}: {
  engine: Engine;
  state: ReadyState;
  item: Item;
  onResult: <T>(result: CommandResult<T>) => boolean;
}) {
  const [name, setName] = useState<string | null>(null);
  const entry = findEntryForItem(state.data, item.id);
  const toggleCategory = (id: CategoryId) =>
    onResult(
      engine.setItemCategories(
        item.id,
        item.categoryIds.includes(id)
          ? item.categoryIds.filter((c) => c !== id)
          : [...item.categoryIds, id],
      ),
    );
  return (
    <li>
      {name === null ? (
        <button onClick={() => setName(item.name)}>{item.name}</button>
      ) : (
        <form
          style={{ display: "inline" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (onResult(engine.renameItem(item.id, name))) setName(null);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}{" "}
      {entry === undefined ? (
        <button onClick={() => onResult(engine.addToList(item.id))}>Add to list</button>
      ) : (
        <button onClick={() => onResult(engine.removeFromList(entry.id))}>On list ✓</button>
      )}{" "}
      <button onClick={() => onResult(engine.deleteItem(item.id))}>Delete</button>
      <br />
      <small>
        {state.data.categories.map((category) => {
          const position = item.categoryIds.indexOf(category.id);
          return (
            <label key={category.id} style={{ marginRight: 8 }}>
              <input
                type="checkbox"
                checked={position >= 0}
                onChange={() => toggleCategory(category.id)}
              />
              {category.name}
              {position >= 0 && ` (${String(position + 1)})`}
            </label>
          );
        })}
      </small>
    </li>
  );
}
