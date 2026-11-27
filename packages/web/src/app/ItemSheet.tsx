import { type CategoryId, type Engine, type ReadyState } from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { orderedCategories } from "./categories.ts";
import { Sheet } from "./Sheet.tsx";

/** Creating a catalog item, optionally putting it straight on the list. */
export type NewItem = { readonly kind: "new"; readonly name: string; readonly addToList: boolean };

export function ItemSheet({
  engine,
  state,
  item,
  onClose,
}: {
  engine: Engine;
  state: ReadyState;
  item: NewItem;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [categoryIds, setCategoryIds] = useState<readonly CategoryId[]>([]);
  const feedback = useCommandFeedback();

  const toggle = (id: CategoryId) =>
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id]));

  const save = (event: FormEvent) => {
    event.preventDefault();
    const saved = item.addToList
      ? feedback.run(engine.addNewItemToList({ name, categoryIds }))
      : feedback.run(engine.createItem({ name, categoryIds }));
    if (saved) onClose();
  };

  return (
    <Sheet label="New item" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <h2>New item</h2>
        <label htmlFor="item-name">Name</label>
        <input
          className="field"
          id="item-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            feedback.clear();
          }}
          autoComplete="off"
        />
        <p className="lab" id="item-categories">
          Categories
          <small>Pick one or more. The first one decides where it shows on the list.</small>
        </p>
        <div className="chips" role="group" aria-labelledby="item-categories">
          {orderedCategories(state.data).map((category) => {
            const order = categoryIds.indexOf(category.id);
            return (
              <button
                key={category.id}
                type="button"
                className="chip"
                aria-pressed={order >= 0}
                onClick={() => toggle(category.id)}
              >
                {order >= 0 && <i aria-hidden="true">{order + 1}</i>}
                {category.name}
              </button>
            );
          })}
        </div>
        {feedback.error !== null && (
          <p className="error" role="alert">
            {feedback.error}
          </p>
        )}
        <div className="acts">
          <button className="primary" type="submit" disabled={name.trim() === ""}>
            {item.addToList ? "Create and add to list" : "Create item"}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
