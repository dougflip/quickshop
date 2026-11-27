import {
  findEntryForItem,
  findItem,
  normalizeName,
  type CategoryId,
  type Engine,
  type Item,
  type ItemId,
  type ReadyState,
} from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { orderedCategories } from "./categories.ts";
import { Sheet } from "./Sheet.tsx";

/** Creating a catalog item, optionally putting it straight on the list. */
export type NewItem = { readonly kind: "new"; readonly name: string; readonly addToList: boolean };
/** Renaming, recategorizing or deleting an existing item. */
export type EditItem = { readonly kind: "edit"; readonly itemId: ItemId };

export function ItemSheet({
  engine,
  state,
  item,
  onClose,
}: {
  engine: Engine;
  state: ReadyState;
  item: NewItem | EditItem;
  onClose: () => void;
}) {
  switch (item.kind) {
    case "new":
      return (
        <ItemForm engine={engine} state={state} mode={item} existing={null} onClose={onClose} />
      );
    case "edit": {
      // Someone may delete it while the sheet is open; then there is nothing left to edit.
      const existing = findItem(state.data, item.itemId);
      if (existing === undefined) return null;
      return (
        <ItemForm engine={engine} state={state} mode={item} existing={existing} onClose={onClose} />
      );
    }
  }
}

function ItemForm({
  engine,
  state,
  mode,
  existing,
  onClose,
}: {
  engine: Engine;
  state: ReadyState;
  mode: NewItem | EditItem;
  existing: Item | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? (mode.kind === "new" ? mode.name : ""));
  const [categoryIds, setCategoryIds] = useState<readonly CategoryId[]>(
    existing?.categoryIds ?? [],
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const feedback = useCommandFeedback();
  const title = existing === null ? "New item" : "Edit item";

  const toggle = (id: CategoryId) => {
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id]));
    feedback.clear();
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (saveChanges()) onClose();
  };

  function saveChanges(): boolean {
    if (existing === null) {
      return mode.kind === "new" && mode.addToList
        ? feedback.run(engine.addNewItemToList({ name, categoryIds }))
        : feedback.run(engine.createItem({ name, categoryIds }));
    }
    if (
      normalizeName(name) !== existing.name &&
      !feedback.run(engine.renameItem(existing.id, name))
    ) {
      return false;
    }
    const recategorized =
      categoryIds.length !== existing.categoryIds.length ||
      categoryIds.some((id, i) => existing.categoryIds[i] !== id);
    return !recategorized || feedback.run(engine.setItemCategories(existing.id, categoryIds));
  }

  const remove = () => {
    if (existing === null) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    if (feedback.run(engine.deleteItem(existing.id))) onClose();
  };

  const onList = existing !== null && findEntryForItem(state.data, existing.id) !== undefined;

  return (
    <Sheet label={title} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <h2>{title}</h2>
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
            {existing !== null
              ? "Save"
              : mode.kind === "new" && mode.addToList
                ? "Create and add to list"
                : "Create item"}
          </button>
          {existing !== null && (
            <button className="ghost danger" type="button" onClick={remove}>
              {confirmingDelete
                ? `Tap again to delete ${existing.name}${onList ? " and take it off the list" : ""}`
                : "Delete item"}
            </button>
          )}
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
