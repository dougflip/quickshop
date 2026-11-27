import type { Engine, Item, ListEntry } from "@quickshop/core";
import { useState, type FormEvent } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { Sheet } from "./Sheet.tsx";

export function NoteSheet({
  engine,
  entry,
  item,
  onClose,
}: {
  engine: Engine;
  entry: ListEntry;
  item: Item;
  onClose: () => void;
}) {
  const [text, setText] = useState(entry.note ?? "");
  const feedback = useCommandFeedback();
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (feedback.run(engine.setNote(entry.id, text))) onClose();
  };
  return (
    <Sheet label={`Note for ${item.name}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <h2>Note for {item.name}</h2>
        <p>Quantity, brand, anything the shopper should know.</p>
        <textarea
          className="field"
          aria-label="Note"
          placeholder="2 gallons, the good kind…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {feedback.error !== null && (
          <p className="error" role="alert">
            {feedback.error}
          </p>
        )}
        <div className="acts">
          <button className="primary" type="submit">
            Save note
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
